import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/job-queue';
import type { EventStatusAuthorizer, SafetyOutcome } from './media-status.js';
import type { SafetyFact } from './contracts.js';

export class MediaModerationError extends Error {
  constructor(
    readonly code:
      | 'INVALID_ARGUMENT'
      | 'ACCESS_DENIED'
      | 'MEDIA_NOT_FOUND'
      | 'INVALID_STATE'
      | 'INELIGIBLE_STATE'
      | 'SAFETY_BLOCKED'
      | 'REMOVAL_BLOCKED'
      | 'CONCURRENCY_CONFLICT'
      | 'RESTORE_WINDOW_EXPIRED'
      | 'MEDIA_PURGED',
    message?: string
  ) {
    super(message ?? code);
  }
}

export interface ApproveMediaCommand {
  readonly organizerRef: string;
  readonly eventRef: string;
  readonly mediaRef: string;
  readonly expectedRevision?: bigint | string;
  readonly operationId?: string;
}

export interface ApproveMediaResult {
  readonly mediaRef: string;
  readonly eventRef: string;
  readonly status: 'PUBLISHED';
  readonly previousStatus: string;
  readonly revision: bigint;
  readonly approvedAt: Date;
  readonly operationId: string;
}

export interface RejectMediaCommand {
  readonly organizerRef: string;
  readonly eventRef: string;
  readonly mediaRef: string;
  readonly reason?: string;
  readonly expectedRevision?: bigint | string;
  readonly operationId?: string;
}

export interface RejectMediaResult {
  readonly mediaRef: string;
  readonly eventRef: string;
  readonly status: 'REJECTED';
  readonly previousStatus: string;
  readonly revision: bigint;
  readonly rejectedAt: Date;
  readonly operationId: string;
}

export interface TrashMediaCommand {
  readonly organizerRef: string;
  readonly eventRef: string;
  readonly mediaRef: string;
  readonly reason?: string;
  readonly expectedRevision?: bigint | string;
  readonly operationId?: string;
}

export interface TrashMediaResult {
  readonly mediaRef: string;
  readonly eventRef: string;
  readonly status: 'TRASHED';
  readonly previousStatus: string;
  readonly revision: bigint;
  readonly trashedAt: Date;
  readonly restoreDeadline: Date;
  readonly operationId: string;
}

export interface MediaTrashRecord {
  readonly id: string;
  readonly operationId: string;
  readonly mediaRef: string;
  readonly eventRef: string;
  readonly organizerRef: string;
  readonly previousStatus: string;
  readonly trashedAt: Date;
  readonly restoreDeadline: Date;
  readonly restoredAt: Date | null;
  readonly reason: string | null;
}

export interface RestoreMediaCommand {
  readonly organizerRef: string;
  readonly eventRef: string;
  readonly mediaRef: string;
  readonly expectedRevision?: bigint | string;
  readonly operationId?: string;
  readonly now?: Date;
}

export interface RestoreMediaResult {
  readonly mediaRef: string;
  readonly eventRef: string;
  readonly status: string;
  readonly previousStatus: 'TRASHED';
  readonly restoredFromStatus: string;
  readonly revision: bigint;
  readonly restoredAt: Date;
  readonly operationId: string;
}

/**
 * Computes a target date adding full UTC calendar days preserving exact time-of-day.
 * Conforms to DEC-092 / DEC-109 / ARCH-019.
 */
export function addUtcCalendarDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export interface ExpireTrashMediaCommand {
  readonly mediaRef: string;
  readonly operationId?: string;
  readonly now?: Date;
}

export interface ExpireTrashMediaResult {
  readonly outcome:
    | 'PURGE_REQUESTED'
    | 'ALREADY_PURGED'
    | 'SKIPPED_ALREADY_RESTORED'
    | 'SKIPPED_NOT_EXPIRED';
  readonly mediaRef: string;
  readonly eventRef: string;
  readonly purgeIntentId?: string;
  readonly purgeStartedAt?: Date;
  readonly mainPurgeDeadline?: Date;
  readonly residualPurgeDeadline?: Date;
  readonly previousStatus?: string;
  readonly revision?: bigint;
}

export interface ProcessExpiredTrashCommand {
  readonly limit?: number;
  readonly now?: Date;
}

export interface ProcessExpiredTrashResult {
  readonly processedCount: number;
  readonly results: ExpireTrashMediaResult[];
}

export interface PurgeRequestPayload {
  readonly purgeIntentId: string;
  readonly operationId: string;
  readonly mediaRef: string;
  readonly eventRef: string;
  readonly organizerRef: string;
  readonly generation: bigint;
  readonly revision: bigint;
  readonly purgeStartedAt: Date;
  readonly mainPurgeDeadline: Date;
  readonly residualPurgeDeadline: Date;
  readonly policyRef: string;
  readonly policyVersion: string;
}

export interface PurgeDispatcherPort {
  dispatchPurgeRequest(request: PurgeRequestPayload): Promise<void>;
}

export interface TrashPurgeIntentRecord {
  readonly id: string;
  readonly operationId: string;
  readonly trashRecordId: string;
  readonly mediaRef: string;
  readonly eventRef: string;
  readonly organizerRef: string;
  readonly generation: bigint;
  readonly previousRevision: bigint;
  readonly newRevision: bigint;
  readonly purgeStartedAt: Date;
  readonly mainPurgeDeadline: Date;
  readonly residualPurgeDeadline: Date;
  readonly policyRef: string;
  readonly policyVersion: string;
  readonly status: string;
  readonly dedupKey: string;
  readonly createdAt: Date;
}

export interface MediaCatalogRecord {
  readonly mediaRef: string;
  readonly eventRef: string;
  readonly status: string;
  readonly generation: bigint;
  readonly revision: bigint;
}

export interface MediaModerationRepository {
  lockAndGetMedia(
    tx: SqlTransaction,
    mediaRef: string
  ): Promise<MediaCatalogRecord | null>;

