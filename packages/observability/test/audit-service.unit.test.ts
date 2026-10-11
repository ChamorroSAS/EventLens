import { describe, expect, it } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  AuditError,
  AuditMetricEvent,
  AuditService,
  AuditTelemetrySink,
  RegisterAuditEventCommand
} from '../src/index.js';

interface FakeRow {
  id: string;
  occurred_at: Date;
  actor_type: string;
  actor_id: string;
  actor_detail: Record<string, unknown> | null;
  action: string;
  resource_type: string;
  resource_id: string;
  result: string;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  idempotency_key: string | null;
  created_at: Date;
}

function createFakeDb() {
  const events = new Map<string, FakeRow>();

  const runner: TransactionRunner = {
    async run<T>(fn: (tx: SqlTransaction) => Promise<T>): Promise<T> {
      const tx: SqlTransaction = {
        async execute(): Promise<number> {
          return 0;
        },
        async query<R = unknown>(sql: string, ...params: unknown[]): Promise<R[]> {
          if (sql.includes('FROM audit_event') && sql.includes('WHERE idempotency_key = $1')) {
            const key = params[0] as string;
            const found = Array.from(events.values()).find((e) => e.idempotency_key === key);
            return (found ? [found] : []) as R[];
          }

          if (sql.includes('INSERT INTO audit_event')) {
            const row: FakeRow = {
              id: params[0] as string,
              occurred_at: params[1] as Date,
              actor_type: params[2] as string,
              actor_id: params[3] as string,
              actor_detail: params[4] ? JSON.parse(params[4] as string) : null,
              action: params[5] as string,
              resource_type: params[6] as string,
              resource_id: params[7] as string,
              result: params[8] as string,
              reason: params[9] as string | null,
              metadata: params[10] ? JSON.parse(params[10] as string) : {},
              idempotency_key: (params[11] as string | null) ?? null,
              created_at: new Date()
            };
            events.set(row.id, row);
            return [row] as R[];
          }

          return [] as R[];
        }
      };
      return fn(tx);
    }
  };

  return { events, runner };
}

