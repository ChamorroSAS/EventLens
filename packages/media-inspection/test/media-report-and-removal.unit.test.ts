import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { AdminActorContext } from '@eventlens/identity';
import {
  MediaReportService,
  OwnMediaRemovalService,
  RemovalRequestService,
  MediaCaseGovernanceService,
  MediaReportError,
  OwnRemovalError,
  RemovalRequestError,
  MediaCaseGovernanceError,
  type MediaReportRepository,
  type OwnRemovalRepository,
  type RemovalRequestRepository,
  type MediaCaseGovernanceRepository,
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

  // =========================================================================
  // EL-EP-009 RUTA B: Clasificación, Gobernanza, Resolución y Consulta Administrativa
  // =========================================================================
  describe('EL-EP-009 Ruta B: MediaCaseGovernanceService (EL-TK-116 .. EL-TK-120)', () => {
    let mockGovRepo: MediaCaseGovernanceRepository;
    let mockPurgeDispatcher: PurgeDispatcherPort;
    let dispatchedPurges: PurgeRequestPayload[];
    let govService: MediaCaseGovernanceService;

    const validAdminContext: AdminActorContext = {
      actorType: 'ADMIN_HUMAN',
      principalId: 'admin-principal-1',
      identifier: 'admin@eventlens.local',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      adminAuthRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n,
    };

    beforeEach(() => {
      dispatchedPurges = [];
      mockPurgeDispatcher = {
        dispatchPurgeRequest: vi.fn(async (req: PurgeRequestPayload) => {
          dispatchedPurges.push(req);
        }),
      };

      mockGovRepo = {
        findCase: vi.fn(),
        updateCaseClassification: vi.fn(),
        findMediaCatalog: vi.fn(),
        updateMediaStatusToHidden: vi.fn(),
        updateMediaStatusToDeleted: vi.fn(),
        saveCaseHistory: vi.fn(),
        saveAccessGrant: vi.fn(),
        findActiveAccessGrant: vi.fn(),
        updateCaseStatus: vi.fn(),
        updateCaseResolution: vi.fn(),
        findCaseHistory: vi.fn(),
        queryQueue: vi.fn(),
        recordAudit: vi.fn(),
      };

      govService = new MediaCaseGovernanceService(
        mockTransactionRunner,
        mockGovRepo,
        mockPurgeDispatcher
      );
    });

    // -----------------------------------------------------------------------
    // EL-TK-116: Clasificar severidad y priorizar denuncias
    // -----------------------------------------------------------------------
    describe('EL-TK-116: classifyCase', () => {
      it('rechaza actores no autorizados o que no sean ADMIN_HUMAN', async () => {
        await expect(
          govService.classifyCase({
            caseId: 'case-1',
            caseType: 'REPORT',
            severity: 'CRITICAL',
            justification: 'Motivo',
            actorContext: { ...validAdminContext, actorType: 'ORGANIZER_HUMAN' as any },
          })
        ).rejects.toThrow(MediaCaseGovernanceError);

        await expect(
          govService.classifyCase({
            caseId: 'case-1',
            caseType: 'REPORT',
            severity: 'CRITICAL',
            justification: 'Motivo',
            actorContext: null as any,
          })
        ).rejects.toThrow('Se requiere AdminActorContext de tipo ADMIN_HUMAN');
      });

      it('rechaza si falta justificación o severidad inválida', async () => {
        await expect(
          govService.classifyCase({
            caseId: 'case-1',
            caseType: 'REPORT',
            severity: 'CRITICAL',
            justification: '',
            actorContext: validAdminContext,
          })
        ).rejects.toThrow('La justificación de la clasificación es obligatoria');

        await expect(
          govService.classifyCase({
            caseId: 'case-1',
            caseType: 'REPORT',
            severity: 'INVALID' as any,
            justification: 'Motivo',
            actorContext: validAdminContext,
          })
        ).rejects.toThrow('Severidad inválida');
      });

      it('rechaza si el caso no existe o ya está resuelto', async () => {
        vi.mocked(mockGovRepo.findCase).mockResolvedValue(null);

        await expect(
          govService.classifyCase({
            caseId: 'case-404',
            caseType: 'REPORT',
            severity: 'CRITICAL',
            justification: 'Motivo',
            actorContext: validAdminContext,
          })
        ).rejects.toThrow('El caso especificado no existe');

        vi.mocked(mockGovRepo.findCase).mockResolvedValue({
          id: 'case-closed',
          mediaRef: 'media-1',
          eventRef: 'event-1',
          reason: 'PRIVACY_VIOLATION',
          description: null,
          reporterContact: null,
          severity: 'NORMAL',
          status: 'ACTION_TAKEN',
          resolvedAt: new Date(),
          resolvedBy: 'admin-1',
          resolutionType: 'REMOVED_PERMANENTLY',
          resolutionNotes: 'Cerrado',
          createdAt: new Date(),
        });

        await expect(
          govService.classifyCase({
            caseId: 'case-closed',
            caseType: 'REPORT',
            severity: 'CRITICAL',
            justification: 'Motivo',
            actorContext: validAdminContext,
          })
        ).rejects.toThrow('El caso ya se encuentra resuelto y cerrado');
      });

      it('Escenario 1 & 2: Clasifica CRITICAL emitiendo prioridad y SLA de 24h sin alterar el estado de visualización de la media (DEC-088)', async () => {
        vi.mocked(mockGovRepo.findCase).mockResolvedValue({
          id: 'case-1',
          mediaRef: 'media-1',
          eventRef: 'event-1',
          reason: 'INTIMACY_VIOLATION',
          description: null,
          reporterContact: null,
          severity: 'UNCLASSIFIED',
          status: 'PENDING_REVIEW',
          resolvedAt: null,
          resolvedBy: null,
          resolutionType: null,
          resolutionNotes: null,
          createdAt: new Date(),
        });

        const result = await govService.classifyCase({
          caseId: 'case-1',
          caseType: 'REPORT',
          severity: 'CRITICAL',
          justification: 'Violación grave de intimidad identificada',
          actorContext: validAdminContext,
        });

        expect(result.previousSeverity).toBe('UNCLASSIFIED');
        expect(result.newSeverity).toBe('CRITICAL');
        expect(result.priorityAlert).toBe(true);
        expect(result.targetSlaHours).toBe(24);
        expect(mockGovRepo.updateCaseClassification).toHaveBeenCalledWith(
          mockTx,
          'case-1',
          'REPORT',
          'CRITICAL'
        );
        // DEC-088: No debe tocar el catálogo de media
        expect(mockGovRepo.updateMediaStatusToHidden).not.toHaveBeenCalled();
        expect(mockGovRepo.updateMediaStatusToDeleted).not.toHaveBeenCalled();
      });

      it('Escenario 3: Conserva historial con actor y motivo al reclasificar', async () => {
        vi.mocked(mockGovRepo.findCase).mockResolvedValue({
          id: 'case-1',
          mediaRef: 'media-1',
          eventRef: 'event-1',
          reason: 'OTHER',
          description: null,
          reporterContact: null,
          severity: 'CRITICAL',
          status: 'PENDING_REVIEW',
          resolvedAt: null,
          resolvedBy: null,
          resolutionType: null,
          resolutionNotes: null,
          createdAt: new Date(),
        });

        const result = await govService.classifyCase({
          caseId: 'case-1',
          caseType: 'REPORT',
          severity: 'NORMAL',
          justification: 'Reevaluado tras revisión preliminar: impacto menor',
          actorContext: validAdminContext,
        });

        expect(result.previousSeverity).toBe('CRITICAL');
        expect(result.newSeverity).toBe('NORMAL');
        expect(result.priorityAlert).toBe(false);
        expect(result.targetSlaHours).toBe(72);
        expect(mockGovRepo.saveCaseHistory).toHaveBeenCalledWith(
          mockTx,
          expect.objectContaining({
            caseId: 'case-1',
            action: 'CLASSIFY',
            previousState: { severity: 'CRITICAL' },
            newState: { severity: 'NORMAL' },
            justification: 'Reevaluado tras revisión preliminar: impacto menor',
            actorId: 'admin-principal-1',
          })
        );
      });
    });

    // -----------------------------------------------------------------------
    // EL-TK-117: Autorizar acceso administrativo justificado
    // -----------------------------------------------------------------------
    describe('EL-TK-117: grantAdministrativeMediaAccess', () => {
      it('rechaza si falta justificación o actor no es admin', async () => {
        await expect(
          govService.grantAdministrativeMediaAccess({
            caseId: 'case-1',
            caseType: 'REPORT',
            justification: '',
            actorContext: validAdminContext,
          })
        ).rejects.toThrow('Se requiere motivo obligatorio');
      });

      it('Escenario 1: Emite grant temporal con expiración de 15 minutos strictly scoped', async () => {
        vi.mocked(mockGovRepo.findCase).mockResolvedValue({
          id: 'case-1',
          mediaRef: 'media-1',
          eventRef: 'event-1',
          reason: 'PRIVACY_VIOLATION',
          description: null,
          reporterContact: null,
          severity: 'CRITICAL',
          status: 'PENDING_REVIEW',
          resolvedAt: null,
          resolvedBy: null,
          resolutionType: null,
          resolutionNotes: null,
          createdAt: new Date(),
        });

        vi.mocked(mockGovRepo.findMediaCatalog).mockResolvedValue({
          mediaRef: 'media-1',
          eventRef: 'event-1',
          status: 'PUBLISHED',
          revision: 1n,
          generation: 1n,
        });

        const grant = await govService.grantAdministrativeMediaAccess({
          caseId: 'case-1',
          caseType: 'REPORT',
          justification: 'Inspección de rostro solicitada por denunciante',
          actorContext: validAdminContext,
        });

        expect(grant.caseId).toBe('case-1');
        expect(grant.adminId).toBe('admin-principal-1');
        expect(grant.mediaRef).toBe('media-1');
        expect(grant.token).toBeDefined();
        expect(grant.previewUrl).toContain('/api/v1/admin/cases/case-1/media/media-1/preview?token=');
        // Expiración a ~15 min
        const diffMs = grant.expiresAt.getTime() - grant.createdAt.getTime();
        expect(diffMs).toBe(15 * 60 * 1000);

        expect(mockGovRepo.saveAccessGrant).toHaveBeenCalled();
        expect(mockGovRepo.saveCaseHistory).toHaveBeenCalledWith(
          mockTx,
          expect.objectContaining({ action: 'GRANT_ACCESS' })
        );
        // Auditoría nunca debe contener la URL completa sensible
        expect(mockGovRepo.recordAudit).toHaveBeenCalledWith(
          mockTx,
          expect.objectContaining({
            action: 'GRANT_MEDIA_ACCESS',
            reason: 'Inspección de rostro solicitada por denunciante',
          })
        );
      });

      it('Escenario 3: Deniega si la media ya fue purgada o eliminada', async () => {
        vi.mocked(mockGovRepo.findCase).mockResolvedValue({
          id: 'case-1',
          mediaRef: 'media-deleted',
          eventRef: 'event-1',
          reason: 'PRIVACY_VIOLATION',
          description: null,
          reporterContact: null,
          severity: 'NORMAL',
          status: 'PENDING_REVIEW',
          resolvedAt: null,
          resolvedBy: null,
          resolutionType: null,
          resolutionNotes: null,
          createdAt: new Date(),
        });

        vi.mocked(mockGovRepo.findMediaCatalog).mockResolvedValue({
          mediaRef: 'media-deleted',
          eventRef: 'event-1',
          status: 'DELETED',
          revision: 2n,
          generation: 1n,
        });

        await expect(
          govService.grantAdministrativeMediaAccess({
            caseId: 'case-1',
            caseType: 'REPORT',
            justification: 'Revisión',
            actorContext: validAdminContext,
          })
        ).rejects.toThrow('La media no está disponible o ha sido eliminada');
      });
    });

    // -----------------------------------------------------------------------
    // EL-TK-118: Ocultamiento preventivo por decisión administrativa
    // -----------------------------------------------------------------------
    describe('EL-TK-118: applyPreventiveHide', () => {
      it('Escenario 1: Oculta preventivamente la media en catálogo y pasa caso a UNDER_INVESTIGATION sin purga', async () => {
        vi.mocked(mockGovRepo.findCase).mockResolvedValue({
          id: 'case-1',
          mediaRef: 'media-1',
          eventRef: 'event-1',
          reason: 'INTIMACY_VIOLATION',
          description: null,
          reporterContact: null,
          severity: 'CRITICAL',
          status: 'PENDING_REVIEW',
          resolvedAt: null,
          resolvedBy: null,
          resolutionType: null,
          resolutionNotes: null,
          createdAt: new Date(),
        });

        vi.mocked(mockGovRepo.findMediaCatalog).mockResolvedValue({
          mediaRef: 'media-1',
          eventRef: 'event-1',
          status: 'PUBLISHED',
          revision: 1n,
          generation: 1n,
        });

        const result = await govService.applyPreventiveHide({
          caseId: 'case-1',
          caseType: 'REPORT',
          justification: 'Evidencia verosímil de intimidad: retiro preventivo de visualización',
          actorContext: validAdminContext,
        });

        expect(result.previousStatus).toBe('PUBLISHED');
        expect(result.newStatus).toBe('HIDDEN');
        expect(result.idempotent).toBe(false);

        expect(mockGovRepo.updateMediaStatusToHidden).toHaveBeenCalledWith(mockTx, 'media-1', 1n);
        expect(mockGovRepo.updateCaseStatus).toHaveBeenCalledWith(mockTx, 'case-1', 'REPORT', 'UNDER_INVESTIGATION');
        expect(mockPurgeDispatcher.dispatchPurgeRequest).not.toHaveBeenCalled();
      });

      it('Escenario 3: Idempotencia si la media ya está DELETED o HIDDEN', async () => {
        vi.mocked(mockGovRepo.findCase).mockResolvedValue({
          id: 'case-1',
          mediaRef: 'media-hidden',
          eventRef: 'event-1',
          reason: 'OTHER',
          description: null,
          reporterContact: null,
          severity: 'NORMAL',
          status: 'UNDER_INVESTIGATION',
          resolvedAt: null,
          resolvedBy: null,
          resolutionType: null,
          resolutionNotes: null,
          createdAt: new Date(),
        });

        vi.mocked(mockGovRepo.findMediaCatalog).mockResolvedValue({
          mediaRef: 'media-hidden',
          eventRef: 'event-1',
          status: 'HIDDEN',
          revision: 2n,
          generation: 1n,
        });

        const result = await govService.applyPreventiveHide({
          caseId: 'case-1',
          caseType: 'REPORT',
          justification: 'Re-confirmación de ocultamiento',
          actorContext: validAdminContext,
        });

        expect(result.idempotent).toBe(true);
        expect(result.newStatus).toBe('HIDDEN');
        expect(mockGovRepo.updateMediaStatusToHidden).not.toHaveBeenCalled();
      });
    });

    // -----------------------------------------------------------------------
    // EL-TK-119: Resolver caso registrando intervención
    // -----------------------------------------------------------------------
    describe('EL-TK-119: resolveCase', () => {
      it('Escenario 1: Resuelve con DISMISSED sin purga', async () => {
        vi.mocked(mockGovRepo.findCase).mockResolvedValue({
          id: 'case-1',
          mediaRef: 'media-1',
          eventRef: 'event-1',
          reason: 'OTHER',
          description: null,
          reporterContact: null,
          severity: 'NORMAL',
          status: 'UNDER_INVESTIGATION',
          resolvedAt: null,
          resolvedBy: null,
          resolutionType: null,
          resolutionNotes: null,
          createdAt: new Date(),
        });

        vi.mocked(mockGovRepo.findMediaCatalog).mockResolvedValue({
          mediaRef: 'media-1',
          eventRef: 'event-1',
          status: 'PUBLISHED',
          revision: 1n,
          generation: 1n,
        });

        const result = await govService.resolveCase({
          caseId: 'case-1',
          caseType: 'REPORT',
          resolutionType: 'DISMISSED',
          justification: 'Denuncia desestimada: no se evidencia infracción a las políticas',
          actorContext: validAdminContext,
        });

        expect(result.status).toBe('DISMISSED');
        expect(result.resolutionType).toBe('DISMISSED');
        expect(result.purgeDispatched).toBe(false);
        expect(dispatchedPurges.length).toBe(0);
        expect(mockGovRepo.updateCaseResolution).toHaveBeenCalledWith(
          mockTx,
          'case-1',
          'REPORT',
          expect.objectContaining({
            status: 'DISMISSED',
            resolutionType: 'DISMISSED',
          })
        );
      });

      it('Escenario 2: Resuelve con REMOVED_PERMANENTLY emitiendo purga inmediata sin papelera de owner (DEC-089 / DEC-097)', async () => {
        vi.mocked(mockGovRepo.findCase).mockResolvedValue({
          id: 'case-2',
          mediaRef: 'media-grave',
          eventRef: 'event-1',
          reason: 'INTIMACY_VIOLATION',
          description: null,
          reporterContact: null,
          severity: 'CRITICAL',
          status: 'UNDER_INVESTIGATION',
          resolvedAt: null,
          resolvedBy: null,
          resolutionType: null,
          resolutionNotes: null,
          createdAt: new Date(),
        });

        vi.mocked(mockGovRepo.findMediaCatalog).mockResolvedValue({
          mediaRef: 'media-grave',
          eventRef: 'event-1',
          status: 'HIDDEN',
          revision: 2n,
          generation: 1n,
        });

        const result = await govService.resolveCase({
          caseId: 'case-2',
          caseType: 'REPORT',
          resolutionType: 'REMOVED_PERMANENTLY',
          justification: 'Violación confirmada: eliminación definitiva y purga sin papelera de owner',
          actorContext: validAdminContext,
        });

        expect(result.status).toBe('ACTION_TAKEN');
        expect(result.resolutionType).toBe('REMOVED_PERMANENTLY');
        expect(result.mediaStatus).toBe('DELETED');
        expect(result.purgeDispatched).toBe(true);

        expect(mockGovRepo.updateMediaStatusToDeleted).toHaveBeenCalledWith(mockTx, 'media-grave', 2n);
        expect(dispatchedPurges.length).toBe(1);
        expect(dispatchedPurges[0].mediaRef).toBe('media-grave');
        expect(dispatchedPurges[0].organizerRef).toBe('ADMIN_REMOVAL');
        expect(dispatchedPurges[0].policyRef).toBe('ADMIN_REMOVAL_CASE');
      });

      it('Escenario 3: Replay sobre caso ya resuelto devuelve idempotencia sin doble acción destructiva ni nuevo purge', async () => {
        const resolvedDate = new Date('2026-10-12T13:00:00Z');
        vi.mocked(mockGovRepo.findCase).mockResolvedValue({
          id: 'case-already-done',
          mediaRef: 'media-grave',
          eventRef: 'event-1',
          reason: 'INTIMACY_VIOLATION',
          description: null,
          reporterContact: null,
          severity: 'CRITICAL',
          status: 'ACTION_TAKEN',
          resolvedAt: resolvedDate,
          resolvedBy: 'admin-1',
          resolutionType: 'REMOVED_PERMANENTLY',
          resolutionNotes: 'Eliminado',
          createdAt: new Date(),
        });

        const result = await govService.resolveCase({
          caseId: 'case-already-done',
          caseType: 'REPORT',
          resolutionType: 'REMOVED_PERMANENTLY',
          justification: 'Intento de resolución duplicada',
          actorContext: validAdminContext,
        });

        expect(result.alreadyResolved).toBe(true);
        expect(result.purgeDispatched).toBe(false);
        expect(dispatchedPurges.length).toBe(0);
        expect(mockGovRepo.updateCaseResolution).not.toHaveBeenCalled();
      });
    });

    // -----------------------------------------------------------------------
    // EL-TK-120: Consultar la cola y detalle de casos
    // -----------------------------------------------------------------------
    describe('EL-TK-120: getCaseQueue & getCaseDetail', () => {
      it('Escenario 1: Consulta de cola sanitizada retorna casos ordenados por severidad y fecha, sin previewUrl en los items', async () => {
        const now = new Date();
        vi.mocked(mockGovRepo.queryQueue).mockResolvedValue({
          items: [
            {
              caseId: 'case-crit-1',
              caseType: 'REPORT',
              mediaRef: 'media-1',
              eventRef: 'event-1',
              reason: 'INTIMACY_VIOLATION',
              severity: 'CRITICAL',
              status: 'PENDING_REVIEW',
              createdAt: now,
            },
            {
              caseId: 'case-norm-1',
              caseType: 'REMOVAL_REQUEST',
              mediaRef: 'media-2',
              eventRef: 'event-1',
              reason: 'APPEAR_IN_MEDIA',
              severity: 'NORMAL',
              status: 'PENDING_REVIEW',
              createdAt: now,
            },
          ],
          filteredCount: 2,
          totalCount: 2,
        });

        const queue = await govService.getCaseQueue({
          actorContext: validAdminContext,
        });

        expect(queue.items.length).toBe(2);
        expect(queue.emptyReason).toBe('NONE');
        expect(queue.totalCount).toBe(2);
        // Verificar que ningún item expone previewUrl
        for (const item of queue.items) {
          expect((item as any).previewUrl).toBeUndefined();
        }
      });

      it('Escenario 3: Distingue EMPTY_QUEUE de EMPTY_FILTER_RESULTS', async () => {
        // Caso 1: EMPTY_QUEUE (totalCount == 0)
        vi.mocked(mockGovRepo.queryQueue).mockResolvedValue({
          items: [],
          filteredCount: 0,
          totalCount: 0,
        });

        const emptyQueue = await govService.getCaseQueue({
          actorContext: validAdminContext,
        });
        expect(emptyQueue.emptyReason).toBe('EMPTY_QUEUE');

        // Caso 2: EMPTY_FILTER_RESULTS (totalCount > 0 pero items vacío por filtros)
        vi.mocked(mockGovRepo.queryQueue).mockResolvedValue({
          items: [],
          filteredCount: 0,
          totalCount: 15,
        });

        const emptyFilter = await govService.getCaseQueue({
          severity: 'CRITICAL',
          actorContext: validAdminContext,
        });
        expect(emptyFilter.emptyReason).toBe('EMPTY_FILTER_RESULTS');
      });

      it('Escenario 2: Consulta de detalle entrega historial y mapa de capacidades vigentes sin preview automático', async () => {
        const now = new Date();
        vi.mocked(mockGovRepo.findCase).mockResolvedValue({
          id: 'case-detail-1',
          mediaRef: 'media-detail',
          eventRef: 'event-1',
          reason: 'PRIVACY_VIOLATION',
          description: 'Foto no autorizada',
          reporterContact: 'reporter@test.com',
          severity: 'CRITICAL',
          status: 'UNDER_INVESTIGATION',
          resolvedAt: null,
          resolvedBy: null,
          resolutionType: null,
          resolutionNotes: null,
          createdAt: now,
        });

        vi.mocked(mockGovRepo.findMediaCatalog).mockResolvedValue({
          mediaRef: 'media-detail',
          eventRef: 'event-1',
          status: 'PUBLISHED',
          revision: 1n,
          generation: 1n,
        });

        vi.mocked(mockGovRepo.findCaseHistory).mockResolvedValue([
          {
            id: 'hist-1',
            actorId: 'admin-1',
            action: 'CLASSIFY',
            previousState: { severity: 'UNCLASSIFIED' },
            newState: { severity: 'CRITICAL' },
            justification: 'Evaluado crítico',
            createdAt: now,
          },
        ]);

        vi.mocked(mockGovRepo.findActiveAccessGrant).mockResolvedValue(null);

        const detail = await govService.getCaseDetail({
          caseId: 'case-detail-1',
          caseType: 'REPORT',
          actorContext: validAdminContext,
        });

        expect(detail.caseId).toBe('case-detail-1');
        expect(detail.history.length).toBe(1);
        expect(detail.capabilities).toEqual({
          canClassify: true,
          canRequestAccess: true,
          canPreventiveHide: true,
          canResolve: true,
        });
        expect(detail.activeGrant).toBeNull();
        expect((detail as any).previewUrl).toBeUndefined();
      });
    });
  });
});

