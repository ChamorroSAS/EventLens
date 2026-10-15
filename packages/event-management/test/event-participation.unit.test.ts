import { expect, it, vi } from 'vitest';
import { EventParticipationService } from '../src/event-participation.js';

it('rejects missing/malformed command and actor before entering persistence', async () => {
  const run = vi.fn();
  const service = new EventParticipationService({ run }, { releaseReservation: vi.fn() }, { record: vi.fn() });
  await expect(service.setParticipation(undefined as any)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  await expect(service.setParticipation({} as any)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  const valid = { actorContext: { actorType: 'ORGANIZER_HUMAN', accountId: 'owner' }, eventId: 'event', uploadsEnabled: false, guestGalleryEnabled: true, expectedRevision: '1', idempotencyKey: 'key' };
  await expect(service.setParticipation({ ...valid, uploadsEnabled: 'false' } as any)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  await expect(service.setParticipation({ ...valid, expectedRevision: 1 } as any)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  await expect(service.setParticipation({ ...valid, actorContext: { ...valid.actorContext, restrictedContext: 'DELETION_MANAGEMENT_ONLY' } } as any)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  expect(run).not.toHaveBeenCalled();
});
