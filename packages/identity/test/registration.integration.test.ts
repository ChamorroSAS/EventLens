import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  OrganizerRegistrationService,
  RegistrationError,
  computeCredentialDigest,
  type EmailVerificationNotificationPort
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('OrganizerRegistrationService (Real PostgreSQL Integration Tests — EL-TK-010)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

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

      CREATE INDEX IF NOT EXISTS beta_invitation_email_normalized_status_idx 
      ON beta_invitation(email_normalized, status);

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

      CREATE INDEX IF NOT EXISTS organizer_credential_account_purpose_status_idx
        ON organizer_credential(account_id, purpose, status);

      CREATE TABLE IF NOT EXISTS email_verification_intent (
        id UUID PRIMARY KEY,
        account_id UUID NOT NULL REFERENCES organizer_account(id) ON DELETE CASCADE,
        email_normalized TEXT NOT NULL,
        token_digest TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'PENDING',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS email_verification_intent_account_status_idx
        ON email_verification_intent(account_id, status);
    `);
  });

  beforeEach(async () => {
    await sql('DELETE FROM email_verification_intent');
    await sql('DELETE FROM organizer_credential');
    await sql('DELETE FROM organizer_account');
    await sql('DELETE FROM beta_invitation');
    await sql('DELETE FROM admin_audit_event');
  });

  async function seedInvitationInDb(
    email: string,
    rawToken: string,
    status = 'PENDING',
    expiresInDays = 7
  ): Promise<string> {
    const id = randomUUID();
    const tokenDigest = createHash('sha256').update(rawToken).digest('hex');
    const adminId = randomUUID();
    await sql(
      `INSERT INTO beta_invitation (
         id, email, email_normalized, token_digest, status, issued_by, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '${expiresInDays} days')`,
      id,
      email,
      email.trim().toLowerCase(),
      tokenDigest,
      status,
      adminId
    );
    return id;
  }

  it('crea cuenta pendiente con credencial protegida y emite verificacion en PostgreSQL 16 real', async () => {
    const sentEmails: any[] = [];
    const notificationPort: EmailVerificationNotificationPort = {
      sendVerificationEmail: async (info) => {
        sentEmails.push(info);
      }
    };
    const service = new OrganizerRegistrationService(txs, undefined, notificationPort);

    const email = 'real.organizer@eventlens.test';
    const rawToken = randomBytes(32).toString('hex');
    const invitationId = await seedInvitationInDb(email, rawToken, 'PENDING', 7);

    const result = await service.registerOrganizer({
      invitationToken: rawToken,
      email,
      password: 'RealSecurePassword2026!',
      declaredAdult: true
    });

    expect(result.outcome).toBe('REGISTERED_PENDING');
    expect(result.verificationIssued).toBe(true);
    expect(result.account.status).toBe('PENDING_VERIFICATION');
    expect(result.account.declaredAdult).toBe(true);
    expect(result.invitationId).toBe(invitationId);

    // Verificar en BD
    const accounts = await txs.run((tx) =>
      tx.query<{ id: string; status: string; declared_adult: boolean }>(
        'SELECT id, status, declared_adult FROM organizer_account WHERE email_normalized = $1',
        email
      )
    );
    expect(accounts).toHaveLength(1);
    expect(accounts[0].status).toBe('PENDING_VERIFICATION');
    expect(accounts[0].declared_adult).toBe(true);

    const credentials = await txs.run((tx) =>
      tx.query<{ secret_digest: string }>(
        'SELECT secret_digest FROM organizer_credential WHERE account_id = $1',
        accounts[0].id
      )
    );
    expect(credentials).toHaveLength(1);
    expect(credentials[0].secret_digest).toBe(
      computeCredentialDigest('ORGANIZER_AUTHENTICATION', accounts[0].id, 'RealSecurePassword2026!')
    );

    const intents = await txs.run((tx) =>
      tx.query<{ status: string; token_digest: string }>(
        'SELECT status, token_digest FROM email_verification_intent WHERE account_id = $1',
        accounts[0].id
      )
    );
    expect(intents).toHaveLength(1);
    expect(intents[0].status).toBe('PENDING');

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].email).toBe(email);
  });

  it('idempotencia: registro repetido conserva credencial y no duplica ni reenvia verificacion', async () => {
    let emailSendCount = 0;
    const notificationPort: EmailVerificationNotificationPort = {
      sendVerificationEmail: async () => {
        emailSendCount++;
      }
    };
    const service = new OrganizerRegistrationService(txs, undefined, notificationPort);

    const email = 'idempotent@eventlens.test';
    const rawToken = randomBytes(32).toString('hex');
    await seedInvitationInDb(email, rawToken, 'PENDING', 7);

    // Primer registro
    const res1 = await service.registerOrganizer({
      invitationToken: rawToken,
      email,
      password: 'OriginalPassword1!',
      declaredAdult: true
    });
    expect(res1.outcome).toBe('REGISTERED_PENDING');
    expect(emailSendCount).toBe(1);

    // Segundo registro repetido con diferente contraseña
    const res2 = await service.registerOrganizer({
      invitationToken: rawToken,
      email,
      password: 'DifferentPassword2!',
      declaredAdult: true
    });
    expect(res2.outcome).toBe('ALREADY_REGISTERED_PENDING');
    expect(res2.verificationIssued).toBe(false);
    expect(res2.account.id).toBe(res1.account.id);
    expect(emailSendCount).toBe(1); // No reenvía automáticamente

    // Credencial debe seguir siendo la original
    const credentials = await txs.run((tx) =>
      tx.query<{ secret_digest: string }>(
        'SELECT secret_digest FROM organizer_credential WHERE account_id = $1',
        res1.account.id
      )
    );
    expect(credentials[0].secret_digest).toBe(
      computeCredentialDigest('ORGANIZER_AUTHENTICATION', res1.account.id, 'OriginalPassword1!')
    );
  });

  it('concurrencia: llamadas simultaneas bajo SELECT FOR UPDATE no causan duplicados ni fallos transaccionales', async () => {
    const service = new OrganizerRegistrationService(txs);
    const email = 'race.condition@eventlens.test';
    const rawToken = randomBytes(32).toString('hex');
    await seedInvitationInDb(email, rawToken, 'PENDING', 7);

    const [r1, r2] = await Promise.all([
      service.registerOrganizer({
        invitationToken: rawToken,
        email,
        password: 'PasswordRace123!',
        declaredAdult: true
      }),
      service.registerOrganizer({
        invitationToken: rawToken,
        email,
        password: 'PasswordRace123!',
        declaredAdult: true
      })
    ]);

    const outcomes = [r1.outcome, r2.outcome].sort();
    expect(outcomes).toEqual(['ALREADY_REGISTERED_PENDING', 'REGISTERED_PENDING']);

    const accounts = await txs.run((tx) =>
      tx.query<{ count: string }>('SELECT COUNT(*)::text as count FROM organizer_account WHERE email_normalized = $1', email)
    );
    expect(accounts[0].count).toBe('1');
  });
});
