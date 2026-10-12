import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  PrismaTransactions,
  createPrismaClient,
  type SqlTransaction
} from '@eventlens/job-queue';
import {
  MediaModerationService,
  PostgresMediaModerationRepository,
  MediaModerationError,
  type PurgeDispatcherPort,
  type PurgeRequestPayload
} from '../src/media-moderation.js';
import {
  HideMediaService,
  RepublishMediaService,
  PostgresMediaVisibilityRepository
} from '../src/media-visibility.js';
import { PostgresMediaGovernance } from '../src/successful-processing.js';
import type { EventStatusAuthorizer } from '../src/media-status.js';
import { EventDraftService } from '../../event-management/src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('EL-TK-112: Validación integral E2E de moderación, papelera y restauración (PostgreSQL 16)', () => {
  const client = createPrismaClient(databaseUrl!);
  const transactions = new PrismaTransactions(client, 10000);
  const moderationRepo = new PostgresMediaModerationRepository();
  const visibilityRepo = new PostgresMediaVisibilityRepository();
  const mediaGovernance = new PostgresMediaGovernance();

  class TestAuthorizer implements EventStatusAuthorizer {
    async assertAuthorized(
      tx: SqlTransaction,
      scope: { eventRef: string; actor: { role: string; organizerRef?: string } }
    ): Promise<void> {
      const rows = await tx.query<{ organizer_id: string }>(
        'SELECT organizer_id FROM event WHERE id = $1',
        scope.eventRef
      );
      if (!rows.length) {
        throw new MediaModerationError('MEDIA_NOT_FOUND');
      }
      if (rows[0].organizer_id !== scope.actor.organizerRef) {
        throw new MediaModerationError('ACCESS_DENIED');
      }
    }
  }

  const authorizer = new TestAuthorizer();
  const dispatchedPurges: PurgeRequestPayload[] = [];
  const purgeDispatcher: PurgeDispatcherPort = {
    async dispatchPurgeRequest(request: PurgeRequestPayload): Promise<void> {
      dispatchedPurges.push(request);
    }
  };

  const moderationService = new MediaModerationService(
    transactions,
    moderationRepo,
    authorizer,
    purgeDispatcher
  );
  const hideService = new HideMediaService(transactions, visibilityRepo, authorizer);
  const republishService = new RepublishMediaService(transactions, visibilityRepo, authorizer);
  const eventDraftService = new EventDraftService(transactions as any);

  const organizerId = randomUUID();
  const eventId = randomUUID();

  // Helper to insert a media item with complete DB foreign keys
  async function seedMediaItem(
    mediaRef: string,
    status: string,
    generation: number = 1,
    revision: number = 1
  ): Promise<void> {
    await transactions.run(async (tx) => {
      const intentId = 'intent:' + randomUUID();
      const jobId = randomUUID();

      await tx.execute(
        `INSERT INTO job_queue (id, dedup_key, fingerprint, type, handler_version, resource_ref, generation, queue, priority, payload, status, available_at)
         VALUES ($1::uuid, $2, 'fp', 'MEDIA_INSPECTION', '1', $3, $4, 'q', 1, '{}'::jsonb, 'COMPLETED', NOW())`,
        jobId,
        'dedup:' + randomUUID(),
        mediaRef,
        generation
      );

      await tx.execute(
        `INSERT INTO media_acceptance_intent (intent_id, media_ref, generation, fingerprint, facts)
         VALUES ($1, $2, $3, 'fp', '{}'::jsonb)`,
        intentId,
        mediaRef,
        generation
      );

      await tx.execute(
        `INSERT INTO media_catalog (media_ref, intent_id, event_ref, guest_ref, generation, revision, status, original, job_id)
         VALUES ($1, $2, $3, 'guest:1', $4, $5, $6, '{"fileName":"test.jpg"}'::jsonb, $7::uuid)`,
        mediaRef,
        intentId,
        eventId,
        generation,
        revision,
        status,
        jobId
      );

      await tx.execute(
        `INSERT INTO media_inspection (media_ref, generation, fact)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (media_ref, generation) DO NOTHING`,
        mediaRef,
        generation,
        JSON.stringify({
          schemaVersion: 1,
          jobId,
          executionToken: randomUUID(),
          fence: '1',
          epoch: '1',
          mediaRef,
          generation: String(generation),
          revision: String(revision),
          originalSha256: 'sha256-test',
          originalVersion: '1',
          outcome: 'APPROVED',
          format: { status: 'VALID', reason: 'ok' },
          malware: { status: 'NO_THREAT_DETECTED', reason: 'clean' }
        })
      );
    });
  }

  beforeAll(async () => {
    // Seed real Event in ACTIVE status and ensure auxiliary audit tables exist
    await transactions.run(async (tx) => {
      await tx.execute(`
        CREATE TABLE IF NOT EXISTS "media_visibility_audit" (
            "id" UUID NOT NULL PRIMARY KEY,
            "operation_id" TEXT,
            "media_ref" TEXT NOT NULL,
            "event_ref" TEXT NOT NULL,
            "organizer_ref" TEXT NOT NULL,
            "action" TEXT NOT NULL,
            "previous_status" TEXT NOT NULL,
            "new_status" TEXT NOT NULL,
            "generation" BIGINT NOT NULL,
            "revision" BIGINT NOT NULL,
            "reason" TEXT,
            "committed_at" TIMESTAMPTZ NOT NULL
        )
      `);
      await tx.execute(`
        CREATE TABLE IF NOT EXISTS "media_visibility_denial_audit" (
            "id" UUID NOT NULL PRIMARY KEY,
            "operation_id" TEXT,
            "media_ref" TEXT NOT NULL,
            "event_ref" TEXT NOT NULL,
            "actor_ref" TEXT NOT NULL,
            "action" TEXT NOT NULL,
            "reason" TEXT NOT NULL,
            "attempted_at" TIMESTAMPTZ NOT NULL
        )
      `);

      await tx.execute(
        `INSERT INTO event (
           id, organizer_id, name, status, timezone, moderation_mode,
           uploads_enabled, guest_gallery_enabled, pin_enabled, created_at, updated_at
         ) VALUES (
           $1, $2, 'Boda E2E Moderacion', 'ACTIVE', 'America/Bogota', 'AUTO_PUBLISH',
           true, true, false, NOW(), NOW()
         )`,
        eventId,
        organizerId
      );
    });
  });

  afterAll(async () => {
    await transactions.run(async (tx) => {
      await tx.execute('DELETE FROM media_visibility_audit WHERE event_ref = $1', eventId);
      await tx.execute('DELETE FROM media_visibility_denial_audit WHERE event_ref = $1', eventId);
      await tx.execute('DELETE FROM media_trash_purge_intent WHERE event_ref = $1', eventId);
      await tx.execute('DELETE FROM media_trash_record WHERE event_ref = $1', eventId);
      await tx.execute('DELETE FROM audit_event WHERE metadata->>\'eventRef\' = $1', eventId);
      await tx.execute(
        'DELETE FROM media_inspection WHERE media_ref IN (SELECT media_ref FROM media_catalog WHERE event_ref = $1)',
        eventId
      );
      await tx.execute('DELETE FROM media_catalog WHERE event_ref = $1', eventId);
      await tx.execute(
        'DELETE FROM media_acceptance_intent WHERE media_ref NOT IN (SELECT media_ref FROM media_catalog)'
      );
      await tx.execute('DELETE FROM event WHERE id = $1', eventId);
    });
  });

  // =========================================================================
  // ESCENARIO 1: Acciones cotidianas (Aprobar, Rechazar, Ocultar, Republicar, Papelera, Restaurar)
  // =========================================================================
  describe('Escenario 1: Flujo completo de estados elegibles y no elegibles', () => {
    it('ejecuta el ciclo de vida: PENDING_REVIEW -> PUBLISHED -> HIDDEN -> PUBLISHED -> TRASHED -> restore -> PUBLISHED', async () => {
      const mediaRef = 'media:lifecycle-1-' + randomUUID();
      await seedMediaItem(mediaRef, 'PENDING_REVIEW', 1, 1);

      // 1. Aprobar (EL-TK-103)
      const approved = await moderationService.approveMedia({
        organizerRef: organizerId,
        eventRef: eventId,
        mediaRef
      });
      expect(approved.status).toBe('PUBLISHED');
      expect(approved.revision).toBe(2n);

      // 2. Ocultar (EL-TK-105)
      const hidden = await hideService.execute({
        organizerRef: organizerId,
        eventRef: eventId,
        mediaRef
      });
      expect(hidden.newStatus).toBe('HIDDEN');
      expect(hidden.revision).toBe(3n);

      // 3. Republicar (EL-TK-106)
      const republished = await republishService.execute({
        organizerRef: organizerId,
        eventRef: eventId,
        mediaRef
      });
      expect(republished.newStatus).toBe('PUBLISHED');
      expect(republished.revision).toBe(4n);

      // 4. Enviar a papelera (EL-TK-107, DEC-096)
      const trashed = await moderationService.trashMedia({
        organizerRef: organizerId,
        eventRef: eventId,
        mediaRef,
        reason: 'ocultar temporalmente'
      });
      expect(trashed.status).toBe('TRASHED');
      expect(trashed.previousStatus).toBe('PUBLISHED');
      expect(trashed.revision).toBe(5n);
      expect(trashed.restoreDeadline.getTime()).toBeGreaterThan(trashed.trashedAt.getTime());

      // 5. Restaurar antes del deadline (EL-TK-108, DEC-086)
      const restored = await moderationService.restoreMedia({
        organizerRef: organizerId,
        eventRef: eventId,
        mediaRef,
        now: new Date(trashed.trashedAt.getTime() + 1000) // 1s después de enviada a papelera
      });
      expect(restored.status).toBe('PUBLISHED');
      expect(restored.previousStatus).toBe('TRASHED');
      expect(restored.restoredFromStatus).toBe('PUBLISHED');
      expect(restored.revision).toBe(6n);
    });

    it('restaura conservando fielmente previous_status = HIDDEN sin auto-publicar indebidamente (DEC-086)', async () => {
      const mediaRef = 'media:lifecycle-hidden-' + randomUUID();
      await seedMediaItem(mediaRef, 'HIDDEN', 1, 1);

      const trashed = await moderationService.trashMedia({
        organizerRef: organizerId,
        eventRef: eventId,
        mediaRef
      });
      expect(trashed.status).toBe('TRASHED');
      expect(trashed.previousStatus).toBe('HIDDEN');

      const restored = await moderationService.restoreMedia({
        organizerRef: organizerId,
        eventRef: eventId,
        mediaRef,
        now: new Date(trashed.trashedAt.getTime() + 5000)
      });
      expect(restored.status).toBe('HIDDEN'); // Recupera HIDDEN, NO PUBLISHED
      expect(restored.restoredFromStatus).toBe('HIDDEN');
    });

    it('restaura conservando fielmente previous_status = PENDING_REVIEW sin auto-publicar indebidamente (DEC-086)', async () => {
      const mediaRef = 'media:lifecycle-pending-' + randomUUID();
      await seedMediaItem(mediaRef, 'PENDING_REVIEW', 1, 1);

      const trashed = await moderationService.trashMedia({
        organizerRef: organizerId,
        eventRef: eventId,
        mediaRef
      });
      expect(trashed.status).toBe('TRASHED');
      expect(trashed.previousStatus).toBe('PENDING_REVIEW');

      const restored = await moderationService.restoreMedia({
        organizerRef: organizerId,
        eventRef: eventId,
        mediaRef,
        now: new Date(trashed.trashedAt.getTime() + 5000)
      });
      expect(restored.status).toBe('PENDING_REVIEW'); // Permanece en revisión
      expect(restored.restoredFromStatus).toBe('PENDING_REVIEW');
    });

    it('rechaza papelera para estados no elegibles como PROCESSING y UPLOADED (DEC-096)', async () => {
      const mediaProcessing = 'media:proc-' + randomUUID();
      await seedMediaItem(mediaProcessing, 'PROCESSING', 1, 1);

      await expect(
        moderationService.trashMedia({
          organizerRef: organizerId,
          eventRef: eventId,
          mediaRef: mediaProcessing
        })
      ).rejects.toMatchObject({ code: 'INELIGIBLE_STATE' });

      const mediaUploaded = 'media:upl-' + randomUUID();
      await seedMediaItem(mediaUploaded, 'UPLOADED', 1, 1);

      await expect(
        moderationService.trashMedia({
          organizerRef: organizerId,
          eventRef: eventId,
          mediaRef: mediaUploaded
        })
      ).rejects.toMatchObject({ code: 'INELIGIBLE_STATE' });
    });
  });

  // =========================================================================
  // ESCENARIO 2: Expiración de papelera y carrera de concurrencia (EL-TK-109, EL-TK-112)
  // =========================================================================
  describe('Escenario 2: Expiración de papelera a purga y carrera de concurrencia', () => {
    it('entrega a purga una media tras vencer el deadline (EL-TK-109), registra ancla y emite al dispatcher', async () => {
      const mediaRef = 'media:expired-1-' + randomUUID();
      await seedMediaItem(mediaRef, 'PUBLISHED', 1, 1);

      const trashed = await moderationService.trashMedia({
        organizerRef: organizerId,
        eventRef: eventId,
        mediaRef
      });

      // Simular que el reloj del sistema llega y supera el deadline de 7 días
      const expiredNow = new Date(trashed.restoreDeadline.getTime() + 1000);
      const purgeResult = await moderationService.expireTrashMedia({
        mediaRef,
        now: expiredNow
      });

      expect(purgeResult.outcome).toBe('PURGE_REQUESTED');
      expect(purgeResult.purgeIntentId).toBeDefined();
      expect(purgeResult.purgeStartedAt).toEqual(trashed.restoreDeadline); // Ancla persistida DEC-109
      expect(purgeResult.mainPurgeDeadline).toBeDefined();
      expect(purgeResult.residualPurgeDeadline).toBeDefined();

      // Verificar que en base de datos quedó en DELETED
      await transactions.run(async (tx) => {
        const rows = await tx.query<{ status: string }>(
          'SELECT status FROM media_catalog WHERE media_ref = $1',
          mediaRef
        );
        expect(rows[0].status).toBe('DELETED');
      });

      // Reintento idempotente (Escenario 2 de EL-TK-109)
      const replay = await moderationService.expireTrashMedia({
        mediaRef,
        now: new Date(expiredNow.getTime() + 3600000)
      });
      expect(replay.outcome).toBe('ALREADY_PURGED');

      // Intento posterior de restauración falla irreversiblemente con MEDIA_PURGED o RESTORE_WINDOW_EXPIRED
      await expect(
        moderationService.restoreMedia({
          organizerRef: organizerId,
          eventRef: eventId,
          mediaRef,
          now: expiredNow
        })
      ).rejects.toMatchObject({ code: 'MEDIA_PURGED' });
    });

    it('un job atrasado en una media que ya fue restaurada antes del deadline es un no-op seguro (EL-TK-109 Escenario 3)', async () => {
      const mediaRef = 'media:restored-then-delayed-' + randomUUID();
      await seedMediaItem(mediaRef, 'PUBLISHED', 1, 1);

      const trashed = await moderationService.trashMedia({
        organizerRef: organizerId,
        eventRef: eventId,
        mediaRef
      });

      // Restaurada legítimamente a los 2 días (antes del deadline)
      await moderationService.restoreMedia({
        organizerRef: organizerId,
        eventRef: eventId,
        mediaRef,
        now: new Date(trashed.trashedAt.getTime() + 2 * 24 * 3600 * 1000)
      });

      // Job atrasado llega a los 10 días
      const delayedResult = await moderationService.expireTrashMedia({
        mediaRef,
        now: new Date(trashed.trashedAt.getTime() + 10 * 24 * 3600 * 1000)
      });

      expect(delayedResult.outcome).toBe('SKIPPED_ALREADY_RESTORED');

      // Media sigue PUBLISHED en la base de datos
      await transactions.run(async (tx) => {
        const rows = await tx.query<{ status: string }>(
          'SELECT status FROM media_catalog WHERE media_ref = $1',
          mediaRef
        );
        expect(rows[0].status).toBe('PUBLISHED');
      });
    });

    it('en carrera entre restauración y expiración cerca del deadline, sólo una decisión consistente prevalece (EL-TK-112 Escenario 2)', async () => {
      const mediaRef = 'media:race-1-' + randomUUID();
      await seedMediaItem(mediaRef, 'PUBLISHED', 1, 1);

      const trashed = await moderationService.trashMedia({
        organizerRef: organizerId,
        eventRef: eventId,
        mediaRef
      });

      const boundaryDate = new Date(trashed.restoreDeadline.getTime());

      // Ejecutar simultáneamente restore (a boundary - 1ms) y expire (a boundary)
      const [resRestore, resExpire] = await Promise.allSettled([
        moderationService.restoreMedia({
          organizerRef: organizerId,
          eventRef: eventId,
          mediaRef,
          now: new Date(boundaryDate.getTime() - 1000) // Válido para restaurar
        }),
        moderationService.expireTrashMedia({
          mediaRef,
          now: boundaryDate // Válido para expirar
        })
      ]);

      // Verificamos consistencia: una de las dos tuvo éxito total y la otra respondió de forma coherente
      await transactions.run(async (tx) => {
        const rows = await tx.query<{ status: string }>(
          'SELECT status FROM media_catalog WHERE media_ref = $1',
          mediaRef
        );
        const finalStatus = rows[0].status;
        expect(['PUBLISHED', 'DELETED']).toContain(finalStatus);

        if (finalStatus === 'PUBLISHED') {
          // Ganó restauración: restore fue fulfilled y expire fue SKIPPED_ALREADY_RESTORED
          expect(resRestore.status).toBe('fulfilled');
          if (resExpire.status === 'fulfilled') {
            expect(resExpire.value.outcome).toBe('SKIPPED_ALREADY_RESTORED');
          }
        } else {
          // Ganó expiración: expire fue PURGE_REQUESTED y restore fue rejected
          expect(resExpire.status).toBe('fulfilled');
          expect((resExpire as any).value.outcome).toBe('PURGE_REQUESTED');
          expect(resRestore.status).toBe('rejected');
        }
      });
    });
  });

  // =========================================================================
  // ESCENARIO 3: Cambio de modo de moderación sin reescribir contenido (EL-TK-110, DEC-087)
  // =========================================================================
  describe('Escenario 3: Cambio de modo de moderación y preservación DEC-087', () => {
    it('al cambiar modo de AUTO_PUBLISH a MANUAL_REVIEW en evento ACTIVE, los pendientes y publicados preexistentes no se alteran', async () => {
      const mediaPending = 'media:mod-pending-' + randomUUID();
      const mediaPublished = 'media:mod-pub-' + randomUUID();

      await seedMediaItem(mediaPending, 'PENDING_REVIEW', 1, 1);
      await seedMediaItem(mediaPublished, 'PUBLISHED', 1, 1);

      // Cambiar modo a MANUAL_REVIEW en evento ACTIVE (EL-TK-110)
      const changeRes = await eventDraftService.setModerationMode({
        actorContext: {
          actorType: 'ORGANIZER_HUMAN',
          accountId: organizerId
        },
        eventId,
        moderationMode: 'MANUAL_REVIEW'
      });

      expect(changeRes.outcome).toBe('UPDATED');
      expect(changeRes.event.moderationMode).toBe('MANUAL_REVIEW');

      // Escenario 1 & 3 de EL-TK-110: verificar que los registros en DB no fueron alterados
      await transactions.run(async (tx) => {
        const pendingRow = await tx.query<{ status: string }>(
          'SELECT status FROM media_catalog WHERE media_ref = $1',
          mediaPending
        );
        expect(pendingRow[0].status).toBe('PENDING_REVIEW'); // Sigue PENDING_REVIEW

        const publishedRow = await tx.query<{ status: string }>(
          'SELECT status FROM media_catalog WHERE media_ref = $1',
          mediaPublished
        );
        expect(publishedRow[0].status).toBe('PUBLISHED'); // Sigue PUBLISHED
      });

      // Escenario 2 de EL-TK-110: PostgresMediaGovernance lee el modo vigente al finalizar
      await transactions.run(async (tx) => {
        const decision = await mediaGovernance.lockAndRead(tx, {
          eventRef: eventId,
          mediaRef: mediaPending
        });
        expect(decision.mode).toBe('PRE_REVIEW'); // Adoptó MANUAL_REVIEW -> PRE_REVIEW
        expect(decision.decision).toBe('ALLOW');
      });

      // Cambiar de vuelta a AUTO_PUBLISH
      const revertRes = await eventDraftService.setModerationMode({
        actorContext: {
          actorType: 'ORGANIZER_HUMAN',
          accountId: organizerId
        },
        eventId,
        moderationMode: 'AUTO_PUBLISH'
      });
      expect(revertRes.event.moderationMode).toBe('AUTO_PUBLISH');

      await transactions.run(async (tx) => {
        const decisionAuto = await mediaGovernance.lockAndRead(tx, {
          eventRef: eventId,
          mediaRef: mediaPending
        });
        expect(decisionAuto.mode).toBe('AUTO'); // Adoptó AUTO_PUBLISH -> AUTO
      });
    });
  });
});
