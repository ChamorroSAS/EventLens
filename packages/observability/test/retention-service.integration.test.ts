import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile, utimes, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  AuditRetentionService,
  NeutralTelemetryCollector,
  PurgeExecutionSignal,
  TechnicalLogRotationService,
  TelemetryService
} from '../src/index.js';

const databaseUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://eventlens:eventlens-local-only@127.0.0.1:15432/eventlens';

describe('AuditRetentionService (PostgreSQL 16 Integration Tests — EL-TK-184)', () => {
  const client = createPrismaClient(databaseUrl);
  const txs = new PrismaTransactions(client, 10000);

  const testAction = `TEST_PURGE_${randomUUID().slice(0, 8)}`;

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  beforeEach(async () => {
    await sql(`DELETE FROM audit_event WHERE action = $1`, testAction);
  });

  afterEach(async () => {
    await sql(`DELETE FROM audit_event WHERE action = $1`, testAction);
  });

  it('Scenario 1: deletes expired audit events in PostgreSQL in batches and preserves active ones', async () => {
    const now = Date.now();
    const expiredDate1 = new Date(now - 400 * 24 * 60 * 60 * 1000); // 400 days old
    const expiredDate2 = new Date(now - 380 * 24 * 60 * 60 * 1000); // 380 days old
    const activeDate = new Date(now - 30 * 24 * 60 * 60 * 1000); // 30 days old

    const id1 = randomUUID();
    const id2 = randomUUID();
    const id3 = randomUUID();

    // Insert 2 expired events and 1 active event
    await sql(
      `INSERT INTO audit_event (id, occurred_at, actor_type, actor_id, action, resource_type, resource_id, result, metadata)
       VALUES ($1, $2, 'SYSTEM', 'worker-1', $3, 'order', 'ord-1', 'SUCCESS', '{}'::jsonb),
              ($4, $5, 'SYSTEM', 'worker-1', $3, 'order', 'ord-2', 'SUCCESS', '{}'::jsonb),
              ($6, $7, 'SYSTEM', 'worker-1', $3, 'order', 'ord-3', 'SUCCESS', '{}'::jsonb)`,
      id1,
      expiredDate1,
      testAction,
      id2,
      expiredDate2,
      id3,
      activeDate
    );

    const collector = new NeutralTelemetryCollector();
    const telemetry = new TelemetryService(collector);
    const service = new AuditRetentionService(txs, telemetry);

    const signals: PurgeExecutionSignal[] = [];

    // Purge with 365 days retention and batchSize = 1 to test multi-batch iteration
    const result = await service.purgeExpiredAuditEvents({
      retentionDays: 365,
      batchSize: 1,
      onSignal: (s) => signals.push(s)
    });

    expect(result.deletedCount).toBe(2);
    expect(result.batchCount).toBe(2);
    expect(result.dryRun).toBe(false);

    // Verify DB state
    const remaining = await txs.run(async (tx) => {
      return tx.query<{ id: string }>(
        `SELECT id FROM audit_event WHERE action = $1`,
        testAction
      );
    });

    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe(id3);

    // Verify signal
    expect(signals.length).toBe(1);
    expect(signals[0].task).toBe('AUDIT_RETENTION');
    expect(signals[0].status).toBe('SUCCESS');
    expect(signals[0].itemsPurged).toBe(2);

    // Verify telemetry
    const metrics = collector.getMetrics();
    const purgedMetric = metrics.find((m) => m.name === 'audit.retention.purged_count');
    expect(purgedMetric?.value).toBe(2);
  });
});

describe('TechnicalLogRotationService (Disk Integration Tests — EL-TK-184)', () => {
  it('Scenario 2: executes real rotation and purge on disk', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'el-log-rot-int-'));

    try {
      // Create active log exceeding 4000 bytes
      const activeLog = join(tempDir, 'application.log');
      await writeFile(activeLog, 'x'.repeat(5000), 'utf8');

      // Create old rotated log (> 35 days old)
      const oldRotated = join(tempDir, 'application.log.2026-08-15.999');
      await writeFile(oldRotated, 'old log content', 'utf8');
      const pastTime = (Date.now() - 35 * 24 * 60 * 60 * 1000) / 1000;
      await utimes(oldRotated, pastTime, pastTime);

      const collector = new NeutralTelemetryCollector();
      const telemetry = new TelemetryService(collector);
      const service = new TechnicalLogRotationService(telemetry);

      const result = await service.rotateAndPurgeLogs({
        logDirectory: tempDir,
        maxFileSizeBytes: 4000,
        maxRetentionDays: 30
      });

      expect(result.rotatedFiles).toEqual(['application.log']);
      expect(result.purgedFiles).toEqual(['application.log.2026-08-15.999']);
      expect(result.bytesReclaimed).toBe('old log content'.length);

      const filesRemaining = await readdir(tempDir);
      expect(filesRemaining).not.toContain('application.log');
      expect(filesRemaining).not.toContain('application.log.2026-08-15.999');
      expect(filesRemaining.some((f) => f.startsWith('application.log.'))).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
