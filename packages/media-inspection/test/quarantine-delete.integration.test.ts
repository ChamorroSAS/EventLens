import { describe, afterAll, it, expect } from 'vitest';
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
  QuarantineDeleteService,
  type AdminDeleteInterventionGrant
} from '../src/quarantine-delete.js';
import type { AdminActorContext } from '@eventlens/identity';

const client = createPrismaClient(process.env.DATABASE_URL!);
const transactions = new PrismaTransactions(client, 5000);

class Authority implements RecoveryAuthority {
  epoch = 'delete-epoch-1';
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
  const queueName = 'media-quar-delete-' + randomUUID();

  // Create organizer entry in test_event_organizer table
  await transactions.run(async tx => {
    await tx.execute(
      'INSERT INTO test_event_organizer(event_ref, organizer_ref, barred) VALUES($1, $2, false) ON CONFLICT (event_ref) DO NOTHING',
      eventRef,
      organizerRef
    );
  });

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
    sha256: 'e'.repeat(64),
    sizeBytes: 4096
  };

  const status = options.status ?? 'QUARANTINED';
  const gen = options.generation ?? 1n;
  const rev = options.revision ?? 1n;
  const cycleId = 'cycle:' + randomUUID();

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

    // Seed active media processing cycle
    await tx.execute(
      `INSERT INTO media_processing_cycle (
         cycle_id, media_ref, cycle_number, event_ref, organizer_ref,
         job_id, job_type, safety_outcome, status, operation_id, created_at
       ) VALUES ($1, $2, 1, $3, $4, $5::uuid, 'MEDIA_INSPECTION', 'PENDING', 'ACTIVE', $6, clock_timestamp())`,
      cycleId,
      mediaRef,
      eventRef,
      organizerRef,
      initialJobId,
      'op-cycle-' + randomUUID()
    );
  });

  const service = new QuarantineDeleteService(transactions);

  return { service, queue, queueName, mediaRef, eventRef, organizerRef, guestRef, initialJobId, cycleId, original };
}

afterAll(async () => {
  await client.$disconnect();
});

