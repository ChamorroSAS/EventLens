import { describe, it, expect, beforeEach } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  CapacityNoticeService,
  NotificationIntentService,
  NoticeProjectionService,
  EmailRenderer,
  NotificationError,
  type DomainFactActorContext,
  type NotificationAuditRecord,
  type NotificationAuditSink
} from '../src/index.js';

interface InMemoryIntentRow {
  id: string;
  dedup_key: string;
  recipient_ref: string;
  recipient_email?: string | null;
  notification_type: string;
  resource_ref: string;
  status: string;
  payload: string;
  effective_at: Date;
  expires_at?: Date | null;
  superseded_at?: Date | null;
  superseded_by?: string | null;
  created_at: Date;
  updated_at: Date;
}

class MockRunner implements TransactionRunner {
  public intents: InMemoryIntentRow[] = [];

  async run<T>(work: (tx: SqlTransaction) => Promise<T>): Promise<T> {
    const tx: SqlTransaction = {
      query: async <R extends object>(sql: string, ...parameters: unknown[]): Promise<R[]> => {
        const norm = sql.replace(/\s+/g, ' ');
        if (norm.includes('FROM notification_intent WHERE dedup_key = $1')) {
          const dedupKey = parameters[0] as string;
          const found = this.intents.filter((row) => row.dedup_key === dedupKey);
          return found as unknown as R[];
        }

        if (norm.includes('FROM notification_intent WHERE id = $1')) {
          const id = parameters[0] as string;
          const found = this.intents.filter((row) => row.id === id);
          return found as unknown as R[];
        }

        if (norm.includes('FROM notification_intent') && norm.includes('WHERE recipient_ref = $1')) {
          const recipientRef = parameters[0] as string;
          let results = this.intents.filter(
            (row) => row.recipient_ref === recipientRef && row.status !== 'SUPERSEDED' && row.status !== 'CANCELLED'
          );
          if (norm.includes('AND resource_ref = $3')) {
            const resourceRef = parameters[2] as string;
            results = results.filter((row) => row.resource_ref === resourceRef);
          }
          return results as unknown as R[];
        }

        return [] as R[];
      },

      execute: async (sql: string, ...parameters: unknown[]): Promise<number> => {
        const norm = sql.replace(/\s+/g, ' ');

        if (norm.includes('INSERT INTO notification_intent')) {
          const [
            id,
            dedup_key,
            recipient_ref,
            recipient_email,
            notification_type,
            resource_ref,
            payload,
            effective_at,
            expires_at,
            created_at,
            updated_at
          ] = parameters as [
            string,
            string,
            string,
            string | null,
            string,
            string,
            string,
            Date,
            Date | null,
            Date,
            Date
          ];

          this.intents.push({
            id,
            dedup_key,
            recipient_ref,
            recipient_email,
            notification_type,
            resource_ref,
            status: 'PENDING',
            payload,
            effective_at,
            expires_at,
            superseded_at: null,
            superseded_by: null,
            created_at,
            updated_at
          });
          return 1;
        }

        return 0;
      }
    };

    return work(tx);
  }
}

