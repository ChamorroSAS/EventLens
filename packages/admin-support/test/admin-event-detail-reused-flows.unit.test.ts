import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { AdminActorContext } from '@eventlens/identity';
import {
  AdminEventDetailService,
  type AdminCapacityPort,
  type AdminCapacityRequestsPort,
  type AdminInvitationsPort,
  type AdminJobsPort,
  type AdminReportsPort,
  type SqlTransaction,
  type TransactionRunner
} from '../src/index.js';

describe('AdminEventDetailService — Reused Flows Integration (Unit Tests — EL-TK-152)', () => {
  let runner: TransactionRunner;
  let capacityPort: AdminCapacityPort;
  let jobsPort: AdminJobsPort;
  let invitationsPort: AdminInvitationsPort;
  let capacityRequestsPort: AdminCapacityRequestsPort;
  let reportsPort: AdminReportsPort;
  let adminContext: AdminActorContext;

  const eventId = '11111111-1111-1111-1111-111111111111';
  const organizerId = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    runner = {
      async run<T>(callback: (tx: SqlTransaction) => Promise<T>): Promise<T> {
        const tx: SqlTransaction = {
          async query<R extends object = object>(sql: string): Promise<R[]> {
            return [
              {
                id: eventId,
                organizer_id: organizerId,
                name: 'Festival de Primavera 2026',
                status: 'ACTIVE',
                timezone: 'America/Bogota',
                starts_at_local: '2026-10-20 18:00:00',
                scheduled_at: new Date(),
                expires_at: new Date(Date.now() + 86400000 * 3),
                grace_ends_at: null,
                activated_at: new Date(),
                closed_at: null,
                suspended_at: null,
                suspension_reason: null,
                previous_status: null,
                uploads_enabled: true,
                guest_gallery_enabled: true,
                owner_id: organizerId,
                owner_email: 'organizer@eventlens.test',
                owner_status: 'ACTIVE',
                owner_declared_adult: true,
                owner_created_at: new Date()
              }
            ] as unknown as R[];
          },
          async execute(): Promise<number> {
            return 1;
          }
        };
        return callback(tx);
      }
    };

    capacityPort = {
      getEventCapacity: vi.fn(async () => ({
        availability: 'AVAILABLE' as const,
        planCode: 'BETA_PRO',
        storageLimitBytes: '10737418240',
        storageUsedBytes: '2147483648',
        fileLimit: 1000,
        filesCount: 250
      }))
    };

    jobsPort = {
      getEventJobsSummary: vi.fn(async () => ({
        availability: 'AVAILABLE' as const,
        totalJobs: 25,
        activeJobs: 1,
        failedJobs: 0,
        deadJobs: 0
      }))
    };

    invitationsPort = {
      getOrganizerInvitation: vi.fn(async () => ({
        availability: 'AVAILABLE' as const,
        invitationCode: 'BETA-VIP-7788',
        status: 'USED' as const,
        issuedAt: '2026-09-01T10:00:00Z',
        usedAt: '2026-09-05T14:30:00Z'
      }))
    };

    capacityRequestsPort = {
      getEventCapacityRequests: vi.fn(async () => ({
        availability: 'AVAILABLE' as const,
        requests: [
          {
            requestId: randomUUID(),
            requestedPlan: 'ENTERPRISE_100GB',
            status: 'PENDING' as const,
            requestedAt: '2026-10-10T12:00:00Z',
            justification: 'Evento de gran escala con 2000 asistentes'
          }
        ]
      }))
    };

    reportsPort = {
      getEventReportsSummary: vi.fn(async () => ({
        availability: 'AVAILABLE' as const,
        totalReports: 3,
        pendingReports: 1,
        reports: [
          {
            reportId: randomUUID(),
            reasonCategory: 'INAPPROPRIATE_CONTENT',
            status: 'PENDING' as const,
            createdAt: '2026-10-11T09:00:00Z',
            mediaRef: 'media:88888888-8888-8888-8888-888888888888'
          }
        ]
      }))
    };

    adminContext = {
      actorType: 'ADMIN_HUMAN',
      principalId: 'admin_usr_001',
      identifier: 'admin@eventlens.test',
      sessionId: 'session_001',
      authTime: new Date(),
      credentialRevision: 1n,
      adminAuthRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };
  });

  it('consume solicitud de ampliacion de EL-EP-011 y la integra en el snapshot (Escenario 1)', async () => {
    const service = new AdminEventDetailService(
      runner,
      capacityPort,
      jobsPort,
      undefined,
      invitationsPort,
      capacityRequestsPort,
      reportsPort
    );

    const snapshot = await service.getEventDetail({
      actorContext: adminContext,
      eventId
    });

    expect(snapshot.capacityRequests).toBeDefined();
    expect(snapshot.capacityRequests?.availability).toBe('AVAILABLE');
    expect(snapshot.capacityRequests?.requests).toHaveLength(1);
    expect(snapshot.capacityRequests?.requests?.[0]?.requestedPlan).toBe('ENTERPRISE_100GB');
    expect(capacityRequestsPort.getEventCapacityRequests).toHaveBeenCalledWith(eventId);
  });

  it('consume reportes de EL-EP-009 sin preview de media y los integra en el snapshot (Escenario 2)', async () => {
    const service = new AdminEventDetailService(
      runner,
      capacityPort,
      jobsPort,
      undefined,
      invitationsPort,
      capacityRequestsPort,
      reportsPort
    );

    const snapshot = await service.getEventDetail({
      actorContext: adminContext,
      eventId
    });

    expect(snapshot.reports).toBeDefined();
    expect(snapshot.reports?.availability).toBe('AVAILABLE');
    expect(snapshot.reports?.totalReports).toBe(3);
    expect(snapshot.reports?.pendingReports).toBe(1);
    expect(snapshot.reports?.reports?.[0]?.reasonCategory).toBe('INAPPROPRIATE_CONTENT');
    // Verificar que no se expone ninguna url de imagen o thumbnail per DEC-019
    expect(JSON.stringify(snapshot.reports)).not.toContain('previewUrl');
    expect(JSON.stringify(snapshot.reports)).not.toContain('thumbnailUrl');
  });

  it('muestra restriccion explicita UNAVAILABLE si el flujo propietario no esta disponible (Escenario 3)', async () => {
    vi.mocked(capacityRequestsPort.getEventCapacityRequests).mockRejectedValueOnce(
      new Error('Capacity request service temporarily unreachable')
    );

    const service = new AdminEventDetailService(
      runner,
      capacityPort,
      jobsPort,
      undefined,
      invitationsPort,
      capacityRequestsPort,
      reportsPort
    );

    const snapshot = await service.getEventDetail({
      actorContext: adminContext,
      eventId
    });

    expect(snapshot.capacityRequests?.availability).toBe('UNAVAILABLE');
    expect(snapshot.capacityRequests?.unavailableReason).toContain('temporarily unreachable');
    expect(snapshot.overallAvailability).toBe('PARTIAL');
  });

  it('integra informacion de invitacion BETA de EL-EP-001 sin exponer tokens sensibles', async () => {
    const service = new AdminEventDetailService(
      runner,
      capacityPort,
      jobsPort,
      undefined,
      invitationsPort,
      capacityRequestsPort,
      reportsPort
    );

    const snapshot = await service.getEventDetail({
      actorContext: adminContext,
      eventId
    });

    expect(snapshot.invitations).toBeDefined();
    expect(snapshot.invitations?.availability).toBe('AVAILABLE');
    expect(snapshot.invitations?.invitationCode).toBe('BETA-VIP-7788');
    expect(snapshot.invitations?.status).toBe('USED');
    expect(invitationsPort.getOrganizerInvitation).toHaveBeenCalledWith(organizerId);
    expect(JSON.stringify(snapshot.invitations)).not.toContain('token');
  });
});
