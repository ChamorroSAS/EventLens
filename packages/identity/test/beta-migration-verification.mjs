import { assertTestConnectionUrl, assertTestDatabase } from '@eventlens/database/testing';
// Diagnostic safety assertions for immutable, already-published SQL.
// This deploys only 045/056; it is NOT proof of full workspace assembly/deploy.
import { Client } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const url = process.env.BETA_VERIFICATION_DATABASE_URL;
if (!url) throw new Error('BETA_VERIFICATION_DATABASE_URL_REQUIRED: disposable PostgreSQL only');
assertTestConnectionUrl(url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const databasePackage = resolve(root, 'database');
const identityPackage = resolve(root, 'identity');
const base = '202610120045_beta_access_request';
const dedup = '202610120056_beta_access_request_dedup_and_unique';
const first = '00000000-0000-0000-0000-000000000001';
const second = '00000000-0000-0000-0000-000000000002';
const solo = '00000000-0000-0000-0000-000000000003';
const results = [];

async function scenario(name, verify, clean = false) {
  const schema = `beta_migration_${randomUUID().replaceAll('-', '')}`;
  const fixture = resolve(databasePackage, '.local', schema);
  const admin = new Client({ connectionString: url });
  let client;
  let adminConnected = false;
  let schemaCreated = false;
  try {
    await admin.connect();
    adminConnected = true;
    await assertTestDatabase({ query: async (sql, ...args) => (await admin.query(sql, args)).rows });
    await admin.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    const scoped = new URL(url);
    scoped.searchParams.set('schema', schema);
    // pg gives URL options priority over constructor options. Replace them in
    // the URL itself so caller-supplied search_path cannot escape the fixture.
    scoped.searchParams.set('options', `-c search_path=${schema}`);
    client = new Client({ connectionString: scoped.href });
    await client.connect();
    assert.equal((await client.query('SHOW search_path')).rows[0].search_path, schema);
    assert.equal((await client.query('SELECT current_schema() AS name')).rows[0].name, schema);
    await mkdir(resolve(fixture, 'migrations', base), { recursive: true });
    await writeFile(resolve(fixture, 'migrations/migration_lock.toml'), 'provider = "postgresql"\n');
    await cp(resolve(identityPackage, 'prisma/migrations', base, 'migration.sql'), resolve(fixture, 'migrations', base, 'migration.sql'));
    await writeFile(resolve(fixture, 'schema.prisma'), 'datasource db {\n provider = "postgresql"\n}\nmodel Probe {\n id String @id @db.Uuid\n @@map("beta_access_request")\n}\n');
    await writeFile(resolve(fixture, 'prisma.config.ts'), `import { defineConfig } from 'prisma/config';\nexport default defineConfig({schema:${JSON.stringify(resolve(fixture, 'schema.prisma'))},migrations:{path:${JSON.stringify(resolve(fixture, 'migrations'))}},datasource:{url:process.env.DATABASE_URL!}});\n`);
    const deploy = () => {
      const run = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['exec', 'prisma', 'migrate', 'deploy', '--config', resolve(fixture, 'prisma.config.ts')], {
        cwd: databasePackage, encoding: 'utf8', env: { ...process.env, DATABASE_URL: scoped.href }, timeout: 60000,
        shell: process.platform === 'win32'
      });
      // Never emit datasource URLs or tool output that may contain credentials.
      if (run.error || run.signal || run.status === null) throw new Error('PRISMA_VERIFICATION_EXECUTION_FAILED');
      const output = run.stdout + run.stderr;
      if (run.status !== 0 && !output.includes('P3018')) throw new Error('PRISMA_VERIFICATION_NOT_A_MIGRATION_FAILURE');
      return { status: run.status, conflict: output.includes('MIGRATION_HALTED_DATA_CONFLICT'),
        referenceConflict: output.includes('23503'), injectedFailure: output.includes('INJECTED_FAILURE') };
    };
    const addDedup = async () => {
      await mkdir(resolve(fixture, 'migrations', dedup), { recursive: true });
      await cp(resolve(identityPackage, 'prisma/migrations', dedup, 'migration.sql'), resolve(fixture, 'migrations', dedup, 'migration.sql'));
    };
    if (clean) await addDedup();
    assert.equal(deploy().status, 0, 'initial subset deploy failed');
    const rows = async () => (await client.query('SELECT * FROM beta_access_request ORDER BY id')).rows;
    const seed = async (notes = [null, 'retained note'], states = ['PENDING_REVIEW', 'PENDING_REVIEW']) => {
      await client.query(`INSERT INTO beta_access_request VALUES
        ($1,'same@example.test','same@example.test',$4,$6,'synthetic-hash','2026-01-01','2026-02-01'),
        ($2,'same@example.test','same@example.test',$5,$7,'synthetic-hash','2026-01-01','2026-02-01'),
        ($3,'solo@example.test','solo@example.test','REVIEWED','solo note',NULL,'2026-01-02','2026-02-02')`, [first, second, solo, ...states, ...notes]);
    };
    const migrate = async () => { await addDedup(); return deploy(); };
    const unique = async () => (await client.query("SELECT indisunique FROM pg_index WHERE indexrelid=to_regclass('beta_access_request_email_normalized_key')")).rows[0]?.indisunique === true;
    await verify({ client, rows, seed, migrate, unique });
    results.push({ name, result: 'PASS' });
  } catch (error) {
    results.push({ name, result: 'FAIL', error: error instanceof assert.AssertionError ? error.message : 'VERIFICATION_EXECUTION_ERROR' });
  } finally {
    await client?.end();
    if (adminConnected && schemaCreated) { await assertTestDatabase({ query: async (sql, ...args) => (await admin.query(sql, args)).rows }); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); }
    await admin.end();
    await rm(fixture, { recursive: true, force: true });
  }
}

