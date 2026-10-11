import { describe, it, expect, beforeEach } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import type { OrganizerActorContext } from '@eventlens/identity';
import {
  EventLifecycleService
} from '../src/event-lifecycle.js';
import {
  EventManagementError,
  type EventAuditRecord,
  type EventAuditSink
} from '../src/contracts.js';

interface MockEvent {
  id: string;
  organizer_id: string;
  name: string;
  status: string;
  timezone: string;
  starts_at_local: string | null;
  scheduled_at: Date | null;
  utc_offset_minutes: number | null;
  expires_at: Date | null;
  grace_ends_at: Date | null;
  activated_at?: Date | null;
  validity_duration_days: number | null;
  grace_days: number | null;
  uploads_enabled: boolean;
  guest_gallery_enabled: boolean;
  moderation_mode: string;
  pin_enabled: boolean;
  idempotency_key: string | null;
  idempotency_payload_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

class InMemoryRunner implements TransactionRunner {
  constructor(public events: Map<string, MockEvent>) {}

  async run<T>(action: (tx: SqlTransaction) => Promise<T>): Promise<T> {
    const tx: SqlTransaction = {
      query: async <R extends object>(sql: string, ...params: unknown[]): Promise<R[]> => {
        if (sql.includes('FROM event') && sql.includes('WHERE id = $1')) {
          const id = params[0] as string;
          const found = this.events.get(id);
          return (found ? [{ ...found }] : []) as unknown as R[];
        }
        return [] as unknown as R[];
      },
      execute: async (sql: string, ...params: unknown[]): Promise<number> => {
        if (sql.includes('UPDATE event') && sql.includes('SET status = \'SCHEDULED\'')) {
          const expiresAt = params[0] as Date;
          const graceEndsAt = params[1] as Date;
          const validityDays = params[2] as number;
          const graceDays = params[3] as number;
          const idempotencyKey = params[4] as string | null;
          const payloadHash = params[5] as string | null;
          const updatedAt = params[6] as Date;
          const eventId = params[7] as string;

          const existing = this.events.get(eventId);
          if (existing) {
            existing.status = 'SCHEDULED';
            existing.expires_at = expiresAt;
            existing.grace_ends_at = graceEndsAt;
            existing.validity_duration_days = validityDays;
            existing.grace_days = graceDays;
            if (idempotencyKey) existing.idempotency_key = idempotencyKey;
            if (payloadHash) existing.idempotency_payload_hash = payloadHash;
            existing.updated_at = updatedAt;
            return 1;
          }
        }
        if (sql.includes('UPDATE event') && sql.includes('SET status = \'ACTIVE\'')) {
          const activatedAt = params[0] as Date;
          const idempotencyKey = params[1] as string | null;
          const payloadHash = params[2] as string | null;
          const updatedAt = params[3] as Date;
          const eventId = params[4] as string;

          const existing = this.events.get(eventId);
          if (existing) {
            existing.status = 'ACTIVE';
            existing.activated_at = activatedAt;
            if (idempotencyKey) existing.idempotency_key = idempotencyKey;
            if (payloadHash) existing.idempotency_payload_hash = payloadHash;
            existing.updated_at = updatedAt;
            return 1;
          }
        }
        return 0;
      }
    };
    return action(tx);
  }
}

describe('EL-TK-063: EventLifecycleService (Unit Tests)', () => {
  let eventsMap: Map<string, MockEvent>;
  let runner: InMemoryRunner;
  let auditLogs: EventAuditRecord[];
  let auditSink: EventAuditSink;
  let service: EventLifecycleService;

  const ownerActor: OrganizerActorContext = {
    actorType: 'ORGANIZER_HUMAN',
    accountId: '11111111-1111-1111-1111-111111111111',
    email: 'owner@eventlens.local',
    sessionId: 'session-1',
    authTime: new Date(),
    credentialRevision: 1n,
    sessionWatermark: 1n,
    recoveryEpoch: 1n
  };

  const otherActor: OrganizerActorContext = {
    actorType: 'ORGANIZER_HUMAN',
    accountId: '99999999-9999-9999-9999-999999999999',
    email: 'other@eventlens.local',
    sessionId: 'session-2',
    authTime: new Date(),
    credentialRevision: 1n,
    sessionWatermark: 1n,
    recoveryEpoch: 1n
  };

  beforeEach(() => {
    eventsMap = new Map();
    runner = new InMemoryRunner(eventsMap);
    auditLogs = [];
    auditSink = {
      record: async (rec) => {
        auditLogs.push(rec);
      }
    };
    service = new EventLifecycleService(runner, auditSink);
  });

  describe('Escenario 1: Programación exitosa de DRAFT a SCHEDULED con timeline canónico', () => {
    it('pasa a SCHEDULED con expiración y gracia calculadas según DEC-077 y DEC-082', async () => {
      const scheduledAt = new Date('2026-11-01T15:00:00.000Z');
      const eventId = '33333333-3333-3333-3333-333333333333';

      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Conferencia Tech 2026',
        status: 'DRAFT',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: null,
        grace_ends_at: null,
        validity_duration_days: null,
        grace_days: null,
        uploads_enabled: false,
        guest_gallery_enabled: false,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date('2026-10-01T10:00:00.000Z'),
        updated_at: new Date('2026-10-01T10:00:00.000Z')
      });

      const result = await service.scheduleDraft({
        actorContext: ownerActor,
        eventId,
        validityDurationDays: 30,
        graceDays: 7
      });

      expect(result.outcome).toBe('SCHEDULED');
      expect(result.event.status).toBe('SCHEDULED');
      expect(result.event.expiresAt?.toISOString()).toBe('2026-12-01T15:00:00.000Z');
      expect(result.event.graceEndsAt?.toISOString()).toBe('2026-12-08T15:00:00.000Z');
      expect(result.event.validityDurationDays).toBe(30);
      expect(result.event.graceDays).toBe(7);

      // Verificación de auditoría
      const successAudit = auditLogs.find((a) => a.procedure === 'EVENT_SCHEDULED' && a.result === 'SUCCESS');
      expect(successAudit).toBeDefined();
      expect(successAudit?.targetIdentifier).toBe(eventId);
    });
  });

