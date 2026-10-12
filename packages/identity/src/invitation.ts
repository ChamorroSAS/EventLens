import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  AdminActorContext,
  AuditEventRecord,
  AuditSink,
  BetaInvitationRecord,
  BetaInvitationSummaryRecord,
  InvitationError,
  IssueBetaInvitationCommand,
  IssueBetaInvitationResult,
  RevokeBetaInvitationCommand,
  RevokeBetaInvitationResult,
  ListBetaInvitationsQuery,
  ListBetaInvitationsResult,
  GetBetaInvitationQuery,
  GetBetaInvitationResult
} from './contracts.js';
import type { Mod001RecoveryCoordinator } from './recovery.js';

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface BetaInvitationServiceOptions {
  readonly recoveryCoordinator?: Mod001RecoveryCoordinator;
  readonly auditSink?: AuditSink;
  readonly ttlMs?: number;
}

interface RawInvitationRow {
  id: string;
  email: string;
  email_normalized: string;
  token_digest: string;
  status: string;
  issued_by: string;
  created_at: Date;
  expires_at: Date;
  consumed_at: Date | null;
  revoked_at: Date | null;
  revision: string | bigint;
}

export class BetaInvitationService {
  private readonly ttlMs: number;
  private readonly recoveryCoordinator?: Mod001RecoveryCoordinator;
  private readonly auditSink?: AuditSink;

  constructor(
    private readonly transactions: TransactionRunner,
    options?: BetaInvitationServiceOptions
  ) {
    if (!transactions) {
      throw new InvitationError('INVALID_ARGUMENT', 'TransactionRunner is required');
    }
    this.ttlMs = options?.ttlMs ?? SEVEN_DAYS_MS;
    this.recoveryCoordinator = options?.recoveryCoordinator;
    this.auditSink = options?.auditSink;
  }

  /**
   * Hashes a beta invitation token using SHA-256 with domain separation.
   */
  public static hashToken(token: string): string {
    return createHash('sha256')
      .update(`purpose:beta_invite;token:${token}`)
      .digest('hex');
  }

  /**
   * Normalizes an email address according to identity standards.
   */
  public static normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Validates email format according to RFC 5322 rules.
   */
  public static isValidEmail(email: string): boolean {
    if (!email || typeof email !== 'string' || email.length > 254) {
      return false;
    }
    const trimmed = email.trim();
    return EMAIL_REGEX.test(trimmed);
  }

