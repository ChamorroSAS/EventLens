import { describe, expect, it } from 'vitest';
import {
  InfrastructureAlertService,
  NeutralTelemetryCollector,
  TelemetryService
} from '../src/index.js';

describe('InfrastructureAlertService (Unit Tests — EL-TK-170)', () => {
  it('Scenario 1: triggers sanitized alerts for database and storage failures and resolves upon recovery', () => {
    const collector = new NeutralTelemetryCollector();
    const telemetry = new TelemetryService(collector);
    const service = new InfrastructureAlertService(telemetry);

    // 1. Database fails with sensitive connection string
    const dbAlert = service.evaluateComponentHealth({
      component: 'DATABASE',
      status: 'UNHEALTHY',
      message: 'Connection failed to postgresql://postgres:supersecret@db.internal:5432/eventlens',
      timestamp: new Date()
    });

    expect(dbAlert).toBeDefined();
    expect(dbAlert?.component).toBe('DATABASE');
    expect(dbAlert?.severity).toBe('CRITICAL');
    expect(dbAlert?.status).toBe('ACTIVE');
    expect(dbAlert?.message).not.toContain('supersecret');
    expect(dbAlert?.message).toContain('[REDACTED]');

    // 2. Storage degraded with sensitive presigned key
    const storageAlert = service.evaluateComponentHealth({
      component: 'OBJECT_STORAGE',
      status: 'DEGRADED',
      message: 'Upload timeout on s3://eventlens-media/private/user_123/avatar.png with X-Amz-Signature=abcd1234efgh',
      latencyMs: 4500,
      timestamp: new Date()
    });

    expect(storageAlert).toBeDefined();
    expect(storageAlert?.component).toBe('OBJECT_STORAGE');
    expect(storageAlert?.severity).toBe('WARNING');
    expect(storageAlert?.status).toBe('ACTIVE');
    expect(storageAlert?.message).not.toContain('private/user_123/avatar.png');
    expect(storageAlert?.message).not.toContain('abcd1234efgh');
    expect(storageAlert?.message).toContain('[REDACTED_KEY]');

    expect(service.getActiveAlerts().length).toBe(2);

    // Deduplication check: repeated UNHEALTHY signal updates lastTriggeredAt without creating a new alert
    const firstTriggered = dbAlert!.firstTriggeredAt;
    const dbAlertUpdated = service.evaluateComponentHealth({
      component: 'DATABASE',
      status: 'UNHEALTHY',
      message: 'Still unreachable',
      timestamp: new Date()
    });
    expect(dbAlertUpdated?.id).toBe(dbAlert?.id);
    expect(service.getActiveAlerts('DATABASE').length).toBe(1);

    // Recovery check: HEALTHY signal resolves alert
    service.evaluateComponentHealth({
      component: 'DATABASE',
      status: 'HEALTHY',
      timestamp: new Date()
    });

    const activeDb = service.getActiveAlerts('DATABASE');
    expect(activeDb.length).toBe(0);

    const allAlerts = service.getAllAlerts();
    const resolvedDb = allAlerts.find((a) => a.component === 'DATABASE');
    expect(resolvedDb?.status).toBe('RESOLVED');
    expect(resolvedDb?.resolvedAt).toBeDefined();
  });

  it('Scenario 2: detects stalled scheduler checkpoints exceeding stall threshold', () => {
    const collector = new NeutralTelemetryCollector();
    const telemetry = new TelemetryService(collector);
    const service = new InfrastructureAlertService(telemetry, {
      maxSchedulerStallSeconds: 120
    });

    const now = new Date('2026-10-11T12:00:00Z');
    const recentCheckpoint = new Date('2026-10-11T11:59:30Z'); // 30s ago
    const staleCheckpoint = new Date('2026-10-11T11:50:00Z'); // 600s ago (stalled)

    service.recordSchedulerHeartbeat({
      taskName: 'audit-retention-worker',
      lastCheckpointAt: recentCheckpoint,
      intervalSeconds: 60
    });

    service.recordSchedulerHeartbeat({
      taskName: 'media-transcoder-worker',
      lastCheckpointAt: staleCheckpoint,
      intervalSeconds: 30
    });

    const alerts = service.evaluateSchedulerStall(now);
    expect(alerts.length).toBe(1);

    const stallAlert = alerts[0];
    expect(stallAlert.component).toBe('SCHEDULER');
    expect(stallAlert.severity).toBe('CRITICAL');
    expect(stallAlert.name).toBe('infrastructure.scheduler_stalled');
    expect(stallAlert.message).toContain('media-transcoder-worker');
    expect(stallAlert.message).toContain('stalled');

    // Refreshing heartbeat resolves the stall alert
    service.recordSchedulerHeartbeat({
      taskName: 'media-transcoder-worker',
      lastCheckpointAt: new Date(now.getTime() - 10000), // 10s ago
      intervalSeconds: 30
    });

    const refreshedAlerts = service.evaluateSchedulerStall(now);
    expect(refreshedAlerts.length).toBe(0);
    expect(service.getActiveAlerts('SCHEDULER').length).toBe(0);
  });

  it('Scenario 3: evaluates availability ratio against operational objective (non-SLA)', () => {
    const collector = new NeutralTelemetryCollector();
    const telemetry = new TelemetryService(collector);
    const service = new InfrastructureAlertService(telemetry, {
      minAvailabilityRatio: 0.995 // 99.5% operational target
    });

    const baseTime = new Date('2026-10-11T10:00:00Z');

    // Record 98 successful probes and 2 failed probes (98% availability, below 99.5%)
    for (let i = 0; i < 98; i++) {
      service.recordAvailabilityProbe({
        component: 'API',
        success: true,
        timestamp: new Date(baseTime.getTime() + i * 1000)
      });
    }
    for (let i = 0; i < 2; i++) {
      service.recordAvailabilityProbe({
        component: 'API',
        success: false,
        timestamp: new Date(baseTime.getTime() + (98 + i) * 1000)
      });
    }

    const evaluationTime = new Date(baseTime.getTime() + 105 * 1000);
    const measurement = service.evaluateAvailability(3600000, evaluationTime);

    expect(measurement.totalProbes).toBe(100);
    expect(measurement.successfulProbes).toBe(98);
    expect(measurement.failedProbes).toBe(2);
    expect(measurement.observedAvailabilityRatio).toBe(0.98);
    expect(measurement.targetObjectiveRatio).toBe(0.995);
    expect(measurement.isObjectiveMet).toBe(false);
    expect(measurement.isSlaContractual).toBe(false); // DEC-034: explicitly operational target, not contractual SLA

    // Alert triggered for degraded availability
    const activeAlerts = service.getActiveAlerts('AVAILABILITY');
    expect(activeAlerts.length).toBe(1);
    expect(activeAlerts[0].severity).toBe('CRITICAL');
    expect(activeAlerts[0].name).toBe('infrastructure.availability_degraded');
    expect(activeAlerts[0].message).toContain('non-SLA');
    expect(activeAlerts[0].message).toContain('degraded below operational objective');

    // Verify gauge metric
    const gauge = collector.getMetrics({ name: 'infrastructure.availability.ratio' });
    expect(gauge.length).toBe(1);
    expect(gauge[0].value).toBe(0.98);
  });

  it('consumes purge failure signals from EL-TK-184 and resolves on success', () => {
    const collector = new NeutralTelemetryCollector();
    const telemetry = new TelemetryService(collector);
    const service = new InfrastructureAlertService(telemetry);

    // 1. Purge failure signal triggers warning alert
    const alert = service.handlePurgeSignal({
      task: 'AUDIT_RETENTION',
      status: 'FAILURE',
      itemsPurged: 0,
      errorMessage: 'Deadlock encountered with postgresql://admin:secret@host/db',
      timestamp: new Date()
    });

    expect(alert).toBeDefined();
    expect(alert?.component).toBe('DATABASE');
    expect(alert?.severity).toBe('WARNING');
    expect(alert?.status).toBe('ACTIVE');
    expect(alert?.message).not.toContain('secret');
    expect(alert?.message).toContain('[REDACTED]');

    expect(service.getActiveAlerts('DATABASE').length).toBe(1);

    // 2. Successful purge signal resolves the alert
    service.handlePurgeSignal({
      task: 'AUDIT_RETENTION',
      status: 'SUCCESS',
      itemsPurged: 120,
      timestamp: new Date()
    });

    expect(service.getActiveAlerts('DATABASE').length).toBe(0);
    const all = service.getAllAlerts();
    expect(all[0].status).toBe('RESOLVED');
  });
});
