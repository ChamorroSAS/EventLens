import { describe, it, expect, vi } from 'vitest';
import {
  MediaModerationService,
  MediaModerationError,
  type MediaModerationRepository,
  type MediaCatalogRecord,
  type MediaTrashRecord
} from '../src/media-moderation.js';
import type { EventStatusAuthorizer } from '../src/media-status.js';
import type { SafetyFact } from '../src/contracts.js';

describe('MediaModerationService (EL-EP-008)', () => {
  const dummyTx = {} as any;
  const mockTransactions = {
    run: vi.fn().mockImplementation(async (cb: any) => cb(dummyTx))
  };

  const baseMedia: MediaCatalogRecord = {
    mediaRef: 'media-001',
    eventRef: 'event-001',
    status: 'PENDING_REVIEW',
    generation: 1n,
    revision: 1n
  };

  const approvedSafetyFact: SafetyFact = {
    schemaVersion: 1,
    jobId: '11111111-1111-1111-1111-111111111111',
    executionToken: '22222222-2222-2222-2222-222222222222',
    fence: '1',
    epoch: '1',
    mediaRef: 'media-001',
    generation: '1',
    revision: '1',
    originalSha256: 'abc123sha',
    originalVersion: '1',
    outcome: 'APPROVED',
    format: { status: 'VALID', reason: 'ok' },
    malware: {
      status: 'NO_THREAT_DETECTED',
      reason: 'ok',
      engine: 'ClamAV',
      engineVersion: '1.0',
      imageDigest: 'digest',
      snapshotId: 'snap',
      profileHash: 'hash'
    }
  };

  function createMockRepo(overrides: Partial<MediaModerationRepository> = {}): MediaModerationRepository {
    return {
      lockAndGetMedia: vi.fn().mockResolvedValue(baseMedia),
      getSafetyFact: vi.fn().mockResolvedValue(approvedSafetyFact),
      hasActiveRemovalBlock: vi.fn().mockResolvedValue(false),
      updateStatus: vi.fn().mockResolvedValue(2n),
      recordAudit: vi.fn().mockResolvedValue(undefined),
      recordTrash: vi.fn().mockResolvedValue(undefined),
      getActiveTrashRecord: vi.fn().mockResolvedValue(null),
      markTrashRestored: vi.fn().mockResolvedValue(undefined),
      getExpiredTrashRecords: vi.fn().mockResolvedValue([]),
      getTrashPurgeIntentByTrashId: vi.fn().mockResolvedValue(null),
      recordTrashPurgeIntent: vi.fn().mockResolvedValue(undefined),
      ...overrides
    };
  }

  describe('approveMedia (EL-TK-103)', () => {
    it('Escenario 1: Dado una media propia en PENDING_REVIEW sin bloqueos, el organizador la aprueba y pasa a PUBLISHED', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const mockRepo = createMockRepo();
      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      const result = await service.approveMedia({
        organizerRef: 'org-001',
        eventRef: 'event-001',
        mediaRef: 'media-001'
      });

      expect(result.status).toBe('PUBLISHED');
      expect(result.previousStatus).toBe('PENDING_REVIEW');
      expect(result.revision).toBe(2n);
      expect(mockRepo.updateStatus).toHaveBeenCalledWith(dummyTx, 'media-001', 1n, 'PUBLISHED');
      expect(mockRepo.recordAudit).toHaveBeenCalled();
    });

    it('Escenario 2: Dado bloqueo de seguridad (outcome DENIED o INCONCLUSIVE), la transición se rechaza con SAFETY_BLOCKED', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const deniedSafetyFact: SafetyFact = {
        ...approvedSafetyFact,
        outcome: 'DENIED'
      };

      const mockRepo = createMockRepo({
        getSafetyFact: vi.fn().mockResolvedValue(deniedSafetyFact)
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      await expect(
        service.approveMedia({
          organizerRef: 'org-001',
          eventRef: 'event-001',
          mediaRef: 'media-001'
        })
      ).rejects.toMatchObject({ code: 'SAFETY_BLOCKED' });

      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('Escenario 2: Dado bloqueo de retiro vigente, la transición se rechaza con REMOVAL_BLOCKED', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const mockRepo = createMockRepo({
        hasActiveRemovalBlock: vi.fn().mockResolvedValue(true)
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      await expect(
        service.approveMedia({
          organizerRef: 'org-001',
          eventRef: 'event-001',
          mediaRef: 'media-001'
        })
      ).rejects.toMatchObject({ code: 'REMOVAL_BLOCKED' });

      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('Escenario 3: Idempotencia - si la media ya está PUBLISHED, devuelve resultado exitoso sin forzar actualización', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const mockRepo = createMockRepo({
        lockAndGetMedia: vi.fn().mockResolvedValue({
          ...baseMedia,
          status: 'PUBLISHED',
          revision: 2n
        })
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      const result = await service.approveMedia({
        organizerRef: 'org-001',
        eventRef: 'event-001',
        mediaRef: 'media-001'
      });

      expect(result.status).toBe('PUBLISHED');
      expect(result.revision).toBe(2n);
      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('Escenario 3: Carrera de estado - si la media dejó de estar PENDING_REVIEW (ej. REJECTED o HIDDEN), lanza INVALID_STATE', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const mockRepo = createMockRepo({
        lockAndGetMedia: vi.fn().mockResolvedValue({
          ...baseMedia,
          status: 'REJECTED'
        })
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      await expect(
        service.approveMedia({
          organizerRef: 'org-001',
          eventRef: 'event-001',
          mediaRef: 'media-001'
        })
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });

      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('Escenario 3: Concurrencia de versión - si expectedRevision no coincide, lanza CONCURRENCY_CONFLICT', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const mockRepo = createMockRepo();
      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      await expect(
        service.approveMedia({
          organizerRef: 'org-001',
          eventRef: 'event-001',
          mediaRef: 'media-001',
          expectedRevision: 5n
        })
      ).rejects.toMatchObject({ code: 'CONCURRENCY_CONFLICT' });
    });

    it('Aislamiento y permisos: rechaza si el actor no es propietario del evento', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockRejectedValue({ code: 'ACCESS_DENIED' })
      };

      const service = new MediaModerationService(
        mockTransactions,
        createMockRepo(),
        mockAuthorizer
      );

      await expect(
        service.approveMedia({
          organizerRef: 'org-ajeno',
          eventRef: 'event-001',
          mediaRef: 'media-001'
        })
      ).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    });

    it('Cross-event: rechaza con ACCESS_DENIED si la media pertenece a otro evento', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const mockRepo = createMockRepo({
        lockAndGetMedia: vi.fn().mockResolvedValue({
          ...baseMedia,
          eventRef: 'other-event-999'
        })
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      await expect(
        service.approveMedia({
          organizerRef: 'org-001',
          eventRef: 'event-001',
          mediaRef: 'media-001'
        })
      ).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    });

    it('Media inexistente: rechaza con MEDIA_NOT_FOUND', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const mockRepo = createMockRepo({
        lockAndGetMedia: vi.fn().mockResolvedValue(null)
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      await expect(
        service.approveMedia({
          organizerRef: 'org-001',
          eventRef: 'event-001',
          mediaRef: 'non-existent'
        })
      ).rejects.toMatchObject({ code: 'MEDIA_NOT_FOUND' });
    });
  });

  describe('rejectMedia (EL-TK-104)', () => {
    it('Escenario 1: Dado media propia en PENDING_REVIEW, el organizador la rechaza y pasa a REJECTED', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const mockRepo = createMockRepo();
      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      const result = await service.rejectMedia({
        organizerRef: 'org-001',
        eventRef: 'event-001',
        mediaRef: 'media-001',
        reason: 'Contenido borroso o inapropiado'
      });

      expect(result.status).toBe('REJECTED');
      expect(result.previousStatus).toBe('PENDING_REVIEW');
      expect(result.revision).toBe(2n);
      expect(mockRepo.updateStatus).toHaveBeenCalledWith(dummyTx, 'media-001', 1n, 'REJECTED');
      expect(mockRepo.recordAudit).toHaveBeenCalledWith(
        dummyTx,
        expect.objectContaining({
          action: 'MEDIA_REJECTED',
          mediaRef: 'media-001',
          newStatus: 'REJECTED',
          reason: 'Contenido borroso o inapropiado'
        })
      );
    });

    it('Escenario 2: Dado media ya no pendiente (ej. PUBLISHED o HIDDEN), se rechaza sin modificar estado', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const mockRepo = createMockRepo({
        lockAndGetMedia: vi.fn().mockResolvedValue({
          ...baseMedia,
          status: 'PUBLISHED'
        })
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      await expect(
        service.rejectMedia({
          organizerRef: 'org-001',
          eventRef: 'event-001',
          mediaRef: 'media-001'
        })
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });

      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('Escenario 2: Idempotencia - si la media ya está REJECTED, devuelve resultado sin error', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const mockRepo = createMockRepo({
        lockAndGetMedia: vi.fn().mockResolvedValue({
          ...baseMedia,
          status: 'REJECTED',
          revision: 2n
        })
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      const result = await service.rejectMedia({
        organizerRef: 'org-001',
        eventRef: 'event-001',
        mediaRef: 'media-001'
      });

      expect(result.status).toBe('REJECTED');
      expect(result.revision).toBe(2n);
      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('Aislamiento: actor ajeno o media de otro evento rechaza con ACCESS_DENIED', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockRejectedValue({ code: 'ACCESS_DENIED' })
      };

      const service = new MediaModerationService(
        mockTransactions,
        createMockRepo(),
        mockAuthorizer
      );

      await expect(
        service.rejectMedia({
          organizerRef: 'org-ajeno',
          eventRef: 'event-001',
          mediaRef: 'media-001'
        })
      ).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    });

    it('Validación de entradas en rejectMedia rechaza con INVALID_ARGUMENT', async () => {
      const service = new MediaModerationService(
        mockTransactions,
        createMockRepo(),
        {} as EventStatusAuthorizer
      );

      await expect(
        service.rejectMedia({ organizerRef: '', eventRef: 'e-1', mediaRef: 'm-1' })
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
  });

  describe('trashMedia (EL-TK-107)', () => {
    it.each(['PUBLISHED', 'HIDDEN', 'PENDING_REVIEW', 'REJECTED'])(
      'Escenario 1: Dado media en %s, el organizador la mueve a papelera, pasa a TRASHED y guarda previous_state y ventana de 7 días',
      async (status) => {
        const mockAuthorizer: EventStatusAuthorizer = {
          assertAuthorized: vi.fn().mockResolvedValue(undefined)
        };

        const mockRepo = createMockRepo({
          lockAndGetMedia: vi.fn().mockResolvedValue({
            ...baseMedia,
            status,
            revision: 3n
          }),
          updateStatus: vi.fn().mockResolvedValue(4n)
        });

        const service = new MediaModerationService(
          mockTransactions,
          mockRepo,
          mockAuthorizer
        );

        const before = Date.now();
        const result = await service.trashMedia({
          organizerRef: 'org-001',
          eventRef: 'event-001',
          mediaRef: 'media-001',
          reason: 'Mover a papelera preventivo'
        });
        const after = Date.now();

        expect(result.status).toBe('TRASHED');
        expect(result.previousStatus).toBe(status);
        expect(result.revision).toBe(4n);
        expect(result.trashedAt.getTime()).toBeGreaterThanOrEqual(before);
        expect(result.trashedAt.getTime()).toBeLessThanOrEqual(after);

        // Ventana canónica DEC-096: exactamente 7 días
        const diffMs = result.restoreDeadline.getTime() - result.trashedAt.getTime();
        expect(diffMs).toBe(7 * 24 * 60 * 60 * 1000);

        expect(mockRepo.updateStatus).toHaveBeenCalledWith(dummyTx, 'media-001', 3n, 'TRASHED');
        expect(mockRepo.recordTrash).toHaveBeenCalledWith(
          dummyTx,
          expect.objectContaining({
            mediaRef: 'media-001',
            eventRef: 'event-001',
            organizerRef: 'org-001',
            previousStatus: status,
            reason: 'Mover a papelera preventivo'
          })
        );
        expect(mockRepo.recordAudit).toHaveBeenCalledWith(
          dummyTx,
          expect.objectContaining({
            action: 'MEDIA_TRASHED',
            mediaRef: 'media-001',
            newStatus: 'TRASHED',
            previousStatus: status
          })
        );
      }
    );

    it.each(['PROCESSING', 'UPLOADED'])(
      'Escenario 2: Dado media en curso (%s), no se autoriza papelera y rechaza con INELIGIBLE_STATE',
      async (ineligibleStatus) => {
        const mockAuthorizer: EventStatusAuthorizer = {
          assertAuthorized: vi.fn().mockResolvedValue(undefined)
        };

        const mockRepo = createMockRepo({
          lockAndGetMedia: vi.fn().mockResolvedValue({
            ...baseMedia,
            status: ineligibleStatus
          })
        });

        const service = new MediaModerationService(
          mockTransactions,
          mockRepo,
          mockAuthorizer
        );

        await expect(
          service.trashMedia({
            organizerRef: 'org-001',
            eventRef: 'event-001',
            mediaRef: 'media-001'
          })
        ).rejects.toMatchObject({ code: 'INELIGIBLE_STATE' });

        expect(mockRepo.updateStatus).not.toHaveBeenCalled();
      }
    );

    it('Escenario 2: Dado media en QUARANTINED, no se autoriza papelera y rechaza con SAFETY_BLOCKED', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const mockRepo = createMockRepo({
        lockAndGetMedia: vi.fn().mockResolvedValue({
          ...baseMedia,
          status: 'QUARANTINED'
        })
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      await expect(
        service.trashMedia({
          organizerRef: 'org-001',
          eventRef: 'event-001',
          mediaRef: 'media-001'
        })
      ).rejects.toMatchObject({ code: 'SAFETY_BLOCKED' });

      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('Escenario 3: Dado PROCESSING_FAILED con inspección de seguridad aprobada, se autoriza papelera', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const mockRepo = createMockRepo({
        lockAndGetMedia: vi.fn().mockResolvedValue({
          ...baseMedia,
          status: 'PROCESSING_FAILED'
        }),
        getSafetyFact: vi.fn().mockResolvedValue(approvedSafetyFact)
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      const result = await service.trashMedia({
        organizerRef: 'org-001',
        eventRef: 'event-001',
        mediaRef: 'media-001'
      });

      expect(result.status).toBe('TRASHED');
      expect(result.previousStatus).toBe('PROCESSING_FAILED');
      expect(mockRepo.updateStatus).toHaveBeenCalledWith(dummyTx, 'media-001', 1n, 'TRASHED');
    });

    it('Escenario 3: Dado PROCESSING_FAILED sin inspección aprobada, rechaza con SAFETY_BLOCKED', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const mockRepo = createMockRepo({
        lockAndGetMedia: vi.fn().mockResolvedValue({
          ...baseMedia,
          status: 'PROCESSING_FAILED'
        }),
        getSafetyFact: vi.fn().mockResolvedValue(null)
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      await expect(
        service.trashMedia({
          organizerRef: 'org-001',
          eventRef: 'event-001',
          mediaRef: 'media-001'
        })
      ).rejects.toMatchObject({ code: 'SAFETY_BLOCKED' });

      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('Seguridad prevalece: Si hay inspección DENIED, papelera es bloqueada con SAFETY_BLOCKED', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const deniedSafety: SafetyFact = {
        ...approvedSafetyFact,
        outcome: 'DENIED'
      };

      const mockRepo = createMockRepo({
        lockAndGetMedia: vi.fn().mockResolvedValue({
          ...baseMedia,
          status: 'PUBLISHED'
        }),
        getSafetyFact: vi.fn().mockResolvedValue(deniedSafety)
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      await expect(
        service.trashMedia({
          organizerRef: 'org-001',
          eventRef: 'event-001',
          mediaRef: 'media-001'
        })
      ).rejects.toMatchObject({ code: 'SAFETY_BLOCKED' });

      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('Seguridad prevalece: Si hay bloqueo de retiro vigente, rechaza con REMOVAL_BLOCKED', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const mockRepo = createMockRepo({
        lockAndGetMedia: vi.fn().mockResolvedValue({
          ...baseMedia,
          status: 'PUBLISHED'
        }),
        hasActiveRemovalBlock: vi.fn().mockResolvedValue(true)
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      await expect(
        service.trashMedia({
          organizerRef: 'org-001',
          eventRef: 'event-001',
          mediaRef: 'media-001'
        })
      ).rejects.toMatchObject({ code: 'REMOVAL_BLOCKED' });

      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('Idempotencia: Si la media ya está TRASHED, devuelve el registro existente sin reescribir', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const existingTrashRecord: MediaTrashRecord = {
        id: 'trash-id-123',
        operationId: 'op-old',
        mediaRef: 'media-001',
        eventRef: 'event-001',
        organizerRef: 'org-001',
        previousStatus: 'PUBLISHED',
        trashedAt: new Date(Date.now() - 3600000),
        restoreDeadline: new Date(Date.now() + 6 * 24 * 3600000),
        restoredAt: null,
        reason: 'razón anterior'
      };

      const mockRepo = createMockRepo({
        lockAndGetMedia: vi.fn().mockResolvedValue({
          ...baseMedia,
          status: 'TRASHED',
          revision: 5n
        }),
        getActiveTrashRecord: vi.fn().mockResolvedValue(existingTrashRecord)
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      const result = await service.trashMedia({
        organizerRef: 'org-001',
        eventRef: 'event-001',
        mediaRef: 'media-001'
      });

      expect(result.status).toBe('TRASHED');
      expect(result.previousStatus).toBe('PUBLISHED');
      expect(result.revision).toBe(5n);
      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('Concurrencia: Si expectedRevision no coincide, rechaza con CONCURRENCY_CONFLICT', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const mockRepo = createMockRepo({
        lockAndGetMedia: vi.fn().mockResolvedValue({
          ...baseMedia,
          status: 'PUBLISHED',
          revision: 2n
        })
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      await expect(
        service.trashMedia({
          organizerRef: 'org-001',
          eventRef: 'event-001',
          mediaRef: 'media-001',
          expectedRevision: 1n
        })
      ).rejects.toMatchObject({ code: 'CONCURRENCY_CONFLICT' });
    });

    it('Aislamiento y permisos: actor ajeno o media ajena rechaza con ACCESS_DENIED', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockRejectedValue({ code: 'ACCESS_DENIED' })
      };

      const service = new MediaModerationService(
        mockTransactions,
        createMockRepo(),
        mockAuthorizer
      );

      await expect(
        service.trashMedia({
          organizerRef: 'org-ajeno',
          eventRef: 'event-001',
          mediaRef: 'media-001'
        })
      ).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    });
  });

  describe('restoreMedia (EL-TK-108)', () => {
    const trashedMedia: MediaCatalogRecord = {
      ...baseMedia,
      status: 'TRASHED',
      revision: 4n
    };

    it.each(['PUBLISHED', 'HIDDEN', 'REJECTED'])(
      'Escenario 1: Dado media TRASHED dentro de 7 días y sin nuevos bloqueos, restaura a previous_state (%s)',
      async (previousStatus) => {
        const mockAuthorizer: EventStatusAuthorizer = {
          assertAuthorized: vi.fn().mockResolvedValue(undefined)
        };

        const activeTrashRecord: MediaTrashRecord = {
          id: 'trash-rec-001',
          operationId: 'op-trash-001',
          mediaRef: 'media-001',
          eventRef: 'event-001',
          organizerRef: 'org-001',
          previousStatus,
          trashedAt: new Date(Date.now() - 3600000), // 1 hour ago
          restoreDeadline: new Date(Date.now() + 6 * 24 * 3600000), // 6 days remaining
          restoredAt: null,
          reason: 'trash'
        };

        const mockRepo = createMockRepo({
          lockAndGetMedia: vi.fn().mockResolvedValue(trashedMedia),
          getActiveTrashRecord: vi.fn().mockResolvedValue(activeTrashRecord),
          updateStatus: vi.fn().mockResolvedValue(5n)
        });

        const service = new MediaModerationService(
          mockTransactions,
          mockRepo,
          mockAuthorizer
        );

        const result = await service.restoreMedia({
          organizerRef: 'org-001',
          eventRef: 'event-001',
          mediaRef: 'media-001'
        });

        expect(result.status).toBe(previousStatus);
        expect(result.previousStatus).toBe('TRASHED');
        expect(result.restoredFromStatus).toBe(previousStatus);
        expect(result.revision).toBe(5n);

        expect(mockRepo.updateStatus).toHaveBeenCalledWith(dummyTx, 'media-001', 4n, previousStatus);
        expect(mockRepo.markTrashRestored).toHaveBeenCalledWith(dummyTx, 'trash-rec-001', expect.any(Date));
        expect(mockRepo.recordAudit).toHaveBeenCalledWith(
          dummyTx,
          expect.objectContaining({
            action: 'MEDIA_RESTORED',
            mediaRef: 'media-001',
            previousStatus: 'TRASHED',
            newStatus: previousStatus
          })
        );
      }
    );

    it('Escenario 2: Dado previous_state era PENDING_REVIEW, al restaurar vuelve a PENDING_REVIEW y NO se publica', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const activeTrashRecord: MediaTrashRecord = {
        id: 'trash-rec-002',
        operationId: 'op-trash-002',
        mediaRef: 'media-001',
        eventRef: 'event-001',
        organizerRef: 'org-001',
        previousStatus: 'PENDING_REVIEW',
        trashedAt: new Date(Date.now() - 3600000),
        restoreDeadline: new Date(Date.now() + 6 * 24 * 3600000),
        restoredAt: null,
        reason: 'trash'
      };

      const mockRepo = createMockRepo({
        lockAndGetMedia: vi.fn().mockResolvedValue(trashedMedia),
        getActiveTrashRecord: vi.fn().mockResolvedValue(activeTrashRecord),
        updateStatus: vi.fn().mockResolvedValue(5n)
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      const result = await service.restoreMedia({
        organizerRef: 'org-001',
        eventRef: 'event-001',
        mediaRef: 'media-001'
      });

      // DEC-086: vuelve estrictamente a PENDING_REVIEW, nunca publica automáticamente
      expect(result.status).toBe('PENDING_REVIEW');
      expect(result.previousStatus).toBe('TRASHED');
      expect(mockRepo.updateStatus).toHaveBeenCalledWith(dummyTx, 'media-001', 4n, 'PENDING_REVIEW');
    });

    it('Escenario 3: Dado ventana de 7 días vencida, la restauración se deniega con RESTORE_WINDOW_EXPIRED', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const expiredTrashRecord: MediaTrashRecord = {
        id: 'trash-rec-003',
        operationId: 'op-trash-003',
        mediaRef: 'media-001',
        eventRef: 'event-001',
        organizerRef: 'org-001',
        previousStatus: 'PUBLISHED',
        trashedAt: new Date(Date.now() - 8 * 24 * 3600000),
        restoreDeadline: new Date(Date.now() - 1 * 24 * 3600000), // expired 1 day ago
        restoredAt: null,
        reason: 'trash'
      };

      const mockRepo = createMockRepo({
        lockAndGetMedia: vi.fn().mockResolvedValue(trashedMedia),
        getActiveTrashRecord: vi.fn().mockResolvedValue(expiredTrashRecord)
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      await expect(
        service.restoreMedia({
          organizerRef: 'org-001',
          eventRef: 'event-001',
          mediaRef: 'media-001'
        })
      ).rejects.toMatchObject({ code: 'RESTORE_WINDOW_EXPIRED' });

      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('Escenario 3: Dado media purgada (DELETED), se deniega con MEDIA_PURGED sin recrear contenido', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const mockRepo = createMockRepo({
        lockAndGetMedia: vi.fn().mockResolvedValue({
          ...baseMedia,
          status: 'DELETED'
        })
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      await expect(
        service.restoreMedia({
          organizerRef: 'org-001',
          eventRef: 'event-001',
          mediaRef: 'media-001'
        })
      ).rejects.toMatchObject({ code: 'MEDIA_PURGED' });

      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('Seguridad prevalece: Si hay bloqueo de seguridad vigente (DENIED), se rechaza con SAFETY_BLOCKED', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const activeTrashRecord: MediaTrashRecord = {
        id: 'trash-rec-004',
        operationId: 'op-trash-004',
        mediaRef: 'media-001',
        eventRef: 'event-001',
        organizerRef: 'org-001',
        previousStatus: 'PUBLISHED',
        trashedAt: new Date(Date.now() - 3600000),
        restoreDeadline: new Date(Date.now() + 6 * 24 * 3600000),
        restoredAt: null,
        reason: 'trash'
      };

      const deniedSafety: SafetyFact = {
        ...approvedSafetyFact,
        outcome: 'DENIED'
      };

      const mockRepo = createMockRepo({
        lockAndGetMedia: vi.fn().mockResolvedValue(trashedMedia),
        getActiveTrashRecord: vi.fn().mockResolvedValue(activeTrashRecord),
        getSafetyFact: vi.fn().mockResolvedValue(deniedSafety)
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      await expect(
        service.restoreMedia({
          organizerRef: 'org-001',
          eventRef: 'event-001',
          mediaRef: 'media-001'
        })
      ).rejects.toMatchObject({ code: 'SAFETY_BLOCKED' });

      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('Seguridad prevalece: Si hay bloqueo de retiro vigente, se rechaza con REMOVAL_BLOCKED', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const activeTrashRecord: MediaTrashRecord = {
        id: 'trash-rec-005',
        operationId: 'op-trash-005',
        mediaRef: 'media-001',
        eventRef: 'event-001',
        organizerRef: 'org-001',
        previousStatus: 'PUBLISHED',
        trashedAt: new Date(Date.now() - 3600000),
        restoreDeadline: new Date(Date.now() + 6 * 24 * 3600000),
        restoredAt: null,
        reason: 'trash'
      };

      const mockRepo = createMockRepo({
        lockAndGetMedia: vi.fn().mockResolvedValue(trashedMedia),
        getActiveTrashRecord: vi.fn().mockResolvedValue(activeTrashRecord),
        hasActiveRemovalBlock: vi.fn().mockResolvedValue(true)
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      await expect(
        service.restoreMedia({
          organizerRef: 'org-001',
          eventRef: 'event-001',
          mediaRef: 'media-001'
        })
      ).rejects.toMatchObject({ code: 'REMOVAL_BLOCKED' });

      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('Idempotencia: Si la media ya fue restaurada a su previousStatus, devuelve resultado sin error', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const activeTrashRecord: MediaTrashRecord = {
        id: 'trash-rec-006',
        operationId: 'op-trash-006',
        mediaRef: 'media-001',
        eventRef: 'event-001',
        organizerRef: 'org-001',
        previousStatus: 'PUBLISHED',
        trashedAt: new Date(Date.now() - 7200000),
        restoreDeadline: new Date(Date.now() + 6 * 24 * 3600000),
        restoredAt: new Date(Date.now() - 3600000),
        reason: 'trash'
      };

      const mockRepo = createMockRepo({
        lockAndGetMedia: vi.fn().mockResolvedValue({
          ...baseMedia,
          status: 'PUBLISHED',
          revision: 5n
        }),
        getActiveTrashRecord: vi.fn().mockResolvedValue(activeTrashRecord)
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      const result = await service.restoreMedia({
        organizerRef: 'org-001',
        eventRef: 'event-001',
        mediaRef: 'media-001'
      });

      expect(result.status).toBe('PUBLISHED');
      expect(result.revision).toBe(5n);
      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('Concurrencia: Si expectedRevision no coincide, rechaza con CONCURRENCY_CONFLICT', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const mockRepo = createMockRepo({
        lockAndGetMedia: vi.fn().mockResolvedValue(trashedMedia)
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        mockAuthorizer
      );

      await expect(
        service.restoreMedia({
          organizerRef: 'org-001',
          eventRef: 'event-001',
          mediaRef: 'media-001',
          expectedRevision: 99n
        })
      ).rejects.toMatchObject({ code: 'CONCURRENCY_CONFLICT' });
    });

    it('Aislamiento y permisos: actor ajeno o media ajena rechaza con ACCESS_DENIED', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockRejectedValue({ code: 'ACCESS_DENIED' })
      };

      const service = new MediaModerationService(
        mockTransactions,
        createMockRepo(),
        mockAuthorizer
      );

      await expect(
        service.restoreMedia({
          organizerRef: 'org-ajeno',
          eventRef: 'event-001',
          mediaRef: 'media-001'
        })
      ).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    });
  });

  describe('expireTrashMedia & processExpiredTrash (EL-TK-109, DEC-109, ARCH-019)', () => {
    const expiredTrashRecord = {
      id: 'trash-001',
      operationId: 'op-trash-001',
      mediaRef: 'media-001',
      eventRef: 'event-001',
      organizerRef: 'org-001',
      previousStatus: 'PUBLISHED',
      trashedAt: new Date('2026-10-01T10:00:00.000Z'),
      restoreDeadline: new Date('2026-10-08T10:00:00.000Z'),
      restoredAt: null,
      reason: 'eliminado por organizador'
    };

    it('Escenario 1: Dado media TRASHED que alcanzó su restoreDeadline, la transiciona a DELETED y registra PurgeIntent con ancla original', async () => {
      const mockDispatcher = {
        dispatchPurgeRequest: vi.fn().mockResolvedValue(undefined)
      };

      const mockRepo = createMockRepo({
        lockAndGetMedia: vi.fn().mockResolvedValue({
          mediaRef: 'media-001',
          eventRef: 'event-001',
          status: 'TRASHED',
          generation: 1n,
          revision: 2n
        }),
        getActiveTrashRecord: vi.fn().mockResolvedValue(expiredTrashRecord),
        getTrashPurgeIntentByTrashId: vi.fn().mockResolvedValue(null),
        updateStatus: vi.fn().mockResolvedValue(3n)
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        { assertAuthorized: vi.fn().mockResolvedValue(undefined) },
        mockDispatcher
      );

      const now = new Date('2026-10-08T10:00:01.000Z');
      const result = await service.expireTrashMedia({
        mediaRef: 'media-001',
        now
      });

      expect(result.outcome).toBe('PURGE_REQUESTED');
      expect(result.mediaRef).toBe('media-001');
      expect(result.previousStatus).toBe('TRASHED');
      expect(result.revision).toBe(3n);
      expect(result.purgeStartedAt).toEqual(expiredTrashRecord.restoreDeadline);
      expect(mockRepo.updateStatus).toHaveBeenCalledWith(dummyTx, 'media-001', 2n, 'DELETED');
      expect(mockRepo.recordTrashPurgeIntent).toHaveBeenCalled();
      expect(mockDispatcher.dispatchPurgeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaRef: 'media-001',
          purgeStartedAt: expiredTrashRecord.restoreDeadline,
          policyRef: 'MOD-008/ARCH-019'
        })
      );
    });

    it('Escenario 2: Dado el job se repite para un purgeIntent ya registrado, devuelve ALREADY_PURGED sin duplicar', async () => {
      const existingPurge = {
        id: 'purge-001',
        operationId: 'op-purge-001',
        trashRecordId: 'trash-001',
        mediaRef: 'media-001',
        eventRef: 'event-001',
        organizerRef: 'org-001',
        generation: 1n,
        previousRevision: 2n,
        newRevision: 3n,
        purgeStartedAt: expiredTrashRecord.restoreDeadline,
        mainPurgeDeadline: new Date('2026-10-15T10:00:00.000Z'),
        residualPurgeDeadline: new Date('2026-11-07T10:00:00.000Z'),
        policyRef: 'MOD-008/ARCH-019',
        policyVersion: '1.0',
        status: 'PENDING',
        dedupKey: 'trash-purge:trash-001',
        createdAt: new Date()
      };

      const mockRepo = createMockRepo({
        lockAndGetMedia: vi.fn().mockResolvedValue({
          mediaRef: 'media-001',
          eventRef: 'event-001',
          status: 'TRASHED',
          generation: 1n,
          revision: 2n
        }),
        getActiveTrashRecord: vi.fn().mockResolvedValue(expiredTrashRecord),
        getTrashPurgeIntentByTrashId: vi.fn().mockResolvedValue(existingPurge)
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        { assertAuthorized: vi.fn().mockResolvedValue(undefined) }
      );

      const result = await service.expireTrashMedia({
        mediaRef: 'media-001',
        now: new Date('2026-10-09T10:00:00.000Z')
      });

      expect(result.outcome).toBe('ALREADY_PURGED');
      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
      expect(mockRepo.recordTrashPurgeIntent).not.toHaveBeenCalled();
    });

    it('Escenario 3: Dado la media fue restaurada antes del deadline, un job atrasado no la purga ni invalida', async () => {
      const restoredTrashRecord = {
        ...expiredTrashRecord,
        restoredAt: new Date('2026-10-05T12:00:00.000Z')
      };

      const mockRepo = createMockRepo({
        lockAndGetMedia: vi.fn().mockResolvedValue({
          mediaRef: 'media-001',
          eventRef: 'event-001',
          status: 'PUBLISHED',
          generation: 1n,
          revision: 3n
        }),
        getActiveTrashRecord: vi.fn().mockResolvedValue(restoredTrashRecord)
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        { assertAuthorized: vi.fn().mockResolvedValue(undefined) }
      );

      const result = await service.expireTrashMedia({
        mediaRef: 'media-001',
        now: new Date('2026-10-10T10:00:00.000Z')
      });

      expect(result.outcome).toBe('SKIPPED_ALREADY_RESTORED');
      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
      expect(mockRepo.recordTrashPurgeIntent).not.toHaveBeenCalled();
    });

    it('Dado que aún no alcanza el restoreDeadline, devuelve SKIPPED_NOT_EXPIRED', async () => {
      const mockRepo = createMockRepo({
        lockAndGetMedia: vi.fn().mockResolvedValue({
          mediaRef: 'media-001',
          eventRef: 'event-001',
          status: 'TRASHED',
          generation: 1n,
          revision: 2n
        }),
        getActiveTrashRecord: vi.fn().mockResolvedValue(expiredTrashRecord)
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        { assertAuthorized: vi.fn().mockResolvedValue(undefined) }
      );

      const result = await service.expireTrashMedia({
        mediaRef: 'media-001',
        now: new Date('2026-10-05T10:00:00.000Z') // Antes del 2026-10-08
      });

      expect(result.outcome).toBe('SKIPPED_NOT_EXPIRED');
      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('processExpiredTrash barre y procesa registros vencidos', async () => {
      const mockRepo = createMockRepo({
        getExpiredTrashRecords: vi.fn().mockResolvedValue([expiredTrashRecord]),
        lockAndGetMedia: vi.fn().mockResolvedValue({
          mediaRef: 'media-001',
          eventRef: 'event-001',
          status: 'TRASHED',
          generation: 1n,
          revision: 2n
        }),
        getActiveTrashRecord: vi.fn().mockResolvedValue(expiredTrashRecord),
        getTrashPurgeIntentByTrashId: vi.fn().mockResolvedValue(null),
        updateStatus: vi.fn().mockResolvedValue(3n)
      });

      const service = new MediaModerationService(
        mockTransactions,
        mockRepo,
        { assertAuthorized: vi.fn().mockResolvedValue(undefined) }
      );

      const result = await service.processExpiredTrash({
        now: new Date('2026-10-09T10:00:00.000Z')
      });

      expect(result.processedCount).toBe(1);
      expect(result.results[0].outcome).toBe('PURGE_REQUESTED');
    });
  });
});
