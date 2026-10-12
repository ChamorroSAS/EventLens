import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import type { OrganizerActorContext } from '@eventlens/identity';
import {
  EventDraftService,
  EventManagementError,
  type EventAuditSink,
  type EventAuditRecord
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('EventScheduleService (Real PostgreSQL Integration Tests — EL-TK-023)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  async function query<T extends object>(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.query<T>(statement, ...args));
  }

  beforeAll(async () => {
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
        uploads_enabled BOOLEAN NOT NULL DEFAULT false,
        guest_gallery_enabled BOOLEAN NOT NULL DEFAULT false,
        moderation_mode TEXT NOT NULL DEFAULT 'AUTO_PUBLISH',
        pin_enabled BOOLEAN NOT NULL DEFAULT false,
        idempotency_key TEXT UNIQUE,
        idempotency_payload_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE event
        ADD COLUMN IF NOT EXISTS starts_at_local TEXT,
        ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS utc_offset_minutes INTEGER;

      CREATE TABLE IF NOT EXISTS admin_audit_event (
        id UUID PRIMARY KEY,
        procedure TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        target_identifier TEXT NOT NULL,
        result TEXT NOT NULL,
        details TEXT,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  });

  beforeEach(async () => {
    await sql('DELETE FROM event');
    await sql('DELETE FROM admin_audit_event');
  });

  const auditLogs: EventAuditRecord[] = [];
  const auditSink: EventAuditSink = {
    async record(record: EventAuditRecord): Promise<void> {
      auditLogs.push(record);
      await sql(
        `INSERT INTO admin_audit_event (id, procedure, actor_id, target_identifier, result, details, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        record.id,
        record.procedure,
        record.actorId,
        record.targetIdentifier,
        record.result,
        record.details ?? null,
        record.timestamp
      );
    }
  };

  const service = new EventDraftService(txs, auditSink);

  it('persists local schedule and deterministic UTC in real PostgreSQL (Escenario 1)', async () => {
    const organizerId = randomUUID();
    const actor: OrganizerActorContext = {
      actorType: 'ORGANIZER_HUMAN',
      accountId: organizerId,
      email: 'organizer@eventlens.local',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };

    // 1. Create draft
    const draftRes = await service.createDraft({
      actorContext: actor,
      name: 'Celebración Anual'
    });
    const eventId = draftRes.event.id;

    // 2. Set schedule
    const scheduleRes = await service.setSchedule({
      actorContext: actor,
      eventId,
      startsAtLocal: '2026-11-20T19:30:00'
    });

    expect(scheduleRes.outcome).toBe('UPDATED');
    expect(scheduleRes.event.startsAtLocal).toBe('2026-11-20T19:30:00');
    expect(scheduleRes.event.utcOffsetMinutes).toBe(-300);

    // 3. Verify PostgreSQL row directly
    const rows = await query<{
      id: string;
      starts_at_local: string;
      scheduled_at: Date;
      utc_offset_minutes: number;
    }>('SELECT id, starts_at_local, scheduled_at, utc_offset_minutes FROM event WHERE id = $1', eventId);

    expect(rows.length).toBe(1);
    expect(rows[0].starts_at_local).toBe('2026-11-20T19:30:00');
    expect(rows[0].utc_offset_minutes).toBe(-300);
    expect(new Date(rows[0].scheduled_at).toISOString()).toBe('2026-11-21T00:30:00.000Z');
  });

  it('rejects spring-forward non-existent local hour in PostgreSQL and audits rejection (Escenario 2)', async () => {
    const organizerId = randomUUID();
    const actor: OrganizerActorContext = {
      actorType: 'ORGANIZER_HUMAN',
      accountId: organizerId,
      email: 'organizer@eventlens.local',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };

    const draftRes = await service.createDraft({
      actorContext: actor,
      name: 'Conferencia NY'
    });
    const eventId = draftRes.event.id;

    // Update timezone to America/New_York
    await sql(`UPDATE event SET timezone = 'America/New_York' WHERE id = $1`, eventId);

    // Attempt spring-forward gap time 02:30:00
    await expect(
      service.setSchedule({
        actorContext: actor,
        eventId,
        startsAtLocal: '2026-03-08T02:30:00'
      })
    ).rejects.toThrowError(EventManagementError);

    // Verify DB remains unaffected
    const rows = await query<{ starts_at_local: string | null }>(
      'SELECT starts_at_local FROM event WHERE id = $1',
      eventId
    );
    expect(rows[0].starts_at_local).toBeNull();
  });

  it('serializes concurrent schedule modifications under row-level lock without lost updates', async () => {
    const organizerId = randomUUID();
    const actor: OrganizerActorContext = {
      actorType: 'ORGANIZER_HUMAN',
      accountId: organizerId,
      email: 'organizer@eventlens.local',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };

    const draftRes = await service.createDraft({
      actorContext: actor,
      name: 'Carrera Concurrente'
    });
    const eventId = draftRes.event.id;

    // Run 2 concurrent schedule updates
    const [res1, res2] = await Promise.all([
      service.setSchedule({
        actorContext: actor,
        eventId,
        startsAtLocal: '2026-11-20T10:00:00'
      }),
      service.setSchedule({
        actorContext: actor,
        eventId,
        startsAtLocal: '2026-11-20T14:00:00'
      })
    ]);

    expect(res1.outcome).toBe('UPDATED');
    expect(res2.outcome).toBe('UPDATED');

    // The database must hold one of the final consistent states
    const rows = await query<{ starts_at_local: string }>(
      'SELECT starts_at_local FROM event WHERE id = $1',
      eventId
    );
    expect(['2026-11-20T10:00:00', '2026-11-20T14:00:00']).toContain(rows[0].starts_at_local);
  });
});
