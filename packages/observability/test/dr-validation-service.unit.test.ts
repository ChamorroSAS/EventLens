import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AuditActor,
  DatabaseBackupSource,
  DatabaseRestoreTarget,
  TombstoneReconciliationResult,
  TombstoneRecord
} from '../src/contracts.js';
import {
  DefaultMediaRecoveryAuthority,
  DrValidationError,
  IntegratedDrValidatorService
} from '../src/dr-validation-service.js';
import { InfrastructureAlertService } from '../src/infrastructure-alert-service.js';
import {
  FilesystemProtectedBackupStorage,
  PostgresBackupService
} from '../src/postgres-backup-service.js';
import {
  PostgresRecoveryService
} from '../src/postgres-recovery-service.js';
import { NeutralTelemetryCollector, TelemetryService } from '../src/telemetry-service.js';

class MockBackupSource implements DatabaseBackupSource {
  public databaseName = 'eventlens_dr_test';

  public async captureDatabaseDump(): Promise<{ dumpContent: Buffer; startLsn: string; endLsn: string }> {
    const payload = {
      databaseName: this.databaseName,
      startLsn: '0/1000',
      endLsn: '0/2000',
      tables: {
        users: [{ id: 'user-1', name: 'Alice' }],
        events: [{ id: 'event-1', title: 'Beta Event' }]
      }
    };
    const dumpContent = zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
    return { dumpContent, startLsn: '0/1000', endLsn: '0/2000' };
  }

  public async getWalCheckpoint(): Promise<{ currentLsn: string; lastCheckpointAt: Date; walFilesCount: number }> {
    return { currentLsn: '0/2000', lastCheckpointAt: new Date(), walFilesCount: 1 };
  }

  public async checkWalContinuity(): Promise<{ hasGaps: boolean; walFilesCount: number }> {
    return { hasGaps: false, walFilesCount: 1 };
  }
}

class MockRestoreTarget implements DatabaseRestoreTarget {
  public targetEnvironment = 'ISOLATED_LAB' as const;
  public targetDatabaseName = 'eventlens_restore_drill';

  public async restoreSnapshot(): Promise<{
    tablesRestoredCount: number;
    recordsRestoredCount: number;
    tables: Record<string, unknown[]>;
  }> {
    return {
      tablesRestoredCount: 2,
      recordsRestoredCount: 2,
      tables: { users: [], events: [] }
    };
  }

  public async applyTombstoneRestrictions(): Promise<TombstoneReconciliationResult> {
    return {
      tombstonesEvaluatedCount: 0,
      preventedResurrectionsCount: 0,
      heldByLegalHoldCount: 0,
      reconciledResourceIds: []
    };
  }
}

describe('IntegratedDrValidatorService (Unit Tests — EL-TK-174)', () => {
  let tempDir: string;
  let storage: FilesystemProtectedBackupStorage;
  let backupSource: MockBackupSource;
  let restoreTarget: MockRestoreTarget;
  let collector: NeutralTelemetryCollector;
  let telemetryService: TelemetryService;
  let alertService: InfrastructureAlertService;
  let backupService: PostgresBackupService;
  let recoveryService: PostgresRecoveryService;
  let validator: IntegratedDrValidatorService;

  const systemActor: AuditActor = {
    type: 'SYSTEM',
    systemId: 'dr-validation-runner'
  };

  const organizerActor: AuditActor = {
    type: 'ORGANIZER',
    actorId: 'org-1'
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'el-dr-unit-'));
    storage = new FilesystemProtectedBackupStorage(tempDir, { isOffHost: true });
    backupSource = new MockBackupSource();
    restoreTarget = new MockRestoreTarget();
    collector = new NeutralTelemetryCollector();
    telemetryService = new TelemetryService(collector);
    alertService = new InfrastructureAlertService(telemetryService);

    backupService = new PostgresBackupService(storage, backupSource, alertService, telemetryService);
    recoveryService = new PostgresRecoveryService(storage, restoreTarget, alertService, telemetryService);
    validator = new IntegratedDrValidatorService(
      backupService,
      recoveryService,
      alertService,
      telemetryService,
      new DefaultMediaRecoveryAuthority()
    );
  });

  it('validates DR-001 Gate PASS when all 4 scenarios succeed', async () => {
    const report = await validator.validateDisasterRecoveryGate({
      callerActor: systemActor
    });

    expect(report.gateId).toBe('DR-001');
    expect(report.status).toBe('PASS');
    expect(report.actionRequiredItems).toHaveLength(0);

    // Escenario 1: Fault injection detected
    expect(report.scenario1BackupFaultDetection.passed).toBe(true);
    expect(report.scenario1BackupFaultDetection.failureDetected).toBe(true);
    expect(report.scenario1BackupFaultDetection.alertTriggered).toBe(true);

    // Escenario 2: Restore & PITR RPO/RTO met
    expect(report.scenario2RestoreAndPitrObjectives.passed).toBe(true);
    expect(report.scenario2RestoreAndPitrObjectives.isRpoMet).toBe(true);
    expect(report.scenario2RestoreAndPitrObjectives.isRtoMet).toBe(true);

    // Escenario 3: Component outage alerts received without secret leaks
    expect(report.scenario3ComponentOutageAlerting.passed).toBe(true);
    expect(report.scenario3ComponentOutageAlerting.secretsExposed).toBe(false);

    // Escenario 4: ObjectStorage referential consistency and RecoveryAuthority reconciliation
    expect(report.scenario4StorageReferentialConsistency.passed).toBe(true);
    expect(report.scenario4StorageReferentialConsistency.storageReconciliation.isReferentiallyConsistent).toBe(true);
    expect(report.scenario4StorageReferentialConsistency.storageReconciliation.orphanedAfterPitrCount).toBe(1);

    // Telemetry metric emitted
    const metrics = collector.getMetrics();
    expect(metrics.some((m) => m.name === 'infrastructure.dr_gate.status' && m.value === 1)).toBe(true);
  });

  it('Escenario 2: reports gate FAIL when RTO exceeds objective (> 240m)', async () => {
    const report = await validator.validateDisasterRecoveryGate({
      callerActor: systemActor,
      simulateExcessiveRto: true
    });

    expect(report.status).toBe('FAIL');
    expect(report.scenario2RestoreAndPitrObjectives.passed).toBe(false);
    expect(report.scenario2RestoreAndPitrObjectives.isRtoMet).toBe(false);
    expect(report.actionRequiredItems.some((item) => item.includes('RTO met=false'))).toBe(true);

    const metrics = collector.getMetrics();
    expect(metrics.some((m) => m.name === 'infrastructure.dr_gate.status' && m.value === 0)).toBe(true);
  });

  it('Escenario 4: reports gate FAIL when storage has missing object references', async () => {
    const report = await validator.validateDisasterRecoveryGate({
      callerActor: systemActor,
      simulateMissingStorageObjects: true
    });

    expect(report.status).toBe('FAIL');
    expect(report.scenario4StorageReferentialConsistency.passed).toBe(false);
    expect(report.scenario4StorageReferentialConsistency.storageReconciliation.isReferentiallyConsistent).toBe(false);
    expect(report.scenario4StorageReferentialConsistency.storageReconciliation.missingObjectReferencesCount).toBe(1);
    expect(report.actionRequiredItems.some((item) => item.includes('Escenario 4 FAIL'))).toBe(true);
  });

  it('rejects unauthorized caller actors with UNAUTHORIZED_ACTOR', async () => {
    await expect(
      validator.validateDisasterRecoveryGate({
        callerActor: organizerActor
      })
    ).rejects.toThrow(DrValidationError);
  });
});
