import {describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {Execution} from '@eventlens/job-queue';
import {
  TerminalFailurePolicy,
  ApplyTerminalFailure,
  type TerminalFailureRepository,
  type TerminalFailureReceipt
} from '../src/terminal-failure.js';
import type {InspectionInput, SafetyFact} from '../src/contracts.js';

describe('TerminalFailurePolicy', () => {
  it('determines download eligibility according to DEC-075', () => {
    const baseFact: SafetyFact = {
      schemaVersion: 1,
      jobId: randomUUID(),
      executionToken: randomUUID(),
      fence: '1',
      epoch: 'ep1',
      mediaRef: 'media-1',
      generation: '1',
      revision: '1',
      originalSha256: 'a'.repeat(64),
      originalVersion: 'v1',
      outcome: 'APPROVED',
      format: { status: 'VALID', reason: 'VALID_IMAGE' },
      malware: {
        status: 'NO_THREAT_DETECTED',
        reason: 'CLEAN',
        engine: 'ClamAV',
        engineVersion: '1.4.6',
        imageDigest: 'digest',
        snapshotId: 's',
        profileHash: 'p'
      }
    };

    // 1. APPROVED -> downloadEligible: true
    const approved = TerminalFailurePolicy.determineDownloadEligibility(baseFact);
    expect(approved.downloadEligible).toBe(true);
    expect(approved.safetyOutcome).toBe('APPROVED');

    // 2. INCONCLUSIVE -> downloadEligible: false
    const inconclusive = TerminalFailurePolicy.determineDownloadEligibility({
      ...baseFact,
      outcome: 'INCONCLUSIVE',
      format: { status: 'INCONCLUSIVE', reason: 'TIMEOUT' }
    });
    expect(inconclusive.downloadEligible).toBe(false);
    expect(inconclusive.safetyOutcome).toBe('INCONCLUSIVE');

    // 3. DENIED -> downloadEligible: false
    const denied = TerminalFailurePolicy.determineDownloadEligibility({
      ...baseFact,
      outcome: 'DENIED',
      malware: { ...baseFact.malware, status: 'THREAT_DETECTED', reason: 'EICAR' }
    });
    expect(denied.downloadEligible).toBe(false);
    expect(denied.safetyOutcome).toBe('DENIED');

    // 4. null (pending) -> downloadEligible: false
    const pending = TerminalFailurePolicy.determineDownloadEligibility(null);
    expect(pending.downloadEligible).toBe(false);
    expect(pending.safetyOutcome).toBe('PENDING');
  });

  it('classifies causes between BUDGET_EXHAUSTED and TERMINAL_TECHNICAL_ERROR', () => {
    const jobAttempt1: Execution = {
      jobId: randomUUID(),
      resourceRef: 'media-1',
      generation: 1n,
      queue: 'media',
      type: 'INSPECTION',
      payload: {},
      handlerVersion: '1',
      attempt: 1,
      fence: 1n,
      owner: 'w1',
      token: randomUUID(),
      epoch: 'ep1',
      leaseUntil: new Date()
    };
    const jobAttempt3: Execution = { ...jobAttempt1, attempt: 3 };

    expect(TerminalFailurePolicy.classifyCause(jobAttempt3, new Error('transient timeout'), 3)).toBe('BUDGET_EXHAUSTED');
    expect(TerminalFailurePolicy.classifyCause(jobAttempt1, new Error('unsupported internal codec'), 3)).toBe('TERMINAL_TECHNICAL_ERROR');
    expect(TerminalFailurePolicy.classifyCause(jobAttempt1, { cause: 'BUDGET_EXHAUSTED' }, 3)).toBe('BUDGET_EXHAUSTED');
  });
});

describe('ApplyTerminalFailure unit logic', () => {
  const input: InspectionInput = {
    mediaRef: 'media-1',
    generation: 1n,
    revision: 1n,
    original: { namespace: 'ns', key: 'k', immutableVersion: 'v', sha256: 'a'.repeat(64), sizeBytes: 100 },
    declaredMime: 'image/jpeg'
  };

  const job: Execution = {
    jobId: randomUUID(),
    resourceRef: 'media-1',
    generation: 1n,
    queue: 'media',
    type: 'INSPECTION',
    payload: {},
    handlerVersion: '1',
    attempt: 3,
    fence: 3n,
    owner: 'w1',
    token: randomUUID(),
    epoch: 'ep1',
    leaseUntil: new Date()
  };

  it('fails with INVALID_ARGUMENT on mismatched mediaRef or missing operationId', async () => {
    const handler = new ApplyTerminalFailure(
      { lock: vi.fn(), receipt: vi.fn(), apply: vi.fn() } as unknown as TerminalFailureRepository,
      { retry: vi.fn() } as any
    );
    await expect(handler.execute(job, input, new Error('fail'), '')).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT'
    });
    await expect(
      handler.execute({ ...job, resourceRef: 'different' }, input, new Error('fail'), randomUUID())
    ).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT'
    });
  });

  it('dispatches DEAD disposition to queue and records terminal receipt', async () => {
    const receipt: TerminalFailureReceipt = {
      operationId: 'op-1',
      mediaRef: 'media-1',
      generation: '1',
      previousRevision: '1',
      revision: '2',
      jobId: job.jobId,
      token: job.token,
      epoch: job.epoch,
      cause: 'BUDGET_EXHAUSTED',
      sanitizedReason: 'Failed permanently',
      downloadEligible: true,
      failureFingerprint: 'fp-1',
      committedAt: new Date()
    };

    const mockRepo: TerminalFailureRepository = {
      lock: vi.fn().mockResolvedValue(undefined),
      receipt: vi.fn().mockResolvedValue(null),
      apply: vi.fn().mockResolvedValue(receipt)
    };

    const mockQueue = {
      retry: vi.fn().mockImplementation(async (_j, _op, _out, _rAt, disp, effect, lockOwner) => {
        expect(disp).toBe('DEAD');
        await lockOwner?.({} as any);
        await effect({} as any);
        return 'COMPLETED';
      })
    };

    const handler = new ApplyTerminalFailure(mockRepo, mockQueue as any);
    const result = await handler.execute(job, input, new Error('Failed permanently'), 'op-1');

    expect(result.result).toBe('COMPLETED');
    expect(result.receipt.downloadEligible).toBe(true);
    expect(result.receipt.cause).toBe('BUDGET_EXHAUSTED');
    expect(mockRepo.apply).toHaveBeenCalled();
  });
});
