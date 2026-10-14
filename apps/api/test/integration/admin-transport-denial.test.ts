import 'reflect-metadata';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { createServer, request, type Server } from 'node:https';
import { assertTestConnectionUrl, assertTestDatabase, assertTestServerStartup } from '@eventlens/database/testing';
import { createApplication } from '../../src/application.js';
import { readConfig } from '../../src/platform/config/config.js';
import { DatabaseService } from '../../src/platform/database/database.service.js';

// Real TLS/HTTP denial evidence only. No operational or simulated RecoveryAuthority is installed.
let application: Awaited<ReturnType<typeof createApplication>>;
let server: Server;
let certificate: Buffer;
let directory: string | undefined;
let port: number;
let origin: string;
let databaseCalls: ReturnType<typeof vi.spyOn>;
const ephemeralSecret = randomBytes(32).toString('hex');

beforeAll(async () => {
  const config = readConfig({ ...process.env, WEB_ORIGIN: `https://127.0.0.1:${process.env.API_PORT}` });
  assertTestConnectionUrl(config.databaseUrl);
  await assertTestServerStartup({ env: process.env, port: config.port, requireAuthority: false });
  port = config.port;
  origin = config.webOrigin;
  application = await createApplication(config);
  const database = application.app.get(DatabaseService);
  await database.transactions.run(tx => assertTestDatabase(tx));
  databaseCalls = vi.spyOn(database.transactions, 'run').mockImplementation(async () => {
    throw new Error('UNEXPECTED_DATABASE_ACCESS_DURING_ADMIN_DENIAL');
  });

  directory = mkdtempSync(join(tmpdir(), 'eventlens-admin-https-'));
  const keyPath = join(directory, 'key.pem');
  const certPath = join(directory, 'cert.pem');
  const openssl = [process.env.OPENSSL_BIN, 'C:/Program Files/Git/usr/bin/openssl.exe', 'C:/Program Files/Git/mingw64/bin/openssl.exe']
    .find(candidate => candidate && existsSync(candidate)) ?? 'openssl';
  const generated = spawnSync(openssl, [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-keyout', keyPath, '-out', certPath, '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'
  ], { stdio: 'pipe' });
  if (generated.error || generated.status !== 0) throw new Error('LABORATORY_TLS_CERTIFICATE_REQUIRED');
  certificate = readFileSync(certPath);
  await application.app.init();
  server = createServer({ key: readFileSync(keyPath), cert: certificate }, application.app.getHttpAdapter().getInstance());
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', done); });
}, 30_000);

afterAll(async () => {
  try {
    if (server?.listening) await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
  } finally {
    databaseCalls?.mockRestore();
    try {
      await application?.app.close();
    } finally {
      if (directory) {
        const target = resolve(directory);
        if (!target.startsWith(resolve(tmpdir()) + sep) || !basename(target).startsWith('eventlens-admin-https-')) {
          throw new Error('LABORATORY_TLS_CLEANUP_OWNERSHIP_REJECTED');
        }
        // This exact directory was returned by mkdtemp in this invocation; never a caller-supplied path.
        rmSync(target, { recursive: true, force: true });
      }
    }
  }
});

async function call(path: string, options: { method?: string; headers?: Record<string, string>; body?: object } = {}) {
  const body = options.body ? JSON.stringify(options.body) : undefined;
  return new Promise<{ status: number; headers: Record<string, any>; body: any }>((done, reject) => {
    const outgoing = request({ hostname: '127.0.0.1', port, path, method: options.method ?? 'GET',
      ca: certificate, rejectUnauthorized: true,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
    }, incoming => {
      const chunks: Buffer[] = [];
      incoming.on('data', chunk => chunks.push(chunk));
      incoming.on('end', () => {
        const payload = Buffer.concat(chunks).toString();
        done({ status: incoming.statusCode!, headers: incoming.headers, body: payload ? JSON.parse(payload) : undefined });
      });
      incoming.on('error', reject);
    });
    outgoing.on('error', reject);
    outgoing.setTimeout(5000, () => outgoing.destroy(new Error('LABORATORY_HTTPS_TIMEOUT')));
    outgoing.end(body);
  });
}

