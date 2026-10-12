import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import type { AdminActorContext } from '@eventlens/identity';
import {
  AdminEventDetailService,
  type AdminCapacityRequestsPort,
  type AdminInvitationsPort,
  type AdminReportsPort
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('AdminEventDetailService — Reused Flows (PostgreSQL 16 Integration Tests — EL-TK-152)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  let adminContext: AdminActorContext;
  let invitationsPort: AdminInvitationsPort;
  let capacityRequestsPort: AdminCapacityRequestsPort;
  let reportsPort: AdminReportsPort;

  beforeAll(async () => {
    await sql(`
      CREATE TABLE IF NOT EXISTS organizer_account (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL,
        email_normalized TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
        declared_adult BOOLEAN NOT NULL DEFAULT false,
        declared_adult_at TIMESTAMPTZ,
        invitation_id UUID NOT NULL,
        verified_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS event (
        id UUID PRIMARY KEY,
        organizer_id UUID NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        timezone TEXT NOT NULL DEFAULT 'America/Bogota',
        starts_at_local TEXT,
        scheduled_at TIMESTAMPTZ,
        utc_offset_minutes INTEGER,
        expires_at TIMESTAMPTZ,
        grace_ends_at TIMESTAMPTZ,
        activated_at TIMESTAMPTZ,
        closed_at TIMESTAMPTZ,
        purge_started_at TIMESTAMPTZ,
        suspended_at TIMESTAMPTZ,
        suspension_reason TEXT,
        previous_status TEXT,
        uploads_enabled BOOLEAN NOT NULL DEFAULT true,
        guest_gallery_enabled BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  });

  beforeEach(() => {
    invitationsPort = {
      async getOrganizerInvitation(organizerId: string) {
        return {
          availability: 'AVAILABLE' as const,
          invitationCode: 'BETA-INV-' + organizerId.slice(0, 4),
          status: 'USED' as const,
          issuedAt: new Date(Date.now() - 86400000 * 10).toISOString(),
          usedAt: new Date(Date.now() - 86400000 * 9).toISOString()
        };
      }
    };

    capacityRequestsPort = {
      async getEventCapacityRequests(eventId: string) {
        return {
          availability: 'AVAILABLE' as const,
          requests: [
            {
              requestId: randomUUID(),
              requestedPlan: 'PRO_PLUS_50GB',
              status: 'PENDING' as const,
              requestedAt: new Date().toISOString(),
              justification: 'Evento de gala institucional con alta densidad multimedia'
            }
          ]
        };
      }
    };

    reportsPort = {
      async getEventReportsSummary(eventId: string) {
        return {
          availability: 'AVAILABLE' as const,
          totalReports: 2,
          pendingReports: 1,
          reports: [
            {
              reportId: randomUUID(),
              reasonCategory: 'COPYRIGHT_CLAIM',
              status: 'PENDING' as const,
              createdAt: new Date().toISOString(),
              mediaRef: 'media:sample-claim'
            }
          ]
        };
      }
    };

    adminContext = {
      actorType: 'ADMIN_HUMAN',
      principalId: randomUUID(),
      identifier: 'flows-admin@eventlens.test',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      adminAuthRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };
  });

  it('compone en PostgreSQL 16 detalle de evento con invitaciones, solicitudes y reportes (Escenario 1 y 2)', async () => {
    const orgId = randomUUID();
    const eventId = randomUUID();

    const email = `org-${Date.now()}@eventlens.test`;
    await sql(
      `INSERT INTO organizer_account (id, email, email_normalized, status, declared_adult, invitation_id, created_at)
       VALUES ($1, $2, $3, 'ACTIVE', true, $4, NOW())`,
      orgId,
      email,
      email,
      randomUUID()
    );

    await sql(
      `INSERT INTO event (id, organizer_id, name, status) VALUES ($1, $2, 'Cena Benefica Anual', 'ACTIVE')`,
      eventId,
      orgId
    );

    const service = new AdminEventDetailService(
      txs,
      {
        getEventCapacity: async () => ({
          availability: 'AVAILABLE',
          planCode: 'BETA_STANDARD',
          storageLimitBytes: '5368709120',
          storageUsedBytes: '1073741824',
          fileLimit: 500,
          filesCount: 120
        })
      },
      {
        getEventJobsSummary: async () => ({
          availability: 'AVAILABLE',
          totalJobs: 10,
          activeJobs: 0,
          failedJobs: 0,
          deadJobs: 0
        })
      },
      undefined,
      invitationsPort,
      capacityRequestsPort,
      reportsPort
    );

    const snapshot = await service.getEventDetail({
      actorContext: adminContext,
      eventId
    });

    expect(snapshot.eventId).toBe(eventId);
    expect(snapshot.name).toBe('Cena Benefica Anual');
    expect(snapshot.overallAvailability).toBe('COMPLETE');

    // Invitaciones
    expect(snapshot.invitations?.availability).toBe('AVAILABLE');
    expect(snapshot.invitations?.status).toBe('USED');

    // Solicitudes de capacidad
    expect(snapshot.capacityRequests?.availability).toBe('AVAILABLE');
    expect(snapshot.capacityRequests?.requests?.[0]?.requestedPlan).toBe('PRO_PLUS_50GB');

    // Reportes de moderacion (sin preview de media)
    expect(snapshot.reports?.availability).toBe('AVAILABLE');
    expect(snapshot.reports?.totalReports).toBe(2);
    expect(snapshot.reports?.pendingReports).toBe(1);
    expect(JSON.stringify(snapshot.reports)).not.toContain('previewUrl');
  });

  it('reporta estado parcial y razon explicita si un puerto propietario falla (Escenario 3)', async () => {
    const orgId = randomUUID();
    const eventId = randomUUID();

    const email = `org-fail-${Date.now()}@eventlens.test`;
    await sql(
      `INSERT INTO organizer_account (id, email, email_normalized, status, declared_adult, invitation_id, created_at)
       VALUES ($1, $2, $3, 'ACTIVE', true, $4, NOW())`,
      orgId,
      email,
      email,
      randomUUID()
    );

    await sql(
      `INSERT INTO event (id, organizer_id, name, status) VALUES ($1, $2, 'Seminario Tecnologico', 'ACTIVE')`,
      eventId,
      orgId
    );

    const service = new AdminEventDetailService(
      txs,
      undefined, // capacity desconectado
      undefined, // jobs desconectado
      undefined,
      invitationsPort,
      {
        getEventCapacityRequests: async () => {
          throw new Error('Downstream capacity microservice timeout');
        }
      },
      reportsPort
    );

    const snapshot = await service.getEventDetail({
      actorContext: adminContext,
      eventId
    });

    expect(snapshot.overallAvailability).toBe('PARTIAL');
    expect(snapshot.capacityRequests?.availability).toBe('UNAVAILABLE');
    expect(snapshot.capacityRequests?.unavailableReason).toContain('Downstream capacity microservice timeout');
  });
});