describe('AuditService (Unit Tests)', () => {
  it('Scenario 1: registers completed auditable action with actor, action, resource, result and timestamp', async () => {
    const { runner } = createFakeDb();
    const service = new AuditService(runner);

    const command: RegisterAuditEventCommand = {
      actor: {
        type: 'ORGANIZER',
        actorId: '00000000-0000-0000-0000-000000000001',
        detail: { sessionRef: 'sess-abc', ipAddress: '192.168.1.10' }
      },
      action: 'event.published',
      resourceType: 'event',
      resourceId: '11111111-1111-1111-1111-111111111111',
      result: 'SUCCESS',
      metadata: { title: 'Boda Maria y Juan', timezone: 'America/Bogota' }
    };

    const record = await service.registerEvent(command);

    expect(record.id).toBeDefined();
    expect(record.actorType).toBe('ORGANIZER');
    expect(record.actorId).toBe('00000000-0000-0000-0000-000000000001');
    expect(record.actorDetail?.sessionRef).toBe('sess-abc');
    expect(record.action).toBe('event.published');
    expect(record.resourceType).toBe('event');
    expect(record.resourceId).toBe('11111111-1111-1111-1111-111111111111');
    expect(record.result).toBe('SUCCESS');
    expect(record.reason).toBeNull();
    expect(record.metadata.title).toBe('Boda Maria y Juan');
    expect(record.occurredAt).toBeInstanceOf(Date);
  });

  it('Scenario 2: registers failed auditable action with traceable result without leaking sensitive errors', async () => {
    const { runner } = createFakeDb();
    const service = new AuditService(runner);

    const sensitiveError = new Error(
      'Authentication failed against postgresql://admin:super_secret_db_pass@db.internal:5432/eventlens'
    );
    sensitiveError.stack = 'Secret stack trace that should never appear';

    const command: RegisterAuditEventCommand = {
      actor: {
        type: 'ADMIN',
        actorId: 'admin-principal-99'
      },
      action: 'account.login',
      resourceType: 'account',
      resourceId: 'admin-principal-99',
      result: 'FAILURE',
      reason: sensitiveError,
      metadata: { attemptedEmail: 'admin@eventlens.internal', password: 'attempted-password-123' }
    };

    const record = await service.registerEvent(command);

    expect(record.result).toBe('FAILURE');
    expect(record.reason).toBe('Authentication failed against postgresql://[REDACTED]@db.internal:5432/eventlens');
    expect(record.reason).not.toContain('super_secret_db_pass');
    expect(record.reason).not.toContain('stack trace');
    expect(record.metadata.password).toBe('[REDACTED]');
  });

  it('Scenario 3: registers system actor identifying non-human actor without fabricating human user UUID', async () => {
    const { runner } = createFakeDb();
    const service = new AuditService(runner);

    const command: RegisterAuditEventCommand = {
      actor: {
        type: 'SYSTEM',
        systemId: 'cron:retention-purge'
      },
      action: 'maintenance.audit_purged',
      resourceType: 'system',
      resourceId: 'cron:retention-purge',
      result: 'SUCCESS',
      metadata: { expiredRecordsPurged: 420 }
    };

    const record = await service.registerEvent(command);

    expect(record.actorType).toBe('SYSTEM');
    expect(record.actorId).toBe('cron:retention-purge');
    expect(record.action).toBe('maintenance.audit_purged');
    expect(record.metadata.expiredRecordsPurged).toBe(420);
  });

  it('handles idempotency replay returning existing record without re-inserting', async () => {
    const { runner } = createFakeDb();
    const service = new AuditService(runner);

    const command: RegisterAuditEventCommand = {
      idempotencyKey: 'idem-tx-9999',
      actor: {
        type: 'SYSTEM',
        systemId: 'worker:queue'
      },
      action: 'media.quarantined',
      resourceType: 'media',
      resourceId: '22222222-2222-2222-2222-222222222222',
      result: 'SUCCESS',
      metadata: { reason: 'suspicious_format' }
    };

    const first = await service.registerEvent(command);
    const second = await service.registerEvent(command);

    expect(second.id).toBe(first.id);
    expect(second.idempotencyKey).toBe('idem-tx-9999');
  });

  it('emits technical telemetry metric to telemetry sink without recursion', async () => {
    const { runner } = createFakeDb();
    const metricsEmitted: AuditMetricEvent[] = [];

    const telemetrySink: AuditTelemetrySink = {
      recordMetric(event) {
        metricsEmitted.push(event);
      }
    };

    const service = new AuditService(runner, undefined, telemetrySink);

    await service.registerEvent({
      actor: { type: 'ADMIN', actorId: 'admin-1' },
      action: 'access.pin_regenerated',
      resourceType: 'event',
      resourceId: 'evt-1',
      result: 'SUCCESS'
    });

    expect(metricsEmitted.length).toBe(1);
    expect(metricsEmitted[0]?.metricName).toBe('audit.event.recorded');
    expect(metricsEmitted[0]?.dimensions.action).toBe('access.pin_regenerated');
    expect(metricsEmitted[0]?.dimensions.result).toBe('SUCCESS');
  });

  it('anti-recursion guard prevents recursive audit invocation from inside telemetry sink', async () => {
    const { runner } = createFakeDb();
    let recursiveService: AuditService;

    const malfunctioningSink: AuditTelemetrySink = {
      recordMetric() {
        // Attempt to call registerEvent recursively from inside telemetry
        recursiveService.registerEvent({
          actor: { type: 'SYSTEM', systemId: 'telemetry' },
          action: 'telemetry.metric_emitted',
          resourceType: 'telemetry',
          resourceId: 'telemetry',
          result: 'SUCCESS'
        }).catch(() => {
          // caught recursive error
        });
      }
    };

    recursiveService = new AuditService(runner, undefined, malfunctioningSink);

    // Initial event must succeed and anti-recursion guard prevents loop
    const record = await recursiveService.registerEvent({
      actor: { type: 'ADMIN', actorId: 'admin-1' },
      action: 'account.role_assigned',
      resourceType: 'account',
      resourceId: 'acc-1',
      result: 'SUCCESS'
    });

    expect(record.id).toBeDefined();
  });

  it('validates required fields throwing AuditError for invalid inputs', async () => {
    const { runner } = createFakeDb();
    const service = new AuditService(runner);

    // Missing actor
    await expect(
      service.registerEvent({
        actor: null as any,
        action: 'test',
        resourceType: 'test',
        resourceId: 'test',
        result: 'SUCCESS'
      })
    ).rejects.toThrow(AuditError);

    // Empty systemId for SYSTEM actor
    await expect(
      service.registerEvent({
        actor: { type: 'SYSTEM', systemId: '' },
        action: 'test',
        resourceType: 'test',
        resourceId: 'test',
        result: 'SUCCESS'
      })
    ).rejects.toThrow(/System actor must have a non-empty systemId/);

    // Empty actorId for human actor
    await expect(
      service.registerEvent({
        actor: { type: 'ADMIN', actorId: '' },
        action: 'test',
        resourceType: 'test',
        resourceId: 'test',
        result: 'SUCCESS'
      })
    ).rejects.toThrow(/Human actor must have a non-empty actorId/);

    // Empty action
    await expect(
      service.registerEvent({
        actor: { type: 'ADMIN', actorId: 'admin-1' },
        action: '',
        resourceType: 'test',
        resourceId: 'test',
        result: 'SUCCESS'
      })
    ).rejects.toThrow(/Action must be a non-empty string/);

    // Invalid result
    await expect(
      service.registerEvent({
        actor: { type: 'ADMIN', actorId: 'admin-1' },
        action: 'test',
        resourceType: 'test',
        resourceId: 'test',
        result: 'INVALID_RESULT' as any
      })
    ).rejects.toThrow(/Invalid audit result/);
  });
});
