import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { GuestGalleryService } from '../src/guest-gallery.js';
import { MediaGalleryError, type TransactionRunner, type SqlTransaction } from '../src/contracts.js';

function createMockRunner(queryHandler: (sql: string, params: unknown[]) => Promise<any[]>): TransactionRunner {
  const tx: SqlTransaction = {
    query: vi.fn(async (sql: string, ...params: unknown[]) => queryHandler(sql, params)),
    execute: vi.fn(async () => 0)
  };
  return {
    run: vi.fn(async (callback) => callback(tx))
  };
}

describe('GuestGalleryService (EL-TK-096)', () => {
  const eventId = '11111111-1111-1111-1111-111111111111';
  const otherEventId = '22222222-2222-2222-2222-222222222222';
  const validSessionToken = 'valid-guest-token-12345';
  const tokenHash = createHash('sha256').update(validSessionToken).digest('hex');

  const baseEventRow = {
    id: eventId,
    name: 'Boda de Prueba',
    status: 'ACTIVE',
    timezone: 'America/Bogota',
    organizer_id: '33333333-3333-3333-3333-333333333333',
    guest_gallery_enabled: true,
    uploads_enabled: true,
    pin_enabled: false,
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

  const baseSessionRow = {
    id: '44444444-4444-4444-4444-444444444444',
    event_id: eventId,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 1000 * 60 * 60),
    revoked_at: null
  };

  it('Escenario 1: retorna únicamente media PUBLISHED autorizada del evento', async () => {
    const publishedMedia = [
      {
        media_ref: 'media:photo-1',
        event_ref: eventId,
        status: 'PUBLISHED',
        original: JSON.stringify({ mediaType: 'PHOTO', mimeType: 'image/jpeg', format: 'jpg' }),
        published_at: new Date('2026-10-12T12:00:00Z'),
        thumbnail_ref: JSON.stringify({ width: 400, height: 300, format: 'webp', bytes: 15000 })
      },
      {
        media_ref: 'media:video-1',
        event_ref: eventId,
        status: 'PUBLISHED',
        original: JSON.stringify({ mediaType: 'VIDEO', mimeType: 'video/mp4', durationSeconds: 45 }),
        published_at: new Date('2026-10-12T11:00:00Z'),
        thumbnail_ref: JSON.stringify({ width: 400, height: 300, format: 'webp', bytes: 18000 })
      }
    ];

    const runner = createMockRunner(async (sql, params) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM guest_session')) return [baseSessionRow];
      if (sql.includes('FROM media_catalog')) return publishedMedia;
      return [];
    });

    const service = new GuestGalleryService(runner);
    const snapshot = await service.queryGuestGallery({
      eventId,
      guestSessionToken: validSessionToken
    });

    expect(snapshot.status).toBe('ACTIVE');
    expect(snapshot.items).toHaveLength(2);
    expect(snapshot.items[0]).toEqual({
      mediaId: 'photo-1',
      mediaType: 'PHOTO',
      publishedAt: '2026-10-12T12:00:00.000Z',
      thumbnail: {
        role: 'THUMBNAIL',
        width: 400,
        height: 300,
        format: 'webp',
        bytes: 15000
      },
      durationSeconds: undefined,
      aspectRatio: undefined
    });
    expect(snapshot.items[1]).toEqual({
      mediaId: 'video-1',
      mediaType: 'VIDEO',
      publishedAt: '2026-10-12T11:00:00.000Z',
      thumbnail: {
        role: 'THUMBNAIL',
        width: 400,
        height: 300,
        format: 'webp',
        bytes: 18000
      },
      durationSeconds: 45,
      aspectRatio: undefined
    });
    expect(snapshot.capabilities.canViewGallery).toBe(true);
    expect(snapshot.capabilities.canUpload).toBe(true);
  });

  it('Escenario 2: retorna GALLERY_DISABLED cuando guest_gallery_enabled es false', async () => {
    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) {
        return [{ ...baseEventRow, guest_gallery_enabled: false }];
      }
      return [];
    });

    const service = new GuestGalleryService(runner);
    const snapshot = await service.queryGuestGallery({
      eventId,
      guestSessionToken: validSessionToken
    });

    expect(snapshot.status).toBe('GALLERY_DISABLED');
    expect(snapshot.items).toEqual([]);
    expect(snapshot.capabilities.canViewGallery).toBe(false);
  });

  it('Escenario 2: retorna GALLERY_DISABLED cuando el evento está en status incompatible (SCHEDULED o SUSPENDED)', async () => {
    const runnerScheduled = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) {
        return [{ ...baseEventRow, status: 'SCHEDULED' }];
      }
      return [];
    });

    const serviceScheduled = new GuestGalleryService(runnerScheduled);
    const snapshot = await serviceScheduled.queryGuestGallery({ eventId });
    expect(snapshot.status).toBe('GALLERY_DISABLED');
    expect(snapshot.capabilities.canViewGallery).toBe(false);

    const runnerSuspended = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) {
        return [{ ...baseEventRow, status: 'SUSPENDED', guest_gallery_enabled: true }];
      }
      return [];
    });

    const serviceSuspended = new GuestGalleryService(runnerSuspended);
    const snapshotSuspended = await serviceSuspended.queryGuestGallery({ eventId });
    expect(snapshotSuspended.status).toBe('GALLERY_DISABLED');
    expect(snapshotSuspended.capabilities.canViewGallery).toBe(false);
  });

  it('Escenario 2: rechaza con ACCESS_REVOKED si la sesión fue revocada', async () => {
    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM guest_session')) {
        return [{ ...baseSessionRow, revoked_at: new Date() }];
      }
      return [];
    });

    const service = new GuestGalleryService(runner);
    await expect(
      service.queryGuestGallery({
        eventId,
        guestSessionToken: validSessionToken
      })
    ).rejects.toMatchObject({
      name: 'MediaGalleryError',
      code: 'ACCESS_REVOKED'
    });
  });

  it('Escenario 2: rechaza con SESSION_EXPIRED si la sesión ha expirado', async () => {
    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM guest_session')) {
        return [{ ...baseSessionRow, expires_at: new Date(Date.now() - 1000) }];
      }
      return [];
    });

    const service = new GuestGalleryService(runner);
    await expect(
      service.queryGuestGallery({
        eventId,
        guestSessionToken: validSessionToken
      })
    ).rejects.toMatchObject({
      name: 'MediaGalleryError',
      code: 'SESSION_EXPIRED'
    });
  });

  it('Escenario 3: retorna EMPTY_GALLERY cuando no hay publicaciones en un evento que admite galería', async () => {
    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM guest_session')) return [baseSessionRow];
      if (sql.includes('FROM media_catalog')) return [];
      return [];
    });

    const service = new GuestGalleryService(runner);
    const snapshot = await service.queryGuestGallery({
      eventId,
      guestSessionToken: validSessionToken
    });

    expect(snapshot.status).toBe('EMPTY_GALLERY');
    expect(snapshot.items).toHaveLength(0);
    expect(snapshot.capabilities.canViewGallery).toBe(true);
  });

  it('Escenario 4: paginación determinística con cursor estable sin duplicados', async () => {
    const date1 = new Date('2026-10-12T12:00:00Z');
    const date2 = new Date('2026-10-12T11:00:00Z');
    const date3 = new Date('2026-10-12T10:00:00Z');

    const runner = createMockRunner(async (sql, params) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM guest_session')) return [baseSessionRow];
      if (sql.includes('FROM media_catalog')) {
        // If cursor is passed, params length is 5 ($1, $2, $3, $4, $5), otherwise 3 ($1, $2, $3)
        if (params.length > 3) {
          return [
            {
              media_ref: 'media:item-3',
              event_ref: eventId,
              status: 'PUBLISHED',
              original: {},
              published_at: date3,
              thumbnail_ref: null
            }
          ];
        }
        return [
          {
            media_ref: 'media:item-1',
            event_ref: eventId,
            status: 'PUBLISHED',
            original: {},
            published_at: date1,
            thumbnail_ref: null
          },
          {
            media_ref: 'media:item-2',
            event_ref: eventId,
            status: 'PUBLISHED',
            original: {},
            published_at: date2,
            thumbnail_ref: null
          },
          {
            media_ref: 'media:item-3',
            event_ref: eventId,
            status: 'PUBLISHED',
            original: {},
            published_at: date3,
            thumbnail_ref: null
          }
        ];
      }
      return [];
    });

    const service = new GuestGalleryService(runner);

    // Página 1
    const page1 = await service.queryGuestGallery({
      eventId,
      guestSessionToken: validSessionToken,
      limit: 2
    });

    expect(page1.items).toHaveLength(2);
    expect(page1.items[0]!.mediaId).toBe('item-1');
    expect(page1.items[1]!.mediaId).toBe('item-2');
    expect(page1.pagination.hasMore).toBe(true);
    expect(page1.pagination.nextCursor).toBeDefined();

    // Página 2 usando nextCursor
    const page2 = await service.queryGuestGallery({
      eventId,
      guestSessionToken: validSessionToken,
      limit: 2,
      cursor: page1.pagination.nextCursor
    });

    expect(page2.items).toHaveLength(1);
    expect(page2.items[0]!.mediaId).toBe('item-3');
    expect(page2.pagination.hasMore).toBe(false);
    expect(page2.pagination.nextCursor).toBeUndefined();
  });

  it('Aislamiento entre eventos: rechaza sesión que pertenece a otro evento', async () => {
    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM guest_session')) {
        return [{ ...baseSessionRow, event_id: otherEventId }];
      }
      return [];
    });

    const service = new GuestGalleryService(runner);
    await expect(
      service.queryGuestGallery({
        eventId,
        guestSessionToken: validSessionToken
      })
    ).rejects.toMatchObject({
      name: 'MediaGalleryError',
      code: 'INVALID_CREDENTIAL'
    });
  });

  it('Guarda de PIN: exige PIN_REQUIRED si el evento tiene PIN y se accede sin sesión', async () => {
    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) {
        return [{ ...baseEventRow, pin_enabled: true }];
      }
      return [];
    });

    const service = new GuestGalleryService(runner);
    await expect(
      service.queryGuestGallery({ eventId })
    ).rejects.toMatchObject({
      name: 'MediaGalleryError',
      code: 'PIN_REQUIRED'
    });
  });

  it('Evento no encontrado o en estado terminal: lanza EVENT_NOT_FOUND', async () => {
    const runnerNotFound = createMockRunner(async () => []);
    const serviceNotFound = new GuestGalleryService(runnerNotFound);
    await expect(serviceNotFound.queryGuestGallery({ eventId })).rejects.toMatchObject({
      name: 'MediaGalleryError',
      code: 'EVENT_NOT_FOUND'
    });

    const runnerDeleted = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [{ ...baseEventRow, status: 'DELETED' }];
      return [];
    });
    const serviceDeleted = new GuestGalleryService(runnerDeleted);
    await expect(serviceDeleted.queryGuestGallery({ eventId })).rejects.toMatchObject({
      name: 'MediaGalleryError',
      code: 'EVENT_NOT_FOUND'
    });
  });

  it('Acceso público por lookupKey: permite consulta si el evento no exige PIN', async () => {
    const credRow = {
      id: '55555555-5555-5555-5555-555555555555',
      event_id: eventId,
      lookup_key: 'public-qr-key-1',
      pin_required: false,
      revoked_at: null
    };

    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM public_access_credential')) return [credRow];
      if (sql.includes('FROM media_catalog')) return [];
      return [];
    });

    const service = new GuestGalleryService(runner);
    const snapshot = await service.queryGuestGallery({
      eventId,
      publicLookupKey: 'public-qr-key-1'
    });

    expect(snapshot.status).toBe('EMPTY_GALLERY');
    expect(snapshot.capabilities.canViewGallery).toBe(true);
  });

  it('Acceso público por lookupKey: exige PIN si la credencial lo requiere', async () => {
    const credRow = {
      id: '55555555-5555-5555-5555-555555555555',
      event_id: eventId,
      lookup_key: 'public-qr-key-1',
      pin_required: true,
      revoked_at: null
    };

    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM public_access_credential')) return [credRow];
      return [];
    });

    const service = new GuestGalleryService(runner);
    await expect(
      service.queryGuestGallery({
        eventId,
        publicLookupKey: 'public-qr-key-1'
      })
    ).rejects.toMatchObject({
      name: 'MediaGalleryError',
      code: 'PIN_REQUIRED'
    });
  });

  it('Observabilidad: registra auditoría sin exponer tokens completos', async () => {
    const recordedEvents: any[] = [];
    const auditSink = {
      record: vi.fn(async (e) => {
        recordedEvents.push(e);
      })
    };

    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM guest_session')) return [baseSessionRow];
      if (sql.includes('FROM media_catalog')) return [];
      return [];
    });

    const service = new GuestGalleryService(runner, auditSink);
    await service.queryGuestGallery({
      eventId,
      guestSessionToken: validSessionToken
    });

    expect(recordedEvents).toHaveLength(1);
    expect(recordedEvents[0]).toMatchObject({
      procedure: 'GUEST_GALLERY_QUERY',
      eventId,
      itemCount: 0
    });
    // Verifica que el token completo no esté expuesto en la auditoría
    expect(JSON.stringify(recordedEvents[0])).not.toContain(validSessionToken);
  });
});