  describe('Escenario 2: Rechazo de borrador sin datos mínimos requeridos', () => {
    it('rechaza programar un borrador sin fecha/hora configurada (SCHEDULE_NOT_CONFIGURED)', async () => {
      const eventId = '44444444-4444-4444-4444-444444444444';
      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Borrador sin fecha',
        status: 'DRAFT',
        timezone: 'America/Bogota',
        starts_at_local: null,
        scheduled_at: null,
        utc_offset_minutes: null,
        expires_at: null,
        grace_ends_at: null,
        validity_duration_days: null,
        grace_days: null,
        uploads_enabled: false,
        guest_gallery_enabled: false,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      await expect(
        service.scheduleDraft({
          actorContext: ownerActor,
          eventId
        })
      ).rejects.toThrowError(EventManagementError);

      const rejectedAudit = auditLogs.find((a) => a.result === 'REJECTED_SCHEDULE_NOT_CONFIGURED');
      expect(rejectedAudit).toBeDefined();

      // El evento sigue en DRAFT sin modificaciones
      expect(eventsMap.get(eventId)?.status).toBe('DRAFT');
    });

    it('rechaza programar un borrador con nombre vacío (INCOMPLETE_CONFIGURATION)', async () => {
      const eventId = '55555555-5555-5555-5555-555555555555';
      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: '   ',
        status: 'DRAFT',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: new Date('2026-11-01T15:00:00.000Z'),
        utc_offset_minutes: -300,
        expires_at: null,
        grace_ends_at: null,
        validity_duration_days: null,
        grace_days: null,
        uploads_enabled: false,
        guest_gallery_enabled: false,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      await expect(
        service.scheduleDraft({
          actorContext: ownerActor,
          eventId
        })
      ).rejects.toThrowError(EventManagementError);

      const rejectedAudit = auditLogs.find((a) => a.result === 'REJECTED_INCOMPLETE_CONFIG');
      expect(rejectedAudit).toBeDefined();
    });
  });

  describe('Reglas de negocio: Restricción de estado y aislamiento', () => {
    it('solo permite programar eventos en estado DRAFT (EVENT_NOT_IN_DRAFT si ya está SCHEDULED)', async () => {
      const eventId = '66666666-6666-6666-6666-666666666666';
      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento ya programado',
        status: 'SCHEDULED',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: new Date('2026-11-01T15:00:00.000Z'),
        utc_offset_minutes: -300,
        expires_at: new Date('2026-12-01T15:00:00.000Z'),
        grace_ends_at: new Date('2026-12-08T15:00:00.000Z'),
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: false,
        guest_gallery_enabled: false,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      await expect(
        service.scheduleDraft({
          actorContext: ownerActor,
          eventId
        })
      ).rejects.toThrowError(EventManagementError);

      const rejectedAudit = auditLogs.find((a) => a.result === 'REJECTED_INVALID_STATE');
      expect(rejectedAudit).toBeDefined();
    });

    it('rechaza si el actor no es el propietario del borrador (UNAUTHORIZED)', async () => {
      const eventId = '77777777-7777-7777-7777-777777777777';
      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Ajeno',
        status: 'DRAFT',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: new Date('2026-11-01T15:00:00.000Z'),
        utc_offset_minutes: -300,
        expires_at: null,
        grace_ends_at: null,
        validity_duration_days: null,
        grace_days: null,
        uploads_enabled: false,
        guest_gallery_enabled: false,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      await expect(
        service.scheduleDraft({
          actorContext: otherActor,
          eventId
        })
      ).rejects.toThrowError(EventManagementError);

      const rejectedAudit = auditLogs.find((a) => a.result === 'REJECTED_UNAUTHORIZED');
      expect(rejectedAudit).toBeDefined();
    });
  });

