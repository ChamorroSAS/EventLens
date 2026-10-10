import { readFile, mkdir, writeFile, readdir, cp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'packages/database/prisma');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
/** Owner schemas/DDL are canonical; this assembly is never edited by hand. */
export async function assemble() {
  const registry = JSON.parse(await readFile(resolve(root, 'config/database-modules.json'), 'utf8'));
  if (registry.schemaVersion !== 1 || !Array.isArray(registry.owners) || !registry.owners.length) throw new Error('INVALID_DATABASE_REGISTRY');
  const seenOwners = new Set(), models = new Set(), migrations = new Map(), sequenceIds = new Set(), blocks = [];
  for (const owner of registry.owners) {
    if (!/^packages\/[a-z][a-z0-9-]*$/.test(owner) || seenOwners.has(owner)) throw new Error('INVALID_DATABASE_OWNER');
    seenOwners.add(owner);
    const schema = await readFile(resolve(root, owner, 'prisma/schema.prisma'), 'utf8');
    const definitions = [...schema.matchAll(/^\s*(model|enum|type)\s+(\w+)\s*\{[\s\S]*?^\s*\}/gm)];
    if (definitions.length !== [...schema.matchAll(/^\s*(?:model|enum|type)\s+\w+\s*\{/gm)].length) throw new Error('UNSUPPORTED_SCHEMA_DEFINITION_LAYOUT');
    for (const match of definitions) {
      if (models.has(match[2])) throw new Error(`DUPLICATE_SCHEMA_NAME:${match[2]}`);
      models.add(match[2]); blocks.push(match[0].trim());
    }
    const path = resolve(root, owner, 'prisma/migrations');
    for (const entry of await readdir(path, {withFileTypes:true})) {
      if (!entry.isDirectory()) continue;
      const sequence = entry.name.split('_')[0];
      if (!/^\d{12}_[a-z0-9_]+$/.test(entry.name) || migrations.has(entry.name) || sequenceIds.has(sequence)) throw new Error('DUPLICATE_OR_INVALID_MIGRATION');
      sequenceIds.add(sequence);
      const source = resolve(path, entry.name, 'migration.sql');
      migrations.set(entry.name, {source, sha256: sha(await readFile(source))});
    }
  }
  await mkdir(target, {recursive:true});
  await writeFile(resolve(target, 'schema.prisma'), `// Derived from config/database-modules.json; do not edit.\ngenerator client {\n provider = "prisma-client"\n output = "../src/generated/prisma"\n}\ndatasource db {\n provider = "postgresql"\n}\n${blocks.join('\n')}\n`);
  const derived = resolve(target, 'migrations');
  if (relative(root, derived).replaceAll('\\','/') !== 'packages/database/prisma/migrations') throw new Error('UNSAFE_DERIVED_TARGET');
  await rm(derived, {recursive:true, force:true});
  await mkdir(derived, {recursive:true});
  await writeFile(resolve(derived, 'migration_lock.toml'), 'provider = "postgresql"\n');
  const manifest = [];
  for (const [id, item] of [...migrations].sort(([a],[b]) => a.localeCompare(b))) {
    const destination = resolve(derived, id, 'migration.sql');
    await mkdir(dirname(destination), {recursive:true}); await cp(item.source, destination);
    if (sha(await readFile(destination)) !== item.sha256) throw new Error('MIGRATION_COPY_INTEGRITY');
    manifest.push({id, source:relative(root,item.source).replaceAll('\\','/'), sha256:item.sha256});
  }
  await writeFile(resolve(target, 'migration-manifest.json'), JSON.stringify({schemaVersion:1,migrations:manifest},null,2)+'\n');
  return manifest;
}
async function main() {
  const command = process.argv[2] ?? 'assemble';
  if (!['assemble','generate','migrate'].includes(command)) throw new Error('INVALID_DATABASE_COMMAND');
  let childEnvironment = process.env;
  if (command === 'migrate') {
    const { readDatabaseUrl } = await import('../packages/database/dist/index.js');
    childEnvironment = {...process.env,DATABASE_URL:readDatabaseUrl(process.env)};
  }
  await assemble();
  if (command !== 'assemble') {
    const result = spawnSync('pnpm', ['--filter','@eventlens/database','exec','prisma',...(command === 'generate' ? ['generate'] : ['migrate','deploy'])], {cwd:root,stdio:'inherit',env:childEnvironment,shell:process.platform === 'win32'});
    if (result.status !== 0) throw new Error('PRISMA_COMMAND_FAILED');
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode=1; });
