import { randomUUID, createHash } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  AccessRequestError,
  AuditSink,
  BetaAccessRequestRecord,
  GetBetaAccessRequestQuery,
  GetBetaAccessRequestResult,
  ListBetaAccessRequestsQuery,
  ListBetaAccessRequestsResult,
  RequestBetaAccessCommand,
  RequestBetaAccessResult
} from './contracts.js';
import { BetaInvitationService } from './invitation.js';

interface RawAccessRequestRow {
  id: string;
  email: string;
  email_normalized: string;
  status: string;
  notes: string | null;
  ip_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface BetaAccessRequestServiceOptions {
  readonly auditSink?: AuditSink;
  readonly maxRequestsPerWindow?: number;
  readonly rateLimitWindowMs?: number;
}

export class BetaAccessRequestService {
  private readonly auditSink?: AuditSink;
  private readonly maxRequestsPerWindow: number;
  private readonly rateLimitWindowMs: number;
  private readonly requestCounts = new Map<string, { count: number; firstAttemptAt: number }>();

  constructor(
    private readonly transactions: TransactionRunner,
    options?: BetaAccessRequestServiceOptions
  ) {
    if (!transactions) {
      throw new AccessRequestError('INVALID_ARGUMENT', 'TransactionRunner is required');
    }
    this.auditSink = options?.auditSink;
    this.maxRequestsPerWindow = options?.maxRequestsPerWindow ?? 10;
    this.rateLimitWindowMs = options?.rateLimitWindowMs ?? 15 * 60 * 1000;
  }

  public resetRateLimitTracker(): void {
    this.requestCounts.clear();
  }

  private checkRateLimit(key: string): void {
    const entry = this.requestCounts.get(key);
    if (!entry) return;

    const now = Date.now();
    if (now - entry.firstAttemptAt > this.rateLimitWindowMs) {
      this.requestCounts.delete(key);
      return;
    }

    if (entry.count >= this.maxRequestsPerWindow) {
      throw new AccessRequestError(
        'RATE_LIMITED',
        'Too many access requests from this source. Please try again later.'
      );
    }
  }

  private recordAttempt(key: string): void {
    const now = Date.now();
    const entry = this.requestCounts.get(key);
    if (!entry || now - entry.firstAttemptAt > this.rateLimitWindowMs) {
      this.requestCounts.set(key, { count: 1, firstAttemptAt: now });
    } else {
      entry.count += 1;
    }
  }