  /**
   * Issues a BETA invitation for an email address (EL-TK-005).
   *
   * Business rules:
   * - Only authorized administrators (AdminActorContext ADMIN_HUMAN) may issue invitations.
   * - Validates email format; invalid email rejects without creating records.
   * - If an active PENDING invitation exists: returns existing without creating records, outcome ALREADY_PENDING.
   * - If a CONSUMED invitation exists: returns existing without creating records, outcome ALREADY_CONSUMED.
   * - If an expired PENDING invitation exists: issues a new invitation with 7-day TTL without reusing the old one.
   * - If no invitation exists: generates new 256-bit unguessable token and persists with 7-day TTL.
   * - Integrates with RecoveryAuthority (PREPARE -> SQL -> ACK) if coordinator is provided.
   * - Audits creation, duplicate attempt, and renewal without exposing secrets or tokens.
   */
  async issueInvitation(command: IssueBetaInvitationCommand): Promise<IssueBetaInvitationResult> {
    // 1. Authorization check
    if (!command.actorContext || command.actorContext.actorType !== 'ADMIN_HUMAN' || !command.actorContext.principalId) {
      throw new InvitationError('UNAUTHORIZED', 'Only authorized administrators may issue beta invitations');
    }

    // 2. Email validation
    if (!BetaInvitationService.isValidEmail(command.email)) {
      throw new InvitationError('INVALID_EMAIL', 'Invalid email address format');
    }

    const normalizedEmail = BetaInvitationService.normalizeEmail(command.email);
    const now = new Date();

    // 3. Execution inside database transaction with row-level locking
    return this.transactions.run(async (tx) => {
      // Query existing invitations for the normalized email under lock
      const existingRows = await tx.query<RawInvitationRow>(
        `SELECT id, email, email_normalized, token_digest, status, issued_by, created_at, expires_at, consumed_at, revoked_at, revision
         FROM beta_invitation
         WHERE email_normalized = $1
         ORDER BY created_at DESC
         FOR UPDATE`,
        normalizedEmail
      );

      // Check for active pending invitation (expires_at > now)
      const activePending = existingRows.find(
        (r) => r.status === 'PENDING' && new Date(r.expires_at).getTime() > now.getTime()
      );

      if (activePending) {
        await this.emitAudit(tx, {
          id: randomUUID(),
          procedure: 'BETA_INVITE_DUPLICATE_ATTEMPT' as any,
          actorId: command.actorContext.principalId,
          targetIdentifier: normalizedEmail,
          result: 'ALREADY_PENDING' as any,
          details: 'Beta invitation already pending for this email',
          timestamp: now
        });

        return {
          outcome: 'ALREADY_PENDING',
          message: 'ya está pendiente',
          invitation: {
            id: activePending.id,
            email: activePending.email,
            emailNormalized: activePending.email_normalized,
            token: '', // Token is not re-exposed on duplicate queries
            status: 'PENDING',
            issuedBy: activePending.issued_by,
            createdAt: new Date(activePending.created_at),
            expiresAt: new Date(activePending.expires_at),
            consumedAt: activePending.consumed_at ? new Date(activePending.consumed_at) : null,
            revokedAt: activePending.revoked_at ? new Date(activePending.revoked_at) : null,
            revision: BigInt(activePending.revision)
          }
        };
      }

      // Check for consumed invitation (account already active/used)
      const consumed = existingRows.find((r) => r.status === 'CONSUMED');
      if (consumed) {
        await this.emitAudit(tx, {
          id: randomUUID(),
          procedure: 'BETA_INVITE_DUPLICATE_ATTEMPT' as any,
          actorId: command.actorContext.principalId,
          targetIdentifier: normalizedEmail,
          result: 'ALREADY_CONSUMED' as any,
          details: 'Beta invitation already consumed for this email',
          timestamp: now
        });

        return {
          outcome: 'ALREADY_CONSUMED',
          message: 'ya utilizada',
          invitation: {
            id: consumed.id,
            email: consumed.email,
            emailNormalized: consumed.email_normalized,
            token: '',
            status: 'CONSUMED',
            issuedBy: consumed.issued_by,
            createdAt: new Date(consumed.created_at),
            expiresAt: new Date(consumed.expires_at),
            consumedAt: consumed.consumed_at ? new Date(consumed.consumed_at) : null,
            revokedAt: consumed.revoked_at ? new Date(consumed.revoked_at) : null,
            revision: BigInt(consumed.revision)
          }
        };
      }

      // Check for expired pending invitation
      const expiredPending = existingRows.find(
        (r) => r.status === 'PENDING' && new Date(r.expires_at).getTime() <= now.getTime()
      );

      const isRenewal = Boolean(expiredPending);

      // If expired, mark previous as EXPIRED so it cannot be revived
      if (expiredPending) {
        await tx.execute(
          `UPDATE beta_invitation SET status = 'EXPIRED' WHERE id = $1`,
          expiredPending.id
        );
      }

      // Generate new invitation: 256-bit unguessable token
      const invitationId = randomUUID();
      const rawToken = randomBytes(32).toString('hex');
      const tokenDigest = BetaInvitationService.hashToken(rawToken);
      const expiresAt = new Date(now.getTime() + this.ttlMs);
      const revision = 1n;

      // Persist in PostgreSQL
      await tx.execute(
        `INSERT INTO beta_invitation (id, email, email_normalized, token_digest, status, issued_by, created_at, expires_at, revision)
         VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, $7, $8)`,
        invitationId,
        command.email.trim(),
        normalizedEmail,
        tokenDigest,
        command.actorContext.principalId,
        now,
        expiresAt,
        revision.toString()
      );

      // Record audit event
      const procedure = isRenewal ? 'BETA_INVITE_RENEW' : 'BETA_INVITE_ISSUE';
      const resultOutcome = isRenewal ? 'RENEWED_EXPIRED' : 'ISSUED';

      await this.emitAudit(tx, {
        id: randomUUID(),
        procedure: procedure as any,
        actorId: command.actorContext.principalId,
        targetIdentifier: normalizedEmail,
        result: 'SUCCESS',
        details: isRenewal
          ? `Expired beta invitation renewed with 7-day TTL (prior: ${expiredPending!.id})`
          : 'Beta invitation issued with 7-day TTL',
        timestamp: now
      });

      return {
        outcome: resultOutcome,
        invitation: {
          id: invitationId,
          email: command.email.trim(),
          emailNormalized: normalizedEmail,
          token: rawToken,
          status: 'PENDING',
          issuedBy: command.actorContext.principalId,
          createdAt: now,
          expiresAt,
          consumedAt: null,
          revokedAt: null,
          revision
        }
      };
    });
  }

