import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import type { Execution, JobSpec, JobQueuePostgres } from '@eventlens/job-queue';
import {
  NotificationIntentService,
  EmailNotificationService,
  NoticeProjectionService,
  EmailRenderer,
  FakeEmailSender,
  AccountEventNoticeService,
  CapacityNoticeService,
  CaseNoticeService,
  LifecycleNoticeService,
  ExportNoticeService,
  type DomainFactActorContext,
  type NotificationAuditRecord,
  type NotificationAuditSink,
  type SendEmailRequest
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

interface InMemoryAttemptRow {
  id: string;
  intent_id: string;
  job_id?: string | null;
  attempt_number: number;
  channel: string;
  status: string;
  provider_message_id?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  latency_ms?: number | null;
  attempted_at: Date;
}

class MockJobQueue {
  public published: JobSpec[] = [];
  public completed: Array<{ job: Execution; operationId: string; outcome: any }> = [];
  public retried: Array<{ job: Execution; operationId: string; outcome: any; retryAt: Date | null; disposition: string }> = [];

  constructor(private runner?: MockRunner) {}

  setRunner(runner: MockRunner) {
    this.runner = runner;
  }

  async publish(tx: SqlTransaction, spec: JobSpec): Promise<string> {
    this.published.push(spec);
    return `job-${randomUUID()}`;
  }

  async complete(
    job: Execution,
    operationId: string,
    outcome: any,
    effect?: (tx: SqlTransaction) => Promise<void>
  ): Promise<'COMPLETED'> {
    if (effect && this.runner) {
      await this.runner.run(async (tx) => {
        await effect(tx);
      });
    }
    this.completed.push({ job, operationId, outcome });
    return 'COMPLETED';
  }

  async retry(
    job: Execution,
    operationId: string,
    outcome: any,
    retryAt: Date | null,
    disposition: 'RETRYING' | 'FAILED' | 'DEAD',
    effect?: (tx: SqlTransaction) => Promise<void>
  ): Promise<any> {
    if (effect && this.runner) {
      await this.runner.run(async (tx) => {
        await effect(tx);
      });
    }
    this.retried.push({ job, operationId, outcome, retryAt, disposition });
    return disposition;
  }
}

class MockRunner implements TransactionRunner {
  public intents: InMemoryIntentRow[] = [];
  public attempts: InMemoryAttemptRow[] = [];

  async run<T>(work: (tx: SqlTransaction) => Promise<T>): Promise<T> {
    const tx: SqlTransaction = {
      query: async <R extends object>(sql: string, ...parameters: unknown[]): Promise<R[]> => {
        const norm = sql.replace(/\s+/g, ' ');

        if (norm.includes('FROM notification_intent WHERE dedup_key = $1')) {
          const dedupKey = parameters[0] as string;
          return this.intents.filter((row) => row.dedup_key === dedupKey) as unknown as R[];
        }

        if (norm.includes('FROM notification_intent WHERE id = $1')) {
          const id = parameters[0] as string;
          return this.intents.filter((row) => row.id === id) as unknown as R[];
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

        if (norm.includes('FROM notification_delivery_attempt WHERE intent_id = $1')) {
          const intentId = parameters[0] as string;
          const rows = this.attempts.filter((a) => a.intent_id === intentId);
          return rows as unknown as R[];
        }

        return [] as R[];
      },

      execute: async (sql: string, ...parameters: unknown[]): Promise<number> => {
        const norm = sql.replace(/\s+/g, ' ');

        if (norm.includes('INSERT INTO notification_intent')) {
          const [id, dedup_key, recipient_ref, recipient_email, notification_type, resource_ref, payload, effective_at, expires_at, created_at] =
            parameters as [string, string, string, string | null, string, string, string, Date, Date | null, Date];

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
            updated_at: created_at
          });
          return 1;
        }

        if (norm.includes('UPDATE notification_intent SET status =') && norm.includes('WHERE dedup_key = $3 AND status = \'PENDING\'')) {
          const now = parameters[0] as Date;
          const supersededBy = parameters[1] as string;
          const oldDedupKey = parameters[2] as string;

          let count = 0;
          for (const row of this.intents) {
            if (row.dedup_key === oldDedupKey && row.status === 'PENDING') {
              row.status = 'SUPERSEDED';
              row.superseded_by = supersededBy;
              row.superseded_at = now;
              row.updated_at = now;
              count++;
            }
          }
          return count;
        }

        if (norm.includes('UPDATE notification_intent') && norm.includes('WHERE id =')) {
          const status = parameters[0] as string;
          const id = (parameters.length >= 3 ? parameters[2] : parameters[1]) as string;
          const row = this.intents.find((r) => r.id === id);
          if (row) {
            row.status = status;
            row.updated_at = new Date();
            return 1;
          }
          return 0;
        }

        if (norm.includes('INSERT INTO notification_delivery_attempt')) {
          const [id, intent_id, job_id, attempt_number, channel, status, provider_message_id, error_code, error_message, latency_ms, attempted_at] =
            parameters as [string, string, string | null, number, string, string, string | null, string | null, string | null, number | null, Date];

          this.attempts.push({
            id,
            intent_id,
            job_id,
            attempt_number,
            channel,
            status,
            provider_message_id,
            error_code,
            error_message,
            latency_ms,
            attempted_at
          });
          return 1;
        }

        return 0;
      }
    };

    return work(tx);
  }
}

