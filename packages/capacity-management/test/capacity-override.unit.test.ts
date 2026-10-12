import { describe, expect, it, beforeEach } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import type { AdminActorContext, OrganizerActorContext } from '@eventlens/identity';
import {
  CapacityError,
  CapacityPlanService,
  CapacityQueryService,
  DEFAULT_PLAN_CODE,
} from '../src/index.js';

interface InMemoryDb {
  plans: Map<string, any>;
  assignments: Map<string, any>;
  overrides: Map<string, any>;
  balances: Map<string, any>;
  reservations: Map<string, any>;
  auditEvents: any[];
}

function createFakeDb(): InMemoryDb {
  const db: InMemoryDb = {
    plans: new Map(),
    assignments: new Map(),
    overrides: new Map(),
    balances: new Map(),
    reservations: new Map(),
    auditEvents: [],
  };

  db.plans.set(DEFAULT_PLAN_CODE, {
    id: '00000000-0000-0000-0000-000000000001',
    code: DEFAULT_PLAN_CODE,
    name: 'Plan BETA EventLens',
    storage_bytes: 10_000_000_000n, // 10 GB
    max_files: 1000,
    max_photo_bytes: 25_000_000n,
    max_video_bytes: 500_000_000n,
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
          if (sql.includes('FROM plan_override') && sql.includes("status = 'ACTIVE'")) {
            const eventId = params[0] as string;
            const active = Array.from(db.overrides.values()).filter(
              (o) => o.event_id === eventId && o.status === 'ACTIVE'
            );
            return active as R[];
          }
          if (sql.includes('FROM event_capacity_balance') && sql.includes('WHERE event_id = $1')) {
            const eventId = params[0] as string;
            const bal = db.balances.get(eventId);
            return (bal ? [bal] : [{ consumed_bytes: 0n, consumed_files: 0 }]) as R[];
          }
          if (sql.includes('FROM capacity_reservation') && sql.includes("status = 'ACTIVE'")) {
            const eventId = params[0] as string;
            const activeRes = Array.from(db.reservations.values()).filter(
              (r) => r.event_id === eventId && r.status === 'ACTIVE'
            );
            const totalBytes = activeRes.reduce((acc, r) => acc + BigInt(r.bytes), 0n);
            const totalFiles = activeRes.reduce((acc, r) => acc + Number(r.file_slots), 0);
            return [{ active_bytes: totalBytes, active_files: totalFiles }] as R[];
          }
          return [] as R[];
        },
        async execute(sql: string, ...params: unknown[]): Promise<number> {
          if (sql.includes('INSERT INTO plan_assignment')) {
            const [id, eventId, planId, status, assignedAt] = params as [string, string, string, string, Date];
            db.assignments.set(eventId, {
              id,
              event_id: eventId,
              plan_id: planId,
              status,
              assigned_at: assignedAt,
              created_at: assignedAt,
              updated_at: assignedAt,
            });
            return 1;
          }
          if (sql.includes('UPDATE plan_override') && sql.includes("status = 'REMOVED'")) {
            const [removedAt, eventId] = params as [Date, string];
            for (const o of db.overrides.values()) {
              if (o.event_id === eventId && o.status === 'ACTIVE') {
                o.status = 'REMOVED';
                o.removed_at = removedAt;
                o.updated_at = removedAt;
              }
            }
            return 1;
          }
          if (sql.includes('INSERT INTO plan_override')) {
            const [id, eventId, storageBytes, maxFiles, retentionDays, reason, authorizedBy, createdAt] =
              params as [string, string, string | null, number | null, number | null, string, string, Date];
            db.overrides.set(id, {
              id,
              event_id: eventId,
              storage_bytes: storageBytes,
              max_files: maxFiles,
              retention_days: retentionDays,
              reason,
              authorized_by: authorizedBy,
              status: 'ACTIVE',
              created_at: createdAt,
              removed_at: null,
              updated_at: createdAt,
            });
            return 1;
          }
          if (sql.includes('INSERT INTO admin_audit_event')) {
            const [id, proc, actorId, targetId, details, ts] = params as [string, string, string, string, string, Date];
            db.auditEvents.push({ id, proc, actorId, targetId, details, ts });
            return 1;
          }
          return 0;
        },
      } as unknown as SqlTransaction;
      return fn(tx);
    },
  };
}