  getSafetyFact(
    tx: SqlTransaction,
    mediaRef: string,
    generation: bigint
  ): Promise<SafetyFact | null>;

  hasActiveRemovalBlock(
    tx: SqlTransaction,
    mediaRef: string
  ): Promise<boolean>;

  updateStatus(
    tx: SqlTransaction,
    mediaRef: string,
    expectedRevision: bigint,
    newStatus: string
  ): Promise<bigint>;

  recordAudit(
    tx: SqlTransaction,
    params: {
      action?: string;
      operationId: string;
      mediaRef: string;
      eventRef: string;
      actorRef: string;
      previousStatus: string;
      newStatus: string;
      revision: bigint;
      reason?: string;
      timestamp: Date;
    }
  ): Promise<void>;

  recordTrash(
    tx: SqlTransaction,
    params: {
      id: string;
      operationId: string;
      mediaRef: string;
      eventRef: string;
      organizerRef: string;
      previousStatus: string;
      trashedAt: Date;
      restoreDeadline: Date;
      reason?: string;
    }
  ): Promise<void>;

  getActiveTrashRecord(
    tx: SqlTransaction,
    mediaRef: string
  ): Promise<MediaTrashRecord | null>;

  markTrashRestored(
    tx: SqlTransaction,
    trashRecordId: string,
    restoredAt: Date
  ): Promise<void>;

  getExpiredTrashRecords(
    tx: SqlTransaction,
    now: Date,
    limit: number
  ): Promise<MediaTrashRecord[]>;

  getTrashPurgeIntentByTrashId(
    tx: SqlTransaction,
    trashRecordId: string
  ): Promise<TrashPurgeIntentRecord | null>;

  recordTrashPurgeIntent(
    tx: SqlTransaction,
    params: {
      id: string;
      operationId: string;
      trashRecordId: string;
      mediaRef: string;
      eventRef: string;
      organizerRef: string;
      generation: bigint;
      previousRevision: bigint;
      newRevision: bigint;
      purgeStartedAt: Date;
      mainPurgeDeadline: Date;
      residualPurgeDeadline: Date;
      policyRef: string;
      policyVersion: string;
      status: string;
      dedupKey: string;
    }
  ): Promise<void>;
}

