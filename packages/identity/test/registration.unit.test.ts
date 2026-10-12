import { describe, expect, it, vi } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  AuditSink,
  EmailVerificationNotificationPort,
  RegistrationError,
  computeCredentialDigest
} from '../src/contracts.js';
import { OrganizerRegistrationService } from '../src/registration.js';
import { PasswordVerifier } from '../src/password-verifier.js';

interface InMemoryDb {
  invitations: Map<string, any>;
  accounts: Map<string, any>;
  credentials: Map<string, any>;
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

          // SELECT ... FROM beta_invitation WHERE token_digest = $1 FOR UPDATE
          if (normalizedSql.includes('FROM beta_invitation') && normalizedSql.includes('token_digest = $1')) {
            const tokenDigest = params[0] as string;
            const invitation = [...db.invitations.values()].find(i => i.token_digest === tokenDigest);
            return (invitation ? [{ ...invitation }] : []) as unknown as R[];
          }

          // SELECT ... FROM organizer_account WHERE email_normalized = $1 FOR UPDATE
          if (normalizedSql.includes('FROM organizer_account') && normalizedSql.includes('email_normalized = $1')) {
            const emailNormalized = params[0] as string;
            const account = [...db.accounts.values()].find(a => a.email_normalized === emailNormalized);
            return (account ? [{ ...account }] : []) as unknown as R[];
          }

          // INSERT INTO organizer_account
          if (normalizedSql.includes('INSERT INTO organizer_account')) {
            const [id, email, email_normalized, status, declared_adult, declared_adult_at, invitation_id, created_at, updated_at] = params;
            const now = new Date();
            const record = {
              id,
              email,
              email_normalized,
              status,
              declared_adult,
              declared_adult_at,
              invitation_id,
              created_at: created_at ?? now,
              updated_at: updated_at ?? now
            };
            db.accounts.set(id as string, record);
            return [record] as unknown as R[];
          }

          // INSERT INTO organizer_credential
          if (normalizedSql.includes('INSERT INTO organizer_credential')) {
            const [id, account_id, purpose, secret_digest, revision, status, created_at, updated_at] = params;
            const now = new Date();
            const record = {
              id,
              account_id,
              purpose,
              secret_digest,
              revision,
              status,
              created_at: created_at ?? now,
              updated_at: updated_at ?? now
            };
            db.credentials.set(id as string, record);
            return [record] as unknown as R[];
          }

          // INSERT INTO email_verification_intent
          if (normalizedSql.includes('INSERT INTO email_verification_intent')) {
            const [id, account_id, email_normalized, token_digest, status, created_at, expires_at] = params;
            const now = new Date();
            const record = {
              id,
              account_id,
              email_normalized,
              token_digest,
              status,
              created_at: created_at ?? now,
              expires_at,
              consumed_at: null
            };
            db.verificationIntents.set(id as string, record);
            return [record] as unknown as R[];
          }

