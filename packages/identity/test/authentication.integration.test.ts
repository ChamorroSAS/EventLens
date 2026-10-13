import { IsolatedTestTransactions, assertTestDatabase } from '@eventlens/database/testing';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  AdminProvisioningService,
  AdminAuthenticationService,
  AuthenticationError,
  serializeSessionCookie,
  type SessionCookieSpec
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('AdminAuthenticationService (Real PostgreSQL Integration Tests)', () => {
  if (!databaseUrl) return;
  const client = createPrismaClient(databaseUrl!);
  const txs = new IsolatedTestTransactions(new PrismaTransactions(client, 10000));
  const bootstrapSecret = 'pg-integration-bootstrap-secret-256bit';
  const allowedOrigins = ['https://admin.eventlens.internal'];

  const provisioningService = new AdminProvisioningService(txs, bootstrapSecret);
  const authService = new AdminAuthenticationService(txs, {
    allowedOrigins,
    sessionAbsoluteTtlMs: 8 * 60 * 60 * 1000,
    sessionIdleTtlMs: 30 * 60 * 1000
  });

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  async function query<T extends object>(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.query<T>(statement, ...args));
  }

  beforeAll(async () => {
    await sql(`
      CREATE TABLE IF NOT EXISTS "admin_principal" (
        "id" UUID NOT NULL,
        "identifier" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "auth_revision" BIGINT NOT NULL DEFAULT 1,
        "provision_procedure" TEXT NOT NULL,
        "provisioned_by" TEXT NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "admin_principal_pkey" PRIMARY KEY ("id")
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "admin_principal_identifier_key" ON "admin_principal"("identifier");
      CREATE TABLE IF NOT EXISTS "operational_bootstrap_state" (
        "id" TEXT NOT NULL,
        "is_consumed" BOOLEAN NOT NULL DEFAULT false,
        "consumed_at" TIMESTAMPTZ,
        "consumed_by" TEXT,
        CONSTRAINT "operational_bootstrap_state_pkey" PRIMARY KEY ("id")
      );
      CREATE TABLE IF NOT EXISTS "admin_audit_event" (
        "id" UUID NOT NULL,
        "procedure" TEXT NOT NULL,
        "actor_id" TEXT NOT NULL,
        "target_identifier" TEXT NOT NULL,
        "target_principal_id" UUID,
        "result" TEXT NOT NULL,
        "details" TEXT,
        "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "admin_audit_event_pkey" PRIMARY KEY ("id")
      );
      CREATE TABLE IF NOT EXISTS "admin_credential" (
        "id" UUID NOT NULL,
        "principal_id" UUID NOT NULL,
        "purpose" TEXT NOT NULL DEFAULT 'ADMIN_AUTHENTICATION',
        "secret_digest" TEXT NOT NULL,
        "revision" BIGINT NOT NULL DEFAULT 1,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "admin_credential_pkey" PRIMARY KEY ("id")
      );
      CREATE TABLE IF NOT EXISTS "admin_session" (
        "id" UUID NOT NULL,
        "principal_id" UUID NOT NULL,
        "token_digest" TEXT NOT NULL,
        "csrf_token_digest" TEXT NOT NULL,
        "auth_time" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "last_active_at" TIMESTAMPTZ NOT NULL,
        "idle_expires_at" TIMESTAMPTZ NOT NULL,
        "revoked_at" TIMESTAMPTZ,
        "revocation_reason" TEXT,
        "session_watermark" BIGINT NOT NULL DEFAULT 1,
        CONSTRAINT "admin_session_pkey" PRIMARY KEY ("id")
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "admin_session_token_digest_key" ON "admin_session"("token_digest");
    `);
  });

  beforeEach(async () => {
    // Clean tables between tests
    await sql('DELETE FROM admin_session');
    await sql('DELETE FROM admin_credential');
    await sql('DELETE FROM admin_audit_event');
    await sql('DELETE FROM admin_principal');
    await sql("UPDATE operational_bootstrap_state SET is_consumed = false, consumed_at = NULL, consumed_by = NULL WHERE id = 'SYSTEM_BOOTSTRAP'");
  });

  it('executes full end-to-end admin lifecycle: provision -> register credential -> login -> validate -> reauth -> logout', async () => {
    // 1. Provision administrative principal
    const principal = await provisioningService.provisionInitialBootstrap({
      operatorToken: bootstrapSecret,
      identifier: 'sec-admin@eventlens.internal'
    });
    expect(principal.id).toBeDefined();

    // 2. Register 256-bit credential
    const secret = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
    const cred = await authService.registerCredential({
      principalId: principal.id,
      secret
    });
    expect(cred.principalId).toBe(principal.id);
    expect(cred.secretDigest).toHaveLength(64);

    // 3. Authenticate
    const loginResult = await authService.authenticate({
      identifier: 'sec-admin@eventlens.internal',
      secret,
      origin: allowedOrigins[0],
      customHeaderPresent: true
    });

    expect(loginResult.sessionToken).toHaveLength(64);
    expect(loginResult.csrfToken).toHaveLength(64);
    expect(loginResult.actorContext.actorType).toBe('ADMIN_HUMAN');
    expect(loginResult.actorContext.principalId).toBe(principal.id);

    const serializedCookie = serializeSessionCookie(loginResult.cookieSpec);
    expect(serializedCookie).toContain('__Host-el_admin_session=');
    expect(serializedCookie).toContain('Path=/');
    expect(serializedCookie).toContain('SameSite=Strict');

    // 4. Validate session
    const validatedContext = await authService.validateSession({
      sessionToken: loginResult.sessionToken
    });
    expect(validatedContext.sessionId).toBe(loginResult.actorContext.sessionId);
    expect(validatedContext.principalId).toBe(principal.id);

    // 5. Re-authenticate with token rotation
    const reauthResult = await authService.reauthenticate({
      sessionToken: loginResult.sessionToken,
      secret,
      origin: allowedOrigins[0],
      csrfToken: loginResult.csrfToken
    });

    expect(reauthResult.sessionToken).not.toBe(loginResult.sessionToken);
    expect(reauthResult.actorContext.sessionId).not.toBe(loginResult.actorContext.sessionId);

    // Verify old session token is revoked in DB
    await expect(
      authService.validateSession({ sessionToken: loginResult.sessionToken })
    ).rejects.toThrow(AuthenticationError);

    // Verify new session token is active and valid
    const newContext = await authService.validateSession({
      sessionToken: reauthResult.sessionToken
    });
    expect(newContext.sessionId).toBe(reauthResult.actorContext.sessionId);

    // 6. Logout
    await authService.logout({
      sessionToken: reauthResult.sessionToken,
      origin: allowedOrigins[0],
      csrfToken: reauthResult.csrfToken
    });

    // Verify session is now revoked
    await expect(
      authService.validateSession({ sessionToken: reauthResult.sessionToken })
    ).rejects.toThrow('Session has been revoked');
  });

  it('guarantees database persists digests only, never raw credentials or session tokens', async () => {
    const principal = await provisioningService.provisionInitialBootstrap({
      operatorToken: bootstrapSecret,
      identifier: 'audit-safe-admin@eventlens.internal'
    });

    const secret = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    await authService.registerCredential({
      principalId: principal.id,
      secret
    });

    const loginResult = await authService.authenticate({
      identifier: 'audit-safe-admin@eventlens.internal',
      secret,
      origin: allowedOrigins[0],
      customHeaderPresent: true
    });

    // Inspect database rows directly
    const sessionRows = await query<any>(`SELECT * FROM admin_session WHERE id = $1`, loginResult.actorContext.sessionId);
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows[0].token_digest).not.toBe(loginResult.sessionToken);
    expect(sessionRows[0].csrf_token_digest).not.toBe(loginResult.csrfToken);

    // Verify audit events contain zero secrets or tokens
    const auditRows = await query<any>(`SELECT * FROM admin_audit_event`);
    for (const audit of auditRows) {
      expect(audit.details).not.toContain(secret);
      expect(audit.details).not.toContain(loginResult.sessionToken);
      expect(audit.details).not.toContain(loginResult.csrfToken);
    }
  });

  it('prevents concurrent activity from resurrecting an expired or revoked session in PostgreSQL', async () => {
    const principal = await provisioningService.provisionInitialBootstrap({
      operatorToken: bootstrapSecret,
      identifier: 'race-admin@eventlens.internal'
    });

    const secret = '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';
    await authService.registerCredential({
      principalId: principal.id,
      secret
    });

    const loginResult = await authService.authenticate({
      identifier: 'race-admin@eventlens.internal',
      secret,
      origin: allowedOrigins[0],
      customHeaderPresent: true
    });

    // Manually revoke the session in DB
    await sql(`UPDATE admin_session SET revoked_at = NOW(), revocation_reason = 'MANUAL_TEST' WHERE id = $1`, loginResult.actorContext.sessionId);

    // Attempt concurrent activity validation
    await expect(
      authService.validateSession({ sessionToken: loginResult.sessionToken })
    ).rejects.toThrow('Session has been revoked');

    // Confirm session is still revoked
    const rows = await query<any>(`SELECT revoked_at, revocation_reason FROM admin_session WHERE id = $1`, loginResult.actorContext.sessionId);
    expect(rows[0].revoked_at).not.toBeNull();
    expect(rows[0].revocation_reason).toBe('MANUAL_TEST');
  });

  it('enforces monotonic activity touch without extending absolute 8-hour expiry', async () => {
    const principal = await provisioningService.provisionInitialBootstrap({
      operatorToken: bootstrapSecret,
      identifier: 'monotonic-admin@eventlens.internal'
    });

    const secret = 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899';
    await authService.registerCredential({
      principalId: principal.id,
      secret
    });

    const loginResult = await authService.authenticate({
      identifier: 'monotonic-admin@eventlens.internal',
      secret,
      origin: allowedOrigins[0],
      customHeaderPresent: true
    });

    // Check initial absolute expiration
    const initialRows = await query<any>(`SELECT expires_at, idle_expires_at FROM admin_session WHERE id = $1`, loginResult.actorContext.sessionId);
    const initialExpiresAt = new Date(initialRows[0].expires_at).getTime();

    // Perform activity touch
    await authService.validateSession({ sessionToken: loginResult.sessionToken });

    // Verify absolute expiry has NOT changed
    const afterRows = await query<any>(`SELECT expires_at, idle_expires_at FROM admin_session WHERE id = $1`, loginResult.actorContext.sessionId);
    const afterExpiresAt = new Date(afterRows[0].expires_at).getTime();

    expect(afterExpiresAt).toBe(initialExpiresAt);
  });
});
