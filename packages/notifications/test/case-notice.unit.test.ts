import { describe, it, expect, beforeEach } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  CaseNoticeService,
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

describe('CaseNoticeService (EL-TK-163 Unit Tests)', () => {
  let runner: MockRunner;
  let audits: NotificationAuditRecord[];
  let auditSink: NotificationAuditSink;
  let intentService: NotificationIntentService;
  let caseService: CaseNoticeService;
  let projectionService: NoticeProjectionService;
  let emailRenderer: EmailRenderer;

  const systemActor: DomainFactActorContext = {
    actorType: 'SYSTEM',
    actorId: 'inspection-moderation-bus'
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
    caseService = new CaseNoticeService(intentService, auditSink);
    projectionService = new NoticeProjectionService(runner, auditSink);
    emailRenderer = new EmailRenderer();
  });

  it('Escenario 1: Generates critical alert for authorized admin without auto-hiding media', async () => {
    const result = await caseService.generateCaseNotification({
      actorContext: systemActor,
      caseRef: 'case-crit-101',
      eventRef: 'evt-music-festival',
      recipientRef: 'usr-admin-sec-1',
      recipientRole: 'ADMIN',
      recipientEmail: 'security-admin@eventlens.test',
      severity: 'CRITICAL',
      actionType: 'CASE_REPORTED',
      summary: 'Reporte de violación severa'
    });

    expect(result.outcome).toBe('NOTICE_GENERATED');
    expect(result.intent).toBeDefined();
    expect(result.intent?.notificationType).toBe('CASE_CRITICAL_ALERT');
    expect(result.intent?.recipientRef).toBe('usr-admin-sec-1');
    expect(result.intent?.resourceRef).toBe('evt-music-festival');

    const payload = result.intent!.payload;
    expect(payload.severity).toBe('CRITICAL');
    expect(payload.title).toBe('Alerta prioritaria de moderación');
    expect(payload.actionLabel).toBe('Revisar caso');
    expect(payload.actionDestination).toBe('/admin/cases/case-crit-101');
    // Verify media status is not altered by notice creation
    expect(payload.mediaHidden).toBeUndefined();

    // Verify audit recorded
    const caseAudit = audits.find((a) => a.action === 'CASE_NOTICE_CASE_REPORTED');
    expect(caseAudit).toBeDefined();
    expect(caseAudit?.recipientRef).toBe('usr-admin-sec-1');

    // Projection compatibility
    const notice = projectionService.mapIntentToNotice(result.intent!);
    expect(notice.severity).toBe('CRITICAL');
    expect(notice.title).toBe('Alerta prioritaria de moderación');
    expect(notice.action.destination).toBe('/admin/cases/case-crit-101');

    // Email rendering compatibility
    const email = emailRenderer.render(result.intent!);
    expect(email.subject).toContain('Alerta prioritaria');
    expect(email.html).toContain('Revisar caso');
  });

  it('Escenario 2: Generates minimal authorized copy for event owner upon case resolution', async () => {
    const result = await caseService.generateCaseNotification({
      actorContext: systemActor,
      caseRef: 'case-res-202',
      eventRef: 'evt-wedding-2026',
      recipientRef: 'usr-organizer-alice',
      recipientRole: 'ORGANIZER',
      recipientEmail: 'alice@eventlens.test',
      severity: 'NORMAL',
      actionType: 'CASE_RESOLVED',
      summary: 'Revisión finalizada'
    });

    expect(result.outcome).toBe('NOTICE_GENERATED');
    expect(result.intent?.notificationType).toBe('CASE_RESOLUTION_NOTICE');
    expect(result.intent?.recipientRef).toBe('usr-organizer-alice');

    const payload = result.intent!.payload;
    expect(payload.severity).toBe('INFO');
    expect(payload.title).toBe('Resolución de revisión en tu evento');
    expect(payload.actionLabel).toBe('Ver detalles de moderación');
    expect(payload.actionDestination).toBe('/events/evt-wedding-2026/moderation');

    // Projection compatibility
    const notice = projectionService.mapIntentToNotice(result.intent!);
    expect(notice.severity).toBe('INFO');
    expect(notice.title).toBe('Resolución de revisión en tu evento');
    expect(notice.action.destination).toBe('/events/evt-wedding-2026/moderation');

    // Email rendering compatibility
    const email = emailRenderer.render(result.intent!);
    expect(email.subject).toContain('Actualización sobre una moderación');
    expect(email.html).toContain('Ver detalles de moderación');
  });

  it('Escenario 2b: Generates minimal authorized copy for administrative intervention', async () => {
    const result = await caseService.generateCaseNotification({
      actorContext: systemActor,
      caseRef: 'case-intervention-303',
      eventRef: 'evt-birthday-303',
      recipientRef: 'usr-organizer-bob',
      recipientRole: 'ORGANIZER',
      recipientEmail: 'bob@eventlens.test',
      severity: 'NORMAL',
      actionType: 'ADMIN_INTERVENTION'
    });

    expect(result.outcome).toBe('NOTICE_GENERATED');
    expect(result.intent?.notificationType).toBe('ADMIN_INTERVENTION');
    expect(result.intent?.payload.severity).toBe('WARNING');
    expect(result.intent?.payload.actionDestination).toBe('/events/evt-birthday-303');
  });

  it('Escenario 3: Legal and security suppression records audit and generates no intent', async () => {
    const result = await caseService.generateCaseNotification({
      actorContext: systemActor,
      caseRef: 'case-legal-404',
      eventRef: 'evt-confidential',
      recipientRef: 'usr-organizer-mallory',
      recipientRole: 'ORGANIZER',
      recipientEmail: 'mallory@eventlens.test',
      severity: 'CRITICAL',
      actionType: 'CASE_REPORTED',
      suppressNotice: true,
      suppressionRef: 'court-order-ref-789'
    });

    expect(result.outcome).toBe('NOTICE_SUPPRESSED');
    expect(result.suppressedReason).toBe('LEGAL_OR_SECURITY_SUPPRESSION');
    expect(result.intent).toBeUndefined();
    expect(runner.intents).toHaveLength(0); // Zero intents created

    // Verify minimal audit without leaking sensitive legal/investigation directives
    const suppressionAudit = audits.find((a) => a.action === 'CASE_NOTICE_SUPPRESSED');
    expect(suppressionAudit).toBeDefined();
    expect(suppressionAudit?.recipientRef).toBe('usr-organizer-mallory');
    expect(suppressionAudit?.result).toBe('SUPPRESSED');
    expect(suppressionAudit?.details).not.toContain('court-order-ref-789'); // no leak of suppression reference
  });

  it('Zero leak: Never leaks reporter identity or media preview files into notification intent', async () => {
    const maliciousPayloadFact = {
      actorContext: systemActor,
      caseRef: 'case-leak-test',
      eventRef: 'evt-private',
      recipientRef: 'usr-organizer-leak-target',
      recipientRole: 'ORGANIZER' as const,
      recipientEmail: 'target@eventlens.test',
      severity: 'NORMAL' as const,
      actionType: 'CASE_RESOLVED' as const,
      reporterEmail: 'whistleblower@anonymous.test',
      reporterName: 'Anonymous Reporter',
      mediaUrl: 'https://s3.eventlens.test/quarantine/sensitive-photo.jpg'
    };

    const result = await caseService.generateCaseNotification(maliciousPayloadFact as any);

    expect(result.outcome).toBe('NOTICE_GENERATED');
    const payload = result.intent!.payload;

    expect(payload.reporterEmail).toBeUndefined();
    expect(payload.reporterName).toBeUndefined();
    expect(payload.mediaUrl).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('whistleblower@anonymous.test');
    expect(JSON.stringify(payload)).not.toContain('sensitive-photo.jpg');
  });

  it('Deduplication: Replaying the same case notification fact does not create duplicate intents', async () => {
    const fact = {
      actorContext: systemActor,
      caseRef: 'case-replay-505',
      eventRef: 'evt-replay-event',
      recipientRef: 'usr-admin-ops',
      recipientRole: 'ADMIN' as const,
      recipientEmail: 'admin-ops@eventlens.test',
      severity: 'CRITICAL' as const,
      actionType: 'CASE_REPORTED' as const
    };

    const first = await caseService.generateCaseNotification(fact);
    expect(first.outcome).toBe('NOTICE_GENERATED');
    expect(runner.intents).toHaveLength(1);

    const second = await caseService.generateCaseNotification(fact);
    expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
    expect(second.intent?.id).toBe(first.intent?.id);
    expect(runner.intents).toHaveLength(1);
  });

  it('Validation: Rejects missing required references or invalid recipientRole', async () => {
    await expect(
      caseService.generateCaseNotification({
        actorContext: systemActor,
        caseRef: '',
        eventRef: 'evt-valid',
        recipientRef: 'usr-valid',
        recipientRole: 'ADMIN',
        severity: 'CRITICAL',
        actionType: 'CASE_REPORTED'
      })
    ).rejects.toThrow(NotificationError);

    await expect(
      caseService.generateCaseNotification({
        actorContext: systemActor,
        caseRef: 'case-valid',
        eventRef: '',
        recipientRef: 'usr-valid',
        recipientRole: 'ADMIN',
        severity: 'CRITICAL',
        actionType: 'CASE_REPORTED'
      })
    ).rejects.toThrow(NotificationError);

    await expect(
      caseService.generateCaseNotification({
        actorContext: systemActor,
        caseRef: 'case-valid',
        eventRef: 'evt-valid',
        recipientRef: '',
        recipientRole: 'ADMIN',
        severity: 'CRITICAL',
        actionType: 'CASE_REPORTED'
      })
    ).rejects.toThrow(NotificationError);

    await expect(
      caseService.generateCaseNotification({
        actorContext: systemActor,
        caseRef: 'case-valid',
        eventRef: 'evt-valid',
        recipientRef: 'usr-valid',
        recipientRole: 'GUEST' as any,
        severity: 'CRITICAL',
        actionType: 'CASE_REPORTED'
      })
    ).rejects.toThrow(NotificationError);
  });
});
