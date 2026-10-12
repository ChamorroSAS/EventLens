import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  MediaReportService,
  OwnMediaRemovalService,
  RemovalRequestService,
  MediaReportError,
  OwnRemovalError,
  RemovalRequestError,
  type MediaReportRepository,
  type OwnRemovalRepository,
  type RemovalRequestRepository,
  type GuestSessionResolverPort,
  type MediaReportRecord,
  type MediaOwnRemovalRecord,
  type MediaRemovalRequestRecord,
} from '../src/media-report-and-removal.js';
import type { PurgeDispatcherPort, PurgeRequestPayload } from '../src/media-moderation.js';

// Mock simple transaction runner
const mockTx = {} as any;
const mockTransactionRunner = {
  run: vi.fn(async (callback: (tx: any) => Promise<any>) => callback(mockTx)),
};

describe('EL-EP-009 Ruta A: Intake y Retiro Inmediato de Contenido (Unit Tests)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // EL-TK-113: Registrar una denuncia sobre contenido visible
  // =========================================================================
  describe('EL-TK-113: MediaReportService', () => {
    let mockReportRepo: MediaReportRepository;
    let service: MediaReportService;

    beforeEach(() => {
      mockReportRepo = {
        findVisibleMedia: vi.fn(),
        findExistingReportByDedupKey: vi.fn(),
        createReportCase: vi.fn(),
        recordAudit: vi.fn(),
      };
      service = new MediaReportService(mockTransactionRunner, mockReportRepo);
    });

    it('rechaza argumentos faltantes o inválidos', async () => {
      await expect(
        service.registerReport(null as any)
      ).rejects.toThrow(MediaReportError);

      await expect(
        service.registerReport({
          mediaRef: '',
          eventRef: 'event-1',
          reason: 'PRIVACY_VIOLATION',
        })
      ).rejects.toThrow('mediaRef is required');

      await expect(
        service.registerReport({
          mediaRef: 'media-1',
          eventRef: '',
          reason: 'PRIVACY_VIOLATION',
        })
      ).rejects.toThrow('eventRef is required');

      await expect(
        service.registerReport({
          mediaRef: 'media-1',
          eventRef: 'event-1',
          reason: 'MOTIVO_FALSO' as any,
        })
      ).rejects.toThrow('Invalid report reason');
    });

    it('Escenario 1: Registra el caso para media visible y motivo válido, confirmando recepción sin afirmar resolución', async () => {
      const mediaRef = 'media-visible-1';
      const eventRef = 'event-1';
      const now = new Date('2026-10-12T12:00:00Z');

      vi.mocked(mockReportRepo.findExistingReportByDedupKey).mockResolvedValue(null);
      vi.mocked(mockReportRepo.findVisibleMedia).mockResolvedValue({
        mediaRef,
        eventRef,
        status: 'PUBLISHED',
      });

      const result = await service.registerReport({
        mediaRef,
        eventRef,
        reason: 'PRIVACY_VIOLATION',
        description: 'Aparezco en la foto sin autorización',
        reporterContact: 'reporter@test.com',
        now,
      });

      expect(result.status).toBe('RECEIVED');
      expect(result.message).toBe('Reporte recibido para revisión');
      expect(result.caseId).toBeDefined();

      // Debe haber creado el caso en PENDING_REVIEW con severidad UNCLASSIFIED (DEC-088: no auto-oculta)
      expect(mockReportRepo.createReportCase).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          mediaRef,
          eventRef,
          reason: 'PRIVACY_VIOLATION',
          description: 'Aparezco en la foto sin autorización',
          reporterContact: 'reporter@test.com',
          status: 'PENDING_REVIEW',
          severity: 'UNCLASSIFIED',
        })
      );

      expect(mockReportRepo.recordAudit).toHaveBeenCalled();
    });

    it('Escenario 2: Reintento por timeout devuelve el caso existente sin duplicar registros', async () => {
      const now = new Date('2026-10-12T12:00:00Z');
      const existingReport: MediaReportRecord = {
        id: 'existing-case-id',
        operationId: 'op-1',
        mediaRef: 'media-1',
        eventRef: 'event-1',
        reason: 'INAPPROPRIATE_CONTENT',
        severity: 'UNCLASSIFIED',
        status: 'PENDING_REVIEW',
        dedupKey: 'idemp:retry-key-1',
        createdAt: now,
      };

      vi.mocked(mockReportRepo.findExistingReportByDedupKey).mockResolvedValue(existingReport);

      const result = await service.registerReport({
        mediaRef: 'media-1',
        eventRef: 'event-1',
        reason: 'INAPPROPRIATE_CONTENT',
        idempotencyKey: 'retry-key-1',
      });

      expect(result.caseId).toBe('existing-case-id');
      expect(result.status).toBe('RECEIVED');
      expect(mockReportRepo.createReportCase).not.toHaveBeenCalled();
    });

    it('Escenario 3: Neutralidad pública cuando la media no existe o no es visible', async () => {
      const now = new Date('2026-10-12T12:00:00Z');

      vi.mocked(mockReportRepo.findExistingReportByDedupKey).mockResolvedValue(null);
      // Media no encontrada o en estado QUARANTINED (no visible)
      vi.mocked(mockReportRepo.findVisibleMedia).mockResolvedValue(null);

      const result = await service.registerReport({
        mediaRef: 'media-secreta-inexistente',
        eventRef: 'event-1',
        reason: 'COPYRIGHT_INFRINGEMENT',
        now,
      });

      // La respuesta hacia el usuario debe ser idéntica y neutral para no confirmar ni desmentir
      expect(result.status).toBe('RECEIVED');
      expect(result.message).toBe('Reporte recibido para revisión');
      expect(result.caseId).toBeDefined();

      // No debe haberse creado caso en la base de datos
      expect(mockReportRepo.createReportCase).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // EL-TK-114: Retirar irreversiblemente un aporte propio con sesión guest válida
  // =========================================================================
  describe('EL-TK-114: OwnMediaRemovalService', () => {
    let mockRemovalRepo: OwnRemovalRepository;
    let mockSessionResolver: GuestSessionResolverPort;
    let mockPurgeDispatcher: PurgeDispatcherPort;
    let service: OwnMediaRemovalService;

    beforeEach(() => {
      mockRemovalRepo = {
        lockAndGetMediaForOwnRemoval: vi.fn(),
        findExistingOwnRemoval: vi.fn(),
        createOwnRemovalRecord: vi.fn(),
        updateMediaStatusToDeleted: vi.fn(),
        recordAudit: vi.fn(),
      };
      mockSessionResolver = {
        assertGuestSessionOwner: vi.fn(),
      };
      mockPurgeDispatcher = {
        dispatchPurgeRequest: vi.fn(),
      };
      service = new OwnMediaRemovalService(
        mockTransactionRunner,
        mockRemovalRepo,
        mockSessionResolver,
        mockPurgeDispatcher
      );
    });

    it('rechaza cuando faltan argumentos obligatorios', async () => {
      await expect(
        service.removeOwnMedia(null as any)
      ).rejects.toThrow(OwnRemovalError);

      await expect(
        service.removeOwnMedia({
          guestSessionRef: '',
          mediaRef: 'media-1',
          eventRef: 'event-1',
        })
      ).rejects.toThrow('guestSessionRef is required');
    });

    it('rechaza si la sesión de invitado es inválida, expirada o revocada', async () => {
      vi.mocked(mockSessionResolver.assertGuestSessionOwner).mockRejectedValue(
        new OwnRemovalError('SESSION_INVALID', 'Sesión revocada')
      );

      await expect(
        service.removeOwnMedia({
          guestSessionRef: 'session-revoked',
          mediaRef: 'media-1',
          eventRef: 'event-1',
        })
      ).rejects.toThrow('Sesión revocada');
    });

    it('Escenario 2: Deniega con NOT_OWNER cuando la media no pertenece a la sesión activa', async () => {
      vi.mocked(mockSessionResolver.assertGuestSessionOwner).mockResolvedValue({
        guestRef: 'guest:my-own-session',
        eventRef: 'event-1',
      });
      vi.mocked(mockRemovalRepo.findExistingOwnRemoval).mockResolvedValue(null);
      vi.mocked(mockRemovalRepo.lockAndGetMediaForOwnRemoval).mockResolvedValue({
        mediaRef: 'media-other',
        eventRef: 'event-1',
        guestRef: 'guest:other-uploader-session',
        generation: 1n,
        revision: 2n,
        status: 'PUBLISHED',
      });

      await expect(
        service.removeOwnMedia({
          guestSessionRef: 'my-own-session',
          mediaRef: 'media-other',
          eventRef: 'event-1',
        })
      ).rejects.toThrow(OwnRemovalError);

      expect(mockRemovalRepo.updateMediaStatusToDeleted).not.toHaveBeenCalled();
      expect(mockPurgeDispatcher.dispatchPurgeRequest).not.toHaveBeenCalled();
    });

    it('Escenario 1: Retiro propio exitoso, inmediato e irreversible a purga sin requerir veto del organizador (DEC-089, DEC-097)', async () => {
      const now = new Date('2026-10-12T12:00:00.000Z');
      const mediaRef = 'media-own-1';
      const eventRef = 'event-1';
      const guestRef = 'guest:alice-session';

      vi.mocked(mockSessionResolver.assertGuestSessionOwner).mockResolvedValue({
        guestRef,
        eventRef,
      });
      vi.mocked(mockRemovalRepo.findExistingOwnRemoval).mockResolvedValue(null);
      vi.mocked(mockRemovalRepo.lockAndGetMediaForOwnRemoval).mockResolvedValue({
        mediaRef,
        eventRef,
        guestRef,
        generation: 1n,
        revision: 3n,
        status: 'PUBLISHED',
      });
      vi.mocked(mockRemovalRepo.updateMediaStatusToDeleted).mockResolvedValue(4n);

      const result = await service.removeOwnMedia({
        guestSessionRef: 'alice-session',
        mediaRef,
        eventRef,
        now,
      });

      expect(result.status).toBe('DELETED');
      expect(result.outcome).toBe('CONFIRMED');
      expect(result.purgeStartedAt.toISOString()).toBe('2026-10-12T12:00:00.000Z');
      expect(result.mainPurgeDeadline.toISOString()).toBe('2026-10-19T12:00:00.000Z');
      expect(result.residualPurgeDeadline.toISOString()).toBe('2026-10-12T12:00:00.000Z'.replace('10-12', '11-11')); // +30 días

      // Transiciona en base de datos inmediatamente
      expect(mockRemovalRepo.updateMediaStatusToDeleted).toHaveBeenCalledWith(mockTx, mediaRef, 3n);
      expect(mockRemovalRepo.createOwnRemovalRecord).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          mediaRef,
          eventRef,
          guestRef,
          status: 'CONFIRMED',
          previousRevision: 3n,
          newRevision: 4n,
        })
      );

      // Emite purga hacia PurgeDispatcherPort
      expect(mockPurgeDispatcher.dispatchPurgeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaRef,
          eventRef,
          policyRef: 'PRIVACY_OWN_REMOVAL',
          purgeStartedAt: now,
        })
      );

      expect(mockRemovalRepo.recordAudit).toHaveBeenCalled();
    });

    it('Escenario 3: Reintento sobre media ya retirada conserva purgeStartedAt original y no duplica purga', async () => {
      const originalPurgeTime = new Date('2026-10-10T08:00:00.000Z');
      const nowLater = new Date('2026-10-12T12:00:00.000Z');

      vi.mocked(mockSessionResolver.assertGuestSessionOwner).mockResolvedValue({
        guestRef: 'guest:alice',
        eventRef: 'event-1',
      });

      const existingRecord: MediaOwnRemovalRecord = {
        id: randomUUID(),
        operationId: 'op-orig',
        mediaRef: 'media-own-1',
        eventRef: 'event-1',
        guestRef: 'guest:alice',
        generation: 1n,
        previousRevision: 2n,
        newRevision: 3n,
        purgeStartedAt: originalPurgeTime,
        mainPurgeDeadline: new Date('2026-10-17T08:00:00.000Z'),
        residualPurgeDeadline: new Date('2026-11-09T08:00:00.000Z'),
        status: 'CONFIRMED',
        dedupKey: 'own-removal:media-own-1',
        createdAt: originalPurgeTime,
      };

      vi.mocked(mockRemovalRepo.findExistingOwnRemoval).mockResolvedValue(existingRecord);

      const result = await service.removeOwnMedia({
        guestSessionRef: 'alice',
        mediaRef: 'media-own-1',
        eventRef: 'event-1',
        now: nowLater,
      });

      expect(result.outcome).toBe('ALREADY_REMOVED');
      expect(result.purgeStartedAt).toEqual(originalPurgeTime);
      expect(mockRemovalRepo.updateMediaStatusToDeleted).not.toHaveBeenCalled();
      expect(mockPurgeDispatcher.dispatchPurgeRequest).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // EL-TK-115: Registrar una solicitud de retiro sin sesión válida
  // =========================================================================
  describe('EL-TK-115: RemovalRequestService', () => {
    let mockRemovalReqRepo: RemovalRequestRepository;
    let service: RemovalRequestService;

    beforeEach(() => {
      mockRemovalReqRepo = {
        findExistingRemovalRequestByDedupKey: vi.fn(),
        createRemovalRequest: vi.fn(),
        recordAudit: vi.fn(),
      };
      service = new RemovalRequestService(mockTransactionRunner, mockRemovalReqRepo);
    });

    it('rechaza si falta la declaración obligatoria (DEC-103)', async () => {
      await expect(
        service.registerRequest({
          eventRef: 'event-1',
          mediaRef: 'media-1',
          reason: 'APPEAR_IN_MEDIA',
          contactEmail: 'user@test.com',
          declarationAccepted: false,
        })
      ).rejects.toThrow('La declaración de buena fe es obligatoria');
    });

    it('Escenario 2: Rechaza si el motivo es OTHER y no se proporciona descripción (DEC-104)', async () => {
      await expect(
        service.registerRequest({
          eventRef: 'event-1',
          mediaRef: 'media-1',
          reason: 'OTHER',
          description: '',
          contactEmail: 'user@test.com',
          declarationAccepted: true,
        })
      ).rejects.toThrow('La descripción es obligatoria cuando el motivo seleccionado es Otro');
    });

    it('rechaza si el correo de contacto es sintácticamente inválido', async () => {
      await expect(
        service.registerRequest({
          eventRef: 'event-1',
          mediaRef: 'media-1',
          reason: 'APPEAR_IN_MEDIA',
          contactEmail: 'no-es-un-email',
          declarationAccepted: true,
        })
      ).rejects.toThrow('El formato del correo de contacto es inválido');
    });

    it('Escenario 1: Registra formalmente la solicitud con campos obligatorios y declaración', async () => {
      const now = new Date('2026-10-12T12:00:00Z');
      vi.mocked(mockRemovalReqRepo.findExistingRemovalRequestByDedupKey).mockResolvedValue(null);

      const result = await service.registerRequest({
        eventRef: 'event-1',
        mediaRef: 'media-1',
        reason: 'APPEAR_IN_MEDIA',
        contactEmail: 'requester@domain.com',
        declarationAccepted: true,
        optionalName: 'Juan Pérez',
        now,
      });

      expect(result.status).toBe('RECEIVED');
      expect(result.message).toBe('Solicitud recibida para revisión');
      expect(result.requestId).toBeDefined();

      expect(mockRemovalReqRepo.createRemovalRequest).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          eventRef: 'event-1',
          mediaRef: 'media-1',
          reason: 'APPEAR_IN_MEDIA',
          contactEmail: 'requester@domain.com',
          optionalName: 'Juan Pérez',
          declarationAccepted: true,
          status: 'PENDING_REVIEW',
          severity: 'UNCLASSIFIED',
        })
      );

      expect(mockRemovalReqRepo.recordAudit).toHaveBeenCalled();
    });

    it('Escenario 2: Reintento con misma deduplicación devuelve solicitud existente', async () => {
      const now = new Date('2026-10-12T12:00:00Z');
      const existing: MediaRemovalRequestRecord = {
        id: 'existing-request-id',
        operationId: 'op-1',
        mediaRef: 'media-1',
        eventRef: 'event-1',
        reason: 'INTIMACY_VIOLATION',
        contactEmail: 'contact@domain.com',
        declarationAccepted: true,
        severity: 'UNCLASSIFIED',
        status: 'PENDING_REVIEW',
        dedupKey: 'idemp:retry-key',
        createdAt: now,
      };

      vi.mocked(mockRemovalReqRepo.findExistingRemovalRequestByDedupKey).mockResolvedValue(existing);

      const result = await service.registerRequest({
        eventRef: 'event-1',
        mediaRef: 'media-1',
        reason: 'INTIMACY_VIOLATION',
        contactEmail: 'contact@domain.com',
        declarationAccepted: true,
        idempotencyKey: 'retry-key',
      });

      expect(result.requestId).toBe('existing-request-id');
      expect(result.status).toBe('RECEIVED');
      expect(mockRemovalReqRepo.createRemovalRequest).not.toHaveBeenCalled();
    });
  });
});
