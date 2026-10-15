import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OrganizerService } from './organizer.service.js';
import { OrganizerSessionService } from '../organizer-session.service.js';

// Node's Request requires an absolute URL; the browser resolves the same route against its origin.
vi.mock('@eventlens/api-client', async importOriginal => {
  const actual = await importOriginal<typeof import('@eventlens/api-client')>();
  return { ...actual, createEventLensClient: () => actual.createEventLensClient({ baseUrl: 'http://localhost:4200' }) };
});

let transport: ReturnType<typeof vi.fn>;
const command = { eventId: 'event-1', startsAtLocal: '2026-11-20T18:00', expectedRevision: '3', idempotencyKey: 'schedule-key' };
beforeEach(() => {
  transport = vi.fn();
  vi.stubGlobal('fetch', transport);
  TestBed.configureTestingModule({ providers: [OrganizerService, { provide: OrganizerSessionService, useValue: { getCsrfToken: () => 'sample-csrf' } }] });
});
afterEach(() => vi.unstubAllGlobals());

it.each(['CONCURRENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'INVALID_STATE', 'EVENT_NOT_IN_DRAFT'])('preserves the server 409 code %s', async code => {
  transport.mockResolvedValue(new Response(JSON.stringify({ code, message: 'Rejected' }), { status: 409, headers: { 'Content-Type': 'application/json' } }));
  await expect(TestBed.inject(OrganizerService).setEventSchedule(command)).rejects.toThrow(code);
});

it('does not invent CAS when the server returns an unknown conflict', async () => {
  transport.mockResolvedValue(new Response(JSON.stringify({ code: 'OTHER_CONFLICT' }), { status: 409, headers: { 'Content-Type': 'application/json' } }));
  await expect(TestBed.inject(OrganizerService).setEventSchedule(command)).rejects.toThrow('SCHEDULE_CONFLICT');
});

it('preserves server-authorized DST offsets and normalizes uncertain transport errors', async () => {
  transport.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'AMBIGUOUS_LOCAL_TIME', details: { availableOffsets: [60, 120] } }), { status: 422, headers: { 'Content-Type': 'application/json' } }));
  const service = TestBed.inject(OrganizerService);
  await expect(service.setEventSchedule(command)).rejects.toMatchObject({ message: 'AMBIGUOUS_LOCAL_TIME', availableOffsets: [60, 120] });
  transport.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  await expect(service.setEventSchedule(command)).rejects.toThrow('COMMUNICATION_ERROR');
});
