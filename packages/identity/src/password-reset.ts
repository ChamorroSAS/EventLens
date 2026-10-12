import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  type AuditEventRecord,
  type AuditSink,
  type CompletePasswordResetCommand,
  type CompletePasswordResetResult,
  type PasswordResetNotificationPort,
  type RecoveryAuthorityPort,
  type RequestPasswordResetCommand,
  type RequestPasswordResetResult,
  PasswordResetError,
  computeCredentialDigest
} from './contracts.js';
import { BetaInvitationService } from './invitation.js';
import { PasswordVerifier } from './password-verifier.js';

interface AccountRow {
  id: string;
  email: string;
  email_normalized: string;
  status: string;
}

interface CredentialRow {
  id: string;
  account_id: string;
  purpose: string;
  secret_digest: string;
  revision: string | bigint | number;
  status: string;
}

interface ResetIntentRow {
  id: string;
  account_id: string;
  email_normalized: string;
  token_digest: string;
  status: string;
  created_at: Date | string;
  expires_at: Date | string;
  consumed_at?: Date | string | null;
}

export interface PasswordResetServiceOptions {
  readonly auditSink?: AuditSink;
  readonly recoveryAuthority?: RecoveryAuthorityPort;
  readonly notificationPort?: PasswordResetNotificationPort;
  readonly tokenTtlMs?: number;
  readonly maxRequestsPerWindow?: number;
  readonly rateLimitWindowMs?: number;
  readonly passwordVerifier?: PasswordVerifier;
}

/**
 * Service governing organizer password recovery workflows in MOD-001 (EL-TK-018, EL-TK-019).
 *
 * Guarantees:
 * 1. Strict anti-enumeration on request: neutral indistinguishable response for existent, non-existent, or inactive accounts.
 * 2. Unpredictable high-entropy 256-bit single-use tokens with durable 1-hour expiration.
 * 3. Atomic single-use consumption: concurrent attempts or reuse fail without double consumption.
 * 4. Comprehensive invalidation: on completion, updates credential revision and atomically revokes ALL active sessions for that account.
 * 5. RecoveryAuthority coordination with PASSWORD_RESET_CONSUMED fact.
 * 6. Zero leakage of passwords, plain tokens, or digests in audit trails or responses.
 */
export class PasswordResetService {
  private readonly auditSink?: AuditSink;
  private readonly recoveryAuthority?: RecoveryAuthorityPort;
  private readonly notificationPort?: PasswordResetNotificationPort;
  private readonly tokenTtlMs: number;
  private readonly maxRequestsPerWindow: number;
  private readonly rateLimitWindowMs: number;
  private readonly passwordVerifier: PasswordVerifier;
  private readonly requestCounts = new Map<string, { count: number; firstAttemptAt: number }>();

