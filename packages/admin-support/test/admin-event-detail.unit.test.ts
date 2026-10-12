import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { AdminActorContext } from '@eventlens/identity';
import {
  AdminEventDetailService,
  type AdminCapacityPort,
  type AdminJobsPort,
  type AdminSupportAuditSink,
  type SqlTransaction,
  type TransactionRunner
} from '../src/index.js';

interface MockEventDetailDb {
  events: Map<string, any>;
  organizers: Map<string, any>;
}

function createMockRunner(db: MockEventDetailDb): TransactionRunner {
  return {
    async run<T>(callback: (tx: SqlTransaction) => Promise<T>): Promise<T> {
      const tx: SqlTransaction = {
        async query<R extends object = object>(sql: string, ...params: unknown[]): Promise<R[]> {
          const eventId = params[0] as string;
          const event = db.events.get(eventId);
          if (!event) return [] as R[];

          const organizer = db.organizers.get(event.organizer_id);

          return [
            {
              id: event.id,
              organizer_id: event.organizer_id,
              name: event.name,
              status: event.status,
              timezone: event.timezone,
              starts_at_local: event.starts_at_local,
              scheduled_at: event.scheduled_at,
              expires_at: event.expires_at,
              grace_ends_at: event.grace_ends_at,
              activated_at: event.activated_at,
              closed_at: event.closed_at,
              suspended_at: event.suspended_at,
              suspension_reason: event.suspension_reason,
              previous_status: event.previous_status,
              uploads_enabled: event.uploads_enabled,
              guest_gallery_enabled: event.guest_gallery_enabled,
              owner_id: organizer?.id ?? null,
              owner_email: organizer?.email ?? null,
              owner_status: organizer?.status ?? null,
              owner_declared_adult: organizer?.declared_adult ?? null,
              owner_created_at: organizer?.created_at ?? null
            }
          ] as unknown as R[];
        },
        async execute(): Promise<number> {
          return 0;
        }
      };
      return callback(tx);
    }
  };
}

function createValidAdminContext(): AdminActorContext {
  return {
    actorType: 'ADMIN_HUMAN',
    principalId: randomUUID(),
    identifier: 'admin@eventlens.test',
    sessionId: randomUUID(),
    authTime: new Date(),
    credentialRevision: 1n,
    adminAuthRevision: 1n,
    sessionWatermark: 1n,
    recoveryEpoch: 1n
  };
}

