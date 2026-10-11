import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  CapacityPlanService,
  CapacityReservationService,
  CapacityError,
  DEFAULT_PLAN_CODE
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('CapacityReservationService (Real PostgreSQL Integration Tests — EL-TK-136)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  beforeAll(async () => {
    await sql(`
      CREATE TABLE IF NOT EXISTS plan (
        id UUID PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        storage_bytes BIGINT NOT NULL CHECK(storage_bytes > 0),
        max_files INTEGER NOT NULL CHECK(max_files > 0),
        max_photo_bytes BIGINT NOT NULL CHECK(max_photo_bytes > 0),
        max_video_bytes BIGINT NOT NULL CHECK(max_video_bytes > 0),
        max_video_duration_seconds INTEGER NOT NULL CHECK(max_video_duration_seconds > 0),
        retention_days INTEGER NOT NULL CHECK(retention_days > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS plan_assignment (
        id UUID PRIMARY KEY,
        event_id UUID NOT NULL UNIQUE,
        plan_id UUID NOT NULL REFERENCES plan(id),
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'INACTIVE')),
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS plan_override (
        id UUID PRIMARY KEY,
        event_id UUID NOT NULL,
        storage_bytes BIGINT CHECK(storage_bytes IS NULL OR storage_bytes > 0),
        max_files INTEGER CHECK(max_files IS NULL OR max_files > 0),
        retention_days INTEGER CHECK(retention_days IS NULL OR retention_days > 0),
        reason TEXT NOT NULL,
        authorized_by TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'REMOVED')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        removed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS capacity_reservation (
        id UUID PRIMARY KEY,
        event_id UUID NOT NULL,
        idempotency_key TEXT NOT NULL,
        bytes BIGINT NOT NULL CHECK(bytes > 0),
        file_slots INTEGER NOT NULL DEFAULT 1 CHECK(file_slots > 0),
        media_type TEXT CHECK(media_type IS NULL OR media_type IN ('PHOTO', 'VIDEO')),
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'RELEASED', 'COMMITTED')),
        release_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        released_at TIMESTAMPTZ,
        committed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_capacity_reservation_event_idempotency UNIQUE(event_id, idempotency_key)
      );

      CREATE TABLE IF NOT EXISTS admin_audit_event (
        id UUID PRIMARY KEY,
        procedure TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        target_identifier TEXT NOT NULL,
        result TEXT NOT NULL,
        details TEXT,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS event_capacity_balance (
        event_id UUID PRIMARY KEY,
        consumed_bytes BIGINT NOT NULL DEFAULT 0 CHECK(consumed_bytes >= 0),
        consumed_files INTEGER NOT NULL DEFAULT 0 CHECK(consumed_files >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      INSERT INTO plan (
        id, code, name, storage_bytes, max_files, max_photo_bytes, max_video_bytes, max_video_duration_seconds, retention_days, created_at
      ) VALUES (
        '00000000-0000-0000-0000-000000000001',
        '${DEFAULT_PLAN_CODE}',
        'Plan BETA EventLens',
        10000000000,
        1500,
        25000000,
        500000000,
        300,
        30,
        NOW()
      ) ON CONFLICT (code) DO NOTHING;
    `);
  });

  const planService = new CapacityPlanService(txs);
  const reservationService = new CapacityReservationService(txs, planService);

  it('reserves and commits capacity in PostgreSQL with balance synchronization (Scenario 1)', async () => {
    const eventId = randomUUID();
    const idempotencyKey = `attempt-${randomUUID()}`;

    // Ensure plan is assigned
    await planService.assignPlan({ eventId });

    // 1. Reserve 12 MB for photo
    const reserveResult = await reservationService.reserveCapacity({
      eventId,
      idempotencyKey,
      bytes: 12_000_000n,
      fileSlots: 1,
      mediaType: 'PHOTO'
    });

    expect(reserveResult.isExisting).toBe(false);
    expect(reserveResult.reservation.status).toBe('ACTIVE');
    expect(reserveResult.reservation.bytes).toBe(12_000_000n);

    // 2. Commit the reservation
    const committed = await reservationService.commitReservation({
      eventId,
      reservationId: reserveResult.reservation.id
    });

    expect(committed.status).toBe('COMMITTED');

    // 3. Query PostgreSQL directly to verify balance
    const balanceRows = await txs.run((tx) =>
      tx.query<{ consumed_bytes: string | bigint; consumed_files: number }>(
        'SELECT consumed_bytes, consumed_files FROM event_capacity_balance WHERE event_id = $1',
        eventId
      )
    );
    expect(balanceRows.length).toBe(1);
    expect(BigInt(balanceRows[0].consumed_bytes)).toBe(12_000_000n);
    expect(balanceRows[0].consumed_files).toBe(1);
  });

  it('serializes concurrent reservations competing for the last available slots and never overbooks (Scenario 2)', async () => {
    const eventId = randomUUID();

    // Assign base plan and override max_files to exactly 3 slots
    await planService.assignPlan({ eventId });
    await planService.applyOverride({
      eventId,
      actorContext: {
        actorType: 'ADMIN_HUMAN',
        principalId: 'admin-001',
        identifier: 'admin@eventlens.local',
        sessionId: 'session-001',
        authTime: new Date(),
        credentialRevision: 1n,
        adminAuthRevision: 1n,
        sessionWatermark: 1n,
        recoveryEpoch: 1n
      },
      maxFiles: 3,
      reason: 'Constrained capacity test for concurrent uploads'
    });

    // Launch 10 concurrent reservation attempts for 1 file slot each
    const attempts = Array.from({ length: 10 }).map((_, idx) =>
      reservationService.reserveCapacity({
        eventId,
        idempotencyKey: `concurrent-attempt-${idx}-${randomUUID()}`,
        bytes: 1_000_000n,
        fileSlots: 1
      })
    );

    const results = await Promise.allSettled(attempts);

    const successful = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly 3 must succeed, 7 must be rejected
    expect(successful.length).toBe(3);
    expect(rejected.length).toBe(7);

    for (const rej of rejected) {
      if (rej.status === 'rejected') {
        expect(rej.reason).toBeInstanceOf(CapacityError);
        expect((rej.reason as CapacityError).code).toBe('INSUFFICIENT_FILE_CAPACITY');
      }
    }

    // Verify DB contains exactly 3 active reservations
    const activeRows = await txs.run((tx) =>
      tx.query<{ count: string | number }>(
        "SELECT COUNT(*) AS count FROM capacity_reservation WHERE event_id = $1 AND status = 'ACTIVE'",
        eventId
      )
    );
    expect(Number(activeRows[0].count)).toBe(3);
  });

  it('guarantees idempotency on double release of cancelled reservation (Scenario 3)', async () => {
    const eventId = randomUUID();
    const idempotencyKey = `cancel-${randomUUID()}`;

    await planService.assignPlan({ eventId });
    const reserved = await reservationService.reserveCapacity({
      eventId,
      idempotencyKey,
      bytes: 5_000_000n,
      fileSlots: 1
    });

    // First release
    const firstRelease = await reservationService.releaseReservation({
      eventId,
      reservationId: reserved.reservation.id,
      reason: 'Network disconnect'
    });
    expect(firstRelease.status).toBe('RELEASED');

    // Second release (idempotent repeat)
    const secondRelease = await reservationService.releaseReservation({
      eventId,
      reservationId: reserved.reservation.id,
      reason: 'Duplicate cancellation event'
    });
    expect(secondRelease.status).toBe('RELEASED');
    expect(secondRelease.id).toBe(firstRelease.id);

    // Snapshot verifies active reservations is 0
    const snapshot = await reservationService.getCapacitySnapshot(eventId);
    expect(snapshot.activeReservedBytes).toBe(0n);
    expect(snapshot.activeReservedFiles).toBe(0);
  });
});
