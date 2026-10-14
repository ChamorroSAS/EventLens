import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PasswordVerifier } from '@eventlens/identity';
import { createApplication } from '../../dist/application.js';
import { readConfig } from '../../dist/platform/config/config.js';
import { DatabaseService } from '../../dist/platform/database/database.service.js';
import { OrganizerSessionService } from '../../dist/identity/organizer-session.service.js';
import { OrganizerEventLifecycleAdapter } from '../../dist/events/organizer-event-lifecycle.js';

let application: Awaited<ReturnType<typeof createApplication>>;
let base: string;
let db: DatabaseService;
let sessions: OrganizerSessionService;
let config: ReturnType<typeof readConfig>;

beforeAll(async () => {
  if (!process.env.DATABASE_URL && !process.env.PGHOST) throw new Error('REAL_POSTGRES_CONNECTION_REQUIRED');
  config = readConfig(process.env);
  application = await createApplication(config);
  await application.app.listen(0, '127.0.0.1');
  base = await application.app.getUrl();
  db = application.app.get(DatabaseService);
  sessions = application.app.get(OrganizerSessionService);
});
afterAll(async () => { await application?.app.close(); });

async function owner() {
  const accountId = randomUUID();
  const invitationId = randomUUID();
  const email = `lifecycle.${accountId}@eventlens.internal`;
  const password = 'LifecycleIntegrationPassword123!';
  const digest = await new PasswordVerifier().hashPassword(password);
  await db.transactions.run(async tx => {
    await tx.execute(`INSERT INTO beta_invitation (id,email,email_normalized,token_digest,status,issued_by,expires_at)
      VALUES ($1,$2,$2,$3,'CONSUMED',$4,$5)`, invitationId, email, createHash('sha256').update(randomBytes(32)).digest('hex'), randomUUID(), new Date(Date.now() + 86400000));
    await tx.execute(`INSERT INTO organizer_account (id,email,email_normalized,status,declared_adult,declared_adult_at,invitation_id,verified_at)
      VALUES ($1,$2,$2,'ACTIVE',true,NOW(),$3,NOW())`, accountId, email, invitationId);
    await tx.execute(`INSERT INTO organizer_credential (id,account_id,purpose,secret_digest,revision,status)
      VALUES ($1,$2,'ORGANIZER_AUTHENTICATION',$3,1,'ACTIVE')`, randomUUID(), accountId, digest);
  });
  const login = await sessions.getAuthService().login({ email, password, origin: config.webOrigin });
  const headers = { Cookie: `__Host-el_session=${login.sessionToken}`, Origin: config.webOrigin, 'X-CSRF-Token': login.csrfToken, 'Content-Type': 'application/json' };
  return { accountId, login, headers };
}

async function draft(headers: Record<string, string>) {
  const created = await fetch(`${base}/api/v1/events`, { method: 'POST', headers: { ...headers, 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ name: 'Lifecycle integration' }) });
  expect(created.status).toBe(201);
  const eventId = ((await created.json()) as any).event.id as string;
  const configuration = await fetch(`${base}/api/v1/events/${eventId}/configuration`, { headers });
  const revision = ((await configuration.json()) as any).revision;
  const schedule = await fetch(`${base}/api/v1/events/${eventId}/configuration/schedule`, {
    method: 'PUT', headers: { ...headers, 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ startsAtLocal: new Date(Date.now() + 86400000).toISOString().slice(0, 19), expectedRevision: revision })
  });
  expect(schedule.status).toBe(200);
  expect(((await schedule.json()) as any).event.status).toBe('DRAFT');
  return eventId;
}

async function snapshot(eventId: string, headers: Record<string, string>) {
  const response = await fetch(`${base}/api/v1/events/${eventId}/lifecycle`, { headers });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  return (await response.json()) as any;
}

function command(eventId: string, action: string, revision: string, headers: Record<string, string>, key = randomUUID()) {
  return fetch(`${base}/api/v1/events/${eventId}/lifecycle/${action}`, { method: 'POST', headers: { ...headers, 'Idempotency-Key': key }, body: JSON.stringify({ expectedRevision: revision }) });
}

