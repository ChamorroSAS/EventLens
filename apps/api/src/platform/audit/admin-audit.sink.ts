import { randomUUID } from 'node:crypto';
import type { AuditEventRecord, AuditSink } from '@eventlens/identity';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';

/** Persists identity audit events into the shared administrative audit trail. */
export class PostgresAdminAuditSink implements AuditSink {
  constructor(private readonly runner: TransactionRunner) {}

  public async record(event: AuditEventRecord): Promise<void> {
    await this.runner.run(async (tx: SqlTransaction) =>
      tx.execute(
        `INSERT INTO admin_audit_event (
           id, procedure, actor_id, target_identifier, target_principal_id, result, details, timestamp
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        event.id ?? randomUUID(),
        event.procedure,
        event.actorId,
        event.targetIdentifier,
        event.targetPrincipalId ?? null,
        event.result,
        event.details ?? null,
        event.timestamp
      )
    );
  }
}
