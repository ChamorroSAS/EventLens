/**
 * Beta Metrics Contracts and Aggregator for EventLens (MOD-009, EL-EP-016, EL-TK-177).
 * Follows DEC-050..057 and Q-028.
 * Aggregated and minimized evidence; no PII, social profiling, or private media retained.
 */

export type CohortInclusion =
  | 'ELIGIBLE_REAL'
  | 'EXCLUDED_INTERNAL_TEST'
  | 'EXCLUDED_OUT_OF_WINDOW';

export type BetaMetricName =
  | 'VALID_UPLOADS'
  | 'PHOTO_PROCESSING_SUCCESS'
  | 'VIDEO_PROCESSING_SUCCESS'
  | 'PHOTO_LATENCY'
  | 'VIDEO_LATENCY'
  | 'EVENTS_WITHOUT_FUNCTIONAL_SUPPORT'
  | 'ORGANIZER_CONTENT_DOWNLOADS'
  | 'INDICATIVE_PARTICIPATION';

export interface BetaEvaluationGateTargets {
  validUploadsRatio: number; // 0.95 (>= 95%)
  photoProcessingSuccessRatio: number; // 0.98 (>= 98%)
  videoProcessingSuccessRatio: number; // 0.95 (>= 95%)
  photoLatencyP50Seconds: number; // 15s
  photoLatencyP95Seconds: number; // 60s
  videoLatencyP50Seconds: number; // 120s (2 min)
  videoLatencyP95Seconds: number; // 300s (5 min)
  eventsWithoutSupportRatio: number; // 0.80 (>= 80%)
  organizerDownloadsRatio: number; // 0.70 (>= 70%)
  indicativeParticipationRatio: number; // 0.60 (>= 60%)
}

export const DEFAULT_BETA_GATE_TARGETS: BetaEvaluationGateTargets = {
  validUploadsRatio: 0.95,
  photoProcessingSuccessRatio: 0.98,
  videoProcessingSuccessRatio: 0.95,
  photoLatencyP50Seconds: 15,
  photoLatencyP95Seconds: 60,
  videoLatencyP50Seconds: 120,
  videoLatencyP95Seconds: 300,
  eventsWithoutSupportRatio: 0.8,
  organizerDownloadsRatio: 0.7,
  indicativeParticipationRatio: 0.6
};

// Discriminator for atomic metric facts
export type BetaMetricFact =
  | UploadMetricFact
  | ProcessingMetricFact
  | SupportMetricFact
  | DownloadMetricFact
  | ParticipationMetricFact;

export interface BaseMetricFact {
  id: string;
  eventId: string;
  cohortInclusion: CohortInclusion;
  timestamp: Date;
}

export interface UploadMetricFact extends BaseMetricFact {
  type: 'UPLOAD';
  succeeded: boolean;
  voluntarilyCancelled: boolean;
}

export interface ProcessingMetricFact extends BaseMetricFact {
  type: 'PROCESSING';
  mediaType: 'PHOTO' | 'VIDEO';
  succeeded: boolean;
  interventionRequired: boolean;
  durationSeconds: number;
}

export interface SupportMetricFact extends BaseMetricFact {
  type: 'SUPPORT';
  hasContent: boolean;
  hadFunctionalIncident: boolean;
  category?: 'FUNCTIONAL' | 'COMMERCIAL_OR_NON_TECHNICAL';
  incidentRefs?: string[];
}

export interface DownloadMetricFact extends BaseMetricFact {
  type: 'DOWNLOAD';
  organizerId: string;
  hasContent: boolean;
  downloaded: boolean;
  downloadCancelledOrInvalid?: boolean;
}

export interface ParticipationMetricFact extends BaseMetricFact {
  type: 'PARTICIPATION';
  sessionCount: number; // number of distinct guest/organizer sessions
}

export interface MetricAggregate {
  metricName: BetaMetricName;
  numerator: number;
  denominator: number;
  ratio: number | null;
  percentiles?: {
    p50: number;
    p95: number;
  };
  evaluationGateTarget: number;
  isGatePassed: boolean;
  hasSufficientData: boolean;
  period: {
    windowStart: Date;
    windowEnd: Date;
  };
  cohortInclusion: CohortInclusion;
  totalExcludedFacts: {
    internalTests: number;
    outOfWindow: number;
    voluntaryCancellations?: number;
    contentlessEvents?: number;
  };
}

