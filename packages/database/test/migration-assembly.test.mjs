import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { assemble } from '../../../scripts/database.mjs';
it('assembles registered migration owners in global order with byte-identical SQL',async () => {
  const manifest = await assemble();
  expect(manifest.length).toBeGreaterThanOrEqual(6);
  expect(manifest.map(m => m.id)).toEqual([...manifest.map(m => m.id)].sort());
  const sequences = manifest.map(m => m.id.split('_')[0]);
  expect(new Set(sequences).size).toBe(manifest.length);
  expect(manifest.filter(m => m.source.startsWith('packages/export-management/')).map(m => m.id)).toEqual(expect.arrayContaining([
    '202610120057_export_request',
    '202610120058_export_preparation',
    '202610120059_export_availability'
  ]));
  for (const migration of manifest) {
    const source = await readFile(new URL('../../../'+migration.source,import.meta.url));
    const copy = await readFile(new URL('../prisma/migrations/'+migration.id+'/migration.sql',import.meta.url));
    expect(copy.equals(source)).toBe(true);
    expect(createHash('sha256').update(copy).digest('hex')).toBe(migration.sha256);
  }
});
