import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { MediaViewGrantService } from '../src/media-view-grant.js';
import {
  MediaGalleryError,
  type TransactionRunner,
  type SqlTransaction,
  type ObjectStorageDownloadSigner
} from '../src/contracts.js';

function createMockRunner(queryHandler: (sql: string, params: unknown[]) => Promise<any[]>): TransactionRunner {
  const tx: SqlTransaction = {
    query: vi.fn(async (sql: string, ...params: unknown[]) => queryHandler(sql, params)),
    execute: vi.fn(async () => 0)
  };
  return {
    run: vi.fn(async (callback) => callback(tx))
  };
}

describe('MediaViewGrantService (EL-TK-097)', () => {
  const eventId = '11111111-1111-1111-1111-111111111111';
  const organizerId = '33333333-3333-3333-3333-333333333333';
  const mediaId = 'media-photo-1';
  const validGuestToken = 'token-guest-view-123';
  const tokenHash = createHash('sha256').update(validGuestToken).digest('hex');

  const baseEventRow = {
    id: eventId,
    name: 'Evento Principal',
    status: 'ACTIVE',
    organizer_id: organizerId,
    guest_gallery_enabled: true,
    uploads_enabled: true,
    pin_enabled: false,
    timezone: 'America/Bogota',
    starts_at_local: '2026-10-12T10:00:00',
    scheduled_at: null,
    expires_at: new Date('2026-10-15T00:00:00Z'),
    grace_ends_at: null,
    activated_at: new Date('2026-10-12T00:00:00Z'),
    closed_at: null,
    purge_started_at: null,
    suspended_at: null,
    suspension_reason: null,
    previous_status: null,
    validity_duration_days: 7,
    grace_days: 3,
    moderation_mode: 'AUTO_PUBLISH'
  };

  const baseMediaRow = {
    media_ref: `media:${mediaId}`,
    event_ref: eventId,
    status: 'PUBLISHED',
    original: JSON.stringify({
      namespace: 'raw-bucket',
      key: 'originals/photo-1.jpg',
      mimeType: 'image/jpeg',
      mediaType: 'PHOTO'
    })
  };

  const baseDerivatives = [
    {
      role: 'THUMBNAIL',
      reference: JSON.stringify({ namespace: 'derivatives-bucket', key: 'thumbs/photo-1.webp' })
    },
    {
      role: 'PREVIEW',
      reference: JSON.stringify({ namespace: 'derivatives-bucket', key: 'previews/photo-1.webp' })
    }
  ];

  const baseSessionRow = {
    id: '44444444-4444-4444-4444-444444444444',
    event_id: eventId,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 1000 * 60 * 60),
    revoked_at: null
  };

  const mockSigner: ObjectStorageDownloadSigner = {
    createDownloadUrl: vi.fn(async ({ namespace, key, ttlSeconds }) => {
      return `https://storage.local/${namespace}/${key}?token=signed-ttl-${ttlSeconds}`;
    })
  };

  it('Escenario 1: Guest con sesión válida recibe grant de URL temporal limitado al derivado autorizado', async () => {
    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM media_catalog')) return [baseMediaRow];
      if (sql.includes('FROM guest_session')) return [baseSessionRow];
      if (sql.includes('FROM media_active_derivative')) return baseDerivatives;
      return [];
    });

    const service = new MediaViewGrantService(runner, mockSigner);
    const grant = await service.requestViewGrant({
      eventId,
      mediaId,
      actor: { actorType: 'GUEST', guestSessionToken: validGuestToken },
      preferredRole: 'PREVIEW',
      ttlSeconds: 600
    });

    expect(grant.grantId).toBeDefined();
    expect(grant.eventId).toBe(eventId);
    expect(grant.mediaId).toBe(mediaId);
    expect(grant.role).toBe('PREVIEW');
    expect(grant.mediaType).toBe('PHOTO');
    expect(grant.downloadUrl).toContain('derivatives-bucket/previews/photo-1.webp');
    // Nunca entrega el bucket u objeto del original (DEC-013, DEC-018)
    expect(grant.downloadUrl).not.toContain('raw-bucket');
    expect(grant.downloadUrl).not.toContain('originals/photo-1.jpg');
    expect(grant.ttlSeconds).toBe(600);
  });

  it('Escenario 2: Organizador propietario recibe grant de derivado según su biblioteca', async () => {
    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM media_catalog')) return [baseMediaRow];
      if (sql.includes('FROM media_active_derivative')) return baseDerivatives;
      return [];
    });

    const service = new MediaViewGrantService(runner, mockSigner);
    const grant = await service.requestViewGrant({
      eventId,
      mediaId,
      actor: { actorType: 'ORGANIZER', organizerAccountId: organizerId },
      preferredRole: 'THUMBNAIL'
    });

    expect(grant.role).toBe('THUMBNAIL');
    expect(grant.downloadUrl).toContain('derivatives-bucket/thumbs/photo-1.webp');
    expect(grant.ttlSeconds).toBe(900); // Default TTL
  });

  it('Escenario 3: Deniega a Guest visualización de media no publicada (UPLOADED o QUARANTINED)', async () => {
    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM media_catalog')) {
        return [{ ...baseMediaRow, status: 'UPLOADED' }];
      }
      return [];
    });

    const service = new MediaViewGrantService(runner, mockSigner);
    await expect(
      service.requestViewGrant({
        eventId,
        mediaId,
        actor: { actorType: 'GUEST', guestSessionToken: validGuestToken }
      })
    ).rejects.toMatchObject({
      name: 'MediaGalleryError',
      code: 'MEDIA_UNAVAILABLE'
    });
  });

  it('Escenario 3: Deniega si la sesión guest fue revocada antes de emitir el grant', async () => {
    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM media_catalog')) return [baseMediaRow];
      if (sql.includes('FROM guest_session')) {
        return [{ ...baseSessionRow, revoked_at: new Date() }];
      }
      return [];
    });

    const service = new MediaViewGrantService(runner, mockSigner);
    await expect(
      service.requestViewGrant({
        eventId,
        mediaId,
        actor: { actorType: 'GUEST', guestSessionToken: validGuestToken }
      })
    ).rejects.toMatchObject({
      name: 'MediaGalleryError',
      code: 'ACCESS_REVOKED'
    });
  });

  it('Escenario 3: Deniega a organizador ajeno al evento', async () => {
    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM media_catalog')) return [baseMediaRow];
      return [];
    });

    const service = new MediaViewGrantService(runner, mockSigner);
    await expect(
      service.requestViewGrant({
        eventId,
        mediaId,
        actor: { actorType: 'ORGANIZER', organizerAccountId: 'other-organizer-id' }
      })
    ).rejects.toMatchObject({
      name: 'MediaGalleryError',
      code: 'UNAUTHORIZED'
    });
  });

  it('Cross-event: Deniega si la media no pertenece al evento especificado', async () => {
    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM media_catalog')) {
        return [{ ...baseMediaRow, event_ref: 'other-event-id' }];
      }
      return [];
    });

    const service = new MediaViewGrantService(runner, mockSigner);
    await expect(
      service.requestViewGrant({
        eventId,
        mediaId,
        actor: { actorType: 'ORGANIZER', organizerAccountId: organizerId }
      })
    ).rejects.toMatchObject({
      name: 'MediaGalleryError',
      code: 'CROSS_EVENT_MISMATCH'
    });
  });

  it('Derivado no listo: lanza DERIVATIVE_NOT_READY si aún no existen derivados activos', async () => {
    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM media_catalog')) return [baseMediaRow];
      if (sql.includes('FROM media_active_derivative')) return [];
      return [];
    });

    const service = new MediaViewGrantService(runner, mockSigner);
    await expect(
      service.requestViewGrant({
        eventId,
        mediaId,
        actor: { actorType: 'ORGANIZER', organizerAccountId: organizerId }
      })
    ).rejects.toMatchObject({
      name: 'MediaGalleryError',
      code: 'DERIVATIVE_NOT_READY'
    });
  });

  it('Observabilidad: registra auditoría sin exponer URLs firmadas completas ni claves privadas', async () => {
    const recordedEvents: any[] = [];
    const auditSink = {
      record: vi.fn(async (e) => {
        recordedEvents.push(e);
      })
    };

    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM media_catalog')) return [baseMediaRow];
      if (sql.includes('FROM guest_session')) return [baseSessionRow];
      if (sql.includes('FROM media_active_derivative')) return baseDerivatives;
      return [];
    });

    const service = new MediaViewGrantService(runner, mockSigner, auditSink);
    const grant = await service.requestViewGrant({
      eventId,
      mediaId,
      actor: { actorType: 'GUEST', guestSessionToken: validGuestToken }
    });

    expect(recordedEvents).toHaveLength(1);
    expect(recordedEvents[0]).toMatchObject({
      procedure: 'MEDIA_VIEW_GRANT_ISSUED',
      eventId,
      mediaId,
      actorType: 'GUEST'
    });
    // No expone downloadUrl en auditoría
    expect(JSON.stringify(recordedEvents[0])).not.toContain(grant.downloadUrl);
  });
});
