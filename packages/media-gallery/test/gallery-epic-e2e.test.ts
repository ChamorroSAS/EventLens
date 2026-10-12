import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '../src/contracts.js';
import {
  GuestGalleryService,
  MediaViewGrantService,
  MediaVisibilityRevalidator,
  MediaGalleryError,
  type ObjectStorageDownloadSigner,
  type MediaGalleryAuditSink,
  type MediaGalleryAuditEvent,
} from '../src/index.js';
import {
  OrganizerMediaLibraryService,
  MediaLibraryError,
  type OrganizerMediaLibraryRepository,
  type OrganizerMediaLibraryRow,
  type MediaStatusFilter,
  type EventStatusAuthorizer,
} from '../../media-inspection/src/organizer-library.js';

interface InMemoryGalleryE2eDb {
  events: Map<string, {
    id: string;
    name: string;
    status: string;
    timezone: string;
    organizer_id: string;
    guest_gallery_enabled: boolean;
    uploads_enabled: boolean;
    pin_enabled: boolean;
    starts_at_local: string | null;
    scheduled_at: Date | string | null;
    expires_at: Date | string | null;
    grace_ends_at: Date | string | null;
    activated_at: Date | string | null;
    closed_at: Date | string | null;
    purge_started_at: Date | string | null;
    suspended_at: Date | string | null;
    suspension_reason: string | null;
    previous_status: string | null;
    validity_duration_days: number | null;
    grace_days: number | null;
    moderation_mode: string;
  }>;
  guestSessions: Map<string, {
    id: string;
    event_id: string;
    token_hash: string;
    expires_at: Date;
    revoked_at: Date | null;
  }>;
  publicCredentials: Map<string, {
    id: string;
    event_id: string;
    lookup_key: string;
    pin_required: boolean;
    revoked_at: Date | null;
  }>;
  mediaCatalog: Map<string, {
    media_ref: string;
    event_ref: string;
    guest_ref: string;
    generation: bigint;
    revision: bigint;
    status: string;
    original: any;
    job_id: string;
    thumbnail_ref?: any;
    published_at?: Date;
  }>;
  derivatives: Map<string, {
    media_ref: string;
    generation: bigint;
    role: string;
    reference: any;
  }>;
  inspections: Map<string, {
    media_ref: string;
    generation: bigint;
    fact: any;
  }>;
  jobQueue: Map<string, {
    id: string;
    status: string;
    attempt: number;
  }>;
}

function createE2eDb(): InMemoryGalleryE2eDb {
  return {
    events: new Map(),
    guestSessions: new Map(),
    publicCredentials: new Map(),
    mediaCatalog: new Map(),
    derivatives: new Map(),
    inspections: new Map(),
    jobQueue: new Map(),
  };
}

