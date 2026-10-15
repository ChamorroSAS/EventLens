#!/usr/bin/env node
/**
 * Contract tests for infra/beta/preflight.mjs.
 *
 * Run with the Node.js built-in runner (no workspace dependencies):
 *   node --test infra/beta/preflight.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  checkComposeContract,
  checkEdgeContract,
  checkEnvironment,
  parseEnvFile,
  probe,
  serviceBlocks
} from './preflight.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFile(join(here, name), 'utf8');

const VALID_ENV = {
  PHOEVE_API_IMAGE: `phoeve-api@sha256:${'a'.repeat(64)}`,
  PHOEVE_WEB_IMAGE: `phoeve-web@sha256:${'b'.repeat(64)}`,
  PHOEVE_DATA_ROOT: '/srv/phoeve/beta',
  PUBLIC_ENTRY_BASE_URL: 'https://beta.phoeve.com',
  PHOEVE_SITE_ADDRESS: 'beta.phoeve.com',
  ACME_EMAIL: 'ops@phoeve.com',
  POSTGRES_USER: 'phoeve',
  POSTGRES_DB: 'phoeve',
  POSTGRES_PASSWORD: 'correct-horse-battery-staple',
  IDENTITY_PEPPER_SECRET: '0123456789abcdef0123456789abcdef'
};

const failuresOf = (report) => report.failures.join('\n');

describe('parseEnvFile', () => {
  it('ignores comments, blank lines and unquotes values', () => {
    const parsed = parseEnvFile(
      ['# comment', '', 'A=1', 'B="two words"', "C='three'", 'D='].join('\n')
    );
    assert.deepEqual(parsed, { A: '1', B: 'two words', C: 'three', D: '' });
  });
});

describe('checkEnvironment', () => {
  it('accepts a fully specified production environment', () => {
    const report = checkEnvironment({ ...VALID_ENV });
    assert.equal(report.failures.length, 0, failuresOf(report));
  });

  it('rejects the documented example file because it still holds placeholders', async () => {
    const report = checkEnvironment(parseEnvFile(await read('beta.env.example')));
    assert.ok(report.failures.length > 0, 'example file must not pass as a deployment');
    assert.match(failuresOf(report), /is not a placeholder/);
  });

  it('rejects a non-production public entry URL', () => {
    const http = checkEnvironment({ ...VALID_ENV, PUBLIC_ENTRY_BASE_URL: 'http://beta.phoeve.com' });
    assert.match(failuresOf(http), /PUBLIC_ENTRY_BASE_URL is https/);

    const localhost = checkEnvironment({
      ...VALID_ENV,
      PUBLIC_ENTRY_BASE_URL: 'http://localhost:4200'
    });
    assert.match(failuresOf(localhost), /PUBLIC_ENTRY_BASE_URL is https/);

    const withPort = checkEnvironment({
      ...VALID_ENV,
      PUBLIC_ENTRY_BASE_URL: 'https://beta.phoeve.com:8443'
    });
    assert.equal(withPort.failures.length, 0, failuresOf(withPort));
  });

  it('rejects development secrets', () => {
    const report = checkEnvironment({
      ...VALID_ENV,
      IDENTITY_PEPPER_SECRET: 'eventlens-local-dev-pepper-secret-0123456789abcdef',
      POSTGRES_PASSWORD: 'eventlens-local-only'
    });
    assert.match(failuresOf(report), /IDENTITY_PEPPER_SECRET is not the development default/);
    assert.match(failuresOf(report), /POSTGRES_PASSWORD is not the development default/);
  });

  it('rejects any attempt to enable a blocked capability', () => {
    const report = checkEnvironment({
      ...VALID_ENV,
      LOCAL_ADMIN_ENABLED: 'true',
      LOCAL_MEDIA_UPLOAD_ENABLED: 'true',
      LOCAL_ADMIN_AUTHORITY_DIR: '/home/node/.eventlens/admin-authority',
      MINIO_ENDPOINT: 'http://minio:9000',
      MINIO_ROOT_USER: 'eventlens-local'
    });
    const failures = failuresOf(report);
    assert.match(failures, /LOCAL_ADMIN_ENABLED is absent or "false"/);
    assert.match(failures, /LOCAL_MEDIA_UPLOAD_ENABLED is absent or "false"/);
    assert.match(failures, /LOCAL_ADMIN_AUTHORITY_DIR is not set/);
    assert.match(failures, /no MINIO_\* variable is defined/);
  });

  it('requires digest-pinned images unless tag-only references are explicitly allowed', () => {
    const tagged = { ...VALID_ENV, PHOEVE_API_IMAGE: 'phoeve-api:beta' };
    assert.match(failuresOf(checkEnvironment(tagged)), /is digest-pinned/);
    assert.equal(
      checkEnvironment(tagged, { allowTagImages: true }).failures.length,
      0,
      'tag-only images are allowed for local validation only'
    );
  });

  it('only accepts a localhost edge address when local validation is explicit', () => {
    const local = { ...VALID_ENV, PHOEVE_SITE_ADDRESS: 'http://localhost' };
    assert.match(failuresOf(checkEnvironment(local)), /PHOEVE_SITE_ADDRESS/);
    assert.equal(
      checkEnvironment(local, { allowLocalEdge: true }).failures.length,
      0,
      'localhost must be accepted under --allow-local-edge'
    );

    const localOrigin = {
      ...VALID_ENV,
      PUBLIC_ENTRY_BASE_URL: 'http://localhost:8080',
      PHOEVE_SITE_ADDRESS: 'http://localhost'
    };
    assert.match(failuresOf(checkEnvironment(localOrigin)), /PUBLIC_ENTRY_BASE_URL/);
    assert.equal(
      checkEnvironment(localOrigin, { allowLocalEdge: true }).failures.length,
      0,
      'a loopback origin is only for local validation'
    );
  });
});

describe('checkComposeContract', () => {
  it('accepts the committed Compose contract', async () => {
    const report = checkComposeContract(await read('compose.yaml'));
    assert.equal(report.failures.length, 0, failuresOf(report));
  });

  it('splits services correctly', async () => {
    const blocks = serviceBlocks(await read('compose.yaml'));
    assert.deepEqual([...blocks.keys()].sort(), ['api', 'edge', 'migrate', 'postgres', 'web']);
  });

  it('rejects an extra service that would publish a blocked capability', async () => {
    const text = await read('compose.yaml');
    const injected = text.replace(
      '\nnetworks:\n',
      '\n  minio:\n    image: minio/minio:latest\n\nnetworks:\n'
    );
    const report = checkComposeContract(injected);
    assert.match(failuresOf(report), /services are exactly the approved set/);
    assert.match(failuresOf(report), /no MinIO service, image or variable is present/);
  });

  it('rejects a published port outside the edge', async () => {
    const text = (await read('compose.yaml')).replace(
      '    networks: [control]\n    # No published port',
      '    ports: ["5432:5432"]\n    networks: [control]\n    # No published port'
    );
    const report = checkComposeContract(text);
    assert.match(failuresOf(report), /only the edge publishes ports/);
  });

  it('rejects enabling a blocked flag in the api service', async () => {
    const text = (await read('compose.yaml')).replace(
      'LOCAL_MEDIA_UPLOAD_ENABLED: "false"',
      'LOCAL_MEDIA_UPLOAD_ENABLED: "true"'
    );
    const report = checkComposeContract(text);
    assert.match(failuresOf(report), /LOCAL_MEDIA_UPLOAD_ENABLED=false/);
  });
});

describe('checkEdgeContract', () => {
  it('accepts the committed edge configuration', async () => {
    const report = checkEdgeContract(await read('Caddyfile'));
    assert.equal(report.failures.length, 0, failuresOf(report));
  });

  it('detects a removed deny rule', async () => {
    const text = (await read('Caddyfile')).replace(
      'handle /api/v1/openapi.json {\n\t\trespond 404\n\t}\n',
      ''
    );
    const report = checkEdgeContract(text);
    assert.match(failuresOf(report), /\/api\/v1\/openapi\.json answers 404/);
  });

  it('detects a direct file server that could bypass spa-server.mjs', async () => {
    const report = checkEdgeContract('admin off\nroot * /srv/file_server\nfile_server\n');
    assert.match(failuresOf(report), /never served directly from the host filesystem/);
  });
});

describe('probe', () => {
  const healthy = async (url) => {
    const path = new URL(url).pathname;
    if (path === '/' || path.startsWith('/api/v1/health')) return { status: 200 };
    if (path === '/api/v1/openapi.json' || path.startsWith('/api/docs')) return { status: 404 };
    if (path.startsWith('/media') || path.startsWith('/storage')) return { status: 404 };
    if (path === '/api/v1/public/guest-entry/this-key-does-not-exist') return { status: 404 };
    if (path === '/api/v1/admin/auth/login') return { status: 503 };
    if (path === '/api/v1/organizer/session/login') return { status: 503 };
    return { status: 401 };
  };

  it('passes when every blocked capability is refused', async () => {
    const report = await probe('https://beta.phoeve.com', { fetchImpl: healthy });
    assert.equal(report.failures.length, 0, failuresOf(report));
  });

  it('fails when a blocked capability answers with success', async () => {
    const leaky = async (url) => {
      const path = new URL(url).pathname;
      if (path === '/api/v1/admin/auth/login') return { status: 200 };
      if (path === '/api/v1/openapi.json') return { status: 200 };
      return healthy(url);
    };
    const report = await probe('https://beta.phoeve.com', { fetchImpl: leaky });
    const failures = failuresOf(report);
    assert.match(failures, /POST \/api\/v1\/admin\/auth\/login is refused/);
    assert.match(failures, /openapi\.json answers 404/);
  });

  it('reports a transport error instead of passing', async () => {
    const broken = async () => {
      throw new Error('ECONNREFUSED');
    };
    const report = await probe('https://beta.phoeve.com', { fetchImpl: broken });
    assert.ok(report.failures.length > 0);
    assert.match(failuresOf(report), /ECONNREFUSED/);
  });
});

describe('command line', () => {
  it('refuses --probe-only without a target', () => {
    const result = spawnSync(process.execPath, [join(here, 'preflight.mjs'), '--probe-only'], {
      encoding: 'utf8'
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires --probe/);
  });

  it('rejects the documented example environment file', () => {
    const result = spawnSync(
      process.execPath,
      [join(here, 'preflight.mjs'), '--env-file', join(here, 'beta.env.example')],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /is not a placeholder/);
  });
});