describe('CapacityNoticeService (EL-TK-160 Unit Tests)', () => {
  let runner: MockRunner;
  let audits: NotificationAuditRecord[];
  let auditSink: NotificationAuditSink;
  let intentService: NotificationIntentService;
  let capacityService: CapacityNoticeService;
  let projectionService: NoticeProjectionService;
  let emailRenderer: EmailRenderer;

  const systemActor: DomainFactActorContext = {
    actorType: 'SYSTEM',
    actorId: 'capacity-monitor-job'
  };

  beforeEach(() => {
    runner = new MockRunner();
    audits = [];
    auditSink = {
      record: async (audit) => {
        audits.push(audit);
      }
    };
    intentService = new NotificationIntentService(runner, auditSink);
    capacityService = new CapacityNoticeService(intentService, auditSink);
    projectionService = new NoticeProjectionService(runner, auditSink);
    emailRenderer = new EmailRenderer();
  });

  it('Escenario 1: Generates 80% usage threshold warning with WARNING severity once', async () => {
    const result = await capacityService.generateCapacityThresholdNotice({
      actorContext: systemActor,
      eventId: 'evt-summer-2026',
      organizerRef: 'usr-organizer-42',
      recipientEmail: 'organizer@eventlens.test',
      thresholdType: 'USAGE_80',
      thresholdPercent: 80,
      currentStoragePercent: 82,
      currentFilesPercent: 45,
      consumedBytes: BigInt(820000000),
      limitBytes: BigInt(1000000000)
    });

    expect(result.outcome).toBe('NOTICE_GENERATED');
    expect(result.intent).toBeDefined();
    expect(result.intent?.notificationType).toBe('CAPACITY_WARNING_80');
    expect(result.intent?.recipientRef).toBe('usr-organizer-42');
    expect(result.intent?.recipientEmail).toBe('organizer@eventlens.test');
    expect(result.intent?.resourceRef).toBe('evt-summer-2026');

    const payload = result.intent!.payload;
    expect(payload.severity).toBe('WARNING');
    expect(payload.title).toBe('Capacidad al 80%');
    expect(payload.actionLabel).toBe('Gestionar capacidad');
    expect(payload.actionDestination).toBe('/events/evt-summer-2026/capacity');

    // Audit verification without media leak
    expect(audits).toHaveLength(2); // intent creation audit + capacity service audit
    const capacityAudit = audits.find((a) => a.action === 'CAPACITY_NOTICE_USAGE_80');
    expect(capacityAudit).toBeDefined();
    expect(capacityAudit?.recipientRef).toBe('usr-organizer-42');
    expect(capacityAudit?.result).toBe('CREATED');

    // Projection compatibility
    const notice = projectionService.mapIntentToNotice(result.intent!);
    expect(notice.severity).toBe('WARNING');
    expect(notice.title).toBe('Capacidad al 80%');
    expect(notice.action.destination).toBe('/events/evt-summer-2026/capacity');

    // Email rendering compatibility
    const email = emailRenderer.render(result.intent!);
    expect(email.subject).toContain('80%');
    expect(email.html).toContain('Gestionar capacidad');
  });

  it('Escenario 2: Generates 100% usage threshold alert with CRITICAL severity and authorized extension action', async () => {
    const result = await capacityService.generateCapacityThresholdNotice({
      actorContext: systemActor,
      eventId: 'evt-gala-100',
      organizerRef: 'usr-organizer-99',
      recipientEmail: 'gala@eventlens.test',
      thresholdType: 'USAGE_100',
      thresholdPercent: 100,
      currentStoragePercent: 100,
      currentFilesPercent: 95,
      consumedBytes: BigInt(1000000000),
      limitBytes: BigInt(1000000000)
    });

    expect(result.outcome).toBe('NOTICE_GENERATED');
    expect(result.intent?.notificationType).toBe('CAPACITY_EXCEEDED_100');

    const payload = result.intent!.payload;
    expect(payload.severity).toBe('CRITICAL');
    expect(payload.title).toBe('Capacidad máxima alcanzada (100%)');
    expect(payload.actionLabel).toBe('Ampliar capacidad');
    expect(payload.actionDestination).toBe('/events/evt-gala-100/capacity/extension');

    // Projection compatibility
    const notice = projectionService.mapIntentToNotice(result.intent!);
    expect(notice.severity).toBe('CRITICAL');
    expect(notice.title).toContain('100%');
    expect(notice.action.destination).toBe('/events/evt-gala-100/capacity/extension');

    // Email rendering compatibility
    const email = emailRenderer.render(result.intent!);
    expect(email.subject).toContain('100%');
    expect(email.html).toContain('Solicitar ampliación');
  });

  it('Escenario 3: Replaying the same threshold signal does not duplicate notification', async () => {
    const command = {
      actorContext: systemActor,
      eventId: 'evt-replay-test',
      organizerRef: 'usr-organizer-77',
      recipientEmail: 'replay@eventlens.test',
      thresholdType: 'USAGE_80' as const,
      thresholdPercent: 80,
      currentStoragePercent: 85,
      dedupKey: 'threshold:evt-replay-test:USAGE_80'
    };

    const first = await capacityService.generateCapacityThresholdNotice(command);
    expect(first.outcome).toBe('NOTICE_GENERATED');
    expect(runner.intents).toHaveLength(1);

    // Second execution with identical signal / dedupKey
    const second = await capacityService.generateCapacityThresholdNotice(command);
    expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
    expect(second.intent?.id).toBe(first.intent?.id);
    expect(runner.intents).toHaveLength(1); // strictly deduplicated
  });

  it('Validation: Rejects missing eventId, organizerRef, or invalid thresholdType', async () => {
    await expect(
      capacityService.generateCapacityThresholdNotice({
        actorContext: systemActor,
        eventId: '',
        organizerRef: 'usr-valid',
        thresholdType: 'USAGE_80'
      })
    ).rejects.toThrow(NotificationError);

    await expect(
      capacityService.generateCapacityThresholdNotice({
        actorContext: systemActor,
        eventId: 'evt-valid',
        organizerRef: '',
        thresholdType: 'USAGE_80'
      })
    ).rejects.toThrow(NotificationError);

    await expect(
      capacityService.generateCapacityThresholdNotice({
        actorContext: systemActor,
        eventId: 'evt-valid',
        organizerRef: 'usr-valid',
        thresholdType: 'INVALID_THRESHOLD' as any
      })
    ).rejects.toThrow(NotificationError);
  });
});
