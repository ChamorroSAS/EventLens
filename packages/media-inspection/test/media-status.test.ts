import { describe, it, expect, vi } from 'vitest';
import {
  GetMediaStatusAndCapabilities,
  MediaStatusError,
  type EventStatusAuthorizer,
  type MediaStatusRepository,
  type QueryMediaStatusCommand,
} from '../src/media-status.js';

describe('GetMediaStatusAndCapabilities unit logic (EL-TK-053)', () => {
  const dummyTx = {} as any;
  const mockTransactions = {
    run: vi.fn().mockImplementation(async cb => cb(dummyTx)),
  };

  it('fails with INVALID_ARGUMENT when parameters are missing', async () => {
    const handler = new GetMediaStatusAndCapabilities(
      mockTransactions,
      {} as MediaStatusRepository,
      {} as EventStatusAuthorizer
    );

    await expect(
      handler.execute({
        mediaRef: '',
        eventRef: 'event-1',
        actor: { role: 'ORGANIZER', organizerRef: 'org-1' },
      })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });

    await expect(
      handler.execute({
        mediaRef: 'media-1',
        eventRef: '',
        actor: { role: 'ORGANIZER', organizerRef: 'org-1' },
      })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });

    await expect(
      handler.execute({
        mediaRef: 'media-1',
        eventRef: 'event-1',
        actor: { role: 'ORGANIZER', organizerRef: '' },
      })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });

    await expect(
      handler.execute({
        mediaRef: 'media-1',
        eventRef: 'event-1',
        actor: { role: 'GUEST', guestRef: '' },
      })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('rejects with BARRED_EVENT or ACCESS_DENIED from authorizer', async () => {
    const mockAuthorizer: EventStatusAuthorizer = {
      assertAuthorized: vi.fn().mockRejectedValue(new MediaStatusError('BARRED_EVENT')),
    };

    const handler = new GetMediaStatusAndCapabilities(
      mockTransactions,
      {} as MediaStatusRepository,
      mockAuthorizer
    );

    await expect(
      handler.execute({
        mediaRef: 'media-1',
        eventRef: 'event-1',
        actor: { role: 'ORGANIZER', organizerRef: 'org-1' },
      })
    ).rejects.toMatchObject({ code: 'BARRED_EVENT' });
  });

  it('enforces non-enumeration: rejects with MEDIA_NOT_FOUND when media does not exist or belongs to another event', async () => {
    const mockAuthorizer: EventStatusAuthorizer = {
      assertAuthorized: vi.fn().mockResolvedValue(undefined),
    };

    const mockRepo: MediaStatusRepository = {
      queryStatus: vi.fn().mockResolvedValue(null),
      getSafetyFact: vi.fn(),
      getObservableJob: vi.fn(),
      recordAudit: vi.fn(),
    };

    const handler = new GetMediaStatusAndCapabilities(
      mockTransactions,
      mockRepo,
      mockAuthorizer
    );

    // Nonexistent
    await expect(
      handler.execute({
        mediaRef: 'media-missing',
        eventRef: 'event-1',
        actor: { role: 'ORGANIZER', organizerRef: 'org-1' },
      })
    ).rejects.toMatchObject({ code: 'MEDIA_NOT_FOUND' });

    // Belonging to another event
    (mockRepo.queryStatus as any).mockResolvedValue({
      mediaRef: 'media-1',
      eventRef: 'event-OTHER',
      guestRef: 'guest-1',
      generation: 1n,
      revision: 1n,
      status: 'PROCESSING',
      jobId: 'job-1',
    });

    await expect(
      handler.execute({
        mediaRef: 'media-1',
        eventRef: 'event-1',
        actor: { role: 'ORGANIZER', organizerRef: 'org-1' },
      })
    ).rejects.toMatchObject({ code: 'MEDIA_NOT_FOUND' });
  });

  it('enforces guest isolation: guest cannot query another guest upload ("Mis aportes" policy)', async () => {
    const mockAuthorizer: EventStatusAuthorizer = {
      assertAuthorized: vi.fn().mockResolvedValue(undefined),
    };

    const mockRepo: MediaStatusRepository = {
      queryStatus: vi.fn().mockResolvedValue({
        mediaRef: 'media-1',
        eventRef: 'event-1',
        guestRef: 'guest-OTHER',
        generation: 1n,
        revision: 1n,
        status: 'PROCESSING',
        jobId: 'job-1',
      }),
      getSafetyFact: vi.fn(),
      getObservableJob: vi.fn(),
      recordAudit: vi.fn(),
    };

    const handler = new GetMediaStatusAndCapabilities(
      mockTransactions,
      mockRepo,
      mockAuthorizer
    );

    await expect(
      handler.execute({
        mediaRef: 'media-1',
        eventRef: 'event-1',
        actor: { role: 'GUEST', guestRef: 'guest-CURRENT' },
      })
    ).rejects.toMatchObject({ code: 'MEDIA_NOT_FOUND' });
  });

  it('respects DEC-075: INCONCLUSIVE allows canRetry for owner but DENIES canDownloadOriginal', async () => {
    const mockAuthorizer: EventStatusAuthorizer = {
      assertAuthorized: vi.fn().mockResolvedValue(undefined),
    };

    const mockRepo: MediaStatusRepository = {
      queryStatus: vi.fn().mockResolvedValue({
        mediaRef: 'media-1',
        eventRef: 'event-1',
        guestRef: 'guest-1',
        generation: 2n,
        revision: 3n,
        status: 'PROCESSING_FAILED',
        jobId: 'job-1',
      }),
      getSafetyFact: vi.fn().mockResolvedValue({
        outcome: 'INCONCLUSIVE',
      } as any),
      getObservableJob: vi.fn().mockResolvedValue(null),
      recordAudit: vi.fn().mockResolvedValue(undefined),
    };

    const handler = new GetMediaStatusAndCapabilities(
      mockTransactions,
      mockRepo,
      mockAuthorizer
    );

    const result = await handler.execute({
      mediaRef: 'media-1',
      eventRef: 'event-1',
      actor: { role: 'ORGANIZER', organizerRef: 'org-1' },
    });

    expect(result.status).toBe('PROCESSING_FAILED');
    expect(result.safety.outcome).toBe('INCONCLUSIVE');
    expect(result.capabilities.canRetry).toBe(true);
    expect(result.capabilities.canDownloadOriginal).toBe(false); // Crucial DEC-075 invariant!
    expect(result.capabilities.canView).toBe(true);
  });

  it('denies canRetry and canDownloadOriginal in QUARANTINED state', async () => {
    const mockAuthorizer: EventStatusAuthorizer = {
      assertAuthorized: vi.fn().mockResolvedValue(undefined),
    };

    const mockRepo: MediaStatusRepository = {
      queryStatus: vi.fn().mockResolvedValue({
        mediaRef: 'media-q',
        eventRef: 'event-1',
        guestRef: 'guest-1',
        generation: 1n,
        revision: 1n,
        status: 'QUARANTINED',
        jobId: 'job-q',
      }),
      getSafetyFact: vi.fn().mockResolvedValue({
        outcome: 'DENIED',
      } as any),
      getObservableJob: vi.fn().mockResolvedValue(null),
      recordAudit: vi.fn().mockResolvedValue(undefined),
    };

    const handler = new GetMediaStatusAndCapabilities(
      mockTransactions,
      mockRepo,
      mockAuthorizer
    );

    const result = await handler.execute({
      mediaRef: 'media-q',
      eventRef: 'event-1',
      actor: { role: 'ORGANIZER', organizerRef: 'org-1' },
    });

    expect(result.status).toBe('QUARANTINED');
    expect(result.safety.outcome).toBe('DENIED');
    expect(result.capabilities.canRetry).toBe(false);
    expect(result.capabilities.canDownloadOriginal).toBe(false);
    expect(result.capabilities.canView).toBe(false);
  });

  it('denies canRetry for guest even when status is PROCESSING_FAILED and APPROVED', async () => {
    const mockAuthorizer: EventStatusAuthorizer = {
      assertAuthorized: vi.fn().mockResolvedValue(undefined),
    };

    const mockRepo: MediaStatusRepository = {
      queryStatus: vi.fn().mockResolvedValue({
        mediaRef: 'media-guest',
        eventRef: 'event-1',
        guestRef: 'guest-me',
        generation: 1n,
        revision: 2n,
        status: 'PROCESSING_FAILED',
        jobId: 'job-1',
      }),
      getSafetyFact: vi.fn().mockResolvedValue({
        outcome: 'APPROVED',
      } as any),
      getObservableJob: vi.fn().mockResolvedValue(null),
      recordAudit: vi.fn().mockResolvedValue(undefined),
    };

    const handler = new GetMediaStatusAndCapabilities(
      mockTransactions,
      mockRepo,
      mockAuthorizer
    );

    const result = await handler.execute({
      mediaRef: 'media-guest',
      eventRef: 'event-1',
      actor: { role: 'GUEST', guestRef: 'guest-me' },
    });

    expect(result.status).toBe('PROCESSING_FAILED');
    expect(result.safety.outcome).toBe('APPROVED');
    expect(result.capabilities.canRetry).toBe(false); // Guest can NEVER retry
    expect(result.capabilities.canDownloadOriginal).toBe(true); // Approved safety allows download eligibility
    expect(result.capabilities.canView).toBe(true);
  });

  it('exposes sanitized observableProgress for PROCESSING media without leaking sensitive fields', async () => {
    const mockAuthorizer: EventStatusAuthorizer = {
      assertAuthorized: vi.fn().mockResolvedValue(undefined),
    };

    const mockRepo: MediaStatusRepository = {
      queryStatus: vi.fn().mockResolvedValue({
        mediaRef: 'media-proc',
        eventRef: 'event-1',
        guestRef: 'guest-1',
        generation: 1n,
        revision: 1n,
        status: 'PROCESSING',
        jobId: 'job-active-123',
      }),
      getSafetyFact: vi.fn().mockResolvedValue(null),
      getObservableJob: vi.fn().mockResolvedValue({
        status: 'PROCESSING',
        attempt: 2,
      }),
      recordAudit: vi.fn().mockResolvedValue(undefined),
    };

    const handler = new GetMediaStatusAndCapabilities(
      mockTransactions,
      mockRepo,
      mockAuthorizer
    );

    const result = await handler.execute({
      mediaRef: 'media-proc',
      eventRef: 'event-1',
      actor: { role: 'ORGANIZER', organizerRef: 'org-1' },
      operationId: 'op-status-1',
    });

    expect(result.status).toBe('PROCESSING');
    expect(result.safety.outcome).toBe('PENDING');
    expect(result.observableProgress).toEqual({
      phase: 'PROCESSING',
      attempt: 2,
    });
    // Ensure no sensitive fields leaked
    expect((result as any).original).toBeUndefined();
    expect((result as any).s3Key).toBeUndefined();
    expect((result as any).token).toBeUndefined();
    expect((result as any).adminError).toBeUndefined();
  });
});
