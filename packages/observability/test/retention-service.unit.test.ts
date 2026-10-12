import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, utimes, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  AuditRetentionService,
  NeutralTelemetryCollector,
  PurgeExecutionSignal,
  TechnicalLogRotationService,
  TelemetryService
} from '../src/index.js';

describe('AuditRetentionService (Unit Tests — EL-TK-184)', () => {
  it('Scenario 1: purges expired audit events in bounded batches and emits metrics and signals', async () => {
    let queryCount = 0;
    const runner: TransactionRunner = {
      async run<T>(fn: (tx: SqlTransaction) => Promise<T>): Promise<T> {
        const tx: SqlTransaction = {
          async execute(): Promise<number> {
            return 0;
          },
          async query<R = unknown>(): Promise<R[]> {
            queryCount++;
            // Batch 1: returns 2 records (full batch of 2)
            // Batch 2: returns 1 record (< 2, terminates loop)
            if (queryCount === 1) {
              return [{ id: 'evt-1' }, { id: 'evt-2' }] as R[];
            }
            return [{ id: 'evt-3' }] as R[];
          }
        };
        return fn(tx);
      }
    };

    const collector = new NeutralTelemetryCollector();
    const telemetry = new TelemetryService(collector);
    const service = new AuditRetentionService(runner, telemetry);

    const signals: PurgeExecutionSignal[] = [];
    const result = await service.purgeExpiredAuditEvents({
      retentionDays: 365,
      batchSize: 2,
      onSignal: (s) => signals.push(s)
    });

    expect(result.deletedCount).toBe(3);
    expect(result.batchCount).toBe(2);
    expect(result.dryRun).toBe(false);

    // Verify telemetry metrics
    const metrics = collector.getMetrics();
    const countMetric = metrics.find((m) => m.name === 'audit.retention.purged_count');
    expect(countMetric?.value).toBe(3);

    // Verify health signal
    const signalsHistory = collector.getHealthSignals();
    expect(signalsHistory['BACKEND']?.status).toBe('HEALTHY');

    // Verify onSignal callback
    expect(signals.length).toBe(1);
    expect(signals[0].task).toBe('AUDIT_RETENTION');
    expect(signals[0].status).toBe('SUCCESS');
    expect(signals[0].itemsPurged).toBe(3);
  });

  it('supports dry run mode without modifying database', async () => {
    const runner: TransactionRunner = {
      async run<T>(fn: (tx: SqlTransaction) => Promise<T>): Promise<T> {
        const tx: SqlTransaction = {
          async execute(): Promise<number> {
            return 0;
          },
          async query<R = unknown>(): Promise<R[]> {
            return [{ count: '14' }] as R[];
          }
        };
        return fn(tx);
      }
    };

    const service = new AuditRetentionService(runner);
    const result = await service.purgeExpiredAuditEvents({
      dryRun: true
    });

    expect(result.dryRun).toBe(true);
    expect(result.deletedCount).toBe(14);
    expect(result.batchCount).toBe(0);
  });

  it('Scenario 3: handles database failure by emitting DEGRADED health signal and failure signal', async () => {
    const runner: TransactionRunner = {
      async run<T>(): Promise<T> {
        throw new Error('database connection lost with secret_token=secret123');
      }
    };

    const collector = new NeutralTelemetryCollector();
    const telemetry = new TelemetryService(collector);
    const service = new AuditRetentionService(runner, telemetry);

    const signals: PurgeExecutionSignal[] = [];

    await expect(
      service.purgeExpiredAuditEvents({
        onSignal: (s) => signals.push(s)
      })
    ).rejects.toThrow(/Audit retention purge failed/);

    // Verify error was sanitized
    const metrics = collector.getMetrics();
    const failureMetric = metrics.find((m) => m.name === 'audit.retention.failure_count');
    expect(failureMetric?.value).toBe(1);

    const health = collector.getHealthSignals();
    expect(health['BACKEND']?.status).toBe('DEGRADED');
    expect(health['BACKEND']?.message).not.toContain('secret123');
    expect(health['BACKEND']?.message).toContain('[REDACTED]');

    // Verify failure signal
    expect(signals.length).toBe(1);
    expect(signals[0].status).toBe('FAILURE');
    expect(signals[0].errorMessage).toContain('[REDACTED]');
  });
});

