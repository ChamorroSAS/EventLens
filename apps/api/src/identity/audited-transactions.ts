import { AsyncLocalStorage } from 'node:async_hooks';
import type { TransactionRunner } from '@eventlens/database';
import type { AuditEventRecord, AuditSink } from '@eventlens/identity';
type PersistedAuditEvent = Omit<AuditEventRecord, 'result'> & {
  result: AuditEventRecord['result'] | 'TRANSACTION_OUTCOME_UNCONFIRMED';
};

/** Preserve rollback audit without awaiting a conflicting insert into an open SQL transaction. */
export function createAuditedTransactions(database: TransactionRunner): {
  transactions: TransactionRunner;
  auditSink: AuditSink;
} {
  const scope = new AsyncLocalStorage<AuditEventRecord[]>();
  const persist = (event: PersistedAuditEvent) => database.run(tx => tx.execute(
    `INSERT INTO admin_audit_event (
       id, procedure, actor_id, target_identifier, target_principal_id, result, details, timestamp
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
    event.id, event.procedure, event.actorId, event.targetIdentifier,
    event.targetPrincipalId ?? null, event.result, event.details ?? null, event.timestamp
  ));
  const auditSink: AuditSink = {
    record: async event => {
      const pending = scope.getStore();
      if (pending) pending.push(event);
      else await persist(event);
    }
  };
  const transactions: TransactionRunner = {
    run: async work => {
      const pending: AuditEventRecord[] = [];
      try {
        // Existing domain INSERTs are deduplicated; organizer external-only events
        // are persisted after commit, without blocking their open transaction.
        const result = await scope.run(pending, () => database.run(work));
        for (const event of pending) await persist(event);
        return result;
      } catch (error) {
        // Underlying run has finished rollback (or failed ambiguously). Duplicate
        // suppression also handles a commit whose response was lost.
        for (const event of pending) {
          const unconfirmed: PersistedAuditEvent = event.result === 'SUCCESS' ? {
            ...event,
            result: 'TRANSACTION_OUTCOME_UNCONFIRMED',
            details: 'Database transaction did not confirm completion; operation outcome is unverified.'
          } : event;
          try { await persist(unconfirmed); } catch { /* Preserve the original domain failure. */ }
        }
        throw error;
      }
    }
  };
  return { transactions, auditSink };
}
