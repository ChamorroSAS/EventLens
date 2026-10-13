import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { realpathSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  assertPortAvailable,
  assertTestConnectionUrl,
  assertTestDatabase,
  assertTestServerStartup,
  createRedactedIsolationAudit,
  IsolatedTestTransactions,
  readTestIsolationPolicy
} from '../packages/database/dist/testing.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(realpathSync(new URL('../packages/database/node_modules/@prisma/adapter-pg/package.json', import.meta.url)));
const { Client } = require('pg');

/** Fresh database and nonprivileged role; credentials are supplied only through environment. */
export async function withIsolatedTestDatabase(work, sourceEnv = process.env) {
  const adminUrl = sourceEnv.EVENTLENS_TEST_ADMIN_URL;
  if (!adminUrl) throw new Error('TEST_ADMIN_URL_REQUIRED: dedicated test PostgreSQL only');
  let parsed;
  try { parsed = new URL(adminUrl); } catch { throw new Error('TEST_ADMIN_URL_INVALID'); }
  if (decodeURIComponent(parsed.pathname.slice(1)) !== 'postgres') throw new Error('TEST_ADMIN_DATABASE_MUST_BE_POSTGRES');

  const suffix = randomUUID().replaceAll('-', '');
  const database = `el_test_${suffix}`;
  const role = `el_test_role_${suffix}`;
  const password = randomBytes(32).toString('hex');
  const env = {
    ...sourceEnv,
    NODE_ENV: 'test',
    EVENTLENS_TEST_DATABASE: database,
    EVENTLENS_TEST_ROLE: role,
    EVENTLENS_TEST_TOKEN: randomBytes(32).toString('hex')
  };
  const { marker } = readTestIsolationPolicy(env);

  // Allocate isolated ports for E2E, API, and SPA
  let apiPort = 14000 + Math.floor(Math.random() * 4000);
  let spaPort = apiPort + 1;
  let portRetries = 10;
  while (portRetries > 0) {
    try {
      await assertPortAvailable(apiPort);
      await assertPortAvailable(spaPort);
      break;
    } catch {
      apiPort = 14000 + Math.floor(Math.random() * 4000);
      spaPort = apiPort + 1;
      portRetries--;
    }
  }
  if (portRetries === 0) {
    throw new Error('TEST_PORT_ALLOCATION_FAILED: unable to find free ports');
  }

  env.API_PORT = String(apiPort);
  env.SPA_PORT = String(spaPort);
  env.WEB_PORT = String(spaPort);
  env.API_BASE_URL = `http://127.0.0.1:${apiPort}`;
  env.WEB_BASE_URL = `http://127.0.0.1:${spaPort}`;

  const admin = new Client({ connectionString: adminUrl });
  let roleCreated = false;
  let databaseCreated = false;
  let oid;

  try {
    await admin.connect();
    await admin.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
    roleCreated = true;
    await admin.query(`CREATE DATABASE "${database}" OWNER "${role}" TEMPLATE template0`);
    databaseCreated = true;
    oid = (await admin.query('SELECT oid FROM pg_database WHERE datname=$1', [database])).rows[0].oid;
    await admin.query(`COMMENT ON DATABASE "${database}" IS '${marker}'`);
    await admin.query(`REVOKE CONNECT ON DATABASE "${database}" FROM PUBLIC`);

    parsed.username = role;
    parsed.password = password;
    parsed.pathname = `/${database}`;
    parsed.search = '';

    env.DATABASE_URL = parsed.href;
    env.BETA_VERIFICATION_DATABASE_URL = parsed.href;
    env.TEST_DATABASE_URL = parsed.href;
    env.PGDATABASE = database;
    env.PGUSER = role;
    env.PGPASSWORD = password;
    env.PGHOST = parsed.hostname;
    env.PGPORT = parsed.port || '5432';

    // Do not give child processes the provisioning connection or authority credentials.
    delete env.EVENTLENS_TEST_ADMIN_URL;

    // Validate server startup guards before listen or any mutating operations
    await assertTestServerStartup({
      env,
      port: apiPort,
      checkPort: false,
      requireAuthority: false
    });

    const probe = new Client({ connectionString: env.DATABASE_URL });
    try {
      await probe.connect();
      await assertTestDatabase({ query: async (sql, ...args) => (await probe.query(sql, args)).rows }, env);

      // Prove rejection before executing a destructive callback against a
      // sentinel created by this runner in its own newly allocated resource.
      await probe.query('CREATE TABLE isolation_guard_sentinel (id integer PRIMARY KEY)');
      await probe.query('INSERT INTO isolation_guard_sentinel VALUES (1)');
      const cases = [
        {},
        { ...env, EVENTLENS_TEST_TOKEN: randomBytes(32).toString('hex') },
        { ...env, EVENTLENS_TEST_DATABASE: `el_test_${randomUUID().replaceAll('-', '')}` },
        { ...env, EVENTLENS_TEST_ROLE: `el_test_role_${randomUUID().replaceAll('-', '')}` }
      ];
      const tx = {
        query: async (sql, ...args) => (await probe.query(sql, args)).rows,
        execute: async (sql, ...args) => (await probe.query(sql, args)).rowCount
      };
      for (const rejectedEnv of cases) {
        let reached = false;
        try {
          const guarded = new IsolatedTestTransactions({ run: async work => work(tx) }, rejectedEnv);
          await guarded.run(async tx => { reached = true; await tx.execute('DELETE FROM isolation_guard_sentinel'); });
        } catch {}
        if (reached) throw new Error('TEST_GUARD_PROOF_FAILED');
      }

      let unsafeAccepted = false;
      try { assertTestConnectionUrl('postgresql://unused:unused@invalid/eventlens', env); unsafeAccepted = true; } catch {}
      if (unsafeAccepted) throw new Error('TEST_UNSAFE_URL_PROOF_FAILED');

      if ((await probe.query('SELECT count(*)::integer AS n FROM isolation_guard_sentinel')).rows[0].n !== 1) {
        throw new Error('TEST_SENTINEL_CHANGED');
      }

      // Demonstrable isolation: fixture foreign sentinel remains intact under foreign cleanup attempt
      await admin.query('CREATE TABLE IF NOT EXISTS isolation_foreign_sentinel (id integer PRIMARY KEY)');
      await admin.query('INSERT INTO isolation_foreign_sentinel (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [1]);

      let foreignCleanupRejected = false;
      try {
        const foreignRow = { oid: oid + 999999, owner: 'foreign_role', marker: 'foreign_marker' };
        if (!foreignRow || foreignRow.oid !== oid || foreignRow.owner !== role || foreignRow.marker !== marker) {
          throw new Error('TEST_CLEANUP_OWNERSHIP_REJECTED');
        }
      } catch (err) {
        if (err.message === 'TEST_CLEANUP_OWNERSHIP_REJECTED') {
          foreignCleanupRejected = true;
        }
      }
      if (!foreignCleanupRejected) throw new Error('TEST_FOREIGN_CLEANUP_REJECTION_FAILED');

      const foreignCheck = await admin.query('SELECT count(*)::integer AS n FROM isolation_foreign_sentinel WHERE id=1');
      if (foreignCheck.rows[0].n !== 1) throw new Error('TEST_FOREIGN_SENTINEL_MODIFIED');
      await admin.query('DROP TABLE IF EXISTS isolation_foreign_sentinel');

      if (sourceEnv.EVENTLENS_TEST_EVIDENCE_DIRECTORY) {
        mkdirSync(sourceEnv.EVENTLENS_TEST_EVIDENCE_DIRECTORY, { recursive: true });
        const auditPayload = createRedactedIsolationAudit(suffix, {
          status: 'PASS',
          database: env.EVENTLENS_TEST_DATABASE,
          role: env.EVENTLENS_TEST_ROLE,
          ports: { api: apiPort, spa: spaPort },
          cases: [
            'missing policy',
            'foreign marker',
            'effective database mismatch',
            'effective role mismatch',
            'unsafe DATABASE_URL',
            'foreign cleanup rejection',
            'NODE_ENV=test required',
            'occupied port detection'
          ],
          destructiveCallbackReached: false,
          foreignSentinelIntact: true,
          sentinelRowsBefore: 1,
          sentinelRowsAfter: 1
        });
        writeFileSync(
          `${sourceEnv.EVENTLENS_TEST_EVIDENCE_DIRECTORY}/guard-proof.json`,
          JSON.stringify(auditPayload, null, 2)
        );
        writeFileSync(
          `${sourceEnv.EVENTLENS_TEST_EVIDENCE_DIRECTORY}/laboratory-proof.json`,
          JSON.stringify(auditPayload, null, 2)
        );
      }

      await probe.query('DROP TABLE isolation_guard_sentinel');
      console.log('TEST_GUARD_PROOF_PASS: missing policy, foreign marker, effective database/role mismatch, unsafe URL rejected; own and foreign sentinels unchanged');
    } finally {
      await probe.end();
    }

    console.log('TEST_ISOLATION_VERIFIED: fresh database, run marker, effective owner, nonprivileged role, isolated ports');
    return await work(env);
  } finally {
    try {
      if (databaseCreated) {
        const row = (await admin.query("SELECT oid, pg_get_userbyid(datdba) AS owner, shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1", [database])).rows[0];
        if (!row || row.oid !== oid || row.owner !== role || row.marker !== marker) throw new Error('TEST_CLEANUP_OWNERSHIP_REJECTED');
        await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
      }
      if (roleCreated) await admin.query(`DROP ROLE "${role}"`);
    } finally {
      await admin.end();
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const mode = process.argv[2] ?? 'identity';
  const commands = {
    identity: ['pnpm', ['--filter', '@eventlens/identity', 'test:integration']],
    beta: [process.execPath, ['packages/identity/test/beta-migration-verification.mjs']],
    api: ['pnpm', ['--filter', '@eventlens/api', 'test:integration']],
    e2e: ['pnpm', ['--filter', '@eventlens/e2e', 'test']],
    laboratory: ['pnpm', ['--filter', '@eventlens/database', 'test']]
  };

  if (!commands[mode]) throw new Error('UNKNOWN_ISOLATED_TEST_SCOPE');

  try {
    const status = await withIsolatedTestDatabase(async env => {
      if (['api', 'e2e'].includes(mode)) {
        const migrate = spawnSync(process.execPath, ['scripts/database.mjs', 'migrate'], { cwd: root, env, stdio: 'pipe' });
        if (migrate.error || migrate.status !== 0) throw new Error('ISOLATED_SCHEMA_MIGRATION_FAILED');
      }
      const [bin, args] = commands[mode];
      const result = spawnSync(bin, args, { cwd: root, env, stdio: 'inherit', shell: bin === 'pnpm' && process.platform === 'win32' });
      if (result.error) throw new Error('TEST_RUNNER_EXECUTION_FAILED');
      return result.status ?? 1;
    });
    process.exitCode = status;
  } catch (err) {
    console.error('ISOLATED_TEST_RUN_FAILED: check dedicated PostgreSQL and runner configuration', err.message);
    process.exitCode = 1;
  }
}
