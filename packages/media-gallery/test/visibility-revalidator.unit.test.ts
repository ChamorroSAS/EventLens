import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { MediaVisibilityRevalidator } from '../src/visibility-revalidator.js';
import {
  MediaGalleryError,
  type TransactionRunner,
  type SqlTransaction,
  type MediaGalleryAuditSink,
  type MediaGalleryAuditEvent
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

describe('MediaVisibilityRevalidator (EL-TK-101)', () => {
  const eventId = '11111111-1111-1111-1111-111111111111';
  const organizerId = '33333333-3333-3333-3333-333333333333';
  const mediaId = 'photo-101';
  const guestToken = 'guest-session-token-101';
  const guestTokenHash = createHash('sha256').update(guestToken).digest('hex');

  const baseEventRow = {
    id: eventId,
    name: 'Boda Carlos y Sofia',
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
    revision: '1'
  };

  const baseSessionRow = {
    id: 'session-row-101',
    event_id: eventId,
    token_hash: guestTokenHash,
    expires_at: new Date(Date.now() + 1000 * 60 * 60),
    revoked_at: null
  };

  it('Escenario 1: Media visible y publicada con sesión válida retorna isVisible = true', async () => {
    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM guest_session')) return [baseSessionRow];
      if (sql.includes('FROM media_catalog')) return [baseMediaRow];
      return [];
    });

    const revalidator = new MediaVisibilityRevalidator(runner);
    const result = await revalidator.revalidateMediaVisibility({
      eventId,
      mediaId,
      actor: { actorType: 'GUEST', guestSessionToken: guestToken }
    });

    expect(result.isVisible).toBe(true);
    expect(result.currentStatus).toBe('PUBLISHED');
    expect(result.currentRevision).toBe(1n);
    expect(result.denialCode).toBeUndefined();
  });

  it('Escenario 1: Media retirada o despublicada (HIDDEN/REJECTED/QUARANTINED) retorna isVisible = false y MEDIA_UNAVAILABLE', async () => {
    const recordedEvents: MediaGalleryAuditEvent[] = [];
    const auditSink: MediaGalleryAuditSink = {
      record: async (evt) => {
        recordedEvents.push(evt);
      }
    };

    const withdrawnMediaRow = {
      ...baseMediaRow,
      status: 'HIDDEN',
      revision: '2'
    };

    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM guest_session')) return [baseSessionRow];
      if (sql.includes('FROM media_catalog')) return [withdrawnMediaRow];
      return [];
    });

    const revalidator = new MediaVisibilityRevalidator(runner, auditSink);
    const result = await revalidator.revalidateMediaVisibility({
      eventId,
      mediaId,
      actor: { actorType: 'GUEST', guestSessionToken: guestToken }
    });

    expect(result.isVisible).toBe(false);
    expect(result.denialCode).toBe('MEDIA_UNAVAILABLE');
    expect(result.currentStatus).toBe('HIDDEN');
    expect(result.currentRevision).toBe(2n);

    // Observabilidad
    expect(recordedEvents).toHaveLength(1);
    expect(recordedEvents[0]?.procedure).toBe('VISIBILITY_REVALIDATION_DENIED');
    expect(recordedEvents[0]?.mediaId).toBe(mediaId);
    expect(recordedEvents[0]?.details).toContain('MEDIA_UNAVAILABLE');
  });

  it('Escenario 1: Concurrencia de revisión - si expectedRevision no coincide con la versión en DB, se bloquea por cambio concurrente', async () => {
    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM guest_session')) return [baseSessionRow];
      if (sql.includes('FROM media_catalog')) return [{ ...baseMediaRow, revision: '3' }];
      return [];
    });

    const revalidator = new MediaVisibilityRevalidator(runner);
    const result = await revalidator.revalidateMediaVisibility({
      eventId,
      mediaId,
      expectedRevision: 2n,
      actor: { actorType: 'GUEST', guestSessionToken: guestToken }
    });

    expect(result.isVisible).toBe(false);
    expect(result.denialCode).toBe('MEDIA_UNAVAILABLE');
    expect(result.denialReason).toContain('Media revision changed concurrently');
  });

  it('Escenario 2: Sesión guest revocada en tiempo real retorna ACCESS_REVOKED', async () => {
    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM guest_session')) {
        return [{ ...baseSessionRow, revoked_at: new Date() }];
      }
      return [];
    });

    const revalidator = new MediaVisibilityRevalidator(runner);
    const result = await revalidator.revalidateMediaVisibility({
      eventId,
      mediaId,
      actor: { actorType: 'GUEST', guestSessionToken: guestToken }
    });

    expect(result.isVisible).toBe(false);
    expect(result.denialCode).toBe('ACCESS_REVOKED');
  });

  it('Escenario 2: Sesión guest expirada retorna SESSION_EXPIRED', async () => {
    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM guest_session')) {
        return [{ ...baseSessionRow, expires_at: new Date('2026-10-01T00:00:00Z') }];
      }
      return [];
    });

    const revalidator = new MediaVisibilityRevalidator(runner);
    const result = await revalidator.revalidateMediaVisibility({
      eventId,
      mediaId,
      actor: { actorType: 'GUEST', guestSessionToken: guestToken },
      now: new Date('2026-10-12T12:00:00Z')
    });

    expect(result.isVisible).toBe(false);
    expect(result.denialCode).toBe('SESSION_EXPIRED');
  });

  it('Escenario 2: Galería deshabilitada (guest_gallery_enabled: false) retorna GALLERY_DISABLED', async () => {
    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) {
        return [{ ...baseEventRow, guest_gallery_enabled: false }];
      }
      return [];
    });

    const revalidator = new MediaVisibilityRevalidator(runner);
    const result = await revalidator.revalidateMediaVisibility({
      eventId,
      mediaId,
      actor: { actorType: 'GUEST', guestSessionToken: guestToken }
    });

    expect(result.isVisible).toBe(false);
    expect(result.denialCode).toBe('GALLERY_DISABLED');
  });

  it('Escenario 2: Evento suspendido deniega el acceso a la galería', async () => {
    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) {
        return [{ ...baseEventRow, status: 'SUSPENDED', suspended_at: new Date() }];
      }
      return [];
    });

    const revalidator = new MediaVisibilityRevalidator(runner);
    const result = await revalidator.revalidateMediaVisibility({
      eventId,
      mediaId,
      actor: { actorType: 'GUEST', guestSessionToken: guestToken }
    });

    expect(result.isVisible).toBe(false);
    expect(result.denialCode).toBe('GALLERY_DISABLED');
  });

  it('Cross-event: Intento de acceso a media perteneciente a otro evento retorna CROSS_EVENT_MISMATCH', async () => {
    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM guest_session')) return [baseSessionRow];
      if (sql.includes('FROM media_catalog')) {
        return [{ ...baseMediaRow, event_ref: 'other-event-999' }];
      }
      return [];
    });

    const revalidator = new MediaVisibilityRevalidator(runner);
    const result = await revalidator.revalidateMediaVisibility({
      eventId,
      mediaId,
      actor: { actorType: 'GUEST', guestSessionToken: guestToken }
    });

    expect(result.isVisible).toBe(false);
    expect(result.denialCode).toBe('CROSS_EVENT_MISMATCH');
  });

  it('Cross-event: Sesión guest que pertenece a otro evento retorna INVALID_CREDENTIAL', async () => {
    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM guest_session')) {
        return [{ ...baseSessionRow, event_id: 'other-event-999' }];
      }
      return [];
    });

    const revalidator = new MediaVisibilityRevalidator(runner);
    const result = await revalidator.revalidateMediaVisibility({
      eventId,
      mediaId,
      actor: { actorType: 'GUEST', guestSessionToken: guestToken }
    });

    expect(result.isVisible).toBe(false);
    expect(result.denialCode).toBe('INVALID_CREDENTIAL');
  });

  it('Batch revalidation: clasifica con precisión elementos visibles y retirados', async () => {
    const runner = createMockRunner(async (sql, params) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM guest_session')) return [baseSessionRow];
      if (sql.includes('FROM media_catalog')) {
        const param = params[0] as string;
        if (param === 'photo-1') {
          return [{ media_ref: 'media:photo-1', event_ref: eventId, status: 'PUBLISHED', revision: '1' }];
        }
        if (param === 'photo-2') {
          return [{ media_ref: 'media:photo-2', event_ref: eventId, status: 'HIDDEN', revision: '2' }];
        }
        if (param === 'photo-3') {
          return [{ media_ref: 'media:photo-3', event_ref: eventId, status: 'PUBLISHED', revision: '1' }];
        }
      }
      return [];
    });

    const revalidator = new MediaVisibilityRevalidator(runner);
    const batchResult = await revalidator.revalidateBatchVisibility({
      eventId,
      mediaIds: ['photo-1', 'photo-2', 'photo-3'],
      actor: { actorType: 'GUEST', guestSessionToken: guestToken }
    });

    expect(batchResult.visibleMediaIds).toEqual(['photo-1', 'photo-3']);
    expect(batchResult.withdrawnMediaIds).toEqual(['photo-2']);
  });

  it('assertVisible: lanza MediaGalleryError cuando la media no es visible', async () => {
    const runner = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM guest_session')) return [baseSessionRow];
      if (sql.includes('FROM media_catalog')) return [{ ...baseMediaRow, status: 'REJECTED' }];
      return [];
    });

    const revalidator = new MediaVisibilityRevalidator(runner);
    await expect(
      revalidator.assertVisible({
        eventId,
        mediaId,
        actor: { actorType: 'GUEST', guestSessionToken: guestToken }
      })
    ).rejects.toThrowError(MediaGalleryError);
  });

  it('Organizador: puede inspeccionar media pendiente/oculta, pero no DELETED ni QUARANTINED', async () => {
    const runnerPending = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM media_catalog')) return [{ ...baseMediaRow, status: 'PENDING_MODERATION' }];
      return [];
    });

    const revalidatorPending = new MediaVisibilityRevalidator(runnerPending);
    const resPending = await revalidatorPending.revalidateMediaVisibility({
      eventId,
      mediaId,
      actor: { actorType: 'ORGANIZER', organizerAccountId: organizerId }
    });
    expect(resPending.isVisible).toBe(true);

    const runnerDeleted = createMockRunner(async (sql) => {
      if (sql.includes('FROM event')) return [baseEventRow];
      if (sql.includes('FROM media_catalog')) return [{ ...baseMediaRow, status: 'DELETED' }];
      return [];
    });

    const revalidatorDeleted = new MediaVisibilityRevalidator(runnerDeleted);
    const resDeleted = await revalidatorDeleted.revalidateMediaVisibility({
      eventId,
      mediaId,
      actor: { actorType: 'ORGANIZER', organizerAccountId: organizerId }
    });
    expect(resDeleted.isVisible).toBe(false);
    expect(resDeleted.denialCode).toBe('MEDIA_UNAVAILABLE');
  });

  it('Validación de entradas inválidas lanza MediaGalleryError INVALID_ARGUMENT', async () => {
    const runner = createMockRunner(async () => []);
    const revalidator = new MediaVisibilityRevalidator(runner);

    await expect(
      revalidator.revalidateMediaVisibility({} as any)
    ).rejects.toThrow('Valid eventId is required');

    await expect(
      revalidator.revalidateMediaVisibility({ eventId, mediaId: '' } as any)
    ).rejects.toThrow('Valid mediaId is required');
  });
});
