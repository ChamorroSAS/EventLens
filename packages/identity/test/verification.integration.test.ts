import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  EmailVerificationService,
  VerificationError
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('EmailVerificationService (Real PostgreSQL Integration Tests — EL-TK-011)', () => {
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

      ALTER TABLE organizer_account ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
    `);
  });

  beforeEach(async () => {
    await sql('DELETE FROM email_verification_intent');
    await sql('DELETE FROM organizer_account');
    await sql('DELETE FROM beta_invitation');
    await sql('DELETE FROM admin_audit_event');
  });

  async function seedTestScenario(options: {
    invitationStatus?: string;
    invitationDaysLeft?: number;
    accountStatus?: string;
    tokenStatus?: string;
    tokenHoursLeft?: number;
  } = {}) {
    const email = 'real.activation@eventlens.internal';
    const emailNormalized = email.toLowerCase();
    const adminId = randomUUID();
    const invitationId = randomUUID();
    const accountId = randomUUID();
    const intentId = randomUUID();
    const rawVerificationToken = randomBytes(32).toString('hex');
    const tokenDigest = createHash('sha256').update(rawVerificationToken).digest('hex');

    const invStatus = options.invitationStatus ?? 'PENDING';
    const invDays = options.invitationDaysLeft ?? 7;

    await sql(
      `INSERT INTO beta_invitation (
         id, email, email_normalized, token_digest, status, issued_by, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '${invDays} days')`,
      invitationId,
      email,
      emailNormalized,
      createHash('sha256').update('dummy-invite-seed').digest('hex'),
      invStatus,
      adminId
    );

    const accStatus = options.accountStatus ?? 'PENDING_VERIFICATION';
    await sql(
      `INSERT INTO organizer_account (
         id, email, email_normalized, status, declared_adult, declared_adult_at, invitation_id
       ) VALUES ($1, $2, $3, $4, true, NOW(), $5)`,
      accountId,
      email,
      emailNormalized,
      accStatus,
      invitationId
    );

    const tokStatus = options.tokenStatus ?? 'PENDING';
    const tokHours = options.tokenHoursLeft ?? 24;
    await sql(
      `INSERT INTO email_verification_intent (
         id, account_id, email_normalized, token_digest, status, expires_at
       ) VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '${tokHours} hours')`,
      intentId,
      accountId,
      emailNormalized,
      tokenDigest,
      tokStatus
    );

    return {
      accountId,
      invitationId,
      intentId,
      email,
      emailNormalized,
      rawVerificationToken
    };
  }

  it('activa cuenta pendiente y consume invitacion como usada en PostgreSQL 16 real', async () => {
    const service = new EmailVerificationService(txs);
    const fixture = await seedTestScenario();

    const result = await service.verifyEmailAndActivate({
      verificationToken: fixture.rawVerificationToken
    });

    expect(result.outcome).toBe('ACTIVATED');
    expect(result.status).toBe('ACTIVE');
    expect(result.accountId).toBe(fixture.accountId);
    expect(result.verifiedAt).toBeDefined();

    // Comprobar estado en BD
    const accounts = await txs.run((tx) =>
      tx.query<{ status: string; verified_at: Date }>(
        'SELECT status, verified_at FROM organizer_account WHERE id = $1',
        fixture.accountId
      )
    );
    expect(accounts[0].status).toBe('ACTIVE');
    expect(accounts[0].verified_at).toBeDefined();

    const invites = await txs.run((tx) =>
      tx.query<{ status: string; consumed_at: Date }>(
        'SELECT status, consumed_at FROM beta_invitation WHERE id = $1',
        fixture.invitationId
      )
    );
    expect(invites[0].status).toBe('CONSUMED');
    expect(invites[0].consumed_at).toBeDefined();

    const intents = await txs.run((tx) =>
      tx.query<{ status: string; consumed_at: Date }>(
        'SELECT status, consumed_at FROM email_verification_intent WHERE id = $1',
        fixture.intentId
      )
    );
    expect(intents[0].status).toBe('CONSUMED');
    expect(intents[0].consumed_at).toBeDefined();
  });

  it('bloquea capacidades de organizador antes de verificar y las concede tras activacion', async () => {
    const service = new EmailVerificationService(txs);
    const fixture = await seedTestScenario();

    // Antes de verificar: bloqueado
    await expect(service.assertOrganizerActive(fixture.accountId)).rejects.toMatchObject({
      code: 'ACCOUNT_PENDING_VERIFICATION'
    });

    // Activar
    await service.verifyEmailAndActivate({
      verificationToken: fixture.rawVerificationToken
    });

    // Después de verificar: concedido
    const active = await service.assertOrganizerActive(fixture.accountId);
    expect(active.status).toBe('ACTIVE');
    expect(active.id).toBe(fixture.accountId);
  });

  it('concurrencia: llamadas concurrentes no causan errores transaccionales ni doble activacion', async () => {
    const service = new EmailVerificationService(txs);
    const fixture = await seedTestScenario();

    const [r1, r2] = await Promise.all([
      service.verifyEmailAndActivate({
        verificationToken: fixture.rawVerificationToken
      }),
      service.verifyEmailAndActivate({
        verificationToken: fixture.rawVerificationToken
      })
    ]);

    const outcomes = [r1.outcome, r2.outcome].sort();
    expect(outcomes).toEqual(['ACTIVATED', 'ALREADY_ACTIVE']);

    const accounts = await txs.run((tx) =>
      tx.query<{ count: string }>(
        'SELECT COUNT(*)::text as count FROM organizer_account WHERE id = $1 AND status = \'ACTIVE\'',
        fixture.accountId
      )
    );
    expect(accounts[0].count).toBe('1');
  });

  it('rechaza activacion si la invitacion expiro (mas de 7 dias) y conserva la cuenta en pendiente', async () => {
    const service = new EmailVerificationService(txs);
    const fixture = await seedTestScenario({
      invitationDaysLeft: -1 // expirada
    });

    await expect(
      service.verifyEmailAndActivate({
        verificationToken: fixture.rawVerificationToken
      })
    ).rejects.toMatchObject({
      code: 'INVITATION_NOT_USABLE'
    });

    const accounts = await txs.run((tx) =>
      tx.query<{ status: string }>(
        'SELECT status FROM organizer_account WHERE id = $1',
        fixture.accountId
      )
    );
    expect(accounts[0].status).toBe('PENDING_VERIFICATION');
  });

  it('EL-TK-012: resendVerificationEmail emite nuevo token persistido en PostgreSQL y marca previos como SUPERSEDED', async () => {
    const sentEmails: Array<{ email: string; token: string }> = [];
    const notificationPort = {
      sendVerificationEmail: async (data: { email: string; token: string }) => {
        sentEmails.push(data);
      }
    };
    const auditEvents: any[] = [];
    const auditSink = {
      record: async (e: any) => { auditEvents.push(e); }
    };

    const service = new EmailVerificationService(
      txs,
      auditSink,
      undefined,
      notificationPort
    );

    const fixture = await seedTestScenario({
      accountStatus: 'PENDING_VERIFICATION',
      invitationStatus: 'PENDING',
      invitationDaysLeft: 5
    });

    const resendResult = await service.resendVerificationEmail({
      email: fixture.email
    });

    expect(resendResult.outcome).toBe('RESEND_ACCEPTED');
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].email).toBe(fixture.email);

    // En PostgreSQL: el intento anterior debe estar SUPERSEDED
    const prevRows = await txs.run((tx) =>
      tx.query<{ status: string }>(
        'SELECT status FROM email_verification_intent WHERE id = $1',
        fixture.intentId
      )
    );
    expect(prevRows[0].status).toBe('SUPERSEDED');

    // Debe existir un nuevo intento PENDING
    const allIntents = await txs.run((tx) =>
      tx.query<{ id: string; status: string; token_digest: string }>(
        'SELECT id, status, token_digest FROM email_verification_intent WHERE account_id = $1 ORDER BY created_at DESC',
        fixture.accountId
      )
    );
    expect(allIntents).toHaveLength(2);
    expect(allIntents[0].status).toBe('PENDING');

    // Y el token recién enviado permite activar la cuenta
    const activation = await service.verifyEmailAndActivate({
      verificationToken: sentEmails[0].token
    });
    expect(activation.outcome).toBe('ACTIVATED');
    expect(activation.status).toBe('ACTIVE');
  });
});

