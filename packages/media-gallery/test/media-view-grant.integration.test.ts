import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  MediaViewGrantService,
  MediaGalleryError,
  type ObjectStorageDownloadSigner
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('MediaViewGrantService (PostgreSQL 16 Integration Tests — EL-TK-097)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  const mockSigner: ObjectStorageDownloadSigner = {
    createDownloadUrl: async ({ namespace, key, ttlSeconds }) => {
      return `https://s3.local/${namespace}/${key}?exp=${ttlSeconds}`;
    }
  };

  let service: MediaViewGrantService;
  const eventId = randomUUID();
  const organizerId = randomUUID();
  const guestToken = `token-integration-${randomUUID()}`;
  const tokenHash = createHash('sha256').update(guestToken).digest('hex');

  beforeAll(async () => {
    service = new MediaViewGrantService(txs, mockSigner);

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
    await sql(`DELETE FROM media_active_derivative WHERE media_ref LIKE 'media:%'`);
    await sql(`DELETE FROM media_catalog WHERE event_ref = $1`, eventId);
    await sql(`DELETE FROM guest_session WHERE event_id = $1::uuid`, eventId);
    await sql(`DELETE FROM event WHERE id = $1::uuid`, eventId);

    await sql(
      `INSERT INTO event (id, organizer_id, name, status, guest_gallery_enabled, uploads_enabled, activated_at)
       VALUES ($1::uuid, $2::uuid, 'Integration Wedding', 'ACTIVE', true, true, NOW())`,
      eventId,
      organizerId
    );

    await sql(
      `INSERT INTO guest_session (id, event_id, token_hash, expires_at)
       VALUES ($1::uuid, $2::uuid, $3, NOW() + INTERVAL '1 hour')`,
      randomUUID(),
      eventId,
      tokenHash
    );
  });

  it('emite grant temporal para foto PUBLISHED consultada por invitado con sesión válida', async () => {
    const mediaId = randomUUID();

    await sql(
      `INSERT INTO media_catalog (media_ref, event_ref, status, original)
       VALUES ($1, $2, 'PUBLISHED', $3::jsonb)`,
      `media:${mediaId}`,
      eventId,
      JSON.stringify({ mediaType: 'PHOTO', mimeType: 'image/jpeg' })
    );

    await sql(
      `INSERT INTO media_active_derivative (media_ref, role, reference)
       VALUES ($1, 'PREVIEW', $2::jsonb)`,
      `media:${mediaId}`,
      JSON.stringify({ namespace: 'bucket-preview', key: 'keys/photo.webp' })
    );

    const grant = await service.requestViewGrant({
      eventId,
      mediaId,
      actor: { actorType: 'GUEST', guestSessionToken: guestToken }
    });

    expect(grant.mediaId).toBe(mediaId);
    expect(grant.role).toBe('PREVIEW');
    expect(grant.downloadUrl).toContain('bucket-preview/keys/photo.webp');
  });

  it('deniega emisión de URL si la media está en cuarentena o retirada', async () => {
    const quarantinedId = randomUUID();

    await sql(
      `INSERT INTO media_catalog (media_ref, event_ref, status, original)
       VALUES ($1, $2, 'QUARANTINED', $3::jsonb)`,
      `media:${quarantinedId}`,
      eventId,
      JSON.stringify({ mediaType: 'PHOTO' })
    );

    await expect(
      service.requestViewGrant({
        eventId,
        mediaId: quarantinedId,
        actor: { actorType: 'GUEST', guestSessionToken: guestToken }
      })
    ).rejects.toMatchObject({
      code: 'MEDIA_UNAVAILABLE'
    });
  });
});
