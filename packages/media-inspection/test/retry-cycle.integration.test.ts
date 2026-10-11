import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {JobQueuePostgres,LocalSlots,PrismaTransactions,createPrismaClient,type RecoveryAuthority,type SqlTransaction} from '@eventlens/job-queue';
import {
  RequestRetryCycle,
  PostgresRetryCycleRepository,
  CycleDeniedError,
  type EventOrganizerAuthorization
} from '../src/retry-cycle.js';
import type {SafetyFact} from '../src/contracts.js';

const client = createPrismaClient(process.env.DATABASE_URL!);
const transactions = new PrismaTransactions(client, 5000);
const observations: unknown[] = [];

class Authority implements RecoveryAuthority {
  epoch = 'cycle-epoch-1';
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

class TestOrganizerAuthorizer implements EventOrganizerAuthorization {
  async assertAuthorizedOrganizer(tx: SqlTransaction, scope: { eventRef: string; organizerRef: string }): Promise<void> {
    const rows = await tx.query<{ organizer_ref: string; barred: boolean }>(
      'SELECT organizer_ref, barred FROM test_event_organizer WHERE event_ref = $1',
      scope.eventRef
    );
    if (!rows.length || rows[0].organizer_ref !== scope.organizerRef) {
      throw new CycleDeniedError('ORGANIZER_NOT_AUTHORIZED');
    }
    if (rows[0].barred) {
      throw new CycleDeniedError('BARRED_EVENT');
    }
  }
}

async function prepared(options: {
  status?: string;
  safetyOutcome?: 'APPROVED' | 'INCONCLUSIVE' | 'DENIED' | 'NONE';
  kind?: 'PHOTO' | 'VIDEO';
  barred?: boolean;
} = {}) {
  const authority = new Authority();
  const slots = new LocalSlots(2);
  const eventRef = 'event:' + randomUUID();
  const organizerRef = 'organizer:' + randomUUID();
  const ref = 'media:' + randomUUID();
  const queueName = 'media-cycle-' + randomUUID();

  // Insert event organizer row
  await transactions.run(async tx => {
    await tx.execute(
      'INSERT INTO test_event_organizer(event_ref, organizer_ref, barred) VALUES($1, $2, $3)',
      eventRef,
      organizerRef,
      options.barred ?? false
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

  // Initial job that previously failed
  const initialJobId = await transactions.run(tx =>
    queue.publish(tx, {
      type: 'MEDIA_INSPECTION',
      handlerVersion: '1',
      resourceRef: ref,
      generation: 1n,
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
    sizeBytes: 100
  };

  const status = options.status ?? 'PROCESSING_FAILED';

  await transactions.run(async tx => {
    const intent = randomUUID();
    await tx.execute('INSERT INTO media_acceptance_intent VALUES($1,$2,1,$3,$4::jsonb)', intent, ref, original.sha256, '{}');
    await tx.execute(
      'INSERT INTO media_catalog VALUES($1,$2,$3,$4,1,1,$5,$6::jsonb,$7::uuid)',
      ref,
      intent,
      eventRef,
      'guest-1',
      status,
      JSON.stringify(original),
      initialJobId
    );
  });

  // Optional safety fact
  if (options.safetyOutcome && options.safetyOutcome !== 'NONE') {
    const fact: SafetyFact = {
      schemaVersion: 1,
      jobId: initialJobId,
      executionToken: randomUUID(),
      fence: '1',
      epoch: 'ep1',
      mediaRef: ref,
      generation: '1',
      revision: '1',
      originalSha256: original.sha256,
      originalVersion: original.immutableVersion,
      outcome: options.safetyOutcome,
      format: {
        status: options.safetyOutcome === 'APPROVED' ? 'VALID' : 'INCONCLUSIVE',
        reason: 'TEST_REASON',
        metadata: {
          format: options.kind === 'VIDEO' ? 'MP4' : 'JPEG',
          width: 800,
          height: 600,
          streams: 1,
          audio: false,
          ...(options.kind === 'VIDEO' ? { durationSeconds: 5 } : {})
        }
      },
      malware: {
        status: options.safetyOutcome === 'APPROVED' ? 'NO_THREAT_DETECTED' : 'INCONCLUSIVE',
        reason: 'TEST',
        engine: 'ClamAV',
        engineVersion: '1.4.6',
        imageDigest: 'digest',
        snapshotId: 's',
        profileHash: 'p'
      }
    };

    await transactions.run(async tx => {
      await tx.execute('INSERT INTO media_inspection(media_ref, generation, fact) VALUES($1, 1, $2::jsonb)', ref, JSON.stringify(fact));
    });
  }

  const repository = new PostgresRetryCycleRepository();
  const authorizer = new TestOrganizerAuthorizer();
  const handler = new RequestRetryCycle(transactions, repository, authorizer, queue);

  return { authority, queue, handler, ref, eventRef, organizerRef, queueName, original, initialJobId };
}

beforeAll(async () => {
  await client.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS test_event_organizer(event_ref text PRIMARY KEY, organizer_ref text NOT NULL, barred boolean NOT NULL DEFAULT false)'
  );
});

afterAll(async () => {
  try {
    writeFileSync(
      process.env.MEDIA_CYCLE_OBSERVATIONS_PATH ?? '/evidence/cycle-observations.json',
      JSON.stringify(observations, null, 2)
    );
  } catch {}
});

it('authorized organizer requests new cycle on PROCESSING_FAILED with inconclusive inspection: enqueues MEDIA_INSPECTION', async () => {
  const p = await prepared({ status: 'PROCESSING_FAILED', safetyOutcome: 'INCONCLUSIVE' });
  const opId = randomUUID();

  const receipt = await p.handler.execute(
    { mediaRef: p.ref, eventRef: p.eventRef, organizerRef: p.organizerRef, queueName: p.queueName },
    opId
  );

  expect(receipt.cycleNumber).toBe(1);
  expect(receipt.status).toBe('ACTIVE');
  expect(receipt.jobType).toBe('MEDIA_INSPECTION');
  expect(receipt.safetyOutcome).toBe('INCONCLUSIVE');
  expect(receipt.wasExistingCycle).toBe(false);

  // 1. Verify job in job_queue
  const jobs = await client.$queryRawUnsafe<Array<{ status: string; type: string; attempt: number }>>(
    'SELECT status, type, attempt FROM job_queue WHERE id = $1::uuid',
    receipt.jobId
  );
  expect(jobs).toHaveLength(1);
  expect(jobs[0].status).toBe('PENDING');
  expect(jobs[0].type).toBe('MEDIA_INSPECTION');
  expect(jobs[0].attempt).toBe(0);

  // 2. Verify media_catalog remains PROCESSING_FAILED, but job_id is updated to new cycle's job
  const media = await client.$queryRawUnsafe<Array<{ status: string; job_id: string; revision: bigint }>>(
    'SELECT status, job_id, revision FROM media_catalog WHERE media_ref = $1',
    p.ref
  );
  expect(media[0].status).toBe('PROCESSING_FAILED');
  expect(media[0].job_id).toBe(receipt.jobId);
  expect(media[0].revision).toBe(2n);

  observations.push({ test: 'retry_cycle_inconclusive_reinspect', receipt });
});

it('authorized organizer requests new cycle on PROCESSING_FAILED with approved safety: enqueues PHOTO_DERIVATIVES directly', async () => {
  const p = await prepared({ status: 'PROCESSING_FAILED', safetyOutcome: 'APPROVED', kind: 'PHOTO' });
  const opId = randomUUID();

  const receipt = await p.handler.execute(
    { mediaRef: p.ref, eventRef: p.eventRef, organizerRef: p.organizerRef, kind: 'PHOTO', queueName: p.queueName },
    opId
  );

  expect(receipt.cycleNumber).toBe(1);
  expect(receipt.status).toBe('ACTIVE');
  expect(receipt.jobType).toBe('PHOTO_DERIVATIVES');
  expect(receipt.safetyOutcome).toBe('APPROVED');

  const jobs = await client.$queryRawUnsafe<Array<{ type: string }>>(
    'SELECT type FROM job_queue WHERE id = $1::uuid',
    receipt.jobId
  );
  expect(jobs[0].type).toBe('PHOTO_DERIVATIVES');
});

it('concurrent or repeated request while a cycle is already active returns existing cycle without duplicate work', async () => {
  const p = await prepared({ status: 'PROCESSING_FAILED', safetyOutcome: 'APPROVED', kind: 'PHOTO' });
  const opId1 = randomUUID();
  const opId2 = randomUUID();

  // First request creates cycle 1
  const first = await p.handler.execute(
    { mediaRef: p.ref, eventRef: p.eventRef, organizerRef: p.organizerRef, queueName: p.queueName },
    opId1
  );
  expect(first.wasExistingCycle).toBe(false);

  // Second request (different opId) while cycle 1 is active returns the existing cycle
  const second = await p.handler.execute(
    { mediaRef: p.ref, eventRef: p.eventRef, organizerRef: p.organizerRef, queueName: p.queueName },
    opId2
  );
  expect(second.cycleId).toBe(first.cycleId);
  expect(second.cycleNumber).toBe(1);
  expect(second.jobId).toBe(first.jobId);
  expect(second.wasExistingCycle).toBe(true);

  // Confirm only 1 cycle exists in media_processing_cycle
  const cycleCount = await client.$queryRawUnsafe<Array<{ count: bigint }>>(
    'SELECT count(*) as count FROM media_processing_cycle WHERE media_ref = $1',
    p.ref
  );
  expect(Number(cycleCount[0].count)).toBe(1);
});

it('compatible replay with same operationId returns existing cycle receipt', async () => {
  const p = await prepared({ status: 'PROCESSING_FAILED', safetyOutcome: 'INCONCLUSIVE' });
  const opId = randomUUID();

  const first = await p.handler.execute(
    { mediaRef: p.ref, eventRef: p.eventRef, organizerRef: p.organizerRef, queueName: p.queueName },
    opId
  );
  const replay = await p.handler.execute(
    { mediaRef: p.ref, eventRef: p.eventRef, organizerRef: p.organizerRef, queueName: p.queueName },
    opId
  );

  expect(replay.cycleId).toBe(first.cycleId);
  expect(replay.operationId).toBe(opId);
});

it('denies retry and enqueues nothing if media is QUARANTINED', async () => {
  const p = await prepared({ status: 'QUARANTINED', safetyOutcome: 'DENIED' });
  const opId = randomUUID();

  await expect(
    p.handler.execute(
      { mediaRef: p.ref, eventRef: p.eventRef, organizerRef: p.organizerRef, queueName: p.queueName },
      opId
    )
  ).rejects.toMatchObject({ code: 'QUARANTINED' });

  // Verify no cycle was created
  const cycles = await client.$queryRawUnsafe<Array<{ count: bigint }>>(
    'SELECT count(*) as count FROM media_processing_cycle WHERE media_ref = $1',
    p.ref
  );
  expect(Number(cycles[0].count)).toBe(0);

  // Verify denial audit
  const denials = await client.$queryRawUnsafe<Array<{ reason: string }>>(
    'SELECT reason FROM media_cycle_denial_audit WHERE operation_id = $1',
    opId
  );
  expect(denials).toHaveLength(1);
  expect(denials[0].reason).toBe('QUARANTINED');
});

it.each(['UPLOADED', 'PROCESSING', 'PUBLISHED', 'TRASHED', 'DELETED'])(
  'denies retry when media status is not PROCESSING_FAILED (%s)',
  async status => {
    const p = await prepared({ status, safetyOutcome: 'APPROVED' });
    const opId = randomUUID();

    await expect(
      p.handler.execute(
        { mediaRef: p.ref, eventRef: p.eventRef, organizerRef: p.organizerRef, queueName: p.queueName },
        opId
      )
    ).rejects.toMatchObject({ code: 'STATUS_NOT_ELIGIBLE' });

    const cycles = await client.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT count(*) as count FROM media_processing_cycle WHERE media_ref = $1',
      p.ref
    );
    expect(Number(cycles[0].count)).toBe(0);
  }
);

it('denies retry when organizer is not authorized for event', async () => {
  const p = await prepared({ status: 'PROCESSING_FAILED' });
  const opId = randomUUID();
  const unauthorizedOrganizer = 'organizer:intruder';

  await expect(
    p.handler.execute(
      { mediaRef: p.ref, eventRef: p.eventRef, organizerRef: unauthorizedOrganizer, queueName: p.queueName },
      opId
    )
  ).rejects.toMatchObject({ code: 'ORGANIZER_NOT_AUTHORIZED' });

  const cycles = await client.$queryRawUnsafe<Array<{ count: bigint }>>(
    'SELECT count(*) as count FROM media_processing_cycle WHERE media_ref = $1',
    p.ref
  );
  expect(Number(cycles[0].count)).toBe(0);
});

it('denies retry when event is barred', async () => {
  const p = await prepared({ status: 'PROCESSING_FAILED', barred: true });
  const opId = randomUUID();

  await expect(
    p.handler.execute(
      { mediaRef: p.ref, eventRef: p.eventRef, organizerRef: p.organizerRef, queueName: p.queueName },
      opId
    )
  ).rejects.toMatchObject({ code: 'BARRED_EVENT' });
});

it('creates cycle 2 with incremented cycleNumber after cycle 1 job terminates (DEAD)', async () => {
  const p = await prepared({ status: 'PROCESSING_FAILED', safetyOutcome: 'INCONCLUSIVE' });

  // Cycle 1
  const cycle1 = await p.handler.execute(
    { mediaRef: p.ref, eventRef: p.eventRef, organizerRef: p.organizerRef, queueName: p.queueName },
    randomUUID()
  );
  expect(cycle1.cycleNumber).toBe(1);

  // Cycle 1 job fails exhausted -> DEAD in job_queue
  await client.$executeRawUnsafe(
    "UPDATE job_queue SET status = 'DEAD' WHERE id = $1::uuid",
    cycle1.jobId
  );

  // Cycle 2 requested
  const cycle2 = await p.handler.execute(
    { mediaRef: p.ref, eventRef: p.eventRef, organizerRef: p.organizerRef, queueName: p.queueName },
    randomUUID()
  );

  expect(cycle2.cycleNumber).toBe(2);
  expect(cycle2.cycleId).not.toBe(cycle1.cycleId);
  expect(cycle2.jobId).not.toBe(cycle1.jobId);
  expect(cycle2.status).toBe('ACTIVE');

  // Verify total cycles
  const totalCycles = await client.$queryRawUnsafe<Array<{ count: bigint }>>(
    'SELECT count(*) as count FROM media_processing_cycle WHERE media_ref = $1',
    p.ref
  );
  expect(Number(totalCycles[0].count)).toBe(2);
});
