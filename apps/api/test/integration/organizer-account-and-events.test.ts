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
  const email = `org.tk209.${randomUUID().slice(0, 8)}@eventlens.internal`;
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

it(
  'EL-TK-209: manages own organizer sessions, rejects alien sessions with 404, and executes account deletion/cancellation with reauthentication on real PostgreSQL 16',
  async () => {
  const owner = await seedOrganizerAccount('ACTIVE');
  const other = await seedOrganizerAccount('ACTIVE');

  const sessionA = await sessionService.getAuthService().login({
    email: owner.email,
    password: owner.password,
    origin: config.webOrigin
  });
  const sessionB = await sessionService.getAuthService().login({
    email: owner.email,
    password: owner.password,
    origin: config.webOrigin
  });
  const sessionC = await sessionService.getAuthService().login({
    email: owner.email,
    password: owner.password,
    origin: config.webOrigin
  });
  const alienSession = await sessionService.getAuthService().login({
    email: other.email,
    password: other.password,
    origin: config.webOrigin
  });

  // 1. Listar sesiones activas de owner desde sessionA
  const listRes = await fetch(`${base}/api/v1/organizer/account/sessions`, {
    headers: {
      Cookie: `__Host-el_session=${sessionA.sessionToken}`
    }
  });
  expect(listRes.status).toBe(200);
  const listBody = (await listRes.json()) as any;
  expect(listBody.total).toBe(3);
  expect(listBody.sessions.some((s: any) => s.id === sessionA.actorContext.sessionId && s.isCurrent)).toBe(true);
  expect(JSON.stringify(listBody)).not.toContain(sessionA.sessionToken);

  // 2. Intentar revocar sesión ajena -> 404 (no enumeración)
  const alienRevokeRes = await fetch(`${base}/api/v1/organizer/account/sessions/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: config.webOrigin,
      Cookie: `__Host-el_session=${sessionA.sessionToken}`,
      'X-CSRF-Token': sessionA.csrfToken
    },
    body: JSON.stringify({
      targetSessionId: alienSession.actorContext.sessionId
    })
  });
  expect(alienRevokeRes.status).toBe(404);

  // 3. Revocar sesión propia específica (sessionB)
  const specificRevokeRes = await fetch(`${base}/api/v1/organizer/account/sessions/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: config.webOrigin,
      Cookie: `__Host-el_session=${sessionA.sessionToken}`,
      'X-CSRF-Token': sessionA.csrfToken
    },
    body: JSON.stringify({
      targetSessionId: sessionB.actorContext.sessionId
    })
  });
  expect(specificRevokeRes.status).toBe(200);
  const specificRevokeBody = (await specificRevokeRes.json()) as any;
  expect(specificRevokeBody.outcome).toBe('REVOKED');
  expect(specificRevokeBody.isCurrentSession).toBe(false);

  // 4. Cerrar todas las demás sesiones activas (revoca sessionC, preserva sessionA)
  const revokeOthersRes = await fetch(`${base}/api/v1/organizer/account/sessions/revoke-others`, {
    method: 'POST',
    headers: {
      Origin: config.webOrigin,
      Cookie: `__Host-el_session=${sessionA.sessionToken}`,
      'X-CSRF-Token': sessionA.csrfToken
    }
  });
  expect(revokeOthersRes.status).toBe(200);
  const revokeOthersBody = (await revokeOthersRes.json()) as any;
  expect(revokeOthersBody.outcome).toBe('REVOKED_OTHERS');
  expect(revokeOthersBody.revokedCount).toBe(1);
  expect(revokeOthersBody.preservedCurrentSessionId).toBe(sessionA.actorContext.sessionId);

  // 5. Consultar estado de eliminación de cuenta en estado ACTIVE
  const delStateRes = await fetch(`${base}/api/v1/organizer/account/deletion`, {
    headers: {
      Cookie: `__Host-el_session=${sessionA.sessionToken}`
    }
  });
  expect(delStateRes.status).toBe(200);
  const delStateBody = (await delStateRes.json()) as any;
  expect(delStateBody.accountStatus).toBe('ACTIVE');
  expect(delStateBody.sessionMode).toBe('ORDINARY');
  expect(delStateBody.canRequestDeletion).toBe(true);
  expect(delStateBody.canCancelDeletion).toBe(false);

  // 6. Solicitar desafío de reautenticación y ejecutar REQUEST_ACCOUNT_DELETION (EL-TK-186/191/201)
  const challengeRes = await fetch(
    `${base}/api/v1/organizer/account/reauthentication/challenges`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: config.webOrigin,
        Cookie: `__Host-el_session=${sessionA.sessionToken}`,
        'X-CSRF-Token': sessionA.csrfToken
      },
      body: JSON.stringify({
        operation: 'REQUEST_ACCOUNT_DELETION',
        accountId: owner.accountId,
        expectedRevision: delStateBody.revision
      })
    }
  );
  expect(challengeRes.status).toBe(200);
  const challengeBody = (await challengeRes.json()) as any;

  const execDeleteRes = await fetch(`${base}/api/v1/organizer/account/deletion`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: config.webOrigin,
      Cookie: `__Host-el_session=${sessionA.sessionToken}`,
      'X-CSRF-Token': sessionA.csrfToken
    },
    body: JSON.stringify({
      challengeId: challengeBody.challengeId,
      currentPassword: owner.password,
      operation: 'REQUEST_ACCOUNT_DELETION',
      accountId: owner.accountId,
      expectedRevision: delStateBody.revision,
      idempotencyKey: `idem-req-del-${owner.accountId}`
    })
  });
  expect(execDeleteRes.status).toBe(200);
  const execDeleteBody = (await execDeleteRes.json()) as any;
  expect(execDeleteBody.accountStatus).toBe('PENDING_DELETION');
  expect(execDeleteBody.status).toBe('CONFIRMED');
  expect(execDeleteBody.cancelUntilUtcIso).toBeTruthy();

  // 7. En estado PENDING_DELETION (restringido), listar sesiones devuelve 403 FORBIDDEN,
  // pero consultar /organizer/account/deletion sigue permitido con canCancelDeletion=true
  const restrictedSessionsRes = await fetch(`${base}/api/v1/organizer/account/sessions`, {
    headers: {
      Cookie: `__Host-el_session=${sessionA.sessionToken}`
    }
  });
  expect(restrictedSessionsRes.status).toBe(403);

  const pendingDelStateRes = await fetch(`${base}/api/v1/organizer/account/deletion`, {
    headers: {
      Cookie: `__Host-el_session=${sessionA.sessionToken}`
    }
  });
  expect(pendingDelStateRes.status).toBe(200);
  const pendingDelStateBody = (await pendingDelStateRes.json()) as any;
  expect(pendingDelStateBody.accountStatus).toBe('PENDING_DELETION');
  expect(pendingDelStateBody.sessionMode).toBe('DELETION_MANAGEMENT_ONLY');
  expect(pendingDelStateBody.canRequestDeletion).toBe(false);
  expect(pendingDelStateBody.canCancelDeletion).toBe(true);

  // 8. Cancelar eliminación de cuenta con nuevo desafío de reautenticación (EL-TK-192)
  const cancelChallengeRes = await fetch(
    `${base}/api/v1/organizer/account/reauthentication/challenges`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: config.webOrigin,
        Cookie: `__Host-el_session=${sessionA.sessionToken}`,
        'X-CSRF-Token': sessionA.csrfToken
      },
      body: JSON.stringify({
        operation: 'CANCEL_ACCOUNT_DELETION',
        accountId: owner.accountId,
        expectedRevision: pendingDelStateBody.revision
      })
    }
  );
  expect(cancelChallengeRes.status).toBe(200);
  const cancelChallengeBody = (await cancelChallengeRes.json()) as any;

  const execCancelRes = await fetch(`${base}/api/v1/organizer/account/deletion`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: config.webOrigin,
      Cookie: `__Host-el_session=${sessionA.sessionToken}`,
      'X-CSRF-Token': sessionA.csrfToken
    },
    body: JSON.stringify({
      challengeId: cancelChallengeBody.challengeId,
      currentPassword: owner.password,
      operation: 'CANCEL_ACCOUNT_DELETION',
      accountId: owner.accountId,
      expectedRevision: pendingDelStateBody.revision,
      idempotencyKey: `idem-cancel-del-${owner.accountId}`
    })
  });
  expect(execCancelRes.status).toBe(200);
  const execCancelBody = (await execCancelRes.json()) as any;
  expect(execCancelBody.accountStatus).toBe('ACTIVE');
  expect(execCancelBody.status).toBe('CANCELLED');
}, 30000);