describe('QuarantineDeleteService (Integration Tests against PostgreSQL 16)', () => {
  it('Scenario 1: Authorized Human Admin deletes quarantined media with valid intervention grant', async () => {
    const { service, mediaRef, eventRef, cycleId, initialJobId } = await prepareQuarantinedMedia();

    const adminContext: AdminActorContext = {
      actorType: 'ADMIN_HUMAN',
      principalId: 'admin-principal-99',
      identifier: 'security-officer@eventlens.internal',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      adminAuthRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };

    const grant: AdminDeleteInterventionGrant = {
      grantId: 'grant-delete-' + randomUUID(),
      principalId: adminContext.principalId,
      action: 'DELETE_QUARANTINE',
      targetRef: mediaRef,
      reason: 'Confirmed malicious ransomware container; irreversible purge ordered',
      status: 'ACTIVE'
    };

    const operationId = 'op-delete-' + randomUUID();

    const receipt = await service.execute({
      mediaRef,
      operationId,
      justification: 'Confirmed malicious ransomware container; irreversible purge ordered',
      actor: {
        type: 'ADMIN_HUMAN',
        actorContext: adminContext,
        grant
      }
    });

    expect(receipt.operationId).toBe(operationId);
    expect(receipt.mediaRef).toBe(mediaRef);
    expect(receipt.generation).toBe(1n);
    expect(receipt.previousRevision).toBe(1n);
    expect(receipt.newRevision).toBe(2n);
    expect(receipt.status).toBe('DELETED');
    expect(receipt.actorType).toBe('ADMIN_HUMAN');
    expect(receipt.actorId).toBe(adminContext.principalId);
    expect(receipt.grantId).toBe(grant.grantId);
    expect(receipt.purgeIntentId).toBeDefined();
    expect(receipt.wasExisting).toBe(false);

    // Verify media_catalog updated to DELETED with incremented revision
    const catalogRows = await client.$queryRawUnsafe<any[]>(
      'SELECT generation, revision, status FROM media_catalog WHERE media_ref = $1',
      mediaRef
    );
    expect(catalogRows.length).toBe(1);
    expect(catalogRows[0].generation).toBe(1n);
    expect(catalogRows[0].revision).toBe(2n);
    expect(catalogRows[0].status).toBe('DELETED');

    // Verify active cycle in media_processing_cycle terminated
    const cycleRows = await client.$queryRawUnsafe<any[]>(
      'SELECT status FROM media_processing_cycle WHERE cycle_id = $1',
      cycleId
    );
    expect(cycleRows.length).toBe(1);
    expect(cycleRows[0].status).toBe('TERMINATED');

    // Verify pending job in job_queue cancelled
    const jobRows = await client.$queryRawUnsafe<any[]>(
      'SELECT cancelled FROM job_queue WHERE id = $1::uuid',
      initialJobId
    );
    expect(jobRows.length).toBe(1);
    expect(jobRows[0].cancelled).toBe(true);

    // Verify receipt in database
    const receiptRows = await client.$queryRawUnsafe<any[]>(
      'SELECT * FROM media_quarantine_delete_receipt WHERE operation_id = $1',
      operationId
    );
    expect(receiptRows.length).toBe(1);
    expect(receiptRows[0].status).toBe('DELETED');
    expect(receiptRows[0].purge_intent_id).toBe(receipt.purgeIntentId);

    // Verify audit record in database
    const auditRows = await client.$queryRawUnsafe<any[]>(
      'SELECT * FROM media_quarantine_delete_audit WHERE operation_id = $1',
      operationId
    );
    expect(auditRows.length).toBe(1);
    expect(auditRows[0].previous_status).toBe('QUARANTINED');
    expect(auditRows[0].transition).toBe('QUARANTINED_TO_DELETED');

    // Verify purge intent durable record in database
    const purgeRows = await client.$queryRawUnsafe<any[]>(
      'SELECT * FROM media_quarantine_purge_intent WHERE operation_id = $1',
      operationId
    );
    expect(purgeRows.length).toBe(1);
    expect(purgeRows[0].media_ref).toBe(mediaRef);
    expect(purgeRows[0].status).toBe('PENDING');

    // Verify notification intent durable record
    const notifRows = await client.$queryRawUnsafe<any[]>(
      'SELECT * FROM media_quarantine_notification_intent WHERE operation_id = $1',
      operationId
    );
    expect(notifRows.length).toBe(1);
    expect(notifRows[0].notification_type).toBe('ADMINISTRATIVE_INTERVENTION_QUARANTINE_DELETE');
    expect(notifRows[0].event_ref).toBe(eventRef);

    // Verify prior generation quarantine audit is intact
    const priorQuarantineRows = await client.$queryRawUnsafe<any[]>(
      'SELECT * FROM media_quarantine_audit WHERE media_ref = $1',
      mediaRef
    );
    expect(priorQuarantineRows.length).toBe(1);
    expect(priorQuarantineRows[0].generation).toBe(1n);
  });

  it('Scenario 2: Idempotent replay with same operationId returns existing receipt without duplicating intents', async () => {
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

    const grant: AdminDeleteInterventionGrant = {
      grantId: 'grant-replay-' + randomUUID(),
      principalId: adminContext.principalId,
      action: 'DELETE_QUARANTINE',
      targetRef: mediaRef,
      reason: 'Replay validation',
      status: 'ACTIVE'
    };

    const operationId = 'op-replay-del-' + randomUUID();

    const firstReceipt = await service.execute({
      mediaRef,
      operationId,
      justification: 'Irreversible deletion',
      actor: { type: 'ADMIN_HUMAN', actorContext: adminContext, grant }
    });
    expect(firstReceipt.wasExisting).toBe(false);

    // Replay with identical command
    const secondReceipt = await service.execute({
      mediaRef,
      operationId,
      justification: 'Irreversible deletion',
      actor: { type: 'ADMIN_HUMAN', actorContext: adminContext, grant }
    });
    expect(secondReceipt.wasExisting).toBe(true);
    expect(secondReceipt.operationId).toBe(operationId);
    expect(secondReceipt.purgeIntentId).toBe(firstReceipt.purgeIntentId);
    expect(secondReceipt.status).toBe('DELETED');

    // Verify only 1 receipt, 1 purge intent, and 1 notification intent exist in database
    const receiptCount = await client.$queryRawUnsafe<any[]>(
      'SELECT COUNT(*)::int as cnt FROM media_quarantine_delete_receipt WHERE operation_id = $1',
      operationId
    );
    expect(receiptCount[0].cnt).toBe(1);

    const purgeCount = await client.$queryRawUnsafe<any[]>(
      'SELECT COUNT(*)::int as cnt FROM media_quarantine_purge_intent WHERE operation_id = $1',
      operationId
    );
    expect(purgeCount[0].cnt).toBe(1);

    const notifCount = await client.$queryRawUnsafe<any[]>(
      'SELECT COUNT(*)::int as cnt FROM media_quarantine_notification_intent WHERE operation_id = $1',
      operationId
    );
    expect(notifCount[0].cnt).toBe(1);
  });

  it('Scenario 3: Conflicting replay with same operationId throws IDEMPOTENCY_CONFLICT', async () => {
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

    const grant: AdminDeleteInterventionGrant = {
      grantId: 'grant-conflict-' + randomUUID(),
      principalId: adminContext.principalId,
      action: 'DELETE_QUARANTINE',
      targetRef: mediaRef,
      reason: 'Conflict validation',
      status: 'ACTIVE'
    };

    const operationId = 'op-conflict-del-' + randomUUID();

    await service.execute({
      mediaRef,
      operationId,
      justification: 'Initial delete',
      actor: { type: 'ADMIN_HUMAN', actorContext: adminContext, grant }
    });

    const conflictingMediaRef = 'media-different-' + randomUUID();
    const grantForDifferent: AdminDeleteInterventionGrant = {
      grantId: 'grant-different-' + randomUUID(),
      principalId: adminContext.principalId,
      action: 'DELETE_QUARANTINE',
      targetRef: conflictingMediaRef,
      reason: 'Conflict validation',
      status: 'ACTIVE'
    };

    await expect(
      service.execute({
        mediaRef: conflictingMediaRef,
        operationId,
        justification: 'Initial delete',
        actor: { type: 'ADMIN_HUMAN', actorContext: adminContext, grant: grantForDifferent }
      })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('Scenario 4: Organizer attempt is strictly rejected (ORGANIZER_DENIED) and audited', async () => {
    const { service, mediaRef, organizerRef } = await prepareQuarantinedMedia();

    const operationId = 'op-org-attempt-del-' + randomUUID();

    await expect(
      service.execute({
        mediaRef,
        operationId,
        justification: 'Organizer wants to delete quarantined media directly',
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
      'SELECT * FROM media_quarantine_delete_denial_audit WHERE operation_id = $1',
      operationId
    );
    expect(denialRows.length).toBe(1);
    expect(denialRows[0].media_ref).toBe(mediaRef);
    expect(denialRows[0].actor_type).toBe('ORGANIZER');
    expect(denialRows[0].actor_id).toBe(organizerRef);
    expect(denialRows[0].reason).toBe('ORGANIZER_DENIED');
  });

  it('Scenario 5: Rejects deletion when media is not in QUARANTINED status', async () => {
    const { service, mediaRef } = await prepareQuarantinedMedia({ status: 'PUBLISHED' });

    const adminContext: AdminActorContext = {
      actorType: 'ADMIN_HUMAN',
      principalId: 'admin-principal-published',
      identifier: 'sec-lead@eventlens.internal',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      adminAuthRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };

    const grant: AdminDeleteInterventionGrant = {
      grantId: 'grant-pub-' + randomUUID(),
      principalId: adminContext.principalId,
      action: 'DELETE_QUARANTINE',
      targetRef: mediaRef,
      reason: 'Validation',
      status: 'ACTIVE'
    };

    await expect(
      service.execute({
        mediaRef,
        operationId: 'op-pub-del-' + randomUUID(),
        justification: 'Validation',
        actor: { type: 'ADMIN_HUMAN', actorContext: adminContext, grant }
      })
    ).rejects.toMatchObject({ code: 'MEDIA_NOT_QUARANTINED' });
  });

  it('Scenario 6: Security automation deletes quarantined media using service identity', async () => {
    const { service, mediaRef } = await prepareQuarantinedMedia();

    const operationId = 'op-auto-delete-' + randomUUID();

    const receipt = await service.execute({
      mediaRef,
      operationId,
      justification: 'Autonomous malware containment: zero-tolerance destructive purge order',
      actor: {
        type: 'SECURITY_AUTOMATION',
        serviceId: 'autonomous-sentinel-service',
        securityScope: 'MEDIA_SECURITY_AUTOMATION'
      }
    });

    expect(receipt.actorType).toBe('SECURITY_AUTOMATION');
    expect(receipt.actorId).toBe('autonomous-sentinel-service');
    expect(receipt.status).toBe('DELETED');
    expect(receipt.purgeIntentId).toBeDefined();

    // Verify catalog updated to DELETED
    const catalogRows = await client.$queryRawUnsafe<any[]>(
      'SELECT status, revision FROM media_catalog WHERE media_ref = $1',
      mediaRef
    );
    expect(catalogRows[0].status).toBe('DELETED');
    expect(catalogRows[0].revision).toBe(2n);
  });
});
