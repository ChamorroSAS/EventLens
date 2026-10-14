import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PasswordVerifier } from '@eventlens/identity';
import {
  EventDraftService,
  EventLifecycleService,
  EventPublicAccessService
} from '@eventlens/event-management';
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

  await db.transactions.run(async (tx) => {
    await tx.execute(`
      ALTER TABLE event
        ADD COLUMN IF NOT EXISTS pin_hash TEXT,
        ADD COLUMN IF NOT EXISTS pin_salt TEXT;
    `);
  });
});

afterAll(async () => {
  await application?.app.close();
});

async function seedOrganizerAccount() {
  const email = `org.tk211.${randomUUID().slice(0, 8)}@eventlens.internal`;
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
       ) VALUES ($1, $2, $3, 'ACTIVE', true, NOW(), $4, NOW())`,
      accountId,
      email,
      emailNormalized,
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

  return { accountId, email, password };
}

function extractCookieValue(
  setCookieHeader: string | null,
  cookieName: string
): string | null {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(new RegExp(`${cookieName}=([^;]+)`));
  return match && match[1] ? match[1] : null;
}

it('EL-TK-211 & EL-TK-212: resolves guest public entry, enforces PIN & HttpOnly cookie, isolates own contributions, revokes on regeneration, and protects share-access base URL on real PostgreSQL 16', async () => {
  const owner = await seedOrganizerAccount();
  const orgLogin = await sessionService.getAuthService().login({
    email: owner.email,
    password: owner.password,
    origin: config.webOrigin
  });

  const draftService = new EventDraftService(db.transactions);
  const lifecycleService = new EventLifecycleService(db.transactions);
  const publicAccessService = new EventPublicAccessService(db.transactions);

  // Crear evento activo con PIN habilitado
  const createdDraft = await draftService.createDraft({
    actorContext: orgLogin.actorContext,
    name: 'Boda Real EL-TK-211',
    idempotencyKey: `idem-draft-${randomUUID()}`
  });
  const eventId = createdDraft.event.id;
  expect(createdDraft.event.timezone).toBe('America/Bogota');

  await draftService.setSchedule({
    actorContext: orgLogin.actorContext,
    eventId,
    startsAtLocal: '2027-06-15T18:00:00'
  });
  await draftService.setInitialPin({
    actorContext: orgLogin.actorContext,
    eventId,
    pin: '654321'
  });
  await lifecycleService.scheduleDraft({
    actorContext: orgLogin.actorContext,
    eventId
  });
  await lifecycleService.activateEvent({
    actorContext: orgLogin.actorContext,
    eventId,
    trigger: 'MANUAL_EARLY'
  });

  const issuedCred = await publicAccessService.issueInitialCredential({
    actorContext: orgLogin.actorContext,
    eventId
  });
  const lookupKey = issuedCred.credential.lookupKey;

  // 1. EL-TK-212: share-access devuelve URL bajo la base confiable y rechaza baseUrl override no confiable
  const shareRes = await fetch(`${base}/api/v1/events/${eventId}/share-access`, {
    headers: {
      Cookie: `__Host-el_session=${orgLogin.sessionToken}`
    }
  });
  expect(shareRes.status).toBe(200);
  const shareBody = (await shareRes.json()) as any;
  expect(shareBody.sharePath).toBe(`/g/${lookupKey}`);
  expect(shareBody.shareUrl).toBe(`${config.publicEntryBaseUrl}/g/${lookupKey}`);
  expect(shareBody.qrSvg).toContain('<svg');

  const untrustedShareRes = await fetch(
    `${base}/api/v1/events/${eventId}/share-access?baseUrl=${encodeURIComponent('https://evil.attacker.example')}`,
    {
      headers: {
        Cookie: `__Host-el_session=${orgLogin.sessionToken}`
      }
    }
  );
  expect(untrustedShareRes.status).toBe(400);

  // 2. EL-TK-211: LookupKey inexistente devuelve 404 neutro sin enumerar el evento
  const invalidEntryRes = await fetch(
    `${base}/api/v1/public/guest-entry/nonexistent_lookup_key_999`
  );
  expect(invalidEntryRes.status).toBe(404);
  const invalidEntryBody = await invalidEntryRes.text();
  expect(invalidEntryBody).not.toContain('Boda Real EL-TK-211');
  expect(invalidEntryBody).not.toContain(eventId);

  // 3. EL-TK-211: Evento con PIN devuelve pinRequired=true y session=null antes de verificar PIN
  const entryBeforePinRes = await fetch(
    `${base}/api/v1/public/guest-entry/${lookupKey}`
  );
  expect(entryBeforePinRes.status).toBe(200);
  expect(entryBeforePinRes.headers.get('referrer-policy')).toBe('no-referrer');
  const entryBeforePinBody = (await entryBeforePinRes.json()) as any;
  expect(entryBeforePinBody.access.accessState).toBe('ALLOWED');
  expect(entryBeforePinBody.access.pinRequired).toBe(true);
  expect(entryBeforePinBody.session).toBeNull();

  // 4. PIN incorrecto devuelve 401 y no emite cookie
  const badPinRes = await fetch(
    `${base}/api/v1/public/guest-entry/${lookupKey}/session`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '000000' })
    }
  );
  expect(badPinRes.status).toBe(401);
  expect(badPinRes.headers.get('set-cookie')).toBeNull();

  // 5. PIN correcto emite cookie HttpOnly el_guest_session y recibo sin token crudo
  const goodPinRes = await fetch(
    `${base}/api/v1/public/guest-entry/${lookupKey}/session`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '654321' })
    }
  );
  expect(goodPinRes.status).toBe(200);
  const setCookieHeader = goodPinRes.headers.get('set-cookie');
  expect(setCookieHeader).toContain('el_guest_session=');
  expect(setCookieHeader).toContain('HttpOnly');
  const guestToken = extractCookieValue(setCookieHeader, 'el_guest_session');
  expect(guestToken).toBeTruthy();

  const goodPinBody = (await goodPinRes.json()) as any;
  expect(goodPinBody.session.eventId).toBe(eventId);
  expect(goodPinBody.session.hasConsented).toBe(false);
  expect(goodPinBody.session.token).toBeUndefined();
  expect(JSON.stringify(goodPinBody)).not.toContain(guestToken!);

  // 6. Verificar que la cookie guest NO eleva una sesión de organizador
  const orgProjectionWithGuestCookie = await fetch(
    `${base}/api/v1/organizer/session`,
    {
      headers: {
        Cookie: `el_guest_session=${guestToken}`
      }
    }
  );
  expect(orgProjectionWithGuestCookie.status).toBe(200);
  const orgProjBody = (await orgProjectionWithGuestCookie.json()) as any;
  expect(orgProjBody.state).toBe('ANONYMOUS');

  // 7. Registrar consentimiento explícito versionado y apodo mediante cookie
  const consentRes = await fetch(
    `${base}/api/v1/public/guest-session/consent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `el_guest_session=${guestToken}`
      },
      body: JSON.stringify({ documentVersion: 'v1.0', accepted: true })
    }
  );
  expect(consentRes.status).toBe(200);
  const consentBody = (await consentRes.json()) as any;
  expect(consentBody.session.hasConsented).toBe(true);
  expect(consentBody.session.consentVersion).toBe('v1.0');

  const nicknameRes = await fetch(
    `${base}/api/v1/public/guest-session/nickname`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `el_guest_session=${guestToken}`
      },
      body: JSON.stringify({ nickname: '  Camila Invitada  ' })
    }
  );
  expect(nicknameRes.status).toBe(200);
  const nicknameBody = (await nicknameRes.json()) as any;
  expect(nicknameBody.session.contributorNickname).toBe('Camila Invitada');

  // 8. Insertar aporte propio y aporte de otra sesión para verificar aislamiento en Mis aportes
  const otherSessionRes = await fetch(
    `${base}/api/v1/public/guest-entry/${lookupKey}/session`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '654321' })
    }
  );
  const otherSessionBody = (await otherSessionRes.json()) as any;
  const ownAttemptId = randomUUID();
  const alienAttemptId = randomUUID();

  await db.transactions.run(async (tx) => {
    await tx.execute(
      `INSERT INTO upload_attempt (
         id, event_id, guest_session_id, reservation_id, idempotency_key,
         declared_type, declared_size, contributor_nickname, status, created_at, expires_at, updated_at
       ) VALUES
       ($1, $2, $3, $4, $5, 'PHOTO', 1500000, 'Camila Invitada', 'ACCEPTED', NOW(), NOW() + INTERVAL '1 hour', NOW()),
       ($6, $2, $7, $8, $9, 'VIDEO', 8000000, 'Otro Invitado', 'ACCEPTED', NOW(), NOW() + INTERVAL '1 hour', NOW())`,
      ownAttemptId,
      eventId,
      goodPinBody.session.id,
      randomUUID(),
      `idem-up-1-${randomUUID()}`,
      alienAttemptId,
      otherSessionBody.session.id,
      randomUUID(),
      `idem-up-2-${randomUUID()}`
    );
  });

  const contribsRes = await fetch(
    `${base}/api/v1/public/guest-session/contributions`,
    {
      headers: {
        Cookie: `el_guest_session=${guestToken}`
      }
    }
  );
  expect(contribsRes.status).toBe(200);
  const contribsBody = (await contribsRes.json()) as any;
  expect(contribsBody.totalCount).toBe(1);
  expect(contribsBody.contributions[0].attemptId).toBe(ownAttemptId);
  expect(JSON.stringify(contribsBody)).not.toContain(alienAttemptId);

  // 9. Derivación de retiro funciona sin exigir ni recuperar sesión
  const intakeRes = await fetch(
    `${base}/api/v1/public/guest-entry/${lookupKey}/removal-intake`
  );
  expect(intakeRes.status).toBe(200);
  const intakeBody = (await intakeRes.json()) as any;
  expect(intakeBody.requiresSession).toBe(false);
  expect(intakeBody.disclaimer).toContain(
    'La recepción de esta solicitud no constituye una eliminación automática'
  );

  // 10. Regenerar credencial pública revoca el enlace anterior (404) y revoca la sesión guest (401)
  const regenerated = await publicAccessService.regeneratePublicCredential({
    actorContext: orgLogin.actorContext,
    eventId
  });
  expect(regenerated.credential.lookupKey).not.toBe(lookupKey);

  const oldLinkRes = await fetch(
    `${base}/api/v1/public/guest-entry/${lookupKey}`
  );
  expect(oldLinkRes.status).toBe(404);

  const revokedContribsRes = await fetch(
    `${base}/api/v1/public/guest-session/contributions`,
    {
      headers: {
        Cookie: `el_guest_session=${guestToken}`
      }
    }
  );
  expect(revokedContribsRes.status).toBe(401);
  expect(revokedContribsRes.headers.get('set-cookie')).toContain('Max-Age=0');
});
