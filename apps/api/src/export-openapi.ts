import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApplication } from './application.js';
import { readConfig } from './platform/config/config.js';
// Export initializes metadata only: no connection, migrations or business effects.
const {app,document} = await createApplication(readConfig({DATABASE_URL:'postgresql://unused:unused@localhost:5432/unused'}));
try {
  const target = fileURLToPath(new URL('../../../contracts/',import.meta.url));
  const serialized = JSON.stringify(document,null,2)+'\n';
  if (process.argv.includes('--check')) {
    const existing = await readFile(resolve(target,'openapi.json'),'utf8').catch(() => undefined);
    if (existing !== serialized) throw new Error('OPENAPI_CONTRACT_STALE: regenerate the contract and API client.');
  } else {
    await mkdir(target,{recursive:true});
    await writeFile(resolve(target,'openapi.json'),serialized);
  }
} finally { await app.close(); }
