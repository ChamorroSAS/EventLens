import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/job-queue';
import type { EventStatusAuthorizer } from './media-status.js';
import type { SafetyFact } from './contracts.js';

export type MediaVisibilityDenialCode =
  | 'INVALID_ARGUMENT'
  | 'ACCESS_DENIED'
  | 'MEDIA_NOT_FOUND'
  | 'CONFLICT'
  | 'SAFETY_BLOCKED'
  | 'LIFECYCLE_BLOCKED';

export class MediaVisibilityError extends Error {
  constructor(
    readonly code: MediaVisibilityDenialCode,
    message?: string
  ) {
    super(message ?? code);
    this.name = 'MediaVisibilityError';
  }
}

// ==========================================
// EL-TK-105: Ocultar Media Publicada
// ==========================================

export interface HideMediaCommand {
  readonly mediaRef: string;
  readonly eventRef: string;
  readonly organizerRef: string;
  readonly operationId?: string;
  readonly reason?: string;
  readonly expectedRevision?: bigint;
  readonly now?: Date;
}

export interface HideMediaResult {
  readonly mediaRef: string;
  readonly eventRef: string;
  readonly previousStatus: 'PUBLISHED';
  readonly newStatus: 'HIDDEN';
  readonly generation: bigint;
  readonly revision: bigint;
  readonly hiddenAt: Date;
}

// ==========================================
// EL-TK-106: Volver a Publicar Media Oculta
// ==========================================

export interface RepublishMediaCommand {
  readonly mediaRef: string;
  readonly eventRef: string;
  readonly organizerRef: string;
  readonly operationId?: string;
  readonly reason?: string;
  readonly expectedRevision?: bigint;
  readonly now?: Date;
}

export interface RepublishMediaResult {
  readonly mediaRef: string;
  readonly eventRef: string;
  readonly previousStatus: 'HIDDEN';
  readonly newStatus: 'PUBLISHED';
  readonly generation: bigint;
  readonly revision: bigint;
  readonly republishedAt: Date;
}

// ==========================================
// Auditoría y Observabilidad
// ==========================================

export interface MediaVisibilityAuditEvent {
  readonly id: string;
  readonly operationId?: string;
  readonly mediaRef: string;
  readonly eventRef: string;
  readonly organizerRef: string;
  readonly action: 'HIDE_MEDIA' | 'REPUBLISH_MEDIA';
  readonly previousStatus: string;
  readonly newStatus: string;
  readonly generation: bigint;
  readonly revision: bigint;
  readonly reason?: string;
  readonly committedAt: Date;
}

export interface MediaVisibilityDenialAuditEvent {
  readonly id: string;
  readonly operationId?: string;
  readonly mediaRef: string;
  readonly eventRef: string;
  readonly actorRef: string;
  readonly action: 'HIDE_MEDIA' | 'REPUBLISH_MEDIA';
  readonly code: MediaVisibilityDenialCode;
  readonly reason: string;
  readonly attemptedAt: Date;
}

export interface MediaVisibilityAuditSink {
  recordAudit(event: MediaVisibilityAuditEvent): Promise<void>;
  recordDenial(event: MediaVisibilityDenialAuditEvent): Promise<void>;
}

export interface MediaVisibilityCatalogRecord {
  mediaRef: string;
  eventRef: string;
  guestRef: string;
  generation: bigint;
  revision: bigint;
  status: string;
  original: unknown;
  jobId: string;
}

export interface MediaVisibilityRepository {
  findMediaForUpdate(
    tx: SqlTransaction,
    mediaRef: string,
    eventRef: string
  ): Promise<MediaVisibilityCatalogRecord | null>;

  updateStatus(
    tx: SqlTransaction,
    mediaRef: string,
    eventRef: string,
    expectedStatus: string,
    newStatus: string
  ): Promise<{ generation: bigint; revision: bigint } | null>;

  getSafetyFact(
    tx: SqlTransaction,
    mediaRef: string,
    generation: bigint
  ): Promise<SafetyFact | null>;

  recordAudit(
    tx: SqlTransaction,
    event: MediaVisibilityAuditEvent
  ): Promise<void>;

  recordDenial(
    tx: SqlTransaction,
    event: MediaVisibilityDenialAuditEvent
  ): Promise<void>;
}

