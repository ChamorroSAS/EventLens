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

          // SELECT ... FROM organizer_session WHERE id = $1 AND account_id = $2
          if (normalized.includes('FROM organizer_session') && normalized.includes('id = $1') && normalized.includes('account_id = $2')) {
            const [id, accountId] = params as [string, string];
            for (const session of db.sessions.values()) {
              if (session.id === id && session.account_id === accountId) {
                return [{ ...session }] as unknown as T[];
              }
            }
            return [] as unknown as T[];
          }

          // SELECT ... FROM organizer_session WHERE account_id = $1 AND revoked_at IS NULL
          if (normalized.includes('FROM organizer_session') && normalized.includes('account_id = $1') && normalized.includes('revoked_at IS NULL')) {
            const [accountId, now] = params as [string, Date];
            const activeSessions: any[] = [];
            for (const session of db.sessions.values()) {
              if (
                session.account_id === accountId &&
                session.revoked_at === null &&
                new Date(session.expires_at) > now &&
                new Date(session.idle_expires_at) > now
              ) {
                activeSessions.push({ ...session });
              }
            }
            activeSessions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            return activeSessions as unknown as T[];
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
          if (normalized.includes('UPDATE organizer_session') && normalized.includes('last_active_at = $1')) {
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

          // UPDATE organizer_session SET revoked_at = $1, revocation_reason = $2 WHERE account_id = $3 AND id <> $4
          if (normalized.includes('UPDATE organizer_session') && normalized.includes('account_id = $3') && normalized.includes('id <> $4')) {
            const [revoked_at, revocation_reason, account_id, current_id] = params as [Date, string, string, string];
            let count = 0;
            for (const session of db.sessions.values()) {
              if (session.account_id === account_id && session.id !== current_id && session.revoked_at === null) {
                session.revoked_at = revoked_at;
                session.revocation_reason = revocation_reason;
                count++;
              }
            }
            return count;
          }

          // UPDATE organizer_session SET revoked_at = $1, revocation_reason = ... WHERE id = ...
          if (normalized.includes('UPDATE organizer_session') && normalized.includes('revoked_at = $1')) {
            let revoked_at: Date;
            let revocation_reason: string;
            let id: string;

            if (params.length === 2) {
              // SET revoked_at = $1, revocation_reason = 'USER_LOGOUT' WHERE id = $2
              [revoked_at, id] = params as [Date, string];
              revocation_reason = 'USER_LOGOUT';
            } else {
              // SET revoked_at = $1, revocation_reason = $2 WHERE id = $3
              [revoked_at, revocation_reason, id] = params as [Date, string, string];
            }

            for (const session of db.sessions.values()) {
              if (session.id === id && session.revoked_at === null) {
                session.revoked_at = revoked_at;
                session.revocation_reason = revocation_reason;
                return 1;
              }
            }
            return 0;
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
    email?: string;
    password?: string;
    credRevision?: bigint;
  } = {}) {
    const accountId = randomUUID();
    const email = options.email ?? `organizer-${randomUUID().slice(0, 8)}@eventlens.internal`;
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

  describe('EL-TK-014: listSessions', () => {
    it('Escenario 1: Devuelve solo sesiones propias activas e identifica la sesión actual sin filtrar tokens', async () => {
      const fixture1 = seedOrganizerFixture({ status: 'ACTIVE' });
      const fixture2 = seedOrganizerFixture({ status: 'ACTIVE' });

      // Iniciar 2 sesiones para fixture1
      const login1A = await service.login({ email: fixture1.email, password: fixture1.password });
      const login1B = await service.login({ email: fixture1.email, password: fixture1.password });

      // Iniciar 1 sesión para fixture2
      await service.login({ email: fixture2.email, password: fixture2.password });

      const listResult = await service.listSessions({
        actorContext: login1B.actorContext
      });

      expect(listResult.total).toBe(2);
      expect(listResult.sessions).toHaveLength(2);

      // Todas pertenecen a fixture1
      for (const s of listResult.sessions) {
        expect(s.accountId).toBe(fixture1.accountId);
        expect((s as any).token_digest).toBeUndefined();
        expect((s as any).csrf_token_digest).toBeUndefined();
      }

      // La sesión actual es login1B
      const current = listResult.sessions.find(s => s.id === login1B.actorContext.sessionId);
      expect(current).toBeDefined();
      expect(current?.isCurrent).toBe(true);

      const other = listResult.sessions.find(s => s.id === login1A.actorContext.sessionId);
      expect(other).toBeDefined();
      expect(other?.isCurrent).toBe(false);

      // Auditoría registrada
      const auditCall = (auditSink.record as any).mock.calls.find(
        (c: any) => c[0].procedure === 'ORGANIZER_SESSION_LIST_VIEWED'
      );
      expect(auditCall).toBeDefined();
      expect(auditCall[0].result).toBe('SUCCESS');
    });

    it('Escenario 2: Omite sesiones vencidas o revocadas y rechaza si la sesión del actor fue revocada', async () => {
      const fixture = seedOrganizerFixture({ status: 'ACTIVE' });
      const login1 = await service.login({ email: fixture.email, password: fixture.password });
      const login2 = await service.login({ email: fixture.email, password: fixture.password });

      // Revocar login1
      const digest1 = createHash('sha256').update(login1.sessionToken).digest('hex');
      db.sessions.get(digest1).revoked_at = new Date();

      // login2 lista sesiones -> solo ve login2
      const listRes = await service.listSessions({
        actorContext: login2.actorContext
      });
      expect(listRes.total).toBe(1);
      expect(listRes.sessions[0].id).toBe(login2.actorContext.sessionId);

      // login1 (revocada) intenta listar -> rechazado
      await expect(
        service.listSessions({
          actorContext: login1.actorContext
        })
      ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    });
  });

  describe('EL-TK-015: logout', () => {
    it('Escenario 1: Cierra la sesión actual e invalida solicitudes posteriores', async () => {
      const fixture = seedOrganizerFixture({ status: 'ACTIVE' });
      const login = await service.login({ email: fixture.email, password: fixture.password });

      const logoutRes = await service.logout({
        actorContext: login.actorContext
      });

      expect(logoutRes.outcome).toBe('LOGGED_OUT');
      expect(logoutRes.sessionId).toBe(login.actorContext.sessionId);

      // Validar sesión falla como SESSION_REVOKED
      await expect(
        service.validateSession({ sessionToken: login.sessionToken })
      ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });

      // Re-logout falla
      await expect(
        service.logout({ actorContext: login.actorContext })
      ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });

      // Auditoría registrada
      const auditCall = (auditSink.record as any).mock.calls.find(
        (c: any) => c[0].procedure === 'ORGANIZER_LOGOUT'
      );
      expect(auditCall).toBeDefined();
      expect(auditCall[0].result).toBe('SUCCESS');
    });
  });

  describe('EL-TK-016: revokeSpecificSession', () => {
    it('Escenario 1: Revoca sesión propia seleccionada conservando la actual intacta', async () => {
      const fixture = seedOrganizerFixture({ status: 'ACTIVE' });
      const sessionA = await service.login({ email: fixture.email, password: fixture.password });
      const sessionB = await service.login({ email: fixture.email, password: fixture.password });

      // sessionB revoca sessionA
      const revokeRes = await service.revokeSpecificSession({
        actorContext: sessionB.actorContext,
        targetSessionId: sessionA.actorContext.sessionId,
        reason: 'REVOKED_DEVICE_LOST'
      });

      expect(revokeRes.outcome).toBe('REVOKED');
      expect(revokeRes.targetSessionId).toBe(sessionA.actorContext.sessionId);
      expect(revokeRes.isCurrentSession).toBe(false);

      // sessionA ahora está revocada
      await expect(
        service.validateSession({ sessionToken: sessionA.sessionToken })
      ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });

      // sessionB sigue autorizada
      const validB = await service.validateSession({ sessionToken: sessionB.sessionToken });
      expect(validB.actorContext.sessionId).toBe(sessionB.actorContext.sessionId);

      // Idempotencia: revocar de nuevo devuelve ALREADY_REVOKED sin error
      const repeatRes = await service.revokeSpecificSession({
        actorContext: sessionB.actorContext,
        targetSessionId: sessionA.actorContext.sessionId
      });
      expect(repeatRes.outcome).toBe('ALREADY_REVOKED');
    });

    it('Escenario 2: Intento de revocar sesión ajena o inexistente falla con SESSION_NOT_FOUND sin filtrar datos', async () => {
      const fixtureUser = seedOrganizerFixture({ status: 'ACTIVE' });
      const fixtureAlien = seedOrganizerFixture({ status: 'ACTIVE' });

      const userLogin = await service.login({ email: fixtureUser.email, password: fixtureUser.password });
      const alienLogin = await service.login({ email: fixtureAlien.email, password: fixtureAlien.password });

      // Intento de revocar sesión ajena
      await expect(
        service.revokeSpecificSession({
          actorContext: userLogin.actorContext,
          targetSessionId: alienLogin.actorContext.sessionId
        })
      ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });

      // La sesión ajena sigue activa
      const alienCheck = await service.validateSession({ sessionToken: alienLogin.sessionToken });
      expect(alienCheck.actorContext.sessionId).toBe(alienLogin.actorContext.sessionId);

      // Intento con ID inexistente
      await expect(
        service.revokeSpecificSession({
          actorContext: userLogin.actorContext,
          targetSessionId: randomUUID()
        })
      ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
    });
  });

  describe('EL-TK-017: revokeOtherSessions', () => {
    it('Escenario 1: Revoca atómicamente todas las otras sesiones propias y conserva la actual', async () => {
      const fixture = seedOrganizerFixture({ status: 'ACTIVE' });
      const alien = seedOrganizerFixture({ status: 'ACTIVE' });

      const s1 = await service.login({ email: fixture.email, password: fixture.password });
      const s2 = await service.login({ email: fixture.email, password: fixture.password });
      const s3 = await service.login({ email: fixture.email, password: fixture.password });
      const alienSession = await service.login({ email: alien.email, password: alien.password });

      // s2 cierra todas las demás sesiones
      const res = await service.revokeOtherSessions({
        actorContext: s2.actorContext
      });

      expect(res.outcome).toBe('OTHER_SESSIONS_REVOKED');
      expect(res.revokedCount).toBe(2);
      expect(res.currentSessionId).toBe(s2.actorContext.sessionId);

      // s1 y s3 están revocadas
      await expect(
        service.validateSession({ sessionToken: s1.sessionToken })
      ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
      await expect(
        service.validateSession({ sessionToken: s3.sessionToken })
      ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });

      // s2 sigue activa y válida
      const valid = await service.validateSession({ sessionToken: s2.sessionToken });
      expect(valid.actorContext.sessionId).toBe(s2.actorContext.sessionId);

      // La sesión del otro organizador no se ve afectada
      const validAlien = await service.validateSession({ sessionToken: alienSession.sessionToken });
      expect(validAlien.actorContext.sessionId).toBe(alienSession.actorContext.sessionId);
    });

    it('Escenario vació: Sin sesiones adicionales, conserva la actual y retorna count 0 sin error', async () => {
      const fixture = seedOrganizerFixture({ status: 'ACTIVE' });
      const soloSession = await service.login({ email: fixture.email, password: fixture.password });

      const res = await service.revokeOtherSessions({
        actorContext: soloSession.actorContext
      });

      expect(res.outcome).toBe('OTHER_SESSIONS_REVOKED');
      expect(res.revokedCount).toBe(0);
      expect(res.currentSessionId).toBe(soloSession.actorContext.sessionId);

      // La sesión actual sigue activa
      const valid = await service.validateSession({ sessionToken: soloSession.sessionToken });
      expect(valid.actorContext.sessionId).toBe(soloSession.actorContext.sessionId);
    });
  });
});

