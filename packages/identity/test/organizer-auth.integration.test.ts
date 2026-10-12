import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  OrganizerAuthenticationService,
  AuthenticationError,
  computeCredentialDigest,
  type RecoveryAuthorityPort,
  type AuditSink,
  type AuditEventRecord
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('OrganizerAuthenticationService (Real PostgreSQL Integration Tests — EL-TK-013)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  async function query<T extends object>(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.query<T>(statement, ...args));
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

      ALTER TABLE organizer_account ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

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
    try {
      await sql('DELETE FROM password_reset_intent');
    } catch {}
    await sql('DELETE FROM organizer_session');
    await sql('DELETE FROM organizer_credential');
    await sql('DELETE FROM organizer_account');
    await sql('DELETE FROM beta_invitation');
    await sql('DELETE FROM admin_audit_event');
  });

  async function seedActiveOrganizer(options: {
    status?: string;
    email?: string;
    password?: string;
  } = {}) {
    const email = options.email ?? `real.organizer.${randomUUID().slice(0, 8)}@eventlens.internal`;
    const emailNormalized = email.toLowerCase();
    const adminId = randomUUID();
    const invitationId = randomUUID();
    const accountId = randomUUID();
    const credId = randomUUID();
    const status = options.status ?? 'ACTIVE';
    const password = options.password ?? 'RealSecurePassword123!';
    const rawInvitationToken = randomBytes(32).toString('hex');
    const invTokenDigest = createHash('sha256').update(randomUUID() + rawInvitationToken).digest('hex');

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // 1. Invitación
    await sql(
      `INSERT INTO beta_invitation (
         id, email, email_normalized, token_digest, status, issued_by, expires_at
       ) VALUES ($1, $2, $3, $4, 'CONSUMED', $5, $6)`,
      invitationId,
      email,
      emailNormalized,
      invTokenDigest,
      adminId,
      expiresAt
    );

    // 2. Cuenta
    await sql(
      `INSERT INTO organizer_account (
         id, email, email_normalized, status, declared_adult, declared_adult_at, invitation_id, verified_at
       ) VALUES ($1, $2, $3, $4, true, NOW(), $5, $6)`,
      accountId,
      email,
      emailNormalized,
      status,
      invitationId,
      status === 'ACTIVE' ? new Date() : null
    );

    // 3. Credencial
    const secretDigest = computeCredentialDigest('ORGANIZER_AUTHENTICATION', accountId, password);
    await sql(
      `INSERT INTO organizer_credential (
         id, account_id, purpose, secret_digest, revision, status
       ) VALUES ($1, $2, 'ORGANIZER_AUTHENTICATION', $3, 1, 'ACTIVE')`,
      credId,
      accountId,
      secretDigest
    );

    return { accountId, email, emailNormalized, password };
  }

  function createService(auditEvents: AuditEventRecord[]) {
    const auditSink: AuditSink = {
      record: async (event) => {
        auditEvents.push(event);
        await sql(
          `INSERT INTO admin_audit_event (
             id, procedure, actor_id, target_identifier, target_principal_id, result, details, timestamp
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
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
    };

    const recoveryAuthority: RecoveryAuthorityPort = {
      getRecoveryEpoch: async () => 1n,
      getCredentialRevision: async () => 1n,
      getAdminAuthWatermark: async () => 1n
    };

    return new OrganizerAuthenticationService(txs, auditSink, recoveryAuthority);
  }

  it('inicia sesión para cuenta activa, persiste sesión con digest y valida actividad en PostgreSQL 16 real', async () => {
    const fixture = await seedActiveOrganizer({ status: 'ACTIVE' });
    const auditEvents: AuditEventRecord[] = [];
    const service = createService(auditEvents);

    const loginResult = await service.login({
      email: fixture.email,
      password: fixture.password
    });

    expect(loginResult.actorContext.accountId).toBe(fixture.accountId);
    expect(loginResult.actorContext.actorType).toBe('ORGANIZER_HUMAN');
    expect(loginResult.sessionToken).toBeDefined();
    expect(loginResult.cookieSpec.name).toBe('__Host-el_session');

    // Comprobar que en PostgreSQL solo existe el digest y no el raw token
    const tokenDigest = createHash('sha256').update(loginResult.sessionToken).digest('hex');
    const sessions = await query<{ id: string; token_digest: string }>(
      'SELECT id, token_digest FROM organizer_session WHERE account_id = $1',
      fixture.accountId
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].token_digest).toBe(tokenDigest);

    // Validar sesión en DB real
    const validation = await service.validateSession({
      sessionToken: loginResult.sessionToken
    });
    expect(validation.actorContext.accountId).toBe(fixture.accountId);

    // Auditoría en PostgreSQL
    const auditRows = await query<{ procedure: string; result: string }>(
      'SELECT procedure, result FROM admin_audit_event WHERE target_identifier = $1',
      fixture.emailNormalized
    );
    expect(auditRows.length).toBeGreaterThan(0);
    expect(auditRows[0].procedure).toBe('ORGANIZER_LOGIN');
    expect(auditRows[0].result).toBe('SUCCESS');
  });

  it('rechaza inicio de sesión si la cuenta sigue en PENDING_VERIFICATION sin crear sesión en PostgreSQL', async () => {
    const fixture = await seedActiveOrganizer({ status: 'PENDING_VERIFICATION' });
    const auditEvents: AuditEventRecord[] = [];
    const service = createService(auditEvents);

    await expect(
      service.login({
        email: fixture.email,
        password: fixture.password
      })
    ).rejects.toMatchObject({
      code: 'UNAUTHENTICATED'
    });

    const sessions = await query('SELECT id FROM organizer_session WHERE account_id = $1', fixture.accountId);
    expect(sessions).toHaveLength(0);
  });

  it('concurrencia: múltiples inicios de sesión concurrentes emiten sesiones independientes sin bloqueos en PostgreSQL 16', async () => {
    const fixture = await seedActiveOrganizer({ status: 'ACTIVE' });
    const auditEvents: AuditEventRecord[] = [];
    const service = createService(auditEvents);

    const results = await Promise.all([
      service.login({ email: fixture.email, password: fixture.password }),
      service.login({ email: fixture.email, password: fixture.password }),
      service.login({ email: fixture.email, password: fixture.password })
    ]);

    expect(results).toHaveLength(3);
    const uniqueTokens = new Set(results.map((r) => r.sessionToken));
    expect(uniqueTokens.size).toBe(3);

    const sessions = await query('SELECT id FROM organizer_session WHERE account_id = $1', fixture.accountId);
    expect(sessions).toHaveLength(3);
  });

  it('guarda estricta: base de datos nunca almacena contraseñas ni tokens en texto plano', async () => {
    const password = 'SuperSecretPlaintextPassword999!';
    const fixture = await seedActiveOrganizer({ status: 'ACTIVE', password });
    const auditEvents: AuditEventRecord[] = [];
    const service = createService(auditEvents);

    const loginResult = await service.login({
      email: fixture.email,
      password
    });

    // Verificar en tabla de credenciales
    const credRows = await query<{ secret_digest: string }>(
      'SELECT secret_digest FROM organizer_credential WHERE account_id = $1',
      fixture.accountId
    );
    expect(credRows[0].secret_digest).not.toContain(password);

    // Verificar en tabla de sesiones
    const sessionRows = await query<{ token_digest: string }>(
      'SELECT token_digest FROM organizer_session WHERE account_id = $1',
      fixture.accountId
    );
    expect(sessionRows[0].token_digest).not.toContain(loginResult.sessionToken);

    // Verificar en auditoría
    const auditRows = await query<{ details: string }>(
      'SELECT details FROM admin_audit_event WHERE target_identifier = $1',
      fixture.emailNormalized
    );
    for (const row of auditRows) {
      expect(row.details).not.toContain(password);
      expect(row.details).not.toContain(loginResult.sessionToken);
    }
  });

  it('EL-TK-014: listSessions en PostgreSQL real recupera sesiones activas e identifica isCurrent', async () => {
    const fixture = await seedActiveOrganizer({ status: 'ACTIVE' });
    const auditEvents: AuditEventRecord[] = [];
    const service = createService(auditEvents);

    const s1 = await service.login({ email: fixture.email, password: fixture.password });
    const s2 = await service.login({ email: fixture.email, password: fixture.password });

    const list = await service.listSessions({ actorContext: s2.actorContext });
    expect(list.total).toBe(2);
    expect(list.sessions).toHaveLength(2);

    const current = list.sessions.find(s => s.id === s2.actorContext.sessionId);
    expect(current?.isCurrent).toBe(true);

    const other = list.sessions.find(s => s.id === s1.actorContext.sessionId);
    expect(other?.isCurrent).toBe(false);
  });

  it('EL-TK-015: logout en PostgreSQL real marca la sesión como revocada y rechaza validación posterior', async () => {
    const fixture = await seedActiveOrganizer({ status: 'ACTIVE' });
    const auditEvents: AuditEventRecord[] = [];
    const service = createService(auditEvents);

    const login = await service.login({ email: fixture.email, password: fixture.password });

    const logoutResult = await service.logout({ actorContext: login.actorContext });
    expect(logoutResult.outcome).toBe('LOGGED_OUT');

    // Comprobar en PostgreSQL
    const rows = await query<{ revoked_at: Date; revocation_reason: string }>(
      'SELECT revoked_at, revocation_reason FROM organizer_session WHERE id = $1',
      login.actorContext.sessionId
    );
    expect(rows[0].revoked_at).not.toBeNull();
    expect(rows[0].revocation_reason).toBe('USER_LOGOUT');

    // validateSession debe fallar
    await expect(
      service.validateSession({ sessionToken: login.sessionToken })
    ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  });

  it('EL-TK-016 & EL-TK-017: revokeSpecificSession y revokeOtherSessions en PostgreSQL garantizan aislamiento multi-inquilino', async () => {
    const user = await seedActiveOrganizer({ status: 'ACTIVE' });
    const alien = await seedActiveOrganizer({ status: 'ACTIVE' });
    const auditEvents: AuditEventRecord[] = [];
    const service = createService(auditEvents);

    const u1 = await service.login({ email: user.email, password: user.password });
    const u2 = await service.login({ email: user.email, password: user.password });
    const u3 = await service.login({ email: user.email, password: user.password });
    const alienSession = await service.login({ email: alien.email, password: alien.password });

    // Intento de revocar sesión ajena rechaza con SESSION_NOT_FOUND
    await expect(
      service.revokeSpecificSession({
        actorContext: u2.actorContext,
        targetSessionId: alienSession.actorContext.sessionId
      })
    ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });

    // u2 revoca u1 específicamente
    const revoke1 = await service.revokeSpecificSession({
      actorContext: u2.actorContext,
      targetSessionId: u1.actorContext.sessionId
    });
    expect(revoke1.outcome).toBe('REVOKED');

    // u2 revoca el resto de otras sesiones (u3)
    const revokeOthers = await service.revokeOtherSessions({
      actorContext: u2.actorContext
    });
    expect(revokeOthers.outcome).toBe('OTHER_SESSIONS_REVOKED');
    expect(revokeOthers.revokedCount).toBe(1); // sólo u3 quedaba activa aparte de u2

    // u2 sigue autorizada
    const validU2 = await service.validateSession({ sessionToken: u2.sessionToken });
    expect(validU2.actorContext.sessionId).toBe(u2.actorContext.sessionId);

    // La sesión ajena de alien sigue autorizada
    const validAlien = await service.validateSession({ sessionToken: alienSession.sessionToken });
    expect(validAlien.actorContext.sessionId).toBe(alienSession.actorContext.sessionId);
  });
});