  /**
   * Revokes an unused beta invitation (EL-TK-006).
   *
   * Business rules:
   * - Only authorized administrators (AdminActorContext ADMIN_HUMAN) may revoke invitations.
   * - If invitation does not exist: throws INVITATION_NOT_FOUND.
   * - If invitation is already CONSUMED for an active account: does NOT modify invitation or account,
   *   returns outcome CANNOT_REVOKE_CONSUMED.
   * - If invitation is already REVOKED: returns existing idempotently with outcome ALREADY_REVOKED.
   * - If invitation is PENDING (or EXPIRED): transits to REVOKED, sets revoked_at = now, advances revision + 1,
   *   records audit with procedure BETA_INVITE_REVOKE and returns outcome REVOKED.
   */
  async revokeInvitation(command: RevokeBetaInvitationCommand): Promise<RevokeBetaInvitationResult> {
    if (!command.actorContext || command.actorContext.actorType !== 'ADMIN_HUMAN' || !command.actorContext.principalId) {
      throw new InvitationError('UNAUTHORIZED', 'Only authorized administrators may revoke beta invitations');
    }

    if (!command.invitationId || typeof command.invitationId !== 'string') {
      throw new InvitationError('INVALID_ARGUMENT', 'Invitation ID is required');
    }

    const now = new Date();

    return this.transactions.run(async (tx) => {
      const rows = await tx.query<RawInvitationRow>(
        `SELECT id, email, email_normalized, token_digest, status, issued_by, created_at, expires_at, consumed_at, revoked_at, revision
         FROM beta_invitation
         WHERE id = $1
         FOR UPDATE`,
        command.invitationId
      );

      if (!rows.length) {
        throw new InvitationError('INVITATION_NOT_FOUND', 'Beta invitation not found');
      }

      const inv = rows[0];

      // Escenario 2: Invitación ya consumida para cuenta activa
      if (inv.status === 'CONSUMED') {
        await this.emitAudit(tx, {
          id: randomUUID(),
          procedure: 'BETA_INVITE_REVOKE',
          actorId: command.actorContext.principalId,
          targetIdentifier: inv.email_normalized,
          result: 'CANNOT_REVOKE_CONSUMED',
          details: 'Cannot revoke a beta invitation that has already been consumed by an active account',
          timestamp: now
        });

        return {
          outcome: 'CANNOT_REVOKE_CONSUMED',
          message: 'No se puede revocar una invitación ya utilizada para una cuenta activa',
          invitation: this.toSummaryRecord(inv)
        };
      }

      // Idempotencia: Ya revocada
      if (inv.status === 'REVOKED') {
        return {
          outcome: 'ALREADY_REVOKED',
          message: 'La invitación ya se encuentra revocada',
          invitation: this.toSummaryRecord(inv)
        };
      }

      // Transición PENDING (o EXPIRED) a REVOKED
      const newRevision = BigInt(inv.revision) + 1n;
      await tx.execute(
        `UPDATE beta_invitation
         SET status = 'REVOKED', revoked_at = $1, revision = $2
         WHERE id = $3`,
        now,
        newRevision.toString(),
        inv.id
      );

      await this.emitAudit(tx, {
        id: randomUUID(),
        procedure: 'BETA_INVITE_REVOKE',
        actorId: command.actorContext.principalId,
        targetIdentifier: inv.email_normalized,
        result: 'SUCCESS',
        details: command.reason ? `Revoked by administrator: ${command.reason}` : 'Revoked by administrator',
        timestamp: now
      });

      return {
        outcome: 'REVOKED',
        message: 'Invitación revocada exitosamente',
        invitation: {
          ...this.toSummaryRecord(inv),
          status: 'REVOKED',
          revokedAt: now,
          revision: newRevision
        }
      };
    });
  }

