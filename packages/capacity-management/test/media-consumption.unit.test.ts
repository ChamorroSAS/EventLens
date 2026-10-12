import { describe, expect, it, beforeEach } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  CapacityPlanService,
  CapacityReservationService,
  MediaConsumptionService,
  DEFAULT_PLAN_CODE,
  doesMediaRetainCommercialQuota,
  isArtifactBillableAgainstQuota,
} from '../src/index.js';

interface InMemoryDb {
  plans: Map<string, any>;
  assignments: Map<string, any>;
  overrides: Map<string, any>;
  reservations: Map<string, any>;
  balances: Map<string, any>;
  ledgers: Map<string, any>; // key: `${eventId}:${mediaId}`
  receipts: Map<string, any>; // key: `${eventId}:${purgeReceiptId}`
}

function createFakeDb(): InMemoryDb {
  const db: InMemoryDb = {
    plans: new Map(),
    assignments: new Map(),
    overrides: new Map(),
    reservations: new Map(),
    balances: new Map(),
    ledgers: new Map(),
    receipts: new Map(),
  };

  db.plans.set(DEFAULT_PLAN_CODE, {
    id: '00000000-0000-0000-0000-000000000001',
    code: DEFAULT_PLAN_CODE,
    name: 'Plan BETA EventLens',
    storage_bytes: 10000000000n, // 10 GB
    max_files: 1500,
    max_photo_bytes: 25000000n, // 25 MB
    max_video_bytes: 500000000n, // 500 MB
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

          // Plan assignment queries
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

          // Plan override queries
          if (sql.includes('FROM plan_override') && sql.includes('WHERE event_id = $1 AND status = $2')) {
            const eventId = params[0] as string;
            const status = params[1] as string;
            const overrides = Array.from(db.overrides.values()).filter(
              (o) => o.event_id === eventId && o.status === status
            );
            return overrides as R[];
          }

          // Balance queries
          if (sql.includes('INSERT INTO event_capacity_balance') && sql.includes('ON CONFLICT')) {
            const eventId = params[0] as string;
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
            const eventId = params[0] as string;
            const balance = db.balances.get(eventId);
            return (balance ? [balance] : []) as R[];
          }
          if (sql.includes('UPDATE event_capacity_balance') && sql.includes('consumed_bytes = consumed_bytes + $2')) {
            const [eventId, bytes, files] = params as [string, bigint, number];
            const balance = db.balances.get(eventId);
            if (balance) {
              balance.consumed_bytes = BigInt(balance.consumed_bytes) + BigInt(bytes);
              balance.consumed_files = balance.consumed_files + files;
              balance.updated_at = new Date();
            }
            return [] as R[];
          }
          if (sql.includes('UPDATE event_capacity_balance') && sql.includes('GREATEST(0, consumed_bytes - $2)')) {
            const [eventId, bytes, files] = params as [string, bigint, number];
            const balance = db.balances.get(eventId);
            if (balance) {
              const currentBytes = BigInt(balance.consumed_bytes);
              const subBytes = BigInt(bytes);
              balance.consumed_bytes = currentBytes > subBytes ? currentBytes - subBytes : 0n;
              const currentFiles = balance.consumed_files;
              balance.consumed_files = currentFiles > files ? currentFiles - files : 0;
              balance.updated_at = new Date();
            }
            return [] as R[];
          }

          // Reservation queries
          if (sql.includes('FROM capacity_reservation') && sql.includes('WHERE event_id = $1 AND idempotency_key = $2')) {
            const [eventId, key] = params as [string, string];
            const res = Array.from(db.reservations.values()).find(
              (r) => r.event_id === eventId && r.idempotency_key === key
            );
            return (res ? [res] : []) as R[];
          }
          if (sql.includes('FROM capacity_reservation') && sql.includes('WHERE event_id = $1') && sql.includes('FOR UPDATE')) {
            const eventId = params[0] as string;
            const resId = params[1] as string | null;
            const key = params[2] as string | null;
            const res = Array.from(db.reservations.values()).find(
              (r) =>
                r.event_id === eventId &&
                (!resId || r.id === resId) &&
                (!key || r.idempotency_key === key)
            );
            return (res ? [res] : []) as R[];
          }
          if (sql.includes('FROM capacity_reservation') && sql.includes("status = 'ACTIVE'")) {
            const eventId = params[0] as string;
            const active = Array.from(db.reservations.values()).filter(
              (r) => r.event_id === eventId && r.status === 'ACTIVE'
            );
            const sumBytes = active.reduce((acc, r) => acc + BigInt(r.bytes), 0n);
            const sumFiles = active.reduce((acc, r) => acc + r.file_slots, 0);
            return [{ active_bytes: sumBytes, active_files: sumFiles }] as R[];
          }
          if (sql.includes('INSERT INTO capacity_reservation')) {
            const [id, eventId, key, bytes, slots, mediaType, now] = params as [string, string, string, bigint, number, string | null, Date];
            const rec = {
              id,
              event_id: eventId,
              idempotency_key: key,
              bytes: BigInt(bytes),
              file_slots: slots,
              media_type: mediaType,
              status: 'ACTIVE',
              release_reason: null,
              created_at: now,
              released_at: null,
              committed_at: null,
              updated_at: now,
            };
            db.reservations.set(id, rec);
            return [rec] as R[];
          }
          if (sql.includes('UPDATE capacity_reservation') && sql.includes("status = 'COMMITTED'")) {
            const [id, now] = params as [string, Date];
            const rec = db.reservations.get(id);
            if (rec) {
              rec.status = 'COMMITTED';
              rec.committed_at = now;
              rec.updated_at = now;
            }
            return (rec ? [rec] : []) as R[];
          }

          // Ledger queries
          if (sql.includes('FROM media_consumption_ledger') && sql.includes('WHERE event_id = $1 AND media_id = $2')) {
            const [eventId, mediaId] = params as [string, string];
            const key = `${eventId}:${mediaId}`;
            const row = db.ledgers.get(key);
            return (row ? [row] : []) as R[];
          }
          if (sql.includes('INSERT INTO media_consumption_ledger')) {
            const [id, eventId, mediaId, bytes, slots, reservationId, now] = params as [
              string, string, string, bigint, number, string | null, Date
            ];
            const key = `${eventId}:${mediaId}`;
            const row = {
              id,
              event_id: eventId,
              media_id: mediaId,
              bytes: BigInt(bytes),
              file_slots: slots,
              reservation_id: reservationId,
              status: 'COMMITTED',
              committed_at: now,
              purged_at: null,
              created_at: now,
              updated_at: now,
            };
            db.ledgers.set(key, row);
            return [row] as R[];
          }
          if (sql.includes('UPDATE media_consumption_ledger') && sql.includes("status = 'PURGED'")) {
            const [id, now] = params as [string, Date];
            const row = Array.from(db.ledgers.values()).find((l) => l.id === id);
            if (row) {
              row.status = 'PURGED';
              row.purged_at = now;
              row.updated_at = now;
            }
            return (row ? [row] : []) as R[];
          }

          // Purge receipt queries
          if (sql.includes('FROM purge_release_receipt') && sql.includes('WHERE event_id = $1 AND purge_receipt_id = $2')) {
            const [eventId, purgeReceiptId] = params as [string, string];
            const key = `${eventId}:${purgeReceiptId}`;
            const row = db.receipts.get(key);
            return (row ? [row] : []) as R[];
          }
          if (sql.includes('INSERT INTO purge_release_receipt')) {
            const [id, eventId, mediaId, purgeReceiptId, bytes, slots, now] = params as [
              string, string, string, string, bigint, number, Date
            ];
            const key = `${eventId}:${purgeReceiptId}`;
            const row = {
              id,
              event_id: eventId,
              media_id: mediaId,
              purge_receipt_id: purgeReceiptId,
              bytes: BigInt(bytes),
              file_slots: slots,
              released_at: now,
              created_at: now,
            };
            db.receipts.set(key, row);
            return [row] as R[];
          }

          return [] as R[];
        },
      };

      return fn(tx);
    },
  };
}

