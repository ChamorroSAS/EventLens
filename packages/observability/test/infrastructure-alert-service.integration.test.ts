import { describe, expect, it } from 'vitest';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  InfrastructureAlertService,
  NeutralTelemetryCollector,
  TelemetryService
} from '../src/index.js';

const databaseUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://eventlens:eventlens-local-only@127.0.0.1:15432/eventlens';

describe('InfrastructureAlertService (PostgreSQL 16 Integration Tests — EL-TK-170)', () => {
  const client = createPrismaClient(databaseUrl);
  const txs = new PrismaTransactions(client, 10000);

  it('Scenario 1: integrates with real PostgreSQL health checks and manages alerts across failure and recovery', async () => {
    const collector = new NeutralTelemetryCollector();
    const telemetry = new TelemetryService(collector);
    const service = new InfrastructureAlertService(telemetry);

    // Register real PostgreSQL health checker
    telemetry.registerHealthChecker(TelemetryService.createDatabaseHealthChecker(txs));

    // 1. Initial health check against live PostgreSQL
    const liveSignal = await telemetry.checkComponentHealth('DATABASE');
    expect(liveSignal.status).toBe('HEALTHY');

    const alertAfterHealthy = service.evaluateComponentHealth(liveSignal);
    expect(alertAfterHealthy).toBeUndefined();
    expect(service.getActiveAlerts('DATABASE').length).toBe(0);

    // 2. Simulate database failure signal with sensitive credential in error message
    const failureSignal = {
      component: 'DATABASE' as const,
      status: 'UNHEALTHY' as const,
      message: 'Connection terminated abruptly to postgresql://eventlens:eventlens-local-only@postgres:5432/eventlens',
      timestamp: new Date()
    };

    const triggeredAlert = service.evaluateComponentHealth(failureSignal);
    expect(triggeredAlert).toBeDefined();
    expect(triggeredAlert?.component).toBe('DATABASE');
    expect(triggeredAlert?.severity).toBe('CRITICAL');
    expect(triggeredAlert?.status).toBe('ACTIVE');
    expect(triggeredAlert?.message).not.toContain('eventlens-local-only');
    expect(triggeredAlert?.message).toContain('[REDACTED]');

    expect(service.getActiveAlerts('DATABASE').length).toBe(1);

    // 3. Re-check live database and evaluate recovery
    const recoveredSignal = await telemetry.checkComponentHealth('DATABASE');
    expect(recoveredSignal.status).toBe('HEALTHY');

    service.evaluateComponentHealth(recoveredSignal);

    expect(service.getActiveAlerts('DATABASE').length).toBe(0);
    const allAlerts = service.getAllAlerts();
    const dbAlert = allAlerts.find((a) => a.component === 'DATABASE');
    expect(dbAlert?.status).toBe('RESOLVED');
    expect(dbAlert?.resolvedAt).toBeDefined();
  });

  it('Scenario 3: collects real multi-component availability probes and verifies non-SLA compliance', () => {
    const collector = new NeutralTelemetryCollector();
    const telemetry = new TelemetryService(collector);
    const service = new InfrastructureAlertService(telemetry, {
      minAvailabilityRatio: 0.995
    });

    const now = Date.now();
    // 200 probes: 199 successful across API, DATABASE, WORKERS; 1 failed
    for (let i = 0; i < 199; i++) {
      const comp = i % 3 === 0 ? 'DATABASE' : i % 3 === 1 ? 'API' : 'WORKERS';
      service.recordAvailabilityProbe({
        component: comp,
        success: true,
        timestamp: new Date(now - (200 - i) * 1000)
      });
    }

    service.recordAvailabilityProbe({
      component: 'API',
      success: false,
      timestamp: new Date(now)
    });

    const measurement = service.evaluateAvailability(3600000, new Date(now));
    expect(measurement.totalProbes).toBe(200);
    expect(measurement.successfulProbes).toBe(199);
    expect(measurement.failedProbes).toBe(1);
    expect(measurement.observedAvailabilityRatio).toBe(0.995); // exactly 99.5%
    expect(measurement.isObjectiveMet).toBe(true);
    expect(measurement.isSlaContractual).toBe(false); // strictly non-SLA per DEC-034

    expect(service.getActiveAlerts('AVAILABILITY').length).toBe(0);
  });
});
