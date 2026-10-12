import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { AdminActorContext } from '@eventlens/identity';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  AdminSearchService,
  AdminEventDetailService,
  AdminJobActionService,
  AdminMediaGrantService,
  AdminInterventionOrchestrator,
  AdminSupportError,
  type AdminSupportAuditSink,
  type AdminSupportAuditEvent,
  type MediaGrantSigner,
  type AdminLifecyclePort,
  type AdminAccessPort,
  type AdminCapacityOverridePort,
  type AdminCapacityPort,
  type AdminJobsPort,
  type AdminInvitationsPort,
  type AdminCapacityRequestsPort,
  type AdminReportsPort,
} from '../src/index.js';

interface InMemoryAdminE2eDb {
  events: Map<string, {
    id: string;
    organizer_id: string;
    name: string;
    status: string;
    timezone: string;
    starts_at_local: string | null;
    scheduled_at: Date | null;
    expires_at: Date | null;
    grace_ends_at: Date | null;
    activated_at: Date | null;
    closed_at: Date | null;
    suspended_at: Date | null;
    suspension_reason: string | null;
    previous_status: string | null;
    uploads_enabled: boolean;
    guest_gallery_enabled: boolean;
    created_at: Date;
  }>;
  organizers: Map<string, {
    id: string;
    email: string;
    status: string;
    declared_adult: boolean;
    created_at: Date;
  }>;
  mediaCatalog: Map<string, {
    media_ref: string;
    event_ref: string;
    status: string;
    original: unknown;
  }>;
  derivatives: Map<string, Array<{
    role: string;
    reference: unknown;
  }>>;
  grants: Map<string, unknown>;
  jobs: Map<string, {
    id: string;
    status: string;
    cancelled: boolean;
    lease_until: Date | null;
  }>;
  receipts: Map<string, {
    id: string;
    job_id: string;
    action: string;
    reason: string;
    principal_id: string;
    idempotency_key: string;
    previous_status: string;
    new_status: string;
    created_at: Date;
  }>;
}

function createE2eDb(): InMemoryAdminE2eDb {
  return {
    events: new Map(),
    organizers: new Map(),
    mediaCatalog: new Map(),
    derivatives: new Map(),
    grants: new Map(),
    jobs: new Map(),
    receipts: new Map(),
  };
}

function createE2eTransactionRunner(db: InMemoryAdminE2eDb): TransactionRunner {
  return {
    async run<T>(callback: (tx: SqlTransaction) => Promise<T>): Promise<T> {
      const tx: SqlTransaction = {
        async query<R extends object = object>(sql: string, ...params: unknown[]): Promise<R[]> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // 1. Detalle agregado de evento
          if (normalized.includes('FROM event e') && normalized.includes('LEFT JOIN organizer_account o')) {
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
                owner_created_at: organizer?.created_at ?? null,
              },
            ] as unknown as R[];
          }

          // 2. Media catalog queries
          if (normalized.includes('FROM media_catalog WHERE media_ref = $1 OR media_ref = $2')) {
            const ref1 = params[0] as string;
            const ref2 = params[1] as string;
            const found = db.mediaCatalog.get(ref1) || db.mediaCatalog.get(ref2);
            if (!found) return [] as R[];
            return [found] as unknown as R[];
          }

          // 3. Media derivatives
          if (normalized.includes('FROM media_active_derivative WHERE media_ref = $1')) {
            const ref = params[0] as string;
            const items = db.derivatives.get(ref) || [];
            return items as unknown as R[];
          }

          // 4. Job queries
          if (normalized.includes('FROM job_queue WHERE id = $1 FOR UPDATE')) {
            const id = params[0] as string;
            const j = db.jobs.get(id);
            if (!j) return [] as R[];
            return [
              {
                id: j.id,
                status: j.status,
                cancelled: j.cancelled,
                lease_until: j.lease_until,
              },
            ] as unknown as R[];
          }

          // 5. Job action receipt
          if (normalized.includes('FROM admin_job_action_receipt WHERE idempotency_key = $1')) {
            const key = params[0] as string;
            const r = db.receipts.get(key);
            if (!r) return [] as R[];
            return [r] as unknown as R[];
          }

          return [] as R[];
        },

        async execute(sql: string, ...params: unknown[]): Promise<number> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // Inserción de grant de media
          if (normalized.includes('INSERT INTO admin_media_grant')) {
            const id = params[0] as string;
            db.grants.set(id, params);
            return 1;
          }

          // Actualización de job
          if (normalized.includes('UPDATE job_queue')) {
            const id = params[params.length - 1] as string;
            const job = db.jobs.get(id);
            if (job) {
              if (normalized.includes("status = 'PENDING'")) job.status = 'PENDING';
              if (normalized.includes("status = 'CANCELLED'")) {
                job.status = 'CANCELLED';
                job.cancelled = true;
              }
              if (normalized.includes("status = 'DEAD'")) job.status = 'DEAD';
              return 1;
            }
            return 0;
          }

          // Inserción de recibo de acción de job
          if (normalized.includes('INSERT INTO admin_job_action_receipt')) {
            const receipt = {
              id: params[0] as string,
              job_id: params[1] as string,
              action: params[2] as string,
              reason: params[3] as string,
              principal_id: params[4] as string,
              idempotency_key: params[5] as string,
              previous_status: params[6] as string,
              new_status: params[7] as string,
              created_at: params[8] as Date,
            };
            db.receipts.set(receipt.idempotency_key, receipt);
            return 1;
          }

          return 0;
        },
      };

      return callback(tx);
    },
  };
}

