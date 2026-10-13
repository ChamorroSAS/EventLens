import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { withIsolatedTestDatabase } from '../../../scripts/isolated-tests.mjs';
import { proveAdministrativeCli } from './cli-proof.mjs';
mkdirSync('/evidence', { recursive: true });
function run(args, env = process.env, allowFailure = false) {
  const r = spawnSync('pnpm', args, { cwd: '/workspace', env, encoding: 'utf8' });
  process.stdout.write(r.stdout ?? '');
  if ((r.error || r.status !== 0) && !allowFailure) throw new Error('SCOPED_CHECK_FAILED');
  return r.status ?? 1;
}
run(['--filter', '@eventlens/database', 'test']);
run(['--filter', '@eventlens/identity', 'typecheck']);
run(['--filter', '@eventlens/identity', 'build']);
const cli = await withIsolatedTestDatabase(env => proveAdministrativeCli(env));
writeFileSync('/evidence/cli-proof.json', JSON.stringify(cli, null, 2));
console.log('ADMIN_CLI_PROOF_PASS: private delivery, authentication, single-use and secret-free audit');
await withIsolatedTestDatabase(async env => {
  const exitCode = run(['--filter', '@eventlens/identity', 'exec', 'vitest', 'run', '--no-file-parallelism', '--reporter=default', '--reporter=json', '--outputFile=/evidence/tests.json'], env, true);
  const tests = JSON.parse(readFileSync('/evidence/tests.json', 'utf8'));
  writeFileSync('/evidence/result.json', JSON.stringify({
    change: 'CR-005', tickets: ['EL-TK-215', 'EL-TK-216'],
    runId: env.EVENTLENS_TEST_DATABASE, testedAt: new Date().toISOString(),
    result: tests.success && exitCode === 0 ? 'PASS' : 'FAIL',
    tests: tests.numTotalTests, passed: tests.numPassedTests, failed: tests.numFailedTests,
    postgresql: '16 real dedicated container, temporary database and constrained role',
    guard: 'guard-proof.json (verified before suites)', cli: 'cli-proof.json',
    existingDevelopmentData: 'not accessed; laboratory isolated from development network and volumes',
    exceptionalRecovery: 'BLOCKED: no accepted external operational authorizer/adapter',
    betaReadiness: 'NOT_EVALUATED'
  }, null, 2));
  if (exitCode !== 0) throw new Error('TESTS_FAILED');
});
