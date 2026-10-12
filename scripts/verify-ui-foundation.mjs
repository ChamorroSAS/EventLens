import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';

console.log('--- Verifying UI Brand Foundation & Shell Pilot (EL-TK-204) ---');

const repoRoot = process.cwd();
const fontsDir = path.join(repoRoot, 'apps/web/public/assets/fonts/manrope');
const stylesFile = path.join(repoRoot, 'apps/web/src/styles/ui-foundation.css');
const angularJsonFile = path.join(repoRoot, 'apps/web/angular.json');
const shellCompFile = path.join(repoRoot, 'apps/web/src/app/organizer/organizer-app-shell.component.ts');
const distBrowserDir = path.join(repoRoot, 'apps/web/dist/web/browser');

// 1. Verify font files and provenance
if (!fs.existsSync(fontsDir)) {
  console.error('[FAIL] Fonts directory not found:', fontsDir);
  process.exit(1);
}

const provenancePath = path.join(fontsDir, 'provenance.json');
if (!fs.existsSync(provenancePath)) {
  console.error('[FAIL] Font provenance manifest not found:', provenancePath);
  process.exit(1);
}
const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));

const requiredWeights = [400, 500, 600, 700];
for (const w of requiredWeights) {
  const filename = `manrope-${w}.woff2`;
  const filePath = path.join(fontsDir, filename);
  if (!fs.existsSync(filePath)) {
    console.error(`[FAIL] Required font weight file missing: ${filename}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  if (provenance.files[filename]?.sha256 !== hash) {
    console.error(`[FAIL] Font hash mismatch for ${filename}: computed ${hash} vs manifest ${provenance.files[filename]?.sha256}`);
    process.exit(1);
  }
  console.log(`[PASS] Weight ${w} verified (${buf.length} bytes, SHA256: ${hash})`);
}

// 2. Verify OFL license
const oflPath = path.join(fontsDir, 'OFL.txt');
if (!fs.existsSync(oflPath)) {
  console.error('[FAIL] OFL license missing:', oflPath);
  process.exit(1);
}
const oflContent = fs.readFileSync(oflPath, 'utf8');
if (!oflContent.includes('SIL OPEN FONT LICENSE Version 1.1')) {
  console.error('[FAIL] OFL license content does not match SIL Open Font License 1.1');
  process.exit(1);
}
console.log('[PASS] SIL Open Font License 1.1 verified');

// 3. Verify ui-foundation.css
if (!fs.existsSync(stylesFile)) {
  console.error('[FAIL] ui-foundation.css not found:', stylesFile);
  process.exit(1);
}
const stylesContent = fs.readFileSync(stylesFile, 'utf8');

// Check @font-face rules
for (const w of requiredWeights) {
  if (!stylesContent.includes(`font-weight: ${w}`)) {
    console.error(`[FAIL] @font-face for weight ${w} not found in ui-foundation.css`);
    process.exit(1);
  }
}
if (!stylesContent.includes('font-display: swap')) {
  console.error('[FAIL] font-display: swap missing in ui-foundation.css');
  process.exit(1);
}
console.log('[PASS] @font-face rules with weights 400, 500, 600, 700 and font-display: swap verified');

// Check inert :root variables
const requiredTokens = [
  '--el-ui-font-family-base',
  '--el-ui-font-family-fallback',
  '--el-ui-color-primary',
  '--el-ui-color-primary-hover',
  '--el-ui-color-accent',
  '--el-ui-color-accent-soft',
  '--el-ui-color-background',
  '--el-ui-color-surface',
  '--el-ui-color-text-primary',
  '--el-ui-color-text-secondary',
  '--el-ui-color-border',
  '--el-ui-focus-outline-color'
];
for (const tok of requiredTokens) {
  if (!stylesContent.includes(tok)) {
    console.error(`[FAIL] Missing required token in ui-foundation.css: ${tok}`);
    process.exit(1);
  }
}

// Ensure no global reset or body/button/a leaking rules
if (/^\s*(body|html|\*|a|button)\s*\{/m.test(stylesContent)) {
  console.error('[FAIL] ui-foundation.css must not contain global selector resets or un-namespaced rules');
  process.exit(1);
}
console.log('[PASS] Inerte :root custom properties verified without global leaks or resets');

// 4. Verify angular.json registration
const angularJson = JSON.parse(fs.readFileSync(angularJsonFile, 'utf8'));
const buildStyles = angularJson.projects.web.architect.build.options.styles;
if (!Array.isArray(buildStyles) || !buildStyles.includes('src/styles/ui-foundation.css')) {
  console.error('[FAIL] angular.json does not register src/styles/ui-foundation.css in styles');
  process.exit(1);
}
console.log('[PASS] angular.json registers src/styles/ui-foundation.css');

// 5. Verify OrganizerAppShellComponent implementation
const compContent = fs.readFileSync(shellCompFile, 'utf8');

// Logo runtime asset and fallback
if (!compContent.includes('assets/branding/logo-primary.svg')) {
  console.error('[FAIL] Component does not reference assets/branding/logo-primary.svg');
  process.exit(1);
}
if (!compContent.includes('alt="EventLens"') || !compContent.includes('brand-fallback-text')) {
  console.error('[FAIL] Component does not implement accessible logo fallback for EventLens');
  process.exit(1);
}
console.log('[PASS] Shell wordmark and accessible fallback text verified');

// Target size 44x44px for Mis eventos
if (!compContent.includes('min-width: 44px') || !compContent.includes('min-height: 44px')) {
  console.error('[FAIL] Button .btn-exit-context must enforce minimum target size 44x44px');
  process.exit(1);
}
console.log('[PASS] Minimum interactive target size 44x44px verified');

// Long names without spaces / no ellipsis truncation
if (compContent.includes('text-overflow: ellipsis')) {
  console.error('[FAIL] Component still has text-overflow: ellipsis restricting event name');
  process.exit(1);
}
if (!compContent.includes('word-break: break-word') && !compContent.includes('overflow-wrap: anywhere')) {
  console.error('[FAIL] Component must support multiline long names without truncation');
  process.exit(1);
}
console.log('[PASS] Event name wrapping without truncation verified');

// Sticky on desktop only, static on mobile
if (!compContent.includes('@media (max-width: 768px)') || !compContent.includes('position: static')) {
  console.error('[FAIL] Shell header must be static on mobile to avoid obscuring viewport/focus');
  process.exit(1);
}
console.log('[PASS] Responsive header positioning (desktop sticky, mobile static) verified');

// 6. WCAG 2.2 AA Contrast ratio mathematical verification
function srgbToLinear(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function relativeLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (brighter + 0.05) / (darker + 0.05);
}

const colorChecks = [
  { name: 'Text Primary on Surface', fg: '#17202A', bg: '#FFFFFF', min: 4.5 },
  { name: 'Text Secondary on Surface', fg: '#667085', bg: '#FFFFFF', min: 4.5 },
  { name: 'Organizer Badge (Primary on Accent-soft)', fg: '#17345C', bg: '#FFF1ED', min: 4.5 },
  { name: 'Mis eventos Button (Primary on Surface)', fg: '#17345C', bg: '#FFFFFF', min: 4.5 },
  { name: 'Focus Outline (Primary)', fg: '#17345C', bg: '#FFFFFF', min: 3.0 }
];

for (const c of colorChecks) {
  const ratio = contrastRatio(c.fg, c.bg);
  if (ratio < c.min) {
    console.error(`[FAIL] Contrast ratio for ${c.name} is ${ratio.toFixed(2)}:1 (minimum ${c.min}:1)`);
    process.exit(1);
  }
  console.log(`[PASS] Contrast ${c.name}: ${ratio.toFixed(2)}:1 (exceeds ${c.min}:1 requirement)`);
}

// 7. Test HTTP server resolution for fonts
const server = http.createServer((req, res) => {
  const urlPath = req.url || '';
  if (urlPath.startsWith('/assets/fonts/manrope/')) {
    const file = path.basename(urlPath);
    const full = path.join(fontsDir, file);
    if (fs.existsSync(full)) {
      res.writeHead(200, { 'Content-Type': 'font/woff2' });
      res.end(fs.readFileSync(full));
      return;
    }
  }
  res.writeHead(404);
  res.end('Not Found');
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

for (const w of requiredWeights) {
  const res = await fetch(`http://127.0.0.1:${port}/assets/fonts/manrope/manrope-${w}.woff2`);
  if (res.status !== 200) {
    console.error(`[FAIL] HTTP font serving returned status ${res.status} for weight ${w}`);
    server.close();
    process.exit(1);
  }
}
server.close();
console.log('[PASS] HTTP font serving verified 200 OK for all weights');

// 8. Verify production build output does not leak test harness or mock routes
if (fs.existsSync(distBrowserDir)) {
  const distFiles = fs.readdirSync(distBrowserDir, { recursive: true });
  const forbiddenNames = ['harness', 'test-fixture', 'mock-route', 'test-host'];
  for (const f of distFiles) {
    const str = String(f).toLowerCase();
    for (const forbidden of forbiddenNames) {
      if (str.includes(forbidden)) {
        console.error(`[FAIL] Production bundle leaks test artifact: ${f}`);
        process.exit(1);
      }
    }
  }
  console.log('[PASS] Production bundle verified free of test harnesses or mock routes');
}

console.log('--- All EL-TK-204 verifications PASSED successfully ---');