describe('End-to-End Admin Support Console & Interventions Suite (EL-TK-155 — EL-EP-012)', () => {
  let db: InMemoryAdminE2eDb;
  let txRunner: TransactionRunner;
  let auditEvents: AdminSupportAuditEvent[];
  let auditSink: AdminSupportAuditSink;
  let mockSigner: MediaGrantSigner;

  let mediaGrantService: AdminMediaGrantService;
  let interventionOrchestrator: AdminInterventionOrchestrator;
  let jobActionService: AdminJobActionService;
  let eventDetailService: AdminEventDetailService;

  let lifecyclePort: AdminLifecyclePort;
  let accessPort: AdminAccessPort;
  let capacityOverridePort: AdminCapacityOverridePort;
  let capacityPort: AdminCapacityPort;
  let jobsPort: AdminJobsPort;
  let invitationsPort: AdminInvitationsPort;
  let capacityRequestsPort: AdminCapacityRequestsPort;
  let reportsPort: AdminReportsPort;

  const adminActor: AdminActorContext = {
    actorType: 'ADMIN_HUMAN',
    principalId: 'adm-usr-42',
    sessionId: 'sess-adm-999',
  };

  const eventId = '11111111-1111-1111-1111-111111111111';
  const organizerId = '22222222-2222-2222-2222-222222222222';
  const mediaId = '33333333-3333-3333-3333-333333333333';
  const otherEventId = '44444444-4444-4444-4444-444444444444';

  beforeEach(() => {
    db = createE2eDb();
    txRunner = createE2eTransactionRunner(db);

    auditEvents = [];
    auditSink = {
      record: vi.fn(async (event: AdminSupportAuditEvent) => {
        auditEvents.push(event);
      }),
    };

    mockSigner = {
      signDownloadUrl: vi.fn(async (key: string, ttlSeconds: number) => {
        return `https://cdn.eventlens.local/signed/${key}?exp=${Date.now() + ttlSeconds * 1000}&sig=valid_token`;
      }),
    };

    // Poblamos evento y organizador base
    db.events.set(eventId, {
      id: eventId,
      organizer_id: organizerId,
      name: 'Boda Campestre 2026',
      status: 'ACTIVE',
      timezone: 'America/Bogota',
      starts_at_local: '2026-10-15 16:00',
      scheduled_at: new Date('2026-10-15T21:00:00Z'),
      expires_at: new Date('2026-11-15T21:00:00Z'),
      grace_ends_at: new Date('2026-11-20T21:00:00Z'),
      activated_at: new Date('2026-10-01T10:00:00Z'),
      closed_at: null,
      suspended_at: null,
      suspension_reason: null,
      previous_status: null,
      uploads_enabled: true,
      guest_gallery_enabled: true,
      created_at: new Date('2026-09-01T10:00:00Z'),
    });

    db.organizers.set(organizerId, {
      id: organizerId,
      email: 'organizador@eventos.com',
      status: 'ACTIVE',
      declared_adult: true,
      created_at: new Date('2026-01-01T00:00:00Z'),
    });

    // Activo multimedia perteneciente a este evento
    db.mediaCatalog.set(mediaId, {
      media_ref: mediaId,
      event_ref: eventId,
      status: 'CONFIRMED',
      original: {
        storage_key: `events/${eventId}/originals/${mediaId}.jpg`,
      },
    });

    db.derivatives.set(mediaId, [
      {
        role: 'PREVIEW',
        reference: {
          key: `events/${eventId}/derivatives/${mediaId}_grid.webp`,
        },
      },
      {
        role: 'DETAIL',
        reference: {
          key: `events/${eventId}/derivatives/${mediaId}_detail.webp`,
        },
      },
    ]);

    // Puertos de dominio mockeados para orquestación e intervenciones
    lifecyclePort = {
      suspendEvent: vi.fn(async (p) => ({
        outcome: 'EXECUTED',
        previousStatus: 'ACTIVE',
        newStatus: 'SUSPENDED',
        suspendedAt: new Date().toISOString(),
      })),
      reactivateEvent: vi.fn(async (p) => ({
        outcome: 'EXECUTED',
        previousStatus: 'SUSPENDED',
        newStatus: 'ACTIVE',
        reactivatedAt: new Date().toISOString(),
      })),
      extendEventValidity: vi.fn(async (p) => ({
        outcome: 'EXECUTED',
        previousStatus: 'ACTIVE',
        newStatus: 'ACTIVE',
        newExpiresAt: new Date(Date.now() + p.extensionDays * 86400000).toISOString(),
        extendedAt: new Date().toISOString(),
      })),
      closeEvent: vi.fn(async (p) => ({
        outcome: 'EXECUTED',
        previousStatus: 'ACTIVE',
        newStatus: 'CLOSED',
        closedAt: new Date().toISOString(),
      })),
    };

    accessPort = {
      revokeAllGuestSessions: vi.fn(async (p) => ({
        outcome: 'EXECUTED',
        eventId: p.eventId,
        revokedSessionsCount: 15,
        revokedAt: new Date().toISOString(),
      })),
    };

    capacityOverridePort = {
      applyCapacityOverride: vi.fn(async (p) => ({
        outcome: 'EXECUTED',
        eventId: p.eventId,
        overrideId: randomUUID(),
        appliedAt: new Date().toISOString(),
      })),
    };

    // Puertos downstream para detalle agregado
    capacityPort = {
      getEventCapacity: vi.fn(async (_id) => ({
        availability: 'AVAILABLE',
        planCode: 'BETA_BASE',
        storageLimitBytes: '10737418240',
        storageUsedBytes: '2147483648',
        fileLimit: 1000,
        filesCount: 150,
      })),
    };

    jobsPort = {
      getEventJobsSummary: vi.fn(async (_id) => ({
        availability: 'AVAILABLE',
        totalJobs: 3,
        activeJobs: 0,
        failedJobs: 0,
        deadJobs: 0,
      })),
    };

    invitationsPort = {
      getOrganizerInvitation: vi.fn(async (_id) => ({
        availability: 'AVAILABLE',
        invitationCode: 'INV-VIP-999',
        status: 'USED',
        issuedAt: new Date().toISOString(),
        usedAt: new Date().toISOString(),
      })),
    };

    capacityRequestsPort = {
      getEventCapacityRequests: vi.fn(async (_id) => ({
        availability: 'AVAILABLE',
        requests: [],
      })),
    };

    reportsPort = {
      getEventReportsSummary: vi.fn(async (_id) => ({
        availability: 'AVAILABLE',
        totalReports: 0,
        pendingReports: 0,
        reports: [],
      })),
    };

    mediaGrantService = new AdminMediaGrantService(txRunner, mockSigner, auditSink);
    interventionOrchestrator = new AdminInterventionOrchestrator(
      lifecyclePort,
      accessPort,
      capacityOverridePort,
      auditSink
    );
    jobActionService = new AdminJobActionService(txRunner, auditSink);
    eventDetailService = new AdminEventDetailService(
      txRunner,
      capacityPort,
      jobsPort,
      auditSink,
      invitationsPort,
      capacityRequestsPort,
      reportsPort
    );
  });

  describe('Escenario 1: Acceso multimedia justificado y denegación sin motivo (DEC-019, DEC-020, DEC-027, DEC-038)', () => {
    it('deniega acceso cuando el admin no proporciona motivo o este es solo espacios en blanco', async () => {
      // 1. Intento sin motivo
      await expect(
        mediaGrantService.requestGrant({
          actorContext: adminActor,
          eventId,
          mediaId,
          purpose: 'INCIDENT_INVESTIGATION',
          reason: '',
        })
      ).rejects.toThrowError(AdminSupportError);

      // 2. Intento con espacios en blanco
      await expect(
        mediaGrantService.requestGrant({
          actorContext: adminActor,
          eventId,
          mediaId,
          purpose: 'SUPPORT_REQUEST',
          reason: '    ',
        })
      ).rejects.toThrowError(AdminSupportError);

      // Verificamos que no se emitió ningún grant ni auditoría de concesión
      expect(db.grants.size).toBe(0);
      expect(auditEvents.length).toBe(0);
    });

    it('deniega acceso a solicitudes realizadas por actores no autorizados o sin principalId', async () => {
      const unauthorizedActor = {
        actorType: 'ORGANIZER_HUMAN',
        principalId: 'org-usr-01',
      } as unknown as AdminActorContext;

      await expect(
        mediaGrantService.requestGrant({
          actorContext: unauthorizedActor,
          eventId,
          mediaId,
          purpose: 'SUPPORT_REQUEST',
          reason: 'Organizador intentando usar endpoint administrativo',
        })
      ).rejects.toThrowError(AdminSupportError);

      expect(db.grants.size).toBe(0);
    });

    it('deniega acceso cuando el activo multimedia no pertenece al evento especificado (CROSS_EVENT_MISMATCH)', async () => {
      await expect(
        mediaGrantService.requestGrant({
          actorContext: adminActor,
          eventId: otherEventId, // Evento diferente al asignado al mediaId
          mediaId,
          purpose: 'LEGAL_OR_SAFETY',
          reason: 'Auditoría legal de evento equivocado',
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: 'CROSS_EVENT_MISMATCH',
        })
      );

      expect(db.grants.size).toBe(0);
    });

    it('concede MediaViewGrant temporal firmado cuando la justificación es válida y registra auditoría inmutable', async () => {
      const grant = await mediaGrantService.requestGrant({
        actorContext: adminActor,
        eventId,
        mediaId,
        purpose: 'INCIDENT_INVESTIGATION',
        reason: 'Reporte de foto corrupta ticket #SUP-8841',
        preferredTarget: 'PREVIEW',
        ttlSeconds: 900,
      });

      // 1. Verificación del grant retornado
      expect(grant.grantId).toBeDefined();
      expect(grant.eventId).toBe(eventId);
      expect(grant.mediaId).toBe(mediaId);
      expect(grant.purpose).toBe('INCIDENT_INVESTIGATION');
      expect(grant.targetKind).toBe('PREVIEW');
      expect(grant.downloadUrl).toContain('https://cdn.eventlens.local/signed/');
      expect(grant.downloadUrl).toContain('sig=valid_token');
      expect(grant.grantedTo).toBe(adminActor.principalId);

      // 2. Persistencia en la tabla de grants
      expect(db.grants.size).toBe(1);

      // 3. Auditoría registrada en el sink inmutable
      expect(auditEvents.length).toBe(1);
      const audit = auditEvents[0];
      expect(audit.procedure).toBe('ADMIN_MEDIA_ACCESS_GRANTED');
      expect(audit.principalId).toBe(adminActor.principalId);
      expect(audit.details).toContain(grant.grantId);
      expect(audit.details).toContain('INCIDENT_INVESTIGATION');
    });
  });

  describe('Escenario 2: Ejecución de intervenciones permitidas con validación de dominio dueño y auditoría (Q-017, DEC-020)', () => {
    it('ejecuta suspensión de evento delegando en el dominio dueño y registrando auditoría', async () => {
      const result = await interventionOrchestrator.executeIntervention({
        actorContext: adminActor,
        eventId,
        interventionType: 'SUSPEND_EVENT',
        reason: 'Investigación por violación de términos de servicio',
        idempotencyKey: 'idem-susp-001',
      });

      expect(result.outcome).toBe('EXECUTED');
      expect(result.interventionType).toBe('SUSPEND_EVENT');
      expect(result.eventId).toBe(eventId);
      expect(lifecyclePort.suspendEvent).toHaveBeenCalledTimes(1);

      // Auditoría registrada
      expect(auditEvents.length).toBe(1);
      expect(auditEvents[0].procedure).toBe('ADMIN_INTERVENTION_ORCHESTRATED');
      expect(auditEvents[0].principalId).toBe(adminActor.principalId);
      expect(auditEvents[0].details).toContain('SUSPEND_EVENT');
    });

    it('reproduce repetición idempotente sin re-ejecutar efectos colaterales en el dominio dueño', async () => {
      lifecyclePort.suspendEvent = vi
        .fn()
        .mockResolvedValueOnce({
          outcome: 'EXECUTED',
          eventId,
          status: 'SUSPENDED',
        })
        .mockResolvedValueOnce({
          outcome: 'IDEMPOTENT_REPLAY',
          eventId,
          status: 'SUSPENDED',
        });

      // Primera ejecución
      const firstRun = await interventionOrchestrator.executeIntervention({
        actorContext: adminActor,
        eventId,
        interventionType: 'SUSPEND_EVENT',
        reason: 'Contención de fuga de enlaces compartidos',
        idempotencyKey: 'idem-susp-123',
      });
      expect(firstRun.outcome).toBe('EXECUTED');
      expect(lifecyclePort.suspendEvent).toHaveBeenCalledTimes(1);

      // Segunda ejecución con la misma idempotencyKey -> IDEMPOTENT_REPLAY
      const replay = await interventionOrchestrator.executeIntervention({
        actorContext: adminActor,
        eventId,
        interventionType: 'SUSPEND_EVENT',
        reason: 'Contención de fuga de enlaces compartidos',
        idempotencyKey: 'idem-susp-123',
      });

      expect(replay.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(lifecyclePort.suspendEvent).toHaveBeenCalledTimes(2);
    });

    it('ejecuta acciones sobre jobs encolados (RETRY de job fallido) con control de estado y auditoría', async () => {
      const jobId = randomUUID();
      db.jobs.set(jobId, {
        id: jobId,
        status: 'FAILED',
        cancelled: false,
        lease_until: null,
      });

      const jobResult = await jobActionService.executeAction({
        actorContext: adminActor,
        jobId,
        action: 'RETRY',
        reason: 'Reintento tras recuperación de conectividad con storage',
        idempotencyKey: 'job-act-retry-01',
      });

      expect(jobResult.outcome).toBe('EXECUTED');
      expect(jobResult.action).toBe('RETRY');
      expect(jobResult.previousStatus).toBe('FAILED');
      expect(jobResult.newStatus).toBe('PENDING');

      // Estado en BD transicionado a PENDING
      expect(db.jobs.get(jobId)?.status).toBe('PENDING');

      // Auditoría de acción sobre job registrada
      expect(auditEvents.some((a) => a.procedure === 'ADMIN_JOB_ACTION_EXECUTED')).toBe(true);

      // Intento de reintentar un job que ya está COMPLETED -> Rechazado con INCOMPATIBLE_JOB_STATUS
      const completedJobId = randomUUID();
      db.jobs.set(completedJobId, {
        id: completedJobId,
        status: 'COMPLETED',
        cancelled: false,
        lease_until: null,
      });

      await expect(
        jobActionService.executeAction({
          actorContext: adminActor,
          jobId: completedJobId,
          action: 'RETRY',
          reason: 'Intento inválido sobre job completado',
          idempotencyKey: 'job-act-invalid-02',
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: 'INCOMPATIBLE_JOB_STATUS',
        })
      );
    });
  });

  describe('Escenario 3: Detalle agregado y resiliencia ante secciones degradadas (DEC-038)', () => {
    it('retorna snapshot completo cuando todas las integraciones propietarias responden', async () => {
      const snapshot = await eventDetailService.getEventDetail({
        actorContext: adminActor,
        eventId,
      });

      expect(snapshot.eventId).toBe(eventId);
      expect(snapshot.name).toBe('Boda Campestre 2026');
      expect(snapshot.overallAvailability).toBe('COMPLETE');
      expect(snapshot.owner.email).toBe('organizador@eventos.com');
      expect(snapshot.lifecycle.status).toBe('ACTIVE');
      expect(snapshot.capacity.availability).toBe('AVAILABLE');
      expect(snapshot.jobs.availability).toBe('AVAILABLE');
      expect(snapshot.invitations?.availability).toBe('AVAILABLE');
      expect(snapshot.capabilities.canSuspend).toBe(true);
      expect(snapshot.capabilities.canClose).toBe(true);
      expect(snapshot.capabilities.canReactivate).toBe(false); // Ya está ACTIVE
    });

    it('marca overallAvailability: PARTIAL y no ofrece acciones falsas cuando una sección propietaria falla', async () => {
      // Simulamos que el puerto de jobs lanza excepción por timeout de conexión
      jobsPort.getEventJobsSummary = vi.fn(async () => {
        throw new Error('Connection timeout to Redis/JobQueue port');
      });

      const snapshot = await eventDetailService.getEventDetail({
        actorContext: adminActor,
        eventId,
      });

      // La consulta no estalla (tolerancia a fallos)
      expect(snapshot.eventId).toBe(eventId);
      expect(snapshot.overallAvailability).toBe('PARTIAL');
      expect(snapshot.jobs.availability).toBe('UNAVAILABLE');
      expect(snapshot.jobs.unavailableReason).toContain('Connection timeout');

      // Las secciones sanas siguen disponibles
      expect(snapshot.capacity.availability).toBe('AVAILABLE');
      expect(snapshot.lifecycle.status).toBe('ACTIVE');
    });

    it('deshabilita capacidades en estado cerrado (CLOSED) y estado terminal (DELETED), impidiendo acciones imposibles o falsas', async () => {
      // 1. Verificación para estado CLOSED
      const closedEvent = db.events.get(eventId)!;
      closedEvent.status = 'CLOSED';
      closedEvent.closed_at = new Date();

      const closedSnapshot = await eventDetailService.getEventDetail({
        actorContext: adminActor,
        eventId,
      });

      expect(closedSnapshot.lifecycle.status).toBe('CLOSED');
      expect(closedSnapshot.capabilities.canClose).toBe(false);
      expect(closedSnapshot.capabilities.canReactivate).toBe(false);
      expect(closedSnapshot.capabilities.canReopen).toBe(true);

      // 2. Verificación para estado terminal DELETED
      closedEvent.status = 'DELETED';
      const deletedSnapshot = await eventDetailService.getEventDetail({
        actorContext: adminActor,
        eventId,
      });

      expect(deletedSnapshot.lifecycle.status).toBe('DELETED');
      expect(deletedSnapshot.capabilities.canSuspend).toBe(false);
      expect(deletedSnapshot.capabilities.canClose).toBe(false);
      expect(deletedSnapshot.capabilities.canExtendValidity).toBe(false);
      expect(deletedSnapshot.capabilities.canReactivate).toBe(false);
      expect(deletedSnapshot.capabilities.canReopen).toBe(false);
      expect(deletedSnapshot.capabilities.canRequestMediaGrant).toBe(false);
      expect(deletedSnapshot.capabilities.canInspectJobs).toBe(false);
    });
  });

  describe('Escenario 4: Búsqueda administrativa con mínimo privilegio y auditoría de consulta', () => {
    it('ejecuta búsqueda y registra auditoría sin exponer datos confidenciales a usuarios no autorizados', async () => {
      const searchService = new AdminSearchService(txRunner, auditSink);

      const searchResult = await searchService.search({
        actorContext: adminActor,
        query: 'Boda',
        entityType: 'EVENT',
      });

      expect(searchResult.items).toBeDefined();
      expect(auditEvents.some((a) => a.procedure === 'ADMIN_SEARCH_PERFORMED')).toBe(true);

      // Rechazo a usuario sin rol ADMIN_HUMAN
      await expect(
        searchService.search({
          actorContext: {
            actorType: 'ORGANIZER_HUMAN',
            principalId: 'org-usr-01',
          } as unknown as AdminActorContext,
          query: 'Boda',
        })
      ).rejects.toThrowError(AdminSupportError);
    });
  });
});