describe('TechnicalLogRotationService (Unit Tests — EL-TK-184)', () => {
  it('Scenario 2: rotates oversized active logs and purges expired rotated logs', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'log-rot-test-'));

    try {
      // 1. Oversized active log (2000 bytes, threshold 1000)
      const activeLogPath = join(tempDir, 'backend.log');
      await writeFile(activeLogPath, 'a'.repeat(2000), 'utf8');

      // 2. Small active log (200 bytes, threshold 1000)
      const smallLogPath = join(tempDir, 'access.log');
      await writeFile(smallLogPath, 'b'.repeat(200), 'utf8');

      // 3. Old rotated log (older than 30 days)
      const oldRotatedPath = join(tempDir, 'backend.log.2026-08-01.1234');
      await writeFile(oldRotatedPath, 'c'.repeat(500), 'utf8');
      const pastTime = (Date.now() - 40 * 24 * 60 * 60 * 1000) / 1000;
      await utimes(oldRotatedPath, pastTime, pastTime);

      // 4. Recent rotated log (5 days old)
      const recentRotatedPath = join(tempDir, 'backend.log.2026-10-06.5678');
      await writeFile(recentRotatedPath, 'd'.repeat(300), 'utf8');
      const recentTime = (Date.now() - 5 * 24 * 60 * 60 * 1000) / 1000;
      await utimes(recentRotatedPath, recentTime, recentTime);

      const collector = new NeutralTelemetryCollector();
      const telemetry = new TelemetryService(collector);
      const service = new TechnicalLogRotationService(telemetry);

      const signals: PurgeExecutionSignal[] = [];
      const result = await service.rotateAndPurgeLogs({
        logDirectory: tempDir,
        maxFileSizeBytes: 1000,
        maxRetentionDays: 30,
        onSignal: (s) => signals.push(s)
      });

      // Assert rotation
      expect(result.rotatedFiles).toEqual(['backend.log']);
      expect(result.purgedFiles).toEqual(['backend.log.2026-08-01.1234']);
      expect(result.bytesReclaimed).toBe(500);

      // Check filesystem
      const filesAfter = await readdir(tempDir);
      expect(filesAfter).not.toContain('backend.log'); // Rotated into backend.log.YYYY-MM-DD.timestamp
      expect(filesAfter).toContain('access.log'); // Small active log preserved
      expect(filesAfter).not.toContain('backend.log.2026-08-01.1234'); // Old rotated log purged
      expect(filesAfter).toContain('backend.log.2026-10-06.5678'); // Recent rotated log kept

      // Check telemetry
      const metrics = collector.getMetrics();
      const purgedMetric = metrics.find((m) => m.name === 'logs.rotation.purged_files');
      expect(purgedMetric?.value).toBe(1);
      const bytesMetric = metrics.find((m) => m.name === 'logs.rotation.bytes_reclaimed');
      expect(bytesMetric?.value).toBe(500);

      const health = collector.getHealthSignals();
      expect(health['BACKEND']?.status).toBe('HEALTHY');

      // Check signal
      expect(signals.length).toBe(1);
      expect(signals[0].task).toBe('LOG_ROTATION');
      expect(signals[0].status).toBe('SUCCESS');
      expect(signals[0].itemsPurged).toBe(1);
      expect(signals[0].bytesReclaimed).toBe(500);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('Scenario 3: handles filesystem error with sanitized alert signal', async () => {
    const collector = new NeutralTelemetryCollector();
    const telemetry = new TelemetryService(collector);
    const service = new TechnicalLogRotationService(telemetry);

    const signals: PurgeExecutionSignal[] = [];
    const nonExistentPath = join(tmpdir(), 'non-existent-log-dir-xyz-987');

    await expect(
      service.rotateAndPurgeLogs({
        logDirectory: nonExistentPath,
        onSignal: (s) => signals.push(s)
      })
    ).rejects.toThrow(/Log rotation and purge failed/);

    const metrics = collector.getMetrics();
    const failMetric = metrics.find((m) => m.name === 'logs.rotation.failure_count');
    expect(failMetric?.value).toBe(1);

    const health = collector.getHealthSignals();
    expect(health['BACKEND']?.status).toBe('DEGRADED');

    expect(signals.length).toBe(1);
    expect(signals[0].task).toBe('LOG_ROTATION');
    expect(signals[0].status).toBe('FAILURE');
    expect(signals[0].errorMessage).toBeDefined();
  });
});
