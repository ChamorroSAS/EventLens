import { describe, expect, it } from 'vitest';
import {
  BetaMetricsAggregator,
  DEFAULT_BETA_GATE_TARGETS
} from '../src/index.js';

describe('BetaMetricsAggregator (Unit Tests — EL-TK-177)', () => {
  const windowStart = new Date('2026-08-01T00:00:00Z');
  const windowEnd = new Date('2026-09-30T23:59:59Z');
  const withinWindow = new Date('2026-08-15T12:00:00Z');

  it('Scenario 1: voluntary cancellations are excluded from valid upload denominators', () => {
    const aggregator = new BetaMetricsAggregator();

    // 10 upload attempts in real events:
    // - 7 succeeded
    // - 1 failed
    // - 2 voluntarily cancelled by user
    for (let i = 0; i < 7; i++) {
      aggregator.recordFact({
        id: `up-succ-${i}`,
        type: 'UPLOAD',
        eventId: 'evt-real-1',
        cohortInclusion: 'ELIGIBLE_REAL',
        succeeded: true,
        voluntarilyCancelled: false,
        timestamp: withinWindow
      });
    }

    aggregator.recordFact({
      id: 'up-fail-1',
      type: 'UPLOAD',
      eventId: 'evt-real-1',
      cohortInclusion: 'ELIGIBLE_REAL',
      succeeded: false,
      voluntarilyCancelled: false,
      timestamp: withinWindow
    });

    for (let i = 0; i < 2; i++) {
      aggregator.recordFact({
        id: `up-cancel-${i}`,
        type: 'UPLOAD',
        eventId: 'evt-real-1',
        cohortInclusion: 'ELIGIBLE_REAL',
        succeeded: false,
        voluntarilyCancelled: true,
        timestamp: withinWindow
      });
    }

    // Also 3 upload attempts in internal tests (must be excluded)
    for (let i = 0; i < 3; i++) {
      aggregator.recordFact({
        id: `up-internal-${i}`,
        type: 'UPLOAD',
        eventId: 'evt-internal-1',
        cohortInclusion: 'EXCLUDED_INTERNAL_TEST',
        succeeded: false,
        voluntarilyCancelled: false,
        timestamp: withinWindow
      });
    }

    const aggregate = aggregator.aggregateMetric('VALID_UPLOADS', windowStart, windowEnd);

    // Denominator must be 8 (7 successes + 1 failure; 2 voluntary cancellations excluded)
    // Numerator must be 7
    // Ratio = 7 / 8 = 0.875
    expect(aggregate.denominator).toBe(8);
    expect(aggregate.numerator).toBe(7);
    expect(aggregate.ratio).toBe(0.875);
    expect(aggregate.totalExcludedFacts.voluntaryCancellations).toBe(2);
    expect(aggregate.totalExcludedFacts.internalTests).toBe(3);
    expect(aggregate.isGatePassed).toBe(false); // 0.875 < 0.95 gate target
  });

  it('Scenario 2: events without content do not contaminate content-dependent denominators', () => {
    const aggregator = new BetaMetricsAggregator();

    // Event 1: has content, had no functional support incidents
    aggregator.recordFact({
      id: 'supp-1',
      type: 'SUPPORT',
      eventId: 'evt-content-1',
      cohortInclusion: 'ELIGIBLE_REAL',
      hasContent: true,
      hadFunctionalIncident: false,
      timestamp: withinWindow
    });

    // Event 2: has content, had functional support incident
    aggregator.recordFact({
      id: 'supp-2',
      type: 'SUPPORT',
      eventId: 'evt-content-2',
      cohortInclusion: 'ELIGIBLE_REAL',
      hasContent: true,
      hadFunctionalIncident: true,
      timestamp: withinWindow
    });

    // Event 3: NO content (empty event), should be excluded from denominator
    aggregator.recordFact({
      id: 'supp-3',
      type: 'SUPPORT',
      eventId: 'evt-empty-3',
      cohortInclusion: 'ELIGIBLE_REAL',
      hasContent: false,
      hadFunctionalIncident: false,
      timestamp: withinWindow
    });

    // Organizer downloads facts:
    // Org 1 for evt-content-1: downloaded
    aggregator.recordFact({
      id: 'dl-1',
      type: 'DOWNLOAD',
      eventId: 'evt-content-1',
      organizerId: 'org-1',
      cohortInclusion: 'ELIGIBLE_REAL',
      hasContent: true,
      downloaded: true,
      timestamp: withinWindow
    });

    // Org 2 for evt-empty-3: empty event, must be excluded from download denominator
    aggregator.recordFact({
      id: 'dl-2',
      type: 'DOWNLOAD',
      eventId: 'evt-empty-3',
      organizerId: 'org-2',
      cohortInclusion: 'ELIGIBLE_REAL',
      hasContent: false,
      downloaded: false,
      timestamp: withinWindow
    });

    const supportAgg = aggregator.aggregateMetric(
      'EVENTS_WITHOUT_FUNCTIONAL_SUPPORT',
      windowStart,
      windowEnd
    );

    // Only events with content count: 2 events with content, 1 without incidents -> 50%
    expect(supportAgg.denominator).toBe(2);
    expect(supportAgg.numerator).toBe(1);
    expect(supportAgg.ratio).toBe(0.5);
    expect(supportAgg.totalExcludedFacts.contentlessEvents).toBe(1);

    const downloadAgg = aggregator.aggregateMetric(
      'ORGANIZER_CONTENT_DOWNLOADS',
      windowStart,
      windowEnd
    );

    // Only organizers with content count: 1 organizer with content, 1 downloaded -> 100%
    expect(downloadAgg.denominator).toBe(1);
    expect(downloadAgg.numerator).toBe(1);
    expect(downloadAgg.ratio).toBe(1.0);
    expect(downloadAgg.isGatePassed).toBe(true);
    expect(downloadAgg.totalExcludedFacts.contentlessEvents).toBe(1);
  });

  it('Scenario 3: aggregates include explicit numerator, denominator, ratio, and observation period', () => {
    const aggregator = new BetaMetricsAggregator();

    // 100 photo processing facts: 99 successful without intervention, 1 requiring intervention
    for (let i = 0; i < 99; i++) {
      aggregator.recordFact({
        id: `proc-photo-${i}`,
        type: 'PROCESSING',
        mediaType: 'PHOTO',
        eventId: 'evt-1',
        cohortInclusion: 'ELIGIBLE_REAL',
        succeeded: true,
        interventionRequired: false,
        durationSeconds: 12,
        timestamp: withinWindow
      });
    }
    aggregator.recordFact({
      id: 'proc-photo-intervention',
      type: 'PROCESSING',
      mediaType: 'PHOTO',
      eventId: 'evt-1',
      cohortInclusion: 'ELIGIBLE_REAL',
      succeeded: true,
      interventionRequired: true,
      durationSeconds: 45,
      timestamp: withinWindow
    });

    const aggregate = aggregator.aggregateMetric(
      'PHOTO_PROCESSING_SUCCESS',
      windowStart,
      windowEnd
    );

    expect(aggregate.metricName).toBe('PHOTO_PROCESSING_SUCCESS');
    expect(aggregate.numerator).toBe(99);
    expect(aggregate.denominator).toBe(100);
    expect(aggregate.ratio).toBe(0.99);
    expect(aggregate.evaluationGateTarget).toBe(DEFAULT_BETA_GATE_TARGETS.photoProcessingSuccessRatio);
    expect(aggregate.isGatePassed).toBe(true); // 0.99 >= 0.98
    expect(aggregate.period.windowStart).toEqual(windowStart);
    expect(aggregate.period.windowEnd).toEqual(windowEnd);
  });

  it('evaluates processing latencies with accurate p50 and p95 percentiles', () => {
    const aggregator = new BetaMetricsAggregator();

    // Record 20 video processing durations: 10 at 60s, 8 at 100s, 2 at 250s
    for (let i = 0; i < 10; i++) {
      aggregator.recordFact({
        id: `vid-fast-${i}`,
        type: 'PROCESSING',
        mediaType: 'VIDEO',
        eventId: 'evt-2',
        cohortInclusion: 'ELIGIBLE_REAL',
        succeeded: true,
        interventionRequired: false,
        durationSeconds: 60,
        timestamp: withinWindow
      });
    }
    for (let i = 0; i < 8; i++) {
      aggregator.recordFact({
        id: `vid-med-${i}`,
        type: 'PROCESSING',
        mediaType: 'VIDEO',
        eventId: 'evt-2',
        cohortInclusion: 'ELIGIBLE_REAL',
        succeeded: true,
        interventionRequired: false,
        durationSeconds: 100,
        timestamp: withinWindow
      });
    }
    for (let i = 0; i < 2; i++) {
      aggregator.recordFact({
        id: `vid-slow-${i}`,
        type: 'PROCESSING',
        mediaType: 'VIDEO',
        eventId: 'evt-2',
        cohortInclusion: 'ELIGIBLE_REAL',
        succeeded: true,
        interventionRequired: false,
        durationSeconds: 250,
        timestamp: withinWindow
      });
    }

    const latencyAgg = aggregator.aggregateMetric('VIDEO_LATENCY', windowStart, windowEnd);

    expect(latencyAgg.denominator).toBe(20);
    expect(latencyAgg.percentiles?.p50).toBe(100);
    expect(latencyAgg.percentiles?.p95).toBe(250);
    expect(latencyAgg.isGatePassed).toBe(true); // p95 (250s) <= target (300s)
  });

  it('evaluates indicative participation with >= 3 sessions criterion', () => {
    const aggregator = new BetaMetricsAggregator();

    // 10 events: 7 with >= 3 sessions, 3 with < 3 sessions
    for (let i = 0; i < 7; i++) {
      aggregator.recordFact({
        id: `part-high-${i}`,
        type: 'PARTICIPATION',
        eventId: `evt-high-${i}`,
        cohortInclusion: 'ELIGIBLE_REAL',
        sessionCount: 5,
        timestamp: withinWindow
      });
    }
    for (let i = 0; i < 3; i++) {
      aggregator.recordFact({
        id: `part-low-${i}`,
        type: 'PARTICIPATION',
        eventId: `evt-low-${i}`,
        cohortInclusion: 'ELIGIBLE_REAL',
        sessionCount: 1,
        timestamp: withinWindow
      });
    }

    const partAgg = aggregator.aggregateMetric('INDICATIVE_PARTICIPATION', windowStart, windowEnd);

    expect(partAgg.denominator).toBe(10);
    expect(partAgg.numerator).toBe(7);
    expect(partAgg.ratio).toBe(0.7);
    expect(partAgg.isGatePassed).toBe(true); // 0.70 >= 0.60
  });

  it('evaluates complete Beta cohort and validates minimum sample gate (DEC-056)', () => {
    const aggregator = new BetaMetricsAggregator();

    // Create 20 eligible real events with 50 files each (1000 files total)
    for (let e = 1; e <= 20; e++) {
      for (let f = 1; f <= 50; f++) {
        aggregator.recordFact({
          id: `fact-e${e}-f${f}`,
          type: 'UPLOAD',
          eventId: `evt-real-${e}`,
          cohortInclusion: 'ELIGIBLE_REAL',
          succeeded: true,
          voluntarilyCancelled: false,
          timestamp: withinWindow
        });
      }
    }

    // Add 5 internal test events
    for (let e = 1; e <= 5; e++) {
      aggregator.recordFact({
        id: `internal-e${e}`,
        type: 'UPLOAD',
        eventId: `evt-internal-${e}`,
        cohortInclusion: 'EXCLUDED_INTERNAL_TEST',
        succeeded: true,
        voluntarilyCancelled: false,
        timestamp: withinWindow
      });
    }

    const summary = aggregator.evaluateBetaCohort(windowStart, windowEnd);

    expect(summary.sampleCounts.eligibleRealEvents).toBe(20);
    expect(summary.sampleCounts.eligibleRealFiles).toBe(1000);
    expect(summary.sampleCounts.excludedInternalEvents).toBe(5);
    expect(summary.hasMinimumSample).toBe(true);
  });
});
