import { assertTestConnectionUrl, assertTestDatabase } from '@eventlens/database/testing';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditActor, TombstoneRecord } from '../src/contracts.js';
import { InfrastructureAlertService } from '../src/infrastructure-alert-service.js';
import {
  FilesystemProtectedBackupStorage,
  PostgresBackupService,
  RealPostgresBackupSource
} from '../src/postgres-backup-service.js';
import {
  PostgresRecoveryService,
  RealPostgresRestoreTarget
} from '../src/postgres-recovery-service.js';
import { NeutralTelemetryCollector, TelemetryService } from '../src/telemetry-service.js';

const databaseUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL!;

describe('PostgresRecoveryService (Real PostgreSQL 16 Integration Tests — EL-TK-172)', () => {
  let pool: Pool;
  let tempDir: string;
  let storage: FilesystemProtectedBackupStorage;
  let backupSource: RealPostgresBackupSource;
  let backupService: PostgresBackupService;
  let restoreTarget: RealPostgresRestoreTarget;
  let collector: NeutralTelemetryCollector;
  let telemetryService: TelemetryService;
  let alertService: InfrastructureAlertService;
  let recoveryService: PostgresRecoveryService;

  const systemActor: AuditActor = {
    type: 'SYSTEM',
    systemId: 'recovery-drill-scheduler'
  };

  beforeAll(async () => {
    assertTestConnectionUrl(databaseUrl);
    pool = new Pool({ connectionString: databaseUrl });
    await assertTestDatabase({ query: async (sql, ...args) => (await pool.query(sql, args)).rows });
    const res = await pool.query('SELECT version()');
    expect(res.rows[0].version).toContain('PostgreSQL 16');
  });

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'el-pg-recovery-integration-'));
    storage = new FilesystemProtectedBackupStorage(tempDir, { isOffHost: true });
    backupSource = new RealPostgresBackupSource(pool, 'eventlens');
    collector = new NeutralTelemetryCollector();
    telemetryService = new TelemetryService(collector);
    alertService = new InfrastructureAlertService(telemetryService);

    backupService = new PostgresBackupService(storage, backupSource, alertService, telemetryService);
    restoreTarget = new RealPostgresRestoreTarget(pool, {
      targetEnvironment: 'ISOLATED_LAB',
      targetDatabaseName: 'eventlens_isolated_restore'
    });
    recoveryService = new PostgresRecoveryService(storage, restoreTarget, alertService, telemetryService);
  });

  it('Escenario 1: executes end-to-end backup capture and isolated restore measuring RPO/RTO PASS', async () => {
    // 1. Capture real backup from PostgreSQL 16
    const backupRun = await backupService.executeDailyBackup({
      callerActor: systemActor,
      retentionDays: 7
    });
    expect(backupRun.status).toBe('SUCCESS');
    expect(backupRun.artifact).toBeDefined();

    // 2. Execute recovery exercise against isolated restore target
    const exercise = await recoveryService.executeRecoveryExercise({
      callerActor: systemActor,
      backupArtifactId: backupRun.artifact!.artifactId,
      targetEnvironment: 'ISOLATED_LAB',
      targetDatabaseName: 'eventlens_isolated_restore'
    });

    expect(exercise.status).toBe('SUCCESS');
    expect(exercise.overallGateStatus).toBe('PASS');
    expect(exercise.isRpoMet).toBe(true);
    expect(exercise.isRtoMet).toBe(true);
    expect(exercise.observedRpoMinutes).toBeLessThanOrEqual(60);
    expect(exercise.tablesRestoredCount).toBeGreaterThan(0);
    expect(exercise.evidenceSanitized.overallGateStatus).toBe('PASS');

    // Verify metrics recorded
    const metrics = collector.getMetrics();
    expect(metrics.some((m) => m.name === 'infrastructure.recovery.gate_status' && m.value === 1)).toBe(true);
    expect(metrics.some((m) => m.name === 'infrastructure.recovery.rpo_observed_minutes')).toBe(true);
  });

  it('Escenario 2: records gate FAIL and action required when observed RTO excedes objective', async () => {
    const backupRun = await backupService.executeDailyBackup({
      callerActor: systemActor,
      retentionDays: 7
    });
    expect(backupRun.status).toBe('SUCCESS');

    // Simulate an exercise that took 260 minutes (> 240 min RTO target)
    const exercise = await recoveryService.executeRecoveryExercise({
      callerActor: systemActor,
      backupArtifactId: backupRun.artifact!.artifactId,
      simulatedRtoDurationMinutes: 260
    });

    expect(exercise.status).toBe('FAIL_OBJECTIVE_MISSED');
    expect(exercise.overallGateStatus).toBe('FAIL');
    expect(exercise.isRtoMet).toBe(false);
    expect(exercise.observedRtoMinutes).toBe(260);
    expect(exercise.errorMessage).toContain('RTO met=false');

    const metrics = collector.getMetrics();
    expect(metrics.some((m) => m.name === 'infrastructure.recovery.gate_status' && m.value === 0)).toBe(true);
  });

  it('Escenario 3: restores database and reconciles tombstones preventing resurrection of purged records (DEC-045, DEC-092)', async () => {
    const backupRun = await backupService.executeDailyBackup({
      callerActor: systemActor,
      retentionDays: 7
    });
    expect(backupRun.status).toBe('SUCCESS');

    // Catalog of tombstone events to reconcile post-restore
    const tombstones: TombstoneRecord[] = [
      {
        resourceType: 'EVENT',
        resourceId: 'purged-event-1',
        purgeStartedAt: new Date(Date.now() - 10 * 86400000),
        deletedAt: new Date(Date.now() - 10 * 86400000),
        hasLegalHold: false
      },
      {
        resourceType: 'EVENT',
        resourceId: 'held-event-2',
        purgeStartedAt: new Date(Date.now() - 3 * 86400000),
        deletedAt: new Date(Date.now() - 3 * 86400000),
        hasLegalHold: true
      }
    ];

    const exercise = await recoveryService.executeRecoveryExercise({
      callerActor: systemActor,
      backupArtifactId: backupRun.artifact!.artifactId,
      tombstoneCatalog: tombstones
    });

    expect(exercise.status).toBe('SUCCESS');
    expect(exercise.overallGateStatus).toBe('PASS');
    expect(exercise.tombstoneReconciliation.tombstonesEvaluatedCount).toBe(2);
    expect(exercise.tombstoneReconciliation.reconciledResourceIds).toContain('purged-event-1');
    expect(exercise.tombstoneReconciliation.reconciledResourceIds).toContain('held-event-2');
  });
});
