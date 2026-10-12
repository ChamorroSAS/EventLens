import { describe, expect, it } from 'vitest';
import {
  HealthSignal,
  NeutralTelemetryCollector,
  OperationalMetric,
  TelemetryCollector,
  TelemetrySanitizer,
  TelemetryService
} from '../src/index.js';

describe('TelemetryService & TelemetrySanitizer (Unit Tests — EL-TK-168)', () => {
  it('Scenario 1: healthy component emits healthy health signal and metric with allowed technical dimensions', async () => {
    const collector = new NeutralTelemetryCollector();
    const service = new TelemetryService(collector);

    service.registerHealthChecker(
      TelemetryService.createMockHealthChecker('API', async () => ({
        status: 'HEALTHY'
      }))
    );

    const signal = await service.checkComponentHealth('API');

    expect(signal.component).toBe('API');
    expect(signal.status).toBe('HEALTHY');
    expect(signal.latencyMs).toBeGreaterThanOrEqual(0);

    service.emitMetric('http.request.duration_ms', 'HISTOGRAM', 45, 'ms', {
      method: 'GET',
      route: '/api/v1/health',
      statusCode: 200
    });

    const metrics = collector.getMetrics({ name: 'http.request.duration_ms' });
    expect(metrics.length).toBe(1);
    expect(metrics[0]?.value).toBe(45);
    expect(metrics[0]?.dimensions?.method).toBe('GET');
    expect(metrics[0]?.dimensions?.statusCode).toBe(200);
  });

  it('Scenario 2: dependency failure reflects DEGRADED and UNHEALTHY status with permitted technical dimensions', async () => {
    const collector = new NeutralTelemetryCollector();
    const service = new TelemetryService(collector);

    // Register degraded component
    service.registerHealthChecker(
      TelemetryService.createMockHealthChecker('OBJECT_STORAGE', async () => ({
        status: 'DEGRADED',
        message: 'High replication lag detected: 450ms'
      }))
    );

    // Register failing component throwing exception
    service.registerHealthChecker({
      component: 'DATABASE',
      async checkHealth(): Promise<HealthSignal> {
        throw new Error('Connection refused to postgresql://user:secret@postgres.internal:5432/eventlens');
      }
    });

    const storageSignal = await service.checkComponentHealth('OBJECT_STORAGE');
    expect(storageSignal.status).toBe('DEGRADED');
    expect(storageSignal.message).toBe('High replication lag detected: 450ms');

    const dbSignal = await service.checkComponentHealth('DATABASE');
    expect(dbSignal.status).toBe('UNHEALTHY');
    expect(dbSignal.message).toContain('postgresql://[REDACTED]@postgres.internal:5432/eventlens');
    expect(dbSignal.message).not.toContain('secret');

    // System-wide evaluation shows UNHEALTHY overall
    const overall = await service.evaluateAllHealth();
    expect(overall.overallStatus).toBe('UNHEALTHY');
    expect(overall.components.DATABASE?.status).toBe('UNHEALTHY');
    expect(overall.components.OBJECT_STORAGE?.status).toBe('DEGRADED');
  });

  it('Scenario 3: sensitive identifiers in metric dimensions are sanitized or redacted', () => {
    const collector = new NeutralTelemetryCollector();
    const service = new TelemetryService(collector);

    service.emitMetric('user.action.latency', 'GAUGE', 120, 'ms', {
      userId: '00000000-0000-0000-0000-000000000001',
      userEmail: 'user@example.com',
      sessionToken: 'sess-token-abc',
      clientSignature: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M',
      incomingHeader: 'Bearer secret_token_value_xyz',
      action: 'view_gallery'
    });

    const recorded = collector.getMetrics({ name: 'user.action.latency' })[0];
    expect(recorded).toBeDefined();

    const dims = recorded?.dimensions ?? {};
    expect(dims.action).toBe('view_gallery');
    expect(dims.userId).toBe('[REDACTED]');
    expect(dims.userEmail).toBe('[REDACTED]');
    expect(dims.sessionToken).toBe('[REDACTED]');
    expect(dims.clientSignature).toBe('[REDACTED_JWT]');
    expect(dims.incomingHeader).toBe('[REDACTED_BEARER]');
  });

  it('bounds dimension cardinality and truncates long strings to avoid cardinality explosion', () => {
    const sanitizer = new TelemetrySanitizer();
    const excessDimensions: Record<string, string> = {};

    for (let i = 0; i < 20; i++) {
      excessDimensions[`dim_${i}`] = `value_${i}`;
    }

    const sanitized = sanitizer.sanitizeDimensions(excessDimensions);
    expect(Object.keys(sanitized).length).toBe(10); // Capped at MAX_DIMENSION_COUNT (10)

    const longStringDim = sanitizer.sanitizeDimensions({
      longKey: 'x'.repeat(200)
    });

    expect(typeof longStringDim.longKey).toBe('string');
    expect((longStringDim.longKey as string).endsWith('...[TRUNCATED]')).toBe(true);
  });

  it('collector failure is completely isolated and does not disrupt application code', () => {
    const brokenCollector: TelemetryCollector = {
      recordMetric() {
        throw new Error('Remote collector unreachable');
      },
      recordHealthSignal() {
        throw new Error('Remote collector socket closed');
      },
      getMetrics() {
        return [];
      },
      getHealthSignals() {
        return {};
      }
    };

    const service = new TelemetryService(brokenCollector);

    // Emitting must NOT throw
    expect(() => {
      service.emitMetric('test.metric', 'COUNTER', 1);
    }).not.toThrow();

    expect(() => {
      service.emitHealthSignal({
        component: 'API',
        status: 'HEALTHY',
        timestamp: new Date()
      });
    }).not.toThrow();
  });
});
