import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  JobQueuePostgres,
  LocalSlots,
  PrismaTransactions,
  createPrismaClient,
  type RecoveryAuthority,
  type SqlTransaction
} from '@eventlens/job-queue';
import {
  QuarantineReleaseService,
  QuarantineReleaseDeniedError,
  type AdminInterventionGrant
} from '../src/quarantine-release.js';
import type { AdminActorContext } from '@eventlens/identity';

const client = createPrismaClient(process.env.DATABASE_URL!);
const transactions = new PrismaTransactions(client, 5000);

class Authority implements RecoveryAuthority {
  epoch = 'quarantine-epoch-1';
  reconciled = true;
  available = true;
  barred = false;
  async acquire() {
    if (!this.reconciled || !this.available || this.barred) throw Error('AUTHORITY_UNAVAILABLE');
    const epoch = this.epoch;
    return {
      epoch,
      assertCurrent: () => {
        if (!this.reconciled || !this.available || this.barred || epoch !== this.epoch) {
          throw Error('AUTHORITY_UNAVAILABLE');
        }
      },
      async release() {}
    };
  }
}

async function prepareQuarantinedMedia(options: {
  status?: string;
  generation?: bigint;
  revision?: bigint;
} = {}) {
  const authority = new Authority();
  const slots = new LocalSlots(2);
  const eventRef = 'event:' + randomUUID();
  const organizerRef = 'organizer:' + randomUUID();
  const guestRef = 'guest:' + randomUUID();
  const mediaRef = 'media:' + randomUUID();
  const queueName = 'media-quar-' + randomUUID();

  const policy = {
    async lockAndAuthorize(tx: SqlTransaction, resourceRef: string, generation: bigint) {
      const rows = await tx.query<{ generation: bigint }>(
        'SELECT generation FROM media_catalog WHERE media_ref=$1 FOR UPDATE',
        resourceRef
      );
      return rows.length > 0 && rows[0].generation === generation;
    }
  };

  const queue = new JobQueuePostgres(transactions, authority, policy, slots, { candidateScanLimit: 16 });

  const initialJobId = await transactions.run(tx =>
    queue.publish(tx, {
      type: 'MEDIA_INSPECTION',
      handlerVersion: '1',
      resourceRef: mediaRef,
      generation: options.generation ?? 1n,
      queue: queueName,
      dedupKey: 'initial:' + randomUUID(),
      priority: 1,
      payload: null,
      availableAt: new Date(0)
    })
  );

  const original = {
    namespace: 'fixture-private',
    key: 'immutable-original/' + randomUUID(),
    immutableVersion: randomUUID(),
    sha256: 'a'.repeat(64),
    sizeBytes: 2048
  };

  const status = options.status ?? 'QUARANTINED';
  const gen = options.generation ?? 1n;
  const rev = options.revision ?? 1n;

  await transactions.run(async tx => {
    const intent = randomUUID();
    await tx.execute(
      'INSERT INTO media_acceptance_intent VALUES($1, $2, 1, $3, $4::jsonb)',
      intent,
      mediaRef,
      original.sha256,
      '{}'
    );
    await tx.execute(
      'INSERT INTO media_catalog VALUES($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::uuid)',
      mediaRef,
      intent,
      eventRef,
      guestRef,
      gen,
      rev,
      status,
      JSON.stringify(original),
      initialJobId
    );

    // Seed prior quarantine audit entry for gen 1
    await tx.execute(
      `INSERT INTO media_quarantine_audit (
         id, operation_id, media_ref, generation, previous_revision, revision,
         job_id, token, epoch, journal_sequence, cause, actor, transition, committed_at
       ) VALUES (
         $1::uuid, $2, $3, $4, $5, $6,
         $7::uuid, $8::uuid, 'epoch-seed', '1', 'THREAT_DETECTED', 'SYSTEM', 'QUARANTINED', clock_timestamp()
       )`,
      randomUUID(),
      'op-quar-prior-' + randomUUID(),
      mediaRef,
      gen,
      0n,
      rev,
      initialJobId,
      randomUUID()
    );
  });

  const service = new QuarantineReleaseService(transactions, queue);

  return { service, queue, queueName, mediaRef, eventRef, organizerRef, guestRef, initialJobId, original };
}