export class PostgresMediaVisibilityRepository implements MediaVisibilityRepository {
  async findMediaForUpdate(
    tx: SqlTransaction,
    mediaRef: string,
    eventRef: string
  ): Promise<MediaVisibilityCatalogRecord | null> {
    const cleanMedia = mediaRef.replace(/^media:/, '');
    const rows = await tx.query<{
      media_ref: string;
      event_ref: string;
      guest_ref: string;
      generation: bigint;
      revision: bigint;
      status: string;
      original: unknown;
      job_id: string;
    }>(
      `SELECT media_ref, event_ref, guest_ref, generation, revision, status, original, job_id
       FROM media_catalog
       WHERE (media_ref = $1 OR media_ref = $2) AND event_ref = $3
       FOR UPDATE`,
      cleanMedia,
      `media:${cleanMedia}`,
      eventRef
    );

    if (!rows.length) return null;
    const r = rows[0];
    return {
      mediaRef: r.media_ref,
      eventRef: r.event_ref,
      guestRef: r.guest_ref,
      generation: BigInt(r.generation),
      revision: BigInt(r.revision),
      status: r.status,
      original: r.original,
      jobId: r.job_id,
    };
  }

  async updateStatus(
    tx: SqlTransaction,
    mediaRef: string,
    eventRef: string,
    expectedStatus: string,
    newStatus: string
  ): Promise<{ generation: bigint; revision: bigint } | null> {
    const cleanMedia = mediaRef.replace(/^media:/, '');
    const rows = await tx.query<{ generation: bigint; revision: bigint }>(
      `UPDATE media_catalog
       SET status = $4, revision = revision + 1
       WHERE (media_ref = $1 OR media_ref = $2) AND event_ref = $3 AND status = $5
       RETURNING generation, revision`,
      cleanMedia,
      `media:${cleanMedia}`,
      eventRef,
      newStatus,
      expectedStatus
    );

    if (!rows.length) return null;
    return {
      generation: BigInt(rows[0].generation),
      revision: BigInt(rows[0].revision),
    };
  }

  async getSafetyFact(
    tx: SqlTransaction,
    mediaRef: string,
    generation: bigint
  ): Promise<SafetyFact | null> {
    const cleanMedia = mediaRef.replace(/^media:/, '');
    const rows = await tx.query<{ fact: SafetyFact }>(
      `SELECT fact FROM media_inspection
       WHERE (media_ref = $1 OR media_ref = $2) AND generation = $3::bigint`,
      cleanMedia,
      `media:${cleanMedia}`,
      generation
    );
    return rows[0]?.fact ?? null;
  }

  async recordAudit(
    tx: SqlTransaction,
    event: MediaVisibilityAuditEvent
  ): Promise<void> {
    try {
      await tx.execute(
        `INSERT INTO media_visibility_audit (
           id, operation_id, media_ref, event_ref, organizer_ref, action,
           previous_status, new_status, generation, revision, reason, committed_at
         ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::bigint, $10::bigint, $11, $12)`,
        event.id,
        event.operationId ?? null,
        event.mediaRef,
        event.eventRef,
        event.organizerRef,
        event.action,
        event.previousStatus,
        event.newStatus,
        event.generation,
        event.revision,
        event.reason ?? null,
        event.committedAt
      );
    } catch {
      // Graceful fallback if audit table not yet migrated
    }
  }

  async recordDenial(
    tx: SqlTransaction,
    event: MediaVisibilityDenialAuditEvent
  ): Promise<void> {
    try {
      await tx.execute(
        `INSERT INTO media_visibility_denial_audit (
           id, operation_id, media_ref, event_ref, actor_ref, action,
           reason, attempted_at
         ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)`,
        event.id,
        event.operationId ?? null,
        event.mediaRef,
        event.eventRef,
        event.actorRef,
        event.action,
        event.reason,
        event.attemptedAt
      );
    } catch {
      // Graceful fallback if denial audit table not yet migrated
    }
  }
}