export class PostgresMediaModerationRepository
  implements MediaModerationRepository
{
  async lockAndGetMedia(
    tx: SqlTransaction,
    mediaRef: string
  ): Promise<MediaCatalogRecord | null> {
    const rows = await tx.query<{
      media_ref: string;
      event_ref: string;
      status: string;
      generation: bigint | string | number;
      revision: bigint | string | number;
    }>(
      `SELECT media_ref, event_ref, status, generation, revision
       FROM media_catalog
       WHERE media_ref = $1
       FOR UPDATE`,
      mediaRef
    );

    if (!rows.length) return null;
    const r = rows[0]!;
    return {
      mediaRef: r.media_ref,
      eventRef: r.event_ref,
      status: r.status,
      generation: BigInt(r.generation),
      revision: BigInt(r.revision)
    };
  }

  async getSafetyFact(
    tx: SqlTransaction,
    mediaRef: string,
    generation: bigint
  ): Promise<SafetyFact | null> {
    const rows = await tx.query<{ fact: SafetyFact }>(
      `SELECT fact FROM media_inspection WHERE media_ref = $1 AND generation = $2::bigint`,
      mediaRef,
      generation
    );
    return rows[0]?.fact ?? null;
  }

  async hasActiveRemovalBlock(
    tx: SqlTransaction,
    mediaRef: string
  ): Promise<boolean> {
    // Check if media is locked in quarantine purge or takedown request
    const purgeRows = await tx.query<{ cnt: number | string }>(
      `SELECT count(*)::int as cnt FROM media_quarantine_purge_intent WHERE media_ref = $1`,
      mediaRef
    );
    if (Number(purgeRows[0]?.cnt ?? 0) > 0) {
      return true;
    }

    // Check if any quarantine record exists
    const qRows = await tx.query<{ cnt: number | string }>(
      `SELECT count(*)::int as cnt FROM media_quarantine_delete_receipt WHERE media_ref = $1`,
      mediaRef
    );
    if (Number(qRows[0]?.cnt ?? 0) > 0) {
      return true;
    }

    // Check if media trash purge intent exists
    const tpRows = await tx.query<{ cnt: number | string }>(
      `SELECT count(*)::int as cnt FROM media_trash_purge_intent WHERE media_ref = $1`,
      mediaRef
    );
    if (Number(tpRows[0]?.cnt ?? 0) > 0) {
      return true;
    }

    return false;
  }

  async updateStatus(
    tx: SqlTransaction,
    mediaRef: string,
    expectedRevision: bigint,
    newStatus: string
  ): Promise<bigint> {
    const rows = await tx.query<{ revision: bigint | string | number }>(
      `UPDATE media_catalog
       SET status = $2, revision = revision + 1
       WHERE media_ref = $1 AND revision = $3::bigint
       RETURNING revision`,
      mediaRef,
      newStatus,
      expectedRevision
    );

    if (!rows.length) {
      throw new MediaModerationError('CONCURRENCY_CONFLICT', 'Concurrent revision update detected');
    }

    return BigInt(rows[0]!.revision);
  }

  async recordAudit(
    tx: SqlTransaction,
    params: {
      action?: string;
      operationId: string;
      mediaRef: string;
      eventRef: string;
      actorRef: string;
      previousStatus: string;
      newStatus: string;
      revision: bigint;
      reason?: string;
      timestamp: Date;
    }
  ): Promise<void> {
    const action = params.action ?? 'MEDIA_APPROVED';
    await tx.execute(
      `INSERT INTO audit_event (
         id, occurred_at, actor_type, actor_id, action, resource_type,
         resource_id, result, reason, metadata, idempotency_key, created_at
       ) VALUES (
         $1::uuid, $2, 'ORGANIZER', $3, $4, 'MEDIA',
         $5, 'SUCCESS', $6, $7::jsonb, $8, $2
       )`,
      randomUUID(),
      params.timestamp,
      params.actorRef,
      action,
      params.mediaRef,
      params.reason ?? null,
      JSON.stringify({
        eventRef: params.eventRef,
        previousStatus: params.previousStatus,
        newStatus: params.newStatus,
        revision: String(params.revision),
        reason: params.reason
      }),
      params.operationId
    );
  }

  async recordTrash(
    tx: SqlTransaction,
    params: {
      id: string;
      operationId: string;
      mediaRef: string;
      eventRef: string;
      organizerRef: string;
      previousStatus: string;
      trashedAt: Date;
      restoreDeadline: Date;
      reason?: string;
    }
  ): Promise<void> {
    await tx.execute(
      `INSERT INTO media_trash_record (
         id, operation_id, media_ref, event_ref, organizer_ref,
         previous_status, trashed_at, restore_deadline, restored_at, reason
       ) VALUES (
         $1::uuid, $2, $3, $4, $5, $6, $7, $8, NULL, $9
       )`,
      params.id,
      params.operationId,
      params.mediaRef,
      params.eventRef,
      params.organizerRef,
      params.previousStatus,
      params.trashedAt,
      params.restoreDeadline,
      params.reason ?? null
    );
  }

  async getActiveTrashRecord(
    tx: SqlTransaction,
    mediaRef: string
  ): Promise<MediaTrashRecord | null> {
    const rows = await tx.query<{
      id: string;
      operation_id: string;
      media_ref: string;
      event_ref: string;
      organizer_ref: string;
      previous_status: string;
      trashed_at: Date | string;
      restore_deadline: Date | string;
      restored_at: Date | string | null;
      reason: string | null;
    }>(
      `SELECT id, operation_id, media_ref, event_ref, organizer_ref,
              previous_status, trashed_at, restore_deadline, restored_at, reason
       FROM media_trash_record
       WHERE media_ref = $1 AND restored_at IS NULL
       ORDER BY trashed_at DESC
       LIMIT 1`,
      mediaRef
    );

    if (!rows.length) return null;
    const r = rows[0]!;
    return {
      id: r.id,
      operationId: r.operation_id,
      mediaRef: r.media_ref,
      eventRef: r.event_ref,
      organizerRef: r.organizer_ref,
      previousStatus: r.previous_status,
      trashedAt: new Date(r.trashed_at),
      restoreDeadline: new Date(r.restore_deadline),
      restoredAt: r.restored_at ? new Date(r.restored_at) : null,
      reason: r.reason
    };
  }

  async markTrashRestored(
    tx: SqlTransaction,
    trashRecordId: string,
    restoredAt: Date
  ): Promise<void> {
    await tx.execute(
      `UPDATE media_trash_record
       SET restored_at = $2
       WHERE id = $1::uuid`,
      trashRecordId,
      restoredAt
    );
  }

  async getExpiredTrashRecords(
    tx: SqlTransaction,
    now: Date,
    limit: number = 50
  ): Promise<MediaTrashRecord[]> {
    const rows = await tx.query<{
      id: string;
      operation_id: string;
      media_ref: string;
      event_ref: string;
      organizer_ref: string;
      previous_status: string;
      trashed_at: Date | string;
      restore_deadline: Date | string;
      restored_at: Date | string | null;
      reason: string | null;
    }>(
      `SELECT id, operation_id, media_ref, event_ref, organizer_ref,
              previous_status, trashed_at, restore_deadline, restored_at, reason
       FROM media_trash_record
       WHERE restored_at IS NULL AND restore_deadline <= $1
       ORDER BY restore_deadline ASC
       LIMIT $2`,
      now,
      limit
    );

    return rows.map(r => ({
      id: r.id,
      operationId: r.operation_id,
      mediaRef: r.media_ref,
      eventRef: r.event_ref,
      organizerRef: r.organizer_ref,
      previousStatus: r.previous_status,
      trashedAt: new Date(r.trashed_at),
      restoreDeadline: new Date(r.restore_deadline),
      restoredAt: r.restored_at ? new Date(r.restored_at) : null,
      reason: r.reason
    }));
  }

  async getTrashPurgeIntentByTrashId(
    tx: SqlTransaction,
    trashRecordId: string
  ): Promise<TrashPurgeIntentRecord | null> {
    const rows = await tx.query<{
      id: string;
      operation_id: string;
      trash_record_id: string;
      media_ref: string;
      event_ref: string;
      organizer_ref: string;
      generation: bigint | string | number;
      previous_revision: bigint | string | number;
      new_revision: bigint | string | number;
      purge_started_at: Date | string;
      main_purge_deadline: Date | string;
      residual_purge_deadline: Date | string;
      policy_ref: string;
      policy_version: string;
      status: string;
      dedup_key: string;
      created_at: Date | string;
    }>(
      `SELECT id, operation_id, trash_record_id, media_ref, event_ref, organizer_ref,
              generation, previous_revision, new_revision, purge_started_at,
              main_purge_deadline, residual_purge_deadline, policy_ref, policy_version,
              status, dedup_key, created_at
       FROM media_trash_purge_intent
       WHERE trash_record_id = $1::uuid
       LIMIT 1`,
      trashRecordId
    );

    if (!rows.length) return null;
    const r = rows[0]!;
    return {
      id: r.id,
      operationId: r.operation_id,
      trashRecordId: r.trash_record_id,
      mediaRef: r.media_ref,
      eventRef: r.event_ref,
      organizerRef: r.organizer_ref,
      generation: BigInt(r.generation),
      previousRevision: BigInt(r.previous_revision),
      newRevision: BigInt(r.new_revision),
      purgeStartedAt: new Date(r.purge_started_at),
      mainPurgeDeadline: new Date(r.main_purge_deadline),
      residualPurgeDeadline: new Date(r.residual_purge_deadline),
      policyRef: r.policy_ref,
      policyVersion: r.policy_version,
      status: r.status,
      dedupKey: r.dedup_key,
      createdAt: new Date(r.created_at)
    };
  }

  async recordTrashPurgeIntent(
    tx: SqlTransaction,
    params: {
      id: string;
      operationId: string;
      trashRecordId: string;
      mediaRef: string;
      eventRef: string;
      organizerRef: string;
      generation: bigint;
      previousRevision: bigint;
      newRevision: bigint;
      purgeStartedAt: Date;
      mainPurgeDeadline: Date;
      residualPurgeDeadline: Date;
      policyRef: string;
      policyVersion: string;
      status: string;
      dedupKey: string;
    }
  ): Promise<void> {
    await tx.execute(
      `INSERT INTO media_trash_purge_intent (
         id, operation_id, trash_record_id, media_ref, event_ref, organizer_ref,
         generation, previous_revision, new_revision, purge_started_at,
         main_purge_deadline, residual_purge_deadline, policy_ref, policy_version,
         status, dedup_key, created_at
       ) VALUES (
         $1::uuid, $2, $3::uuid, $4, $5, $6,
         $7::bigint, $8::bigint, $9::bigint, $10,
         $11, $12, $13, $14,
         $15, $16, clock_timestamp()
       )
       ON CONFLICT (dedup_key) DO NOTHING`,
      params.id,
      params.operationId,
      params.trashRecordId,
      params.mediaRef,
      params.eventRef,
      params.organizerRef,
      params.generation.toString(),
      params.previousRevision.toString(),
      params.newRevision.toString(),
      params.purgeStartedAt,
      params.mainPurgeDeadline,
      params.residualPurgeDeadline,
      params.policyRef,
      params.policyVersion,
      params.status,
      params.dedupKey
    );
  }
}