function denied(result: Awaited<ReturnType<typeof call>>, status: number) {
  expect(result.status).toBe(status);
  expect(result.headers['cache-control']).toBe('no-store');
  expect(result.headers['set-cookie']).toBeUndefined();
  expect(result.body).not.toHaveProperty('principal');
  expect(result.body).not.toHaveProperty('items');
  expect(JSON.stringify(result.body).includes(ephemeralSecret)).toBe(false);
  expect(databaseCalls).not.toHaveBeenCalled();
}

it('denies real HTTPS login before SQL when RecoveryAuthority is not configured', async () => {
  const result = await call('/api/v1/admin/auth/login', { method: 'POST',
    headers: { Origin: origin, 'X-EventLens-Admin-Client': '1' }, body: { identifier: 'laboratory-operator', secret: ephemeralSecret } });
  denied(result, 503);
  expect(result.headers['access-control-allow-origin']).toBe(origin);
  expect(result.headers['access-control-allow-credentials']).toBe('true');
});

it.each(['/api/v1/admin/search', '/api/v1/admin/events/00000000-0000-4000-8000-000000000001/aggregated-detail'])(
  'denies anonymous and actor-header spoofing over HTTPS: %s', async path => {
    denied(await call(path, { headers: { 'X-Admin-Actor-Id': 'forged', Cookie: `__Host-el_session=${ephemeralSecret}` } }), 401);
    denied(await call(path, { headers: { Cookie: `__Host-el_admin_session=${ephemeralSecret}` } }), 503);
  });

it('rejects hostile Origin, missing client header and missing CSRF without reaching SQL', async () => {
  denied(await call('/api/v1/admin/auth/login', { method: 'POST', headers: { Origin: 'https://outside.invalid', 'X-EventLens-Admin-Client': '1' }, body: { identifier: 'operator', secret: ephemeralSecret } }), 403);
  denied(await call('/api/v1/admin/auth/login', { method: 'POST', headers: { Origin: origin }, body: { identifier: 'operator', secret: ephemeralSecret } }), 403);
  denied(await call('/api/v1/admin/auth/logout', { method: 'POST', headers: { Origin: origin, Cookie: `__Host-el_admin_session=${ephemeralSecret}` } }), 403);
});

it('rejects context/logout with a presented cookie and no authority without confirming revocation', async () => {
  const headers = { Origin: origin, Cookie: `__Host-el_admin_session=${ephemeralSecret}`, 'X-EventLens-Admin-Client': '1', 'X-CSRF-Token': ephemeralSecret };
  denied(await call('/api/v1/admin/auth/session-context', { method: 'POST', headers }), 503);
  const result = await call('/api/v1/admin/auth/logout', { method: 'POST', headers });
  denied(result, 503);
  expect(result.body).not.toHaveProperty('outcome');
});

it('does not fall back to legacy cookies over HTTPS', async () => {
  denied(await call('/api/v1/admin/search', { headers: { Cookie: `__Host-el_admin_session=; el_admin_session=${ephemeralSecret}` } }), 401);
  expect(databaseCalls).not.toHaveBeenCalled();
});

it('denies session projection without a cookie and denies a presented cookie without authority', async () => {
  denied(await call('/api/v1/admin/auth/session'), 401);
  denied(await call('/api/v1/admin/auth/session', { headers: { Cookie: `__Host-el_admin_session=${ephemeralSecret}` } }), 503);
  expect(databaseCalls).not.toHaveBeenCalled();
});

it('uses an exact CORS origin and credentials on real HTTPS preflight without a wildcard', async () => {
  for (const suppliedOrigin of [origin, 'https://outside.invalid']) {
    const result = await call('/api/v1/admin/auth/login', { method: 'OPTIONS', headers: {
      Origin: suppliedOrigin, 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'X-EventLens-Admin-Client,X-CSRF-Token'
    } });
    expect(result.status).toBe(204);
    expect(result.headers['access-control-allow-origin']).toBe(origin);
    expect(result.headers['access-control-allow-credentials']).toBe('true');
    expect(result.headers['access-control-allow-origin']).not.toBe('*');
    expect(databaseCalls).not.toHaveBeenCalled();
  }
});