describe('EL-EP-013 End-to-End Integration (EL-TK-165)', () => {
  let runner: MockRunner;
  let jobQueue: MockJobQueue;
  let emailSender: FakeEmailSender;
  let auditLogs: NotificationAuditRecord[];
  let auditSink: NotificationAuditSink;
  let intentService: NotificationIntentService;
  let emailService: EmailNotificationService;
  let projectionService: NoticeProjectionService;
  let capacityNoticeService: CapacityNoticeService;
  let caseNoticeService: CaseNoticeService;
  let lifecycleNoticeService: LifecycleNoticeService;
  let exportNoticeService: ExportNoticeService;
  let accountEventNoticeService: AccountEventNoticeService;

  const systemActor: DomainFactActorContext = {
    actorType: 'SYSTEM',
    actorId: 'system-worker'
  };

  beforeEach(() => {
    runner = new MockRunner();
    jobQueue = new MockJobQueue(runner);
    emailSender = new FakeEmailSender();
    auditLogs = [];
    auditSink = {
      record: async (rec) => {
        auditLogs.push(rec);
      }
    };

    intentService = new NotificationIntentService(runner, auditSink);
    emailService = new EmailNotificationService(runner, jobQueue as unknown as JobQueuePostgres, emailSender, new EmailRenderer(), auditSink);
    projectionService = new NoticeProjectionService(runner, auditSink);

    capacityNoticeService = new CapacityNoticeService(intentService, auditSink);
    caseNoticeService = new CaseNoticeService(intentService, auditSink);
    lifecycleNoticeService = new LifecycleNoticeService(intentService, auditSink);
    exportNoticeService = new ExportNoticeService(intentService, auditSink);
    accountEventNoticeService = new AccountEventNoticeService(intentService, auditSink);
  });

  it('Escenario 1: Hecho de dominio procesado repetidamente produce exactamente una sola intención y no duplica entregas', async () => {
    // 1. Capacidad al 80% llega repetidamente por múltiples eventos concurrentes
    const fact1 = {
      actorContext: systemActor,
      eventId: 'evt-alpha',
      organizerRef: 'org-alpha',
      recipientEmail: 'organizer@eventlens.io',
      thresholdType: 'USAGE_80' as const,
      currentStoragePercent: 82
    };

    const res1 = await capacityNoticeService.generateCapacityThresholdNotice(fact1);
    expect(res1.outcome).toBe('NOTICE_GENERATED');
    expect(runner.intents).toHaveLength(1);

    // Encolar job de email
    const jobId1 = await emailService.enqueueEmailJob(res1.intent!);
    expect(jobQueue.published).toHaveLength(1);

    // Procesar envío del job en worker
    const exec1: Execution = {
      jobId: jobId1,
      resourceRef: 'org-alpha',
      generation: 1n,
      queue: 'notification-email',
      type: 'NOTIFICATION_EMAIL',
      payload: { intentId: res1.intent!.id },
      handlerVersion: '1.0',
      attempt: 1,
      fence: 1n,
      owner: 'worker-1',
      token: randomUUID(),
      epoch: 'epoch-1',
      leaseUntil: new Date(Date.now() + 60000)
    };

    const jobOutcome1 = await emailService.processEmailJob(exec1);
    expect(jobOutcome1.outcome).toBe('SENT');
    expect(emailSender.getSentEmails()).toHaveLength(1);

    // 2. Reintento o re-procesamiento del mismo hecho (Idempotent Replay)
    const res2 = await capacityNoticeService.generateCapacityThresholdNotice(fact1);
    expect(res2.outcome).toBe('IDEMPOTENT_REPLAY');
    expect(runner.intents).toHaveLength(1); // Exactamente 1 intención persistida

    // Si se re-ejecuta el job o se evalúa de nuevo, no se envía un segundo email duplicado
    expect(emailSender.getSentEmails()).toHaveLength(1);
  });

  it('Escenario 2: Cambio de fecha/permiso antes de entrega marca aviso obsoleto y excluye avisos caducados de la proyección', async () => {
    const expiresAtInitial = new Date(Date.now() + 48 * 60 * 60 * 1000);

    // 1. Export queda AVAILABLE
    const availRes = await exportNoticeService.generateExportNotice({
      actorContext: systemActor,
      exportId: 'exp-e2e-01',
      eventId: 'evt-beta',
      organizerRef: 'org-beta',
      recipientEmail: 'organizer-beta@eventlens.io',
      noticeType: 'EXPORT_AVAILABLE',
      generation: 1n,
      partCount: 2,
      expiresAt: expiresAtInitial
    });
    expect(availRes.outcome).toBe('NOTICE_GENERATED');

    // Comprobar que aparece activo en el panel
    let projection = await projectionService.projectNoticesForOrganizer({
      recipientRef: 'org-beta'
    });
    expect(projection.notices).toHaveLength(1);
    expect(projection.notices[0].title).toContain('Exportación de recuerdos lista');

    // 2. Antes de que el usuario lo use, un participante retira contenido o se revocan permisos -> EXPORT_INVALIDATED (DEC-090)
    const invalidRes = await exportNoticeService.generateExportNotice({
      actorContext: systemActor,
      exportId: 'exp-e2e-01',
      eventId: 'evt-beta',
      organizerRef: 'org-beta',
      noticeType: 'EXPORT_INVALIDATED',
      generation: 1n,
      invalidationReason: 'Retiro propio de participante'
    });
    expect(invalidRes.outcome).toBe('NOTICE_GENERATED');
    expect(invalidRes.supersededCount).toBe(1);

    // 3. Proyección al organizador: el aviso anterior NO debe presentarse como vigente
    projection = await projectionService.projectNoticesForOrganizer({
      recipientRef: 'org-beta'
    });
    // Solo debe figurar el aviso de invalidación con la alternativa vigente, no la descarga obsoleta
    expect(projection.notices).toHaveLength(1);
    expect(projection.notices[0].notificationType).toBe('EXPORT_INVALIDATED');
    expect(projection.notices[0].action?.label).toBe('Ir a la biblioteca');
  });

  it('Escenario 3: Proveedor de email falla temporalmente y se recupera con reintento sin duplicar envíos semánticos', async () => {
    // 1. Crear intención de aviso de seguridad de cuenta
    const secRes = await accountEventNoticeService.generateAccountSecurityNotice({
      actorContext: systemActor,
      accountRef: 'org-gamma',
      recipientEmail: 'security@eventlens.io',
      eventType: 'NEW_LOGIN',
      ipAddress: '192.168.1.1'
    });
    expect(secRes.outcome).toBe('NOTICE_GENERATED');

    const jobId = await emailService.enqueueEmailJob(secRes.intent!);
    const exec: Execution = {
      jobId,
      resourceRef: 'org-gamma',
      generation: 1n,
      queue: 'notification-email',
      type: 'NOTIFICATION_EMAIL',
      payload: { intentId: secRes.intent!.id },
      handlerVersion: '1.0',
      attempt: 1,
      fence: 1n,
      owner: 'worker-1',
      token: randomUUID(),
      epoch: 'epoch-1',
      leaseUntil: new Date(Date.now() + 60000)
    };

    // 2. Simular fallo transitorio del proveedor en el primer intento
    emailSender.setFailures(1);
    const failOutcome = await emailService.processEmailJob(exec);
    expect(failOutcome.outcome).toBe('RETRY_SCHEDULED');
    expect(runner.attempts).toHaveLength(1);
    expect(runner.attempts[0].status).toBe('FAILED');
    expect(emailSender.getSentEmails()).toHaveLength(0); // Ningún correo entregado aún

    // 3. Proveedor se restablece y JobQueue reintenta (intento 2)
    const retryExec: Execution = {
      ...exec,
      attempt: 2
    };

    const successOutcome = await emailService.processEmailJob(retryExec);
    expect(successOutcome.outcome).toBe('SENT');
    expect(runner.attempts).toHaveLength(2);
    expect(runner.attempts[1].status).toBe('SENT');
    expect(emailSender.getSentEmails()).toHaveLength(1); // Exactamente 1 correo recibido

    // 4. Auditoría sanitizada: no expone credenciales ni datos privados
    for (const log of auditLogs) {
      expect(log.details || '').not.toContain('password');
      expect(log.details || '').not.toContain('signed-url');
    }
  });

  it('Escenario E2E Completo: Orquestación transversal de los 5 tipos de avisos de EL-EP-013 sin fugas de privacidad', async () => {
    // 1. Lifecycle milestone
    const timeline = {
      actorContext: systemActor,
      eventRef: 'evt-flow',
      eventName: 'Boda Camila & Mateo',
      organizerRef: 'org-flow',
      recipientEmail: 'flow@eventlens.io',
      scheduledAt: new Date(Date.now() + 48 * 3600000),
      expiresAt: new Date(Date.now() + 14 * 24 * 3600000),
      graceEndsAt: new Date(Date.now() + 21 * 24 * 3600000),
      timezone: 'America/Bogota'
    };
    const lifeResult = await lifecycleNoticeService.scheduleLifecycleNotices(timeline);
    expect(lifeResult.scheduledCount).toBeGreaterThan(0);

    // 2. Capacity exceeded (100%)
    const capResult = await capacityNoticeService.generateCapacityThresholdNotice({
      actorContext: systemActor,
      eventId: 'evt-flow',
      organizerRef: 'org-flow',
      recipientEmail: 'flow@eventlens.io',
      thresholdType: 'USAGE_100',
      currentStoragePercent: 100
    });
    expect(capResult.outcome).toBe('NOTICE_GENERATED');

    // 3. Case notice
    const caseResult = await caseNoticeService.generateCaseNotification({
      actorContext: systemActor,
      caseRef: 'case-99',
      eventRef: 'evt-flow',
      recipientRef: 'org-flow',
      recipientRole: 'ORGANIZER',
      severity: 'NORMAL',
      actionType: 'CASE_REPORTED',
      summary: 'Reporte de contenido en revisión'
    });
    expect(caseResult.outcome).toBe('NOTICE_GENERATED');

    // Proyección agregada en panel para el organizador
    const projection = await projectionService.projectNoticesForOrganizer({
      recipientRef: 'org-flow'
    });
    expect(projection.notices.length).toBeGreaterThanOrEqual(2);

    // Ningún aviso proyectado o intent generado expone secretos
    for (const row of runner.intents) {
      expect(row.payload).not.toContain('token_secret');
      expect(row.payload).not.toContain('storageKey');
    }
  });
});