await scenario('clean subset deploy creates a real unique index', async ({ unique }) => assert.equal(await unique(), true), true);
await scenario('safe upgrade selects lowest id on tied timestamps and preserves solo/timestamps', async ({ seed, rows, migrate, unique }) => {
  await seed(); const before = await rows();
  assert.equal((await migrate()).status, 0);
  const after = await rows();
  assert.equal(after.length, 2); assert.equal(after[0].id, first);
  assert.equal(after[0].notes, 'retained note');
  assert.deepEqual(after[1], before[2]);
  assert.deepEqual(after[0].created_at, before[0].created_at);
  assert.deepEqual(after[0].updated_at, before[0].updated_at);
  assert.equal(await unique(), true);
});
await scenario('divergent notes halt and roll back all business rows', async ({ seed, rows, migrate }) => {
  await seed(['first note', 'different note']); const before = await rows();
  const outcome = await migrate(); assert.notEqual(outcome.status, 0); assert.equal(outcome.conflict, true);
  assert.deepEqual(await rows(), before);
});
await scenario('tied timestamps must update exactly one canonical row', async ({ seed, client, migrate }) => {
  await seed();
  await client.query('CREATE TABLE note_updates (request_id uuid)');
  await client.query('CREATE FUNCTION observe_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO note_updates VALUES (NEW.id); RETURN NEW; END $$');
  await client.query('CREATE TRIGGER observe_update AFTER UPDATE ON beta_access_request FOR EACH ROW EXECUTE FUNCTION observe_update()');
  assert.equal((await migrate()).status, 0);
  const updated = (await client.query('SELECT request_id FROM note_updates ORDER BY request_id')).rows;
  assert.deepEqual(updated, [{ request_id: first }], 'migration updated multiple canonical candidates on tied created_at');
});
await scenario('incompatible statuses must halt without loss', async ({ seed, rows, migrate }) => {
  await seed([null, null], ['PENDING_REVIEW', 'REVIEWED']); const before = await rows();
  const outcome = await migrate();
  assert.notEqual(outcome.status, 0, 'unsafe migration accepted incompatible historical statuses');
  assert.deepEqual(await rows(), before);
});
await scenario('blank canonical note must retain nonblank secondary note', async ({ seed, rows, migrate }) => {
  await seed(['   ', 'retained note']); assert.equal((await migrate()).status, 0);
  assert.equal((await rows())[0].notes, 'retained note', 'nonblank note lost when canonical note was blank');
});
await scenario('cascading dependent reference must halt without loss', async ({ seed, client, rows, migrate }) => {
  await seed(); const before = await rows();
  await client.query('CREATE TABLE dependent_request (id integer PRIMARY KEY, request_id uuid REFERENCES beta_access_request(id) ON DELETE CASCADE)');
  await client.query('INSERT INTO dependent_request VALUES (1,$1)', [second]);
  assert.notEqual((await migrate()).status, 0, 'unsafe migration deleted a referenced duplicate through CASCADE');
  assert.deepEqual(await rows(), before);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM dependent_request')).rows[0].n, 1);
});
await scenario('restricting dependent reference fails and rolls back consolidation', async ({ seed, client, rows, migrate }) => {
  await seed(); const before = await rows();
  await client.query('CREATE TABLE dependent_request (id integer PRIMARY KEY, request_id uuid REFERENCES beta_access_request(id))');
  await client.query('INSERT INTO dependent_request VALUES (1,$1)', [second]);
  const outcome = await migrate();
  assert.notEqual(outcome.status, 0); assert.equal(outcome.referenceConflict, true); assert.deepEqual(await rows(), before);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM dependent_request')).rows[0].n, 1);
});
await scenario('intermediate delete failure rolls back prior note updates', async ({ seed, client, rows, migrate }) => {
  await seed(); const before = await rows();
  await client.query("CREATE FUNCTION reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'INJECTED_FAILURE'; END $$");
  await client.query('CREATE TRIGGER reject_delete BEFORE DELETE ON beta_access_request FOR EACH ROW EXECUTE FUNCTION reject_delete()');
  const outcome = await migrate();
  assert.notEqual(outcome.status, 0); assert.equal(outcome.injectedFailure, true); assert.deepEqual(await rows(), before);
});
await scenario('preexisting nonunique index cannot masquerade as unique', async ({ seed, client, migrate, unique }) => {
  await seed();
  await client.query('CREATE INDEX beta_access_request_email_normalized_key ON beta_access_request(email_normalized)');
  const outcome = await migrate();
  assert.ok(outcome.status !== 0 || await unique(), 'migration succeeded while the purported unique index is nonunique');
});
const bytes = await readFile(resolve(identityPackage, 'prisma/migrations', dedup, 'migration.sql'));
console.log(JSON.stringify({ scope: 'isolated actual Prisma deploy of immutable 045/056 subset; full assembly blocked', sqlSha256: createHash('sha256').update(bytes).digest('hex'), results }, null, 2));
if (results.some(r => r.result === 'FAIL')) process.exitCode = 1;
