import { randomUUID } from 'node:crypto';
import type {
  JobQueuePostgres,
  RecoveryAuthority,
  SqlTransaction,
  TransactionRunner
} from '@eventlens/job-queue';
import type { AdminActorContext } from '@eventlens/identity';

export type QuarantineReleaseDenialCode =
  | 'ORGANIZER_DENIED'
  | 'UNAUTHORIZED_ACTOR'
  | 'INVALID_GRANT'
  | 'MISSING_JUSTIFICATION'
  | 'MEDIA_NOT_FOUND'
  | 'MEDIA_NOT_QUARANTINED'
  | 'DISPOSITION_BARRED'
  | 'AUTHORITY_BARRED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_ARGUMENT';

export class QuarantineReleaseDeniedError extends Error {
  constructor(
    readonly code: QuarantineReleaseDenialCode,
    message?: string
  ) {
    super(message ?? code);
    this.name = 'QuarantineReleaseDeniedError';
  }
}

export interface AdminInterventionGrant {
  readonly grantId: string;
  readonly principalId: string;
  readonly action: 'RELEASE_QUARANTINE';
  readonly targetRef: string;
  readonly reason: string;
  readonly status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  readonly expiresAt?: Date;
}

export type QuarantineReleaseActor =
  | {
      readonly type: 'ADMIN_HUMAN';
      readonly actorContext: AdminActorContext;
      readonly grant: AdminInterventionGrant;
    }
  | {
      readonly type: 'SECURITY_AUTOMATION';
      readonly serviceId: string;
      readonly securityScope: string;
    }
  | {
      readonly type: 'ORGANIZER';
      readonly organizerRef: string;
    }
  | {
      readonly type: 'UNAUTHORIZED';
      readonly actorId?: string;
    };

export interface QuarantineReleaseCommand {
  readonly mediaRef: string;
  readonly operationId: string;
  readonly justification: string;
  readonly actor: QuarantineReleaseActor;
  readonly queueName?: string;
}

export interface QuarantineReleaseReceipt {
  readonly operationId: string;
  readonly mediaRef: string;
  readonly previousGeneration: bigint;
  readonly newGeneration: bigint;
  readonly previousRevision: bigint;
  readonly newRevision: bigint;
  readonly jobId: string;
  readonly cycleId: string;
  readonly actorType: 'ADMIN_HUMAN' | 'SECURITY_AUTOMATION';
  readonly actorId: string;
  readonly grantId?: string;
  readonly justification: string;
  readonly wasExisting: boolean;
  readonly committedAt: Date;
}

export interface NotificationIntentRecord {
  readonly id: string;
  readonly operationId: string;
  readonly mediaRef: string;
  readonly eventRef: string;
  readonly organizerRef: string;
  readonly notificationType: string;
  readonly dedupKey: string;
  readonly createdAt: Date;
}

export interface QuarantineReleaseNotificationSink {
  record(intent: NotificationIntentRecord): Promise<void>;
}

interface MediaCatalogRow {
  media_ref: string;
  event_ref: string;
  guest_ref: string;
  generation: string | bigint;
  revision: string | bigint;
  status: string;
  original: unknown;
  job_id: string;
}

interface ReceiptRow {
  operation_id: string;
  media_ref: string;
  previous_generation: string | bigint;
  new_generation: string | bigint;
  previous_revision: string | bigint;
  new_revision: string | bigint;
  job_id: string;
  cycle_id: string;
  actor_type: string;
  actor_id: string;
  grant_id: string | null;
  justification: string;
  committed_at: Date;
}

interface ActiveCycleRow {
  cycle_id: string;
  job_id: string;
}

/**
 * Service governing quarantine release under authorized administrative intervention
 * or authorized security automation (EL-TK-041, DEC-038, DEC-064, ARCH-013, AQR-001, EL-TK-187).
 *
 * Enforces:
 * 1. Organizers are strictly forbidden from releasing media in quarantine (ORGANIZER_DENIED).
 * 2. Human administrators must present a valid AdminActorContext (from EL-TK-044) and an active
 *    MOD-007 intervention grant matching principal, mediaRef, and action.
 * 3. Security automation uses explicit service identity and authorized scope; no human session.
 * 4. Must provide non-empty justification for audited release.
 * 5. Media must be currently in QUARANTINED status and have NO active purge disposition (DISPOSITION_BARRED).
 * 6. Creates a new audited generation (generation + 1) preserving inspection history, advances revision,
 *    and enqueues MEDIA_INSPECTION job for re-examination (does not mark media PUBLISHED/safe).
 * 7. Idempotent replay by operationId returns existing receipt without duplicating jobs (unless disposition barred).
 * 8. Records secret-free and media-free audit records, and durable NotificationIntent for EL-EP-013.
 */
