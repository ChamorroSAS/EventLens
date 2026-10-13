import { constants } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];
let client;

/** POSIX-only until a reviewed Windows ACL implementation exists; fail closed on native Windows. */
async function protectedPath(path, mustExist) {
  if (process.platform === 'win32') throw new Error('SECURE_CHANNEL_UNAVAILABLE: use a Linux container with private POSIX files');
  if (!path) throw new Error('PRIVATE_FILE_PATH_REQUIRED');
  const target = resolve(path);
  const parent = await realpath(dirname(target));
  const canonical = resolve(parent, target.split(/[\\/]/).at(-1));
  const inside = relative(repo, canonical);
  if (!(inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside))) throw new Error('SECRET_FILES_MUST_BE_OUTSIDE_REPOSITORY');
  const directory = await stat(parent);
  if (directory.uid !== process.getuid() || (directory.mode & 0o077) !== 0) throw new Error('PRIVATE_DIRECTORY_REQUIRED');
  if (mustExist) {
    const handle = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid() || (info.mode & 0o077) !== 0) throw new Error('PRIVATE_FILE_REQUIRED');
      return (await handle.readFile('utf8')).trim();
    } finally { await handle.close(); }
  }
  return canonical;
}

async function hiddenProof() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('INTERACTIVE_TERMINAL_REQUIRED');
  process.stdout.write('Secreto operativo (entrada oculta): ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let value = '';
  try {
    return await new Promise((resolveProof, reject) => {
      const onData = chunk => {
        for (const ch of chunk.toString('utf8')) {
          if (ch === '\u0003' || ch === '\u0004') { cleanup(); reject(new Error('OPERATOR_CANCELLED')); return; }
          if (ch === '\r' || ch === '\n') { cleanup(); resolveProof(value); return; }
          if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
          else if (/^[a-fA-F0-9]$/.test(ch) && value.length < 64) value += ch;
        }
      };
      const cleanup = () => process.stdin.off('data', onData);
      process.stdin.on('data', onData);
    });
  } finally { process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); }
}

try {
  if (process.argv.length !== 3 || !['bootstrap', 'status', 'recover'].includes(mode)) throw new Error('USAGE: admin.mjs bootstrap|status|recover (no secret arguments)');
  if (mode === 'recover') throw new Error('RECOVERY_BLOCKED: no accepted external operational authorizer or durable RecoveryAuthority adapter; preserve this database and follow the administrative runbook');
  const { createPrismaClient, PrismaTransactions, readDatabaseUrl } = await import('../packages/database/dist/index.js');
  const { AdminBootstrapService } = await import('../packages/identity/dist/index.js');
  client = createPrismaClient(readDatabaseUrl(process.env), { connectionTimeoutMillis: 5000, query_timeout: 10000, max: 1 });
  const transactions = new PrismaTransactions(client, 10000);
  const state = await transactions.run(async tx => {
    const connection = await tx.query(`SELECT current_database() AS database, pg_is_in_recovery() AS replica`);
    const bootstrap = await tx.query(`SELECT is_consumed FROM operational_bootstrap_state WHERE id = 'SYSTEM_BOOTSTRAP'`);
    const counts = await tx.query(`SELECT
      (SELECT COUNT(*) FROM admin_principal)::text AS principals,
      (SELECT COUNT(*) FROM admin_credential)::text AS credentials,
      (SELECT COUNT(*) FROM admin_session)::text AS sessions,
      (SELECT COUNT(*) FROM admin_principal p WHERE p.status = 'ACTIVE' AND EXISTS
        (SELECT 1 FROM admin_credential c WHERE c.principal_id = p.id AND c.status = 'ACTIVE'
         AND c.purpose = 'ADMIN_AUTHENTICATION'))::text AS active_with_credential`);
    return { ...connection[0], ...counts[0], consumed: bootstrap[0]?.is_consumed ?? false };
  });
  if (mode === 'status') {
    console.log(JSON.stringify({ ...state, authenticationAuthority: 'NOT_VERIFIED', note: 'Active credential counts do not prove authority revisions or authentication usability.' }));
  } else {
    if (process.env.EVENTLENS_ADMIN_LOCAL_FRESH_DATABASE !== 'yes' || process.env.NODE_ENV === 'production') throw new Error('LOCAL_FRESH_NON_PITR_DATABASE_REQUIRED');
    if (state.replica || state.consumed) throw new Error('BOOTSTRAP_ALREADY_CONSUMED_OR_RECOVERY_DATABASE');
    if ([state.principals, state.credentials, state.sessions].some(count => count !== '0')) throw new Error('PRISTINE_ADMINISTRATIVE_STATE_REQUIRED');
    const configured = await protectedPath(process.env.EVENTLENS_BOOTSTRAP_SECRET_FILE, true);
    if (!/^[a-f0-9]{64}$/.test(configured)) throw new Error('OPERATIONAL_SECRET_MUST_BE_256_BIT_RANDOM_HEX');
    const destination = await protectedPath(process.env.EVENTLENS_ADMIN_CREDENTIAL_FILE, false);
    const input = createInterface({ input: process.stdin, output: process.stdout });
    let identifier;
    try { identifier = (await input.question('Identificador del primer administrador: ')).trim(); }
    finally { input.close(); }
    if (!identifier) throw new Error('ADMIN_IDENTIFIER_REQUIRED');
    const proof = await hiddenProof();
    // The domain authorization preflight performs constant-time comparison and
    // persists a secret-free rejection audit before any credential is staged.
    const service = new AdminBootstrapService(transactions, configured);
    const principal = await service.bootstrap({ identifier, operatorToken: proof }, async secret => {
      // Exclusive creation and fsync precede SQL; retain the file on any ambiguous DB outcome.
      const handle = await open(destination, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      try { await handle.writeFile(`${secret}\n`, 'utf8'); await handle.sync(); }
      finally { await handle.close(); }
      const directory = await open(dirname(destination), constants.O_RDONLY);
      try { await directory.sync(); } finally { await directory.close(); }
    });
    console.log(`Bootstrap confirmado para ${principal.id}. Credencial inicial entregada una vez al archivo privado configurado. Verificador/revisión comprobados; autenticación de runtime requiere RecoveryAuthority vigente.`);
  }
} catch (error) {
  // Never print driver messages, URLs, raw arguments, secret values, stacks or audit material.
  const known = new Set(['SECURE_CHANNEL_UNAVAILABLE', 'PRIVATE_FILE_PATH_REQUIRED', 'SECRET_FILES_MUST_BE_OUTSIDE_REPOSITORY',
    'PRIVATE_DIRECTORY_REQUIRED', 'PRIVATE_FILE_REQUIRED', 'INTERACTIVE_TERMINAL_REQUIRED', 'OPERATOR_CANCELLED', 'USAGE',
    'RECOVERY_BLOCKED', 'LOCAL_FRESH_NON_PITR_DATABASE_REQUIRED', 'BOOTSTRAP_ALREADY_CONSUMED_OR_RECOVERY_DATABASE',
    'PRISTINE_ADMINISTRATIVE_STATE_REQUIRED', 'OPERATIONAL_SECRET_MUST_BE_256_BIT_RANDOM_HEX', 'ADMIN_IDENTIFIER_REQUIRED', 'UNAUTHORIZED_OPERATOR']);
  const code = error instanceof Error ? error.message.split(':')[0] : '';
  const safe = known.has(code) ? error.message : 'ADMIN_OPERATION_FAILED: inspect configuration, migrations and the safe runbook; retain any staged credential file until the database outcome is known';
  console.error(safe);
  process.exitCode = 1;
} finally { await client?.$disconnect(); }
