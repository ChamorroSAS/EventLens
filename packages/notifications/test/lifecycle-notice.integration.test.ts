import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  LifecycleNoticeService,
  NotificationIntentService,
  type DomainFactActorContext,
  type LifecycleTimelineFact,
  type NotificationAuditRecord,
  type NotificationAuditSink
} from '../src/index.js';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('LifecycleNoticeService (Real PostgreSQL Integration Tests — EL-TK-159)', () => {
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
    actorId: 'system-lifecycle-scheduler-pg'
  };

  /** Canonical fact for a 30d validity + 7d grace event starting in 2 days */
  function buildFact(overrides: Partial<LifecycleTimelineFact> = {}): LifecycleTimelineFact {
    const now = new Date();
    const scheduledAt = new Date(now.getTime() + 2 * 24 * 3600 * 1000);
    const expiresAt = new Date(scheduledAt.getTime() + 30 * 24 * 3600 * 1000);
    const graceEndsAt = new Date(expiresAt.getTime() + 7 * 24 * 3600 * 1000);
    return {
      actorContext: systemActor,
      eventRef: 'evt-lc-pg-01',
      eventName: 'Evento Lifecycle PG',
      organizerRef: 'org-lc-pg-01',
      recipientEmail: 'organizer-pg@eventlens.test',
      scheduledAt,
      expiresAt,
      graceEndsAt,
      timezone: 'America/Mexico_City',
      ...overrides
    };
  }

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
    const intentService = new NotificationIntentService(txs, auditSink);
    return new LifecycleNoticeService(intentService, auditSink);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Escenario 1: Hito futuro → crea intención única en PostgreSQL
  // ────────────────────────────────────────────────────────────────────────────
  it('Escenario 1 — genera y persiste los 7 hitos de lifecycle en PostgreSQL', async () => {
    const audits: NotificationAuditRecord[] = [];
    const service = createService(audits);
    const fact = buildFact();
    const now = new Date();

    const result = await service.scheduleLifecycleNotices(fact, now);

    expect(result.scheduledCount).toBe(7);
    expect(result.skippedCount).toBe(0);

    const rows = await query<{ notification_type: string; status: string; dedup_key: string }>(
      `SELECT notification_type, status, dedup_key
       FROM notification_intent
       WHERE recipient_ref = $1
       ORDER BY effective_at ASC`,
      'org-lc-pg-01'
    );

    expect(rows).toHaveLength(7);
    const types = rows.map((r) => r.notification_type);
    expect(types).toContain('LIFECYCLE_EVENT_UPCOMING_24H');
    expect(types).toContain('LIFECYCLE_EXPIRY_WARNING_7D');
    expect(types).toContain('LIFECYCLE_EXPIRY_WARNING_3D');
    expect(types).toContain('LIFECYCLE_EXPIRY_WARNING_1D');
    expect(types).toContain('LIFECYCLE_GRACE_ENTERED');
    expect(types).toContain('LIFECYCLE_DELETION_UPCOMING');
    expect(types).toContain('LIFECYCLE_DELETED');

    for (const row of rows) {
      expect(row.status).toBe('PENDING');
    }

    // Auditoría de scheduling registrada en PostgreSQL
    const auditRows = await query<{ action: string; details: string }>(
      `SELECT action, details FROM notification_audit_event WHERE action = $1`,
      'LIFECYCLE_NOTICES_SCHEDULED'
    );
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].details).toContain('evt-lc-pg-01');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Escenario 1: Idempotencia en PostgreSQL
  // ────────────────────────────────────────────────────────────────────────────
  it('Escenario 1 — idempotencia en PostgreSQL: reevaluación no duplica intenciones', async () => {
    const audits: NotificationAuditRecord[] = [];
    const service = createService(audits);
    const fact = buildFact();
    const now = new Date();

    const first = await service.scheduleLifecycleNotices(fact, now);
    const second = await service.scheduleLifecycleNotices(fact, now);

    expect(first.scheduledCount).toBe(7);
    expect(second.scheduledCount).toBe(0);

    const countRow = await query<{ count: number }>(
      'SELECT count(*)::int as count FROM notification_intent WHERE recipient_ref = $1',
      'org-lc-pg-01'
    );
    expect(countRow[0].count).toBe(7);

    for (const m of second.milestones) {
      if (m.outcome !== 'SKIPPED_WINDOW_TOO_SHORT') {
        expect(m.outcome).toBe('IDEMPOTENT_REPLAY');
      }
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Escenario 2: Extensión de vigencia → supersesión en PostgreSQL
  // ────────────────────────────────────────────────────────────────────────────
  it('Escenario 2 — extensión de vigencia: avisos anteriores supersedidos y nuevos creados en PostgreSQL', async () => {
    const audits: NotificationAuditRecord[] = [];
    const service = createService(audits);
    const now = new Date();

    const originalFact = buildFact({ windowKey: 'lc-win:evt-lc-pg-01:original' });
    const firstResult = await service.scheduleLifecycleNotices(originalFact, now);
    expect(firstResult.scheduledCount).toBeGreaterThan(0);

    // Extend validity by 10 days
    const extendedFact = buildFact({
      windowKey: 'lc-win:evt-lc-pg-01:extended',
      expiresAt: new Date(originalFact.expiresAt.getTime() + 10 * 24 * 3600 * 1000),
      graceEndsAt: new Date(originalFact.graceEndsAt.getTime() + 10 * 24 * 3600 * 1000)
    });

    const extendedResult = await service.rescheduleAfterExtension(
      extendedFact,
      'lc-win:evt-lc-pg-01:original',
      now
    );

    expect(extendedResult.supersededCount).toBeGreaterThan(0);
    expect(extendedResult.scheduledCount).toBeGreaterThan(0);

    // Original window notices are SUPERSEDED
    const supersededRows = await query<{ status: string; dedup_key: string }>(
      `SELECT status, dedup_key FROM notification_intent WHERE dedup_key LIKE $1`,
      '%original%'
    );
    for (const row of supersededRows) {
      expect(row.status).toBe('SUPERSEDED');
    }

    // New window notices are PENDING
    const newRows = await query<{ status: string; dedup_key: string }>(
      `SELECT status, dedup_key FROM notification_intent WHERE dedup_key LIKE $1`,
      '%extended%'
    );
    expect(newRows.length).toBeGreaterThan(0);
    for (const row of newRows) {
      expect(row.status).toBe('PENDING');
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Escenario 3: Vigencia corta → solo genera avisos posibles en PostgreSQL
  // ────────────────────────────────────────────────────────────────────────────
  it('Escenario 3 — vigencia corta: solo genera hitos aplicables sin duplicar en PostgreSQL', async () => {
    const audits: NotificationAuditRecord[] = [];
    const service = createService(audits);
    const now = new Date();

    // scheduledAt ya pasó; expiresAt en 2 días (< 7d warning)
    const scheduledAt = new Date(now.getTime() - 60 * 1000);
    const expiresAt = new Date(now.getTime() + 2 * 24 * 3600 * 1000);
    const graceEndsAt = new Date(expiresAt.getTime() + 7 * 24 * 3600 * 1000);

    const shortFact = buildFact({ scheduledAt, expiresAt, graceEndsAt, eventRef: 'evt-lc-pg-short' });
    const result = await service.scheduleLifecycleNotices(shortFact, now);

    // Should generate some, skip some — never crash, never duplicate
    expect(result.milestones).toHaveLength(7);
    const skipped = result.milestones.filter((m) => m.outcome === 'SKIPPED_WINDOW_TOO_SHORT');
    expect(skipped.length).toBeGreaterThan(0);

    // DB count matches scheduledCount
    const countRow = await query<{ count: number }>(
      'SELECT count(*)::int as count FROM notification_intent WHERE resource_ref = $1',
      'evt-lc-pg-short'
    );
    expect(countRow[0].count).toBe(result.scheduledCount);

    // Re-evaluation does not duplicate
    const result2 = await service.scheduleLifecycleNotices(shortFact, now);
    const countRow2 = await query<{ count: number }>(
      'SELECT count(*)::int as count FROM notification_intent WHERE resource_ref = $1',
      'evt-lc-pg-short'
    );
    expect(countRow2[0].count).toBe(result.scheduledCount);
    expect(result2.scheduledCount).toBe(0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Job repetido: comportamiento idempotente ante múltiples ejecuciones paralelas
  // ────────────────────────────────────────────────────────────────────────────
  it('job repetido: concurrencia de dos ejecuciones del scheduler produce exactamente 7 intenciones', async () => {
    const audits: NotificationAuditRecord[] = [];
    const service = createService(audits);
    const fact = buildFact({ eventRef: 'evt-lc-pg-concurrent' });
    const now = new Date();

    // Simulate two scheduler job executions running concurrently
    const [r1, r2] = await Promise.all([
      service.scheduleLifecycleNotices(fact, now),
      service.scheduleLifecycleNotices(fact, now)
    ]);

    const countRow = await query<{ count: number }>(
      'SELECT count(*)::int as count FROM notification_intent WHERE resource_ref = $1',
      'evt-lc-pg-concurrent'
    );
    expect(countRow[0].count).toBe(7);

    // Combined scheduled count should add up to 7 (no duplicates)
    expect(r1.scheduledCount + r2.scheduledCount).toBe(7);
  });
});
