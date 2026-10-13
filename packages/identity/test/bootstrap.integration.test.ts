import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, PrismaTransactions, type TransactionRunner } from '@eventlens/database';
import { IsolatedTestTransactions } from '@eventlens/database/testing';
import { AdminBootstrapService, AdminAuthenticationService, type RecoveryAuthorityPort } from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration('Administrative bootstrap on an owned isolated PostgreSQL database', () => {
  if (!databaseUrl) return;
  const client = createPrismaClient(databaseUrl!);
  const transactions = new IsolatedTestTransactions(new PrismaTransactions(client, 10000));
  const service = new AdminBootstrapService(transactions, 'integration-operator-proof');
  const command = { identifier: 'bootstrap@example.test', operatorToken: 'integration-operator-proof' };
  const authority: RecoveryAuthorityPort = {
    getRecoveryEpoch: async () => 1n,
    getCredentialRevision: async () => 1n,
    getAdminAuthWatermark: async () => 1n,
    prepareSessionOperation: async () => ({ receipt: 'isolated-test-receipt' }),
    ackSessionOperation: async () => {}
  };
  const auth = new AdminAuthenticationService(transactions, { allowedOrigins: ['https://admin.example.test'], recoveryAuthority: authority });
  afterAll(async () => { await client.$disconnect(); });
  beforeAll(async () => {
    // Standalone runs initialize their own fixture from the accepted MOD-001 migrations.
    // Already initialized full-suite fixtures remain untouched; partial fixtures fail explicitly.
    for (const [migration, tables] of [
      ['202610110015_admin_principal', ['admin_principal', 'operational_bootstrap_state', 'admin_audit_event']],
      ['202610110021_admin_authentication', ['admin_credential', 'admin_session']]
    ] as const) {
      const source = await readFile(new URL(`../../database/prisma/migrations/${migration}/migration.sql`, import.meta.url), 'utf8');
      await transactions.run(async tx => {
        const existing = await tx.query<{ name: string }>(
          'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1::text[])', [...tables]
        );
        if (existing.length === tables.length) return;
        if (existing.length !== 0) throw new Error(`Incomplete administrative fixture for ${migration}`);
        // These two versioned migrations contain only plain DDL/seed statements, no SQL blocks.
        for (const statement of source.split(';').map(value => value.trim()).filter(Boolean)) {
          await tx.execute(statement);
        }
      });
    }
  });
  beforeEach(async () => {
    await transactions.run(async tx => {
      await tx.execute('DELETE FROM admin_session');
      await tx.execute('DELETE FROM admin_credential');
      await tx.execute('DELETE FROM admin_audit_event');
      await tx.execute('DELETE FROM admin_principal');
      await tx.execute('DELETE FROM operational_bootstrap_state');
    });
  });
  it('creates one authenticable principal, validates the session and logs out without auditing secrets', async () => {
    let secret = '';
    const principal = await service.bootstrap(command, async value => { secret = value; });
    const login = await auth.authenticate({ identifier: command.identifier, secret, origin: 'https://admin.example.test', customHeaderPresent: true });
    expect((await auth.validateSession({ sessionToken: login.sessionToken })).principalId).toBe(principal.id);
    await auth.logout({ sessionToken: login.sessionToken, csrfToken: login.csrfToken, origin: 'https://admin.example.test' });
    await expect(auth.validateSession({ sessionToken: login.sessionToken })).rejects.toThrow();
    const audit = await transactions.run(tx => tx.query('SELECT * FROM admin_audit_event'));
    expect(JSON.stringify(audit)).not.toContain(secret);
    expect(JSON.stringify(audit)).not.toContain(command.operatorToken);
    expect(JSON.stringify(audit)).not.toContain(login.sessionToken);
  });
  it('rejects a second bootstrap without delivering another credential', async () => {
    await service.bootstrap(command, async () => {});
    let staged = false;
    await expect(service.bootstrap({ ...command, identifier: 'second@example.test' }, async () => { staged = true; })).rejects.toMatchObject({ code: 'BOOTSTRAP_ALREADY_CONSUMED' });
    expect(staged).toBe(false);
  });
  it('serializes simultaneous initializations even when the singleton row is missing', async () => {
    const attempts = await Promise.allSettled([
      service.bootstrap(command, async () => {}),
      service.bootstrap({ ...command, identifier: 'second@example.test' }, async () => {})
    ]);
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rows = await transactions.run(tx => tx.query<{ principals: string; credentials: string }>(`SELECT
      (SELECT COUNT(*) FROM admin_principal)::text AS principals,
      (SELECT COUNT(*) FROM admin_credential)::text AS credentials`));
    expect(rows[0]).toEqual({ principals: '1', credentials: '1' });
  });
  it('rolls back consumption and principal on credential failure, then succeeds on a controlled retry', async () => {
    const failing: TransactionRunner = { run: work => transactions.run(tx => work({
      execute: (sql, ...args) => tx.execute(sql, ...args),
      query: (sql, ...args) => {
        if (sql.includes('INSERT INTO admin_credential')) throw new Error('Injected write failure');
        return tx.query(sql, ...args);
      }
    })) };
    await expect(new AdminBootstrapService(failing, command.operatorToken).bootstrap(command, async () => {})).rejects.toThrow('Injected write failure');
    const rows = await transactions.run(tx => tx.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM admin_principal'));
    expect(rows[0].count).toBe('0');
    await expect(service.bootstrap(command, async () => {})).resolves.toMatchObject({ status: 'ACTIVE' });
  });
  it('denies authentication when credential is revoked or its authority revision is newer', async () => {
    let secret = '';
    const principal = await service.bootstrap(command, async value => { secret = value; });
    const newer = new AdminAuthenticationService(transactions, { allowedOrigins: ['https://admin.example.test'], recoveryAuthority: { ...authority, getCredentialRevision: async () => 2n } });
    const login = { identifier: command.identifier, secret, origin: 'https://admin.example.test', customHeaderPresent: true };
    await expect(newer.authenticate(login)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await transactions.run(tx => tx.execute(`UPDATE admin_credential SET status = 'REVOKED' WHERE principal_id = $1`, principal.id));
    await expect(auth.authenticate(login)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
  it('rolls back the actual PostgreSQL transaction on a database error during credential registration', async () => {
    const failing: TransactionRunner = { run: work => transactions.run(tx => work({
      execute: (sql, ...args) => tx.execute(sql, ...args),
      query: async (sql, ...args) => {
        if (sql.includes('INSERT INTO admin_credential')) await tx.execute('SELECT 1 / 0');
        return tx.query(sql, ...args);
      }
    })) };
    await expect(new AdminBootstrapService(failing, command.operatorToken).bootstrap(command, async () => {})).rejects.toThrow();
    const state = await transactions.run(tx => tx.query<{ principals: string; credentials: string; consumed: boolean }>(`SELECT
      (SELECT COUNT(*) FROM admin_principal)::text AS principals,
      (SELECT COUNT(*) FROM admin_credential)::text AS credentials,
      COALESCE((SELECT is_consumed FROM operational_bootstrap_state WHERE id = 'SYSTEM_BOOTSTRAP'), false) AS consumed`));
    expect(state[0]).toEqual({ principals: '0', credentials: '0', consumed: false });
  });
});
