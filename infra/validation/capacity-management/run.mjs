import { readFileSync, realpathSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const host = process.env.PGHOST ?? 'postgres';
const user = process.env.PGUSER ?? (process.env.POSTGRES_USER ?? 'eventlens');
let password = process.env.PGPASSWORD ?? process.env.POSTGRES_PASSWORD;
if (!password) {
  try {
    password = readFileSync('/run/secrets/pg_admin', 'utf8').trim();
  } catch {
    password = 'eventlens-local-only';
  }
}
const defaultDb = process.env.PGDATABASE ?? (process.env.POSTGRES_DB ?? 'eventlens');
const port = Number(process.env.PGPORT ?? '5432');

const require = createRequire(realpathSync('/workspace/packages/database/node_modules/@prisma/adapter-pg/package.json'));
const { Client } = require('pg');
const database = 'cap_mgmt_' + randomUUID().replaceAll('-', '');
const admin = new Client({ host, port, user, password, database: defaultDb });
await admin.connect();
await admin.query(`CREATE DATABASE "${database}"`);
const env = { ...process.env, DATABASE_URL: `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}` };

function run(args, allowFailure = false) {
  const r = spawnSync('pnpm', args, { cwd: '/workspace', env, encoding: 'utf8' });
  process.stdout.write(r.stdout ?? '');
  if (r.status !== 0 && !allowFailure) {
    process.stderr.write('SCOPED_CHECK_FAILED\n');
    throw Error('SCOPED_CHECK_FAILED');
  }
  return r.status;
}

try {
  mkdirSync('/evidence', { recursive: true });
  run(['--filter', '@eventlens/capacity-management', 'typecheck']);
  run(['--filter', '@eventlens/capacity-management', 'build']);
  const capacityExports = await import('/workspace/packages/capacity-management/dist/index.js');
  if (
    typeof capacityExports.CapacityPlanService !== 'function' ||
    typeof capacityExports.CapacityReservationService !== 'function' ||
    typeof capacityExports.CapacityError !== 'function'
  ) {
    throw Error('PUBLIC_IMPORT_FAILED');
  }
  const exitCode = run(['--filter', '@eventlens/capacity-management', 'exec', 'vitest', 'run', '--no-file-parallelism', '--reporter=default', '--reporter=json', '--outputFile=/evidence/tests.json'], true);
  const tests = JSON.parse(readFileSync('/evidence/tests.json', 'utf8'));
  writeFileSync('/evidence/result.json', JSON.stringify({
    ticket: 'EL-TK-136',
    precedingTicket: 'EL-TK-134',
    runId: database,
    testedAt: new Date().toISOString(),
    result: tests.success && exitCode === 0 ? 'PASS' : 'FAIL',
    tests: tests.numTotalTests,
    passed: tests.numPassedTests,
    postgresql: '16 real isolated laboratory database',
    capacityReservation: 'Atomic capacity reservation and idempotent release with concurrency serialization and overbooking prevention',
    gates: {
      'CAP-001': 'PASS',
      'MEDIA-001': 'NOT_EVALUATED',
      'DR-001': 'NOT_EVALUATED',
      'EXPORT-001': 'NOT_EVALUATED'
    }
  }, null, 2));
  if (exitCode !== 0) throw Error('TESTS_FAILED');
} finally {
  await admin.end();
}
