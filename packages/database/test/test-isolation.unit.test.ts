import { createServer } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { createPrismaClient, type SqlTransaction, type TransactionRunner } from '../src/index.js';
import {
  assertPortAvailable,
  assertTestConnectionUrl,
  assertTestDatabase,
  assertTestServerStartup,
  createRedactedIsolationAudit,
  IsolatedTestTransactions,
  LaboratoryTestAuthority,
  readTestIsolationPolicy
} from '../src/testing.js';

const env = {
  EVENTLENS_TEST_DATABASE: `el_test_${'a'.repeat(32)}`,
  EVENTLENS_TEST_ROLE: `el_test_role_${'a'.repeat(32)}`,
  EVENTLENS_TEST_TOKEN: 'b'.repeat(64)
};
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

describe('EL-TK-218: Laboratorio aislado para API, SPA y autoridad de prueba', () => {
  describe('assertPortAvailable', () => {
    it('rejects invalid port numbers', async () => {
      await expect(assertPortAvailable(0)).rejects.toThrow('TEST_PORT_INVALID');
      await expect(assertPortAvailable(-1)).rejects.toThrow('TEST_PORT_INVALID');
      await expect(assertPortAvailable(70000)).rejects.toThrow('TEST_PORT_INVALID');
    });

    it('detects occupied ports and fails closed without fallback', async () => {
      const server = createServer();
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;

      try {
        await expect(assertPortAvailable(port)).rejects.toThrow('TEST_PORT_IN_USE');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('resolves when port is free', async () => {
      // Ephemeral probe on dynamic port
      const server = createServer();
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const port = (server.address() as any).port;
      await new Promise<void>((resolve) => server.close(() => resolve()));

      await expect(assertPortAvailable(port)).resolves.toBeUndefined();
    });
  });

  describe('assertTestServerStartup (Early rejection guards)', () => {
    const validTestEnv = {
      ...env,
      NODE_ENV: 'test',
      DATABASE_URL: `postgresql://${policy.role}:secret@127.0.0.1:5432/${policy.database}`
    };

    it('rejects startup when NODE_ENV is not test and VITEST is absent', async () => {
      const nonTestEnv = { ...validTestEnv, NODE_ENV: 'development', VITEST: undefined };
      await expect(assertTestServerStartup({ env: nonTestEnv })).rejects.toThrow('TEST_ENVIRONMENT_REQUIRED');
    });

    it('rejects development DATABASE_URL before connecting or listening', async () => {
      const devDbEnv = {
        ...validTestEnv,
        DATABASE_URL: 'postgresql://eventlens:secret@127.0.0.1:5432/eventlens'
      };
      await expect(assertTestServerStartup({ env: devDbEnv })).rejects.toThrow('TEST_ISOLATION_CONNECTION_REJECTED');
    });

    it('rejects startup when required laboratory authority is missing or invalid', async () => {
      await expect(assertTestServerStartup({ env: validTestEnv, requireAuthority: true, authority: null }))
        .rejects.toThrow('TEST_AUTHORITY_REQUIRED');

      await expect(assertTestServerStartup({ env: validTestEnv, requireAuthority: true, authority: {} }))
        .rejects.toThrow('TEST_AUTHORITY_INVALID');
    });

    it('accepts startup when test policy, database URL, and authority are valid', async () => {
      const authority = new LaboratoryTestAuthority();
      await expect(assertTestServerStartup({
        env: validTestEnv,
        requireAuthority: true,
        authority,
        checkPort: false
      })).resolves.toBeUndefined();
    });
  });

  describe('LaboratoryTestAuthority (Durable state independent of PostgreSQL timeline)', () => {
    it('initializes with default epoch 1n and independent credential revisions', async () => {
      const authority = new LaboratoryTestAuthority();
      expect(await authority.getRecoveryEpoch()).toBe(1n);
      expect(await authority.getCredentialRevision('admin-1')).toBe(1n);
      expect(await authority.getAdminAuthWatermark('admin-1')).toBe(0n);
    });

    it('tracks state mutations independently of PostgreSQL timeline or rollbacks', async () => {
      const authority = new LaboratoryTestAuthority({ epoch: 2n });
      expect(await authority.getRecoveryEpoch()).toBe(2n);

      authority.setCredentialRevision('admin-1', 42n);
      expect(await authority.getCredentialRevision('admin-1')).toBe(42n);

      authority.setAdminAuthWatermark('admin-1', 100n);
      expect(await authority.getAdminAuthWatermark('admin-1')).toBe(100n);

      authority.advanceEpoch();
      expect(await authority.getRecoveryEpoch()).toBe(3n);
    });

    it('executes prepare, ackCommit, and stores fact history', async () => {
      const authority = new LaboratoryTestAuthority();
      const prepared = await authority.prepare({
        operationId: 'op-218-001',
        subjectRef: 'admin-1',
        fact: { type: 'CREDENTIAL_UPDATED', data: { revision: 2n } }
      });

      expect(prepared.receipt).toBe('lab-receipt-op-218-001');

      await authority.ackCommit(prepared.receipt, 15n);
      const facts = authority.getFactHistory();
      expect(facts.length).toBe(1);
      expect(facts[0].type).toBe('CREDENTIAL_UPDATED');
    });

    it('blocks prepare when recovery barrier is active for scope', async () => {
      const authority = new LaboratoryTestAuthority({ epoch: 1n });
      await authority.setRecoveryBarrier(1n, 'MOD-001');

      expect(await authority.isRecoveryBarrierActive(1n, 'MOD-001')).toBe(true);
      await expect(authority.prepare({
        operationId: 'op-blocked',
        subjectRef: 'admin-1'
      })).rejects.toThrow('RECOVERY_BARRIER_ACTIVE');
    });
  });

  describe('createRedactedIsolationAudit (Zero-secrets audit log)', () => {
    it('creates clean audit record redacting credentials, tokens, cookies, and database URLs', () => {
      const audit = createRedactedIsolationAudit('exec-12345', {
        status: 'PASS',
        database: 'el_test_abcd',
        role: 'el_test_role_abcd',
        ports: { api: 14001, spa: 14002 },
        cases: ['missing policy', 'unsafe DATABASE_URL'],
        DATABASE_URL: 'postgresql://user:supersecretpassword@127.0.0.1:5432/el_test_abcd',
        token: 'secret-token-value',
        cookie: '__Host-el_admin_session=secret-session-id',
        safeProperty: 'unaffected-metric'
      });

      expect(audit['executionId']).toBe('exec-12345');
      expect(audit['status']).toBe('PASS');
      expect(audit['database']).toBe('el_test_abcd');
      expect(audit['role']).toBe('el_test_role_abcd');
      expect(audit['ports']).toEqual({ api: 14001, spa: 14002 });
      expect(audit['safeProperty']).toBe('unaffected-metric');

      // Assert zero secrets invariant
      expect(audit['DATABASE_URL']).toBeUndefined();
      expect(audit['token']).toBeUndefined();
      expect(audit['cookie']).toBeUndefined();
      expect(JSON.stringify(audit)).not.toContain('supersecretpassword');
      expect(JSON.stringify(audit)).not.toContain('secret-token-value');
      expect(JSON.stringify(audit)).not.toContain('secret-session-id');
    });

    it('runs proveLaboratoryIsolation fixture and validates zero-secrets pass', async () => {
      // @ts-expect-error laboratory-proof.mjs is an ES module validation script without d.ts
      const { proveLaboratoryIsolation } = await import('../../../infra/validation/identity/laboratory-proof.mjs');
      const testEnv = {
        ...env,
        NODE_ENV: 'test',
        API_PORT: '14101',
        SPA_PORT: '14102',
        DATABASE_URL: `postgresql://${policy.role}:secret@127.0.0.1:5432/${policy.database}`
      };
      const result = await proveLaboratoryIsolation(testEnv);
      expect(result['status']).toBe('PASS');
      expect(result['database']).toBe(policy.database);
      expect((result['cases'] as string[])).toContain('development URL rejected before connection');
      expect((result['cases'] as string[])).toContain('non-test environment rejected before listen');
      expect((result['cases'] as string[])).toContain('occupied port rejected without fallback');
      expect((result['cases'] as string[])).toContain('durable laboratory authority independent of database timeline');
      expect(result['foreignSentinelIntact']).toBe(true);
    });
  });
});
