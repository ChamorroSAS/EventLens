import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import { exportCleanupJobSpec, type ExportJobPublisher } from './export-job.js';
import type { ExportAuditSink } from './export-request.js';

/** DEC-048: export links/parts stay available for 48 hours from availability. */
export const EXPORT_AVAILABILITY_HOURS = 48;

export type ExportAvailabilityErrorCode =
  | 'EXPORT_NOT_FOUND'
  | 'NOT_PUBLISHABLE'
  | 'PARTS_INCOMPLETE'
  | 'MANIFEST_INCONSISTENT';

export class ExportAvailabilityError extends Error {
  constructor(readonly code: ExportAvailabilityErrorCode) {
    super(code);
    this.name = 'ExportAvailabilityError';
  }
}

export interface ExportAvailability {
  readonly exportId: string;
  readonly eventId: string;
  readonly organizerId: string;
  readonly partCount: number;
  readonly totalBytes: number;
  readonly availableAt: Date;
  readonly expiresAt: Date;
  /** False when the export was already AVAILABLE: a replay never moves the window. */
  readonly publishedNow: boolean;
}

export interface ExportLifecycleNotice {
  readonly exportId: string;
  readonly eventId: string;
  readonly organizerId: string;
  readonly partCount: number;
  readonly expiresAt: Date;
}

/**
 * Notice contract towards EL-EP-013. Called inside the publishing transaction so the intent commits (or rolls back)
 * with the state change. This package neither sends email nor depends on the notifications package.
 */
export interface ExportLifecycleNotifier {
  exportAvailable(tx: SqlTransaction, notice: ExportLifecycleNotice): Promise<void>;
  exportExpired?(tx: SqlTransaction, notice: ExportLifecycleNotice): Promise<void>;
}

/** Pure rule for grant issuers (EL-TK-129): expiry blocks new grants even if the reconciler is late. */
export function isExportAvailable(row: { status: string; expiresAt: Date | string | null }, now: Date): boolean {
  return row.status === 'AVAILABLE' && row.expiresAt !== null && new Date(row.expiresAt).getTime() > now.getTime();
}

interface RawExportRow {
  id: string;
  event_id: string;
  organizer_id: string;
  status: string;
  generation: bigint | number | string;
  prepared_at: Date | string | null;
  manifest_key: string | null;
  available_at: Date | string | null;
  expires_at: Date | string | null;
}
interface RawPartRow {
  part_number: number;
  status: string;
  entry_count: number;
  object_key: string | null;
  size_bytes: bigint | number | string | null;
  sha256: string | null;
}

/**
 * Declares a prepared export AVAILABLE for 48 h, only when every authorized part and the manifest are consistent.
 * Runs inside the caller's transaction (job completion or standalone recovery). Idempotent: a second call returns the
 * existing window untouched. Uses the database clock so replays and retries cannot skew the timestamps.
 */
export async function publishExportAvailability(
  tx: SqlTransaction,
  exportId: string,
  hours: number = EXPORT_AVAILABILITY_HOURS
): Promise<ExportAvailability> {
  const rows = await tx.query<RawExportRow>(
    `SELECT id, event_id, organizer_id, status, generation, prepared_at, manifest_key, available_at, expires_at
     FROM export_request WHERE id = $1::uuid FOR UPDATE`,
    exportId
  );
  if (!rows.length) throw new ExportAvailabilityError('EXPORT_NOT_FOUND');
  const row = rows[0]!;
  const generation = BigInt(row.generation).toString();

  const parts = await tx.query<RawPartRow>(
    `SELECT part_number, status, entry_count, object_key, size_bytes, sha256
     FROM export_part WHERE export_id = $1::uuid AND generation = $2::bigint ORDER BY part_number`,
    exportId, generation
  );
  const summary = (publishedNow: boolean, availableAt: Date | string, expiresAt: Date | string): ExportAvailability => ({
    exportId,
    eventId: String(row.event_id),
    organizerId: String(row.organizer_id),
    partCount: parts.length,
    totalBytes: parts.reduce((sum, p) => sum + Number(p.size_bytes ?? 0), 0),
    availableAt: new Date(availableAt),
    expiresAt: new Date(expiresAt),
    publishedNow
  });

  if (row.status === 'AVAILABLE' && row.available_at && row.expires_at) {
    return summary(false, row.available_at, row.expires_at);
  }
  if (row.status !== 'PREPARING') throw new ExportAvailabilityError('NOT_PUBLISHABLE');
  // A partially prepared export is never available just because some parts exist.
  if (!parts.length || parts.some((p) => p.status !== 'READY')) throw new ExportAvailabilityError('PARTS_INCOMPLETE');
  if (!row.prepared_at || !row.manifest_key) throw new ExportAvailabilityError('MANIFEST_INCONSISTENT');
  if (parts.some((p) => !p.object_key || !p.size_bytes || !p.sha256)) throw new ExportAvailabilityError('MANIFEST_INCONSISTENT');

  const items = await tx.query<{ part_number: number | null; cnt: number | string }>(
    'SELECT part_number, count(*)::int AS cnt FROM export_request_item WHERE export_id = $1::uuid GROUP BY part_number',
    exportId
  );
  const perPart = new Map<number, number>();
  for (const item of items) {
    if (item.part_number === null) throw new ExportAvailabilityError('MANIFEST_INCONSISTENT');
    perPart.set(item.part_number, Number(item.cnt));
  }
  if (perPart.size !== parts.length || parts.some((p) => perPart.get(p.part_number) !== p.entry_count)) {
    throw new ExportAvailabilityError('MANIFEST_INCONSISTENT');
  }

  const updated = await tx.query<{ available_at: Date; expires_at: Date }>(
    `UPDATE export_request e
     SET status = 'AVAILABLE', available_at = t.now, expires_at = t.now + $2::double precision * interval '1 hour'
     FROM (SELECT clock_timestamp() AS now) t
     WHERE e.id = $1::uuid AND e.status = 'PREPARING'
     RETURNING e.available_at, e.expires_at`,
    exportId, hours
  );
  if (!updated.length) throw new ExportAvailabilityError('NOT_PUBLISHABLE');
  return summary(true, updated[0]!.available_at, updated[0]!.expires_at);
}

