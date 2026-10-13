import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  ExportError,
  type ExportAuditSink,
  type ExportAuditEvent,
  type ExportPartDownloadGrant,
  type ExportPartDownloadSigner,
  type ExportRevalidator,
  type RequestExportPartDownloadGrantCommand
} from './contracts.js';
import { DefaultExportRevalidator } from './export-preparation.js';
import { isExportAvailable } from './export-availability.js';
import { exportCleanupJobSpec } from './export-job.js';

const BLOCKED_EVENT_STATUSES = ['SUSPENDED', 'PENDING_DELETION', 'ARCHIVED', 'DELETED'];

interface RawEventOwnerRow {
  status: string;
  organizer_id: string;
}

interface RawExportRow {
  id: string;
  event_id: string;
  organizer_id: string;
  status: string;
  generation: bigint | number | string;
  selected_count: number | string;
  expires_at: Date | string | null;
  failure_code: string | null;
}

interface RawPartRow {
  part_number: number;
  status: string;
  object_namespace: string | null;
  object_key: string | null;
  size_bytes: bigint | number | string | null;
  sha256: string | null;
}

export interface ExportPartDownloadGrantServiceOptions {
  readonly revalidator?: ExportRevalidator;
  readonly auditSink?: ExportAuditSink;
}

/**
 * Service authorizing temporary download grants for numbered parts of an available export (EL-TK-129).
 * Owner-only; revalidates current permissions and media snapshot prior to grant issuance (DEC-090).
 * Never exposes permanent URLs or raw storage keys.
 */
export class ExportPartDownloadGrantService {
  private readonly revalidator: ExportRevalidator;
  private readonly auditSink?: ExportAuditSink;

  constructor(
    private readonly runner: TransactionRunner,
    private readonly signer: ExportPartDownloadSigner,
    options: ExportPartDownloadGrantServiceOptions = {}
  ) {
    if (!runner) throw new ExportError('INVALID_ARGUMENT', 'TransactionRunner is required');
    if (!signer) throw new ExportError('INVALID_ARGUMENT', 'ExportPartDownloadSigner is required');
    this.revalidator = options.revalidator ?? new DefaultExportRevalidator();
    this.auditSink = options.auditSink;
  }

