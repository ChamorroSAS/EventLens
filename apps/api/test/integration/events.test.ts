import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { createPrismaClient, readDatabaseUrl, PrismaTransactions } from '@eventlens/database';
import { createApplication } from '../../dist/application.js';
import { readConfig } from '../../dist/platform/config/config.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
let application: Awaited<ReturnType<typeof createApplication>>;
let base: string;
let client: ReturnType<typeof createPrismaClient>;
let txs: PrismaTransactions;

beforeAll(async () => {
  if (!process.env.DATABASE_URL && !process.env.PGHOST) throw new Error('REAL_POSTGRES_CONNECTION_REQUIRED');
  application = await createApplication(readConfig(process.env));
  await application.app.listen(0, '127.0.0.1');
  base = await application.app.getUrl();
  client = createPrismaClient(readDatabaseUrl(process.env));
  txs = new PrismaTransactions(client, 10000);
});

afterAll(async () => {
  await application?.app.close();
  await client?.$disconnect();
});

beforeEach(async () => {
  for (const table of ['event', 'admin_audit_event', 'organizer_session', 'organizer_account', 'beta_invitation']) {
    await txs.run((tx) => tx.execute(`DELETE FROM ${table}`));
  }
});

async function seedOrganizerSession() {
  const now = new Date();
  const invitationId = randomUUID();
  const accountId = randomUUID();
  const sessionId = randomUUID();
  const token = randomUUID();
  const csrf = randomUUID();
  const email = `organizer.${accountId}@eventlens.test`;
  await txs.run((tx) => tx.execute(
    `INSERT INTO beta_invitation (id,email,email_normalized,token_digest,status,issued_by,expires_at)
     VALUES ($1,$2,$3,$4,'PENDING',$5,$6)`,
    invitationId, email, email, digest(randomUUID()), randomUUID(), new Date(now.getTime() + 86_400_000)
  ));
  await txs.run((tx) => tx.execute(
    `INSERT INTO organizer_account (id,email,email_normalized,status,declared_adult,invitation_id)
     VALUES ($1,$2,$3,'ACTIVE',true,$4)`,
    accountId, email, email, invitationId
  ));
  await txs.run((tx) => tx.execute(
    `INSERT INTO organizer_session (id,account_id,token_digest,csrf_token_digest,auth_time,expires_at,last_active_at,idle_expires_at,session_watermark)
     VALUES ($1,$2,$3,$4,$5,$6,$5,$7,1)`,
    sessionId, accountId, digest(token), digest(csrf), now,
    new Date(now.getTime() + 8 * 3_600_000), new Date(now.getTime() + 1_800_000)
  ));
  return { accountId, sessionId, token, csrf };
}

function createEventRequest(options: { body?: unknown; token?: string; csrf?: string; idempotencyKey?: string }) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.token) headers.cookie = `__Host-el_session=${options.token}`;
  if (options.csrf) headers['x-csrf-token'] = options.csrf;
  if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;
  return fetch(base + '/api/v1/events', { method: 'POST', headers, body: JSON.stringify(options.body ?? {}) });
}

it('crea un borrador DRAFT para un organizador autenticado con CSRF y lo audita', async () => {
  const session = await seedOrganizerSession();
  const response = await createEventRequest({ body: { name: 'Boda de Ana y Luis' }, token: session.token, csrf: session.csrf });
  expect(response.status).toBe(201);
  const body = await response.json() as any;
  expect(body).toMatchObject({
    name: 'Boda de Ana y Luis',
    status: 'DRAFT',
    timezone: 'America/Bogota',
    uploadsEnabled: false,
    guestGalleryEnabled: false,
    moderationMode: 'AUTO_PUBLISH',
    pinEnabled: false
  });
  expect(body.id).toMatch(/^[0-9a-f-]{36}$/);

  const rows = await txs.run((tx) => tx.query<{ organizer_id: string; status: string }>(
    'SELECT organizer_id, status FROM event WHERE id = $1', body.id
  ));
  expect(rows).toHaveLength(1);
  expect(rows[0].organizer_id).toBe(session.accountId);
  expect(rows[0].status).toBe('DRAFT');

  const audit = await txs.run((tx) => tx.query<{ procedure: string; result: string }>(
    'SELECT procedure, result FROM admin_audit_event WHERE target_identifier = $1', body.id
  ));
  expect(audit.some((entry) => entry.procedure === 'EVENT_DRAFT_CREATED' && entry.result === 'SUCCESS')).toBe(true);
});

it('reintenta de forma idempotente devolviendo 200 con el mismo evento', async () => {
  const session = await seedOrganizerSession();
  const idempotencyKey = 'idem-' + randomUUID();
  const first = await createEventRequest({ body: { name: 'Conferencia' }, token: session.token, csrf: session.csrf, idempotencyKey });
  const firstBody = await first.json() as any;
  const second = await createEventRequest({ body: { name: 'Conferencia' }, token: session.token, csrf: session.csrf, idempotencyKey });
  expect(first.status).toBe(201);
  expect(second.status).toBe(200);
  expect((await second.json() as any).id).toBe(firstBody.id);

  const total = await txs.run((tx) => tx.query<{ count: number }>('SELECT count(*)::int as count FROM event'));
  expect(total[0].count).toBe(1);
});

it('rechaza reutilizar una clave de idempotencia con parámetros distintos', async () => {
  const session = await seedOrganizerSession();
  const idempotencyKey = 'idem-' + randomUUID();
  const first = await createEventRequest({ body: { name: 'Evento A' }, token: session.token, csrf: session.csrf, idempotencyKey });
  const conflict = await createEventRequest({ body: { name: 'Evento B' }, token: session.token, csrf: session.csrf, idempotencyKey });
  expect(first.status).toBe(201);
  expect(conflict.status).toBe(409);
  const error = await conflict.json() as any;
  expect(error.code).toBe('CONFLICT');
  expect(error.correlationId).toBe(conflict.headers.get('x-correlation-id'));
  expect(error).not.toHaveProperty('stack');
});

it('rechaza la creación sin sesión', async () => {
  const response = await createEventRequest({ body: { name: 'Evento' }, csrf: 'anything' });
  expect(response.status).toBe(401);
});

it('rechaza la creación sin un token CSRF válido', async () => {
  const session = await seedOrganizerSession();
  const missing = await createEventRequest({ body: { name: 'Evento' }, token: session.token });
  expect(missing.status).toBe(403);
  const wrong = await createEventRequest({ body: { name: 'Evento' }, token: session.token, csrf: 'not-the-issued-token' });
  expect(wrong.status).toBe(403);
});

it('rechaza un token de sesión desconocido', async () => {
  const response = await createEventRequest({ body: { name: 'Evento' }, token: randomUUID(), csrf: 'x' });
  expect(response.status).toBe(401);
});

it('rechaza nombres inválidos con un error de validación en español', async () => {
  const session = await seedOrganizerSession();
  const response = await createEventRequest({ body: { name: '   ' }, token: session.token, csrf: session.csrf });
  expect(response.status).toBe(422);
  const error = await response.json() as any;
  expect(error.code).toBe('VALIDATION_ERROR');
  expect(error.message).toContain('nombre');

  const tooLong = await createEventRequest({ body: { name: 'x'.repeat(121) }, token: session.token, csrf: session.csrf });
  expect(tooLong.status).toBe(422);
});
