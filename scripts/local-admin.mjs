import { randomBytes, randomUUID } from 'node:crypto';
import { open, readFile, readdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createPrismaClient, PrismaTransactions, readDatabaseUrl } from '../packages/database/dist/index.js';
import { AdminBootstrapService, DurableRecoveryAuthorityAdapter } from '../packages/identity/dist/index.js';

const envFile = '/operator/local.env';
const storageDir = '/home/node/.eventlens/admin-authority';
let client;
try {
  if (process.env.NODE_ENV !== 'development' || process.env.EVENTLENS_DOCKER !== '1') throw new Error('LOCAL_CONTAINER_REQUIRED');
  const contents = await readFile(envFile, 'utf8');
  const settings = parseEnv(contents);
  const mode = process.argv[2];
  if (mode === 'verify') {
    if (!settings.LOCAL_ADMIN_IDENTIFIER || !settings.LOCAL_ADMIN_SECRET) throw new Error('LOCAL_CREDENTIAL_MISSING');
    const origin = process.env.WEB_ORIGIN;
    const base = 'http://api:3000/api/v1';
    const headers = { 'Content-Type': 'application/json', Origin: origin, 'x-eventlens-admin-client': '1' };
    const login = await fetch(`${base}/admin/auth/login`, { method: 'POST', headers, body: JSON.stringify({ identifier: settings.LOCAL_ADMIN_IDENTIFIER, secret: settings.LOCAL_ADMIN_SECRET }) });
    if (login.status !== 200) {
      console.error(`Administrative login HTTP status: ${login.status}`);
      throw new Error('LOGIN_CHECK_FAILED');
    }
    let { csrfToken } = await login.json();
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    if (!cookie?.startsWith('__Host-el_admin_session=')) throw new Error('COOKIE_CHECK_FAILED');
    const session = await fetch(`${base}/admin/auth/session`, { headers: { Cookie: cookie } });
    if (session.status !== 200 || (await session.json()).state !== 'ADMIN_ACTIVE') throw new Error('SESSION_CHECK_FAILED');
    const deniedLogout = await fetch(`${base}/admin/auth/logout`, { method: 'POST', headers: { ...headers, Cookie: cookie, 'x-csrf-token': 'invalid-csrf' } });
    if (deniedLogout.status !== 403) throw new Error('CSRF_CHECK_FAILED');
    const context = await fetch(`${base}/admin/auth/session-context`, { method: 'POST', headers: { ...headers, Cookie: cookie } });
    if (context.status !== 200) throw new Error('CONTEXT_CHECK_FAILED');
    csrfToken = (await context.json()).csrfToken;
    const search = await fetch(`${base}/admin/search?query=local-access-check`, { headers: { Cookie: cookie } });
    if (search.status !== 200) throw new Error('SEARCH_CHECK_FAILED');
    const logout = await fetch(`${base}/admin/auth/logout`, { method: 'POST', headers: { ...headers, Cookie: cookie, 'x-csrf-token': csrfToken } });
    if (logout.status !== 200) throw new Error('LOGOUT_CHECK_FAILED');
    const revoked = await fetch(`${base}/admin/auth/session`, { headers: { Cookie: cookie } });
    if (revoked.status !== 401) throw new Error('REVOCATION_CHECK_FAILED');
    const wrong = await fetch(`${base}/admin/auth/login`, { method: 'POST', headers, body: JSON.stringify({ identifier: settings.LOCAL_ADMIN_IDENTIFIER, secret: 'invalid-local-test-credential' }) });
    if (wrong.status !== 401) throw new Error('INVALID_CREDENTIAL_CHECK_FAILED');
    console.log('PASS: login, cookie, active session, CSRF rejection, context renewal, administrative search, logout, revoked session and invalid credential. No secrets printed.');
  } else if (mode === 'bootstrap') {
    if (settings.LOCAL_ADMIN_SECRET || settings.LOCAL_ADMIN_IDENTIFIER) throw new Error('LOCAL_CREDENTIAL_ALREADY_PRESENT');
    if ((await readdir(storageDir)).length !== 0) throw new Error('FRESH_AUTHORITY_REQUIRED');
    client = createPrismaClient(readDatabaseUrl(process.env), { max: 1, connectionTimeoutMillis: 5000, query_timeout: 10000 });
    const transactions = new PrismaTransactions(client, 10000);
    const authority = new DurableRecoveryAuthorityAdapter({ storageDir });
    await authority.initialize();
    let receipt;
    // Domain bootstrap owns the singleton lock, pristine-state checks, digest and audit.
    // Persist credential before SQL commit, PREPARE before commit, ACK afterwards.
    await transactions.run(async tx => {
      const rows = await tx.query('SELECT pg_is_in_recovery() AS replica');
      if (rows[0]?.replica) throw new Error('FRESH_PRIMARY_REQUIRED');
      await tx.execute("INSERT INTO operational_bootstrap_state (id, is_consumed) VALUES ('SYSTEM_BOOTSTRAP', false) ON CONFLICT DO NOTHING");
      const state = await tx.query("SELECT is_consumed FROM operational_bootstrap_state WHERE id = 'SYSTEM_BOOTSTRAP' FOR UPDATE");
      const counts = await tx.query('SELECT (SELECT COUNT(*) FROM admin_principal)::text AS principals, (SELECT COUNT(*) FROM admin_credential)::text AS credentials, (SELECT COUNT(*) FROM admin_session)::text AS sessions');
      if (state[0]?.is_consumed !== false || [counts[0]?.principals, counts[0]?.credentials, counts[0]?.sessions].some(count => count !== '0')) throw new Error('PRISTINE_ADMINISTRATIVE_STATE_REQUIRED');
      const scoped = { run: work => work(tx) };
      const proof = randomBytes(32).toString('hex');
      const bootstrap = new AdminBootstrapService(scoped, proof);
      const principal = await bootstrap.bootstrap({ identifier: 'admin', operatorToken: proof }, async secret => {
        const handle = await open(envFile, 'r+');
        try {
          if (await handle.readFile('utf8') !== contents) throw new Error('ENV_CHANGED');
          await handle.writeFile(`${contents.endsWith('\n') || !contents ? '' : '\n'}\n# Local administrative access; never commit this file.\nLOCAL_ADMIN_IDENTIFIER=admin\nLOCAL_ADMIN_SECRET=${secret}\nLOCAL_ADMIN_ENABLED=true\n`);
          await handle.sync();
        } finally { await handle.close(); }
      });
      const prepared = await authority.prepare({ operationId: randomUUID(), subjectRef: principal.id, fact: { type: 'CREDENTIAL_ROTATED', data: { initialLocalBootstrap: true } } });
      receipt = prepared.preparedReceipt;
    });
    await authority.ackCommit(receipt, 1n);
    console.log('Local admin created. Identifier and credential saved in .env; bootstrap consumed once.');
  } else throw new Error('UNKNOWN_MODE');
} catch (error) {
  const safeCodes = new Set(['LOCAL_CONTAINER_REQUIRED', 'LOCAL_CREDENTIAL_MISSING', 'LOGIN_CHECK_FAILED', 'COOKIE_CHECK_FAILED', 'SESSION_CHECK_FAILED', 'CSRF_CHECK_FAILED', 'CONTEXT_CHECK_FAILED', 'SEARCH_CHECK_FAILED', 'LOGOUT_CHECK_FAILED', 'REVOCATION_CHECK_FAILED', 'INVALID_CREDENTIAL_CHECK_FAILED', 'LOCAL_CREDENTIAL_ALREADY_PRESENT', 'FRESH_AUTHORITY_REQUIRED', 'FRESH_PRIMARY_REQUIRED', 'ENV_CHANGED', 'PRISTINE_ADMINISTRATIVE_STATE_REQUIRED', 'UNKNOWN_MODE']);
  const code = error instanceof Error && safeCodes.has(error.message) ? error.message : 'LOCAL_ADMIN_FAILED';
  console.error(`${code}: preserve .env and authority volume; inspect state before retrying. No credentials replaced or recovery performed.`);
  process.exitCode = 1;
} finally { await client?.$disconnect(); }
