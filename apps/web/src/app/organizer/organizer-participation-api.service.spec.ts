import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OrganizerService } from './organizer.service.js';
import { OrganizerSessionService } from '../organizer-session.service.js';
const NativeRequest = globalThis.Request;
let transport: ReturnType<typeof vi.fn>;
const command = { eventId: 'event-1', uploadsEnabled: true, guestGalleryEnabled: false, expectedRevision: '3', idempotencyKey: 'participation-key' };
beforeEach(() => {
  transport = vi.fn();
  vi.stubGlobal('fetch', transport);
  // Resolve relative browser URLs for Node's real Request without mocking the generated client.
  vi.stubGlobal('Request', class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(typeof input === 'string' ? new URL(input, 'http://localhost:4200') : input, init);
    }
  });
  TestBed.configureTestingModule({ providers: [OrganizerService, { provide: OrganizerSessionService, useValue: { getCsrfToken: () => 'sample-csrf' } }] });
});
afterEach(() => vi.unstubAllGlobals());
it('sends both flags, CAS, CSRF and idempotency through the generated client', async () => {
  transport.mockResolvedValue(new Response(JSON.stringify({ eventId: 'event-1', outcome: 'UPDATED' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  await TestBed.inject(OrganizerService).setEventParticipation(command);
  const request = transport.mock.calls[0][0] as Request;
  expect(request.method).toBe('PUT');
  expect(new URL(request.url).pathname).toBe('/api/v1/events/event-1/configuration/participation');
  expect(request.headers.get('X-CSRF-Token')).toBe('sample-csrf');
  expect(request.headers.get('Idempotency-Key')).toBe(command.idempotencyKey);
  expect(await request.json()).toEqual({ uploadsEnabled: true, guestGalleryEnabled: false, expectedRevision: '3' });
});
it.each(['CONCURRENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'INVALID_STATE'])('preserves 409 %s', async code => {
  transport.mockResolvedValue(new Response(JSON.stringify({ code }), { status: 409, headers: { 'Content-Type': 'application/json' } }));
  await expect(TestBed.inject(OrganizerService).setEventParticipation(command)).rejects.toThrow(code);
});
it('does not invent CAS for unknown conflict, distinguishes auth and uncertain network', async () => {
  const service = TestBed.inject(OrganizerService);
  transport.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'OTHER' }), { status: 409, headers: { 'Content-Type': 'application/json' } }));
  await expect(service.setEventParticipation(command)).rejects.toThrow('PARTICIPATION_CONFLICT');
  transport.mockResolvedValueOnce(new Response('{}', { status: 403, headers: { 'Content-Type': 'application/json' } }));
  await expect(service.setEventParticipation(command)).rejects.toThrow('ACCESS_DENIED');
  transport.mockRejectedValueOnce(new TypeError('Network failed'));
  await expect(service.setEventParticipation(command)).rejects.toThrow('COMMUNICATION_ERROR');
});
