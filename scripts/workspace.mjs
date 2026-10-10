import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const command = process.argv[2];
const allowed = ['build','test','typecheck','integration','e2e','prepare','db-generate','db-migrate','openapi','client','client-check','up','down','logs','backup','restore'];
if (!allowed.includes(command)) throw new Error('UNKNOWN_WORKSPACE_COMMAND');
function run(bin, args) {
  const result = spawnSync(bin, args, {cwd:root,stdio:'inherit',env:process.env,shell:bin === 'pnpm' && process.platform === 'win32'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const pnpm = (...args) => run('pnpm', args);
const filter = (name, script) => pnpm('--filter', `@eventlens/${name}`, script);
const node = (...args) => run(process.execPath, args);
if (['up','down','logs'].includes(command)) {
  run('docker',['compose', ...(command === 'up' ? ['up','--build','-d','--wait'] : command === 'down' ? ['down'] : ['logs','--tail','100'])]);
} else if (['backup','restore'].includes(command)) {
  const args = process.argv.slice(3);
  if (args[0] === '--') args.shift();
  node('scripts/local-backup.mjs',command,...args);
} else if (process.env.EVENTLENS_DOCKER !== '1') {
  const service = command === 'e2e' ? 'e2e' : ['openapi','client','client-check'].includes(command) ? 'contracts' : 'tools';
  run('docker',['compose','--profile','tools','run','--build','--rm',service,'node','scripts/workspace.mjs',command]);
} else if (command === 'db-generate') {
  node('scripts/database.mjs','generate');
} else if (command === 'db-migrate') {
  node('scripts/database.mjs','migrate');
} else if (command === 'client-check') {
  node('apps/api/dist/export-openapi.js','--check');
  node('scripts/api-client.mjs','--check');
} else if (command === 'openapi' || command === 'client') {
  node('apps/api/dist/export-openapi.js');
  if (command === 'client') node('scripts/api-client.mjs');
} else if (command === 'e2e') {
  filter('e2e','test');
} else {
  // Explicit dependency order; generated Prisma types stay inside infrastructure.
  node('scripts/database.mjs','generate');
  for (const name of ['job-queue','media-execution','media-inspection']) filter(name,'generate');
  for (const name of ['database','job-queue','media-execution','media-acceptance','media-inspection','api']) filter(name,'build');
  filter('api','openapi:export');
  node('scripts/api-client.mjs');
  filter('api-client','build');
  if (command === 'build') filter('web','build');
  if (command === 'typecheck') {
    for (const name of ['database','api','api-client','web','e2e']) filter(name,'typecheck');
    // Existing owners are checked by their strict production builds above.
  }
  if (command === 'test') for (const name of ['database','api','web']) filter(name,'test');
  if (command === 'integration') filter('api','test:integration');
}