it('EL-TK-210: lists own events, serves authorized event configuration, enforces cross-organizer 404 anti-enumeration, and denies restricted/anonymous callers on real PostgreSQL 16', async () => {
  const owner = await seedOrganizerAccount('ACTIVE');
  const other = await seedOrganizerAccount('ACTIVE');
  const restricted = await seedOrganizerAccount('PENDING_DELETION');

  const ownerLogin = await sessionService.getAuthService().login({
    email: owner.email,
    password: owner.password,
    origin: config.webOrigin
  });
  const restrictedLogin = await sessionService.getAuthService().login({
    email: restricted.email,
    password: restricted.password,
    origin: config.webOrigin
  });

  const ownerEventId = randomUUID();
  const otherEventId = randomUUID();

  await db.transactions.run(async (tx) => {
    await tx.execute(
      `INSERT INTO event (
         id, organizer_id, name, status, timezone, uploads_enabled,
         guest_gallery_enabled, moderation_mode, pin_enabled, created_at, updated_at
       ) VALUES ($1, $2, 'Boda de Prueba EL-TK-210', 'DRAFT', 'America/Bogota', false, false, 'AUTO_PUBLISH', false, NOW(), NOW())`,
      ownerEventId,
      owner.accountId
    );
    await tx.execute(
      `INSERT INTO event (
         id, organizer_id, name, status, timezone, uploads_enabled,
         guest_gallery_enabled, moderation_mode, pin_enabled, created_at, updated_at
       ) VALUES ($1, $2, 'Evento Ajeno', 'ACTIVE', 'America/Bogota', true, true, 'AUTO_PUBLISH', false, NOW(), NOW())`,
      otherEventId,
      other.accountId
    );
  });

  // 1. Visitante anónimo -> 401
  const anonRes = await fetch(`${base}/api/v1/events`);
  expect(anonRes.status).toBe(401);

  // 2. Cuenta restringida PENDING_DELETION -> 403
  const restrictedRes = await fetch(`${base}/api/v1/events`, {
    headers: {
      Cookie: `__Host-el_session=${restrictedLogin.sessionToken}`
    }
  });
  expect(restrictedRes.status).toBe(403);

  // 3. Organizador ordinario lista exclusivamente sus propios eventos
  const listRes = await fetch(`${base}/api/v1/events`, {
    headers: {
      Cookie: `__Host-el_session=${ownerLogin.sessionToken}`
    }
  });
  expect(listRes.status).toBe(200);
  const events = (await listRes.json()) as any[];
  expect(events.length).toBe(1);
  expect(events[0].id).toBe(ownerEventId);
  expect(events[0].name).toBe('Boda de Prueba EL-TK-210');

  // 4. Configuración autorizada del evento propio
  const configRes = await fetch(`${base}/api/v1/events/${ownerEventId}/configuration`, {
    headers: {
      Cookie: `__Host-el_session=${ownerLogin.sessionToken}`
    }
  });
  expect(configRes.status).toBe(200);
  const configBody = (await configRes.json()) as any;
  expect(configBody.event.id).toBe(ownerEventId);
  expect(configBody.capabilities.canEditSchedule).toBe(true);
  expect(JSON.stringify(configBody)).not.toContain('pinHash');

  // 5. Evento de otro organizador -> 404 (no enumeración)
  const alienConfigRes = await fetch(`${base}/api/v1/events/${otherEventId}/configuration`, {
    headers: {
      Cookie: `__Host-el_session=${ownerLogin.sessionToken}`
    }
  });
  expect(alienConfigRes.status).toBe(404);
});

