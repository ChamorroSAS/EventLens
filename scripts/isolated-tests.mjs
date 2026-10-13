import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { realpathSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertTestConnectionUrl, assertTestDatabase, IsolatedTestTransactions, readTestIsolationPolicy } from '../packages/database/dist/testing.js';

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
  const env = { ...sourceEnv, EVENTLENS_TEST_DATABASE: database, EVENTLENS_TEST_ROLE: role, EVENTLENS_TEST_TOKEN: randomBytes(32).toString('hex') };
  const { marker } = readTestIsolationPolicy(env);
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
    parsed.username = role; parsed.password = password; parsed.pathname = `/${database}`; parsed.search = '';
    env.DATABASE_URL = parsed.href;
    env.BETA_VERIFICATION_DATABASE_URL = parsed.href;
    env.TEST_DATABASE_URL = parsed.href;
    env.PGDATABASE = database; env.PGUSER = role; env.PGPASSWORD = password;
    env.PGHOST = parsed.hostname; env.PGPORT = parsed.port || '5432';
    // Do not give child processes the provisioning connection or authority credentials.
    delete env.EVENTLENS_TEST_ADMIN_URL;
    const probe = new Client({ connectionString: env.DATABASE_URL });
    try {
      await probe.connect();
      await assertTestDatabase({ query: async (sql, ...args) => (await probe.query(sql, args)).rows }, env);
      // Prove rejection before executing a destructive callback against a
      // sentinel created by this runner in its own newly allocated resource.
      await probe.query('CREATE TABLE isolation_guard_sentinel (id integer PRIMARY KEY)');
      await probe.query('INSERT INTO isolation_guard_sentinel VALUES (1)');
      const cases = [{}, { ...env, EVENTLENS_TEST_TOKEN: randomBytes(32).toString('hex') },
        { ...env, EVENTLENS_TEST_DATABASE: `el_test_${randomUUID().replaceAll('-', '')}` },
        { ...env, EVENTLENS_TEST_ROLE: `el_test_role_${randomUUID().replaceAll('-', '')}` }];
      const tx = { query: async (sql, ...args) => (await probe.query(sql, args)).rows,
        execute: async (sql, ...args) => (await probe.query(sql, args)).rowCount };
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
      if ((await probe.query('SELECT count(*)::integer AS n FROM isolation_guard_sentinel')).rows[0].n !== 1) throw new Error('TEST_SENTINEL_CHANGED');
      if (sourceEnv.EVENTLENS_TEST_EVIDENCE_DIRECTORY) {
        mkdirSync(sourceEnv.EVENTLENS_TEST_EVIDENCE_DIRECTORY, { recursive: true });
        writeFileSync(`${sourceEnv.EVENTLENS_TEST_EVIDENCE_DIRECTORY}/guard-proof.json`, JSON.stringify({
          result: 'PASS', testedAt: new Date().toISOString(), database: env.EVENTLENS_TEST_DATABASE,
          cases: ['missing policy', 'foreign marker', 'effective database mismatch', 'effective role mismatch', 'unsafe DATABASE_URL'],
          destructiveCallbackReached: false, sentinelRowsBefore: 1, sentinelRowsAfter: 1
        }, null, 2));
      }
      await probe.query('DROP TABLE isolation_guard_sentinel');
      console.log('TEST_GUARD_PROOF_PASS: missing policy, foreign marker, effective database/role mismatch, unsafe URL rejected; own sentinel unchanged');
    } finally { await probe.end(); }
    console.log('TEST_ISOLATION_VERIFIED: fresh database, run marker, effective owner and nonprivileged role');
    return await work(env);
  } finally {
    try {
      if (databaseCreated) {
        const row = (await admin.query("SELECT oid, pg_get_userbyid(datdba) AS owner, shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1", [database])).rows[0];
        if (!row || row.oid !== oid || row.owner !== role || row.marker !== marker) throw new Error('TEST_CLEANUP_OWNERSHIP_REJECTED');
        await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
      }
      if (roleCreated) await admin.query(`DROP ROLE "${role}"`);
    } finally { await admin.end(); }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const mode = process.argv[2] ?? 'identity';
  const commands = {
    identity: ['pnpm', ['--filter', '@eventlens/identity', 'test:integration']],
    beta: [process.execPath, ['packages/identity/test/beta-migration-verification.mjs']],
    api: ['pnpm', ['--filter', '@eventlens/api', 'test:integration']]
  };
  if (!commands[mode]) throw new Error('UNKNOWN_ISOLATED_TEST_SCOPE');
  try {
    const status = await withIsolatedTestDatabase(async env => {
      if (mode === 'api') {
        const migrate = spawnSync(process.execPath, ['scripts/database.mjs', 'migrate'], { cwd: root, env, stdio: 'pipe' });
        if (migrate.error || migrate.status !== 0) throw new Error('ISOLATED_SCHEMA_MIGRATION_FAILED');
      }
      const [bin, args] = commands[mode];
      const result = spawnSync(bin, args, { cwd: root, env, stdio: 'inherit', shell: bin === 'pnpm' && process.platform === 'win32' });
      if (result.error) throw new Error('TEST_RUNNER_EXECUTION_FAILED');
      return result.status ?? 1;
    });
    process.exitCode = status;
  } catch { console.error('ISOLATED_TEST_RUN_FAILED: check dedicated PostgreSQL and runner configuration'); process.exitCode = 1; }
}
