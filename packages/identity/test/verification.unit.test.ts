import { describe, expect, it, vi } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  AuditSink,
  RecoveryAuthorityPort,
  VerificationError
} from '../src/contracts.js';
import { EmailVerificationService } from '../src/verification.js';

interface InMemoryDb {
  invitations: Map<string, any>;
  accounts: Map<string, any>;
  verificationIntents: Map<string, any>;
  auditEvents: any[];
}

function createInMemoryRunner(db: InMemoryDb): TransactionRunner {
  return {
    async run<T>(callback: (tx: SqlTransaction) => Promise<T>): Promise<T> {
      const tx: SqlTransaction = {
        async execute(sql: string, ...params: unknown[]): Promise<number> {
          await this.query(sql, ...params);
          return 1;
        },
        async query<R = any>(sql: string, ...params: unknown[]): Promise<R[]> {
          const normalizedSql = sql.trim();

          // SELECT ... FROM email_verification_intent WHERE token_digest = $1 FOR UPDATE
          if (normalizedSql.includes('FROM email_verification_intent') && normalizedSql.includes('token_digest = $1')) {
            const tokenDigest = params[0] as string;
            const intent = [...db.verificationIntents.values()].find(i => i.token_digest === tokenDigest);
            return (intent ? [{ ...intent }] : []) as unknown as R[];
          }

          // SELECT ... FROM organizer_account WHERE id = $1 FOR UPDATE / regular
          if (normalizedSql.includes('FROM organizer_account') && normalizedSql.includes('id = $1')) {
            const id = params[0] as string;
            const account = db.accounts.get(id);
            return (account ? [{ ...account }] : []) as unknown as R[];
          }

          // SELECT ... FROM beta_invitation WHERE id = $1 FOR UPDATE
          if (normalizedSql.includes('FROM beta_invitation') && normalizedSql.includes('id = $1')) {
            const id = params[0] as string;
            const invitation = db.invitations.get(id);
            return (invitation ? [{ ...invitation }] : []) as unknown as R[];
          }

          // UPDATE organizer_account SET status = 'ACTIVE'
          if (normalizedSql.includes('UPDATE organizer_account')) {
            const [verified_at, updated_at, id] = params;
            const account = db.accounts.get(id as string);
            if (account) {
              account.status = 'ACTIVE';
              account.verified_at = verified_at;
              account.updated_at = updated_at;
            }
            return [] as unknown as R[];
          }

          // UPDATE beta_invitation SET status = 'CONSUMED'
          if (normalizedSql.includes('UPDATE beta_invitation')) {
            const [consumed_at, id] = params;
            const invitation = db.invitations.get(id as string);
            if (invitation) {
              invitation.status = 'CONSUMED';
              invitation.consumed_at = consumed_at;
            }
            return [] as unknown as R[];
          }

          // UPDATE email_verification_intent SET status = 'CONSUMED'
          if (normalizedSql.includes('UPDATE email_verification_intent')) {
            const [consumed_at, id] = params;
            const intent = db.verificationIntents.get(id as string);
            if (intent) {
              intent.status = 'CONSUMED';
              intent.consumed_at = consumed_at;
            }
            return [] as unknown as R[];
          }

          // INSERT INTO admin_audit_event
          if (normalizedSql.includes('INSERT INTO admin_audit_event')) {
            const [id, procedure, actor_id, target_identifier, target_principal_id, result, details, timestamp] = params;
            const record = {
              id,
              procedure,
              actor_id,
              target_identifier,
              target_principal_id,
              result,
              details,
              timestamp
            };
            db.auditEvents.push(record);
            return [record] as unknown as R[];
          }

          throw new Error(`Unhandled mock SQL query: ${sql}`);
        }
      };
      return callback(tx);
    }
  };
}

