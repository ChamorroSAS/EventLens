import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { DurableRecoveryAuthorityAdapter } from '@eventlens/identity';

/** Local, single-process authority; never initialize an empty runtime volume. */
export async function createLocalAdminAuthority(storageDir: string) {
  await access(join(storageDir, 'recovery-journal.ndjson'));
  await access(join(storageDir, 'recovery-checkpoint.json'));
  const authority = new DurableRecoveryAuthorityAdapter({ storageDir });
  await authority.initialize();
  return authority;
}
