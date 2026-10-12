import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/job-queue';
import {
  HideMediaService,
  RepublishMediaService,
  MediaVisibilityError,
  type MediaVisibilityRepository,
  type MediaCatalogRecord,
  type MediaVisibilityAuditEvent,
  type MediaVisibilityDenialAuditEvent,
  type MediaVisibilityAuditSink,
} from '../src/media-visibility.js';
import type { EventStatusAuthorizer } from '../src/media-status.js';
import type { SafetyFact } from '../src/contracts.js';

interface TestDbState {
  events: Map<string, { id: string; organizerId: string; status: string }>;
  catalog: Map<string, MediaCatalogRecord>;
  safetyFacts: Map<string, SafetyFact>;
  audits: MediaVisibilityAuditEvent[];
  denialAudits: MediaVisibilityDenialAuditEvent[];
}

describe('Media Visibility Services (EL-TK-105 & EL-TK-106 — EL-EP-008)', () => {
  let db: TestDbState;
  let txRunner: TransactionRunner;
  let repository: MediaVisibilityRepository;
  let authorizer: EventStatusAuthorizer;
  let auditSink: MediaVisibilityAuditSink;
  let hideMediaService: HideMediaService;
  let republishMediaService: RepublishMediaService;

  const eventAId = 'event-aaaa-1111';
  const organizerAId = 'org-aaaa-owner';
  const otherOrganizerId = 'org-other-intruder';
  const media1Id = 'photo-001';
  const mediaRef1 = `media:${media1Id}`;

  beforeEach(() => {
    db = {
      events: new Map(),
      catalog: new Map(),
      safetyFacts: new Map(),
      audits: [],
      denialAudits: [],
    };

    db.events.set(eventAId, {
      id: eventAId,
      organizerId: organizerAId,
      status: 'ACTIVE',
    });

    db.catalog.set(mediaRef1, {
      mediaRef: mediaRef1,
      eventRef: eventAId,
      guestRef: 'guest-01',
      generation: 1n,
      revision: 1n,
      status: 'PUBLISHED',
      original: { fileName: 'party.jpg', bytes: 2048000, mimeType: 'image/jpeg' },
      jobId: randomUUID(),
    });

    db.safetyFacts.set(mediaRef1, {
      schemaVersion: 1,
      jobId: randomUUID(),
      executionToken: randomUUID(),
      fence: 'f-1',
      epoch: 'ep-1',
      mediaRef: mediaRef1,
      generation: '1',
      revision: '1',
      originalSha256: 'sha-256-mock',
      originalVersion: 'v-1',
      outcome: 'APPROVED',
      format: { status: 'VALID', reason: 'Valid JPEG' },
      malware: {
        status: 'NO_THREAT_DETECTED',
        reason: 'Clean',
        engine: 'ClamAV',
        engineVersion: '1.0',
        imageDigest: 'sha256:clam',
        snapshotId: 'snap-1',
        profileHash: 'prof-1',
      },
    });

    const mockTx: SqlTransaction = {
      query: vi.fn(async () => []),
      execute: vi.fn(async () => 1),
    };

    txRunner = {
      run: vi.fn(async (cb) => cb(mockTx)),
    };

    authorizer = {
      async assertAuthorized(tx, scope) {
        if (scope.actor.role !== 'ORGANIZER') {
          throw new MediaVisibilityError('ACCESS_DENIED', 'Actor is not an organizer');
        }
        const ev = db.events.get(scope.eventRef);
        if (!ev || ev.organizerId !== scope.actor.organizerRef) {
          throw new MediaVisibilityError('ACCESS_DENIED', 'Organizer does not own the event');
        }
      },
    };

    repository = {
      async findMediaForUpdate(tx, mediaRef, eventRef) {
        const item = db.catalog.get(mediaRef) ?? db.catalog.get(`media:${mediaRef}`);
        if (!item || item.eventRef !== eventRef) return null;
        return { ...item };
      },

      async updateStatus(tx, mediaRef, eventRef, expectedStatus, newStatus) {
        const key = db.catalog.has(mediaRef) ? mediaRef : `media:${mediaRef}`;
        const item = db.catalog.get(key);
        if (!item || item.eventRef !== eventRef || item.status !== expectedStatus) {
          return null;
        }
        item.status = newStatus;
        item.revision = item.revision + 1n;
        db.catalog.set(key, item);
        return { generation: item.generation, revision: item.revision };
      },

      async getSafetyFact(tx, mediaRef, generation) {
        const key = db.catalog.has(mediaRef) ? mediaRef : `media:${mediaRef}`;
        return db.safetyFacts.get(key) ?? null;
      },

      async recordAudit(tx, event) {
        db.audits.push(event);
      },

      async recordDenial(tx, event) {
        db.denialAudits.push(event);
      },
    };

    auditSink = {
      recordAudit: vi.fn(async (event) => {}),
      recordDenial: vi.fn(async (event) => {}),
    };

    hideMediaService = new HideMediaService(txRunner, repository, authorizer, auditSink);
    republishMediaService = new RepublishMediaService(txRunner, repository, authorizer, auditSink);
  });

  describe('EL-TK-105: Ocultar una media publicada sin eliminarla', () => {
    it('Escenario 1: transiciona de PUBLISHED a HIDDEN, avanza revisión y registra auditoría', async () => {
      const result = await hideMediaService.execute({
        mediaRef: media1Id,
        eventRef: eventAId,
        organizerRef: organizerAId,
        reason: 'Ocultada por solicitud de los anfitriones',
      });

      expect(result.previousStatus).toBe('PUBLISHED');
      expect(result.newStatus).toBe('HIDDEN');
      expect(result.generation).toBe(1n);
      expect(result.revision).toBe(2n);

      const inDb = db.catalog.get(mediaRef1)!;
      expect(inDb.status).toBe('HIDDEN');
      expect(inDb.revision).toBe(2n);

      // Verificamos registro en auditoría
      expect(db.audits.length).toBe(1);
      expect(db.audits[0].action).toBe('HIDE_MEDIA');
      expect(db.audits[0].previousStatus).toBe('PUBLISHED');
      expect(db.audits[0].newStatus).toBe('HIDDEN');
      expect(db.audits[0].reason).toBe('Ocultada por solicitud de los anfitriones');
    });

    it('Escenario 2: deniega con CONFLICT si la media ya no está en estado PUBLISHED', async () => {
      // 1. Ocultamos primero
      await hideMediaService.execute({
        mediaRef: media1Id,
        eventRef: eventAId,
        organizerRef: organizerAId,
      });

      // 2. Intentamos ocultar de nuevo cuando ya está en HIDDEN
      await expect(
        hideMediaService.execute({
          mediaRef: media1Id,
          eventRef: eventAId,
          organizerRef: organizerAId,
        })
      ).rejects.toThrowError(MediaVisibilityError);

      try {
        await hideMediaService.execute({
          mediaRef: media1Id,
          eventRef: eventAId,
          organizerRef: organizerAId,
        });
      } catch (e: any) {
        expect(e.code).toBe('CONFLICT');
      }

      // Verificamos que el estado sigue siendo HIDDEN sin corromper información
      expect(db.catalog.get(mediaRef1)!.status).toBe('HIDDEN');
    });

    it('Escenario 3: el archivo original y los datos de almacenamiento se preservan íntegros (DEC-005, DEC-018, DEC-039)', async () => {
      const preHideOriginal = JSON.parse(JSON.stringify(db.catalog.get(mediaRef1)!.original));

      await hideMediaService.execute({
        mediaRef: media1Id,
        eventRef: eventAId,
        organizerRef: organizerAId,
      });

      const postHideItem = db.catalog.get(mediaRef1)!;
      // Original debe estar intacto (no se borra físicamente ni se limpia de metadatos)
      expect(postHideItem.original).toEqual(preHideOriginal);
      expect((postHideItem.original as any).bytes).toBe(2048000);
    });

    it('deniega con ACCESS_DENIED si un actor ajeno intenta ocultar la media', async () => {
      await expect(
        hideMediaService.execute({
          mediaRef: media1Id,
          eventRef: eventAId,
          organizerRef: otherOrganizerId,
        })
      ).rejects.toThrowError(MediaVisibilityError);

      try {
        await hideMediaService.execute({
          mediaRef: media1Id,
          eventRef: eventAId,
          organizerRef: otherOrganizerId,
        });
      } catch (e: any) {
        expect(e.code).toBe('ACCESS_DENIED');
      }

      expect(db.catalog.get(mediaRef1)!.status).toBe('PUBLISHED');
    });

    it('deniega con MEDIA_NOT_FOUND si la media no pertenece al evento especificado', async () => {
      await expect(
        hideMediaService.execute({
          mediaRef: 'media-inexistente',
          eventRef: eventAId,
          organizerRef: organizerAId,
        })
      ).rejects.toThrowError(MediaVisibilityError);

      try {
        await hideMediaService.execute({
          mediaRef: 'media-inexistente',
          eventRef: eventAId,
          organizerRef: organizerAId,
        });
      } catch (e: any) {
        expect(e.code).toBe('MEDIA_NOT_FOUND');
      }
    });

    it('deniega con CONFLICT si hay una carrera de revisión concurrente', async () => {
      await expect(
        hideMediaService.execute({
          mediaRef: media1Id,
          eventRef: eventAId,
          organizerRef: organizerAId,
          expectedRevision: 999n, // Espera revisión 999 pero actual es 1
        })
      ).rejects.toThrowError(MediaVisibilityError);

      try {
        await hideMediaService.execute({
          mediaRef: media1Id,
          eventRef: eventAId,
          organizerRef: organizerAId,
          expectedRevision: 999n,
        });
      } catch (e: any) {
        expect(e.code).toBe('CONFLICT');
      }
    });
  });

  describe('EL-TK-106: Volver a publicar una media oculta cuando sigue autorizada', () => {
    beforeEach(async () => {
      // Primero la ocultamos para ponerla en estado inicial HIDDEN
      await hideMediaService.execute({
        mediaRef: media1Id,
        eventRef: eventAId,
        organizerRef: organizerAId,
      });
      expect(db.catalog.get(mediaRef1)!.status).toBe('HIDDEN');
    });

    it('Escenario 1: transiciona de HIDDEN a PUBLISHED si no existen bloqueos', async () => {
      const result = await republishMediaService.execute({
        mediaRef: media1Id,
        eventRef: eventAId,
        organizerRef: organizerAId,
        reason: 'Restaurando visibilidad tras moderación positiva',
      });

      expect(result.previousStatus).toBe('HIDDEN');
      expect(result.newStatus).toBe('PUBLISHED');
      expect(result.revision).toBe(3n); // 1n -> 2n (hide) -> 3n (republish)

      const inDb = db.catalog.get(mediaRef1)!;
      expect(inDb.status).toBe('PUBLISHED');
      expect(inDb.revision).toBe(3n);

      // Verificamos auditoría
      expect(db.audits.some((a) => a.action === 'REPUBLISH_MEDIA')).toBe(true);
    });

    it('Escenario 2: deniega con SAFETY_BLOCKED si la inspección de seguridad resultó DENIED (DEC-086, DEC-087)', async () => {
      // Marcamos fact de seguridad como DENIED
      const safetyFact = db.safetyFacts.get(mediaRef1)!;
      safetyFact.outcome = 'DENIED';

      await expect(
        republishMediaService.execute({
          mediaRef: media1Id,
          eventRef: eventAId,
          organizerRef: organizerAId,
        })
      ).rejects.toThrowError(MediaVisibilityError);

      try {
        await republishMediaService.execute({
          mediaRef: media1Id,
          eventRef: eventAId,
          organizerRef: organizerAId,
        });
      } catch (e: any) {
        expect(e.code).toBe('SAFETY_BLOCKED');
      }

      // Debe permanecer estrictamente en HIDDEN sin publicarse indebidamente
      expect(db.catalog.get(mediaRef1)!.status).toBe('HIDDEN');
    });

    it('Escenario 3: deniega con CONFLICT si la media cambió de estado concurrentemente', async () => {
      // Cambiamos estado concurrentemente a DELETED o TRASHED
      db.catalog.get(mediaRef1)!.status = 'TRASHED';

      await expect(
        republishMediaService.execute({
          mediaRef: media1Id,
          eventRef: eventAId,
          organizerRef: organizerAId,
        })
      ).rejects.toThrowError(MediaVisibilityError);

      try {
        await republishMediaService.execute({
          mediaRef: media1Id,
          eventRef: eventAId,
          organizerRef: organizerAId,
        });
      } catch (e: any) {
        expect(e.code).toBe('CONFLICT');
      }

      expect(db.catalog.get(mediaRef1)!.status).toBe('TRASHED');
    });

    it('deniega con ACCESS_DENIED si un actor ajeno intenta volver a publicar', async () => {
      await expect(
        republishMediaService.execute({
          mediaRef: media1Id,
          eventRef: eventAId,
          organizerRef: otherOrganizerId,
        })
      ).rejects.toThrowError(MediaVisibilityError);

      try {
        await republishMediaService.execute({
          mediaRef: media1Id,
          eventRef: eventAId,
          organizerRef: otherOrganizerId,
        });
      } catch (e: any) {
        expect(e.code).toBe('ACCESS_DENIED');
      }

      expect(db.catalog.get(mediaRef1)!.status).toBe('HIDDEN');
    });

    it('deniega con CONFLICT si la revisión concurrente esperada no coincide', async () => {
      await expect(
        republishMediaService.execute({
          mediaRef: media1Id,
          eventRef: eventAId,
          organizerRef: organizerAId,
          expectedRevision: 999n,
        })
      ).rejects.toThrowError(MediaVisibilityError);

      try {
        await republishMediaService.execute({
          mediaRef: media1Id,
          eventRef: eventAId,
          organizerRef: organizerAId,
          expectedRevision: 999n,
        });
      } catch (e: any) {
        expect(e.code).toBe('CONFLICT');
      }
    });
  });
});
