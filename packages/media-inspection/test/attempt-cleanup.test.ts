import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SqlTransaction } from '@eventlens/job-queue';
import type { OutputRef } from '@eventlens/media-execution';
import {
  AttemptCleanupService,
  AttemptCleanupError,
  type AttemptCleanupCandidate,
  type AttemptCleanupCommand,
  type AttemptCleanupRepository,
  type AttemptCleanupReceipt,
  type CleanupStoragePort,
  type RetentionPolicy,
  type StorageDeleteResult,
} from '../src/attempt-cleanup.js';

class MockCleanupStorage implements CleanupStoragePort {
  calls: { ref: OutputRef; operationId: string }[] = [];
  outcomeMap = new Map<string, StorageDeleteResult['outcome']>();
  defaultOutcome: StorageDeleteResult['outcome'] = 'DELETED';

  async deleteObject(ref: OutputRef, operationId: string): Promise<StorageDeleteResult> {
    this.calls.push({ ref, operationId });
    const key = `${ref.namespace}:${ref.key}`;
    const outcome = this.outcomeMap.get(key) ?? this.defaultOutcome;
    return {
      ref,
      outcome,
      bytesReleased: outcome === 'DELETED' || outcome === 'MISSING' ? 1024n : 0n,
    };
  }
}

class MockAttemptCleanupRepository implements AttemptCleanupRepository {
  receipts = new Map<string, AttemptCleanupReceipt>();
  candidates = new Map<string, AttemptCleanupCandidate>();
  mediaFacts = new Map<
    string,
    {
      generation: bigint;
      revision: bigint;
      status: string;
      original: { namespace: string; key: string };
      activeDerivatives: readonly { namespace: string; key: string; role: string }[];
    }
  >();
  activeLeases = new Set<string>();
  releasedKeys = new Set<string>();
  recordedCleanups: {
    receipt: AttemptCleanupReceipt;
    confirmed: readonly { namespace: string; key: string; status: 'DELETED' | 'MISSING'; bytesReleased: bigint }[];
  }[] = [];

  async findReceipt(_tx: SqlTransaction, operationId: string): Promise<AttemptCleanupReceipt | null> {
    return this.receipts.get(operationId) ?? null;
  }

  async loadCandidate(_tx: SqlTransaction, attemptId: string): Promise<AttemptCleanupCandidate | null> {
    return this.candidates.get(attemptId) ?? null;
  }

  async loadMediaFacts(
    _tx: SqlTransaction,
    mediaRef: string
  ): Promise<{
    generation: bigint;
    revision: bigint;
    status: string;
    original: { namespace: string; key: string };
    activeDerivatives: readonly { namespace: string; key: string; role: string }[];
  } | null> {
    return this.mediaFacts.get(mediaRef) ?? null;
  }

  async isJobLeaseActive(_tx: SqlTransaction, jobId: string): Promise<boolean> {
    return this.activeLeases.has(jobId);
  }

  async findAlreadyReleasedKeys(
    _tx: SqlTransaction,
    keys: readonly { namespace: string; key: string }[]
  ): Promise<Set<string>> {
    const found = new Set<string>();
    for (const k of keys) {
      const id = `${k.namespace}:${k.key}`;
      if (this.releasedKeys.has(id)) {
        found.add(id);
      }
    }
    return found;
  }

  async recordCleanup(
    _tx: SqlTransaction,
    receipt: AttemptCleanupReceipt,
    confirmedDeletions: readonly {
      namespace: string;
      key: string;
      status: 'DELETED' | 'MISSING';
      bytesReleased: bigint;
    }[]
  ): Promise<void> {
    this.receipts.set(receipt.operationId, receipt);
    for (const c of confirmedDeletions) {
      this.releasedKeys.add(`${c.namespace}:${c.key}`);
    }
    this.recordedCleanups.push({ receipt, confirmed: confirmedDeletions });
  }
}

