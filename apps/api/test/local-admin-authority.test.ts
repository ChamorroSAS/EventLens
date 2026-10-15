import { mkdtemp, rm, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { DurableRecoveryAuthorityAdapter } from '@eventlens/identity';
import { createLocalAdminAuthority } from '../src/identity/local-admin-authority.js';

it('refuses empty or corrupt authority and preserves credential binding on restart', async () => {
  const storageDir = await mkdtemp(join(tmpdir(), 'local-admin-'));
  try {
    await expect(createLocalAdminAuthority(storageDir)).rejects.toThrow();
    const authority = new DurableRecoveryAuthorityAdapter({ storageDir });
    await authority.initialize();
    const prepared = await authority.prepare({ operationId: randomUUID(), subjectRef: 'admin-local', fact: { type: 'CREDENTIAL_ROTATED', data: { initialLocalBootstrap: true } } });
    await authority.ackCommit(prepared.preparedReceipt, 1n);
    const restarted = await createLocalAdminAuthority(storageDir);
    expect(await restarted.getCredentialRevision('admin-local')).toBe(1n);
    expect(await restarted.getAdminAuthWatermark('admin-local')).toBe(1n);
    await appendFile(join(storageDir, 'recovery-journal.ndjson'), 'invalid-journal\n');
    await expect(createLocalAdminAuthority(storageDir)).rejects.toThrow();
  } finally { await rm(storageDir, { recursive: true, force: true }); }
});
