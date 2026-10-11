import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  NotificationIntentService,
  NotificationError,
  type NotificationAuditRecord,
  type NotificationAuditSink,
  type DomainFactActorContext
} from '../src/index.js';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('NotificationIntentService (Real PostgreSQL 16 Integration Tests — EL-TK-156)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  async function query<T extends object>(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.query<T>(statement, ...args));
  }

  const systemActor: DomainFactActorContext = {
    actorType: 'SYSTEM',
    actorId: 'system-domain-bus-pg'
  };

  beforeAll(async () => {
    await sql(`
      CREATE TABLE IF NOT EXISTS "notification_intent" (
        "id" UUID NOT NULL,
        "dedup_key" TEXT NOT NULL,
        "recipient_ref" TEXT NOT NULL,
        "recipient_email" TEXT,
        "notification_type" TEXT NOT NULL,
        "resource_ref" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "payload" JSONB NOT NULL,
        "effective_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expires_at" TIMESTAMPTZ,
        "superseded_at" TIMESTAMPTZ,
        "superseded_by" TEXT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "notification_intent_pkey" PRIMARY KEY ("id")
      );

      CREATE UNIQUE INDEX IF NOT EXISTS "notification_intent_dedup_key_key" ON "notification_intent"("dedup_key");
      CREATE INDEX IF NOT EXISTS "notification_intent_recipient_ref_status_idx" ON "notification_intent"("recipient_ref", "status");
      CREATE INDEX IF NOT EXISTS "notification_intent_resource_ref_status_idx" ON "notification_intent"("resource_ref", "status");

      CREATE TABLE IF NOT EXISTS "notification_audit_event" (
        "id" UUID NOT NULL,
        "intent_id" UUID,
        "dedup_key" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "recipient_ref" TEXT NOT NULL,
        "notification_type" TEXT NOT NULL,
        "result" TEXT NOT NULL,
        "details" TEXT,
        "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "notification_audit_event_pkey" PRIMARY KEY ("id")
      );

      CREATE INDEX IF NOT EXISTS "notification_audit_event_intent_id_idx" ON "notification_audit_event"("intent_id");
      CREATE INDEX IF NOT EXISTS "notification_audit_event_dedup_key_idx" ON "notification_audit_event"("dedup_key");
    `);
  });

  beforeEach(async () => {
    await sql('DELETE FROM notification_intent');
    await sql('DELETE FROM notification_audit_event');
  });

  function createService(audits: NotificationAuditRecord[]) {
    const auditSink: NotificationAuditSink = {
      record: async (record) => {
        audits.push(record);
        await sql(
          `INSERT INTO notification_audit_event (
             id, intent_id, dedup_key, action, recipient_ref, notification_type, result, details, timestamp
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          record.id,
          record.intentId ?? null,
          record.dedupKey,
          record.action,
          record.recipientRef,
          record.notificationType,
          record.result,
          record.details ?? null,
          record.timestamp
        );
      }
    };

    return new NotificationIntentService(txs, auditSink);
  }

  it('persiste NotificationIntent único en PostgreSQL 16 con aislamiento y auditoría', async () => {
    const audits: NotificationAuditRecord[] = [];
    const service = createService(audits);

    const result = await service.recordDomainFact({
      actorContext: systemActor,
      dedupKey: 'account-security:acc-pg-01:new-device',
      recipientRef: 'acc-pg-01',
      recipientEmail: 'security@organizer.test',
      notificationType: 'ACCOUNT_SECURITY',
      resourceRef: 'acc-pg-01',
      payload: { ipAddress: '192.168.1.1', userAgent: 'EventLensMobile/1.0' }
    });

    expect(result.outcome).toBe('CREATED');
    expect(result.intent.id).toBeDefined();

    // Consultar directamente en PostgreSQL 16
    const rows = await query<{
      id: string;
      dedup_key: string;
      recipient_ref: string;
      recipient_email: string;
      notification_type: string;
      status: string;
    }>('SELECT * FROM notification_intent WHERE id = $1', result.intent.id);

    expect(rows).toHaveLength(1);
    expect(rows[0].dedup_key).toBe('account-security:acc-pg-01:new-device');
    expect(rows[0].recipient_ref).toBe('acc-pg-01');
    expect(rows[0].recipient_email).toBe('security@organizer.test');
    expect(rows[0].notification_type).toBe('ACCOUNT_SECURITY');
    expect(rows[0].status).toBe('PENDING');

    // Auditoría persistida en PostgreSQL
    const auditRows = await query<{ action: string; result: string }>(
      'SELECT action, result FROM notification_audit_event WHERE intent_id = $1',
      result.intent.id
    );
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].action).toBe('INTENT_RECORDED');
    expect(auditRows[0].result).toBe('SUCCESS');
  });

  it('idempotencia en PostgreSQL: llamadas repetidas devuelven la intención existente sin duplicar registros', async () => {
    const audits: NotificationAuditRecord[] = [];
    const service = createService(audits);
    const dedupKey = 'quota-alert:evt-pg-01:80';

    const first = await service.recordDomainFact({
      actorContext: systemActor,
      dedupKey,
      recipientRef: 'acc-pg-02',
      notificationType: 'CAPACITY_WARNING_80',
      resourceRef: 'evt-pg-01',
      payload: { usage: 80 }
    });

    const second = await service.recordDomainFact({
      actorContext: systemActor,
      dedupKey,
      recipientRef: 'acc-pg-02',
      notificationType: 'CAPACITY_WARNING_80',
      resourceRef: 'evt-pg-01',
      payload: { usage: 80 }
    });

    expect(first.outcome).toBe('CREATED');
    expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
    expect(second.intent.id).toBe(first.intent.id);

    const countRows = await query<{ count: number }>('SELECT count(*)::int as count FROM notification_intent');
    expect(countRows[0].count).toBe(1);
  });

  it('concurrencia en PostgreSQL: llamadas concurrentes bajo la misma dedupKey garantizan exactamente 1 ganador', async () => {
    const audits: NotificationAuditRecord[] = [];
    const service = createService(audits);
    const dedupKey = 'race-dedup-key-' + randomUUID();

    const promises = [
      service.recordDomainFact({
        actorContext: systemActor,
        dedupKey,
        recipientRef: 'acc-pg-03',
        notificationType: 'EXPORT_AVAILABLE',
        resourceRef: 'exp-01',
        payload: { fileCount: 10 }
      }),
      service.recordDomainFact({
        actorContext: systemActor,
        dedupKey,
        recipientRef: 'acc-pg-03',
        notificationType: 'EXPORT_AVAILABLE',
        resourceRef: 'exp-01',
        payload: { fileCount: 10 }
      }),
      service.recordDomainFact({
        actorContext: systemActor,
        dedupKey,
        recipientRef: 'acc-pg-03',
        notificationType: 'EXPORT_AVAILABLE',
        resourceRef: 'exp-01',
        payload: { fileCount: 10 }
      })
    ];

    const results = await Promise.all(promises);
    expect(results).toHaveLength(3);

    const ids = new Set(results.map((r) => r.intent.id));
    expect(ids.size).toBe(1);

    const countRows = await query<{ count: number }>('SELECT count(*)::int as count FROM notification_intent');
    expect(countRows[0].count).toBe(1);
  });

  it('obsolescencia en PostgreSQL: hechos superseded se actualizan y se excluyen de avisos activos', async () => {
    const audits: NotificationAuditRecord[] = [];
    const service = createService(audits);

    // Hecho 1: Suspensión de evento
    const suspended = await service.recordDomainFact({
      actorContext: systemActor,
      dedupKey: 'lifecycle:evt-pg-10:suspended',
      recipientRef: 'acc-pg-04',
      notificationType: 'EVENT_SUSPENDED',
      resourceRef: 'evt-pg-10',
      payload: { note: 'Review pending' }
    });

    // Hecho 2: Reactivación supersedes Hecho 1
    const reactivated = await service.recordDomainFact({
      actorContext: systemActor,
      dedupKey: 'lifecycle:evt-pg-10:reactivated',
      recipientRef: 'acc-pg-04',
      notificationType: 'EVENT_REACTIVATED',
      resourceRef: 'evt-pg-10',
      payload: { note: 'Reactivated' },
      supersedesDedupKeys: ['lifecycle:evt-pg-10:suspended']
    });

    expect(reactivated.supersededCount).toBe(1);

    // Comprobar estado en DB
    const oldRow = await query<{ status: string; superseded_by: string }>(
      'SELECT status, superseded_by FROM notification_intent WHERE id = $1',
      suspended.intent.id
    );
    expect(oldRow[0].status).toBe('SUPERSEDED');
    expect(oldRow[0].superseded_by).toContain('SUPERSEDED_BY_lifecycle:evt-pg-10:reactivated');

    // La consulta de intenciones activas solo devuelve la reactivación, no la suspensión obsoleta
    const active = await service.findActiveIntentsByRecipient('acc-pg-04');
    expect(active).toHaveLength(1);
    expect(active[0].notificationType).toBe('EVENT_REACTIVATED');
  });

  it('rollback en PostgreSQL: si la transacción falla, ningún registro parcial queda en la base de datos', async () => {
    const audits: NotificationAuditRecord[] = [];
    const service = createService(audits);

    // Intentamos registrar y forzar fallo
    await expect(
      txs.run(async (tx) => {
        await service.recordDomainFact(
          {
            actorContext: systemActor,
            dedupKey: 'rollback-key-01',
            recipientRef: 'acc-pg-05',
            notificationType: 'TEST_ROLLBACK',
            resourceRef: 'res-01',
            payload: { foo: 'bar' }
          },
          tx
        );

        // Forzar error para verificar rollback
        throw new Error('SIMULATED_TRANSACTION_FAILURE');
      })
    ).rejects.toThrow('SIMULATED_TRANSACTION_FAILURE');

    // Verificar que no se insertó nada
    const countRows = await query<{ count: number }>(
      "SELECT count(*)::int as count FROM notification_intent WHERE dedup_key = 'rollback-key-01'"
    );
    expect(countRows[0].count).toBe(0);
  });
});
