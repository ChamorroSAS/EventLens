import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AuditActor,
  DatabaseRestoreTarget,
  TombstoneReconciliationResult,
  TombstoneRecord
} from '../src/contracts.js';
import { InfrastructureAlertService } from '../src/infrastructure-alert-service.js';
import { FilesystemProtectedBackupStorage } from '../src/postgres-backup-service.js';
import {
  PostgresRecoveryError,
  PostgresRecoveryService
} from '../src/postgres-recovery-service.js';
import { NeutralTelemetryCollector, TelemetryService } from '../src/telemetry-service.js';

class MockDatabaseRestoreTarget implements DatabaseRestoreTarget {
  public targetEnvironment = 'ISOLATED_LAB' as const;
  public targetDatabaseName = 'eventlens_mock_restore';
  public tablesRestored: Record<string, Record<string, unknown>[]> = {};

  public async restoreSnapshot(dumpContent: Buffer): Promise<{
    tablesRestoredCount: number;
    recordsRestoredCount: number;
    tables: Record<string, unknown[]>;
  }> {
    const uncompressed = zlib.gunzipSync(dumpContent);
    const parsed = JSON.parse(uncompressed.toString('utf8'));
    this.tablesRestored = parsed.tables ?? {};

    let totalRecords = 0;
    for (const rows of Object.values(this.tablesRestored)) {
      totalRecords += rows.length;
    }

    return {
      tablesRestoredCount: Object.keys(this.tablesRestored).length,
      recordsRestoredCount: totalRecords,
      tables: this.tablesRestored
    };
  }

  public async applyTombstoneRestrictions(tombstones: TombstoneRecord[]): Promise<TombstoneReconciliationResult> {
    let preventedResurrectionsCount = 0;
    let heldByLegalHoldCount = 0;
    const reconciledResourceIds: string[] = [];

    for (const ts of tombstones) {
      for (const rows of Object.values(this.tablesRestored)) {
        const idx = rows.findIndex((r) => r.id === ts.resourceId);
        if (idx !== -1) {
          if (ts.hasLegalHold) {
            heldByLegalHoldCount++;
            rows[idx].status = 'HELD_LEGAL_OR_SECURITY_HOLD';
          } else {
            preventedResurrectionsCount++;
            rows.splice(idx, 1); // Permanently remove from active state
          }
          reconciledResourceIds.push(ts.resourceId);
        }
      }
    }

    return {
      tombstonesEvaluatedCount: tombstones.length,
      preventedResurrectionsCount,
      heldByLegalHoldCount,
      reconciledResourceIds
    };
  }
}

