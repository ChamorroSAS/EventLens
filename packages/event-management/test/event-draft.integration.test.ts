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
        starts_at_local TEXT,
        scheduled_at TIMESTAMPTZ,
        utc_offset_minutes INT,
        expires_at TIMESTAMPTZ,
        grace_ends_at TIMESTAMPTZ,
        activated_at TIMESTAMPTZ,
        closed_at TIMESTAMPTZ,
        purge_started_at TIMESTAMPTZ,
        suspended_at TIMESTAMPTZ,
        suspension_reason TEXT,
        previous_status TEXT,
        validity_duration_days INT,
        grace_days INT,
        uploads_enabled BOOLEAN NOT NULL DEFAULT false,
        guest_gallery_enabled BOOLEAN NOT NULL DEFAULT false,
        moderation_mode TEXT NOT NULL DEFAULT 'AUTO_PUBLISH',
        pin_enabled BOOLEAN NOT NULL DEFAULT false,
        pin_hash TEXT,
        pin_salt TEXT,
        welcome_message TEXT,
        cover_asset_id UUID,
        idempotency_key TEXT UNIQUE,
        idempotency_payload_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS event_command_receipt (
        operation_id UUID PRIMARY KEY,
        event_id UUID NOT NULL,
        actor_id UUID NOT NULL,
        operation TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        applied_revision BIGINT NOT NULL DEFAULT 1,
        outcome TEXT NOT NULL,
        warning TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMPTZ,
        CONSTRAINT uq_event_command_receipt_actor_op_key UNIQUE (actor_id, operation, idempotency_key)
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

      ALTER TABLE admin_audit_event
        ADD COLUMN IF NOT EXISTS target_principal_id UUID;

      ALTER TABLE event
        ADD COLUMN IF NOT EXISTS starts_at_local TEXT,
        ADD COLUMN IF NOT EXISTS pin_hash TEXT,
        ADD COLUMN IF NOT EXISTS pin_salt TEXT,
        ADD COLUMN IF NOT EXISTS welcome_message TEXT,
        ADD COLUMN IF NOT EXISTS cover_asset_id UUID;
    `);
  });

  beforeEach(async () => {
    await sql('DELETE FROM event_command_receipt');
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

  it('EL-TK-027: persiste PIN inicial en PostgreSQL 16 con hash y salt, pin_enabled = true y cero exposición en el retorno', async () => {
    const auditEvents: EventAuditRecord[] = [];
    const service = createService(auditEvents);
    const actor = createMockActor();

    const draft = await service.createDraft({
      actorContext: actor,
      name: 'Evento Boda Real con PIN'
    });

    const pinResult = await service.setInitialPin({
      actorContext: actor,
      eventId: draft.event.id,
      pin: '007890'
    });

    expect(pinResult.outcome).toBe('PIN_SET');
    expect(pinResult.event.pinEnabled).toBe(true);

    // Consultar directamente en PostgreSQL
    const rows = await query<{
      pin_enabled: boolean;
      pin_hash: string | null;
      pin_salt: string | null;
    }>('SELECT pin_enabled, pin_hash, pin_salt FROM event WHERE id = $1', draft.event.id);

    expect(rows).toHaveLength(1);
    expect(rows[0].pin_enabled).toBe(true);
    expect(rows[0].pin_hash).toBeTruthy();
    expect(rows[0].pin_salt).toBeTruthy();
    // Cero exposición del PIN plano
    expect(rows[0].pin_hash).not.toBe('007890');
    expect(rows[0].pin_salt).not.toBe('007890');

    // Auditoría en PostgreSQL
    const auditRows = await query<{ procedure: string; result: string; details: string }>(
      `SELECT procedure, result, details FROM admin_audit_event
       WHERE target_identifier = $1 AND procedure = 'EVENT_INITIAL_PIN_SET'`,
      draft.event.id
    );
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].result).toBe('SUCCESS');
    expect(auditRows[0].details).not.toContain('007890');
  });

  it('EL-TK-027: rechaza en PostgreSQL actor ajeno, estado distinto a DRAFT o intento de cambiar PIN existente', async () => {
    const auditEvents: EventAuditRecord[] = [];
    const service = createService(auditEvents);
    const actor = createMockActor();

    const draft = await service.createDraft({
      actorContext: actor,
      name: 'Evento Rechazos PIN SQL'
    });

    // 1. Actor ajeno
    const otherActor = createMockActor();
    await expect(
      service.setInitialPin({
        actorContext: otherActor,
        eventId: draft.event.id,
        pin: '123456'
      })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    // 2. Establecer PIN inicial correctamente
    await service.setInitialPin({
      actorContext: actor,
      eventId: draft.event.id,
      pin: '123456'
    });

    // 3. Intento de reconfigurar o cambiar PIN existente -> PIN_ALREADY_CONFIGURED
    await expect(
      service.setInitialPin({
        actorContext: actor,
        eventId: draft.event.id,
        pin: '654321'
      })
    ).rejects.toMatchObject({ code: 'PIN_ALREADY_CONFIGURED' });

    // 4. Intento cuando el evento no está en DRAFT
    const draft2 = await service.createDraft({
      actorContext: actor,
      name: 'Evento Draft2 SQL'
    });
    await sql(`UPDATE event SET status = 'ACTIVE' WHERE id = $1`, draft2.event.id);

    await expect(
      service.setInitialPin({
        actorContext: actor,
        eventId: draft2.event.id,
        pin: '334455'
      })
    ).rejects.toMatchObject({ code: 'EVENT_NOT_IN_DRAFT' });
  });

  it('EL-TK-027: serializa escrituras concurrentes compitiendo por establecer PIN inicial bajo FOR UPDATE', async () => {
    const auditEvents: EventAuditRecord[] = [];
    const service = createService(auditEvents);
    const actor = createMockActor();

    const draft = await service.createDraft({
      actorContext: actor,
      name: 'Evento Concurrencia PIN SQL'
    });

    const key = 'pin-concurrent-idem-key';

    // Dos llamadas concurrentes con la misma clave de idempotencia
    const [res1, res2] = await Promise.all([
      service.setInitialPin({
        actorContext: actor,
        eventId: draft.event.id,
        pin: '889900',
        idempotencyKey: key
      }),
      service.setInitialPin({
        actorContext: actor,
        eventId: draft.event.id,
        pin: '889900',
        idempotencyKey: key
      })
    ]);

    const outcomes = [res1.outcome, res2.outcome].sort();
    expect(outcomes).toEqual(['IDEMPOTENT_REPLAY', 'PIN_SET']);

    const rows = await query<{ pin_enabled: boolean }>(
      'SELECT pin_enabled FROM event WHERE id = $1',
      draft.event.id
    );
    expect(rows[0].pin_enabled).toBe(true);
  });
});