afterAll(async () => {
  await client.$disconnect();
});

describe('QuarantineReleaseService (Integration Tests against PostgreSQL 16)', () => {
  it('Scenario 1: Authorized Human Admin releases quarantined media with valid intervention grant', async () => {
    const { service, queue, queueName, mediaRef, eventRef, organizerRef, initialJobId } = await prepareQuarantinedMedia();

    const adminContext: AdminActorContext = {
      actorType: 'ADMIN_HUMAN',
      principalId: 'admin-principal-99',
      identifier: 'sec-lead@eventlens.internal',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      adminAuthRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };

    const grant: AdminInterventionGrant = {
      grantId: 'grant-' + randomUUID(),
      principalId: adminContext.principalId,
      action: 'RELEASE_QUARANTINE',
      targetRef: mediaRef,
      reason: 'Deep signature analysis confirmed false positive; file validated safe',
      status: 'ACTIVE'
    };

    const operationId = 'op-release-' + randomUUID();

    const receipt = await service.execute({
      mediaRef,
      operationId,
      queueName,
      justification: 'Deep signature analysis confirmed false positive; file validated safe',
      actor: {
        type: 'ADMIN_HUMAN',
        actorContext: adminContext,
        grant
      }
    });

    expect(receipt.operationId).toBe(operationId);
    expect(receipt.mediaRef).toBe(mediaRef);
    expect(receipt.previousGeneration).toBe(1n);
    expect(receipt.newGeneration).toBe(2n);
    expect(receipt.previousRevision).toBe(1n);
    expect(receipt.newRevision).toBe(2n);
    expect(receipt.actorType).toBe('ADMIN_HUMAN');
    expect(receipt.actorId).toBe(adminContext.principalId);
    expect(receipt.grantId).toBe(grant.grantId);
    expect(receipt.wasExisting).toBe(false);

    // Verify media_catalog updated to UPLOADED with new generation and revision
    const catalogRows = await client.$queryRawUnsafe<any[]>(
      'SELECT generation, revision, status, job_id FROM media_catalog WHERE media_ref = $1',
      mediaRef
    );
    expect(catalogRows.length).toBe(1);
    expect(catalogRows[0].generation).toBe(2n);
    expect(catalogRows[0].revision).toBe(2n);
    expect(catalogRows[0].status).toBe('UPLOADED');
    expect(catalogRows[0].job_id).toBe(receipt.jobId);

    // Verify receipt in database
    const receiptRows = await client.$queryRawUnsafe<any[]>(
      'SELECT * FROM media_quarantine_release_receipt WHERE operation_id = $1',
      operationId
    );
    expect(receiptRows.length).toBe(1);
    expect(receiptRows[0].new_generation).toBe(2n);

    // Verify audit record
    const auditRows = await client.$queryRawUnsafe<any[]>(
      'SELECT * FROM media_quarantine_release_audit WHERE operation_id = $1',
      operationId
    );
    expect(auditRows.length).toBe(1);
    expect(auditRows[0].transition).toBe('RELEASED_FOR_INSPECTION');

    // Verify notification intent durable record
    const notifRows = await client.$queryRawUnsafe<any[]>(
      'SELECT * FROM media_quarantine_notification_intent WHERE operation_id = $1',
      operationId
    );
    expect(notifRows.length).toBe(1);
    expect(notifRows[0].notification_type).toBe('ADMINISTRATIVE_INTERVENTION_QUARANTINE_RELEASE');
    expect(notifRows[0].event_ref).toBe(eventRef);

    // Verify prior generation quarantine audit is intact
    const priorQuarantineRows = await client.$queryRawUnsafe<any[]>(
      'SELECT * FROM media_quarantine_audit WHERE media_ref = $1',
      mediaRef
    );
    expect(priorQuarantineRows.length).toBe(1);
    expect(priorQuarantineRows[0].generation).toBe(1n);

    // Scenario 2 verification: Worker reservation transitions media to PROCESSING
    const reservation = await queue.reserve([queueName], 'worker-node-1', 1, 30000);
    expect(reservation.jobs.length).toBe(1);
    expect(reservation.jobs[0].jobId).toBe(receipt.jobId);
    expect(reservation.jobs[0].generation).toBe(2n);
    reservation.releaseAfterQuiescence();

    const postReserveJob = await client.$queryRawUnsafe<any[]>(
      'SELECT status, owner FROM job_queue WHERE id = $1::uuid',
      receipt.jobId
    );
    expect(postReserveJob[0].status).toBe('PROCESSING');
    expect(postReserveJob[0].owner).toBe('worker-node-1');
  });

  it('Scenario 3: Idempotent replay with same operationId returns existing receipt without duplicating jobs', async () => {
    const { service, mediaRef } = await prepareQuarantinedMedia();

    const adminContext: AdminActorContext = {
      actorType: 'ADMIN_HUMAN',
      principalId: 'admin-principal-replay',
      identifier: 'sec-lead@eventlens.internal',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      adminAuthRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };

    const grant: AdminInterventionGrant = {
      grantId: 'grant-replay-' + randomUUID(),
      principalId: adminContext.principalId,
      action: 'RELEASE_QUARANTINE',
      targetRef: mediaRef,
      reason: 'Replay validation',
      status: 'ACTIVE'
    };

    const operationId = 'op-replay-' + randomUUID();

    const firstReceipt = await service.execute({
      mediaRef,
      operationId,
      justification: 'Replay validation',
      actor: { type: 'ADMIN_HUMAN', actorContext: adminContext, grant }
    });
    expect(firstReceipt.wasExisting).toBe(false);

    // Replay with identical command
    const secondReceipt = await service.execute({
      mediaRef,
      operationId,
      justification: 'Replay validation',
      actor: { type: 'ADMIN_HUMAN', actorContext: adminContext, grant }
    });
    expect(secondReceipt.wasExisting).toBe(true);
    expect(secondReceipt.operationId).toBe(operationId);
    expect(secondReceipt.jobId).toBe(firstReceipt.jobId);
    expect(secondReceipt.newGeneration).toBe(firstReceipt.newGeneration);

    // Verify only 1 receipt and 1 audit record exist in database
    const receiptCount = await client.$queryRawUnsafe<any[]>(
      'SELECT COUNT(*)::int as cnt FROM media_quarantine_release_receipt WHERE operation_id = $1',
      operationId
    );
    expect(receiptCount[0].cnt).toBe(1);

    const notifCount = await client.$queryRawUnsafe<any[]>(
      'SELECT COUNT(*)::int as cnt FROM media_quarantine_notification_intent WHERE operation_id = $1',
      operationId
    );
    expect(notifCount[0].cnt).toBe(1);
  });

  it('Scenario 4: Conflicting replay with same operationId throws IDEMPOTENCY_CONFLICT', async () => {
    const { service, mediaRef } = await prepareQuarantinedMedia();

    const adminContext: AdminActorContext = {
      actorType: 'ADMIN_HUMAN',
      principalId: 'admin-principal-conflict',
      identifier: 'sec-lead@eventlens.internal',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      adminAuthRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };

    const grant: AdminInterventionGrant = {
      grantId: 'grant-conflict-' + randomUUID(),
      principalId: adminContext.principalId,
      action: 'RELEASE_QUARANTINE',
      targetRef: mediaRef,
      reason: 'Conflict validation',
      status: 'ACTIVE'
    };

    const operationId = 'op-conflict-' + randomUUID();

    await service.execute({
      mediaRef,
      operationId,
      justification: 'Initial release',
      actor: { type: 'ADMIN_HUMAN', actorContext: adminContext, grant }
    });

    // Attempt replay with a different mediaRef but grant matching the new target
    const conflictingMediaRef = 'media-different-' + randomUUID();
    const grantForDifferent: AdminInterventionGrant = {
      grantId: 'grant-different-' + randomUUID(),
      principalId: adminContext.principalId,
      action: 'RELEASE_QUARANTINE',
      targetRef: conflictingMediaRef,
      reason: 'Conflict validation',
      status: 'ACTIVE'
    };

    await expect(
      service.execute({
        mediaRef: conflictingMediaRef,
        operationId,
        justification: 'Initial release',
        actor: { type: 'ADMIN_HUMAN', actorContext: adminContext, grant: grantForDifferent }
      })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('Scenario 5: Organizer attempt is strictly rejected (ORGANIZER_DENIED) and audited', async () => {
    const { service, mediaRef, organizerRef } = await prepareQuarantinedMedia();

    const operationId = 'op-org-attempt-' + randomUUID();

    await expect(
      service.execute({
        mediaRef,
        operationId,
        justification: 'Please unblock my photo for the event gallery',
        actor: {
          type: 'ORGANIZER',
          organizerRef
        }
      })
    ).rejects.toMatchObject({ code: 'ORGANIZER_DENIED' });

    // Verify media status remains QUARANTINED
    const catalogRows = await client.$queryRawUnsafe<any[]>(
      'SELECT status FROM media_catalog WHERE media_ref = $1',
      mediaRef
    );
    expect(catalogRows[0].status).toBe('QUARANTINED');

    // Verify denial audit record was written
    const denialRows = await client.$queryRawUnsafe<any[]>(
      'SELECT * FROM media_quarantine_release_denial_audit WHERE operation_id = $1',
      operationId
    );
    expect(denialRows.length).toBe(1);
    expect(denialRows[0].media_ref).toBe(mediaRef);
    expect(denialRows[0].actor_type).toBe('ORGANIZER');
    expect(denialRows[0].actor_id).toBe(organizerRef);
    expect(denialRows[0].reason).toBe('ORGANIZER_DENIED');
  });

  it('Scenario 6: Rejects release when media is not in QUARANTINED status', async () => {
    const { service, mediaRef } = await prepareQuarantinedMedia({ status: 'PROCESSING_FAILED' });

    const adminContext: AdminActorContext = {
      actorType: 'ADMIN_HUMAN',
      principalId: 'admin-principal-not-quar',
      identifier: 'sec-lead@eventlens.internal',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      adminAuthRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };

    const grant: AdminInterventionGrant = {
      grantId: 'grant-not-quar-' + randomUUID(),
      principalId: adminContext.principalId,
      action: 'RELEASE_QUARANTINE',
      targetRef: mediaRef,
      reason: 'Validation',
      status: 'ACTIVE'
    };

    await expect(
      service.execute({
        mediaRef,
        operationId: 'op-not-quar-' + randomUUID(),
        justification: 'Validation',
        actor: { type: 'ADMIN_HUMAN', actorContext: adminContext, grant }
      })
    ).rejects.toMatchObject({ code: 'MEDIA_NOT_QUARANTINED' });
  });

  it('Scenario 7: Security automation releases quarantined media using service identity', async () => {
    const { service, mediaRef } = await prepareQuarantinedMedia();

    const operationId = 'op-auto-release-' + randomUUID();

    const receipt = await service.execute({
      mediaRef,
      operationId,
      justification: 'Automated remediation pipeline re-classified object as benign after signature rule refresh',
      actor: {
        type: 'SECURITY_AUTOMATION',
        serviceId: 'clamav-remediation-engine',
        securityScope: 'MEDIA_SECURITY_AUTOMATION'
      }
    });

    expect(receipt.actorType).toBe('SECURITY_AUTOMATION');
    expect(receipt.actorId).toBe('clamav-remediation-engine');
    expect(receipt.newGeneration).toBe(2n);

    // Verify catalog updated to UPLOADED
    const catalogRows = await client.$queryRawUnsafe<any[]>(
      'SELECT status, generation FROM media_catalog WHERE media_ref = $1',
      mediaRef
    );
    expect(catalogRows[0].status).toBe('UPLOADED');
    expect(catalogRows[0].generation).toBe(2n);
  });
});
