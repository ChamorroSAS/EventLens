import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  CapacityNoticeService,
  NotificationIntentService,
  NoticeProjectionService,
  type DomainFactActorContext,
  type NotificationAuditRecord,
  type NotificationAuditSink
} from '../src/index.js';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('CapacityNoticeService (Real PostgreSQL 16 Integration Tests — EL-TK-160)', () => {
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
  let capacityService: CapacityNoticeService;
  let projectionService: NoticeProjectionService;

  const systemActor: DomainFactActorContext = {
    actorType: 'SYSTEM',
    actorId: 'capacity-cron-job-pg'
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
    capacityService = new CapacityNoticeService(intentService, auditSink);
    projectionService = new NoticeProjectionService(txs, auditSink);
  });

  it('persists 80% and 100% threshold intents in PostgreSQL and projects them accurately', async () => {
    // 1. Generate 80% threshold notice
    const res80 = await capacityService.generateCapacityThresholdNotice({
      actorContext: systemActor,
      eventId: 'evt-pg-threshold-80',
      organizerRef: 'usr-pg-organizer-1',
      recipientEmail: 'org1@eventlens.test',
      thresholdType: 'USAGE_80',
      thresholdPercent: 80,
      currentStoragePercent: 85
    });

    expect(res80.outcome).toBe('NOTICE_GENERATED');

    // 2. Query DB directly to verify persistence
    const rows80 = await query<{ notification_type: string; status: string }>(
      'SELECT notification_type, status FROM notification_intent WHERE id = $1',
      res80.intent!.id
    );
    expect(rows80).toHaveLength(1);
    expect(rows80[0].notification_type).toBe('CAPACITY_WARNING_80');
    expect(rows80[0].status).toBe('PENDING');

    // 3. Generate 100% threshold notice
    const res100 = await capacityService.generateCapacityThresholdNotice({
      actorContext: systemActor,
      eventId: 'evt-pg-threshold-100',
      organizerRef: 'usr-pg-organizer-1',
      recipientEmail: 'org1@eventlens.test',
      thresholdType: 'USAGE_100',
      thresholdPercent: 100,
      currentStoragePercent: 100
    });

    expect(res100.outcome).toBe('NOTICE_GENERATED');

    // 4. Project in-app notices for organizer
    const projection = await projectionService.projectNoticesForOrganizer({
      recipientRef: 'usr-pg-organizer-1'
    });

    expect(projection.hasActiveNotices).toBe(true);
    expect(projection.totalCount).toBe(2);

    const types = projection.notices.map((n) => n.notificationType);
    expect(types).toContain('CAPACITY_WARNING_80');
    expect(types).toContain('CAPACITY_EXCEEDED_100');
  });

  it('guarantees PostgreSQL idempotency and strict deduplication upon signal replay', async () => {
    const fact = {
      actorContext: systemActor,
      eventId: 'evt-pg-replay-test',
      organizerRef: 'usr-pg-organizer-2',
      thresholdType: 'USAGE_80' as const,
      thresholdPercent: 80,
      currentStoragePercent: 80,
      dedupKey: 'pg-threshold-dedup-key-80'
    };

    const first = await capacityService.generateCapacityThresholdNotice(fact);
    expect(first.outcome).toBe('NOTICE_GENERATED');

    const second = await capacityService.generateCapacityThresholdNotice(fact);
    expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
    expect(second.intent?.id).toBe(first.intent?.id);

    // Verify row count in PostgreSQL is exactly 1
    const countRows = await query<{ count: string }>(
      'SELECT count(*) FROM notification_intent WHERE dedup_key = $1',
      fact.dedupKey
    );
    expect(Number(countRows[0].count)).toBe(1);
  });
});