const mockTx = {} as SqlTransaction;
const fakeRunTx = async <T>(action: (tx: SqlTransaction) => Promise<T>): Promise<T> => {
  return action(mockTx);
};

describe('AttemptCleanupService Unit Tests', () => {
  const mediaRef = 'media:test-1';
  const original = { namespace: 'bucket-orig', key: 'original/photo.jpg' };
  const activeThumb = { namespace: 'bucket-deriv', key: 'derivatives/thumb.jpg', role: 'THUMBNAIL' };

  function setupService() {
    const repo = new MockAttemptCleanupRepository();
    const storage = new MockCleanupStorage();

    repo.mediaFacts.set(mediaRef, {
      generation: 1n,
      revision: 2n,
      status: 'PUBLISHED',
      original,
      activeDerivatives: [activeThumb],
    });

    const service = new AttemptCleanupService(repo, storage, undefined, fakeRunTx);
    return { service, repo, storage };
  }

  it('rejects an active, non-quiescent attempt with NON_QUIESCENT_WRITER', async () => {
    const { service, repo } = setupService();
    const candidate: AttemptCleanupCandidate = {
      attemptId: randomUUID(),
      token: randomUUID(),
      jobId: randomUUID(),
      mediaRef,
      generation: 1n,
      status: 'ACTIVE', // non-quiescent
      outputs: [
        { file: 'scratch.tmp', destination: { namespace: 'bucket-scratch', key: 'scratch.tmp' }, operationId: 'op1' },
      ],
    };
    repo.candidates.set(candidate.attemptId, candidate);

    await expect(
      service.execute({
        attemptId: candidate.attemptId,
        mediaRef,
        generation: 1n,
        operationId: 'clean-op-1',
      })
    ).rejects.toThrowError(AttemptCleanupError);

    await expect(
      service.execute({
        attemptId: candidate.attemptId,
        mediaRef,
        generation: 1n,
        operationId: 'clean-op-1',
      })
    ).rejects.toMatchObject({ code: 'NON_QUIESCENT_WRITER' });
  });

  it('rejects an attempt when its job holds an active lease with ACTIVE_LEASE_HELD', async () => {
    const { service, repo } = setupService();
    const jobId = randomUUID();
    repo.activeLeases.add(jobId);

    const candidate: AttemptCleanupCandidate = {
      attemptId: randomUUID(),
      token: randomUUID(),
      jobId,
      mediaRef,
      generation: 1n,
      status: 'QUIESCENT',
      outputs: [
        { file: 'scratch.tmp', destination: { namespace: 'bucket-scratch', key: 'scratch.tmp' }, operationId: 'op1' },
      ],
    };
    repo.candidates.set(candidate.attemptId, candidate);

    await expect(
      service.execute({
        attemptId: candidate.attemptId,
        mediaRef,
        generation: 1n,
        operationId: 'clean-op-2',
      })
    ).rejects.toMatchObject({ code: 'ACTIVE_LEASE_HELD' });
  });

  it('strictly NEVER deletes original or active derivatives, retaining them and deleting only obsolete outputs', async () => {
    const { service, repo, storage } = setupService();

    const scratchOutput = {
      file: 'temp.jpg',
      destination: { namespace: 'bucket-scratch', key: 'temp/failed-render.jpg' },
      operationId: 'op-scratch',
      sizeBytes: 2048n,
    };

    const attemptOriginalOutput = {
      file: 'original.jpg',
      destination: { namespace: original.namespace, key: original.key }, // Identical to original
      operationId: 'op-orig',
    };

    const attemptActiveDerivOutput = {
      file: 'thumb.jpg',
      destination: { namespace: activeThumb.namespace, key: activeThumb.key }, // Identical to active derivative
      operationId: 'op-deriv',
    };

    const candidate: AttemptCleanupCandidate = {
      attemptId: randomUUID(),
      token: randomUUID(),
      jobId: randomUUID(),
      mediaRef,
      generation: 1n,
      status: 'QUIESCENT',
      result: 'PROCESSING_ERROR',
      outputs: [attemptOriginalOutput, attemptActiveDerivOutput, scratchOutput],
    };
    repo.candidates.set(candidate.attemptId, candidate);

    const receipt = await service.execute({
      attemptId: candidate.attemptId,
      mediaRef,
      generation: 1n,
      operationId: 'clean-op-3',
    });

    expect(receipt.status).toBe('COMPLETED');
    expect(receipt.deletedCount).toBe(1);
    expect(receipt.retainedCount).toBe(2);
    expect(receipt.pendingCount).toBe(0);

    // Verify storage was ONLY called for the scratch output, NEVER for original or active derivative
    expect(storage.calls).toHaveLength(1);
    expect(storage.calls[0].ref).toEqual(scratchOutput.destination);

    // Verify retained reasons
    expect(receipt.details.retained).toEqual([
      { namespace: original.namespace, key: original.key, reason: 'ORIGINAL' },
      { namespace: activeThumb.namespace, key: activeThumb.key, reason: 'ACTIVE_DERIVATIVE' },
    ]);
  });

  it('handles MISSING outcomes as confirmed deletions without failing', async () => {
    const { service, repo, storage } = setupService();
    storage.defaultOutcome = 'MISSING'; // Object already gone from storage

    const candidate: AttemptCleanupCandidate = {
      attemptId: randomUUID(),
      token: randomUUID(),
      jobId: randomUUID(),
      mediaRef,
      generation: 1n,
      status: 'QUIESCENT',
      result: 'CANCELLED',
      outputs: [
        { file: 'orphan.tmp', destination: { namespace: 'bucket-tmp', key: 'orphan.tmp' }, operationId: 'op-orph' },
      ],
    };
    repo.candidates.set(candidate.attemptId, candidate);

    const receipt = await service.execute({
      attemptId: candidate.attemptId,
      mediaRef,
      generation: 1n,
      operationId: 'clean-op-missing',
    });

    expect(receipt.status).toBe('COMPLETED');
    expect(receipt.deletedCount).toBe(1);
    expect(receipt.details.deleted[0].outcome).toBe('MISSING');
  });

  it('marks cleanup as PARTIAL when storage returns UNKNOWN or FAILED, tracking pending items', async () => {
    const { service, repo, storage } = setupService();

    const output1 = {
      file: 'done.tmp',
      destination: { namespace: 'bucket-tmp', key: 'done.tmp' },
      operationId: 'op1',
    };
    const output2 = {
      file: 'unknown.tmp',
      destination: { namespace: 'bucket-tmp', key: 'unknown.tmp' },
      operationId: 'op2',
    };

    storage.outcomeMap.set('bucket-tmp:done.tmp', 'DELETED');
    storage.outcomeMap.set('bucket-tmp:unknown.tmp', 'UNKNOWN');

    const candidate: AttemptCleanupCandidate = {
      attemptId: randomUUID(),
      token: randomUUID(),
      jobId: randomUUID(),
      mediaRef,
      generation: 1n,
      status: 'QUIESCENT',
      result: 'PROCESSING_ERROR',
      outputs: [output1, output2],
    };
    repo.candidates.set(candidate.attemptId, candidate);

    const receipt = await service.execute({
      attemptId: candidate.attemptId,
      mediaRef,
      generation: 1n,
      operationId: 'clean-op-partial',
    });

    expect(receipt.status).toBe('PARTIAL');
    expect(receipt.deletedCount).toBe(1);
    expect(receipt.pendingCount).toBe(1);
    expect(receipt.details.pending).toEqual([
      { namespace: 'bucket-tmp', key: 'unknown.tmp', outcome: 'UNKNOWN' },
    ]);
  });

  it('supports idempotent replay returning existing receipt with wasExisting: true', async () => {
    const { service, repo } = setupService();

    const candidate: AttemptCleanupCandidate = {
      attemptId: randomUUID(),
      token: randomUUID(),
      jobId: randomUUID(),
      mediaRef,
      generation: 1n,
      status: 'QUIESCENT',
      outputs: [
        { file: 'scratch.tmp', destination: { namespace: 'bucket-scratch', key: 'scratch.tmp' }, operationId: 'op1' },
      ],
    };
    repo.candidates.set(candidate.attemptId, candidate);

    const first = await service.execute({
      attemptId: candidate.attemptId,
      mediaRef,
      generation: 1n,
      operationId: 'idempotent-op-1',
    });
    expect(first.wasExisting).toBeUndefined();

    const second = await service.execute({
      attemptId: candidate.attemptId,
      mediaRef,
      generation: 1n,
      operationId: 'idempotent-op-1',
    });
    expect(second.wasExisting).toBe(true);
    expect(second.operationId).toBe(first.operationId);
  });

  it('rejects conflicting replay with different attempt parameters with IDEMPOTENCY_CONFLICT', async () => {
    const { service, repo } = setupService();

    const candidate: AttemptCleanupCandidate = {
      attemptId: randomUUID(),
      token: randomUUID(),
      jobId: randomUUID(),
      mediaRef,
      generation: 1n,
      status: 'QUIESCENT',
      outputs: [],
    };
    repo.candidates.set(candidate.attemptId, candidate);

    await service.execute({
      attemptId: candidate.attemptId,
      mediaRef,
      generation: 1n,
      operationId: 'conflict-op-1',
    });

    // Replay with different attemptId
    await expect(
      service.execute({
        attemptId: randomUUID(),
        mediaRef,
        generation: 1n,
        operationId: 'conflict-op-1',
      })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('re-evaluates and aborts under CAS guard if an output is concurrently promoted to active derivative', async () => {
    const { service, repo } = setupService();

    const outputToRace = {
      file: 'raced.jpg',
      destination: { namespace: 'bucket-deriv', key: 'derivatives/raced.jpg' },
      operationId: 'op-race',
    };

    const candidate: AttemptCleanupCandidate = {
      attemptId: randomUUID(),
      token: randomUUID(),
      jobId: randomUUID(),
      mediaRef,
      generation: 1n,
      status: 'QUIESCENT',
      outputs: [outputToRace],
    };
    repo.candidates.set(candidate.attemptId, candidate);

    // Override fakeRunTx to simulate concurrent promotion right before commit
    let calls = 0;
    const raceTxRunner = async <T>(action: (tx: SqlTransaction) => Promise<T>): Promise<T> => {
      calls++;
      if (calls === 2) {
        // At commit time, media facts now show outputToRace was concurrently promoted!
        repo.mediaFacts.set(mediaRef, {
          generation: 1n,
          revision: 3n,
          status: 'PUBLISHED',
          original,
          activeDerivatives: [activeThumb, { ...outputToRace.destination, role: 'PREVIEW' }],
        });
      }
      return action(mockTx);
    };

    const racingService = new AttemptCleanupService(repo, new MockCleanupStorage(), undefined, raceTxRunner);

    await expect(
      racingService.execute({
        attemptId: candidate.attemptId,
        mediaRef,
        generation: 1n,
        operationId: 'race-op-1',
      })
    ).rejects.toMatchObject({ code: 'PROMOTION_CLEANUP_RACE' });
  });

  it('respects custom retention policy rejection with INELIGIBLE_RETENTION', async () => {
    const { repo } = setupService();
    const candidate: AttemptCleanupCandidate = {
      attemptId: randomUUID(),
      token: randomUUID(),
      jobId: randomUUID(),
      mediaRef,
      generation: 1n,
      status: 'QUIESCENT',
      outputs: [],
    };
    repo.candidates.set(candidate.attemptId, candidate);

    const strictRetention: RetentionPolicy = {
      isEligible: () => false, // Always ineligible
    };

    const service = new AttemptCleanupService(repo, new MockCleanupStorage(), strictRetention, fakeRunTx);

    await expect(
      service.execute({
        attemptId: candidate.attemptId,
        mediaRef,
        generation: 1n,
        operationId: 'retention-op-1',
      })
    ).rejects.toMatchObject({ code: 'INELIGIBLE_RETENTION' });
  });

  it('marks status as SKIPPED when all candidate outputs match active derivatives or original, never calling storage', async () => {
    const { service, repo, storage } = setupService();
    const candidate: AttemptCleanupCandidate = {
      attemptId: randomUUID(),
      token: randomUUID(),
      jobId: randomUUID(),
      mediaRef,
      generation: 1n,
      status: 'QUIESCENT',
      outputs: [
        { file: 'orig.jpg', destination: { namespace: original.namespace, key: original.key }, operationId: 'op1' },
        { file: 'thumb.jpg', destination: { namespace: activeThumb.namespace, key: activeThumb.key }, operationId: 'op2' },
      ],
    };
    repo.candidates.set(candidate.attemptId, candidate);

    const receipt = await service.execute({
      attemptId: candidate.attemptId,
      mediaRef,
      generation: 1n,
      operationId: 'skipped-op-1',
    });

    expect(receipt.status).toBe('SKIPPED');
    expect(receipt.deletedCount).toBe(0);
    expect(receipt.retainedCount).toBe(2);
    expect(receipt.pendingCount).toBe(0);
    expect(storage.calls).toHaveLength(0);
  });

  it('returns COMPLETED with 0 deleted when candidate outputs array is empty', async () => {
    const { service, repo, storage } = setupService();
    const candidate: AttemptCleanupCandidate = {
      attemptId: randomUUID(),
      token: randomUUID(),
      jobId: randomUUID(),
      mediaRef,
      generation: 1n,
      status: 'QUIESCENT',
      outputs: [],
    };
    repo.candidates.set(candidate.attemptId, candidate);

    const receipt = await service.execute({
      attemptId: candidate.attemptId,
      mediaRef,
      generation: 1n,
      operationId: 'empty-outputs-op',
    });

    expect(receipt.status).toBe('COMPLETED');
    expect(receipt.deletedCount).toBe(0);
    expect(receipt.retainedCount).toBe(0);
    expect(receipt.pendingCount).toBe(0);
    expect(storage.calls).toHaveLength(0);
  });

  it('rejects command with INVALID_ARGUMENT if required fields are missing', async () => {
    const { service } = setupService();

    await expect(
      service.execute({
        attemptId: '',
        mediaRef,
        generation: 1n,
        operationId: 'invalid-op-1',
      })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });

    await expect(
      service.execute({
        attemptId: randomUUID(),
        mediaRef: '',
        generation: 1n,
        operationId: 'invalid-op-2',
      })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });

    await expect(
      service.execute({
        attemptId: randomUUID(),
        mediaRef,
        generation: 1n,
        operationId: '',
      })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('rejects command with MEDIA_NOT_FOUND when media does not exist in repository', async () => {
    const { service, repo } = setupService();
    const nonExistentMedia = 'media:non-existent';
    const candidate: AttemptCleanupCandidate = {
      attemptId: randomUUID(),
      token: randomUUID(),
      jobId: randomUUID(),
      mediaRef: nonExistentMedia,
      generation: 1n,
      status: 'QUIESCENT',
      outputs: [],
    };
    repo.candidates.set(candidate.attemptId, candidate);

    await expect(
      service.execute({
        attemptId: candidate.attemptId,
        mediaRef: nonExistentMedia,
        generation: 1n,
        operationId: 'not-found-op',
      })
    ).rejects.toMatchObject({ code: 'MEDIA_NOT_FOUND' });
  });
});