export interface BetaEvaluationSummary {
  period: {
    windowStart: Date;
    windowEnd: Date;
  };
  sampleCounts: {
    eligibleRealEvents: number;
    excludedInternalEvents: number;
    eligibleRealFiles: number;
    excludedInternalFiles: number;
  };
  aggregates: Record<BetaMetricName, MetricAggregate>;
  hasMinimumSample: boolean; // >= 20 real events & >= 1000 real files (DEC-056)
  evaluatedAt: Date;
}

export class BetaMetricsAggregator {
  private readonly facts: BetaMetricFact[] = [];

  constructor(
    private readonly targets: BetaEvaluationGateTargets = DEFAULT_BETA_GATE_TARGETS
  ) {}

  public recordFact(fact: BetaMetricFact): void {
    this.facts.push(fact);
  }

  public recordFacts(facts: BetaMetricFact[]): void {
    this.facts.push(...facts);
  }

  public getFacts(): BetaMetricFact[] {
    return [...this.facts];
  }

  public clear(): void {
    this.facts.length = 0;
  }

  /**
   * Computes aggregates for a specific metric over a time window and cohort.
   * By default, evaluates only 'ELIGIBLE_REAL' facts.
   */
  public aggregateMetric(
    metricName: BetaMetricName,
    windowStart: Date,
    windowEnd: Date,
    cohort: CohortInclusion = 'ELIGIBLE_REAL'
  ): MetricAggregate {
    const period = { windowStart, windowEnd };

    switch (metricName) {
      case 'VALID_UPLOADS':
        return this.aggregateValidUploads(period, cohort);
      case 'PHOTO_PROCESSING_SUCCESS':
        return this.aggregateProcessingSuccess('PHOTO', period, cohort);
      case 'VIDEO_PROCESSING_SUCCESS':
        return this.aggregateProcessingSuccess('VIDEO', period, cohort);
      case 'PHOTO_LATENCY':
        return this.aggregateLatency('PHOTO', period, cohort);
      case 'VIDEO_LATENCY':
        return this.aggregateLatency('VIDEO', period, cohort);
      case 'EVENTS_WITHOUT_FUNCTIONAL_SUPPORT':
        return this.aggregateSupport(period, cohort);
      case 'ORGANIZER_CONTENT_DOWNLOADS':
        return this.aggregateDownloads(period, cohort);
      case 'INDICATIVE_PARTICIPATION':
        return this.aggregateParticipation(period, cohort);
    }
  }

  /**
   * Generates a complete Beta evaluation report across all metrics and sample volume.
   */
  public evaluateBetaCohort(
    windowStart: Date,
    windowEnd: Date,
    cohort: CohortInclusion = 'ELIGIBLE_REAL'
  ): BetaEvaluationSummary {
    const metrics: BetaMetricName[] = [
      'VALID_UPLOADS',
      'PHOTO_PROCESSING_SUCCESS',
      'VIDEO_PROCESSING_SUCCESS',
      'PHOTO_LATENCY',
      'VIDEO_LATENCY',
      'EVENTS_WITHOUT_FUNCTIONAL_SUPPORT',
      'ORGANIZER_CONTENT_DOWNLOADS',
      'INDICATIVE_PARTICIPATION'
    ];

    const aggregates = {} as Record<BetaMetricName, MetricAggregate>;
    for (const m of metrics) {
      aggregates[m] = this.aggregateMetric(m, windowStart, windowEnd, cohort);
    }

    // Sample counts calculation
    const factsInWindow = this.facts.filter(
      (f) => f.timestamp >= windowStart && f.timestamp <= windowEnd
    );

    const eligibleEvents = new Set<string>();
    const internalEvents = new Set<string>();
    let eligibleRealFiles = 0;
    let excludedInternalFiles = 0;

    for (const f of factsInWindow) {
      if (f.cohortInclusion === 'ELIGIBLE_REAL') {
        eligibleEvents.add(f.eventId);
        if (f.type === 'UPLOAD' || f.type === 'PROCESSING') {
          eligibleRealFiles++;
        }
      } else if (f.cohortInclusion === 'EXCLUDED_INTERNAL_TEST') {
        internalEvents.add(f.eventId);
        if (f.type === 'UPLOAD' || f.type === 'PROCESSING') {
          excludedInternalFiles++;
        }
      }
    }

    const eligibleRealEvents = eligibleEvents.size;
    const excludedInternalEvents = internalEvents.size;

    // Minimum sample gate per DEC-056: >= 20 real events and >= 1000 real files
    const hasMinimumSample = eligibleRealEvents >= 20 && eligibleRealFiles >= 1000;

    return {
      period: { windowStart, windowEnd },
      sampleCounts: {
        eligibleRealEvents,
        excludedInternalEvents,
        eligibleRealFiles,
        excludedInternalFiles
      },
      aggregates,
      hasMinimumSample,
      evaluatedAt: new Date()
    };
  }