export class HideMediaService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly repository: MediaVisibilityRepository,
    private readonly authorizer: EventStatusAuthorizer,
    private readonly auditSink?: MediaVisibilityAuditSink
  ) {}

  async execute(command: HideMediaCommand): Promise<HideMediaResult> {
    if (!command.mediaRef || !command.eventRef || !command.organizerRef) {
      throw new MediaVisibilityError('INVALID_ARGUMENT', 'mediaRef, eventRef and organizerRef are required');
    }

    const now = command.now ?? new Date();

    return await this.transactions.run(async (tx) => {
      // 1. Authorize organizer on the event
      try {
        await this.authorizer.assertAuthorized(tx, {
          eventRef: command.eventRef,
          actor: { role: 'ORGANIZER', organizerRef: command.organizerRef },
        });
      } catch (err: any) {
        await this.recordDenial(tx, command, 'ACCESS_DENIED', err.message ?? 'Access denied', now);
        throw new MediaVisibilityError('ACCESS_DENIED', 'Organizer not authorized for this event');
      }

      // 2. Query media for update
      const media = await this.repository.findMediaForUpdate(tx, command.mediaRef, command.eventRef);
      if (!media) {
        await this.recordDenial(tx, command, 'MEDIA_NOT_FOUND', 'Media not found in event', now);
        throw new MediaVisibilityError('MEDIA_NOT_FOUND', `Media '${command.mediaRef}' not found in event '${command.eventRef}'`);
      }

      // 3. State check: must be PUBLISHED (Escenario 2)
      if (media.status !== 'PUBLISHED') {
        const msg = `Cannot hide media in status '${media.status}'; expected 'PUBLISHED'`;
        await this.recordDenial(tx, command, 'CONFLICT', msg, now);
        throw new MediaVisibilityError('CONFLICT', msg);
      }

      // Concurrency revision check if specified
      if (command.expectedRevision !== undefined && media.revision !== command.expectedRevision) {
        const msg = `Revision mismatch: expected ${command.expectedRevision}, found ${media.revision}`;
        await this.recordDenial(tx, command, 'CONFLICT', msg, now);
        throw new MediaVisibilityError('CONFLICT', msg);
      }

      // 4. Atomic CAS update
      const updated = await this.repository.updateStatus(
        tx,
        command.mediaRef,
        command.eventRef,
        'PUBLISHED',
        'HIDDEN'
      );

      if (!updated) {
        const msg = 'Concurrent state modification detected';
        await this.recordDenial(tx, command, 'CONFLICT', msg, now);
        throw new MediaVisibilityError('CONFLICT', msg);
      }

      // 5. Audit record
      const auditEvent: MediaVisibilityAuditEvent = {
        id: randomUUID(),
        operationId: command.operationId,
        mediaRef: media.mediaRef,
        eventRef: command.eventRef,
        organizerRef: command.organizerRef,
        action: 'HIDE_MEDIA',
        previousStatus: 'PUBLISHED',
        newStatus: 'HIDDEN',
        generation: updated.generation,
        revision: updated.revision,
        reason: command.reason,
        committedAt: now,
      };

      await this.repository.recordAudit(tx, auditEvent);
      if (this.auditSink) {
        await this.auditSink.recordAudit(auditEvent);
      }

      return {
        mediaRef: media.mediaRef,
        eventRef: command.eventRef,
        previousStatus: 'PUBLISHED',
        newStatus: 'HIDDEN',
        generation: updated.generation,
        revision: updated.revision,
        hiddenAt: now,
      };
    });
  }

  private async recordDenial(
    tx: SqlTransaction,
    command: HideMediaCommand,
    code: MediaVisibilityDenialCode,
    reason: string,
    now: Date
  ) {
    const event: MediaVisibilityDenialAuditEvent = {
      id: randomUUID(),
      operationId: command.operationId,
      mediaRef: command.mediaRef,
      eventRef: command.eventRef,
      actorRef: command.organizerRef,
      action: 'HIDE_MEDIA',
      code,
      reason,
      attemptedAt: now,
    };
    await this.repository.recordDenial(tx, event);
    if (this.auditSink) {
      await this.auditSink.recordDenial(event);
    }
  }
}

