import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import { AuditActor } from '../src/contracts.js';
import { AuditService } from '../src/audit-service.js';
import { AuditSanitizer } from '../src/audit-sanitizer.js';
import { InfrastructureAlertService } from '../src/infrastructure-alert-service.js';
import { IncidentService } from '../src/incident-service.js';
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
import { EndToEndObservabilityValidator } from '../src/e2e-validator.js';

const databaseUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://eventlens:eventlens-local-only@127.0.0.1:15432/eventlens';

describe('EndToEndObservabilityValidator (EL-TK-176 E2E Integration with PostgreSQL 16)', () => {
  let pool: Pool;
  let tempDir: string;
  let prismaClient: any;
  let txRunner: PrismaTransactions;
  let auditService: AuditService;
  let alertService: InfrastructureAlertService;
  let incidentService: IncidentService;
  let storage: FilesystemProtectedBackupStorage;
  let backupSource: RealPostgresBackupSource;
  let backupService: PostgresBackupService;
  let restoreTarget: RealPostgresRestoreTarget;
  let recoveryService: PostgresRecoveryService;
  let collector: NeutralTelemetryCollector;
  let telemetryService: TelemetryService;
  let validator: EndToEndObservabilityValidator;

  const adminActor: AuditActor = {
    type: 'ADMIN',
    actorId: 'admin-e2e-operator',
    detail: { ipAddress: '10.0.0.1', sessionRef: 'sess-e2e-admin' }
  };

  const systemActor: AuditActor = {
    type: 'SYSTEM',
    systemId: 'system-e2e-runner'
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    const res = await pool.query('SELECT version()');
    expect(res.rows[0].version).toContain('PostgreSQL 16');

    prismaClient = createPrismaClient(databaseUrl);
    txRunner = new PrismaTransactions(prismaClient, 10000);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'el-pg-e2e-val-'));
    storage = new FilesystemProtectedBackupStorage(tempDir, { isOffHost: true });
    backupSource = new RealPostgresBackupSource(pool, 'eventlens');
    collector = new NeutralTelemetryCollector();
    telemetryService = new TelemetryService(collector);
    alertService = new InfrastructureAlertService(telemetryService);

    backupService = new PostgresBackupService(
      storage,
      backupSource,
      alertService,
      telemetryService
    );

    restoreTarget = new RealPostgresRestoreTarget(pool, {
      targetEnvironment: 'ISOLATED_LAB',
      targetDatabaseName: 'eventlens_e2e_recovery_drill'
    });
    recoveryService = new PostgresRecoveryService(
      storage,
      restoreTarget,
      alertService,
      telemetryService
    );

    auditService = new AuditService(txRunner, new AuditSanitizer());
    incidentService = new IncidentService(txRunner);

    validator = new EndToEndObservabilityValidator(
      auditService,
      alertService,
      incidentService,
      recoveryService,
      storage,
      collector
    );
  });

  it('Escenario 1: sensitive action occurs, records auditable trace without multimedia or secrets', async () => {
    const report = await validator.validateScenario1AuditTraceability(adminActor);

    expect(report.passed).toBe(true);
    expect(report.sensitiveActionsRecorded).toBe(2);
    expect(report.multimediaStreamsScrubbed).toBe(true);
    expect(report.queryableWithPermissions).toBe(true);
  });

  it('Escenario 2: critical job/infra condition simulated, detects alert and correlates operational incident', async () => {
    const report = await validator.validateScenario2CriticalAlertAndIncidentCorrelation(systemActor);

    expect(report.passed).toBe(true);
    expect(report.alertDetected).toBe(true);
    expect(report.incidentRecorded).toBe(true);
    expect(report.incidentSeverity).toBe('CRITICAL');
    expect(report.incidentCorrelatedWithAlert).toBe(true);
    expect(report.sanitizedTelemetryVerified).toBe(true);
  });

  it('Escenario 3: recovery executed with measured RPO/RTO objectives and enforces non-resurrection', async () => {
    // First take a backup so restore target has a valid artifact
    const backupRun = await backupService.executeDailyBackup({
      callerActor: systemActor,
      retentionDays: 7
    });
    expect(backupRun.status).toBe('SUCCESS');

    const report = await validator.validateScenario3RecoveryAndNonResurrection(systemActor);

    expect(report.passed).toBe(true);
    expect(report.isRpoMet).toBe(true);
    expect(report.isRtoMet).toBe(true);
    expect(report.observedRpoMinutes).toBeLessThanOrEqual(60);
    expect(report.observedRtoMinutes).toBeLessThanOrEqual(240);
    expect(report.nonResurrectionEnforced).toBe(true);
    expect(report.resurrectedCount).toBe(0);
  });

  it('Full E2E validation compiles comprehensive report with status PASS', async () => {
    // Ensure backup artifact is available
    await backupService.executeDailyBackup({
      callerActor: systemActor,
      retentionDays: 7
    });

    const fullReport = await validator.runFullValidation(adminActor, systemActor);

    expect(fullReport.gateId).toBe('EL-EP-014-E2E');
    expect(fullReport.status).toBe('PASS');
    expect(fullReport.scenario1AuditTraceability.passed).toBe(true);
    expect(fullReport.scenario2CriticalAlertAndIncidentCorrelation.passed).toBe(true);
    expect(fullReport.scenario3RecoveryObjectivesAndNonResurrection.passed).toBe(true);
    expect(fullReport.evidenceSanitized).toBeDefined();
  });
});
