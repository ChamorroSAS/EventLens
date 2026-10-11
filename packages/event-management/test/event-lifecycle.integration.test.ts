import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import type { OrganizerActorContext } from '@eventlens/identity';
import {
  EventLifecycleService,
  EventManagementError,
  type EventAuditSink,
  type EventAuditRecord
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('EventLifecycleService (Real PostgreSQL Integration Tests — EL-TK-063)', () => {
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
        expires_at TIMESTAMPTZ,
        grace_ends_at TIMESTAMPTZ,
        validity_duration_days INTEGER,
        grace_days INTEGER,
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
        ADD COLUMN IF NOT EXISTS utc_offset_minutes INTEGER,
        ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS grace_ends_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS validity_duration_days INTEGER,
        ADD COLUMN IF NOT EXISTS grace_days INTEGER;

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

      ALTER TABLE admin_audit_event
        ADD COLUMN IF NOT EXISTS target_principal_id UUID;
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

  const service = new EventLifecycleService(txs, auditSink);

  const ownerActor: OrganizerActorContext = {
    actorType: 'ORGANIZER_HUMAN',
    accountId: randomUUID(),
    email: 'organizer-integ@eventlens.local',
    sessionId: randomUUID(),
    authTime: new Date(),
    credentialRevision: 1n,
    sessionWatermark: 1n,
    recoveryEpoch: 1n
  };

  it('persiste transición a SCHEDULED con timeline canónico en PostgreSQL 16 real (Escenario 1)', async () => {
    const eventId = randomUUID();
    const scheduledAt = new Date('2026-11-01T15:00:00.000Z');

    // Insertar un DRAFT con horario configurado
    await sql(
      `INSERT INTO event (id, organizer_id, name, status, timezone, starts_at_local, scheduled_at, utc_offset_minutes)
       VALUES ($1, $2, $3, 'DRAFT', 'America/Bogota', '2026-11-01T10:00:00', $4, -300)`,
      eventId,
      ownerActor.accountId,
      'Gala Anual 2026',
      scheduledAt
    );

    const result = await service.scheduleDraft({
      actorContext: ownerActor,
      eventId,
      validityDurationDays: 30,
      graceDays: 7
    });

    expect(result.outcome).toBe('SCHEDULED');
    expect(result.event.status).toBe('SCHEDULED');
    expect(result.event.validityDurationDays).toBe(30);
    expect(result.event.graceDays).toBe(7);

    // Verificar en la base de datos real
    const rows = await query<{
      status: string;
      expires_at: Date;
      grace_ends_at: Date;
      validity_duration_days: number;
      grace_days: number;
    }>(
      `SELECT status, expires_at, grace_ends_at, validity_duration_days, grace_days
       FROM event WHERE id = $1`,
      eventId
    );

    expect(rows.length).toBe(1);
    const dbEvent = rows[0];
    expect(dbEvent.status).toBe('SCHEDULED');
    expect(new Date(dbEvent.expires_at).toISOString()).toBe('2026-12-01T15:00:00.000Z');
    expect(new Date(dbEvent.grace_ends_at).toISOString()).toBe('2026-12-08T15:00:00.000Z');
    expect(dbEvent.validity_duration_days).toBe(30);
    expect(dbEvent.grace_days).toBe(7);

    // Verificar auditoría persistida en tabla real
    const auditRows = await query<{ procedure: string; result: string; target_identifier: string }>(
      `SELECT procedure, result, target_identifier FROM admin_audit_event WHERE target_identifier = $1`,
      eventId
    );
    expect(auditRows.length).toBe(1);
    expect(auditRows[0].procedure).toBe('EVENT_SCHEDULED');
    expect(auditRows[0].result).toBe('SUCCESS');
  });

  it('rechaza borrador sin fecha programada y deja el registro DRAFT intacto (Escenario 2)', async () => {
    const eventId = randomUUID();

    await sql(
      `INSERT INTO event (id, organizer_id, name, status, timezone, starts_at_local, scheduled_at)
       VALUES ($1, $2, $3, 'DRAFT', 'America/Bogota', NULL, NULL)`,
      eventId,
      ownerActor.accountId,
      'Borrador incompleto'
    );

    await expect(
      service.scheduleDraft({
        actorContext: ownerActor,
        eventId
      })
    ).rejects.toThrowError(EventManagementError);

    // El registro permanece en DRAFT sin campos de expiración
    const rows = await query<{ status: string; expires_at: Date | null }>(
      `SELECT status, expires_at FROM event WHERE id = $1`,
      eventId
    );
    expect(rows[0].status).toBe('DRAFT');
    expect(rows[0].expires_at).toBeNull();
  });

  it('serializa llamadas concurrentes de programación bajo bloqueo pesimista FOR UPDATE sin corrupción ni lost updates', async () => {
    const eventId = randomUUID();
    const scheduledAt = new Date('2026-11-01T15:00:00.000Z');

    await sql(
      `INSERT INTO event (id, organizer_id, name, status, timezone, starts_at_local, scheduled_at, utc_offset_minutes)
       VALUES ($1, $2, $3, 'DRAFT', 'America/Bogota', '2026-11-01T10:00:00', $4, -300)`,
      eventId,
      ownerActor.accountId,
      'Concurrencia Programación',
      scheduledAt
    );

    // Dos llamadas concurrentes con la misma clave de idempotencia
    const idempotencyKey = `idem-concurrent-${randomUUID()}`;

    const [res1, res2] = await Promise.all([
      service.scheduleDraft({
        actorContext: ownerActor,
        eventId,
        validityDurationDays: 30,
        graceDays: 7,
        idempotencyKey
      }),
      service.scheduleDraft({
        actorContext: ownerActor,
        eventId,
        validityDurationDays: 30,
        graceDays: 7,
        idempotencyKey
      })
    ]);

    const outcomes = [res1.outcome, res2.outcome].sort();
    // Uno gana la transición y el otro recibe IDEMPOTENT_REPLAY limpio
    expect(outcomes).toEqual(['IDEMPOTENT_REPLAY', 'SCHEDULED']);

    const finalRows = await query<{ status: string; validity_duration_days: number }>(
      `SELECT status, validity_duration_days FROM event WHERE id = $1`,
      eventId
    );
    expect(finalRows[0].status).toBe('SCHEDULED');
    expect(finalRows[0].validity_duration_days).toBe(30);
  });
});
