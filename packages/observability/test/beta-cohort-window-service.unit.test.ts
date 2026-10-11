import { describe, expect, it } from 'vitest';
import {
  BetaCohortWindowService,
  EventSampleMetadata
} from '../src/index.js';

describe('BetaCohortWindowService (Unit Tests — EL-TK-181)', () => {
  const startDate = new Date('2026-08-01T00:00:00Z');

  it('Scenario 1: at 8 weeks with minimum sample volume, cohort is READY_FOR_SNAPSHOT', () => {
    const service = new BetaCohortWindowService();
    const window = service.createWindow({ startDate });

    // 25 eligible real events with 50 files each (1250 files total)
    const events: EventSampleMetadata[] = [];
    for (let i = 1; i <= 25; i++) {
      events.push({
        id: `evt-real-${i}`,
        isInternalTest: false,
        createdAt: new Date('2026-08-20T10:00:00Z'),
        fileCount: 50
      });
    }

    const evaluationDate = new Date('2026-09-26T00:00:00Z'); // 8 weeks elapsed
    const result = service.evaluateWindowCohort(window.id, events, evaluationDate);

    expect(result.status).toBe('READY_FOR_SNAPSHOT');
    expect(result.hasMinimumSample).toBe(true);
    expect(result.sampleCounts.eligibleRealEvents).toBe(25);
    expect(result.sampleCounts.eligibleRealFiles).toBe(1250);
    expect(result.currentWeeksElapsed).toBe(8);
    expect(result.limitationNotice).toBeUndefined();
  });

  it('Scenario 2: at 8 weeks with insufficient volume, allows formal extension up to 12 weeks', () => {
    const service = new BetaCohortWindowService();
    const window = service.createWindow({ startDate });

    // Only 10 real events with 30 files each (300 files total, below 20 events / 1000 files)
    const events: EventSampleMetadata[] = [];
    for (let i = 1; i <= 10; i++) {
      events.push({
        id: `evt-real-${i}`,
        createdAt: new Date('2026-08-20T10:00:00Z'),
        fileCount: 30
      });
    }

    const evaluationDate = new Date('2026-09-26T00:00:00Z'); // 8 weeks
    const resultInitial = service.evaluateWindowCohort(window.id, events, evaluationDate);

    expect(resultInitial.status).toBe('INSUFFICIENT_VOLUME_CAN_EXTEND');
    expect(resultInitial.hasMinimumSample).toBe(false);
    expect(resultInitial.isMaxExtensionReached).toBe(false);

    // Formally extend by 2 weeks
    const extendedWindow = service.extendWindow(window.id, {
      weeksToAdd: 2,
      reason: 'Volume gate not met at 8 weeks (sample: 10 events, 300 files); extending evaluation period',
      approvedBy: 'product-lead'
    });

    expect(extendedWindow.extendedWeeks).toBe(2);
    expect(extendedWindow.extensionReasons.length).toBe(1);
    expect(extendedWindow.extensionReasons[0].weeksAdded).toBe(2);
    expect(extendedWindow.extensionReasons[0].approvedBy).toBe('product-lead');

    // End date pushed forward by 14 days
    const expectedEndDate = new Date(startDate.getTime() + 10 * 7 * 24 * 60 * 60 * 1000);
    expect(extendedWindow.currentEndDate.getTime()).toBe(expectedEndDate.getTime());
  });

  it('Scenario 3: at maximum 12 weeks with insufficient volume, records terminal limitation notice', () => {
    const service = new BetaCohortWindowService();
    const window = service.createWindow({ startDate });

    // Extend to maximum 12 weeks (4 weeks added)
    service.extendWindow(window.id, {
      weeksToAdd: 4,
      reason: 'Extending to maximum duration per DEC-056',
      approvedBy: 'product-lead'
    });

    // Still insufficient: 12 events and 400 files
    const events: EventSampleMetadata[] = [];
    for (let i = 1; i <= 12; i++) {
      events.push({
        id: `evt-sparse-${i}`,
        createdAt: new Date('2026-09-01T10:00:00Z'),
        fileCount: 33
      });
    }

    const evaluationDate = new Date('2026-10-24T00:00:00Z'); // 12 weeks
    const result = service.evaluateWindowCohort(window.id, events, evaluationDate);

    expect(result.status).toBe('INSUFFICIENT_VOLUME_TERMINAL');
    expect(result.isMaxExtensionReached).toBe(true);
    expect(result.hasMinimumSample).toBe(false);
    expect(result.limitationNotice).toBeDefined();
    expect(result.limitationNotice).toContain('Recording formal limitation without inventing statistical certainty');
    expect(result.limitationNotice).toContain('DEC-056');

    // Attempting to extend beyond 12 weeks must be rejected
    expect(() =>
      service.extendWindow(window.id, {
        weeksToAdd: 1,
        reason: 'Attempting beyond 12 weeks',
        approvedBy: 'product-lead'
      })
    ).toThrow(/INVALID_EXTENSION/);
  });

  it('Scenario 4: automatically excludes internal test events and out-of-window events without manual intervention', () => {
    const service = new BetaCohortWindowService();
    const window = service.createWindow({ startDate });

    const events: EventSampleMetadata[] = [
      // 2 real eligible events
      { id: 'real-1', isInternalTest: false, createdAt: new Date('2026-08-10T00:00:00Z'), fileCount: 100 },
      { id: 'real-2', isInternalTest: false, createdAt: new Date('2026-08-15T00:00:00Z'), fileCount: 200 },
      // 2 internal test events
      { id: 'internal-1', isInternalTest: true, createdAt: new Date('2026-08-12T00:00:00Z'), fileCount: 50 },
      { id: 'internal-2', isInternalTest: true, createdAt: new Date('2026-08-14T00:00:00Z'), fileCount: 75 },
      // 1 out of window event (before start)
      { id: 'out-before', isInternalTest: false, createdAt: new Date('2026-07-01T00:00:00Z'), fileCount: 80 },
      // 1 out of window event (after end)
      { id: 'out-after', isInternalTest: false, createdAt: new Date('2026-11-01T00:00:00Z'), fileCount: 90 }
    ];

    const result = service.evaluateWindowCohort(window.id, events);

    expect(result.sampleCounts.eligibleRealEvents).toBe(2);
    expect(result.sampleCounts.eligibleRealFiles).toBe(300);
    expect(result.sampleCounts.excludedInternalEvents).toBe(2);
    expect(result.sampleCounts.excludedInternalFiles).toBe(125);
    expect(result.sampleCounts.excludedOutOfWindowEvents).toBe(2);
    expect(result.sampleCounts.excludedOutOfWindowFiles).toBe(170);
  });
});