describe('EL-TK-011: EmailVerificationService (Unit Tests)', () => {
  function setup() {
    const db: InMemoryDb = {
      invitations: new Map(),
      accounts: new Map(),
      verificationIntents: new Map(),
      auditEvents: []
    };
    const runner = createInMemoryRunner(db);
    const auditSink: AuditSink = {
      record: vi.fn(async event => {
        db.auditEvents.push(event);
      })
    };
    const recoveryAuthority: RecoveryAuthorityPort = {
      getRecoveryEpoch: vi.fn().mockResolvedValue(1n),
      getCredentialRevision: vi.fn().mockResolvedValue(1n),
      getAdminAuthWatermark: vi.fn().mockResolvedValue(1n)
    };
    const service = new EmailVerificationService(runner, auditSink, recoveryAuthority);
    return { db, runner, auditSink, recoveryAuthority, service };
  }

  function seedFixture(
    db: InMemoryDb,
    options: {
      accountStatus?: 'PENDING_VERIFICATION' | 'ACTIVE';
      invitationStatus?: 'PENDING' | 'CONSUMED' | 'REVOKED';
      invitationDaysLeft?: number;
      tokenStatus?: 'PENDING' | 'CONSUMED';
      tokenHoursLeft?: number;
    } = {}
  ) {
    const now = new Date();
    const accountId = randomUUID();
    const invitationId = randomUUID();
    const intentId = randomUUID();
    const email = 'organizer.test@eventlens.internal';
    const emailNormalized = email.toLowerCase();
    const rawVerificationToken = randomBytes(32).toString('hex');
    const tokenDigest = createHash('sha256').update(rawVerificationToken).digest('hex');

    const invitationDaysLeft = options.invitationDaysLeft ?? 7;
    const invitationExpiresAt = new Date(now.getTime() + invitationDaysLeft * 24 * 60 * 60 * 1000);
    const invitation = {
      id: invitationId,
      email,
      email_normalized: emailNormalized,
      token_digest: createHash('sha256').update('dummy-invite-token').digest('hex'),
      status: options.invitationStatus ?? 'PENDING',
      issued_by: randomUUID(),
      created_at: now,
      expires_at: invitationExpiresAt,
      consumed_at: options.invitationStatus === 'CONSUMED' ? now : null,
      revoked_at: options.invitationStatus === 'REVOKED' ? now : null,
      revision: 1n
    };
    db.invitations.set(invitationId, invitation);

    const account = {
      id: accountId,
      email,
      email_normalized: emailNormalized,
      status: options.accountStatus ?? 'PENDING_VERIFICATION',
      declared_adult: true,
      declared_adult_at: now,
      invitation_id: invitationId,
      verified_at: options.accountStatus === 'ACTIVE' ? now : null,
      created_at: now,
      updated_at: now
    };
    db.accounts.set(accountId, account);

    const tokenHoursLeft = options.tokenHoursLeft ?? 24;
    const tokenExpiresAt = new Date(now.getTime() + tokenHoursLeft * 60 * 60 * 1000);
    const intent = {
      id: intentId,
      account_id: accountId,
      email_normalized: emailNormalized,
      token_digest: tokenDigest,
      status: options.tokenStatus ?? 'PENDING',
      created_at: now,
      expires_at: tokenExpiresAt,
      consumed_at: options.tokenStatus === 'CONSUMED' ? now : null
    };
    db.verificationIntents.set(intentId, intent);

    return {
      accountId,
      invitationId,
      intentId,
      emailNormalized,
      rawVerificationToken,
      invitation,
      account,
      intent
    };
  }

  it('Criterio: Activar tras verificar activa la cuenta y consume la invitacion como usada', async () => {
    const { db, service, auditSink } = setup();
    const fixture = seedFixture(db, {
      accountStatus: 'PENDING_VERIFICATION',
      invitationStatus: 'PENDING',
      tokenStatus: 'PENDING'
    });

    const result = await service.verifyEmailAndActivate({
      verificationToken: fixture.rawVerificationToken
    });

    expect(result.outcome).toBe('ACTIVATED');
    expect(result.status).toBe('ACTIVE');
    expect(result.accountId).toBe(fixture.accountId);
    expect(result.emailNormalized).toBe(fixture.emailNormalized);
    expect(result.verifiedAt).toBeDefined();

    // Verificamos que la cuenta pasó a ACTIVE con verified_at
    const updatedAccount = db.accounts.get(fixture.accountId);
    expect(updatedAccount.status).toBe('ACTIVE');
    expect(updatedAccount.verified_at).toBeDefined();

    // Verificamos que la invitación pasó a CONSUMED
    const updatedInvitation = db.invitations.get(fixture.invitationId);
    expect(updatedInvitation.status).toBe('CONSUMED');
    expect(updatedInvitation.consumed_at).toBeDefined();

    // Verificamos que la intención de verificación pasó a CONSUMED
    const updatedIntent = db.verificationIntents.get(fixture.intentId);
    expect(updatedIntent.status).toBe('CONSUMED');
    expect(updatedIntent.consumed_at).toBeDefined();

    // Verificamos evento de auditoría
    expect(auditSink.record).toHaveBeenCalled();
    const auditCall = (auditSink.record as any).mock.calls[0][0];
    expect(auditCall.procedure).toBe('ORGANIZER_EMAIL_VERIFIED_AND_ACTIVATED');
    expect(auditCall.result).toBe('ACTIVATED');
    expect(JSON.stringify(auditCall)).not.toContain(fixture.rawVerificationToken);
  });

  it('Criterio: Bloquear antes de verificar no concede capacidades a cuentas no activas', async () => {
    const { db, service } = setup();
    const fixture = seedFixture(db, {
      accountStatus: 'PENDING_VERIFICATION'
    });

    await expect(service.assertOrganizerActive(fixture.accountId)).rejects.toThrowError(VerificationError);
    await expect(service.assertOrganizerActive(fixture.accountId)).rejects.toMatchObject({
      code: 'ACCOUNT_PENDING_VERIFICATION'
    });

    await expect(service.assertOrganizerActive(randomUUID())).rejects.toMatchObject({
      code: 'ACCOUNT_NOT_FOUND'
    });

    // Tras activar, assertOrganizerActive debe responder correctamente
    await service.verifyEmailAndActivate({
      verificationToken: fixture.rawVerificationToken
    });

    const activeAccount = await service.assertOrganizerActive(fixture.accountId);
    expect(activeAccount.status).toBe('ACTIVE');
    expect(activeAccount.id).toBe(fixture.accountId);
  });

  it('Criterio: Rechazar verificación no utilizable cuando el token es inválido o no existe', async () => {
    const { db, service } = setup();
    seedFixture(db);

    await expect(
      service.verifyEmailAndActivate({
        verificationToken: 'non-existent-token-12345'
      })
    ).rejects.toMatchObject({
      code: 'INVALID_OR_UNUSABLE_TOKEN'
    });
  });

  it('Criterio: Rechazar verificación no utilizable cuando el token está expirado o ya consumido', async () => {
    const { db, service } = setup();
    // Token expirado
    const expiredFixture = seedFixture(db, {
      tokenHoursLeft: -2
    });

    await expect(
      service.verifyEmailAndActivate({
        verificationToken: expiredFixture.rawVerificationToken
      })
    ).rejects.toMatchObject({
      code: 'INVALID_OR_UNUSABLE_TOKEN'
    });

    // Token consumido
    const consumedFixture = seedFixture(db, {
      tokenStatus: 'CONSUMED'
    });

    await expect(
      service.verifyEmailAndActivate({
        verificationToken: consumedFixture.rawVerificationToken
      })
    ).rejects.toMatchObject({
      code: 'INVALID_OR_UNUSABLE_TOKEN'
    });
  });

  it('Criterio: Rechazar verificación cuando la invitación no es utilizable (expirada de 7 días o revocada)', async () => {
    const { db, service } = setup();
    // Invitación expirada (más de 7 días)
    const expiredInvite = seedFixture(db, {
      invitationDaysLeft: -1
    });

    await expect(
      service.verifyEmailAndActivate({
        verificationToken: expiredInvite.rawVerificationToken
      })
    ).rejects.toMatchObject({
      code: 'INVITATION_NOT_USABLE'
    });

    // La cuenta debe conservarse PENDING_VERIFICATION
    expect(db.accounts.get(expiredInvite.accountId).status).toBe('PENDING_VERIFICATION');

    // Invitación revocada
    const revokedInvite = seedFixture(db, {
      invitationStatus: 'REVOKED'
    });

    await expect(
      service.verifyEmailAndActivate({
        verificationToken: revokedInvite.rawVerificationToken
      })
    ).rejects.toMatchObject({
      code: 'INVITATION_NOT_USABLE'
    });

    expect(db.accounts.get(revokedInvite.accountId).status).toBe('PENDING_VERIFICATION');
  });

  it('Idempotencia: activación repetida de una cuenta ya activa devuelve ALREADY_ACTIVE', async () => {
    const { db, service } = setup();
    const fixture = seedFixture(db, {
      accountStatus: 'ACTIVE',
      tokenStatus: 'CONSUMED',
      invitationStatus: 'CONSUMED'
    });

    const res = await service.verifyEmailAndActivate({
      verificationToken: fixture.rawVerificationToken
    });

    expect(res.outcome).toBe('ALREADY_ACTIVE');
    expect(res.status).toBe('ACTIVE');
    expect(res.accountId).toBe(fixture.accountId);
  });
});