  // --- Private aggregation implementations ---

  private aggregateValidUploads(
    period: { windowStart: Date; windowEnd: Date },
    cohort: CohortInclusion
  ): MetricAggregate {
    const allUploadFacts = this.facts.filter(
      (f): f is UploadMetricFact => f.type === 'UPLOAD'
    );

    let internalTests = 0;
    let outOfWindow = 0;
    let voluntaryCancellations = 0;
    let numerator = 0;
    let denominator = 0;

    for (const fact of allUploadFacts) {
      if (fact.timestamp < period.windowStart || fact.timestamp > period.windowEnd) {
        outOfWindow++;
        continue;
      }

      if (fact.cohortInclusion === 'EXCLUDED_INTERNAL_TEST') {
        internalTests++;
        continue;
      }

      if (fact.cohortInclusion !== cohort) {
        continue;
      }

      // Escenario 1: Cancelación voluntaria no se cuenta como fallo de carga válida
      if (fact.voluntarilyCancelled) {
        voluntaryCancellations++;
        continue;
      }

      denominator++;
      if (fact.succeeded) {
        numerator++;
      }
    }

    const ratio = denominator > 0 ? Math.round((numerator / denominator) * 10000) / 10000 : null;
    const isGatePassed = ratio !== null && ratio >= this.targets.validUploadsRatio;

    return {
      metricName: 'VALID_UPLOADS',
      numerator,
      denominator,
      ratio,
      evaluationGateTarget: this.targets.validUploadsRatio,
      isGatePassed,
      hasSufficientData: denominator > 0,
      period,
      cohortInclusion: cohort,
      totalExcludedFacts: {
        internalTests,
        outOfWindow,
        voluntaryCancellations
      }
    };
  }

  private aggregateProcessingSuccess(
    mediaType: 'PHOTO' | 'VIDEO',
    period: { windowStart: Date; windowEnd: Date },
    cohort: CohortInclusion
  ): MetricAggregate {
    const metricName: BetaMetricName =
      mediaType === 'PHOTO' ? 'PHOTO_PROCESSING_SUCCESS' : 'VIDEO_PROCESSING_SUCCESS';
    const target =
      mediaType === 'PHOTO'
        ? this.targets.photoProcessingSuccessRatio
        : this.targets.videoProcessingSuccessRatio;

    const allFacts = this.facts.filter(
      (f): f is ProcessingMetricFact => f.type === 'PROCESSING' && f.mediaType === mediaType
    );

    let internalTests = 0;
    let outOfWindow = 0;
    let numerator = 0;
    let denominator = 0;

    for (const fact of allFacts) {
      if (fact.timestamp < period.windowStart || fact.timestamp > period.windowEnd) {
        outOfWindow++;
        continue;
      }

      if (fact.cohortInclusion === 'EXCLUDED_INTERNAL_TEST') {
        internalTests++;
        continue;
      }

      if (fact.cohortInclusion !== cohort) {
        continue;
      }

      denominator++;
      // Success requires: succeeded === true AND no manual intervention required
      if (fact.succeeded && !fact.interventionRequired) {
        numerator++;
      }
    }

    const ratio = denominator > 0 ? Math.round((numerator / denominator) * 10000) / 10000 : null;
    const isGatePassed = ratio !== null && ratio >= target;

    return {
      metricName,
      numerator,
      denominator,
      ratio,
      evaluationGateTarget: target,
      isGatePassed,
      hasSufficientData: denominator > 0,
      period,
      cohortInclusion: cohort,
      totalExcludedFacts: {
        internalTests,
        outOfWindow
      }
    };
  }

