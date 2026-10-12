import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AuditActor,
  BackupExecutionSignal,
  DatabaseBackupSource
} from '../src/contracts.js';
import { InfrastructureAlertService } from '../src/infrastructure-alert-service.js';
import {
  FilesystemProtectedBackupStorage,
  PostgresBackupError,
  PostgresBackupService
} from '../src/postgres-backup-service.js';
import { NeutralTelemetryCollector, TelemetryService } from '../src/telemetry-service.js';

class MockDatabaseBackupSource implements DatabaseBackupSource {
  public databaseName = 'eventlens_unit_test';
  public shouldFailDump = false;
  public dumpError = 'Database connection lost';
  public hasGaps = false;
  public lastCheckpointDate = new Date();

  public async captureDatabaseDump(): Promise<{ dumpContent: Buffer; startLsn: string; endLsn: string }> {
    if (this.shouldFailDump) {
      throw new Error(this.dumpError);
    }

    const payload = {
      databaseName: this.databaseName,
      startLsn: '0/1000000',
      endLsn: '0/2000000',
      tables: {
        users: [{ id: '1', name: 'Admin' }],
        events: [{ id: '10', title: 'Beta Launch' }]
      }
    };

    const dumpContent = zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
    return {
      dumpContent,
      startLsn: '0/1000000',
      endLsn: '0/2000000'
    };
  }

  public async getWalCheckpoint(): Promise<{ currentLsn: string; lastCheckpointAt: Date; walFilesCount: number }> {
    return {
      currentLsn: '0/2000000',
      lastCheckpointAt: this.lastCheckpointDate,
      walFilesCount: 2
    };
  }

  public async checkWalContinuity(startLsn: string, endLsn: string): Promise<{ hasGaps: boolean; walFilesCount: number }> {
    return {
      hasGaps: this.hasGaps,
      walFilesCount: 2
    };
  }
}

