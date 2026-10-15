#!/usr/bin/env node
/**
 * Phoeve Beta — deployment contract preflight (EL-EP-020, Etapa 1).
 *
 * This script is the executable form of the deployment contract. It never talks
 * to AWS and never changes anything. It does three things:
 *
 *   1. validates the environment contract (infra/beta/beta.env.example and the
 *      host-rendered /srv/phoeve/beta/app.env),
 *   2. validates that the Compose file and the edge configuration still publish
 *      only the approved surface, and
 *   3. optionally probes a running deployment for the fail-closed behaviour of
 *      every blocked capability.
 *
 * Exit code 0 means "the contract holds". Every failure is printed and exits 1.
 *
 * Usage:
 *   node infra/beta/preflight.mjs --env-file infra/beta/beta.env.example
 *   node infra/beta/preflight.mjs --env-file ./app.env --allow-local-edge --allow-tag-images
 *   node infra/beta/preflight.mjs --probe http://localhost:8080
 */

import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Development-only secret value that must never reach the Beta. */
export const DEVELOPMENT_PEPPER = 'eventlens-local-dev-pepper-secret-0123456789abcdef';

const PLACEHOLDER = /(REPLACE_WITH|REPLACE_ON_HOST|CHANGE_ME|TODO|XXX)/i;

const REQUIRED_KEYS = [
  'PHOEVE_API_IMAGE',
  'PHOEVE_WEB_IMAGE',
  'PHOEVE_DATA_ROOT',
  'PUBLIC_ENTRY_BASE_URL',
  'PHOEVE_SITE_ADDRESS',
  'ACME_EMAIL',
  'POSTGRES_USER',
  'POSTGRES_DB',
  'POSTGRES_PASSWORD',
  'IDENTITY_PEPPER_SECRET'
];

const APPROVED_SERVICES = ['postgres', 'migrate', 'api', 'web', 'edge'];

