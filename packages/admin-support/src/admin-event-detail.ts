import {
  AdminSupportError,
  type AdminActorContext,
  type AdminCapacityPort,
  type AdminEventCapabilities,
  type AdminEventCapacitySection,
  type AdminEventDetailQuery,
  type AdminEventDetailSnapshot,
  type AdminEventJobsSection,
  type AdminEventLifecycleSection,
  type AdminEventOwnerSection,
  type AdminJobsPort,
  type AdminSupportAuditSink,
  type SqlTransaction,
  type TransactionRunner
} from './contracts.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RawEventDetailRow {
  id: string;
  organizer_id: string;
  name: string;
  status: string;
  timezone: string | null;
  starts_at_local: string | null;
  scheduled_at: Date | string | null;
  expires_at: Date | string | null;
  grace_ends_at: Date | string | null;
  activated_at: Date | string | null;
  closed_at: Date | string | null;
  suspended_at: Date | string | null;
  suspension_reason: string | null;
  previous_status: string | null;
  uploads_enabled: boolean | null;
  guest_gallery_enabled: boolean | null;
  owner_id: string | null;
  owner_email: string | null;
  owner_status: string | null;
  owner_declared_adult: boolean | null;
  owner_created_at: Date | string | null;
}

export function calculateEventCapabilities(status: string): AdminEventCapabilities {
  switch (status) {
    case 'DRAFT':
      return {
        canSuspend: false,
        canReactivate: false,
        canClose: false,
        canReopen: false,
        canExtendValidity: false,
        canViewAudit: true,
        canInspectJobs: false,
        canRequestMediaGrant: false
      };
    case 'SCHEDULED':
      return {
        canSuspend: true,
        canReactivate: false,
        canClose: false,
        canReopen: false,
        canExtendValidity: true,
        canViewAudit: true,
        canInspectJobs: true,
        canRequestMediaGrant: false
      };
    case 'ACTIVE':
      return {
        canSuspend: true,
        canReactivate: false,
        canClose: true,
        canReopen: false,
        canExtendValidity: true,
        canViewAudit: true,
        canInspectJobs: true,
        canRequestMediaGrant: true
      };
    case 'CLOSED':
      return {
        canSuspend: true,
        canReactivate: false,
        canClose: false,
        canReopen: true,
        canExtendValidity: true,
        canViewAudit: true,
        canInspectJobs: true,
        canRequestMediaGrant: true
      };
    case 'SUSPENDED':
      return {
        canSuspend: false,
        canReactivate: true,
        canClose: false,
        canReopen: false,
        canExtendValidity: false,
        canViewAudit: true,
        canInspectJobs: true,
        canRequestMediaGrant: true
      };
    case 'GRACE_PERIOD':
      return {
        canSuspend: true,
        canReactivate: false,
        canClose: false,
        canReopen: false,
        canExtendValidity: true,
        canViewAudit: true,
        canInspectJobs: true,
        canRequestMediaGrant: true
      };
    case 'PENDING_DELETION':
    case 'ARCHIVED':
    case 'DELETED':
    default:
      return {
        canSuspend: false,
        canReactivate: false,
        canClose: false,
        canReopen: false,
        canExtendValidity: false,
        canViewAudit: true,
        canInspectJobs: false,
        canRequestMediaGrant: false
      };
  }
}