describe('PostgresBackupService (Unit Tests)', () => {
  let tempDir: string;
  let storage: FilesystemProtectedBackupStorage;
  let source: MockDatabaseBackupSource;
  let alertService: InfrastructureAlertService;
  let collector: NeutralTelemetryCollector;
  let telemetryService: TelemetryService;
  let service: PostgresBackupService;

  const systemActor: AuditActor = {
    type: 'SYSTEM',
    systemId: 'eventlens-scheduler-worker'
  };

  const adminActor: AuditActor = {
    type: 'ADMIN',
    actorId: '550e8400-e29b-41d4-a716-446655440000'
  };

  const organizerActor: AuditActor = {
    type: 'ORGANIZER',
    actorId: '550e8400-e29b-41d4-a716-446655440001'
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'el-backup-test-'));
    storage = new FilesystemProtectedBackupStorage(tempDir, { isOffHost: true });
    source = new MockDatabaseBackupSource();
    collector = new NeutralTelemetryCollector();
    telemetryService = new TelemetryService(collector);
    alertService = new InfrastructureAlertService(telemetryService);
    service = new PostgresBackupService(storage, source, alertService, telemetryService);
  });

  it('Escenario 1: executes daily backup, creates verifiable artifact and applies >= 7d retention', async () => {
    // Pre-populate with an older backup (8 days ago) to test retention pruning
    const eightDaysAgo = new Date(Date.now() - 8 * 86400000);
    const oldContent = zlib.gzipSync(Buffer.from('old-backup', 'utf8'));
    const oldArtifact = await storage.storeArtifact('old_backup', oldContent, {
      backupType: 'FULL_DAILY',
      retentionDays: 7,
      createdAt: eightDaysAgo
    });

    const run = await service.executeDailyBackup({
      callerActor: systemActor,
      retentionDays: 7
    });

    expect(run.status).toBe('SUCCESS');
    expect(run.databaseName).toBe('eventlens_unit_test');
    expect(run.artifact).toBeDefined();
    expect(run.artifact?.checksumSha256).toHaveLength(64);
    expect(run.artifact?.isOffHost).toBe(true);
    expect(run.walCoverage?.isWithinRpoTarget).toBe(true);

    // Verify retention pruned the 8-day-old backup
    expect(run.retentionApplied?.prunedArtifactIds).toContain(oldArtifact.artifactId);
    expect(run.retentionApplied?.retainedArtifactIds).toContain(run.artifact!.artifactId);

    // Verify disk state
    const artifacts = await storage.listArtifacts();
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].artifactId).toBe(run.artifact!.artifactId);

    // Verify metrics emitted
    const metrics = collector.getMetrics();
    expect(metrics.some((m) => m.name === 'infrastructure.backup.duration_ms')).toBe(true);
    expect(metrics.some((m) => m.name === 'infrastructure.backup.bytes')).toBe(true);
  });

  it('Escenario 2: verifies off-host storage and refuses ephemeral host filesystem', async () => {
    const ephemeralStorage = new FilesystemProtectedBackupStorage(tempDir, { isOffHost: false });
    const ephemeralService = new PostgresBackupService(ephemeralStorage, source, alertService, telemetryService);

    await expect(
      ephemeralService.executeDailyBackup({
        callerActor: systemActor
      })
    ).rejects.toThrow(PostgresBackupError);

    // Alert triggered for attempt to use ephemeral storage
    const alerts = alertService.getActiveAlerts('DATABASE');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('CRITICAL');
  });

  it('Escenario 3: injected failure records failed run, emits signal and triggers alert without leaking secrets', async () => {
    let capturedSignal: BackupExecutionSignal | undefined;

    // Simulate connection failure containing a raw password and connection URL
    source.shouldFailDump = true;
    source.dumpError = 'FATAL: password authentication failed for postgresql://eventlens:secret_db_password_123@postgres.internal:5432/eventlens';

    const run = await service.executeDailyBackup({
      callerActor: systemActor,
      onSignal: (sig) => {
        capturedSignal = sig;
      }
    });

    expect(run.status).toBe('FAILED');
    expect(run.artifact).toBeNull();
    expect(run.errorMessage).toBeDefined();
    expect(run.errorMessage).not.toContain('secret_db_password_123');
    expect(run.errorMessage).toContain('[REDACTED]');

    // Verify signal
    expect(capturedSignal?.status).toBe('FAILURE');
    expect(capturedSignal?.errorMessage).not.toContain('secret_db_password_123');

    // Verify active alert on DATABASE component
    const alerts = alertService.getActiveAlerts('DATABASE');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].name).toBe('infrastructure.postgres_backup_failed');
    expect(alerts[0].severity).toBe('CRITICAL');
    expect(alerts[0].message).not.toContain('secret_db_password_123');
  });

  it('verifies integrity of backup artifact and detects corrupted bytes', async () => {
    const run = await service.executeDailyBackup({
      callerActor: adminActor
    });
    expect(run.status).toBe('SUCCESS');

    // Verification on untouched artifact
    const reportValid = await service.verifyBackupIntegrity(run.artifact!.artifactId);
    expect(reportValid.valid).toBe(true);
    expect(reportValid.expectedSha256).toBe(reportValid.calculatedSha256);

    // Tamper with the dump file on disk
    const dumpPath = run.artifact!.storageLocationUri.replace('file://', '');
    fs.appendFileSync(dumpPath, Buffer.from('corrupted_extra_bytes'));

    // Verification on tampered artifact fails
    await expect(service.verifyBackupIntegrity(run.artifact!.artifactId)).rejects.toThrow(
      /checksum mismatch/
    );
  });

  it('evaluates WAL coverage and alerts when RPO target (> 60m) is exceeded', async () => {
    // 75 minutes ago (> 60 min RPO target per DEC-062)
    source.lastCheckpointDate = new Date(Date.now() - 75 * 60000);

    const run = await service.executeDailyBackup({
      callerActor: systemActor
    });

    expect(run.status).toBe('SUCCESS');
    expect(run.walCoverage?.isWithinRpoTarget).toBe(false);
    expect(run.walCoverage?.rpoCoverageMinutes).toBeGreaterThanOrEqual(74);
  });

  it('fails with WAL_GAP_DETECTED when WAL continuity check indicates gap', async () => {
    source.hasGaps = true;

    const run = await service.executeDailyBackup({
      callerActor: systemActor
    });

    expect(run.status).toBe('FAILED');
    expect(run.errorMessage).toContain('WAL sequence gap detected');
  });

  it('rejects unauthorized actors (ORGANIZER, ANONYMOUS_GUEST) with UNAUTHORIZED_ACTOR', async () => {
    await expect(
      service.executeDailyBackup({
        callerActor: organizerActor
      })
    ).rejects.toThrow(PostgresBackupError);

    await expect(
      service.executeDailyBackup({
        callerActor: { type: 'ANONYMOUS_GUEST', actorId: 'anon-1' }
      })
    ).rejects.toThrow(PostgresBackupError);
  });
});
