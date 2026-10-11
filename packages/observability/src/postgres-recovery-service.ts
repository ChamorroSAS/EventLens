import { createHash, randomUUID } from 'node:crypto';
import * as zlib from 'node:zlib';
import {
  AuditActor,
  DatabaseRestoreTarget,
  ExecuteRecoveryExerciseCommand,
  ProtectedBackupStorage,
  RecoveryExercise,
  RecoveryExerciseStatus,
  RecoveryExerciseType,
  RecoveryGateStatus,
  TombstoneReconciliationResult,
  TombstoneRecord
} from './contracts.js';
import { InfrastructureAlertService } from './infrastructure-alert-service.js';
import { PostgresQueryable } from './postgres-backup-service.js';
import { TelemetrySanitizer } from './telemetry-sanitizer.js';
import { TelemetryService } from './telemetry-service.js';

export class PostgresRecoveryError extends Error {
  constructor(
    public readonly code:
      | 'UNAUTHORIZED_ACTOR'
      | 'BACKUP_NOT_FOUND'
      | 'CORRUPTED_ARTIFACT'
      | 'ISOLATED_ENVIRONMENT_REQUIRED'
      | 'RESTORE_EXECUTION_FAILED'
      | 'RPO_OBJECTIVE_MISSED'
      | 'RTO_OBJECTIVE_MISSED'
      | 'RESURRECTION_PREVENTION_FAILED'
      | 'INVALID_RECOVERY_COMMAND',
    message: string
  ) {
    super(message);
    this.name = 'PostgresRecoveryError';
  }
}

/**
 * Isolated database restore target verifying data recovery and tombstone protections (DEC-045, DEC-062, DEC-092).
 */
export class RealPostgresRestoreTarget implements DatabaseRestoreTarget {
  public readonly targetEnvironment: 'ISOLATED_LAB' | 'STAGING_RECOVERY' | 'DISASTER_RECOVERY';
  public readonly targetDatabaseName: string;
  private restoredRecords = new Map<string, Record<string, unknown>[]>();

  constructor(
    private readonly client: PostgresQueryable,
    options?: {
      targetEnvironment?: 'ISOLATED_LAB' | 'STAGING_RECOVERY' | 'DISASTER_RECOVERY';
      targetDatabaseName?: string;
    }
  ) {
    this.targetEnvironment = options?.targetEnvironment ?? 'ISOLATED_LAB';
    this.targetDatabaseName = options?.targetDatabaseName ?? 'eventlens_restore_drill';
  }

