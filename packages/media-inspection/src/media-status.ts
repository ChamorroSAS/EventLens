import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/job-queue';
import type { SafetyFact } from './contracts.js';

export type ActorRole = 'ORGANIZER' | 'GUEST';

export type ActorContext =
  | { role: 'ORGANIZER'; organizerRef: string }
  | { role: 'GUEST'; guestRef: string };

export type MediaStatusDenialCode =
  | 'MEDIA_NOT_FOUND'
  | 'ACCESS_DENIED'
  | 'BARRED_EVENT'
  | 'INVALID_ARGUMENT';

export class MediaStatusError extends Error {
  constructor(readonly code: MediaStatusDenialCode, message?: string) {
    super(message ?? code);
  }
}

export type SafetyOutcome = 'APPROVED' | 'INCONCLUSIVE' | 'DENIED' | 'PENDING';

export interface MediaSafetySummary {
  readonly outcome: SafetyOutcome;
}

export interface MediaCapabilities {
  readonly canRetry: boolean;
  readonly canDownloadOriginal: boolean;
  readonly canView: boolean;
  readonly canDelete: boolean;
}

export interface MediaObservableProgress {
  readonly phase?: string;
  readonly attempt?: number;
}

export interface MediaStatusResult {
  readonly mediaRef: string;
  readonly eventRef: string;
  readonly status: string;
  readonly revision: bigint;
  readonly generation: bigint;
  readonly safety: MediaSafetySummary;
  readonly capabilities: MediaCapabilities;
  readonly observableProgress?: MediaObservableProgress;
}

export interface QueryMediaStatusCommand {
  readonly mediaRef: string;
  readonly eventRef: string;
  readonly actor: ActorContext;
  readonly operationId?: string;
}

export interface EventStatusAuthorizer {
  assertAuthorized(
    tx: SqlTransaction,
    scope: { eventRef: string; actor: ActorContext }
  ): Promise<void>;
}

export interface MediaCatalogStatusRecord {
  mediaRef: string;
  eventRef: string;
  guestRef: string;
  generation: bigint;
  revision: bigint;
  status: string;
  jobId: string;
}

export interface MediaStatusRepository {
  queryStatus(
    tx: SqlTransaction,
    mediaRef: string
  ): Promise<MediaCatalogStatusRecord | null>;

  getSafetyFact(
    tx: SqlTransaction,
    mediaRef: string,
    generation: bigint
  ): Promise<SafetyFact | null>;

  getObservableJob(
    tx: SqlTransaction,
    jobId: string
  ): Promise<{ status: string; attempt: number } | null>;

  recordAudit(
    tx: SqlTransaction,
    params: {
      operationId?: string;
      mediaRef: string;
      eventRef: string;
      actorRole: ActorRole;
      actorRef: string;
      generation: bigint;
      status: string;
      safetyOutcome: SafetyOutcome;
    }
  ): Promise<void>;
}

export class PostgresMediaStatusRepository implements MediaStatusRepository {
  async queryStatus(
    tx: SqlTransaction,
    mediaRef: string
  ): Promise<MediaCatalogStatusRecord | null> {
    const rows = await tx.query<{
      media_ref: string;
      event_ref: string;
      guest_ref: string;
      generation: bigint;
      revision: bigint;
      status: string;
      job_id: string;
    }>(
      `SELECT media_ref, event_ref, guest_ref, generation, revision, status, job_id
       FROM media_catalog
       WHERE media_ref = $1`,
      mediaRef
    );

    if (!rows.length) return null;
    const r = rows[0];
    return {
      mediaRef: r.media_ref,
      eventRef: r.event_ref,
      guestRef: r.guest_ref,
      generation: r.generation,
      revision: r.revision,
      status: r.status,
      jobId: r.job_id,
    };
  }

  async getSafetyFact(
    tx: SqlTransaction,
    mediaRef: string,
    generation: bigint
  ): Promise<SafetyFact | null> {
    const rows = await tx.query<{ fact: SafetyFact }>(
      'SELECT fact FROM media_inspection WHERE media_ref = $1 AND generation = $2::bigint',
      mediaRef,
      generation
    );
    return rows[0]?.fact ?? null;
  }

  async getObservableJob(
    tx: SqlTransaction,
    jobId: string
  ): Promise<{ status: string; attempt: number } | null> {
    const rows = await tx.query<{ status: string; attempt: number }>(
      'SELECT status, attempt FROM job_queue WHERE id = $1::uuid',
      jobId
    );
    if (!rows.length) return null;
    return {
      status: rows[0].status,
      attempt: rows[0].attempt,
    };
  }

