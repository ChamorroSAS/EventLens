import { randomUUID } from 'node:crypto';
import type { TransactionRunner } from '@eventlens/database';
import { QueueError, type Execution, type JobQueuePostgres, type SqlTransaction } from '@eventlens/job-queue';
import { EXPORT_CLEANUP_QUEUE, parseExportCleanupResourceRef } from './export-job.js';
import type { ExportAuditSink } from './export-request.js';
import type { ExportObjectRef, ExportObjectStorage } from './storage.js';

export type ExportCleanupResult = 'CLEANED' | 'RETRYING' | 'DEAD' | 'ABANDONED';

export interface ExportCleanupOutcome {
  readonly exportId: string;
  readonly result: ExportCleanupResult;
  readonly deletedObjects?: number;
}

export interface ExportCleanupConfig {
  readonly owner: string;
  readonly leaseMs: number;
  readonly maxAttempts: number;
  readonly retryBackoffMs: number;
}

type CleanupQueue = Pick<JobQueuePostgres, 'reserve' | 'heartbeat' | 'complete' | 'retry'>;

/**
 * Removes every stored output (parts and manifest) of an expired export. Deletion is idempotent and runs outside any
 * SQL transaction; the rows are only marked EXPIRED after the objects are gone, so an interrupted cleanup is simply
 * repeated. Exhausted retries end as DEAD (operator alert) without touching the already committed expiry.
 */
export class ExportCleanupWorker {
  constructor(
    private readonly queue: CleanupQueue,
    private readonly runner: TransactionRunner,
    private readonly storage: ExportObjectStorage,
    private readonly config: ExportCleanupConfig,
    private readonly auditSink?: ExportAuditSink,
    private readonly clock: () => Date = () => new Date()
  ) {
    const { owner, leaseMs, maxAttempts, retryBackoffMs } = config;
    if (!owner || !Number.isSafeInteger(leaseMs) || leaseMs <= 0 || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 ||
        !Number.isSafeInteger(retryBackoffMs) || retryBackoffMs < 0) {
      throw new Error('INVALID_CONFIG');
    }
  }

  async runOnce(): Promise<ExportCleanupOutcome[]> {
    const reservation = await this.queue.reserve([EXPORT_CLEANUP_QUEUE], this.config.owner, 1, this.config.leaseMs);
    const outcomes: ExportCleanupOutcome[] = [];
    try {
      for (const job of reservation.jobs) outcomes.push(await this.process(job));
    } finally {
      reservation.releaseAfterQuiescence();
    }
    return outcomes;
  }

  private async process(job: Execution): Promise<ExportCleanupOutcome> {
    const exportId = parseExportCleanupResourceRef(job.resourceRef);
    if (!exportId) return { exportId: 'unknown', result: 'DEAD' };
    try {
      const objects = await this.runner.run((tx: SqlTransaction) => this.listObjects(tx, exportId));
      await this.queue.heartbeat(job, this.config.leaseMs);
      for (const ref of objects) await this.storage.deleteObject(ref);
      await this.queue.complete(job, `${job.token}:cleanup`, { deleted: objects.length }, async (tx) => {
        await tx.execute(
          `UPDATE export_part
           SET status = CASE WHEN status = 'READY' THEN 'EXPIRED' ELSE status END, object_namespace = NULL, object_key = NULL
           WHERE export_id = $1::uuid AND object_key IS NOT NULL`,
          exportId
        );
        await tx.execute('UPDATE export_request SET manifest_namespace = NULL, manifest_key = NULL WHERE id = $1::uuid', exportId);
      });
      await this.audit(exportId, objects.length);
      return { exportId, result: 'CLEANED', deletedObjects: objects.length };
    } catch (error) {
      if (error instanceof QueueError) return { exportId, result: 'ABANDONED' };
      try {
        if (job.attempt >= this.config.maxAttempts) {
          await this.queue.retry(job, `${job.token}:dead`, { code: 'CLEANUP_EXHAUSTED' }, null, 'DEAD', async () => {});
          return { exportId, result: 'DEAD' };
        }
        await this.queue.retry(
          job, `${job.token}:retry`, { code: 'TRANSIENT', attempt: job.attempt },
          new Date(this.clock().getTime() + this.config.retryBackoffMs), 'RETRYING', async () => {}
        );
        return { exportId, result: 'RETRYING' };
      } catch {
        return { exportId, result: 'ABANDONED' };
      }
    }
  }

  private async listObjects(tx: SqlTransaction, exportId: string): Promise<ExportObjectRef[]> {
    const parts = await tx.query<{ object_namespace: string; object_key: string }>(
      'SELECT object_namespace, object_key FROM export_part WHERE export_id = $1::uuid AND object_key IS NOT NULL ORDER BY part_number',
      exportId
    );
    const manifest = await tx.query<{ manifest_namespace: string | null; manifest_key: string | null }>(
      'SELECT manifest_namespace, manifest_key FROM export_request WHERE id = $1::uuid',
      exportId
    );
    const refs: ExportObjectRef[] = parts.map((p) => ({ namespace: p.object_namespace, key: p.object_key }));
    const m = manifest[0];
    if (m?.manifest_namespace && m.manifest_key) refs.push({ namespace: m.manifest_namespace, key: m.manifest_key });
    return refs;
  }

  private async audit(exportId: string, deleted: number): Promise<void> {
    if (!this.auditSink) return;
    try {
      const rows = await this.runner.run((tx: SqlTransaction) => tx.query<{ event_id: string }>(
        'SELECT event_id FROM export_request WHERE id = $1::uuid', exportId
      ));
      await this.auditSink.record({
        id: randomUUID(), procedure: 'EXPORT_CLEANED_UP', eventId: String(rows[0]?.event_id ?? ''), exportId,
        itemCount: 0, excludedCount: 0, partCount: deleted, timestamp: this.clock()
      });
    } catch {
      // best effort
    }
  }
}
