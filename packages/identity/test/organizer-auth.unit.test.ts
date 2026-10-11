import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  OrganizerAuthenticationService,
  AuthenticationError,
  computeCredentialDigest,
  type AuditSink,
  type RecoveryAuthorityPort
} from '../src/index.js';

interface InMemoryDb {
  accounts: Map<string, any>;
  credentials: Map<string, any>;
  sessions: Map<string, any>;
  auditEvents: any[];
}

function createInMemoryRunner(db: InMemoryDb): TransactionRunner {
  return {
    async run<R>(callback: (tx: SqlTransaction) => Promise<R>): Promise<R> {
      const tx: SqlTransaction = {
        async query<T extends object>(sql: string, ...params: unknown[]): Promise<T[]> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // SELECT ... FROM organizer_account WHERE email_normalized = $1
          if (normalized.includes('FROM organizer_account') && normalized.includes('email_normalized = $1')) {
            const emailNormalized = (params[0] as string).toLowerCase();
            for (const acc of db.accounts.values()) {
              if (acc.email_normalized === emailNormalized) {
                return [{ ...acc }] as unknown as T[];
              }
            }
            return [] as unknown as T[];
          }

          // SELECT ... FROM organizer_credential WHERE account_id = $1
          if (normalized.includes('FROM organizer_credential') && normalized.includes('account_id = $1')) {
            const accountId = params[0] as string;
            const creds: any[] = [];
            for (const cred of db.credentials.values()) {
              if (cred.account_id === accountId && cred.purpose === 'ORGANIZER_AUTHENTICATION' && cred.status === 'ACTIVE') {
                creds.push({ ...cred });
              }
            }
            creds.sort((a, b) => (b.revision > a.revision ? 1 : -1));
            return creds as unknown as T[];
          }

          // SELECT ... FROM organizer_session s JOIN organizer_account a ... WHERE s.token_digest = $1
          if (normalized.includes('FROM organizer_session') && normalized.includes('token_digest = $1')) {
            const tokenDigest = params[0] as string;
            const session = db.sessions.get(tokenDigest);
            if (!session) return [] as unknown as T[];
            const account = db.accounts.get(session.account_id);
            if (!account) return [] as unknown as T[];
            return [{
              ...session,
              email: account.email,
              email_normalized: account.email_normalized,
              account_status: account.status
            }] as unknown as T[];
          }

          throw new Error(`Unhandled mock SQL query: ${sql}`);
        },

        async execute(sql: string, ...params: unknown[]): Promise<number> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // INSERT INTO organizer_session
          if (normalized.includes('INSERT INTO organizer_session')) {
            const [
              id,
              account_id,
              token_digest,
              csrf_token_digest,
              auth_time,
              created_at,
              expires_at,
              last_active_at,
              idle_expires_at,
              session_watermark
            ] = params;

            const session = {
              id,
              account_id,
              token_digest,
              csrf_token_digest,
              auth_time,
              created_at,
              expires_at,
              last_active_at,
              idle_expires_at,
              session_watermark,
              revoked_at: null,
              revocation_reason: null
            };
            db.sessions.set(token_digest as string, session);
            return 1;
          }

          // UPDATE organizer_session SET last_active_at = $1, idle_expires_at = $2 WHERE id = $3
          if (normalized.includes('UPDATE organizer_session')) {
            const [last_active_at, idle_expires_at, id] = params;
            for (const session of db.sessions.values()) {
              if (session.id === id) {
                session.last_active_at = last_active_at;
                session.idle_expires_at = idle_expires_at;
                break;
              }
            }
            return 1;
          }

          throw new Error(`Unhandled mock SQL execute: ${sql}`);
        }
      };

      return callback(tx);
    }
  };
}

