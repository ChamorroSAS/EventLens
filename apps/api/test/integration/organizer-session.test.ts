import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PasswordVerifier } from '@eventlens/identity';
import { createApplication } from '../../dist/application.js';
import { readConfig } from '../../dist/platform/config/config.js';
import { DatabaseService } from '../../dist/platform/database/database.service.js';
import { OrganizerSessionService } from '../../dist/identity/organizer-session.service.js';

let application: Awaited<ReturnType<typeof createApplication>>;
let base: string;
let db: DatabaseService;
let sessionService: OrganizerSessionService;
let config: ReturnType<typeof readConfig>;
const verifier = new PasswordVerifier();

beforeAll(async () => {
  if (!process.env.DATABASE_URL && !process.env.PGHOST) {
    throw new Error('REAL_POSTGRES_CONNECTION_REQUIRED');
  }
  config = readConfig(process.env);
  application = await createApplication(config);
  await application.app.listen(0, '127.0.0.1');
  base = await application.app.getUrl();
  db = application.app.get(DatabaseService);
  sessionService = application.app.get(OrganizerSessionService);
});

afterAll(async () => {
  await application?.app.close();
});

async function seedOrganizerAccount(status: 'ACTIVE' | 'PENDING_DELETION') {
  const email = `org.tk205.${randomUUID().slice(0, 8)}@eventlens.internal`;
  const emailNormalized = email.toLowerCase();
  const invitationId = randomUUID();
  const accountId = randomUUID();
  const credId = randomUUID();
  const password = 'ValidOrganizerPassword123!';
  const tokenDigest = createHash('sha256')
    .update(randomBytes(32).toString('hex'))
    .digest('hex');
  const secretDigest = await verifier.hashPassword(password);

  await db.transactions.run(async (tx) => {
    await tx.execute(
      `INSERT INTO beta_invitation (
         id, email, email_normalized, token_digest, status, issued_by, expires_at
       ) VALUES ($1, $2, $3, $4, 'CONSUMED', $5, $6)`,
      invitationId,
      email,
      emailNormalized,
      tokenDigest,
      randomUUID(),
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    );

    await tx.execute(
      `INSERT INTO organizer_account (
         id, email, email_normalized, status, declared_adult, declared_adult_at, invitation_id, verified_at
       ) VALUES ($1, $2, $3, $4, true, NOW(), $5, NOW())`,
      accountId,
      email,
      emailNormalized,
      status,
      invitationId
    );

    await tx.execute(
      `INSERT INTO organizer_credential (
         id, account_id, purpose, secret_digest, revision, status
       ) VALUES ($1, $2, 'ORGANIZER_AUTHENTICATION', $3, 1, 'ACTIVE')`,
      credId,
      accountId,
      secretDigest
    );
  });

  return { accountId, invitationId, email, password };
}

