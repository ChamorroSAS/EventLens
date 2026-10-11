import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import type {
  Execution,
  JobQueuePostgres,
  JobSpec,
  RecoveryAuthority,
  ResourcePolicy
} from '@eventlens/job-queue';
import {
  EmailNotificationService,
  EmailRenderer,
  FakeEmailSender,
  NotificationError,
  type NotificationIntentRecord,
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
  public retried: Array<{
    job: Execution;
    operationId: string;
    outcome: any;
    retryAt: Date | null;
    disposition: string;
  }> = [];

  constructor(private runner?: MockRunner) {}

  setRunner(runner: MockRunner) {
    this.runner = runner;
  }

  async publish(tx: SqlTransaction, spec: JobSpec): Promise<string> {
    this.published.push(spec);
    return 'job-' + randomUUID();
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
  ): Promise<'COMPLETED'> {
    if (effect && this.runner) {
      await this.runner.run(async (tx) => {
        await effect(tx);
      });
    }
    this.retried.push({ job, operationId, outcome, retryAt, disposition });
    return 'COMPLETED';
  }
}

class MockRunner implements TransactionRunner {
  public intents: InMemoryIntentRow[] = [];
  public attempts: InMemoryAttemptRow[] = [];

  async run<T>(work: (tx: SqlTransaction) => Promise<T>): Promise<T> {
    const tx: SqlTransaction = {
      query: async <R extends object>(sql: string, ...parameters: unknown[]): Promise<R[]> => {
        const norm = sql.replace(/\s+/g, ' ');
        if (norm.includes('FROM notification_intent WHERE id = $1')) {
          const id = parameters[0] as string;
          const found = this.intents.filter((i) => i.id === id);
          return found as unknown as R[];
        }

        if (norm.includes('FROM notification_delivery_attempt WHERE intent_id = $1')) {
          const id = parameters[0] as string;
          const found = this.attempts.filter((a) => a.intent_id === id);
          return found as unknown as R[];
        }

        return [] as R[];
      },

      execute: async (sql: string, ...parameters: unknown[]): Promise<number> => {
        const norm = sql.replace(/\s+/g, ' ');
        if (norm.includes('UPDATE notification_intent SET status = $1')) {
          const [status, now, id] = [parameters[0], parameters[1], parameters[parameters.length - 1]] as [
            string,
            Date,
            string
          ];
          const found = this.intents.find((i) => i.id === id);
          if (found) {
            found.status = status;
            found.updated_at = now;
            return 1;
          }
        }

        if (norm.includes('INSERT INTO notification_delivery_attempt')) {
          const [
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
          ] = parameters as [
            string,
            string,
            string | null,
            number,
            string,
            string,
            string | null,
            string | null,
            string | null,
            number | null,
            Date
          ];

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

describe('EmailNotificationService (Unit Tests — EL-TK-157)', () => {
  let runner: MockRunner;
  let jobQueue: MockJobQueue;
  let emailSender: FakeEmailSender;
  let renderer: EmailRenderer;
  let audits: NotificationAuditRecord[];
  let auditSink: NotificationAuditSink;
  let service: EmailNotificationService;

  beforeEach(() => {
    runner = new MockRunner();
    jobQueue = new MockJobQueue(runner);
    emailSender = new FakeEmailSender();
    renderer = new EmailRenderer();
    audits = [];
    auditSink = {
      record: async (rec) => {
        audits.push(rec);
      }
    };
    service = new EmailNotificationService(
      runner,
      jobQueue as unknown as JobQueuePostgres,
      emailSender,
      renderer,
      auditSink
    );
  });

  function createSampleIntent(overrides?: Partial<InMemoryIntentRow>): NotificationIntentRecord {
    const id = overrides?.id ?? randomUUID();
    const row: InMemoryIntentRow = {
      id,
      dedup_key: overrides?.dedup_key ?? 'intent-dedup-' + randomUUID(),
      recipient_ref: overrides?.recipient_ref ?? 'acc-organizer-01',
      recipient_email: overrides?.recipient_email ?? 'organizer@eventlens.test',
      notification_type: overrides?.notification_type ?? 'CAPACITY_WARNING_80',
      resource_ref: overrides?.resource_ref ?? 'evt-100',
      status: overrides?.status ?? 'PENDING',
      payload: overrides?.payload ?? JSON.stringify({ current: 80, limit: 100 }),
      effective_at: overrides?.effective_at ?? new Date(),
      expires_at: overrides?.expires_at ?? null,
      superseded_at: overrides?.superseded_at ?? null,
      superseded_by: overrides?.superseded_by ?? null,
      created_at: overrides?.created_at ?? new Date(),
      updated_at: overrides?.updated_at ?? new Date()
    };
    runner.intents.push(row);

    return {
      id: row.id,
      dedupKey: row.dedup_key,
      recipientRef: row.recipient_ref,
      recipientEmail: row.recipient_email,
      notificationType: row.notification_type,
      resourceRef: row.resource_ref,
      status: row.status as any,
      payload: JSON.parse(row.payload),
      effectiveAt: row.effective_at,
      expiresAt: row.expires_at,
      supersededAt: row.superseded_at,
      supersededBy: row.superseded_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  describe('EmailRenderer', () => {
    it('renderiza plantillas accesibles en HTML y texto plano para tipos de notificación soportados', () => {
      const intent = createSampleIntent({
        notification_type: 'CAPACITY_WARNING_80',
        recipient_email: 'test@eventlens.test'
      });

      const spec = renderer.render(intent);
      expect(spec.to).toBe('test@eventlens.test');
      expect(spec.subject).toContain('80%');
      expect(spec.html).toContain('<!DOCTYPE html>');
      expect(spec.html).toContain('80%');
      expect(spec.text).toContain('80%');
    });

    it('falla con INVALID_RECIPIENT si el destinatario no contiene un correo válido', () => {
      const intent = createSampleIntent({ recipient_email: 'not-an-email' });
      expect(() => renderer.render(intent)).toThrow(NotificationError);
    });
  });

  describe('Escenario 1: Envío exitoso mediante puerto desacoplado', () => {
    it('encola un job durable de email en JobQueuePostgres a partir de la intención', async () => {
      const intent = createSampleIntent();
      const jobId = await service.enqueueEmailJob(intent);

      expect(jobId).toBeDefined();
      expect(jobQueue.published).toHaveLength(1);
      expect(jobQueue.published[0].type).toBe('NOTIFICATION_EMAIL');
      expect(jobQueue.published[0].queue).toBe('notification-email');
      expect(jobQueue.published[0].resourceRef).toBe(intent.recipientRef);
      expect(jobQueue.published[0].dedupKey).toBe('email-job:' + intent.dedupKey);

      // Auditoría de encolado
      expect(audits.some((a) => a.action === 'EMAIL_JOB_ENQUEUED')).toBe(true);
    });

    it('procesa el job, invoca EmailSender, persiste intento SENT y actualiza la intención a PROCESSED', async () => {
      const intent = createSampleIntent({ notification_type: 'EVENT_UPCOMING' });
      const execution: Execution = {
        jobId: 'job-1',
        resourceRef: intent.recipientRef,
        generation: 1n,
        queue: 'notification-email',
        type: 'NOTIFICATION_EMAIL',
        payload: { intentId: intent.id },
        handlerVersion: '1.0',
        attempt: 1,
        fence: 1n,
        owner: 'worker-1',
        token: randomUUID(),
        epoch: 'epoch-1',
        leaseUntil: new Date(Date.now() + 60000)
      };

      const result = await service.processEmailJob(execution);

      expect(result.outcome).toBe('SENT');
      expect(result.attemptNumber).toBe(1);
      expect(result.providerMessageId).toBeDefined();

      // Email fue enviado por el puerto
      const sent = emailSender.getSentEmails();
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe(intent.recipientEmail);

      // JobQueue completado
      expect(jobQueue.completed).toHaveLength(1);

      // Entrega persistida
      expect(runner.attempts).toHaveLength(1);
      expect(runner.attempts[0].status).toBe('SENT');
      expect(runner.attempts[0].provider_message_id).toBe(result.providerMessageId);

      // Intención actualizada
      expect(runner.intents[0].status).toBe('PROCESSED');

      // Auditoría registrada
      expect(audits.some((a) => a.action === 'EMAIL_SENT')).toBe(true);
    });
  });

  describe('Escenario 2: Reintentos transitorios y presupuesto DEAD (DEC-064)', () => {
    it('reintenta transitoriamente en attempt 1 programando backoff en JobQueue sin marcar DEAD', async () => {
      const intent = createSampleIntent();
      emailSender.setFailures(1, new Error('SMTP_CONNECTION_REFUSED'));

      const execution: Execution = {
        jobId: 'job-retry-1',
        resourceRef: intent.recipientRef,
        generation: 1n,
        queue: 'notification-email',
        type: 'NOTIFICATION_EMAIL',
        payload: { intentId: intent.id },
        handlerVersion: '1.0',
        attempt: 1,
        fence: 1n,
        owner: 'worker-1',
        token: randomUUID(),
        epoch: 'epoch-1',
        leaseUntil: new Date(Date.now() + 60000)
      };

      const result = await service.processEmailJob(execution);

      expect(result.outcome).toBe('RETRY_SCHEDULED');
      expect(result.attemptNumber).toBe(1);
      expect(result.retryAt).toBeInstanceOf(Date);

      // Job reintentado en cola como RETRYING
      expect(jobQueue.retried).toHaveLength(1);
      expect(jobQueue.retried[0].disposition).toBe('RETRYING');

      // Intento registrado como FAILED
      expect(runner.attempts).toHaveLength(1);
      expect(runner.attempts[0].status).toBe('FAILED');
      expect(runner.attempts[0].attempt_number).toBe(1);

      // Intención no cambia a FAILED mientras haya reintentos pendientes
      expect(runner.intents[0].status).toBe('PENDING');

      // Auditoría de fallo de intento
      expect(audits.some((a) => a.action === 'EMAIL_ATTEMPT_FAILED')).toBe(true);
    });

    it('marca DEAD y actualiza la intención a FAILED cuando se agotan los 3 intentos máximos', async () => {
      const intent = createSampleIntent();
      emailSender.setPermanentFailure(true, new Error('FATAL_MAIL_SERVER_OUTAGE'));

      const execution: Execution = {
        jobId: 'job-dead-1',
        resourceRef: intent.recipientRef,
        generation: 1n,
        queue: 'notification-email',
        type: 'NOTIFICATION_EMAIL',
        payload: { intentId: intent.id },
        handlerVersion: '1.0',
        attempt: 3, // Tercer y último intento
        fence: 3n,
        owner: 'worker-1',
        token: randomUUID(),
        epoch: 'epoch-1',
        leaseUntil: new Date(Date.now() + 60000)
      };

      const result = await service.processEmailJob(execution);

      expect(result.outcome).toBe('DEAD');
      expect(result.attemptNumber).toBe(3);

      // Job marcado DEAD en JobQueue
      expect(jobQueue.retried).toHaveLength(1);
      expect(jobQueue.retried[0].disposition).toBe('DEAD');

      // Intento registrado como DEAD
      expect(runner.attempts).toHaveLength(1);
      expect(runner.attempts[0].status).toBe('DEAD');
      expect(runner.attempts[0].attempt_number).toBe(3);

      // Intención marcada FAILED
      expect(runner.intents[0].status).toBe('FAILED');

      // Auditoría de agotamiento DEAD
      expect(audits.some((a) => a.action === 'EMAIL_DEAD')).toBe(true);
    });
  });

  describe('Escenario 3: No afirmar entrega acreditada antes de confirmación y obsolescencia', () => {
    it('no acredita entrega si el job fue solo encolado o está en reintento (isDeliveryAcredited: false)', async () => {
      const intent = createSampleIntent();

      // Recién creada / encolada
      const status1 = await service.getDeliveryStatus(intent.id);
      expect(status1.intentStatus).toBe('PENDING');
      expect(status1.attemptsCount).toBe(0);
      expect(status1.isDeliveryAcredited).toBe(false);

      // Después de un intento fallido
      runner.attempts.push({
        id: randomUUID(),
        intent_id: intent.id,
        attempt_number: 1,
        channel: 'EMAIL',
        status: 'FAILED',
        attempted_at: new Date()
      });

      const status2 = await service.getDeliveryStatus(intent.id);
      expect(status2.attemptsCount).toBe(1);
      expect(status2.lastAttemptStatus).toBe('FAILED');
      expect(status2.isDeliveryAcredited).toBe(false);

      // Solo después de intento SENT
      runner.attempts.unshift({
        id: randomUUID(),
        intent_id: intent.id,
        attempt_number: 2,
        channel: 'EMAIL',
        status: 'SENT',
        provider_message_id: 'msg-confirmed',
        attempted_at: new Date()
      });
      runner.intents[0].status = 'PROCESSED';

      const status3 = await service.getDeliveryStatus(intent.id);
      expect(status3.attemptsCount).toBe(2);
      expect(status3.lastAttemptStatus).toBe('SENT');
      expect(status3.isDeliveryAcredited).toBe(true);
    });

    it('si la intención quedó SUPERSEDED antes del worker, omite envío sin enviar correo al usuario', async () => {
      const intent = createSampleIntent({
        status: 'SUPERSEDED',
        superseded_by: 'SUPERSEDED_BY_EVENT_REACTIVATED'
      });

      const execution: Execution = {
        jobId: 'job-obsolete-1',
        resourceRef: intent.recipientRef,
        generation: 1n,
        queue: 'notification-email',
        type: 'NOTIFICATION_EMAIL',
        payload: { intentId: intent.id },
        handlerVersion: '1.0',
        attempt: 1,
        fence: 1n,
        owner: 'worker-1',
        token: randomUUID(),
        epoch: 'epoch-1',
        leaseUntil: new Date(Date.now() + 60000)
      };

      const result = await service.processEmailJob(execution);

      expect(result.outcome).toBe('SKIPPED_OBSOLETE');
      expect(result.errorCode).toBe('INTENT_OBSOLETE');

      // EmailSender no fue invocado
      expect(emailSender.getSentEmails()).toHaveLength(0);

      // Job completado en cola para no quedar colgado
      expect(jobQueue.completed).toHaveLength(1);

      // Intento registrado como SUPERSEDED
      expect(runner.attempts).toHaveLength(1);
      expect(runner.attempts[0].status).toBe('SUPERSEDED');

      // Auditoría registrada
      expect(audits.some((a) => a.action === 'EMAIL_SKIPPED_OBSOLETE')).toBe(true);
    });
  });
});
