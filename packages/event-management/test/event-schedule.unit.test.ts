import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import type { OrganizerActorContext } from '@eventlens/identity';
import {
  EventDraftService,
  EventManagementError,
  type EventAuditSink,
  type EventAuditRecord
} from '../src/index.js';

interface InMemoryDb {
  events: Map<string, any>;
  auditEvents: EventAuditRecord[];
}

function createInMemoryRunner(db: InMemoryDb): TransactionRunner {
  return {
    async run<R>(callback: (tx: SqlTransaction) => Promise<R>): Promise<R> {
      const tx: SqlTransaction = {
        async query<T extends object>(sql: string, ...params: unknown[]): Promise<T[]> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // SELECT ... FROM event WHERE id = $1
          if (normalized.includes('FROM event') && normalized.includes('WHERE id = $1')) {
            const id = params[0] as string;
            const ev = db.events.get(id);
            if (ev) return [{ ...ev }] as unknown as T[];
            return [] as unknown as T[];
          }

          // UPDATE event ... RETURNING ...
          if (normalized.includes('UPDATE event') && normalized.includes('SET starts_at_local = $2')) {
            const id = params[0] as string;
            const ev = db.events.get(id);
            if (!ev) return [] as unknown as T[];

            ev.starts_at_local = params[1] as string;
            ev.scheduled_at = params[2] as Date;
            ev.utc_offset_minutes = params[3] as number;
            if (params[4]) ev.idempotency_key = params[4] as string;
            if (params[5]) ev.idempotency_payload_hash = params[5] as string;
            ev.updated_at = params[6] as Date;

            db.events.set(id, ev);
            return [{ ...ev }] as unknown as T[];
          }

          throw new Error(`Unhandled mock SQL query: ${sql}`);
        },

        async execute(_sql: string, ..._params: unknown[]): Promise<number> {
          return 0;
        }
      };

      return callback(tx);
    }
  };
}