describe('EL-TK-142: Aplicar overrides administrativos y retorno al plan base', () => {
  let db: InMemoryDb;
  let service: CapacityPlanService;
  const eventId = '11111111-2222-3333-4444-555555555555';

  const adminActor: AdminActorContext = {
    actorType: 'ADMIN_HUMAN',
    principalId: 'admin-principal-99',
  };

  const organizerActor: OrganizerActorContext = {
    actorType: 'ORGANIZER_HUMAN',
    accountId: 'organizer-account-1',
  };

  beforeEach(() => {
    db = createFakeDb();
    service = new CapacityPlanService(createFakeTransactionRunner(db));
  });

  describe('Escenario 1: Override válido recalcula límites efectivos y audita actor/motivo', () => {
    it('aplica storage total y vigencia total con motivo obligatorio', async () => {
      const result = await service.applyOverride({
        eventId,
        actorContext: adminActor,
        storageBytes: 50_000_000_000n, // 50 GB
        retentionDays: 60, // 60 días
        reason: 'Ampliación solicitada y justificada para evento corporativo',
      });

      expect(result.override.id).toBeDefined();
      expect(result.override.storageBytes).toBe(50_000_000_000n);
      expect(result.override.retentionDays).toBe(60);
      expect(result.override.reason).toBe('Ampliación solicitada y justificada para evento corporativo');
      expect(result.override.authorizedBy).toBe('admin-principal-99');

      // Límites efectivos actualizados
      expect(result.effectiveLimits.storageBytes).toBe(50_000_000_000n);
      expect(result.effectiveLimits.retentionDays).toBe(60);
      expect(result.effectiveLimits.isOverrideActive).toBe(true);

      // Auditoría registrada
      expect(db.auditEvents).toHaveLength(1);
      expect(db.auditEvents[0].actorId).toBe('admin-principal-99');
      expect(db.auditEvents[0].proc).toBe('PLAN_OVERRIDE_APPLIED');
    });
  });

  describe('Escenario 2: Reducción bajo consumo conserva archivos y bloquea nuevas autorizaciones', () => {
    it('reduce límites efectivos sin eliminar contenido ni alterar balances (DEC-080)', async () => {
      // Simular consumo existente de 8 GB (8_000_000_000 bytes)
      db.balances.set(eventId, {
        consumed_bytes: 8_000_000_000n,
        consumed_files: 300,
      });

      // Admin aplica reducción drástica a 5 GB (por debajo del consumo de 8 GB)
      const result = await service.applyOverride({
        eventId,
        actorContext: adminActor,
        storageBytes: 5_000_000_000n,
        reason: 'Ajuste administrativo restrictivo',
      });

      // El límite se reduce
      expect(result.effectiveLimits.storageBytes).toBe(5_000_000_000n);

      // Los archivos y el balance permanecen intactos (DEC-080)
      const balance = db.balances.get(eventId);
      expect(balance.consumed_bytes).toBe(8_000_000_000n);

      // Comprobar con CapacityQueryService que el estado comercial refleja over-quota sin crash
      const queryService = new CapacityQueryService(createFakeTransactionRunner(db), service);
      const summary = await queryService.queryCommercialCapacity({
        eventId,
        actorContext: adminActor,
      });

      expect(summary.flags.isOverStorageQuota).toBe(true);
      expect(summary.available.bytes).toBe(0n); // Bloquea nuevas autorizaciones
      expect(summary.consumedStorage.bytes).toBe(8_000_000_000n);
    });
  });

  describe('Escenario 3: Rechazo de reducciones de vigencia que dejen vencimiento en el pasado (DEC-102)', () => {
    it('deniega applyOverride cuando el vencimiento resultante cae en el pasado para evento ACTIVE', async () => {
      const now = new Date('2026-10-15T12:00:00Z');
      // Ancla hace 40 días
      const eventAnchorDate = new Date('2026-09-05T12:00:00Z');

      // Intentar fijar vigencia de 20 días: ancla (hace 40d) + 20d = hace 20d (en el pasado)
      await expect(
        service.applyOverride({
          eventId,
          actorContext: adminActor,
          retentionDays: 20,
          eventStatus: 'ACTIVE',
          eventAnchorDate,
          now,
          reason: 'Intento de reducción retroactiva',
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: 'CANNOT_REDUCE_BELOW_PAST_EXPIRATION',
        })
      );
    });

    it('deniega removeOverride cuando retornar al plan base deja vencimiento en el pasado para evento ACTIVE', async () => {
      const now = new Date('2026-10-15T12:00:00Z');
      // Ancla hace 35 días
      const eventAnchorDate = new Date('2026-09-10T12:00:00Z');

      // Primero aplicar override activo de 60 días (válido, vence en 25 días futuros)
      await service.applyOverride({
        eventId,
        actorContext: adminActor,
        retentionDays: 60,
        eventStatus: 'ACTIVE',
        eventAnchorDate,
        now,
        reason: 'Extensión temporal previa',
      });

      // Intentar remover override: plan base tiene 30 días -> ancla + 30d = hace 5 días (pasado)
      await expect(
        service.removeOverride({
          eventId,
          actorContext: adminActor,
          eventStatus: 'ACTIVE',
          eventAnchorDate,
          now,
          reason: 'Intento de retorno a base que viola DEC-102',
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: 'CANNOT_REDUCE_BELOW_PAST_EXPIRATION',
        })
      );
    });

    it('permite removeOverride si el vencimiento base permanece en el futuro', async () => {
      const now = new Date('2026-10-15T12:00:00Z');
      // Ancla hace 5 días
      const eventAnchorDate = new Date('2026-10-10T12:00:00Z');

      // Override previo de 60 días
      await service.applyOverride({
        eventId,
        actorContext: adminActor,
        retentionDays: 60,
        reason: 'Override previo',
      });

      // Retorno al plan base (30 días): ancla (hace 5d) + 30d = 25 días en el futuro (válido)
      const result = await service.removeOverride({
        eventId,
        actorContext: adminActor,
        eventStatus: 'ACTIVE',
        eventAnchorDate,
        now,
        reason: 'Retorno seguro a plan base',
      });

      expect(result.effectiveLimits.retentionDays).toBe(30);
      expect(result.effectiveLimits.isOverrideActive).toBe(false);
    });
  });

  describe('Permisos y validación de actor administrativo', () => {
    it('deniega si el llamador es un organizador (no admin)', async () => {
      await expect(
        service.applyOverride({
          eventId,
          actorContext: organizerActor as any,
          storageBytes: 20_000_000_000n,
          reason: 'Intento no autorizado',
        })
      ).rejects.toThrow('Only authorized administrators may apply plan overrides');
    });

    it('deniega removeOverride sin motivo obligatorio', async () => {
      await expect(
        service.removeOverride({
          eventId,
          actorContext: adminActor,
          reason: '   ',
        })
      ).rejects.toThrow('Mandatory reason is required');
    });
  });
});
