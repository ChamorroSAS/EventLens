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

describeIntegration('EventDraftService (Real PostgreSQL Integration Tests — EL-TK-020)', () => {
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
  });

  function createService(auditEvents: EventAuditRecord[]) {
    const auditSink: EventAuditSink = {
      record: async (event) => {
        auditEvents.push(event);
        await sql(
          `INSERT INTO admin_audit_event (
             id, procedure, actor_id, target_identifier, target_principal_id, result, details, timestamp
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          event.id,
          event.procedure,
          event.actorId,
          event.targetIdentifier,
          null,
          event.result,
          event.details ?? null,
          event.timestamp
        );
      }
    };

    return new EventDraftService(txs, auditSink);
  }

  function createMockActor(): OrganizerActorContext {
    return {
      actorType: 'ORGANIZER_HUMAN',
      accountId: randomUUID(),
      email: 'organizer.real@eventlens.internal',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };
  }

  it('persiste un borrador de evento con defaults DEC-069 y aislamiento de propietario en PostgreSQL 16 real', async () => {
    const auditEvents: EventAuditRecord[] = [];
    const service = createService(auditEvents);
    const actor = createMockActor();

    const result = await service.createDraft({
      actorContext: actor,
      name: 'Cumpleaños 50 de Juan'
    });

    expect(result.outcome).toBe('CREATED');
    expect(result.event.id).toBeDefined();

    // Consultar directamente en PostgreSQL
    const rows = await query<{
      id: string;
      organizer_id: string;
      name: string;
      status: string;
      timezone: string;
      uploads_enabled: boolean;
      guest_gallery_enabled: boolean;
      moderation_mode: string;
      pin_enabled: boolean;
    }>('SELECT * FROM event WHERE id = $1', result.event.id);

    expect(rows).toHaveLength(1);
    const stored = rows[0];
    expect(stored.organizer_id).toBe(actor.accountId);
    expect(stored.name).toBe('Cumpleaños 50 de Juan');
    expect(stored.status).toBe('DRAFT');
    expect(stored.timezone).toBe('America/Bogota');
    expect(stored.uploads_enabled).toBe(false);
    expect(stored.guest_gallery_enabled).toBe(false);
    expect(stored.moderation_mode).toBe('AUTO_PUBLISH');
    expect(stored.pin_enabled).toBe(false);

    // Auditoría en PostgreSQL
    const auditRows = await query<{ procedure: string; result: string }>(
      'SELECT procedure, result FROM admin_audit_event WHERE target_identifier = $1',
      result.event.id
    );
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].procedure).toBe('EVENT_DRAFT_CREATED');
    expect(auditRows[0].result).toBe('SUCCESS');
  });

  it('idempotencia en PostgreSQL: llamadas repetidas devuelven el registro existente sin duplicar eventos', async () => {
    const auditEvents: EventAuditRecord[] = [];
    const service = createService(auditEvents);
    const actor = createMockActor();
    const idempotencyKey = 'postgres-idempotency-key-001';

    const first = await service.createDraft({
      actorContext: actor,
      name: 'Festival Musical de Primavera',
      idempotencyKey
    });

    const second = await service.createDraft({
      actorContext: actor,
      name: 'Festival Musical de Primavera',
      idempotencyKey
    });

    expect(first.outcome).toBe('CREATED');
    expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
    expect(second.event.id).toBe(first.event.id);

    const totalEvents = await query('SELECT count(*)::int as count FROM event');
    expect((totalEvents[0] as any).count).toBe(1);
  });

  it('concurrencia: llamadas simultáneas bajo PostgreSQL 16 con misma clave de idempotencia garantizan ganador único', async () => {
    const auditEvents: EventAuditRecord[] = [];
    const service = createService(auditEvents);
    const actor = createMockActor();
    const idempotencyKey = 'concurrent-race-key-' + randomUUID();

    const promises = [
      service.createDraft({ actorContext: actor, name: 'Carrera Concurrente', idempotencyKey }),
      service.createDraft({ actorContext: actor, name: 'Carrera Concurrente', idempotencyKey }),
      service.createDraft({ actorContext: actor, name: 'Carrera Concurrente', idempotencyKey })
    ];

    const results = await Promise.all(promises);
    expect(results).toHaveLength(3);

    const ids = new Set(results.map((r) => r.event.id));
    expect(ids.size).toBe(1); // Exactamente 1 evento creado

    const totalEvents = await query<{ count: number }>('SELECT count(*)::int as count FROM event');
    expect(totalEvents[0].count).toBe(1);
  });
});
