import {afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {JobQueuePostgres,LocalSlots,PrismaTransactions,createPrismaClient,type RecoveryAuthority,type SqlTransaction} from '@eventlens/job-queue';
import {ApplyTerminalFailure,PostgresTerminalFailureRepository,type TerminalFailureRepository} from '../src/terminal-failure.js';
import type {InspectionInput, SafetyFact} from '../src/contracts.js';

const client = createPrismaClient(process.env.DATABASE_URL!);
const transactions = new PrismaTransactions(client, 5000);
const observations: unknown[] = [];

class Authority implements RecoveryAuthority {
  epoch = 'term-epoch-1';
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

async function prepared(attemptOverrides: { attempt?: number; safetyOutcome?: 'APPROVED' | 'INCONCLUSIVE' | 'DENIED' | 'NONE' } = {}) {
  const authority = new Authority();
  const slots = new LocalSlots(2);
  const eventRef = 'event:' + randomUUID();
  const ref = 'media:' + randomUUID();
  const queueName = 'media-term-' + randomUUID();

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

  const reservation = await queue.reserve([queueName], 'worker-1', 1, 30000);
  const job = reservation.jobs[0];

  // If overriding attempt count
  if (attemptOverrides.attempt && attemptOverrides.attempt > 1) {
    await client.$executeRawUnsafe(
      'UPDATE job_queue SET attempt = $2 WHERE id = $1::uuid',
      job.jobId,
      attemptOverrides.attempt
    );
    (job as any).attempt = attemptOverrides.attempt;
  }

  // If setting a safety fact in media_inspection
  if (attemptOverrides.safetyOutcome && attemptOverrides.safetyOutcome !== 'NONE') {
    const fact: SafetyFact = {
      schemaVersion: 1,
      jobId: job.jobId,
      executionToken: job.token,
      fence: String(job.fence),
      epoch: job.epoch,
      mediaRef: ref,
      generation: '1',
      revision: '1',
      originalSha256: original.sha256,
      originalVersion: original.immutableVersion,
      outcome: attemptOverrides.safetyOutcome,
      format: {
        status: attemptOverrides.safetyOutcome === 'APPROVED' ? 'VALID' : attemptOverrides.safetyOutcome === 'INCONCLUSIVE' ? 'INCONCLUSIVE' : 'INVALID',
        reason: 'TEST_REASON'
      },
      malware: {
        status: attemptOverrides.safetyOutcome === 'DENIED' ? 'THREAT_DETECTED' : attemptOverrides.safetyOutcome === 'INCONCLUSIVE' ? 'INCONCLUSIVE' : 'NO_THREAT_DETECTED',
        reason: 'TEST_MALWARE',
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

  const repository = new PostgresTerminalFailureRepository();
  const handler = new ApplyTerminalFailure(repository, queue);

  const input: InspectionInput = {
    mediaRef: ref,
    generation: 1n,
    revision: 1n,
    original,
    declaredMime: 'image/jpeg'
  };

  return { authority, queue, job, input, repository, handler, reservation, original, eventRef, queueName };
}

afterAll(async () => {
  try {
    writeFileSync(
      process.env.MEDIA_TERMINAL_FAILURE_OBSERVATIONS_PATH ?? '/evidence/terminal-failure-observations.json',
      JSON.stringify(observations, null, 2)
    );
  } catch {}
});

it('budget exhausted on attempt 3 sets PROCESSING_FAILED, DEAD job, and preserves original', async () => {
  const p = await prepared({ attempt: 3, safetyOutcome: 'APPROVED' });
  try {
    const opId = randomUUID();
    const sensitiveError = new Error('postgres://user:secret@postgres:5432/db connection timed out');
    const result = await p.handler.execute(p.job, p.input, sensitiveError, opId);

    expect(result.result).toBe('COMPLETED');
    expect(result.receipt.cause).toBe('BUDGET_EXHAUSTED');
    expect(result.receipt.downloadEligible).toBe(true);
    expect(result.receipt.revision).toBe('2');

    // 1. Verify media_catalog
    const media = await client.$queryRawUnsafe<Array<{ status: string; revision: bigint; original: any }>>(
      'SELECT status, revision, original FROM media_catalog WHERE media_ref = $1',
      p.input.mediaRef
    );
    expect(media).toHaveLength(1);
    expect(media[0].status).toBe('PROCESSING_FAILED');
    expect(media[0].revision).toBe(2n);
    expect(media[0].original).toBeDefined();
    expect(media[0].original.sha256).toBe(p.original.sha256);

    // 2. Verify job_queue is DEAD
    const jobs = await client.$queryRawUnsafe<Array<{ status: string; attempt: number }>>(
      'SELECT status, attempt FROM job_queue WHERE id = $1::uuid',
      p.job.jobId
    );
    expect(jobs[0].status).toBe('DEAD');

    // 3. Verify receipt in media_terminal_failure_receipt
    const receipts = await client.$queryRawUnsafe<Array<{
      cause: string;
      sanitized_reason: string;
      download_eligible: boolean;
    }>>('SELECT cause, sanitized_reason, download_eligible FROM media_terminal_failure_receipt WHERE operation_id = $1', opId);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].cause).toBe('BUDGET_EXHAUSTED');
    expect(receipts[0].download_eligible).toBe(true);
    expect(receipts[0].sanitized_reason).not.toContain('postgres://');
    expect(receipts[0].sanitized_reason).not.toContain('secret');

    // 4. Verify audit in media_terminal_failure_audit
    const audits = await client.$queryRawUnsafe<Array<{
      cause: string;
      download_eligible: boolean;
      safety_outcome: string;
      transition: string;
      actor: string;
    }>>('SELECT cause, download_eligible, safety_outcome, transition, actor FROM media_terminal_failure_audit WHERE operation_id = $1', opId);
    expect(audits).toHaveLength(1);
    expect(audits[0].cause).toBe('BUDGET_EXHAUSTED');
    expect(audits[0].download_eligible).toBe(true);
    expect(audits[0].safety_outcome).toBe('APPROVED');
    expect(audits[0].transition).toBe('PROCESSING_FAILED');
    expect(audits[0].actor).toBe('SYSTEM');

    observations.push({ test: 'budget_exhausted_processing_failed', opId });
  } finally {
    p.reservation.releaseAfterQuiescence();
  }
});

it('non-transient technical failure sets TERMINAL_TECHNICAL_ERROR directly on attempt 1', async () => {
  const p = await prepared({ attempt: 1, safetyOutcome: 'APPROVED' });
  try {
    const opId = randomUUID();
    const result = await p.handler.execute(p.job, p.input, new Error('Unknown container header corrupt'), opId);

    expect(result.result).toBe('COMPLETED');
    expect(result.receipt.cause).toBe('TERMINAL_TECHNICAL_ERROR');
    expect(result.receipt.downloadEligible).toBe(true);

    const media = await client.$queryRawUnsafe<Array<{ status: string }>>(
      'SELECT status FROM media_catalog WHERE media_ref = $1',
      p.input.mediaRef
    );
    expect(media[0].status).toBe('PROCESSING_FAILED');

    const jobs = await client.$queryRawUnsafe<Array<{ status: string }>>(
      'SELECT status FROM job_queue WHERE id = $1::uuid',
      p.job.jobId
    );
    expect(jobs[0].status).toBe('DEAD');
  } finally {
    p.reservation.releaseAfterQuiescence();
  }
});

it('denies download eligibility when safety fact is INCONCLUSIVE', async () => {
  const p = await prepared({ attempt: 1, safetyOutcome: 'INCONCLUSIVE' });
  try {
    const opId = randomUUID();
    const result = await p.handler.execute(p.job, p.input, new Error('Worker crash'), opId);

    expect(result.receipt.downloadEligible).toBe(false);

    const receipts = await client.$queryRawUnsafe<Array<{ download_eligible: boolean }>>(
      'SELECT download_eligible FROM media_terminal_failure_receipt WHERE operation_id = $1',
      opId
    );
    expect(receipts[0].download_eligible).toBe(false);

    const audits = await client.$queryRawUnsafe<Array<{ download_eligible: boolean; safety_outcome: string }>>(
      'SELECT download_eligible, safety_outcome FROM media_terminal_failure_audit WHERE operation_id = $1',
      opId
    );
    expect(audits[0].download_eligible).toBe(false);
    expect(audits[0].safety_outcome).toBe('INCONCLUSIVE');
  } finally {
    p.reservation.releaseAfterQuiescence();
  }
});

it('denies download eligibility when safety fact is DENIED (quarantined/malware)', async () => {
  const p = await prepared({ attempt: 1, safetyOutcome: 'DENIED' });
  try {
    const opId = randomUUID();
    const result = await p.handler.execute(p.job, p.input, new Error('Worker crash'), opId);

    expect(result.receipt.downloadEligible).toBe(false);

    const audits = await client.$queryRawUnsafe<Array<{ download_eligible: boolean; safety_outcome: string }>>(
      'SELECT download_eligible, safety_outcome FROM media_terminal_failure_audit WHERE operation_id = $1',
      opId
    );
    expect(audits[0].download_eligible).toBe(false);
    expect(audits[0].safety_outcome).toBe('DENIED');
  } finally {
    p.reservation.releaseAfterQuiescence();
  }
});

it('denies download eligibility when safety fact is PENDING (no prior safety inspection)', async () => {
  const p = await prepared({ attempt: 1, safetyOutcome: 'NONE' });
  try {
    const opId = randomUUID();
    const result = await p.handler.execute(p.job, p.input, new Error('Early technical fault'), opId);

    expect(result.receipt.downloadEligible).toBe(false);

    const audits = await client.$queryRawUnsafe<Array<{ download_eligible: boolean; safety_outcome: string }>>(
      'SELECT download_eligible, safety_outcome FROM media_terminal_failure_audit WHERE operation_id = $1',
      opId
    );
    expect(audits[0].download_eligible).toBe(false);
    expect(audits[0].safety_outcome).toBe('PENDING');
  } finally {
    p.reservation.releaseAfterQuiescence();
  }
});

it.each(['QUARANTINED', 'PUBLISHED', 'PENDING_REVIEW', 'TRASHED', 'DELETED', 'REJECTED'])(
  'never overwrites terminal or restrictive media status %s',
  async status => {
    const p = await prepared({ attempt: 1, safetyOutcome: 'APPROVED' });
    try {
      await client.$executeRawUnsafe(
        'UPDATE media_catalog SET status = $2 WHERE media_ref = $1',
        p.input.mediaRef,
        status
      );

      await expect(
        p.handler.execute(p.job, p.input, new Error('terminal technical fault'), randomUUID())
      ).rejects.toMatchObject({
        code: 'CONFLICT'
      });

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

it('compatible replay with same operationId returns ALREADY_COMMITTED and matching receipt', async () => {
  const p = await prepared({ attempt: 1, safetyOutcome: 'APPROVED' });
  try {
    const opId = randomUUID();
    const first = await p.handler.execute(p.job, p.input, new Error('Decoder out of memory'), opId);
    expect(first.result).toBe('COMPLETED');

    const second = await p.handler.execute(p.job, p.input, new Error('Decoder out of memory'), opId);
    expect(second.result).toBe('ALREADY_COMMITTED');
    expect(second.receipt.operationId).toBe(first.receipt.operationId);
    expect(second.receipt.failureFingerprint).toBe(first.receipt.failureFingerprint);
    expect(second.receipt.downloadEligible).toBe(first.receipt.downloadEligible);
  } finally {
    p.reservation.releaseAfterQuiescence();
  }
});

it('conflicting replay with same operationId and different cause/outcome throws IDEMPOTENCY_CONFLICT', async () => {
  const p = await prepared({ attempt: 1, safetyOutcome: 'APPROVED' });
  try {
    const opId = randomUUID();
    await p.handler.execute(p.job, p.input, new Error('First reason'), opId);
    await expect(
      p.handler.execute(p.job, p.input, new Error('Conflicting second reason'), opId)
    ).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT'
    });
  } finally {
    p.reservation.releaseAfterQuiescence();
  }
});

it('rolls back entire transaction if repository fails during terminal failure recording', async () => {
  const p = await prepared({ attempt: 1, safetyOutcome: 'APPROVED' });
  try {
    const brokenRepo: TerminalFailureRepository = {
      lock: p.repository.lock.bind(p.repository),
      receipt: p.repository.receipt.bind(p.repository),
      async apply() {
        throw new Error('database disk failure');
      }
    };
    const handler = new ApplyTerminalFailure(brokenRepo, p.queue);
    await expect(handler.execute(p.job, p.input, new Error('terminal fault'), randomUUID())).rejects.toThrow(
      'database disk failure'
    );

    // Job stays in PROCESSING
    const jobs = await client.$queryRawUnsafe<Array<{ status: string }>>(
      'SELECT status FROM job_queue WHERE id = $1::uuid',
      p.job.jobId
    );
    expect(jobs[0].status).toBe('PROCESSING');

    // Media stays in UPLOADED
    const media = await client.$queryRawUnsafe<Array<{ status: string }>>(
      'SELECT status FROM media_catalog WHERE media_ref = $1',
      p.input.mediaRef
    );
    expect(media[0].status).toBe('UPLOADED');
  } finally {
    p.reservation.releaseAfterQuiescence();
  }
});