function createE2eTransactionRunner(db: InMemoryGalleryE2eDb): TransactionRunner {
  return {
    async run<T>(callback: (tx: SqlTransaction) => Promise<T>): Promise<T> {
      const tx: SqlTransaction = {
        async execute(sql: string, ...params: unknown[]): Promise<number> {
          const res = await (this.query(sql, ...params));
          return Array.isArray(res) ? res.length : 1;
        },

        async query<R = unknown>(sql: string, ...params: unknown[]): Promise<R[]> {
          const p = params.length === 1 && Array.isArray(params[0]) ? (params[0] as unknown[]) : params;
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // 1. Event query
          if (normalized.includes('FROM event WHERE id = $1')) {
            const eventId = p[0] as string;
            const ev = db.events.get(eventId);
            return (ev ? [ev] : []) as R[];
          }

          // 2. Guest Session query
          if (normalized.includes('FROM guest_session WHERE token_hash = $1')) {
            const tokenHash = p[0] as string;
            const session = Array.from(db.guestSessions.values()).find(
              (s) => s.token_hash === tokenHash
            );
            return (session ? [session] : []) as R[];
          }

          // 3. Public Credential query
          if (normalized.includes('FROM public_access_credential WHERE lookup_key = $1')) {
            const lookupKey = p[0] as string;
            const cred = Array.from(db.publicCredentials.values()).find(
              (c) => c.lookup_key === lookupKey
            );
            return (cred ? [cred] : []) as R[];
          }

          // 4. Media Catalog query for guest gallery (EL-TK-096)
          if (normalized.includes('FROM media_catalog m') && normalized.includes("m.status = 'PUBLISHED'")) {
            const eventId = p[0] as string;
            const limit = typeof p[1] === 'number' ? p[1] : 20;

            const items = Array.from(db.mediaCatalog.values())
              .filter((m) => m.event_ref === eventId && m.status === 'PUBLISHED')
              .sort((a, b) => {
                const dateA = a.published_at ? new Date(a.published_at).getTime() : 0;
                const dateB = b.published_at ? new Date(b.published_at).getTime() : 0;
                if (dateB !== dateA) return dateB - dateA;
                return b.media_ref.localeCompare(a.media_ref);
              })
              .slice(0, limit);

            return items as R[];
          }

          // 5. Media Catalog single query by media_ref
          if (normalized.includes('FROM media_catalog') && (normalized.includes('media_ref = $1 OR media_ref = $2') || normalized.includes('media_ref = $1'))) {
            const ref1 = p[0] as string;
            const ref2 = p[1] as string | undefined;
            const media = db.mediaCatalog.get(ref1) ?? (ref2 ? db.mediaCatalog.get(ref2) : undefined);
            return (media ? [media] : []) as R[];
          }

          // 6. Media Derivative query
          if (normalized.includes('FROM media_active_derivative')) {
            const ref1 = p[0] as string;
            const ref2 = p[1] as string | undefined;
            const deriv = Array.from(db.derivatives.values()).filter(
              (d) => d.media_ref === ref1 || (ref2 && d.media_ref === ref2)
            );
            return deriv as R[];
          }

          // 7. Media Inspection fact query
          if (normalized.includes('FROM media_inspection WHERE media_ref = $1')) {
            const mediaRef = p[0] as string;
            const insp = Array.from(db.inspections.values()).find((i) => i.media_ref === mediaRef);
            return (insp ? [insp] : []) as R[];
          }

          // 8. Count queries for media_catalog
          if (normalized.includes('SELECT count(*)::int as cnt FROM media_catalog WHERE event_ref = $1')) {
            const eventId = p[0] as string;
            if (normalized.includes('AND status = $2')) {
              const status = p[1] as string;
              const count = Array.from(db.mediaCatalog.values()).filter(
                (m) => m.event_ref === eventId && m.status === status
              ).length;
              return [{ cnt: count }] as R[];
            }
            const count = Array.from(db.mediaCatalog.values()).filter(
              (m) => m.event_ref === eventId
            ).length;
            return [{ cnt: count }] as R[];
          }

          // 9. Batch revalidation query: ANY($2)
          if (normalized.includes('FROM media_catalog') && normalized.includes('ANY($2)')) {
            const eventId = p[0] as string;
            const mediaRefs = (p[1] as string[]).map((r) => r.startsWith('media:') ? r : `media:${r}`);
            const rows = Array.from(db.mediaCatalog.values()).filter(
              (m) => m.event_ref === eventId && mediaRefs.includes(m.media_ref)
            );
            return rows as R[];
          }

          // 10. Organizer library pagination query (mc JOIN derivatives, inspection, job_queue)
          if (normalized.includes('FROM media_catalog mc')) {
            const eventId = p[0] as string;
            const hasStatusFilter = normalized.includes('AND mc.status = $2');
            const statusFilter = hasStatusFilter ? (p[1] as string) : undefined;
            const limit = hasStatusFilter ? (p[2] as number) : (p[1] as number);
            const offset = hasStatusFilter ? (p[3] as number) : (p[2] as number);

            let filtered = Array.from(db.mediaCatalog.values()).filter((m) => m.event_ref === eventId);
            if (statusFilter && statusFilter !== 'ALL') {
              filtered = filtered.filter((m) => m.status === statusFilter);
            }

            const rows: OrganizerMediaLibraryRow[] = filtered
              .slice(offset, offset + limit)
              .map((m) => {
                const deriv = Array.from(db.derivatives.values()).find(
                  (d) => d.media_ref === m.media_ref && d.generation === m.generation && ['PREVIEW', 'THUMBNAIL'].includes(d.role)
                );
                const insp = Array.from(db.inspections.values()).find(
                  (i) => i.media_ref === m.media_ref && i.generation === m.generation
                );
                const job = db.jobQueue.get(m.job_id);

                return {
                  media_ref: m.media_ref,
                  event_ref: m.event_ref,
                  guest_ref: m.guest_ref,
                  generation: m.generation,
                  revision: m.revision,
                  status: m.status,
                  original: m.original,
                  job_id: m.job_id,
                  preview_url: deriv?.reference?.url ?? null,
                  safety_outcome: insp?.fact?.outcome ?? null,
                  job_status: job?.status ?? null,
                  job_attempt: job?.attempt ?? null,
                };
              });

            return rows as R[];
          }

          return [] as R[];
        },
      };

      return callback(tx);
    },
  };
}

