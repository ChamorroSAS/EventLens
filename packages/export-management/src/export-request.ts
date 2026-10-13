import { createHash, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';

export type ExportErrorCode =
  | 'INVALID_ARGUMENT'
  | 'UNAUTHORIZED'
  | 'EVENT_NOT_ELIGIBLE'
  | 'NO_ELIGIBLE_MEDIA'
  | 'IDEMPOTENCY_CONFLICT'
  | 'EXPORT_IN_PROGRESS';

export class ExportError extends Error {
  constructor(
    readonly code: ExportErrorCode,
    message?: string,
    readonly exclusions?: Readonly<Record<string, number>>
  ) {
    super(message ?? code);
    this.name = 'ExportError';
  }
}

export interface RequestExportCommand {
  readonly eventId: string;
  readonly organizerAccountId: string;
  /** Stable per user intent; replays return the original request instead of creating another. */
  readonly idempotencyKey: string;
  readonly now?: Date;
}

export interface ExportRequestResult {
  readonly exportId: string;
  readonly eventId: string;
  readonly status: 'REQUESTED';
  readonly selectedCount: number;
  readonly selectedBytes: bigint;
  /** Media of the event left out of the snapshot, counted by catalog status (or MISSING_ORIGINAL). */
  readonly exclusions: Readonly<Record<string, number>>;
  readonly requestedAt: string;
  readonly replayed: boolean;
}

export interface ExportAuditEvent {
  readonly id: string;
  readonly procedure: 'EXPORT_REQUESTED';
  readonly eventId: string;
  readonly exportId: string;
  readonly itemCount: number;
  readonly excludedCount: number;
  readonly timestamp: Date;
}

export interface ExportAuditSink {
  record(event: ExportAuditEvent): Promise<void>;
}

/** DEC-046: total download covers PUBLISHED and HIDDEN originals by default. */
export const EXPORT_ELIGIBLE_STATUSES = ['PUBLISHED', 'HIDDEN'] as const;
const BLOCKED_EVENT_STATUSES = ['SUSPENDED', 'PENDING_DELETION', 'ARCHIVED', 'DELETED'];

interface RawEventRow { status: string; organizer_id: string; }
interface RawExportRow {
  id: string;
  event_id: string;
  request_fingerprint: string;
  status: string;
  selected_count: number | string;
  selected_bytes: bigint | number | string;
  exclusions: unknown;
  requested_at: Date | string;
}

function parseExclusions(value: unknown): Record<string, number> {
  const raw = typeof value === 'string' ? JSON.parse(value) : value;
  return raw && typeof raw === 'object' ? { ...(raw as Record<string, number>) } : {};
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; meta?: { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } } };
  return e?.code === 'P2002' ||
    (e?.code === 'P2010' && (e.meta?.code === '23505' || e.meta?.driverAdapterError?.cause?.originalCode === '23505'));
}

