import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  CapacityPlanService,
  CapacityQueryService,
  CapacityThresholdService,
  DEFAULT_PLAN_CODE,
  UsageThresholdSignal,
} from '../src/index.js';

interface InMemoryDb {
  plans: Map<string, any>;
  assignments: Map<string, any>;
  overrides: Map<string, any>;
  reservations: Map<string, any>;
  balances: Map<string, any>;
  thresholdStates: Map<string, any>; // key: `${eventId}:${thresholdType}`
}

function createFakeDb(): InMemoryDb {
  const db: InMemoryDb = {
    plans: new Map(),
    assignments: new Map(),
    overrides: new Map(),
    reservations: new Map(),
    balances: new Map(),
    thresholdStates: new Map(),
  };

  db.plans.set(DEFAULT_PLAN_CODE, {
    id: '00000000-0000-0000-0000-000000000001',
    code: DEFAULT_PLAN_CODE,
    name: 'Plan BETA EventLens',
    storage_bytes: 10000000000n, // 10 GB
    max_files: 1000,
    max_photo_bytes: 25000000n,
    max_video_bytes: 500000000n,
    max_video_duration_seconds: 300,
    retention_days: 30,
    created_at: new Date(),
  });

  return db;
}

function createFakeTransactionRunner(db: InMemoryDb): TransactionRunner {
  return {
    async run<T>(fn: (tx: SqlTransaction) => Promise<T>): Promise<T> {
      const tx: SqlTransaction = {
        async execute(_sql: string, ..._params: unknown[]): Promise<number> {
          return 0;
        },
        async query<R = unknown>(sql: string, ...params: unknown[]): Promise<R[]> {
          // Plan queries
          if (sql.includes('FROM plan') && sql.includes('WHERE code = $1')) {
            const code = params[0] as string;
            const plan = db.plans.get(code);
            return (plan ? [plan] : []) as R[];
          }
          if (sql.includes('FROM plan') && sql.includes('WHERE id = $1')) {
            const id = params[0] as string;
            const plan = Array.from(db.plans.values()).find((p) => p.id === id);
            return (plan ? [plan] : []) as R[];
          }

          // Assignment queries
          if (sql.includes('FROM plan_assignment') && sql.includes('WHERE event_id = $1')) {
            const eventId = params[0] as string;
            const assignment = db.assignments.get(eventId);
            return (assignment ? [assignment] : []) as R[];
          }
          if (sql.includes('INSERT INTO plan_assignment')) {
            const [id, eventId, planId, status, assignedAt] = params as [string, string, string, string, Date];
            const assignment = { id, event_id: eventId, plan_id: planId, status, assigned_at: assignedAt };
            db.assignments.set(eventId, assignment);
            return [assignment] as R[];
          }

          // Override queries
          if (sql.includes('FROM plan_override') && sql.includes('WHERE event_id = $1 AND status = $2')) {
            const eventId = params[0] as string;
            const status = params[1] as string;
            const overrides = Array.from(db.overrides.values()).filter(
              (o) => o.event_id === eventId && o.status === status
            );
            return overrides as R[];
          }

          // Balance queries
          if (sql.includes('FROM event_capacity_balance') && sql.includes('WHERE event_id = $1')) {
            const eventId = params[0] as string;
            const balance = db.balances.get(eventId);
            return (balance ? [balance] : []) as R[];
          }

          // Reservations sum query
          if (sql.includes('FROM capacity_reservation') && sql.includes("status = 'ACTIVE'")) {
            const eventId = params[0] as string;
            const active = Array.from(db.reservations.values()).filter(
              (r) => r.event_id === eventId && r.status === 'ACTIVE'
            );
            const sumBytes = active.reduce((acc, r) => acc + BigInt(r.bytes), 0n);
            const sumFiles = active.reduce((acc, r) => acc + r.file_slots, 0);
            return [{ active_bytes: sumBytes, active_files: sumFiles }] as R[];
          }

          // Threshold state queries
          if (sql.includes('FROM capacity_threshold_state') && sql.includes('WHERE event_id = $1')) {
            const eventId = params[0] as string;
            const rows = Array.from(db.thresholdStates.values()).filter((r) => r.event_id === eventId);
            return rows as R[];
          }
          if (sql.includes('INSERT INTO capacity_threshold_state')) {
            const [id, eventId, thresholdType, currentValuePct, now, dedupKey] = params as [
              string, string, string, number, Date, string
            ];
            const key = `${eventId}:${thresholdType}`;
            const row = {
              id,
              event_id: eventId,
              threshold_type: thresholdType,
              status: 'TRIGGERED',
              last_value_pct: currentValuePct,
              last_triggered_at: now,
              last_rearmed_at: null,
              dedup_key: dedupKey,
              created_at: now,
              updated_at: now,
            };
            db.thresholdStates.set(key, row);
            return [row] as R[];
          }
          if (sql.includes('UPDATE capacity_threshold_state') && sql.includes("SET status = 'TRIGGERED'")) {
            const [id, currentValuePct, now, dedupKey] = params as [string, number, Date, string];
            const row = Array.from(db.thresholdStates.values()).find((r) => r.id === id);
            if (row) {
              row.status = 'TRIGGERED';
              row.last_value_pct = currentValuePct;
              row.last_triggered_at = now;
              row.dedup_key = dedupKey;
              row.updated_at = now;
            }
            return (row ? [row] : []) as R[];
          }
          if (sql.includes('UPDATE capacity_threshold_state') && sql.includes("SET status = 'ARMED'")) {
            const [id, currentValuePct, now] = params as [string, number, Date];
            const row = Array.from(db.thresholdStates.values()).find((r) => r.id === id);
            if (row) {
              row.status = 'ARMED';
              row.last_value_pct = currentValuePct;
              row.last_rearmed_at = now;
              row.updated_at = now;
            }
            return (row ? [row] : []) as R[];
          }

          return [] as R[];
        },
      };

      return fn(tx);
    },
  };
}

