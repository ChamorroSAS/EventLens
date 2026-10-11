import { describe, expect, it } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  NeutralTelemetryCollector,
  QueueDegradationDetector,
  TelemetryService
} from '../src/index.js';

function createMockQueueDb(initialMetrics: {
  pending_depth: number;
  oldest_pending_age_seconds: number;
  processing_count: number;
  abandoned_count: number;
  dead_count: number;
  high_retry_count: number;
}) {
  let metrics = { ...initialMetrics };

  const runner: TransactionRunner = {
    async run<T>(fn: (tx: SqlTransaction) => Promise<T>): Promise<T> {
      const tx: SqlTransaction = {
        async execute(): Promise<number> {
          return 0;
        },
        async query<R = unknown>(): Promise<R[]> {
          return [metrics] as R[];
        }
      };
      return fn(tx);
    }
  };

  return {
    runner,
    setMetrics(newMetrics: Partial<typeof metrics>) {
      metrics = { ...metrics, ...newMetrics };
    }
  };
}

describe('QueueDegradationDetector (Unit Tests — EL-TK-169)', () => {
  it('Scenario 1: triggers deduplicated operational alerts when depth and age exceed thresholds', async () => {
    const db = createMockQueueDb({
      pending_depth: 75, // > warning threshold (50)
      oldest_pending_age_seconds: 400, // > warning threshold (300)
      processing_count: 10,
      abandoned_count: 0,
      dead_count: 0,
      high_retry_count: 0
    });

    const collector = new NeutralTelemetryCollector();
    const telemetry = new TelemetryService(collector);
    const detector = new QueueDegradationDetector(db.runner, telemetry);

    // Initial evaluation
    const alertsFirst = await detector.evaluateDegradation('notifications');
    expect(alertsFirst.length).toBe(2);

    const depthAlert = alertsFirst.find((a) => a.name === 'queue.depth_warning');
    expect(depthAlert?.severity).toBe('WARNING');
    expect(depthAlert?.status).toBe('ACTIVE');
    expect(depthAlert?.currentValue).toBe(75);

    const ageAlert = alertsFirst.find((a) => a.name === 'queue.age_warning');
    expect(ageAlert?.severity).toBe('WARNING');
    expect(ageAlert?.status).toBe('ACTIVE');
    expect(ageAlert?.currentValue).toBe(400);

    // Second evaluation with condition still present: DEDUPLICATION must NOT duplicate alerts!
    const alertsSecond = await detector.evaluateDegradation('notifications');
    expect(alertsSecond.length).toBe(2);
    expect(detector.getActiveAlerts('notifications').length).toBe(2);

    // Verify telemetry metrics were emitted
    const depthMetrics = collector.getMetrics({ name: 'job_queue.depth' });
    expect(depthMetrics.length).toBe(2);
    expect(depthMetrics[0]?.value).toBe(75);
  });

  it('Scenario 2: triggers prioritized CRITICAL alerts for DEAD and abandoned jobs with sanitized messages', async () => {
    const db = createMockQueueDb({
      pending_depth: 10,
      oldest_pending_age_seconds: 30,
      processing_count: 5,
      abandoned_count: 2, // 2 abandoned jobs
      dead_count: 1, // 1 DEAD job
      high_retry_count: 0
    });

    const collector = new NeutralTelemetryCollector();
    const telemetry = new TelemetryService(collector);
    const detector = new QueueDegradationDetector(db.runner, telemetry);

    const alerts = await detector.evaluateDegradation('media-processor');

    const deadAlert = alerts.find((a) => a.name === 'queue.dead_jobs');
    expect(deadAlert?.severity).toBe('CRITICAL');
    expect(deadAlert?.status).toBe('ACTIVE');
    expect(deadAlert?.message).toContain('DEAD job(s)');

    const abandonedAlert = alerts.find((a) => a.name === 'queue.abandoned_jobs');
    expect(abandonedAlert?.severity).toBe('CRITICAL');
    expect(abandonedAlert?.status).toBe('ACTIVE');
    expect(abandonedAlert?.message).toContain('abandoned PROCESSING job(s)');

    // Health signal for JOB_QUEUE should be UNHEALTHY due to CRITICAL alerts
    const healthSignals = collector.getHealthSignals();
    expect(healthSignals.JOB_QUEUE?.status).toBe('UNHEALTHY');
  });

  it('Scenario 3: resolves and rearms alerts when conditions return to normal without spam', async () => {
    const db = createMockQueueDb({
      pending_depth: 80,
      oldest_pending_age_seconds: 50,
      processing_count: 10,
      abandoned_count: 0,
      dead_count: 0,
      high_retry_count: 0
    });

    const collector = new NeutralTelemetryCollector();
    const telemetry = new TelemetryService(collector);
    const detector = new QueueDegradationDetector(db.runner, telemetry);

    // 1. Trigger alert
    await detector.evaluateDegradation('export-queue');
    expect(detector.getActiveAlerts('export-queue').length).toBe(1);

    // 2. Queue drains back to normal
    db.setMetrics({ pending_depth: 5 });
    await detector.evaluateDegradation('export-queue');

    // Active alerts should be empty
    expect(detector.getActiveAlerts('export-queue').length).toBe(0);

    // Alert history should show RESOLVED alert with resolvedAt timestamp
    const allAlerts = detector.getAllAlerts();
    const resolved = allAlerts.find((a) => a.name === 'queue.depth_warning');
    expect(resolved?.status).toBe('RESOLVED');
    expect(resolved?.resolvedAt).toBeInstanceOf(Date);

    // JOB_QUEUE health signal should recover to HEALTHY
    const healthSignals = collector.getHealthSignals();
    expect(healthSignals.JOB_QUEUE?.status).toBe('HEALTHY');

    // 3. Re-occurrence rearms and triggers fresh active alert
    db.setMetrics({ pending_depth: 95 });
    await detector.evaluateDegradation('export-queue');

    expect(detector.getActiveAlerts('export-queue').length).toBe(1);
    const rearmedAlert = detector.getActiveAlerts('export-queue')[0];
    expect(rearmedAlert?.status).toBe('ACTIVE');
    expect(rearmedAlert?.currentValue).toBe(95);
  });
});
