import { describe, expect, it } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import { AdminBootstrapService, computeCredentialDigest } from '../src/index.js';

function fixture(failCredential = false) {
  const state = { consumed: false, principal: null as any, credential: null as any, audit: [] as unknown[][] };
  let commits = 0;
  const runner: TransactionRunner = {
    async run(work) {
      const previous = structuredClone(state);
      const tx: SqlTransaction = {
        async execute(sql, ...params) {
          if (sql.includes('UPDATE operational_bootstrap_state')) state.consumed = true;
          if (sql.includes('INSERT INTO admin_audit_event')) state.audit.push(params);
          return 1;
        },
        async query<T extends object>(sql: string, ...params: unknown[]): Promise<T[]> {
          let rows: unknown[] = [];
          if (sql.includes('SELECT id, is_consumed') || sql.includes('SELECT is_consumed')) rows = [{ id: 'SYSTEM_BOOTSTRAP', is_consumed: state.consumed }];
          else if (sql.includes('SELECT id FROM admin_principal')) rows = state.principal ? [state.principal] : [];
          else if (sql.includes('INSERT INTO admin_principal')) {
            state.principal = { id: params[0], identifier: params[1], status: 'ACTIVE', auth_revision: '1', provision_procedure: 'INITIAL_BOOTSTRAP', provisioned_by: 'SYSTEM_BOOTSTRAP', created_at: params[2], updated_at: params[2] };
            rows = [state.principal];
          } else if (sql.includes('AS principals')) rows = [{ principals: state.principal ? '1' : '0', credentials: state.credential ? '1' : '0', sessions: '0' }];
          else if (sql.includes('INSERT INTO admin_credential')) {
            if (failCredential) throw new Error('Injected credential write failure');
            state.credential = { id: params[0], principal_id: params[1], purpose: params[2], secret_digest: params[3], revision: params[4], status: 'ACTIVE', created_at: params[5], updated_at: params[5] };
            rows = [state.credential];
          } else if (sql.includes('SELECT secret_digest')) rows = state.credential ? [state.credential] : [];
          return rows as T[];
        }
      };
      try { const result = await work(tx); commits++; return result; }
      catch (error) { Object.assign(state, previous); throw error; }
    }
  };
  return { state, service: new AdminBootstrapService(runner, 'operator-proof'), commits: () => commits };
}

describe('Atomic administrative bootstrap', () => {
  it('stages a fresh 256-bit credential once and persists its canonical verifier in one commit', async () => {
    const { service, state, commits } = fixture();
    const delivered: string[] = [];
    const principal = await service.bootstrap({ identifier: 'ADMIN@example.test', operatorToken: 'operator-proof' }, async secret => { delivered.push(secret); });
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(state.credential.secret_digest).toBe(computeCredentialDigest('ADMIN_AUTHENTICATION', principal.id, delivered[0]));
    expect(state.consumed).toBe(true);
    expect(commits()).toBe(2); // read-only preflight, then one mutation commit
    expect(JSON.stringify(state.audit)).not.toContain(delivered[0]);
    expect(JSON.stringify(state.audit)).not.toContain('operator-proof');
  });
  it('rolls back principal, audit and consumption when credential persistence fails', async () => {
    const { service, state, commits } = fixture(true);
    await expect(service.bootstrap({ identifier: 'admin@example.test', operatorToken: 'operator-proof' }, async () => {})).rejects.toThrow('Injected credential write failure');
    expect(state).toEqual({ consumed: false, principal: null, credential: null, audit: [] });
    expect(commits()).toBe(1); // read-only preflight committed; all mutation rolled back
  });
  it('performs no SQL if the secure delivery channel fails', async () => {
    const { service, state, commits } = fixture();
    await expect(service.bootstrap({ identifier: 'admin@example.test', operatorToken: 'operator-proof' }, async () => { throw new Error('Delivery failed'); })).rejects.toThrow('Delivery failed');
    expect(state.consumed).toBe(false);
    expect(commits()).toBe(1); // read-only preflight only
  });
  it('rejects a consumed bootstrap and leaves its original credential unchanged', async () => {
    const { service, state } = fixture();
    await service.bootstrap({ identifier: 'admin@example.test', operatorToken: 'operator-proof' }, async () => {});
    const original = structuredClone(state);
    let staged = false;
    await expect(service.bootstrap({ identifier: 'second@example.test', operatorToken: 'operator-proof' }, async () => { staged = true; })).rejects.toMatchObject({ code: 'BOOTSTRAP_ALREADY_CONSUMED' });
    expect(staged).toBe(false);
    expect(state).toEqual(original);
  });
  it('does not create any principal for an invalid operational proof', async () => {
    const { service, state } = fixture();
    let staged = false;
    await expect(service.bootstrap({ identifier: 'admin@example.test', operatorToken: 'wrong' }, async () => { staged = true; })).rejects.toMatchObject({ code: 'UNAUTHORIZED_PROVISIONER' });
    expect(staged).toBe(false);
    expect(state.principal).toBeNull();
    expect(state.consumed).toBe(false);
  });
  it('rejects an invalid identifier before opening the credential channel', async () => {
    const { service } = fixture();
    let staged = false;
    await expect(service.bootstrap({ identifier: ' ', operatorToken: 'operator-proof' }, async () => { staged = true; })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(staged).toBe(false);
  });
});
