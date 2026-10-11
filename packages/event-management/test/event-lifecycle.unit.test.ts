import { describe, it, expect, beforeEach } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import type { OrganizerActorContext, AdminActorContext } from '@eventlens/identity';
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
  closed_at?: Date | null;
  purge_started_at?: Date | null;
  suspended_at?: Date | null;
  suspension_reason?: string | null;
  previous_status?: string | null;
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
        if (sql.includes('UPDATE event') && sql.includes('SET status = \'CLOSED\'')) {
          const closedAt = params[0] as Date;
          const idempotencyKey = params[1] as string | null;
          const payloadHash = params[2] as string | null;
          const updatedAt = params[3] as Date;
          const eventId = params[4] as string;

          const existing = this.events.get(eventId);
          if (existing) {
            existing.status = 'CLOSED';
            existing.closed_at = closedAt;
            if (idempotencyKey) existing.idempotency_key = idempotencyKey;
            if (payloadHash) existing.idempotency_payload_hash = payloadHash;
            existing.updated_at = updatedAt;
            return 1;
          }
        }
        if (sql.includes('UPDATE event') && sql.includes('SET status = \'ACTIVE\'') && sql.includes('closed_at = NULL')) {
          const idempotencyKey = params[0] as string | null;
          const payloadHash = params[1] as string | null;
          const updatedAt = params[2] as Date;
          const eventId = params[3] as string;

          const existing = this.events.get(eventId);
          if (existing) {
            existing.status = 'ACTIVE';
            existing.closed_at = null;
            if (idempotencyKey) existing.idempotency_key = idempotencyKey;
            if (payloadHash) existing.idempotency_payload_hash = payloadHash;
            existing.updated_at = updatedAt;
            return 1;
          }
        }
        if (sql.includes('UPDATE event') && sql.includes('SET status = \'GRACE_PERIOD\'')) {
          const updatedAt = params[0] as Date;
          const eventId = params[1] as string;

          const existing = this.events.get(eventId);
          if (existing) {
            existing.status = 'GRACE_PERIOD';
            existing.updated_at = updatedAt;
            return 1;
          }
        }
        if (sql.includes('UPDATE event') && sql.includes('SET status = \'PENDING_DELETION\'')) {
          const purgeStartedAt = params[0] as Date;
          const updatedAt = params[1] as Date;
          const eventId = params[2] as string;

          const existing = this.events.get(eventId);
          if (existing) {
            existing.status = 'PENDING_DELETION';
            existing.purge_started_at = existing.purge_started_at ?? purgeStartedAt;
            existing.updated_at = updatedAt;
            return 1;
          }
        }
        if (sql.includes('UPDATE event') && sql.includes('SET status = \'SUSPENDED\'')) {
          const previousStatus = params[0] as string;
          const suspensionReason = params[1] as string;
          const suspendedAt = params[2] as Date;
          const idempotencyKey = params[3] as string | null;
          const payloadHash = params[4] as string | null;
          const updatedAt = params[5] as Date;
          const eventId = params[6] as string;

          const existing = this.events.get(eventId);
          if (existing) {
            existing.status = 'SUSPENDED';
            existing.previous_status = previousStatus;
            existing.suspension_reason = suspensionReason;
            existing.suspended_at = suspendedAt;
            if (idempotencyKey) existing.idempotency_key = idempotencyKey;
            if (payloadHash) existing.idempotency_payload_hash = payloadHash;
            existing.updated_at = updatedAt;
            return 1;
          }
        }
        if (sql.includes('UPDATE event') && sql.includes('suspended_at = NULL')) {
          const targetStatus = params[0] as string;
          const purgeStartedAt = params[1] as Date | null;
          const activatedAt = params[2] as Date | null;
          const idempotencyKey = params[3] as string | null;
          const payloadHash = params[4] as string | null;
          const updatedAt = params[5] as Date;
          const eventId = params[6] as string;

          const existing = this.events.get(eventId);
          if (existing) {
            existing.status = targetStatus;
            existing.suspended_at = null;
            existing.suspension_reason = null;
            existing.previous_status = null;
            if (purgeStartedAt && !existing.purge_started_at) {
              existing.purge_started_at = purgeStartedAt;
            }
            if (activatedAt && !existing.activated_at) {
              existing.activated_at = activatedAt;
            }
            if (idempotencyKey) existing.idempotency_key = idempotencyKey;
            if (payloadHash) existing.idempotency_payload_hash = payloadHash;
            existing.updated_at = updatedAt;
            return 1;
          }
        }
        if (sql.includes('UPDATE event') && sql.includes('SET validity_duration_days = $1')) {
          const validityDurationDays = params[0] as number;
          const graceDays = params[1] as number;
          const expiresAt = params[2] as Date;
          const graceEndsAt = params[3] as Date;
          const status = params[4] as string;
          const idempotencyKey = params[5] as string | null;
          const payloadHash = params[6] as string | null;
          const updatedAt = params[7] as Date;
          const eventId = params[8] as string;

          const existing = this.events.get(eventId);
          if (existing) {
            existing.validity_duration_days = validityDurationDays;
            existing.grace_days = graceDays;
            existing.expires_at = expiresAt;
            existing.grace_ends_at = graceEndsAt;
            existing.status = status;
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

  const adminActor: AdminActorContext = {
    actorType: 'ADMIN_HUMAN',
    principalId: 'admin-principal-1',
    identifier: 'admin@eventlens.local',
    sessionId: 'admin-session-1',
    authTime: new Date(),
    credentialRevision: 1n,
    adminAuthRevision: 1n,
    sessionWatermark: 1n,
    recoveryEpoch: 1n
  };

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

  describe('EL-TK-065: EventLifecycleService.closeEvent (Unit Tests)', () => {
    const scheduledAt = new Date('2026-11-01T15:00:00.000Z');
    const expiresAt = new Date('2026-12-01T15:00:00.000Z');
    const graceEndsAt = new Date('2026-12-08T15:00:00.000Z');

    it('Cierra manualmente un evento en estado ACTIVE y preserva los vencimientos canónicos (DEC-077, DEC-082)', async () => {
      const eventId = '11111111-2222-3333-4444-555555555555';
      const activatedAt = new Date('2026-11-01T15:00:00.000Z');
      const closeTime = new Date('2026-11-15T12:00:00.000Z');

      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Boda Campestre',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: activatedAt,
        closed_at: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      const result = await service.closeEvent({
        actorContext: ownerActor,
        eventId,
        now: closeTime
      });

      expect(result.event.status).toBe('CLOSED');
      expect(result.event.closedAt).toEqual(closeTime);
      expect(result.event.expiresAt).toEqual(expiresAt);
      expect(result.event.graceEndsAt).toEqual(graceEndsAt);

      const inDb = eventsMap.get(eventId)!;
      expect(inDb.status).toBe('CLOSED');
      expect(inDb.closed_at).toEqual(closeTime);
      expect(inDb.expires_at).toEqual(expiresAt);
      expect(inDb.grace_ends_at).toEqual(graceEndsAt);

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].procedure).toBe('EVENT_CLOSED');
    });

    it('Rechaza el cierre manual si el evento ya expiró según el reloj canónico (EVENT_ALREADY_EXPIRED)', async () => {
      const eventId = '22222222-3333-4444-5555-666666666666';
      const expiredNow = new Date('2026-12-01T15:00:00.000Z'); // Exactamente expiresAt

      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Ya Vencido',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      await expect(
        service.closeEvent({
          actorContext: ownerActor,
          eventId,
          now: expiredNow
        })
      ).rejects.toMatchObject({
        code: 'EVENT_ALREADY_EXPIRED'
      });
    });

    it('Rechaza el cierre manual si el evento no está en estado ACTIVE (EVENT_NOT_ACTIVE)', async () => {
      const eventId = '33333333-4444-5555-6666-777777777777';

      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Programado',
        status: 'SCHEDULED',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: null,
        closed_at: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      await expect(
        service.closeEvent({
          actorContext: ownerActor,
          eventId
        })
      ).rejects.toMatchObject({
        code: 'EVENT_NOT_ACTIVE'
      });
    });

    it('Permite replay idempotente limpio con la misma clave y rechaza payload distinto', async () => {
      const eventId = '44444444-5555-6666-7777-888888888888';
      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Idempotente',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      const first = await service.closeEvent({
        actorContext: ownerActor,
        eventId,
        idempotencyKey: 'idem-close-1'
      });
      expect(first.event.status).toBe('CLOSED');
      expect(first.outcome).toBe('CLOSED');
      expect(auditLogs).toHaveLength(1);

      // Replay
      const second = await service.closeEvent({
        actorContext: ownerActor,
        eventId,
        idempotencyKey: 'idem-close-1'
      });
      expect(second.event.status).toBe('CLOSED');
      expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(auditLogs).toHaveLength(2);
      expect(auditLogs[1].result).toBe('IDEMPOTENT_REPLAY');

      // Conflicto: misma clave con otro eventId en memoria simulado
      const otherEventId = '55555555-6666-7777-8888-999999999999';
      eventsMap.set(otherEventId, {
        id: otherEventId,
        organizer_id: ownerActor.accountId,
        name: 'Otro Evento',
        status: 'CLOSED',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: 'idem-close-1',
        idempotency_payload_hash: 'different-hash',
        created_at: new Date(),
        updated_at: new Date()
      });

      await expect(
        service.closeEvent({
          actorContext: ownerActor,
          eventId: otherEventId,
          idempotencyKey: 'idem-close-1'
        })
      ).rejects.toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT'
      });
    });

    it('Rechaza el cierre manual si el actor no es el organizador propietario (UNAUTHORIZED)', async () => {
      const eventId = '66666666-7777-8888-9999-000000000000';
      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Ajeno',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      await expect(
        service.closeEvent({
          actorContext: otherActor,
          eventId
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED'
      });
    });
  });

  describe('EL-TK-066: EventLifecycleService.reopenEvent (Unit Tests)', () => {
    const scheduledAt = new Date('2026-11-01T15:00:00.000Z');
    const expiresAt = new Date('2026-12-01T15:00:00.000Z');
    const graceEndsAt = new Date('2026-12-08T15:00:00.000Z');

    it('Reabre un evento CLOSED aún vigente, pasando a ACTIVE y preservando el vencimiento canónico (DEC-077, DEC-082)', async () => {
      const eventId = '77777777-1111-2222-3333-444444444444';
      const activatedAt = new Date('2026-11-01T15:00:00.000Z');
      const closedAt = new Date('2026-11-10T12:00:00.000Z');
      const reopenTime = new Date('2026-11-12T09:00:00.000Z');

      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Boda Campestre',
        status: 'CLOSED',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: activatedAt,
        closed_at: closedAt,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      const result = await service.reopenEvent({
        actorContext: ownerActor,
        eventId,
        now: reopenTime
      });

      expect(result.event.status).toBe('ACTIVE');
      expect(result.outcome).toBe('REOPENED');
      expect(result.event.closedAt).toBeNull();
      expect(result.event.expiresAt).toEqual(expiresAt);
      expect(result.event.graceEndsAt).toEqual(graceEndsAt);

      const inDb = eventsMap.get(eventId)!;
      expect(inDb.status).toBe('ACTIVE');
      expect(inDb.closed_at).toBeNull();
      expect(inDb.expires_at).toEqual(expiresAt);
      expect(inDb.grace_ends_at).toEqual(graceEndsAt);

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].procedure).toBe('EVENT_REOPENED');
      expect(auditLogs[0].result).toBe('SUCCESS');
    });

    it('Rechaza la reapertura si el evento ya venció según el reloj canónico (EVENT_ALREADY_EXPIRED)', async () => {
      const eventId = '88888888-2222-3333-4444-555555555555';
      const expiredNow = new Date('2026-12-01T15:00:00.000Z'); // Exactamente expiresAt

      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Vencido',
        status: 'CLOSED',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: new Date('2026-11-15T00:00:00.000Z'),
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      await expect(
        service.reopenEvent({
          actorContext: ownerActor,
          eventId,
          now: expiredNow
        })
      ).rejects.toMatchObject({
        code: 'EVENT_ALREADY_EXPIRED'
      });
    });

    it('Rechaza la reapertura si el evento no está en estado CLOSED (EVENT_NOT_CLOSED)', async () => {
      const eventId = '99999999-3333-4444-5555-666666666666';

      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Activo',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      await expect(
        service.reopenEvent({
          actorContext: ownerActor,
          eventId
        })
      ).rejects.toMatchObject({
        code: 'EVENT_NOT_CLOSED'
      });
    });

    it('Permite replay limpio con la misma clave si ya quedó ACTIVE y rechaza payload inconsistente', async () => {
      const eventId = 'aaaaaaaa-4444-5555-6666-777777777777';
      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Para Reabrir Idempotente',
        status: 'CLOSED',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: new Date('2026-11-05T00:00:00.000Z'),
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      const first = await service.reopenEvent({
        actorContext: ownerActor,
        eventId,
        idempotencyKey: 'idem-reopen-1'
      });
      expect(first.event.status).toBe('ACTIVE');
      expect(first.outcome).toBe('REOPENED');
      expect(auditLogs).toHaveLength(1);

      // Replay
      const second = await service.reopenEvent({
        actorContext: ownerActor,
        eventId,
        idempotencyKey: 'idem-reopen-1'
      });
      expect(second.event.status).toBe('ACTIVE');
      expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(auditLogs).toHaveLength(2);
      expect(auditLogs[1].result).toBe('IDEMPOTENT_REPLAY');

      // Conflicto con misma clave y payload distinto en evento ya ACTIVE
      const otherEventId = 'bbbbbbbb-5555-6666-7777-888888888888';
      eventsMap.set(otherEventId, {
        id: otherEventId,
        organizer_id: ownerActor.accountId,
        name: 'Otro Evento',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: 'idem-reopen-1',
        idempotency_payload_hash: 'different-hash',
        created_at: new Date(),
        updated_at: new Date()
      });

      await expect(
        service.reopenEvent({
          actorContext: ownerActor,
          eventId: otherEventId,
          idempotencyKey: 'idem-reopen-1'
        })
      ).rejects.toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT'
      });
    });

    it('Rechaza la reapertura si el actor no es el organizador propietario (UNAUTHORIZED)', async () => {
      const eventId = 'cccccccc-6666-7777-8888-999999999999';
      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Ajeno',
        status: 'CLOSED',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: new Date('2026-11-05T00:00:00.000Z'),
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      await expect(
        service.reopenEvent({
          actorContext: otherActor,
          eventId
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED'
      });
    });
  });

  describe('EL-TK-067: EventLifecycleService.advanceTemporalLifecycle (Unit Tests)', () => {
    const scheduledAt = new Date('2026-11-01T15:00:00.000Z');
    const expiresAt = new Date('2026-12-01T15:00:00.000Z');
    const graceEndsAt = new Date('2026-12-08T15:00:00.000Z');

    it('Escenario 1: ACTIVE al vencer la vigencia avanza automáticamente a GRACE_PERIOD', async () => {
      const eventId = '11110000-aaaa-bbbb-cccc-111111111111';
      const now = new Date('2026-12-01T15:00:00.000Z'); // Exactamente expiresAt

      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Activo Que Vence',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: null,
        purge_started_at: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      const result = await service.advanceTemporalLifecycle({
        eventId,
        now,
        jobId: 'job-exp-1'
      });

      expect(result.previousStatus).toBe('ACTIVE');
      expect(result.outcome).toBe('TRANSITIONED_TO_GRACE_PERIOD');
      expect(result.event.status).toBe('GRACE_PERIOD');

      const inDb = eventsMap.get(eventId)!;
      expect(inDb.status).toBe('GRACE_PERIOD');

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].procedure).toBe('EVENT_TEMPORAL_ADVANCE');
      expect(auditLogs[0].result).toBe('TRANSITIONED_TO_GRACE_PERIOD');
    });

    it('Escenario 1 (CLOSED): CLOSED al vencer la vigencia avanza a GRACE_PERIOD', async () => {
      const eventId = '22220000-aaaa-bbbb-cccc-222222222222';
      const now = new Date('2026-12-02T10:00:00.000Z'); // Pasado expiresAt, antes de graceEndsAt

      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Cerrado Que Vence',
        status: 'CLOSED',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: new Date('2026-11-15T00:00:00.000Z'),
        purge_started_at: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      const result = await service.advanceTemporalLifecycle({
        eventId,
        now
      });

      expect(result.previousStatus).toBe('CLOSED');
      expect(result.outcome).toBe('TRANSITIONED_TO_GRACE_PERIOD');
      expect(result.event.status).toBe('GRACE_PERIOD');

      const inDb = eventsMap.get(eventId)!;
      expect(inDb.status).toBe('GRACE_PERIOD');
    });

    it('Escenario 2: Al vencer graceEndsAt transiciona a PENDING_DELETION y fija purge_started_at (DEC-092)', async () => {
      const eventId = '33330000-aaaa-bbbb-cccc-333333333333';
      const now = new Date('2026-12-08T15:00:00.000Z'); // Exactamente graceEndsAt

      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Fin de Gracia',
        status: 'GRACE_PERIOD',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: null,
        purge_started_at: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      const result = await service.advanceTemporalLifecycle({
        eventId,
        now,
        jobId: 'job-grace-1'
      });

      expect(result.previousStatus).toBe('GRACE_PERIOD');
      expect(result.outcome).toBe('TRANSITIONED_TO_PENDING_DELETION');
      expect(result.event.status).toBe('PENDING_DELETION');
      expect(result.event.purgeStartedAt).toEqual(now);

      const inDb = eventsMap.get(eventId)!;
      expect(inDb.status).toBe('PENDING_DELETION');
      expect(inDb.purge_started_at).toEqual(now);

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].procedure).toBe('EVENT_TEMPORAL_ADVANCE');
      expect(auditLogs[0].result).toBe('TRANSITIONED_TO_PENDING_DELETION');
    });

    it('Escenario 3: SUSPENDED atraviesa vencimiento o fin de gracia preservando barrera administrativa', async () => {
      const eventId = '44440000-aaaa-bbbb-cccc-444444444444';
      const now = new Date('2026-12-10T00:00:00.000Z'); // Pasado graceEndsAt

      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Suspendido por Investigación',
        status: 'SUSPENDED',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: null,
        purge_started_at: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      const result = await service.advanceTemporalLifecycle({
        eventId,
        now
      });

      expect(result.previousStatus).toBe('SUSPENDED');
      expect(result.outcome).toBe('SUSPENDED_PRESERVED');
      expect(result.event.status).toBe('SUSPENDED');

      const inDb = eventsMap.get(eventId)!;
      expect(inDb.status).toBe('SUSPENDED');

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].procedure).toBe('EVENT_TEMPORAL_ADVANCE');
      expect(auditLogs[0].result).toBe('SUSPENDED_PRESERVED');
    });

    it('Idempotencia determinista: ejecuciones repetidas o recuperadas retornan IDEMPOTENT_REPLAY sin retroceso', async () => {
      const eventId = '55550000-aaaa-bbbb-cccc-555555555555';
      const purgeDate = new Date('2026-12-08T15:00:00.000Z');
      const now = new Date('2026-12-09T00:00:00.000Z');

      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Ya en PENDING_DELETION',
        status: 'PENDING_DELETION',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: null,
        purge_started_at: purgeDate,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      const result = await service.advanceTemporalLifecycle({
        eventId,
        now
      });

      expect(result.previousStatus).toBe('PENDING_DELETION');
      expect(result.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(result.event.status).toBe('PENDING_DELETION');
      expect(result.event.purgeStartedAt).toEqual(purgeDate);
    });

    it('Evento vigente que no ha alcanzado expiresAt retorna NO_OP', async () => {
      const eventId = '66660000-aaaa-bbbb-cccc-666666666666';
      const now = new Date('2026-11-15T00:00:00.000Z'); // Antes de expiresAt

      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Aún Vigente',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: null,
        purge_started_at: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      const result = await service.advanceTemporalLifecycle({
        eventId,
        now
      });

      expect(result.outcome).toBe('NO_OP');
      expect(result.event.status).toBe('ACTIVE');
    });
  });

  describe('EL-TK-068: EventLifecycleService.suspendEvent (Unit Tests)', () => {
    const scheduledAt = new Date('2026-11-01T15:00:00.000Z');
    const expiresAt = new Date('2026-12-01T15:00:00.000Z');
    const graceEndsAt = new Date('2026-12-08T15:00:00.000Z');

    it('Escenario 1: Administrador suspende evento ACTIVE con motivo; registra previous_status y preserva vigencia (DEC-078)', async () => {
      const eventId = '11119999-aaaa-bbbb-cccc-111111111111';
      const suspensionTime = new Date('2026-11-15T12:00:00.000Z');
      const reason = 'Investigación preliminar de fraude y derechos';

      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Para Suspender',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: null,
        purge_started_at: null,
        suspended_at: null,
        suspension_reason: null,
        previous_status: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      const result = await service.suspendEvent({
        actorContext: adminActor,
        eventId,
        reason,
        now: suspensionTime
      });

      expect(result.event.status).toBe('SUSPENDED');
      expect(result.previousStatus).toBe('ACTIVE');
      expect(result.event.previousStatus).toBe('ACTIVE');
      expect(result.event.suspensionReason).toBe(reason);
      expect(result.event.suspendedAt).toEqual(suspensionTime);
      expect(result.event.expiresAt).toEqual(expiresAt);
      expect(result.event.graceEndsAt).toEqual(graceEndsAt);
      expect(result.outcome).toBe('SUSPENDED');

      const inDb = eventsMap.get(eventId)!;
      expect(inDb.status).toBe('SUSPENDED');
      expect(inDb.previous_status).toBe('ACTIVE');
      expect(inDb.suspension_reason).toBe(reason);
      expect(inDb.suspended_at).toEqual(suspensionTime);
      expect(inDb.expires_at).toEqual(expiresAt);

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].procedure).toBe('EVENT_SUSPENDED');
      expect(auditLogs[0].result).toBe('SUCCESS');
    });

    it('Escenario 2: Rechaza suspender un evento en estado terminal PENDING_DELETION (EVENT_TERMINAL)', async () => {
      const eventId = '22229999-aaaa-bbbb-cccc-222222222222';

      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Terminal',
        status: 'PENDING_DELETION',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: null,
        purge_started_at: new Date(),
        suspended_at: null,
        suspension_reason: null,
        previous_status: null,
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
        service.suspendEvent({
          actorContext: adminActor,
          eventId,
          reason: 'Intento de suspensión tardía'
        })
      ).rejects.toMatchObject({
        code: 'EVENT_TERMINAL'
      });
    });

    it('Rechaza la suspensión si el motivo está vacío o solo whitespace (SUSPENSION_REASON_REQUIRED)', async () => {
      const eventId = '33339999-aaaa-bbbb-cccc-333333333333';

      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Activo',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: null,
        purge_started_at: null,
        suspended_at: null,
        suspension_reason: null,
        previous_status: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      await expect(
        service.suspendEvent({
          actorContext: adminActor,
          eventId,
          reason: '   '
        })
      ).rejects.toMatchObject({
        code: 'SUSPENSION_REASON_REQUIRED'
      });
    });

    it('Rechaza la suspensión si el actor no es un administrador autorizado (UNAUTHORIZED)', async () => {
      const eventId = '44449999-aaaa-bbbb-cccc-444444444444';

      await expect(
        service.suspendEvent({
          actorContext: ownerActor as unknown as AdminActorContext,
          eventId,
          reason: 'Motivo desde organizador'
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED'
      });
    });

    it('Permite replay limpio de suspensión con la misma clave y rechaza payload inconsistente', async () => {
      const eventId = '55559999-aaaa-bbbb-cccc-555555555555';
      const reason = 'Reporte de contenido ilícito';
      const idempotencyKey = 'idem-suspend-1';

      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Para Suspender Idempotente',
        status: 'CLOSED',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: new Date('2026-11-10T00:00:00.000Z'),
        purge_started_at: null,
        suspended_at: null,
        suspension_reason: null,
        previous_status: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      const first = await service.suspendEvent({
        actorContext: adminActor,
        eventId,
        reason,
        idempotencyKey
      });
      expect(first.outcome).toBe('SUSPENDED');
      expect(first.previousStatus).toBe('CLOSED');
      expect(first.event.previousStatus).toBe('CLOSED');

      // Replay
      const second = await service.suspendEvent({
        actorContext: adminActor,
        eventId,
        reason,
        idempotencyKey
      });
      expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(second.previousStatus).toBe('CLOSED'); // Preserva el original

      // Reutilizar clave con motivo diferente -> conflicto
      await expect(
        service.suspendEvent({
          actorContext: adminActor,
          eventId,
          reason: 'Otro motivo diferente',
          idempotencyKey
        })
      ).rejects.toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT'
      });
    });
  });

  describe('EL-TK-069: EventLifecycleService.reactivateEvent (Unit Tests)', () => {
    it('Escenario 1: Reactiva evento dentro de vigencia restaurando ACTIVE, CLOSED o DRAFT (DEC-081)', async () => {
      const eventId = '11110000-0000-0000-0000-000000000001';
      const scheduledAt = new Date('2026-11-01T15:00:00.000Z');
      const expiresAt = new Date('2026-12-01T15:00:00.000Z');
      const graceEndsAt = new Date('2026-12-08T15:00:00.000Z');
      const reactivateNow = new Date('2026-11-15T12:00:00.000Z');

      // Caso ACTIVE
      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Suspendido Activo',
        status: 'SUSPENDED',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: null,
        purge_started_at: null,
        suspended_at: new Date('2026-11-10T00:00:00.000Z'),
        suspension_reason: 'Revisión preventiva',
        previous_status: 'ACTIVE',
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      const res = await service.reactivateEvent({
        actorContext: adminActor,
        eventId,
        now: reactivateNow
      });

      expect(res.outcome).toBe('REACTIVATED');
      expect(res.previousSuspendedStatus).toBe('SUSPENDED');
      expect(res.targetStatus).toBe('ACTIVE');
      expect(res.event.status).toBe('ACTIVE');
      expect(res.event.suspendedAt).toBeNull();
      expect(res.event.suspensionReason).toBeNull();
      expect(res.event.previousStatus).toBeNull();

      // Caso CLOSED (conserva cierre voluntario per DEC-081)
      const eventIdClosed = '11110000-0000-0000-0000-000000000002';
      eventsMap.set(eventIdClosed, {
        ...eventsMap.get(eventId)!,
        id: eventIdClosed,
        status: 'SUSPENDED',
        previous_status: 'CLOSED',
        closed_at: new Date('2026-11-05T00:00:00.000Z')
      });

      const resClosed = await service.reactivateEvent({
        actorContext: adminActor,
        eventId: eventIdClosed,
        now: reactivateNow
      });

      expect(resClosed.targetStatus).toBe('CLOSED');
      expect(resClosed.event.status).toBe('CLOSED');
      expect(resClosed.event.closedAt).toBeTruthy();

      // Caso DRAFT
      const eventIdDraft = '11110000-0000-0000-0000-000000000003';
      eventsMap.set(eventIdDraft, {
        ...eventsMap.get(eventId)!,
        id: eventIdDraft,
        status: 'SUSPENDED',
        previous_status: 'DRAFT',
        expires_at: null,
        grace_ends_at: null
      });

      const resDraft = await service.reactivateEvent({
        actorContext: adminActor,
        eventId: eventIdDraft,
        now: reactivateNow
      });

      expect(resDraft.targetStatus).toBe('DRAFT');
      expect(resDraft.event.status).toBe('DRAFT');
    });

    it('Escenario 2: Prevalecen GRACE_PERIOD y PENDING_DELETION si el vencimiento ocurrió durante la suspensión', async () => {
      const scheduledAt = new Date('2026-11-01T15:00:00.000Z');
      const expiresAt = new Date('2026-12-01T15:00:00.000Z');
      const graceEndsAt = new Date('2026-12-08T15:00:00.000Z');

      // Vencimiento transcurrido, dentro de gracia -> GRACE_PERIOD
      const eventIdGrace = '22220000-0000-0000-0000-000000000001';
      eventsMap.set(eventIdGrace, {
        id: eventIdGrace,
        organizer_id: ownerActor.accountId,
        name: 'Evento Vencido en Suspensión',
        status: 'SUSPENDED',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: null,
        purge_started_at: null,
        suspended_at: new Date('2026-11-10T00:00:00.000Z'),
        suspension_reason: 'Bloqueo temporal',
        previous_status: 'ACTIVE',
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      const resGrace = await service.reactivateEvent({
        actorContext: adminActor,
        eventId: eventIdGrace,
        now: new Date('2026-12-05T00:00:00.000Z') // Posterior a expiresAt, anterior a graceEndsAt
      });

      expect(resGrace.targetStatus).toBe('GRACE_PERIOD');
      expect(resGrace.event.status).toBe('GRACE_PERIOD');

      // Fin de gracia transcurrido -> PENDING_DELETION (fija purgeStartedAt)
      const eventIdPurge = '22220000-0000-0000-0000-000000000002';
      const purgeNow = new Date('2026-12-10T00:00:00.000Z'); // Posterior a graceEndsAt
      eventsMap.set(eventIdPurge, {
        ...eventsMap.get(eventIdGrace)!,
        id: eventIdPurge,
        status: 'SUSPENDED',
        previous_status: 'ACTIVE'
      });

      const resPurge = await service.reactivateEvent({
        actorContext: adminActor,
        eventId: eventIdPurge,
        now: purgeNow
      });

      expect(resPurge.targetStatus).toBe('PENDING_DELETION');
      expect(resPurge.event.status).toBe('PENDING_DELETION');
      expect(resPurge.event.purgeStartedAt).toEqual(purgeNow);
    });

    it('Escenario 3: SCHEDULED pasa a ACTIVE si la fecha de inicio llegó, o sigue SCHEDULED si aún es futuro', async () => {
      const scheduledAt = new Date('2026-11-01T15:00:00.000Z');
      const expiresAt = new Date('2026-12-01T15:00:00.000Z');
      const graceEndsAt = new Date('2026-12-08T15:00:00.000Z');

      const eventIdSched = '33330000-0000-0000-0000-000000000001';
      eventsMap.set(eventIdSched, {
        id: eventIdSched,
        organizer_id: ownerActor.accountId,
        name: 'Evento Programado Suspendido',
        status: 'SUSPENDED',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: null,
        closed_at: null,
        purge_started_at: null,
        suspended_at: new Date('2026-10-15T00:00:00.000Z'),
        suspension_reason: 'Revisión antes de comenzar',
        previous_status: 'SCHEDULED',
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      // Reactivación antes de la fecha de inicio -> sigue SCHEDULED
      const resFuture = await service.reactivateEvent({
        actorContext: adminActor,
        eventId: eventIdSched,
        now: new Date('2026-10-25T00:00:00.000Z')
      });
      expect(resFuture.targetStatus).toBe('SCHEDULED');
      expect(resFuture.event.status).toBe('SCHEDULED');
      expect(resFuture.event.activatedAt).toBeNull();

      // Volver a suspender para probar caso en que llegó la fecha de inicio
      eventsMap.set(eventIdSched, {
        ...eventsMap.get(eventIdSched)!,
        status: 'SUSPENDED',
        previous_status: 'SCHEDULED'
      });

      const activateNow = new Date('2026-11-02T10:00:00.000Z'); // Posterior a scheduledAt
      const resPast = await service.reactivateEvent({
        actorContext: adminActor,
        eventId: eventIdSched,
        now: activateNow
      });
      expect(resPast.targetStatus).toBe('ACTIVE');
      expect(resPast.event.status).toBe('ACTIVE');
      expect(resPast.event.activatedAt).toEqual(activateNow);
    });

    it('Rechaza reactivación si el actor no es un administrador autorizado (UNAUTHORIZED)', async () => {
      const eventId = '44440000-0000-0000-0000-000000000001';
      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Para Reactivar',
        status: 'SUSPENDED',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: new Date(),
        utc_offset_minutes: -300,
        expires_at: null,
        grace_ends_at: null,
        activated_at: null,
        closed_at: null,
        purge_started_at: null,
        suspended_at: new Date(),
        suspension_reason: 'Motivo',
        previous_status: 'DRAFT',
        validity_duration_days: null,
        grace_days: null,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      await expect(
        service.reactivateEvent({
          actorContext: ownerActor as unknown as AdminActorContext,
          eventId
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED'
      });
    });

    it('Rechaza reactivación si el evento no está en estado SUSPENDED (EVENT_NOT_SUSPENDED)', async () => {
      const eventId = '55550000-0000-0000-0000-000000000001';
      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento No Suspendido',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: new Date(),
        utc_offset_minutes: -300,
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
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      await expect(
        service.reactivateEvent({
          actorContext: adminActor,
          eventId
        })
      ).rejects.toMatchObject({
        code: 'EVENT_NOT_SUSPENDED'
      });
    });

    it('Idempotencia determinista: replay idéntico devuelve IDEMPOTENT_REPLAY; cambio de parámetros da conflicto', async () => {
      const eventId = '66660000-0000-0000-0000-000000000001';
      const idempotencyKey = 'reactivate-idemp-1';
      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Para Replay Reactivación',
        status: 'SUSPENDED',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: null,
        utc_offset_minutes: -300,
        expires_at: null,
        grace_ends_at: null,
        activated_at: null,
        closed_at: null,
        purge_started_at: null,
        suspended_at: new Date(),
        suspension_reason: 'Motivo',
        previous_status: 'DRAFT',
        validity_duration_days: null,
        grace_days: null,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      const first = await service.reactivateEvent({
        actorContext: adminActor,
        eventId,
        idempotencyKey
      });
      expect(first.outcome).toBe('REACTIVATED');
      expect(first.targetStatus).toBe('DRAFT');

      // Replay
      const second = await service.reactivateEvent({
        actorContext: adminActor,
        eventId,
        idempotencyKey
      });
      expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(second.targetStatus).toBe('DRAFT');
    });
  });

  describe('EL-TK-070: EventLifecycleService.extendEventValidity (Unit Tests)', () => {
    it('Escenario 1: Administrador aplica extensión autorizada recalculando timeline canónico desde el ancla (DEC-095, DEC-100)', async () => {
      const eventId = '77770000-0000-0000-0000-000000000001';
      const scheduledAt = new Date('2026-11-01T15:00:00.000Z');
      const expiresAt = new Date('2026-12-01T15:00:00.000Z');
      const graceEndsAt = new Date('2026-12-08T15:00:00.000Z');
      const now = new Date('2026-11-15T00:00:00.000Z');

      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Para Extender',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: null,
        purge_started_at: null,
        suspended_at: null,
        suspension_reason: null,
        previous_status: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      const res = await service.extendEventValidity({
        actorContext: adminActor,
        eventId,
        totalValidityDurationDays: 60,
        reason: 'Ampliación solicitada por patrocinador VIP',
        now
      });

      expect(res.outcome).toBe('EXTENDED');
      expect(res.previousStatus).toBe('ACTIVE');
      expect(res.event.validityDurationDays).toBe(60);
      // El nuevo expiresAt debe ser scheduledAt + 60 días físicos
      const expectedExpiresAt = new Date(scheduledAt.getTime() + 60 * 24 * 3600 * 1000);
      const expectedGraceEndsAt = new Date(expectedExpiresAt.getTime() + 7 * 24 * 3600 * 1000);
      expect(res.event.expiresAt).toEqual(expectedExpiresAt);
      expect(res.event.graceEndsAt).toEqual(expectedGraceEndsAt);
      expect(res.event.status).toBe('ACTIVE');

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].procedure).toBe('EVENT_VALIDITY_EXTENDED');
      expect(auditLogs[0].result).toBe('SUCCESS');
    });

    it('Escenario 2: Reconcilia evento en GRACE_PERIOD a ACTIVE o CLOSED si la ampliación lo devuelve a vigencia', async () => {
      const scheduledAt = new Date('2026-11-01T15:00:00.000Z');
      const expiresAt = new Date('2026-12-01T15:00:00.000Z');
      const graceEndsAt = new Date('2026-12-08T15:00:00.000Z');
      const now = new Date('2026-12-03T12:00:00.000Z'); // Está en GRACE_PERIOD

      // Caso 1: Estaba en GRACE_PERIOD sin closed_at -> reconcilia a ACTIVE
      const eventIdActive = '77770000-0000-0000-0000-000000000002';
      eventsMap.set(eventIdActive, {
        id: eventIdActive,
        organizer_id: ownerActor.accountId,
        name: 'Evento en Gracia Para Activar',
        status: 'GRACE_PERIOD',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: null,
        purge_started_at: null,
        suspended_at: null,
        suspension_reason: null,
        previous_status: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      const resActive = await service.extendEventValidity({
        actorContext: adminActor,
        eventId: eventIdActive,
        totalValidityDurationDays: 45, // Nueva expiración: 15 de diciembre
        reason: 'Extensión reactivadora',
        now
      });
      expect(resActive.previousStatus).toBe('GRACE_PERIOD');
      expect(resActive.event.status).toBe('ACTIVE');

      // Caso 2: Estaba en GRACE_PERIOD pero tenía closed_at -> reconcilia a CLOSED (conserva cierre voluntario)
      const eventIdClosed = '77770000-0000-0000-0000-000000000003';
      eventsMap.set(eventIdClosed, {
        ...eventsMap.get(eventIdActive)!,
        id: eventIdClosed,
        status: 'GRACE_PERIOD',
        closed_at: new Date('2026-11-20T00:00:00.000Z')
      });

      const resClosed = await service.extendEventValidity({
        actorContext: adminActor,
        eventId: eventIdClosed,
        totalValidityDurationDays: 45,
        reason: 'Extensión evento cerrado',
        now
      });
      expect(resClosed.previousStatus).toBe('GRACE_PERIOD');
      expect(resClosed.event.status).toBe('CLOSED');
    });

    it('Escenario 3: Rechaza ampliación en PENDING_DELETION (estado terminal incompatible per EL-EP-015)', async () => {
      const eventId = '77770000-0000-0000-0000-000000000004';
      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Terminal',
        status: 'PENDING_DELETION',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: new Date('2026-11-01T15:00:00.000Z'),
        utc_offset_minutes: -300,
        expires_at: new Date('2026-12-01T15:00:00.000Z'),
        grace_ends_at: new Date('2026-12-08T15:00:00.000Z'),
        activated_at: new Date('2026-11-01T15:00:00.000Z'),
        closed_at: null,
        purge_started_at: new Date('2026-12-08T15:00:00.000Z'),
        suspended_at: null,
        suspension_reason: null,
        previous_status: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      await expect(
        service.extendEventValidity({
          actorContext: adminActor,
          eventId,
          totalValidityDurationDays: 60,
          reason: 'Intento sobre terminal'
        })
      ).rejects.toMatchObject({
        code: 'EVENT_TERMINAL'
      });
    });

    it('Regla DEC-102: Después de ACTIVE bloquea reducciones o extensiones que dejen el vencimiento en el pasado', async () => {
      const eventId = '77770000-0000-0000-0000-000000000005';
      const scheduledAt = new Date('2026-11-01T15:00:00.000Z');
      const now = new Date('2026-11-20T00:00:00.000Z'); // 19 días después de inicio

      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Activo DEC-102',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: new Date('2026-12-01T15:00:00.000Z'),
        grace_ends_at: new Date('2026-12-08T15:00:00.000Z'),
        activated_at: scheduledAt,
        closed_at: null,
        purge_started_at: null,
        suspended_at: null,
        suspension_reason: null,
        previous_status: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      // Intento de fijar 10 días de vigencia desde el ancla (10 días dejaría el vencimiento el 11 de noviembre, en el pasado respecto a now = 20 de noviembre)
      await expect(
        service.extendEventValidity({
          actorContext: adminActor,
          eventId,
          totalValidityDurationDays: 10,
          reason: 'Reducción que deja vencimiento en el pasado',
          now
        })
      ).rejects.toMatchObject({
        code: 'INVALID_VALIDITY_EXTENSION'
      });
    });

    it('Rechaza si no se proporciona motivo justificado (EXTENSION_REASON_REQUIRED)', async () => {
      const eventId = '77770000-0000-0000-0000-000000000006';
      await expect(
        service.extendEventValidity({
          actorContext: adminActor,
          eventId,
          totalValidityDurationDays: 60,
          reason: '   '
        })
      ).rejects.toMatchObject({
        code: 'EXTENSION_REASON_REQUIRED'
      });
    });

    it('Rechaza si el actor no es un administrador autorizado (UNAUTHORIZED)', async () => {
      const eventId = '77770000-0000-0000-0000-000000000007';
      await expect(
        service.extendEventValidity({
          actorContext: ownerActor as unknown as AdminActorContext,
          eventId,
          totalValidityDurationDays: 60,
          reason: 'Intento organizador'
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED'
      });
    });

    it('Idempotencia determinista: replay idéntico devuelve IDEMPOTENT_REPLAY', async () => {
      const eventId = '77770000-0000-0000-0000-000000000008';
      const scheduledAt = new Date('2026-11-01T15:00:00.000Z');
      const idempotencyKey = 'extend-idemp-1';

      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Replay Extensión',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: new Date('2026-12-01T15:00:00.000Z'),
        grace_ends_at: new Date('2026-12-08T15:00:00.000Z'),
        activated_at: scheduledAt,
        closed_at: null,
        purge_started_at: null,
        suspended_at: null,
        suspension_reason: null,
        previous_status: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      const first = await service.extendEventValidity({
        actorContext: adminActor,
        eventId,
        totalValidityDurationDays: 60,
        reason: 'Extensión inicial',
        idempotencyKey
      });
      expect(first.outcome).toBe('EXTENDED');

      const replay = await service.extendEventValidity({
        actorContext: adminActor,
        eventId,
        totalValidityDurationDays: 60,
        reason: 'Extensión inicial',
        idempotencyKey
      });
      expect(replay.outcome).toBe('IDEMPOTENT_REPLAY');
    });
  });

  describe('EL-TK-071: EventLifecycleService.getLifecycleSnapshot (Unit Tests)', () => {
    it('Escenario 1: Administrador y organizador reciben snapshots con capacidades y campos respectivos', async () => {
      const eventId = '88880000-0000-0000-0000-000000000001';
      const scheduledAt = new Date('2026-11-01T15:00:00.000Z');
      const expiresAt = new Date('2026-12-01T15:00:00.000Z');
      const graceEndsAt = new Date('2026-12-08T15:00:00.000Z');
      const now = new Date('2026-11-15T00:00:00.000Z');

      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Para Snapshot',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: null,
        purge_started_at: null,
        suspended_at: null,
        suspension_reason: null,
        previous_status: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      // Admin consulta
      const adminSnap = await service.getLifecycleSnapshot({
        eventId,
        actorContext: adminActor,
        now
      });
      expect(adminSnap.status).toBe('ACTIVE');
      expect(adminSnap.capabilities.canClose).toBe(true);
      expect(adminSnap.capabilities.canSuspend).toBe(true);
      expect(adminSnap.capabilities.canExtendValidity).toBe(true);
      expect(adminSnap.capabilities.canUpload).toBe(false); // Admin no es uploader
      expect(adminSnap.organizerId).toBe(ownerActor.accountId);

      // Organizador propietario consulta
      const ownerSnap = await service.getLifecycleSnapshot({
        eventId,
        actorContext: ownerActor,
        now
      });
      expect(ownerSnap.status).toBe('ACTIVE');
      expect(ownerSnap.capabilities.canClose).toBe(true);
      expect(ownerSnap.capabilities.canSuspend).toBe(false); // No tiene permisos de admin
      expect(ownerSnap.capabilities.canExtendValidity).toBe(false);
      expect(ownerSnap.capabilities.canUpload).toBe(true);
      expect(ownerSnap.organizerId).toBe(ownerActor.accountId);
      expect(ownerSnap.suspendedAt).toBeUndefined(); // Campos internos ocultos para organizador
    });

    it('Escenario 2: Invitado consulta evento ACTIVE o CLOSED recibiendo solo disponibilidad pública', async () => {
      const eventId = '88880000-0000-0000-0000-000000000002';
      const scheduledAt = new Date('2026-11-01T15:00:00.000Z');
      const expiresAt = new Date('2026-12-01T15:00:00.000Z');
      const graceEndsAt = new Date('2026-12-08T15:00:00.000Z');
      const now = new Date('2026-11-15T00:00:00.000Z');

      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Público Invitado',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: null,
        purge_started_at: null,
        suspended_at: null,
        suspension_reason: null,
        previous_status: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      const guestSnap = await service.getLifecycleSnapshot({
        eventId,
        actorContext: { actorType: 'GUEST_ANONYMOUS' },
        now
      });

      expect(guestSnap.eventId).toBe(eventId);
      expect(guestSnap.name).toBe('Evento Público Invitado');
      expect(guestSnap.status).toBe('ACTIVE');
      expect(guestSnap.organizerId).toBeUndefined(); // Sin filtrar ID ni datos privados del organizador
      expect(guestSnap.capabilities.canUpload).toBe(true);
      expect(guestSnap.capabilities.canViewGuestGallery).toBe(true);
      expect(guestSnap.capabilities.canClose).toBe(false);
      expect(guestSnap.capabilities.canSchedule).toBe(false);
    });

    it('No enumeración: Invitado recibe EVENT_NOT_FOUND para borradores o eventos terminales', async () => {
      const eventIdDraft = '88880000-0000-0000-0000-000000000003';
      eventsMap.set(eventIdDraft, {
        id: eventIdDraft,
        organizer_id: ownerActor.accountId,
        name: 'Evento Borrador Oculto',
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
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      await expect(
        service.getLifecycleSnapshot({
          eventId: eventIdDraft,
          actorContext: { actorType: 'GUEST_ANONYMOUS' }
        })
      ).rejects.toMatchObject({
        code: 'EVENT_NOT_FOUND'
      });
    });

    it('No enumeración: Organizador ajeno recibe EVENT_NOT_FOUND para eventos que no le pertenecen', async () => {
      const eventId = '88880000-0000-0000-0000-000000000004';
      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Privado de Propietario',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: new Date(),
        utc_offset_minutes: -300,
        expires_at: new Date(),
        grace_ends_at: new Date(),
        activated_at: new Date(),
        closed_at: null,
        purge_started_at: null,
        suspended_at: null,
        suspension_reason: null,
        previous_status: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      await expect(
        service.getLifecycleSnapshot({
          eventId,
          actorContext: otherActor // Organizador ajeno
        })
      ).rejects.toMatchObject({
        code: 'EVENT_NOT_FOUND'
      });
    });

    it('Evalúa vigencia temporal para canReopen: true si no ha vencido, false si ya venció', async () => {
      const eventId = '88880000-0000-0000-0000-000000000005';
      const scheduledAt = new Date('2026-11-01T15:00:00.000Z');
      const expiresAt = new Date('2026-12-01T15:00:00.000Z');
      const graceEndsAt = new Date('2026-12-08T15:00:00.000Z');

      eventsMap.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Evento Cerrado Temporal',
        status: 'CLOSED',
        timezone: 'America/Bogota',
        starts_at_local: '2026-11-01T10:00:00',
        scheduled_at: scheduledAt,
        utc_offset_minutes: -300,
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activated_at: scheduledAt,
        closed_at: new Date('2026-11-10T00:00:00.000Z'),
        purge_started_at: null,
        suspended_at: null,
        suspension_reason: null,
        previous_status: null,
        validity_duration_days: 30,
        grace_days: 7,
        uploads_enabled: true,
        guest_gallery_enabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      // Dentro de vigencia -> canReopen = true
      const validSnap = await service.getLifecycleSnapshot({
        eventId,
        actorContext: ownerActor,
        now: new Date('2026-11-15T00:00:00.000Z')
      });
      expect(validSnap.capabilities.canReopen).toBe(true);

      // Fuera de vigencia -> canReopen = false
      const expiredSnap = await service.getLifecycleSnapshot({
        eventId,
        actorContext: ownerActor,
        now: new Date('2026-12-02T00:00:00.000Z')
      });
      expect(expiredSnap.capabilities.canReopen).toBe(false);
    });
  });
});
