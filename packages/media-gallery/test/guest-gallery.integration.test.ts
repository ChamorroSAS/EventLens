import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import { GuestGalleryService, MediaGalleryError } from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('GuestGalleryService (PostgreSQL 16 Integration Tests — EL-TK-096)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  let service: GuestGalleryService;
  const eventId = randomUUID();
  const guestToken = `token-${randomUUID()}`;
  const tokenHash = createHash('sha256').update(guestToken).digest('hex');

  beforeAll(async () => {
    service = new GuestGalleryService(txs);

    // Setup base tables if running standalone
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
        uploads_enabled BOOLEAN NOT NULL DEFAULT true,
        guest_gallery_enabled BOOLEAN NOT NULL DEFAULT true,
        moderation_mode TEXT NOT NULL DEFAULT 'AUTO_PUBLISH',
        pin_enabled BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await sql(`
      CREATE TABLE IF NOT EXISTS guest_session (
        id UUID PRIMARY KEY,
        event_id UUID NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        credential_generation INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        consent_recorded_at TIMESTAMPTZ,
        consent_version TEXT,
        contributor_nickname TEXT
      );
    `);

    await sql(`
      CREATE TABLE IF NOT EXISTS public_access_credential (
        id UUID PRIMARY KEY,
        event_id UUID NOT NULL,
        lookup_key TEXT NOT NULL UNIQUE,
        token_hash TEXT NOT NULL,
        generation INT NOT NULL DEFAULT 1,
        pin_required BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revoked_at TIMESTAMPTZ
      );
    `);

    await sql(`
      CREATE TABLE IF NOT EXISTS media_catalog (
        media_ref TEXT PRIMARY KEY,
        intent_id TEXT NOT NULL DEFAULT 'intent-1',
        event_ref TEXT NOT NULL,
        guest_ref TEXT NOT NULL DEFAULT 'guest-1',
        generation BIGINT NOT NULL DEFAULT 1,
        revision BIGINT NOT NULL DEFAULT 1,
        status TEXT NOT NULL,
        original JSONB NOT NULL,
        job_id UUID NOT NULL DEFAULT gen_random_uuid()
      );
    `);

    await sql(`
      CREATE TABLE IF NOT EXISTS media_promotion_receipt (
        operation_id TEXT PRIMARY KEY,
        media_ref TEXT NOT NULL,
        generation BIGINT NOT NULL DEFAULT 1,
        previous_revision BIGINT NOT NULL DEFAULT 1,
        revision BIGINT NOT NULL DEFAULT 2,
        job_id UUID NOT NULL DEFAULT gen_random_uuid(),
        token UUID NOT NULL DEFAULT gen_random_uuid(),
        epoch TEXT NOT NULL DEFAULT 'epoch-1',
        candidate_fingerprint TEXT NOT NULL DEFAULT 'fingerprint',
        candidate JSONB NOT NULL DEFAULT '{}'::jsonb,
        governance JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT NOT NULL,
        committed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await sql(`
      CREATE TABLE IF NOT EXISTS media_active_derivative (
        media_ref TEXT NOT NULL,
        generation BIGINT NOT NULL DEFAULT 1,
        role TEXT NOT NULL,
        reference JSONB NOT NULL,
        operation_id TEXT NOT NULL DEFAULT 'op-1',
        PRIMARY KEY (media_ref, generation, role)
      );
    `);
  });

  beforeEach(async () => {
    // Clear test rows
    await sql(`DELETE FROM media_active_derivative WHERE media_ref LIKE 'media:%'`);
    await sql(`DELETE FROM media_promotion_receipt WHERE media_ref LIKE 'media:%'`);
    await sql(`DELETE FROM media_catalog WHERE event_ref = $1`, eventId);
    await sql(`DELETE FROM guest_session WHERE event_id = $1::uuid`, eventId);
    await sql(`DELETE FROM event WHERE id = $1::uuid`, eventId);

    // Insert active event
    await sql(
      `INSERT INTO event (id, organizer_id, name, status, guest_gallery_enabled, uploads_enabled, activated_at)
       VALUES ($1::uuid, $2::uuid, 'Test Wedding', 'ACTIVE', true, true, NOW())`,
      eventId,
      randomUUID()
    );

    // Insert guest session
    await sql(
      `INSERT INTO guest_session (id, event_id, token_hash, expires_at)
       VALUES ($1::uuid, $2::uuid, $3, NOW() + INTERVAL '1 hour')`,
      randomUUID(),
      eventId,
      tokenHash
    );
  });

  it('retorna galería vacía cuando el evento admite galería pero no hay publicaciones', async () => {
    const snapshot = await service.queryGuestGallery({
      eventId,
      guestSessionToken: guestToken
    });

    expect(snapshot.status).toBe('EMPTY_GALLERY');
    expect(snapshot.items).toHaveLength(0);
    expect(snapshot.capabilities.canViewGallery).toBe(true);
  });

  it('retorna únicamente fotos y videos en status PUBLISHED excluyendo otros estados', async () => {
    const publishedMediaId = randomUUID();
    const uploadedMediaId = randomUUID();
    const quarantinedMediaId = randomUUID();

    // 1. Published media
    await sql(
      `INSERT INTO media_catalog (media_ref, event_ref, status, original)
       VALUES ($1, $2, 'PUBLISHED', $3::jsonb)`,
      `media:${publishedMediaId}`,
      eventId,
      JSON.stringify({ mediaType: 'PHOTO', mimeType: 'image/jpeg' })
    );

    await sql(
      `INSERT INTO media_promotion_receipt (operation_id, media_ref, status, committed_at)
       VALUES ($1, $2, 'PUBLISHED', NOW())`,
      randomUUID(),
      `media:${publishedMediaId}`
    );

    await sql(
      `INSERT INTO media_active_derivative (media_ref, role, reference)
       VALUES ($1, 'THUMBNAIL', $2::jsonb)`,
      `media:${publishedMediaId}`,
      JSON.stringify({ width: 300, height: 300, format: 'webp', bytes: 12000 })
    );

    // 2. Uploaded media (must be excluded)
    await sql(
      `INSERT INTO media_catalog (media_ref, event_ref, status, original)
       VALUES ($1, $2, 'UPLOADED', '{}'::jsonb)`,
      `media:${uploadedMediaId}`,
      eventId
    );

    // 3. Quarantined media (must be excluded)
    await sql(
      `INSERT INTO media_catalog (media_ref, event_ref, status, original)
       VALUES ($1, $2, 'QUARANTINED', '{}'::jsonb)`,
      `media:${quarantinedMediaId}`,
      eventId
    );

    const snapshot = await service.queryGuestGallery({
      eventId,
      guestSessionToken: guestToken
    });

    expect(snapshot.status).toBe('ACTIVE');
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]!.mediaId).toBe(publishedMediaId);
    expect(snapshot.items[0]!.mediaType).toBe('PHOTO');
    expect(snapshot.items[0]!.thumbnail?.format).toBe('webp');
  });

  it('aislamiento estricto: no retorna publicaciones de otros eventos', async () => {
    const foreignEventId = randomUUID();
    const foreignMediaId = randomUUID();

    await sql(
      `INSERT INTO media_catalog (media_ref, event_ref, status, original)
       VALUES ($1, $2, 'PUBLISHED', $3::jsonb)`,
      `media:${foreignMediaId}`,
      foreignEventId,
      JSON.stringify({ mediaType: 'PHOTO' })
    );

    await sql(
      `INSERT INTO media_promotion_receipt (operation_id, media_ref, status, committed_at)
       VALUES ($1, $2, 'PUBLISHED', NOW())`,
      randomUUID(),
      `media:${foreignMediaId}`
    );

    const snapshot = await service.queryGuestGallery({
      eventId,
      guestSessionToken: guestToken
    });

    expect(snapshot.items).toHaveLength(0);
    expect(snapshot.status).toBe('EMPTY_GALLERY');
  });
});