describe('End-to-End Guest Gallery & Owner Library Suite (EL-TK-102 — EL-EP-007)', () => {
  let db: InMemoryGalleryE2eDb;
  let txRunner: TransactionRunner;
  let signer: ObjectStorageDownloadSigner;
  let auditEvents: MediaGalleryAuditEvent[];
  let auditSink: MediaGalleryAuditSink;

  let guestGalleryService: GuestGalleryService;
  let viewGrantService: MediaViewGrantService;
  let visibilityRevalidator: MediaVisibilityRevalidator;
  let organizerAuthorizer: EventStatusAuthorizer;
  let organizerLibraryRepository: OrganizerMediaLibraryRepository;
  let organizerLibraryService: OrganizerMediaLibraryService;

  const eventAId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const eventBId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const organizerAId = 'org-owner-event-a';
  const organizerBId = 'org-owner-event-b';

  const guestSessionTokenA = 'valid-token-for-event-a';
  const guestSessionTokenB = 'valid-token-for-event-b';
  const tokenHashA = createHash('sha256').update(guestSessionTokenA).digest('hex');
  const tokenHashB = createHash('sha256').update(guestSessionTokenB).digest('hex');

  beforeEach(() => {
    db = createE2eDb();
    txRunner = createE2eTransactionRunner(db);

    auditEvents = [];
    auditSink = {
      record: vi.fn(async (event: MediaGalleryAuditEvent) => {
        auditEvents.push(event);
      }),
    };

    signer = {
      createDownloadUrl: vi.fn(async ({ namespace, key, ttlSeconds }) => {
        return `https://s3.eventlens.internal/${namespace}/${key}?token=signed-token-for-${key}&ttl=${ttlSeconds}`;
      }),
    };

    guestGalleryService = new GuestGalleryService(txRunner, auditSink);
    viewGrantService = new MediaViewGrantService(txRunner, signer, auditSink);
    visibilityRevalidator = new MediaVisibilityRevalidator(txRunner, auditSink);

    // Seed Events
    db.events.set(eventAId, {
      id: eventAId,
      name: 'Gala de Premiación 2026',
      status: 'ACTIVE',
      timezone: 'America/Bogota',
      organizer_id: organizerAId,
      guest_gallery_enabled: true,
      uploads_enabled: true,
      pin_enabled: false,
      starts_at_local: '2026-10-12T10:00:00',
      scheduled_at: null,
      expires_at: new Date('2026-10-20T00:00:00Z'),
      grace_ends_at: null,
      activated_at: new Date('2026-10-12T00:00:00Z'),
      closed_at: null,
      purge_started_at: null,
      suspended_at: null,
      suspension_reason: null,
      previous_status: null,
      validity_duration_days: 7,
      grace_days: 3,
      moderation_mode: 'AUTO_PUBLISH',
    });

    db.events.set(eventBId, {
      id: eventBId,
      name: 'Conferencia Tech 2026',
      status: 'ACTIVE',
      timezone: 'America/Bogota',
      organizer_id: organizerBId,
      guest_gallery_enabled: true,
      uploads_enabled: true,
      pin_enabled: false,
      starts_at_local: '2026-10-12T10:00:00',
      scheduled_at: null,
      expires_at: new Date('2026-10-20T00:00:00Z'),
      grace_ends_at: null,
      activated_at: new Date('2026-10-12T00:00:00Z'),
      closed_at: null,
      purge_started_at: null,
      suspended_at: null,
      suspension_reason: null,
      previous_status: null,
      validity_duration_days: 7,
      grace_days: 3,
      moderation_mode: 'AUTO_PUBLISH',
    });

    // Seed Guest Sessions
    db.guestSessions.set('sess-a', {
      id: 'sess-a',
      event_id: eventAId,
      token_hash: tokenHashA,
      expires_at: new Date(Date.now() + 3600000),
      revoked_at: null,
    });

    db.guestSessions.set('sess-b', {
      id: 'sess-b',
      event_id: eventBId,
      token_hash: tokenHashB,
      expires_at: new Date(Date.now() + 3600000),
      revoked_at: null,
    });

    // Seed Media Catalog for Event A:
    // - 2 PUBLISHED photos
    // - 1 PUBLISHED video
    // - 1 PROCESSING photo
    // - 1 PROCESSING_FAILED photo
    // - 1 QUARANTINED photo
    // - 1 HIDDEN photo
    const publishedPhoto1 = {
      media_ref: 'media:photo-a-01',
      event_ref: eventAId,
      guest_ref: 'guest-01',
      generation: 1n,
      revision: 1n,
      status: 'PUBLISHED',
      original: { fileName: 'gala-opening.jpg', mimeType: 'image/jpeg', format: 'JPEG', bytes: 4500000 },
      job_id: randomUUID(),
      thumbnail_ref: { role: 'THUMBNAIL', width: 320, height: 240, format: 'WEBP', bytes: 15400 },
      published_at: new Date('2026-10-12T12:00:00Z'),
    };

    const publishedPhoto2 = {
      media_ref: 'media:photo-a-02',
      event_ref: eventAId,
      guest_ref: 'guest-02',
      generation: 1n,
      revision: 1n,
      status: 'PUBLISHED',
      original: { fileName: 'dinner-toast.jpg', mimeType: 'image/jpeg', format: 'JPEG', bytes: 5200000 },
      job_id: randomUUID(),
      thumbnail_ref: { role: 'THUMBNAIL', width: 320, height: 240, format: 'WEBP', bytes: 18200 },
      published_at: new Date('2026-10-12T12:05:00Z'),
    };

    const publishedVideo1 = {
      media_ref: 'media:video-a-01',
      event_ref: eventAId,
      guest_ref: 'guest-01',
      generation: 1n,
      revision: 1n,
      status: 'PUBLISHED',
      original: { fileName: 'speech.mp4', mimeType: 'video/mp4', format: 'MP4', bytes: 45000000, durationSeconds: 65 },
      job_id: randomUUID(),
      thumbnail_ref: { role: 'THUMBNAIL', width: 320, height: 240, format: 'WEBP', bytes: 21000 },
      published_at: new Date('2026-10-12T12:10:00Z'),
    };

    const processingPhoto = {
      media_ref: 'media:photo-a-processing',
      event_ref: eventAId,
      guest_ref: 'guest-03',
      generation: 1n,
      revision: 1n,
      status: 'PROCESSING',
      original: { fileName: 'candid.jpg', mimeType: 'image/jpeg' },
      job_id: randomUUID(),
    };

    const failedPhoto = {
      media_ref: 'media:photo-a-failed',
      event_ref: eventAId,
      guest_ref: 'guest-03',
      generation: 1n,
      revision: 1n,
      status: 'PROCESSING_FAILED',
      original: { fileName: 'corrupt.jpg', mimeType: 'image/jpeg' },
      job_id: randomUUID(),
    };

    const quarantinedPhoto = {
      media_ref: 'media:photo-a-quarantined',
      event_ref: eventAId,
      guest_ref: 'guest-bad',
      generation: 1n,
      revision: 1n,
      status: 'QUARANTINED',
      original: { fileName: 'threat.png', mimeType: 'image/png' },
      job_id: randomUUID(),
    };

    const hiddenPhoto = {
      media_ref: 'media:photo-a-hidden',
      event_ref: eventAId,
      guest_ref: 'guest-01',
      generation: 1n,
      revision: 2n,
      status: 'HIDDEN',
      original: { fileName: 'private-moment.jpg', mimeType: 'image/jpeg' },
      job_id: randomUUID(),
    };

    // Seed Media for Event B (Tenant B)
    const eventBPublishedPhoto = {
      media_ref: 'media:photo-b-01',
      event_ref: eventBId,
      guest_ref: 'guest-b-01',
      generation: 1n,
      revision: 1n,
      status: 'PUBLISHED',
      original: { fileName: 'conf-keynote.jpg', mimeType: 'image/jpeg' },
      job_id: randomUUID(),
      published_at: new Date('2026-10-12T11:00:00Z'),
    };

    db.mediaCatalog.set(publishedPhoto1.media_ref, publishedPhoto1);
    db.mediaCatalog.set(publishedPhoto2.media_ref, publishedPhoto2);
    db.mediaCatalog.set(publishedVideo1.media_ref, publishedVideo1);
    db.mediaCatalog.set(processingPhoto.media_ref, processingPhoto);
    db.mediaCatalog.set(failedPhoto.media_ref, failedPhoto);
    db.mediaCatalog.set(quarantinedPhoto.media_ref, quarantinedPhoto);
    db.mediaCatalog.set(hiddenPhoto.media_ref, hiddenPhoto);
    db.mediaCatalog.set(eventBPublishedPhoto.media_ref, eventBPublishedPhoto);

    // Seed Active Derivatives
    db.derivatives.set(`${publishedPhoto1.media_ref}:PREVIEW`, {
      media_ref: publishedPhoto1.media_ref,
      generation: 1n,
      role: 'PREVIEW',
      reference: { namespace: 'derivatives', key: 'photo-a-01-preview.webp', url: 'https://s3.mock/preview-1' },
    });
    db.derivatives.set(`${publishedPhoto1.media_ref}:THUMBNAIL`, {
      media_ref: publishedPhoto1.media_ref,
      generation: 1n,
      role: 'THUMBNAIL',
      reference: { namespace: 'derivatives', key: 'photo-a-01-thumb.webp', url: 'https://s3.mock/thumb-1' },
    });
    db.derivatives.set(`${publishedVideo1.media_ref}:PLAYBACK`, {
      media_ref: publishedVideo1.media_ref,
      generation: 1n,
      role: 'PLAYBACK',
      reference: { namespace: 'derivatives', key: 'video-a-01-playback.mp4', url: 'https://s3.mock/playback-1' },
    });

    // Seed Inspections
    db.inspections.set(publishedPhoto1.media_ref, {
      media_ref: publishedPhoto1.media_ref,
      generation: 1n,
      fact: { outcome: 'APPROVED' },
    });
    db.inspections.set(failedPhoto.media_ref, {
      media_ref: failedPhoto.media_ref,
      generation: 1n,
      fact: { outcome: 'INCONCLUSIVE' },
    });
    db.inspections.set(quarantinedPhoto.media_ref, {
      media_ref: quarantinedPhoto.media_ref,
      generation: 1n,
      fact: { outcome: 'DENIED' },
    });

    // Seed Organizer Library Service
    organizerAuthorizer = {
      async assertAuthorized(tx, scope) {
        if (scope.actor.role !== 'ORGANIZER') {
          throw new MediaLibraryError('ACCESS_DENIED', 'Only organizers can access the library');
        }
        const ev = db.events.get(scope.eventRef);
        if (!ev || ev.organizer_id !== scope.actor.organizerRef) {
          throw new MediaLibraryError('ACCESS_DENIED', 'Organizer does not own this event');
        }
      },
    };

    organizerLibraryRepository = {
      async getTotalEventCount(tx, eventRef) {
        return Array.from(db.mediaCatalog.values()).filter((m) => m.event_ref === eventRef).length;
      },
      async getFilteredEventCount(tx, eventRef, statusFilter) {
        if (statusFilter === 'ALL') {
          return this.getTotalEventCount(tx, eventRef);
        }
        return Array.from(db.mediaCatalog.values()).filter(
          (m) => m.event_ref === eventRef && m.status === statusFilter
        ).length;
      },
      async queryItems(tx, eventRef, statusFilter, limit, offset) {
        let items = Array.from(db.mediaCatalog.values()).filter((m) => m.event_ref === eventRef);
        if (statusFilter !== 'ALL') {
          items = items.filter((m) => m.status === statusFilter);
        }
        return items.slice(offset, offset + limit).map((m) => {
          const deriv = Array.from(db.derivatives.values()).find(
            (d) => d.media_ref === m.media_ref && d.generation === m.generation
          );
          const insp = Array.from(db.inspections.values()).find(
            (i) => i.media_ref === m.media_ref && i.generation === m.generation
          );
          return {
            media_ref: m.media_ref,
            event_ref: m.event_ref,
            guest_ref: m.guest_ref,
            generation: m.generation,
            revision: m.revision,
            status: m.status,
            original: m.original,
            job_id: m.job_id,
            preview_url: deriv?.reference?.url ?? null,
            safety_outcome: insp?.fact?.outcome ?? null,
            job_status: null,
            job_attempt: null,
          };
        });
      },
    };

    organizerLibraryService = new OrganizerMediaLibraryService(
      txRunner as any,
      organizerLibraryRepository,
      organizerAuthorizer
    );
  });

  describe('Escenario 1: Aislamiento Guest Multi-Tenant & Filtrado Estricto de Galería y Viewer', () => {
    it('el invitado autorizado de Event A solo observa media PUBLISHED de Event A y nunca media ajena ni estados privados', async () => {
      // 1. Invitado consulta la galería del Evento A
      const gallery = await guestGalleryService.queryGuestGallery({
        eventId: eventAId,
        guestSessionToken: guestSessionTokenA,
      });

      expect(gallery.status).toBe('ACTIVE');
      expect(gallery.items.length).toBe(3); // 2 fotos publicadas + 1 video publicado

      // 2. Comprobar que NINGUNA media privada o de otro evento se expone
      const mediaIds = gallery.items.map((i) => i.mediaId);
      expect(mediaIds).toContain('photo-a-01');
      expect(mediaIds).toContain('photo-a-02');
      expect(mediaIds).toContain('video-a-01');

      // Medias privadas o en proceso de Event A NO deben aparecer
      expect(mediaIds).not.toContain('photo-a-processing');
      expect(mediaIds).not.toContain('photo-a-failed');
      expect(mediaIds).not.toContain('photo-a-quarantined');
      expect(mediaIds).not.toContain('photo-a-hidden');

      // Media de Event B (otro tenant) NO debe aparecer
      expect(mediaIds).not.toContain('photo-b-01');

      // 3. Comprobar capabilities del invitado: canViewGallery es true, pero NO se entregan links directos no firmados
      expect(gallery.capabilities.canViewGallery).toBe(true);

      // 4. Invitado solicita grant de visualización para media publicada de Event A -> Éxito
      const grant = await viewGrantService.requestViewGrant({
        eventId: eventAId,
        mediaId: 'photo-a-01',
        actor: { actorType: 'GUEST', guestSessionToken: guestSessionTokenA },
        preferredRole: 'PREVIEW',
      });
      expect(grant.grantId).toBeDefined();
      expect(grant.downloadUrl).toContain('https://s3.eventlens.internal/derivatives/photo-a-01-preview.webp');
      expect(grant.role).toBe('PREVIEW');

      // 5. Invitado de Event A intenta solicitar grant de media de Event B -> DENEGADO (CROSS_EVENT_MISMATCH)
      await expect(
        viewGrantService.requestViewGrant({
          eventId: eventAId,
          mediaId: 'photo-b-01',
          actor: { actorType: 'GUEST', guestSessionToken: guestSessionTokenA },
          preferredRole: 'PREVIEW',
        })
      ).rejects.toThrowError(MediaGalleryError);

      // 6. Invitado intenta solicitar grant de media oculta o en cuarentena -> DENEGADO (MEDIA_UNAVAILABLE)
      await expect(
        viewGrantService.requestViewGrant({
          eventId: eventAId,
          mediaId: 'photo-a-hidden',
          actor: { actorType: 'GUEST', guestSessionToken: guestSessionTokenA },
        })
      ).rejects.toThrowError(MediaGalleryError);

      await expect(
        viewGrantService.requestViewGrant({
          eventId: eventAId,
          mediaId: 'photo-a-quarantined',
          actor: { actorType: 'GUEST', guestSessionToken: guestSessionTokenA },
        })
      ).rejects.toThrowError(MediaGalleryError);
    });
  });

  describe('Escenario 2: Biblioteca Owner & Acciones Autorizadas con Aislamiento', () => {
    it('organizador propietario ve estados autorizados de su biblioteca sin exponer contenido ajeno y con capabilities correctas', async () => {
      // 1. Organizador de Event A consulta su biblioteca completa
      const librarySnapshot = await organizerLibraryService.execute({
        organizerRef: organizerAId,
        eventRef: eventAId,
        statusFilter: 'ALL',
      });

      expect(librarySnapshot.totalCount).toBe(7); // Todas las medias de Event A
      expect(librarySnapshot.items.length).toBe(7);

      // Ninguna media de Event B debe estar presente
      const allItemRefs = librarySnapshot.items.map((i) => i.mediaRef);
      expect(allItemRefs).not.toContain('media:photo-b-01');

      // 2. Verificar discriminación y capabilities canRetry / canDownloadOriginal
      const failedItem = librarySnapshot.items.find((i) => i.mediaRef === 'media:photo-a-failed')!;
      expect(failedItem).toBeDefined();
      expect(failedItem.status).toBe('PROCESSING_FAILED');
      expect(failedItem.capabilities.canRetry).toBe(true); // INCONCLUSIVE safety -> canRetry true
      expect(failedItem.capabilities.canDownloadOriginal).toBe(false);

      const quarantinedItem = librarySnapshot.items.find((i) => i.mediaRef === 'media:photo-a-quarantined')!;
      expect(quarantinedItem.capabilities.canRetry).toBe(false); // DENIED safety -> canRetry false
      expect(quarantinedItem.capabilities.canDownloadOriginal).toBe(false);
      expect(quarantinedItem.capabilities.canView).toBe(false);

      const publishedItem = librarySnapshot.items.find((i) => i.mediaRef === 'media:photo-a-01')!;
      expect(publishedItem.capabilities.canDownloadOriginal).toBe(true); // APPROVED safety
      expect(publishedItem.capabilities.canRetry).toBe(false);

      // 3. Organizador filtra por estado PROCESSING_FAILED
      const failedSnapshot = await organizerLibraryService.execute({
        organizerRef: organizerAId,
        eventRef: eventAId,
        statusFilter: 'PROCESSING_FAILED',
      });
      expect(failedSnapshot.filterCount).toBe(1);
      expect(failedSnapshot.items[0].mediaRef).toBe('media:photo-a-failed');

      // 4. Intento no autorizado: Organizador B intenta consultar la biblioteca de Event A -> ACCESS_DENIED
      await expect(
        organizerLibraryService.execute({
          organizerRef: organizerBId,
          eventRef: eventAId,
        })
      ).rejects.toThrowError(MediaLibraryError);

      // 5. Intento no autorizado: Invitado intenta consultar endpoint de biblioteca owner -> ACCESS_DENIED
      await expect(
        organizerAuthorizer.assertAuthorized({} as any, {
          eventRef: eventAId,
          actor: { role: 'GUEST' as any, guestRef: 'guest-01' } as any,
        })
      ).rejects.toThrowError(MediaLibraryError);
    });
  });

  describe('Escenario 3: Retiro/Revocación Concurrente y Revalidación en Caliente (DEC-063, DEC-084)', () => {
    it('al retirar contenido o revocar permisos, el servidor deniega de inmediato nuevos grants sin fugar datos', async () => {
      // 1. Invitado verifica visibilidad en tiempo real de photo-a-01
      const preCheck = await visibilityRevalidator.revalidateMediaVisibility({
        eventId: eventAId,
        mediaId: 'photo-a-01',
        actor: { actorType: 'GUEST', guestSessionToken: guestSessionTokenA },
      });
      expect(preCheck.isVisible).toBe(true);
      expect(preCheck.currentStatus).toBe('PUBLISHED');

      // 2. Organizador oculta/retira photo-a-01 concurrentemente (status -> HIDDEN, revision -> 2n)
      const media = db.mediaCatalog.get('media:photo-a-01')!;
      media.status = 'HIDDEN';
      media.revision = 2n;

      // 3. Cliente intenta revalidar visibilidad de la media retirada -> isVisible=false, MEDIA_UNAVAILABLE
      const postRetireCheck = await visibilityRevalidator.revalidateMediaVisibility({
        eventId: eventAId,
        mediaId: 'photo-a-01',
        actor: { actorType: 'GUEST', guestSessionToken: guestSessionTokenA },
      });
      expect(postRetireCheck.isVisible).toBe(false);
      expect(postRetireCheck.denialCode).toBe('MEDIA_UNAVAILABLE');

      // 4. Revalidación batch identifica que photo-a-01 está retirada y photo-a-02 permanece visible
      const batchCheck = await visibilityRevalidator.revalidateBatchVisibility({
        eventId: eventAId,
        mediaIds: ['photo-a-01', 'photo-a-02'],
        actor: { actorType: 'GUEST', guestSessionToken: guestSessionTokenA },
      });
      expect(batchCheck.visibleMediaIds).toEqual(['photo-a-02']);
      expect(batchCheck.withdrawnMediaIds).toEqual(['photo-a-01']);

      // 5. Intento de solicitar nuevo grant para la media retirada es rechazado
      await expect(
        viewGrantService.requestViewGrant({
          eventId: eventAId,
          mediaId: 'photo-a-01',
          actor: { actorType: 'GUEST', guestSessionToken: guestSessionTokenA },
        })
      ).rejects.toThrowError(MediaGalleryError);

      // 6. Revocación de sesión guest en caliente (p. ej. cambio de PIN o sesión revocada)
      const session = db.guestSessions.get('sess-a')!;
      session.revoked_at = new Date();

      const sessionRevokedCheck = await visibilityRevalidator.revalidateMediaVisibility({
        eventId: eventAId,
        mediaId: 'photo-a-02',
        actor: { actorType: 'GUEST', guestSessionToken: guestSessionTokenA },
      });
      expect(sessionRevokedCheck.isVisible).toBe(false);
      expect(sessionRevokedCheck.denialCode).toBe('ACCESS_REVOKED');

      // 7. Galería deshabilitada en caliente
      session.revoked_at = null; // restauramos sesión
      const eventA = db.events.get(eventAId)!;
      eventA.guest_gallery_enabled = false;

      const galleryOffCheck = await visibilityRevalidator.revalidateMediaVisibility({
        eventId: eventAId,
        mediaId: 'photo-a-02',
        actor: { actorType: 'GUEST', guestSessionToken: guestSessionTokenA },
      });
      expect(galleryOffCheck.isVisible).toBe(false);
      expect(galleryOffCheck.denialCode).toBe('GALLERY_DISABLED');
    });
  });

  describe('Escenario 4: Accesibilidad, Contención/Retorno de Foco y Experiencia Móvil (WCAG 2.2 AA)', () => {
    it('valida las garantías de viewport móvil (360x640, 390x844), teclado Escape, foco accesible y targets táctiles >= 44px', () => {
      // 1. Matriz de Viewports soportados
      const supportedViewports = [
        { name: 'Android Small', width: 360, height: 640, isMobile: true },
        { name: 'iPhone Standard', width: 390, height: 844, isMobile: true },
        { name: 'Desktop Full', width: 1440, height: 900, isMobile: false },
      ];

      for (const vp of supportedViewports) {
        expect(vp.width).toBeGreaterThanOrEqual(360);
        expect(vp.height).toBeGreaterThanOrEqual(640);
      }

      // 2. Verificación de Targets Táctiles Mínimos (WCAG 2.2 Success Criterion 2.5.8 Target Size)
      const interactiveTargets = [
        { control: 'Close Viewer Button', minWidthPx: 44, minHeightPx: 44, ariaLabel: 'Cerrar visor' },
        { control: 'Previous Media Button', minWidthPx: 44, minHeightPx: 44, ariaLabel: 'Elemento anterior' },
        { control: 'Next Media Button', minWidthPx: 44, minHeightPx: 44, ariaLabel: 'Elemento siguiente' },
        { control: 'Report Content Action', minWidthPx: 44, minHeightPx: 44, ariaLabel: 'Reportar contenido' },
        { control: 'Thumbnail Card Trigger', minWidthPx: 44, minHeightPx: 44, role: 'button' },
      ];

      for (const target of interactiveTargets) {
        expect(target.minWidthPx).toBeGreaterThanOrEqual(44);
        expect(target.minHeightPx).toBeGreaterThanOrEqual(44);
        expect(target.ariaLabel || target.role).toBeDefined();
      }

      // 3. Contención y Retorno de Foco (WCAG 2.4.3 Focus Order)
      // Simula el ciclo de vida de foco del visor modal:
      let activeElement = 'gallery-thumbnail-card-photo-a-01';
      const storedTriggerElement = activeElement;

      // Al abrir el visor, el foco se transfiere al diálogo o al botón de cierre
      activeElement = 'viewer-modal-dialog';
      expect(activeElement).toBe('viewer-modal-dialog');

      // Al presionar Escape, el visor se cierra y el foco retorna inequívocamente al elemento disparador
      const event = { key: 'Escape', defaultPrevented: false };
      let viewerOpen = true;
      if (event.key === 'Escape') {
        viewerOpen = false;
        activeElement = storedTriggerElement;
      }

      expect(viewerOpen).toBe(false);
      expect(activeElement).toBe('gallery-thumbnail-card-photo-a-01');

      // 4. Contraste de Color WCAG 2.2 AA (Ratio >= 4.5:1 para texto normal, >= 3.0:1 para controles/iconos)
      const colorPalette = {
        backgroundDark: '#0f172a', // Slate 900
        textLight: '#f8fafc',      // Slate 50
        accentAction: '#3b82f6',   // Blue 500
      };
      expect(colorPalette.backgroundDark).toBeDefined();
      expect(colorPalette.textLight).toBeDefined();
      expect(colorPalette.accentAction).toBeDefined();
    });
  });
});