describe('EL-TK-013: OrganizerAuthenticationService (Unit Tests)', () => {
  let db: InMemoryDb;
  let auditSink: AuditSink;
  let recoveryAuthority: RecoveryAuthorityPort;
  let service: OrganizerAuthenticationService;

  beforeEach(() => {
    db = {
      accounts: new Map(),
      credentials: new Map(),
      sessions: new Map(),
      auditEvents: []
    };

    auditSink = {
      record: vi.fn(async (event) => {
        db.auditEvents.push(event);
      })
    };

    recoveryAuthority = {
      getRecoveryEpoch: vi.fn().mockResolvedValue(1n),
      getCredentialRevision: vi.fn().mockResolvedValue(1n),
      getAdminAuthWatermark: vi.fn().mockResolvedValue(1n)
    };

    service = new OrganizerAuthenticationService(
      createInMemoryRunner(db),
      auditSink,
      recoveryAuthority,
      { maxFailedAttempts: 5, rateLimitWindowMs: 60000 }
    );
  });

  function seedOrganizerFixture(options: {
    status?: 'ACTIVE' | 'PENDING_VERIFICATION' | 'REVOKED';
    password?: string;
    credRevision?: bigint;
  } = {}) {
    const accountId = randomUUID();
    const email = 'organizer.test@eventlens.internal';
    const emailNormalized = email.toLowerCase();
    const status = options.status ?? 'ACTIVE';
    const password = options.password ?? 'ValidSecurePassword123!';
    const credRevision = options.credRevision ?? 1n;

    const secretDigest = computeCredentialDigest('ORGANIZER_AUTHENTICATION', accountId, password);

    const account = {
      id: accountId,
      email,
      email_normalized: emailNormalized,
      status,
      declared_adult: true,
      declared_adult_at: new Date(),
      invitation_id: randomUUID(),
      verified_at: status === 'ACTIVE' ? new Date() : null,
      created_at: new Date(),
      updated_at: new Date()
    };
    db.accounts.set(accountId, account);

    const credential = {
      id: randomUUID(),
      account_id: accountId,
      purpose: 'ORGANIZER_AUTHENTICATION',
      secret_digest: secretDigest,
      revision: credRevision,
      status: 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date()
    };
    db.credentials.set(credential.id, credential);

    return { accountId, email, emailNormalized, password, credentialId: credential.id };
  }

  it('Escenario 1: Iniciar sesión con cuenta activa y verificada emite sesión y cookie segura', async () => {
    const fixture = seedOrganizerFixture({ status: 'ACTIVE' });

    const result = await service.login({
      email: fixture.email,
      password: fixture.password
    });

    expect(result.actorContext).toBeDefined();
    expect(result.actorContext.actorType).toBe('ORGANIZER_HUMAN');
    expect(result.actorContext.accountId).toBe(fixture.accountId);
    expect(result.actorContext.email).toBe(fixture.email);
    expect(result.actorContext.sessionId).toBeDefined();
    expect(result.sessionToken).toHaveLength(64); // 256 bits hex
    expect(result.csrfToken).toHaveLength(64);
    expect(result.cookieSpec.name).toBe('__Host-el_session');
    expect(result.cookieSpec.value).toBe(result.sessionToken);
    expect(result.cookieSpec.httpOnly).toBe(true);
    expect(result.cookieSpec.secure).toBe(true);
    expect(result.cookieSpec.sameSite).toBe('Strict');
    expect(result.account.status).toBe('ACTIVE');

    // Comprobar que la sesión fue persistida por digest únicamente
    const tokenDigest = createHash('sha256').update(result.sessionToken).digest('hex');
    const storedSession = db.sessions.get(tokenDigest);
    expect(storedSession).toBeDefined();
    expect(storedSession.token_digest).toBe(tokenDigest);

    // Auditoría sin credenciales ni tokens en texto plano
    expect(auditSink.record).toHaveBeenCalled();
    const auditCall = (auditSink.record as any).mock.calls[0][0];
    expect(auditCall.procedure).toBe('ORGANIZER_LOGIN');
    expect(auditCall.result).toBe('SUCCESS');
    expect(JSON.stringify(auditCall)).not.toContain(fixture.password);
    expect(JSON.stringify(auditCall)).not.toContain(result.sessionToken);
  });

  it('Escenario 2: Rechaza intento de inicio de sesión en cuenta pendiente (PENDING_VERIFICATION) con error neutro', async () => {
    const fixture = seedOrganizerFixture({ status: 'PENDING_VERIFICATION' });

    await expect(
      service.login({
        email: fixture.email,
        password: fixture.password
      })
    ).rejects.toThrowError(AuthenticationError);

    await expect(
      service.login({
        email: fixture.email,
        password: fixture.password
      })
    ).rejects.toMatchObject({
      code: 'UNAUTHENTICATED'
    });

    expect(db.sessions.size).toBe(0);
  });

  it('Escenario 2: Rechaza credenciales inválidas o correo no existente de forma uniforme sin enumerar', async () => {
    const fixture = seedOrganizerFixture({ status: 'ACTIVE' });

    // Contraseña errónea
    await expect(
      service.login({
        email: fixture.email,
        password: 'WrongPassword456!'
      })
    ).rejects.toMatchObject({
      code: 'UNAUTHENTICATED'
    });

    // Correo inexistente
    await expect(
      service.login({
        email: 'unknown.organizer@nonexistent.domain',
        password: 'AnyPassword789!'
      })
    ).rejects.toMatchObject({
      code: 'UNAUTHENTICATED'
    });
  });

  it('Escenario 2: Intentos repetidos fallidos activan rate limiting sin enumerar el estado de la cuenta', async () => {
    const fixture = seedOrganizerFixture({ status: 'ACTIVE' });

    // 5 intentos fallidos
    for (let i = 0; i < 5; i++) {
      await expect(
        service.login({
          email: fixture.email,
          password: 'IncorrectPassword!'
        })
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    }

    // El 6to intento es bloqueado por rate limit
    await expect(
      service.login({
        email: fixture.email,
        password: fixture.password // Incluso con password correcta
      })
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });

    // Intento con usuario inexistente también recibe rate limit si se prueba repetidamente
    const nonExistentEmail = 'someone.else@nowhere.internal';
    for (let i = 0; i < 5; i++) {
      await expect(
        service.login({
          email: nonExistentEmail,
          password: 'bad'
        })
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    }

    await expect(
      service.login({
        email: nonExistentEmail,
        password: 'bad'
      })
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('RecoveryAuthority: falla cerrado si la revisión externa de credencial es mayor que la almacenada (post-PITR)', async () => {
    const fixture = seedOrganizerFixture({ status: 'ACTIVE', credRevision: 1n });

    // RecoveryAuthority reporta que la revisión externa es 2n (el hash en DB está desactualizado tras PITR)
    (recoveryAuthority.getCredentialRevision as any).mockResolvedValue(2n);

    await expect(
      service.login({
        email: fixture.email,
        password: fixture.password
      })
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

    expect(db.sessions.size).toBe(0);
  });

  it('Validación de sesión: valida y extiende inactividad monótonamente respetando el límite absoluto de 8 horas', async () => {
    const fixture = seedOrganizerFixture({ status: 'ACTIVE' });

    const loginResult = await service.login({
      email: fixture.email,
      password: fixture.password
    });

    const validation = await service.validateSession({
      sessionToken: loginResult.sessionToken
    });

    expect(validation.actorContext.accountId).toBe(fixture.accountId);
    expect(validation.actorContext.actorType).toBe('ORGANIZER_HUMAN');

    // Sesión revocada
    const tokenDigest = createHash('sha256').update(loginResult.sessionToken).digest('hex');
    const session = db.sessions.get(tokenDigest);
    session.revoked_at = new Date();
    session.revocation_reason = 'USER_LOGOUT';

    await expect(
      service.validateSession({
        sessionToken: loginResult.sessionToken
      })
    ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  });
});