it('EL-TK-224: creates event draft idempotently via POST /events, verifies replay, CSRF, origin, and rejections', async () => {
  const owner = await seedOrganizerAccount('ACTIVE');
  const session = await sessionService.getAuthService().login({
    email: owner.email,
    password: owner.password,
    origin: config.webOrigin
  });

  const idempotencyKey = `create-${randomUUID()}`;
  const eventName = 'Mi Boda de Prueba EL-TK-224';

  // 1. Rechazo por falta de Idempotency-Key -> 400
  const noKeyRes = await fetch(`${base}/api/v1/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: config.webOrigin,
      'X-CSRF-Token': session.csrfToken,
      Cookie: `__Host-el_session=${session.sessionToken}`
    },
    body: JSON.stringify({ name: eventName })
  });
  expect(noKeyRes.status).toBe(400);

  // 2. Rechazo por nombre inválido (vacío) -> 422
  const emptyNameRes = await fetch(`${base}/api/v1/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: config.webOrigin,
      'X-CSRF-Token': session.csrfToken,
      'Idempotency-Key': idempotencyKey,
      Cookie: `__Host-el_session=${session.sessionToken}`
    },
    body: JSON.stringify({ name: '   ' })
  });
  expect(emptyNameRes.status).toBe(422);

  // 3. Rechazo por falta de CSRF -> 403
  const noCsrfRes = await fetch(`${base}/api/v1/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: config.webOrigin,
      'Idempotency-Key': idempotencyKey,
      Cookie: `__Host-el_session=${session.sessionToken}`
    },
    body: JSON.stringify({ name: eventName })
  });
  expect(noCsrfRes.status).toBe(403);

  // 4. Creación autorizada exitosa -> 201 Created con envelope { receipt, outcome: 'APPLIED', event: { id } }
  const createRes = await fetch(`${base}/api/v1/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: config.webOrigin,
      'X-CSRF-Token': session.csrfToken,
      'Idempotency-Key': idempotencyKey,
      Cookie: `__Host-el_session=${session.sessionToken}`
    },
    body: JSON.stringify({ name: eventName })
  });
  expect(createRes.status).toBe(201);
  const createBody = (await createRes.json()) as any;
  expect(createBody.outcome).toBe('APPLIED');
  expect(createBody.event.id).toBeDefined();
  expect(createBody.receipt).toBeDefined();
  expect(createBody.receipt.operation).toBe('CREATE_EVENT');
  expect(createBody.receipt.eventId).toBe(createBody.event.id);
  expect(createBody.receipt.appliedRevision).toBe('1');
  const createdEventId = createBody.event.id;

  // 5. Replay idéntico compatible -> 200 OK con outcome: 'REPLAYED' y mismo receipt original
  const replayRes = await fetch(`${base}/api/v1/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: config.webOrigin,
      'X-CSRF-Token': session.csrfToken,
      'Idempotency-Key': idempotencyKey,
      Cookie: `__Host-el_session=${session.sessionToken}`
    },
    body: JSON.stringify({ name: eventName })
  });
  expect(replayRes.status).toBe(200);
  const replayBody = (await replayRes.json()) as any;
  expect(replayBody.outcome).toBe('REPLAYED');
  expect(replayBody.event.id).toBe(createdEventId);
  expect(replayBody.receipt.operationId).toBe(createBody.receipt.operationId);
  expect(replayBody.receipt.appliedRevision).toBe(createBody.receipt.appliedRevision);

  // 6. Conflicto de idempotencia con mismo key y diferente payload -> 409 Conflict
  const conflictRes = await fetch(`${base}/api/v1/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: config.webOrigin,
      'X-CSRF-Token': session.csrfToken,
      'Idempotency-Key': idempotencyKey,
      Cookie: `__Host-el_session=${session.sessionToken}`
    },
    body: JSON.stringify({ name: 'Nombre Completamente Distinto' })
  });
  expect(conflictRes.status).toBe(409);
}, 30000);

