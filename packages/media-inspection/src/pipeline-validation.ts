import {randomUUID} from 'node:crypto';
import type {SqlTransaction} from '@eventlens/job-queue';

export type CorpusDevice = 'IPHONE_14_PRO' | 'REDMI_A5' | 'CONTROLLED_LAB';
export type CorpusFormat = 'JPEG' | 'PNG' | 'WebP' | 'HEIC' | 'HEIF' | 'MP4' | 'MOV' | 'WebM';
export type MediaKind = 'PHOTO' | 'VIDEO';

export interface PipelineStageTimings {
  queueWaitMs: number;
  inspectionMs: number;
  transformationMs: number;
  totalMs: number;
}

export interface PipelineSampleObservation {
  caseId: string;
  mediaRef: string;
  device: CorpusDevice;
  format: CorpusFormat;
  kind: MediaKind;
  originalSha256: string;
  bytesBefore: number;
  bytesAfter: number;
  isByteIdentical: boolean;
  timings: PipelineStageTimings;
  safetyOutcome: 'APPROVED' | 'THREAT_DETECTED' | 'UNSUPPORTED_FORMAT' | 'CORRUPT' | 'RESOURCE_LIMIT_EXCEEDED';
  status: 'PROMOTED' | 'QUARANTINED' | 'PROCESSING_FAILED' | 'REJECTED';
  promotedRole?: 'PUBLISHED' | 'PRE_REVIEW';
  error?: string;
  metadata?: {
    width?: number;
    height?: number;
    durationSeconds?: number;
    hasAudio?: boolean;
    orientation?: string;
  };
}

export interface SloThresholds {
  targetMedianMs: number;
  targetP95Ms: number;
  targetSuccessRate: number;
}

export const PHOTO_SLO_TARGETS: SloThresholds = {
  targetMedianMs: 15_000, // 15 seconds
  targetP95Ms: 60_000,    // 60 seconds
  targetSuccessRate: 0.98, // 98%
};

export const VIDEO_SLO_TARGETS: SloThresholds = {
  targetMedianMs: 120_000, // 2 minutes
  targetP95Ms: 300_000,    // 5 minutes
  targetSuccessRate: 0.95,  // 95%
};

export interface ValidationMetrics {
  sampleSize: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  medianMs: number | null;
  p95Ms: number | null;
  meetsSlo: boolean;
  sloDetails: {
    targetMedianMs: number;
    targetP95Ms: number;
    targetSuccessRate: number;
    medianPassed: boolean;
    p95Passed: boolean;
    successRatePassed: boolean;
  };
}

export interface PipelineValidationReportData {
  id: string;
  operationId: string;
  target: 'PHOTO' | 'VIDEO' | 'INTEGRATED';
  sampleSize: number;
  successCount: number;
  failureCount: number;
  medianMs: number | null;
  p95Ms: number | null;
  meetsSlo: boolean;
  status: 'EVALUATED' | 'INSUFFICIENT_OBSERVATIONS';
  metrics: ValidationMetrics;
  observations: PipelineSampleObservation[];
  recordedAt: string;
}

export interface PipelineValidationRepository {
  persistReport(
    tx: SqlTransaction,
    report: PipelineValidationReportData,
  ): Promise<{ wasExisting: boolean }>;
  getReportByOperationId(
    tx: SqlTransaction,
    operationId: string,
  ): Promise<PipelineValidationReportData | null>;
}

