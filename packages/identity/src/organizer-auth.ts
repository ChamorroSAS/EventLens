import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  AuthenticationError,
  computeCredentialDigest,
  computeDummyCredentialDigest,
  type AuditSink,
  type AuditEventRecord,
  type RecoveryAuthorityPort,
  type OrganizerAccountRecord,
  type OrganizerActorContext,
  type OrganizerSessionCookieSpec,
  type OrganizerLoginCommand,
  type OrganizerLoginResult,
  type ValidateOrganizerSessionCommand,
  type ValidateOrganizerSessionResult
} from './contracts.js';

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
}

/**
 * Implements organizer authentication and session emission for EL-TK-013.
 * Guarantees constant-time verification, neutral unauthenticated errors without user enumeration,
 * strict rejection of pending/unverified accounts, recovery authority validation, and rate limiting.
 */
export class OrganizerAuthenticationService {
  private readonly maxFailedAttempts: number;
  private readonly rateLimitWindowMs: number;
  private readonly failedAttempts = new Map<string, { count: number; firstAttemptAt: number }>();

  constructor(
    private readonly runner: TransactionRunner,
    private readonly auditSink: AuditSink,
    private readonly recoveryAuthority: RecoveryAuthorityPort,
    options?: OrganizerAuthOptions
  ) {
    this.maxFailedAttempts = options?.maxFailedAttempts ?? 5;
    this.rateLimitWindowMs = options?.rateLimitWindowMs ?? 15 * 60 * 1000; // 15 minutos
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
        computeDummyCredentialDigest('ORGANIZER_AUTHENTICATION', password);
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

      // 2. Si la cuenta no está activa (por ejemplo, PENDING_VERIFICATION) -> rechazo neutro uniforme sin enumerar
      if (account.status !== 'ACTIVE') {
        computeDummyCredentialDigest('ORGANIZER_AUTHENTICATION', password);
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
        computeDummyCredentialDigest('ORGANIZER_AUTHENTICATION', password);
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

      // 4. Calcular digest real con aislamiento de propósito y comparar en tiempo constante
      const computedDigest = computeCredentialDigest('ORGANIZER_AUTHENTICATION', account.id, password);
      const digestA = Buffer.from(computedDigest, 'hex');
      const digestB = Buffer.from(credential.secret_digest, 'hex');

      const isPasswordValid = digestA.length === digestB.length && timingSafeEqual(digestA, digestB);

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

      // 5. Validar con RecoveryAuthorityPort (AQR-001, EL-TK-046)
      const epoch = await this.recoveryAuthority.getRecoveryEpoch();
      const currentRevision = await this.recoveryAuthority.getCredentialRevision(account.id);
      const credRevBigInt = BigInt(credential.revision);

      if (currentRevision !== null && currentRevision > credRevBigInt) {
        // Credencial restaurada previa a PITR o inconsistente con hechos externos
        this.recordFailedAttempt(emailNormalized);

        await this.auditSink.record({
          id: randomUUID(),
          procedure: 'ORGANIZER_LOGIN',
          actorId: account.id,
          targetIdentifier: account.email_normalized,
          targetPrincipalId: account.id,
          result: 'REJECTED_UNAUTHENTICATED',
          details: 'Authentication rejected: credential revision outdated relative to recovery authority',
          timestamp: now
        });

        throw new AuthenticationError('UNAUTHENTICATED', 'Invalid credentials');
      }

      const watermark = await this.recoveryAuthority.getAdminAuthWatermark(account.id).catch(() => 1n);

      // 6. Éxito: limpiar intentos fallidos y emitir tokens de sesión opacos de 256 bits
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
        watermark ?? 1n
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
        sessionWatermark: watermark ?? 1n,
        recoveryEpoch: epoch
      };

      const accountRecord: OrganizerAccountRecord = {
        id: account.id,
        email: account.email,
        emailNormalized: account.email_normalized,
        status: 'ACTIVE',
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
   * Validates an existing organizer session and enforces idle/absolute timeouts (EL-TK-013).
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

      if (session.account_status !== 'ACTIVE') {
        throw new AuthenticationError('UNAUTHENTICATED', 'Organizer account is inactive');
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
        credentialRevision: 1n,
        sessionWatermark: BigInt(session.session_watermark),
        recoveryEpoch: epoch
      };

      return {
        actorContext
      };
    });
  }
}