          // INSERT INTO admin_audit_event
          if (normalizedSql.includes('INSERT INTO admin_audit_event')) {
            const [id, procedure, actor_id, target_identifier, target_principal_id, result, details] = params;
            const record = {
              id,
              procedure,
              actor_id,
              target_identifier,
              target_principal_id,
              result,
              details,
              timestamp: new Date()
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

describe('EL-TK-010: OrganizerRegistrationService (Unit Tests)', () => {
  const adminId = randomUUID();

  function seedInvitation(
    db: InMemoryDb,
    email: string,
    token: string,
    status: 'PENDING' | 'ACCEPTED' | 'REVOKED' = 'PENDING',
    expiresInDays = 7
  ) {
    const id = randomUUID();
    const tokenDigest = createHash('sha256').update(token).digest('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);
    const invitation = {
      id,
      email,
      email_normalized: email.trim().toLowerCase(),
      token_digest: tokenDigest,
      status,
      issued_by: adminId,
      created_at: now,
      expires_at: expiresAt,
      consumed_at: status === 'ACCEPTED' ? now : null,
      revoked_at: status === 'REVOKED' ? now : null,
      revision: 1n
    };
    db.invitations.set(id, invitation);
    return { invitation, token };
  }

  function setup() {
    const db: InMemoryDb = {
      invitations: new Map(),
      accounts: new Map(),
      credentials: new Map(),
      verificationIntents: new Map(),
      auditEvents: []
    };
    const runner = createInMemoryRunner(db);
    const auditSink: AuditSink = {
      record: vi.fn(async event => {
        db.auditEvents.push(event);
      })
    };
    const notificationPort: EmailVerificationNotificationPort = {
      sendVerificationEmail: vi.fn(async () => {})
    };
    const service = new OrganizerRegistrationService(runner, auditSink, notificationPort);
    return { db, runner, auditSink, notificationPort, service };
  }

  it('Escenario 1: registra organizador con invitacion utilizable y declaracion de adultez, dejando cuenta PENDING_VERIFICATION', async () => {
    const { db, service, notificationPort, auditSink } = setup();
    const email = 'organizer.valid@eventlens.test';
    const rawToken = randomBytes(32).toString('hex');
    const { invitation } = seedInvitation(db, email, rawToken, 'PENDING', 7);

    const result = await service.registerOrganizer({
      invitationToken: rawToken,
      email: ' Organizer.Valid@eventlens.test ',
      password: 'StrongPassword123!',
      declaredAdult: true
    });

    expect(result.outcome).toBe('REGISTERED_PENDING');
    expect(result.verificationIssued).toBe(true);
    expect(result.invitationId).toBe(invitation.id);
    expect(result.account.emailNormalized).toBe('organizer.valid@eventlens.test');
    expect(result.account.status).toBe('PENDING_VERIFICATION');
    expect(result.account.declaredAdult).toBe(true);
    expect(result.account.declaredAdultAt).toBeDefined();

    // Verificamos que se guardó en la base de datos
    expect(db.accounts.size).toBe(1);
    const savedAccount = [...db.accounts.values()][0];
    expect(savedAccount.status).toBe('PENDING_VERIFICATION');

    // Verificamos credencial con envelope Argon2id seguro (DEC-108 / EL-TK-185)
    expect(db.credentials.size).toBe(1);
    const savedCredential = [...db.credentials.values()][0];
    expect(savedCredential.purpose).toBe('ORGANIZER_AUTHENTICATION');
    expect(savedCredential.secret_digest.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
    const verifier = new PasswordVerifier();
    const matches = await verifier.verifyPassword(savedCredential.secret_digest, 'StrongPassword123!');
    expect(matches).toBe(true);

    // Verificamos token de verificación en base de datos
    expect(db.verificationIntents.size).toBe(1);
    const savedIntent = [...db.verificationIntents.values()][0];
    expect(savedIntent.status).toBe('PENDING');
    expect(savedIntent.expires_at.getTime()).toBeGreaterThan(Date.now());

    // Verificamos que se despachó la notificación mediante el puerto
    expect(notificationPort.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(notificationPort.sendVerificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'organizer.valid@eventlens.test',
        token: expect.any(String),
        expiresAt: expect.any(Date)
      })
    );

    // Verificamos auditoría sin secretos
    expect(auditSink.record).toHaveBeenCalled();
    const auditRecordCall = (auditSink.record as any).mock.calls[0][0];
    expect(auditRecordCall.procedure).toBe('ORGANIZER_REGISTRATION');
    expect(auditRecordCall.result).toBe('SUCCESS');
    expect(JSON.stringify(auditRecordCall)).not.toContain('StrongPassword123!');
    expect(JSON.stringify(auditRecordCall)).not.toContain(rawToken);
  });

  it('Escenario 2: rechaza registro sin declaracion de adultez sin crear cuenta', async () => {
    const { db, service, notificationPort } = setup();
    const email = 'minor@eventlens.test';
    const rawToken = randomBytes(32).toString('hex');
    seedInvitation(db, email, rawToken, 'PENDING', 7);

    await expect(
      service.registerOrganizer({
        invitationToken: rawToken,
        email,
        password: 'StrongPassword123!',
        declaredAdult: false
      })
    ).rejects.toThrowError(RegistrationError);

    await expect(
      service.registerOrganizer({
        invitationToken: rawToken,
        email,
        password: 'StrongPassword123!',
        declaredAdult: false
      })
    ).rejects.toMatchObject({ code: 'ADULT_DECLARATION_REQUIRED' });

    expect(db.accounts.size).toBe(0);
    expect(db.credentials.size).toBe(0);
    expect(notificationPort.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('Escenario 2: rechaza intento de elevacion publica (role: admin, is_admin: true)', async () => {
    const { db, service } = setup();
    const email = 'intruder@eventlens.test';
    const rawToken = randomBytes(32).toString('hex');
    seedInvitation(db, email, rawToken, 'PENDING', 7);

    await expect(
      service.registerOrganizer({
        invitationToken: rawToken,
        email,
        password: 'StrongPassword123!',
        declaredAdult: true,
        metadata: { role: 'admin' }
      })
    ).rejects.toMatchObject({ code: 'PUBLIC_ELEVATION_DENIED' });

    expect(db.accounts.size).toBe(0);
  });

  it('Escenario 2: rechaza si el correo no coincide con la invitacion', async () => {
    const { db, service } = setup();
    const email = 'owner@eventlens.test';
    const rawToken = randomBytes(32).toString('hex');
    seedInvitation(db, email, rawToken, 'PENDING', 7);

    await expect(
      service.registerOrganizer({
        invitationToken: rawToken,
        email: 'other@eventlens.test',
        password: 'StrongPassword123!',
        declaredAdult: true
      })
    ).rejects.toMatchObject({ code: 'INVALID_OR_UNUSABLE_INVITATION' });

    expect(db.accounts.size).toBe(0);
  });

  it('Escenario 2: rechaza invitacion inexistente, revocada o expirada', async () => {
    const { db, service } = setup();
    const email = 'expired@eventlens.test';
    const rawToken = randomBytes(32).toString('hex');
    seedInvitation(db, email, rawToken, 'PENDING', -1); // expirada hace 1 día

    await expect(
      service.registerOrganizer({
        invitationToken: rawToken,
        email,
        password: 'StrongPassword123!',
        declaredAdult: true
      })
    ).rejects.toMatchObject({ code: 'INVALID_OR_UNUSABLE_INVITATION' });

    // Revocada
    const revokedToken = randomBytes(32).toString('hex');
    seedInvitation(db, 'revoked@eventlens.test', revokedToken, 'REVOKED', 7);

    await expect(
      service.registerOrganizer({
        invitationToken: revokedToken,
        email: 'revoked@eventlens.test',
        password: 'StrongPassword123!',
        declaredAdult: true
      })
    ).rejects.toMatchObject({ code: 'INVALID_OR_UNUSABLE_INVITATION' });

    expect(db.accounts.size).toBe(0);
  });

  it('Escenario 2: rechaza contraseñas debiles o correos mal formateados', async () => {
    const { db, service } = setup();
    const email = 'valid@eventlens.test';
    const rawToken = randomBytes(32).toString('hex');
    seedInvitation(db, email, rawToken, 'PENDING', 7);

    await expect(
      service.registerOrganizer({
        invitationToken: rawToken,
        email: 'not-an-email',
        password: 'StrongPassword123!',
        declaredAdult: true
      })
    ).rejects.toMatchObject({ code: 'INVALID_EMAIL' });

    await expect(
      service.registerOrganizer({
        invitationToken: rawToken,
        email,
        password: 'short',
        declaredAdult: true
      })
    ).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });

    expect(db.accounts.size).toBe(0);
  });

  it('Escenario 3: ante repeticion de registro con cuenta pendiente, devuelve la existente sin duplicar ni reenviar verificacion', async () => {
    const { db, service, notificationPort } = setup();
    const email = 'repeat@eventlens.test';
    const rawToken = randomBytes(32).toString('hex');
    const { invitation } = seedInvitation(db, email, rawToken, 'PENDING', 7);

    // Primer registro
    const firstResult = await service.registerOrganizer({
      invitationToken: rawToken,
      email,
      password: 'FirstPassword123!',
      declaredAdult: true
    });
    expect(firstResult.outcome).toBe('REGISTERED_PENDING');
    expect(firstResult.verificationIssued).toBe(true);
    expect(notificationPort.sendVerificationEmail).toHaveBeenCalledTimes(1);

    const initialAccount = [...db.accounts.values()][0];
    const initialCredential = [...db.credentials.values()][0];

    // Segundo registro repetido con la misma invitacion y correo
    const secondResult = await service.registerOrganizer({
      invitationToken: rawToken,
      email,
      password: 'SecondPassword456!',
      declaredAdult: true
    });

    expect(secondResult.outcome).toBe('ALREADY_REGISTERED_PENDING');
    expect(secondResult.verificationIssued).toBe(false);
    expect(secondResult.account.id).toBe(initialAccount.id);
    expect(secondResult.invitationId).toBe(invitation.id);

    // NO se creó otra cuenta
    expect(db.accounts.size).toBe(1);
    // NO se sustituyeron las credenciales (se conserva el secret_digest original)
    expect(db.credentials.size).toBe(1);
    expect([...db.credentials.values()][0].secret_digest).toBe(initialCredential.secret_digest);
    // NO se reenvió automáticamente la verificación
    expect(notificationPort.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });
});
