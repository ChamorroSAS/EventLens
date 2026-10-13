import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  type ExportAuditSink,
  type ExportAuditEvent,
  type ExportJobPublisher,
  type ExportPartInventoryItem,
  type ExportInvalidationScopeResult,
  type ExportRevalidator,
  type InvalidateExportResult,
  type RevalidateExportOutcome,
  type ExportDeletionBarrierPort
} from './contracts.js';
import { exportCleanupJobSpec } from './export-job.js';
import { DefaultExportRevalidator } from './export-preparation.js';

export interface ExportInvalidationServiceOptions {
  readonly revalidator?: ExportRevalidator;
  readonly auditSink?: ExportAuditSink;
  readonly jobPublisher?: ExportJobPublisher;
  readonly clock?: () => Date;
}

interface RawExportRow {
  id: string;
  event_id: string;
  organizer_id: string;
  status: string;
  generation: bigint | number | string;
  selected_count: number | string;
  failure_code: string | null;
  status_reason: string | null;
}

/**
 * Service managing invalidation of exports affected by content withdrawal, privacy retractions,
 * or loss of access (EL-TK-128 / DEC-090).
 */
export class ExportInvalidationService implements ExportDeletionBarrierPort {
  private readonly revalidator: ExportRevalidator;
  private readonly auditSink?: ExportAuditSink;
  private readonly jobPublisher?: ExportJobPublisher;
  private readonly clock: () => Date;

  constructor(
    private readonly runner: TransactionRunner,
    options: ExportInvalidationServiceOptions = {}
  ) {
    if (!runner) throw new Error('TransactionRunner is required');
    this.revalidator = options.revalidator ?? new DefaultExportRevalidator();
    this.auditSink = options.auditSink;
    this.jobPublisher = options.jobPublisher;
    this.clock = options.clock ?? (() => new Date());
  }

  /**
   * Revalidates an export against current database state.
   * If any media from the snapshot was withdrawn, or event permissions were revoked,
   * the export is immediately invalidated and scheduled for cleanup (DEC-090).
   */
  public async revalidateExport(exportId: string): Promise<RevalidateExportOutcome> {
    if (!exportId || typeof exportId !== 'string') {
      throw new Error('Valid exportId is required');
    }
    const cleanId = exportId.trim();
    const now = this.clock();

    return this.runner.run(async (tx) => {
      const rows = await tx.query<RawExportRow>(
        `SELECT id, event_id, organizer_id, status, generation, selected_count, failure_code, status_reason
         FROM export_request WHERE id = $1::uuid FOR UPDATE`,
        cleanId
      );
      if (!rows.length) {
        return { exportId: cleanId, status: 'NOT_FOUND', ok: false, invalidatedNow: false };
      }
      const row = rows[0]!;

      if (row.status === 'INVALIDATED') {
        return {
          exportId: cleanId,
          status: 'INVALIDATED',
          ok: false,
          invalidatedNow: false,
          code: row.failure_code ?? 'ALREADY_INVALIDATED'
        };
      }
      if (['FAILED', 'EXPIRED'].includes(row.status)) {
        return {
          exportId: cleanId,
          status: row.status,
          ok: false,
          invalidatedNow: false,
          code: row.failure_code ?? row.status
        };
      }

      // Live export (REQUESTED, PREPARING, AVAILABLE): revalidate current permissions and content
      const verdict = await this.revalidator.revalidate(tx, {
        exportId: cleanId,
        eventId: String(row.event_id),
        organizerId: String(row.organizer_id)
      });

      if (!verdict.ok) {
        await this.applyInvalidation(tx, row, verdict.code, `Revalidation failed: ${verdict.code}`, now);
        return {
          exportId: cleanId,
          status: 'INVALIDATED',
          ok: false,
          invalidatedNow: true,
          code: verdict.code
        };
      }

      return {
        exportId: cleanId,
        status: row.status,
        ok: true,
        invalidatedNow: false
      };
    });
  }

  /**
   * Explicitly invalidates an export by ID with a specific machine failure code and reason.
   */
  public async invalidateExport(
    exportId: string,
    params: { code: string; reason?: string; now?: Date }
  ): Promise<InvalidateExportResult> {
    if (!exportId || typeof exportId !== 'string') throw new Error('Valid exportId is required');
    if (!params?.code) throw new Error('Invalidation code is required');
    const cleanId = exportId.trim();
    const now = params.now ?? this.clock();

    return this.runner.run(async (tx) => {
      const rows = await tx.query<RawExportRow>(
        `SELECT id, event_id, organizer_id, status, generation, selected_count, failure_code, status_reason
         FROM export_request WHERE id = $1::uuid FOR UPDATE`,
        cleanId
      );
      if (!rows.length) {
        return { exportId: cleanId, status: 'NOT_FOUND', invalidatedNow: false };
      }
      const row = rows[0]!;

      if (row.status === 'INVALIDATED') {
        return {
          exportId: cleanId,
          status: 'INVALIDATED',
          invalidatedNow: false,
          code: row.failure_code ?? params.code,
          reason: row.status_reason ?? params.reason
        };
      }
      if (['FAILED', 'EXPIRED'].includes(row.status)) {
        return {
          exportId: cleanId,
          status: 'ALREADY_TERMINAL',
          invalidatedNow: false,
          code: row.failure_code ?? row.status
        };
      }

      const partsCount = await this.applyInvalidation(tx, row, params.code, params.reason ?? params.code, now);
      return {
        exportId: cleanId,
        status: 'INVALIDATED',
        invalidatedNow: true,
        code: params.code,
        reason: params.reason,
        partsCount,
        cleanupJobQueued: !!this.jobPublisher
      };
    });
  }