it('EL-TK-225: updates draft event name with expectedRevision CAS, idempotency, anti-enumeration, and drift protection', async () => {
  const owner = await seedOrganizerAccount('ACTIVE');
  const otherOwner = await seedOrganizerAccount('ACTIVE');

  const ownerSession = await sessionService.getAuthService().login({
    email: owner.email,
    password: owner.password,
    origin: config.webOrigin
  });

  const otherSession = await sessionService.getAuthService().login({
    email: otherOwner.email,
    password: otherOwner.password,
    origin: config.webOrigin
  });

  // Crear un evento en DRAFT para el owner
  const createKey = `create-${randomUUID()}`;
  const initialName = 'Evento Inicial EL-TK-225';
  const createRes = await fetch(`${base}/api/v1/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: config.webOrigin,
      'X-CSRF-Token': ownerSession.csrfToken,
      'Idempotency-Key': createKey,
      Cookie: `__Host-el_session=${ownerSession.sessionToken}`
    },
    body: JSON.stringify({ name: initialName })
  });
  expect(createRes.status).toBe(201);
  const created = (await createRes.json()) as any;
  const eventId = created.event.id;
  expect(eventId).toBeDefined();

  // Consultar configuración autorizada inicial para verificar revision y capability canEditName
  const configRes = await fetch(`${base}/api/v1/events/${eventId}/configuration`, {
    headers: {
      Cookie: `__Host-el_session=${ownerSession.sessionToken}`
    }
  });
  expect(configRes.status).toBe(200);
  const configBody = (await configRes.json()) as any;
  expect(configBody.revision).toBe('1');
  expect(configBody.capabilities.canEditName).toBe(true);

  // 1. Falta de Idempotency-Key -> 400
  const noKeyRes = await fetch(`${base}/api/v1/events/${eventId}/configuration/name`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Origin: config.webOrigin,
      'X-CSRF-Token': ownerSession.csrfToken,
      Cookie: `__Host-el_session=${ownerSession.sessionToken}`
    },
    body: JSON.stringify({ name: 'Nombre Modificado', expectedRevision: '1' })
  });
  expect(noKeyRes.status).toBe(400);

  // 2. Nombre inválido (vacío o espacios) -> 422
  const emptyNameRes = await fetch(`${base}/api/v1/events/${eventId}/configuration/name`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Origin: config.webOrigin,
      'X-CSRF-Token': ownerSession.csrfToken,
      'Idempotency-Key': `patch-${randomUUID()}`,
      Cookie: `__Host-el_session=${ownerSession.sessionToken}`
    },
    body: JSON.stringify({ name: '   ', expectedRevision: '1' })
  });
  expect(emptyNameRes.status).toBe(422);

  // 3. expectedRevision inválido o faltante -> 400
  const noRevRes = await fetch(`${base}/api/v1/events/${eventId}/configuration/name`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Origin: config.webOrigin,
      'X-CSRF-Token': ownerSession.csrfToken,
      'Idempotency-Key': `patch-${randomUUID()}`,
      Cookie: `__Host-el_session=${ownerSession.sessionToken}`
    },
    body: JSON.stringify({ name: 'Nombre Válido', expectedRevision: '' })
  });
  expect(noRevRes.status).toBe(400);

  // 4. Conflicto CAS con expectedRevision obsoleta -> 409
  const casConflictRes = await fetch(`${base}/api/v1/events/${eventId}/configuration/name`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Origin: config.webOrigin,
      'X-CSRF-Token': ownerSession.csrfToken,
      'Idempotency-Key': `patch-${randomUUID()}`,
      Cookie: `__Host-el_session=${ownerSession.sessionToken}`
    },
    body: JSON.stringify({ name: 'Nombre Nuevo', expectedRevision: '999' })
  });
  expect(casConflictRes.status).toBe(409);

  // 5. Cambio permitido con revisión vigente -> 200 APPLIED
  const validKey = `patch-valid-${randomUUID()}`;
  const newName = 'Nombre Definitivo Actualizado';
  const updateRes = await fetch(`${base}/api/v1/events/${eventId}/configuration/name`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Origin: config.webOrigin,
      'X-CSRF-Token': ownerSession.csrfToken,
      'Idempotency-Key': validKey,
      Cookie: `__Host-el_session=${ownerSession.sessionToken}`
    },
    body: JSON.stringify({ name: newName, expectedRevision: '1' })
  });
  expect(updateRes.status).toBe(200);
  const updateBody = (await updateRes.json()) as any;
  expect(updateBody.outcome).toBe('APPLIED');
  expect(updateBody.revision).toBe('2');
  expect(updateBody.event.name).toBe(newName);
  expect(updateBody.receipt.operation).toBe('UPDATE_NAME');
  expect(updateBody.receipt.appliedRevision).toBe('2');

  // 6. Replay idéntico compatible -> 200 REPLAYED
  const replayRes = await fetch(`${base}/api/v1/events/${eventId}/configuration/name`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Origin: config.webOrigin,
      'X-CSRF-Token': ownerSession.csrfToken,
      'Idempotency-Key': validKey,
      Cookie: `__Host-el_session=${ownerSession.sessionToken}`
    },
    body: JSON.stringify({ name: newName, expectedRevision: '1' })
  });
  expect(replayRes.status).toBe(200);
  const replayBody = (await replayRes.json()) as any;
  expect(replayBody.outcome).toBe('REPLAYED');
  expect(replayBody.receipt.operationId).toBe(updateBody.receipt.operationId);

  // 7. Conflicto de idempotencia con diferente payload -> 409
  const idempConflictRes = await fetch(`${base}/api/v1/events/${eventId}/configuration/name`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Origin: config.webOrigin,
      'X-CSRF-Token': ownerSession.csrfToken,
      'Idempotency-Key': validKey,
      Cookie: `__Host-el_session=${ownerSession.sessionToken}`
    },
    body: JSON.stringify({ name: 'Otro Nombre', expectedRevision: '2' })
  });
  expect(idempConflictRes.status).toBe(409);

  // 8. Anti-enumeración frente a organizador ajeno -> 404
  const alienRes = await fetch(`${base}/api/v1/events/${eventId}/configuration/name`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Origin: config.webOrigin,
      'X-CSRF-Token': otherSession.csrfToken,
      'Idempotency-Key': `alien-${randomUUID()}`,
      Cookie: `__Host-el_session=${otherSession.sessionToken}`
    },
    body: JSON.stringify({ name: 'Intento de Invasión', expectedRevision: '2' })
  });
  expect(alienRes.status).toBe(404);

  // 9. Evento no existente -> 404
  const notFoundRes = await fetch(`${base}/api/v1/events/${randomUUID()}/configuration/name`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Origin: config.webOrigin,
      'X-CSRF-Token': ownerSession.csrfToken,
      'Idempotency-Key': `notfound-${randomUUID()}`,
      Cookie: `__Host-el_session=${ownerSession.sessionToken}`
    },
    body: JSON.stringify({ name: 'Nombre X', expectedRevision: '1' })
  });
  expect(notFoundRes.status).toBe(404);
}, 30000);

it('EL-TK-218: verifica guardas de aislamiento de laboratorio antes de listen', async () => {
  const { assertTestServerStartup } = await import('@eventlens/database/testing');
  // 1. Rechazo temprano con URL de desarrollo sin abrir conexión
  await expect(
    assertTestServerStartup({
      env: {
        ...process.env,
        DATABASE_URL: 'postgresql://eventlens:secret@127.0.0.1:5432/eventlens'
      },
      checkPort: false
    })
  ).rejects.toThrow('TEST_ISOLATION_CONNECTION_REJECTED');

  // 2. Acepta el entorno actual aislado de pruebas
  if (process.env.EVENTLENS_TEST_DATABASE) {
    await expect(
      assertTestServerStartup({
        env: process.env,
        checkPort: false
      })
    ).resolves.toBeUndefined();
  }
});
