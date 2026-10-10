import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { assemble } from '../../../scripts/database.mjs';
it('assembles registered migration owners in global order with byte-identical SQL',async () => {
  const manifest = await assemble();
  expect(manifest.length).toBeGreaterThanOrEqual(6);
  expect(manifest.map(m => m.id)).toEqual([...manifest.map(m => m.id)].sort());
  for (const migration of manifest) {
    const source = await readFile(new URL('../../../'+migration.source,import.meta.url));
    const copy = await readFile(new URL('../prisma/migrations/'+migration.id+'/migration.sql',import.meta.url));
    expect(copy.equals(source)).toBe(true);
    expect(createHash('sha256').update(copy).digest('hex')).toBe(migration.sha256);
  }
});
