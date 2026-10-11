import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  AuditService,
  AuditSanitizer,
  AuditError,
  AuditMetricEvent,
  AuditTelemetrySink,
  RegisterAuditEventCommand
} from '../src/index.js';

const databaseUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://eventlens:eventlens-local-only@127.0.0.1:15432/eventlens';

describe('AuditService (Real PostgreSQL 16 Integration Tests — EL-TK-166)', () => {
  const client = createPrismaClient(databaseUrl);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  async function query<T extends object>(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.query<T>(statement, ...args));
  }

  beforeAll(async () => {
    await sql(`
      CREATE TABLE IF NOT EXISTS audit_event (
        id UUID PRIMARY KEY,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        actor_type VARCHAR(32) NOT NULL,
        actor_id VARCHAR(128) NOT NULL,
        actor_detail JSONB,
        action VARCHAR(128) NOT NULL,
        resource_type VARCHAR(64) NOT NULL,
        resource_id VARCHAR(128) NOT NULL,
        result VARCHAR(32) NOT NULL,
        reason TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        idempotency_key VARCHAR(128) UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_audit_event_resource ON audit_event (resource_type, resource_id, occurred_at);
      CREATE INDEX IF NOT EXISTS idx_audit_event_actor ON audit_event (actor_type, actor_id, occurred_at);
      CREATE INDEX IF NOT EXISTS idx_audit_event_action ON audit_event (action, occurred_at);
      CREATE INDEX IF NOT EXISTS idx_audit_event_occurred ON audit_event (occurred_at DESC);
    `);
  });

  beforeEach(async () => {
    await sql(`DELETE FROM audit_event WHERE action LIKE 'test.%'`);
  });

  it('persists and retrieves a successful audit event in real PostgreSQL', async () => {
    const service = new AuditService(txs);
    const eventId = randomUUID();
    const eventResourceId = randomUUID();

    const command: RegisterAuditEventCommand = {
      id: eventId,
      actor: {
        type: 'ORGANIZER',
        actorId: randomUUID(),
        detail: { sessionRef: 'sess-test-123' }
      },
      action: 'test.event.created',
      resourceType: 'event',
      resourceId: eventResourceId,
      result: 'SUCCESS',
      metadata: { eventTitle: 'Integration Test Wedding', guestLimit: 120 }
    };

    const recorded = await service.registerEvent(command);

    expect(recorded.id).toBe(eventId);
    expect(recorded.result).toBe('SUCCESS');
    expect(recorded.resourceId).toBe(eventResourceId);

    const rows = await query<{
      id: string;
      action: string;
      result: string;
      metadata: Record<string, unknown>;
    }>(`SELECT id, action, result, metadata FROM audit_event WHERE id = $1`, eventId);

    expect(rows.length).toBe(1);
    expect(rows[0]?.action).toBe('test.event.created');
    expect(rows[0]?.result).toBe('SUCCESS');
  });

  it('sanitizes metadata, removes secrets and excludes multimedia byte blobs in database', async () => {
    const service = new AuditService(txs);
    const eventId = randomUUID();

    const command: RegisterAuditEventCommand = {
      id: eventId,
      actor: {
        type: 'ADMIN',
        actorId: 'admin-principal-1'
      },
      action: 'test.account.password_reset',
      resourceType: 'account',
      resourceId: randomUUID(),
      result: 'SUCCESS',
      metadata: {
        plainPassword: 'leaked_raw_password',
        sessionCookie: 'sid=sensitive_cookie_value',
        rawPhotoBytes: Buffer.from('binary-photo-content'),
        safeField: 'audit_safe_note'
      }
    };

    await service.registerEvent(command);

    const rows = await query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit_event WHERE id = $1`,
      eventId
    );

    const storedMetadata = rows[0]?.metadata ?? {};
    expect(storedMetadata.plainPassword).toBe('[REDACTED]');
    expect(storedMetadata.sessionCookie).toBe('[REDACTED]');
    expect(storedMetadata.rawPhotoBytes).toBe('[BINARY_OMITTED]');
    expect(storedMetadata.safeField).toBe('audit_safe_note');
  });

  it('records failed actions in database without leaking credentials or stack traces', async () => {
    const service = new AuditService(txs);
    const eventId = randomUUID();

    const failure = new Error('Database connection failed to postgresql://user:db_password_123@host:5432/eventlens');
    failure.stack = 'Internal Error stack trace lines with sensitive path: /home/secrets/key.pem';

    const command: RegisterAuditEventCommand = {
      id: eventId,
      actor: {
        type: 'SYSTEM',
        systemId: 'worker:maintenance'
      },
      action: 'test.system.db_sync',
      resourceType: 'system',
      resourceId: 'worker:maintenance',
      result: 'FAILURE',
      reason: failure,
      metadata: { targetCluster: 'primary-db' }
    };

    const recorded = await service.registerEvent(command);

    expect(recorded.result).toBe('FAILURE');
    expect(recorded.reason).not.toContain('db_password_123');
    expect(recorded.reason).not.toContain('Internal Error stack trace');

    const rows = await query<{ reason: string; result: string }>(
      `SELECT reason, result FROM audit_event WHERE id = $1`,
      eventId
    );

    expect(rows[0]?.result).toBe('FAILURE');
    expect(rows[0]?.reason).toContain('postgresql://[REDACTED]@host:5432/eventlens');
  });

  it('enforces idempotency key uniqueness avoiding duplicate entries in PostgreSQL', async () => {
    const service = new AuditService(txs);
    const idempotencyKey = `idem-${randomUUID()}`;

    const command: RegisterAuditEventCommand = {
      idempotencyKey,
      actor: {
        type: 'SYSTEM',
        systemId: 'worker:exporter'
      },
      action: 'test.export.completed',
      resourceType: 'export',
      resourceId: randomUUID(),
      result: 'SUCCESS',
      metadata: { archiveSize: 4096000 }
    };

    const first = await service.registerEvent(command);
    const second = await service.registerEvent(command);

    expect(second.id).toBe(first.id);

    const countRows = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM audit_event WHERE idempotency_key = $1`,
      idempotencyKey
    );

    expect(countRows[0]?.count).toBe('1');
  });

  it('records technical metrics without triggering recursive audit loops in PostgreSQL', async () => {
    const telemetryEvents: AuditMetricEvent[] = [];
    const sink: AuditTelemetrySink = {
      recordMetric(event) {
        telemetryEvents.push(event);
      }
    };

    const service = new AuditService(txs, undefined, sink);

    await service.registerEvent({
      actor: { type: 'ADMIN', actorId: 'admin-telemetry-test' },
      action: 'test.admin.metrics_check',
      resourceType: 'system',
      resourceId: 'metrics',
      result: 'SUCCESS'
    });

    expect(telemetryEvents.length).toBe(1);
    expect(telemetryEvents[0]?.metricName).toBe('audit.event.recorded');
  });
});
