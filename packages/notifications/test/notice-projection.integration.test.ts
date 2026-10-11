import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  NotificationIntentService,
  NoticeProjectionService,
  type NotificationAuditRecord,
  type NotificationAuditSink
} from '../src/index.js';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('NoticeProjectionService (Real PostgreSQL 16 Integration Tests — EL-TK-158)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  async function query<T extends object>(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.query<T>(statement, ...args));
  }

  let audits: NotificationAuditRecord[];
  let auditSink: NotificationAuditSink;
  let intentService: NotificationIntentService;
  let projectionService: NoticeProjectionService;

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
    `);
  });

  afterAll(async () => {
    await client.$disconnect();
  });

  beforeEach(async () => {
    await sql('DELETE FROM notification_intent');
    audits = [];
    auditSink = {
      record: async (record) => {
        audits.push(record);
      }
    };
    intentService = new NotificationIntentService(txs, auditSink);
    projectionService = new NoticeProjectionService(txs, auditSink);
  });

  it('Escenario 1: Proyecta avisos vigentes desde PostgreSQL 16 con aislamiento y deduplicación', async () => {
    const orgA = 'org-account-A';
    const orgB = 'org-account-B';

    // 1. Crear avisos para orgA en PostgreSQL 16
    await intentService.recordDomainFact({
      actorContext: { actorType: 'SYSTEM', actorId: 'system-bus' },
      dedupKey: 'capacity:evt-1:80',
      recipientRef: orgA,
      notificationType: 'CAPACITY_WARNING_80',
      resourceRef: 'evt-1',
      payload: { current: 800, limit: 1000 }
    });

    await intentService.recordDomainFact({
      actorContext: { actorType: 'SYSTEM', actorId: 'system-bus' },
      dedupKey: 'export:evt-1:avail',
      recipientRef: orgA,
      notificationType: 'EXPORT_AVAILABLE',
      resourceRef: 'evt-1',
      payload: { exportId: 'exp-123' },
      expiresAt: new Date(Date.now() + 48 * 3600 * 1000)
    });

    // 2. Crear aviso para orgB (debe estar aislado)
    await intentService.recordDomainFact({
      actorContext: { actorType: 'SYSTEM', actorId: 'system-bus' },
      dedupKey: 'security:org-B:suspicious',
      recipientRef: orgB,
      notificationType: 'ACCOUNT_SECURITY',
      resourceRef: 'orgB',
      payload: { ip: '10.0.0.1' }
    });

    // 3. Consultar proyección para orgA
    const projection = await projectionService.projectNoticesForOrganizer({
      recipientRef: orgA
    });

    expect(projection.recipientRef).toBe(orgA);
    expect(projection.hasActiveNotices).toBe(true);
    expect(projection.totalCount).toBe(2);

    // Verificar que los avisos contienen la semántica esperada
    const capacityNotice = projection.notices.find((n) => n.notificationType === 'CAPACITY_WARNING_80');
    expect(capacityNotice).toBeDefined();
    expect(capacityNotice!.title).toBe('Capacidad al 80%');
    expect(capacityNotice!.severity).toBe('WARNING');
    expect(capacityNotice!.action.destination).toBe('/events/evt-1/capacity');

    const exportNotice = projection.notices.find((n) => n.notificationType === 'EXPORT_AVAILABLE');
    expect(exportNotice).toBeDefined();
    expect(exportNotice!.title).toBe('Descarga de recuerdos disponible');
    expect(exportNotice!.severity).toBe('INFO');
    expect(exportNotice!.action.destination).toBe('/events/evt-1/exports');
    expect(exportNotice!.validUntil).toBeInstanceOf(Date);

    // Ningún aviso de orgB aparece en orgA
    expect(projection.notices.some((n) => n.recipientRef === orgB)).toBe(false);
  });

  it('Escenario 2: Retorna proyección vacía sin banner invasivo cuando no hay avisos vigentes', async () => {
    const projection = await projectionService.projectNoticesForOrganizer({
      recipientRef: 'empty-organizer'
    });

    expect(projection.recipientRef).toBe('empty-organizer');
    expect(projection.notices).toEqual([]);
    expect(projection.totalCount).toBe(0);
    expect(projection.hasActiveNotices).toBe(false);
    expect(projection.projectedAt).toBeInstanceOf(Date);
  });

  it('Escenario 3: Excluye avisos obsoletos (SUPERSEDED) o expirados (expires_at en el pasado)', async () => {
    const org = 'org-lifecycle-test';

    // 1. Aviso de suspensión
    const suspended = await intentService.recordDomainFact({
      actorContext: { actorType: 'SYSTEM', actorId: 'system-bus' },
      dedupKey: 'lifecycle:evt-33:suspended',
      recipientRef: org,
      notificationType: 'EVENT_SUSPENDED',
      resourceRef: 'evt-33',
      payload: { reason: 'Policy check' }
    });

    // 2. Reactivación que invalida / supersedes la suspensión
    await intentService.recordDomainFact({
      actorContext: { actorType: 'SYSTEM', actorId: 'system-bus' },
      dedupKey: 'lifecycle:evt-33:reactivated',
      recipientRef: org,
      notificationType: 'EVENT_REACTIVATED',
      resourceRef: 'evt-33',
      payload: { reason: 'Cleared' },
      supersedesDedupKeys: ['lifecycle:evt-33:suspended']
    });

    // 3. Aviso de exportación expirada en el pasado
    await sql(
      `INSERT INTO notification_intent (
         id, dedup_key, recipient_ref, notification_type, resource_ref,
         status, payload, effective_at, expires_at, created_at, updated_at
       ) VALUES ($1, $2, $3, 'EXPORT_AVAILABLE', 'evt-33', 'PENDING', '{}',
                 clock_timestamp() - interval '2 days',
                 clock_timestamp() - interval '1 hour',
                 clock_timestamp(), clock_timestamp())`,
      randomUUID(),
      'export:evt-33:expired',
      org
    );

    // 4. Proyectar avisos
    const projection = await projectionService.projectNoticesForOrganizer({
      recipientRef: org
    });

    // Sólo debe figurar la reactivación; la suspensión (SUPERSEDED) y la exportación (expirada) se excluyen
    expect(projection.notices).toHaveLength(1);
    expect(projection.notices[0].notificationType).toBe('EVENT_REACTIVATED');
    expect(projection.notices[0].severity).toBe('INFO');
  });
});
