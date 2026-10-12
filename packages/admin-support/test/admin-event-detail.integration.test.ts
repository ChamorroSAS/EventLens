import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import type { AdminActorContext } from '@eventlens/identity';
import {
  AdminEventDetailService,
  type AdminCapacityPort,
  type AdminJobsPort,
  type AdminSupportAuditSink
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('AdminEventDetailService (PostgreSQL 16 Integration Tests — EL-TK-147)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  let auditSink: AdminSupportAuditSink;
  let capacityPort: AdminCapacityPort;
  let jobsPort: AdminJobsPort;
  let service: AdminEventDetailService;
  let adminContext: AdminActorContext;

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
    `);

    await sql(`
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
        validity_duration_days INTEGER,
        grace_days INTEGER,
        uploads_enabled BOOLEAN NOT NULL DEFAULT false,
        guest_gallery_enabled BOOLEAN NOT NULL DEFAULT false,
        moderation_mode TEXT NOT NULL DEFAULT 'AUTO_PUBLISH',
        pin_enabled BOOLEAN NOT NULL DEFAULT false,
        pin_hash TEXT,
        pin_salt TEXT,
        idempotency_key TEXT UNIQUE,
        idempotency_payload_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  });

  beforeEach(async () => {
    auditSink = {
      record: vi.fn(async () => {})
    };

    capacityPort = {
      getEventCapacity: vi.fn(async () => ({
        availability: 'AVAILABLE' as const,
        planCode: 'BETA_STANDARD',
        storageLimitBytes: '10737418240',
        storageUsedBytes: '104857600',
        fileLimit: 500,
        filesCount: 45
      }))
    };

    jobsPort = {
      getEventJobsSummary: vi.fn(async () => ({
        availability: 'AVAILABLE' as const,
        totalJobs: 10,
        activeJobs: 1,
        failedJobs: 0,
        deadJobs: 0
      }))
    };

    service = new AdminEventDetailService(txs, capacityPort, jobsPort, auditSink);

    adminContext = {
      actorType: 'ADMIN_HUMAN',
      principalId: randomUUID(),
      identifier: 'pg-admin@eventlens.test',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      adminAuthRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };
  });

  it('Consulta detalle agregado completo desde PostgreSQL 16 con JOIN a organizador (Escenario 1)', async () => {
    const orgId = randomUUID();
    const eventId = randomUUID();

    await sql(
      `INSERT INTO organizer_account (id, email, email_normalized, status, declared_adult, invitation_id, created_at)
       VALUES ($1, $2, $3, 'ACTIVE', true, $4, NOW())`,
      orgId,
      `org_${Date.now()}@eventlens.test`,
      `org_${Date.now()}@eventlens.test`,
      randomUUID()
    );

    await sql(
      `INSERT INTO event (id, organizer_id, name, status, timezone, uploads_enabled, guest_gallery_enabled, created_at)
       VALUES ($1, $2, $3, 'ACTIVE', 'America/Bogota', true, true, NOW())`,
      eventId,
      orgId,
      'Concierto Filarmónico 2026'
    );

    const snapshot = await service.getEventDetail({
      actorContext: adminContext,
      eventId
    });

    expect(snapshot.eventId).toBe(eventId);
    expect(snapshot.name).toBe('Concierto Filarmónico 2026');
    expect(snapshot.overallAvailability).toBe('COMPLETE');
    expect(snapshot.owner.id).toBe(orgId);
    expect(snapshot.owner.status).toBe('ACTIVE');
    expect(snapshot.lifecycle.status).toBe('ACTIVE');
    expect(snapshot.capabilities.canClose).toBe(true);
    expect(snapshot.capabilities.canSuspend).toBe(true);
  });

  it('Presenta estado parcial explícito cuando un servicio downstream falla en PostgreSQL 16 (Escenario 2)', async () => {
    const orgId = randomUUID();
    const eventId = randomUUID();

    await sql(
      `INSERT INTO organizer_account (id, email, email_normalized, status, declared_adult, invitation_id, created_at)
       VALUES ($1, $2, $3, 'ACTIVE', true, $4, NOW())`,
      orgId,
      `org_downstream_${Date.now()}@eventlens.test`,
      `org_downstream_${Date.now()}@eventlens.test`,
      randomUUID()
    );

    await sql(
      `INSERT INTO event (id, organizer_id, name, status, timezone, created_at)
       VALUES ($1, $2, $3, 'SCHEDULED', 'America/Bogota', NOW())`,
      eventId,
      orgId,
      'Evento Prueba Downstream'
    );

    vi.mocked(capacityPort.getEventCapacity).mockRejectedValueOnce(new Error('Downstream DB error'));

    const snapshot = await service.getEventDetail({
      actorContext: adminContext,
      eventId
    });

    expect(snapshot.overallAvailability).toBe('PARTIAL');
    expect(snapshot.capacity.availability).toBe('UNAVAILABLE');
    expect(snapshot.capacity.unavailableReason).toBe('Downstream DB error');
    expect(snapshot.jobs.availability).toBe('AVAILABLE');
  });

  it('Evento SUSPENDED limita capacidades de forma estricta en PostgreSQL 16 (Escenario 3)', async () => {
    const orgId = randomUUID();
    const eventId = randomUUID();

    await sql(
      `INSERT INTO organizer_account (id, email, email_normalized, status, declared_adult, invitation_id, created_at)
       VALUES ($1, $2, $3, 'ACTIVE', true, $4, NOW())`,
      orgId,
      `org_susp_${Date.now()}@eventlens.test`,
      `org_susp_${Date.now()}@eventlens.test`,
      randomUUID()
    );

    await sql(
      `INSERT INTO event (id, organizer_id, name, status, timezone, suspended_at, suspension_reason, created_at)
       VALUES ($1, $2, $3, 'SUSPENDED', 'America/Bogota', NOW(), 'Suspensión preventiva por soporte', NOW())`,
      eventId,
      orgId,
      'Evento Suspendido PG'
    );

    const snapshot = await service.getEventDetail({
      actorContext: adminContext,
      eventId
    });

    expect(snapshot.lifecycle.status).toBe('SUSPENDED');
    expect(snapshot.lifecycle.suspensionReason).toBe('Suspensión preventiva por soporte');
    expect(snapshot.capabilities.canReactivate).toBe(true);
    expect(snapshot.capabilities.canSuspend).toBe(false);
    expect(snapshot.capabilities.canExtendValidity).toBe(false);
  });
});
