import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  PrismaTransactions,
  createPrismaClient,
} from '@eventlens/job-queue';
import {
  MediaReportService,
  OwnMediaRemovalService,
  RemovalRequestService,
  PostgresMediaReportRepository,
  PostgresOwnRemovalRepository,
  PostgresRemovalRequestRepository,
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
});
