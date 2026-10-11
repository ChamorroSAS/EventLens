import { describe, expect, it, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  NeutralTelemetryCollector,
  QueueDegradationDetector,
  TelemetryService
} from '../src/index.js';

const databaseUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://eventlens:eventlens-local-only@127.0.0.1:15432/eventlens';

describe('QueueDegradationDetector (PostgreSQL 16 Integration Tests — EL-TK-169)', () => {
  const client = createPrismaClient(databaseUrl);
  const txs = new PrismaTransactions(client, 10000);

  const testQueue = 'integration-test-queue';

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  beforeEach(async () => {
    await sql(`DELETE FROM job_queue WHERE queue = $1`, testQueue);
  });

  it('inspects real job_queue rows and computes accurate metrics in PostgreSQL', async () => {
    const collector = new NeutralTelemetryCollector();
    const telemetry = new TelemetryService(collector);
    const detector = new QueueDegradationDetector(txs, telemetry, {
      maxDepthWarning: 5,
      maxAgeSecondsWarning: 100,
      abandonedLeaseGraceSeconds: 10
    });

    const now = new Date();
    const pastAvailable = new Date(now.getTime() - 250 * 1000); // 250s ago
    const pastLease = new Date(now.getTime() - 30 * 1000); // lease expired 30s ago

    // Insert 2 PENDING jobs
    await sql(
      `INSERT INTO job_queue (id, dedup_key, fingerprint, type, handler_version, resource_ref, generation, queue, priority, payload, status, available_at)
       VALUES ($1, $2, 'fp1', 'test_job', '1.0', 'ref1', 1, $3, 1, '{}'::jsonb, 'PENDING', $4),
              ($5, $6, 'fp2', 'test_job', '1.0', 'ref2', 1, $3, 1, '{}'::jsonb, 'PENDING', $4)`,
      randomUUID(),
      `dedup-${randomUUID()}`,
      testQueue,
      pastAvailable,
      randomUUID(),
      `dedup-${randomUUID()}`
    );

    // Insert 1 PROCESSING abandoned job (lease_until expired 30s ago, grace is 10s)
    await sql(
      `INSERT INTO job_queue (id, dedup_key, fingerprint, type, handler_version, resource_ref, generation, queue, priority, payload, status, available_at, lease_until, owner, token, epoch)
       VALUES ($1, $2, 'fp3', 'test_job', '1.0', 'ref3', 1, $3, 1, '{}'::jsonb, 'PROCESSING', $4, $5, 'worker-1', $6, 'epoch-1')`,
      randomUUID(),
      `dedup-${randomUUID()}`,
      testQueue,
      now,
      pastLease,
      randomUUID()
    );

    // Insert 1 DEAD job
    await sql(
      `INSERT INTO job_queue (id, dedup_key, fingerprint, type, handler_version, resource_ref, generation, queue, priority, payload, status, available_at)
       VALUES ($1, $2, 'fp4', 'test_job', '1.0', 'ref4', 1, $3, 1, '{}'::jsonb, 'DEAD', $4)`,
      randomUUID(),
      `dedup-${randomUUID()}`,
      testQueue,
      now
    );

    const snapshot = await detector.inspectQueue(testQueue);

    expect(snapshot.pendingDepth).toBe(2);
    expect(snapshot.oldestPendingAgeSeconds).toBeGreaterThanOrEqual(240);
    expect(snapshot.processingCount).toBe(1);
    expect(snapshot.abandonedCount).toBe(1);
    expect(snapshot.deadCount).toBe(1);

    // Evaluate degradation alerts
    const alerts = await detector.evaluateDegradation(testQueue);
    expect(alerts.length).toBeGreaterThanOrEqual(3);

    const deadAlert = alerts.find((a) => a.name === 'queue.dead_jobs');
    expect(deadAlert?.severity).toBe('CRITICAL');
    expect(deadAlert?.status).toBe('ACTIVE');

    const abandonedAlert = alerts.find((a) => a.name === 'queue.abandoned_jobs');
    expect(abandonedAlert?.severity).toBe('CRITICAL');
    expect(abandonedAlert?.status).toBe('ACTIVE');

    const ageAlert = alerts.find((a) => a.name === 'queue.age_warning');
    expect(ageAlert?.severity).toBe('WARNING');
    expect(ageAlert?.status).toBe('ACTIVE');
  });

  it('resolves active alerts when queue returns to normal in PostgreSQL', async () => {
    const collector = new NeutralTelemetryCollector();
    const telemetry = new TelemetryService(collector);
    const detector = new QueueDegradationDetector(txs, telemetry, {
      maxDepthWarning: 2
    });

    // Insert 3 PENDING jobs (> warning of 2)
    for (let i = 0; i < 3; i++) {
      await sql(
        `INSERT INTO job_queue (id, dedup_key, fingerprint, type, handler_version, resource_ref, generation, queue, priority, payload, status, available_at)
         VALUES ($1, $2, 'fp', 'test_job', '1.0', 'ref', 1, $3, 1, '{}'::jsonb, 'PENDING', NOW())`,
        randomUUID(),
        `dedup-${randomUUID()}`,
        testQueue
      );
    }

    const initialAlerts = await detector.evaluateDegradation(testQueue);
    expect(initialAlerts.some((a) => a.name === 'queue.depth_warning' && a.status === 'ACTIVE')).toBe(true);

    // Delete all jobs so queue is healthy
    await sql(`DELETE FROM job_queue WHERE queue = $1`, testQueue);

    await detector.evaluateDegradation(testQueue);
    expect(detector.getActiveAlerts(testQueue).length).toBe(0);

    const resolved = detector.getAllAlerts().find((a) => a.name === 'queue.depth_warning');
    expect(resolved?.status).toBe('RESOLVED');
  });
});
