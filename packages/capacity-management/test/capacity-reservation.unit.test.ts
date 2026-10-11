import { describe, expect, it } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  CapacityError,
  CapacityPlanService,
  CapacityReservationService,
  DEFAULT_PLAN_CODE
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
    balances: new Map()
  };

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
          if (sql.includes('FROM plan_assignment') && sql.includes('WHERE event_id = $1')) {
            const eventId = params[0] as string;
            const assign = db.assignments.get(eventId);
            return (assign ? [assign] : []) as R[];
          }
          if (sql.includes('INSERT INTO plan_assignment')) {
            const assign = {
              id: params[0],
              event_id: params[1],
              plan_id: params[2],
              status: 'ACTIVE',
              assigned_at: params[3],
              created_at: params[3],
              updated_at: params[3]
            };
            db.assignments.set(params[1] as string, assign);
            return [] as R[];
          }
          if (sql.includes('FROM plan_override') && sql.includes('WHERE event_id = $1')) {
            const eventId = params[0] as string;
            const overrides = Array.from(db.overrides.values()).filter(
              (o) => o.event_id === eventId && o.status === 'ACTIVE'
            );
            return overrides as R[];
          }

          // Balance queries
          if (sql.includes('INSERT INTO event_capacity_balance')) {
            const eventId = params[0] as string;
            if (!db.balances.has(eventId)) {
              db.balances.set(eventId, {
                event_id: eventId,
                consumed_bytes: 0n,
                consumed_files: 0,
                created_at: new Date(),
                updated_at: new Date()
              });
            }
            return [] as R[];
          }
          if (sql.includes('FROM event_capacity_balance') && sql.includes('WHERE event_id = $1')) {
            const eventId = params[0] as string;
            const balance = db.balances.get(eventId) ?? {
              event_id: eventId,
              consumed_bytes: 0n,
              consumed_files: 0,
              created_at: new Date(),
              updated_at: new Date()
            };
            return [balance] as R[];
          }
          if (sql.includes('UPDATE event_capacity_balance')) {
            const eventId = params[0] as string;
            const addBytes = BigInt(params[1] as any);
            const addFiles = Number(params[2]);
            const bal = db.balances.get(eventId) ?? {
              event_id: eventId,
              consumed_bytes: 0n,
              consumed_files: 0,
              created_at: new Date(),
              updated_at: new Date()
            };
            bal.consumed_bytes = BigInt(bal.consumed_bytes) + addBytes;
            bal.consumed_files = Number(bal.consumed_files) + addFiles;
            bal.updated_at = params[3] as Date;
            db.balances.set(eventId, bal);
            return [] as R[];
          }

          // Reservation queries
          if (sql.includes('FROM capacity_reservation') && sql.includes('idempotency_key = $2')) {
            const eventId = params[0] as string;
            const key = params[1] as string;
            const res = Array.from(db.reservations.values()).find(
              (r) => r.event_id === eventId && r.idempotency_key === key
            );
            return (res ? [res] : []) as R[];
          }
          if (sql.includes('FROM capacity_reservation') && sql.includes('status = \'ACTIVE\'')) {
            const eventId = params[0] as string;
            const activeRes = Array.from(db.reservations.values()).filter(
              (r) => r.event_id === eventId && r.status === 'ACTIVE'
            );
            const totalBytes = activeRes.reduce((acc, r) => acc + BigInt(r.bytes), 0n);
            const totalFiles = activeRes.reduce((acc, r) => acc + Number(r.file_slots), 0);
            return [{ active_bytes: totalBytes, active_files: totalFiles }] as R[];
          }
          if (sql.includes('INSERT INTO capacity_reservation')) {
            const res = {
              id: params[0] as string,
              event_id: params[1] as string,
              idempotency_key: params[2] as string,
              bytes: BigInt(params[3] as any),
              file_slots: Number(params[4]),
              media_type: params[5] as string | null,
              status: 'ACTIVE',
              release_reason: null,
              created_at: params[6] as Date,
              released_at: null,
              committed_at: null,
              updated_at: params[6] as Date
            };
            db.reservations.set(res.id, res);
            return [res] as R[];
          }
          if (sql.includes('FROM capacity_reservation') && (sql.includes('id = $2') || sql.includes('idempotency_key = $3'))) {
            const eventId = params[0] as string;
            const resId = params[1] as string | null;
            const key = params[2] as string | null;
            const res = Array.from(db.reservations.values()).find(
              (r) => r.event_id === eventId && ((resId && r.id === resId) || (key && r.idempotency_key === key))
            );
            return (res ? [res] : []) as R[];
          }
          if (sql.includes('UPDATE capacity_reservation') && sql.includes('SET status = \'RELEASED\'')) {
            const resId = params[0] as string;
            const res = db.reservations.get(resId);
            if (res) {
              res.status = 'RELEASED';
              res.released_at = params[1] as Date;
              res.release_reason = params[2] as string | null;
              res.updated_at = params[1] as Date;
              db.reservations.set(resId, res);
              return [res] as R[];
            }
            return [] as R[];
          }
          if (sql.includes('UPDATE capacity_reservation') && sql.includes('SET status = \'COMMITTED\'')) {
            const resId = params[0] as string;
            const res = db.reservations.get(resId);
            if (res) {
              res.status = 'COMMITTED';
              res.committed_at = params[1] as Date;
              res.updated_at = params[1] as Date;
              db.reservations.set(resId, res);
              return [res] as R[];
            }
            return [] as R[];
          }

          return [] as R[];
        }
      };
      return fn(tx);
    }
  };
}

