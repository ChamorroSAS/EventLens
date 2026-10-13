import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  ExportError,
  type ExportCapabilities,
  type ExportPartSummary,
  type ExportProgressInfo,
  type ExportStatusSnapshot,
  type QueryExportStatusCommand
} from './contracts.js';

interface RawEventOwnerRow {
  status: string;
  organizer_id: string;
}

interface RawExportQueryRow {
  id: string;
  event_id: string;
  organizer_id: string;
  status: string;
  generation: bigint | number | string;
  selected_count: number | string;
  selected_bytes: bigint | number | string;
  requested_at: Date | string;
  prepared_at: Date | string | null;
  available_at: Date | string | null;
  expires_at: Date | string | null;
  expired_at: Date | string | null;
  invalidated_at: Date | string | null;
  failure_code: string | null;
  status_reason: string | null;
}

interface RawPartQueryRow {
  part_number: number;
  status: string;
  entry_count: number;
  size_bytes: bigint | number | string | null;
  sha256: string | null;
}

/**
 * Service to query status, parts, and availability of an export for an event (EL-TK-131).
 * Owner-only; exposes exact progress only when real metrics exist, distinguishes expired,
 * failed, and invalidated states, and presents action capabilities without guessing local storage.
 */
export class ExportQueryService {
  private readonly clock: () => Date;

  constructor(
    private readonly runner: TransactionRunner,
    options: { readonly clock?: () => Date } = {}
  ) {
    if (!runner) throw new ExportError('INVALID_ARGUMENT', 'TransactionRunner is required');
    this.clock = options.clock ?? (() => new Date());
  }

  public async queryExportStatus(
    command: QueryExportStatusCommand
  ): Promise<ExportStatusSnapshot | null> {
    if (!command || typeof command !== 'object') {
      throw new ExportError('INVALID_ARGUMENT', 'Command is required');
    }
    const { eventId, organizerAccountId, exportId, now = this.clock() } = command;
    if (typeof eventId !== 'string' || !eventId.trim()) {
      throw new ExportError('INVALID_ARGUMENT', 'Valid eventId is required');
    }
    if (typeof organizerAccountId !== 'string' || !organizerAccountId.trim()) {
      throw new ExportError('INVALID_ARGUMENT', 'Valid organizerAccountId is required');
    }

    const cleanEventId = eventId.trim().replace(/^event:/, '');
    const cleanOrganizerId = organizerAccountId.trim();
    const cleanExportId = exportId ? exportId.trim() : undefined;

    return this.runner.run(async (tx) => {
      const eventRows = await tx.query<RawEventOwnerRow>(
        'SELECT status, organizer_id FROM event WHERE id = $1::uuid LIMIT 1',
        cleanEventId
      );
      if (!eventRows.length || String(eventRows[0]!.organizer_id) !== cleanOrganizerId) {
        throw new ExportError('UNAUTHORIZED', 'Actor is not the owner of this event');
      }

      let exportRows: RawExportQueryRow[];
      if (cleanExportId) {
        exportRows = await tx.query<RawExportQueryRow>(
          `SELECT id, event_id, organizer_id, status, generation, selected_count, selected_bytes,
                  requested_at, prepared_at, available_at, expires_at, expired_at, invalidated_at,
                  failure_code, status_reason
           FROM export_request
           WHERE id = $1::uuid AND event_id = $2::uuid
           LIMIT 1`,
          cleanExportId,
          cleanEventId
        );
      } else {
        exportRows = await tx.query<RawExportQueryRow>(
          `SELECT id, event_id, organizer_id, status, generation, selected_count, selected_bytes,
                  requested_at, prepared_at, available_at, expires_at, expired_at, invalidated_at,
                  failure_code, status_reason
           FROM export_request
           WHERE event_id = $1::uuid
           ORDER BY requested_at DESC
           LIMIT 1`,
          cleanEventId
        );
      }

      if (!exportRows.length) {
        return null;
      }
      const exp = exportRows[0]!;

      // Expiry reconciliation check at query time
      let effectiveStatus = exp.status as 'REQUESTED' | 'PREPARING' | 'AVAILABLE' | 'FAILED' | 'EXPIRED' | 'INVALIDATED';
      if (exp.status === 'AVAILABLE' && exp.expires_at && new Date(exp.expires_at).getTime() <= now.getTime()) {
        effectiveStatus = 'EXPIRED';
      }

      const generation = BigInt(exp.generation);

      const partRows = await tx.query<RawPartQueryRow>(
        `SELECT part_number, status, entry_count, size_bytes, sha256
         FROM export_part
         WHERE export_id = $1::uuid AND generation = $2::bigint
         ORDER BY part_number ASC`,
        exp.id,
        generation.toString()
      );

      const parts: ExportPartSummary[] = partRows.map((p) => ({
        partNumber: p.part_number,
        status: p.status as 'PENDING' | 'READY' | 'FAILED' | 'EXPIRED' | 'INVALIDATED',
        sizeBytes: Number(p.size_bytes ?? 0),
        entryCount: p.entry_count,
        sha256: p.sha256,
        fileName: `event-${cleanEventId.slice(0, 8)}-export-part-${p.part_number}.zip`
      }));

      let progress: ExportProgressInfo | null = null;
      if (effectiveStatus === 'PREPARING') {
        const total = parts.length;
        const ready = parts.filter((p) => p.status === 'READY').length;
        if (total > 0) {
          progress = { partsReady: ready, partsTotal: total, percent: Math.round((ready / total) * 100) };
        } else {
          // No parts planned yet: real progress is not available (indeterminate)
          progress = null;
        }
      } else if (effectiveStatus === 'AVAILABLE') {
        progress = { partsReady: parts.length, partsTotal: parts.length, percent: 100 };
      }

      const isLive = effectiveStatus === 'REQUESTED' || effectiveStatus === 'PREPARING';
      const capabilities: ExportCapabilities = {
        canDownload: effectiveStatus === 'AVAILABLE' && parts.some((p) => p.status === 'READY'),
        canRetry: effectiveStatus === 'FAILED',
        canRegenerate: effectiveStatus === 'EXPIRED',
        canRequestNew: !isLive
      };

      return {
        exportId: String(exp.id),
        eventId: cleanEventId,
        status: effectiveStatus,
        generation,
        selectedCount: Number(exp.selected_count),
        selectedBytes: BigInt(exp.selected_bytes),
        requestedAt: new Date(exp.requested_at).toISOString(),
        preparedAt: exp.prepared_at ? new Date(exp.prepared_at).toISOString() : null,
        availableAt: exp.available_at ? new Date(exp.available_at).toISOString() : null,
        expiresAt: exp.expires_at ? new Date(exp.expires_at).toISOString() : null,
        expiredAt: exp.expired_at ? new Date(exp.expired_at).toISOString() : null,
        invalidatedAt: exp.invalidated_at ? new Date(exp.invalidated_at).toISOString() : null,
        failureCode: exp.failure_code,
        statusReason: exp.status_reason,
        progress,
        parts,
        capabilities
      };
    });
  }
}