it('EL-TK-205: serves anonymous, active, restricted PENDING_DELETION, revoked projections and CSRF validation on real PostgreSQL 16', async () => {
  // 1. Sin cookie -> ANONYMOUS sin datos privados ni X-CSRF-Token
  const anonResponse = await fetch(`${base}/api/v1/organizer/session`);
  expect(anonResponse.status).toBe(200);
  expect(anonResponse.headers.get('cache-control')).toContain('no-store');
  expect(anonResponse.headers.get('x-csrf-token')).toBeNull();
  const anonBody = (await anonResponse.json()) as any;
  expect(anonBody).toEqual({
    state: 'ANONYMOUS',
    capabilities: {
      canSignIn: true,
      canRequestBetaAccess: true,
      canAccessMyEvents: false,
      canAccessMyAccount: false,
      canManageSessions: false,
      canManageAccountDeletion: false,
      isDeletionRestricted: false,
      canSignOut: false
    },
    account: null
  });

  // 2. Cuenta ordinaria ACTIVE -> ORGANIZER_ACTIVE con metadata mínima y sin secretos
  const activeFixture = await seedOrganizerAccount('ACTIVE');
  const activeLogin = await sessionService.getAuthService().login({
    email: activeFixture.email,
    password: activeFixture.password
  });

  const activeResponse = await fetch(`${base}/api/v1/organizer/session`, {
    headers: {
      cookie: `__Host-el_session=${encodeURIComponent(activeLogin.sessionToken)}`
    }
  });
  expect(activeResponse.status).toBe(200);
  expect(activeResponse.headers.get('cache-control')).toContain('no-store');
  const csrfToken = activeResponse.headers.get('x-csrf-token');
  expect(csrfToken).toBeTruthy();

  const activeBody = (await activeResponse.json()) as any;
  expect(activeBody).toEqual({
    state: 'ORGANIZER_ACTIVE',
    capabilities: {
      canSignIn: false,
      canRequestBetaAccess: true,
      canAccessMyEvents: true,
      canAccessMyAccount: true,
      canManageSessions: true,
      canManageAccountDeletion: true,
      isDeletionRestricted: false,
      canSignOut: true
    },
    account: {
      email: activeFixture.email,
      emailVerified: true,
      accountStatus: 'ACTIVE'
    }
  });
  const activeSerialized = JSON.stringify(activeBody);
  expect(activeSerialized).not.toContain(activeLogin.sessionToken);
  expect(activeSerialized).not.toContain(activeFixture.invitationId);
  expect(activeSerialized).not.toContain('tokenDigest');
  expect(activeSerialized).not.toContain('csrfTokenDigest');

  // 3. Validación de Origin + CSRF para mutaciones
  const validated = await sessionService.validateMutatingOrganizerSession({
    sessionToken: activeLogin.sessionToken,
    csrfToken: csrfToken!,
    originHeader: config.webOrigin
  });
  expect(validated.actorContext.accountId).toBe(activeFixture.accountId);

  await expect(
    sessionService.validateMutatingOrganizerSession({
      sessionToken: activeLogin.sessionToken,
      csrfToken: 'invalid-csrf-token',
      originHeader: config.webOrigin
    })
  ).rejects.toThrow();

  // 4. Cuenta PENDING_DELETION -> ORGANIZER_RESTRICTED_DELETION
  const restrictedFixture = await seedOrganizerAccount('PENDING_DELETION');
  const restrictedLogin = await sessionService.getAuthService().login({
    email: restrictedFixture.email,
    password: restrictedFixture.password
  });

  const restrictedResponse = await fetch(`${base}/api/v1/organizer/session`, {
    headers: {
      cookie: `__Host-el_session=${encodeURIComponent(restrictedLogin.sessionToken)}`
    }
  });
  expect(restrictedResponse.status).toBe(200);
  const restrictedBody = (await restrictedResponse.json()) as any;
  expect(restrictedBody).toEqual({
    state: 'ORGANIZER_RESTRICTED_DELETION',
    capabilities: {
      canSignIn: false,
      canRequestBetaAccess: true,
      canAccessMyEvents: false,
      canAccessMyAccount: true,
      canManageSessions: false,
      canManageAccountDeletion: true,
      isDeletionRestricted: true,
      canSignOut: true
    },
    account: {
      email: restrictedFixture.email,
      emailVerified: true,
      accountStatus: 'PENDING_DELETION'
    }
  });

  // 5. Revocación -> proyecta ANONYMOUS y retira datos privados
  await sessionService.getAuthService().logout({
    actorContext: activeLogin.actorContext
  });
  const afterLogoutResponse = await fetch(`${base}/api/v1/organizer/session`, {
    headers: {
      cookie: `__Host-el_session=${encodeURIComponent(activeLogin.sessionToken)}`
    }
  });
  expect(afterLogoutResponse.status).toBe(200);
  expect(afterLogoutResponse.headers.get('x-csrf-token')).toBeNull();
  const afterLogoutBody = (await afterLogoutResponse.json()) as any;
  expect(afterLogoutBody.state).toBe('ANONYMOUS');
  expect(afterLogoutBody.account).toBeNull();

  // 6. Contrato OpenAPI expone getOrganizerSessionProjection, loginOrganizerSession y logoutOrganizerSession
  const openApi = (await (await fetch(`${base}/api/v1/openapi.json`)).json()) as any;
  expect(openApi.paths['/api/v1/organizer/session'].get.operationId).toBe(
    'getOrganizerSessionProjection'
  );
  expect(openApi.paths['/api/v1/organizer/session/login'].post.operationId).toBe(
    'loginOrganizerSession'
  );
  expect(openApi.paths['/api/v1/organizer/session/logout'].post.operationId).toBe(
    'logoutOrganizerSession'
  );
});

