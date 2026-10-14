import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import type { OrganizerActorContext } from '@eventlens/identity';
import {
  EventDraftService,
  EventManagementError,
  type EventAuditSink,
  type EventAuditRecord,
  type EventStatus
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('Event Revision & CAS Concurrency (Real PostgreSQL 16 — EL-TK-220)', () => {
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
        revision BIGINT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Trigger SQL para incremento monotónico ante todo UPDATE
      CREATE OR REPLACE FUNCTION trg_event_increment_revision()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.revision := OLD.revision + 1;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_event_revision ON event;
      CREATE TRIGGER trg_event_revision
      BEFORE UPDATE ON event
      FOR EACH ROW
      EXECUTE FUNCTION trg_event_increment_revision();

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
    `);
  });

  beforeEach(async () => {
    await sql('DELETE FROM event_command_receipt');
    await sql('DELETE FROM event');
    await sql('DELETE FROM admin_audit_event');
  });

  function createService(auditEvents: EventAuditRecord[] = []) {
    const auditSink: EventAuditSink = {
      record: async (event) => {
        auditEvents.push(event);
      }
    };

    return new EventDraftService(txs, auditSink);
  }

  function createMockActor(): OrganizerActorContext {
    return {
      actorType: 'ORGANIZER_HUMAN',
      accountId: randomUUID(),
      email: 'organizer.cas@eventlens.internal',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };
  }

  it('Criterio 1: Creación inicializa revision en 1 y cualquier UPDATE incrementa revision exactamente una vez', async () => {
    const service = createService();
    const actor = createMockActor();

    // 1. Creación
    const created = await service.createDraft({
      actorContext: actor,
      name: 'Evento Revisión Monotónica'
    });
    expect(created.event.revision).toBe('1');

    // 2. Primer update (Nombre)
    const updatedName = await service.updateDraftName({
      actorContext: actor,
      eventId: created.event.id,
      name: 'Nombre Actualizado Paso 1',
      expectedRevision: '1'
    });
    expect(updatedName.event.revision).toBe('2');

    // 3. Segundo update (Horario)
    const updatedSchedule = await service.setSchedule({
      actorContext: actor,
      eventId: created.event.id,
      startsAtLocal: '2026-12-31T20:00',
      expectedRevision: '2'
    });
    expect(updatedSchedule.event.revision).toBe('3');

    // 4. Tercer update (Timezone)
    const updatedTimezone = await service.changeTimezone({
      actorContext: actor,
      eventId: created.event.id,
      timezone: 'America/New_York',
      expectedRevision: '3'
    });
    expect(updatedTimezone.event.revision).toBe('4');

    // Verificar directamente en PostgreSQL
    const rows = await query<{ revision: string | bigint }>(
      'SELECT revision FROM event WHERE id = $1',
      created.event.id
    );
    expect(String(rows[0].revision)).toBe('4');
  });

  it('Criterio 2: Dos escritores con la misma expectedRevision compitiendo: uno gana y el otro recibe CONCURRENCY_CONFLICT 409', async () => {
    const service = createService();
    const actor = createMockActor();

    const created = await service.createDraft({
      actorContext: actor,
      name: 'Evento Competencia Escritores'
    });
    const eventId = created.event.id;
    expect(created.event.revision).toBe('1');

    // Dos llamadas simultáneas ambas esperando revision '1'
    const writer1 = service.updateDraftName({
      actorContext: actor,
      eventId,
      name: 'Nombre Escritor 1',
      expectedRevision: '1'
    });

    const writer2 = service.updateDraftName({
      actorContext: actor,
      eventId,
      name: 'Nombre Escritor 2',
      expectedRevision: '1'
    });

    const results = await Promise.allSettled([writer1, writer2]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactamente 1 escritor modifica exitosamente
    expect(fulfilled).toHaveLength(1);
    // Exactamente 1 escritor recibe CONCURRENCY_CONFLICT
    expect(rejected).toHaveLength(1);

    const error = (rejected[0] as PromiseRejectedResult).reason;
    expect(error).toBeInstanceOf(EventManagementError);
    expect((error as EventManagementError).code).toBe('CONCURRENCY_CONFLICT');

    // La base de datos refleja únicamente el valor del escritor ganador y revision = 2
    const rows = await query<{ name: string; revision: string | bigint }>(
      'SELECT name, revision FROM event WHERE id = $1',
      eventId
    );
    expect(String(rows[0].revision)).toBe('2');
    expect(['Nombre Escritor 1', 'Nombre Escritor 2']).toContain(rows[0].name);
  });

  it('Criterio 3: Rollback transaccional: si ocurre un fallo tras CAS, no queda revisión ni cambio parcial', async () => {
    const actor = createMockActor();
    const initialService = createService();

    const created = await initialService.createDraft({
      actorContext: actor,
      name: 'Evento Rollback'
    });
    const eventId = created.event.id;
    expect(created.event.revision).toBe('1');

    // Runner que simula error forzado dentro de la transacción
    const failingRunner = {
      async run<R>(callback: (tx: any) => Promise<R>): Promise<R> {
        return txs.run(async (tx) => {
          await callback(tx);
          throw new Error('SIMULATED_FAILURE_AFTER_UPDATE');
        });
      }
    };

    const failingService = new EventDraftService(failingRunner);

    await expect(
      failingService.updateDraftName({
        actorContext: actor,
        eventId,
        name: 'Nombre que Debería Revertir',
        expectedRevision: '1'
      })
    ).rejects.toThrow('SIMULATED_FAILURE_AFTER_UPDATE');

    // Confirmar que la fila en PostgreSQL no cambió ni su nombre ni su revisión
    const rows = await query<{ name: string; revision: string | bigint }>(
      'SELECT name, revision FROM event WHERE id = $1',
      eventId
    );
    expect(rows[0].name).toBe('Evento Rollback');
    expect(String(rows[0].revision)).toBe('1');
  });

  it('Criterio 4: Proyecta capacidades granulares exactamente según estado canónico', async () => {
    const service = createService();
    const actor = createMockActor();

    const statuses: Array<{
      status: EventStatus;
      canEditName: boolean;
      canSetLocalSchedule: boolean;
      canChangeTimezone: boolean;
    }> = [
      { status: 'DRAFT', canEditName: true, canSetLocalSchedule: true, canChangeTimezone: true },
      { status: 'SCHEDULED', canEditName: false, canSetLocalSchedule: true, canChangeTimezone: true },
      { status: 'ACTIVE', canEditName: false, canSetLocalSchedule: false, canChangeTimezone: false },
      { status: 'CLOSED', canEditName: false, canSetLocalSchedule: false, canChangeTimezone: false },
      { status: 'GRACE_PERIOD', canEditName: false, canSetLocalSchedule: false, canChangeTimezone: false },
      { status: 'SUSPENDED', canEditName: false, canSetLocalSchedule: false, canChangeTimezone: false },
      { status: 'PENDING_DELETION', canEditName: false, canSetLocalSchedule: false, canChangeTimezone: false },
      { status: 'ARCHIVED', canEditName: false, canSetLocalSchedule: false, canChangeTimezone: false }
    ];

    for (const testCase of statuses) {
      const eventId = randomUUID();
      await sql(
        `INSERT INTO event (id, organizer_id, name, status, timezone, revision, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'America/Bogota', 1, NOW(), NOW())`,
        eventId,
        actor.accountId,
        `Evento Estado ${testCase.status}`,
        testCase.status
      );

      const config = await service.getAuthorizedConfiguration({
        actorContext: actor,
        eventId
      });

      expect(config.capabilities.canEditName).toBe(testCase.canEditName);
      expect(config.capabilities.canSetLocalSchedule).toBe(testCase.canSetLocalSchedule);
      expect(config.capabilities.canChangeTimezone).toBe(testCase.canChangeTimezone);
      expect(config.revision).toBe('1');
    }
  });

  it('Criterio 5: expectedRevision inválida (no numérica) es rechazada con INVALID_ARGUMENT sin efecto', async () => {
    const service = createService();
    const actor = createMockActor();

    const created = await service.createDraft({
      actorContext: actor,
      name: 'Evento Invalid Revision'
    });

    const badRevisions = ['abc', '-1', '1.5', '1728864000000', '', 'null'];

    for (const badRev of badRevisions) {
      await expect(
        service.updateDraftName({
          actorContext: actor,
          eventId: created.event.id,
          name: 'Intento con Mala Revisión',
          expectedRevision: badRev
        })
      ).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT'
      });
    }

    // Comprobar que no hubo mutación
    const rows = await query<{ revision: string | bigint }>(
      'SELECT revision FROM event WHERE id = $1',
      created.event.id
    );
    expect(String(rows[0].revision)).toBe('1');
  });
});
