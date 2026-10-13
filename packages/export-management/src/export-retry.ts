import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  ExportError,
  type ExportAuditSink,
  type ExportAuditEvent,
  type ExportJobPublisher,
  type ExportRevalidator,
  type RetryExportCommand,
  type RetryExportResult
} from './contracts.js';
import { DefaultExportRevalidator } from './export-preparation.js';
import { exportJobSpec } from './export-job.js';

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
  requested_at: Date | string;
  failure_code: string | null;
}

export interface ExportRetryServiceOptions {
  readonly revalidator?: ExportRevalidator;
  readonly auditSink?: ExportAuditSink;
  readonly jobPublisher?: ExportJobPublisher;
}

/**
 * Service to retry or regenerate an export that ended in FAILED or EXPIRED (EL-TK-130).
 * Opens a new generation cycle with fresh job scheduling and validity window without altering
 * or re-using prior expired packages or invalidated content (DEC-047, DEC-048, DEC-090).
 */
export class ExportRetryService {
  private readonly revalidator: ExportRevalidator;
  private readonly auditSink?: ExportAuditSink;
  private readonly jobPublisher?: ExportJobPublisher;

  constructor(
    private readonly runner: TransactionRunner,
    options: ExportRetryServiceOptions = {}
  ) {
    if (!runner) throw new ExportError('INVALID_ARGUMENT', 'TransactionRunner is required');
    this.revalidator = options.revalidator ?? new DefaultExportRevalidator();
    this.auditSink = options.auditSink;
    this.jobPublisher = options.jobPublisher;
  }

  public async retryExport(command: RetryExportCommand): Promise<RetryExportResult> {
    if (!command || typeof command !== 'object') {
      throw new ExportError('INVALID_ARGUMENT', 'Command is required');
    }
    const { exportId, organizerAccountId, now = new Date() } = command;
    if (typeof exportId !== 'string' || !exportId.trim()) {
      throw new ExportError('INVALID_ARGUMENT', 'Valid exportId is required');
    }
    if (typeof organizerAccountId !== 'string' || !organizerAccountId.trim()) {
      throw new ExportError('INVALID_ARGUMENT', 'Valid organizerAccountId is required');
    }

    const cleanExportId = exportId.trim();
    const cleanOrganizerId = organizerAccountId.trim();

    return this.runner.run(async (tx) => {
      const exportRows = await tx.query<RawExportRow>(
        `SELECT id, event_id, organizer_id, status, generation, selected_count, requested_at, failure_code
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
        throw new ExportError('EVENT_NOT_ELIGIBLE', 'Event state does not allow retrying export');
      }

      // Check current state
      if (exp.status === 'INVALIDATED') {
        throw new ExportError(
          'EXPORT_INVALIDATED',
          'Invalidated export cannot be regenerated directly; content changes require a new export request'
        );
      }

      // Idempotent retry: already active preparation
      if (exp.status === 'REQUESTED' || exp.status === 'PREPARING') {
        return {
          exportId: cleanExportId,
          eventId: String(exp.event_id),
          generation: BigInt(exp.generation),
          status: 'REQUESTED',
          priorStatus: 'FAILED',
          requestedAt: new Date(exp.requested_at).toISOString(),
          replayed: true
        };
      }

      if (exp.status === 'AVAILABLE') {
        throw new ExportError(
          'EXPORT_IN_PROGRESS',
          'Export is currently available and valid; download parts instead'
        );
      }

      if (exp.status !== 'FAILED' && exp.status !== 'EXPIRED') {
        throw new ExportError('EXPORT_UNAVAILABLE', `Cannot retry export in status ${exp.status}`);
      }

      const priorStatus = exp.status as 'FAILED' | 'EXPIRED';

      // Revalidate snapshot & current permissions (DEC-090 / EL-TK-128)
      const verdict = await this.revalidator.revalidate(tx, {
        exportId: cleanExportId,
        eventId: String(exp.event_id),
        organizerId: cleanOrganizerId
      });

      if (!verdict.ok) {
        // Mark as invalidated immediately
        await tx.execute(
          `UPDATE export_request
           SET status = 'INVALIDATED', failure_code = $2, status_reason = $3, invalidated_at = $4
           WHERE id = $1::uuid`,
          cleanExportId,
          verdict.code,
          `Revalidation failed prior to retry: ${verdict.code}`,
          now
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
        throw new ExportError('EXPORT_INVALIDATED', `Cannot retry export: ${verdict.code}`);
      }

      // Bump generation for clean isolated attempt
      const newGeneration = BigInt(exp.generation) + 1n;

      await tx.execute(
        `UPDATE export_request
         SET status = 'REQUESTED',
             generation = $2::bigint,
             failure_code = NULL,
             status_reason = NULL,
             prepared_at = NULL,
             manifest_key = NULL,
             manifest_namespace = NULL,
             manifest_sha256 = NULL,
             manifest_bytes = NULL,
             available_at = NULL,
             expires_at = NULL,
             expired_at = NULL,
             invalidated_at = NULL,
             requested_at = $3
         WHERE id = $1::uuid`,
        cleanExportId,
        newGeneration.toString(),
        now
      );

      if (this.jobPublisher) {
        await this.jobPublisher.publish(tx, exportJobSpec(cleanExportId, newGeneration, now));
      }

      if (this.auditSink) {
        const auditEvent: ExportAuditEvent = {
          id: randomUUID(),
          procedure: 'EXPORT_REQUESTED',
          eventId: String(exp.event_id),
          exportId: cleanExportId,
          itemCount: Number(exp.selected_count),
          excludedCount: 0,
          code: priorStatus === 'FAILED' ? 'RETRY_FAILED' : 'REGENERATE_EXPIRED',
          timestamp: now
        };
        await this.auditSink.record(auditEvent);
      }

      return {
        exportId: cleanExportId,
        eventId: String(exp.event_id),
        generation: newGeneration,
        status: 'REQUESTED',
        priorStatus,
        requestedAt: now.toISOString(),
        replayed: false
      };
    });
  }
}
