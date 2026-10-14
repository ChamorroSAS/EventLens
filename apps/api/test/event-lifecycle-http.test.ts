import { expect, it, vi } from 'vitest';
import { OrganizerEventsController } from '../src/events/organizer-events.controller.js';
import { OrganizerEventLifecycleAdapter } from '../src/events/organizer-event-lifecycle.js';

it('lifecycle HTTP forwards authenticated headers and protects snapshots from caching', async () => {
  const getLifecycle = vi.fn().mockResolvedValue({ eventId: 'event', revision: '3' });
  const executeLifecycle = vi.fn().mockResolvedValue({ eventId: 'event', outcome: 'SCHEDULED' });
  const prepareShareAccess = vi.fn().mockResolvedValue({ eventId: 'event', outcome: 'ISSUED' });
  const controller = new OrganizerEventsController({ getLifecycle, executeLifecycle, prepareShareAccess } as any);
  const response = { setHeader: vi.fn() };
  const request = { headers: { cookie: 'el_session=token', origin: 'http://localhost:4200', 'x-csrf-token': 'csrf', 'idempotency-key': 'publish' } };
  await controller.getLifecycle('event', request, response);
  await controller.scheduleLifecycle('event', { expectedRevision: '3' }, request, response);
  await controller.activateLifecycle('event', { expectedRevision: '4' }, request, response);
  await controller.prepareShareAccess('event', { expectedRevision: '4' }, request, response);
  expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  expect(executeLifecycle).toHaveBeenCalledWith('schedule', { eventId: 'event', body: { expectedRevision: '3' }, cookieHeader: 'el_session=token', originHeader: 'http://localhost:4200', csrfToken: 'csrf', idempotencyKey: 'publish' });
  expect(executeLifecycle.mock.calls[1][0]).toBe('activate');
  expect(prepareShareAccess).toHaveBeenCalledWith({ eventId: 'event', body: { expectedRevision: '4' }, cookieHeader: 'el_session=token', originHeader: 'http://localhost:4200', csrfToken: 'csrf', idempotencyKey: 'publish' });
});

it.each([undefined, {}, { expectedRevision: 1 }, { expectedRevision: '0' }, { expectedRevision: '2', trigger: 'SCHEDULED_AUTO' }, []])('rejects invalid command shapes before transaction: %j', async body => {
  const database = { run: vi.fn() };
  const adapter = new OrganizerEventLifecycleAdapter(database, { assertTrustedOrigin: vi.fn() } as any);
  await expect(adapter.command('activate', { eventId: 'event', body, idempotencyKey: 'key' })).rejects.toMatchObject({ status: 400 });
  await expect(adapter.prepareShare({ eventId: 'event', body, idempotencyKey: 'key' })).rejects.toMatchObject({ status: 400 });
  expect(database.run).not.toHaveBeenCalled();
});

it('requires Origin and mandatory header idempotency key', async () => {
  const database = { run: vi.fn() };
  const adapter = new OrganizerEventLifecycleAdapter(database, { assertTrustedOrigin: vi.fn() } as any);
  await expect(adapter.command('schedule', { eventId: 'event', body: { expectedRevision: '1' } })).rejects.toMatchObject({ status: 400 });
  await expect(adapter.prepareShare({ eventId: 'event', body: { expectedRevision: '1' } })).rejects.toMatchObject({ status: 400 });
  expect(database.run).not.toHaveBeenCalled();
});