export class PostgresPipelineValidationRepository implements PipelineValidationRepository {
  async getReportByOperationId(
    tx: SqlTransaction,
    operationId: string,
  ): Promise<PipelineValidationReportData | null> {
    const rows = await tx.query<{
      id: string;
      operation_id: string;
      target: string;
      sample_size: number;
      success_count: number;
      failure_count: number;
      median_ms: number | null;
      p95_ms: number | null;
      meets_slo: boolean;
      status: string;
      metrics: ValidationMetrics;
      observations: PipelineSampleObservation[];
      recorded_at: Date | string;
    }>(
      `SELECT id, operation_id, target, sample_size, success_count, failure_count,
              median_ms, p95_ms, meets_slo, status, metrics, observations, recorded_at
       FROM media_pipeline_validation_report
       WHERE operation_id = $1`,
      operationId,
    );

    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      operationId: r.operation_id,
      target: r.target as 'PHOTO' | 'VIDEO' | 'INTEGRATED',
      sampleSize: r.sample_size,
      successCount: r.success_count,
      failureCount: r.failure_count,
      medianMs: r.median_ms,
      p95Ms: r.p95_ms,
      meetsSlo: r.meets_slo,
      status: r.status as 'EVALUATED' | 'INSUFFICIENT_OBSERVATIONS',
      metrics: r.metrics,
      observations: r.observations,
      recordedAt: typeof r.recorded_at === 'string' ? r.recorded_at : r.recorded_at.toISOString(),
    };
  }

  async persistReport(
    tx: SqlTransaction,
    report: PipelineValidationReportData,
  ): Promise<{ wasExisting: boolean }> {
    // Sanitization assurance: check that no sensitive credentials or tokens leak
    const payloadStr = JSON.stringify(report);
    if (/token|password|secret|bearer/i.test(payloadStr)) {
      const sanitizedObservations = report.observations.map(obs => {
        const { error, ...rest } = obs;
        return {
          ...rest,
          error: error ? error.replace(/[\w-]{36}/g, '[REDACTED_UUID]').slice(0, 100) : undefined,
        };
      });
      report.observations = sanitizedObservations;
    }

    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO media_pipeline_validation_report (
         id, operation_id, target, sample_size, success_count, failure_count,
         median_ms, p95_ms, meets_slo, status, metrics, observations, recorded_at
       )
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::timestamptz)
       ON CONFLICT (operation_id) DO NOTHING
       RETURNING id`,
      report.id,
      report.operationId,
      report.target,
      report.sampleSize,
      report.successCount,
      report.failureCount,
      report.medianMs,
      report.p95Ms,
      report.meetsSlo,
      report.status,
      JSON.stringify(report.metrics),
      JSON.stringify(report.observations),
      report.recordedAt,
    );

    return { wasExisting: inserted.length === 0 };
  }
}

export class PipelineValidationService {
  constructor(private readonly repository: PipelineValidationRepository) {}

  calculateMetrics(
    observations: PipelineSampleObservation[],
    target: 'PHOTO' | 'VIDEO' | 'INTEGRATED',
    minSampleSize: number = 1,
  ): ValidationMetrics & { status: 'EVALUATED' | 'INSUFFICIENT_OBSERVATIONS' } {
    const relevant = observations.filter(o => {
      if (target === 'INTEGRATED') return true;
      return o.kind === target;
    });

    const sampleSize = relevant.length;
    const targetThresholds: SloThresholds =
      target === 'VIDEO' ? VIDEO_SLO_TARGETS : PHOTO_SLO_TARGETS;

    if (sampleSize === 0 || sampleSize < minSampleSize) {
      return {
        sampleSize,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        medianMs: null,
        p95Ms: null,
        meetsSlo: false,
        status: 'INSUFFICIENT_OBSERVATIONS',
        sloDetails: {
          targetMedianMs: targetThresholds.targetMedianMs,
          targetP95Ms: targetThresholds.targetP95Ms,
          targetSuccessRate: targetThresholds.targetSuccessRate,
          medianPassed: false,
          p95Passed: false,
          successRatePassed: false,
        },
      };
    }

    const successes = relevant.filter(o => o.status === 'PROMOTED');
    const failures = relevant.filter(o => o.status !== 'PROMOTED');
    const successCount = successes.length;
    const failureCount = failures.length;
    const successRate = successCount / sampleSize;

    const latencies = successes
      .map(o => o.timings.totalMs)
      .filter((n): n is number => typeof n === 'number' && !Number.isNaN(n))
      .sort((a, b) => a - b);

    let medianMs: number | null = null;
    let p95Ms: number | null = null;

    if (latencies.length > 0) {
      const mid = Math.floor(latencies.length / 2);
      medianMs =
        latencies.length % 2 !== 0
          ? latencies[mid]
          : (latencies[mid - 1] + latencies[mid]) / 2;

      const p95Idx = Math.max(0, Math.ceil(0.95 * latencies.length) - 1);
      p95Ms = latencies[p95Idx];
    }

    const medianPassed =
      medianMs !== null && medianMs <= targetThresholds.targetMedianMs;
    const p95Passed = p95Ms !== null && p95Ms <= targetThresholds.targetP95Ms;
    const successRatePassed = successRate >= targetThresholds.targetSuccessRate;
    const meetsSlo = medianPassed && p95Passed && successRatePassed;

    return {
      sampleSize,
      successCount,
      failureCount,
      successRate,
      medianMs,
      p95Ms,
      meetsSlo,
      status: 'EVALUATED',
      sloDetails: {
        targetMedianMs: targetThresholds.targetMedianMs,
        targetP95Ms: targetThresholds.targetP95Ms,
        targetSuccessRate: targetThresholds.targetSuccessRate,
        medianPassed,
        p95Passed,
        successRatePassed,
      },
    };
  }

  validateByteIntegrity(observation: PipelineSampleObservation): void {
    if (observation.bytesBefore !== observation.bytesAfter || !observation.isByteIdentical) {
      throw new Error(`ORIGINAL_BYTE_MUTATION_DETECTED: case ${observation.caseId} original modified`);
    }
  }

  async recordValidationReport(
    tx: SqlTransaction,
    params: {
      operationId: string;
      target: 'PHOTO' | 'VIDEO' | 'INTEGRATED';
      observations: PipelineSampleObservation[];
      minSampleSize?: number;
    },
  ): Promise<PipelineValidationReportData & { wasExisting: boolean }> {
    // 1. Verify byte integrity of all observations
    for (const obs of params.observations) {
      this.validateByteIntegrity(obs);
    }

    // 2. Check idempotency
    const existing = await this.repository.getReportByOperationId(tx, params.operationId);
    if (existing) {
      if (
        existing.target !== params.target ||
        existing.sampleSize !== params.observations.length
      ) {
        throw new Error('IDEMPOTENCY_CONFLICT: conflicting validation report payload');
      }
      return {...existing, wasExisting: true};
    }

    // 3. Calculate metrics
    const metricsResult = this.calculateMetrics(
      params.observations,
      params.target,
      params.minSampleSize ?? 1,
    );

    const report: PipelineValidationReportData = {
      id: randomUUID(),
      operationId: params.operationId,
      target: params.target,
      sampleSize: metricsResult.sampleSize,
      successCount: metricsResult.successCount,
      failureCount: metricsResult.failureCount,
      medianMs: metricsResult.medianMs,
      p95Ms: metricsResult.p95Ms,
      meetsSlo: metricsResult.meetsSlo,
      status: metricsResult.status,
      metrics: metricsResult,
      observations: params.observations,
      recordedAt: new Date().toISOString(),
    };

    const persistResult = await this.repository.persistReport(tx, report);
    return {...report, wasExisting: persistResult.wasExisting};
  }
}
