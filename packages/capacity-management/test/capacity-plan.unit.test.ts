import { describe, expect, it } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import type { AdminActorContext, OrganizerActorContext } from '@eventlens/identity';
import {
  CapacityError,
  CapacityPlanService,
  DEFAULT_PLAN_CODE
} from '../src/index.js';

interface InMemoryDb {
  plans: Map<string, any>;
  assignments: Map<string, any>;
  overrides: Map<string, any>;
  auditEvents: any[];
}

function createFakeDb(): InMemoryDb {
  const db: InMemoryDb = {
    plans: new Map(),
    assignments: new Map(),
    overrides: new Map(),
    auditEvents: []
  };

  // Seed default plan
  db.plans.set(DEFAULT_PLAN_CODE, {
    id: '00000000-0000-0000-0000-000000000001',
    code: DEFAULT_PLAN_CODE,
    name: 'Plan BETA EventLens',
    storage_bytes: 10000000000n,
    max_files: 1500,
    max_photo_bytes: 25000000n,
    max_video_bytes: 500000000n,
    max_video_duration_seconds: 300,
    retention_days: 30,
    created_at: new Date()
  });

  return db;
}

function createFakeTransactionRunner(db: InMemoryDb): TransactionRunner {
  return {
    async run<T>(fn: (tx: SqlTransaction) => Promise<T>): Promise<T> {
      const tx: SqlTransaction = {
        async query<R = unknown>(sql: string, ...params: unknown[]): Promise<R[]> {
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
          if (sql.includes('FROM plan_assignment') && sql.includes('WHERE event_id = $1')) {
            const eventId = params[0] as string;
            const assign = db.assignments.get(eventId);
            return (assign ? [assign] : []) as R[];
          }
          if (sql.includes('FROM plan_override') && sql.includes('WHERE event_id = $1')) {
            const eventId = params[0] as string;
            const list = Array.from(db.overrides.values())
              .filter((o) => o.event_id === eventId && o.status === 'ACTIVE')
              .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
            return list as R[];
          }
          return [] as R[];
        },
        async execute(sql: string, ...params: unknown[]): Promise<number> {
          const normalized = sql.replace(/\s+/g, ' ');
          if (normalized.includes('INSERT INTO plan_assignment')) {
            const [id, eventId, planId, status, assignedAt, createdAt, updatedAt] = params as any[];
            db.assignments.set(eventId, {
              id,
              event_id: eventId,
              plan_id: planId,
              status: 'ACTIVE',
              assigned_at: assignedAt,
              created_at: createdAt,
              updatedAt: updatedAt
            });
            return 1;
          }
          if (normalized.includes('UPDATE plan_assignment')) {
            const [planId, now, id] = params as any[];
            for (const [key, val] of db.assignments.entries()) {
              if (val.id === id) {
                val.plan_id = planId;
                val.assigned_at = now;
                val.updated_at = now;
              }
            }
            return 1;
          }
          if (normalized.includes('INSERT INTO plan_override')) {
            const [id, eventId, storageBytes, maxFiles, retentionDays, reason, authorizedBy, createdAt] = params as any[];
            db.overrides.set(id, {
              id,
              event_id: eventId,
              storage_bytes: storageBytes !== null ? BigInt(storageBytes) : null,
              max_files: maxFiles,
              retention_days: retentionDays,
              reason,
              authorized_by: authorizedBy,
              status: 'ACTIVE',
              created_at: createdAt,
              removed_at: null,
              updated_at: createdAt
            });
            return 1;
          }
          if (normalized.includes("UPDATE plan_override SET status = 'REMOVED'")) {
            const [now, eventId] = params as any[];
            for (const val of db.overrides.values()) {
              if (val.event_id === eventId && val.status === 'ACTIVE') {
                val.status = 'REMOVED';
                val.removed_at = now;
                val.updated_at = now;
              }
            }
            return 1;
          }
          if (normalized.includes('INSERT INTO admin_audit_event')) {
            db.auditEvents.push(params);
            return 1;
          }
          return 0;
        }
      };

      return fn(tx);
    }
  } as unknown as TransactionRunner;
}

const mockAdminActor: AdminActorContext = {
  actorType: 'ADMIN_HUMAN',
  principalId: '11111111-1111-1111-1111-111111111111',
  identifier: 'admin@eventlens.test',
  sessionId: 'sess-123',
  authTime: new Date(),
  credentialRevision: 1n,
  adminAuthRevision: 1n,
  sessionWatermark: 1n,
  recoveryEpoch: 1n
};

const mockOrganizerActor: OrganizerActorContext = {
  actorType: 'ORGANIZER_HUMAN',
  accountId: '22222222-2222-2222-2222-222222222222',
  email: 'organizer@eventlens.test',
  sessionId: 'sess-456',
  authTime: new Date(),
  credentialRevision: 1n,
  sessionWatermark: 1n,
  recoveryEpoch: 1n
};