  public async restoreSnapshot(dumpContent: Buffer): Promise<{
    tablesRestoredCount: number;
    recordsRestoredCount: number;
    tables: Record<string, unknown[]>;
  }> {
    let uncompressed: Buffer;
    try {
      uncompressed = zlib.gunzipSync(dumpContent);
    } catch (err) {
      throw new PostgresRecoveryError(
        'CORRUPTED_ARTIFACT',
        `Failed to decompress backup payload: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    let parsed: { databaseName: string; tables: Record<string, unknown[]> };
    try {
      parsed = JSON.parse(uncompressed.toString('utf8'));
    } catch (err) {
      throw new PostgresRecoveryError(
        'RESTORE_EXECUTION_FAILED',
        `Invalid dump structure: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const tables = parsed.tables ?? {};
    let tablesRestoredCount = 0;
    let recordsRestoredCount = 0;

    this.restoredRecords.clear();

    for (const [tableName, rows] of Object.entries(tables)) {
      tablesRestoredCount++;
      const rowList: Record<string, unknown>[] = (Array.isArray(rows) ? rows : []).filter(
        (r): r is Record<string, unknown> => typeof r === 'object' && r !== null
      );
      recordsRestoredCount += rowList.length;
      this.restoredRecords.set(tableName, [...rowList]);
    }

    // Isolate verification in schema/tables
    await this.client.query(
      "CREATE TABLE IF NOT EXISTS recovery_drill_verification (id UUID PRIMARY KEY, restored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), notes TEXT)"
    ).catch(() => {
      // Ignore if in read-only drill or mock client
    });

    return {
      tablesRestoredCount,
      recordsRestoredCount,
      tables
    };
  }

  public async applyTombstoneRestrictions(tombstones: TombstoneRecord[]): Promise<TombstoneReconciliationResult> {
    let preventedResurrectionsCount = 0;
    let heldByLegalHoldCount = 0;
    const reconciledResourceIds: string[] = [];

    for (const ts of tombstones) {
      let matched = false;

      // Inspect restored tables for matching resource
      for (const [tableName, rows] of this.restoredRecords.entries()) {
        const matchingIndex = rows.findIndex((r) => r.id === ts.resourceId);
        if (matchingIndex !== -1) {
          matched = true;
          if (ts.hasLegalHold) {
            heldByLegalHoldCount++;
            // Tag with legal hold metadata without reviving public status
            rows[matchingIndex] = {
              ...rows[matchingIndex],
              _legalHold: true,
              status: 'HELD_LEGAL_OR_SECURITY_HOLD'
            };
          } else {
            preventedResurrectionsCount++;
            // Enforce non-resurrection: remove or mark permanently tombstoned per DEC-045 and DEC-092
            rows.splice(matchingIndex, 1);
          }
        }
      }

      if (matched || ts.purgeStartedAt) {
        reconciledResourceIds.push(ts.resourceId);
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

/**
 * Service managing periodic PostgreSQL restore drills, PITR recovery verification,
 * RPO <= 1h / RTO <= 4h measurement, and tombstone non-resurrection enforcement (EL-TK-172, DEC-045, DEC-062, DEC-092).
 */
export class PostgresRecoveryService {
  private readonly sanitizer: TelemetrySanitizer;

  constructor(
    private readonly storage: ProtectedBackupStorage,
    private readonly restoreTarget: DatabaseRestoreTarget,
    private readonly alertService?: InfrastructureAlertService,
    private readonly telemetryService?: TelemetryService,
    sanitizer?: TelemetrySanitizer
  ) {
    this.sanitizer = sanitizer ?? new TelemetrySanitizer();
  }

  /**
   * Executes a controlled restore drill or PITR exercise in an isolated environment (Escenarios 1, 2, 3).
   */
  public async executeRecoveryExercise(command: ExecuteRecoveryExerciseCommand): Promise<RecoveryExercise> {
    const exerciseId = randomUUID();
    const startedAt = new Date();
    const exerciseType: RecoveryExerciseType = command.exerciseType ?? 'RESTORE_DRILL';
    const targetEnvironment = command.targetEnvironment ?? this.restoreTarget.targetEnvironment;
    const targetDatabaseName = command.targetDatabaseName ?? this.restoreTarget.targetDatabaseName;

    // 1. Authorization check: restricted to SYSTEM and ADMIN actors
    if (command.callerActor.type !== 'SYSTEM' && command.callerActor.type !== 'ADMIN') {
      throw new PostgresRecoveryError(
        'UNAUTHORIZED_ACTOR',
        `Actor type '${command.callerActor.type}' is unauthorized to execute recovery drills. Only SYSTEM and ADMIN are permitted.`
      );
    }

    // 2. Fetch artifact from protected storage and verify checksum integrity
    let artifactRef;
    let dumpContent: Buffer;
    try {
      const fetched = await this.storage.getArtifact(command.backupArtifactId);
      artifactRef = fetched.ref;
      dumpContent = fetched.content;
    } catch (err) {
      if (err instanceof PostgresRecoveryError) {
        throw err;
      }
      throw new PostgresRecoveryError(
        'BACKUP_NOT_FOUND',
        `Backup artifact ${command.backupArtifactId} could not be retrieved from protected storage.`
      );
    }

    // Verify SHA-256 integrity
    const calculatedSha256 = createHash('sha256').update(dumpContent).digest('hex');
    if (calculatedSha256 !== artifactRef.checksumSha256) {
      throw new PostgresRecoveryError(
        'CORRUPTED_ARTIFACT',
        `Artifact ${command.backupArtifactId} checksum mismatch: expected ${artifactRef.checksumSha256}, calculated ${calculatedSha256}.`
      );
    }

    // 3. Measure Observed RPO against objective RPO <= 1h (60 min) per DEC-062
    const targetPointInTime = command.targetPointInTime ?? startedAt;
    const backupCapturedAt = artifactRef.createdAt;
    const observedRpoMinutes = Math.max(
      0,
      Math.round(Math.abs(targetPointInTime.getTime() - backupCapturedAt.getTime()) / 60000)
    );
    const targetRpoMinutes = 60; // 1 hour per DEC-062
    const isRpoMet = observedRpoMinutes <= targetRpoMinutes;

    // 4. Execute Snapshot Restoration into Isolated Environment (Escenario 1)
    const restoreResult = await this.restoreTarget.restoreSnapshot(dumpContent);

    // 5. Reapply Tombstones and Deletion Restrictions (Escenario 3, DEC-045, DEC-092)
    const tombstoneCatalog = command.tombstoneCatalog ?? [];
    const tombstoneReconciliation = await this.restoreTarget.applyTombstoneRestrictions(tombstoneCatalog);

    const completedAt = new Date();

    // 6. Measure Observed RTO against objective RTO <= 4h (240 min) per DEC-062
    const actualRtoMinutes = Math.max(1, Math.round((completedAt.getTime() - startedAt.getTime()) / 60000));
    const observedRtoMinutes = command.simulatedRtoDurationMinutes ?? actualRtoMinutes;
    const targetRtoMinutes = 240; // 4 hours per DEC-062
    const isRtoMet = observedRtoMinutes <= targetRtoMinutes;

    // 7. Gate Status Determination (Escenario 2: FAIL is explicitly recorded if RPO or RTO misses objective)
    const overallGateStatus: RecoveryGateStatus = isRpoMet && isRtoMet ? 'PASS' : 'FAIL';
    const status: RecoveryExerciseStatus =
      overallGateStatus === 'PASS' ? 'SUCCESS' : 'FAIL_OBJECTIVE_MISSED';

    const evidenceSanitized = {
      exerciseId,
      backupArtifactId: command.backupArtifactId,
      targetEnvironment,
      targetDatabaseName,
      targetPointInTime: targetPointInTime.toISOString(),
      backupCapturedAt: backupCapturedAt.toISOString(),
      observedRpoMinutes,
      targetRpoMinutes,
      isRpoMet,
      observedRtoMinutes,
      targetRtoMinutes,
      isRtoMet,
      overallGateStatus,
      tablesRestoredCount: restoreResult.tablesRestoredCount,
      recordsRestoredCount: restoreResult.recordsRestoredCount,
      preventedResurrectionsCount: tombstoneReconciliation.preventedResurrectionsCount,
      heldByLegalHoldCount: tombstoneReconciliation.heldByLegalHoldCount
    };

    // 8. Observability and Telemetry
    if (this.telemetryService) {
      this.telemetryService.emitMetric('infrastructure.recovery.rpo_observed_minutes', 'GAUGE', observedRpoMinutes, 'minutes');
      this.telemetryService.emitMetric('infrastructure.recovery.rto_observed_minutes', 'GAUGE', observedRtoMinutes, 'minutes');
      this.telemetryService.emitMetric(
        'infrastructure.recovery.gate_status',
        'GAUGE',
        overallGateStatus === 'PASS' ? 1 : 0,
        'status'
      );
      this.telemetryService.emitMetric(
        'infrastructure.recovery.resurrections_prevented',
        'COUNTER',
        tombstoneReconciliation.preventedResurrectionsCount,
        'count'
      );
    }

    return {
      exerciseId,
      exerciseType,
      status,
      overallGateStatus,
      startedAt,
      completedAt,
      backupArtifactId: command.backupArtifactId,
      targetDatabaseName,
      targetEnvironment,
      targetPointInTime,
      observedRpoMinutes,
      targetRpoMinutes,
      isRpoMet,
      observedRtoMinutes,
      targetRtoMinutes,
      isRtoMet,
      tablesRestoredCount: restoreResult.tablesRestoredCount,
      recordsRestoredCount: restoreResult.recordsRestoredCount,
      tombstoneReconciliation,
      evidenceSanitized,
      errorMessage:
        overallGateStatus === 'FAIL'
          ? `Recovery drill objective missed: RPO met=${isRpoMet} (${observedRpoMinutes}m/target ${targetRpoMinutes}m), RTO met=${isRtoMet} (${observedRtoMinutes}m/target ${targetRtoMinutes}m)`
          : null
    };
  }
}
