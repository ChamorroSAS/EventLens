import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  AuthenticationError,
  computeCredentialDigest,
  computeDummyCredentialDigest,
  type AuditSink,
  type AuditEventRecord,
  type RecoveryAuthorityPort,
  type RecoveryPreparedReceipt,
  type OrganizerAccountRecord,
  type OrganizerActorContext,
  type OrganizerSessionCookieSpec,
  type OrganizerLoginCommand,
  type OrganizerLoginResult,
  type ValidateOrganizerSessionCommand,
  type ValidateOrganizerSessionResult,
  type OrganizerSessionSummaryRecord,
  type ListOrganizerSessionsCommand,
  type ListOrganizerSessionsResult,
  type LogoutOrganizerCommand,
  type LogoutOrganizerResult,
  type RevokeSpecificSessionCommand,
  type RevokeSpecificSessionResult,
  type RevokeOtherSessionsCommand,
  type RevokeOtherSessionsResult
} from './contracts.js';
import { PasswordVerifier } from './password-verifier.js';

interface OrganizerAccountRow {
  id: string;
  email: string;
  email_normalized: string;
  status: string;
  declared_adult: boolean;
  declared_adult_at?: Date | string | null;
  invitation_id: string;
  verified_at?: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface OrganizerCredentialRow {
  id: string;
  account_id: string;
  purpose: string;
  secret_digest: string;
  revision: bigint | number | string;
  status: string;
}

interface OrganizerSessionRow {
  id: string;
  account_id: string;
  token_digest: string;
  csrf_token_digest: string;
  auth_time: Date | string;
  created_at: Date | string;
  expires_at: Date | string;
  last_active_at: Date | string;
  idle_expires_at: Date | string;
  revoked_at?: Date | string | null;
  revocation_reason?: string | null;
  session_watermark: bigint | number | string;
  email: string;
  email_normalized: string;
  account_status: string;
}

export interface OrganizerAuthOptions {
  maxFailedAttempts?: number;
  rateLimitWindowMs?: number;
  passwordVerifier?: PasswordVerifier;
}

/**
 * Implements organizer authentication and session emission for EL-TK-013 and EL-TK-185.
 * Guarantees Argon2id verification with transitional legacy migration, neutral unauthenticated errors,
 * strict rejection of pending/unverified accounts, recovery authority validation, and rate limiting.
 */
export class OrganizerAuthenticationService {
  private readonly maxFailedAttempts: number;
  private readonly rateLimitWindowMs: number;
  private readonly passwordVerifier: PasswordVerifier;
  private readonly failedAttempts = new Map<string, { count: number; firstAttemptAt: number }>();

  constructor(
    private readonly runner: TransactionRunner,
    private readonly auditSink: AuditSink,
    private readonly recoveryAuthority: RecoveryAuthorityPort,
    options?: OrganizerAuthOptions
  ) {
    this.maxFailedAttempts = options?.maxFailedAttempts ?? 5;
    this.rateLimitWindowMs = options?.rateLimitWindowMs ?? 15 * 60 * 1000; // 15 minutos
    this.passwordVerifier = options?.passwordVerifier ?? new PasswordVerifier();
  }

  /**
   * Resets the rate limiting tracker (useful for testing).
   */
  public resetRateLimitTracker(): void {
    this.failedAttempts.clear();
  }

  private checkRateLimit(key: string): void {
    const entry = this.failedAttempts.get(key);
    if (!entry) return;

    const now = Date.now();
    if (now - entry.firstAttemptAt > this.rateLimitWindowMs) {
      this.failedAttempts.delete(key);
      return;
    }

    if (entry.count >= this.maxFailedAttempts) {
      throw new AuthenticationError(
        'RATE_LIMITED',
        'Too many failed authentication attempts. Please try again later.'
      );
    }
  }

  private recordFailedAttempt(key: string): void {
    const now = Date.now();
    const entry = this.failedAttempts.get(key);
    if (!entry || now - entry.firstAttemptAt > this.rateLimitWindowMs) {
      this.failedAttempts.set(key, { count: 1, firstAttemptAt: now });
    } else {
      entry.count += 1;
    }
  }

