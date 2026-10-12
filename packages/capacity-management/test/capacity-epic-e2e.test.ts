import { describe, expect, it, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  CapacityPlanService,
  CapacityReservationService,
  MediaConsumptionService,
  CapacityQueryService,
  CapacityThresholdService,
  ExtensionRequestService,
  CapacityError,
  CapacityActorContext,
  DEFAULT_PLAN_CODE,
  UsageThresholdSignal,
} from '../src/index.js';

interface InMemoryE2eDb {
  plans: Map<string, any>;
  assignments: Map<string, any>;
  overrides: Map<string, any>;
  reservations: Map<string, any>;
  balances: Map<string, any>;
  ledgers: Map<string, any>;
  receipts: Map<string, any>;
  thresholdStates: Map<string, any>;
  extensionRequests: Map<string, any>;
  extensionMessages: any[];
  events: Map<string, any>;
}

function createE2eDb(): InMemoryE2eDb {
  const db: InMemoryE2eDb = {
    plans: new Map(),
    assignments: new Map(),
    overrides: new Map(),
    reservations: new Map(),
    balances: new Map(),
    ledgers: new Map(),
    receipts: new Map(),
    thresholdStates: new Map(),
    extensionRequests: new Map(),
    extensionMessages: [],
    events: new Map(),
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

function createE2eTransactionRunner(db: InMemoryE2eDb): TransactionRunner {
  return {
    async run<T>(fn: (tx: SqlTransaction) => Promise<T>): Promise<T> {
      const tx: SqlTransaction = {
        async execute(sql: string, ...params: unknown[]): Promise<number> {
          const res = await (this.query(sql, ...params));
          return Array.isArray(res) ? res.length : 1;
        },

        async query<R = unknown>(sql: string, ...params: unknown[]): Promise<R[]> {
          const p = params.length === 1 && Array.isArray(params[0]) ? (params[0] as unknown[]) : params;

          // 1. Plan queries
          if (sql.includes('FROM plan') && sql.includes('WHERE code = $1')) {
            const code = p[0] as string;
            const plan = db.plans.get(code);
            return (plan ? [plan] : []) as R[];
          }
          if (sql.includes('FROM plan') && sql.includes('WHERE id = $1')) {
            const id = p[0] as string;
            const plan = Array.from(db.plans.values()).find((p) => p.id === id);
            return (plan ? [plan] : []) as R[];
          }

          // 2. Plan Assignment queries
          if (sql.includes('FROM plan_assignment') && sql.includes('WHERE event_id = $1')) {
            const eventId = p[0] as string;
            const assign = db.assignments.get(eventId);
            return (assign ? [assign] : []) as R[];
          }
          if (sql.includes('INSERT INTO plan_assignment')) {
            const assign = {
              id: p[0],
              event_id: p[1],
              plan_id: p[2],
              status: 'ACTIVE',
              assigned_at: p[3],
              created_at: p[3],
              updated_at: p[3],
            };
            db.assignments.set(p[1] as string, assign);
            return [] as R[];
          }

          // 3. Plan Override queries
          if (sql.includes('FROM plan_override') && sql.includes('WHERE event_id = $1')) {
            const eventId = p[0] as string;
            const overrides = Array.from(db.overrides.values()).filter(
              (o) => o.event_id === eventId && o.status === 'ACTIVE'
            );
            return overrides as R[];
          }
          if (sql.includes('INSERT INTO plan_override')) {
            const override = {
              id: p[0],
              event_id: p[1],
              storage_bytes: p[2] !== null && p[2] !== undefined ? BigInt(p[2] as any) : null,
              max_files: p[3] !== null && p[3] !== undefined ? Number(p[3]) : null,
              retention_days: p[4] !== null && p[4] !== undefined ? Number(p[4]) : null,
              reason: p[5],
              authorized_by: p[6],
              status: 'ACTIVE',
              created_at: p[7],
              removed_at: null,
              updated_at: p[7],
            };
            db.overrides.set(override.id as string, override);
            return [override] as R[];
          }
          if (sql.includes('UPDATE plan_override') && sql.includes("SET status = 'REMOVED'")) {
            const [now, eventId] = p as [Date, string];
            let count = 0;
            for (const ov of db.overrides.values()) {
              if (ov.event_id === eventId && ov.status === 'ACTIVE') {
                ov.status = 'REMOVED';
                ov.removed_at = now;
                ov.updated_at = now;
                count++;
              }
            }
            return [{ count }] as R[];
          }

          // 4. Lifecycle Event queries (para DEC-102 guard)
          if (sql.includes('FROM event') && sql.includes('WHERE id = $1')) {
            const eventId = p[0] as string;
            const ev = db.events.get(eventId);
            return (ev ? [ev] : []) as R[];
          }

          // 5. Balance queries (event_capacity_balance)
          if (sql.includes('INSERT INTO event_capacity_balance')) {
            const eventId = p[0] as string;
            if (!db.balances.has(eventId)) {
              db.balances.set(eventId, {
                event_id: eventId,
                consumed_bytes: 0n,
                consumed_files: 0,
                created_at: new Date(),
                updated_at: new Date(),
              });
            }
            return [] as R[];
          }
          if (sql.includes('FROM event_capacity_balance') && sql.includes('WHERE event_id = $1')) {
            const eventId = p[0] as string;
            const balance = db.balances.get(eventId) ?? {
              event_id: eventId,
              consumed_bytes: 0n,
              consumed_files: 0,
              created_at: new Date(),
              updated_at: new Date(),
            };
            return [balance] as R[];
          }
          if (sql.includes('UPDATE event_capacity_balance')) {
            const eventId = p[0] as string;
            const addBytes = BigInt(p[1] as any);
            const addFiles = Number(p[2]);
            const bal = db.balances.get(eventId) ?? {
              event_id: eventId,
              consumed_bytes: 0n,
              consumed_files: 0,
              created_at: new Date(),
              updated_at: new Date(),
            };
            bal.consumed_bytes = BigInt(bal.consumed_bytes) + addBytes;
            bal.consumed_files = Number(bal.consumed_files) + addFiles;
            bal.updated_at = p[3] as Date;
            db.balances.set(eventId, bal);
            return [] as R[];
          }

          // 6. Reservation queries
          if (sql.includes('FROM capacity_reservation') && sql.includes('idempotency_key = $2')) {
            const [eventId, key] = p as [string, string];
            const res = Array.from(db.reservations.values()).find(
              (r) => r.event_id === eventId && r.idempotency_key === key
            );
            return (res ? [res] : []) as R[];
          }
          if (sql.includes('FROM capacity_reservation') && sql.includes("status = 'ACTIVE'")) {
            const eventId = p[0] as string;
            const activeRes = Array.from(db.reservations.values()).filter(
              (r) => r.event_id === eventId && r.status === 'ACTIVE'
            );
            const totalBytes = activeRes.reduce((acc, r) => acc + BigInt(r.bytes), 0n);
            const totalFiles = activeRes.reduce((acc, r) => acc + Number(r.file_slots), 0);
            return [{ active_bytes: totalBytes, active_files: totalFiles }] as R[];
          }
          if (sql.includes('INSERT INTO capacity_reservation')) {
            const res = {
              id: p[0] as string,
              event_id: p[1] as string,
              idempotency_key: p[2] as string,
              bytes: BigInt(p[3] as any),
              file_slots: Number(p[4]),
              media_type: p[5] as string | null,
              status: 'ACTIVE',
              release_reason: null,
              created_at: p[6] as Date,
              released_at: null,
              committed_at: null,
              updated_at: p[6] as Date,
            };
            db.reservations.set(res.id, res);
            return [res] as R[];
          }
          if (sql.includes('FROM capacity_reservation') && sql.includes('WHERE id = $1')) {
            const resId = p[0] as string;
            const res = db.reservations.get(resId);
            return (res ? [res] : []) as R[];
          }
          if (sql.includes('UPDATE capacity_reservation') && sql.includes("status = 'COMMITTED'")) {
            const [id, now] = p as [string, Date];
            const rec = db.reservations.get(id);
            if (rec) {
              rec.status = 'COMMITTED';
              rec.committed_at = now;
              rec.updated_at = now;
            }
            return (rec ? [rec] : []) as R[];
          }
          if (sql.includes('UPDATE capacity_reservation') && sql.includes("status = 'RELEASED'")) {
            const [id, now, reason] = p as [string, Date, string];
            const rec = db.reservations.get(id);
            if (rec) {
              rec.status = 'RELEASED';
              rec.release_reason = reason;
              rec.released_at = now;
              rec.updated_at = now;
            }
            return (rec ? [rec] : []) as R[];
          }

          // 7. Ledger queries
          if (sql.includes('FROM media_consumption_ledger') && sql.includes('WHERE event_id = $1 AND media_id = $2')) {
            const [eventId, mediaId] = p as [string, string];
            const key = `${eventId}:${mediaId}`;
            const row = db.ledgers.get(key);
            return (row ? [row] : []) as R[];
          }
          if (sql.includes('INSERT INTO media_consumption_ledger')) {
            const [id, eventId, mediaId, reservationId, bytes, slots, opId, now] = p as [
              string, string, string, string, bigint, number, string, Date
            ];
            const key = `${eventId}:${mediaId}`;
            const row = {
              id,
              event_id: eventId,
              media_id: mediaId,
              reservation_id: reservationId,
              bytes: BigInt(bytes),
              file_slots: slots,
              operation_id: opId,
              status: 'ACCEPTED',
              created_at: now,
              purged_at: null,
              updated_at: now,
            };
            db.ledgers.set(key, row);
            return [row] as R[];
          }
          if (sql.includes('UPDATE media_consumption_ledger') && sql.includes("status = 'PURGED'")) {
            const [id, now] = p as [string, Date];
            const row = Array.from(db.ledgers.values()).find((l) => l.id === id);
            if (row) {
              row.status = 'PURGED';
              row.purged_at = now;
              row.updated_at = now;
            }
            return (row ? [row] : []) as R[];
          }

          // 8. Purge receipt queries
          if (sql.includes('FROM purge_release_receipt') && sql.includes('WHERE event_id = $1 AND purge_receipt_id = $2')) {
            const [eventId, purgeReceiptId] = p as [string, string];
            const key = `${eventId}:${purgeReceiptId}`;
            const row = db.receipts.get(key);
            return (row ? [row] : []) as R[];
          }
          if (sql.includes('INSERT INTO purge_release_receipt')) {
            const [id, eventId, mediaId, purgeReceiptId, bytes, slots, now] = p as [
              string, string, string, string, bigint, number, Date
            ];
            const key = `${eventId}:${purgeReceiptId}`;
            const row = {
              id,
              event_id: eventId,
              media_id: mediaId,
              purge_receipt_id: purgeReceiptId,
              released_bytes: BigInt(bytes),
              released_file_slots: slots,
              created_at: now,
            };
            db.receipts.set(key, row);
            return [row] as R[];
          }

          // 9. Threshold state queries
          if (sql.includes('FROM capacity_threshold_state') && sql.includes('WHERE event_id = $1')) {
            const eventId = p[0] as string;
            const rows = Array.from(db.thresholdStates.values()).filter((r) => r.event_id === eventId);
            return rows as R[];
          }
          if (sql.includes('INSERT INTO capacity_threshold_state')) {
            const [id, eventId, type, val, now, dedupKey] = p as [
              string, string, string, number, Date, string
            ];
            const key = `${eventId}:${type}`;
            const row = {
              id,
              event_id: eventId,
              threshold_type: type,
              status: 'TRIGGERED',
              last_value_pct: val,
              last_triggered_at: now,
              last_rearmed_at: null,
              dedup_key: dedupKey,
              created_at: now,
              updated_at: now,
            };
            db.thresholdStates.set(key, row);
            return [row] as R[];
          }
          if (sql.includes('UPDATE capacity_threshold_state') && sql.includes("status = 'TRIGGERED'")) {
            const [id, val, now, dedupKey] = p as [string, number, Date, string];
            const row = Array.from(db.thresholdStates.values()).find((r) => r.id === id);
            if (row) {
              row.status = 'TRIGGERED';
              row.last_value_pct = val;
              row.last_triggered_at = now;
              row.dedup_key = dedupKey;
              row.updated_at = now;
              return [row] as R[];
            }
            return [] as R[];
          }
          if (sql.includes('UPDATE capacity_threshold_state') && sql.includes("status = 'ARMED'")) {
            const [id, val, now] = p as [string, number, Date];
            const row = Array.from(db.thresholdStates.values()).find((r) => r.id === id);
            if (row) {
              row.status = 'ARMED';
              row.last_value_pct = val;
              row.last_rearmed_at = now;
              row.updated_at = now;
              return [row] as R[];
            }
            return [] as R[];
          }

          // 10. Extension messages queries (debe evaluarse ANTES de extension_request por colisión de prefijo)
          if (sql.includes('FROM extension_request_message') && sql.includes('WHERE request_id = $1')) {
            const reqId = p[0] as string;
            const msgs = db.extensionMessages.filter((m) => m.request_id === reqId);
            return msgs as R[];
          }
          if (sql.includes('INSERT INTO extension_request_message')) {
            const [id, reqId, role, authorId, type, content, now] = p as [
              string, string, string, string, string, string, Date
            ];
            const msg = {
              id,
              request_id: reqId,
              author_role: role,
              author_id: authorId,
              message_type: type,
              content,
              created_at: now,
            };
            db.extensionMessages.push(msg);
            return [msg] as R[];
          }

          // 11. Extension request queries
          if (sql.includes('FROM extension_request') && sql.includes("status IN ('PENDING_REVIEW', 'INFORMATION_REQUESTED')")) {
            const eventId = p[0] as string;
            const open = Array.from(db.extensionRequests.values()).filter(
              (r) => r.event_id === eventId && (r.status === 'PENDING_REVIEW' || r.status === 'INFORMATION_REQUESTED')
            );
            return open as R[];
          }
          if (sql.includes('FROM extension_request') && sql.includes('WHERE id = $1')) {
            const id = p[0] as string;
            const req = db.extensionRequests.get(id);
            return (req ? [req] : []) as R[];
          }
          if (sql.includes('INSERT INTO extension_request')) {
            const [id, eventId, reqBy, reqType, addGb, addDays, reason, now] = p as [
              string, string, string, string, number | null, number | null, string, Date
            ];
            const req = {
              id,
              event_id: eventId,
              requested_by: reqBy,
              request_type: reqType,
              additional_gb: addGb !== null && addGb !== undefined ? Number(addGb) : null,
              additional_days: addDays !== null && addDays !== undefined ? Number(addDays) : null,
              reason,
              status: 'PENDING_REVIEW',
              resolved_at: null,
              resolved_by: null,
              decision_reason: null,
              created_at: now,
              updated_at: now,
            };
            db.extensionRequests.set(id, req);
            return [req] as R[];
          }
          if (sql.includes('UPDATE extension_request')) {
            if (sql.includes("status = 'APPROVED'") || sql.includes("status = 'REJECTED'")) {
              const [now, adminId, decisionReason, id] = p;
              const req = db.extensionRequests.get(id as string);
              if (req) {
                req.status = sql.includes("status = 'APPROVED'") ? 'APPROVED' : 'REJECTED';
                req.resolved_at = now;
                req.resolved_by = adminId;
                req.decision_reason = decisionReason;
                req.updated_at = now;
                return [req] as R[];
              }
            } else if (sql.includes("status = 'INFORMATION_REQUESTED'")) {
              const [now, id] = p;
              const req = db.extensionRequests.get(id as string);
              if (req) {
                req.status = 'INFORMATION_REQUESTED';
                req.updated_at = now;
                return [req] as R[];
              }
            } else {
              const [now, id] = p;
              const req = db.extensionRequests.get(id as string);
              if (req) {
                req.status = 'PENDING_REVIEW';
                req.updated_at = now;
                return [req] as R[];
              }
            }
            return [] as R[];
          }

          return [] as R[];
        },
      };

      return fn(tx);
    },
  };
}

describe('End-to-End Capacity, Extensions & Commercial Overrides Suite (EL-TK-145 — EL-EP-011)', () => {
  let db: InMemoryE2eDb;
  let txRunner: TransactionRunner;
  let planService: CapacityPlanService;
  let reservationService: CapacityReservationService;
  let consumptionService: MediaConsumptionService;
  let queryService: CapacityQueryService;
  let thresholdSignals: UsageThresholdSignal[];
  let thresholdSink: { emitSignal: ReturnType<typeof vi.fn> };
  let thresholdService: CapacityThresholdService;
  let extensionService: ExtensionRequestService;

  const adminActor: CapacityActorContext = {
    actorType: 'ADMIN_HUMAN',
    principalId: 'adm-root-01',
    sessionId: 'sess-adm-01',
  };

  const organizerActor: CapacityActorContext = {
    actorType: 'ORGANIZER_HUMAN',
    accountId: 'org-user-99',
  };

  const eventId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    db = createE2eDb();
    txRunner = createE2eTransactionRunner(db);

    planService = new CapacityPlanService(txRunner);
    reservationService = new CapacityReservationService(txRunner, planService);
    consumptionService = new MediaConsumptionService(txRunner, reservationService);
    queryService = new CapacityQueryService(txRunner, planService);

    thresholdSignals = [];
    thresholdSink = {
      emitSignal: vi.fn(async (signal: UsageThresholdSignal) => {
        thresholdSignals.push(signal);
      }),
    };
    thresholdService = new CapacityThresholdService(txRunner, queryService, thresholdSink);
    extensionService = new ExtensionRequestService(txRunner, undefined, planService);
  });

  describe('Escenario 1: Carreras concurrentes de reservas al límite comercial (Q-011, DEC-079, DEC-080)', () => {
    it('garantiza que dos uploads compitiendo al límite no sobre-asignan la cuota efectiva', async () => {
      // 1. Plan base efectivo: 10 GB (10,000,000,000 bytes) y 1000 archivos
      // Configuramos consumo previo para que solo queden 20 MB libres
      const remainingBytes = 20_000_000n; // 20 MB
      const consumedBytes = 10000000000n - remainingBytes;

      db.balances.set(eventId, {
        event_id: eventId,
        consumed_bytes: consumedBytes,
        consumed_files: 998,
        created_at: new Date(),
        updated_at: new Date(),
      });

      // 2. Primera reserva: 15 MB -> ÉXITO (quedan 5 MB libres)
      const res1 = await reservationService.reserveCapacity({
        eventId,
        idempotencyKey: 'upload-attempt-001',
        bytes: 15_000_000n,
        fileSlots: 1,
        mediaType: 'PHOTO',
      });
      expect(res1.isExisting).toBe(false);
      expect(res1.reservation.status).toBe('ACTIVE');

      // 3. Segunda reserva concurrente: 15 MB -> DEBE FALLAR con QUOTA_EXCEEDED
      await expect(
        reservationService.reserveCapacity({
          eventId,
          idempotencyKey: 'upload-attempt-002',
          bytes: 15_000_000n,
          fileSlots: 1,
          mediaType: 'PHOTO',
        })
      ).rejects.toThrowError(CapacityError);

      // 4. Verificamos invariante: disponible no es negativo y committed <= límite
      const snapshot = await reservationService.getCapacitySnapshot(eventId);
      expect(snapshot.activeReservedBytes).toBe(15_000_000n);
      expect(snapshot.availableStorageBytes).toBe(5_000_000n);
      expect(snapshot.availableFiles).toBe(1);
    });
  });

  describe('Escenario 2: Reducción por debajo de consumo / Sobregiro con salvaguardas (DEC-080, DEC-102)', () => {
    it('no elimina contenido ni resetea balances al reducir por debajo de consumo, y bloquea nuevas reservas', async () => {
      // 1. Consumo real confirmado: 4 GB (4,000,000,000 bytes) y 200 archivos
      const initialConsumedBytes = 4000000000n;
      db.balances.set(eventId, {
        event_id: eventId,
        consumed_bytes: initialConsumedBytes,
        consumed_files: 200,
        created_at: new Date(),
        updated_at: new Date(),
      });

      // 2. Admin aplica override reduciendo el límite a 2 GB (2,000,000,000 bytes < 4 GB)
      const overrideBytes = 2000000000n;
      await planService.applyOverride({
        eventId,
        storageBytes: overrideBytes,
        reason: 'Ajuste comercial por reducción de paquete acordado',
        actorContext: adminActor,
      });

      // 3. Verificamos que los archivos y balances NO se borran (DEC-080)
      const summaryAfterReduction = await queryService.queryCommercialCapacity({
        eventId,
        actorContext: organizerActor,
      });
      expect(summaryAfterReduction.consumedStorage.bytes).toBe(initialConsumedBytes);
      expect(summaryAfterReduction.consumedStorage.files).toBe(200);
      expect(summaryAfterReduction.flags.isOverStorageQuota).toBe(true);
      expect(summaryAfterReduction.available.bytes).toBe(0n);

      // 4. Nuevas reservas deben ser RECHAZADAS inmediatamente
      await expect(
        reservationService.reserveCapacity({
          eventId,
          idempotencyKey: 'sess-blocked-001',
          bytes: 1_000_000n,
          fileSlots: 1,
          mediaType: 'PHOTO',
        })
      ).rejects.toThrowError(CapacityError);

      // 5. Verificamos salvaguarda DEC-102: denegar reducción si expiración quedaría en el pasado
      // Evento ACTIVE anclado hace 40 días
      const pastAnchorDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      db.events.set(eventId, {
        id: eventId,
        status: 'ACTIVE',
        scheduled_at: pastAnchorDate.toISOString(),
      });

      // Intentar reducir retención a 10 días daría ancla + 10d = hace 30 días en el pasado -> RECHAZAR
      await expect(
        planService.applyOverride({
          eventId,
          retentionDays: 10,
          reason: 'Reducción de vigencia inválida',
          actorContext: adminActor,
          eventStatus: 'ACTIVE',
          eventAnchorDate: pastAnchorDate,
        })
      ).rejects.toThrowError(CapacityError);
    });
  });

  describe('Escenario 3: Ciclo completo de ampliación y respuesta (DEC-093, DEC-094, DEC-095, DEC-100, DEC-101)', () => {
    it('gestiona aclaraciones e información en la misma solicitud y aplica override al aprobar', async () => {
      // 1. Organizador crea solicitud de ampliación de 5.5 GB
      const request = await extensionService.createRequest({
        eventId,
        requestType: 'STORAGE',
        additionalGb: 5.5,
        reason: 'Ampliación solicitada para galería completa de matrimonio',
        actorContext: organizerActor,
      });
      expect(request.status).toBe('PENDING_REVIEW');
      expect(request.additionalGb).toBe(5.5);

      // 2. Soporte revisa y solicita información adicional
      const reqWithInfo = await extensionService.reviewRequest({
        requestId: request.id,
        decision: 'REQUEST_INFO',
        decisionReason: 'Por favor indicar si los archivos incluirán video 4K o solo fotos RAW.',
        actorContext: adminActor,
      });
      expect(reqWithInfo.status).toBe('INFORMATION_REQUESTED');

      // 3. Organizador responde en la MISMA solicitud
      const reqResponded = await extensionService.respondToInfoRequest({
        requestId: request.id,
        response: 'Incluirá 2 horas de video en 4K y aprox 800 fotos RAW.',
        actorContext: organizerActor,
      });
      expect(reqResponded.status).toBe('PENDING_REVIEW');

      // Garantía: no se crearon solicitudes duplicadas
      const openRequests = await extensionService.getOpenRequest(eventId);
      expect(openRequests).not.toBeNull();
      expect(openRequests?.id).toBe(request.id);

      // 4. Soporte aprueba con override automático de los 5.5 GB adicionales
      const reqApproved = await extensionService.reviewRequest({
        requestId: request.id,
        decision: 'APPROVE',
        decisionReason: 'Aprobado según justificación y volumen validado.',
        actorContext: adminActor,
      });
      expect(reqApproved.status).toBe('APPROVED');

      // 5. Verificamos que el override de capacidad está activo en los límites
      const limits = await planService.resolveEffectiveLimits({ eventId });
      expect(limits.isOverrideActive).toBe(true);
      // Base: 10 GB + 5.5 GB = 15.5 GB (15,905,580,032 bytes)
      const expectedStorage = 10000000000n + BigInt(Math.round(5.5 * 1024 * 1024 * 1024));
      expect(limits.storageBytes).toBe(expectedStorage);

      // 6. Verificamos el historial completo de mensajes
      const fullRequest = await extensionService.getRequestById(request.id, organizerActor);
      expect(fullRequest).not.toBeNull();
      expect(fullRequest!.messages!.length).toBe(4); // INITIAL + INFO_REQ + INFO_RESP + APPROVED
      expect(fullRequest!.messages!.map((m) => m.authorRole)).toEqual([
        'ORGANIZER',
        'ADMIN',
        'ORGANIZER',
        'ADMIN',
      ]);
    });
  });

  describe('Escenario 4: Emisión deduplicada de umbrales 80% y 100% (EL-TK-138)', () => {
    it('emite señales deduplicadas al alcanzar 80% y 100%, y re-arma al descender el uso', async () => {
      // Base: 10 GB (10,000,000,000 bytes). 80% = 8,000,000,000 bytes.
      // Consumo alcanza 8.5 GB (85%)
      db.balances.set(eventId, {
        event_id: eventId,
        consumed_bytes: 8500000000n,
        consumed_files: 500,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const res1 = await thresholdService.evaluateUsageThresholds({ eventId });
      expect(res1.signalsEmitted.length).toBe(1);
      expect(res1.signalsEmitted[0].thresholdType).toBe('USAGE_80');
      expect(thresholdSignals.length).toBe(1);

      // Re-evaluación en el mismo 85% -> Deduplicada
      const res2 = await thresholdService.evaluateUsageThresholds({ eventId });
      expect(res2.signalsEmitted.length).toBe(0);
      expect(thresholdSignals.length).toBe(1);

      // Consumo alcanza 100% (10 GB)
      db.balances.set(eventId, {
        event_id: eventId,
        consumed_bytes: 10000000000n,
        consumed_files: 500,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const res3 = await thresholdService.evaluateUsageThresholds({ eventId });
      expect(res3.signalsEmitted.length).toBe(1);
      expect(res3.signalsEmitted[0].thresholdType).toBe('USAGE_100');
      expect(thresholdSignals.length).toBe(2);

      // Consumo desciende por purga a 5 GB (50%)
      db.balances.set(eventId, {
        event_id: eventId,
        consumed_bytes: 5000000000n,
        consumed_files: 250,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const res4 = await thresholdService.evaluateUsageThresholds({ eventId });
      expect(res4.signalsEmitted.length).toBe(0);
      expect(res4.thresholdStates.usage80).toBe('ARMED');
      expect(res4.thresholdStates.usage100).toBe('ARMED');
    });
  });
});
