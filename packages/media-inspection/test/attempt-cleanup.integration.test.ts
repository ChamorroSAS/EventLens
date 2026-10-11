import { describe, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  JobQueuePostgres,
  LocalSlots,
  PrismaTransactions,
  createPrismaClient,
  type RecoveryAuthority,
  type SqlTransaction,
} from '@eventlens/job-queue';
import {
  AttemptCleanupService,
  PostgresAttemptCleanupRepository,
  type AttemptCleanupCandidate,
  type CleanupStoragePort,
  type StorageDeleteResult,
} from '../src/attempt-cleanup.js';

const client = createPrismaClient(process.env.DATABASE_URL!);
const transactions = new PrismaTransactions(client, 5000);

class Authority implements RecoveryAuthority {
  epoch = 'cleanup-epoch-1';
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
      async release() {},
    };
  }
}

class TestStorage implements CleanupStoragePort {
  calls: { namespace: string; key: string; operationId: string }[] = [];
  outcomeOverrides = new Map<string, StorageDeleteResult['outcome']>();

  async deleteObject(ref: { namespace: string; key: string }, operationId: string): Promise<StorageDeleteResult> {
    this.calls.push({ namespace: ref.namespace, key: ref.key, operationId });
    const fullKey = `${ref.namespace}:${ref.key}`;
    const outcome = this.outcomeOverrides.get(fullKey) ?? 'DELETED';
    return {
      ref,
      outcome,
      bytesReleased: outcome === 'DELETED' || outcome === 'MISSING' ? 4096n : 0n,
    };
  }
}

