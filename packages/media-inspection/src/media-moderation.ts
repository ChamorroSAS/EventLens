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
      | 'SAFETY_BLOCKED'
      | 'REMOVAL_BLOCKED'
      | 'CONCURRENCY_CONFLICT',
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
}

export class MediaModerationService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly repository: MediaModerationRepository,
    private readonly authorizer: EventStatusAuthorizer
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
}
