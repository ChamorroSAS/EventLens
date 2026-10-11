import {describe, it, expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {SqlTransaction} from '@eventlens/job-queue';
import {
  PipelineValidationService,
  PHOTO_SLO_TARGETS,
  VIDEO_SLO_TARGETS,
  type PipelineSampleObservation,
  type PipelineValidationRepository,
  type PipelineValidationReportData,
} from '../src/pipeline-validation.js';

class InMemoryValidationRepository implements PipelineValidationRepository {
  public reports = new Map<string, PipelineValidationReportData>();

  async getReportByOperationId(
    _tx: SqlTransaction,
    operationId: string,
  ): Promise<PipelineValidationReportData | null> {
    return this.reports.get(operationId) ?? null;
  }

  async persistReport(
    _tx: SqlTransaction,
    report: PipelineValidationReportData,
  ): Promise<{ wasExisting: boolean }> {
    if (this.reports.has(report.operationId)) {
      return { wasExisting: true };
    }
    this.reports.set(report.operationId, { ...report });
    return { wasExisting: false };
  }
}

const dummyTx = {} as SqlTransaction;

function createPhotoSample(
  id: string,
  totalMs: number,
  status: 'PROMOTED' | 'QUARANTINED' | 'PROCESSING_FAILED' = 'PROMOTED',
): PipelineSampleObservation {
  return {
    caseId: `photo-case-${id}`,
    mediaRef: `media:${randomUUID()}`,
    device: 'IPHONE_14_PRO',
    format: 'HEIC',
    kind: 'PHOTO',
    originalSha256: 'a'.repeat(64),
    bytesBefore: 5_000_000,
    bytesAfter: 5_000_000,
    isByteIdentical: true,
    timings: {
      queueWaitMs: Math.round(totalMs * 0.1),
      inspectionMs: Math.round(totalMs * 0.3),
      transformationMs: Math.round(totalMs * 0.6),
      totalMs,
    },
    safetyOutcome: status === 'QUARANTINED' ? 'THREAT_DETECTED' : 'APPROVED',
    status,
    promotedRole: status === 'PROMOTED' ? 'PUBLISHED' : undefined,
  };
}

function createVideoSample(
  id: string,
  totalMs: number,
  status: 'PROMOTED' | 'QUARANTINED' | 'PROCESSING_FAILED' = 'PROMOTED',
): PipelineSampleObservation {
  return {
    caseId: `video-case-${id}`,
    mediaRef: `media:${randomUUID()}`,
    device: 'REDMI_A5',
    format: 'MP4',
    kind: 'VIDEO',
    originalSha256: 'b'.repeat(64),
    bytesBefore: 25_000_000,
    bytesAfter: 25_000_000,
    isByteIdentical: true,
    timings: {
      queueWaitMs: Math.round(totalMs * 0.05),
      inspectionMs: Math.round(totalMs * 0.15),
      transformationMs: Math.round(totalMs * 0.8),
      totalMs,
    },
    safetyOutcome: status === 'QUARANTINED' ? 'THREAT_DETECTED' : 'APPROVED',
    status,
    promotedRole: status === 'PROMOTED' ? 'PUBLISHED' : undefined,
  };
}

describe('PipelineValidationService unit tests', () => {
  it('exposes approved SLO target constants for photos and videos', () => {
    expect(PHOTO_SLO_TARGETS.targetMedianMs).toBe(15_000);
    expect(PHOTO_SLO_TARGETS.targetP95Ms).toBe(60_000);
    expect(PHOTO_SLO_TARGETS.targetSuccessRate).toBe(0.98);

    expect(VIDEO_SLO_TARGETS.targetMedianMs).toBe(120_000);
    expect(VIDEO_SLO_TARGETS.targetP95Ms).toBe(300_000);
    expect(VIDEO_SLO_TARGETS.targetSuccessRate).toBe(0.95);
  });

  it('reports INSUFFICIENT_OBSERVATIONS when observation set is empty without inventing numbers', () => {
    const repo = new InMemoryValidationRepository();
    const service = new PipelineValidationService(repo);

    const metrics = service.calculateMetrics([], 'PHOTO');
    expect(metrics.sampleSize).toBe(0);
    expect(metrics.successCount).toBe(0);
    expect(metrics.failureCount).toBe(0);
    expect(metrics.medianMs).toBeNull();
    expect(metrics.p95Ms).toBeNull();
    expect(metrics.status).toBe('INSUFFICIENT_OBSERVATIONS');
    expect(metrics.meetsSlo).toBe(false);
  });

  it('reports INSUFFICIENT_OBSERVATIONS when sample size is below minimum required', () => {
    const repo = new InMemoryValidationRepository();
    const service = new PipelineValidationService(repo);

    const obs = [createPhotoSample('1', 5_000)];
    const metrics = service.calculateMetrics(obs, 'PHOTO', 5);
    expect(metrics.sampleSize).toBe(1);
    expect(metrics.status).toBe('INSUFFICIENT_OBSERVATIONS');
    expect(metrics.meetsSlo).toBe(false);
  });

  it('evaluates photo SLO as PASS when median, p95, and success rate satisfy criteria', () => {
    const repo = new InMemoryValidationRepository();
    const service = new PipelineValidationService(repo);

    // 100 observations: 99 successful (latencies 2s to 12s, median ~7s, p95 ~11.5s), 1 failure (99% > 98%)
    const obs: PipelineSampleObservation[] = [];
    for (let i = 1; i <= 99; i++) {
      obs.push(createPhotoSample(String(i), 2000 + i * 100));
    }
    obs.push(createPhotoSample('100', 30000, 'PROCESSING_FAILED'));

    const metrics = service.calculateMetrics(obs, 'PHOTO');
    expect(metrics.status).toBe('EVALUATED');
    expect(metrics.sampleSize).toBe(100);
    expect(metrics.successCount).toBe(99);
    expect(metrics.failureCount).toBe(1);
    expect(metrics.successRate).toBe(0.99);
    expect(metrics.medianMs).toBeLessThanOrEqual(15_000);
    expect(metrics.p95Ms).toBeLessThanOrEqual(60_000);
    expect(metrics.meetsSlo).toBe(true);
    expect(metrics.sloDetails.medianPassed).toBe(true);
    expect(metrics.sloDetails.p95Passed).toBe(true);
    expect(metrics.sloDetails.successRatePassed).toBe(true);
  });

  it('fails photo SLO when median exceeds 15 seconds', () => {
    const repo = new InMemoryValidationRepository();
    const service = new PipelineValidationService(repo);

    const obs: PipelineSampleObservation[] = [];
    for (let i = 1; i <= 20; i++) {
      // Latency 20s (exceeds 15s median)
      obs.push(createPhotoSample(String(i), 20_000));
    }

    const metrics = service.calculateMetrics(obs, 'PHOTO');
    expect(metrics.medianMs).toBe(20_000);
    expect(metrics.sloDetails.medianPassed).toBe(false);
    expect(metrics.meetsSlo).toBe(false);
  });

  it('fails photo SLO when p95 exceeds 60 seconds', () => {
    const repo = new InMemoryValidationRepository();
    const service = new PipelineValidationService(repo);

    const obs: PipelineSampleObservation[] = [];
    for (let i = 1; i <= 18; i++) {
      obs.push(createPhotoSample(String(i), 5_000));
    }
    // High tail latencies exceeding 60s
    obs.push(createPhotoSample('19', 70_000));
    obs.push(createPhotoSample('20', 80_000));

    const metrics = service.calculateMetrics(obs, 'PHOTO');
    expect(metrics.p95Ms).toBeGreaterThan(60_000);
    expect(metrics.sloDetails.p95Passed).toBe(false);
    expect(metrics.meetsSlo).toBe(false);
  });

  it('fails photo SLO when success rate is below 98%', () => {
    const repo = new InMemoryValidationRepository();
    const service = new PipelineValidationService(repo);

    const obs: PipelineSampleObservation[] = [];
    for (let i = 1; i <= 95; i++) {
      obs.push(createPhotoSample(String(i), 5_000));
    }
    for (let i = 96; i <= 100; i++) {
      obs.push(createPhotoSample(String(i), 5_000, 'PROCESSING_FAILED'));
    }

    const metrics = service.calculateMetrics(obs, 'PHOTO');
    expect(metrics.successRate).toBe(0.95);
    expect(metrics.sloDetails.successRatePassed).toBe(false);
    expect(metrics.meetsSlo).toBe(false);
  });

  it('evaluates video SLO as PASS when median <= 2min, p95 <= 5min, and success rate >= 95%', () => {
    const repo = new InMemoryValidationRepository();
    const service = new PipelineValidationService(repo);

    const obs: PipelineSampleObservation[] = [];
    for (let i = 1; i <= 48; i++) {
      // 48 successes at 60s (1 min)
      obs.push(createVideoSample(String(i), 60_000));
    }
    // 2 failures out of 50 = 96% success rate >= 95%
    obs.push(createVideoSample('49', 150_000, 'PROCESSING_FAILED'));
    obs.push(createVideoSample('50', 200_000, 'PROCESSING_FAILED'));

    const metrics = service.calculateMetrics(obs, 'VIDEO');
    expect(metrics.status).toBe('EVALUATED');
    expect(metrics.sampleSize).toBe(50);
    expect(metrics.successRate).toBe(0.96);
    expect(metrics.medianMs).toBe(60_000); // 1 min <= 2 min
    expect(metrics.p95Ms).toBe(60_000);   // <= 5 min
    expect(metrics.meetsSlo).toBe(true);
  });

  it('fails video SLO when median exceeds 2 minutes', () => {
    const repo = new InMemoryValidationRepository();
    const service = new PipelineValidationService(repo);

    const obs: PipelineSampleObservation[] = [];
    for (let i = 1; i <= 20; i++) {
      // 150s = 2.5 min > 2 min
      obs.push(createVideoSample(String(i), 150_000));
    }

    const metrics = service.calculateMetrics(obs, 'VIDEO');
    expect(metrics.medianMs).toBe(150_000);
    expect(metrics.sloDetails.medianPassed).toBe(false);
    expect(metrics.meetsSlo).toBe(false);
  });

  it('asserts byte integrity and detects mutated original files', () => {
    const repo = new InMemoryValidationRepository();
    const service = new PipelineValidationService(repo);

    const valid = createPhotoSample('1', 5_000);
    expect(() => service.validateByteIntegrity(valid)).not.toThrow();

    const byteMismatch: PipelineSampleObservation = {
      ...valid,
      bytesAfter: valid.bytesBefore - 100,
    };
    expect(() => service.validateByteIntegrity(byteMismatch)).toThrow(
      /ORIGINAL_BYTE_MUTATION_DETECTED/,
    );

    const hashMismatch: PipelineSampleObservation = {
      ...valid,
      isByteIdentical: false,
    };
    expect(() => service.validateByteIntegrity(hashMismatch)).toThrow(
      /ORIGINAL_BYTE_MUTATION_DETECTED/,
    );
  });

  it('ensures threat or malicious files in quarantine do not count as successes', () => {
    const repo = new InMemoryValidationRepository();
    const service = new PipelineValidationService(repo);

    const obs = [
      createPhotoSample('1', 5_000, 'PROMOTED'),
      createPhotoSample('2', 5_000, 'QUARANTINED'),
    ];

    const metrics = service.calculateMetrics(obs, 'PHOTO');
    expect(metrics.sampleSize).toBe(2);
    expect(metrics.successCount).toBe(1);
    expect(metrics.failureCount).toBe(1);
    expect(metrics.successRate).toBe(0.5);
    expect(metrics.meetsSlo).toBe(false);
  });

  it('records validation report idempotently by operationId and rejects conflicts', async () => {
    const repo = new InMemoryValidationRepository();
    const service = new PipelineValidationService(repo);

    const obs = [createPhotoSample('1', 5_000)];
    const opId = randomUUID();

    const report1 = await service.recordValidationReport(dummyTx, {
      operationId: opId,
      target: 'PHOTO',
      observations: obs,
    });
    expect(report1.wasExisting).toBe(false);
    expect(report1.sampleSize).toBe(1);

    // Replay with identical payload returns existing report
    const report2 = await service.recordValidationReport(dummyTx, {
      operationId: opId,
      target: 'PHOTO',
      observations: obs,
    });
    expect(report2.wasExisting).toBe(true);
    expect(report2.id).toBe(report1.id);

    // Conflicting replay with different target throws IDEMPOTENCY_CONFLICT
    await expect(
      service.recordValidationReport(dummyTx, {
        operationId: opId,
        target: 'VIDEO',
        observations: obs,
      }),
    ).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
  });

  it('aborts report recording if any sample exhibits corrupted original bytes', async () => {
    const repo = new InMemoryValidationRepository();
    const service = new PipelineValidationService(repo);

    const corrupted: PipelineSampleObservation = {
      ...createPhotoSample('1', 5_000),
      isByteIdentical: false,
    };

    await expect(
      service.recordValidationReport(dummyTx, {
        operationId: randomUUID(),
        target: 'PHOTO',
        observations: [corrupted],
      }),
    ).rejects.toThrow(/ORIGINAL_BYTE_MUTATION_DETECTED/);
  });
});