  private aggregateLatency(
    mediaType: 'PHOTO' | 'VIDEO',
    period: { windowStart: Date; windowEnd: Date },
    cohort: CohortInclusion
  ): MetricAggregate {
    const metricName: BetaMetricName =
      mediaType === 'PHOTO' ? 'PHOTO_LATENCY' : 'VIDEO_LATENCY';
    const targetP95 =
      mediaType === 'PHOTO'
        ? this.targets.photoLatencyP95Seconds
        : this.targets.videoLatencyP95Seconds;

    const allFacts = this.facts.filter(
      (f): f is ProcessingMetricFact =>
        f.type === 'PROCESSING' && f.mediaType === mediaType && f.succeeded
    );

    let internalTests = 0;
    let outOfWindow = 0;
    const durations: number[] = [];

    for (const fact of allFacts) {
      if (fact.timestamp < period.windowStart || fact.timestamp > period.windowEnd) {
        outOfWindow++;
        continue;
      }

      if (fact.cohortInclusion === 'EXCLUDED_INTERNAL_TEST') {
        internalTests++;
        continue;
      }

      if (fact.cohortInclusion !== cohort) {
        continue;
      }

      durations.push(fact.durationSeconds);
    }

    durations.sort((a, b) => a - b);
    const denominator = durations.length;

    let p50 = 0;
    let p95 = 0;

    if (durations.length > 0) {
      const p50Idx = Math.floor(durations.length * 0.5);
      const p95Idx = Math.min(Math.floor(durations.length * 0.95), durations.length - 1);
      p50 = durations[p50Idx]!;
      p95 = durations[p95Idx]!;
    }

    const isGatePassed = durations.length > 0 && p95 <= targetP95;

    return {
      metricName,
      numerator: durations.length,
      denominator,
      ratio: durations.length > 0 ? p50 : null,
      percentiles: { p50, p95 },
      evaluationGateTarget: targetP95,
      isGatePassed,
      hasSufficientData: durations.length >= 5,
      period,
      cohortInclusion: cohort,
      totalExcludedFacts: {
        internalTests,
        outOfWindow
      }
    };
  }

  private aggregateSupport(
    period: { windowStart: Date; windowEnd: Date },
    cohort: CohortInclusion
  ): MetricAggregate {
    const allFacts = this.facts.filter(
      (f): f is SupportMetricFact => f.type === 'SUPPORT'
    );

    let internalTests = 0;
    let outOfWindow = 0;
    let contentlessEvents = 0;
    let numerator = 0;
    let denominator = 0;

    // Deduplicate by eventId (one fact per event in the period)
    const eventFacts = new Map<string, SupportMetricFact>();
    for (const fact of allFacts) {
      eventFacts.set(fact.eventId, fact);
    }

    for (const fact of eventFacts.values()) {
      if (fact.timestamp < period.windowStart || fact.timestamp > period.windowEnd) {
        outOfWindow++;
        continue;
      }

      if (fact.cohortInclusion === 'EXCLUDED_INTERNAL_TEST') {
        internalTests++;
        continue;
      }

      if (fact.cohortInclusion !== cohort) {
        continue;
      }

      // Escenario 2: Evento sin contenido no contamina denominadores dependientes de contenido
      if (!fact.hasContent) {
        contentlessEvents++;
        continue;
      }

      denominator++;
      // Escenario 1 & 2: Categoría explícita FUNCTIONAL penaliza; COMMERCIAL_OR_NON_TECHNICAL se excluye de la penalización
      const isFunctionalPenalty =
        fact.category === 'FUNCTIONAL' ||
        (fact.hadFunctionalIncident && fact.category !== 'COMMERCIAL_OR_NON_TECHNICAL');

      if (!isFunctionalPenalty) {
        numerator++;
      }
    }

    const ratio = denominator > 0 ? Math.round((numerator / denominator) * 10000) / 10000 : null;
    const isGatePassed = ratio !== null && ratio >= this.targets.eventsWithoutSupportRatio;

    return {
      metricName: 'EVENTS_WITHOUT_FUNCTIONAL_SUPPORT',
      numerator,
      denominator,
      ratio,
      evaluationGateTarget: this.targets.eventsWithoutSupportRatio,
      isGatePassed,
      hasSufficientData: denominator > 0,
      period,
      cohortInclusion: cohort,
      totalExcludedFacts: {
        internalTests,
        outOfWindow,
        contentlessEvents
      }
    };
  }