export class AdminEventDetailService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly capacityPort?: AdminCapacityPort,
    private readonly jobsPort?: AdminJobsPort,
    private readonly auditSink?: AdminSupportAuditSink
  ) {
    if (!runner) {
      throw new AdminSupportError('INVALID_ARGUMENT', 'TransactionRunner is required');
    }
  }

  public async getEventDetail(
    query: AdminEventDetailQuery
  ): Promise<AdminEventDetailSnapshot> {
    if (!query || typeof query !== 'object') {
      throw new AdminSupportError('INVALID_ARGUMENT', 'Query is required');
    }

    const { actorContext, eventId } = query;

    // 1. Control de acceso administrativo (EL-TK-044)
    if (!actorContext || actorContext.actorType !== 'ADMIN_HUMAN' || !actorContext.principalId) {
      throw new AdminSupportError('UNAUTHORIZED', 'Authorized administrative principal required');
    }

    // 2. Validación de identificador UUID
    if (!eventId || typeof eventId !== 'string' || !UUID_REGEX.test(eventId.trim())) {
      throw new AdminSupportError('INVALID_ARGUMENT', 'Valid event UUID is required');
    }

    const cleanEventId = eventId.trim();

    // 3. Consulta transaccional de evento y su organizador
    const row = await this.runner.run(async (tx: SqlTransaction) => {
      const rows = await tx.query<RawEventDetailRow>(
        `
        SELECT 
          e.id::text AS id,
          e.organizer_id::text AS organizer_id,
          e.name AS name,
          e.status::text AS status,
          e.timezone::text AS timezone,
          e.starts_at_local AS starts_at_local,
          e.scheduled_at AS scheduled_at,
          e.expires_at AS expires_at,
          e.grace_ends_at AS grace_ends_at,
          e.activated_at AS activated_at,
          e.closed_at AS closed_at,
          e.suspended_at AS suspended_at,
          e.suspension_reason AS suspension_reason,
          e.previous_status::text AS previous_status,
          e.uploads_enabled AS uploads_enabled,
          e.guest_gallery_enabled AS guest_gallery_enabled,
          o.id::text AS owner_id,
          o.email AS owner_email,
          o.status::text AS owner_status,
          o.declared_adult AS owner_declared_adult,
          o.created_at AS owner_created_at
        FROM event e
        LEFT JOIN organizer_account o ON o.id = e.organizer_id
        WHERE e.id = $1
        `,
        cleanEventId
      );
      return rows[0] ?? null;
    });

    if (!row) {
      throw new AdminSupportError('INVALID_ARGUMENT', `Event '${cleanEventId}' not found`);
    }

    // 4. Mapeo de secciones directas (Owner y Lifecycle)
    const ownerSection: AdminEventOwnerSection = {
      id: row.owner_id ?? row.organizer_id,
      email: row.owner_email ?? 'desconocido@eventlens.local',
      status: row.owner_status ?? 'UNKNOWN',
      declaredAdult: Boolean(row.owner_declared_adult),
      createdAt: row.owner_created_at ? new Date(row.owner_created_at).toISOString() : new Date().toISOString()
    };

    const lifecycleSection: AdminEventLifecycleSection = {
      status: row.status,
      timezone: row.timezone ?? 'America/Bogota',
      startsAtLocal: row.starts_at_local,
      scheduledAt: row.scheduled_at ? new Date(row.scheduled_at).toISOString() : null,
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      graceEndsAt: row.grace_ends_at ? new Date(row.grace_ends_at).toISOString() : null,
      activatedAt: row.activated_at ? new Date(row.activated_at).toISOString() : null,
      closedAt: row.closed_at ? new Date(row.closed_at).toISOString() : null,
      suspendedAt: row.suspended_at ? new Date(row.suspended_at).toISOString() : null,
      suspensionReason: row.suspension_reason,
      previousStatus: row.previous_status,
      uploadsEnabled: Boolean(row.uploads_enabled),
      guestGalleryEnabled: Boolean(row.guest_gallery_enabled)
    };

    // 5. Cálculo de capacidades de acción según estado (Escenario 3)
    const capabilities = calculateEventCapabilities(row.status);

    // 6. Consulta tolerante a fallos de secciones downstream (Escenario 2: estado parcial explícito)
    let capacitySection: AdminEventCapacitySection;
    if (this.capacityPort) {
      try {
        capacitySection = await this.capacityPort.getEventCapacity(cleanEventId);
      } catch (err) {
        capacitySection = {
          availability: 'UNAVAILABLE',
          unavailableReason: err instanceof Error ? err.message : 'Capacity service error'
        };
      }
    } else {
      capacitySection = {
        availability: 'UNAVAILABLE',
        unavailableReason: 'Capacity integration not connected'
      };
    }

    let jobsSection: AdminEventJobsSection;
    if (this.jobsPort) {
      try {
        jobsSection = await this.jobsPort.getEventJobsSummary(cleanEventId);
      } catch (err) {
        jobsSection = {
          availability: 'UNAVAILABLE',
          unavailableReason: err instanceof Error ? err.message : 'Jobs service error'
        };
      }
    } else {
      jobsSection = {
        availability: 'UNAVAILABLE',
        unavailableReason: 'Jobs integration not connected'
      };
    }

    const overallAvailability: 'COMPLETE' | 'PARTIAL' =
      capacitySection.availability === 'AVAILABLE' && jobsSection.availability === 'AVAILABLE'
        ? 'COMPLETE'
        : 'PARTIAL';

    const snapshot: AdminEventDetailSnapshot = {
      eventId: cleanEventId,
      name: row.name,
      overallAvailability,
      owner: ownerSection,
      lifecycle: lifecycleSection,
      capacity: capacitySection,
      jobs: jobsSection,
      capabilities,
      fetchedAt: new Date().toISOString()
    };

    // 7. Observabilidad segura sin secretos ni media payloads
    if (this.auditSink) {
      try {
        await this.auditSink.record({
          procedure: 'ADMIN_EVENT_DETAIL_VIEWED',
          principalId: actorContext.principalId,
          details: JSON.stringify({
            eventId: cleanEventId,
            eventStatus: row.status,
            overallAvailability,
            capacityAvailability: capacitySection.availability,
            jobsAvailability: jobsSection.availability
          }),
          timestamp: new Date()
        });
      } catch {
        // Ignorar falla de auditoría asíncrona no bloqueante
      }
    }

    return snapshot;
  }
}