describe('CapacityPlanService (Unit Tests)', () => {
  it('Escenario 1: resuelve exactamente el plan BETA base cuando no hay overrides', async () => {
    const db = createFakeDb();
    const service = new CapacityPlanService(createFakeTransactionRunner(db));
    const eventId = '33333333-3333-3333-3333-333333333333';

    const limits = await service.resolveEffectiveLimits({
      eventId,
      actorContext: mockOrganizerActor
    });

    expect(limits.eventId).toBe(eventId);
    expect(limits.planCode).toBe(DEFAULT_PLAN_CODE);
    expect(limits.storageBytes).toBe(10_000_000_000n); // 10 GB decimales (DEC-079)
    expect(limits.maxFiles).toBe(1500); // 1500 archivos (DEC-011)
    expect(limits.maxPhotoBytes).toBe(25_000_000n); // 25 MB
    expect(limits.maxVideoBytes).toBe(500_000_000n); // 500 MB
    expect(limits.maxVideoDurationSeconds).toBe(300); // 5 min
    expect(limits.retentionDays).toBe(30); // 30 días
    expect(limits.isOverrideActive).toBe(false);
    expect(limits.activeOverrideId).toBeNull();
  });

  it('Escenario 2: aplica un override autorizado sin mutar el plan base', async () => {
    const db = createFakeDb();
    const service = new CapacityPlanService(createFakeTransactionRunner(db));
    const eventId = '44444444-4444-4444-4444-444444444444';

    // Apply administrative override: 20 GB decimales y 2500 archivos
    const { override, effectiveLimits } = await service.applyOverride({
      eventId,
      actorContext: mockAdminActor,
      storageBytes: 20_000_000_000n,
      maxFiles: 2500,
      reason: 'Evento masivo corporativo autorizado'
    });

    expect(override.status).toBe('ACTIVE');
    expect(override.reason).toBe('Evento masivo corporativo autorizado');

    // Límites efectivos reflejan el override
    expect(effectiveLimits.storageBytes).toBe(20_000_000_000n);
    expect(effectiveLimits.maxFiles).toBe(2500);
    expect(effectiveLimits.retentionDays).toBe(30); // Base se mantiene
    expect(effectiveLimits.isOverrideActive).toBe(true);
    expect(effectiveLimits.activeOverrideId).toBe(override.id);

    // Plan base no ha mutado
    const basePlan = db.plans.get(DEFAULT_PLAN_CODE);
    expect(basePlan.storage_bytes).toBe(10_000_000_000n);
    expect(basePlan.max_files).toBe(1500);
  });

  it('Escenario 3: retirar override vuelve al plan base', async () => {
    const db = createFakeDb();
    const service = new CapacityPlanService(createFakeTransactionRunner(db));
    const eventId = '55555555-5555-5555-5555-555555555555';

    await service.applyOverride({
      eventId,
      actorContext: mockAdminActor,
      storageBytes: 30_000_000_000n,
      reason: 'Prueba override temporal'
    });

    const { effectiveLimits } = await service.removeOverride({
      eventId,
      actorContext: mockAdminActor,
      reason: 'Fin del periodo especial'
    });

    expect(effectiveLimits.storageBytes).toBe(10_000_000_000n);
    expect(effectiveLimits.isOverrideActive).toBe(false);
    expect(effectiveLimits.activeOverrideId).toBeNull();
  });

  it('Escenario 4 (DEC-102): bloquea retorno al plan base después de ACTIVE si deja vencimiento en el pasado', async () => {
    const db = createFakeDb();
    const service = new CapacityPlanService(createFakeTransactionRunner(db));
    const eventId = '66666666-6666-6666-6666-666666666666';

    const now = new Date('2026-10-15T12:00:00Z');
    // Evento anclado hace 40 días
    const eventAnchorDate = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);

    // Tiene override de 60 días de vigencia (su vencimiento actual es dentro de 20 días)
    await service.applyOverride({
      eventId,
      actorContext: mockAdminActor,
      retentionDays: 60,
      reason: 'Ampliacion de vigencia temporal'
    });

    // Intentar volver al plan base (30 días) dejaría vencimiento en: ancla + 30 días = hace 10 días (pasado)
    await expect(
      service.removeOverride({
        eventId,
        actorContext: mockAdminActor,
        eventStatus: 'ACTIVE',
        eventAnchorDate,
        now,
        reason: 'Intento de reversion al plan base'
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'CANNOT_REDUCE_BELOW_PAST_EXPIRATION'
      })
    );
  });

  it('Escenario 5: valida permisos administrativos para mutaciones de override', async () => {
    const db = createFakeDb();
    const service = new CapacityPlanService(createFakeTransactionRunner(db));
    const eventId = '77777777-7777-7777-7777-777777777777';

    // Organizador intenta aplicar override
    await expect(
      service.applyOverride({
        eventId,
        actorContext: mockOrganizerActor as any,
        storageBytes: 50_000_000_000n,
        reason: 'Auto-elevacion'
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'UNAUTHORIZED'
      })
    );

    // Sin motivo obligatorio
    await expect(
      service.applyOverride({
        eventId,
        actorContext: mockAdminActor,
        storageBytes: 50_000_000_000n,
        reason: '   '
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'INVALID_ARGUMENT'
      })
    );
  });

  it('Escenario 6: aislamiento de límites entre eventos distintos', async () => {
    const db = createFakeDb();
    const service = new CapacityPlanService(createFakeTransactionRunner(db));
    const eventA = '88888888-8888-8888-8888-888888888888';
    const eventB = '99999999-9999-9999-9999-999999999999';

    // Override en A
    await service.applyOverride({
      eventId: eventA,
      actorContext: mockAdminActor,
      storageBytes: 50_000_000_000n,
      reason: 'Evento A especial'
    });

    const limitsA = await service.resolveEffectiveLimits({ eventId: eventA });
    const limitsB = await service.resolveEffectiveLimits({ eventId: eventB });

    expect(limitsA.storageBytes).toBe(50_000_000_000n);
    expect(limitsA.isOverrideActive).toBe(true);

    expect(limitsB.storageBytes).toBe(10_000_000_000n);
    expect(limitsB.isOverrideActive).toBe(false);
  });
});
