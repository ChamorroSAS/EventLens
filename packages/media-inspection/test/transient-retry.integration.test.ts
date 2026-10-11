import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {JobQueuePostgres,LocalSlots,PrismaTransactions,createPrismaClient,type RecoveryAuthority,type SqlTransaction} from '@eventlens/job-queue';
import {ApplyTransientRetry,PostgresMediaRetryRepository,type MediaRetryRepository} from '../src/transient-retry.js';
import type {InspectionInput} from '../src/contracts.js';

const client = createPrismaClient(process.env.DATABASE_URL!);
const transactions = new PrismaTransactions(client, 5000);
const observations: unknown[] = [];

class Authority implements RecoveryAuthority {
  epoch = 'retry-epoch-1';
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

async function prepared(attemptOverrides: { leaseMs?: number } = {}) {
  const authority = new Authority();
  const slots = new LocalSlots(2);
  const eventRef = 'event:' + randomUUID();
  const ref = 'media:' + randomUUID();

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
  const queueName = 'media-retry-' + randomUUID();
  const jobId = await transactions.run(tx =>
    queue.publish(tx, {
      type: 'MEDIA_INSPECTION',
      handlerVersion: '1',
      resourceRef: ref,
      generation: 1n,
      queue: queueName,
      dedupKey: randomUUID(),
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

  await transactions.run(async tx => {
    const intent = randomUUID();
    await tx.execute('INSERT INTO media_acceptance_intent VALUES($1,$2,1,$3,$4::jsonb)', intent, ref, original.sha256, '{}');
    await tx.execute(
      "INSERT INTO media_catalog VALUES($1,$2,$3,'guest',1,1,'UPLOADED',$4::jsonb,$5::uuid)",
      ref,
      intent,
      eventRef,
      JSON.stringify({
        namespace: original.namespace,
        key: original.key,
        version: original.immutableVersion,
        sha256: original.sha256,
        bytes: '100'
      }),
      jobId
    );
  });

  const reservation = await queue.reserve([queueName], 'worker-1', 1, attemptOverrides.leaseMs ?? 30000);
  const job = reservation.jobs[0];
  const repository = new PostgresMediaRetryRepository();
  const handler = new ApplyTransientRetry(repository, queue, { baseDelayMs: 200, maxAttempts: 3 });

  const input: InspectionInput = {
    mediaRef: ref,
    generation: 1n,
    revision: 1n,
    original,
    declaredMime: 'image/jpeg'
  };

  return { authority, queue, job, input, repository, handler, reservation, original, eventRef, queueName };
}

beforeAll(async () => {
  // Ensure tables exist
});

afterAll(async () => {
  try {
    writeFileSync(
      process.env.MEDIA_RETRY_OBSERVATIONS_PATH ?? '/evidence/retry-observations.json',
      JSON.stringify(observations, null, 2)
    );
  } catch {}
  await client.$disconnect();
});

it('transient failure on attempt 1 schedules RETRYING, commits receipt/audit, and preserves original bytes', async () => {
  const p = await prepared();
  try {
    const opId = randomUUID();
    const res = await p.handler.execute(p.job, p.input, new Error('connect ETIMEDOUT storage.internal'), opId);
    expect(res.result).toBe('COMPLETED');
    expect(res.disposition).toBe('RETRYING');
    expect(res.retryAt).toBeInstanceOf(Date);
    expect(res.receipt.disposition).toBe('RETRYING');

    // Verify job in database
    const jobs = await client.$queryRawUnsafe<Array<{ status: string; attempt: number }>>(
      'SELECT status, attempt FROM job_queue WHERE id = $1::uuid',
      p.job.jobId
    );
    expect(jobs[0].status).toBe('RETRYING');
    expect(jobs[0].attempt).toBe(1);

    // Verify media_catalog preserved
    const media = await client.$queryRawUnsafe<Array<{ status: string; original: unknown }>>(
      'SELECT status, original FROM media_catalog WHERE media_ref = $1',
      p.input.mediaRef
    );
    expect(media[0].status).toBe('UPLOADED');
    expect(media[0].original).toBeDefined();

    // Verify receipt & audit
    const receipts = await client.$queryRawUnsafe<Array<{ disposition: string; attempt: number }>>(
      'SELECT disposition, attempt FROM media_retry_receipt WHERE operation_id = $1',
      opId
    );
    expect(receipts).toHaveLength(1);
    expect(receipts[0].disposition).toBe('RETRYING');

    const audits = await client.$queryRawUnsafe<Array<{ category: string; sanitized_reason: string }>>(
      'SELECT category, sanitized_reason FROM media_retry_audit WHERE operation_id = $1',
      opId
    );
    expect(audits).toHaveLength(1);
    expect(audits[0].category).toBe('NETWORK_TIMEOUT');

    observations.push({ test: 'attempt_1_retry', opId, disposition: res.disposition });
  } finally {
    p.reservation.releaseAfterQuiescence();
  }
});

it('transient failure on attempt 2 advances attempt count and schedules RETRYING', async () => {
  const p = await prepared();
  try {
    const opId1 = randomUUID();
    await p.handler.execute(p.job, p.input, new Error('ETIMEDOUT'), opId1);
    p.reservation.releaseAfterQuiescence();

    // Fast-forward availability in database
    await client.$executeRawUnsafe(
      "UPDATE job_queue SET available_at = clock_timestamp() - interval '1 second' WHERE id = $1::uuid",
      p.job.jobId
    );

    // Claim attempt 2
    const res2 = await p.queue.reserve([p.queueName], 'worker-2', 1, 30000);
    expect(res2.jobs).toHaveLength(1);
    const job2 = res2.jobs[0];
    expect(job2.attempt).toBe(2);

    // Attempt 2 fails transiently
    const opId2 = randomUUID();
    const result2 = await p.handler.execute(job2, p.input, { status: 503, message: '503 Service Unavailable' }, opId2);
    expect(result2.disposition).toBe('RETRYING');
    expect(result2.receipt.attempt).toBe(2);

    res2.releaseAfterQuiescence();
    observations.push({ test: 'attempt_2_retry', opId2, disposition: result2.disposition });
  } catch (e) {
    p.reservation.releaseAfterQuiescence();
    throw e;
  }
});

it('attempt 3 failure exhausts budget and transitions to DEAD without scheduling 4th attempt', async () => {
  const p = await prepared();
  try {
    // Attempt 1 fails
    await p.handler.execute(p.job, p.input, new Error('ETIMEDOUT'), randomUUID());
    p.reservation.releaseAfterQuiescence();

    // Advance to attempt 2
    await client.$executeRawUnsafe(
      "UPDATE job_queue SET available_at = clock_timestamp() - interval '1 second' WHERE id = $1::uuid",
      p.job.jobId
    );
    const res2 = await p.queue.reserve([p.queueName], 'worker-2', 1, 30000);
    await p.handler.execute(res2.jobs[0], p.input, new Error('ETIMEDOUT'), randomUUID());
    res2.releaseAfterQuiescence();

    // Advance to attempt 3
    await client.$executeRawUnsafe(
      "UPDATE job_queue SET available_at = clock_timestamp() - interval '1 second' WHERE id = $1::uuid",
      p.job.jobId
    );
    const res3 = await p.queue.reserve([p.queueName], 'worker-3', 1, 30000);
    expect(res3.jobs[0].attempt).toBe(3);

    // Attempt 3 fails: budget exhausted!
    const opId3 = randomUUID();
    const finalRes = await p.handler.execute(res3.jobs[0], p.input, new Error('ETIMEDOUT'), opId3);
    expect(finalRes.disposition).toBe('DEAD');
    expect(finalRes.retryAt).toBeNull();
    res3.releaseAfterQuiescence();

    // Verify job_queue status is DEAD
    const jobs = await client.$queryRawUnsafe<Array<{ status: string; attempt: number }>>(
      'SELECT status, attempt FROM job_queue WHERE id = $1::uuid',
      p.job.jobId
    );
    expect(jobs[0].status).toBe('DEAD');
    expect(jobs[0].attempt).toBe(3);

    // Verify media_catalog original is intact (DEAD does NOT delete original)
    const media = await client.$queryRawUnsafe<Array<{ status: string; original: unknown }>>(
      'SELECT status, original FROM media_catalog WHERE media_ref = $1',
      p.input.mediaRef
    );
    expect(media[0].status).toBe('UPLOADED');
    expect(media[0].original).toBeDefined();

    // Verify no 4th attempt can be claimed
    await client.$executeRawUnsafe(
      "UPDATE job_queue SET available_at = clock_timestamp() - interval '1 second' WHERE id = $1::uuid",
      p.job.jobId
    );
    const res4 = await p.queue.reserve([p.queueName], 'worker-4', 1, 30000);
    expect(res4.jobs).toHaveLength(0);
    res4.releaseAfterQuiescence();

    observations.push({ test: 'attempt_3_dead_exhausted', opId3, disposition: finalRes.disposition });
  } catch (e) {
    p.reservation.releaseAfterQuiescence();
    throw e;
  }
});

it('recoverExpiredLeases reclaims abandoned lease and stale worker cannot commit late result', async () => {
  const p = await prepared();
  try {
    // Stale lease: expire it in DB
    await client.$executeRawUnsafe(
      "UPDATE job_queue SET lease_until = clock_timestamp() - interval '1 second' WHERE id = $1::uuid",
      p.job.jobId
    );

    // Recovery runs
    const recovered = await p.queue.recoverExpiredLeases({ queues: [p.queueName], maxAttempts: 3, backoffMs: 0 });
    expect(recovered).toHaveLength(1);
    expect(recovered[0].disposition).toBe('RETRYING');
    expect(recovered[0].previousAttempt).toBe(1);

    // The old worker (holding stale token/fence) attempts to commit retry or complete
    await expect(p.handler.execute(p.job, p.input, new Error('ETIMEDOUT'), randomUUID())).rejects.toMatchObject({
      code: 'LEASE_LOST'
    });

    // Claim attempt 2 with new worker
    const res2 = await p.queue.reserve([p.queueName], 'worker-2', 1, 30000);
    expect(res2.jobs).toHaveLength(1);
    expect(res2.jobs[0].attempt).toBe(2);
    expect(res2.jobs[0].token).not.toBe(p.job.token);

    res2.releaseAfterQuiescence();
    observations.push({ test: 'abandoned_lease_recovery', recoveredCount: recovered.length });
  } finally {
    p.reservation.releaseAfterQuiescence();
  }
});

it('recoverExpiredLeases on attempt 3 marks DEAD and schedules no further attempts', async () => {
  const p = await prepared();
  try {
    // Manually set attempt to 3 to simulate 3rd execution crash
    await client.$executeRawUnsafe(
      "UPDATE job_queue SET attempt = 3, lease_until = clock_timestamp() - interval '1 second' WHERE id = $1::uuid",
      p.job.jobId
    );

    const recovered = await p.queue.recoverExpiredLeases({ queues: [p.queueName], maxAttempts: 3 });
    expect(recovered).toHaveLength(1);
    expect(recovered[0].disposition).toBe('DEAD');

    const jobs = await client.$queryRawUnsafe<Array<{ status: string }>>(
      'SELECT status FROM job_queue WHERE id = $1::uuid',
      p.job.jobId
    );
    expect(jobs[0].status).toBe('DEAD');

    // No fourth attempt
    const res = await p.queue.reserve([p.queueName], 'worker-4', 1, 30000);
    expect(res.jobs).toHaveLength(0);
    res.releaseAfterQuiescence();
  } finally {
    p.reservation.releaseAfterQuiescence();
  }
});

it('compatible replay with same operationId returns ALREADY_COMMITTED and matching receipt', async () => {
  const p = await prepared();
  try {
    const opId = randomUUID();
    const first = await p.handler.execute(p.job, p.input, new Error('ETIMEDOUT'), opId);
    expect(first.result).toBe('COMPLETED');

    const second = await p.handler.execute(p.job, p.input, new Error('ETIMEDOUT'), opId);
    expect(second.result).toBe('ALREADY_COMMITTED');
    expect(second.receipt.operationId).toBe(first.receipt.operationId);
    expect(second.receipt.retryFingerprint).toBe(first.receipt.retryFingerprint);
  } finally {
    p.reservation.releaseAfterQuiescence();
  }
});

it('conflicting replay with same operationId and different outcome throws IDEMPOTENCY_CONFLICT', async () => {
  const p = await prepared();
  try {
    const opId = randomUUID();
    await p.handler.execute(p.job, p.input, new Error('ETIMEDOUT'), opId);
    await expect(p.handler.execute(p.job, p.input, { code: '40P01', message: 'deadlock' }, opId)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT'
    });
  } finally {
    p.reservation.releaseAfterQuiescence();
  }
});

it('rolls back entire transaction if repository fails during retry recording', async () => {
  const p = await prepared();
  try {
    const brokenRepo: MediaRetryRepository = {
      lock: p.repository.lock.bind(p.repository),
      receipt: p.repository.receipt.bind(p.repository),
      async record() {
        throw new Error('db failure');
      }
    };
    const handler = new ApplyTransientRetry(brokenRepo, p.queue);
    await expect(handler.execute(p.job, p.input, new Error('ETIMEDOUT'), randomUUID())).rejects.toThrow('db failure');

    // Job stays in PROCESSING
    const jobs = await client.$queryRawUnsafe<Array<{ status: string }>>(
      'SELECT status FROM job_queue WHERE id = $1::uuid',
      p.job.jobId
    );
    expect(jobs[0].status).toBe('PROCESSING');
  } finally {
    p.reservation.releaseAfterQuiescence();
  }
});

it.each(['QUARANTINED', 'PUBLISHED', 'TRASHED', 'DELETED', 'REJECTED'])(
  'never overwrites terminal or non-processing media status %s',
  async status => {
    const p = await prepared();
    try {
      await client.$executeRawUnsafe(
        'UPDATE media_catalog SET status = $2 WHERE media_ref = $1',
        p.input.mediaRef,
        status
      );
      await expect(p.handler.execute(p.job, p.input, new Error('ETIMEDOUT'), randomUUID())).rejects.toThrow();

      const media = await client.$queryRawUnsafe<Array<{ status: string }>>(
        'SELECT status FROM media_catalog WHERE media_ref = $1',
        p.input.mediaRef
      );
      expect(media[0].status).toBe(status);
    } finally {
      p.reservation.releaseAfterQuiescence();
    }
  }
);
