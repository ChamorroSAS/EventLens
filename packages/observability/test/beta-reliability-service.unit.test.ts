import { describe, expect, it, beforeEach } from 'vitest';
import { BetaReliabilityService } from '../src/beta-reliability-service.js';
import { ProcessingMetricFact, UploadMetricFact } from '../src/beta-metrics.js';

describe('BetaReliabilityService (EL-TK-178 Reliability Metrics)', () => {
  let service: BetaReliabilityService;
  const windowStart = new Date('2026-10-01T00:00:00.000Z');
  const windowEnd = new Date('2026-10-31T23:59:59.999Z');
  const factTimestamp = new Date('2026-10-15T12:00:00.000Z');

  beforeEach(() => {
    service = new BetaReliabilityService();
  });

  // Escenario 1
  it('Escenario 1: calculates valid uploads success ratio excluding voluntary cancellations and internal tests', () => {
    const facts: UploadMetricFact[] = [
      // 95 successful real uploads
      ...Array.from({ length: 95 }, (_, i) => ({
        id: `upload-ok-${i}`,
        eventId: 'event-01',
        cohortInclusion: 'ELIGIBLE_REAL' as const,
        timestamp: factTimestamp,
        type: 'UPLOAD' as const,
        succeeded: true,
        voluntarilyCancelled: false
      })),
      // 5 failed real uploads
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `upload-fail-${i}`,
        eventId: 'event-01',
        cohortInclusion: 'ELIGIBLE_REAL' as const,
        timestamp: factTimestamp,
        type: 'UPLOAD' as const,
        succeeded: false,
        voluntarilyCancelled: false
      })),
      // 10 voluntary cancellations (DEC-050) - must be excluded from valid uploads ratio
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `upload-cancel-${i}`,
        eventId: 'event-01',
        cohortInclusion: 'ELIGIBLE_REAL' as const,
        timestamp: factTimestamp,
        type: 'UPLOAD' as const,
        succeeded: false,
        voluntarilyCancelled: true
      })),
      // 20 internal test uploads - must be excluded
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `upload-internal-${i}`,
        eventId: 'event-test-internal',
        cohortInclusion: 'EXCLUDED_INTERNAL_TEST' as const,
        timestamp: factTimestamp,
        type: 'UPLOAD' as const,
        succeeded: true,
        voluntarilyCancelled: false
      }))
    ];

    service.recordUploadFacts(facts);

    const result = service.evaluateValidUploads(windowStart, windowEnd, 'ELIGIBLE_REAL');

    expect(result.totalAttempts).toBe(100); // 95 ok + 5 fail (cancellations excluded)
    expect(result.successfulUploads).toBe(95);
    expect(result.failedUploads).toBe(5);
    expect(result.voluntaryCancellations).toBe(10);
    expect(result.excludedInternalTests).toBe(20);
    expect(result.ratio).toBe(0.95);
    expect(result.targetRatio).toBe(0.95);
    expect(result.isTargetMet).toBe(true);
    expect(result.hasSufficientData).toBe(true);
  });

  // Escenario 2
  it('Escenario 2: evaluates photos and videos separately requiring success without manual intervention', () => {
    // 98 successful photos without intervention, 2 with intervention (must count as failure for target)
    const photoFacts: ProcessingMetricFact[] = [
      ...Array.from({ length: 98 }, (_, i) => ({
        id: `photo-clean-${i}`,
        eventId: 'event-01',
        cohortInclusion: 'ELIGIBLE_REAL' as const,
        timestamp: factTimestamp,
        type: 'PROCESSING' as const,
        mediaType: 'PHOTO' as const,
        succeeded: true,
        interventionRequired: false,
        durationSeconds: 12
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        id: `photo-intervention-${i}`,
        eventId: 'event-01',
        cohortInclusion: 'ELIGIBLE_REAL' as const,
        timestamp: factTimestamp,
        type: 'PROCESSING' as const,
        mediaType: 'PHOTO' as const,
        succeeded: true,
        interventionRequired: true,
        durationSeconds: 25
      }))
    ];

    // 95 successful videos without intervention, 5 failed videos
    const videoFacts: ProcessingMetricFact[] = [
      ...Array.from({ length: 95 }, (_, i) => ({
        id: `video-clean-${i}`,
        eventId: 'event-01',
        cohortInclusion: 'ELIGIBLE_REAL' as const,
        timestamp: factTimestamp,
        type: 'PROCESSING' as const,
        mediaType: 'VIDEO' as const,
        succeeded: true,
        interventionRequired: false,
        durationSeconds: 90
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `video-fail-${i}`,
        eventId: 'event-01',
        cohortInclusion: 'ELIGIBLE_REAL' as const,
        timestamp: factTimestamp,
        type: 'PROCESSING' as const,
        mediaType: 'VIDEO' as const,
        succeeded: false,
        interventionRequired: false,
        durationSeconds: 180
      }))
    ];

    service.recordProcessingFacts([...photoFacts, ...videoFacts]);

    // Evaluate Photo (Target >= 98%)
    const photoResult = service.evaluateProcessingReliability('PHOTO', windowStart, windowEnd);
    expect(photoResult.totalEvaluated).toBe(100);
    expect(photoResult.successfulWithoutIntervention).toBe(98);
    expect(photoResult.interventionsRequired).toBe(2);
    expect(photoResult.ratio).toBe(0.98);
    expect(photoResult.targetRatio).toBe(0.98);
    expect(photoResult.isTargetMet).toBe(true);

    // Evaluate Video (Target >= 95%)
    const videoResult = service.evaluateProcessingReliability('VIDEO', windowStart, windowEnd);
    expect(videoResult.totalEvaluated).toBe(100);
    expect(videoResult.successfulWithoutIntervention).toBe(95);
    expect(videoResult.failedAttempts).toBe(5);
    expect(videoResult.ratio).toBe(0.95);
    expect(videoResult.targetRatio).toBe(0.95);
    expect(videoResult.isTargetMet).toBe(true);
  });

  // Escenario 3
  it('Escenario 3: reports median and p95 latency distributions by media type against target thresholds', () => {
    // 20 photos with latency ranging from 5s to 50s (median ~14s <= 15s target, p95 ~48s <= 60s target)
    const photoLatencies = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 25, 30, 40, 48, 50];
    const photoFacts: ProcessingMetricFact[] = photoLatencies.map((sec, idx) => ({
      id: `photo-lat-${idx}`,
      eventId: 'event-01',
      cohortInclusion: 'ELIGIBLE_REAL' as const,
      timestamp: factTimestamp,
      type: 'PROCESSING' as const,
      mediaType: 'PHOTO' as const,
      succeeded: true,
      interventionRequired: false,
      durationSeconds: sec
    }));

    // 20 videos with latency ranging from 40s to 280s (median ~100s <= 120s target, p95 ~270s <= 300s target)
    const videoLatencies = [40, 50, 60, 70, 80, 90, 95, 100, 105, 110, 115, 120, 130, 140, 160, 180, 200, 240, 270, 280];
    const videoFacts: ProcessingMetricFact[] = videoLatencies.map((sec, idx) => ({
      id: `video-lat-${idx}`,
      eventId: 'event-01',
      cohortInclusion: 'ELIGIBLE_REAL' as const,
      timestamp: factTimestamp,
      type: 'PROCESSING' as const,
      mediaType: 'VIDEO' as const,
      succeeded: true,
      interventionRequired: false,
      durationSeconds: sec
    }));

    service.recordProcessingFacts([...photoFacts, ...videoFacts]);

    const photoRes = service.evaluateProcessingReliability('PHOTO', windowStart, windowEnd);
    expect(photoRes.latency.medianSeconds).toBeLessThanOrEqual(15);
    expect(photoRes.latency.p95Seconds).toBeLessThanOrEqual(60);
    expect(photoRes.latency.isMedianTargetMet).toBe(true);
    expect(photoRes.latency.isP95TargetMet).toBe(true);
    expect(photoRes.latency.isLatencyTargetMet).toBe(true);

    const videoRes = service.evaluateProcessingReliability('VIDEO', windowStart, windowEnd);
    expect(videoRes.latency.medianSeconds).toBeLessThanOrEqual(120);
    expect(videoRes.latency.p95Seconds).toBeLessThanOrEqual(300);
    expect(videoRes.latency.isMedianTargetMet).toBe(true);
    expect(videoRes.latency.isP95TargetMet).toBe(true);
    expect(videoRes.latency.isLatencyTargetMet).toBe(true);
  });

  it('deduplicates duplicate facts deterministically without inflating denominators', () => {
    const fact: UploadMetricFact = {
      id: 'duplicate-fact-id-123',
      eventId: 'event-01',
      cohortInclusion: 'ELIGIBLE_REAL',
      timestamp: factTimestamp,
      type: 'UPLOAD',
      succeeded: true,
      voluntarilyCancelled: false
    };

    const first = service.recordUploadFact(fact);
    const second = service.recordUploadFact(fact);
    const third = service.recordUploadFact(fact);

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(third).toBe(false);
    expect(service.getDeduplicationCount()).toBe(2);

    const result = service.evaluateValidUploads(windowStart, windowEnd);
    expect(result.totalAttempts).toBe(1);
    expect(result.successfulUploads).toBe(1);
  });

  it('filters out corrupt outliers and handles missing or insufficient sample sizes safely', () => {
    // 1. Corrupt outlier with negative duration
    service.recordProcessingFact({
      id: 'photo-corrupt-outlier',
      eventId: 'event-01',
      cohortInclusion: 'ELIGIBLE_REAL',
      timestamp: factTimestamp,
      type: 'PROCESSING',
      mediaType: 'PHOTO',
      succeeded: true,
      interventionRequired: false,
      durationSeconds: -99 // invalid
    });

    expect(service.getOutlierCount()).toBe(1);

    // 2. Empty state evaluation
    const emptyUploads = service.evaluateValidUploads(
      new Date('2025-01-01'),
      new Date('2025-01-02')
    );
    expect(emptyUploads.hasSufficientData).toBe(false);
    expect(emptyUploads.ratio).toBeNull();
    expect(emptyUploads.isTargetMet).toBe(false);

    // 3. Overall reliability consolidated report
    const overallReport = service.evaluateReliability({
      windowStart,
      windowEnd
    });
    expect(overallReport.overallStatus).toBe('INSUFFICIENT_DATA');
    expect(overallReport.sanitizedMetadata.privacyGuaranteed).toContain('without guest names');
  });
});
