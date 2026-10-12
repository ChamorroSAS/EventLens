import { describe, it, expect, vi } from 'vitest';
import {
  MediaModerationService,
  MediaModerationError,
  type MediaModerationRepository,
  type MediaCatalogRecord
} from '../src/media-moderation.js';
import type { EventStatusAuthorizer } from '../src/media-status.js';
import type { SafetyFact } from '../src/contracts.js';

describe('MediaModerationService (EL-TK-103)', () => {
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

  it('Escenario 1: Dado una media propia en PENDING_REVIEW sin bloqueos, el organizador la aprueba y pasa a PUBLISHED', async () => {
    const mockAuthorizer: EventStatusAuthorizer = {
      assertAuthorized: vi.fn().mockResolvedValue(undefined)
    };

    const mockRepo: MediaModerationRepository = {
      lockAndGetMedia: vi.fn().mockResolvedValue(baseMedia),
      getSafetyFact: vi.fn().mockResolvedValue(approvedSafetyFact),
      hasActiveRemovalBlock: vi.fn().mockResolvedValue(false),
      updateStatus: vi.fn().mockResolvedValue(2n),
      recordAudit: vi.fn().mockResolvedValue(undefined)
    };

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

    const mockRepo: MediaModerationRepository = {
      lockAndGetMedia: vi.fn().mockResolvedValue(baseMedia),
      getSafetyFact: vi.fn().mockResolvedValue(deniedSafetyFact),
      hasActiveRemovalBlock: vi.fn().mockResolvedValue(false),
      updateStatus: vi.fn(),
      recordAudit: vi.fn()
    };

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

    const mockRepo: MediaModerationRepository = {
      lockAndGetMedia: vi.fn().mockResolvedValue(baseMedia),
      getSafetyFact: vi.fn().mockResolvedValue(approvedSafetyFact),
      hasActiveRemovalBlock: vi.fn().mockResolvedValue(true),
      updateStatus: vi.fn(),
      recordAudit: vi.fn()
    };

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

    const mockRepo: MediaModerationRepository = {
      lockAndGetMedia: vi.fn().mockResolvedValue({
        ...baseMedia,
        status: 'PUBLISHED',
        revision: 2n
      }),
      getSafetyFact: vi.fn(),
      hasActiveRemovalBlock: vi.fn(),
      updateStatus: vi.fn(),
      recordAudit: vi.fn()
    };

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

    const mockRepo: MediaModerationRepository = {
      lockAndGetMedia: vi.fn().mockResolvedValue({
        ...baseMedia,
        status: 'REJECTED'
      }),
      getSafetyFact: vi.fn(),
      hasActiveRemovalBlock: vi.fn(),
      updateStatus: vi.fn(),
      recordAudit: vi.fn()
    };

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

    const mockRepo: MediaModerationRepository = {
      lockAndGetMedia: vi.fn().mockResolvedValue(baseMedia),
      getSafetyFact: vi.fn(),
      hasActiveRemovalBlock: vi.fn(),
      updateStatus: vi.fn(),
      recordAudit: vi.fn()
    };

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
      {} as MediaModerationRepository,
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

    const mockRepo: MediaModerationRepository = {
      lockAndGetMedia: vi.fn().mockResolvedValue({
        ...baseMedia,
        eventRef: 'other-event-999'
      }),
      getSafetyFact: vi.fn(),
      hasActiveRemovalBlock: vi.fn(),
      updateStatus: vi.fn(),
      recordAudit: vi.fn()
    };

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

    const mockRepo: MediaModerationRepository = {
      lockAndGetMedia: vi.fn().mockResolvedValue(null),
      getSafetyFact: vi.fn(),
      hasActiveRemovalBlock: vi.fn(),
      updateStatus: vi.fn(),
      recordAudit: vi.fn()
    };

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

  describe('rejectMedia (EL-TK-104)', () => {
    it('Escenario 1: Dado media propia en PENDING_REVIEW, el organizador la rechaza y pasa a REJECTED', async () => {
      const mockAuthorizer: EventStatusAuthorizer = {
        assertAuthorized: vi.fn().mockResolvedValue(undefined)
      };

      const mockRepo: MediaModerationRepository = {
        lockAndGetMedia: vi.fn().mockResolvedValue(baseMedia),
        getSafetyFact: vi.fn(),
        hasActiveRemovalBlock: vi.fn(),
        updateStatus: vi.fn().mockResolvedValue(2n),
        recordAudit: vi.fn().mockResolvedValue(undefined)
      };

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

      const mockRepo: MediaModerationRepository = {
        lockAndGetMedia: vi.fn().mockResolvedValue({
          ...baseMedia,
          status: 'PUBLISHED'
        }),
        getSafetyFact: vi.fn(),
        hasActiveRemovalBlock: vi.fn(),
        updateStatus: vi.fn(),
        recordAudit: vi.fn()
      };

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

      const mockRepo: MediaModerationRepository = {
        lockAndGetMedia: vi.fn().mockResolvedValue({
          ...baseMedia,
          status: 'REJECTED',
          revision: 2n
        }),
        getSafetyFact: vi.fn(),
        hasActiveRemovalBlock: vi.fn(),
        updateStatus: vi.fn(),
        recordAudit: vi.fn()
      };

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
        {} as MediaModerationRepository,
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
        {} as MediaModerationRepository,
        {} as EventStatusAuthorizer
      );

      await expect(
        service.rejectMedia({ organizerRef: '', eventRef: 'e-1', mediaRef: 'm-1' })
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
  });
});
