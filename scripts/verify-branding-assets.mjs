import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = b => createHash('sha256').update(b).digest('hex');
const mapping = [
  ['logo_phoeve.png','logo-primary.png'],
  ['fondo oscuro.png','logo-dark.png'],
  ['escala de grises.png','logo-grayscale.png'],
  ['logo_favicon.png','favicon.png']
];

async function main() {
  const manifest = JSON.parse(await readFile(resolve(root,'docs/branding/phoeve-source-manifest.json'),'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.assets?.length !== 4) throw Error('INVALID_PHOEVE_MANIFEST');
  const catalog = await readFile(resolve(root,'apps/web/src/app/branding/branding-assets.ts'),'utf8');

  for (const [originalName,runtimeName] of mapping) {
    const item = manifest.assets.find(a=>a.originalName===originalName);
    if (!item) throw Error(`MISSING_SOURCE:${originalName}`);
    const source = await readFile(resolve(root,'docs/branding/assets/phoeve',originalName));
    const published = await readFile(resolve(root,'apps/web/public/assets/branding/phoeve',runtimeName));
    const sourceHash = sha256(source);
    if (sourceHash !== item.sha256 || item.bytes !== source.length) throw Error(`SOURCE_HASH_MISMATCH:${originalName}`);
    if (!source.equals(published)) throw Error(`PUBLISHED_ASSET_DIFFERS:${runtimeName}`);
    if (source.subarray(0,8).toString('hex') !== '89504e470d0a1a0a' ||
        source.readUInt32BE(16) !== item.width || source.readUInt32BE(20) !== item.height ||
        source[25] !== 6) throw Error(`INVALID_PNG_METADATA:${originalName}`);
    if (!catalog.includes(`assets/branding/phoeve/${runtimeName}`) ||
        !catalog.includes(originalName) || !catalog.includes(sourceHash)) throw Error(`CATALOG_MISMATCH:${runtimeName}`);
    console.log(`[PASS] ${runtimeName}: byte-identical, sha256=${sourceHash}`);
  }

  const index = await readFile(resolve(root,'apps/web/src/index.html'),'utf8');
  if (!index.includes('<title>Phoeve</title>') ||
      !index.includes('type="image/png" href="assets/branding/phoeve/favicon.png"') ||
      index.includes('href="/assets/branding/phoeve/')) throw Error('INVALID_PHOEVE_DOCUMENT_HEAD');

  const [header,footer,shell,routes]=await Promise.all([
    readFile(resolve(root,'apps/web/src/app/public-home/app-header.component.html'),'utf8'),
    readFile(resolve(root,'apps/web/src/app/public-home/legal-footer.component.html'),'utf8'),
    readFile(resolve(root,'apps/web/src/app/organizer/organizer-app-shell.component.ts'),'utf8'),
    readFile(resolve(root,'apps/web/src/app/navigation/public-entry-routes.contract.ts'),'utf8')
  ]);
  for (const [name,text] of [['header',header],['footer',footer],['shell',shell]]) {
    if (!text.includes('assets/branding/phoeve/logo-primary.png') ||
        !text.includes('alt="Phoeve"') || text.includes('src="/assets/branding/'))
      throw Error(`INVALID_ACTIVE_LOGO:${name}`);
  }
  if (routes.includes('EventLens —') || !routes.includes('Phoeve')) throw Error('STALE_PUBLIC_TITLES');

  const historical = await readFile(resolve(root,'docs/branding/assets/EventLens-logo.pdf'));
  if (sha256(historical).toUpperCase() !== '5CAFD9496466EBF7D5246E9AFD891C53DE9588569390F0C56C63C749E3540BA3') {
    throw Error('HISTORICAL_MASTER_CHANGED');
  }

  const angular=JSON.parse(await readFile(resolve(root,'apps/web/angular.json'),'utf8'));
  if (!angular.projects.web.architect.build.options.assets?.some(a=>a.input==='public'))
    throw Error('WEB_PUBLIC_ASSETS_NOT_REGISTERED');

  console.log('[PASS] Archivo canónico -> runtime verificado en 4/4; sin modificación de PNG ni del master histórico.');
  console.log('[NOT_EVALUATED] Transparencia efectiva, legibilidad 16/32/48, navegación real raíz/prefijo y aprobación visual.');
}

main().catch(e => { console.error('[FAIL]',e.message);process.exitCode=1; });