  public async requestPartDownloadGrant(
    command: RequestExportPartDownloadGrantCommand
  ): Promise<ExportPartDownloadGrant> {
    if (!command || typeof command !== 'object') {
      throw new ExportError('INVALID_ARGUMENT', 'Command is required');
    }
    const { exportId, partNumber, organizerAccountId, ttlSeconds, now = new Date() } = command;
    if (typeof exportId !== 'string' || !exportId.trim()) {
      throw new ExportError('INVALID_ARGUMENT', 'Valid exportId is required');
    }
    if (!Number.isInteger(partNumber) || partNumber <= 0) {
      throw new ExportError('INVALID_ARGUMENT', 'Valid positive partNumber is required');
    }
    if (typeof organizerAccountId !== 'string' || !organizerAccountId.trim()) {
      throw new ExportError('INVALID_ARGUMENT', 'Valid organizerAccountId is required');
    }

    const cleanExportId = exportId.trim();
    const cleanOrganizerId = organizerAccountId.trim();
    const effectiveTtl = Math.min(Math.max(Number(ttlSeconds) || 900, 60), 3600);

    return this.runner.run(async (tx) => {
      const exportRows = await tx.query<RawExportRow>(
        `SELECT id, event_id, organizer_id, status, generation, selected_count, expires_at, failure_code
         FROM export_request WHERE id = $1::uuid FOR UPDATE`,
        cleanExportId
      );
      if (!exportRows.length) {
        throw new ExportError('UNAUTHORIZED', 'Export not found or unauthorized');
      }
      const exp = exportRows[0]!;

      // Verify event ownership
      const eventRows = await tx.query<RawEventOwnerRow>(
        'SELECT status, organizer_id FROM event WHERE id = $1::uuid LIMIT 1',
        exp.event_id
      );
      if (!eventRows.length || String(eventRows[0]!.organizer_id) !== cleanOrganizerId || String(exp.organizer_id) !== cleanOrganizerId) {
        throw new ExportError('UNAUTHORIZED', 'Actor is not the owner of this event or export');
      }
      if (BLOCKED_EVENT_STATUSES.includes(eventRows[0]!.status)) {
        throw new ExportError('EVENT_NOT_ELIGIBLE', 'Event state does not allow downloads');
      }

      // Revalidate snapshot & current permissions (DEC-090 / EL-TK-128)
      if (exp.status === 'AVAILABLE' || exp.status === 'PREPARING') {
        const verdict = await this.revalidator.revalidate(tx, {
          exportId: cleanExportId,
          eventId: String(exp.event_id),
          organizerId: cleanOrganizerId
        });
        if (!verdict.ok) {
          // Immediately invalidate export
          await tx.execute(
            `UPDATE export_request
             SET status = 'INVALIDATED', failure_code = $2, status_reason = $3, invalidated_at = $4
             WHERE id = $1::uuid`,
            cleanExportId,
            verdict.code,
            `Revalidation failed at grant request: ${verdict.code}`,
            now
          );
          await tx.execute(
            `UPDATE export_part SET status = 'INVALIDATED' WHERE export_id = $1::uuid AND status IN ('PENDING', 'READY')`,
            cleanExportId
          );
          if (this.auditSink) {
            await this.auditSink.record({
              id: randomUUID(),
              procedure: 'EXPORT_INVALIDATED',
              eventId: String(exp.event_id),
              exportId: cleanExportId,
              itemCount: Number(exp.selected_count),
              excludedCount: 0,
              code: verdict.code,
              timestamp: now
            });
          }
          throw new ExportError('EXPORT_INVALIDATED', `Export invalidated: ${verdict.code}`);
        }
      }

      // Verify availability window
      if (!isExportAvailable({ status: exp.status, expiresAt: exp.expires_at }, now)) {
        if (exp.status === 'EXPIRED' || (exp.expires_at && new Date(exp.expires_at).getTime() <= now.getTime())) {
          throw new ExportError('EXPORT_EXPIRED', 'Export has expired');
        }
        if (exp.status === 'INVALIDATED') {
          throw new ExportError('EXPORT_INVALIDATED', 'Export is invalidated');
        }
        if (exp.status === 'FAILED') {
          throw new ExportError('EXPORT_FAILED', 'Export preparation failed');
        }
        throw new ExportError('EXPORT_UNAVAILABLE', `Export is not available (status: ${exp.status})`);
      }

      // Fetch the requested part
      const partRows = await tx.query<RawPartRow>(
        `SELECT part_number, status, object_namespace, object_key, size_bytes, sha256
         FROM export_part
         WHERE export_id = $1::uuid AND part_number = $2 AND generation = $3::bigint
         LIMIT 1`,
        cleanExportId,
        partNumber,
        BigInt(exp.generation).toString()
      );
      const part = partRows[0];
      if (!part || part.status !== 'READY' || !part.object_key) {
        throw new ExportError('PART_NOT_FOUND', `Part ${partNumber} is not ready or does not exist`);
      }

      const fileName = `event-${String(exp.event_id).slice(0, 8)}-export-part-${partNumber}.zip`;
      let downloadUrl: string;
      try {
        downloadUrl = await this.signer.createDownloadUrl({
          namespace: part.object_namespace ?? 'exports-private',
          key: part.object_key,
          ttlSeconds: effectiveTtl,
          forceDownload: true,
          fileName
        });
      } catch {
        throw new ExportError('TEMPORARY_FAILURE', 'Storage could not authorize the download URL');
      }

      if (this.auditSink) {
        const auditEvent: ExportAuditEvent = {
          id: randomUUID(),
          procedure: 'EXPORT_PART_GRANT_ISSUED',
          eventId: String(exp.event_id),
          exportId: cleanExportId,
          partNumber,
          itemCount: 1,
          excludedCount: 0,
          bytes: Number(part.size_bytes ?? 0),
          timestamp: now
        };
        await this.auditSink.record(auditEvent);
      }

      return {
        grantId: randomUUID(),
        exportId: cleanExportId,
        eventId: String(exp.event_id),
        partNumber,
        downloadUrl,
        expiresAt: new Date(now.getTime() + effectiveTtl * 1000).toISOString(),
        ttlSeconds: effectiveTtl,
        sizeBytes: Number(part.size_bytes ?? 0),
        sha256: part.sha256,
        fileName
      };
    });
  }
}