describe('MediaConsumptionService (Unit Tests — EL-TK-137)', () => {
  let db: InMemoryDb;
  let txRunner: TransactionRunner;
  let planService: CapacityPlanService;
  let reservationService: CapacityReservationService;
  let service: MediaConsumptionService;

  const eventId = '11111111-1111-1111-1111-111111111111';
  const mediaId = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    db = createFakeDb();
    txRunner = createFakeTransactionRunner(db);
    planService = new CapacityPlanService(txRunner);
    reservationService = new CapacityReservationService(txRunner, planService);
    service = new MediaConsumptionService(txRunner, reservationService);
  });

  describe('Escenario 1: Asentar aceptación de original con idempotencia', () => {
    it('convierte una reserva en consumo exactamente una vez', async () => {
      // 1. Crear reserva previa
      const resResult = await reservationService.reserveCapacity({
        eventId,
        bytes: 5000000n, // 5 MB
        fileSlots: 1,
        idempotencyKey: 'idem-res-01',
      });

      expect(resResult.reservation.status).toBe('ACTIVE');

      // 2. Asentar aceptación del original
      const settleResult = await service.settleOriginalAcceptance({
        eventId,
        mediaId,
        bytes: 5000000n,
        fileSlots: 1,
        reservationId: resResult.reservation.id,
      });

      expect(settleResult.bytes).toBe(5000000n);
      expect(settleResult.fileSlots).toBe(1);
      expect(settleResult.reservationCommitted).toBe(true);
      expect(settleResult.isExisting).toBe(false);

      // Balance consumido incrementado
      const balance = db.balances.get(eventId);
      expect(balance.consumed_bytes).toBe(5000000n);
      expect(balance.consumed_files).toBe(1);

      // Ledger registrado
      const ledger = await service.getMediaConsumptionRecord(eventId, mediaId);
      expect(ledger).not.toBeNull();
      expect(ledger?.status).toBe('COMMITTED');

      // 3. Replay idéntico: idempotencia estricta sin duplicar consumo
      const replayResult = await service.settleOriginalAcceptance({
        eventId,
        mediaId,
        bytes: 5000000n,
        fileSlots: 1,
        reservationId: resResult.reservation.id,
      });

      expect(replayResult.isExisting).toBe(true);
      expect(db.balances.get(eventId).consumed_bytes).toBe(5000000n); // No se duplica
      expect(db.balances.get(eventId).consumed_files).toBe(1);
    });

    it('asienta consumo directo si no se especificó reserva previa', async () => {
      const settleResult = await service.settleOriginalAcceptance({
        eventId,
        mediaId: '33333333-3333-3333-3333-333333333333',
        bytes: 12000000n,
        fileSlots: 1,
      });

      expect(settleResult.bytes).toBe(12000000n);
      expect(settleResult.reservationCommitted).toBe(false);

      const balance = db.balances.get(eventId);
      expect(balance.consumed_bytes).toBe(12000000n);
      expect(balance.consumed_files).toBe(1);
    });

    it('no computa cuota comercial para derivados, thumbnails, previews o ZIPs (DEC-096)', async () => {
      const previewResult = await service.settleOriginalAcceptance({
        eventId,
        mediaId: 'preview-media-01',
        bytes: 300000n,
        artifactRole: 'PREVIEW',
      });

      expect(previewResult.bytes).toBe(0n);
      expect(previewResult.fileSlots).toBe(0);

      const zipResult = await service.settleOriginalAcceptance({
        eventId,
        mediaId: 'export-zip-01',
        bytes: 500000000n,
        artifactRole: 'EXPORT_ARCHIVE',
      });

      expect(zipResult.bytes).toBe(0n);
      expect(isArtifactBillableAgainstQuota('PREVIEW')).toBe(false);
      expect(isArtifactBillableAgainstQuota('EXPORT_ARCHIVE')).toBe(false);
      expect(isArtifactBillableAgainstQuota('ORIGINAL')).toBe(true);

      // Balance sigue intacto
      expect(db.balances.get(eventId)?.consumed_bytes ?? 0n).toBe(0n);
    });
  });

  describe('Escenario 2: Retención de cuota en estados lógicos (DEC-079 / DEC-080)', () => {
    it('retiene cuota en TRASHED, QUARANTINED, HIDDEN y ACTIVE mientras el archivo exista físicamente', () => {
      expect(doesMediaRetainCommercialQuota('ACTIVE')).toBe(true);
      expect(doesMediaRetainCommercialQuota('TRASHED')).toBe(true);
      expect(doesMediaRetainCommercialQuota('QUARANTINED')).toBe(true);
      expect(doesMediaRetainCommercialQuota('HIDDEN')).toBe(true);
      expect(doesMediaRetainCommercialQuota('PURGED')).toBe(false);

      const checkTrashed = service.assertMediaRetainsQuota('TRASHED');
      expect(checkTrashed.retainsQuota).toBe(true);
      expect(checkTrashed.reason).toContain('physically exists');

      const checkPurged = service.assertMediaRetainsQuota('PURGED');
      expect(checkPurged.retainsQuota).toBe(false);
    });
  });

  describe('Escenario 3: Confirmación de purga física y liberación de cuota', () => {
    it('libera cuota exactamente una vez tras confirmación de eliminación física', async () => {
      // 1. Asentar consumo
      await service.settleOriginalAcceptance({
        eventId,
        mediaId,
        bytes: 15000000n, // 15 MB
        fileSlots: 1,
      });

      expect(db.balances.get(eventId).consumed_bytes).toBe(15000000n);
      expect(db.balances.get(eventId).consumed_files).toBe(1);

      // 2. Confirmar purga física
      const purgeResult = await service.confirmPhysicalPurge({
        eventId,
        mediaId,
        purgeReceiptId: 'receipt-purge-001',
      });

      expect(purgeResult.bytesReleased).toBe(15000000n);
      expect(purgeResult.filesReleased).toBe(1);
      expect(purgeResult.isExisting).toBe(false);

      // Balance decrementado a 0
      const balance = db.balances.get(eventId);
      expect(balance.consumed_bytes).toBe(0n);
      expect(balance.consumed_files).toBe(0);

      // Ledger marcado como PURGED
      const ledger = await service.getMediaConsumptionRecord(eventId, mediaId);
      expect(ledger?.status).toBe('PURGED');
      expect(ledger?.purgedAt).not.toBeNull();

      // 3. Replay del mismo recibo de purga: idempotente sin doble deducción
      const replayPurge = await service.confirmPhysicalPurge({
        eventId,
        mediaId,
        purgeReceiptId: 'receipt-purge-001',
      });

      expect(replayPurge.isExisting).toBe(true);
      expect(replayPurge.bytesReleased).toBe(15000000n);
      expect(db.balances.get(eventId).consumed_bytes).toBe(0n); // Nunca negativo
    });

    it('no genera balances negativos ante múltiples recibos de purga', async () => {
      // Asentar 10MB
      await service.settleOriginalAcceptance({
        eventId,
        mediaId,
        bytes: 10000000n,
      });

      // Purga 1
      await service.confirmPhysicalPurge({
        eventId,
        mediaId,
        purgeReceiptId: 'purge-receipt-A',
      });

      expect(db.balances.get(eventId).consumed_bytes).toBe(0n);

      // Purga 2 con distinto receipt id para el mismo media
      const secondPurge = await service.confirmPhysicalPurge({
        eventId,
        mediaId,
        purgeReceiptId: 'purge-receipt-B',
      });

      expect(secondPurge.bytesReleased).toBe(0n); // Ya estaba purgado
      expect(db.balances.get(eventId).consumed_bytes).toBe(0n);
    });
  });
});
