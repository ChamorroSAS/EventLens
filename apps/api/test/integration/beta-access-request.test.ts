import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createApplication } from '../../dist/application.js';
import { readConfig } from '../../dist/platform/config/config.js';
import { PublicBetaAccessRequestAdapterService } from '../../dist/identity/beta-access-request.controller.js';

let application: Awaited<ReturnType<typeof createApplication>>;
let base: string;
let adapterService: PublicBetaAccessRequestAdapterService;

beforeAll(async () => {
  if (!process.env.DATABASE_URL && !process.env.PGHOST) {
    throw new Error('REAL_POSTGRES_CONNECTION_REQUIRED');
  }
  const config = readConfig(process.env);
  application = await createApplication(config);
  await application.app.listen(0, '127.0.0.1');
  base = await application.app.getUrl();
  adapterService = application.app.get(PublicBetaAccessRequestAdapterService);
});

afterAll(async () => {
  await application?.app.close();
});

it('EL-TK-208: submits public Beta access requests idempotently without enumeration and enforces validation/429 on real PostgreSQL 16', async () => {
  adapterService.getDomainService().resetRateLimitTracker();
  const email = `beta.visitor.${randomUUID().slice(0, 8)}@eventlens.internal`;

  // 1. Primera solicitud -> 200 neutral
  const firstRes = await fetch(`${base}/api/v1/public/beta-access-requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email })
  });
  expect(firstRes.status).toBe(200);
  const firstBody = (await firstRes.json()) as any;
  expect(firstBody).toEqual({
    outcome: 'REQUEST_RECEIVED',
    message: 'Solicitud recibida.'
  });

  // 2. Segunda solicitud con el mismo correo -> 200 idéntico sin enumeración
  const secondRes = await fetch(`${base}/api/v1/public/beta-access-requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: email.toUpperCase() })
  });
  expect(secondRes.status).toBe(200);
  const secondBody = (await secondRes.json()) as any;
  expect(secondBody).toEqual(firstBody);

  // 3. Correo inválido -> 422 VALIDATION_ERROR
  const invalidRes = await fetch(`${base}/api/v1/public/beta-access-requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'correo-invalido-sin-arroba' })
  });
  expect(invalidRes.status).toBe(422);
  const invalidBody = (await invalidRes.json()) as any;
  expect(invalidBody.code).toBe('VALIDATION_ERROR');
});