describe('EventScheduleService (Unit Tests — EL-TK-023)', () => {
  let db: InMemoryDb;
  let auditSink: EventAuditSink;
  let service: EventDraftService;

  const organizerId = randomUUID();
  const mockActor: OrganizerActorContext = {
    actorType: 'ORGANIZER_HUMAN',
    accountId: organizerId,
    email: 'organizer@eventlens.local',
    sessionId: randomUUID(),
    authTime: new Date(),
    credentialRevision: 1n,
    sessionWatermark: 1n,
    recoveryEpoch: 1n
  };

  beforeEach(() => {
    db = {
      events: new Map(),
      auditEvents: []
    };
    auditSink = {
      async record(event: EventAuditRecord): Promise<void> {
        db.auditEvents.push(event);
      }
    };
    service = new EventDraftService(createInMemoryRunner(db), auditSink);
  });

  function seedEvent(overrides: Partial<any> = {}): string {
    const id = randomUUID();
    db.events.set(id, {
      id,
      organizer_id: organizerId,
      name: 'Boda Campestre',
      status: 'DRAFT',
      timezone: 'America/Bogota',
      starts_at_local: null,
      scheduled_at: null,
      utc_offset_minutes: null,
      uploads_enabled: false,
      guest_gallery_enabled: false,
      moderation_mode: 'AUTO_PUBLISH',
      pin_enabled: false,
      idempotency_key: null,
      idempotency_payload_hash: null,
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides
    });
    return id;
  }

  it('Escenario 1: Guarda fecha y hora local ordinaria en la timezone del evento', async () => {
    const eventId = seedEvent({ timezone: 'America/Bogota' });

    const result = await service.setSchedule({
      actorContext: mockActor,
      eventId,
      startsAtLocal: '2026-11-20T18:00:00'
    });

    expect(result.outcome).toBe('UPDATED');
    expect(result.event.startsAtLocal).toBe('2026-11-20T18:00:00');
    expect(result.event.utcOffsetMinutes).toBe(-300); // America/Bogota is UTC-5 (-300 min)
    expect(result.event.scheduledAt).toBeInstanceOf(Date);
    // 18:00 Bogota (UTC-5) -> 23:00 UTC
    expect(result.event.scheduledAt?.toISOString()).toBe('2026-11-20T23:00:00.000Z');

    // Audit verification
    expect(db.auditEvents.some((a) => a.procedure === 'EVENT_SCHEDULE_SET' && a.result === 'SUCCESS')).toBe(true);
  });

  it('Escenario 2: Rechaza hora inexistente por salto de primavera DST (DEC-070 gap)', async () => {
    // 2026-03-08 at 02:30:00 in America/New_York does not exist (clocks jump from 02:00 to 03:00)
    const eventId = seedEvent({ timezone: 'America/New_York' });

    await expect(
      service.setSchedule({
        actorContext: mockActor,
        eventId,
        startsAtLocal: '2026-03-08T02:30:00'
      })
    ).rejects.toThrowError(EventManagementError);

    try {
      await service.setSchedule({
        actorContext: mockActor,
        eventId,
        startsAtLocal: '2026-03-08T02:30:00'
      });
    } catch (err: any) {
      expect(err.code).toBe('DST_GAP_TIME');
    }

    // Verify draft remains unchanged
    const stored = db.events.get(eventId);
    expect(stored.starts_at_local).toBeNull();
    expect(stored.scheduled_at).toBeNull();

    // Verify audit recorded rejection
    expect(db.auditEvents.some((a) => a.procedure === 'EVENT_SCHEDULE_SET' && a.result === 'REJECTED_DST_GAP')).toBe(true);
  });

  it('Escenario 3: Requiere elegir offset explícito para hora repetida por salto de otoño DST (DEC-070 overlap)', async () => {
    // 2026-11-01 at 01:30:00 in America/New_York occurs twice (EDT -04:00 and EST -05:00)
    const eventId = seedEvent({ timezone: 'America/New_York' });

    // 1. Without declared offset: must reject with AMBIGUOUS_LOCAL_TIME
    try {
      await service.setSchedule({
        actorContext: mockActor,
        eventId,
        startsAtLocal: '2026-11-01T01:30:00'
      });
      expect.fail('Should have thrown AMBIGUOUS_LOCAL_TIME');
    } catch (err: any) {
      expect(err.code).toBe('AMBIGUOUS_LOCAL_TIME');
      expect(err.details?.availableOffsets).toContain(-240);
      expect(err.details?.availableOffsets).toContain(-300);
    }

    // 2. With invalid declared offset: must reject with INVALID_OFFSET
    try {
      await service.setSchedule({
        actorContext: mockActor,
        eventId,
        startsAtLocal: '2026-11-01T01:30:00',
        utcOffsetMinutes: -360 // Invalid
      });
      expect.fail('Should have thrown INVALID_OFFSET');
    } catch (err: any) {
      expect(err.code).toBe('INVALID_OFFSET');
    }

    // 3. With valid chosen offset: succeeds and stores the chosen instant
    const resEDT = await service.setSchedule({
      actorContext: mockActor,
      eventId,
      startsAtLocal: '2026-11-01T01:30:00',
      utcOffsetMinutes: -240 // EDT
    });
    expect(resEDT.outcome).toBe('UPDATED');
    expect(resEDT.event.utcOffsetMinutes).toBe(-240);
    expect(resEDT.event.scheduledAt?.toISOString()).toBe('2026-11-01T05:30:00.000Z');

    const resEST = await service.setSchedule({
      actorContext: mockActor,
      eventId,
      startsAtLocal: '2026-11-01T01:30:00',
      utcOffsetMinutes: -300 // EST
    });
    expect(resEST.outcome).toBe('UPDATED');
    expect(resEST.event.utcOffsetMinutes).toBe(-300);
    expect(resEST.event.scheduledAt?.toISOString()).toBe('2026-11-01T06:30:00.000Z');
  });

  it('Aislamiento de permisos: rechaza si el organizador no es propietario del borrador', async () => {
    const eventId = seedEvent({ organizer_id: randomUUID() }); // Other owner

    await expect(
      service.setSchedule({
        actorContext: mockActor,
        eventId,
        startsAtLocal: '2026-11-20T18:00:00'
      })
    ).rejects.toThrowError(EventManagementError);

    try {
      await service.setSchedule({
        actorContext: mockActor,
        eventId,
        startsAtLocal: '2026-11-20T18:00:00'
      });
    } catch (err: any) {
      expect(err.code).toBe('UNAUTHORIZED');
    }
  });

  it('Restricción de estado: solo permite definir horario en borradores DRAFT', async () => {
    const eventId = seedEvent({ status: 'ACTIVE' });

    try {
      await service.setSchedule({
        actorContext: mockActor,
        eventId,
        startsAtLocal: '2026-11-20T18:00:00'
      });
      expect.fail('Should have rejected non-DRAFT event');
    } catch (err: any) {
      expect(err.code).toBe('EVENT_NOT_IN_DRAFT');
    }
  });

  it('Idempotencia: peticiones repetidas devuelven IDEMPOTENT_REPLAY; cambio de parámetros causa conflicto', async () => {
    const eventId = seedEvent();
    const idempotencyKey = 'key-schedule-001';

    const first = await service.setSchedule({
      actorContext: mockActor,
      eventId,
      startsAtLocal: '2026-11-20T18:00:00',
      idempotencyKey
    });
    expect(first.outcome).toBe('UPDATED');

    // Repeated request with same parameters
    const second = await service.setSchedule({
      actorContext: mockActor,
      eventId,
      startsAtLocal: '2026-11-20T18:00:00',
      idempotencyKey
    });
    expect(second.outcome).toBe('IDEMPOTENT_REPLAY');

    // Same key with different parameters -> IDEMPOTENCY_CONFLICT
    await expect(
      service.setSchedule({
        actorContext: mockActor,
        eventId,
        startsAtLocal: '2026-12-01T10:00:00',
        idempotencyKey
      })
    ).rejects.toThrowError(EventManagementError);
  });
});