  /**
   * Submits a public beta access request (EL-TK-008).
   *
   * Business rules:
   * - Public entry point: no prior account, session or invitation required.
   * - Strict RFC 5322 email format validation; invalid emails are rejected without creating records.
   * - Rate limiting enforced to prevent denial of service or flooding.
   * - Strict non-enumeration guarantee: does NOT reveal whether an account, invitation or previous request exists.
   * - If request already exists for the email, deduplicates idempotently.
   * - Does NOT issue invitations, activate accounts, or grant access.
   */
  async requestAccess(command: RequestBetaAccessCommand): Promise<RequestBetaAccessResult> {
    if (!command || !command.email || !BetaInvitationService.isValidEmail(command.email)) {
      throw new AccessRequestError('INVALID_EMAIL', 'Invalid email address format');
    }

    const normalizedEmail = BetaInvitationService.normalizeEmail(command.email);
    const rateLimitKey = command.clientIp ? `ip:${command.clientIp}` : `email:${normalizedEmail}`;

    this.checkRateLimit(rateLimitKey);
    this.recordAttempt(rateLimitKey);

    const now = new Date();
    const ipHash = command.clientIp
      ? createHash('sha256').update(`ip:${command.clientIp}`).digest('hex')
      : null;

    return this.transactions.run(async (tx) => {
      let requestId: string | null = null;
      const candidateId = randomUUID();

      for (let attempt = 0; attempt < 3; attempt++) {
        // Step 1: Attempt non-destructive insert; on duplicate email_normalized DO NOTHING preserving existing row completely
        const inserted = await tx.query<{ id: string }>(
          `INSERT INTO beta_access_request (id, email, email_normalized, status, notes, ip_hash, created_at, updated_at)
           VALUES ($1, $2, $3, 'PENDING_REVIEW', $4, $5, $6, $7)
           ON CONFLICT (email_normalized) DO NOTHING
           RETURNING id`,
          candidateId,
          command.email.trim(),
          normalizedEmail,
          command.notes?.trim() ?? null,
          ipHash,
          now,
          now
        );

        if (inserted.length > 0 && inserted[0].id) {
          requestId = inserted[0].id;
          break;
        }

        // Step 2: Conflict occurred; separate statement obtains fresh snapshot under READ COMMITTED
        const existing = await tx.query<{ id: string }>(
          `SELECT id FROM beta_access_request WHERE email_normalized = $1`,
          normalizedEmail
        );

        if (existing.length > 0 && existing[0].id) {
          requestId = existing[0].id;
          break;
        }
      }

      if (!requestId) {
        throw new Error('Failed to deterministically resolve beta access request identifier');
      }

      // Record audit without exposing secrets or email addresses (target_identifier is requestId UUID)
      await tx.execute(
        `INSERT INTO admin_audit_event (id, procedure, actor_id, target_identifier, target_principal_id, result, details, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        randomUUID(),
        'BETA_ACCESS_REQUEST_SUBMITTED',
        'PUBLIC_USER',
        requestId,
        null,
        'REQUEST_RECEIVED',
        'Beta access request received for administrative review',
        now
      );

      return {
        outcome: 'REQUEST_RECEIVED',
        message: 'Solicitud de acceso a la BETA recibida para revisión.',
        requestId
      };
    });
  }

  /**
   * Queries and lists beta access requests for administrative review (EL-TK-009).
   *
   * Business rules:
   * - Only authorized administrators (AdminActorContext ADMIN_HUMAN) may review requests.
   * - Read-only inspection: does NOT approve, reject, transition state, issue invitations, or activate accounts.
   * - If no requests exist: returns empty items list [] with total 0.
   */
  async listAccessRequests(query: ListBetaAccessRequestsQuery): Promise<ListBetaAccessRequestsResult> {
    if (!query.actorContext || query.actorContext.actorType !== 'ADMIN_HUMAN' || !query.actorContext.principalId) {
      throw new AccessRequestError('UNAUTHORIZED', 'Only authorized administrators may list beta access requests');
    }

    const limit = Math.max(1, Math.min(100, query.limit ?? 50));
    const offset = Math.max(0, query.offset ?? 0);

    return this.transactions.run(async (tx) => {
      const countResult = await tx.query<{ total: number }>(
        `SELECT COUNT(*)::int as total FROM beta_access_request`
      );
      const total = countResult.length ? Number(countResult[0].total) : 0;

      const rows = await tx.query<RawAccessRequestRow>(
        `SELECT id, email, email_normalized, status, notes, ip_hash, created_at, updated_at
         FROM beta_access_request
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        limit,
        offset
      );

      const items = rows.map((r) => this.toRecord(r));

      await tx.execute(
        `INSERT INTO admin_audit_event (id, procedure, actor_id, target_identifier, target_principal_id, result, details, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        randomUUID(),
        'BETA_ACCESS_REQUEST_LIST_VIEWED',
        query.actorContext.principalId,
        'BETA_ACCESS_REQUEST_LIST',
        null,
        'SUCCESS',
        `Admin reviewed ${items.length} access requests (total: ${total})`,
        new Date()
      );

      return {
        items,
        total,
        limit,
        offset
      };
    });
  }

  /**
   * Gets details for a specific beta access request (EL-TK-009).
   *
   * Business rules:
   * - Only authorized administrators (AdminActorContext ADMIN_HUMAN) may view details.
   * - Read-only inspection: does NOT approve, issue invitations, or activate accounts.
   * - If request does not exist: returns request: null without error or data leakage.
   */
  async getAccessRequest(query: GetBetaAccessRequestQuery): Promise<GetBetaAccessRequestResult> {
    if (!query.actorContext || query.actorContext.actorType !== 'ADMIN_HUMAN' || !query.actorContext.principalId) {
      throw new AccessRequestError('UNAUTHORIZED', 'Only authorized administrators may view access request details');
    }

    if (!query.requestId || typeof query.requestId !== 'string') {
      throw new AccessRequestError('INVALID_ARGUMENT', 'Request ID is required');
    }

    return this.transactions.run(async (tx) => {
      const rows = await tx.query<RawAccessRequestRow>(
        `SELECT id, email, email_normalized, status, notes, ip_hash, created_at, updated_at
         FROM beta_access_request
         WHERE id = $1`,
        query.requestId
      );

      if (!rows.length) {
        return { request: null };
      }

      const request = this.toRecord(rows[0]);

      await tx.execute(
        `INSERT INTO admin_audit_event (id, procedure, actor_id, target_identifier, target_principal_id, result, details, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        randomUUID(),
        'BETA_ACCESS_REQUEST_DETAIL_VIEWED',
        query.actorContext.principalId,
        request.id,
        null,
        'SUCCESS',
        `Admin inspected access request ${request.id}`,
        new Date()
      );

      return { request };
    });
  }

  private toRecord(row: RawAccessRequestRow): BetaAccessRequestRecord {
    return {
      id: row.id,
      email: row.email,
      emailNormalized: row.email_normalized,
      status: row.status as 'PENDING_REVIEW' | 'REVIEWED',
      notes: row.notes,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}