export class ExportRequestService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly auditSink?: ExportAuditSink
  ) {
    if (!runner) throw new ExportError('INVALID_ARGUMENT', 'TransactionRunner is required');
  }

  /**
   * Creates an ExportRequest whose manifest is fixed at request time (DEC-090).
   * Later media never enters the snapshot; permissions are re-validated at prepare/download time
   * by later tickets. No empty export is created.
   */
  public async requestExport(command: RequestExportCommand): Promise<ExportRequestResult> {
    if (!command || typeof command !== 'object') throw new ExportError('INVALID_ARGUMENT', 'Command is required');
    const { eventId, organizerAccountId, idempotencyKey, now = new Date() } = command;
    for (const [name, value] of [['eventId', eventId], ['organizerAccountId', organizerAccountId], ['idempotencyKey', idempotencyKey]] as const) {
      if (typeof value !== 'string' || !value.trim()) throw new ExportError('INVALID_ARGUMENT', `Valid ${name} is required`);
    }
    if (idempotencyKey.length > 128) throw new ExportError('INVALID_ARGUMENT', 'idempotencyKey is too long');

    const cleanEventId = eventId.trim().replace(/^event:/, '');
    const organizerId = organizerAccountId.trim();
    const key = idempotencyKey.trim();
    const fingerprint = createHash('sha256').update(JSON.stringify({ eventId: cleanEventId })).digest('hex');

    try {
      return await this.runner.run((tx) => this.execute(tx, cleanEventId, organizerId, key, fingerprint, now));
    } catch (error) {
      if (isUniqueViolation(error)) throw new ExportError('EXPORT_IN_PROGRESS', 'Another export is already active for this event');
      throw error;
    }
  }

  private async execute(
    tx: SqlTransaction,
    eventId: string,
    organizerId: string,
    key: string,
    fingerprint: string,
    now: Date
  ): Promise<ExportRequestResult> {
    // The event row lock serializes concurrent requests for the same event.
    const eventRows = await tx.query<RawEventRow>(
      'SELECT status, organizer_id FROM event WHERE id = $1::uuid FOR UPDATE',
      eventId
    );
    if (!eventRows.length || String(eventRows[0]!.organizer_id) !== organizerId) {
      throw new ExportError('UNAUTHORIZED', 'Actor is not the owner of this event');
    }
    if (BLOCKED_EVENT_STATUSES.includes(eventRows[0]!.status)) {
      throw new ExportError('EVENT_NOT_ELIGIBLE', 'Event state does not allow exports');
    }

    const existing = await tx.query<RawExportRow>(
      `SELECT id, event_id, request_fingerprint, status, selected_count, selected_bytes, exclusions, requested_at
       FROM export_request WHERE organizer_id = $1::uuid AND idempotency_key = $2`,
      organizerId, key
    );
    if (existing.length) {
      const row = existing[0]!;
      if (row.request_fingerprint !== fingerprint) {
        throw new ExportError('IDEMPOTENCY_CONFLICT', 'Idempotency key was used for a different request');
      }
      return {
        exportId: row.id,
        eventId: String(row.event_id),
        status: 'REQUESTED',
        selectedCount: Number(row.selected_count),
        selectedBytes: BigInt(row.selected_bytes),
        exclusions: parseExclusions(row.exclusions),
        requestedAt: new Date(row.requested_at).toISOString(),
        replayed: true
      };
    }

    const active = await tx.query<{ id: string }>(
      `SELECT id FROM export_request WHERE event_id = $1::uuid AND status IN ('REQUESTED','PREPARING') LIMIT 1`,
      eventId
    );
    if (active.length) throw new ExportError('EXPORT_IN_PROGRESS', 'Another export is already active for this event');

    const exportId = randomUUID();
    await tx.execute(
      `INSERT INTO export_request (id, event_id, organizer_id, status, idempotency_key, request_fingerprint,
                                   selected_count, selected_bytes, exclusions, requested_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'REQUESTED', $4, $5, 0, 0, '{}'::jsonb, $6::timestamptz)`,
      exportId, eventId, organizerId, key, fingerprint, now.toISOString()
    );

    // One statement freezes the manifest: later catalog changes cannot widen it.
    const inserted = await tx.execute(
      `INSERT INTO export_request_item (export_id, position, media_ref, generation, revision,
                                        original_namespace, original_key, original_version, original_sha256,
                                        original_bytes, file_name)
       SELECT $1::uuid, row_number() OVER (ORDER BY media_ref), media_ref, generation, revision,
              original->>'namespace', original->>'key', original->>'version', original->>'sha256',
              (original->>'bytes')::bigint, original->>'fileName'
       FROM media_catalog
       WHERE (event_ref = $2 OR event_ref = $3)
         AND status IN ('PUBLISHED','HIDDEN')
         AND original->>'namespace' IS NOT NULL AND original->>'key' IS NOT NULL
         AND original->>'version' IS NOT NULL AND original->>'sha256' IS NOT NULL
         AND (original->>'bytes') ~ '^[0-9]+$' AND (original->>'bytes')::bigint > 0`,
      exportId, eventId, `event:${eventId}`
    );

    const exclusionRows = await tx.query<{ status: string; cnt: number | string }>(
      `SELECT status, count(*)::int AS cnt FROM media_catalog
       WHERE (event_ref = $1 OR event_ref = $2) AND status NOT IN ('PUBLISHED','HIDDEN')
       GROUP BY status`,
      eventId, `event:${eventId}`
    );
    const exclusions: Record<string, number> = {};
    for (const row of exclusionRows) exclusions[row.status] = Number(row.cnt);

    const eligibleTotal = await tx.query<{ cnt: number | string }>(
      `SELECT count(*)::int AS cnt FROM media_catalog
       WHERE (event_ref = $1 OR event_ref = $2) AND status IN ('PUBLISHED','HIDDEN')`,
      eventId, `event:${eventId}`
    );
    const missingOriginal = Number(eligibleTotal[0]?.cnt ?? 0) - inserted;
    if (missingOriginal > 0) exclusions.MISSING_ORIGINAL = missingOriginal;

    if (inserted === 0) {
      // Rolls the whole transaction back: no misleading empty export is persisted.
      throw new ExportError('NO_ELIGIBLE_MEDIA', 'The event has no eligible media to export', exclusions);
    }

    const totals = await tx.query<{ bytes: bigint | number | string }>(
      'SELECT COALESCE(sum(original_bytes), 0)::bigint AS bytes FROM export_request_item WHERE export_id = $1::uuid',
      exportId
    );
    const selectedBytes = BigInt(totals[0]?.bytes ?? 0);
    await tx.execute(
      `UPDATE export_request SET selected_count = $2, selected_bytes = $3::bigint, exclusions = $4::jsonb WHERE id = $1::uuid`,
      exportId, inserted, selectedBytes.toString(), JSON.stringify(exclusions)
    );

    if (this.auditSink) {
      await this.auditSink.record({
        id: randomUUID(),
        procedure: 'EXPORT_REQUESTED',
        eventId,
        exportId,
        itemCount: inserted,
        excludedCount: Object.values(exclusions).reduce((a, b) => a + b, 0),
        timestamp: now
      });
    }

    return {
      exportId,
      eventId,
      status: 'REQUESTED',
      selectedCount: inserted,
      selectedBytes,
      exclusions,
      requestedAt: now.toISOString(),
      replayed: false
    };
  }
}
