import { assertTestConnectionUrl, assertTestDatabase } from '@eventlens/database/testing';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditActor } from '../src/contracts.js';
import {
  DefaultMediaRecoveryAuthority,
  IntegratedDrValidatorService
} from '../src/dr-validation-service.js';
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

describe('IntegratedDrValidatorService (Real PostgreSQL 16 Integration Tests — EL-TK-174)', () => {
  let pool: Pool;
  let tempDir: string;
  let storage: FilesystemProtectedBackupStorage;
  let backupSource: RealPostgresBackupSource;
  let backupService: PostgresBackupService;
  let restoreTarget: RealPostgresRestoreTarget;
  let recoveryService: PostgresRecoveryService;
  let collector: NeutralTelemetryCollector;
  let telemetryService: TelemetryService;
  let alertService: InfrastructureAlertService;
  let validator: IntegratedDrValidatorService;

  const systemActor: AuditActor = {
    type: 'SYSTEM',
    systemId: 'dr-validation-integration-runner'
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
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'el-pg-dr-integration-'));
    storage = new FilesystemProtectedBackupStorage(tempDir, { isOffHost: true });
    backupSource = new RealPostgresBackupSource(pool, 'eventlens');
    collector = new NeutralTelemetryCollector();
    telemetryService = new TelemetryService(collector);
    alertService = new InfrastructureAlertService(telemetryService);

    backupService = new PostgresBackupService(storage, backupSource, alertService, telemetryService);
    restoreTarget = new RealPostgresRestoreTarget(pool, {
      targetEnvironment: 'ISOLATED_LAB',
      targetDatabaseName: 'eventlens_dr_restore'
    });
    recoveryService = new PostgresRecoveryService(storage, restoreTarget, alertService, telemetryService);
    validator = new IntegratedDrValidatorService(
      backupService,
      recoveryService,
      alertService,
      telemetryService,
      new DefaultMediaRecoveryAuthority()
    );
  });

  it('executes full integrated DR-001 validation gate against real PostgreSQL 16 producing PASS', async () => {
    const report = await validator.validateDisasterRecoveryGate({
      callerActor: systemActor
    });

    expect(report.gateId).toBe('DR-001');
    expect(report.status).toBe('PASS');
    expect(report.actionRequiredItems).toHaveLength(0);

    // Escenario 1: Backup fault injection detected and alerted
    expect(report.scenario1BackupFaultDetection.passed).toBe(true);
    expect(report.scenario1BackupFaultDetection.alertTriggered).toBe(true);
    expect(report.scenario1BackupFaultDetection.alertName).toBe('infrastructure.postgres_backup_failed');

    // Escenario 2: Real database backup & isolated restore
    expect(report.scenario2RestoreAndPitrObjectives.passed).toBe(true);
    expect(report.scenario2RestoreAndPitrObjectives.isRpoMet).toBe(true);
    expect(report.scenario2RestoreAndPitrObjectives.isRtoMet).toBe(true);
    expect(report.scenario2RestoreAndPitrObjectives.tablesRestoredCount).toBeGreaterThan(0);

    // Escenario 3: Component outage alerts without secret exposure
    expect(report.scenario3ComponentOutageAlerting.passed).toBe(true);
    expect(report.scenario3ComponentOutageAlerting.secretsExposed).toBe(false);

    // Escenario 4: Post-PITR ObjectStorage referential consistency verified via RecoveryAuthority
    expect(report.scenario4StorageReferentialConsistency.passed).toBe(true);
    expect(report.scenario4StorageReferentialConsistency.storageReconciliation.isReferentiallyConsistent).toBe(true);
    expect(report.scenario4StorageReferentialConsistency.mediaRedundancyVerified).toBe(true);

    // Telemetry metric recorded for DR-001 gate
    const metrics = collector.getMetrics();
    expect(metrics.some((m) => m.name === 'infrastructure.dr_gate.status' && m.value === 1)).toBe(true);
  });

  it('reports gate FAIL and explicit action required when recovery exceeds RTO objective', async () => {
    const report = await validator.validateDisasterRecoveryGate({
      callerActor: systemActor,
      simulateExcessiveRto: true
    });

    expect(report.status).toBe('FAIL');
    expect(report.scenario2RestoreAndPitrObjectives.passed).toBe(false);
    expect(report.scenario2RestoreAndPitrObjectives.isRtoMet).toBe(false);
    expect(report.actionRequiredItems.length).toBeGreaterThan(0);

    const metrics = collector.getMetrics();
    expect(metrics.some((m) => m.name === 'infrastructure.dr_gate.status' && m.value === 0)).toBe(true);
  });
});