  private clearFailedAttempts(key: string): void {
    this.failedAttempts.delete(key);
  }

  /**
   * Logs in a verified organizer and emits a secure session (EL-TK-013).
   */
  public async login(command: OrganizerLoginCommand): Promise<OrganizerLoginResult> {
    if (!command || typeof command !== 'object') {
      throw new AuthenticationError('INVALID_ARGUMENT', 'Login command is required');
    }

    const { email, password } = command;
    if (!email || typeof email !== 'string' || !email.trim()) {
      throw new AuthenticationError('INVALID_ARGUMENT', 'Email is required');
    }
    if (!password || typeof password !== 'string') {
      throw new AuthenticationError('INVALID_ARGUMENT', 'Password is required');
    }

    const emailNormalized = email.trim().toLowerCase();

    // Verificación de rate limit neutro previo a consulta
    this.checkRateLimit(emailNormalized);

    return this.runner.run(async (tx: SqlTransaction) => {
      const now = new Date();

      // 1. Consultar cuenta del organizador bajo SELECT FOR UPDATE
      const accountRows = await tx.query<OrganizerAccountRow>(
        `SELECT id, email, email_normalized, status, declared_adult, declared_adult_at,
                invitation_id, verified_at, created_at, updated_at
         FROM organizer_account
         WHERE email_normalized = $1
         FOR UPDATE`,
        emailNormalized
      );

      // Si la cuenta no existe -> tiempo constante con dummy digest y error uniforme
      if (!accountRows.length) {
        await this.passwordVerifier.verifyDummy(password);
        this.recordFailedAttempt(emailNormalized);

        await this.auditSink.record({
          id: randomUUID(),
          procedure: 'ORGANIZER_LOGIN',
          actorId: 'ANONYMOUS',
          targetIdentifier: emailNormalized,
          result: 'REJECTED_UNAUTHENTICATED',
          details: 'Authentication rejected: uniform neutral failure',
          timestamp: now
        });

        throw new AuthenticationError('UNAUTHENTICATED', 'Invalid credentials');
      }

      const account = accountRows[0];

      // 2. Si la cuenta no está activa ni en pending_deletion -> rechazo neutro uniforme sin enumerar
      if (account.status !== 'ACTIVE' && account.status !== 'PENDING_DELETION') {
        await this.passwordVerifier.verifyDummy(password);
        this.recordFailedAttempt(emailNormalized);

        await this.auditSink.record({
          id: randomUUID(),
          procedure: 'ORGANIZER_LOGIN',
          actorId: account.id,
          targetIdentifier: account.email_normalized,
          targetPrincipalId: account.id,
          result: 'REJECTED_UNAUTHENTICATED',
          details: 'Authentication rejected: account not active',
          timestamp: now
        });

        throw new AuthenticationError('UNAUTHENTICATED', 'Invalid credentials');
      }

      // 3. Consultar credencial activa
      const credRows = await tx.query<OrganizerCredentialRow>(
        `SELECT id, account_id, purpose, secret_digest, revision, status
         FROM organizer_credential
         WHERE account_id = $1 AND purpose = 'ORGANIZER_AUTHENTICATION' AND status = 'ACTIVE'
         ORDER BY revision DESC
         LIMIT 1
         FOR UPDATE`,
        account.id
      );

      if (!credRows.length) {
        await this.passwordVerifier.verifyDummy(password);
        this.recordFailedAttempt(emailNormalized);

        await this.auditSink.record({
          id: randomUUID(),
          procedure: 'ORGANIZER_LOGIN',
          actorId: account.id,
          targetIdentifier: account.email_normalized,
          targetPrincipalId: account.id,
          result: 'REJECTED_UNAUTHENTICATED',
          details: 'Authentication rejected: no active credential found',
          timestamp: now
        });

        throw new AuthenticationError('UNAUTHENTICATED', 'Invalid credentials');
      }

      const credential = credRows[0];
      const isLegacy = this.passwordVerifier.isLegacyShaDigest(credential.secret_digest);

      // 4. Verificar credencial (Argon2id o legacy SHA con separación de propósito y subject)
      let isPasswordValid = false;
      if (isLegacy) {
        isPasswordValid = this.passwordVerifier.verifyLegacyDigest(credential.secret_digest, account.id, password);
      } else {
        isPasswordValid = await this.passwordVerifier.verifyPassword(credential.secret_digest, password);
      }

      if (!isPasswordValid) {
        this.recordFailedAttempt(emailNormalized);

        await this.auditSink.record({
          id: randomUUID(),
          procedure: 'ORGANIZER_LOGIN',
          actorId: account.id,
          targetIdentifier: account.email_normalized,
          targetPrincipalId: account.id,
          result: 'REJECTED_UNAUTHENTICATED',
          details: 'Authentication rejected: invalid secret',
          timestamp: now
        });

        throw new AuthenticationError('UNAUTHENTICATED', 'Invalid credentials');
      }

      // 5. Validar con RecoveryAuthorityPort (AQR-001, EL-TK-046, DEC-108)
      // Exige concordancia exacta con la autoridad y falla cerrado si es null o no coincide.
      const epoch = await this.recoveryAuthority.getRecoveryEpoch();
      const currentRevision = await this.recoveryAuthority.getCredentialRevision(account.id);
      let credRevBigInt = BigInt(credential.revision);

      if (currentRevision === null || currentRevision !== credRevBigInt) {
        this.recordFailedAttempt(emailNormalized);

        await this.auditSink.record({
          id: randomUUID(),
          procedure: 'ORGANIZER_LOGIN',
          actorId: account.id,
          targetIdentifier: account.email_normalized,
          targetPrincipalId: account.id,
          result: 'REJECTED_UNAUTHENTICATED',
          details: 'Authentication rejected: credential revision mismatch with recovery authority',
          timestamp: now
        });

        throw new AuthenticationError('UNAUTHENTICATED', 'Invalid credentials');
      }

      // 6. Migración inline transicional con CAS y PREPARE-SQL-ACK si es legacy digest
      let watermark: bigint;
      if (isLegacy) {
        const nextRevision = credRevBigInt + 1n;
        const newSecretDigest = await this.passwordVerifier.hashPassword(password);

        let preparedReceipt: RecoveryPreparedReceipt | undefined;
        if (this.recoveryAuthority.prepare) {
          try {
            preparedReceipt = await this.recoveryAuthority.prepare({
              operationId: randomUUID(),
              subjectRef: account.id,
              fact: {
                type: 'CREDENTIAL_ROTATED',
                data: {
                  subjectKind: 'ORGANIZER',
                  accountId: account.id,
                  cause: 'PASSWORD_VERIFIER_UPGRADE',
                  credentialId: credential.id,
                  previousRevision: credRevBigInt,
                  newRevision: nextRevision
                }
              }
            });
          } catch (prepErr) {
            this.recordFailedAttempt(emailNormalized);
            throw new AuthenticationError('UNAUTHENTICATED', `Recovery authority prepare failed: ${(prepErr as Error).message}`);
          }
        }

        const updatedRows = await tx.execute(
          `UPDATE organizer_credential
           SET secret_digest = $1, revision = $2, updated_at = $3
           WHERE id = $4 AND secret_digest = $5 AND revision = $6 AND status = 'ACTIVE'`,
          newSecretDigest,
          nextRevision,
          now,
          credential.id,
          credential.secret_digest,
          credRevBigInt
        );

        if (updatedRows === 0) {
          if (preparedReceipt && this.recoveryAuthority.resolveAbort) {
            try {
              await this.recoveryAuthority.resolveAbort(preparedReceipt.preparedReceipt, 'CAS conflict during transitional upgrade');
            } catch {
              // Ignore secondary abort error
            }
          }
          this.recordFailedAttempt(emailNormalized);
          throw new AuthenticationError('UNAUTHENTICATED', 'Concurrent credential modification detected');
        }

        // Invalidar sesiones activas anteriores per DEC-108
        await tx.execute(
          `UPDATE organizer_session
           SET revoked_at = $1, revocation_reason = 'CREDENTIAL_ROTATED'
           WHERE account_id = $2 AND revoked_at IS NULL`,
          now,
          account.id
        );

        if (preparedReceipt) {
          if (!this.recoveryAuthority.ackCommit) {
            throw new AuthenticationError('UNAUTHENTICATED', 'Recovery authority does not support mandatory ACK commit');
          }
          try {
            await this.recoveryAuthority.ackCommit(preparedReceipt.preparedReceipt, nextRevision);
          } catch (ackErr) {
            this.recordFailedAttempt(emailNormalized);
            throw new AuthenticationError('UNAUTHENTICATED', `Failed to ACK committed operation: ${(ackErr as Error).message}`);
          }
        }

        credRevBigInt = nextRevision;
        watermark = nextRevision;
      } else {
        const authWatermark = await this.recoveryAuthority.getAdminAuthWatermark(account.id);
        if (authWatermark === null || authWatermark === undefined) {
          this.recordFailedAttempt(emailNormalized);
          throw new AuthenticationError('UNAUTHENTICATED', 'Recovery authority watermark unavailable');
        }
        watermark = authWatermark;
      }

      // 7. Éxito: limpiar intentos fallidos y emitir tokens de sesión opacos de 256 bits
      this.clearFailedAttempts(emailNormalized);

      const rawSessionToken = randomBytes(32).toString('hex');
      const tokenDigest = createHash('sha256').update(rawSessionToken).digest('hex');

      const rawCsrfToken = randomBytes(32).toString('hex');
      const csrfTokenDigest = createHash('sha256').update(rawCsrfToken).digest('hex');

      const authTime = now;
      const expiresAt = new Date(authTime.getTime() + 8 * 60 * 60 * 1000); // 8 horas absoluto
      const idleExpiresAt = new Date(authTime.getTime() + 30 * 60 * 1000); // 30 minutos inactividad
      const sessionId = randomUUID();

      await tx.execute(
        `INSERT INTO organizer_session (
           id, account_id, token_digest, csrf_token_digest, auth_time,
           created_at, expires_at, last_active_at, idle_expires_at, session_watermark
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        sessionId,
        account.id,
        tokenDigest,
        csrfTokenDigest,
        authTime,
        authTime,
        expiresAt,
        authTime,
        idleExpiresAt,
        watermark
      );

      // Registrar auditoría append-only sin tokens
      await this.auditSink.record({
        id: randomUUID(),
        procedure: 'ORGANIZER_LOGIN',
        actorId: account.id,
        targetIdentifier: account.email_normalized,
        targetPrincipalId: account.id,
        result: 'SUCCESS',
        details: 'Organizer authenticated and session issued',
        timestamp: now
      });

      const cookieSpec: OrganizerSessionCookieSpec = {
        name: '__Host-el_session',
        value: rawSessionToken,
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        path: '/',
        maxAgeSeconds: 8 * 60 * 60
      };

      const actorContext: OrganizerActorContext = {
        actorType: 'ORGANIZER_HUMAN',
        accountId: account.id,
        email: account.email,
        sessionId,
        authTime,
        credentialRevision: credRevBigInt,
        sessionWatermark: watermark,
        recoveryEpoch: epoch,
        ...(account.status === 'PENDING_DELETION' ? { restrictedContext: 'DELETION_MANAGEMENT_ONLY' as const } : {})
      };

      const accountRecord: OrganizerAccountRecord = {
        id: account.id,
        email: account.email,
        emailNormalized: account.email_normalized,
        status: (account.status as OrganizerAccountRecord['status']) || 'ACTIVE',
        declaredAdult: Boolean(account.declared_adult),
        declaredAdultAt: account.declared_adult_at ? new Date(account.declared_adult_at) : null,
        invitationId: account.invitation_id,
        verifiedAt: account.verified_at ? new Date(account.verified_at) : null,
        createdAt: new Date(account.created_at),
        updatedAt: new Date(account.updated_at)
      };

      return {
        actorContext,
        sessionToken: rawSessionToken,
        csrfToken: rawCsrfToken,
        cookieSpec,
        account: accountRecord
      };
    });
  }

  /**
   * Validates an existing organizer session and enforces idle/absolute timeouts and credential watermark (EL-TK-013, EL-TK-185).
   */
  public async validateSession(
    command: ValidateOrganizerSessionCommand
  ): Promise<ValidateOrganizerSessionResult> {
    if (!command || !command.sessionToken || typeof command.sessionToken !== 'string') {
      throw new AuthenticationError('SESSION_EXPIRED', 'Session token is required');
    }

    const tokenDigest = createHash('sha256').update(command.sessionToken).digest('hex');

    return this.runner.run(async (tx: SqlTransaction) => {
      const now = new Date();

      const sessionRows = await tx.query<OrganizerSessionRow>(
        `SELECT s.id, s.account_id, s.token_digest, s.csrf_token_digest, s.auth_time, s.created_at,
                s.expires_at, s.last_active_at, s.idle_expires_at, s.revoked_at, s.revocation_reason,
                s.session_watermark, a.email, a.email_normalized, a.status as account_status
         FROM organizer_session s
         JOIN organizer_account a ON a.id = s.account_id
         WHERE s.token_digest = $1
         FOR UPDATE`,
        tokenDigest
      );

      if (!sessionRows.length) {
        throw new AuthenticationError('SESSION_EXPIRED', 'Session not found or invalid');
      }

      const session = sessionRows[0];

      if (session.revoked_at) {
        throw new AuthenticationError('SESSION_REVOKED', `Session has been revoked: ${session.revocation_reason ?? 'REVOKED'}`);
      }

      const absoluteExpiry = new Date(session.expires_at).getTime();
      const idleExpiry = new Date(session.idle_expires_at).getTime();

      if (now.getTime() >= absoluteExpiry) {
        throw new AuthenticationError('SESSION_EXPIRED', 'Session exceeded absolute lifetime');
      }

      if (now.getTime() >= idleExpiry) {
        throw new AuthenticationError('SESSION_EXPIRED', 'Session expired due to inactivity');
      }

      if (session.account_status !== 'ACTIVE' && session.account_status !== 'PENDING_DELETION') {
        throw new AuthenticationError('UNAUTHENTICATED', 'Organizer account is inactive');
      }

      const sessionWatermark = BigInt(session.session_watermark);

      // Invalidate if credential has been rotated post-session issuance
      const credRows = await tx.query<OrganizerCredentialRow>(
        `SELECT id, account_id, purpose, secret_digest, revision, status
         FROM organizer_credential
         WHERE account_id = $1 AND purpose = 'ORGANIZER_AUTHENTICATION' AND status = 'ACTIVE'
         ORDER BY revision DESC
         LIMIT 1`,
        session.account_id
      );

      let currentCredRev = sessionWatermark;
      if (credRows.length > 0) {
        currentCredRev = BigInt(credRows[0].revision);
        if (currentCredRev > sessionWatermark) {
          throw new AuthenticationError('SESSION_REVOKED', 'Session invalidated due to subsequent credential rotation');
        }
      }

      const authRev = await this.recoveryAuthority.getCredentialRevision(session.account_id);
      if (authRev !== null && authRev > sessionWatermark) {
        throw new AuthenticationError('SESSION_REVOKED', 'Session invalidated due to recovery authority credential revision');
      }

      const epoch = await this.recoveryAuthority.getRecoveryEpoch();

      // Actualizar actividad de manera monótona
      const newIdleExpiresAt = new Date(Math.min(now.getTime() + 30 * 60 * 1000, absoluteExpiry));
      await tx.execute(
        `UPDATE organizer_session
         SET last_active_at = $1, idle_expires_at = $2
         WHERE id = $3`,
        now,
        newIdleExpiresAt,
        session.id
      );

      const actorContext: OrganizerActorContext = {
        actorType: 'ORGANIZER_HUMAN',
        accountId: session.account_id,
        email: session.email,
        sessionId: session.id,
        authTime: new Date(session.auth_time),
        credentialRevision: currentCredRev,
        sessionWatermark: sessionWatermark,
        recoveryEpoch: epoch,
        ...(session.account_status === 'PENDING_DELETION'
          ? { restrictedContext: 'DELETION_MANAGEMENT_ONLY' as const }
          : {})
      };

      return {
        actorContext
      };
    });
  }

  /**
   * Lists active sessions belonging to the authenticated organizer (EL-TK-014).
   * Strictly scopes query to actorContext.accountId. Only returns active, non-expired, non-revoked sessions.
   * Identifies the current session via isCurrent. Never exposes session tokens or digests.
   */
  public async listSessions(
    command: ListOrganizerSessionsCommand
  ): Promise<ListOrganizerSessionsResult> {
    if (!command || !command.actorContext || command.actorContext.actorType !== 'ORGANIZER_HUMAN') {
      throw new AuthenticationError('UNAUTHENTICATED', 'Organizer authentication required');
    }

    const { actorContext } = command;
    const now = new Date();

    return this.runner.run(async (tx: SqlTransaction) => {
      // 1. Validate that caller's current session exists and is active
      const currentRows = await tx.query<OrganizerSessionRow>(
        `SELECT id, account_id, revoked_at, expires_at, idle_expires_at
         FROM organizer_session
         WHERE id = $1 AND account_id = $2`,
        actorContext.sessionId,
        actorContext.accountId
      );

      if (!currentRows.length) {
        throw new AuthenticationError('SESSION_EXPIRED', 'Current session not found');
      }

      const current = currentRows[0];
      if (current.revoked_at) {
        throw new AuthenticationError('SESSION_REVOKED', 'Current session has been revoked');
      }

      if (
        now.getTime() >= new Date(current.expires_at).getTime() ||
        now.getTime() >= new Date(current.idle_expires_at).getTime()
      ) {
        throw new AuthenticationError('SESSION_EXPIRED', 'Current session has expired');
      }

      // 2. Query all active sessions for this organizer account
      const rows = await tx.query<OrganizerSessionRow>(
        `SELECT id, account_id, auth_time, created_at, last_active_at, expires_at, idle_expires_at
         FROM organizer_session
         WHERE account_id = $1
           AND revoked_at IS NULL
           AND expires_at > $2
           AND idle_expires_at > $2
         ORDER BY created_at DESC`,
        actorContext.accountId,
        now
      );

      const sessions: OrganizerSessionSummaryRecord[] = rows.map((r) => ({
        id: r.id,
        accountId: r.account_id,
        authTime: new Date(r.auth_time),
        createdAt: new Date(r.created_at),
        lastActiveAt: new Date(r.last_active_at),
        expiresAt: new Date(r.expires_at),
        idleExpiresAt: new Date(r.idle_expires_at),
        isCurrent: r.id === actorContext.sessionId
      }));

      await this.auditSink.record({
        id: randomUUID(),
        procedure: 'ORGANIZER_SESSION_LIST_VIEWED',
        actorId: actorContext.accountId,
        targetIdentifier: actorContext.email,
        targetPrincipalId: actorContext.accountId,
        result: 'SUCCESS',
        details: `Listed ${sessions.length} active sessions`,
        timestamp: now
      });

      return {
        sessions,
        total: sessions.length
      };
    });
  }

  /**
   * Logs out the organizer's current session (EL-TK-015).
   * Revokes exclusively the current session (actorContext.sessionId).
   * Rejects if session already revoked or expired.
   */
  public async logout(command: LogoutOrganizerCommand): Promise<LogoutOrganizerResult> {
    if (!command || !command.actorContext || command.actorContext.actorType !== 'ORGANIZER_HUMAN') {
      throw new AuthenticationError('UNAUTHENTICATED', 'Organizer authentication required');
    }

    const { actorContext } = command;
    const now = new Date();

    return this.runner.run(async (tx: SqlTransaction) => {
      const rows = await tx.query<OrganizerSessionRow>(
        `SELECT id, account_id, revoked_at, expires_at, idle_expires_at
         FROM organizer_session
         WHERE id = $1 AND account_id = $2
         FOR UPDATE`,
        actorContext.sessionId,
        actorContext.accountId
      );

      if (!rows.length) {
        throw new AuthenticationError('SESSION_EXPIRED', 'Session not found');
      }

      const session = rows[0];
      if (session.revoked_at) {
        throw new AuthenticationError('SESSION_REVOKED', 'Session already revoked');
      }

      if (
        now.getTime() >= new Date(session.expires_at).getTime() ||
        now.getTime() >= new Date(session.idle_expires_at).getTime()
      ) {
        throw new AuthenticationError('SESSION_EXPIRED', 'Session already expired');
      }

      await tx.execute(
        `UPDATE organizer_session
         SET revoked_at = $1, revocation_reason = 'USER_LOGOUT'
         WHERE id = $2 AND revoked_at IS NULL`,
        now,
        session.id
      );

      await this.auditSink.record({
        id: randomUUID(),
        procedure: 'ORGANIZER_LOGOUT',
        actorId: actorContext.accountId,
        targetIdentifier: actorContext.email,
        targetPrincipalId: actorContext.accountId,
        result: 'SUCCESS',
        details: 'Organizer session logged out successfully',
        timestamp: now
      });

      return {
        outcome: 'LOGGED_OUT',
        sessionId: session.id
      };
    });
  }

  /**
   * Revokes a specific session belonging to the authenticated organizer (EL-TK-016).
   * Strictly verifies ownership: alien or non-existent sessions fail closed with SESSION_NOT_FOUND.
   * Idempotent if already revoked (returns ALREADY_REVOKED).
   */
  public async revokeSpecificSession(
    command: RevokeSpecificSessionCommand
  ): Promise<RevokeSpecificSessionResult> {
    if (!command || !command.actorContext || command.actorContext.actorType !== 'ORGANIZER_HUMAN') {
      throw new AuthenticationError('UNAUTHENTICATED', 'Organizer authentication required');
    }

    if (!command.targetSessionId || typeof command.targetSessionId !== 'string' || !command.targetSessionId.trim()) {
      throw new AuthenticationError('INVALID_ARGUMENT', 'Target session ID is required');
    }

    const { actorContext, targetSessionId } = command;
    const now = new Date();

    return this.runner.run(async (tx: SqlTransaction) => {
      // 1. Ensure caller's current session is active and not revoked
      const currentRows = await tx.query<OrganizerSessionRow>(
        `SELECT id, account_id, revoked_at, expires_at, idle_expires_at
         FROM organizer_session
         WHERE id = $1 AND account_id = $2`,
        actorContext.sessionId,
        actorContext.accountId
      );

      if (!currentRows.length) {
        throw new AuthenticationError('SESSION_EXPIRED', 'Current session not found');
      }

      const current = currentRows[0];
      if (current.revoked_at) {
        throw new AuthenticationError('SESSION_REVOKED', 'Current session has been revoked');
      }

      if (
        now.getTime() >= new Date(current.expires_at).getTime() ||
        now.getTime() >= new Date(current.idle_expires_at).getTime()
      ) {
        throw new AuthenticationError('SESSION_EXPIRED', 'Current session has expired');
      }

      // 2. Query target session owned by actorContext.accountId
      const targetRows = await tx.query<OrganizerSessionRow>(
        `SELECT id, account_id, revoked_at, expires_at, idle_expires_at
         FROM organizer_session
         WHERE id = $1 AND account_id = $2
         FOR UPDATE`,
        targetSessionId,
        actorContext.accountId
      );

      if (!targetRows.length) {
        // Alien or non-existent session: do NOT leak information, reject as SESSION_NOT_FOUND
        throw new AuthenticationError('SESSION_NOT_FOUND', 'Target session not found');
      }

      const target = targetRows[0];
      const isCurrentSession = target.id === actorContext.sessionId;

      if (target.revoked_at) {
        await this.auditSink.record({
          id: randomUUID(),
          procedure: 'ORGANIZER_SESSION_REVOKED',
          actorId: actorContext.accountId,
          targetIdentifier: actorContext.email,
          targetPrincipalId: actorContext.accountId,
          result: 'ALREADY_REVOKED',
          details: `Target session ${target.id} was already revoked`,
          timestamp: now
        });

        return {
          outcome: 'ALREADY_REVOKED',
          targetSessionId: target.id,
          isCurrentSession
        };
      }

      const reason = command.reason?.trim() || (isCurrentSession ? 'USER_LOGOUT' : 'REVOKED_BY_USER');

      await tx.execute(
        `UPDATE organizer_session
         SET revoked_at = $1, revocation_reason = $2
         WHERE id = $3 AND revoked_at IS NULL`,
        now,
        reason,
        target.id
      );

      await this.auditSink.record({
        id: randomUUID(),
        procedure: 'ORGANIZER_SESSION_REVOKED',
        actorId: actorContext.accountId,
        targetIdentifier: actorContext.email,
        targetPrincipalId: actorContext.accountId,
        result: 'REVOKED',
        details: `Revoked session ${target.id} with reason: ${reason}`,
        timestamp: now
      });

      return {
        outcome: 'REVOKED',
        targetSessionId: target.id,
        isCurrentSession
      };
    });
  }

  /**
   * Revokes all active sessions belonging to the organizer EXCEPT the current one (EL-TK-017).
   * Leaves current session intact and authorized. If no other sessions exist, completes successfully with count 0.
   */
  public async revokeOtherSessions(
    command: RevokeOtherSessionsCommand
  ): Promise<RevokeOtherSessionsResult> {
    if (!command || !command.actorContext || command.actorContext.actorType !== 'ORGANIZER_HUMAN') {
      throw new AuthenticationError('UNAUTHENTICATED', 'Organizer authentication required');
    }

    const { actorContext } = command;
    const now = new Date();

    return this.runner.run(async (tx: SqlTransaction) => {
      // 1. Verify caller's current session is active and not revoked
      const currentRows = await tx.query<OrganizerSessionRow>(
        `SELECT id, account_id, revoked_at, expires_at, idle_expires_at
         FROM organizer_session
         WHERE id = $1 AND account_id = $2
         FOR UPDATE`,
        actorContext.sessionId,
        actorContext.accountId
      );

      if (!currentRows.length) {
        throw new AuthenticationError('SESSION_EXPIRED', 'Current session not found');
      }

      const current = currentRows[0];
      if (current.revoked_at) {
        throw new AuthenticationError('SESSION_REVOKED', 'Current session has been revoked');
      }

      if (
        now.getTime() >= new Date(current.expires_at).getTime() ||
        now.getTime() >= new Date(current.idle_expires_at).getTime()
      ) {
        throw new AuthenticationError('SESSION_EXPIRED', 'Current session has expired');
      }

      const reason = command.reason?.trim() || 'REVOKED_OTHER_SESSIONS';

      // 2. Revoke other active sessions belonging to the same organizer account
      const count = await tx.execute(
        `UPDATE organizer_session
         SET revoked_at = $1, revocation_reason = $2
         WHERE account_id = $3
           AND id <> $4
           AND revoked_at IS NULL`,
        now,
        reason,
        actorContext.accountId,
        actorContext.sessionId
      );

      await this.auditSink.record({
        id: randomUUID(),
        procedure: 'ORGANIZER_OTHER_SESSIONS_REVOKED',
        actorId: actorContext.accountId,
        targetIdentifier: actorContext.email,
        targetPrincipalId: actorContext.accountId,
        result: 'OTHER_SESSIONS_REVOKED',
        details: `Revoked ${count} other sessions`,
        timestamp: now
      });

      return {
        outcome: 'OTHER_SESSIONS_REVOKED',
        revokedCount: count,
        currentSessionId: actorContext.sessionId
      };
    });
  }
}