export class MediaModerationService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly repository: MediaModerationRepository,
    private readonly authorizer: EventStatusAuthorizer,
    private readonly purgeDispatcher?: PurgeDispatcherPort
  ) {}

  /**
   * Approves a media in PENDING_REVIEW state making it PUBLISHED (EL-TK-103).
   * Verifies ownership, safety facts, absence of removal blocks, and CAS concurrency.
   */
  async approveMedia(command: ApproveMediaCommand): Promise<ApproveMediaResult> {
    if (!command || typeof command !== 'object') {
      throw new MediaModerationError('INVALID_ARGUMENT', 'Command is required');
    }
    const { organizerRef, eventRef, mediaRef, expectedRevision } = command;
    if (!organizerRef || typeof organizerRef !== 'string' || !organizerRef.trim()) {
      throw new MediaModerationError('INVALID_ARGUMENT', 'organizerRef is required');
    }
    if (!eventRef || typeof eventRef !== 'string' || !eventRef.trim()) {
      throw new MediaModerationError('INVALID_ARGUMENT', 'eventRef is required');
    }
    if (!mediaRef || typeof mediaRef !== 'string' || !mediaRef.trim()) {
      throw new MediaModerationError('INVALID_ARGUMENT', 'mediaRef is required');
    }

    const operationId = command.operationId ?? randomUUID();
    const now = new Date();

    return await this.transactions.run(async (tx) => {
      // 1. Authorize organizer ownership on event
      try {
        await this.authorizer.assertAuthorized(tx, {
          eventRef: eventRef.trim(),
          actor: { role: 'ORGANIZER', organizerRef: organizerRef.trim() }
        });
      } catch (err: any) {
        if (err.code === 'ACCESS_DENIED' || err.code === 'BARRED_EVENT') {
          throw new MediaModerationError('ACCESS_DENIED', 'Access denied to event media');
        }
        throw err;
      }

      // 2. Lock and retrieve media row
      const media = await this.repository.lockAndGetMedia(tx, mediaRef.trim());
      if (!media) {
        throw new MediaModerationError('MEDIA_NOT_FOUND', `Media '${mediaRef}' not found`);
      }

      // Multi-tenant check: media must belong to eventRef
      if (media.eventRef !== eventRef.trim()) {
        throw new MediaModerationError('ACCESS_DENIED', 'Media does not belong to specified event');
      }

      // 3. Expected revision check (concurrency control)
      if (expectedRevision !== undefined && media.revision !== BigInt(expectedRevision)) {
        throw new MediaModerationError(
          'CONCURRENCY_CONFLICT',
          `Concurrent modification: expected revision ${expectedRevision}, current ${media.revision}`
        );
      }

      // 4. State validation & Idempotency (Escenario 1 & 3)
      if (media.status === 'PUBLISHED') {
        // Idempotent replay: already approved and published
        return {
          mediaRef: media.mediaRef,
          eventRef: media.eventRef,
          status: 'PUBLISHED',
          previousStatus: 'PUBLISHED',
          revision: media.revision,
          approvedAt: now,
          operationId
        };
      }

      if (media.status !== 'PENDING_REVIEW') {
        throw new MediaModerationError(
          'INVALID_STATE',
          `Media is in status '${media.status}', cannot approve when not PENDING_REVIEW`
        );
      }

      // 5. Escenario 2: Bloqueo de seguridad o retiro vigente
      const safetyFact = await this.repository.getSafetyFact(tx, media.mediaRef, media.generation);
      if (safetyFact) {
        if (safetyFact.outcome === 'DENIED') {
          throw new MediaModerationError('SAFETY_BLOCKED', 'Media safety inspection was denied');
        }
        if (safetyFact.outcome === 'INCONCLUSIVE') {
          throw new MediaModerationError('SAFETY_BLOCKED', 'Media safety inspection is inconclusive');
        }
      }

      const hasRemoval = await this.repository.hasActiveRemovalBlock(tx, media.mediaRef);
      if (hasRemoval) {
        throw new MediaModerationError('REMOVAL_BLOCKED', 'Media has an active removal or takedown block');
      }

      // 6. Transition to PUBLISHED
      const newRevision = await this.repository.updateStatus(
        tx,
        media.mediaRef,
        media.revision,
        'PUBLISHED'
      );

      // 7. Audit log (Observabilidad)
      await this.repository.recordAudit(tx, {
        operationId,
        mediaRef: media.mediaRef,
        eventRef: media.eventRef,
        actorRef: organizerRef.trim(),
        previousStatus: media.status,
        newStatus: 'PUBLISHED',
        revision: newRevision,
        timestamp: now
      });

      return {
        mediaRef: media.mediaRef,
        eventRef: media.eventRef,
        status: 'PUBLISHED',
        previousStatus: media.status,
        revision: newRevision,
        approvedAt: now,
        operationId
      };
    });
  }

  /**
   * Rejects a media in PENDING_REVIEW state making it REJECTED (EL-TK-104).
   * Verifies ownership, state compatibility, and CAS concurrency.
   * Preserves original file and consumption while it physically exists.
   */
  async rejectMedia(command: RejectMediaCommand): Promise<RejectMediaResult> {
    if (!command || typeof command !== 'object') {
      throw new MediaModerationError('INVALID_ARGUMENT', 'Command is required');
    }
    const { organizerRef, eventRef, mediaRef, reason, expectedRevision } = command;
    if (!organizerRef || typeof organizerRef !== 'string' || !organizerRef.trim()) {
      throw new MediaModerationError('INVALID_ARGUMENT', 'organizerRef is required');
    }
    if (!eventRef || typeof eventRef !== 'string' || !eventRef.trim()) {
      throw new MediaModerationError('INVALID_ARGUMENT', 'eventRef is required');
    }
    if (!mediaRef || typeof mediaRef !== 'string' || !mediaRef.trim()) {
      throw new MediaModerationError('INVALID_ARGUMENT', 'mediaRef is required');
    }

    const operationId = command.operationId ?? randomUUID();
    const now = new Date();

    return await this.transactions.run(async (tx) => {
      // 1. Authorize organizer ownership on event
      try {
        await this.authorizer.assertAuthorized(tx, {
          eventRef: eventRef.trim(),
          actor: { role: 'ORGANIZER', organizerRef: organizerRef.trim() }
        });
      } catch (err: any) {
        if (err.code === 'ACCESS_DENIED' || err.code === 'BARRED_EVENT') {
          throw new MediaModerationError('ACCESS_DENIED', 'Access denied to event media');
        }
        throw err;
      }

      // 2. Lock and retrieve media row
      const media = await this.repository.lockAndGetMedia(tx, mediaRef.trim());
      if (!media) {
        throw new MediaModerationError('MEDIA_NOT_FOUND', `Media '${mediaRef}' not found`);
      }

      // Multi-tenant check: media must belong to eventRef
      if (media.eventRef !== eventRef.trim()) {
        throw new MediaModerationError('ACCESS_DENIED', 'Media does not belong to specified event');
      }

      // 3. Expected revision check (concurrency control)
      if (expectedRevision !== undefined && media.revision !== BigInt(expectedRevision)) {
        throw new MediaModerationError(
          'CONCURRENCY_CONFLICT',
          `Concurrent modification: expected revision ${expectedRevision}, current ${media.revision}`
        );
      }

      // 4. State validation & Idempotency (Escenario 1 & 2)
      if (media.status === 'REJECTED') {
        // Idempotent replay: already rejected
        return {
          mediaRef: media.mediaRef,
          eventRef: media.eventRef,
          status: 'REJECTED',
          previousStatus: 'REJECTED',
          revision: media.revision,
          rejectedAt: now,
          operationId
        };
      }

      if (media.status !== 'PENDING_REVIEW') {
        throw new MediaModerationError(
          'INVALID_STATE',
          `Media is in status '${media.status}', cannot reject when not PENDING_REVIEW`
        );
      }

      // 5. Transition to REJECTED (preserves original file and consumption)
      const newRevision = await this.repository.updateStatus(
        tx,
        media.mediaRef,
        media.revision,
        'REJECTED'
      );

      // 6. Audit log (Observabilidad)
      await this.repository.recordAudit(tx, {
        action: 'MEDIA_REJECTED',
        operationId,
        mediaRef: media.mediaRef,
        eventRef: media.eventRef,
        actorRef: organizerRef.trim(),
        previousStatus: media.status,
        newStatus: 'REJECTED',
        revision: newRevision,
        reason,
        timestamp: now
      });

      return {
        mediaRef: media.mediaRef,
        eventRef: media.eventRef,
        status: 'REJECTED',
        previousStatus: media.status,
        revision: newRevision,
        rejectedAt: now,
        operationId
      };
    });
  }

  /**
   * Moves eligible media to TRASHED preserving previous status (EL-TK-107, DEC-096).
   * Eligible states: PUBLISHED, HIDDEN, PENDING_REVIEW, REJECTED, and PROCESSING_FAILED
   * (only with approved safety inspection).
   * Ineligible: PROCESSING, UPLOADED, QUARANTINED.
   * Safety and removal blocks prevail.
   * Window: 7 days until purge eligibility (restoreDeadline).
   */
  async trashMedia(command: TrashMediaCommand): Promise<TrashMediaResult> {
    if (!command || typeof command !== 'object') {
      throw new MediaModerationError('INVALID_ARGUMENT', 'Command is required');
    }
    const { organizerRef, eventRef, mediaRef, reason, expectedRevision } = command;
    if (!organizerRef || typeof organizerRef !== 'string' || !organizerRef.trim()) {
      throw new MediaModerationError('INVALID_ARGUMENT', 'organizerRef is required');
    }
    if (!eventRef || typeof eventRef !== 'string' || !eventRef.trim()) {
      throw new MediaModerationError('INVALID_ARGUMENT', 'eventRef is required');
    }
    if (!mediaRef || typeof mediaRef !== 'string' || !mediaRef.trim()) {
      throw new MediaModerationError('INVALID_ARGUMENT', 'mediaRef is required');
    }

    const operationId = command.operationId ?? randomUUID();
    const trashedAt = new Date();
    const restoreDeadline = new Date(trashedAt.getTime() + 7 * 24 * 60 * 60 * 1000);

    return await this.transactions.run(async (tx) => {
      // 1. Authorize organizer ownership on event
      try {
        await this.authorizer.assertAuthorized(tx, {
          eventRef: eventRef.trim(),
          actor: { role: 'ORGANIZER', organizerRef: organizerRef.trim() }
        });
      } catch (err: any) {
        if (err.code === 'ACCESS_DENIED' || err.code === 'BARRED_EVENT') {
          throw new MediaModerationError('ACCESS_DENIED', 'Access denied to event media');
        }
        throw err;
      }

      // 2. Lock and retrieve media row
      const media = await this.repository.lockAndGetMedia(tx, mediaRef.trim());
      if (!media) {
        throw new MediaModerationError('MEDIA_NOT_FOUND', `Media '${mediaRef}' not found`);
      }

      // Multi-tenant check: media must belong to eventRef
      if (media.eventRef !== eventRef.trim()) {
        throw new MediaModerationError('ACCESS_DENIED', 'Media does not belong to specified event');
      }

      // 3. Expected revision check (concurrency control)
      if (expectedRevision !== undefined && media.revision !== BigInt(expectedRevision)) {
        throw new MediaModerationError(
          'CONCURRENCY_CONFLICT',
          `Concurrent modification: expected revision ${expectedRevision}, current ${media.revision}`
        );
      }

      // 4. Idempotency check: if already TRASHED
      if (media.status === 'TRASHED') {
        const existingRecord = await this.repository.getActiveTrashRecord(tx, media.mediaRef);
        return {
          mediaRef: media.mediaRef,
          eventRef: media.eventRef,
          status: 'TRASHED',
          previousStatus: existingRecord?.previousStatus ?? 'TRASHED',
          revision: media.revision,
          trashedAt: existingRecord?.trashedAt ?? trashedAt,
          restoreDeadline: existingRecord?.restoreDeadline ?? restoreDeadline,
          operationId
        };
      }

      // 5. Safety and removal blocks check (Safety prevails over trash per DEC-096)
      const safety = await this.repository.getSafetyFact(tx, media.mediaRef, media.generation);
      if (safety && (safety.outcome === 'DENIED' || safety.outcome === 'INCONCLUSIVE')) {
        throw new MediaModerationError(
          'SAFETY_BLOCKED',
          `Media is blocked by safety inspection outcome '${safety.outcome}'`
        );
      }

      const hasRemovalBlock = await this.repository.hasActiveRemovalBlock(tx, media.mediaRef);
      if (hasRemovalBlock) {
        throw new MediaModerationError(
          'REMOVAL_BLOCKED',
          'Media is subject to an active removal lock'
        );
      }

      // 6. Eligibility check (DEC-096, Escenario 1, 2, 3)
      if (media.status === 'QUARANTINED') {
        throw new MediaModerationError(
          'SAFETY_BLOCKED',
          'Quarantined media is not eligible for trash'
        );
      }

      if (media.status === 'PROCESSING' || media.status === 'UPLOADED') {
        throw new MediaModerationError(
          'INELIGIBLE_STATE',
          `Media currently in '${media.status}' is not eligible for trash`
        );
      }

      if (media.status === 'PROCESSING_FAILED') {
        // Escenario 3: only allowed if safety inspection was approved
        if (!safety || safety.outcome !== 'APPROVED') {
          throw new MediaModerationError(
            'SAFETY_BLOCKED',
            'PROCESSING_FAILED media requires approved safety inspection to be eligible for trash'
          );
        }
      } else {
        const eligibleStatuses = ['PUBLISHED', 'HIDDEN', 'PENDING_REVIEW', 'REJECTED'];
        if (!eligibleStatuses.includes(media.status)) {
          throw new MediaModerationError(
            'INELIGIBLE_STATE',
            `Status '${media.status}' is not eligible for trash`
          );
        }
      }

      // 7. Update status in media_catalog
      const newRevision = await this.repository.updateStatus(
        tx,
        media.mediaRef,
        media.revision,
        'TRASHED'
      );

      // 8. Record trash metadata
      const trashId = randomUUID();
      await this.repository.recordTrash(tx, {
        id: trashId,
        operationId,
        mediaRef: media.mediaRef,
        eventRef: media.eventRef,
        organizerRef: organizerRef.trim(),
        previousStatus: media.status,
        trashedAt,
        restoreDeadline,
        reason
      });

      // 9. Audit event
      await this.repository.recordAudit(tx, {
        action: 'MEDIA_TRASHED',
        operationId,
        mediaRef: media.mediaRef,
        eventRef: media.eventRef,
        actorRef: organizerRef.trim(),
        previousStatus: media.status,
        newStatus: 'TRASHED',
        revision: newRevision,
        reason,
        timestamp: trashedAt
      });

      return {
        mediaRef: media.mediaRef,
        eventRef: media.eventRef,
        status: 'TRASHED',
        previousStatus: media.status,
        revision: newRevision,
        trashedAt,
        restoreDeadline,
        operationId
      };
    });
  }

  /**
   * Restores a media from TRASHED back to its previous_status (EL-TK-108, DEC-086, DEC-096).
   * Verifies restore window is not expired, safety and removal blocks, and preserves exact prior status.
   */
  async restoreMedia(command: RestoreMediaCommand): Promise<RestoreMediaResult> {
    if (!command || typeof command !== 'object') {
      throw new MediaModerationError('INVALID_ARGUMENT', 'Command is required');
    }
    const { organizerRef, eventRef, mediaRef, expectedRevision } = command;
    if (!organizerRef || typeof organizerRef !== 'string' || !organizerRef.trim()) {
      throw new MediaModerationError('INVALID_ARGUMENT', 'organizerRef is required');
    }
    if (!eventRef || typeof eventRef !== 'string' || !eventRef.trim()) {
      throw new MediaModerationError('INVALID_ARGUMENT', 'eventRef is required');
    }
    if (!mediaRef || typeof mediaRef !== 'string' || !mediaRef.trim()) {
      throw new MediaModerationError('INVALID_ARGUMENT', 'mediaRef is required');
    }

    const operationId = command.operationId ?? randomUUID();
    const now = command.now ?? new Date();

    return await this.transactions.run(async (tx) => {
      // 1. Authorize organizer ownership on event
      try {
        await this.authorizer.assertAuthorized(tx, {
          eventRef: eventRef.trim(),
          actor: { role: 'ORGANIZER', organizerRef: organizerRef.trim() }
        });
      } catch (err: any) {
        if (err.code === 'ACCESS_DENIED' || err.code === 'BARRED_EVENT') {
          throw new MediaModerationError('ACCESS_DENIED', 'Access denied to event media');
        }
        throw err;
      }

      // 2. Lock and retrieve media row
      const media = await this.repository.lockAndGetMedia(tx, mediaRef.trim());
      if (!media) {
        throw new MediaModerationError('MEDIA_NOT_FOUND', `Media '${mediaRef}' not found`);
      }

      // Multi-tenant check: media must belong to eventRef
      if (media.eventRef !== eventRef.trim()) {
        throw new MediaModerationError('ACCESS_DENIED', 'Media does not belong to specified event');
      }

      // 3. Check expected revision (concurrency)
      if (expectedRevision !== undefined && media.revision !== BigInt(expectedRevision)) {
        throw new MediaModerationError(
          'CONCURRENCY_CONFLICT',
          `Concurrent modification: expected revision ${expectedRevision}, current ${media.revision}`
        );
      }

      // 4. Retrieve active trash record
      const trashRecord = await this.repository.getActiveTrashRecord(tx, media.mediaRef);

      // Check if media is purged or deleted (Escenario 3)
      if (media.status === 'DELETED') {
        throw new MediaModerationError(
          'MEDIA_PURGED',
          'Media has already been purged and cannot be restored'
        );
      }

      // If media is not currently TRASHED:
      if (media.status !== 'TRASHED') {
        // Idempotency check: if media was already restored to its previousStatus
        if (trashRecord && media.status === trashRecord.previousStatus) {
          return {
            mediaRef: media.mediaRef,
            eventRef: media.eventRef,
            status: media.status,
            previousStatus: 'TRASHED',
            restoredFromStatus: trashRecord.previousStatus,
            revision: media.revision,
            restoredAt: trashRecord.restoredAt ?? now,
            operationId
          };
        }
        throw new MediaModerationError(
          'INVALID_STATE',
          `Media is currently in status '${media.status}', cannot restore when not TRASHED`
        );
      }

      if (!trashRecord) {
        throw new MediaModerationError(
          'INVALID_STATE',
          'No active trash record found for media'
        );
      }

      // 5. Restore window check (Escenario 3, DEC-096 7 days window, ARCH-019 boundary)
      if (trashRecord.restoreDeadline.getTime() <= now.getTime()) {
        throw new MediaModerationError(
          'RESTORE_WINDOW_EXPIRED',
          `Restore deadline '${trashRecord.restoreDeadline.toISOString()}' has expired`
        );
      }

      const existingPurge = await this.repository.getTrashPurgeIntentByTrashId(tx, trashRecord.id);
      if (existingPurge) {
        throw new MediaModerationError(
          'RESTORE_WINDOW_EXPIRED',
          'Media restore window expired and purge has been requested'
        );
      }

      // 6. Safety check and removal blocks revalidation (DEC-086: no evade seguridad ni retiros vigentes)
      const safety = await this.repository.getSafetyFact(tx, media.mediaRef, media.generation);
      if (safety && (safety.outcome === 'DENIED' || safety.outcome === 'INCONCLUSIVE')) {
        throw new MediaModerationError(
          'SAFETY_BLOCKED',
          `Media is blocked by safety inspection outcome '${safety.outcome}'`
        );
      }

      const hasRemovalBlock = await this.repository.hasActiveRemovalBlock(tx, media.mediaRef);
      if (hasRemovalBlock) {
        throw new MediaModerationError(
          'REMOVAL_BLOCKED',
          'Media is subject to an active removal lock'
        );
      }

      // Target restored status is faithfully the previousStatus (DEC-086)
      const targetStatus = trashRecord.previousStatus;

      // 7. Update status back to targetStatus in media_catalog
      const newRevision = await this.repository.updateStatus(
        tx,
        media.mediaRef,
        media.revision,
        targetStatus
      );

      // 8. Mark trash record as restored
      await this.repository.markTrashRestored(tx, trashRecord.id, now);

      // 9. Audit event
      await this.repository.recordAudit(tx, {
        action: 'MEDIA_RESTORED',
        operationId,
        mediaRef: media.mediaRef,
        eventRef: media.eventRef,
        actorRef: organizerRef.trim(),
        previousStatus: 'TRASHED',
        newStatus: targetStatus,
        revision: newRevision,
        timestamp: now
      });

      return {
        mediaRef: media.mediaRef,
        eventRef: media.eventRef,
        status: targetStatus,
        previousStatus: 'TRASHED',
        restoredFromStatus: trashRecord.previousStatus,
        revision: newRevision,
        restoredAt: now,
        operationId
      };
    });
  }

  /**
   * Expires media whose trash window (7 days) reached restoreDeadline (EL-TK-109, DEC-109, ARCH-019).
   * Transitions media to DELETED, records durable PurgeIntent with original restoreDeadline anchor,
   * emits purge request idempotently, and closes restoration window irreversibly.
   */
  async expireTrashMedia(command: ExpireTrashMediaCommand): Promise<ExpireTrashMediaResult> {
    if (!command || typeof command !== 'object') {
      throw new MediaModerationError('INVALID_ARGUMENT', 'Command is required');
    }
    const { mediaRef } = command;
    if (!mediaRef || typeof mediaRef !== 'string' || !mediaRef.trim()) {
      throw new MediaModerationError('INVALID_ARGUMENT', 'mediaRef is required');
    }

    const operationId = command.operationId ?? randomUUID();
    const now = command.now ?? new Date();

    return await this.transactions.run(async (tx) => {
      // 1. Lock and retrieve media
      const media = await this.repository.lockAndGetMedia(tx, mediaRef.trim());
      if (!media) {
        throw new MediaModerationError('MEDIA_NOT_FOUND', `Media '${mediaRef}' not found`);
      }

      // 2. Retrieve active trash record
      const trashRecord = await this.repository.getActiveTrashRecord(tx, media.mediaRef);

      // 3. Escenario 2: Idempotencia si el job se repite
      if (trashRecord) {
        const existingPurge = await this.repository.getTrashPurgeIntentByTrashId(tx, trashRecord.id);
        if (existingPurge) {
          return {
            outcome: 'ALREADY_PURGED',
            mediaRef: media.mediaRef,
            eventRef: media.eventRef,
            purgeIntentId: existingPurge.id,
            purgeStartedAt: existingPurge.purgeStartedAt,
            mainPurgeDeadline: existingPurge.mainPurgeDeadline,
            residualPurgeDeadline: existingPurge.residualPurgeDeadline,
            previousStatus: 'TRASHED',
            revision: existingPurge.newRevision
          };
        }
      }

      // Escenario 3: Si la media fue restaurada antes del deadline, no se purga ni invalida la restauración
      if (media.status !== 'TRASHED' || (trashRecord && trashRecord.restoredAt !== null)) {
        return {
          outcome: 'SKIPPED_ALREADY_RESTORED',
          mediaRef: media.mediaRef,
          eventRef: media.eventRef,
          previousStatus: media.status,
          revision: media.revision
        };
      }

      if (!trashRecord) {
        return {
          outcome: 'SKIPPED_ALREADY_RESTORED',
          mediaRef: media.mediaRef,
          eventRef: media.eventRef,
          previousStatus: media.status,
          revision: media.revision
        };
      }

      // Check if deadline has been reached
      if (now.getTime() < trashRecord.restoreDeadline.getTime()) {
        return {
          outcome: 'SKIPPED_NOT_EXPIRED',
          mediaRef: media.mediaRef,
          eventRef: media.eventRef,
          purgeStartedAt: trashRecord.restoreDeadline,
          previousStatus: media.status,
          revision: media.revision
        };
      }

      // 4. Escenario 1: Cerrar restauración, transicionar media a DELETED y registrar PurgeIntent
      const newRevision = await this.repository.updateStatus(
        tx,
        media.mediaRef,
        media.revision,
        'DELETED'
      );

      const purgeIntentId = randomUUID();
      const dedupKey = `trash-purge:${trashRecord.id}`;
      const purgeStartedAt = trashRecord.restoreDeadline; // Ancla aprobada DEC-109 / ARCH-019
      const mainPurgeDeadline = addUtcCalendarDays(purgeStartedAt, 7);
      const residualPurgeDeadline = addUtcCalendarDays(purgeStartedAt, 30);
      const policyRef = 'MOD-008/ARCH-019';
      const policyVersion = '1.0';

      await this.repository.recordTrashPurgeIntent(tx, {
        id: purgeIntentId,
        operationId,
        trashRecordId: trashRecord.id,
        mediaRef: media.mediaRef,
        eventRef: media.eventRef,
        organizerRef: trashRecord.organizerRef,
        generation: media.generation,
        previousRevision: media.revision,
        newRevision,
        purgeStartedAt,
        mainPurgeDeadline,
        residualPurgeDeadline,
        policyRef,
        policyVersion,
        status: 'PENDING',
        dedupKey
      });

      // Auditar
      await this.repository.recordAudit(tx, {
        action: 'MEDIA_TRASH_EXPIRED_PURGE_REQUESTED',
        operationId,
        mediaRef: media.mediaRef,
        eventRef: media.eventRef,
        actorRef: 'SYSTEM',
        previousStatus: 'TRASHED',
        newStatus: 'DELETED',
        revision: newRevision,
        timestamp: now
      });

      // Emisión al dispatcher si existe
      if (this.purgeDispatcher) {
        await this.purgeDispatcher.dispatchPurgeRequest({
          purgeIntentId,
          operationId,
          mediaRef: media.mediaRef,
          eventRef: media.eventRef,
          organizerRef: trashRecord.organizerRef,
          generation: media.generation,
          revision: newRevision,
          purgeStartedAt,
          mainPurgeDeadline,
          residualPurgeDeadline,
          policyRef,
          policyVersion
        });
      }

      return {
        outcome: 'PURGE_REQUESTED',
        mediaRef: media.mediaRef,
        eventRef: media.eventRef,
        purgeIntentId,
        purgeStartedAt,
        mainPurgeDeadline,
        residualPurgeDeadline,
        previousStatus: 'TRASHED',
        revision: newRevision
      };
    });
  }

  /**
   * Sweeps and processes all expired trash records up to limit (EL-TK-109).
   */
  async processExpiredTrash(command: ProcessExpiredTrashCommand = {}): Promise<ProcessExpiredTrashResult> {
    const now = command.now ?? new Date();
    const limit = command.limit ?? 50;

    const candidates = await this.transactions.run(async (tx) => {
      return await this.repository.getExpiredTrashRecords(tx, now, limit);
    });

    const results: ExpireTrashMediaResult[] = [];
    for (const candidate of candidates) {
      const res = await this.expireTrashMedia({
        mediaRef: candidate.mediaRef,
        now
      });
      results.push(res);
    }

    return {
      processedCount: results.filter(r => r.outcome === 'PURGE_REQUESTED').length,
      results
    };
  }
}
