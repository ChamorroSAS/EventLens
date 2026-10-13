import { describe, expect, it, vi } from 'vitest';
import { createPrismaClient, type SqlTransaction, type TransactionRunner } from '../src/index.js';
import { assertTestConnectionUrl, assertTestDatabase, IsolatedTestTransactions, readTestIsolationPolicy } from '../src/testing.js';

const env = { EVENTLENS_TEST_DATABASE: `el_test_${'a'.repeat(32)}`, EVENTLENS_TEST_ROLE: `el_test_role_${'a'.repeat(32)}`, EVENTLENS_TEST_TOKEN: 'b'.repeat(64) };
const policy = readTestIsolationPolicy(env);
const valid = { database: policy.database, role: policy.role, owner: policy.role, marker: policy.marker, privileged: false };
const queryFor = (rows: object[]) => ({ query: async <T extends object>() => rows as T[] });

describe('destructive test isolation is fail closed before writes', () => {
  it('requires a runner-issued policy, including with a test-looking name', () => {
    expect(() => readTestIsolationPolicy({ PGDATABASE: 'eventlens_test' })).toThrow('TEST_ISOLATION_REQUIRED');
    expect(() => createPrismaClient('postgresql://role:secret@localhost/eventlens')).toThrow('TEST_ISOLATION_REQUIRED');
  });
  it('rejects DATABASE_URL development targets and alternate roles', () => {
    expect(() => assertTestConnectionUrl('postgresql://role:unused@localhost/eventlens', env)).toThrow('TEST_ISOLATION_CONNECTION_REJECTED');
    expect(() => assertTestConnectionUrl(`postgresql://superuser:unused@localhost/${policy.database}`, env)).toThrow('TEST_ISOLATION_CONNECTION_REJECTED');
    expect(() => assertTestConnectionUrl(`postgresql://${policy.role}:unused@localhost/${policy.database}`, env)).not.toThrow();
  });
  it.each([
    ['effective development database', { database: 'eventlens' }],
    ['effective role mismatch', { role: 'postgres' }],
    ['database owner mismatch', { owner: 'postgres' }],
    ['missing run marker', { marker: null }],
    ['marker from another run', { marker: 'eventlens-test-v1:other' }],
    ['privileged effective role', { privileged: true }]
  ])('rejects %s even when declared policy is valid', async (_name, change) => {
    await expect(assertTestDatabase(queryFor([{ ...valid, ...change }]), env)).rejects.toThrow('TEST_ISOLATION_EFFECTIVE_DATABASE_REJECTED');
  });
  it('accepts only the effective runner-owned resource', async () => {
    await expect(assertTestDatabase(queryFor([valid]), env)).resolves.toBeUndefined();
  });
  it('never reaches DELETE callback on effective database mismatch or PostgreSQL failure', async () => {
    for (const query of [queryFor([{ ...valid, database: 'eventlens' }]).query, async () => { throw new Error('POSTGRES_UNAVAILABLE'); }]) {
      const execute = vi.fn();
      const tx: SqlTransaction = { query, execute };
      const delegate: TransactionRunner = { run: async work => work(tx) };
      const guarded = new IsolatedTestTransactions(delegate, env);
      await expect(guarded.run(tx => tx.execute('DELETE FROM admin_principal'))).rejects.toThrow();
      expect(execute).not.toHaveBeenCalled();
    }
  });
});
