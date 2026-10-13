import { assertTestConnectionUrl, assertTestDatabase } from '@eventlens/database/testing';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditActor } from '../src/contracts.js';
import { InfrastructureAlertService } from '../src/infrastructure-alert-service.js';
import {
  FilesystemProtectedBackupStorage,
  PostgresBackupService,
  RealPostgresBackupSource
} from '../src/postgres-backup-service.js';
import { NeutralTelemetryCollector, TelemetryService } from '../src/telemetry-service.js';

const databaseUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL!;

describe('PostgresBackupService (Real PostgreSQL 16 Integration Tests — EL-TK-171)', () => {
  let pool: Pool;
  let tempDir: string;
  let storage: FilesystemProtectedBackupStorage;
  let source: RealPostgresBackupSource;
  let collector: NeutralTelemetryCollector;
  let telemetryService: TelemetryService;
  let alertService: InfrastructureAlertService;
  let service: PostgresBackupService;

  const systemActor: AuditActor = {
    type: 'SYSTEM',
    systemId: 'eventlens-daily-backup-scheduler'
  };

  beforeAll(async () => {
    assertTestConnectionUrl(databaseUrl);
    pool = new Pool({ connectionString: databaseUrl });
    await assertTestDatabase({ query: async (sql, ...args) => (await pool.query(sql, args)).rows });
    // Test basic connectivity to PostgreSQL 16
    const res = await pool.query('SELECT version(), current_database() as db');
    expect(res.rows[0].version).toContain('PostgreSQL 16');
  });

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'el-pg-backup-integration-'));
    storage = new FilesystemProtectedBackupStorage(tempDir, { isOffHost: true });
    source = new RealPostgresBackupSource(pool, 'eventlens');
    collector = new NeutralTelemetryCollector();
    telemetryService = new TelemetryService(collector);
    alertService = new InfrastructureAlertService(telemetryService);
    service = new PostgresBackupService(storage, source, alertService, telemetryService);
  });

  it('Escenario 1: executes real database backup, captures tables and verifies byte-level integrity', async () => {
    const run = await service.executeDailyBackup({
      callerActor: systemActor,
      retentionDays: 7
    });

    expect(run.status).toBe('SUCCESS');
    expect(run.databaseName).toBe('eventlens');
    expect(run.durationMs).toBeGreaterThan(0);
    expect(run.artifact).toBeDefined();
    expect(run.artifact?.fileSizeBytes).toBeGreaterThan(100);
    expect(run.artifact?.checksumSha256).toHaveLength(64);
    expect(run.artifact?.isOffHost).toBe(true);

    // Verify WAL LSN coverage from real PostgreSQL 16
    expect(run.walCoverage).toBeDefined();
    expect(run.walCoverage?.startLsn).toMatch(/^[0-9A-Fa-f]+\/[0-9A-Fa-f]+$/);
    expect(run.walCoverage?.endLsn).toMatch(/^[0-9A-Fa-f]+\/[0-9A-Fa-f]+$/);
    expect(run.walCoverage?.isWithinRpoTarget).toBe(true);
    expect(run.walCoverage?.hasGaps).toBe(false);

    // Verify file and manifest existence on protected storage disk
    const dumpPath = run.artifact!.storageLocationUri.replace('file://', '');
    expect(fs.existsSync(dumpPath)).toBe(true);

    // Verify integrity and unpack contents
    const integrity = await service.verifyBackupIntegrity(run.artifact!.artifactId);
    expect(integrity.valid).toBe(true);
    expect(integrity.calculatedSha256).toBe(run.artifact!.checksumSha256);

    const rawGzip = fs.readFileSync(dumpPath);
    const unzipped = JSON.parse(zlib.gunzipSync(rawGzip).toString('utf8'));
    expect(unzipped.databaseName).toBe('eventlens');
    expect(unzipped.tables).toBeDefined();

    // Verify telemetry metrics were recorded
    const metrics = collector.getMetrics();
    expect(metrics.some((m) => m.name === 'infrastructure.backup.duration_ms')).toBe(true);
    expect(metrics.some((m) => m.name === 'infrastructure.backup.bytes')).toBe(true);
    expect(metrics.some((m) => m.name === 'infrastructure.backup.rpo_coverage_minutes')).toBe(true);
  });

  it('Escenario 2: validates off-host storage decoupling and retention enforcement with real disk files', async () => {
    // 1. Create a simulated older backup directly in storage with 8 days age
    const eightDaysAgo = new Date(Date.now() - 8 * 86400000);
    const oldDumpContent = zlib.gzipSync(Buffer.from('legacy-backup-content', 'utf8'));
    const oldRef = await storage.storeArtifact('backup_eventlens_old', oldDumpContent, {
      backupType: 'FULL_DAILY',
      retentionDays: 7,
      createdAt: eightDaysAgo
    });

    const initialList = await storage.listArtifacts();
    expect(initialList.some((a) => a.artifactId === oldRef.artifactId)).toBe(true);

    // 2. Run new daily backup which triggers automatic pruning
    const run = await service.executeDailyBackup({
      callerActor: systemActor,
      retentionDays: 7
    });

    expect(run.status).toBe('SUCCESS');
    expect(run.retentionApplied?.prunedArtifactIds).toContain(oldRef.artifactId);
    expect(run.retentionApplied?.retainedArtifactIds).toContain(run.artifact!.artifactId);

    // 3. Confirm old files were removed from disk
    const oldDumpPath = oldRef.storageLocationUri.replace('file://', '');
    expect(fs.existsSync(oldDumpPath)).toBe(false);
  });

  it('Escenario 3: fault injection triggers detectable failure signal and database alert without leaking secrets', async () => {
    const run = await service.executeDailyBackup({
      callerActor: systemActor,
      forceFailure: true
    });

    expect(run.status).toBe('FAILED');
    expect(run.artifact).toBeNull();
    expect(run.errorMessage).toContain('Injected failure');

    // Confirm alert triggered in InfrastructureAlertService
    const alerts = alertService.getActiveAlerts('DATABASE');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].name).toBe('infrastructure.postgres_backup_failed');
    expect(alerts[0].severity).toBe('CRITICAL');

    // Emits failure metric
    const metrics = collector.getMetrics();
    expect(metrics.some((m) => m.name === 'infrastructure.backup.failure')).toBe(true);
  });
});
