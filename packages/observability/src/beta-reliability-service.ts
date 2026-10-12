import {
  MediaReliabilityReport,
  ProcessingLatencyStats,
  ProcessingReliabilityResult,
  UploadReliabilityResult
} from './contracts.js';
import {
  BetaEvaluationGateTargets,
  CohortInclusion,
  DEFAULT_BETA_GATE_TARGETS,
  ProcessingMetricFact,
  UploadMetricFact
} from './beta-metrics.js';

export class BetaReliabilityService {
  private readonly uploadFacts = new Map<string, UploadMetricFact>();
  private readonly processingFacts = new Map<string, ProcessingMetricFact>();
  private deduplicationCounter = 0;
  private outlierCounter = 0;

  constructor(
    private readonly targets: BetaEvaluationGateTargets = DEFAULT_BETA_GATE_TARGETS
  ) {}

  public recordUploadFact(fact: UploadMetricFact): boolean {
    if (!fact.id || !fact.timestamp) {
      return false;
    }
    if (this.uploadFacts.has(fact.id)) {
      this.deduplicationCounter++;
      return false; // deduplicated
    }
    this.uploadFacts.set(fact.id, fact);
    return true;
  }

  public recordUploadFacts(facts: UploadMetricFact[]): number {
    let recorded = 0;
    for (const f of facts) {
      if (this.recordUploadFact(f)) recorded++;
    }
    return recorded;
  }

  public recordProcessingFact(fact: ProcessingMetricFact): boolean {
    if (!fact.id || !fact.timestamp) {
      return false;
    }
    if (this.processingFacts.has(fact.id)) {
      this.deduplicationCounter++;
      return false; // deduplicated
    }
    // Validate duration: exclude corrupt/negative durations or excessive outliers
    if (
      typeof fact.durationSeconds !== 'number' ||
      !Number.isFinite(fact.durationSeconds) ||
      fact.durationSeconds < 0 ||
      fact.durationSeconds > 86400
    ) {
      this.outlierCounter++;
      // Still store fact for success/failure count, but flag or normalize duration
      this.processingFacts.set(fact.id, {
        ...fact,
        durationSeconds: -1 // flagged as invalid latency
      });
      return true;
    }

    this.processingFacts.set(fact.id, fact);
    return true;
  }

  public recordProcessingFacts(facts: ProcessingMetricFact[]): number {
    let recorded = 0;
    for (const f of facts) {
      if (this.recordProcessingFact(f)) recorded++;
    }
    return recorded;
  }

  public getDeduplicationCount(): number {
    return this.deduplicationCounter;
  }

  public getOutlierCount(): number {
    return this.outlierCounter;
  }

  public clear(): void {
    this.uploadFacts.clear( );
    this.processingFacts.clear();
    this.deduplicationCounter = 0;
    this.outlierCounter = 0;
  }

  /**
   * Escenario 1: Calcula la tasa de éxito de cargas válidas excluyendo cancelaciones voluntarias (DEC-050).
   * Objetivo: Cargas válidas >= 95%.
   */
  public evaluateValidUploads(
    windowStart: Date,
    windowEnd: Date,
    cohort: CohortInclusion = 'ELIGIBLE_REAL'
  ): UploadReliabilityResult {
    let excludedInternalTests = 0;
    let voluntaryCancellations = 0;
    let successfulUploads = 0;
    let failedUploads = 0;

    for (const fact of this.uploadFacts.values()) {
      if (fact.timestamp < windowStart || fact.timestamp > windowEnd) {
        continue;
      }

      if (fact.cohortInclusion === 'EXCLUDED_INTERNAL_TEST') {
        excludedInternalTests++;
        continue;
      }

      if (fact.cohortInclusion !== cohort) {
        continue;
      }

      // Escenario 1: Cancelación voluntaria excluida del cálculo de tasa de carga válida
      if (fact.voluntarilyCancelled) {
        voluntaryCancellations++;
        continue;
      }

      if (fact.succeeded) {
        successfulUploads++;
      } else {
        failedUploads++;
      }
    }

    const totalAttempts = successfulUploads + failedUploads;
    const ratio = totalAttempts > 0 ? Math.round((successfulUploads / totalAttempts) * 10000) / 10000 : null;
    const isTargetMet = ratio !== null && ratio >= this.targets.validUploadsRatio;

    return {
      totalAttempts,
      successfulUploads,
      failedUploads,
      voluntaryCancellations,
      excludedInternalTests,
      ratio,
      targetRatio: this.targets.validUploadsRatio,
      isTargetMet,
      hasSufficientData: totalAttempts >= 1
    };
  }

