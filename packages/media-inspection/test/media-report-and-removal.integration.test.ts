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
} from '../src/media-report-and-removal.js';
import type { PurgeDispatcherPort, PurgeRequestPayload } from '../src/media-moderation.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('EL-EP-009 Ruta A: Integración en PostgreSQL 16 (EL-TK-113, EL-TK-114, EL-TK-115)', () => {
  const client = createPrismaClient(databaseUrl!);
  const transactions = new PrismaTransactions(client, 10000);

  const reportRepo = new PostgresMediaReportRepository();
  const ownRemovalRepo = new PostgresOwnRemovalRepository();
  const removalReqRepo = new PostgresRemovalRequestRepository();
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

  const eventId = randomUUID();
  const organizerId = randomUUID();
  const guestSessionId = randomUUID();

  beforeAll(async () => {
    await transactions.run(async (tx) => {
      // 1. Insertar evento activo
      await tx.execute(
        `INSERT INTO event (
           id, organizer_id, name, status, timezone, moderation_mode,
           uploads_enabled, guest_gallery_enabled, pin_enabled, created_at, updated_at
         ) VALUES (
           $1, $2, 'Boda Ruta A Integración', 'ACTIVE', 'America/Bogota', 'AUTO_PUBLISH',
           true, true, false, NOW(), NOW()
         )`,
        eventId,
        organizerId
      );

      // 2. Insertar sesión de invitado activa
      await tx.execute(
        `INSERT INTO guest_session (
           id, event_id, token_hash, credential_generation, created_at, expires_at
         ) VALUES (
           $1::uuid, $2::uuid, 'token-hash-test', 1, NOW(), NOW() + INTERVAL '24 hours'
         )`,
        guestSessionId,
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

  // Helper para insertar media en el catálogo
  async function seedMediaCatalog(
    mediaRef: string,
    guestRef: string,
    status: string = 'PUBLISHED'
  ): Promise<void> {
    await transactions.run(async (tx) => {
      const intentId = 'intent:' + randomUUID();
      const jobId = randomUUID();

      await tx.execute(
        `INSERT INTO job_queue (id, dedup_key, fingerprint, type, handler_version, resource_ref, generation, queue, priority, payload, status, available_at)
         VALUES ($1::uuid, $2, 'fp', 'MEDIA_INSPECTION', '1', $3, 1, 'q', 1, '{}'::jsonb, 'COMPLETED', NOW())`,
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
        `INSERT INTO media_catalog (media_ref, intent_id, event_ref, guest_ref, generation, revision, status, original, job_id)
         VALUES ($1, $2, $3, $4, 1, 1, $5, '{"fileName":"test.jpg"}'::jsonb, $6::uuid)`,
        mediaRef,
        intentId,
        eventId,
        guestRef,
        status,
        jobId
      );
    });
  }

  // =========================================================================
  // PRUEBAS DE EL-TK-113: MediaReportService
  // =========================================================================
  describe('EL-TK-113: Denuncias de contenido', () => {
    it('registra una denuncia para media visible y no modifica el estado del medio (DEC-088)', async () => {
      const mediaRef = 'media:report-test-' + randomUUID();
      await seedMediaCatalog(mediaRef, guestSessionId, 'PUBLISHED');

      const result = await reportService.registerReport({
        mediaRef,
        eventRef: eventId,
        reason: 'PRIVACY_VIOLATION',
        description: 'Solicito retiro por derecho a la intimidad',
        reporterContact: 'denunciante@eventlens.com',
      });

      expect(result.status).toBe('RECEIVED');
      expect(result.message).toBe('Reporte recibido para revisión');
      expect(result.caseId).toBeDefined();

      // Verificar en la base de datos que se persistió el caso
      const cases = await transactions.run(async (tx) =>
        tx.query<{ id: string; status: string; severity: string; reason: string }>(
          'SELECT id, status, severity, reason FROM media_report_case WHERE id = $1::uuid',
          result.caseId
        )
      );
      expect(cases.length).toBe(1);
      expect(cases[0].status).toBe('PENDING_REVIEW');
      expect(cases[0].severity).toBe('UNCLASSIFIED');
      expect(cases[0].reason).toBe('PRIVACY_VIOLATION');

      // DEC-088: Verificar que la media sigue en PUBLISHED (sin auto-ocultamiento)
      const mediaRow = await transactions.run(async (tx) =>
        tx.query<{ status: string }>('SELECT status FROM media_catalog WHERE media_ref = $1', mediaRef)
      );
      expect(mediaRow[0].status).toBe('PUBLISHED');
    });

    it('reintento con misma clave de deduplicación devuelve el caso existente', async () => {
      const mediaRef = 'media:report-idemp-' + randomUUID();
      await seedMediaCatalog(mediaRef, guestSessionId, 'PUBLISHED');
      const idempKey = 'key-' + randomUUID();

      const r1 = await reportService.registerReport({
        mediaRef,
        eventRef: eventId,
        reason: 'INAPPROPRIATE_CONTENT',
        idempotencyKey: idempKey,
      });

      const r2 = await reportService.registerReport({
        mediaRef,
        eventRef: eventId,
        reason: 'INAPPROPRIATE_CONTENT',
        idempotencyKey: idempKey,
      });

      expect(r1.caseId).toBe(r2.caseId);
    });

    it('neutralidad pública ante medios inexistentes o no visibles', async () => {
      const result = await reportService.registerReport({
        mediaRef: 'media:inexistente-' + randomUUID(),
        eventRef: eventId,
        reason: 'COPYRIGHT_INFRINGEMENT',
      });

      expect(result.status).toBe('RECEIVED');
      expect(result.message).toBe('Reporte recibido para revisión');

      // No debe haberse insertado caso operativo
      const count = await transactions.run(async (tx) =>
        tx.query<{ cnt: number }>('SELECT count(*)::int as cnt FROM media_report_case WHERE id = $1::uuid', result.caseId)
      );
      expect(count[0].cnt).toBe(0);
    });
  });

  // =========================================================================
  // PRUEBAS DE EL-TK-114: OwnMediaRemovalService
  // =========================================================================
  describe('EL-TK-114: Retiro propio inmediato con sesión guest', () => {
    it('retira inmediatamente de visibilidad a DELETED, fija ancla de purga y emite purga (DEC-089, DEC-097)', async () => {
      const mediaRef = 'media:own-removal-' + randomUUID();
      await seedMediaCatalog(mediaRef, guestSessionId, 'PUBLISHED');
      dispatchedPurges.length = 0;

      const result = await ownRemovalService.removeOwnMedia({
        guestSessionRef: guestSessionId,
        mediaRef,
        eventRef: eventId,
      });

      expect(result.status).toBe('DELETED');
      expect(result.outcome).toBe('CONFIRMED');
      expect(result.purgeStartedAt).toBeDefined();
      expect(result.mainPurgeDeadline.getTime()).toBeGreaterThan(result.purgeStartedAt.getTime());

      // Verificar que en media_catalog el estado cambió a DELETED y la revisión aumentó a 2
      const mediaRows = await transactions.run(async (tx) =>
        tx.query<{ status: string; revision: bigint }>(
          'SELECT status, revision FROM media_catalog WHERE media_ref = $1',
          mediaRef
        )
      );
      expect(mediaRows[0].status).toBe('DELETED');
      expect(BigInt(mediaRows[0].revision)).toBe(2n);

      // Verificar que se registró en media_own_removal_record
      const removalRows = await transactions.run(async (tx) =>
        tx.query<{ status: string; guest_ref: string }>(
          'SELECT status, guest_ref FROM media_own_removal_record WHERE media_ref = $1',
          mediaRef
        )
      );
      expect(removalRows.length).toBe(1);
      expect(removalRows[0].status).toBe('CONFIRMED');

      // Verificar que se emitió el despacho hacia PurgeDispatcherPort
      expect(dispatchedPurges.length).toBe(1);
      expect(dispatchedPurges[0].mediaRef).toBe(mediaRef);
      expect(dispatchedPurges[0].policyRef).toBe('PRIVACY_OWN_REMOVAL');
    });

    it('rechaza con NOT_OWNER si la media pertenece a otro usuario', async () => {
      const mediaRef = 'media:other-user-' + randomUUID();
      const anotherGuestId = randomUUID();
      await seedMediaCatalog(mediaRef, anotherGuestId, 'PUBLISHED');

      await expect(
        ownRemovalService.removeOwnMedia({
          guestSessionRef: guestSessionId,
          mediaRef,
          eventRef: eventId,
        })
      ).rejects.toThrow(OwnRemovalError);

      // El estado del medio debe permanecer PUBLISHED
      const rows = await transactions.run(async (tx) =>
        tx.query<{ status: string }>('SELECT status FROM media_catalog WHERE media_ref = $1', mediaRef)
      );
      expect(rows[0].status).toBe('PUBLISHED');
    });

    it('reintento de retiro es idempotente y no duplica emisión a purga', async () => {
      const mediaRef = 'media:own-idemp-' + randomUUID();
      await seedMediaCatalog(mediaRef, guestSessionId, 'PUBLISHED');
      dispatchedPurges.length = 0;

      const r1 = await ownRemovalService.removeOwnMedia({
        guestSessionRef: guestSessionId,
        mediaRef,
        eventRef: eventId,
      });
      expect(r1.outcome).toBe('CONFIRMED');
      expect(dispatchedPurges.length).toBe(1);

      const r2 = await ownRemovalService.removeOwnMedia({
        guestSessionRef: guestSessionId,
        mediaRef,
        eventRef: eventId,
      });
      expect(r2.outcome).toBe('ALREADY_REMOVED');
      expect(r2.purgeStartedAt.getTime()).toBe(r1.purgeStartedAt.getTime());
      // No se despachó una segunda purga
      expect(dispatchedPurges.length).toBe(1);
    });
  });

  // =========================================================================
  // PRUEBAS DE EL-TK-115: RemovalRequestService
  // =========================================================================
  describe('EL-TK-115: Solicitud de retiro sin sesión previa', () => {
    it('registra formalmente la solicitud para revisión con correo y declaración', async () => {
      const mediaRef = 'media:request-test-' + randomUUID();
      await seedMediaCatalog(mediaRef, guestSessionId, 'PUBLISHED');

      const result = await removalReqService.registerRequest({
        eventRef: eventId,
        mediaRef,
        reason: 'APPEAR_IN_MEDIA',
        contactEmail: 'afectado@example.com',
        declarationAccepted: true,
        optionalName: 'Persona Afectada',
      });

      expect(result.status).toBe('RECEIVED');
      expect(result.message).toBe('Solicitud recibida para revisión');
      expect(result.requestId).toBeDefined();

      const requests = await transactions.run(async (tx) =>
        tx.query<{ id: string; contact_email: string; declaration_accepted: boolean; status: string }>(
          'SELECT id, contact_email, declaration_accepted, status FROM media_removal_request WHERE id = $1::uuid',
          result.requestId
        )
      );
      expect(requests.length).toBe(1);
      expect(requests[0].contact_email).toBe('afectado@example.com');
      expect(requests[0].declaration_accepted).toBe(true);
      expect(requests[0].status).toBe('PENDING_REVIEW');
    });

    it('exige descripción cuando el motivo es OTHER (DEC-104)', async () => {
      await expect(
        removalReqService.registerRequest({
          eventRef: eventId,
          mediaRef: 'media:other-desc-' + randomUUID(),
          reason: 'OTHER',
          description: '',
          contactEmail: 'contact@example.com',
          declarationAccepted: true,
        })
      ).rejects.toThrow('La descripción es obligatoria cuando el motivo seleccionado es Otro');
    });

    it('exige declaración de buena fe obligatoria (DEC-103)', async () => {
      await expect(
        removalReqService.registerRequest({
          eventRef: eventId,
          mediaRef: 'media:decl-test-' + randomUUID(),
          reason: 'PRIVACY_VIOLATION',
          contactEmail: 'contact@example.com',
          declarationAccepted: false,
        })
      ).rejects.toThrow('La declaración de buena fe es obligatoria');
    });
  });

  // =========================================================================
  // EL-EP-009 RUTA B: Gobernanza de Casos en PostgreSQL 16 (EL-TK-116 .. EL-TK-120)
  // =========================================================================
  describe('EL-EP-009 Ruta B: Gobernanza de Casos en PostgreSQL 16 (EL-TK-116 .. EL-TK-120)', () => {
    const govRepo = new PostgresMediaCaseGovernanceRepository();
    const govPurgeDispatches: PurgeRequestPayload[] = [];
    const govPurgeDispatcher: PurgeDispatcherPort = {
      async dispatchPurgeRequest(req: PurgeRequestPayload) {
        govPurgeDispatches.push(req);
      },
    };

    const govService = new MediaCaseGovernanceService(
      transactions,
      govRepo,
      govPurgeDispatcher
    );

    const adminContext: AdminActorContext = {
      actorType: 'ADMIN_HUMAN',
      principalId: randomUUID(),
      identifier: 'admin-sec@eventlens.local',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      adminAuthRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n,
    };

    let reportCaseId: string;
    let removalCaseId: string;
    const mediaGovRef = 'media:gov-test-' + randomUUID();
    const mediaRemovalRef = 'media:gov-rem-' + randomUUID();

    beforeAll(async () => {
      // Sembrar media en PostgreSQL
      await seedMediaCatalog(mediaGovRef, guestSessionId, 'PUBLISHED');
      await seedMediaCatalog(mediaRemovalRef, guestSessionId, 'PUBLISHED');

      // Crear reporte inicial
      const reportRes = await reportService.registerReport({
        mediaRef: mediaGovRef,
        eventRef: eventId,
        reason: 'INTIMACY_VIOLATION',
        description: 'Caso grave para pruebas de gobernanza',
        reporterContact: 'denunciante@test.com',
      });
      reportCaseId = reportRes.caseId;

      // Crear solicitud de retiro inicial
      const removalRes = await removalReqService.registerRequest({
        mediaRef: mediaRemovalRef,
        eventRef: eventId,
        reason: 'APPEAR_IN_MEDIA',
        description: 'Solicitud de retiro de mi imagen',
        contactEmail: 'afectado@test.com',
        declarationAccepted: true,
      });
      removalCaseId = removalRes.requestId;
    });

    it('EL-TK-116: Clasifica severidad a CRITICAL en PostgreSQL, emite alerta y preserva visibilidad de media (DEC-088)', async () => {
      const result = await govService.classifyCase({
        caseId: reportCaseId,
        caseType: 'REPORT',
        severity: 'CRITICAL',
        justification: 'Infracción grave identificada por equipo de seguridad',
        actorContext: adminContext,
      });

      expect(result.newSeverity).toBe('CRITICAL');
      expect(result.priorityAlert).toBe(true);
      expect(result.targetSlaHours).toBe(24);

      // Verificar en PostgreSQL que severity se actualizó
      const caseRows = await transactions.run(async (tx) =>
        tx.query<{ severity: string; status: string }>(
          'SELECT severity, status FROM media_report_case WHERE id = $1::uuid',
          reportCaseId
        )
      );
      expect(caseRows[0].severity).toBe('CRITICAL');

      // Verificar que se registró en media_case_history
      const historyRows = await transactions.run(async (tx) =>
        tx.query<{ action: string; actor_id: string; justification: string }>(
          'SELECT action, actor_id, justification FROM media_case_history WHERE case_id = $1::uuid AND action = $2',
          reportCaseId,
          'CLASSIFY'
        )
      );
      expect(historyRows.length).toBe(1);
      expect(historyRows[0].actor_id).toBe(adminContext.principalId);

      // DEC-088: Verificar que la media SIGUE EN ESTADO PUBLISHED en PostgreSQL (no se auto-oculta)
      const mediaRows = await transactions.run(async (tx) =>
        tx.query<{ status: string }>(
          'SELECT status FROM media_catalog WHERE media_ref = $1',
          mediaGovRef
        )
      );
      expect(mediaRows[0].status).toBe('PUBLISHED');
    });

    it('EL-TK-117: Emite acceso temporal de 15 minutos en PostgreSQL y persiste grant sin loggear URL completa', async () => {
      const grant = await govService.grantAdministrativeMediaAccess({
        caseId: reportCaseId,
        caseType: 'REPORT',
        justification: 'Inspección administrativa para cotejo visual del rostro',
        actorContext: adminContext,
      });

      expect(grant.token).toBeDefined();
      expect(grant.previewUrl).toContain(`/api/v1/admin/cases/${reportCaseId}/media/${mediaGovRef}/preview?token=`);
      expect(grant.expiresAt.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000);

      // Verificar persistencia en PostgreSQL
      const grantRows = await transactions.run(async (tx) =>
        tx.query<{ id: string; admin_id: string; token: string; justification: string }>(
          'SELECT id, admin_id, token, justification FROM media_case_access_grant WHERE id = $1::uuid',
          grant.grantId
        )
      );
      expect(grantRows.length).toBe(1);
      expect(grantRows[0].admin_id).toBe(adminContext.principalId);
      expect(grantRows[0].justification).toBe('Inspección administrativa para cotejo visual del rostro');
    });

    it('EL-TK-118: Aplica ocultamiento preventivo administrativo pasando media a HIDDEN e idempotencia ante repetición', async () => {
      const hideResult = await govService.applyPreventiveHide({
        caseId: reportCaseId,
        caseType: 'REPORT',
        justification: 'Ocultamiento preventivo confirmado tras cotejo visual',
        actorContext: adminContext,
      });

      expect(hideResult.previousStatus).toBe('PUBLISHED');
      expect(hideResult.newStatus).toBe('HIDDEN');
      expect(hideResult.idempotent).toBe(false);

      // Verificar que en media_catalog pasó a HIDDEN
      const mediaRows = await transactions.run(async (tx) =>
        tx.query<{ status: string }>(
          'SELECT status FROM media_catalog WHERE media_ref = $1',
          mediaGovRef
        )
      );
      expect(mediaRows[0].status).toBe('HIDDEN');

      // Verificar que el caso pasó a UNDER_INVESTIGATION
      const caseRows = await transactions.run(async (tx) =>
        tx.query<{ status: string }>(
          'SELECT status FROM media_report_case WHERE id = $1::uuid',
          reportCaseId
        )
      );
      expect(caseRows[0].status).toBe('UNDER_INVESTIGATION');

      // Idempotencia: segundo llamado no altera nada
      const hideRetry = await govService.applyPreventiveHide({
        caseId: reportCaseId,
        caseType: 'REPORT',
        justification: 'Re-confirmación idempotente',
        actorContext: adminContext,
      });
      expect(hideRetry.idempotent).toBe(true);
      expect(hideRetry.newStatus).toBe('HIDDEN');
    });

    it('EL-TK-119: Resuelve con REMOVED_PERMANENTLY con purga inmediata sin papelera de owner e idempotencia ante repetición', async () => {
      govPurgeDispatches.length = 0;

      const resolveResult = await govService.resolveCase({
        caseId: reportCaseId,
        caseType: 'REPORT',
        resolutionType: 'REMOVED_PERMANENTLY',
        justification: 'Contenido infractor confirmado: eliminación definitiva y purga inmediata',
        actorContext: adminContext,
      });

      expect(resolveResult.status).toBe('ACTION_TAKEN');
      expect(resolveResult.resolutionType).toBe('REMOVED_PERMANENTLY');
      expect(resolveResult.mediaStatus).toBe('DELETED');
      expect(resolveResult.purgeDispatched).toBe(true);
      expect(resolveResult.alreadyResolved).toBe(false);

      // Verificar en PostgreSQL resolución del caso
      const caseRows = await transactions.run(async (tx) =>
        tx.query<{ status: string; resolution_type: string; resolved_by: string }>(
          'SELECT status, resolution_type, resolved_by FROM media_report_case WHERE id = $1::uuid',
          reportCaseId
        )
      );
      expect(caseRows[0].status).toBe('ACTION_TAKEN');
      expect(caseRows[0].resolution_type).toBe('REMOVED_PERMANENTLY');
      expect(caseRows[0].resolved_by).toBe(adminContext.principalId);

      // Verificar que media pasó a DELETED en PostgreSQL
      const mediaRows = await transactions.run(async (tx) =>
        tx.query<{ status: string }>(
          'SELECT status FROM media_catalog WHERE media_ref = $1',
          mediaGovRef
        )
      );
      expect(mediaRows[0].status).toBe('DELETED');

      // Verificar despacho de purga
      expect(govPurgeDispatches.length).toBe(1);
      expect(govPurgeDispatches[0].mediaRef).toBe(mediaGovRef);

      // Idempotencia: resolver de nuevo devuelve alreadyResolved: true sin doble purge
      const replayResult = await govService.resolveCase({
        caseId: reportCaseId,
        caseType: 'REPORT',
        resolutionType: 'REMOVED_PERMANENTLY',
        justification: 'Intento repetido',
        actorContext: adminContext,
      });
      expect(replayResult.alreadyResolved).toBe(true);
      expect(replayResult.purgeDispatched).toBe(false);
      expect(govPurgeDispatches.length).toBe(1); // Sigue en 1
    });

    it('EL-TK-120: Consulta cola sanitizada ordenada por severidad y detalle con historial y capacidades en PostgreSQL', async () => {
      // 1. Clasificar removal request a NORMAL
      await govService.classifyCase({
        caseId: removalCaseId,
        caseType: 'REMOVAL_REQUEST',
        severity: 'NORMAL',
        justification: 'Solicitud ordinaria de retiro',
        actorContext: adminContext,
      });

      // 2. Consultar la cola
      const queue = await govService.getCaseQueue({
        actorContext: adminContext,
      });

      expect(queue.items.length).toBeGreaterThanOrEqual(2);
      expect(queue.emptyReason).toBe('NONE');

      // Verificar que no se expone previewUrl en ningún item de la cola
      for (const item of queue.items) {
        expect((item as any).previewUrl).toBeUndefined();
      }

      // 3. Probar filtro sin resultados (EMPTY_FILTER_RESULTS)
      const emptyFilterResult = await govService.getCaseQueue({
        status: 'STATUS_INEXISTENTE_XYZ',
        actorContext: adminContext,
      });
      expect(emptyFilterResult.items.length).toBe(0);
      expect(emptyFilterResult.emptyReason).toBe('EMPTY_FILTER_RESULTS');

      // 4. Consultar detalle de caso resuelto
      const detail = await govService.getCaseDetail({
        caseId: reportCaseId,
        caseType: 'REPORT',
        actorContext: adminContext,
      });

      expect(detail.caseId).toBe(reportCaseId);
      expect(detail.severity).toBe('CRITICAL');
      expect(detail.resolutionType).toBe('REMOVED_PERMANENTLY');
      expect(detail.history.length).toBeGreaterThanOrEqual(3);
      // Al estar resuelto, las capacidades destructivas deben ser falsas
      expect(detail.capabilities.canResolve).toBe(false);
      expect(detail.capabilities.canClassify).toBe(false);
      expect(detail.capabilities.canPreventiveHide).toBe(false);
      expect((detail as any).previewUrl).toBeUndefined();
    });
  });
});