describe('CapacityReservationService Unit Tests', () => {
  it('reserves storage and file slots atomically when sufficient capacity exists (Scenario 1)', async () => {
    const db = createFakeDb();
    const runner = createFakeTransactionRunner(db);
    const planService = new CapacityPlanService(runner);
    const reservationService = new CapacityReservationService(runner, planService);

    const eventId = '11111111-1111-1111-1111-111111111111';
    const result = await reservationService.reserveCapacity({
      eventId,
      idempotencyKey: 'attempt-001',
      bytes: 15_000_000n, // 15 MB
      fileSlots: 1,
      mediaType: 'PHOTO'
    });

    expect(result.isExisting).toBe(false);
    expect(result.reservation.status).toBe('ACTIVE');
    expect(result.reservation.bytes).toBe(15_000_000n);
    expect(result.reservation.fileSlots).toBe(1);
    expect(result.reservation.mediaType).toBe('PHOTO');
    expect(result.reservation.idempotencyKey).toBe('attempt-001');

    // Verify snapshot reflects the reservation
    const snapshot = await reservationService.getCapacitySnapshot(eventId);
    expect(snapshot.activeReservedBytes).toBe(15_000_000n);
    expect(snapshot.activeReservedFiles).toBe(1);
    expect(snapshot.availableStorageBytes).toBe(10_000_000_000n - 15_000_000n);
    expect(snapshot.availableFiles).toBe(1499);
  });

  it('rejects reservation if storage capacity is exceeded', async () => {
    const db = createFakeDb();
    const runner = createFakeTransactionRunner(db);
    const planService = new CapacityPlanService(runner);
    const reservationService = new CapacityReservationService(runner, planService);

    const eventId = '11111111-1111-1111-1111-111111111111';

    // Base plan is 10 GB. Request 10.5 GB
    await expect(
      reservationService.reserveCapacity({
        eventId,
        idempotencyKey: 'huge-upload',
        bytes: 10_500_000_000n,
        fileSlots: 1
      })
    ).rejects.toThrowError(CapacityError);

    try {
      await reservationService.reserveCapacity({
        eventId,
        idempotencyKey: 'huge-upload',
        bytes: 10_500_000_000n,
        fileSlots: 1
      });
    } catch (err: any) {
      expect(err.code).toBe('INSUFFICIENT_STORAGE_CAPACITY');
    }
  });

  it('rejects reservation if file limit is exceeded (Scenario 2)', async () => {
    const db = createFakeDb();
    const runner = createFakeTransactionRunner(db);
    const planService = new CapacityPlanService(runner);
    const reservationService = new CapacityReservationService(runner, planService);

    const eventId = '11111111-1111-1111-1111-111111111111';

    // Request 1501 slots when maxFiles is 1500
    await expect(
      reservationService.reserveCapacity({
        eventId,
        idempotencyKey: 'too-many-files',
        bytes: 1000n,
        fileSlots: 1501
      })
    ).rejects.toThrowError(CapacityError);

    try {
      await reservationService.reserveCapacity({
        eventId,
        idempotencyKey: 'too-many-files',
        bytes: 1000n,
        fileSlots: 1501
      });
    } catch (err: any) {
      expect(err.code).toBe('INSUFFICIENT_FILE_CAPACITY');
    }
  });

  it('rejects photo or video exceeding declared individual limits', async () => {
    const db = createFakeDb();
    const runner = createFakeTransactionRunner(db);
    const planService = new CapacityPlanService(runner);
    const reservationService = new CapacityReservationService(runner, planService);

    const eventId = '11111111-1111-1111-1111-111111111111';

    // Photo max limit is 25 MB (25,000,000 bytes). Request 30 MB photo:
    await expect(
      reservationService.reserveCapacity({
        eventId,
        idempotencyKey: 'big-photo',
        bytes: 30_000_000n,
        fileSlots: 1,
        mediaType: 'PHOTO'
      })
    ).rejects.toThrowError(CapacityError);

    // Video max limit is 500 MB (500,000,000 bytes). Request 550 MB video:
    await expect(
      reservationService.reserveCapacity({
        eventId,
        idempotencyKey: 'big-video',
        bytes: 550_000_000n,
        fileSlots: 1,
        mediaType: 'VIDEO'
      })
    ).rejects.toThrowError(CapacityError);
  });

  it('returns existing reservation idempotently when repeating same request', async () => {
    const db = createFakeDb();
    const runner = createFakeTransactionRunner(db);
    const planService = new CapacityPlanService(runner);
    const reservationService = new CapacityReservationService(runner, planService);

    const eventId = '11111111-1111-1111-1111-111111111111';
    const first = await reservationService.reserveCapacity({
      eventId,
      idempotencyKey: 'idemp-123',
      bytes: 5_000_000n,
      fileSlots: 1
    });
    expect(first.isExisting).toBe(false);

    // Repeat with exact same parameters
    const second = await reservationService.reserveCapacity({
      eventId,
      idempotencyKey: 'idemp-123',
      bytes: 5_000_000n,
      fileSlots: 1
    });
    expect(second.isExisting).toBe(true);
    expect(second.reservation.id).toBe(first.reservation.id);

    // Try same key with DIFFERENT bytes -> IDEMPOTENCY_CONFLICT
    await expect(
      reservationService.reserveCapacity({
        eventId,
        idempotencyKey: 'idemp-123',
        bytes: 10_000_000n,
        fileSlots: 1
      })
    ).rejects.toThrowError(CapacityError);
  });

  it('releases reservation and is idempotent on repeat release (Scenario 3)', async () => {
    const db = createFakeDb();
    const runner = createFakeTransactionRunner(db);
    const planService = new CapacityPlanService(runner);
    const reservationService = new CapacityReservationService(runner, planService);

    const eventId = '11111111-1111-1111-1111-111111111111';
    const reserved = await reservationService.reserveCapacity({
      eventId,
      idempotencyKey: 'cancel-me',
      bytes: 10_000_000n,
      fileSlots: 1
    });

    // First release
    const released = await reservationService.releaseReservation({
      eventId,
      reservationId: reserved.reservation.id,
      reason: 'Upload cancelled by guest'
    });
    expect(released.status).toBe('RELEASED');
    expect(released.releaseReason).toBe('Upload cancelled by guest');
    expect(released.releasedAt).toBeInstanceOf(Date);

    // Snapshot shows 0 active reservations
    const snapshotAfterRelease = await reservationService.getCapacitySnapshot(eventId);
    expect(snapshotAfterRelease.activeReservedBytes).toBe(0n);
    expect(snapshotAfterRelease.activeReservedFiles).toBe(0);

    // Second release attempt on cancelled reservation: MUST BE IDEMPOTENT without error
    const repeatRelease = await reservationService.releaseReservation({
      eventId,
      reservationId: reserved.reservation.id,
      reason: 'Redundant release attempt'
    });
    expect(repeatRelease.status).toBe('RELEASED');
    expect(repeatRelease.id).toBe(released.id);
  });

  it('commits reservation and shifts capacity to consumed', async () => {
    const db = createFakeDb();
    const runner = createFakeTransactionRunner(db);
    const planService = new CapacityPlanService(runner);
    const reservationService = new CapacityReservationService(runner, planService);

    const eventId = '11111111-1111-1111-1111-111111111111';
    const reserved = await reservationService.reserveCapacity({
      eventId,
      idempotencyKey: 'commit-me',
      bytes: 8_000_000n,
      fileSlots: 1
    });

    const committed = await reservationService.commitReservation({
      eventId,
      reservationId: reserved.reservation.id
    });
    expect(committed.status).toBe('COMMITTED');
    expect(committed.committedAt).toBeInstanceOf(Date);

    const snapshot = await reservationService.getCapacitySnapshot(eventId);
    expect(snapshot.activeReservedBytes).toBe(0n);
    expect(snapshot.consumedBytes).toBe(8_000_000n);
    expect(snapshot.consumedFiles).toBe(1);
    expect(snapshot.availableStorageBytes).toBe(10_000_000_000n - 8_000_000n);
  });
});