it('EL-TK-207: performs HTTP login and logout with Origin/CSRF enforcement and preserves concurrent sessions on real PostgreSQL 16', async () => {
  const organizer = await seedOrganizerAccount('ACTIVE');
  const otherOrganizer = await seedOrganizerAccount('ACTIVE');

  // Otra sesión concurrente que no debe verse afectada por el logout propio
  const otherSession = await sessionService.getAuthService().login({
    email: otherOrganizer.email,
    password: otherOrganizer.password
  });

  // 1. Login sin Origin confiable -> 403 FORBIDDEN
  const untrustedLogin = await fetch(`${base}/api/v1/organizer/session/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://evil.example'
    },
    body: JSON.stringify({ email: organizer.email, password: organizer.password })
  });
  expect(untrustedLogin.status).toBe(403);

  // 2. Login con credenciales inválidas -> 401 UNAUTHENTICATED neutro (sin enumeración)
  const badPassLogin = await fetch(`${base}/api/v1/organizer/session/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: config.webOrigin
    },
    body: JSON.stringify({ email: organizer.email, password: 'WrongPassword999!' })
  });
  expect(badPassLogin.status).toBe(401);
  const badPassBody = (await badPassLogin.json()) as any;
  const unknownEmailLogin = await fetch(`${base}/api/v1/organizer/session/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: config.webOrigin
    },
    body: JSON.stringify({
      email: `nonexistent.${randomUUID().slice(0, 8)}@eventlens.internal`,
      password: 'WrongPassword999!'
    })
  });
  expect(unknownEmailLogin.status).toBe(401);
  const unknownEmailBody = (await unknownEmailLogin.json()) as any;
  expect(badPassBody.code).toBe('UNAUTHENTICATED');
  expect(unknownEmailBody.code).toBe('UNAUTHENTICATED');
  expect(badPassBody.message).toBe(unknownEmailBody.message);

  // 3. Login válido -> 200 con Set-Cookie, X-CSRF-Token y proyección ORGANIZER_ACTIVE
  const validLogin = await fetch(`${base}/api/v1/organizer/session/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: config.webOrigin
    },
    body: JSON.stringify({ email: organizer.email, password: organizer.password })
  });
  expect(validLogin.status).toBe(200);
  const setCookie = validLogin.headers.get('set-cookie') ?? '';
  expect(setCookie).toContain('__Host-el_session=');
  const csrfToken = validLogin.headers.get('x-csrf-token');
  expect(csrfToken).toBeTruthy();

  const cookiePair = setCookie
    .split(',')
    .map((part) => part.trim().split(';')[0])
    .find((pair) => pair.startsWith('__Host-el_session='))!;

  // 4. Logout sin X-CSRF-Token cuando la sesión está activa -> 403 FORBIDDEN
  const logoutNoCsrf = await fetch(`${base}/api/v1/organizer/session/logout`, {
    method: 'POST',
    headers: {
      origin: config.webOrigin,
      cookie: cookiePair
    }
  });
  expect(logoutNoCsrf.status).toBe(403);

  // 5. Logout válido con Origin + X-CSRF-Token -> 200 LOGGED_OUT y expira cookie
  const validLogout = await fetch(`${base}/api/v1/organizer/session/logout`, {
    method: 'POST',
    headers: {
      origin: config.webOrigin,
      cookie: cookiePair,
      'x-csrf-token': csrfToken!
    }
  });
  expect(validLogout.status).toBe(200);
  const validLogoutBody = (await validLogout.json()) as any;
  expect(validLogoutBody.outcome).toBe('LOGGED_OUT');
  expect(validLogoutBody.projection.state).toBe('ANONYMOUS');
  expect(validLogout.headers.get('set-cookie')).toContain('Max-Age=0');

  // 6. Segundo logout con sesión ya revocada -> 200 ALREADY_EXPIRED_OR_REVOKED
  const repeatLogout = await fetch(`${base}/api/v1/organizer/session/logout`, {
    method: 'POST',
    headers: {
      origin: config.webOrigin,
      cookie: cookiePair,
      'x-csrf-token': csrfToken!
    }
  });
  expect(repeatLogout.status).toBe(200);
  const repeatLogoutBody = (await repeatLogout.json()) as any;
  expect(repeatLogoutBody.outcome).toBe('ALREADY_EXPIRED_OR_REVOKED');
  expect(repeatLogoutBody.projection.state).toBe('ANONYMOUS');

  // 7. La otra sesión concurrente permanece intacta
  const otherCheck = await sessionService
    .getAuthService()
    .validateSession({ sessionToken: otherSession.sessionToken });
  expect(otherCheck.actorContext.accountId).toBe(otherOrganizer.accountId);
});