export class RepublishMediaService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly repository: MediaVisibilityRepository,
    private readonly authorizer: EventStatusAuthorizer,
    private readonly auditSink?: MediaVisibilityAuditSink
  ) {}

  async execute(command: RepublishMediaCommand): Promise<RepublishMediaResult> {
    if (!command.mediaRef || !command.eventRef || !command.organizerRef) {
      throw new MediaVisibilityError('INVALID_ARGUMENT', 'mediaRef, eventRef and organizerRef are required');
    }

    const now = command.now ?? new Date();

    return await this.transactions.run(async (tx) => {
      // 1. Authorize organizer on the event
      try {
        await this.authorizer.assertAuthorized(tx, {
          eventRef: command.eventRef,
          actor: { role: 'ORGANIZER', organizerRef: command.organizerRef },
        });
      } catch (err: any) {
        await this.recordDenial(tx, command, 'ACCESS_DENIED', err.message ?? 'Access denied', now);
        throw new MediaVisibilityError('ACCESS_DENIED', 'Organizer not authorized for this event');
      }

      // 2. Query media for update
      const media = await this.repository.findMediaForUpdate(tx, command.mediaRef, command.eventRef);
      if (!media) {
        await this.recordDenial(tx, command, 'MEDIA_NOT_FOUND', 'Media not found in event', now);
        throw new MediaVisibilityError('MEDIA_NOT_FOUND', `Media '${command.mediaRef}' not found in event '${command.eventRef}'`);
      }

      // 3. Current status must be HIDDEN (Escenario 1 & 3)
      if (media.status !== 'HIDDEN') {
        const msg = `Cannot republish media in status '${media.status}'; expected 'HIDDEN'`;
        await this.recordDenial(tx, command, 'CONFLICT', msg, now);
        throw new MediaVisibilityError('CONFLICT', msg);
      }

      // Concurrency revision check if specified
      if (command.expectedRevision !== undefined && media.revision !== command.expectedRevision) {
        const msg = `Revision mismatch: expected ${command.expectedRevision}, found ${media.revision}`;
        await this.recordDenial(tx, command, 'CONFLICT', msg, now);
        throw new MediaVisibilityError('CONFLICT', msg);
      }

      // 4. Escenario 2: Validar barreras activas de seguridad y moderación (DEC-005, DEC-086, DEC-087)
      const safetyFact = await this.repository.getSafetyFact(tx, media.mediaRef, media.generation);
      if (safetyFact?.outcome === 'DENIED') {
        const msg = 'Cannot republish media: security/malware inspection failed (safety outcome DENIED)';
        await this.recordDenial(tx, command, 'SAFETY_BLOCKED', msg, now);
        throw new MediaVisibilityError('SAFETY_BLOCKED', msg);
      }

      // 5. Atomic CAS update
      const updated = await this.repository.updateStatus(
        tx,
        command.mediaRef,
        command.eventRef,
        'HIDDEN',
        'PUBLISHED'
      );

      if (!updated) {
        const msg = 'Concurrent state modification detected';
        await this.recordDenial(tx, command, 'CONFLICT', msg, now);
        throw new MediaVisibilityError('CONFLICT', msg);
      }

      // 6. Audit record
      const auditEvent: MediaVisibilityAuditEvent = {
        id: randomUUID(),
        operationId: command.operationId,
        mediaRef: media.mediaRef,
        eventRef: command.eventRef,
        organizerRef: command.organizerRef,
        action: 'REPUBLISH_MEDIA',
        previousStatus: 'HIDDEN',
        newStatus: 'PUBLISHED',
        generation: updated.generation,
        revision: updated.revision,
        reason: command.reason,
        committedAt: now,
      };

      await this.repository.recordAudit(tx, auditEvent);
      if (this.auditSink) {
        await this.auditSink.recordAudit(auditEvent);
      }

      return {
        mediaRef: media.mediaRef,
        eventRef: command.eventRef,
        previousStatus: 'HIDDEN',
        newStatus: 'PUBLISHED',
        generation: updated.generation,
        revision: updated.revision,
        republishedAt: now,
      };
    });
  }

  private async recordDenial(
    tx: SqlTransaction,
    command: RepublishMediaCommand,
    code: MediaVisibilityDenialCode,
    reason: string,
    now: Date
  ) {
    const event: MediaVisibilityDenialAuditEvent = {
      id: randomUUID(),
      operationId: command.operationId,
      mediaRef: command.mediaRef,
      eventRef: command.eventRef,
      actorRef: command.organizerRef,
      action: 'REPUBLISH_MEDIA',
      code,
      reason,
      attemptedAt: now,
    };
    await this.repository.recordDenial(tx, event);
    if (this.auditSink) {
      await this.auditSink.recordDenial(event);
    }
  }
}
