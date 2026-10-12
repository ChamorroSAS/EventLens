import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import type { OrganizerActorContext, AdminActorContext } from '@eventlens/identity';
import {
  EventDraftService,
  EventManagementError,
  type EventAuditSink,
  type EventAuditRecord,
  type EventStatus,
  type ModerationMode
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

          // UPDATE event
          if (normalized.includes('UPDATE event')) {
            const id = params[params.length - 1] as string;
            const existing = db.events.get(id);
            if (!existing) throw new Error(`Event not found for update: ${id}`);

            if (normalized.includes('SET timezone = $1')) {
              existing.timezone = params[0];
              existing.starts_at_local = params[1];
              existing.scheduled_at = params[2];
              existing.utc_offset_minutes = params[3];
              existing.idempotency_key = params[4] ?? null;
              existing.idempotency_payload_hash = params[5] ?? null;
              existing.updated_at = params[6];
            }

            db.events.set(id, existing);
            return [{ ...existing }] as unknown as T[];
          }

          throw new Error(`Unhandled mock query: ${sql}`);
        },

        async execute(sql: string, ..._params: unknown[]): Promise<number> {
          throw new Error(`Unhandled mock execute: ${sql}`);
        }
      };

      return callback(tx);
    }
  };
}

describe('EL-EP-002 Ruta 2: Zona Horaria y Preview (Unit Tests)', () => {
  let db: InMemoryDb;
  let auditRecords: EventAuditRecord[];
  let auditSink: EventAuditSink;
  let service: EventDraftService;
  let ownerActor: OrganizerActorContext;
  let otherActor: OrganizerActorContext;
  let adminActor: AdminActorContext;
  let eventId: string;

  beforeEach(() => {
    auditRecords = [];
    auditSink = {
      record: async (rec: EventAuditRecord) => {
        auditRecords.push(rec);
      }
    };

    db = {
      events: new Map(),
      auditEvents: auditRecords
    };

    service = new EventDraftService(createInMemoryRunner(db), auditSink);

    ownerActor = {
      actorType: 'ORGANIZER_HUMAN',
      accountId: randomUUID(),
      email: 'organizer@eventlens.local',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };

    otherActor = {
      actorType: 'ORGANIZER_HUMAN',
      accountId: randomUUID(),
      email: 'other@eventlens.local',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };

    adminActor = {
      actorType: 'ADMIN_HUMAN',
      principalId: randomUUID(),
      identifier: 'admin@eventlens.internal',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      adminAuthRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };

    eventId = randomUUID();
  });

  function seedEvent(overrides: Partial<any> = {}) {
    const base = {
      id: eventId,
      organizer_id: ownerActor.accountId,
      name: 'Boda de Ensueño',
      status: 'DRAFT',
      timezone: 'America/Bogota',
      starts_at_local: null,
      scheduled_at: null,
      utc_offset_minutes: null,
      expires_at: null,
      grace_ends_at: null,
      activated_at: null,
      closed_at: null,
      purge_started_at: null,
      suspended_at: null,
      suspension_reason: null,
      previous_status: null,
      validity_duration_days: null,
      grace_days: null,
      uploads_enabled: false,
      guest_gallery_enabled: false,
      moderation_mode: 'AUTO_PUBLISH',
      pin_enabled: false,
      pin_hash: null,
      pin_salt: null,
      welcome_message: null,
      idempotency_key: null,
      idempotency_payload_hash: null,
      created_at: new Date('2026-10-12T10:00:00Z'),
      updated_at: new Date('2026-10-12T10:00:00Z'),
      ...overrides
    };
    db.events.set(base.id, base);
    return base;
  }

  // =========================================================================
  // EL-TK-024: Cambiar la zona horaria de un evento preparado
  // =========================================================================
  describe('EL-TK-024: changeTimezone', () => {
    it('Escenario 1: Propietario cambia TZ en DRAFT sin fecha (conserva nulls en starts_at_local y scheduled_at)', async () => {
      seedEvent({ starts_at_local: null, scheduled_at: null });

      const result = await service.changeTimezone({
        actorContext: ownerActor,
        eventId,
        timezone: 'America/New_York'
      });

      expect(result.outcome).toBe('TIMEZONE_CHANGED');
      expect(result.previousTimezone).toBe('America/Bogota');
      expect(result.warning).toBeNull();
      expect(result.event.timezone).toBe('America/New_York');
      expect(result.event.startsAtLocal).toBeNull();
      expect(result.event.scheduledAt).toBeNull();

      expect(auditRecords).toHaveLength(1);
      expect(auditRecords[0].procedure).toBe('EVENT_TIMEZONE_CHANGED');
      expect(auditRecords[0].result).toBe('TIMEZONE_CHANGED');
      expect(auditRecords[0].actorId).toBe(ownerActor.accountId);
    });

    it('Escenario 2: Propietario cambia TZ en DRAFT con fecha (conserva hora local, recalcula UTC scheduledAt, sin warning)', async () => {
      // 2026-12-15 14:30:00 in America/Bogota (UTC-5) -> 19:30:00 UTC
      // When changed to America/New_York (UTC-5 in standard time):
      // 2026-12-15 14:30:00 EST (UTC-5) -> 19:30:00 UTC
      // When changed to Europe/Madrid (UTC+1 in standard time):
      // 2026-12-15 14:30:00 CET (UTC+1) -> 13:30:00 UTC
      seedEvent({
        starts_at_local: '2026-12-15T14:30:00',
        scheduled_at: new Date('2026-12-15T19:30:00Z'),
        utc_offset_minutes: -300
      });

      const result = await service.changeTimezone({
        actorContext: ownerActor,
        eventId,
        timezone: 'Europe/Madrid'
      });

      expect(result.outcome).toBe('TIMEZONE_CHANGED');
      expect(result.previousTimezone).toBe('America/Bogota');
      expect(result.warning).toBeNull();
      expect(result.event.timezone).toBe('Europe/Madrid');
      expect(result.event.startsAtLocal).toBe('2026-12-15T14:30:00');
      // 14:30 Madrid (UTC+1) = 13:30 UTC
      expect(result.event.scheduledAt?.toISOString()).toBe('2026-12-15T13:30:00.000Z');
      expect(result.event.utcOffsetMinutes).toBe(60);

      expect(auditRecords[0].result).toBe('TIMEZONE_CHANGED');
    });

    it('Escenario 3: Propietario cambia TZ en SCHEDULED con fecha (recalcula UTC y emite warning RECALCULATED_SCHEDULE)', async () => {
      seedEvent({
        status: 'SCHEDULED',
        starts_at_local: '2026-12-15T14:30:00',
        scheduled_at: new Date('2026-12-15T19:30:00Z'),
        utc_offset_minutes: -300
      });

      const result = await service.changeTimezone({
        actorContext: ownerActor,
        eventId,
        timezone: 'Europe/Madrid'
      });

      expect(result.outcome).toBe('TIMEZONE_CHANGED');
      expect(result.warning).toBe('RECALCULATED_SCHEDULE');
      expect(result.event.timezone).toBe('Europe/Madrid');
      expect(result.event.startsAtLocal).toBe('2026-12-15T14:30:00');
      expect(result.event.scheduledAt?.toISOString()).toBe('2026-12-15T13:30:00.000Z');

      expect(auditRecords[0].result).toBe('RECALCULATED_SCHEDULE');
    });

    it('Escenario 4: Rechaza cambio si zona horaria IANA es inválida', async () => {
      seedEvent();

      await expect(
        service.changeTimezone({
          actorContext: ownerActor,
          eventId,
          timezone: 'Mars/Curiosity_Base'
        })
      ).rejects.toThrowError(EventManagementError);

      expect(auditRecords).toHaveLength(1);
      expect(auditRecords[0].result).toBe('REJECTED_TIMEZONE_INVALID');
      expect(db.events.get(eventId).timezone).toBe('America/Bogota');
    });

    it('Escenario 5: Rechaza cambio si actor no es propietario', async () => {
      seedEvent();

      await expect(
        service.changeTimezone({
          actorContext: otherActor,
          eventId,
          timezone: 'Europe/Madrid'
        })
      ).rejects.toThrowError(EventManagementError);

      expect(auditRecords[0].result).toBe('REJECTED_UNAUTHORIZED');
      expect(db.events.get(eventId).timezone).toBe('America/Bogota');
    });

    it('Escenario 6: Rechaza cambio si el evento ya alcanzó ACTIVE', async () => {
      seedEvent({ status: 'ACTIVE' });

      await expect(
        service.changeTimezone({
          actorContext: ownerActor,
          eventId,
          timezone: 'Europe/Madrid'
        })
      ).rejects.toThrowError(EventManagementError);

      expect(auditRecords[0].result).toBe('REJECTED_INVALID_STATE');
      expect(db.events.get(eventId).timezone).toBe('America/Bogota');
    });

    it('Escenario 7: Rechaza cambio ante hora DST inexistente (gap spring-forward) sin mutar el evento', async () => {
      // In America/New_York, 2026-03-08 02:30:00 does not exist (clocks jump from 02:00 to 03:00)
      seedEvent({
        starts_at_local: '2026-03-08T02:30:00',
        scheduled_at: new Date('2026-03-08T07:30:00Z'),
        utc_offset_minutes: -300
      });

      await expect(
        service.changeTimezone({
          actorContext: ownerActor,
          eventId,
          timezone: 'America/New_York'
        })
      ).rejects.toThrowError(EventManagementError);

      expect(auditRecords[0].result).toBe('REJECTED_DST_GAP');
      expect(db.events.get(eventId).timezone).toBe('America/Bogota');
    });

    it('Escenario 8: Rechaza cambio ante hora DST repetida si no se provee offset explícito', async () => {
      // In America/New_York, 2026-11-01 01:30:00 occurs twice (EDT -240 and EST -300)
      seedEvent({
        starts_at_local: '2026-11-01T01:30:00',
        scheduled_at: new Date('2026-11-01T06:30:00Z'),
        utc_offset_minutes: -300
      });

      await expect(
        service.changeTimezone({
          actorContext: ownerActor,
          eventId,
          timezone: 'America/New_York'
        })
      ).rejects.toThrowError(EventManagementError);

      expect(auditRecords[0].result).toBe('REJECTED_AMBIGUOUS_TIME');
      expect(db.events.get(eventId).timezone).toBe('America/Bogota');
    });

    it('Escenario 9: Permite cambio ante hora DST repetida cuando se suministra offset válido', async () => {
      seedEvent({
        starts_at_local: '2026-11-01T01:30:00',
        scheduled_at: new Date('2026-11-01T06:30:00Z'),
        utc_offset_minutes: -300
      });

      const result = await service.changeTimezone({
        actorContext: ownerActor,
        eventId,
        timezone: 'America/New_York',
        utcOffsetMinutes: -300 // Standard time offset
      });

      expect(result.outcome).toBe('TIMEZONE_CHANGED');
      expect(result.event.timezone).toBe('America/New_York');
      expect(result.event.utcOffsetMinutes).toBe(-300);
      expect(result.event.scheduledAt?.toISOString()).toBe('2026-11-01T06:30:00.000Z');
    });

    it('Escenario 10: Idempotencia compatible retorna IDEMPOTENT_REPLAY', async () => {
      seedEvent();
      const idempotencyKey = 'idem-tz-1';

      const first = await service.changeTimezone({
        actorContext: ownerActor,
        eventId,
        timezone: 'Europe/Paris',
        idempotencyKey
      });
      expect(first.outcome).toBe('TIMEZONE_CHANGED');

      const second = await service.changeTimezone({
        actorContext: ownerActor,
        eventId,
        timezone: 'Europe/Paris',
        idempotencyKey
      });
      expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(second.event.timezone).toBe('Europe/Paris');
    });

    it('Escenario 11: Idempotencia con payload distinto lanza IDEMPOTENCY_CONFLICT', async () => {
      seedEvent();
      const idempotencyKey = 'idem-tz-conflict';

      await service.changeTimezone({
        actorContext: ownerActor,
        eventId,
        timezone: 'Europe/Paris',
        idempotencyKey
      });

      await expect(
        service.changeTimezone({
          actorContext: ownerActor,
          eventId,
          timezone: 'Europe/London',
          idempotencyKey
        })
      ).rejects.toThrowError(EventManagementError);
    });

    it('Escenario 12: Evento inexistente lanza EVENT_NOT_FOUND', async () => {
      await expect(
        service.changeTimezone({
          actorContext: ownerActor,
          eventId: randomUUID(),
          timezone: 'Europe/London'
        })
      ).rejects.toThrowError(EventManagementError);
    });
  });

  // =========================================================================
  // EL-TK-025: Corregir la zona horaria de un evento que alcanzó ACTIVE
  // =========================================================================
  describe('EL-TK-025: adminCorrectTimezone', () => {
    it('Escenario 1: Administrador autorizado corrige TZ en evento ACTIVE con justificación obligatoria', async () => {
      seedEvent({
        status: 'ACTIVE',
        starts_at_local: '2026-10-15T18:00:00',
        scheduled_at: new Date('2026-10-15T23:00:00Z'),
        utc_offset_minutes: -300,
        expires_at: new Date('2026-10-30T23:00:00Z'),
        grace_ends_at: new Date('2026-11-06T23:00:00Z')
      });

      const result = await service.adminCorrectTimezone({
        actorContext: adminActor,
        eventId,
        timezone: 'America/Lima',
        justification: 'Corrección de error de selección en evento corporativo transfronterizo'
      });

      expect(result.outcome).toBe('TIMEZONE_CORRECTED');
      expect(result.previousTimezone).toBe('America/Bogota');
      expect(result.event.timezone).toBe('America/Lima');
      expect(result.event.startsAtLocal).toBe('2026-10-15T18:00:00');
      // America/Lima is UTC-5, so 18:00 is 23:00 UTC
      expect(result.event.scheduledAt?.toISOString()).toBe('2026-10-15T23:00:00.000Z');

      // Crucial: Preserves lifecycle dates intact!
      expect(result.event.expiresAt?.toISOString()).toBe('2026-10-30T23:00:00.000Z');
      expect(result.event.graceEndsAt?.toISOString()).toBe('2026-11-06T23:00:00.000Z');

      expect(auditRecords).toHaveLength(1);
      expect(auditRecords[0].procedure).toBe('ADMIN_EVENT_TIMEZONE_CORRECTED');
      expect(auditRecords[0].result).toBe('TIMEZONE_CORRECTED');
      expect(auditRecords[0].actorId).toBe(adminActor.principalId);
      expect(auditRecords[0].details).toContain('Corrección de error de selección');
    });

    it('Escenario 2: Administrador corrige TZ en eventos en CLOSED, GRACE_PERIOD y SUSPENDED', async () => {
      const validStatuses: EventStatus[] = ['CLOSED', 'GRACE_PERIOD', 'SUSPENDED'];

      for (const st of validStatuses) {
        const testId = randomUUID();
        seedEvent({
          id: testId,
          status: st,
          timezone: 'America/Bogota',
          starts_at_local: '2026-10-15T18:00:00',
          scheduled_at: new Date('2026-10-15T23:00:00Z'),
          utc_offset_minutes: -300
        });

        const result = await service.adminCorrectTimezone({
          actorContext: adminActor,
          eventId: testId,
          timezone: 'America/Mexico_City',
          justification: `Corrección administrativa en estado ${st}`
        });

        expect(result.outcome).toBe('TIMEZONE_CORRECTED');
        expect(result.event.timezone).toBe('America/Mexico_City');
      }
    });

    it('Escenario 3: Rechaza si actor no es administrador', async () => {
      seedEvent({ status: 'ACTIVE' });

      await expect(
        service.adminCorrectTimezone({
          actorContext: ownerActor as unknown as AdminActorContext,
          eventId,
          timezone: 'America/Lima',
          justification: 'Intento con contexto no admin'
        })
      ).rejects.toThrowError(EventManagementError);
    });

    it('Escenario 4: Rechaza si justificación está vacía o ausente', async () => {
      seedEvent({ status: 'ACTIVE' });

      await expect(
        service.adminCorrectTimezone({
          actorContext: adminActor,
          eventId,
          timezone: 'America/Lima',
          justification: '   '
        })
      ).rejects.toThrowError(EventManagementError);

      expect(auditRecords[0].result).toBe('REJECTED_REASON_REQUIRED');
    });

    it('Escenario 5: Rechaza si el evento está en DRAFT o SCHEDULED (no ha alcanzado ACTIVE)', async () => {
      seedEvent({ status: 'DRAFT' });

      await expect(
        service.adminCorrectTimezone({
          actorContext: adminActor,
          eventId,
          timezone: 'America/Lima',
          justification: 'Intento prematuro'
        })
      ).rejects.toThrowError(EventManagementError);

      expect(auditRecords[0].result).toBe('REJECTED_INVALID_STATE');
    });

    it('Escenario 6: Rechaza si el evento está en PENDING_DELETION o ARCHIVED (terminal)', async () => {
      seedEvent({ status: 'PENDING_DELETION' });

      await expect(
        service.adminCorrectTimezone({
          actorContext: adminActor,
          eventId,
          timezone: 'America/Lima',
          justification: 'Intento sobre terminal'
        })
      ).rejects.toThrowError(EventManagementError);

      expect(auditRecords[0].result).toBe('REJECTED_EVENT_TERMINAL');
    });

    it('Escenario 7: Rechaza zona horaria IANA inválida', async () => {
      seedEvent({ status: 'ACTIVE' });

      await expect(
        service.adminCorrectTimezone({
          actorContext: adminActor,
          eventId,
          timezone: 'Jupiter/RedSpot',
          justification: 'Zona inexistente'
        })
      ).rejects.toThrowError(EventManagementError);

      expect(auditRecords[0].result).toBe('REJECTED_TIMEZONE_INVALID');
    });

    it('Escenario 8: Rechaza DST gap sin mutar el evento', async () => {
      seedEvent({
        status: 'ACTIVE',
        starts_at_local: '2026-03-08T02:30:00',
        scheduled_at: new Date('2026-03-08T07:30:00Z')
      });

      await expect(
        service.adminCorrectTimezone({
          actorContext: adminActor,
          eventId,
          timezone: 'America/New_York',
          justification: 'Prueba de DST gap'
        })
      ).rejects.toThrowError(EventManagementError);

      expect(auditRecords[0].result).toBe('REJECTED_DST_GAP');
    });

    it('Escenario 9: Idempotencia compatible y conflicto', async () => {
      seedEvent({ status: 'ACTIVE' });
      const idempotencyKey = 'idem-admin-1';

      const first = await service.adminCorrectTimezone({
        actorContext: adminActor,
        eventId,
        timezone: 'America/Santiago',
        justification: 'Corrección inicial',
        idempotencyKey
      });
      expect(first.outcome).toBe('TIMEZONE_CORRECTED');

      const replay = await service.adminCorrectTimezone({
        actorContext: adminActor,
        eventId,
        timezone: 'America/Santiago',
        justification: 'Corrección inicial',
        idempotencyKey
      });
      expect(replay.outcome).toBe('IDEMPOTENT_REPLAY');

      await expect(
        service.adminCorrectTimezone({
          actorContext: adminActor,
          eventId,
          timezone: 'America/Montevideo',
          justification: 'Conflicto',
          idempotencyKey
        })
      ).rejects.toThrowError(EventManagementError);
    });
  });

  // =========================================================================
  // EL-TK-031: Previsualizar un borrador como invitado
  // =========================================================================
  describe('EL-TK-031: previewDraftAsGuest', () => {
    it('Escenario 1: Propietario solicita preview de DRAFT propio y obtiene EventSnapshot privado con defaults DEC-069', async () => {
      seedEvent({
        name: 'Cumpleaños 30',
        starts_at_local: '2026-11-20T20:00:00',
        scheduled_at: new Date('2026-11-21T01:00:00Z'),
        utc_offset_minutes: -300,
        welcome_message: '¡Bienvenidos a celebrar!'
      });

      const result = await service.previewDraftAsGuest({
        actorContext: ownerActor,
        eventId
      });

      expect(result.snapshot).toBeDefined();
      expect(result.snapshot.eventId).toBe(eventId);
      expect(result.snapshot.name).toBe('Cumpleaños 30');
      expect(result.snapshot.status).toBe('DRAFT');
      expect(result.snapshot.timezone).toBe('America/Bogota');
      expect(result.snapshot.startsAtLocal).toBe('2026-11-20T20:00:00');
      expect(result.snapshot.scheduledAt?.toISOString()).toBe('2026-11-21T01:00:00.000Z');
      expect(result.snapshot.utcOffsetMinutes).toBe(-300);
      expect(result.snapshot.welcomeMessage).toBe('¡Bienvenidos a celebrar!');
      expect(result.snapshot.coverPreviewUrl).toBeNull();
      expect(result.snapshot.uploadsEnabled).toBe(false);
      expect(result.snapshot.guestGalleryEnabled).toBe(false);
      expect(result.snapshot.moderationMode).toBe('AUTO_PUBLISH');
      expect(result.snapshot.pinEnabled).toBe(false);
      expect(result.snapshot.isPreview).toBe(true);

      // Verify audit
      expect(auditRecords).toHaveLength(1);
      expect(auditRecords[0].procedure).toBe('EVENT_DRAFT_PREVIEWED');
      expect(auditRecords[0].result).toBe('SUCCESS');
      expect(auditRecords[0].actorId).toBe(ownerActor.accountId);
    });

    it('Escenario 2: EventSnapshot refleja pinEnabled boolean sin filtrar hash o salt', async () => {
      seedEvent({
        pin_enabled: true,
        pin_hash: 'secret_hash_value',
        pin_salt: 'secret_salt_value'
      });

      const result = await service.previewDraftAsGuest({
        actorContext: ownerActor,
        eventId
      });

      expect(result.snapshot.pinEnabled).toBe(true);
      expect((result.snapshot as any).pin_hash).toBeUndefined();
      expect((result.snapshot as any).pinHash).toBeUndefined();
      expect((result.snapshot as any).pin_salt).toBeUndefined();
      expect((result.snapshot as any).pinSalt).toBeUndefined();
    });

    it('Escenario 3: No muta el evento ni crea sesiones o credenciales públicas', async () => {
      const initial = seedEvent();

      await service.previewDraftAsGuest({
        actorContext: ownerActor,
        eventId
      });

      const current = db.events.get(eventId);
      expect(current.status).toBe('DRAFT');
      expect(current.updated_at).toEqual(initial.updated_at);
    });

    it('Escenario 4: Resuelve coverPreviewUrl a través de coverAssetResolver opcional', async () => {
      seedEvent();
      const mockResolver = async (id: string) => `https://assets.eventlens.local/covers/${id}.jpg`;
      const serviceWithCover = new EventDraftService(createInMemoryRunner(db), auditSink, mockResolver);

      const result = await serviceWithCover.previewDraftAsGuest({
        actorContext: ownerActor,
        eventId
      });

      expect(result.snapshot.coverPreviewUrl).toBe(`https://assets.eventlens.local/covers/${eventId}.jpg`);
    });

    it('Escenario 5: Actor no propietario recibe EVENT_NOT_FOUND (anti-enumeración estricta)', async () => {
      seedEvent();

      await expect(
        service.previewDraftAsGuest({
          actorContext: otherActor,
          eventId
        })
      ).rejects.toThrowError(EventManagementError);

      try {
        await service.previewDraftAsGuest({
          actorContext: otherActor,
          eventId
        });
      } catch (err: any) {
        expect(err.code).toBe('EVENT_NOT_FOUND');
      }
    });

    it('Escenario 6: Evento no existente lanza EVENT_NOT_FOUND', async () => {
      await expect(
        service.previewDraftAsGuest({
          actorContext: ownerActor,
          eventId: randomUUID()
        })
      ).rejects.toThrowError(EventManagementError);
    });

    it('Escenario 7: Evento en estado distinto a DRAFT lanza EVENT_NOT_IN_DRAFT', async () => {
      seedEvent({ status: 'ACTIVE' });

      await expect(
        service.previewDraftAsGuest({
          actorContext: ownerActor,
          eventId
        })
      ).rejects.toThrowError(EventManagementError);

      try {
        await service.previewDraftAsGuest({
          actorContext: ownerActor,
          eventId
        });
      } catch (err: any) {
        expect(err.code).toBe('EVENT_NOT_IN_DRAFT');
      }
    });
  });
});