export class QuarantineReleaseService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly queue: Pick<JobQueuePostgres, 'publish'>,
    private readonly authority?: Pick<RecoveryAuthority, 'acquire'> & { barred?: (ref: string) => boolean },
    private readonly notificationSink?: QuarantineReleaseNotificationSink
  ) {}

  private extractActorInfo(actor: QuarantineReleaseActor): {
    actorType: 'ADMIN_HUMAN' | 'SECURITY_AUTOMATION';
    actorId: string;
    grantId?: string;
  } {
    if (actor.type === 'ADMIN_HUMAN') {
      return {
        actorType: 'ADMIN_HUMAN',
        actorId: actor.actorContext.principalId,
        grantId: actor.grant.grantId
      };
    }
    if (actor.type === 'SECURITY_AUTOMATION') {
      return {
        actorType: 'SECURITY_AUTOMATION',
        actorId: actor.serviceId
      };
    }
    throw new QuarantineReleaseDeniedError('UNAUTHORIZED_ACTOR', 'Actor is not authorized');
  }

  private validateActorAndJustification(command: QuarantineReleaseCommand): void {
    if (!command.mediaRef || command.mediaRef.trim().length === 0) {
      throw new QuarantineReleaseDeniedError('INVALID_ARGUMENT', 'mediaRef is required');
    }
    if (!command.operationId || command.operationId.trim().length === 0) {
      throw new QuarantineReleaseDeniedError('INVALID_ARGUMENT', 'operationId is required');
    }
    if (!command.justification || command.justification.trim().length === 0) {
      throw new QuarantineReleaseDeniedError('MISSING_JUSTIFICATION', 'Non-empty justification is required to release quarantine');
    }

    const { actor } = command;

    if (actor.type === 'ORGANIZER') {
      throw new QuarantineReleaseDeniedError('ORGANIZER_DENIED', 'Organizers are strictly forbidden from releasing quarantined media');
    }

    if (actor.type === 'UNAUTHORIZED') {
      throw new QuarantineReleaseDeniedError('UNAUTHORIZED_ACTOR', 'Actor is not authorized');
    }

    if (actor.type === 'ADMIN_HUMAN') {
      if (!actor.actorContext || actor.actorContext.actorType !== 'ADMIN_HUMAN') {
        throw new QuarantineReleaseDeniedError('UNAUTHORIZED_ACTOR', 'Valid AdminActorContext is required');
      }
      if (!actor.grant) {
        throw new QuarantineReleaseDeniedError('INVALID_GRANT', 'MOD-007 intervention grant is required');
      }
      if (actor.grant.action !== 'RELEASE_QUARANTINE') {
        throw new QuarantineReleaseDeniedError('INVALID_GRANT', 'Grant action must be RELEASE_QUARANTINE');
      }
      if (actor.grant.principalId !== actor.actorContext.principalId) {
        throw new QuarantineReleaseDeniedError('INVALID_GRANT', 'Grant principalId mismatch with actorContext');
      }
      if (actor.grant.targetRef !== command.mediaRef) {
        throw new QuarantineReleaseDeniedError('INVALID_GRANT', 'Grant targetRef mismatch with mediaRef');
      }
      if (actor.grant.status !== 'ACTIVE') {
        throw new QuarantineReleaseDeniedError('INVALID_GRANT', `Grant is not ACTIVE (${actor.grant.status})`);
      }
      if (actor.grant.expiresAt && actor.grant.expiresAt.getTime() <= Date.now()) {
        throw new QuarantineReleaseDeniedError('INVALID_GRANT', 'Grant has expired');
      }
      return;
    }

    if (actor.type === 'SECURITY_AUTOMATION') {
      if (!actor.serviceId || actor.serviceId.trim().length === 0) {
        throw new QuarantineReleaseDeniedError('UNAUTHORIZED_ACTOR', 'Security automation serviceId is required');
      }
      if (!actor.securityScope || actor.securityScope.trim().length === 0) {
        throw new QuarantineReleaseDeniedError('UNAUTHORIZED_ACTOR', 'Security automation securityScope is required');
      }
      return;
    }

    throw new QuarantineReleaseDeniedError('UNAUTHORIZED_ACTOR', 'Unsupported actor type');
  }

  private async recordDenial(command: QuarantineReleaseCommand, reason: string): Promise<void> {
    try {
      const actorType = command.actor?.type ?? 'UNKNOWN';
      let actorId = 'UNKNOWN';
      if (command.actor?.type === 'ADMIN_HUMAN') actorId = command.actor.actorContext?.principalId ?? 'UNKNOWN';
      else if (command.actor?.type === 'SECURITY_AUTOMATION') actorId = command.actor.serviceId ?? 'UNKNOWN';
      else if (command.actor?.type === 'ORGANIZER') actorId = command.actor.organizerRef ?? 'UNKNOWN';
      else if (command.actor?.type === 'UNAUTHORIZED') actorId = command.actor.actorId ?? 'UNKNOWN';

      await this.transactions.run(async (tx) => {
        await tx.execute(
          `INSERT INTO media_quarantine_release_denial_audit (
             id, operation_id, media_ref, actor_type, actor_id, reason, attempted_at
           ) VALUES ($1::uuid, $2, $3, $4, $5, $6, clock_timestamp())`,
          randomUUID(),
          command.operationId,
          command.mediaRef,
          actorType,
          actorId,
          reason
        );
      });
    } catch {
      // Do not mask original error if recording denial fails
    }
  }

  /**
   * Executes quarantine release. Creates a new generation, resets media to UPLOADED,
   * and enqueues MEDIA_INSPECTION so workers re-examine safety before transforming or publishing.
   */
  async execute(command: QuarantineReleaseCommand): Promise<QuarantineReleaseReceipt> {
    try {
      this.validateActorAndJustification(command);

      if (this.authority?.barred?.(command.mediaRef)) {
        throw new QuarantineReleaseDeniedError('AUTHORITY_BARRED', 'Media resource is restricted by recovery authority');
      }

      const { actorType, actorId, grantId } = this.extractActorInfo(command.actor);

      return await this.transactions.run(async (tx) => {
        // 1. Lock media catalog row and check status under lock
        const mediaRows = await tx.query<MediaCatalogRow>(
          `SELECT media_ref, event_ref, guest_ref, generation, revision, status, original, job_id
           FROM media_catalog
           WHERE media_ref = $1
           FOR UPDATE`,
          command.mediaRef
        );

        if (mediaRows.length === 0) {
          throw new QuarantineReleaseDeniedError('MEDIA_NOT_FOUND', 'Media not found');
        }

        const media = mediaRows[0];

        // 2. Enforce disposition barrier (EL-TK-187 / DEC-109/110 / ARCH-006):
        // Active purge disposition strictly bars release, replay, and re-processing.
        const purgeIntents = await tx.query<{ id: string; status: string }>(
          `SELECT id, status
           FROM media_quarantine_purge_intent
           WHERE media_ref = $1 AND status IN ('PENDING', 'CONFIRMED')`,
          command.mediaRef
        );

        if (purgeIntents.length > 0) {
          throw new QuarantineReleaseDeniedError(
            'DISPOSITION_BARRED',
            `Media '${command.mediaRef}' has an active quarantine purge disposition and cannot be released or replayed`
          );
        }

        if (media.status !== 'QUARANTINED') {
          throw new QuarantineReleaseDeniedError(
            'MEDIA_NOT_QUARANTINED',
            `Media status is ${media.status}; only QUARANTINED media can be released`
          );
        }

        // 3. Check idempotency by operation_id
        const existingReceipts = await tx.query<ReceiptRow>(
          `SELECT operation_id, media_ref, previous_generation, new_generation,
                  previous_revision, new_revision, job_id, cycle_id, actor_type,
                  actor_id, grant_id, justification, committed_at
           FROM media_quarantine_release_receipt
           WHERE operation_id = $1`,
          command.operationId
        );

        if (existingReceipts.length > 0) {
          const r = existingReceipts[0];
          if (r.media_ref !== command.mediaRef || r.actor_id !== actorId) {
            throw new QuarantineReleaseDeniedError('IDEMPOTENCY_CONFLICT', 'Conflicting parameters for existing operationId');
          }
          return {
            operationId: r.operation_id,
            mediaRef: r.media_ref,
            previousGeneration: BigInt(r.previous_generation),
            newGeneration: BigInt(r.new_generation),
            previousRevision: BigInt(r.previous_revision),
            newRevision: BigInt(r.new_revision),
            jobId: r.job_id,
            cycleId: r.cycle_id,
            actorType: r.actor_type as 'ADMIN_HUMAN' | 'SECURITY_AUTOMATION',
            actorId: r.actor_id,
            grantId: r.grant_id ?? undefined,
            justification: r.justification,
            wasExisting: true,
            committedAt: r.committed_at
          };
        }

        // 4. Check for existing active processing cycle
        const activeCycles = await tx.query<ActiveCycleRow>(
          `SELECT cycle_id, job_id
           FROM media_processing_cycle
           WHERE media_ref = $1 AND status = 'ACTIVE'
           FOR UPDATE`,
          command.mediaRef
        );

        if (activeCycles.length > 0) {
          const activeCycle = activeCycles[0];
          const activeJobs = await tx.query<{ status: string }>(
            `SELECT status FROM job_queue WHERE id = $1::uuid`,
            activeCycle.job_id
          );
          if (activeJobs.length > 0 && ['PENDING', 'PROCESSING', 'RETRYING'].includes(activeJobs[0].status)) {
            // Already actively executing; return existing state without duplicate jobs
            const previousReceipt = await tx.query<ReceiptRow>(
              `SELECT operation_id, media_ref, previous_generation, new_generation,
                      previous_revision, new_revision, job_id, cycle_id, actor_type,
                      actor_id, grant_id, justification, committed_at
               FROM media_quarantine_release_receipt
               WHERE cycle_id = $1`,
              activeCycle.cycle_id
            );
            if (previousReceipt.length > 0) {
              const r = previousReceipt[0];
              return {
                operationId: r.operation_id,
                mediaRef: r.media_ref,
                previousGeneration: BigInt(r.previous_generation),
                newGeneration: BigInt(r.new_generation),
                previousRevision: BigInt(r.previous_revision),
                newRevision: BigInt(r.new_revision),
                jobId: r.job_id,
                cycleId: r.cycle_id,
                actorType: r.actor_type as 'ADMIN_HUMAN' | 'SECURITY_AUTOMATION',
                actorId: r.actor_id,
                grantId: r.grant_id ?? undefined,
                justification: r.justification,
                wasExisting: true,
                committedAt: r.committed_at
              };
            }
          }
        }

        // 5. Advance generation and revision monotonically
        const prevGen = BigInt(media.generation);
        const prevRev = BigInt(media.revision);
        const newGen = prevGen + 1n;
        const newRev = prevRev + 1n;

        // 6. Enqueue MEDIA_INSPECTION job for new generation (re-inspection is mandatory)
        const cycleId = 'cycle:' + randomUUID();
        const queueName = command.queueName ?? 'media-inspection';

        const newJobId = await this.queue.publish(tx, {
          type: 'MEDIA_INSPECTION',
          handlerVersion: '1',
          resourceRef: command.mediaRef,
          generation: newGen,
          queue: queueName,
          dedupKey: cycleId,
          priority: 1,
          payload: null,
          availableAt: new Date(0)
        });

        // 7. Update media_catalog: status set to 'UPLOADED' so worker transitions to 'PROCESSING'
        await tx.execute(
          `UPDATE media_catalog
           SET status = 'UPLOADED', generation = $1, revision = $2, job_id = $3::uuid
           WHERE media_ref = $4`,
          newGen.toString(),
          newRev.toString(),
          newJobId,
          command.mediaRef
        );

        // 8. Terminate any prior active cycle for this media
        await tx.execute(
          `UPDATE media_processing_cycle
           SET status = 'TERMINATED'
           WHERE media_ref = $1 AND status = 'ACTIVE'`,
          command.mediaRef
        );

        // 9. Create new media_processing_cycle
        const cycleNumRows = await tx.query<{ next_num: number }>(
          `SELECT COALESCE(MAX(cycle_number), 0) + 1 AS next_num
           FROM media_processing_cycle
           WHERE media_ref = $1`,
          command.mediaRef
        );
        const cycleNumber = cycleNumRows[0].next_num;

        await tx.execute(
          `INSERT INTO media_processing_cycle (
             cycle_id, media_ref, cycle_number, event_ref, organizer_ref,
             job_id, job_type, safety_outcome, status, operation_id, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6::uuid, 'MEDIA_INSPECTION', 'PENDING', 'ACTIVE', $7, clock_timestamp())`,
          cycleId,
          command.mediaRef,
          cycleNumber,
          media.event_ref,
          media.guest_ref,
          newJobId,
          command.operationId
        );

        // 10. Record cycle audit
        await tx.execute(
          `INSERT INTO media_cycle_audit (
             id, operation_id, cycle_id, media_ref, cycle_number, event_ref,
             organizer_ref, job_id, job_type, safety_outcome, action, actor, committed_at
           ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::uuid, 'MEDIA_INSPECTION', 'PENDING', 'CYCLE_CREATED', $9, clock_timestamp())`,
          randomUUID(),
          command.operationId,
          cycleId,
          command.mediaRef,
          cycleNumber,
          media.event_ref,
          media.guest_ref,
          newJobId,
          actorId
        );

        // 11. Persist quarantine release receipt
        const now = new Date();
        await tx.execute(
          `INSERT INTO media_quarantine_release_receipt (
             operation_id, media_ref, previous_generation, new_generation,
             previous_revision, new_revision, job_id, cycle_id, actor_type,
             actor_id, grant_id, justification, committed_at
           ) VALUES ($1, $2, $3::bigint, $4::bigint, $5::bigint, $6::bigint, $7::uuid, $8, $9, $10, $11, $12, $13)`,
          command.operationId,
          command.mediaRef,
          prevGen.toString(),
          newGen.toString(),
          prevRev.toString(),
          newRev.toString(),
          newJobId,
          cycleId,
          actorType,
          actorId,
          grantId ?? null,
          command.justification,
          now
        );

        // 12. Persist quarantine release audit
        await tx.execute(
          `INSERT INTO media_quarantine_release_audit (
             id, operation_id, media_ref, generation, actor_type, actor_id,
             grant_id, justification, previous_status, transition, committed_at
           ) VALUES ($1::uuid, $2, $3, $4::bigint, $5, $6, $7, $8, 'QUARANTINED', 'RELEASED_FOR_INSPECTION', $9)`,
          randomUUID(),
          command.operationId,
          command.mediaRef,
          newGen.toString(),
          actorType,
          actorId,
          grantId ?? null,
          command.justification,
          now
        );

        // 13. Record durable NotificationIntent for EL-EP-013
        const intentId = randomUUID();
        const dedupKey = `notification:quarantine-release:${command.mediaRef}:${newGen.toString()}`;
        await tx.execute(
          `INSERT INTO media_quarantine_notification_intent (
             id, operation_id, media_ref, event_ref, organizer_ref,
             notification_type, dedup_key, created_at
           ) VALUES ($1::uuid, $2, $3, $4, $5, 'ADMINISTRATIVE_INTERVENTION_QUARANTINE_RELEASE', $6, $7)
           ON CONFLICT (dedup_key) DO NOTHING`,
          intentId,
          command.operationId,
          command.mediaRef,
          media.event_ref,
          media.guest_ref,
          dedupKey,
          now
        );

        if (this.notificationSink) {
          try {
            await this.notificationSink.record({
              id: intentId,
              operationId: command.operationId,
              mediaRef: command.mediaRef,
              eventRef: media.event_ref,
              organizerRef: media.guest_ref,
              notificationType: 'ADMINISTRATIVE_INTERVENTION_QUARANTINE_RELEASE',
              dedupKey,
              createdAt: now
            });
          } catch {
            // Sink delivery failure must not abort durable transaction
          }
        }

        return {
          operationId: command.operationId,
          mediaRef: command.mediaRef,
          previousGeneration: prevGen,
          newGeneration: newGen,
          previousRevision: prevRev,
          newRevision: newRev,
          jobId: newJobId,
          cycleId,
          actorType,
          actorId,
          grantId: grantId ?? undefined,
          justification: command.justification,
          wasExisting: false,
          committedAt: now
        };
      });
    } catch (error) {
      if (
        error instanceof QuarantineReleaseDeniedError &&
        error.code !== 'IDEMPOTENCY_CONFLICT' &&
        error.code !== 'INVALID_ARGUMENT'
      ) {
        await this.recordDenial(command, error.code);
      }
      throw error;
    }
  }
}
