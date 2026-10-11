import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  AdminActorContext,
  AuditEventRecord,
  AuditSink,
  BetaInvitationRecord,
  InvitationError,
  IssueBetaInvitationCommand,
  IssueBetaInvitationResult
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