  /**
   * Escenarios 2 y 3: Calcula confiabilidad y latencias separadas para FOTO y VIDEO sin intervención (DEC-051, DEC-052).
   * Objetivos:
   *  - Foto éxito sin intervención >= 98%, mediana <= 15s, p95 <= 60s
   *  - Video éxito sin intervención >= 95%, mediana <= 120s (2 min), p95 <= 300s (5 min)
   */
  public evaluateProcessingReliability(
    mediaType: 'PHOTO' | 'VIDEO',
    windowStart: Date,
    windowEnd: Date,
    cohort: CohortInclusion = 'ELIGIBLE_REAL'
  ): ProcessingReliabilityResult {
    const targetRatio =
      mediaType === 'PHOTO'
        ? this.targets.photoProcessingSuccessRatio
        : this.targets.videoProcessingSuccessRatio;

    const targetMedian =
      mediaType === 'PHOTO'
        ? this.targets.photoLatencyP50Seconds
        : this.targets.videoLatencyP50Seconds;

    const targetP95 =
      mediaType === 'PHOTO'
        ? this.targets.photoLatencyP95Seconds
        : this.targets.videoLatencyP95Seconds;

    let excludedInternalTests = 0;
    let successfulWithoutIntervention = 0;
    let interventionsRequired = 0;
    let failedAttempts = 0;
    let outliersExcluded = 0;
    const validDurations: number[] = [];

    for (const fact of this.processingFacts.values()) {
      if (fact.mediaType !== mediaType) {
        continue;
      }

      if (fact.timestamp < windowStart || fact.timestamp > windowEnd) {
        continue;
      }

      if (fact.cohortInclusion === 'EXCLUDED_INTERNAL_TEST') {
        excludedInternalTests++;
        continue;
      }

      if (fact.cohortInclusion !== cohort) {
        continue;
      }

      // Escenario 2: Evaluación separada sin intervención manual
      if (fact.interventionRequired) {
        interventionsRequired++;
      } else if (fact.succeeded) {
        successfulWithoutIntervention++;
      } else {
        failedAttempts++;
      }

      // Escenario 3: Latencias válidas para elementos completados
      if (fact.succeeded) {
        if (fact.durationSeconds >= 0 && Number.isFinite(fact.durationSeconds)) {
          validDurations.push(fact.durationSeconds);
        } else {
          outliersExcluded++;
        }
      }
    }

    const totalEvaluated = successfulWithoutIntervention + interventionsRequired + failedAttempts;
    const ratio = totalEvaluated > 0 ? Math.round((successfulWithoutIntervention / totalEvaluated) * 10000) / 10000 : null;
    const isTargetMet = ratio !== null && ratio >= targetRatio;

    // Percentil calculation
    validDurations.sort((a, b) => a - b);
    const sampleSize = validDurations.length;
    let medianSeconds: number | null = null;
    let p95Seconds: number | null = null;
    let isMedianTargetMet = false;
    let isP95TargetMet = false;
    let isLatencyTargetMet = false;

    if (sampleSize > 0) {
      const p50Idx = Math.floor(sampleSize * 0.5);
      const p95Idx = Math.min(Math.floor(sampleSize * 0.95), sampleSize - 1);
      medianSeconds = validDurations[p50Idx]!;
      p95Seconds = validDurations[p95Idx]!;

      isMedianTargetMet = medianSeconds <= targetMedian;
      isP95TargetMet = p95Seconds <= targetP95;
      isLatencyTargetMet = isMedianTargetMet && isP95TargetMet;
    }

    const latencyStats: ProcessingLatencyStats = {
      medianSeconds,
      p95Seconds,
      sampleSize,
      targetMedianSeconds: targetMedian,
      targetP95Seconds: targetP95,
      isMedianTargetMet,
      isP95TargetMet,
      isLatencyTargetMet,
      outliersExcluded
    };

    return {
      mediaType,
      totalEvaluated,
      successfulWithoutIntervention,
      interventionsRequired,
      failedAttempts,
      excludedInternalTests,
      ratio,
      targetRatio,
      isTargetMet,
      latency: latencyStats,
      hasSufficientData: totalEvaluated >= 1
    };
  }

  /**
   * Genera el informe consolidado de confiabilidad de cargas y procesamiento multimedia (EL-TK-178).
   */
  public evaluateReliability(params: {
    windowStart: Date;
    windowEnd: Date;
    cohort?: CohortInclusion;
  }): MediaReliabilityReport {
    const cohort = params.cohort ?? 'ELIGIBLE_REAL';
    const validUploads = this.evaluateValidUploads(params.windowStart, params.windowEnd, cohort);
    const photoProcessing = this.evaluateProcessingReliability('PHOTO', params.windowStart, params.windowEnd, cohort);
    const videoProcessing = this.evaluateProcessingReliability('VIDEO', params.windowStart, params.windowEnd, cohort);

    const hasData =
      validUploads.hasSufficientData &&
      photoProcessing.hasSufficientData &&
      videoProcessing.hasSufficientData;

    let overallStatus: 'PASS' | 'FAIL' | 'INSUFFICIENT_DATA';
    if (!hasData) {
      overallStatus = 'INSUFFICIENT_DATA';
    } else {
      const allTargetsPassed =
        validUploads.isTargetMet &&
        photoProcessing.isTargetMet &&
        photoProcessing.latency.isLatencyTargetMet &&
        videoProcessing.isTargetMet &&
        videoProcessing.latency.isLatencyTargetMet;
      overallStatus = allTargetsPassed ? 'PASS' : 'FAIL';
    }

    return {
      evaluatedAt: new Date(),
      period: {
        windowStart: params.windowStart,
        windowEnd: params.windowEnd
      },
      cohortInclusion: cohort,
      validUploads,
      photoProcessing,
      videoProcessing,
      overallStatus,
      deduplicatedFactsCount: this.deduplicationCounter,
      sanitizedMetadata: {
        privacyGuaranteed: 'Metrics aggregated without guest names or object storage keys',
        outliersCleanedCount: this.outlierCounter,
        totalFactsDeduplicated: this.deduplicationCounter
      }
    };
  }
}
