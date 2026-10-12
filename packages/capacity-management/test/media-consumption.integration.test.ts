import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  CapacityPlanService,
  CapacityReservationService,
  MediaConsumptionService,
  DEFAULT_PLAN_CODE,
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('MediaConsumptionService (Real PostgreSQL Integration Tests — EL-TK-137)', () => {
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
        media_type TEXT CHECK(media_type IN ('PHOTO', 'VIDEO')),
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'RELEASED', 'COMMITTED')),
        release_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        released_at TIMESTAMPTZ,
        committed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_capacity_reservation_event_idempotency UNIQUE(event_id, idempotency_key)
      );

      CREATE TABLE IF NOT EXISTS event_capacity_balance (
        event_id UUID PRIMARY KEY,
        consumed_bytes BIGINT NOT NULL DEFAULT 0 CHECK(consumed_bytes >= 0),
        consumed_files INTEGER NOT NULL DEFAULT 0 CHECK(consumed_files >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS media_consumption_ledger (
        id UUID PRIMARY KEY,
        event_id UUID NOT NULL,
        media_id UUID NOT NULL,
        bytes BIGINT NOT NULL CHECK(bytes >= 0),
        file_slots INTEGER NOT NULL DEFAULT 1 CHECK(file_slots >= 0),
        reservation_id UUID,
        status TEXT NOT NULL DEFAULT 'COMMITTED',
        committed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        purged_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_media_consumption_ledger_event_media UNIQUE (event_id, media_id)
      );

      CREATE TABLE IF NOT EXISTS purge_release_receipt (
        id UUID PRIMARY KEY,
        event_id UUID NOT NULL,
        media_id UUID NOT NULL,
        purge_receipt_id TEXT NOT NULL,
        bytes BIGINT NOT NULL CHECK(bytes >= 0),
        file_slots INTEGER NOT NULL DEFAULT 1 CHECK(file_slots >= 0),
        released_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_purge_release_receipt_event_purge UNIQUE (event_id, purge_receipt_id)
      );
    `);

    // Ensure default plan exists
    await sql(`
      INSERT INTO plan (
        id, code, name, storage_bytes, max_files, max_photo_bytes, max_video_bytes,
        max_video_duration_seconds, retention_days, created_at
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
  const service = new MediaConsumptionService(txs, reservationService);

  it('asienta consumo y confirma purga en PostgreSQL de forma atómica e idempotente', async () => {
    const eventId = randomUUID();
    const mediaId = randomUUID();

    // 1. Asentar consumo
    const settle = await service.settleOriginalAcceptance({
      eventId,
      mediaId,
      bytes: 8000000n, // 8 MB
      fileSlots: 1,
    });

    expect(settle.bytes).toBe(8000000n);
    expect(settle.isExisting).toBe(false);

    // 2. Replay idempotente de aceptación
    const replay = await service.settleOriginalAcceptance({
      eventId,
      mediaId,
      bytes: 8000000n,
      fileSlots: 1,
    });
    expect(replay.isExisting).toBe(true);

    // 3. Confirmar purga física
    const purgeReceiptId = `purge-rcpt-${randomUUID()}`;
    const purge = await service.confirmPhysicalPurge({
      eventId,
      mediaId,
      purgeReceiptId,
    });

    expect(purge.bytesReleased).toBe(8000000n);
    expect(purge.filesReleased).toBe(1);
    expect(purge.isExisting).toBe(false);

    // 4. Replay idempotente de purga
    const replayPurge = await service.confirmPhysicalPurge({
      eventId,
      mediaId,
      purgeReceiptId,
    });
    expect(replayPurge.isExisting).toBe(true);
  });
});
