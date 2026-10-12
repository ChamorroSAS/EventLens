import { describe, expect, it } from 'vitest';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  NeutralTelemetryCollector,
  TelemetryService
} from '../src/index.js';

const databaseUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://eventlens:eventlens-local-only@127.0.0.1:15432/eventlens';

describe('TelemetryService (PostgreSQL 16 Integration Tests — EL-TK-168)', () => {
  const client = createPrismaClient(databaseUrl);
  const txs = new PrismaTransactions(client, 10000);

  it('checks real PostgreSQL health and returns HEALTHY signal with measured latency', async () => {
    const collector = new NeutralTelemetryCollector();
    const service = new TelemetryService(collector);

    const dbChecker = TelemetryService.createDatabaseHealthChecker(txs);
    service.registerHealthChecker(dbChecker);

    const signal = await service.checkComponentHealth('DATABASE');

    expect(signal.component).toBe('DATABASE');
    expect(signal.status).toBe('HEALTHY');
    expect(signal.latencyMs).toBeGreaterThanOrEqual(0);
    expect(signal.timestamp).toBeInstanceOf(Date);

    const signals = collector.getHealthSignals();
    expect(signals.DATABASE?.status).toBe('HEALTHY');
  });

  it('detects database failure and returns UNHEALTHY status with sanitized error', async () => {
    const brokenTxs = {
      async run() {
        throw new Error('FATAL: password authentication failed for user "eventlens" on host postgres:5432');
      }
    };

    const collector = new NeutralTelemetryCollector();
    const service = new TelemetryService(collector);

    const brokenChecker = TelemetryService.createDatabaseHealthChecker(brokenTxs as any);
    service.registerHealthChecker(brokenChecker);

    const signal = await service.checkComponentHealth('DATABASE');

    expect(signal.component).toBe('DATABASE');
    expect(signal.status).toBe('UNHEALTHY');
    expect(signal.message).toContain('Health check failed: FATAL');
    expect(signal.message).not.toContain('password authentication'); // sanitized
  });
});