it('publishes configured draft, activates with unchanged expiration and replays durable schedule receipt after activation', async () => {
  const actor = await owner();
  const eventId = await draft(actor.headers);
  const initial = await snapshot(eventId, actor.headers);
  expect(initial).toMatchObject({ status: 'DRAFT', validityDurationDays: 30, graceDays: 7, capabilities: { canSchedule: true, canActivateEarly: false } });
  const key = randomUUID();
  const published = await command(eventId, 'schedule', initial.revision, actor.headers, key);
  expect(published.status).toBe(200);
  expect(await published.json()).toEqual({ eventId, outcome: 'SCHEDULED' });
  const scheduled = await snapshot(eventId, actor.headers);
  expect(scheduled.status).toBe('SCHEDULED');
  expect(scheduled.revision).not.toBe(initial.revision);
  const activated = await command(eventId, 'activate', scheduled.revision, actor.headers);
  expect(activated.status).toBe(200);
  expect(await activated.json()).toEqual({ eventId, outcome: 'ACTIVATED' });
  const active = await snapshot(eventId, actor.headers);
  expect(active).toMatchObject({ status: 'ACTIVE', scheduledAt: scheduled.scheduledAt, expiresAt: scheduled.expiresAt, graceEndsAt: scheduled.graceEndsAt });
  const replay = await command(eventId, 'schedule', initial.revision, actor.headers, key);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toEqual({ eventId, outcome: 'IDEMPOTENT_REPLAY' });
  expect((await snapshot(eventId, actor.headers)).revision).toBe(active.revision);
  expect((await command(eventId, 'activate', active.revision, actor.headers, key)).status).toBe(409);
}, 30000);

it('serializes competing revisions and rejects ownership, CSRF, Origin and restricted sessions', async () => {
  const actor = await owner();
  const alien = await owner();
  const eventId = await draft(actor.headers);
  const initial = await snapshot(eventId, actor.headers);
  expect((await fetch(`${base}/api/v1/events/${eventId}/lifecycle`, { headers: alien.headers })).status).toBe(404);
  expect((await command(eventId, 'schedule', initial.revision, alien.headers)).status).toBe(404);
  expect((await command(eventId, 'schedule', initial.revision, { ...actor.headers, 'X-CSRF-Token': 'invalid' })).status).toBe(403);
  expect((await command(eventId, 'schedule', initial.revision, { ...actor.headers, Origin: 'https://untrusted.invalid' })).status).toBe(403);
  const competing = await Promise.all([command(eventId, 'schedule', initial.revision, actor.headers), command(eventId, 'schedule', initial.revision, actor.headers)]);
  expect(competing.map(r => r.status).sort()).toEqual([200, 409]);
  await db.transactions.run(tx => tx.execute("UPDATE organizer_account SET status='PENDING_DELETION' WHERE id=$1", actor.accountId));
  expect((await fetch(`${base}/api/v1/events/${eventId}/lifecycle`, { headers: actor.headers })).status).toBe(403);
  expect((await command(eventId, 'activate', initial.revision, actor.headers)).status).toBe(403);
}, 30000);

it('rolls back domain transition and success audit when durable receipt persistence fails', async () => {
  const actor = await owner();
  const eventId = await draft(actor.headers);
  const initial = await snapshot(eventId, actor.headers);
  const auditCount = async () => db.transactions.run(tx => tx.query<{ count: bigint }>('SELECT count(*) AS count FROM admin_audit_event WHERE target_identifier=$1', eventId));
  const before = (await auditCount())[0].count;
  const adapter = new OrganizerEventLifecycleAdapter({ run: work => db.transactions.run(tx => work({
    query: (sql, ...args) => tx.query(sql, ...args),
    execute: (sql, ...args) => {
      if (sql.includes('INSERT INTO event_command_receipt')) throw new Error('INJECTED_RECEIPT_FAILURE');
      return tx.execute(sql, ...args);
    }
  })) }, sessions);
  await expect(adapter.command('schedule', { eventId, cookieHeader: actor.headers.Cookie, originHeader: config.webOrigin, csrfToken: actor.login.csrfToken, idempotencyKey: randomUUID(), body: { expectedRevision: initial.revision } })).rejects.toThrow('INJECTED_RECEIPT_FAILURE');
  expect(await snapshot(eventId, actor.headers)).toMatchObject({ status: 'DRAFT', revision: initial.revision });
  expect((await auditCount())[0].count).toBe(before);
}, 30000);

it('does not activate an expired scheduled timeline and suppresses its activation capability', async () => {
  const actor = await owner();
  const eventId = await draft(actor.headers);
  const initial = await snapshot(eventId, actor.headers);
  expect((await command(eventId, 'schedule', initial.revision, actor.headers)).status).toBe(200);
  await db.transactions.run(tx => tx.execute('UPDATE event SET expires_at=$1 WHERE id=$2', new Date(Date.now() - 1000), eventId));
  const expired = await snapshot(eventId, actor.headers);
  expect(expired.capabilities.canActivateEarly).toBe(false);
  expect((await command(eventId, 'activate', expired.revision, actor.headers)).status).toBe(409);
  expect((await snapshot(eventId, actor.headers)).status).toBe('SCHEDULED');
}, 30000);