async function prepareMediaWithAttempt(options: {
  status?: string;
  generation?: bigint;
  attemptStatus?: 'ACTIVE' | 'QUIESCENT' | 'UNKNOWN';
  jobRunning?: boolean;
} = {}) {
  const authority = new Authority();
  const slots = new LocalSlots(2);
  const eventRef = 'event:' + randomUUID();
  const organizerRef = 'organizer:' + randomUUID();
  const guestRef = 'guest:' + randomUUID();
  const mediaRef = 'media:' + randomUUID();
  const queueName = 'media-cleanup-' + randomUUID();

  // Create organizer entry
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
    },
  };

  const queue = new JobQueuePostgres(transactions, authority, policy, slots, { candidateScanLimit: 16 });

  const initialJobId = await transactions.run(tx =>
    queue.publish(tx, {
      type: 'MEDIA_INSPECTION',
      handlerVersion: '1',
      resourceRef: mediaRef,
      generation: options.generation ?? 1n,
      queue: queueName,
      dedupKey: 'cleanup-init:' + randomUUID(),
      priority: 1,
      payload: null,
      availableAt: new Date(0),
    })
  );

  const original = {
    namespace: 'vault-originals',
    key: 'originals/' + randomUUID() + '.jpg',
    immutableVersion: randomUUID(),
    sha256: 'a'.repeat(64),
    sizeBytes: 8192,
  };

  const status = options.status ?? 'PROCESSING_FAILED';
  const gen = options.generation ?? 1n;
  const intentId = 'intent:' + randomUUID();

  // Insert media_catalog
  await transactions.run(async tx => {
    await tx.execute(
      `INSERT INTO media_acceptance_intent(intent_id, media_ref, generation, fingerprint, facts)
       VALUES($1, $2, $3::bigint, $4, $5::jsonb)`,
      intentId,
      mediaRef,
      gen,
      'fp:' + randomUUID(),
      JSON.stringify({ declaredMime: 'image/jpeg' })
    );

    await tx.execute(
      `INSERT INTO media_catalog(media_ref, intent_id, event_ref, guest_ref, generation, revision, status, original, job_id)
       VALUES($1, $2, $3, $4, $5::bigint, 1::bigint, $6, $7::jsonb, $8::uuid)`,
      mediaRef,
      intentId,
      eventRef,
      guestRef,
      gen,
      status,
      JSON.stringify(original),
      initialJobId
    );

    const activeDerivToken = randomUUID();
    const promotionOpId = 'op-active-deriv-' + randomUUID();
    await tx.execute(
      `INSERT INTO job_attempt(token, job_id, number, fence, owner, epoch, generation, started_at)
       VALUES($1::uuid, $2::uuid, 1, 1::bigint, 'test-owner', 'cleanup-epoch-1', $3::bigint, clock_timestamp())`,
      activeDerivToken,
      initialJobId,
      gen
    );

    await tx.execute(
      `INSERT INTO media_promotion_receipt(
        operation_id, media_ref, generation, previous_revision, revision,
        job_id, token, epoch, candidate_fingerprint, candidate, governance,
        status, committed_at
      ) VALUES(
        $1, $2, $3::bigint, 0::bigint, 1::bigint,
        $4::uuid, $5::uuid, 'cleanup-epoch-1', 'deriv-fp', '{}'::jsonb,
        '{"mode":"AUTO","revision":"1","decisionRevision":"1","decision":"ALLOW"}'::jsonb,
        'PUBLISHED', clock_timestamp()
      )`,
      promotionOpId,
      mediaRef,
      gen,
      initialJobId,
      activeDerivToken
    );

    // Insert an active derivative
    await tx.execute(
      `INSERT INTO media_active_derivative(media_ref, generation, role, reference, operation_id)
       VALUES($1, $2::bigint, 'THUMBNAIL', $3::jsonb, $4)`,
      mediaRef,
      gen,
      JSON.stringify({
        namespace: 'vault-derivatives',
        key: 'derivatives/' + randomUUID() + '-thumb.jpg',
        immutableVersion: randomUUID(),
        sha256: 'b'.repeat(64),
        sizeBytes: 2048,
      }),
      promotionOpId
    );
  });

  // Query active derivative to know its exact key
  const activeDerivRows = await transactions.run(async tx => {
    return tx.query<{ reference: any }>(
      'SELECT reference FROM media_active_derivative WHERE media_ref=$1',
      mediaRef
    );
  });
  const activeDerivRef = activeDerivRows[0].reference;

  // Insert attempt in execution_inventory
  const attemptId = randomUUID();
  const token = randomUUID();
  const attemptStatus = options.attemptStatus ?? 'QUIESCENT';

  const scratchKey = 'scratch/' + randomUUID() + '.tmp';
  const failedPreviewKey = 'scratch/' + randomUUID() + '-preview.tmp';

  const attemptOutputs = [
    // Output 1: Matches original (MUST BE RETAINED)
    {
      file: 'original.jpg',
      destination: { namespace: original.namespace, key: original.key },
      operationId: 'op-out-orig',
      sizeBytes: 8192,
    },
    // Output 2: Matches active derivative (MUST BE RETAINED)
    {
      file: 'thumb.jpg',
      destination: { namespace: activeDerivRef.namespace, key: activeDerivRef.key },
      operationId: 'op-out-thumb',
      sizeBytes: 2048,
    },
    // Output 3: Obsolete scratch output (MUST BE DELETED)
    {
      file: 'scratch1.tmp',
      destination: { namespace: 'vault-scratch', key: scratchKey },
      operationId: 'op-out-scratch1',
      sizeBytes: 4096,
    },
    // Output 4: Obsolete failed preview (MUST BE DELETED)
    {
      file: 'preview-failed.tmp',
      destination: { namespace: 'vault-scratch', key: failedPreviewKey },
      operationId: 'op-out-scratch2',
      sizeBytes: 12288,
    },
  ];

  const attemptRecord = {
    id: attemptId,
    token,
    jobId: initialJobId,
    resourceRef: mediaRef,
    generation: String(gen),
    fence: '1',
    epoch: 'epoch-1',
    input: original,
    outputs: attemptOutputs,
    readOperationId: 'read-op-1',
    limits: { cpu: 1, memoryBytes: 1000000 },
    status: attemptStatus,
    result: 'PROCESSING_ERROR',
  };

  await transactions.run(async tx => {
    await tx.execute(
      `INSERT INTO execution_inventory(id, token, phase_id, record, status, created_at, updated_at)
       VALUES($1::uuid, $2::uuid, 'photo-derivatives', $3::jsonb, $4, clock_timestamp(), clock_timestamp())`,
      attemptId,
      token,
      JSON.stringify(attemptRecord),
      attemptStatus
    );

    if (options.jobRunning) {
      await tx.execute(
        `UPDATE job_queue
         SET status = 'PROCESSING', owner = 'worker-1', token = $2::uuid, epoch = 'cleanup-epoch-1', lease_until = clock_timestamp() + interval '5 minutes'
         WHERE id = $1::uuid`,
        initialJobId,
        token
      );
    }
  });

  return {
    mediaRef,
    eventRef,
    initialJobId,
    original,
    activeDerivRef,
    attemptId,
    token,
    scratchKey,
    failedPreviewKey,
  };
}