export function parseEnvFile(text) {
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function result() {
  const failures = [];
  const passes = [];
  return {
    failures,
    passes,
    check(condition, message) {
      if (condition) passes.push(message);
      else failures.push(message);
      return Boolean(condition);
    }
  };
}

/**
 * Validate the environment contract.
 *
 * @param {Record<string,string>} env
 * @param {{expectHost?: string, allowLocalEdge?: boolean, allowTagImages?: boolean}} [options]
 */
export function checkEnvironment(env, options = {}) {
  const expectHost = options.expectHost ?? 'beta.phoeve.com';
  const allowLocalEdge = options.allowLocalEdge ?? false;
  const allowTagImages = options.allowTagImages ?? false;
  const report = result();

  for (const key of REQUIRED_KEYS) {
    const value = env[key];
    if (!report.check(Boolean(value), `environment: ${key} is present`)) continue;
    report.check(!PLACEHOLDER.test(value), `environment: ${key} is not a placeholder`);
  }

  if (env.NODE_ENV !== undefined) {
    report.check(
      env.NODE_ENV === 'production',
      'environment: NODE_ENV is production when set in the deployment file'
    );
  }

  const baseUrl = env.PUBLIC_ENTRY_BASE_URL;
  if (baseUrl) {
    let parsed;
    try {
      parsed = new URL(baseUrl);
      report.check(true, 'environment: PUBLIC_ENTRY_BASE_URL is a valid URL');
    } catch {
      report.check(false, 'environment: PUBLIC_ENTRY_BASE_URL is a valid URL');
    }
    if (parsed) {
      // A loopback origin is only tolerated for local validation, which must be
      // requested explicitly with --allow-local-edge.
      const isLocalValidationOrigin =
        allowLocalEdge && /^http:\/\/localhost(:\d+)?$/.test(baseUrl);
      report.check(
        isLocalValidationOrigin ||
          (parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === expectHost),
        `environment: PUBLIC_ENTRY_BASE_URL is https://${expectHost}${
          allowLocalEdge ? ' (or a loopback origin under --allow-local-edge)' : ''
        }`
      );
      report.check(
        !parsed.username && !parsed.password && !parsed.search && !parsed.hash,
        'environment: PUBLIC_ENTRY_BASE_URL carries no credentials, query or fragment'
      );
      report.check(
        parsed.pathname === '/' || parsed.pathname === '',
        'environment: PUBLIC_ENTRY_BASE_URL has no path'
      );
    }
  }

  const siteAddress = env.PHOEVE_SITE_ADDRESS;
  if (siteAddress) {
    const isExpectedHost = siteAddress === expectHost;
    const isLocalValidationSite =
      allowLocalEdge && /^https?:\/\/localhost(:\d+)?$/.test(siteAddress);
    report.check(
      isExpectedHost || isLocalValidationSite,
      `environment: PHOEVE_SITE_ADDRESS is ${expectHost}${
        allowLocalEdge ? ' (or a localhost address under --allow-local-edge)' : ''
      }`
    );
  }

  const pepper = env.IDENTITY_PEPPER_SECRET;
  if (pepper && !PLACEHOLDER.test(pepper)) {
    report.check(
      pepper.length >= 32,
      'environment: IDENTITY_PEPPER_SECRET is at least 32 characters'
    );
    report.check(
      pepper !== 'eventlens-local-dev-pepper-secret-0123456789abcdef',
      'environment: IDENTITY_PEPPER_SECRET is not the development default'
    );
  }

  const dbPassword = env.POSTGRES_PASSWORD;
  if (dbPassword && !PLACEHOLDER.test(dbPassword)) {
    report.check(
      dbPassword.length >= 16,
      'environment: POSTGRES_PASSWORD is at least 16 characters'
    );
    report.check(
      dbPassword !== 'eventlens-local-only',
      'environment: POSTGRES_PASSWORD is not the development default'
    );
  }

  // Blocked capabilities: the value must be absent or explicitly disabled.
  for (const key of ['LOCAL_ADMIN_ENABLED', 'LOCAL_MEDIA_UPLOAD_ENABLED']) {
    const value = env[key];
    report.check(
      value === undefined || value === '' || value === 'false',
      `environment: ${key} is absent or "false"`
    );
  }
  report.check(
    env.LOCAL_ADMIN_AUTHORITY_DIR === undefined,
    'environment: LOCAL_ADMIN_AUTHORITY_DIR is not set in the deployment'
  );
  const minioKeys = Object.keys(env).filter((key) => key.startsWith('MINIO_'));
  report.check(
    minioKeys.length === 0,
    `environment: no MINIO_* variable is defined (found: ${minioKeys.join(', ') || 'none'})`
  );

  for (const key of ['PHOEVE_API_IMAGE', 'PHOEVE_WEB_IMAGE']) {
    const value = env[key];
    if (!value || PLACEHOLDER.test(value)) continue;
    report.check(
      allowTagImages || value.includes('@sha256:'),
      `environment: ${key} is digest-pinned${
        allowTagImages ? ' (tag allowed under --allow-tag-images)' : ''
      }`
    );
  }

  return report;
}

/** Split the `services:` section of a Compose file into per-service blocks. */
export function serviceBlocks(composeText) {
  const blocks = new Map();
  let inServices = false;
  let current = null;
  for (const line of composeText.split(/\r?\n/)) {
    if (/^services:\s*$/.test(line)) {
      inServices = true;
      current = null;
      continue;
    }
    if (inServices && /^[A-Za-z#]/.test(line)) {
      inServices = false;
      current = null;
    }
    if (!inServices) continue;
    const service = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (service) {
      current = service[1];
      blocks.set(current, []);
      continue;
    }
    if (current) blocks.get(current).push(line);
  }
  return blocks;
}

/** Strip whole-line comments so contract checks inspect configuration, not prose. */
export function stripComments(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

/** Validate that the Compose file still publishes only the approved surface. */
export function checkComposeContract(composeText) {
  const report = result();
  const blocks = serviceBlocks(composeText);
  const names = [...blocks.keys()].sort();
  const commentsStripped = stripComments(composeText);
  report.check(
    names.join(',') === 'api,edge,migrate,postgres,web',
    `compose: services are exactly the approved set (found: ${names.join(', ') || 'none'})`
  );

  const api = (blocks.get('api') ?? []).join('\n');
  report.check(/NODE_ENV:\s*production/.test(api), 'compose: api runs with NODE_ENV=production');
  report.check(
    /LOCAL_ADMIN_ENABLED:\s*"?false"?/.test(api),
    'compose: api sets LOCAL_ADMIN_ENABLED=false'
  );
  report.check(
    /LOCAL_MEDIA_UPLOAD_ENABLED:\s*"?false"?/.test(api),
    'compose: api sets LOCAL_MEDIA_UPLOAD_ENABLED=false'
  );
  report.check(/read_only:\s*true/.test(api), 'compose: the api filesystem is read-only');
  report.check(
    !/LOCAL_ADMIN_AUTHORITY_DIR/.test(commentsStripped),
    'compose: no local admin authority directory is mounted'
  );
  report.check(
    !/minio/i.test(commentsStripped),
    'compose: no MinIO service, image or variable is present'
  );

  const servicesWithPorts = [...blocks.entries()]
    .filter(([, lines]) => lines.some((line) => /^\s*ports:/.test(line)))
    .map(([name]) => name);
  report.check(
    servicesWithPorts.length === 1 && servicesWithPorts[0] === 'edge',
    `compose: only the edge publishes ports (found: ${servicesWithPorts.join(', ') || 'none'})`
  );

  report.check(
    /control:\s*\r?\n\s+driver:\s*bridge\s*\r?\n\s+internal:\s*true/.test(composeText),
    'compose: the control network is internal'
  );

  return report;
}

/** Validate that the edge still denies everything outside the approved surface. */
export function checkEdgeContract(caddyText) {
  const report = result();

  report.check(/admin off/.test(caddyText), 'edge: the Caddy admin API is disabled');
  report.check(
    /reverse_proxy api:3000/.test(caddyText),
    'edge: /api/v1 is proxied to the API container'
  );
  report.check(
    /reverse_proxy web:4201/.test(caddyText),
    'edge: the SPA is proxied to the verified spa-server container'
  );
  report.check(
    !/file_server/.test(caddyText),
    'edge: the SPA is never served directly from the host filesystem'
  );
  report.check(
    /Strict-Transport-Security/.test(caddyText),
    'edge: HSTS is sent on the published surface'
  );

  for (const deniedPath of [
    '/api/docs*',
    '/api/v1/openapi.json',
    '/api/*',
    '/media*',
    '/storage*'
  ]) {
    const escaped = deniedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matcher = new RegExp(`handle\\s+${escaped}\\s*\\{\\s*\\r?\\n\\s*respond\\s+404`);
    report.check(matcher.test(caddyText), `edge: ${deniedPath} answers 404`);
  }

  return report;
}

/**
 * Probe a running deployment. Every blocked capability must answer with a
 * non-success status.
 *
 * @param {string} baseUrl
 * @param {{fetchImpl?: typeof fetch}} [options]
 */
export async function probe(baseUrl, options = {}) {
  const doFetch = options.fetchImpl ?? fetch;
  const report = result();
  const base = baseUrl.replace(/\/$/, '');

  const call = async (path, init) => {
    try {
      const response = await doFetch(`${base}${path}`, { redirect: 'manual', ...init });
      return response.status;
    } catch (error) {
      return `ERROR:${error instanceof Error ? error.message : String(error)}`;
    }
  };

  const jsonPost = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}'
  };

  const expected = [
    ['GET', '/api/v1/health/live', undefined, 200],
    ['GET', '/api/v1/health/ready', undefined, 200],
    ['GET', '/api/v1/openapi.json', undefined, 404],
    ['GET', '/api/docs', undefined, 404],
    ['GET', '/api/docs/swagger-ui.css', undefined, 404],
    ['GET', '/media/anything', undefined, 404],
    ['GET', '/storage/anything', undefined, 404],
    ['GET', '/api/v1/public/guest-entry/this-key-does-not-exist', undefined, 404]
  ];

  for (const [method, path, init, status] of expected) {
    const actual = await call(path, method === 'GET' ? undefined : init);
    report.check(actual === status, `probe: ${method} ${path} answers ${status} (got ${actual})`);
  }

  // Blocked capabilities must never answer with a success or redirect status,
  // even when the request carries no session at all. A 401/403/404/503 is the
  // expected fail-closed answer.
  const mustNotSucceed = [
    ['POST', '/api/v1/admin/auth/login', jsonPost],
    ['POST', '/api/v1/organizer/session/login', jsonPost],
    ['POST', '/api/v1/admin/organizers', jsonPost],
    ['GET', '/api/v1/admin/organizers', undefined],
    ['GET', '/api/v1/events', undefined],
    ['POST', '/api/v1/public/guest-session/uploads/presign', jsonPost]
  ];

  for (const [method, path, init] of mustNotSucceed) {
    const actual = await call(path, method === 'GET' ? undefined : init);
    const refused = typeof actual === 'number' && actual >= 400;
    report.check(refused, `probe: ${method} ${path} is refused (got ${actual})`);
  }

  const spa = await call('/', undefined);
  report.check(spa === 200, `probe: GET / serves the SPA application shell (got ${spa})`);

  return report;
}

function absolute(value) {
  return value === '-' || isAbsolute(value) ? value : resolve(process.cwd(), value);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const args = process.argv.slice(2);
  const flagValue = (name) => {
    const index = args.indexOf(name);
    return index === -1 ? null : args[index + 1] ?? null;
  };
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const probeUrl = flagValue('--probe');
  const probeOnly = args.includes('--probe-only');

  // --probe-only checks an already deployed origin. It reads no configuration
  // files, so it can run inside the image that was just published.
  if (probeOnly) {
    if (!probeUrl) {
      console.error('FAIL: --probe-only requires --probe <base-url>');
      process.exitCode = 1;
      return;
    }
    const report = await probe(probeUrl);
    for (const message of report.passes) console.log(`  PASS  ${message}`);
    for (const message of report.failures) console.error(`  FAIL  ${message}`);
    if (report.failures.length > 0) {
      console.error(`\npreflight: ${report.failures.length} contract violation(s).`);
      process.exitCode = 1;
    } else {
      console.log('\npreflight: the published surface matches the contract.');
    }
    return;
  }

  const envPath = absolute(flagValue('--env-file') ?? join(scriptDir, 'beta.env.example'));
  const composePath = absolute(flagValue('--compose') ?? join(scriptDir, 'compose.yaml'));
  const caddyPath = absolute(flagValue('--caddy') ?? join(scriptDir, 'Caddyfile'));

  // `--env-file -` reads the rendered file from stdin so a privileged process is
  // never needed just to read a 0600 secret file.
  const envText = envPath === '-' ? await readStdin() : await readFile(envPath, 'utf8');

  const envReport = checkEnvironment(parseEnvFile(envText), {
    allowLocalEdge: args.includes('--allow-local-edge'),
    allowTagImages: args.includes('--allow-tag-images')
  });
  const composeReport = checkComposeContract(await readFile(composePath, 'utf8'));
  const edgeReport = checkEdgeContract(await readFile(caddyPath, 'utf8'));
  const probeReport = probeUrl ? await probe(probeUrl) : null;

  const sections = [
    ['environment contract', envReport],
    ['compose contract', composeReport],
    ['edge contract', edgeReport],
    ...(probeReport ? [['runtime probe', probeReport]] : [])
  ];

  let failed = 0;
  for (const [title, report] of sections) {
    for (const failure of report.failures) {
      console.error(`FAIL [${title}] ${failure}`);
      failed += 1;
    }
    for (const pass of report.passes) {
      console.log(`ok   [${title}] ${pass}`);
    }
  }

  if (failed > 0) {
    console.error(`\npreflight: ${failed} contract violation(s).`);
    process.exitCode = 1;
  } else {
    console.log('\npreflight: deployment contract holds.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