describe('EL-TK-147: AdminEventDetailService (Unit Tests)', () => {
  let db: MockEventDetailDb;
  let capacityPort: AdminCapacityPort;
  let jobsPort: AdminJobsPort;
  let auditSink: AdminSupportAuditSink;
  let service: AdminEventDetailService;
  let validAdminContext: AdminActorContext;

  const eventId = randomUUID();
  const orgId = randomUUID();

  beforeEach(() => {
    validAdminContext = createValidAdminContext();

    db = {
      events: new Map([
        [
          eventId,
          {
            id: eventId,
            organizer_id: orgId,
            name: 'Gala Anual de Fotografía',
            status: 'ACTIVE',
            timezone: 'America/Bogota',
            starts_at_local: '2026-11-20 18:00:00',
            scheduled_at: new Date('2026-11-20T23:00:00Z'),
            expires_at: new Date('2026-12-20T23:00:00Z'),
            grace_ends_at: new Date('2026-12-27T23:00:00Z'),
            activated_at: new Date('2026-11-20T23:00:00Z'),
            closed_at: null,
            suspended_at: null,
            suspension_reason: null,
            previous_status: null,
            uploads_enabled: true,
            guest_gallery_enabled: true
          }
        ]
      ]),
      organizers: new Map([
        [
          orgId,
          {
            id: orgId,
            email: 'organizador@galafoto.test',
            status: 'ACTIVE',
            declared_adult: true,
            created_at: new Date('2026-02-15T10:00:00Z')
          }
        ]
      ])
    };

    capacityPort = {
      getEventCapacity: vi.fn(async () => ({
        availability: 'AVAILABLE' as const,
        planCode: 'BETA_STANDARD',
        storageLimitBytes: '10737418240',
        storageUsedBytes: '2147483648',
        fileLimit: 1000,
        filesCount: 200
      }))
    };

    jobsPort = {
      getEventJobsSummary: vi.fn(async () => ({
        availability: 'AVAILABLE' as const,
        totalJobs: 25,
        activeJobs: 2,
        failedJobs: 1,
        deadJobs: 0
      }))
    };

    auditSink = {
      record: vi.fn(async () => {})
    };

    service = new AdminEventDetailService(
      createMockRunner(db),
      capacityPort,
      jobsPort,
      auditSink
    );
  });

  describe('Criterio 1: Detalle agregado completo y capacidades autorizadas', () => {
    it('Devuelve snapshot completo con overallAvailability COMPLETE cuando todos los módulos responden', async () => {
      const snapshot = await service.getEventDetail({
        actorContext: validAdminContext,
        eventId
      });

      expect(snapshot.eventId).toBe(eventId);
      expect(snapshot.name).toBe('Gala Anual de Fotografía');
      expect(snapshot.overallAvailability).toBe('COMPLETE');

      // Sección Owner
      expect(snapshot.owner.id).toBe(orgId);
      expect(snapshot.owner.email).toBe('organizador@galafoto.test');
      expect(snapshot.owner.status).toBe('ACTIVE');

      // Sección Lifecycle
      expect(snapshot.lifecycle.status).toBe('ACTIVE');
      expect(snapshot.lifecycle.timezone).toBe('America/Bogota');
      expect(snapshot.lifecycle.uploadsEnabled).toBe(true);

      // Sección Capacidad
      expect(snapshot.capacity.availability).toBe('AVAILABLE');
      expect(snapshot.capacity.planCode).toBe('BETA_STANDARD');
      expect(snapshot.capacity.storageUsedBytes).toBe('2147483648');

      // Sección Jobs
      expect(snapshot.jobs.availability).toBe('AVAILABLE');
      expect(snapshot.jobs.totalJobs).toBe(25);
      expect(snapshot.jobs.failedJobs).toBe(1);

      // Capacidades calculadas para evento ACTIVE
      expect(snapshot.capabilities.canClose).toBe(true);
      expect(snapshot.capabilities.canSuspend).toBe(true);
      expect(snapshot.capabilities.canExtendValidity).toBe(true);
      expect(snapshot.capabilities.canReactivate).toBe(false);
      expect(snapshot.capabilities.canReopen).toBe(false);

      // Sin previews de media (DEC-019/020)
      expect((snapshot as any).mediaItems).toBeUndefined();
      expect((snapshot as any).previews).toBeUndefined();
    });
  });

  describe('Criterio 2: Detalle parcial explícito ante downstream no disponible (sin falsos ceros)', () => {
    it('Marca capacity como UNAVAILABLE con motivo y overallAvailability PARTIAL si el servicio de capacidad falla', async () => {
      vi.mocked(capacityPort.getEventCapacity).mockRejectedValueOnce(
        new Error('Capacity service timeout after 5000ms')
      );

      const snapshot = await service.getEventDetail({
        actorContext: validAdminContext,
        eventId
      });

      expect(snapshot.overallAvailability).toBe('PARTIAL');
      expect(snapshot.capacity.availability).toBe('UNAVAILABLE');
      expect(snapshot.capacity.unavailableReason).toContain('Capacity service timeout');
      expect(snapshot.capacity.storageUsedBytes).toBeUndefined(); // NO muestra 0 falso
      expect(snapshot.capacity.filesCount).toBeUndefined();

      // Jobs sigue disponible normalmente
      expect(snapshot.jobs.availability).toBe('AVAILABLE');
    });

    it('Marca jobs como UNAVAILABLE si no hay puerto conectado o falla', async () => {
      const serviceNoJobs = new AdminEventDetailService(
        createMockRunner(db),
        capacityPort,
        undefined, // Sin jobs port
        auditSink
      );

      const snapshot = await serviceNoJobs.getEventDetail({
        actorContext: validAdminContext,
        eventId
      });

      expect(snapshot.overallAvailability).toBe('PARTIAL');
      expect(snapshot.jobs.availability).toBe('UNAVAILABLE');
      expect(snapshot.jobs.unavailableReason).toBe('Jobs integration not connected');
      expect(snapshot.jobs.totalJobs).toBeUndefined();
    });
  });

  describe('Criterio 3: Evento restringido o terminal limita capacidades autorizadas', () => {
    it('Evento en estado SUSPENDED permite reactivar pero bloquea suspensión y extensión de vigencia', async () => {
      db.events.get(eventId).status = 'SUSPENDED';
      db.events.get(eventId).suspension_reason = 'Investigación de soporte caso #402';

      const snapshot = await service.getEventDetail({
        actorContext: validAdminContext,
        eventId
      });

      expect(snapshot.lifecycle.status).toBe('SUSPENDED');
      expect(snapshot.lifecycle.suspensionReason).toBe('Investigación de soporte caso #402');
      expect(snapshot.capabilities.canReactivate).toBe(true);
      expect(snapshot.capabilities.canSuspend).toBe(false);
      expect(snapshot.capabilities.canExtendValidity).toBe(false);
      expect(snapshot.capabilities.canClose).toBe(false);
      expect(snapshot.capabilities.canInspectJobs).toBe(true);
      expect(snapshot.capabilities.canRequestMediaGrant).toBe(true);
    });

    it('Evento en estado PENDING_DELETION bloquea todas las mutaciones operativas (fail-closed)', async () => {
      db.events.get(eventId).status = 'PENDING_DELETION';

      const snapshot = await service.getEventDetail({
        actorContext: validAdminContext,
        eventId
      });

      expect(snapshot.lifecycle.status).toBe('PENDING_DELETION');
      expect(snapshot.capabilities.canSuspend).toBe(false);
      expect(snapshot.capabilities.canReactivate).toBe(false);
      expect(snapshot.capabilities.canExtendValidity).toBe(false);
      expect(snapshot.capabilities.canClose).toBe(false);
      expect(snapshot.capabilities.canReopen).toBe(false);
      expect(snapshot.capabilities.canInspectJobs).toBe(false);
      expect(snapshot.capabilities.canRequestMediaGrant).toBe(false);
      expect(snapshot.capabilities.canViewAudit).toBe(true); // Auditoría post-mortem permitida
    });
  });

  describe('Validaciones y control de permisos', () => {
    it('Rechaza si actorContext no es proporcionado (UNAUTHORIZED)', async () => {
      await expect(
        service.getEventDetail({
          actorContext: null as any,
          eventId
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('Rechaza si actorType no es ADMIN_HUMAN (UNAUTHORIZED)', async () => {
      await expect(
        service.getEventDetail({
          actorContext: { ...validAdminContext, actorType: 'ORGANIZER_HUMAN' as any },
          eventId
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('Rechaza si eventId no es un UUID válido (INVALID_ARGUMENT)', async () => {
      await expect(
        service.getEventDetail({
          actorContext: validAdminContext,
          eventId: 'not-a-valid-uuid'
        })
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('Rechaza si el evento no existe en base de datos (INVALID_ARGUMENT)', async () => {
      await expect(
        service.getEventDetail({
          actorContext: validAdminContext,
          eventId: randomUUID()
        })
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
  });

  describe('Observabilidad y auditoría', () => {
    it('Registra evento ADMIN_EVENT_DETAIL_VIEWED sin datos multimedia', async () => {
      await service.getEventDetail({
        actorContext: validAdminContext,
        eventId
      });

      expect(auditSink.record).toHaveBeenCalledWith(
        expect.objectContaining({
          procedure: 'ADMIN_EVENT_DETAIL_VIEWED',
          principalId: validAdminContext.principalId
        })
      );
    });
  });
});