describe('AttemptCleanupService Integration Tests (PostgreSQL 16)', () => {
  afterAll(async () => {
    await client.$disconnect();
  });

  it('performs full cleanup of failed attempt: deletes scratch outputs while strictly preserving original and active derivatives', async () => {
    const fixture = await prepareMediaWithAttempt();
    const repo = new PostgresAttemptCleanupRepository();
    const storage = new TestStorage();
    const service = new AttemptCleanupService(repo, storage, undefined, action => transactions.run(action));

    const opId = 'integ-clean-op-1-' + randomUUID();
    const receipt = await service.execute({
      attemptId: fixture.attemptId,
      mediaRef: fixture.mediaRef,
      generation: 1n,
      operationId: opId,
    });

    expect(receipt.status).toBe('COMPLETED');
    expect(receipt.deletedCount).toBe(2);
    expect(receipt.retainedCount).toBe(2);
    expect(receipt.pendingCount).toBe(0);

    // Verify storage was called for scratch outputs only
    expect(storage.calls).toHaveLength(2);
    const calledKeys = storage.calls.map(c => c.key);
    expect(calledKeys).toContain(fixture.scratchKey);
    expect(calledKeys).toContain(fixture.failedPreviewKey);

    // Verify physical cleanup ledger rows in PostgreSQL
    const ledgerRows = await transactions.run(async tx => {
      return tx.query<{ namespace: string; key: string; status: string; bytes_released: bigint }>(
        `SELECT namespace, key, status, bytes_released
         FROM media_physical_cleanup_ledger
         WHERE media_ref = $1
         ORDER BY key`,
        fixture.mediaRef
      );
    });
    expect(ledgerRows).toHaveLength(2);
    expect(ledgerRows[0].status).toBe('DELETED');
    expect(ledgerRows[1].status).toBe('DELETED');

    // Verify audit trail in PostgreSQL
    const auditRows = await transactions.run(async tx => {
      return tx.query<{ decision: string; actor: string }>(
        `SELECT decision, actor
         FROM media_attempt_cleanup_audit
         WHERE operation_id = $1`,
        opId
      );
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].decision).toBe('CLEANED');
    expect(auditRows[0].actor).toBe('SYSTEM');

    // Verify media_catalog original is completely untouched
    const catalogRows = await transactions.run(async tx => {
      return tx.query<{ original: any; status: string }>(
        'SELECT original, status FROM media_catalog WHERE media_ref = $1',
        fixture.mediaRef
      );
    });
    expect(catalogRows[0].original.key).toBe(fixture.original.key);
    expect(catalogRows[0].original.namespace).toBe(fixture.original.namespace);

    // Verify media_active_derivative is completely untouched
    const derivRows = await transactions.run(async tx => {
      return tx.query<{ reference: any }>(
        'SELECT reference FROM media_active_derivative WHERE media_ref = $1',
        fixture.mediaRef
      );
    });
    expect(derivRows).toHaveLength(1);
    expect(derivRows[0].reference.key).toBe(fixture.activeDerivRef.key);
  });

  it('prevents double liberation in media_physical_cleanup_ledger on duplicate keys', async () => {
    const fixture = await prepareMediaWithAttempt();
    const repo = new PostgresAttemptCleanupRepository();
    const storage = new TestStorage();
    const service = new AttemptCleanupService(repo, storage, undefined, action => transactions.run(action));

    // First cleanup
    const doubleOp1 = 'integ-clean-double-1-' + randomUUID();
    const doubleOp2 = 'integ-clean-double-2-' + randomUUID();
    await service.execute({
      attemptId: fixture.attemptId,
      mediaRef: fixture.mediaRef,
      generation: 1n,
      operationId: doubleOp1,
    });

    const ledgerCountFirst = await transactions.run(async tx => {
      return tx.query<{ count: string }>(
        'SELECT count(*)::text as count FROM media_physical_cleanup_ledger WHERE media_ref = $1',
        fixture.mediaRef
      );
    });
    expect(ledgerCountFirst[0].count).toBe('2');

    // Run second cleanup with a new operationId for the same candidate
    const secondReceipt = await service.execute({
      attemptId: fixture.attemptId,
      mediaRef: fixture.mediaRef,
      generation: 1n,
      operationId: doubleOp2,
    });

    // Keys were already released, so storage wasn't called again for those keys
    expect(secondReceipt.status).toBe('COMPLETED');
    expect(secondReceipt.deletedCount).toBe(2);

    const ledgerCountSecond = await transactions.run(async tx => {
      return tx.query<{ count: string }>(
        'SELECT count(*)::text as count FROM media_physical_cleanup_ledger WHERE media_ref = $1',
        fixture.mediaRef
      );
    });
    // Ledger count has NOT doubled! Exactly 2 records remain!
    expect(ledgerCountSecond[0].count).toBe('2');
  });

  it('supports idempotent replay returning existing database receipt with wasExisting: true', async () => {
    const fixture = await prepareMediaWithAttempt();
    const repo = new PostgresAttemptCleanupRepository();
    const storage = new TestStorage();
    const service = new AttemptCleanupService(repo, storage, undefined, action => transactions.run(action));

    const replayOp = 'integ-replay-op-' + randomUUID();
    const first = await service.execute({
      attemptId: fixture.attemptId,
      mediaRef: fixture.mediaRef,
      generation: 1n,
      operationId: replayOp,
    });

    const second = await service.execute({
      attemptId: fixture.attemptId,
      mediaRef: fixture.mediaRef,
      generation: 1n,
      operationId: replayOp,
    });

    expect(second.wasExisting).toBe(true);
    expect(second.operationId).toBe(first.operationId);
    expect(second.status).toBe(first.status);
    expect(second.deletedCount).toBe(first.deletedCount);
  });

  it('handles partial storage failure (UNKNOWN) and recovers cleanly on subsequent retry', async () => {
    const fixture = await prepareMediaWithAttempt();
    const repo = new PostgresAttemptCleanupRepository();
    const storage = new TestStorage();

    // Make one scratch output return UNKNOWN
    storage.outcomeOverrides.set(`vault-scratch:${fixture.scratchKey}`, 'UNKNOWN');

    const service = new AttemptCleanupService(repo, storage, undefined, action => transactions.run(action));

    const partialOp1 = 'integ-partial-op-1-' + randomUUID();
    const firstReceipt = await service.execute({
      attemptId: fixture.attemptId,
      mediaRef: fixture.mediaRef,
      generation: 1n,
      operationId: partialOp1,
    });

    expect(firstReceipt.status).toBe('PARTIAL');
    expect(firstReceipt.deletedCount).toBe(1); // failedPreviewKey succeeded
    expect(firstReceipt.pendingCount).toBe(1); // scratchKey was UNKNOWN

    // Ledger only recorded the 1 confirmed deletion
    const ledgerFirst = await transactions.run(async tx => {
      return tx.query<{ key: string }>(
        'SELECT key FROM media_physical_cleanup_ledger WHERE media_ref = $1',
        fixture.mediaRef
      );
    });
    expect(ledgerFirst).toHaveLength(1);
    expect(ledgerFirst[0].key).toBe(fixture.failedPreviewKey);

    // Now resolve UNKNOWN: storage succeeds on retry
    storage.outcomeOverrides.set(`vault-scratch:${fixture.scratchKey}`, 'DELETED');

    const partialOp2 = 'integ-partial-op-2-' + randomUUID();
    const retryReceipt = await service.execute({
      attemptId: fixture.attemptId,
      mediaRef: fixture.mediaRef,
      generation: 1n,
      operationId: partialOp2,
    });

    expect(retryReceipt.status).toBe('COMPLETED');
    expect(retryReceipt.deletedCount).toBe(2);
    expect(retryReceipt.pendingCount).toBe(0);

    // Ledger now records both confirmed deletions
    const ledgerSecond = await transactions.run(async tx => {
      return tx.query<{ key: string }>(
        'SELECT key FROM media_physical_cleanup_ledger WHERE media_ref = $1',
        fixture.mediaRef
      );
    });
    expect(ledgerSecond).toHaveLength(2);
  });

  it('rejects cleanup if attempt status is ACTIVE with NON_QUIESCENT_WRITER', async () => {
    const fixture = await prepareMediaWithAttempt({ attemptStatus: 'ACTIVE' });
    const repo = new PostgresAttemptCleanupRepository();
    const storage = new TestStorage();
    const service = new AttemptCleanupService(repo, storage, undefined, action => transactions.run(action));

    await expect(
      service.execute({
        attemptId: fixture.attemptId,
        mediaRef: fixture.mediaRef,
        generation: 1n,
        operationId: 'integ-active-op-' + randomUUID(),
      })
    ).rejects.toMatchObject({ code: 'NON_QUIESCENT_WRITER' });
  });

  it('rejects cleanup if job currently holds an active lease with ACTIVE_LEASE_HELD', async () => {
    const fixture = await prepareMediaWithAttempt({ jobRunning: true });
    const repo = new PostgresAttemptCleanupRepository();
    const storage = new TestStorage();
    const service = new AttemptCleanupService(repo, storage, undefined, action => transactions.run(action));

    await expect(
      service.execute({
        attemptId: fixture.attemptId,
        mediaRef: fixture.mediaRef,
        generation: 1n,
        operationId: 'integ-lease-op-' + randomUUID(),
      })
    ).rejects.toMatchObject({ code: 'ACTIVE_LEASE_HELD' });
  });
});

