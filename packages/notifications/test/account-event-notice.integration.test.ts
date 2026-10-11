import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  NotificationIntentService,
  NoticeProjectionService,
  AccountEventNoticeService,
  type DomainFactActorContext,
  type NotificationAuditRecord,
  type NotificationAuditSink
} from '../src/index.js';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('AccountEventNoticeService (Real PostgreSQL 16 Integration Tests — EL-TK-162)', () => {
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
  let accountEventService: AccountEventNoticeService;

  const systemActor: DomainFactActorContext = {
    actorType: 'SYSTEM',
    actorId: 'system-auth-bus-pg'
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

  afterAll(async () => {
    await client.$disconnect();
  });

  beforeEach(async () => {
    await sql('DELETE FROM notification_intent');
    await sql('DELETE FROM notification_audit_event');
    audits = [];
    auditSink = {
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
    intentService = new NotificationIntentService(txs, auditSink);
    projectionService = new NoticeProjectionService(txs, auditSink);
    accountEventService = new AccountEventNoticeService(intentService, auditSink);
  });

  it('Escenario 1: Persiste aviso de seguridad en PostgreSQL 16 con copy sanitizado', async () => {
    const result = await accountEventService.generateAccountSecurityNotice({
      actorContext: systemActor,
      accountRef: 'org-acc-pg-01',
      recipientEmail: 'security@org.test',
      eventType: 'NEW_LOGIN',
      ipAddress: '192.0.2.1',
      userAgent: 'EventLensApp/2.0'
    });

    expect(result.outcome).toBe('NOTICE_GENERATED');
    expect(result.intent).toBeDefined();

    // Consultar directamente en PostgreSQL
    const rows = await query<{
      id: string;
      recipient_ref: string;
      notification_type: string;
      payload: any;
      status: string;
    }>('SELECT * FROM notification_intent WHERE id = $1', result.intent!.id);

    expect(rows).toHaveLength(1);
    expect(rows[0].recipient_ref).toBe('org-acc-pg-01');
    expect(rows[0].notification_type).toBe('ACCOUNT_SECURITY');
    expect(rows[0].status).toBe('PENDING');

    const payload = typeof rows[0].payload === 'string' ? JSON.parse(rows[0].payload) : rows[0].payload;
    expect(payload.title).toContain('Nuevo inicio de sesión');
    expect(payload.ipAddress).toBe('192.0.2.1');
    expect(payload.token).toBeUndefined();
    expect(payload.password).toBeUndefined();
  });

  it('Escenario 2: Suspensión con motivo restringido no fuga información confidencial a PostgreSQL', async () => {
    const confidentialInternalReason = 'INTERNAL_FRAUD_RING_CASE_ID_98765_CONFIDENTIAL';
    const result = await accountEventService.generateEventSuspensionNotice({
      actorContext: { actorType: 'ADMIN_HUMAN', actorId: 'admin-sec-pg' },
      eventRef: 'evt-restricted-01',
      organizerRef: 'org-acc-pg-02',
      recipientEmail: 'org02@eventlens.test',
      reason: confidentialInternalReason,
      isRestrictedReason: true
    });

    expect(result.outcome).toBe('NOTICE_GENERATED');

    // Verificar en la base de datos PostgreSQL que la razón confidencial no existe en el payload
    const rows = await query<{ payload: any }>(
      'SELECT payload FROM notification_intent WHERE id = $1',
      result.intent!.id
    );
    const payload = typeof rows[0].payload === 'string' ? JSON.parse(rows[0].payload) : rows[0].payload;
    expect(payload.reason).toBe('Revisión administrativa preventiva');
    expect(JSON.stringify(payload)).not.toContain('FRAUD_RING');
    expect(JSON.stringify(payload)).not.toContain('98765');
  });

  it('Escenario 3: Reactivación en PostgreSQL supersedes suspensión previa y la proyección sólo muestra el aviso vigente', async () => {
    const orgRef = 'org-acc-pg-03';
    const eventRef = 'evt-pg-toggle-01';

    // 1. Suspender evento
    const suspension = await accountEventService.generateEventSuspensionNotice({
      actorContext: { actorType: 'ADMIN_HUMAN', actorId: 'admin-pg-1' },
      eventRef,
      organizerRef: orgRef,
      reason: 'Revisión técnica'
    });
    expect(suspension.outcome).toBe('NOTICE_GENERATED');

    // Comprobar que en este punto la proyección muestra suspensión
    const projection1 = await projectionService.projectNoticesForOrganizer({ recipientRef: orgRef });
    expect(projection1.notices).toHaveLength(1);
    expect(projection1.notices[0].notificationType).toBe('EVENT_SUSPENDED');
    expect(projection1.notices[0].severity).toBe('CRITICAL');

    // 2. Reactivar evento
    const reactivation = await accountEventService.generateEventReactivationNotice({
      actorContext: { actorType: 'ADMIN_HUMAN', actorId: 'admin-pg-1' },
      eventRef,
      organizerRef: orgRef
    });
    expect(reactivation.outcome).toBe('SUPERSEDED_PREVIOUS');
    expect(reactivation.supersededCount).toBe(1);

    // Comprobar en PostgreSQL que el registro de suspensión quedó marcado SUPERSEDED
    const suspensionRow = await query<{ status: string; superseded_by: string }>(
      'SELECT status, superseded_by FROM notification_intent WHERE id = $1',
      suspension.intent!.id
    );
    expect(suspensionRow[0].status).toBe('SUPERSEDED');
    expect(suspensionRow[0].superseded_by).toContain(`lifecycle:${eventRef}:reactivated`);

    // 3. Proyectar avisos tras reactivación: ÚNICAMENTE figura la reactivación
    const projection2 = await projectionService.projectNoticesForOrganizer({ recipientRef: orgRef });
    expect(projection2.notices).toHaveLength(1);
    expect(projection2.notices[0].notificationType).toBe('EVENT_REACTIVATED');
    expect(projection2.notices[0].severity).toBe('INFO');
    expect(projection2.notices[0].title).toBe('Evento reactivado');
  });
});
