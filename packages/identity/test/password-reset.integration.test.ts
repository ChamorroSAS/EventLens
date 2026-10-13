import { IsolatedTestTransactions, assertTestDatabase } from '@eventlens/database/testing';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  PasswordResetService,
  OrganizerAuthenticationService,
  PasswordResetError,
  PasswordVerifier,
  type RecoveryAuthorityPort,
  type PasswordResetNotificationPort
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('PasswordResetService (Real PostgreSQL Integration Tests — EL-TK-018 & EL-TK-019)', () => {
  if (!databaseUrl) return;
  const client = createPrismaClient(databaseUrl!);
  const txs = new IsolatedTestTransactions(new PrismaTransactions(client, 10000));
  const verifier = new PasswordVerifier();
  const authorityRevisions = new Map<string, bigint>();
  const preparedSubjects = new Map<string, string>();
  const authority: RecoveryAuthorityPort = {
    async getRecoveryEpoch() { return 1n; },
    async getAdminAuthWatermark() { return 1n; },
    async getCredentialRevision(subject) { return authorityRevisions.get(subject) ?? null; },
    async prepare(command) {
      const receipt = randomUUID();
      preparedSubjects.set(receipt, command.subjectRef);
      return { preparedReceipt: receipt, sequence: 1n, operationId: command.operationId, subjectRef: command.subjectRef };
    },
    async ackCommit(receipt, revision) {
      const subject = preparedSubjects.get(receipt);
      if (!subject) throw new Error('Unknown test recovery receipt');
      authorityRevisions.set(subject, revision);
    }
  };

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  async function query<T extends object>(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.query<T>(statement, ...args));
  }

  let capturedNotifications: Array<{ email: string; token: string; expiresAt: Date }> = [];
  const notificationPort: PasswordResetNotificationPort = {
    async sendPasswordResetEmail(recipient) {
      capturedNotifications.push(recipient);
    }
  };

  const resetService = new PasswordResetService(txs, {
    notificationPort,
    recoveryAuthority: authority,
    tokenTtlMs: 3600 * 1000
  });

  const authService = new OrganizerAuthenticationService(
    txs,
    { async record() {} },
    authority
  );

  beforeAll(async () => {
    await sql(`
      CREATE TABLE IF NOT EXISTS beta_invitation (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL,
        email_normalized TEXT NOT NULL,
        token_digest TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        issued_by UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        revision BIGINT NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS organizer_account (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL,
        email_normalized TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
        declared_adult BOOLEAN NOT NULL DEFAULT false,
        declared_adult_at TIMESTAMPTZ,
        invitation_id UUID NOT NULL REFERENCES beta_invitation(id) ON DELETE CASCADE,
        verified_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS organizer_credential (
        id UUID PRIMARY KEY,
        account_id UUID NOT NULL REFERENCES organizer_account(id) ON DELETE CASCADE,
        purpose TEXT NOT NULL DEFAULT 'ORGANIZER_AUTHENTICATION',
        secret_digest TEXT NOT NULL,
        revision BIGINT NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS organizer_session (
        id UUID PRIMARY KEY,
        account_id UUID NOT NULL REFERENCES organizer_account(id) ON DELETE CASCADE,
        token_digest TEXT UNIQUE NOT NULL,
        csrf_token_digest TEXT NOT NULL,
        auth_time TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMPTZ NOT NULL,
        last_active_at TIMESTAMPTZ NOT NULL,
        idle_expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        revocation_reason TEXT,
        session_watermark BIGINT NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS password_reset_intent (
        id UUID PRIMARY KEY,
        account_id UUID NOT NULL REFERENCES organizer_account(id) ON DELETE CASCADE,
        email_normalized TEXT NOT NULL,
        token_digest TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'PENDING',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ
      );

      DO $$ BEGIN
        ALTER TABLE password_reset_intent DROP CONSTRAINT IF EXISTS password_reset_intent_account_id_fkey;
        ALTER TABLE password_reset_intent ADD CONSTRAINT password_reset_intent_account_id_fkey FOREIGN KEY (account_id) REFERENCES organizer_account(id) ON DELETE CASCADE;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      CREATE TABLE IF NOT EXISTS admin_audit_event (
        id UUID PRIMARY KEY,
        procedure TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        target_identifier TEXT NOT NULL,
        target_principal_id UUID,
        result TEXT NOT NULL,
        details TEXT,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  });

  beforeEach(async () => {
    capturedNotifications = [];
    authorityRevisions.clear();
    preparedSubjects.clear();
    resetService.resetRateLimitTracker();
    authService.resetRateLimitTracker();
    await sql('DELETE FROM password_reset_intent');
    await sql('DELETE FROM organizer_session');
    await sql('DELETE FROM organizer_credential');
    await sql('DELETE FROM organizer_account');
    await sql('DELETE FROM beta_invitation');
    await sql('DELETE FROM admin_audit_event');
  });

  async function seedVerifiedAccount(email: string, initialPassword: string = 'InitialPassword123!') {
    const emailNormalized = email.toLowerCase();
    const invitationId = randomUUID();
    const accountId = randomUUID();
    const credentialId = randomUUID();

    await sql(`
      INSERT INTO beta_invitation (id, email, email_normalized, token_digest, status, issued_by, created_at, expires_at)
      VALUES ('${invitationId}', '${email}', '${emailNormalized}', '${randomUUID()}', 'CONSUMED', '${randomUUID()}', NOW(), NOW() + interval '7 days')
    `);

    await sql(`
      INSERT INTO organizer_account (id, email, email_normalized, status, declared_adult, declared_adult_at, invitation_id, verified_at, created_at, updated_at)
      VALUES ('${accountId}', '${email}', '${emailNormalized}', 'ACTIVE', true, NOW(), '${invitationId}', NOW(), NOW(), NOW())
    `);

    const secretDigest = await verifier.hashPassword(initialPassword);
    await sql(`
      INSERT INTO organizer_credential (id, account_id, purpose, secret_digest, revision, status, created_at, updated_at)
      VALUES ('${credentialId}', '${accountId}', 'ORGANIZER_AUTHENTICATION', '${secretDigest}', 1, 'ACTIVE', NOW(), NOW())
    `);

    authorityRevisions.set(accountId, 1n);

    return { accountId, invitationId, credentialId, email, emailNormalized };
  }

  it('requests password reset, stores intent with unguessable token, and supersedes previous pending intents (EL-TK-018)', async () => {
    const { email, accountId } = await seedVerifiedAccount('organizer.reset@eventlens.local');

    // First request
    const firstResult = await resetService.requestPasswordReset({ email });
    expect(firstResult.outcome).toBe('RESET_REQUEST_RECEIVED');
    expect(capturedNotifications).toHaveLength(1);

    const firstToken = capturedNotifications[0].token;
    expect(firstToken).toBeTruthy();

    const firstIntents = await query<{ id: string; status: string }>(
      `SELECT id, status FROM password_reset_intent WHERE account_id = '${accountId}'`
    );
    expect(firstIntents).toHaveLength(1);
    expect(firstIntents[0].status).toBe('PENDING');

    // Second request (supersedes first)
    const secondResult = await resetService.requestPasswordReset({ email });
    expect(secondResult.outcome).toBe('RESET_REQUEST_RECEIVED');
    expect(capturedNotifications).toHaveLength(2);

    const allIntents = await query<{ id: string; status: string }>(
      `SELECT id, status FROM password_reset_intent WHERE account_id = '${accountId}' ORDER BY created_at ASC`
    );
    expect(allIntents).toHaveLength(2);
    expect(allIntents[0].status).toBe('SUPERSEDED');
    expect(allIntents[1].status).toBe('PENDING');
  });

  it('completes password recovery in PostgreSQL, updates credentials, and invalidates all existing sessions (EL-TK-019)', async () => {
    const { email, accountId } = await seedVerifiedAccount('active.organizer@eventlens.local', 'OldSecretPassword123!');

    // Login to create 2 active sessions
    const login1 = await authService.login({ email, password: 'OldSecretPassword123!' });
    const login2 = await authService.login({ email, password: 'OldSecretPassword123!' });

    // Validate that sessions authorize prior to reset
    await expect(authService.validateSession({ sessionToken: login1.sessionToken })).resolves.toBeDefined();
    await expect(authService.validateSession({ sessionToken: login2.sessionToken })).resolves.toBeDefined();

    // Request reset
    await resetService.requestPasswordReset({ email });
    expect(capturedNotifications).toHaveLength(1);
    const resetToken = capturedNotifications[0].token;

    // Complete reset with brand new password
    const newPassword = 'BrandNewStrongPassword2026!';
    const completeResult = await resetService.completePasswordReset({
      resetToken,
      newPassword
    });

    expect(completeResult.outcome).toBe('PASSWORD_RESET_COMPLETED');
    expect(completeResult.revokedSessionsCount).toBe(2);

    // Verify intent in PostgreSQL is CONSUMED
    const consumedIntent = await query<{ status: string; consumed_at: Date }>(
      `SELECT status, consumed_at FROM password_reset_intent WHERE account_id = '${accountId}'`
    );
    expect(consumedIntent[0].status).toBe('CONSUMED');
    expect(consumedIntent[0].consumed_at).toBeTruthy();

    // Verify credential updated with revision 2
    const credRows = await query<{ revision: string; secret_digest: string }>(
      `SELECT revision, secret_digest FROM organizer_credential WHERE account_id = '${accountId}'`
    );
    expect(Number(credRows[0].revision)).toBe(2);
    expect(await verifier.verifyPassword(credRows[0].secret_digest, newPassword)).toBe(true);
    expect(await verifier.verifyPassword(credRows[0].secret_digest, 'OldSecretPassword123!')).toBe(false);
    expect(await authority.getCredentialRevision(accountId)).toBe(2n);

    // Verify that old sessions now throw SESSION_REVOKED
    await expect(
      authService.validateSession({ sessionToken: login1.sessionToken })
    ).rejects.toMatchObject({
      code: 'SESSION_REVOKED'
    });
    await expect(
      authService.validateSession({ sessionToken: login2.sessionToken })
    ).rejects.toMatchObject({
      code: 'SESSION_REVOKED'
    });

    // Verify organizer CANNOT login with old password
    await expect(
      authService.login({ email, password: 'OldSecretPassword123!' })
    ).rejects.toMatchObject({
      code: 'UNAUTHENTICATED'
    });

    // Verify organizer CAN login with new password
    const newLogin = await authService.login({ email, password: newPassword });
    expect(newLogin.sessionToken).toBeTruthy();
    expect(newLogin.actorContext.credentialRevision).toBe(2n);
  });

  it('rejects double consumption of the same reset token in PostgreSQL', async () => {
    const { email } = await seedVerifiedAccount('idempotent.organizer@eventlens.local');

    await resetService.requestPasswordReset({ email });
    const resetToken = capturedNotifications[0].token;

    // First completion
    await resetService.completePasswordReset({
      resetToken,
      newPassword: 'FirstNewPassword123!'
    });

    // Second completion with same token
    await expect(
      resetService.completePasswordReset({
        resetToken,
        newPassword: 'SecondNewPassword123!'
      })
    ).rejects.toMatchObject({
      code: 'TOKEN_ALREADY_USED'
    });
  });

  it('rejects superseded reset token when a newer request was issued', async () => {
    const { email } = await seedVerifiedAccount('superseded.organizer@eventlens.local');

    // First request
    await resetService.requestPasswordReset({ email });
    const token1 = capturedNotifications[0].token;

    // Second request (supersedes token 1)
    await resetService.requestPasswordReset({ email });
    const token2 = capturedNotifications[1].token;

    // Token 1 rejected with TOKEN_REVOKED
    await expect(
      resetService.completePasswordReset({
        resetToken: token1,
        newPassword: 'SomePassword123!'
      })
    ).rejects.toMatchObject({
      code: 'TOKEN_REVOKED'
    });

    // Token 2 succeeds
    await expect(
      resetService.completePasswordReset({
        resetToken: token2,
        newPassword: 'SomePassword123!'
      })
    ).resolves.toMatchObject({
      outcome: 'PASSWORD_RESET_COMPLETED'
    });
  });
});