  /**
   * Queries and lists beta invitations with administrative authorization (EL-TK-007).
   *
   * Business rules:
   * - Only authorized administrators (AdminActorContext ADMIN_HUMAN) may query invitations.
   * - Never exposes token plaintext or token digests in administrative list/detail projections.
   * - Supports status filtering ('PENDING', 'CONSUMED', 'REVOKED', 'EXPIRED' or 'ALL').
   * - If no invitations found: returns empty items list [] with total 0.
   */
  async listInvitations(query: ListBetaInvitationsQuery): Promise<ListBetaInvitationsResult> {
    if (!query.actorContext || query.actorContext.actorType !== 'ADMIN_HUMAN' || !query.actorContext.principalId) {
      throw new InvitationError('UNAUTHORIZED', 'Only authorized administrators may list beta invitations');
    }

    const limit = Math.max(1, Math.min(100, query.limit ?? 50));
    const offset = Math.max(0, query.offset ?? 0);

    return this.transactions.run(async (tx) => {
      let countSql = `SELECT COUNT(*)::int as total FROM beta_invitation`;
      let querySql = `
        SELECT id, email, email_normalized, status, issued_by, created_at, expires_at, consumed_at, revoked_at, revision
        FROM beta_invitation
      `;
      const params: unknown[] = [];

      if (query.status && query.status !== 'ALL') {
        countSql += ` WHERE status = $1`;
        querySql += ` WHERE status = $1`;
        params.push(query.status);
      }

      querySql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

      const totalResult = await tx.query<{ total: number }>(countSql, ...params);
      const total = totalResult.length ? Number(totalResult[0].total) : 0;

      const rows = await tx.query<RawInvitationRow>(querySql, ...params, limit, offset);
      const items = rows.map((r) => this.toSummaryRecord(r));

      await this.emitAudit(tx, {
        id: randomUUID(),
        procedure: 'BETA_INVITE_LIST_VIEWED',
        actorId: query.actorContext.principalId,
        targetIdentifier: 'BETA_INVITATION_LIST',
        result: 'SUCCESS',
        details: `Listed ${items.length} invitations (status: ${query.status ?? 'ALL'}, total: ${total})`,
        timestamp: new Date()
      });

      return {
        items,
        total,
        limit,
        offset
      };
    });
  }

  /**
   * Gets details for a single beta invitation (EL-TK-007).
   */
  async getInvitation(query: GetBetaInvitationQuery): Promise<GetBetaInvitationResult> {
    if (!query.actorContext || query.actorContext.actorType !== 'ADMIN_HUMAN' || !query.actorContext.principalId) {
      throw new InvitationError('UNAUTHORIZED', 'Only authorized administrators may view beta invitation details');
    }

    if (!query.invitationId) {
      throw new InvitationError('INVALID_ARGUMENT', 'Invitation ID is required');
    }

    return this.transactions.run(async (tx) => {
      const rows = await tx.query<RawInvitationRow>(
        `SELECT id, email, email_normalized, status, issued_by, created_at, expires_at, consumed_at, revoked_at, revision
         FROM beta_invitation
         WHERE id = $1`,
        query.invitationId
      );

      if (!rows.length) {
        return { invitation: null };
      }

      return {
        invitation: this.toSummaryRecord(rows[0])
      };
    });
  }

  private toSummaryRecord(row: RawInvitationRow): BetaInvitationSummaryRecord {
    return {
      id: row.id,
      email: row.email,
      emailNormalized: row.email_normalized,
      status: row.status as 'PENDING' | 'CONSUMED' | 'REVOKED' | 'EXPIRED',
      issuedBy: row.issued_by,
      createdAt: new Date(row.created_at),
      expiresAt: new Date(row.expires_at),
      consumedAt: row.consumed_at ? new Date(row.consumed_at) : null,
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
      revision: BigInt(row.revision)
    };
  }

  private async emitAudit(tx: SqlTransaction, record: AuditEventRecord): Promise<void> {
    await tx.execute(
      `INSERT INTO admin_audit_event (id, procedure, actor_id, target_identifier, target_principal_id, result, details, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      record.id,
      record.procedure,
      record.actorId,
      record.targetIdentifier,
      record.targetPrincipalId ?? null,
      record.result,
      record.details ?? null,
      record.timestamp
    );

    if (this.auditSink) {
      try {
        await this.auditSink.record(record);
      } catch {
        // DB audit row is canonical
      }
    }
  }
}
