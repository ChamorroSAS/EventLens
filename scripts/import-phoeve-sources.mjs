import { readFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = process.argv[2];
if (!sourceDir) {
  console.error('Uso: node scripts/import-phoeve-sources.mjs <carpeta-con-los-4-PNG-originales>');
  process.exit(2);
}
const dest = resolve(root, 'docs/branding/assets/phoeve');
const expected = new Map([
  ['logo_phoeve.png', '3ebbda2aac74546cb8efec0cbc6c4ee53b4c7b9ad86e513913b2c824100b36ba'],
  ['fondo oscuro.png', '1a67252429c007d4fff7d3006abc28a80ad2856e1691ca32d50abae83a38dfd5'],
  ['escala de grises.png', '4f3ec255220aa04d11d9a61e3458f39602015c7a917df7a573e826cd52182473'],
  ['logo_favicon.png', 'c20f5587864a5e42f3b37f639369c90defa1904015775d26ab4d62584feb517a']
]);
const sha = b => createHash('sha256').update(b).digest('hex');
const inputs = [];
// Validate all four sources BEFORE modifying the destination.
for (const [name, digest] of expected) {
  const bytes = await readFile(resolve(sourceDir, name));
  if (sha(bytes) !== digest) throw new Error(`SHA256_MISMATCH:${name}. No copiar archivos modificados.`);
  inputs.push({name, bytes});
}
await mkdir(dest, {recursive:true});
for (const {name, bytes} of inputs) {
  const target = resolve(dest, name);
  let exists = false;
  try { await stat(target); exists = true; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (exists) {
    if (sha(await readFile(target)) !== expected.get(name)) throw new Error(`EXISTING_SOURCE_CONFLICT:${name}`);
    console.log(`[OK] ${name} ya existe con el hash esperado`);
  } else {
    await copyFile(resolve(sourceDir, name), target);
    if (sha(await readFile(target)) !== expected.get(name)) throw new Error(`COPY_VERIFICATION_FAILED:${name}`);
    console.log(`[OK] ${name} incorporado sin alterar bytes`);
  }
}
console.log('Cuatro fuentes verificadas. Revisar git status, añadirlas y confirmar el commit en la rama.');