  /**
   * Invalidates all active exports containing a specific mediaRef that has been withdrawn,
   * hidden without consent, deleted, or moved to trash (DEC-090).
   */
  public async invalidateExportsForMedia(
    mediaRef: string,
    params: { code?: string; reason?: string; now?: Date } = {}
  ): Promise<{ invalidatedCount: number; exportIds: string[] }> {
    if (!mediaRef || typeof mediaRef !== 'string') throw new Error('Valid mediaRef is required');
    const cleanRef = mediaRef.trim();
    const code = params.code ?? 'MEDIA_WITHDRAWN';
    const reason = params.reason ?? 'Media withdrawn from active catalog';
    const now = params.now ?? this.clock();

    return this.runner.run(async (tx) => {
      const activeExports = await tx.query<RawExportRow>(
        `SELECT e.id, e.event_id, e.organizer_id, e.status, e.generation, e.selected_count, e.failure_code, e.status_reason
         FROM export_request e
         JOIN export_request_item i ON i.export_id = e.id
         WHERE i.media_ref = $1
           AND e.status IN ('REQUESTED', 'PREPARING', 'AVAILABLE')
         FOR UPDATE OF e`,
        cleanRef
      );

      const exportIds: string[] = [];
      for (const row of activeExports) {
        await this.applyInvalidation(tx, row, code, reason, now);
        exportIds.push(row.id);
      }

      return { invalidatedCount: exportIds.length, exportIds };
    });
  }

  /**
   * Implements ExportDeletionBarrierPort (MOD-005 -> MOD-008 / EL-EP-015 / EL-TK-193).
   * Atomically invalidates active exports for the target events and returns the parts inventory.
   */
  public async invalidateExportsForScope(params: {
    readonly scopeType: 'EVENT' | 'ACCOUNT';
    readonly scopeRef: string;
    readonly targetEventIds: readonly string[];
    readonly requestId: string;
    readonly reason: string;
  }): Promise<ExportInvalidationScopeResult> {
    if (!params || !params.targetEventIds?.length) {
      return { invalidatedExportsCount: 0, partsInventory: [] };
    }
    const eventIds = params.targetEventIds.map((id) => id.trim().replace(/^event:/, ''));
    const now = this.clock();
    const code = 'DELETION_BARRIER';
    const reason = `Deletion barrier (${params.scopeType}:${params.scopeRef}): ${params.reason}`;

    return this.runner.run(async (tx) => {
      const activeExports = await tx.query<RawExportRow>(
        `SELECT id, event_id, organizer_id, status, generation, selected_count, failure_code, status_reason
         FROM export_request
         WHERE event_id = ANY($1::uuid[])
           AND status IN ('REQUESTED', 'PREPARING', 'AVAILABLE')
         FOR UPDATE`,
        eventIds
      );

      for (const row of activeExports) {
        await this.applyInvalidation(tx, row, code, reason, now);
      }

      // Collect inventory of physical export parts for inventory verification (EL-TK-193/195)
      const partRows = await tx.query<{
        export_id: string;
        part_number: number;
        object_key: string;
      }>(
        `SELECT p.export_id, p.part_number, p.object_key
         FROM export_part p
         JOIN export_request e ON e.id = p.export_id
         WHERE e.event_id = ANY($1::uuid[])
           AND p.object_key IS NOT NULL
         ORDER BY p.export_id, p.part_number`,
        eventIds
      );

      const manifestRows = await tx.query<{
        id: string;
        manifest_key: string;
      }>(
        `SELECT id, manifest_key
         FROM export_request
         WHERE event_id = ANY($1::uuid[])
           AND manifest_key IS NOT NULL
         ORDER BY id`,
        eventIds
      );

      const partsInventory: ExportPartInventoryItem[] = [];

      for (const p of partRows) {
        partsInventory.push({
          exportId: String(p.export_id),
          partNumber: p.part_number,
          objectKey: p.object_key,
          versionId: null,
          partKind: 'ZIP_PART'
        });
      }

      for (const m of manifestRows) {
        partsInventory.push({
          exportId: String(m.id),
          partNumber: 0,
          objectKey: m.manifest_key,
          versionId: null,
          partKind: 'MANIFEST'
        });
      }

      return {
        invalidatedExportsCount: activeExports.length,
        partsInventory
      };
    });
  }

  private async applyInvalidation(
    tx: SqlTransaction,
    row: RawExportRow,
    code: string,
    reason: string,
    now: Date
  ): Promise<number> {
    const exportId = row.id;
    const generation = BigInt(row.generation);

    await tx.execute(
      `UPDATE export_request
       SET status = 'INVALIDATED',
           failure_code = $2,
           status_reason = $3,
           invalidated_at = $4
       WHERE id = $1::uuid`,
      exportId,
      code,
      reason,
      now
    );

    const partsResult = await tx.query<{ count: number | string }>(
      `WITH updated AS (
         UPDATE export_part
         SET status = 'INVALIDATED'
         WHERE export_id = $1::uuid AND status IN ('PENDING', 'READY')
         RETURNING 1
       )
       SELECT count(*)::int AS count FROM updated`,
      exportId
    );
    const partsCount = Number(partsResult[0]?.count ?? 0);

    if (this.jobPublisher) {
      await this.jobPublisher.publish(tx, exportCleanupJobSpec(exportId, generation, now));
    }

    if (this.auditSink) {
      const event: ExportAuditEvent = {
        id: randomUUID(),
        procedure: 'EXPORT_INVALIDATED',
        eventId: String(row.event_id),
        exportId,
        itemCount: Number(row.selected_count),
        excludedCount: 0,
        code,
        timestamp: now
      };
      await this.auditSink.record(event);
    }

    return partsCount;
  }
}
