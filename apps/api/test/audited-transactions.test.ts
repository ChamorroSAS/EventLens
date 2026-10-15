import { expect, it, vi } from 'vitest';
import type { TransactionRunner } from '@eventlens/database';
import type { AuditEventRecord } from '@eventlens/identity';
import { createAuditedTransactions } from '../src/identity/audited-transactions.js';

const event: AuditEventRecord = { id: 'audit-one', procedure: 'ADMIN_LOGIN', actorId: 'admin-one', targetIdentifier: 'admin', result: 'REJECTED_UNAUTHENTICATED', timestamp: new Date() };

it('does not insert duplicate external audit while the domain transaction is open', async () => {
  const execute = vi.fn().mockResolvedValue(1);
  const database: TransactionRunner = { run: work => work({ query: async () => [], execute }) };
  const audited = createAuditedTransactions(database);
  await audited.transactions.run(async tx => {
    await tx.execute('domain audit insert');
    await audited.auditSink.record(event);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  // After the transaction closes, the layer re-asserts the audit idempotently
  // (ON CONFLICT (id) DO NOTHING). This is what persists external-only events
  // (e.g. ORGANIZER_LOGIN SUCCESS) recorded inside the transaction without a
  // domain INSERT, and it can never produce a duplicate row.
  expect(execute).toHaveBeenCalledTimes(2);
  expect(String(execute.mock.calls[1][0])).toContain('ON CONFLICT (id) DO NOTHING');
});

it('persists rejected audit only after rollback and propagates the original rejection', async () => {
  let open = false;
  const execute = vi.fn(async (_sql: string, ..._parameters: unknown[]) => { expect(open).toBe(true); return 1; });
  let runs = 0;
  const database: TransactionRunner = {
    run: async work => {
      expect(open).toBe(false);
      open = true;
      runs++;
      try { return await work({ query: async () => [], execute }); }
      finally { open = false; }
    }
  };
  const audited = createAuditedTransactions(database);
  const rejected = new Error('domain rejection');
  await expect(audited.transactions.run(async () => {
    await audited.auditSink.record(event);
    expect(runs).toBe(1);
    throw rejected;
  })).rejects.toBe(rejected);
  expect(runs).toBe(2);
  expect(execute.mock.calls[0]).toBeDefined();
});

it('does not claim a successful operation after an unconfirmed commit', async () => {
  const execute = vi.fn(async (_sql: string, ..._parameters: unknown[]) => 1);
  let runs = 0;
  const database: TransactionRunner = { run: async work => {
    const result = await work({ query: async () => [], execute });
    if (++runs === 1) throw new Error('commit response lost');
    return result;
  } };
  const audited = createAuditedTransactions(database);
  await expect(audited.transactions.run(async () => {
    await audited.auditSink.record({ ...event, result: 'SUCCESS' });
  })).rejects.toThrow('commit response lost');
  expect(execute.mock.calls[0][6]).toBe('TRANSACTION_OUTCOME_UNCONFIRMED');
});
