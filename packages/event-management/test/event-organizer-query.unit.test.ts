import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import type { OrganizerActorContext } from '@eventlens/identity';
import {
  EventDraftService,
  EventManagementError,
  type EventStatus,
  type ModerationMode
} from '../src/index.js';

interface TestDbEvent {
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
  activated_at: Date | null;
  closed_at: Date | null;
  purge_started_at: Date | null;
  suspended_at: Date | null;
  suspension_reason: string | null;
  previous_status: string | null;
  validity_duration_days: number | null;
  grace_days: number | null;
  uploads_enabled: boolean;
  guest_gallery_enabled: boolean;
  moderation_mode: string;
  pin_enabled: boolean;
  pin_hash: string | null;
  pin_salt: string | null;
  idempotency_key: string | null;
  idempotency_payload_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

describe('EL-TK-047: Consultar mis eventos y su configuración autorizada (Unit Tests)', () => {
  let eventsMap: Map<string, TestDbEvent>;
  let shouldFailDb = false;

  const mockRunner: TransactionRunner = {
    async run<R>(callback: (tx: SqlTransaction) => Promise<R>): Promise<R> {
      if (shouldFailDb) {
        throw new Error('DATABASE_CONNECTION_LOST');
      }

      const tx: SqlTransaction = {
        async query<T extends object>(sql: string, ...params: unknown[]): Promise<T[]> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // SELECT ... FROM event WHERE organizer_id = $1
          if (normalized.includes('FROM event WHERE organizer_id = $1')) {
            const orgId = params[0] as string;
            const results = Array.from(eventsMap.values())
              .filter((e) => e.organizer_id === orgId)
              .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
            return results as unknown as T[];
          }

          // SELECT ... FROM event WHERE id = $1
          if (normalized.includes('FROM event WHERE id = $1')) {
            const id = params[0] as string;
            const found = eventsMap.get(id);
            return found ? ([found] as unknown as T[]) : [];
          }

          throw new Error(`Unhandled mock SQL query: ${sql}`);
        },
        async execute(): Promise<number> {
          return 0;
        }
      };
      return callback(tx);
    }
  };

  const service = new EventDraftService(mockRunner);

  const organizerA: OrganizerActorContext = {
    actorType: 'ORGANIZER_HUMAN',
    accountId: randomUUID()
  };

  const organizerB: OrganizerActorContext = {
    actorType: 'ORGANIZER_HUMAN',
    accountId: randomUUID()
  };

  beforeEach(() => {
    eventsMap = new Map();
    shouldFailDb = false;
  });

  describe('listOrganizerEvents', () => {
    it('rechaza si el comando o actorContext no es válido', async () => {
      await expect(service.listOrganizerEvents(null as any)).rejects.toThrow(
        EventManagementError
      );

      await expect(
        service.listOrganizerEvents({
          actorContext: { actorType: 'GUEST_ANONYMOUS' as any, accountId: '123' }
        })
      ).rejects.toThrow(EventManagementError);

      await expect(
        service.listOrganizerEvents({
          actorContext: { actorType: 'ORGANIZER_HUMAN', accountId: '' }
        })
      ).rejects.toThrow(EventManagementError);
    });

    it('devuelve array vacío limpio si el organizador no tiene eventos (cero eventos no es error)', async () => {
      const res = await service.listOrganizerEvents({ actorContext: organizerA });
      expect(res).toEqual([]);
      expect(Array.isArray(res)).toBe(true);
    });

    it('devuelve únicamente eventos propios con aislamiento estricto multi-organizador', async () => {
      const event1: TestDbEvent = {
        id: randomUUID(),
        organizer_id: organizerA.accountId,
        name: 'Boda Ana y Juan',
        status: 'DRAFT',
        timezone: 'America/Bogota',
        starts_at_local: '2026-12-01T15:00:00',
        scheduled_at: new Date('2026-12-01T20:00:00Z'),
        utc_offset_minutes: -300,
        expires_at: null,
        grace_ends_at: null,
        activated_at: null,
        closed_at: null,
        purge_started_at: null,
        suspended_at: null,
        suspension_reason: null,
        previous_status: null,
        validity_duration_days: 14,
        grace_days: 7,
        uploads_enabled: false,
        guestGalleryEnabled: false,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: true,
        pin_hash: 'secret_hash_value',
        pin_salt: 'secret_salt_value',
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date('2026-10-10T10:00:00Z'),
        updated_at: new Date('2026-10-10T10:00:00Z')
      };

      const event2: TestDbEvent = {
        id: randomUUID(),
        organizer_id: organizerB.accountId,
        name: 'Evento ajeno de Organizador B',
        status: 'ACTIVE',
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
        validity_duration_days: 14,
        grace_days: 7,
        uploads_enabled: true,
        guestGalleryEnabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        pin_hash: null,
        pin_salt: null,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date('2026-10-11T10:00:00Z'),
        updated_at: new Date('2026-10-11T10:00:00Z')
      };

      eventsMap.set(event1.id, event1);
      eventsMap.set(event2.id, event2);

      const resA = await service.listOrganizerEvents({ actorContext: organizerA });
      expect(resA).toHaveLength(1);
      expect(resA[0].id).toBe(event1.id);
      expect(resA[0].name).toBe('Boda Ana y Juan');
      expect(resA[0].organizerId).toBe(organizerA.accountId);

      // Nunca debe exponer pin_hash ni pin_salt
      expect((resA[0] as any).pin_hash).toBeUndefined();
      expect((resA[0] as any).pin_salt).toBeUndefined();

      const resB = await service.listOrganizerEvents({ actorContext: organizerB });
      expect(resB).toHaveLength(1);
      expect(resB[0].id).toBe(event2.id);
      expect(resB[0].name).toBe('Evento ajeno de Organizador B');
    });

    it('falla ante error de base de datos sin retornar lista vacía ficticia', async () => {
      shouldFailDb = true;
      await expect(
        service.listOrganizerEvents({ actorContext: organizerA })
      ).rejects.toThrow('DATABASE_CONNECTION_LOST');
    });
  });

  describe('getAuthorizedConfiguration', () => {
    it('rechaza si el evento no existe o no tiene ID válido', async () => {
      await expect(
        service.getAuthorizedConfiguration({
          actorContext: organizerA,
          eventId: ''
        })
      ).rejects.toThrow(EventManagementError);

      await expect(
        service.getAuthorizedConfiguration({
          actorContext: organizerA,
          eventId: randomUUID()
        })
      ).rejects.toThrow(EventManagementError);
    });

    it('aplica no-revelación y error estable ante evento ajeno', async () => {
      const foreignEvent: TestDbEvent = {
        id: randomUUID(),
        organizer_id: organizerB.accountId,
        name: 'Evento ajeno',
        status: 'ACTIVE',
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
        validity_duration_days: 14,
        grace_days: 7,
        uploads_enabled: true,
        guestGalleryEnabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        pin_hash: null,
        pin_salt: null,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      };
      eventsMap.set(foreignEvent.id, foreignEvent);

      // Organizador A consulta evento de Organizador B
      await expect(
        service.getAuthorizedConfiguration({
          actorContext: organizerA,
          eventId: foreignEvent.id
        })
      ).rejects.toMatchObject({
        code: 'EVENT_NOT_FOUND'
      });
    });

    it('devuelve campos autorizados, revisión y capacidades según el estado del evento', async () => {
      const draftEvent: TestDbEvent = {
        id: randomUUID(),
        organizer_id: organizerA.accountId,
        name: 'Mi Borrador',
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
        validity_duration_days: 14,
        grace_days: 7,
        uploads_enabled: false,
        guestGalleryEnabled: false,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: true,
        pin_hash: 'hashed_secret',
        pin_salt: 'salt_secret',
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date('2026-10-10T12:00:00Z'),
        updated_at: new Date('2026-10-10T14:30:00Z')
      };
      eventsMap.set(draftEvent.id, draftEvent);

      const res = await service.getAuthorizedConfiguration({
        actorContext: organizerA,
        eventId: draftEvent.id
      });

      expect(res.event.id).toBe(draftEvent.id);
      expect(res.event.name).toBe('Mi Borrador');
      expect(res.event.status).toBe('DRAFT');
      expect(res.event.pinEnabled).toBe(true);

      // Cero secretos expuestos
      expect((res.event as any).pin_hash).toBeUndefined();
      expect((res.event as any).pin_salt).toBeUndefined();

      // Capacidades en DRAFT
      expect(res.capabilities.canEditSchedule).toBe(true);
      expect(res.capabilities.canEditSettings).toBe(true);
      expect(res.capabilities.canManageAccess).toBe(true);
      expect(res.capabilities.canPublishOrActivate).toBe(true);
      expect(res.capabilities.canViewLifecycle).toBe(true);
      expect(res.capabilities.canViewCapacity).toBe(true);

      expect(typeof res.revision).toBe('string');
      expect(res.revision.length).toBeGreaterThan(0);
    });

    it('calcula capacidades restrictivas para eventos ACTIVE, CLOSED y SUSPENDED', async () => {
      const activeEvent: TestDbEvent = {
        id: randomUUID(),
        organizer_id: organizerA.accountId,
        name: 'Evento Activo',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
        starts_at_local: '2026-10-10T00:00:00',
        scheduled_at: new Date(),
        utc_offset_minutes: -300,
        expires_at: new Date(Date.now() + 86400000),
        grace_ends_at: null,
        activated_at: new Date(),
        closed_at: null,
        purge_started_at: null,
        suspended_at: null,
        suspension_reason: null,
        previous_status: null,
        validity_duration_days: 14,
        grace_days: 7,
        uploads_enabled: true,
        guestGalleryEnabled: true,
        moderation_mode: 'AUTO_PUBLISH',
        pin_enabled: false,
        pin_hash: null,
        pin_salt: null,
        idempotency_key: null,
        idempotency_payload_hash: null,
        created_at: new Date(),
        updated_at: new Date()
      };
      eventsMap.set(activeEvent.id, activeEvent);

      const activeRes = await service.getAuthorizedConfiguration({
        actorContext: organizerA,
        eventId: activeEvent.id
      });

      expect(activeRes.capabilities.canEditSchedule).toBe(false); // No se reprograma evento activo
      expect(activeRes.capabilities.canEditSettings).toBe(true);
      expect(activeRes.capabilities.canManageAccess).toBe(true);
      expect(activeRes.capabilities.canPublishOrActivate).toBe(false);

      // Evento CLOSED
      const closedEvent = { ...activeEvent, id: randomUUID(), status: 'CLOSED' };
      eventsMap.set(closedEvent.id, closedEvent);
      const closedRes = await service.getAuthorizedConfiguration({
        actorContext: organizerA,
        eventId: closedEvent.id
      });
      expect(closedRes.capabilities.canEditSchedule).toBe(false);
      expect(closedRes.capabilities.canEditSettings).toBe(false);
      expect(closedRes.capabilities.canManageAccess).toBe(true);

      // Evento SUSPENDED
      const suspendedEvent = { ...activeEvent, id: randomUUID(), status: 'SUSPENDED' };
      eventsMap.set(suspendedEvent.id, suspendedEvent);
      const suspendedRes = await service.getAuthorizedConfiguration({
        actorContext: organizerA,
        eventId: suspendedEvent.id
      });
      expect(suspendedRes.capabilities.canEditSchedule).toBe(false);
      expect(suspendedRes.capabilities.canEditSettings).toBe(false);
      expect(suspendedRes.capabilities.canManageAccess).toBe(false);
    });
  });
});