  describe('Idempotencia determinista', () => {
    it('llamadas repetidas idénticas retornan IDEMPOTENT_REPLAY; cambio de parámetros da IDEMPOTENCY_CONFLICT', async () => {
      const eventId = '88888888-8888-8888-8888-888888888888';
      const scheduledAt = new Date('2026-11-01T15:00:00.000Z');
      const idempotencyKey = 'idem-schedule-key-1';

      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Idempotente',
        status: 'DRAFT',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: null,
        grace_ends_at: null,
        validity_duration_days: null,
        grace_days: null,
        uploads_enabled: false,
        guest_gallery_enabled: false,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      // Primera llamada: exitosa
      const first = await service.scheduleDraft({
        actorContext: ownerActor,
        eventId,
        validityDurationDays: 30,
        idempotencyKey
      });
      expect(first.outcome).toBe('SCHEDULED');

      // Segunda llamada: replay idéntico
      const replay = await service.scheduleDraft({
        actorContext: ownerActor,
        eventId,
        validityDurationDays: 30,
        idempotencyKey
      });
      expect(replay.outcome).toBe('IDEMPOTENT_REPLAY');

      // Tercera llamada: misma clave pero diferente vigencia -> conflicto
      await expect(
        service.scheduleDraft({
          actorContext: ownerActor,
          eventId,
          validityDurationDays: 90,
          idempotencyKey
        })
      ).rejects.toThrowError(EventManagementError);
    });
  });

  describe('EL-TK-064: activateEvent (Unit Tests)', () => {
    const scheduledAt = new Date('2026-11-01T15:00:00.000Z');
    const expiresAt = new Date('2026-12-01T15:00:00.000Z');
    const graceEndsAt = new Date('2026-12-08T15:00:00.000Z');

    it('Escenario 1: Activación manual anticipada pasa a ACTIVE conservando expiresAt y graceEndsAt anclados (DEC-077)', async () => {
      const eventId = '99999999-aaaa-bbbb-cccc-111111111111';
      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Anticipado',
        status: 'SCHEDULED',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: false,
        guest_gallery_enabled: false,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      const res = await service.activateEvent({
        actorContext: ownerActor,
        trigger: 'MANUAL_EARLY',
        eventId
      });

      expect(res.outcome).toBe('ACTIVATED');
      expect(res.event.status).toBe('ACTIVE');
      expect(res.event.activatedAt).toBeInstanceOf(Date);
      // REGLA CRÍTICA: no se desplaza el ancla de vencimiento
      expect(res.event.expiresAt?.toISOString()).toBe(expiresAt.toISOString());
      expect(res.event.graceEndsAt?.toISOString()).toBe(graceEndsAt.toISOString());

      const audit = auditLogs.find((a) => a.procedure === 'EVENT_ACTIVATED' && a.result === 'SUCCESS');
      expect(audit).toBeDefined();
    });

    it('Escenario 2: Activación automática por el scheduler pasa idempotentemente a ACTIVE', async () => {
      const eventId = '99999999-aaaa-bbbb-cccc-222222222222';
      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Scheduler',
        status: 'SCHEDULED',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: false,
        guest_gallery_enabled: false,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      const res = await service.activateEvent({
        trigger: 'SCHEDULED_AUTO',
        eventId
      });

      expect(res.outcome).toBe('ACTIVATED');
      expect(res.event.status).toBe('ACTIVE');
      expect(res.event.activatedAt).toBeDefined();
    });

    it('Escenario 3: Si el evento ya está ACTIVE, repetición devuelve IDEMPOTENT_REPLAY sin transición incompatible', async () => {
      const eventId = '99999999-aaaa-bbbb-cccc-333333333333';
      const activatedAt = new Date('2026-10-31T20:00:00.000Z');
      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Ya Activo',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: activatedAt,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: false,
        guest_gallery_enabled: false,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      const res = await service.activateEvent({
        actorContext: ownerActor,
        trigger: 'MANUAL_EARLY',
        eventId
      });

      expect(res.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(res.event.status).toBe('ACTIVE');
      expect(res.event.activatedAt?.toISOString()).toBe(activatedAt.toISOString());
    });

    it('Rechaza activación si el evento no está en SCHEDULED (EVENT_NOT_IN_SCHEDULED)', async () => {
      const eventId = '99999999-aaaa-bbbb-cccc-444444444444';
      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento en Borrador',
        status: 'DRAFT',
        timezone: 'America/Bogota',
        starts_at_local: null,
        scheduled_at: null,
        utc_offset_minutes: null,
        expires_at: null,
        grace_ends_at: null,
        activated_at: null,
        validity_duration_days: null,
        grace_days: null,
        uploads_enabled: false,
        guest_gallery_enabled: false,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      await expect(
        service.activateEvent({
          actorContext: ownerActor,
          trigger: 'MANUAL_EARLY',
          eventId
        })
      ).rejects.toThrowError(EventManagementError);
    });

    it('Rechaza activación manual si el actor no es el organizador propietario (UNAUTHORIZED)', async () => {
      const eventId = '99999999-aaaa-bbbb-cccc-555555555555';
      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Ajeno',
        status: 'SCHEDULED',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: false,
        guest_gallery_enabled: false,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      await expect(
        service.activateEvent({
          actorContext: otherActor,
          trigger: 'MANUAL_EARLY',
          eventId
        })
      ).rejects.toThrowError(EventManagementError);
    });
  });
});
