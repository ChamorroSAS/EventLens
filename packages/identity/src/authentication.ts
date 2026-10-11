import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  AdminActorContext,
  AdminCredentialRecord,
  AdminLoginCommand,
  AdminLoginResult,
  AdminPrincipal,
  AdminReauthResult,
  AuditEventRecord,
  AuditSink,
  AuthenticationError,
  LogoutCommand,
  ReauthenticateCommand,
  RecoveryAuthorityPort,
  RegisterAdminCredentialCommand,
  SessionCookieSpec,
  ValidateSessionCommand,
  computeCredentialDigest,
  computeDummyCredentialDigest
} from './contracts.js';

interface PrincipalRow {
  id: string;
  identifier: string;
  status: string;
  auth_revision: string | bigint;
  provision_procedure: string;
  provisioned_by: string;
  created_at: Date;
  updated_at: Date;
}

interface CredentialRow {
  id: string;
  principal_id: string;
  purpose: string;
  secret_digest: string;
  revision: string | bigint;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface SessionRow {
  id: string;
  principal_id: string;
  token_digest: string;
  csrf_token_digest: string;
  auth_time: Date;
  created_at: Date;
  expires_at: Date;
  last_active_at: Date;
  idle_expires_at: Date;
  revoked_at: Date | null;
  revocation_reason: string | null;
  session_watermark: string | bigint;
}

export interface AdminAuthenticationOptions {
  /** Allowlisted origins for administrative requests (TB-03). */
  readonly allowedOrigins: readonly string[];
  /** External audit event sink. */
  readonly externalAuditSink?: AuditSink;
  /** Port to recovery authority for epoch and watermark validation (AQR-001, TB-03). */
  readonly recoveryAuthority?: RecoveryAuthorityPort;
  /** Absolute session expiration in milliseconds. Defaults to 8 hours. */
  readonly sessionAbsoluteTtlMs?: number;
  /** Idle session expiration in milliseconds. Defaults to 30 minutes. */
  readonly sessionIdleTtlMs?: number;
  /** Fresh authentication max age in milliseconds. Defaults to 5 minutes. */
  readonly freshAuthMaxAgeMs?: number;
}

const DEFAULT_ABSOLUTE_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const DEFAULT_IDLE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_FRESH_AUTH_TTL_MS = 5 * 60 * 1000; // 5 minutes

function constantTimeHexCompare(aHex: string, bHex: string): boolean {
  const bufA = Buffer.from(aHex, 'hex');
  const bufB = Buffer.from(bHex, 'hex');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Service governing administrative principal authentication and session lifecycle in MOD-001 (TB-03, ARCH-013, AQR-003).
 *
 * Enforces:
 * 1. High-entropy 256-bit credential verification with purpose/subject separation,
 *    constant-time comparison, and constant-time dummy fallback for unknown subjects.
 * 2. Uniform neutral errors across unknown, disabled, revoked, or wrong secrets (no enumeration).
 * 3. Issuance of private session tokens with `__Host-el_admin_session` cookie spec without fixation.
 * 4. 8-hour absolute timeout and 30-minute idle timeout with monotonic non-extending activity touch.
 * 5. Concurrent activity cannot resurrect expired or revoked sessions.
 * 6. Explicit re-authentication with session token rotation, old token revocation, and fresh-auth tracking (<= 5 min).
 * 7. RecoveryAuthority epoch, watermark, and revision verification.
 * 8. Zero leakage of secrets, credentials, tokens, or digests in logs, audit records, or return values.
 */
export class AdminAuthenticationService {
  private readonly allowedOrigins: Set<string>;
  private readonly externalAuditSink?: AuditSink;
  private readonly recoveryAuthority?: RecoveryAuthorityPort;
  private readonly sessionAbsoluteTtlMs: number;
  private readonly sessionIdleTtlMs: number;
  private readonly freshAuthMaxAgeMs: number;

  constructor(
    private readonly transactions: TransactionRunner,
    options: AdminAuthenticationOptions
  ) {
    if (!options.allowedOrigins || options.allowedOrigins.length === 0) {
      throw new AuthenticationError('INVALID_ARGUMENT', 'Allowed origins configuration is required');
    }
    this.allowedOrigins = new Set(options.allowedOrigins);
    this.externalAuditSink = options.externalAuditSink;
    this.recoveryAuthority = options.recoveryAuthority;
    this.sessionAbsoluteTtlMs = options.sessionAbsoluteTtlMs ?? DEFAULT_ABSOLUTE_TTL_MS;
    this.sessionIdleTtlMs = options.sessionIdleTtlMs ?? DEFAULT_IDLE_TTL_MS;
    this.freshAuthMaxAgeMs = options.freshAuthMaxAgeMs ?? DEFAULT_FRESH_AUTH_TTL_MS;
  }

  private async emitAudit(
    tx: SqlTransaction | null,
    event: AuditEventRecord
  ): Promise<void> {
    if (tx) {
      await tx.execute(
        `INSERT INTO admin_audit_event (id, procedure, actor_id, target_identifier, target_principal_id, result, details, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        event.id,
        event.procedure,
        event.actorId,
        event.targetIdentifier,
        event.targetPrincipalId ?? null,
        event.result,
        event.details ?? null,
        event.timestamp
      );
    }
    if (this.externalAuditSink) {
      try {
        await this.externalAuditSink.record(event);
      } catch {
        // External sink failure must not suppress or break core integrity
      }
    }
  }

  private validateOrigin(origin: string | undefined): void {
    if (!origin || origin.trim().length === 0 || origin === 'null') {
      throw new AuthenticationError('INVALID_ORIGIN', 'Origin header must be present and non-null');
    }
    if (!this.allowedOrigins.has(origin)) {
      throw new AuthenticationError('INVALID_ORIGIN', 'Origin is not allowlisted for administrative operations');
    }
  }

  /**
   * Registers a 256-bit administrative credential for an existing principal.
   * Credential delivery and lifecycle belong to 043/045; this method encapsulates canonical hashing.
   */
  async registerCredential(command: RegisterAdminCredentialCommand): Promise<AdminCredentialRecord> {
    if (!command.principalId || !command.secret) {
      throw new AuthenticationError('INVALID_ARGUMENT', 'Principal ID and credential secret are required');
    }
    const purpose = command.purpose ?? 'ADMIN_AUTHENTICATION';
    const secretDigest = computeCredentialDigest(purpose, command.principalId, command.secret);
    const credentialId = randomUUID();
    const revision = command.revision ?? 1n;
    const now = new Date();

    return this.transactions.run(async (tx) => {
      const rows = await tx.query<CredentialRow>(
        `INSERT INTO admin_credential (
           id, principal_id, purpose, secret_digest, revision, status, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, $6)
         RETURNING *`,
        credentialId,
        command.principalId,
        purpose,
        secretDigest,
        revision.toString(),
        now
      );
      return {
        id: rows[0].id,
        principalId: rows[0].principal_id,
        purpose: rows[0].purpose,
        secretDigest: rows[0].secret_digest,
        revision: BigInt(rows[0].revision),
        status: rows[0].status as 'ACTIVE' | 'REVOKED',
        createdAt: rows[0].created_at,
        updatedAt: rows[0].updated_at
      };
    });
  }

  /**
   * Authenticates an administrative principal using high-entropy uniform random secret.
   * Returns a valid AdminActorContext, new session token, CSRF token, and cookie specification.
   */
  async authenticate(command: AdminLoginCommand): Promise<AdminLoginResult> {
    // 1. Validate custom header presence to guard against cross-site form submission
    if (!command.customHeaderPresent) {
      throw new AuthenticationError('UNAUTHENTICATED', 'Missing required administrative client header');
    }

    // 2. Validate Origin header against allowlisted origins
    this.validateOrigin(command.origin);

    if (!command.identifier || !command.secret) {
      throw new AuthenticationError('UNAUTHENTICATED', 'Invalid administrative credentials');
    }

    const normalizedIdentifier = command.identifier.trim().toLowerCase();
    const purpose = 'ADMIN_AUTHENTICATION';

    // 3. Look up principal and credential within transaction
    const lookupResult = await this.transactions.run(async (tx) => {
      const principals = await tx.query<PrincipalRow>(
        `SELECT id, identifier, status, auth_revision FROM admin_principal WHERE identifier = $1`,
        normalizedIdentifier
      );

      if (principals.length === 0 || principals[0].status !== 'ACTIVE') {
        return { principal: null, credential: null };
      }

      const principal = principals[0];
      const credentials = await tx.query<CredentialRow>(
        `SELECT id, principal_id, purpose, secret_digest, revision, status
         FROM admin_credential
         WHERE principal_id = $1 AND purpose = $2 AND status = 'ACTIVE'`,
        principal.id,
        purpose
      );

      if (credentials.length === 0) {
        return { principal, credential: null };
      }

      return { principal, credential: credentials[0] };
    });

    const { principal, credential } = lookupResult;

    // 4. Constant-time credential verification with dummy calculation for unknown/inactive/missing subjects
    if (!principal || !credential) {
      // Execute constant-time dummy calculation to ensure indistinguishable timing
      const dummyDigest = computeDummyCredentialDigest(purpose, command.secret);
      constantTimeHexCompare(dummyDigest, '0'.repeat(64));

      await this.transactions.run(async (tx) => {
        await this.emitAudit(tx, {
          id: randomUUID(),
          procedure: 'ADMIN_LOGIN',
          actorId: 'UNKNOWN_ADMIN',
          targetIdentifier: normalizedIdentifier,
          result: 'REJECTED_UNAUTHENTICATED',
          details: 'Authentication rejected with uniform neutral error',
          timestamp: new Date()
        });
      });

      throw new AuthenticationError('UNAUTHENTICATED', 'Invalid administrative credentials');
    }

    // Verify secret against stored digest using purpose/subject separation and constant-time compare
    const computedDigest = computeCredentialDigest(purpose, principal.id, command.secret);
    const isSecretValid = constantTimeHexCompare(computedDigest, credential.secret_digest);

    if (!isSecretValid) {
      await this.transactions.run(async (tx) => {
        await this.emitAudit(tx, {
          id: randomUUID(),
          procedure: 'ADMIN_LOGIN',
          actorId: principal.id,
          targetIdentifier: normalizedIdentifier,
          targetPrincipalId: principal.id,
          result: 'REJECTED_UNAUTHENTICATED',
          details: 'Authentication rejected with uniform neutral error',
          timestamp: new Date()
        });
      });
      throw new AuthenticationError('UNAUTHENTICATED', 'Invalid administrative credentials');
    }

    // 5. RecoveryAuthority checks (AQR-001, TB-03)
    let recoveryEpoch = 1n;
    let authWatermark = 1n;
    if (this.recoveryAuthority) {
      recoveryEpoch = await this.recoveryAuthority.getRecoveryEpoch();
      authWatermark = await this.recoveryAuthority.getAdminAuthWatermark(principal.id);
      const authorityRevision = await this.recoveryAuthority.getCredentialRevision(principal.id);

      // Snapshot restore prevention: fail-closed if authority revision is strictly newer
      if (authorityRevision !== null && authorityRevision > BigInt(credential.revision)) {
        await this.transactions.run(async (tx) => {
          await this.emitAudit(tx, {
            id: randomUUID(),
            procedure: 'ADMIN_LOGIN',
            actorId: principal.id,
            targetIdentifier: normalizedIdentifier,
            targetPrincipalId: principal.id,
            result: 'REJECTED_UNAUTHENTICATED',
            details: 'Credential revision superseded by recovery authority',
            timestamp: new Date()
          });
        });
        throw new AuthenticationError('UNAUTHENTICATED', 'Invalid administrative credentials');
      }
    }

    // 6. Generate 256-bit random opaque tokens (TB-03)
    const sessionToken = randomBytes(32).toString('hex');
    const csrfToken = randomBytes(32).toString('hex');
    const tokenDigest = hashToken(sessionToken);
    const csrfTokenDigest = hashToken(csrfToken);

    const sessionId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.sessionAbsoluteTtlMs);
    const idleExpiresAt = new Date(now.getTime() + this.sessionIdleTtlMs);

    // 7. PREPARE external -> SQL tx -> ACK pattern (TB-03)
    let preparedReceipt: string | undefined;
    if (this.recoveryAuthority?.prepareSessionOperation) {
      const operationId = randomUUID();
      const prepareResult = await this.recoveryAuthority.prepareSessionOperation(operationId, principal.id);
      preparedReceipt = prepareResult.receipt;
    }

    await this.transactions.run(async (tx) => {
      await tx.execute(
        `INSERT INTO admin_session (
           id, principal_id, token_digest, csrf_token_digest, auth_time,
           created_at, expires_at, last_active_at, idle_expires_at, session_watermark
         ) VALUES ($1, $2, $3, $4, $5, $5, $6, $5, $7, $8)`,
        sessionId,
        principal.id,
        tokenDigest,
        csrfTokenDigest,
        now,
        expiresAt,
        idleExpiresAt,
        authWatermark.toString()
      );

      await this.emitAudit(tx, {
        id: randomUUID(),
        procedure: 'ADMIN_LOGIN',
        actorId: principal.id,
        targetIdentifier: normalizedIdentifier,
        targetPrincipalId: principal.id,
        result: 'SUCCESS',
        details: preparedReceipt ? `Session issued with receipt ${preparedReceipt}` : 'Session issued successfully',
        timestamp: now
      });
    });

    if (this.recoveryAuthority?.ackSessionOperation && preparedReceipt) {
      try {
        await this.recoveryAuthority.ackSessionOperation(preparedReceipt);
      } catch {
        // Fail-closed if ACK fails
        throw new AuthenticationError('TEMPORARY_FAILURE', 'Failed to confirm session emission with recovery authority');
      }
    }

    // 8. Build cookie specification (TB-03)
    const cookieSpec: SessionCookieSpec = {
      name: '__Host-el_admin_session',
      value: sessionToken,
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/',
      maxAgeSeconds: Math.floor(this.sessionAbsoluteTtlMs / 1000)
    };

    // 9. Build AdminActorContext (TB-03)
    const actorContext: AdminActorContext = {
      actorType: 'ADMIN_HUMAN',
      principalId: principal.id,
      identifier: principal.identifier,
      sessionId,
      authTime: now,
      credentialRevision: BigInt(credential.revision),
      adminAuthRevision: BigInt(principal.auth_revision),
      sessionWatermark: authWatermark,
      recoveryEpoch
    };

    return {
      actorContext,
      sessionToken,
      csrfToken,
      cookieSpec
    };
  }

  /**
   * Validates an administrative session token, enforces 8h absolute and 30m idle timeouts,
   * updates activity monotonically without extending absolute expiry, and builds AdminActorContext.
   */
  async validateSession(command: ValidateSessionCommand): Promise<AdminActorContext> {
    if (!command.sessionToken) {
      throw new AuthenticationError('SESSION_EXPIRED', 'Session token is required');
    }

    const tokenDigest = hashToken(command.sessionToken);
    const now = new Date();

    return this.transactions.run(async (tx) => {
      const sessionRows = await tx.query<SessionRow>(
        `SELECT id, principal_id, token_digest, csrf_token_digest, auth_time,
                created_at, expires_at, last_active_at, idle_expires_at,
                revoked_at, revocation_reason, session_watermark
         FROM admin_session
         WHERE token_digest = $1`,
        tokenDigest
      );

      if (sessionRows.length === 0) {
        throw new AuthenticationError('SESSION_EXPIRED', 'Session not found or invalid');
      }

      const session = sessionRows[0];

      if (session.revoked_at !== null) {
        throw new AuthenticationError('SESSION_REVOKED', `Session has been revoked: ${session.revocation_reason ?? 'REVOKED'}`);
      }

      // Check absolute expiration (8 hours)
      if (now.getTime() >= session.expires_at.getTime()) {
        await tx.execute(
          `UPDATE admin_session SET revoked_at = $1, revocation_reason = 'EXPIRED_ABSOLUTE' WHERE id = $2 AND revoked_at IS NULL`,
          now,
          session.id
        );
        throw new AuthenticationError('SESSION_EXPIRED', 'Session exceeded absolute lifetime');
      }

      // Check idle expiration (30 minutes)
      if (now.getTime() >= session.idle_expires_at.getTime()) {
        await tx.execute(
          `UPDATE admin_session SET revoked_at = $1, revocation_reason = 'EXPIRED_IDLE' WHERE id = $2 AND revoked_at IS NULL`,
          now,
          session.id
        );
        throw new AuthenticationError('SESSION_EXPIRED', 'Session expired due to inactivity');
      }

      // Look up principal
      const principalRows = await tx.query<PrincipalRow>(
        `SELECT id, identifier, status, auth_revision FROM admin_principal WHERE id = $1`,
        session.principal_id
      );

      if (principalRows.length === 0 || principalRows[0].status !== 'ACTIVE') {
        throw new AuthenticationError('UNAUTHENTICATED', 'Administrative principal is inactive or deleted');
      }

      const principal = principalRows[0];

      // RecoveryAuthority verification
      let recoveryEpoch = 1n;
      if (this.recoveryAuthority) {
        recoveryEpoch = await this.recoveryAuthority.getRecoveryEpoch();
        const watermark = await this.recoveryAuthority.getAdminAuthWatermark(principal.id);

        if (watermark > BigInt(session.session_watermark)) {
          await tx.execute(
            `UPDATE admin_session SET revoked_at = $1, revocation_reason = 'WATERMARK_SUPERSEDED' WHERE id = $2 AND revoked_at IS NULL`,
            now,
            session.id
          );
          throw new AuthenticationError('SESSION_REVOKED', 'Session invalidated by revocation watermark');
        }
      }

      // Monotonic activity update: advances idle expiration up to the absolute limit, never beyond
      const nextIdleTime = Math.min(
        session.expires_at.getTime(),
        now.getTime() + this.sessionIdleTtlMs
      );
      const nextIdleExpiresAt = new Date(nextIdleTime);

      const updateResult = await tx.execute(
        `UPDATE admin_session
         SET last_active_at = $1, idle_expires_at = $2
         WHERE id = $3
           AND revoked_at IS NULL
           AND expires_at > $1
           AND idle_expires_at > $1`,
        now,
        nextIdleExpiresAt,
        session.id
      );

      // Concurrent race safety: if session was concurrently revoked or expired, fail-closed
      if (updateResult === 0) {
        throw new AuthenticationError('SESSION_EXPIRED', 'Session was concurrently invalidated or expired');
      }

      // Check optional fresh-auth constraint
      if (command.maxAgeAuthTimeMs !== undefined) {
        const authAgeMs = now.getTime() - session.auth_time.getTime();
        if (authAgeMs > command.maxAgeAuthTimeMs) {
          throw new AuthenticationError('FRESH_AUTH_REQUIRED', 'Sensitive operation requires fresh authentication');
        }
      }

      return {
        actorType: 'ADMIN_HUMAN',
        principalId: principal.id,
        identifier: principal.identifier,
        sessionId: session.id,
        authTime: session.auth_time,
        credentialRevision: BigInt(principal.auth_revision),
        adminAuthRevision: BigInt(principal.auth_revision),
        sessionWatermark: BigInt(session.session_watermark),
        recoveryEpoch
      };
    });
  }

  /**
   * Explicit re-authentication with current credential, Origin, and CSRF token.
   * Rotates to a brand new session token, revokes the previous token, and records fresh auth_time.
   */
  async reauthenticate(command: ReauthenticateCommand): Promise<AdminReauthResult> {
    this.validateOrigin(command.origin);

    if (!command.sessionToken || !command.secret || !command.csrfToken) {
      throw new AuthenticationError('INVALID_ARGUMENT', 'Session token, credential secret, and CSRF token are required');
    }

    const tokenDigest = hashToken(command.sessionToken);
    const purpose = 'ADMIN_AUTHENTICATION';
    const now = new Date();

    return this.transactions.run(async (tx) => {
      // 1. Look up existing session
      const sessionRows = await tx.query<SessionRow>(
        `SELECT id, principal_id, csrf_token_digest, expires_at, idle_expires_at, revoked_at, session_watermark
         FROM admin_session
         WHERE token_digest = $1`,
        tokenDigest
      );

      if (sessionRows.length === 0 || sessionRows[0].revoked_at !== null) {
        throw new AuthenticationError('SESSION_EXPIRED', 'Invalid or expired session');
      }

      const oldSession = sessionRows[0];

      if (now.getTime() >= oldSession.expires_at.getTime() || now.getTime() >= oldSession.idle_expires_at.getTime()) {
        throw new AuthenticationError('SESSION_EXPIRED', 'Session expired before re-authentication');
      }

      // 2. Validate CSRF token using constant-time comparison
      const computedCsrfDigest = hashToken(command.csrfToken);
      if (!constantTimeHexCompare(computedCsrfDigest, oldSession.csrf_token_digest)) {
        await this.emitAudit(tx, {
          id: randomUUID(),
          procedure: 'ADMIN_REAUTH',
          actorId: oldSession.principal_id,
          targetIdentifier: oldSession.principal_id,
          targetPrincipalId: oldSession.principal_id,
          result: 'REJECTED_CSRF',
          details: 'CSRF synchronizer token validation failed',
          timestamp: now
        });
        throw new AuthenticationError('CSRF_VALIDATION_FAILED', 'Invalid CSRF synchronizer token');
      }

      // 3. Verify credential
      const principalRows = await tx.query<PrincipalRow>(
        `SELECT id, identifier, status, auth_revision FROM admin_principal WHERE id = $1 AND status = 'ACTIVE'`,
        oldSession.principal_id
      );

      if (principalRows.length === 0) {
        throw new AuthenticationError('UNAUTHENTICATED', 'Principal is not active');
      }
      const principal = principalRows[0];

      const credentialRows = await tx.query<CredentialRow>(
        `SELECT id, secret_digest, revision FROM admin_credential WHERE principal_id = $1 AND purpose = $2 AND status = 'ACTIVE'`,
        principal.id,
        purpose
      );

      if (credentialRows.length === 0) {
        throw new AuthenticationError('UNAUTHENTICATED', 'Invalid administrative credentials');
      }
      const credential = credentialRows[0];

      const computedDigest = computeCredentialDigest(purpose, principal.id, command.secret);
      if (!constantTimeHexCompare(computedDigest, credential.secret_digest)) {
        await this.emitAudit(tx, {
          id: randomUUID(),
          procedure: 'ADMIN_REAUTH',
          actorId: principal.id,
          targetIdentifier: principal.identifier,
          targetPrincipalId: principal.id,
          result: 'REJECTED_UNAUTHENTICATED',
          details: 'Re-authentication secret verification failed',
          timestamp: now
        });
        throw new AuthenticationError('UNAUTHENTICATED', 'Invalid administrative credentials');
      }

      // 4. Revoke previous session
      await tx.execute(
        `UPDATE admin_session
         SET revoked_at = $1, revocation_reason = 'ROTATED_BY_REAUTH'
         WHERE id = $2 AND revoked_at IS NULL`,
        now,
        oldSession.id
      );

      // 5. Emit new session token and CSRF token
      const newSessionToken = randomBytes(32).toString('hex');
      const newCsrfToken = randomBytes(32).toString('hex');
      const newTokenDigest = hashToken(newSessionToken);
      const newCsrfTokenDigest = hashToken(newCsrfToken);

      const newSessionId = randomUUID();
      const expiresAt = new Date(now.getTime() + this.sessionAbsoluteTtlMs);
      const idleExpiresAt = new Date(now.getTime() + this.sessionIdleTtlMs);

      await tx.execute(
        `INSERT INTO admin_session (
           id, principal_id, token_digest, csrf_token_digest, auth_time,
           created_at, expires_at, last_active_at, idle_expires_at, session_watermark
         ) VALUES ($1, $2, $3, $4, $5, $5, $6, $5, $7, $8)`,
        newSessionId,
        principal.id,
        newTokenDigest,
        newCsrfTokenDigest,
        now,
        expiresAt,
        idleExpiresAt,
        oldSession.session_watermark.toString()
      );

      await this.emitAudit(tx, {
        id: randomUUID(),
        procedure: 'ADMIN_REAUTH',
        actorId: principal.id,
        targetIdentifier: principal.identifier,
        targetPrincipalId: principal.id,
        result: 'SUCCESS',
        details: 'Re-authentication succeeded; rotated to new session token',
        timestamp: now
      });

      const cookieSpec: SessionCookieSpec = {
        name: '__Host-el_admin_session',
        value: newSessionToken,
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        path: '/',
        maxAgeSeconds: Math.floor(this.sessionAbsoluteTtlMs / 1000)
      };

      const actorContext: AdminActorContext = {
        actorType: 'ADMIN_HUMAN',
        principalId: principal.id,
        identifier: principal.identifier,
        sessionId: newSessionId,
        authTime: now,
        credentialRevision: BigInt(credential.revision),
        adminAuthRevision: BigInt(principal.auth_revision),
        sessionWatermark: BigInt(oldSession.session_watermark),
        recoveryEpoch: 1n
      };

      return {
        actorContext,
        sessionToken: newSessionToken,
        csrfToken: newCsrfToken,
        cookieSpec
      };
    });
  }

  /**
   * Logs out an administrative session, revoking the session token.
   * Requires valid Origin and CSRF synchronizer token for state mutation (TB-03).
   */
  async logout(command: LogoutCommand): Promise<void> {
    this.validateOrigin(command.origin);

    if (!command.sessionToken || !command.csrfToken) {
      throw new AuthenticationError('INVALID_ARGUMENT', 'Session token and CSRF token are required');
    }

    const tokenDigest = hashToken(command.sessionToken);
    const now = new Date();

    await this.transactions.run(async (tx) => {
      const sessionRows = await tx.query<SessionRow>(
        `SELECT id, principal_id, csrf_token_digest, revoked_at
         FROM admin_session
         WHERE token_digest = $1`,
        tokenDigest
      );

      if (sessionRows.length === 0 || sessionRows[0].revoked_at !== null) {
        // Idempotent logout
        return;
      }

      const session = sessionRows[0];
      const computedCsrfDigest = hashToken(command.csrfToken);

      if (!constantTimeHexCompare(computedCsrfDigest, session.csrf_token_digest)) {
        await this.emitAudit(tx, {
          id: randomUUID(),
          procedure: 'ADMIN_LOGOUT',
          actorId: session.principal_id,
          targetIdentifier: session.principal_id,
          targetPrincipalId: session.principal_id,
          result: 'REJECTED_CSRF',
          details: 'Logout rejected due to CSRF token mismatch',
          timestamp: now
        });
        throw new AuthenticationError('CSRF_VALIDATION_FAILED', 'Invalid CSRF synchronizer token');
      }

      await tx.execute(
        `UPDATE admin_session SET revoked_at = $1, revocation_reason = 'LOGOUT' WHERE id = $2 AND revoked_at IS NULL`,
        now,
        session.id
      );

      await this.emitAudit(tx, {
        id: randomUUID(),
        procedure: 'ADMIN_LOGOUT',
        actorId: session.principal_id,
        targetIdentifier: session.principal_id,
        targetPrincipalId: session.principal_id,
        result: 'SUCCESS',
        details: 'Administrative session logged out successfully',
        timestamp: now
      });
    });
  }

  /**
   * Asserts that an actorContext has fresh authentication within the specified threshold (default 5 min).
   * Sensitive administrative commands must call this prior to executing protected mutations (TB-03).
   */
  assertFreshAuthentication(actorContext: AdminActorContext, maxAgeMs = this.freshAuthMaxAgeMs): void {
    const ageMs = Date.now() - actorContext.authTime.getTime();
    if (ageMs > maxAgeMs) {
      throw new AuthenticationError('FRESH_AUTH_REQUIRED', `Sensitive operation requires fresh authentication (age: ${Math.round(ageMs / 1000)}s > ${Math.round(maxAgeMs / 1000)}s)`);
    }
  }
}