  private aggregateDownloads(
    period: { windowStart: Date; windowEnd: Date },
    cohort: CohortInclusion
  ): MetricAggregate {
    const allFacts = this.facts.filter(
      (f): f is DownloadMetricFact => f.type === 'DOWNLOAD'
    );

    let internalTests = 0;
    let outOfWindow = 0;
    let contentlessEvents = 0;
    let numerator = 0;
    let denominator = 0;

    // Deduplicate by organizerId (per organizer with content)
    const organizerFacts = new Map<string, DownloadMetricFact>();
    for (const fact of allFacts) {
      organizerFacts.set(`${fact.organizerId}:${fact.eventId}`, fact);
    }

    for (const fact of organizerFacts.values()) {
      if (fact.timestamp < period.windowStart || fact.timestamp > period.windowEnd) {
        outOfWindow++;
        continue;
      }

      if (fact.cohortInclusion === 'EXCLUDED_INTERNAL_TEST') {
        internalTests++;
        continue;
      }

      if (fact.cohortInclusion !== cohort) {
        continue;
      }

      // Escenario 2: Organizador con evento sin contenido no contamina el denominador de descargas
      if (!fact.hasContent) {
        contentlessEvents++;
        continue;
      }

      denominator++;
      if (fact.downloaded && !fact.downloadCancelledOrInvalid) {
        numerator++;
      }
    }

    const ratio = denominator > 0 ? Math.round((numerator / denominator) * 10000) / 10000 : null;
    const isGatePassed = ratio !== null && ratio >= this.targets.organizerDownloadsRatio;

    return {
      metricName: 'ORGANIZER_CONTENT_DOWNLOADS',
      numerator,
      denominator,
      ratio,
      evaluationGateTarget: this.targets.organizerDownloadsRatio,
      isGatePassed,
      hasSufficientData: denominator > 0,
      period,
      cohortInclusion: cohort,
      totalExcludedFacts: {
        internalTests,
        outOfWindow,
        contentlessEvents
      }
    };
  }

  private aggregateParticipation(
    period: { windowStart: Date; windowEnd: Date },
    cohort: CohortInclusion
  ): MetricAggregate {
    const allFacts = this.facts.filter(
      (f): f is ParticipationMetricFact => f.type === 'PARTICIPATION'
    );

    let internalTests = 0;
    let outOfWindow = 0;
    let numerator = 0;
    let denominator = 0;

    // Deduplicate by eventId
    const eventFacts = new Map<string, ParticipationMetricFact>();
    for (const fact of allFacts) {
      eventFacts.set(fact.eventId, fact);
    }

    for (const fact of eventFacts.values()) {
      if (fact.timestamp < period.windowStart || fact.timestamp > period.windowEnd) {
        outOfWindow++;
        continue;
      }

      if (fact.cohortInclusion === 'EXCLUDED_INTERNAL_TEST') {
        internalTests++;
        continue;
      }

      if (fact.cohortInclusion !== cohort) {
        continue;
      }

      denominator++;
      // Participation criteria: events with >= 3 distinct sessions (DEC-055)
      if (fact.sessionCount >= 3) {
        numerator++;
      }
    }

    const ratio = denominator > 0 ? Math.round((numerator / denominator) * 10000) / 10000 : null;
    const isGatePassed = ratio !== null && ratio >= this.targets.indicativeParticipationRatio;

    return {
      metricName: 'INDICATIVE_PARTICIPATION',
      numerator,
      denominator,
      ratio,
      evaluationGateTarget: this.targets.indicativeParticipationRatio,
      isGatePassed,
      hasSufficientData: denominator > 0,
      period,
      cohortInclusion: cohort,
      totalExcludedFacts: {
        internalTests,
        outOfWindow
      }
    };
  }
}
