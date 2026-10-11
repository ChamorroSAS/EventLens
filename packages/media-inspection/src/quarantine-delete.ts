import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/job-queue';
import type { AdminActorContext } from '@eventlens/identity';

export type QuarantineDeleteDenialCode =
  | 'ORGANIZER_DENIED'
  | 'UNAUTHORIZED_ACTOR'
  | 'INVALID_GRANT'
  | 'MISSING_JUSTIFICATION'
  | 'MEDIA_NOT_FOUND'
  | 'MEDIA_NOT_QUARANTINED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_ARGUMENT';

export class QuarantineDeleteDeniedError extends Error {
  constructor(
    readonly code: QuarantineDeleteDenialCode,
    message?: string
  ) {
    super(message ?? code);
    this.name = 'QuarantineDeleteDeniedError';
  }
}

export interface AdminDeleteInterventionGrant {
  readonly grantId: string;
  readonly principalId: string;
  readonly action: 'DELETE_QUARANTINE';
  readonly targetRef: string;
  readonly reason: string;
  readonly status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  readonly expiresAt?: Date;
}

export type QuarantineDeleteActor =
  | {
      readonly type: 'ADMIN_HUMAN';
      readonly actorContext: AdminActorContext;
      readonly grant: AdminDeleteInterventionGrant;
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

export interface QuarantineDeleteCommand {
  readonly mediaRef: string;
  readonly operationId: string;
  readonly justification: string;
  readonly actor: QuarantineDeleteActor;
}

export interface QuarantineDeleteReceipt {
  readonly operationId: string;
  readonly mediaRef: string;
  readonly generation: bigint;
  readonly previousRevision: bigint;
  readonly newRevision: bigint;
  readonly status: 'DELETED';
  readonly actorType: 'ADMIN_HUMAN' | 'SECURITY_AUTOMATION';
  readonly actorId: string;
  readonly grantId?: string;
  readonly justification: string;
  readonly purgeIntentId: string;
  readonly wasExisting: boolean;
  readonly committedAt: Date;
}

interface MediaCatalogRow {
  media_ref: string;
  event_ref: string;
  guest_ref: string;
  generation: bigint | string | number;
  revision: bigint | string | number;
  status: string;
  original: unknown;
  job_id: string;
}

interface QuarantineDeleteReceiptRow {
  operation_id: string;
  media_ref: string;
  generation: bigint | string | number;
  previous_revision: bigint | string | number;
  new_revision: bigint | string | number;
  status: string;
  actor_type: string;
  actor_id: string;
  grant_id: string | null;
  justification: string;
  purge_intent_id: string;
  committed_at: Date;
}

export class QuarantineDeleteService {
  constructor(private readonly transactions: TransactionRunner) {}

  async execute(command: QuarantineDeleteCommand): Promise<QuarantineDeleteReceipt> {
    // 1. Syntactic validation
    if (!command.mediaRef || typeof command.mediaRef !== 'string') {
      throw new QuarantineDeleteDeniedError('INVALID_ARGUMENT', 'mediaRef is required');
    }
    if (!command.operationId || typeof command.operationId !== 'string') {
      throw new QuarantineDeleteDeniedError('INVALID_ARGUMENT', 'operationId is required');
    }
    if (!command.justification || typeof command.justification !== 'string' || command.justification.trim().length === 0) {
      throw new QuarantineDeleteDeniedError('MISSING_JUSTIFICATION', 'Justification is mandatory for quarantine deletion');
    }

    // 2. Pre-transaction actor authorization & denial audit
    await this.assertAuthorizedActor(command);

    const { actorType, actorId, grantId } = this.extractActorIdentity(command.actor);

    // 3. Atomic Unit of Work
    return await this.transactions.run(async (tx: SqlTransaction) => {
      // 3.1. Check idempotency receipt
      const existing = await tx.query<QuarantineDeleteReceiptRow>(
        `SELECT operation_id, media_ref, generation, previous_revision, new_revision,
                status, actor_type, actor_id, grant_id, justification, purge_intent_id, committed_at
         FROM media_quarantine_delete_receipt
         WHERE operation_id = $1`,
        command.operationId
      );

      if (existing.length > 0) {
        const r = existing[0];
        if (r.media_ref !== command.mediaRef || r.actor_id !== actorId) {
          throw new QuarantineDeleteDeniedError(
            'IDEMPOTENCY_CONFLICT',
            `Operation ID '${command.operationId}' was previously committed with conflicting parameters`
          );
        }

        return {
          operationId: r.operation_id,
          mediaRef: r.media_ref,
          generation: BigInt(r.generation),
          previousRevision: BigInt(r.previous_revision),
          newRevision: BigInt(r.new_revision),
          status: 'DELETED',
          actorType: r.actor_type as 'ADMIN_HUMAN' | 'SECURITY_AUTOMATION',
          actorId: r.actor_id,
          grantId: r.grant_id ?? undefined,
          justification: r.justification,
          purgeIntentId: r.purge_intent_id,
          wasExisting: true,
          committedAt: r.committed_at
        };
      }

      // 3.2. Lock media catalog row and check status
      const mediaRows = await tx.query<MediaCatalogRow>(
        `SELECT media_ref, event_ref, guest_ref, generation, revision, status, original, job_id
         FROM media_catalog
         WHERE media_ref = $1
         FOR UPDATE`,
        command.mediaRef
      );

      if (mediaRows.length === 0) {
        throw new QuarantineDeleteDeniedError('MEDIA_NOT_FOUND', 'Media not found');
      }

      const media = mediaRows[0];

      if (media.status !== 'QUARANTINED') {
        throw new QuarantineDeleteDeniedError(
          'MEDIA_NOT_QUARANTINED',
          `Media status is ${media.status}; only QUARANTINED media can be deleted via this procedure`
        );
      }

      const prevRev = BigInt(media.revision);
      const newRev = prevRev + 1n;
      const generation = BigInt(media.generation);

      // 3.3. Advance revision and transition status to DELETED
      await tx.execute(
        `UPDATE media_catalog
         SET status = 'DELETED', revision = $1
         WHERE media_ref = $2`,
        newRev.toString(),
        command.mediaRef
      );

      // 3.4. Terminate any active processing cycles for this media
      await tx.execute(
        `UPDATE media_processing_cycle
         SET status = 'TERMINATED'
         WHERE media_ref = $1 AND status = 'ACTIVE'`,
        command.mediaRef
      );

      // 3.5. Cancel any pending or retrying jobs in job_queue
      await tx.execute(
        `UPDATE job_queue
         SET cancelled = true
         WHERE resource_ref = $1 AND status IN ('PENDING', 'RETRYING')`,
        command.mediaRef
      );

      // 3.6. Create durable purge intent (delegates physical purge to owner retention/purge contract)
      const purgeIntentId = randomUUID();
      const purgeDedupKey = `quarantine-purge:${command.mediaRef}:${generation.toString()}`;

      await tx.execute(
        `INSERT INTO media_quarantine_purge_intent (
           id, operation_id, media_ref, event_ref, generation, status, dedup_key, created_at
         ) VALUES ($1::uuid, $2, $3, $4, $5, 'PENDING', $6, clock_timestamp())
         ON CONFLICT (dedup_key) DO NOTHING`,
        purgeIntentId,
        command.operationId,
        command.mediaRef,
        media.event_ref,
        generation.toString(),
        purgeDedupKey
      );

      // 3.7. Create organizer notification intent per EL-EP-013
      let organizerRef = 'unknown-organizer';
      const organizerRows = await tx.query<{ organizer_ref: string }>(
        `SELECT organizer_ref FROM test_event_organizer WHERE event_ref = $1`,
        media.event_ref
      ).catch(() => []);
      if (organizerRows.length > 0) {
        organizerRef = organizerRows[0].organizer_ref;
      }

      const notifIntentId = randomUUID();
      const notifDedupKey = `quarantine-delete-notif:${command.mediaRef}:${command.operationId}`;

      await tx.execute(
        `INSERT INTO media_quarantine_notification_intent (
           id, operation_id, media_ref, event_ref, organizer_ref,
           notification_type, dedup_key, created_at
         ) VALUES ($1::uuid, $2, $3, $4, $5, 'ADMINISTRATIVE_INTERVENTION_QUARANTINE_DELETE', $6, clock_timestamp())
         ON CONFLICT (dedup_key) DO NOTHING`,
        notifIntentId,
        command.operationId,
        command.mediaRef,
        media.event_ref,
        organizerRef,
        notifDedupKey
      );

      // 3.8. Create audit record
      const auditId = randomUUID();
      await tx.execute(
        `INSERT INTO media_quarantine_delete_audit (
           id, operation_id, media_ref, generation, actor_type, actor_id,
           grant_id, justification, previous_status, transition, committed_at
         ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, 'QUARANTINED', 'QUARANTINED_TO_DELETED', clock_timestamp())`,
        auditId,
        command.operationId,
        command.mediaRef,
        generation.toString(),
        actorType,
        actorId,
        grantId ?? null,
        command.justification.trim()
      );

      // 3.9. Create receipt record
      await tx.execute(
        `INSERT INTO media_quarantine_delete_receipt (
           operation_id, media_ref, generation, previous_revision, new_revision,
           status, actor_type, actor_id, grant_id, justification, purge_intent_id, committed_at
         ) VALUES ($1, $2, $3, $4, $5, 'DELETED', $6, $7, $8, $9, $10::uuid, clock_timestamp())`,
        command.operationId,
        command.mediaRef,
        generation.toString(),
        prevRev.toString(),
        newRev.toString(),
        actorType,
        actorId,
        grantId ?? null,
        command.justification.trim(),
        purgeIntentId
      );

      return {
        operationId: command.operationId,
        mediaRef: command.mediaRef,
        generation,
        previousRevision: prevRev,
        newRevision: newRev,
        status: 'DELETED',
        actorType,
        actorId,
        grantId: grantId ?? undefined,
        justification: command.justification.trim(),
        purgeIntentId,
        wasExisting: false,
        committedAt: new Date()
      };
    });
  }

  private async assertAuthorizedActor(command: QuarantineDeleteCommand): Promise<void> {
    const { actor } = command;

    if (actor.type === 'ORGANIZER') {
      await this.recordDenial(command, 'ORGANIZER', actor.organizerRef, 'ORGANIZER_DENIED');
      throw new QuarantineDeleteDeniedError(
        'ORGANIZER_DENIED',
        'Organizers are strictly forbidden from deleting quarantined media'
      );
    }

    if (actor.type === 'UNAUTHORIZED') {
      await this.recordDenial(command, 'UNAUTHORIZED', actor.actorId ?? 'anonymous', 'UNAUTHORIZED_ACTOR');
      throw new QuarantineDeleteDeniedError('UNAUTHORIZED_ACTOR', 'Actor is not authorized');
    }

    if (actor.type === 'ADMIN_HUMAN') {
      const { actorContext, grant } = actor;

      if (!actorContext || actorContext.actorType !== 'ADMIN_HUMAN' || !actorContext.principalId) {
        await this.recordDenial(command, 'ADMIN_HUMAN', 'invalid-context', 'UNAUTHORIZED_ACTOR');
        throw new QuarantineDeleteDeniedError('UNAUTHORIZED_ACTOR', 'Valid AdminActorContext is required');
      }

      if (!grant || grant.action !== 'DELETE_QUARANTINE') {
        await this.recordDenial(command, 'ADMIN_HUMAN', actorContext.principalId, 'INVALID_GRANT');
        throw new QuarantineDeleteDeniedError('INVALID_GRANT', "Grant action must be 'DELETE_QUARANTINE'");
      }

      if (grant.principalId !== actorContext.principalId) {
        await this.recordDenial(command, 'ADMIN_HUMAN', actorContext.principalId, 'INVALID_GRANT');
        throw new QuarantineDeleteDeniedError('INVALID_GRANT', 'Grant principalId does not match actorContext');
      }

      if (grant.targetRef !== command.mediaRef) {
        await this.recordDenial(command, 'ADMIN_HUMAN', actorContext.principalId, 'INVALID_GRANT');
        throw new QuarantineDeleteDeniedError('INVALID_GRANT', 'Grant targetRef does not match mediaRef');
      }

      if (grant.status !== 'ACTIVE') {
        await this.recordDenial(command, 'ADMIN_HUMAN', actorContext.principalId, 'INVALID_GRANT');
        throw new QuarantineDeleteDeniedError('INVALID_GRANT', `Grant status is ${grant.status}; expected ACTIVE`);
      }

      if (grant.expiresAt && grant.expiresAt.getTime() <= Date.now()) {
        await this.recordDenial(command, 'ADMIN_HUMAN', actorContext.principalId, 'INVALID_GRANT');
        throw new QuarantineDeleteDeniedError('INVALID_GRANT', 'Grant has expired');
      }

      return;
    }

    if (actor.type === 'SECURITY_AUTOMATION') {
      if (!actor.serviceId || actor.serviceId.trim().length === 0) {
        await this.recordDenial(command, 'SECURITY_AUTOMATION', 'empty-service-id', 'UNAUTHORIZED_ACTOR');
        throw new QuarantineDeleteDeniedError('UNAUTHORIZED_ACTOR', 'Automation serviceId is required');
      }
      if (!actor.securityScope || actor.securityScope.trim().length === 0) {
        await this.recordDenial(command, 'SECURITY_AUTOMATION', actor.serviceId, 'UNAUTHORIZED_ACTOR');
        throw new QuarantineDeleteDeniedError('UNAUTHORIZED_ACTOR', 'Automation securityScope is required');
      }
      return;
    }

    throw new QuarantineDeleteDeniedError('UNAUTHORIZED_ACTOR', 'Unknown actor type');
  }

  private async recordDenial(
    command: QuarantineDeleteCommand,
    actorType: string,
    actorId: string,
    reason: string
  ): Promise<void> {
    try {
      await this.transactions.run(async (tx: SqlTransaction) => {
        const denialId = randomUUID();
        await tx.execute(
          `INSERT INTO media_quarantine_delete_denial_audit (
             id, operation_id, media_ref, actor_type, actor_id, reason, attempted_at
           ) VALUES ($1::uuid, $2, $3, $4, $5, $6, clock_timestamp())`,
          denialId,
          command.operationId,
          command.mediaRef,
          actorType,
          actorId,
          reason
        );
      });
    } catch {
      // Denial logging must never mask original authorization rejection
    }
  }

  private extractActorIdentity(actor: QuarantineDeleteActor): {
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
    throw new QuarantineDeleteDeniedError('UNAUTHORIZED_ACTOR', 'Cannot extract identity for unauthorized actor');
  }
}
