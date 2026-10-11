import {describe,it,expect,vi} from 'vitest';
import {
  RequestRetryCycle,
  CycleDeniedError,
  type EventOrganizerAuthorization,
  type RetryCycleRepository,
  type RequestRetryCycleCommand
} from '../src/retry-cycle.js';

describe('RequestRetryCycle unit logic', () => {
  const dummyTx = {} as any;
  const mockTransactions = {
    run: vi.fn().mockImplementation(async cb => cb(dummyTx))
  };

  it('fails with INVALID_ARGUMENT when parameters are missing', async () => {
    const handler = new RequestRetryCycle(
      mockTransactions,
      {} as RetryCycleRepository,
      {} as EventOrganizerAuthorization,
      { publish: vi.fn() } as any
    );

    await expect(
      handler.execute({ mediaRef: '', eventRef: 'e1', organizerRef: 'o1' }, 'op-1')
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });

    await expect(
      handler.execute({ mediaRef: 'm1', eventRef: '', organizerRef: 'o1' }, 'op-1')
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });

    await expect(
      handler.execute({ mediaRef: 'm1', eventRef: 'e1', organizerRef: '' }, 'op-1')
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });

    await expect(
      handler.execute({ mediaRef: 'm1', eventRef: 'e1', organizerRef: 'o1' }, '')
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('rejects with IDEMPOTENCY_CONFLICT when same operationId has conflicting parameters', async () => {
    const mockRepo: RetryCycleRepository = {
      findActiveCycle: vi.fn(),
      getReceiptByOperation: vi.fn().mockResolvedValue({
        cycleId: 'cycle-1',
        cycleNumber: 1,
        mediaRef: 'media-1',
        eventRef: 'event-1',
        organizerRef: 'organizer-original',
        jobId: 'job-1',
        jobType: 'MEDIA_INSPECTION',
        safetyOutcome: 'PENDING',
        status: 'ACTIVE',
        operationId: 'op-1',
        wasExistingCycle: true,
        createdAt: new Date()
      }),
      createCycle: vi.fn(),
      recordDenial: vi.fn()
    };

    const handler = new RequestRetryCycle(
      mockTransactions,
      mockRepo,
      {} as EventOrganizerAuthorization,
      { publish: vi.fn() } as any
    );

    const conflictingCmd: RequestRetryCycleCommand = {
      mediaRef: 'media-1',
      eventRef: 'event-1',
      organizerRef: 'organizer-DIFFERENT'
    };

    await expect(handler.execute(conflictingCmd, 'op-1')).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT'
    });
  });

  it('rejects and records denial when organizer authorization fails', async () => {
    const mockRepo: RetryCycleRepository = {
      findActiveCycle: vi.fn(),
      getReceiptByOperation: vi.fn().mockResolvedValue(null),
      createCycle: vi.fn(),
      recordDenial: vi.fn().mockResolvedValue(undefined)
    };

    const mockAuthorizer: EventOrganizerAuthorization = {
      assertAuthorizedOrganizer: vi.fn().mockRejectedValue(new CycleDeniedError('ORGANIZER_NOT_AUTHORIZED'))
    };

    const handler = new RequestRetryCycle(
      mockTransactions,
      mockRepo,
      mockAuthorizer,
      { publish: vi.fn() } as any
    );

    await expect(
      handler.execute({ mediaRef: 'm1', eventRef: 'e1', organizerRef: 'stranger' }, 'op-2')
    ).rejects.toMatchObject({ code: 'ORGANIZER_NOT_AUTHORIZED' });

    expect(mockRepo.recordDenial).toHaveBeenCalledWith(
      dummyTx,
      expect.objectContaining({
        operationId: 'op-2',
        mediaRef: 'm1',
        organizerRef: 'stranger',
        reason: 'ORGANIZER_NOT_AUTHORIZED'
      })
    );
  });
});
