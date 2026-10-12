import type { EventAuditRecord, EventAuditSink } from '@eventlens/event-management';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';

/** Persists event lifecycle audit entries into the shared administrative audit trail. */
export class PostgresEventAuditSink implements EventAuditSink {
  constructor(private readonly runner: TransactionRunner) {}

  public async record(event: EventAuditRecord): Promise<void> {
    await this.runner.run(async (tx: SqlTransaction) =>
      tx.execute(
        `INSERT INTO admin_audit_event (
           id, procedure, actor_id, target_identifier, target_principal_id, result, details, timestamp
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        event.id,
        event.procedure,
        event.actorId,
        event.targetIdentifier,
        null,
        event.result,
        event.details ?? null,
        event.timestamp
      )
    );
  }
}