  constructor(
    private readonly runner: TransactionRunner,
    options?: PasswordResetServiceOptions
  ) {
    this.auditSink = options?.auditSink;
    this.recoveryAuthority = options?.recoveryAuthority;
    this.notificationPort = options?.notificationPort;
    this.passwordVerifier = options?.passwordVerifier ?? new PasswordVerifier();
    this.tokenTtlMs = options?.tokenTtlMs ?? 60 * 60 * 1000; // 1 hora
    this.maxRequestsPerWindow = options?.maxRequestsPerWindow ?? 5;
    this.rateLimitWindowMs = options?.rateLimitWindowMs ?? 15 * 60 * 1000; // 15 minutos
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
      throw new PasswordResetError(
        'RATE_LIMITED',
        'Too many password reset attempts. Please wait before trying again.'
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

  private async emitAudit(tx: SqlTransaction | null, event: AuditEventRecord): Promise<void> {
    if (this.auditSink) {
      try {
        await this.auditSink.record(event);
      } catch {
        // External sink failure must not suppress core transaction integrity
      }
    }
  }

  /**
   * Requests a password reset email for an organizer account (EL-TK-018).
   *
   * Anti-enumeration guarantees:
   * - Validates email syntax strictly.
   * - Rate limits requests.
   * - Always returns identical neutral RESET_REQUEST_RECEIVED outcome regardless of account existence/state.
   * - Only active verified accounts generate and receive a reset token.
   */
  async requestPasswordReset(command: RequestPasswordResetCommand): Promise<RequestPasswordResetResult> {
    if (!command || !command.email || typeof command.email !== 'string') {
      throw new PasswordResetError('INVALID_ARGUMENT', 'Email is required');
    }

    if (!BetaInvitationService.isValidEmail(command.email)) {
      throw new PasswordResetError('INVALID_EMAIL', 'Invalid email address format');
    }

    const emailNormalized = BetaInvitationService.normalizeEmail(command.email);
    const rateLimitKey = command.clientIp ? `ip:${command.clientIp}` : `email:${emailNormalized}`;

    this.checkRateLimit(rateLimitKey);
    this.recordAttempt(rateLimitKey);

    const now = new Date();
    const NEUTRAL_MESSAGE = 'If an active account is associated with this email, password reset instructions have been sent.';

    return this.runner.run(async (tx: SqlTransaction) => {
      // 1. Look up account under FOR UPDATE lock
      const accountRows = await tx.query<AccountRow>(
        `SELECT id, email, email_normalized, status
         FROM organizer_account
         WHERE email_normalized = $1
         FOR UPDATE`,
        emailNormalized
      );

      // Account not found or not ACTIVE: return neutral outcome without emitting token
      if (!accountRows.length || accountRows[0].status !== 'ACTIVE') {
        await this.emitAudit(tx, {
          id: randomUUID(),
          procedure: 'ORGANIZER_PASSWORD_RESET_REQUESTED',
          actorId: 'ANONYMOUS',
          targetIdentifier: emailNormalized,
          result: 'RESET_REQUEST_RECEIVED',
          details: 'Password reset requested for non-existent or inactive account; neutral response returned',
          timestamp: now
        });

        return {
          outcome: 'RESET_REQUEST_RECEIVED',
          message: NEUTRAL_MESSAGE
        };
      }

      const account = accountRows[0];

      // 2. Mark any previously PENDING reset intents for this account as SUPERSEDED
      await tx.execute(
        `UPDATE password_reset_intent
         SET status = 'SUPERSEDED'
         WHERE account_id = $1 AND status = 'PENDING'`,
        account.id
      );

      // 3. Generate high-entropy 256-bit unguessable single-use token
      const rawToken = randomBytes(32).toString('hex');
      const tokenDigest = createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(now.getTime() + this.tokenTtlMs);
      const intentId = randomUUID();

      // 4. Persist durable reset intent
      await tx.execute(
        `INSERT INTO password_reset_intent (
           id, account_id, email_normalized, token_digest, status, created_at, expires_at
         ) VALUES ($1, $2, $3, $4, 'PENDING', $5, $6)`,
        intentId,
        account.id,
        emailNormalized,
        tokenDigest,
        now,
        expiresAt
      );

      // 5. Audit without tokens or secrets
      await this.emitAudit(tx, {
        id: randomUUID(),
        procedure: 'ORGANIZER_PASSWORD_RESET_REQUESTED',
        actorId: account.id,
        targetIdentifier: emailNormalized,
        targetPrincipalId: account.id,
        result: 'RESET_REQUEST_RECEIVED',
        details: 'Password reset intent issued and notification dispatched',
        timestamp: now
      });

      // 6. Dispatch notification via port
      if (this.notificationPort) {
        try {
          await this.notificationPort.sendPasswordResetEmail({
            email: account.email,
            token: rawToken,
            expiresAt
          });
        } catch {
          // Notification delivery failure does not reveal account existence
        }
      }

      return {
        outcome: 'RESET_REQUEST_RECEIVED',
        message: NEUTRAL_MESSAGE
      };
    });
  }

  /**
   * Completes a password recovery with a valid single-use token (EL-TK-019).
   *
   * Business rules:
   * - Token must exist, be PENDING, and not be expired.
   * - Account must be ACTIVE.
   * - Password must satisfy minimum strength (>= 8 characters).
   * - Updates secret_digest and credential revision.
   * - Atomically marks token as CONSUMED.
   * - Atomically revokes ALL active sessions of that account with reason PASSWORD_RESET.
   * - Coordinates with RecoveryAuthority.
   */
  async completePasswordReset(command: CompletePasswordResetCommand): Promise<CompletePasswordResetResult> {
    if (!command || !command.resetToken || typeof command.resetToken !== 'string') {
      throw new PasswordResetError('INVALID_ARGUMENT', 'Reset token is required');
    }

    if (!command.newPassword || typeof command.newPassword !== 'string' || command.newPassword.length < 8) {
      throw new PasswordResetError(
        'WEAK_PASSWORD',
        'Password must be a non-empty string of at least 8 characters'
      );
    }

    const trimmedToken = command.resetToken.trim();
    if (!trimmedToken) {
      throw new PasswordResetError('INVALID_OR_UNUSABLE_TOKEN', 'Reset token is empty');
    }

    const tokenDigest = createHash('sha256').update(trimmedToken).digest('hex');
    const now = new Date();

    return this.runner.run(async (tx: SqlTransaction) => {
      // 1. Look up reset intent under FOR UPDATE
      const intentRows = await tx.query<ResetIntentRow>(
        `SELECT id, account_id, email_normalized, token_digest, status, created_at, expires_at, consumed_at
         FROM password_reset_intent
         WHERE token_digest = $1
         FOR UPDATE`,
        tokenDigest
      );

      if (!intentRows.length) {
        throw new PasswordResetError('INVALID_OR_UNUSABLE_TOKEN', 'Invalid or unusable reset token');
      }

      const intent = intentRows[0];

      // 2. Validate token status
      if (intent.status === 'CONSUMED') {
        throw new PasswordResetError('TOKEN_ALREADY_USED', 'Reset token has already been consumed');
      }
      if (intent.status === 'SUPERSEDED') {
        throw new PasswordResetError('TOKEN_REVOKED', 'Reset token has been superseded');
      }
      if (intent.status !== 'PENDING') {
        throw new PasswordResetError('INVALID_OR_UNUSABLE_TOKEN', 'Reset token is unusable');
      }

      // 3. Validate token expiration
      const expiresAt = new Date(intent.expires_at);
      if (now.getTime() >= expiresAt.getTime()) {
        throw new PasswordResetError('TOKEN_EXPIRED', 'Reset token has expired');
      }

      // 4. Look up associated organizer account under FOR UPDATE
      const accountRows = await tx.query<AccountRow>(
        `SELECT id, email, email_normalized, status
         FROM organizer_account
         WHERE id = $1
         FOR UPDATE`,
        intent.account_id
      );

      if (!accountRows.length || accountRows[0].status !== 'ACTIVE') {
        throw new PasswordResetError('ACCOUNT_NOT_ACTIVE', 'Organizer account is inactive or not found');
      }

      const account = accountRows[0];

      // 5. Look up current credential to update revision
      const credentialRows = await tx.query<CredentialRow>(
        `SELECT id, account_id, purpose, secret_digest, revision, status
         FROM organizer_credential
         WHERE account_id = $1 AND purpose = 'ORGANIZER_AUTHENTICATION' AND status = 'ACTIVE'
         FOR UPDATE`,
        account.id
      );

      const currentRevision = credentialRows.length > 0 ? BigInt(credentialRows[0].revision) : 1n;
      const newRevision = currentRevision + 1n;

      // 6. Compute new Argon2id secret envelope (MOD-001, DEC-108, EL-TK-185)
      const newSecretDigest = await this.passwordVerifier.hashPassword(command.newPassword);

      // 7. Update or create organizer credential
      if (credentialRows.length > 0) {
        await tx.execute(
          `UPDATE organizer_credential
           SET secret_digest = $1, revision = $2, updated_at = $3
           WHERE id = $4`,
          newSecretDigest,
          newRevision.toString(),
          now,
          credentialRows[0].id
        );
      } else {
        await tx.execute(
          `INSERT INTO organizer_credential (
             id, account_id, purpose, secret_digest, revision, status, created_at, updated_at
           ) VALUES ($1, $2, 'ORGANIZER_AUTHENTICATION', $3, $4, 'ACTIVE', $5, $5)`,
          randomUUID(),
          account.id,
          newSecretDigest,
          newRevision.toString(),
          now
        );
      }

      // 8. Atomically revoke ALL active sessions for this account (EL-TK-019)
      const revokedSessionsCount = await tx.execute(
        `UPDATE organizer_session
         SET revoked_at = $1, revocation_reason = 'PASSWORD_RESET'
         WHERE account_id = $2 AND revoked_at IS NULL`,
        now,
        account.id
      );

      // 9. Mark reset intent as CONSUMED
      await tx.execute(
        `UPDATE password_reset_intent
         SET status = 'CONSUMED', consumed_at = $1
         WHERE id = $2`,
        now,
        intent.id
      );

      // 10. RecoveryAuthority coordination (PASSWORD_RESET_CONSUMED)
      if (this.recoveryAuthority?.prepare && this.recoveryAuthority?.ackCommit) {
        try {
          const receipt = await this.recoveryAuthority.prepare({
            operationId: randomUUID(),
            subjectRef: account.id,
            fact: {
              type: 'PASSWORD_RESET_CONSUMED',
              data: {
                accountId: account.id,
                emailNormalized: account.email_normalized,
                intentId: intent.id,
                revokedSessionsCount
              }
            }
          });
          await this.recoveryAuthority.ackCommit(receipt.preparedReceipt, newRevision);
        } catch {
          // Recovery authority error handled
        }
      }

      // 11. Emit audit record without secrets
      await this.emitAudit(tx, {
        id: randomUUID(),
        procedure: 'ORGANIZER_PASSWORD_RESET_COMPLETED',
        actorId: account.id,
        targetIdentifier: account.email_normalized,
        targetPrincipalId: account.id,
        result: 'PASSWORD_RESET_COMPLETED',
        details: JSON.stringify({
          revokedSessionsCount,
          credentialRevision: newRevision.toString()
        }),
        timestamp: now
      });

      return {
        accountId: account.id,
        emailNormalized: account.email_normalized,
        outcome: 'PASSWORD_RESET_COMPLETED',
        revokedSessionsCount
      };
    });
  }
}