describe('CapacityThresholdService (Unit Tests — EL-TK-138)', () => {
  let db: InMemoryDb;
  let txRunner: TransactionRunner;
  let planService: CapacityPlanService;
  let queryService: CapacityQueryService;
  let service: CapacityThresholdService;
  let mockSink: { emitSignal: ReturnType<typeof vi.fn> };

  const eventId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    db = createFakeDb();
    txRunner = createFakeTransactionRunner(db);
    planService = new CapacityPlanService(txRunner);
    queryService = new CapacityQueryService(txRunner, planService);
    mockSink = { emitSignal: vi.fn(async () => {}) };
    service = new CapacityThresholdService(txRunner, queryService, mockSink);
  });

  it('Escenario 1: Dado el uso cruza 80%, emite una sola señal vigente de advertencia', async () => {
    // 8.5 GB de 10 GB consumidos (85%)
    db.balances.set(eventId, {
      event_id: eventId,
      consumed_bytes: 8500000000n,
      consumed_files: 850,
    });

    const result = await service.evaluateUsageThresholds({ eventId });

    expect(result.signalsEmitted.length).toBe(1);
    expect(result.signalsEmitted[0].thresholdType).toBe('USAGE_80');
    expect(result.signalsEmitted[0].thresholdPercent).toBe(80);
    expect(result.signalsEmitted[0].currentStoragePercent).toBe(85);
    expect(result.thresholdStates.usage80).toBe('TRIGGERED');
    expect(result.thresholdStates.usage100).toBe('ARMED');

    expect(mockSink.emitSignal).toHaveBeenCalledTimes(1);
  });

  it('Escenario 2: Dado refrescos repetidos que permanecen sobre 80%, no se emiten señales duplicadas', async () => {
    db.balances.set(eventId, {
      event_id: eventId,
      consumed_bytes: 8500000000n,
      consumed_files: 850,
    });

    // Primera evaluación: emite 1 señal
    const firstResult = await service.evaluateUsageThresholds({ eventId });
    expect(firstResult.signalsEmitted.length).toBe(1);

    // Segunda evaluación con el mismo o mayor porcentaje (ej. 88%): no vuelve a emitir
    db.balances.set(eventId, {
      event_id: eventId,
      consumed_bytes: 8800000000n,
      consumed_files: 880,
    });

    const secondResult = await service.evaluateUsageThresholds({ eventId });
    expect(secondResult.signalsEmitted.length).toBe(0); // Deduplicación estricta (no spam)
    expect(secondResult.thresholdStates.usage80).toBe('TRIGGERED');

    // Sink no fue llamado nuevamente
    expect(mockSink.emitSignal).toHaveBeenCalledTimes(1);
  });

  it('Escenario 3: Dado el uso alcanza 100%, emite señal de agotamiento independiente del 80%', async () => {
    // Primero cruza 80%
    db.balances.set(eventId, {
      event_id: eventId,
      consumed_bytes: 8500000000n,
      consumed_files: 850,
    });
    await service.evaluateUsageThresholds({ eventId });

    // Ahora cruza 100% (10 GB o más)
    db.balances.set(eventId, {
      event_id: eventId,
      consumed_bytes: 10000000000n,
      consumed_files: 1000,
    });

    const result = await service.evaluateUsageThresholds({ eventId });

    // Emite únicamente la señal independiente de 100% (porque 80% ya estaba en TRIGGERED)
    expect(result.signalsEmitted.length).toBe(1);
    expect(result.signalsEmitted[0].thresholdType).toBe('USAGE_100');
    expect(result.signalsEmitted[0].thresholdPercent).toBe(100);
    expect(result.thresholdStates.usage80).toBe('TRIGGERED');
    expect(result.thresholdStates.usage100).toBe('TRIGGERED');

    expect(mockSink.emitSignal).toHaveBeenCalledTimes(2); // 1 de 80% + 1 de 100%
  });

  it('Rearma umbrales cuando el consumo desciende por debajo de 80% (Histeresis/Rearm)', async () => {
    // 1. Cruza 80%
    db.balances.set(eventId, {
      event_id: eventId,
      consumed_bytes: 9000000000n,
      consumed_files: 900,
    });
    const res1 = await service.evaluateUsageThresholds({ eventId });
    expect(res1.signalsEmitted.length).toBe(1);
    expect(res1.thresholdStates.usage80).toBe('TRIGGERED');

    // 2. Tras una purga física, el consumo cae a 5 GB (50%)
    db.balances.set(eventId, {
      event_id: eventId,
      consumed_bytes: 5000000000n,
      consumed_files: 500,
    });
    const res2 = await service.evaluateUsageThresholds({ eventId });
    expect(res2.signalsEmitted.length).toBe(0);
    expect(res2.thresholdStates.usage80).toBe('ARMED'); // Rearmado

    // 3. El evento vuelve a subir a 8.2 GB (82%): emite nuevamente la señal
    db.balances.set(eventId, {
      event_id: eventId,
      consumed_bytes: 8200000000n,
      consumed_files: 820,
    });
    const res3 = await service.evaluateUsageThresholds({ eventId });
    expect(res3.signalsEmitted.length).toBe(1);
    expect(res3.signalsEmitted[0].thresholdType).toBe('USAGE_80');
    expect(res3.thresholdStates.usage80).toBe('TRIGGERED');
  });
});
