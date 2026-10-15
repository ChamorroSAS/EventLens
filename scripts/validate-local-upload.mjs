import { spawnSync } from 'node:child_process';
import { withIsolatedTestDatabase } from './isolated-tests.mjs';

// Run inside the workspace image on eventlens-isolated-tests_default.
// Tests use a fresh nonprivileged DB and a random bucket on disposable test-minio.
try {
  process.exitCode = await withIsolatedTestDatabase(async env => {
    const migration = spawnSync(process.execPath, ['scripts/database.mjs', 'migrate'], { env, stdio: 'pipe' });
    if (migration.status !== 0) throw new Error('ISOLATED_UPLOAD_MIGRATION_FAILED');
    return spawnSync('pnpm', ['--filter', '@eventlens/api', 'exec', 'vitest', 'run',
      'test/integration/guest-upload-transfer-http.test.ts', '--no-file-parallelism'], { env, stdio: 'inherit' }).status ?? 1;
  });
} catch (error) {
  console.error(error.message === 'ISOLATED_UPLOAD_MIGRATION_FAILED' ? error.message : 'ISOLATED_UPLOAD_VALIDATION_FAILED');
  process.exitCode = 1;
}
