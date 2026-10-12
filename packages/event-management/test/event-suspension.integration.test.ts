import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import type { AdminActorContext } from '@eventlens/identity';
import {
  EventLifecycleService,
  EventManagementError,
  type EventAuditSink,
  type EventAuditRecord
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('EventLifecycleService (Real PostgreSQL Integration Tests — EL-TK-068)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  async function query<T extends object>(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.query<T>(statement, ...args));
  }

  const validAdminContext: AdminActorContext = {
    actorType: 'ADMIN_HUMAN',
    principalId: randomUUID(),
    identifier: 'admin-integration@eventlens.local',
    sessionId: randomUUID(),
    authTime: new Date(),
    credentialRevision: 1n,
    adminAuthRevision: 1n,
    sessionWatermark: 1n,
    recoveryEpoch: 1n
  };

  const recordedAudits: EventAuditRecord[] = [];
  const auditSink: EventAuditSink = {
    async record(event: EventAuditRecord) {
      recordedAudits.push(event);
      await sql(
        `INSERT INTO admin_audit_event (id, procedure, actor_id, target_identifier, target_principal_id, result, details, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        event.id,
        event.procedure,
        event.actorId,
        event.targetIdentifier,
        event.targetIdentifier,
        event.result,
        event.details ?? null,
        event.timestamp
      );
    }
  };

  const service = new EventLifecycleService(txs, auditSink);

  beforeAll(async () => {
    await sql(`
      CREATE TABLE IF NOT EXISTS event (
        id UUID PRIMARY KEY,
        organizer_id UUID NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        previous_status TEXT,
        suspension_reason TEXT,
        suspended_at TIMESTAMPTZ,
        scheduled_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        grace_ends_at TIMESTAMPTZ,
        revision BIGINT NOT NULL DEFAULT 1,
        timezone TEXT NOT NULL DEFAULT 'America/Bogota',
        uploads_enabled BOOLEAN NOT NULL DEFAULT false,
        guest_gallery_enabled BOOLEAN NOT NULL DEFAULT false,
        moderation_mode TEXT NOT NULL DEFAULT 'AUTO_PUBLISH',
        pin_enabled BOOLEAN NOT NULL DEFAULT false,
        idempotency_key TEXT UNIQUE,
        idempotency_payload_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS admin_audit_event (
        id UUID PRIMARY KEY,
        procedure TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        target_identifier TEXT NOT NULL,
        target_principal_id UUID,
        result TEXT NOT NULL,
        details TEXT,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  });

  beforeEach(async () => {
    await sql('DELETE FROM event');
    await sql('DELETE FROM admin_audit_event');
    recordedAudits.length = 0;
  });

  async function insertEvent(overrides: {
    id?: string;
    organizerId?: string;
    name?: string;
    status?: string;
    revision?: bigint | number;
  }) {
    const id = overrides.id ?? randomUUID();
    const organizerId = overrides.organizerId ?? randomUUID();
    const name = overrides.name ?? 'Festival Bogotá 2026';
    const status = overrides.status ?? 'ACTIVE';
    const revision = overrides.revision ?? 1;

    await sql(
      `INSERT INTO event (id, organizer_id, name, status, revision, timezone, uploads_enabled, guest_gallery_enabled, moderation_mode, pin_enabled)
       VALUES ($1, $2, $3, $4, $5, 'America/Bogota', true, true, 'AUTO_PUBLISH', false)`,
      id,
      organizerId,
      name,
      status,
      revision
    );

    return id;
  }

  it('Escenario 1: Suspends an active event in PostgreSQL and updates status, previous_status, reason, and revision', async () => {
    const eventId = await insertEvent({ status: 'ACTIVE', revision: 1 });

    const result = await service.suspendEvent({
      actorContext: validAdminContext,
      eventId,
      reason: 'Administrative hold pending venue compliance verification'
    });

    expect(result.event.status).toBe('SUSPENDED');
    expect(result.previousStatus).toBe('ACTIVE');
    expect(result.suspensionReason).toBe('Administrative hold pending venue compliance verification');
    expect(result.revision).toBe(2n);

    // Verify row in database
    const rows = await query<{
      id: string;
      status: string;
      previous_status: string;
      suspension_reason: string;
      revision: string;
    }>('SELECT id, status, previous_status, suspension_reason, revision FROM event WHERE id = $1', eventId);

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('SUSPENDED');
    expect(rows[0].previous_status).toBe('ACTIVE');
    expect(rows[0].suspension_reason).toBe('Administrative hold pending venue compliance verification');
    expect(BigInt(rows[0].revision)).toBe(2n);

    // Verify audit entry in database
    const auditRows = await query<{ procedure: string; result: string; actor_id: string }>(
      'SELECT procedure, result, actor_id FROM admin_audit_event WHERE target_identifier = $1',
      eventId
    );
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].procedure).toBe('EVENT_SUSPENDED');
    expect(auditRows[0].result).toBe('SUCCESS');
    expect(auditRows[0].actor_id).toBe(validAdminContext.principalId);
  });

  it('Escenario 2: Rejects suspension of terminal DELETED event in PostgreSQL with rollback', async () => {
    const eventId = await insertEvent({ status: 'DELETED', revision: 3 });

    await expect(
      service.suspendEvent({
        actorContext: validAdminContext,
        eventId,
        reason: 'Illegal suspension attempt on deleted event'
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'TERMINAL_STATE_CANNOT_SUSPEND'
      })
    );

    // Database state remains strictly unchanged
    const rows = await query<{ status: string; revision: string }>(
      'SELECT status, revision FROM event WHERE id = $1',
      eventId
    );
    expect(rows[0].status).toBe('DELETED');
    expect(BigInt(rows[0].revision)).toBe(3n);
  });

  it('Rolls back transaction and rejects on revision concurrency conflict', async () => {
    const eventId = await insertEvent({ status: 'ACTIVE', revision: 5 });

    await expect(
      service.suspendEvent({
        actorContext: validAdminContext,
        eventId,
        reason: 'Conflict test',
        expectedRevision: 4 // Out of date
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'CONCURRENCY_CONFLICT'
      })
    );

    const rows = await query<{ status: string; revision: string }>(
      'SELECT status, revision FROM event WHERE id = $1',
      eventId
    );
    expect(rows[0].status).toBe('ACTIVE');
    expect(BigInt(rows[0].revision)).toBe(5n);
  });
});
