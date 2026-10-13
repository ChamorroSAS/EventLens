import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { assertTestDatabase } from '../../../packages/database/dist/testing.js';
const require = createRequire(realpathSync(new URL('../../../packages/database/node_modules/@prisma/adapter-pg/package.json', import.meta.url)));
const { Client } = require('pg');

/** Test-only PTY. Transcript is held in memory and never emitted or persisted. */
function bootstrapTerminal(env, token) {
  return new Promise((resolve, reject) => {
    const child = spawn('script', ['-q', '-e', '-c', 'node scripts/admin.mjs bootstrap', '/dev/null'], { cwd: '/workspace', env, stdio: ['pipe', 'pipe', 'pipe'] });
    let transcript = '', identifierSent = false, proofSent = false;
    const timeout = setTimeout(() => { child.kill(); reject(new Error('CLI_PROOF_TIMEOUT')); }, 20000);
    child.stdout.on('data', chunk => {
      transcript += chunk.toString();
      if (!identifierSent && transcript.includes('Identificador del primer administrador:')) {
        identifierSent = true; child.stdin.write('cli.proof@example.test\n');
      }
      if (!proofSent && transcript.includes('Secreto operativo (entrada oculta):')) {
        proofSent = true;
        // Allow the CLI to switch to raw mode before input reaches the PTY.
        setTimeout(() => child.stdin.write(token + '\n'), 50);
      }
    });
    child.stderr.on('data', chunk => { transcript += chunk.toString(); });
    child.on('error', () => { clearTimeout(timeout); reject(new Error('CLI_PROOF_TERMINAL_UNAVAILABLE')); });
    child.on('close', code => {
      clearTimeout(timeout);
      if (transcript.includes(token)) return reject(new Error('CLI_PROOF_SECRET_EXPOSED'));
      resolve({ code, confirmed: transcript.includes('Bootstrap confirmado'), consumed: transcript.includes('BOOTSTRAP_ALREADY_CONSUMED') });
    });
  });
}

export async function proveAdministrativeCli(env) {
  const directory = await mkdtemp(join(tmpdir(), 'eventlens-admin-proof-'));
  const token = randomBytes(32).toString('hex');
  const secretFile = join(directory, 'operator-token');
  const credentialFile = join(directory, 'initial-credential');
  const client = new Client({ connectionString: env.DATABASE_URL });
  try {
    await writeFile(secretFile, token, { mode: 0o600, flag: 'wx' });
    await client.connect();
    await assertTestDatabase({ query: async (sql, ...args) => (await client.query(sql, args)).rows }, env);
    for (const migration of ['202610110015_admin_principal', '202610110021_admin_authentication']) {
      const sql = await readFile(new URL(`../../../packages/identity/prisma/migrations/${migration}/migration.sql`, import.meta.url), 'utf8');
      await client.query(sql);
    }
    const cliEnv = { ...env, EVENTLENS_ADMIN_LOCAL_FRESH_DATABASE: 'yes', EVENTLENS_BOOTSTRAP_SECRET_FILE: secretFile, EVENTLENS_ADMIN_CREDENTIAL_FILE: credentialFile };
    const unauthorizedToken = randomBytes(32).toString('hex');
    const unauthorized = await bootstrapTerminal(cliEnv, unauthorizedToken);
    const deniedAudit = (await client.query("SELECT count(*)::integer AS n FROM admin_audit_event WHERE result='REJECTED_UNAUTHORIZED'")).rows[0].n;
    if (unauthorized.code === 0 || deniedAudit !== 1) throw new Error('CLI_PROOF_UNAUTHORIZED_NOT_AUDITED');
    const occupied = join(directory, 'occupied');
    await writeFile(occupied, 'own synthetic sentinel', { mode: 0o600, flag: 'wx' });
    const failedChannel = await bootstrapTerminal({ ...cliEnv, EVENTLENS_ADMIN_CREDENTIAL_FILE: occupied }, token);
    const before = (await client.query("SELECT (SELECT count(*) FROM admin_principal)::integer AS principals, is_consumed FROM operational_bootstrap_state WHERE id='SYSTEM_BOOTSTRAP'")).rows[0];
    if (failedChannel.code === 0 || before.principals !== 0 || before.is_consumed || (await readFile(occupied, 'utf8')) !== 'own synthetic sentinel') throw new Error('CLI_PROOF_CHANNEL_FAILURE_CHANGED_STATE');
    const first = await bootstrapTerminal(cliEnv, token);
    if (first.code !== 0 || !first.confirmed) throw new Error('CLI_PROOF_BOOTSTRAP_FAILED');
    const credential = (await readFile(credentialFile, 'utf8')).trim();
    if (!/^[a-f0-9]{64}$/.test(credential) || ((await stat(credentialFile)).mode & 0o077) !== 0) throw new Error('CLI_PROOF_PRIVATE_CREDENTIAL_FAILED');
    const second = await bootstrapTerminal(cliEnv, token);
    if (second.code === 0 || !second.consumed || (await readFile(credentialFile, 'utf8')).trim() !== credential) throw new Error('CLI_PROOF_SINGLE_USE_FAILED');
    const { createPrismaClient, PrismaTransactions } = await import('../../../packages/database/dist/index.js');
    const { AdminAuthenticationService } = await import('../../../packages/identity/dist/index.js');
    const prisma = createPrismaClient(env.DATABASE_URL);
    try {
      const transactions = new PrismaTransactions(prisma, 10000);
      const authentication = new AdminAuthenticationService(transactions, { allowedOrigins: ['https://cli-proof.example.test'] });
      const login = await authentication.authenticate({ identifier: 'cli.proof@example.test', secret: credential, origin: 'https://cli-proof.example.test', customHeaderPresent: true });
      await authentication.validateSession({ sessionToken: login.sessionToken });
      await authentication.logout({ sessionToken: login.sessionToken, csrfToken: login.csrfToken, origin: 'https://cli-proof.example.test' });
    } finally { await prisma.$disconnect(); }
    const audit = JSON.stringify((await client.query('SELECT procedure, result, details FROM admin_audit_event')).rows);
    if (audit.includes(token) || audit.includes(unauthorizedToken) || audit.includes(credential)) throw new Error('CLI_PROOF_AUDIT_SECRET_EXPOSED');
    const recovery = spawnSync(process.execPath, ['scripts/admin.mjs', 'recover'], { cwd: '/workspace', env: { PATH: process.env.PATH }, encoding: 'utf8' });
    if (recovery.status !== 1 || !recovery.stderr.includes('RECOVERY_BLOCKED')) throw new Error('CLI_PROOF_RECOVERY_NOT_CLOSED');
    return { result: 'PASS', terminal: 'isolated POSIX PTY', credentialMode: '0600', bootstrap: 'authenticated, session validated and logged out', singleUse: 'rejected without replacing file', unauthorized: 'rejected and audited before credential delivery', channelFailure: 'occupied destination unchanged, principal absent and bootstrap unconsumed', exceptionalRecovery: 'denied without database configuration/connection', audit: 'no operational or credential secret', runtimeAuthority: 'not certified; initial local domain verification only' };
  } finally {
    await client.end();
    // Remove only this proof's own synthetic private directory after the run.
    await rm(directory, { recursive: true, force: true });
  }
}
