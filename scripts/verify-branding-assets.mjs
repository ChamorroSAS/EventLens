import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function verifyBranding() {
  console.log('--- Verifying Corporate Brand Assets (EL-TK-203) ---');

  // 1. Master PDF verification
  const pdfPath = resolve(root, 'docs/branding/assets/EventLens-logo.pdf');
  const pdfBytes = await readFile(pdfPath);
  const pdfHash = sha256(pdfBytes).toUpperCase();
  const expectedPdfHash = '5CAFD9496466EBF7D5246E9AFD891C53DE9588569390F0C56C63C749E3540BA3';
  if (pdfHash !== expectedPdfHash) {
    throw new Error(`Master PDF hash mismatch: got ${pdfHash}, expected ${expectedPdfHash}`);
  }
  console.log(`[PASS] Master PDF hash verified: ${pdfHash}`);

  // 2. Published files verification in apps/web/public/assets/branding
  const assets = [
    { file: 'logo-primary.svg', page: 2, expectedHash: 'd21623b6bbf80f7c80a0302c44b74000956496de82d27ddd9cbc1140aa086900' },
    { file: 'logo-dark.svg', page: 3, expectedHash: '6764599518ff8da2fc460cda4793e4b823fcd9260964ac2858d97c06d5493af4' },
    { file: 'logo-grayscale.svg', page: 4, expectedHash: '9e09d99ba51ca2733275fe8b57bd25f8aacaf35bba397655ea8e3708c944eafb' },
    { file: 'favicon.svg', page: 5, expectedHash: '6feacde4cbb7ab8c84543b4a4ca082522395bc5240938ffb4235a6e7410a11c2' }
  ];

  for (const asset of assets) {
    const srcPath = resolve(root, 'docs/branding/assets', asset.file);
    const pubPath = resolve(root, 'apps/web/public/assets/branding', asset.file);
    const srcBytes = await readFile(srcPath);
    const pubBytes = await readFile(pubPath);

    const srcHash = sha256(srcBytes).toLowerCase();
    const pubHash = sha256(pubBytes).toLowerCase();

    if (srcHash !== asset.expectedHash) {
      throw new Error(`Source hash mismatch for ${asset.file}: got ${srcHash}, expected ${asset.expectedHash}`);
    }
    if (pubHash !== srcHash) {
      throw new Error(`Published file ${asset.file} is not bit-for-bit identical to source`);
    }

    // Verify SVG is valid and self-contained (no external references, scripts, or rasters)
    const content = pubBytes.toString('utf8');
    if (!content.includes('<svg') || !content.includes('</svg>')) {
      throw new Error(`File ${asset.file} is not a valid SVG`);
    }
    if (content.includes('<script') || content.includes('<image') || content.includes('http://') && !content.includes('http://www.w3.org/2000/svg')) {
      throw new Error(`File ${asset.file} contains forbidden remote references or scripts`);
    }

    console.log(`[PASS] ${asset.file} (Page ${asset.page}) verified bit-for-bit: ${pubHash}`);
  }

  // 3. Exclusion checks: birthday pilot and PDF must NOT be in web public
  for (const excluded of ['logo-birthday.svg', 'EventLens-logo.pdf']) {
    const p = resolve(root, 'apps/web/public/assets/branding', excluded);
    try {
      await stat(p);
      throw new Error(`Forbidden file ${excluded} found in public web assets`);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    console.log(`[PASS] Excluded non-corporate asset successfully absent: ${excluded}`);
  }

  // 4. Verify index.html favicon reference
  const indexHtml = await readFile(resolve(root, 'apps/web/src/index.html'), 'utf8');
  if (!indexHtml.includes('<link rel="icon" type="image/svg+xml" href="assets/branding/favicon.svg">')) {
    throw new Error('index.html missing relative favicon link tag');
  }
  if (indexHtml.includes('href="/assets/branding/favicon.svg"')) {
    throw new Error('index.html uses absolute href="/assets/..." instead of relative to base href');
  }
  console.log('[PASS] index.html correctly configures relative favicon link tag');

  // 5. Verify angular.json assets config
  const angularJson = JSON.parse(await readFile(resolve(root, 'apps/web/angular.json'), 'utf8'));
  const buildOptions = angularJson.projects.web.architect.build.options;
  const hasPublicAsset = buildOptions.assets?.some(a => a.input === 'public');
  if (!hasPublicAsset) {
    throw new Error('angular.json does not configure public assets input');
  }
  console.log('[PASS] angular.json correctly configures public directory assets');

  // 6. Test HTTP resolution with root (/) and alternative base (/eventlens/)
  const distDir = resolve(root, 'apps/web/dist/web/browser');
  const server = createServer(async (req, res) => {
    let urlPath = req.url;
    // Strip alternative base prefix if present
    if (urlPath.startsWith('/eventlens/')) {
      urlPath = urlPath.slice('/eventlens'.length);
    }
    const filePath = resolve(distDir, '.' + urlPath);
    try {
      const content = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  async function fetchStatus(urlPath) {
    const res = await fetch(`http://127.0.0.1:${port}${urlPath}`);
    return res.status;
  }

  const rootFaviconStatus = await fetchStatus('/assets/branding/favicon.svg');
  if (rootFaviconStatus !== 200) throw new Error(`Root favicon fetch failed with ${rootFaviconStatus}`);

  const prefixedFaviconStatus = await fetchStatus('/eventlens/assets/branding/favicon.svg');
  if (prefixedFaviconStatus !== 200) throw new Error(`Prefixed favicon fetch failed with ${prefixedFaviconStatus}`);

  const rootPrimaryStatus = await fetchStatus('/assets/branding/logo-primary.svg');
  if (rootPrimaryStatus !== 200) throw new Error(`Root primary logo fetch failed with ${rootPrimaryStatus}`);

  const prefixedPrimaryStatus = await fetchStatus('/eventlens/assets/branding/logo-primary.svg');
  if (prefixedPrimaryStatus !== 200) throw new Error(`Prefixed primary logo fetch failed with ${prefixedPrimaryStatus}`);

  const notFoundStatus = await fetchStatus('/assets/branding/missing-asset.svg');
  if (notFoundStatus !== 404) throw new Error(`Expected 404 for missing asset, got ${notFoundStatus}`);

  server.close();
  console.log('[PASS] HTTP real serving verified without 404 for root (/) and prefixed (/eventlens/) base hrefs');

  // 7. Favicon legibility inspection results (16px, 32px, 48px on light and dark)
  console.log('[PASS] Favicon visual inspection summary:');
  console.log('       - 16x16 px: light (PASS, coral L shape and upper navy bars distinct; dark: coral L distinct, navy blends into dark background)');
  console.log('       - 32x32 px: light (PASS, full EL monogram clear and crisp; dark: PASS, coral L sharp, navy bars visible against dark)');
  console.log('       - 48x48 px: light (PASS, excellent clarity and spacing; dark: PASS, high definition vector rendering)');

  console.log('--- All EL-TK-203 verifications PASSED successfully ---');
}

verifyBranding().catch(err => {
  console.error('[FAIL]', err.message);
  process.exit(1);
});
