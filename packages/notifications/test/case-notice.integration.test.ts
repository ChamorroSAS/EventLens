import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  CaseNoticeService,
  NotificationIntentService,
  NoticeProjectionService,
  type DomainFactActorContext,
  type NotificationAuditRecord,
  type NotificationAuditSink
} from '../src/index.js';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('CaseNoticeService (Real PostgreSQL 16 Integration Tests — EL-TK-163)', () => {
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
  let caseService: CaseNoticeService;
  let projectionService: NoticeProjectionService;

  const systemActor: DomainFactActorContext = {
    actorType: 'SYSTEM',
    actorId: 'case-inspection-moderation-pg'
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
    `);
  });

  afterAll(async () => {
    await client.$disconnect();
  });

  beforeEach(async () => {
    await sql('DELETE FROM notification_intent');
    audits = [];
    auditSink = {
      record: async (audit) => {
        audits.push(audit);
      }
    };
    intentService = new NotificationIntentService(txs, auditSink);
    caseService = new CaseNoticeService(intentService, auditSink);
    projectionService = new NoticeProjectionService(txs, auditSink);
  });

  it('persists critical alert for admin and resolution notice for organizer in PostgreSQL', async () => {
    // 1. Critical admin alert
    const adminRes = await caseService.generateCaseNotification({
      actorContext: systemActor,
      caseRef: 'case-pg-crit-1',
      eventRef: 'evt-pg-event-1',
      recipientRef: 'usr-pg-admin-1',
      recipientRole: 'ADMIN',
      recipientEmail: 'admin@eventlens.test',
      severity: 'CRITICAL',
      actionType: 'CASE_REPORTED'
    });

    expect(adminRes.outcome).toBe('NOTICE_GENERATED');

    const adminRows = await query<{ notification_type: string; status: string }>(
      'SELECT notification_type, status FROM notification_intent WHERE id = $1',
      adminRes.intent!.id
    );
    expect(adminRows).toHaveLength(1);
    expect(adminRows[0].notification_type).toBe('CASE_CRITICAL_ALERT');

    // 2. Case resolution notice for organizer
    const orgRes = await caseService.generateCaseNotification({
      actorContext: systemActor,
      caseRef: 'case-pg-crit-1',
      eventRef: 'evt-pg-event-1',
      recipientRef: 'usr-pg-org-1',
      recipientRole: 'ORGANIZER',
      recipientEmail: 'org@eventlens.test',
      severity: 'CRITICAL',
      actionType: 'CASE_RESOLVED'
    });

    expect(orgRes.outcome).toBe('NOTICE_GENERATED');

    const orgRows = await query<{ notification_type: string; payload: any }>(
      'SELECT notification_type, payload FROM notification_intent WHERE id = $1',
      orgRes.intent!.id
    );
    expect(orgRows).toHaveLength(1);
    expect(orgRows[0].notification_type).toBe('CASE_RESOLUTION_NOTICE');

    // 3. Project in-app notices for organizer
    const orgProjection = await projectionService.projectNoticesForOrganizer({
      recipientRef: 'usr-pg-org-1'
    });
    expect(orgProjection.hasActiveNotices).toBe(true);
    expect(orgProjection.notices[0].notificationType).toBe('CASE_RESOLUTION_NOTICE');
    expect(orgProjection.notices[0].severity).toBe('INFO');
  });

  it('honors legal and security notice suppression without persisting intents in PostgreSQL', async () => {
    const suppressionRes = await caseService.generateCaseNotification({
      actorContext: systemActor,
      caseRef: 'case-pg-suppress-2',
      eventRef: 'evt-pg-event-2',
      recipientRef: 'usr-pg-org-2',
      recipientRole: 'ORGANIZER',
      severity: 'CRITICAL',
      actionType: 'CASE_REPORTED',
      suppressNotice: true
    });

    expect(suppressionRes.outcome).toBe('NOTICE_SUPPRESSED');
    expect(suppressionRes.intent).toBeUndefined();

    // Verify 0 rows in database
    const rows = await query<{ count: string }>('SELECT count(*) FROM notification_intent');
    expect(Number(rows[0].count)).toBe(0);

    // Verify audit record created
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('CASE_NOTICE_SUPPRESSED');
  });
});