/** Standalone, idempotent recovery path for a prepared export that was not published (e.g. after a crash window). */
export class ExportAvailabilityService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly auditSink?: ExportAuditSink,
    private readonly notifier?: ExportLifecycleNotifier
  ) {
    if (!runner) throw new ExportAvailabilityError('NOT_PUBLISHABLE');
  }

  async publish(exportId: string): Promise<ExportAvailability> {
    const result = await this.runner.run(async (tx) => {
      const availability = await publishExportAvailability(tx, exportId);
      if (availability.publishedNow && this.notifier) await this.notifier.exportAvailable(tx, availability);
      return availability;
    });
    if (result.publishedNow) await recordAvailabilityAudit(this.auditSink, result);
    return result;
  }
}

export async function recordAvailabilityAudit(sink: ExportAuditSink | undefined, availability: ExportAvailability): Promise<void> {
  if (!sink) return;
  try {
    await sink.record({
      id: randomUUID(), procedure: 'EXPORT_AVAILABLE', eventId: availability.eventId, exportId: availability.exportId,
      itemCount: 0, excludedCount: 0, partCount: availability.partCount, bytes: availability.totalBytes, timestamp: availability.availableAt
    });
  } catch {
    // auditing never changes the durable state
  }
}

export interface ExportExpiryResult {
  readonly expiredExportIds: readonly string[];
}

/**
 * Reconciles windows that have elapsed: AVAILABLE -> EXPIRED (distinct from FAILED/INVALIDATED), after which no new
 * grant may be issued, and an idempotent cleanup job is queued for every part and the manifest. A slow or failed
 * cleanup never delays or undoes the expiry. Safe to run from many schedulers: rows are claimed with SKIP LOCKED.
 */
export class ExportExpiryReconciler {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly publisher?: ExportJobPublisher,
    private readonly auditSink?: ExportAuditSink,
    private readonly notifier?: ExportLifecycleNotifier
  ) {}

  async reconcile(options: { limit?: number } = {}): Promise<ExportExpiryResult> {
    const limit = options.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit <= 0) throw new ExportAvailabilityError('NOT_PUBLISHABLE');
    const expired = await this.runner.run(async (tx) => {
      const due = await tx.query<{ id: string; event_id: string; organizer_id: string; generation: bigint | number | string; expires_at: Date }>(
        `SELECT id, event_id, organizer_id, generation, expires_at FROM export_request
         WHERE status = 'AVAILABLE' AND expires_at <= clock_timestamp()
         ORDER BY expires_at, id LIMIT $1 FOR UPDATE SKIP LOCKED`,
        limit
      );
      const done: { id: string; eventId: string; at: Date }[] = [];
      for (const row of due) {
        const updated = await tx.query<{ expired_at: Date }>(
          `UPDATE export_request SET status = 'EXPIRED', expired_at = clock_timestamp()
           WHERE id = $1::uuid AND status = 'AVAILABLE' RETURNING expired_at`,
          row.id
        );
        if (!updated.length) continue;
        const parts = await tx.query<{ cnt: number | string }>(
          'SELECT count(*)::int AS cnt FROM export_part WHERE export_id = $1::uuid AND generation = $2::bigint',
          row.id, BigInt(row.generation).toString()
        );
        if (this.publisher) {
          await this.publisher.publish(tx, exportCleanupJobSpec(row.id, BigInt(row.generation), updated[0]!.expired_at));
        }
        if (this.notifier?.exportExpired) {
          await this.notifier.exportExpired(tx, {
            exportId: row.id, eventId: String(row.event_id), organizerId: String(row.organizer_id),
            partCount: Number(parts[0]?.cnt ?? 0), expiresAt: new Date(row.expires_at)
          });
        }
        done.push({ id: row.id, eventId: String(row.event_id), at: updated[0]!.expired_at });
      }
      return done;
    });
    if (this.auditSink) {
      for (const item of expired) {
        try {
          await this.auditSink.record({
            id: randomUUID(), procedure: 'EXPORT_EXPIRED', eventId: item.eventId, exportId: item.id,
            itemCount: 0, excludedCount: 0, timestamp: item.at
          });
        } catch {
          // best effort
        }
      }
    }
    return { expiredExportIds: expired.map((e) => e.id) };
  }
}