async function prepareShare(eventId: string, revision: string, headers: Record<string, string>, key = randomUUID()) {
  return fetch(`${base}/api/v1/events/${eventId}/share-access`, { method: 'POST', headers: { ...headers, 'Idempotency-Key': key }, body: JSON.stringify({ expectedRevision: revision }) });
}

it('prepares one scheduled QR under concurrent calls and retains its key after activation with guest lifecycle gating', async () => {
  const actor = await owner();
  const eventId = await draft(actor.headers);
  const initial = await snapshot(eventId, actor.headers);
  expect((await prepareShare(eventId, initial.revision, actor.headers)).status).toBe(409);
  expect((await command(eventId, 'schedule', initial.revision, actor.headers)).status).toBe(200);
  const scheduled = await snapshot(eventId, actor.headers);
  const key = randomUUID();
  const prepared = await Promise.all([prepareShare(eventId, scheduled.revision, actor.headers, key), prepareShare(eventId, scheduled.revision, actor.headers)]);
  expect(prepared.map(r => r.status)).toEqual([200, 200]);
  const outcomes = await Promise.all(prepared.map(r => r.json() as Promise<any>));
  expect(outcomes.map(r => r.outcome).sort()).toEqual(['IDEMPOTENT_REPLAY', 'ISSUED']);
  const shareResponse = await fetch(`${base}/api/v1/events/${eventId}/share-access`, { headers: actor.headers });
  expect(shareResponse.status).toBe(200);
  const share = (await shareResponse.json()) as any;
  expect(share.qrSvg).toContain('<svg');
  const scheduledGuest = await fetch(`${base}/api/v1/public/guest-entry/${share.lookupKey}`);
  expect(scheduledGuest.status).toBe(200);
  expect(((await scheduledGuest.json()) as any).access.accessState).toBe('RESTRICTED');
  expect((await command(eventId, 'activate', scheduled.revision, actor.headers)).status).toBe(200);
  expect((await prepareShare(eventId, scheduled.revision, actor.headers, key)).status).toBe(200);
  const activeShare = await fetch(`${base}/api/v1/events/${eventId}/share-access`, { headers: actor.headers });
  expect(((await activeShare.json()) as any).lookupKey).toBe(share.lookupKey);
  const activeGuest = await fetch(`${base}/api/v1/public/guest-entry/${share.lookupKey}`);
  expect(activeGuest.status).toBe(200);
  expect(((await activeGuest.json()) as any).access.accessState).toBe('ALLOWED');
  const credentials = await db.transactions.run(tx => tx.query<{ count: bigint }>('SELECT count(*) AS count FROM public_access_credential WHERE event_id=$1', eventId));
  expect(BigInt(credentials[0].count)).toBe(1n);
}, 30000);

it('share preparation rejects nonowners, invalid Origin/CSRF and restricted session reads', async () => {
  const actor = await owner();
  const alien = await owner();
  const eventId = await draft(actor.headers);
  const initial = await snapshot(eventId, actor.headers);
  expect((await command(eventId, 'schedule', initial.revision, actor.headers)).status).toBe(200);
  const scheduled = await snapshot(eventId, actor.headers);
  expect((await prepareShare(eventId, scheduled.revision, alien.headers)).status).toBe(404);
  expect((await fetch(`${base}/api/v1/events/${eventId}/share-access`, { headers: alien.headers })).status).toBe(404);
  expect((await prepareShare(eventId, scheduled.revision, { ...actor.headers, Origin: 'https://untrusted.invalid' })).status).toBe(403);
  expect((await prepareShare(eventId, scheduled.revision, { ...actor.headers, 'X-CSRF-Token': 'invalid' })).status).toBe(403);
  expect((await prepareShare(eventId, scheduled.revision, actor.headers)).status).toBe(200);
  await db.transactions.run(tx => tx.execute("UPDATE organizer_account SET status='PENDING_DELETION' WHERE id=$1", actor.accountId));
  expect((await prepareShare(eventId, scheduled.revision, actor.headers)).status).toBe(403);
  expect((await fetch(`${base}/api/v1/events/${eventId}/share-access`, { headers: actor.headers })).status).toBe(403);
}, 30000);
