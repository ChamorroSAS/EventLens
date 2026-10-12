import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  PrismaTransactions,
  createPrismaClient,
} from '@eventlens/job-queue';
import type { AdminActorContext } from '@eventlens/identity';
import {
  MediaReportService,
  OwnMediaRemovalService,
  RemovalRequestService,
  MediaCaseGovernanceService,
  PostgresMediaReportRepository,
  PostgresOwnRemovalRepository,
  PostgresRemovalRequestRepository,
  PostgresMediaCaseGovernanceRepository,
  PostgresGuestSessionResolver,
  OwnRemovalError,
  RemovalRequestError,
  MediaCaseGovernanceError,
} from '../src/media-report-and-removal.js';
import type { PurgeDispatcherPort, PurgeRequestPayload } from '../src/media-moderation.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('EL-TK-123: Validación integral E2E de privacidad y resolución de reportes/retiros (PostgreSQL 16)', () => {
  const client = createPrismaClient(databaseUrl!);
  const transactions = new PrismaTransactions(client, 10000);

  const reportRepo = new PostgresMediaReportRepository();
  const ownRemovalRepo = new PostgresOwnRemovalRepository();
  const removalReqRepo = new PostgresRemovalRequestRepository();
  const governanceRepo = new PostgresMediaCaseGovernanceRepository();
  const guestSessionResolver = new PostgresGuestSessionResolver();

  const dispatchedPurges: PurgeRequestPayload[] = [];
  const purgeDispatcher: PurgeDispatcherPort = {
    async dispatchPurgeRequest(request: PurgeRequestPayload): Promise<void> {
      dispatchedPurges.push(request);
    },
  };

  const reportService = new MediaReportService(transactions, reportRepo);
  const ownRemovalService = new OwnMediaRemovalService(
    transactions,
    ownRemovalRepo,
    guestSessionResolver,
    purgeDispatcher
  );
  const removalReqService = new RemovalRequestService(transactions, removalReqRepo);
  const governanceService = new MediaCaseGovernanceService(
    transactions,
    governanceRepo,
    purgeDispatcher
  );

  const adminContext: AdminActorContext = {
    actorType: 'ADMIN_HUMAN',
    principalId: randomUUID(),
    identifier: 'security-admin@eventlens.local',
    sessionId: randomUUID(),
    authTime: new Date(),
    credentialRevision: 1n,
    adminAuthRevision: 1n,
    sessionWatermark: 1n,
    recoveryEpoch: 1n,
  };

  const eventId = randomUUID();
  const organizerId = randomUUID();
  const uploaderSessionId = randomUUID();
  const otherSessionId = randomUUID();

  beforeAll(async () => {
    await transactions.run(async (tx) => {
      // 1. Evento activo
      await tx.execute(
        `INSERT INTO event (
           id, organizer_id, name, status, timezone, moderation_mode,
           uploads_enabled, guest_gallery_enabled, pin_enabled, created_at, updated_at
         ) VALUES (
           $1, $2, 'Boda E2E Gobernanza', 'ACTIVE', 'America/Bogota', 'AUTO_PUBLISH',
           true, true, false, NOW(), NOW()
         )`,
        eventId,
        organizerId
      );

      // 2. Sesión guest del uploader legítimo
      await tx.execute(
        `INSERT INTO guest_session (
           id, event_id, token_hash, credential_generation, created_at, expires_at
         ) VALUES (
           $1::uuid, $2::uuid, 'token-uploader-hash', 1, NOW(), NOW() + INTERVAL '24 hours'
         )`,
        uploaderSessionId,
        eventId
      );

      // 3. Sesión guest de otro participante ajeno
      await tx.execute(
        `INSERT INTO guest_session (
           id, event_id, token_hash, credential_generation, created_at, expires_at
         ) VALUES (
           $1::uuid, $2::uuid, 'token-other-hash', 1, NOW(), NOW() + INTERVAL '24 hours'
         )`,
        otherSessionId,
        eventId
      );
    });
  });

  afterAll(async () => {
    await transactions.run(async (tx) => {
      await tx.execute('DELETE FROM media_case_access_grant');
      await tx.execute('DELETE FROM media_case_history');
      await tx.execute('DELETE FROM media_report_case WHERE event_ref = $1', eventId);
      await tx.execute('DELETE FROM media_removal_request WHERE event_ref = $1', eventId);
      await tx.execute('DELETE FROM media_own_removal_record WHERE event_ref = $1', eventId);
      await tx.execute('DELETE FROM audit_event WHERE metadata->>\'eventRef\' = $1', eventId);
      await tx.execute('DELETE FROM media_catalog WHERE event_ref = $1', eventId);
      await tx.execute(
        'DELETE FROM media_acceptance_intent WHERE media_ref NOT IN (SELECT media_ref FROM media_catalog)'
      );
      await tx.execute('DELETE FROM guest_session WHERE event_id = $1::uuid', eventId);
      await tx.execute('DELETE FROM event WHERE id = $1', eventId);
    });
  });

  // Helper para insertar registros en media_catalog
  async function seedMediaCatalog(
    mediaRef: string,
    guestRef: string,
    status: string = 'PUBLISHED'
  ): Promise<void> {
    await transactions.run(async (tx) => {
      const intentId = 'intent:' + randomUUID();
      const jobId = randomUUID();

      await tx.execute(
        `INSERT INTO job_queue (
           id, dedup_key, fingerprint, type, handler_version, resource_ref,
           generation, queue, priority, payload, status, available_at
         ) VALUES (
           $1::uuid, $2, 'fp', 'MEDIA_INSPECTION', '1', $3, 1, 'q', 1, '{}'::jsonb, 'COMPLETED', NOW()
         )`,
        jobId,
        'dedup:' + randomUUID(),
        mediaRef
      );

      await tx.execute(
        `INSERT INTO media_acceptance_intent (intent_id, media_ref, generation, fingerprint, facts)
         VALUES ($1, $2, 1, 'fp', '{}'::jsonb)`,
        intentId,
        mediaRef
      );

      await tx.execute(
        `INSERT INTO media_catalog (
           media_ref, intent_id, event_ref, guest_ref, generation, revision, status, original, job_id
         ) VALUES (
           $1, $2, $3, $4, 1, 1, $5, '{"fileName":"test.jpg"}'::jsonb, $6::uuid
         )`,
        mediaRef,
        intentId,
        eventId,
        guestRef,
        status,
        jobId
      );
    });
  }

  // ==========================================================================
  // ESCENARIO 1: Uploader retira aporte propio (DEC-089 / DEC-097)
  // ==========================================================================
  describe('Escenario 1: Retiro propio irreversible por uploader con sesión guest (DEC-089 / DEC-097)', () => {
    it('retira aporte propio de inmediato, sale de visibilidad y emite purga irreversible downstream sin papelera', async () => {
      const mediaRef = 'media:own-e2e-' + randomUUID();
      await seedMediaCatalog(mediaRef, uploaderSessionId, 'PUBLISHED');

      dispatchedPurges.length = 0;

      const result = await ownRemovalService.removeOwnMedia({
        guestSessionRef: uploaderSessionId,
        mediaRef,
        eventRef: eventId,
      });

      expect(result.status).toBe('DELETED');
      expect(result.outcome).toBe('CONFIRMED');
      expect(result.purgeStartedAt).toBeDefined();
      expect(result.mainPurgeDeadline.getTime()).toBeGreaterThan(result.purgeStartedAt.getTime());

      // Verificación en DB: sale de visibilidad inmediatamente (status = DELETED)
      const catalogRows = await transactions.run(async (tx) => {
        return tx.query<{ status: string }>(
          'SELECT status FROM media_catalog WHERE media_ref = $1',
          mediaRef
        );
      });
      expect(catalogRows[0].status).toBe('DELETED');

      // Verificación en DB: registro de auditoría en media_own_removal_record
      const ownRows = await transactions.run(async (tx) => {
        return tx.query<{ status: string }>(
          'SELECT status FROM media_own_removal_record WHERE media_ref = $1',
          mediaRef
        );
      });
      expect(ownRows.length).toBe(1);
      expect(ownRows[0].status).toBe('CONFIRMED');

      // Purge dispatcher llamado downstream con política PRIVACY_OWN_REMOVAL
      expect(dispatchedPurges.length).toBe(1);
      expect(dispatchedPurges[0].mediaRef).toBe(mediaRef);
      expect(dispatchedPurges[0].policyRef).toBe('PRIVACY_OWN_REMOVAL');

      // Idempotencia: segundo llamado devuelve ALREADY_REMOVED sin duplicar purga
      const replay = await ownRemovalService.removeOwnMedia({
        guestSessionRef: uploaderSessionId,
        mediaRef,
        eventRef: eventId,
      });
      expect(replay.outcome).toBe('ALREADY_REMOVED');
      expect(dispatchedPurges.length).toBe(1);
    });

    it('rechaza con NOT_OWNER cuando otro invitado intenta retirar el aporte ajeno', async () => {
      const mediaRef = 'media:alien-e2e-' + randomUUID();
      await seedMediaCatalog(mediaRef, uploaderSessionId, 'PUBLISHED');

      await expect(
        ownRemovalService.removeOwnMedia({
          guestSessionRef: otherSessionId, // sesión ajena
          mediaRef,
          eventRef: eventId,
        })
      ).rejects.toThrow(OwnRemovalError);

      // El contenido se mantiene PUBLISHED
      const catalogRows = await transactions.run(async (tx) => {
        return tx.query<{ status: string }>(
          'SELECT status FROM media_catalog WHERE media_ref = $1',
          mediaRef
        );
      });
      expect(catalogRows[0].status).toBe('PUBLISHED');
    });
  });

  // ==========================================================================
  // ESCENARIO 2: Solicitud de retiro sin sesión (DEC-103..105)
  // ==========================================================================
  describe('Escenario 2: Solicitud de retiro intake sin sesión (DEC-103..105)', () => {
    it('registra solicitud para revisión sin recuperar sesión ni borrar automáticamente', async () => {
      const mediaRef = 'media:intake-e2e-' + randomUUID();
      await seedMediaCatalog(mediaRef, uploaderSessionId, 'PUBLISHED');

      const result = await removalReqService.registerRequest({
        eventRef: eventId,
        mediaRef,
        reason: 'APPEAR_IN_MEDIA',
        contactEmail: 'solicitante@externo.org',
        optionalName: 'Laura Invitada',
        declarationAccepted: true,
      });

      expect(result.requestId).toBeDefined();
      expect(result.status).toBe('RECEIVED');
      expect(result.message).toBe('Solicitud recibida para revisión');

      // Verificación en DB: la solicitud existe en media_removal_request
      const reqRows = await transactions.run(async (tx) => {
        return tx.query<{ status: string; contact_email: string; declaration_accepted: boolean }>(
          'SELECT status, contact_email, declaration_accepted FROM media_removal_request WHERE id = $1::uuid',
          result.requestId
        );
      });
      expect(reqRows.length).toBe(1);
      expect(reqRows[0].status).toBe('PENDING_REVIEW');
      expect(reqRows[0].contact_email).toBe('solicitante@externo.org');
      expect(reqRows[0].declaration_accepted).toBe(true);

      // Crucial: el contenido SIGUE PUBLISHED en la galería (no se elimina automáticamente)
      const catalogRows = await transactions.run(async (tx) => {
        return tx.query<{ status: string }>(
          'SELECT status FROM media_catalog WHERE media_ref = $1',
          mediaRef
        );
      });
      expect(catalogRows[0].status).toBe('PUBLISHED');
    });

    it('valida que OTHER requiera descripción obligatoria (DEC-104) y declaración no preseleccionada (DEC-105)', async () => {
      const mediaRef = 'media:invalid-e2e-' + randomUUID();

      // Falla si OTHER no tiene descripción
      await expect(
        removalReqService.registerRequest({
          eventRef: eventId,
          mediaRef,
          reason: 'OTHER',
          contactEmail: 'valido@correo.com',
          declarationAccepted: true,
        })
      ).rejects.toThrow(RemovalRequestError);

      // Falla si declaración de buena fe es false
      await expect(
        removalReqService.registerRequest({
          eventRef: eventId,
          mediaRef,
          reason: 'PRIVACY_VIOLATION',
          contactEmail: 'valido@correo.com',
          declarationAccepted: false,
        })
      ).rejects.toThrow(RemovalRequestError);
    });
  });

  // ==========================================================================
  // ESCENARIO 3: Reporte grave, clasificación, acceso temporal y resolución (DEC-088)
  // ==========================================================================
  describe('Escenario 3: Reporte grave, clasificación prioritaria sin auto-hide, acceso justificado y resolución downstream (DEC-088)', () => {
    it('flujo completo de moderación y auditoría inmutable', async () => {
      const mediaRef = 'media:report-e2e-' + randomUUID();
      await seedMediaCatalog(mediaRef, uploaderSessionId, 'PUBLISHED');

      // 1. Invitado envía denuncia de intimidad
      const reportResult = await reportService.registerReport({
        eventRef: eventId,
        mediaRef,
        reason: 'INTIMACY_VIOLATION',
        description: 'Material íntimo subido sin consentimiento',
        reporterContact: 'denunciante@segura.org',
      });
      expect(reportResult.caseId).toBeDefined();
      expect(reportResult.status).toBe('RECEIVED');
      expect(reportResult.message).toBe('Reporte recibido para revisión');

      // 2. Moderador consulta la cola sanitizada (sin previewUrl de media en la lista per DEC-088)
      const queue = await governanceService.getCaseQueue({
        actorContext: adminContext,
      });
      expect(queue.items.length).toBeGreaterThanOrEqual(1);
      const caseItem = queue.items.find((it) => it.caseId === reportResult.caseId);
      expect(caseItem).toBeTruthy();
      expect(caseItem!.severity).toBe('UNCLASSIFIED');
      expect((caseItem as any).previewUrl).toBeUndefined();

      // 3. Admin clasifica como CRITICAL: DEC-088 exige alerta prioritaria pero NO auto-hide
      const classifyResult = await governanceService.classifyCase({
        caseId: reportResult.caseId,
        caseType: 'REPORT',
        severity: 'CRITICAL',
        justification: 'Infracción grave identificada por equipo de seguridad',
        actorContext: adminContext,
      });
      expect(classifyResult.newSeverity).toBe('CRITICAL');
      expect(classifyResult.priorityAlert).toBe(true);

      // Verificar que el contenido SIGUE PUBLISHED (DEC-088: denuncia grave no auto-oculta)
      const catalogAfterClassify = await transactions.run(async (tx) => {
        return tx.query<{ status: string }>(
          'SELECT status FROM media_catalog WHERE media_ref = $1',
          mediaRef
        );
      });
      expect(catalogAfterClassify[0].status).toBe('PUBLISHED');

      // 4. Admin solicita acceso para inspección técnica: exige motivo
      await expect(
        governanceService.grantAdministrativeMediaAccess({
          caseId: reportResult.caseId,
          caseType: 'REPORT',
          justification: '   ', // motivo vacío
          actorContext: adminContext,
        })
      ).rejects.toThrow(MediaCaseGovernanceError);

      // Con motivo válido, obtiene grant de 15 minutos
      const accessGrant = await governanceService.grantAdministrativeMediaAccess({
        caseId: reportResult.caseId,
        caseType: 'REPORT',
        justification: 'Inspección técnica requerida para evaluar retiro definitivo',
        actorContext: adminContext,
      });
      expect(accessGrant.token).toBeDefined();
      expect(accessGrant.previewUrl).toContain(mediaRef);
      expect(accessGrant.expiresAt.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000);

      // 5. Admin aplica ocultamiento preventivo (DEC-088)
      const hideResult = await governanceService.applyPreventiveHide({
        caseId: reportResult.caseId,
        caseType: 'REPORT',
        justification: 'Medida precautoria mientras se notifica y culmina la investigación',
        actorContext: adminContext,
      });
      expect(hideResult.newStatus).toBe('HIDDEN');

      // Verificar que ahora el contenido está HIDDEN en el catálogo
      const catalogAfterHide = await transactions.run(async (tx) => {
        return tx.query<{ status: string }>(
          'SELECT status FROM media_catalog WHERE media_ref = $1',
          mediaRef
        );
      });
      expect(catalogAfterHide[0].status).toBe('HIDDEN');

      // 6. Admin resuelve definitivamente el caso con REMOVED_PERMANENTLY
      dispatchedPurges.length = 0;

      const resolveResult = await governanceService.resolveCase({
        caseId: reportResult.caseId,
        caseType: 'REPORT',
        resolutionType: 'REMOVED_PERMANENTLY',
        justification: 'Violación confirmada de políticas de intimidad. Eliminación permanente.',
        actorContext: adminContext,
      });
      expect(resolveResult.status).toBe('ACTION_TAKEN');
      expect(resolveResult.resolutionType).toBe('REMOVED_PERMANENTLY');
      expect(resolveResult.purgeDispatched).toBe(true);

      // Contenido pasa a DELETED en catálogo
      const catalogAfterResolve = await transactions.run(async (tx) => {
        return tx.query<{ status: string }>(
          'SELECT status FROM media_catalog WHERE media_ref = $1',
          mediaRef
        );
      });
      expect(catalogAfterResolve[0].status).toBe('DELETED');

      // Purge dispatcher llamado downstream
      expect(dispatchedPurges.length).toBe(1);
      expect(dispatchedPurges[0].mediaRef).toBe(mediaRef);

      // 7. Detalle del caso contiene historial inmutable
      const detail = await governanceService.getCaseDetail({
        caseId: reportResult.caseId,
        caseType: 'REPORT',
        actorContext: adminContext,
      });
      expect(detail.status).toBe('ACTION_TAKEN');
      expect(detail.mediaStatus).toBe('DELETED');
      expect(detail.history.length).toBeGreaterThanOrEqual(4);

      // Replay idempotente al resolver caso ya cerrado
      const replayResolve = await governanceService.resolveCase({
        caseId: reportResult.caseId,
        caseType: 'REPORT',
        resolutionType: 'REMOVED_PERMANENTLY',
        justification: 'Reintento de resolución ya ejecutada',
        actorContext: adminContext,
      });
      expect(replayResolve.status).toBe('ACTION_TAKEN');
      expect(replayResolve.alreadyResolved).toBe(true);
      expect(dispatchedPurges.length).toBe(1); // sin doble purga
    });
  });
});
