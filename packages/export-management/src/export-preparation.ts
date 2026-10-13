import { createHash, randomUUID } from 'node:crypto';
import type { TransactionRunner } from '@eventlens/database';
import { QueueError, type Execution, type JobQueuePostgres, type SqlTransaction } from '@eventlens/job-queue';
import { EXPORT_QUEUE, parseExportResourceRef } from './export-job.js';
import type { ExportAuditSink } from './export-request.js';
import { DEFAULT_TARGET_PART_BYTES, entryNameFor, planParts } from './planning.js';
import type { ExportObjectRef, ExportObjectStorage } from './storage.js';
import { streamZip, ZipSourceError, type ZipEntry } from './zip.js';

export type ExportPreparationResult = 'PREPARED' | 'RETRYING' | 'FAILED' | 'DEAD' | 'INVALIDATED' | 'ABANDONED';

export interface ExportPreparationOutcome {
  readonly exportId: string;
  readonly result: ExportPreparationResult;
  readonly partsReady?: number;
  readonly code?: string;
}

export interface ExportPreparationConfig {
  readonly owner: string;
  /** Private namespace for export outputs, separate from originals and derivatives (DEC-063). */
  readonly exportNamespace: string;
  readonly leaseMs: number;
  readonly heartbeatMs: number;
  /** Total automatic attempts including the first (DEC-064). */
  readonly maxAttempts: number;
  readonly retryBackoffMs: number;
  /** Target size per ZIP part; defaults to ~5 GB (DEC-049). Operational storage, not commercial quota (DEC-079). */
  readonly targetPartBytes?: number;
}

export type RevalidationVerdict = { readonly ok: true } | { readonly ok: false; readonly code: string };

export interface ExportRevalidationTarget {
  readonly exportId: string;
  readonly eventId: string;
  readonly organizerId: string;
}

/** Current-permission check run before preparing and again before promoting an output (DEC-090). */
export interface ExportRevalidator {
  revalidate(tx: SqlTransaction, target: ExportRevalidationTarget): Promise<RevalidationVerdict>;
}

const BLOCKED_EVENT_STATUSES = ['SUSPENDED', 'PENDING_DELETION', 'ARCHIVED', 'DELETED'];

export class DefaultExportRevalidator implements ExportRevalidator {
  async revalidate(tx: SqlTransaction, target: ExportRevalidationTarget): Promise<RevalidationVerdict> {
    const events = await tx.query<{ status: string; organizer_id: string }>(
      'SELECT status, organizer_id FROM event WHERE id = $1::uuid',
      target.eventId
    );
    if (!events.length || String(events[0]!.organizer_id) !== target.organizerId || BLOCKED_EVENT_STATUSES.includes(events[0]!.status)) {
      return { ok: false, code: 'EVENT_ACCESS_REVOKED' };
    }
    const withdrawn = await tx.query<{ cnt: number | string }>(
      `SELECT count(*)::int AS cnt
       FROM export_request_item i
       LEFT JOIN media_catalog m ON m.media_ref = i.media_ref
       WHERE i.export_id = $1::uuid
         AND (m.media_ref IS NULL OR m.status NOT IN ('PUBLISHED','HIDDEN') OR m.generation <> i.generation)`,
      target.exportId
    );
    return Number(withdrawn[0]?.cnt ?? 0) > 0 ? { ok: false, code: 'MEDIA_WITHDRAWN' } : { ok: true };
  }
}

class ExportInvalidated extends Error {
  constructor(readonly code: string) { super(code); }
}
class ExportPreparationError extends Error {
  constructor(readonly code: 'REQUEST_NOT_FOUND' | 'PARTS_INCOMPLETE') { super(code); }
}

interface RequestRow {
  id: string;
  event_id: string;
  organizer_id: string;
  generation: bigint | number | string;
  requested_at: Date | string;
}
interface ItemRow {
  position: number;
  media_ref: string;
  generation: bigint | number | string;
  original_namespace: string;
  original_key: string;
  original_version: string;
  original_sha256: string;
  original_bytes: bigint | number | string;
  file_name: string | null;
  part_number: number | null;
}
interface PartRow {
  part_number: number;
  status: string;
  entry_count: number;
  size_bytes: bigint | number | string | null;
  sha256: string | null;
}

type PreparationQueue = Pick<JobQueuePostgres, 'reserve' | 'heartbeat' | 'checkpoint' | 'complete' | 'retry'>;