  async recordAudit(
    tx: SqlTransaction,
    params: {
      operationId?: string;
      mediaRef: string;
      eventRef: string;
      actorRole: ActorRole;
      actorRef: string;
      generation: bigint;
      status: string;
      safetyOutcome: SafetyOutcome;
    }
  ): Promise<void> {
    await tx.execute(
      `INSERT INTO media_status_query_audit(
         id, operation_id, media_ref, event_ref, actor_role, actor_ref,
         generation, status, safety_outcome, queried_at
       ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::bigint, $8, $9, clock_timestamp())`,
      randomUUID(),
      params.operationId ?? null,
      params.mediaRef,
      params.eventRef,
      params.actorRole,
      params.actorRef,
      params.generation,
      params.status,
      params.safetyOutcome
    );
  }
}

export class GetMediaStatusAndCapabilities {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly repository: MediaStatusRepository,
    private readonly authorizer: EventStatusAuthorizer
  ) {}

  async execute(command: QueryMediaStatusCommand): Promise<MediaStatusResult> {
    if (!command.mediaRef || !command.eventRef || !command.actor) {
      throw new MediaStatusError('INVALID_ARGUMENT');
    }

    const actorRef =
      command.actor.role === 'ORGANIZER'
        ? command.actor.organizerRef
        : command.actor.guestRef;

    if (!actorRef) {
      throw new MediaStatusError('INVALID_ARGUMENT');
    }

    return await this.transactions.run(async tx => {
      // 1. Authorize actor against event policy (checks BARRED_EVENT or organizer ownership)
      await this.authorizer.assertAuthorized(tx, {
        eventRef: command.eventRef,
        actor: command.actor,
      });

      // 2. Query media catalog
      const media = await this.repository.queryStatus(tx, command.mediaRef);
      if (!media || media.eventRef !== command.eventRef) {
        // Enforce non-enumeration: uniform error if nonexistent or belonging to another event
        throw new MediaStatusError('MEDIA_NOT_FOUND');
      }

      // Guest isolation: guest can only query their own uploads ("Mis aportes")
      if (command.actor.role === 'GUEST' && media.guestRef !== command.actor.guestRef) {
        throw new MediaStatusError('MEDIA_NOT_FOUND');
      }

      // 3. Inspect safety fact
      const safetyFact = await this.repository.getSafetyFact(tx, media.mediaRef, media.generation);
      const safetyOutcome: SafetyOutcome = safetyFact?.outcome ?? 'PENDING';

      // 4. Compute capabilities
      // canRetry: true only if ORGANIZER, status === 'PROCESSING_FAILED', not QUARANTINED, safety outcome not DENIED
      const canRetry =
        command.actor.role === 'ORGANIZER' &&
        media.status === 'PROCESSING_FAILED' &&
        safetyOutcome !== 'DENIED';

      // canDownloadOriginal (DEC-075):
      // Only if safety was APPROVED, not quarantined, and not deleted/trashed/rejected.
      const nonDownloadableStatuses = ['QUARANTINED', 'DELETED', 'TRASHED', 'REJECTED'];
      const canDownloadOriginal =
        safetyOutcome === 'APPROVED' &&
        !nonDownloadableStatuses.includes(media.status);

      // canView:
      const nonViewableStatuses = ['QUARANTINED', 'DELETED', 'REJECTED'];
      const canView =
        !nonViewableStatuses.includes(media.status) &&
        (command.actor.role === 'ORGANIZER' ||
          (command.actor.role === 'GUEST' &&
            (media.guestRef === command.actor.guestRef || media.status === 'PUBLISHED')));

      // canDelete:
      const canDelete =
        media.status !== 'DELETED' &&
        (command.actor.role === 'ORGANIZER' ||
          (command.actor.role === 'GUEST' && media.guestRef === command.actor.guestRef));

      // 5. Observable progress (only sanitized, non-sensitive job progress)
      let observableProgress: MediaObservableProgress | undefined;
      if (media.status === 'PROCESSING') {
        const job = await this.repository.getObservableJob(tx, media.jobId);
        if (job) {
          observableProgress = {
            phase: job.status,
            attempt: job.attempt,
          };
        }
      }

      // 6. Record audit
      await this.repository.recordAudit(tx, {
        operationId: command.operationId,
        mediaRef: media.mediaRef,
        eventRef: media.eventRef,
        actorRole: command.actor.role,
        actorRef,
        generation: media.generation,
        status: media.status,
        safetyOutcome,
      });

      return {
        mediaRef: media.mediaRef,
        eventRef: media.eventRef,
        status: media.status,
        revision: media.revision,
        generation: media.generation,
        safety: {
          outcome: safetyOutcome,
        },
        capabilities: {
          canRetry,
          canDownloadOriginal,
          canView,
          canDelete,
        },
        observableProgress,
      };
    });
  }
}
