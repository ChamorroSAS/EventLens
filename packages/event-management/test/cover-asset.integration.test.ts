import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import type { OrganizerActorContext } from '@eventlens/identity';
import {
  CoverAssetService,
  EventDraftService,
  EventManagementError,
  type EventAuditSink,
  type EventAuditRecord,
  type DirectUploadStoragePort
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

class MockStoragePort implements DirectUploadStoragePort {
  public objects = new Map<string, { sizeBytes: bigint; contentType: string }>();
  public deletedKeys: string[] = [];

  async createUploadUrl(params: {
    objectKey: string;
    declaredSize: bigint | number;
    declaredType: string;
    ttlSeconds: number;
  }) {
    return {
      uploadUrl: `https://storage.eventlens.local/upload/${params.objectKey}`,
      method: 'PUT' as const,
      headers: { 'Content-Type': params.declaredType },
      expiresAt: new Date(Date.now() + params.ttlSeconds * 1000)
    };
  }

  async getObjectMetadata(objectKey: string) {
    const obj = this.objects.get(objectKey);
    if (!obj) return null;
    return {
      objectKey,
      sizeBytes: obj.sizeBytes,
      contentType: obj.contentType,
      lastModified: new Date()
    };
  }

  async abortOrDeleteObject(objectKey: string): Promise<void> {
    this.deletedKeys.push(objectKey);
    this.objects.delete(objectKey);
  }
}

describeIntegration('CoverAsset (Real PostgreSQL 16 Integration Tests — EL-TK-049, 050, 051, 052)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  async function query<T extends object>(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.query<T>(statement, ...args));
  }

  const recordedAudits: EventAuditRecord[] = [];
  const auditSink: EventAuditSink = {
    record: async (rec: EventAuditRecord) => {
      recordedAudits.push(rec);
    }
  };

  const storagePort = new MockStoragePort();
  const service = new CoverAssetService(txs, storagePort, auditSink);
  const draftService = new EventDraftService(txs, auditSink);

  let ownerContext: OrganizerActorContext;
  let otherContext: OrganizerActorContext;
  let eventId: string;

  beforeAll(async () => {
    // 1. Ensure event table has cover_asset_id
    await sql(`
      CREATE TABLE IF NOT EXISTS event (
        id UUID PRIMARY KEY,
        organizer_id UUID NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        timezone TEXT NOT NULL DEFAULT 'America/Bogota',
        starts_at_local TEXT,
        scheduled_at TIMESTAMPTZ,
        utc_offset_minutes INT,
        expires_at TIMESTAMPTZ,
        grace_ends_at TIMESTAMPTZ,
        activated_at TIMESTAMPTZ,
        closed_at TIMESTAMPTZ,
        purge_started_at TIMESTAMPTZ,
        suspended_at TIMESTAMPTZ,
        suspension_reason TEXT,
        previous_status TEXT,
        validity_duration_days INT,
        grace_days INT,
        uploads_enabled BOOLEAN NOT NULL DEFAULT false,
        guest_gallery_enabled BOOLEAN NOT NULL DEFAULT false,
        moderation_mode TEXT NOT NULL DEFAULT 'AUTO_PUBLISH',
        pin_enabled BOOLEAN NOT NULL DEFAULT false,
        pin_hash TEXT,
        pin_salt TEXT,
        welcome_message TEXT,
        cover_asset_id UUID,
        idempotency_key TEXT UNIQUE,
        idempotency_payload_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await sql(`
      ALTER TABLE "event" ADD COLUMN IF NOT EXISTS "cover_asset_id" UUID;
    `);

    // 2. Ensure cover asset tables
    await sql(`
      CREATE TABLE IF NOT EXISTS "event_cover_asset" (
        "id" UUID PRIMARY KEY,
        "event_id" UUID NOT NULL,
        "owner_id" UUID NOT NULL,
        "purpose" TEXT NOT NULL DEFAULT 'EVENT_COVER',
        "status" TEXT NOT NULL DEFAULT 'RECEIVED',
        "original_key" TEXT NOT NULL,
        "declared_size" BIGINT NOT NULL,
        "declared_type" TEXT NOT NULL,
        "actual_size" BIGINT,
        "detected_type" TEXT,
        "checksum_sha256" TEXT,
        "thumbnail_key" TEXT,
        "preview_key" TEXT,
        "preview_url" TEXT,
        "generation" BIGINT NOT NULL DEFAULT 1,
        "failure_reason" TEXT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await sql(`
      CREATE TABLE IF NOT EXISTS "event_cover_upload_intent" (
        "id" UUID PRIMARY KEY,
        "event_id" UUID NOT NULL,
        "owner_id" UUID NOT NULL,
        "asset_id" UUID NOT NULL,
        "declared_size" BIGINT NOT NULL,
        "declared_type" TEXT NOT NULL,
        "staging_key" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'AUTHORIZED',
        "idempotency_key" TEXT,
        "idempotency_payload_hash" TEXT,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  });

  beforeEach(async () => {
    recordedAudits.length = 0;
    storagePort.objects.clear();
    storagePort.deletedKeys.length = 0;

    await sql('DELETE FROM event_cover_asset');
    await sql('DELETE FROM event_cover_upload_intent');
    await sql('DELETE FROM event');

    ownerContext = {
      actorType: 'ORGANIZER_HUMAN',
      accountId: randomUUID(),
      email: 'owner@eventlens.local',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };

    otherContext = {
      actorType: 'ORGANIZER_HUMAN',
      accountId: randomUUID(),
      email: 'other@eventlens.local',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };

    eventId = randomUUID();
    await sql(
      `INSERT INTO event (
        id, organizer_id, name, status, timezone, uploads_enabled, guest_gallery_enabled,
        moderation_mode, pin_enabled, welcome_message, cover_asset_id, created_at, updated_at
      ) VALUES ($1, $2, $3, 'DRAFT', 'America/Bogota', false, false, 'AUTO_PUBLISH', false, null, null, NOW(), NOW())`,
      eventId,
      ownerContext.accountId,
      'Gala Anual EventLens 2026'
    );
  });

  // =========================================================================
  // EL-TK-049: Authorize and Confirm Cover Upload in Real DB
  // =========================================================================
  it('EL-TK-049: authorizes and confirms cover upload with durable storage verification', async () => {
    // 1. Authorize
    const createRes = await service.createCoverUpload({
      actorContext: ownerContext,
      eventId,
      declaredSize: 8_500_000n,
      declaredType: 'image/png'
    });

    expect(createRes.outcome).toBe('AUTHORIZED');
    expect(createRes.intent.status).toBe('AUTHORIZED');

    // Verify row persisted in real PostgreSQL
    const intentRows = await query<any>(
      `SELECT * FROM event_cover_upload_intent WHERE id = $1`,
      createRes.intent.id
    );
    expect(intentRows).toHaveLength(1);
    expect(intentRows[0].status).toBe('AUTHORIZED');
    expect(intentRows[0].event_id).toBe(eventId);

    // 2. Put object in mock storage
    storagePort.objects.set(createRes.intent.stagingKey, {
      sizeBytes: 8_500_000n,
      contentType: 'image/png'
    });

    // 3. Confirm
    const confirmRes = await service.confirmCoverUpload({
      actorContext: ownerContext,
      intentId: createRes.intent.id
    });

    expect(confirmRes.outcome).toBe('CONFIRMED');
    expect(confirmRes.asset.status).toBe('RECEIVED');
    expect(confirmRes.asset.actualSize).toBe(8_500_000n);

    // Verify intent transitioned to CONFIRMED and cover asset inserted in DB
    const updatedIntent = await query<any>(
      `SELECT status FROM event_cover_upload_intent WHERE id = $1`,
      createRes.intent.id
    );
    expect(updatedIntent[0].status).toBe('CONFIRMED');

    const assetRows = await query<any>(
      `SELECT * FROM event_cover_asset WHERE id = $1`,
      confirmRes.asset.id
    );
    expect(assetRows).toHaveLength(1);
    expect(assetRows[0].status).toBe('RECEIVED');
    expect(assetRows[0].event_id).toBe(eventId);
  });

  // =========================================================================
  // EL-TK-050: Secure Cover Asset Processing
  // =========================================================================
  it('EL-TK-050: processes cover asset to READY with web derivatives and SHA256 checksum', async () => {
    // Upload & confirm
    const createRes = await service.createCoverUpload({
      actorContext: ownerContext,
      eventId,
      declaredSize: 3_000_000n,
      declaredType: 'image/jpeg'
    });
    storagePort.objects.set(createRes.intent.stagingKey, {
      sizeBytes: 3_000_000n,
      contentType: 'image/jpeg'
    });
    const confirmRes = await service.confirmCoverUpload({
      actorContext: ownerContext,
      intentId: createRes.intent.id
    });

    // Process
    const processRes = await service.processCoverAsset({
      assetId: confirmRes.asset.id,
      headerBytes: Buffer.from('\xFF\xD8\xFF\xE0\x00\x10JFIF\x00_VALID_SAMPLE'),
      checksumSha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
    });

    expect(processRes.status).toBe('READY');
    expect(processRes.asset.status).toBe('READY');
    expect(processRes.asset.thumbnailKey).toBe(`covers/${eventId}/${confirmRes.asset.id}_thumb.webp`);
    expect(processRes.asset.previewKey).toBe(`covers/${eventId}/${confirmRes.asset.id}_preview.webp`);
    expect(processRes.asset.previewUrl).toContain(confirmRes.asset.id);

    // Verify DB update
    const dbAsset = await query<any>(
      `SELECT * FROM event_cover_asset WHERE id = $1`,
      confirmRes.asset.id
    );
    expect(dbAsset[0].status).toBe('READY');
    expect(dbAsset[0].checksum_sha256).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
  });

  // =========================================================================
  // EL-TK-051: Assign READY Cover Asset via CAS
  // =========================================================================
  it('EL-TK-051: assigns READY cover asset atomically and enforces CAS revision checks', async () => {
    // Prepare READY asset
    const createRes = await service.createCoverUpload({
      actorContext: ownerContext,
      eventId,
      declaredSize: 2_000_000n,
      declaredType: 'image/jpeg'
    });
    storagePort.objects.set(createRes.intent.stagingKey, {
      sizeBytes: 2_000_000n,
      contentType: 'image/jpeg'
    });
    const confirmRes = await service.confirmCoverUpload({
      actorContext: ownerContext,
      intentId: createRes.intent.id
    });
    const processRes = await service.processCoverAsset({
      assetId: confirmRes.asset.id,
      headerBytes: Buffer.from('VALID_HEADER_JPEG')
    });

    // CAS Mismatch test
    await expect(
      service.assignCoverAsset({
        actorContext: ownerContext,
        eventId,
        assetId: processRes.asset.id,
        expectedCoverRevision: '1234567890'
      })
    ).rejects.toMatchObject({ code: 'CONCURRENCY_CONFLICT' });

    // Correct assignment
    const assignRes = await service.assignCoverAsset({
      actorContext: ownerContext,
      eventId,
      assetId: processRes.asset.id
    });

    expect(assignRes.outcome).toBe('ASSIGNED');
    expect(assignRes.assignedAssetId).toBe(processRes.asset.id);
    expect(assignRes.previousCoverAssetId).toBeNull();

    // Verify in real event table
    const eventRow = await query<any>(`SELECT cover_asset_id FROM event WHERE id = $1`, eventId);
    expect(eventRow[0].cover_asset_id).toBe(processRes.asset.id);
  });

  // =========================================================================
  // EL-TK-052: Asynchronous Cover Cleanup & Active Cover Protection
  // =========================================================================
  it('EL-TK-052: cleans up superseded and failed covers while strictly preserving active cover', async () => {
    // 1. Create and assign Cover 1
    const u1 = await service.createCoverUpload({ actorContext: ownerContext, eventId, declaredSize: 1_000_000n, declaredType: 'image/jpeg' });
    storagePort.objects.set(u1.intent.stagingKey, { sizeBytes: 1_000_000n, contentType: 'image/jpeg' });
    const c1 = await service.confirmCoverUpload({ actorContext: ownerContext, intentId: u1.intent.id });
    const p1 = await service.processCoverAsset({ assetId: c1.asset.id, headerBytes: Buffer.from('HEADER_1') });
    await service.assignCoverAsset({ actorContext: ownerContext, eventId, assetId: p1.asset.id });
    const cover1Id = p1.asset.id;

    // 2. Create and assign Cover 2 (superseding Cover 1)
    const u2 = await service.createCoverUpload({ actorContext: ownerContext, eventId, declaredSize: 2_000_000n, declaredType: 'image/png' });
    storagePort.objects.set(u2.intent.stagingKey, { sizeBytes: 2_000_000n, contentType: 'image/png' });
    const c2 = await service.confirmCoverUpload({ actorContext: ownerContext, intentId: u2.intent.id });
    const p2 = await service.processCoverAsset({ assetId: c2.asset.id, headerBytes: Buffer.from('HEADER_2') });
    await service.assignCoverAsset({ actorContext: ownerContext, eventId, assetId: p2.asset.id });
    const cover2Id = p2.asset.id;

    // Set derivative keys in mock storage for cleanup verification
    storagePort.objects.set(p1.asset.thumbnailKey!, { sizeBytes: 50n, contentType: 'image/webp' });
    storagePort.objects.set(p1.asset.previewKey!, { sizeBytes: 150n, contentType: 'image/webp' });

    // 3. Create Cover 3 which fails processing
    const u3 = await service.createCoverUpload({ actorContext: ownerContext, eventId, declaredSize: 500_000n, declaredType: 'image/jpeg' });
    storagePort.objects.set(u3.intent.stagingKey, { sizeBytes: 500_000n, contentType: 'image/jpeg' });
    const c3 = await service.confirmCoverUpload({ actorContext: ownerContext, intentId: u3.intent.id });
    await service.processCoverAsset({ assetId: c3.asset.id, headerBytes: Buffer.from('CORRUPTED_BYTES') });
    const cover3Id = c3.asset.id;

    // Verify current active cover is Cover 2
    const eventRow = await query<any>(`SELECT cover_asset_id FROM event WHERE id = $1`, eventId);
    expect(eventRow[0].cover_asset_id).toBe(cover2Id);

    // 4. Run cleanupCoverAssets
    const cleanupRes = await service.cleanupCoverAssets({ eventId });

    expect(cleanupRes.outcome).toBe('CLEANED_UP');
    expect(cleanupRes.preservedActiveAssetId).toBe(cover2Id);
    expect(cleanupRes.cleanedAssetIds).toContain(cover1Id);
    expect(cleanupRes.cleanedAssetIds).toContain(cover3Id);
    expect(cleanupRes.cleanedAssetIds).not.toContain(cover2Id);

    // Verify DB states
    const asset1 = await query<any>(`SELECT status FROM event_cover_asset WHERE id = $1`, cover1Id);
    expect(asset1[0].status).toBe('DELETED');

    const asset2 = await query<any>(`SELECT status FROM event_cover_asset WHERE id = $1`, cover2Id);
    expect(asset2[0].status).toBe('READY');

    const asset3 = await query<any>(`SELECT status FROM event_cover_asset WHERE id = $1`, cover3Id);
    expect(asset3[0].status).toBe('DELETED');

    // Verify storage: superseded files deleted, active original preserved
    expect(storagePort.deletedKeys).toContain(u1.intent.stagingKey);
    expect(storagePort.deletedKeys).not.toContain(u2.intent.stagingKey);

    // 5. Verify getActiveCoverForEvent returns Cover 2
    const activeCover = await service.getActiveCoverForEvent(eventId);
    expect(activeCover).not.toBeNull();
    expect(activeCover?.id).toBe(cover2Id);

    // 6. Verify previewDraftAsGuest returns the cover preview URL
    const preview = await draftService.previewDraftAsGuest({
      actorContext: ownerContext,
      eventId
    });
    expect(preview.snapshot.coverPreviewUrl).toBe(activeCover?.previewUrl);
    expect(preview.snapshot.coverPreviewUrl).toContain(cover2Id);
  });
});
