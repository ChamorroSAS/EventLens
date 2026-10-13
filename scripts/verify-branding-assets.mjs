import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const activeDir = resolve(root, 'apps/web/public/assets/branding/phoeve');
const roles = ['logo-primary.svg', 'logo-dark.svg', 'logo-grayscale.svg', 'favicon.svg'];
const sourceNames = ['logo_phoeve.png', 'fondo oscuro.png', 'escala de grises.png', 'logo_favicon.png'];
const sourceDigests = [
  '3ebbda2aac74546cb8efec0cbc6c4ee53b4c7b9ad86e513913b2c824100b36ba',
  '1a67252429c007d4fff7d3006abc28a80ad2856e1691ca32d50abae83a38dfd5',
  '4f3ec255220aa04d11d9a61e3458f39602015c7a917df7a573e826cd52182473',
  'c20f5587864a5e42f3b37f639369c90defa1904015775d26ab4d62584feb517a'
];

async function main() {
  const catalog = await readFile(resolve(root, 'apps/web/src/app/branding/branding-assets.ts'), 'utf8');
  for (let i = 0; i < roles.length; i++) {
    const name = roles[i];
    const bytes = await readFile(resolve(activeDir, name));
    const svg = bytes.toString('utf8');
    if (!svg.includes('xmlns="http://www.w3.org/2000/svg"') ||
        !svg.includes('viewBox=') || !svg.includes('<path ') || !svg.includes('</svg>') ||
        /<(script|image|foreignObject)\b/i.test(svg) || /(?:href|src)\s*=/i.test(svg)) {
      throw new Error(`Unsafe or malformed active Phoeve SVG: ${name}`);
    }
    if (!catalog.includes(`assets/branding/phoeve/${name}`) ||
        !catalog.includes(sourceNames[i]) || !catalog.includes(sourceDigests[i])) {
      throw new Error(`Phoeve catalog metadata mismatch: ${name}`);
    }
    console.log(`[PASS] ${name}: self-contained SVG, sha256=${hash(bytes)}`);
  }

  const index = await readFile(resolve(root, 'apps/web/src/index.html'), 'utf8');
  if (!index.includes('<title>Phoeve</title>') ||
      !index.includes('href="assets/branding/phoeve/favicon.svg"') ||
      index.includes('href="/assets/branding/phoeve/favicon.svg"')) {
    throw new Error('Phoeve title/favicon missing or not base-href-relative');
  }
  const [header, footer, shell, routes] = await Promise.all([
    readFile(resolve(root, 'apps/web/src/app/public-home/app-header.component.html'), 'utf8'),
    readFile(resolve(root, 'apps/web/src/app/public-home/legal-footer.component.html'), 'utf8'),
    readFile(resolve(root, 'apps/web/src/app/organizer/organizer-app-shell.component.ts'), 'utf8'),
    readFile(resolve(root, 'apps/web/src/app/navigation/public-entry-routes.contract.ts'), 'utf8')
  ]);
  for (const [name, source] of [['header', header], ['footer', footer], ['shell', shell]]) {
    if (!source.includes('assets/branding/phoeve/logo-primary.svg') || !source.includes('alt="Phoeve"')) {
      throw new Error(`Active Phoeve logo missing from ${name}`);
    }
    if (source.includes('src="/assets/branding/')) throw new Error(`Absolute branding URL in ${name}`);
  }
  if (!routes.includes('Phoeve') || routes.includes('EventLens —')) {
    throw new Error('Public route titles still reference legacy brand');
  }

  // Preserve historical EventLens master without reinterpreting it as Phoeve.
  const legacy = await readFile(resolve(root, 'docs/branding/assets/EventLens-logo.pdf'));
  if (hash(legacy).toUpperCase() !== '5CAFD9496466EBF7D5246E9AFD891C53DE9588569390F0C56C63C749E3540BA3') {
    throw new Error('Historical EventLens master has changed unexpectedly');
  }

  // Original PNGs are currently conversation sources; require repository upload
  // and a separate visual sign-off before final art/provenance release.
  const sourceDir = resolve(root, 'docs/branding/assets/phoeve');
  let verified = 0;
  for (let i=0; i<sourceNames.length; i++) {
    const filePath = resolve(sourceDir, sourceNames[i]);
    try {
      await stat(filePath);
      const original = await readFile(filePath);
      if (hash(original) !== sourceDigests[i]) throw new Error(`Original source differs: ${sourceNames[i]}`);
      verified++;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  if (verified !== 4) {
    console.warn(`[PENDING] Source PNG provenance not yet committed: ${verified}/4 originals match. Visual approval NOT_EVALUATED.`);
  }
  console.log('[PASS] Automated asset and reference checks; visual/real-browser serving NOT_EVALUATED');
}

main().catch(err => {console.error('[FAIL]',err.message);process.exitCode=1});