interface RunContext {
  manifestRef?: ExportObjectRef;
  manifestCommitted: boolean;
  request?: RequestRow;
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/**
 * Worker-side preparation of an export (EL-TK-126). Runs the already frozen manifest into numbered stored ZIP64
 * parts in the private exports namespace. Outputs are unique per attempt, parts are promoted by fenced checkpoints,
 * valid parts are reused on replay, and nothing is declared available here (EL-TK-127 owns availability).
 */
export class ExportPreparationWorker {
  constructor(
    private readonly queue: PreparationQueue,
    private readonly runner: TransactionRunner,
    private readonly storage: ExportObjectStorage,
    private readonly config: ExportPreparationConfig,
    private readonly revalidator: ExportRevalidator = new DefaultExportRevalidator(),
    private readonly auditSink?: ExportAuditSink,
    private readonly clock: () => Date = () => new Date()
  ) {
    const { leaseMs, heartbeatMs, maxAttempts, retryBackoffMs, exportNamespace, owner, targetPartBytes } = config;
    if (!owner || !exportNamespace) throw new Error('INVALID_CONFIG');
    if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0 || !Number.isSafeInteger(heartbeatMs) || heartbeatMs <= 0 || heartbeatMs >= leaseMs) {
      throw new Error('INVALID_CONFIG');
    }
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || !Number.isSafeInteger(retryBackoffMs) || retryBackoffMs < 0) {
      throw new Error('INVALID_CONFIG');
    }
    if (targetPartBytes !== undefined && (!Number.isSafeInteger(targetPartBytes) || targetPartBytes <= 0)) throw new Error('INVALID_CONFIG');
  }

  /** Reserves at most one export job, runs it to a durable disposition and releases the slot after the I/O drained. */
  async runOnce(): Promise<ExportPreparationOutcome[]> {
    const reservation = await this.queue.reserve([EXPORT_QUEUE], this.config.owner, 1, this.config.leaseMs);
    const outcomes: ExportPreparationOutcome[] = [];
    try {
      for (const job of reservation.jobs) outcomes.push(await this.process(job));
    } finally {
      reservation.releaseAfterQuiescence();
    }
    return outcomes;
  }

  private read<T>(work: (tx: SqlTransaction) => Promise<T>): Promise<T> {
    return this.runner.run(work as any) as Promise<T>;
  }

  private async process(job: Execution): Promise<ExportPreparationOutcome> {
    const exportId = parseExportResourceRef(job.resourceRef);
    if (!exportId) {
      return this.terminate(job, 'unknown', { code: 'REQUEST_NOT_FOUND', kind: 'FAILED' }, { manifestCommitted: false });
    }
    const controller = new AbortController();
    const timer = setInterval(() => {
      this.queue.heartbeat(job, this.config.leaseMs).catch(() => controller.abort());
    }, this.config.heartbeatMs);
    const context: RunContext = { manifestCommitted: false };
    try {
      return await this.run(job, exportId, controller.signal, context);
    } catch (error) {
      return await this.handleFailure(job, exportId, error, controller.signal, context);
    } finally {
      clearInterval(timer);
    }
  }

  private async run(job: Execution, exportId: string, signal: AbortSignal, context: RunContext): Promise<ExportPreparationOutcome> {
    const requests = await this.read((tx) => tx.query<RequestRow>(
      'SELECT id, event_id, organizer_id, generation, requested_at FROM export_request WHERE id = $1::uuid',
      exportId
    ));
    if (!requests.length) throw new ExportPreparationError('REQUEST_NOT_FOUND');
    const request = requests[0]!;
    context.request = request;
    const generation = BigInt(request.generation);
    const target: ExportRevalidationTarget = { exportId, eventId: String(request.event_id), organizerId: String(request.organizer_id) };

    await this.queue.checkpoint(job, `${job.token}:start`, { step: 'START' }, async (tx) => {
      await tx.execute(
        `UPDATE export_request SET status = 'PREPARING' WHERE id = $1::uuid AND generation = $2::bigint AND status IN ('REQUESTED','PREPARING')`,
        exportId, generation.toString()
      );
    });

    const verdict = await this.read((tx) => this.revalidator.revalidate(tx, target));
    if (!verdict.ok) throw new ExportInvalidated(verdict.code);

    await this.ensurePlan(job, exportId, generation);

    const parts = await this.read((tx) => tx.query<PartRow>(
      `SELECT part_number, status, entry_count, size_bytes, sha256 FROM export_part
       WHERE export_id = $1::uuid AND generation = $2::bigint ORDER BY part_number`,
      exportId, generation.toString()
    ));
    for (const part of parts) {
      if (part.status === 'READY') continue; // a valid part is never rebuilt or duplicated
      await this.queue.heartbeat(job, this.config.leaseMs);
      await this.writePart(job, request, generation, part.part_number, signal);
    }

    await this.finish(job, request, generation, target, context);
    return { exportId, result: 'PREPARED', partsReady: parts.length };
  }

  private async ensurePlan(job: Execution, exportId: string, generation: bigint): Promise<void> {
    const existing = await this.read((tx) => tx.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM export_part WHERE export_id = $1::uuid AND generation = $2::bigint',
      exportId, generation.toString()
    ));
    if (Number(existing[0]?.n ?? 0) > 0) return;

    const items = await this.loadItems(exportId);
    const target = this.config.targetPartBytes ?? DEFAULT_TARGET_PART_BYTES;
    const plan = planParts(
      items.map((i) => ({ position: i.position, entryName: entryNameFor(i.position, i.file_name), bytes: Number(i.original_bytes) })),
      target
    );
    await this.queue.checkpoint(job, `${job.token}:plan`, { parts: plan.length }, async (tx) => {
      for (const part of plan) {
        await tx.execute(
          `INSERT INTO export_part (export_id, part_number, generation, status, entry_count, planned_bytes)
           VALUES ($1::uuid, $2, $3::bigint, 'PENDING', $4, $5::bigint) ON CONFLICT DO NOTHING`,
          exportId, part.partNumber, generation.toString(), part.positions.length, part.plannedBytes
        );
        await tx.execute(
          'UPDATE export_request_item SET part_number = $3 WHERE export_id = $1::uuid AND position = ANY($2::int[])',
          exportId, part.positions, part.partNumber
        );
      }
      await tx.execute('UPDATE export_request SET target_part_bytes = COALESCE(target_part_bytes, $2::bigint) WHERE id = $1::uuid', exportId, String(target));
    });
  }

  private loadItems(exportId: string, partNumber?: number): Promise<ItemRow[]> {
    return this.read((tx) => tx.query<ItemRow>(
      `SELECT position, media_ref, generation, original_namespace, original_key, original_version, original_sha256,
              original_bytes, file_name, part_number
       FROM export_request_item
       WHERE export_id = $1::uuid AND ($2::int IS NULL OR part_number = $2::int)
       ORDER BY position`,
      exportId, partNumber ?? null
    ));
  }

  private async writePart(job: Execution, request: RequestRow, generation: bigint, partNumber: number, signal: AbortSignal): Promise<void> {
    const items = await this.loadItems(request.id, partNumber);
    const entries: ZipEntry[] = items.map((item) => ({
      name: entryNameFor(item.position, item.file_name),
      expectedBytes: Number(item.original_bytes),
      expectedSha256: item.original_sha256,
      open: (s) => this.storage.openRead(
        { namespace: item.original_namespace, key: item.original_key, version: item.original_version }, s
      )
    }));
    const ref: ExportObjectRef = {
      namespace: this.config.exportNamespace,
      key: `exports/${request.id}/g${generation}/${job.token}/part-${pad(partNumber, 4)}.zip`
    };
    let size = 0;
    const sha = createHash('sha256');
    async function* counted(source: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
      for await (const chunk of source) {
        size += chunk.length;
        sha.update(chunk);
        yield chunk;
      }
    }
    try {
      await this.storage.writeObject(ref, counted(streamZip(entries, new Date(request.requested_at), signal)), signal);
    } catch (error) {
      await this.safeDelete(ref); // a failed or aborted attempt never leaves a promotable output behind
      throw error;
    }

    let promoted = false;
    const partSha = sha.digest('hex');
    let status: 'COMMITTED' | 'ALREADY_COMMITTED';
    try {
      status = await this.queue.checkpoint(job, `${job.token}:part:${partNumber}`, { part: partNumber, bytes: size }, async (tx) => {
        const updated = await tx.execute(
          `UPDATE export_part
           SET status = 'READY', object_namespace = $3, object_key = $4, size_bytes = $5::bigint, sha256 = $6,
               attempt_token = $7::uuid, completed_at = clock_timestamp()
           WHERE export_id = $1::uuid AND part_number = $2 AND generation = $8::bigint AND status <> 'READY'`,
          request.id, partNumber, ref.namespace, ref.key, String(size), partSha, job.token, generation.toString()
        );
        promoted = updated === 1;
      });
    } catch (error) {
      await this.safeDelete(ref); // lost lease/barrier: this output must not be promoted
      throw error;
    }
    // Another attempt already promoted this part: ours is an orphan. A replayed ACK of our own commit is not.
    if (status === 'COMMITTED' && !promoted) await this.safeDelete(ref);
    await this.audit(request, 'EXPORT_PART_READY', { partNumber, bytes: size });
  }

  private async finish(job: Execution, request: RequestRow, generation: bigint, target: ExportRevalidationTarget, context: RunContext): Promise<void> {
    const parts = await this.read((tx) => tx.query<PartRow>(
      `SELECT part_number, status, entry_count, size_bytes, sha256 FROM export_part
       WHERE export_id = $1::uuid AND generation = $2::bigint ORDER BY part_number`,
      request.id, generation.toString()
    ));
    if (!parts.length || parts.some((p) => p.status !== 'READY')) throw new ExportPreparationError('PARTS_INCOMPLETE');
    const items = await this.loadItems(request.id);
    const manifest = Buffer.from(JSON.stringify({
      schemaVersion: 1,
      exportId: request.id,
      generation: generation.toString(),
      requestedAt: new Date(request.requested_at).toISOString(),
      parts: parts.map((p) => ({ partNumber: p.part_number, entryCount: p.entry_count, bytes: Number(p.size_bytes), sha256: p.sha256 })),
      entries: items.map((i) => ({
        position: i.position, mediaRef: i.media_ref, partNumber: i.part_number, bytes: Number(i.original_bytes), sha256: i.original_sha256
      }))
    }), 'utf8');
    const manifestRef: ExportObjectRef = {
      namespace: this.config.exportNamespace,
      key: `exports/${request.id}/g${generation}/${job.token}/manifest.json`
    };
    context.manifestRef = manifestRef;
    await this.queue.heartbeat(job, this.config.leaseMs);
    const abort = new AbortController();
    await this.storage.writeObject(manifestRef, (async function* () { yield manifest; })(), abort.signal);
    const manifestSha = createHash('sha256').update(manifest).digest('hex');

    await this.queue.complete(job, `${job.token}:complete`, { parts: parts.length }, async (tx) => {
      // Re-validate immediately before promotion: permissions may have changed while parts were written.
      const verdict = await this.revalidator.revalidate(tx, target);
      if (!verdict.ok) throw new ExportInvalidated(verdict.code);
      const state = await tx.query<{ ready: number; total: number }>(
        `SELECT count(*) FILTER (WHERE status = 'READY')::int AS ready, count(*)::int AS total
         FROM export_part WHERE export_id = $1::uuid AND generation = $2::bigint`,
        request.id, generation.toString()
      );
      if (!state[0] || state[0].total === 0 || state[0].ready !== state[0].total) throw new ExportPreparationError('PARTS_INCOMPLETE');
      await tx.execute(
        `UPDATE export_request
         SET prepared_at = clock_timestamp(), manifest_namespace = $3, manifest_key = $4, manifest_sha256 = $5, manifest_bytes = $6::bigint
         WHERE id = $1::uuid AND generation = $2::bigint AND status = 'PREPARING'`,
        request.id, generation.toString(), manifestRef.namespace, manifestRef.key, manifestSha, String(manifest.length)
      );
    });
    context.manifestCommitted = true;
    await this.audit(request, 'EXPORT_PREPARED', { bytes: parts.reduce((sum, p) => sum + Number(p.size_bytes), 0) });
  }

  private async handleFailure(
    job: Execution,
    exportId: string,
    error: unknown,
    signal: AbortSignal,
    context: RunContext
  ): Promise<ExportPreparationOutcome> {
    if (error instanceof QueueError || (signal.aborted && !(error instanceof ZipSourceError && error.code !== 'ABORTED'))) {
      // Lease/authority lost: another attempt owns the work. Only our own unpromoted manifest is removed.
      if (context.manifestRef && !context.manifestCommitted) await this.safeDelete(context.manifestRef);
      return { exportId, result: 'ABANDONED', code: error instanceof QueueError ? error.code : 'ABORTED' };
    }
    if (context.manifestRef && !context.manifestCommitted) await this.safeDelete(context.manifestRef);

    if (error instanceof ExportInvalidated) {
      return this.terminate(job, exportId, { code: error.code, kind: 'INVALIDATED' }, context);
    }
    if (error instanceof ExportPreparationError) {
      return this.terminate(job, exportId, { code: error.code, kind: 'FAILED' }, context);
    }
    if (error instanceof ZipSourceError) {
      return this.terminate(job, exportId, { code: error.code, kind: 'FAILED' }, context);
    }
    // Everything else (storage/network/DB hiccups) is transient and bounded by the attempt budget (DEC-064).
    if (job.attempt >= this.config.maxAttempts) {
      return this.terminate(job, exportId, { code: 'RETRIES_EXHAUSTED', kind: 'DEAD' }, context);
    }
    try {
      await this.queue.retry(
        job, `${job.token}:retry`, { code: 'TRANSIENT', attempt: job.attempt },
        new Date(this.clock().getTime() + this.config.retryBackoffMs), 'RETRYING', async () => {}
      );
    } catch {
      return { exportId, result: 'ABANDONED', code: 'LEASE_LOST' };
    }
    return { exportId, result: 'RETRYING', code: 'TRANSIENT' };
  }

  /** Durable terminal disposition: export state and job disposition commit together, then outputs are cleaned. */
  private async terminate(
    job: Execution,
    exportId: string,
    terminal: { code: string; kind: 'FAILED' | 'INVALIDATED' | 'DEAD' },
    context: RunContext
  ): Promise<ExportPreparationOutcome> {
    const status = terminal.kind === 'INVALIDATED' ? 'INVALIDATED' : 'FAILED';
    try {
      await this.queue.retry(
        job, `${job.token}:terminal`, { code: terminal.code, kind: terminal.kind }, null,
        terminal.kind === 'DEAD' ? 'DEAD' : 'FAILED',
        async (tx) => {
          if (exportId === 'unknown') return;
          await tx.execute(
            `UPDATE export_request SET status = $2, failure_code = $3, status_reason = $3
             WHERE id = $1::uuid AND status IN ('REQUESTED','PREPARING')`,
            exportId, status, terminal.code
          );
        }
      );
    } catch {
      return { exportId, result: 'ABANDONED', code: 'LEASE_LOST' };
    }
    if (exportId !== 'unknown') {
      await this.cleanupOutputs(exportId);
      if (context.request) {
        await this.audit(context.request, terminal.kind === 'INVALIDATED' ? 'EXPORT_INVALIDATED' : 'EXPORT_PREPARATION_FAILED', { code: terminal.code });
      }
    }
    return { exportId, result: terminal.kind === 'INVALIDATED' ? 'INVALIDATED' : terminal.kind === 'DEAD' ? 'DEAD' : 'FAILED', code: terminal.code };
  }

  /** Removes every promoted output of a dead export. Failures keep the row so reconciliation can retry later. */
  private async cleanupOutputs(exportId: string): Promise<void> {
    try {
      const rows = await this.read((tx) => tx.query<{ part_number: number; object_namespace: string; object_key: string }>(
        `SELECT part_number, object_namespace, object_key FROM export_part
         WHERE export_id = $1::uuid AND status = 'READY' AND object_key IS NOT NULL`,
        exportId
      ));
      for (const row of rows) {
        try {
          await this.storage.deleteObject({ namespace: row.object_namespace, key: row.object_key });
        } catch {
          continue;
        }
        await this.read((tx) => tx.execute(
          `UPDATE export_part SET status = 'FAILED', object_namespace = NULL, object_key = NULL, size_bytes = NULL, sha256 = NULL, completed_at = NULL
           WHERE export_id = $1::uuid AND part_number = $2`,
          exportId, row.part_number
        ));
      }
    } catch {
      // best effort; orphan reconciliation is an operational follow-up (EXPORT-001)
    }
  }

  private async safeDelete(ref: ExportObjectRef): Promise<void> {
    try {
      await this.storage.deleteObject(ref);
    } catch {
      // a failed delete leaves an unpromoted orphan; it is never referenced by export_part
    }
  }

  private async audit(request: RequestRow, procedure: 'EXPORT_PART_READY' | 'EXPORT_PREPARED' | 'EXPORT_PREPARATION_FAILED' | 'EXPORT_INVALIDATED', extra: { partNumber?: number; bytes?: number; code?: string }): Promise<void> {
    if (!this.auditSink) return;
    try {
      await this.auditSink.record({
        id: randomUUID(), procedure, eventId: String(request.event_id), exportId: request.id,
        itemCount: 0, excludedCount: 0, timestamp: this.clock(), ...extra
      });
    } catch {
      // auditing must not change the durable disposition of the job
    }
  }
}