describe('PostgresRecoveryService (Unit Tests — EL-TK-172)', () => {
  let tempDir: string;
  let storage: FilesystemProtectedBackupStorage;
  let target: MockDatabaseRestoreTarget;
  let collector: NeutralTelemetryCollector;
  let telemetryService: TelemetryService;
  let alertService: InfrastructureAlertService;
  let service: PostgresRecoveryService;

  const systemActor: AuditActor = {
    type: 'SYSTEM',
    systemId: 'recovery-drill-runner'
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
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'el-recovery-unit-'));
    storage = new FilesystemProtectedBackupStorage(tempDir, { isOffHost: true });
    target = new MockDatabaseRestoreTarget();
    collector = new NeutralTelemetryCollector();
    telemetryService = new TelemetryService(collector);
    alertService = new InfrastructureAlertService(telemetryService);
    service = new PostgresRecoveryService(storage, target, alertService, telemetryService);
  });

  async function createValidBackup(createdAt: Date = new Date(), customRows?: Record<string, unknown[]>) {
    const payload = {
      databaseName: 'eventlens',
      capturedAt: createdAt.toISOString(),
      startLsn: '0/1000',
      endLsn: '0/2000',
      tables: customRows ?? {
        events: [
          { id: 'ev-active-1', title: 'Live Concert', status: 'PUBLISHED' },
          { id: 'ev-deleted-2', title: 'Cancelled Party', status: 'PUBLISHED' }
        ],
        media: [
          { id: 'med-held-3', eventId: 'ev-active-1', status: 'READY' }
        ]
      }
    };

    const dumpContent = zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
    return storage.storeArtifact('valid_backup', dumpContent, {
      backupType: 'FULL_DAILY',
      retentionDays: 7,
      createdAt
    });
  }

  it('Escenario 1: executes restore exercise from valid backup and measures RPO/RTO PASS gate', async () => {
    const artifact = await createValidBackup();

    const exercise = await service.executeRecoveryExercise({
      callerActor: systemActor,
      backupArtifactId: artifact.artifactId
    });

    expect(exercise.status).toBe('SUCCESS');
    expect(exercise.overallGateStatus).toBe('PASS');
    expect(exercise.isRpoMet).toBe(true);
    expect(exercise.isRtoMet).toBe(true);
    expect(exercise.observedRpoMinutes).toBeLessThanOrEqual(60);
    expect(exercise.tablesRestoredCount).toBe(2);
    expect(exercise.recordsRestoredCount).toBe(3);
    expect(exercise.evidenceSanitized.overallGateStatus).toBe('PASS');

    // Metrics emitted
    const metrics = collector.getMetrics();
    expect(metrics.some((m) => m.name === 'infrastructure.recovery.gate_status' && m.value === 1)).toBe(true);
  });

  it('Escenario 2: records explicit FAIL when observed RPO excedes target (> 60m)', async () => {
    // Backup snapshot was taken 90 minutes ago
    const ninetyMinutesAgo = new Date(Date.now() - 90 * 60000);
    const artifact = await createValidBackup(ninetyMinutesAgo);

    const exercise = await service.executeRecoveryExercise({
      callerActor: adminActor,
      backupArtifactId: artifact.artifactId,
      targetPointInTime: new Date() // Point in time is now (gap of 90m)
    });

    expect(exercise.status).toBe('FAIL_OBJECTIVE_MISSED');
    expect(exercise.overallGateStatus).toBe('FAIL');
    expect(exercise.isRpoMet).toBe(false);
    expect(exercise.observedRpoMinutes).toBeGreaterThanOrEqual(89);
    expect(exercise.errorMessage).toContain('Recovery drill objective missed');

    // Gate failure metric is 0 (FAIL)
    const metrics = collector.getMetrics();
    expect(metrics.some((m) => m.name === 'infrastructure.recovery.gate_status' && m.value === 0)).toBe(true);
  });

  it('Escenario 2: records explicit FAIL when observed RTO excedes target (> 240m)', async () => {
    const artifact = await createValidBackup();

    const exercise = await service.executeRecoveryExercise({
      callerActor: systemActor,
      backupArtifactId: artifact.artifactId,
      simulatedRtoDurationMinutes: 300 // 5 hours > 4 hours target (DEC-062)
    });

    expect(exercise.status).toBe('FAIL_OBJECTIVE_MISSED');
    expect(exercise.overallGateStatus).toBe('FAIL');
    expect(exercise.isRtoMet).toBe(false);
    expect(exercise.observedRtoMinutes).toBe(300);
    expect(exercise.errorMessage).toContain('RTO met=false');
  });

  it('Escenario 3: re-applies tombstones ensuring purged records do not resurrect as active (DEC-045, DEC-092)', async () => {
    const artifact = await createValidBackup();

    const tombstones: TombstoneRecord[] = [
      {
        resourceType: 'EVENT',
        resourceId: 'ev-deleted-2',
        purgeStartedAt: new Date(Date.now() - 5 * 86400000),
        deletedAt: new Date(Date.now() - 5 * 86400000),
        hasLegalHold: false
      },
      {
        resourceType: 'MEDIA_ASSET',
        resourceId: 'med-held-3',
        purgeStartedAt: new Date(Date.now() - 2 * 86400000),
        deletedAt: new Date(Date.now() - 2 * 86400000),
        hasLegalHold: true
      }
    ];

    const exercise = await service.executeRecoveryExercise({
      callerActor: systemActor,
      backupArtifactId: artifact.artifactId,
      tombstoneCatalog: tombstones
    });

    expect(exercise.status).toBe('SUCCESS');
    expect(exercise.overallGateStatus).toBe('PASS');

    // Verification of tombstone reconciliation
    expect(exercise.tombstoneReconciliation.preventedResurrectionsCount).toBe(1);
    expect(exercise.tombstoneReconciliation.heldByLegalHoldCount).toBe(1);

    // Verify non-resurrection in target: 'ev-deleted-2' was removed from active tables
    const restoredEvents = target.tablesRestored.events;
    expect(restoredEvents.some((e) => e.id === 'ev-deleted-2')).toBe(false);

    // Verify legal hold record preserved with hold status
    const restoredMedia = target.tablesRestored.media;
    const heldItem = restoredMedia.find((m) => m.id === 'med-held-3');
    expect(heldItem).toBeDefined();
    expect(heldItem?.status).toBe('HELD_LEGAL_OR_SECURITY_HOLD');
  });

  it('rejects tampered or corrupt backup artifact', async () => {
    const artifact = await createValidBackup();
    const dumpPath = artifact.storageLocationUri.replace('file://', '');
    fs.appendFileSync(dumpPath, Buffer.from('corrupt_bytes'));

    await expect(
      service.executeRecoveryExercise({
        callerActor: systemActor,
        backupArtifactId: artifact.artifactId
      })
    ).rejects.toThrow(PostgresRecoveryError);
  });

  it('rejects non-existent backup artifact ID with BACKUP_NOT_FOUND', async () => {
    await expect(
      service.executeRecoveryExercise({
        callerActor: systemActor,
        backupArtifactId: 'non-existent-artifact-id'
      })
    ).rejects.toThrow(PostgresRecoveryError);
  });

  it('rejects unauthorized actor roles with UNAUTHORIZED_ACTOR', async () => {
    const artifact = await createValidBackup();

    await expect(
      service.executeRecoveryExercise({
        callerActor: organizerActor,
        backupArtifactId: artifact.artifactId
      })
    ).rejects.toThrow(PostgresRecoveryError);
  });
});
