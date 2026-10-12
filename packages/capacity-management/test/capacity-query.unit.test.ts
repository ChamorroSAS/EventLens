import { describe, expect, it, beforeEach } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  CapacityPlanService,
  CapacityReservationService,
  CapacityQueryService,
  DEFAULT_PLAN_CODE,
  CapacityError,
} from '../src/index.js';

interface InMemoryDb {
  plans: Map<string, any>;
  assignments: Map<string, any>;
  overrides: Map<string, any>;
  reservations: Map<string, any>;
  balances: Map<string, any>;
}

function createFakeDb(): InMemoryDb {
  const db: InMemoryDb = {
    plans: new Map(),
    assignments: new Map(),
    overrides: new Map(),
    reservations: new Map(),
    balances: new Map(),
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

          return [] as R[];
        },
      };

      return fn(tx);
    },
  };
}

describe('CapacityQueryService (Unit Tests — EL-TK-135)', () => {
  let db: InMemoryDb;
  let txRunner: TransactionRunner;
  let planService: CapacityPlanService;
  let service: CapacityQueryService;

  const eventId = '11111111-1111-1111-1111-111111111111';
  const organizerId = 'org-owner-99';

  beforeEach(() => {
    db = createFakeDb();
    txRunner = createFakeTransactionRunner(db);
    planService = new CapacityPlanService(txRunner);

    // Mock verifier de ownership
    const ownershipVerifier = async (evId: string, orgId: string) => {
      return evId === eventId && orgId === organizerId;
    };

    service = new CapacityQueryService(txRunner, planService, ownershipVerifier);
  });

  it('Escenario 1: Dado evento con originales y reservas, devuelve consumo, reservas y disponible consistentes', async () => {
    // Simular consumo confirmado: 4 GB (4_000_000_000 bytes), 400 archivos
    db.balances.set(eventId, {
      event_id: eventId,
      consumed_bytes: 4000000000n,
      consumed_files: 400,
    });

    // Simular reserva activa en tránsito: 1 GB (1_000_000_000 bytes), 50 archivos
    db.reservations.set('res-01', {
      event_id: eventId,
      bytes: 1000000000n,
      file_slots: 50,
      status: 'ACTIVE',
    });

    const summary = await service.queryCommercialCapacity({
      eventId,
      actorContext: {
        actorType: 'ORGANIZER_HUMAN',
        accountId: organizerId,
      } as any,
    });

    expect(summary.eventId).toBe(eventId);
    // Consumo confirmado
    expect(summary.consumedStorage.bytes).toBe(4000000000n);
    expect(summary.consumedStorage.gigabytes).toBe(4);
    expect(summary.consumedStorage.files).toBe(400);

    // Reservas activas
    expect(summary.activeReservations.bytes).toBe(1000000000n);
    expect(summary.activeReservations.gigabytes).toBe(1);
    expect(summary.activeReservations.files).toBe(50);

    // Disponible: Total 10 GB - (4 GB + 1 GB) = 5 GB
    expect(summary.available.bytes).toBe(5000000000n);
    expect(summary.available.gigabytes).toBe(5);
    expect(summary.available.files).toBe(550); // 1000 - 450

    // Porcentaje de uso: 50%
    expect(summary.usagePercentage.storagePercent).toBe(50);
    expect(summary.usagePercentage.filesPercent).toBe(45);

    // Banderas
    expect(summary.flags.isZeroUsage).toBe(false);
    expect(summary.flags.isOverStorageQuota).toBe(false);
    expect(summary.flags.isNearStorageLimit).toBe(false);
  });

  it('Escenario 2: Dado consumo es cero, distingue cero real de error/carga pendiente', async () => {
    // Evento recién creado sin consumo ni reservas
    const summary = await service.queryCommercialCapacity({
      eventId,
      actorContext: {
        actorType: 'ORGANIZER_HUMAN',
        accountId: organizerId,
      } as any,
    });

    expect(summary.consumedStorage.bytes).toBe(0n);
    expect(summary.consumedStorage.files).toBe(0);
    expect(summary.activeReservations.bytes).toBe(0n);
    expect(summary.activeReservations.files).toBe(0);

    // Disponible total
    expect(summary.available.bytes).toBe(10000000000n);
    expect(summary.available.files).toBe(1000);

    // Bandera explícita de cero real
    expect(summary.flags.isZeroUsage).toBe(true);
    expect(summary.flags.isOverStorageQuota).toBe(false);
  });

  it('Escenario 3: Dado que uso+reservas supera el límite (sobre-cuota), muestra valores reales y disponible cero sin borrar archivos', async () => {
    // Supongamos que el evento tiene 12 GB consumidos (sobrepasando el límite de 10 GB)
    db.balances.set(eventId, {
      event_id: eventId,
      consumed_bytes: 12000000000n,
      consumed_files: 1100,
    });

    const summary = await service.queryCommercialCapacity({
      eventId,
      actorContext: {
        actorType: 'ADMIN_HUMAN',
        adminId: 'admin-01',
      } as any,
    });

    // Muestra el consumo REAL sin truncarlo a 10 GB
    expect(summary.consumedStorage.bytes).toBe(12000000000n);
    expect(summary.consumedStorage.gigabytes).toBe(12);
    expect(summary.consumedStorage.files).toBe(1100);

    // Capacidad disponible queda exactamente en 0 (no números negativos)
    expect(summary.available.bytes).toBe(0n);
    expect(summary.available.files).toBe(0);

    // Porcentaje > 100%
    expect(summary.usagePercentage.storagePercent).toBe(120);
    expect(summary.usagePercentage.filesPercent).toBe(110);

    // Banderas de sobre-cuota activas
    expect(summary.flags.isOverStorageQuota).toBe(true);
    expect(summary.flags.isOverFilesQuota).toBe(true);
    expect(summary.flags.isNearStorageLimit).toBe(true);
  });

  it('deniega acceso si un organizador no es dueño del evento (aislamiento multitenant)', async () => {
    await expect(
      service.queryCommercialCapacity({
        eventId,
        actorContext: {
          actorType: 'ORGANIZER_HUMAN',
          accountId: 'otro-organizador-malicioso',
        } as any,
      })
    ).rejects.toThrowError(CapacityError);
  });
});
