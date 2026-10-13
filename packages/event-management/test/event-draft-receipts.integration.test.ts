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

describeIntegration('EventDraftService Receipts & Idempotency (Real PostgreSQL 16 — EL-TK-219)', () => {
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
      email: 'organizer.receipts@eventlens.internal',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };
  }

  it('Criterio 1: Creación durable persiste receipt inmutable junto al DRAFT restrictivo', async () => {
    const service = createService();
    const actor = createMockActor();
    const idempotencyKey = `create-key-${randomUUID()}`;

    const res = await service.createDraft({
      actorContext: actor,
      name: 'Gala Anual de Graduación',
      idempotencyKey
    });

    expect(res.outcome).toBe('CREATED');
    expect(res.receipt).toBeDefined();
    expect(res.receipt?.operation).toBe('CREATE_EVENT');
    expect(res.receipt?.appliedRevision).toBe('1');
    expect(res.receipt?.outcome).toBe('CREATED');
    expect(res.receipt?.eventId).toBe(res.event.id);

    // Verificar persistencia directa en event_command_receipt
    const receiptRows = await query<{
      operation_id: string;
      event_id: string;
      actor_id: string;
      operation: string;
      idempotency_key: string;
      outcome: string;
      applied_revision: string | bigint;
    }>(
      `SELECT operation_id, event_id, actor_id, operation, idempotency_key, outcome, applied_revision
       FROM event_command_receipt
       WHERE actor_id = $1 AND operation = 'CREATE_EVENT' AND idempotency_key = $2`,
      actor.accountId,
      idempotencyKey
    );

    expect(receiptRows).toHaveLength(1);
    expect(receiptRows[0].event_id).toBe(res.event.id);
    expect(receiptRows[0].operation).toBe('CREATE_EVENT');
    expect(receiptRows[0].outcome).toBe('CREATED');
    expect(String(receiptRows[0].applied_revision)).toBe('1');
  });

  it('Criterio 2 & 3: Replay compatible devuelve receipt original y ningún edit posterior reemplaza el receipt de creación', async () => {
    const service = createService();
    const actor = createMockActor();
    const createKey = `create-key-${randomUUID()}`;
    const editKey = `edit-name-key-${randomUUID()}`;

    // 1. Crear evento
    const createRes = await service.createDraft({
      actorContext: actor,
      name: 'Nombre Original de Creación',
      idempotencyKey: createKey
    });
    expect(createRes.outcome).toBe('CREATED');
    const eventId = createRes.event.id;
    const originalOperationId = createRes.receipt?.operationId;

    // 2. Editar nombre con su propia key
    const editRes = await service.updateDraftName({
      actorContext: actor,
      eventId,
      name: 'Nombre Editado Posterior',
      idempotencyKey: editKey
    });
    expect(editRes.outcome).toBe('UPDATED');
    expect(editRes.receipt?.operation).toBe('UPDATE_NAME');
    expect(editRes.receipt?.outcome).toBe('UPDATED');

    // 3. Replay del comando de creación: misma tupla y fingerprint original
    const replayRes = await service.createDraft({
      actorContext: actor,
      name: 'Nombre Original de Creación',
      idempotencyKey: createKey
    });

    expect(replayRes.outcome).toBe('IDEMPOTENT_REPLAY');
    expect(replayRes.receipt?.operationId).toBe(originalOperationId);
    expect(replayRes.receipt?.operation).toBe('CREATE_EVENT');
    expect(replayRes.receipt?.outcome).toBe('CREATED');
    // Estado actual no sobrescribe el nombre editado a lo histórico
    expect(replayRes.event.id).toBe(eventId);
    expect(replayRes.event.name).toBe('Nombre Editado Posterior');

    // 4. Verificar que coexisten ambos receipts sin reemplazo
    const allReceipts = await query<{
      operation: string;
      idempotency_key: string;
      outcome: string;
    }>(
      `SELECT operation, idempotency_key, outcome
       FROM event_command_receipt
       WHERE event_id = $1
       ORDER BY operation ASC`,
      eventId
    );

    expect(allReceipts).toHaveLength(2);
    expect(allReceipts.map((r) => r.operation)).toEqual(['CREATE_EVENT', 'UPDATE_NAME']);
  });

  it('Criterio 4: Conflicto con misma idempotencyKey y payload/nombre diferente lanza IDEMPOTENCY_CONFLICT', async () => {
    const service = createService();
    const actor = createMockActor();
    const idempotencyKey = `conflict-key-${randomUUID()}`;

    await service.createDraft({
      actorContext: actor,
      name: 'Evento Original de Idempotencia',
      idempotencyKey
    });

    await expect(
      service.createDraft({
        actorContext: actor,
        name: 'Evento con Parámetros Modificados',
        idempotencyKey
      })
    ).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT'
    });
  });

  it('Criterio 5: Valida formato de idempotencyKey según regla ASCII 1..128 caracteres [A-Za-z0-9_-]', async () => {
    const service = createService();
    const actor = createMockActor();

    const invalidKeys = [
      '',
      'key with spaces',
      'key$with@special#chars',
      'a'.repeat(129),
      '¿unicode?'
    ];

    for (const badKey of invalidKeys) {
      await expect(
        service.createDraft({
          actorContext: actor,
          name: 'Evento Test Key',
          idempotencyKey: badKey
        })
      ).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT'
      });
    }
  });

  it('Criterio 6: Atomicidad: si la transacción falla, no persisten evento, receipt ni auditoría parciales', async () => {
    const failingRunner = {
      async run<R>(callback: (tx: any) => Promise<R>): Promise<R> {
        return txs.run(async (tx) => {
          await callback(tx);
          throw new Error('SIMULATED_TRANSACTION_FAILURE');
        });
      }
    };

    const auditEvents: EventAuditRecord[] = [];
    const service = new EventDraftService(failingRunner, {
      record: async (rec) => {
        auditEvents.push(rec);
      }
    });

    const actor = createMockActor();
    const idempotencyKey = `atomic-rollback-key-${randomUUID()}`;

    await expect(
      service.createDraft({
        actorContext: actor,
        name: 'Evento Fallo Atómico',
        idempotencyKey
      })
    ).rejects.toThrow('SIMULATED_TRANSACTION_FAILURE');

    // Confirmar que no hay filas en event ni en event_command_receipt
    const eventsCount = await query<{ count: number }>(
      'SELECT count(*)::int as count FROM event WHERE name = $1',
      'Evento Fallo Atómico'
    );
    expect(eventsCount[0].count).toBe(0);

    const receiptsCount = await query<{ count: number }>(
      'SELECT count(*)::int as count FROM event_command_receipt WHERE idempotency_key = $1',
      idempotencyKey
    );
    expect(receiptsCount[0].count).toBe(0);
  });
});
