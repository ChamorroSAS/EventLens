import { afterAll, beforeAll, expect, it } from 'vitest';
import { createApplication } from '../../dist/application.js';
import { readConfig } from '../../dist/platform/config/config.js';
let application:Awaited<ReturnType<typeof createApplication>>;
let base:string;
beforeAll(async () => {
  if (!process.env.DATABASE_URL && !process.env.PGHOST) throw new Error('REAL_POSTGRES_CONNECTION_REQUIRED');
  application = await createApplication(readConfig(process.env));
  await application.app.listen(0,'127.0.0.1');
  base = await application.app.getUrl();
});
afterAll(async () => { await application?.app.close(); });
it('serves liveness and real PostgreSQL readiness',async () => {
  expect(await (await fetch(base+'/api/v1/health/live')).json()).toEqual({status:'alive'});
  expect(await (await fetch(base+'/api/v1/health/ready')).json()).toEqual({status:'ready'});
});
it('serves the explicit OpenAPI boundary and sanitized errors',async () => {
  const contract = await (await fetch(base+'/api/v1/openapi.json')).json() as any;
  expect(contract.paths['/api/v1/health/ready'].get.operationId).toBe('getReadiness');
  const response = await fetch(base+'/api/v1/missing');
  expect(response.status).toBe(404);
  const error = await response.json() as any;
  expect(error.code).toBe('NOT_FOUND'); expect(error.correlationId).toBe(response.headers.get('x-correlation-id'));
  expect(error).not.toHaveProperty('stack');
});
