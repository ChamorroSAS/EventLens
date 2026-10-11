import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  JobQueuePostgres,
  LocalSlots,
  type RecoveryAuthority,
  type ResourcePolicy,
  type SqlTransaction
} from '@eventlens/job-queue';
import {
  NotificationIntentService,
  EmailNotificationService,
  EmailRenderer,
  FakeEmailSender,
  type NotificationAuditRecord,
  type NotificationAuditSink,
  type NotificationIntentRecord
} from '../src/index.js';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

class TestAuthority implements RecoveryAuthority {
  epoch = 'pg-epoch-1';
  revision = 0;
  async acquire(scopes: readonly string[]) {
    return {
      epoch: this.epoch,
      assertCurrent: (_scope: string) => {},
      release: async () => {}
    };
  }
}

const passThroughPolicy: ResourcePolicy = {
  async lockAndAuthorize(_tx, _ref, _generation) {
    return true;
  }
};

describeIntegration('EmailNotificationService (Real PostgreSQL 16 Integration Tests — EL-TK-157)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  async function query<T extends object>(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.query<T>(statement, ...args));
  }

  let authority: TestAuthority;
  let slots: LocalSlots;
  let jobQueue: JobQueuePostgres;
  let emailSender: FakeEmailSender;
  let renderer: EmailRenderer;
  let audits: NotificationAuditRecord[];
  let auditSink: NotificationAuditSink;
  let intentService: NotificationIntentService;
  let emailService: EmailNotificationService;

  beforeAll(async () => {
    // Ensure all tables required for EL-TK-156 and EL-TK-157 exist in PostgreSQL 16
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

      CREATE TABLE IF NOT EXISTS "notification_delivery_attempt" (
        "id" UUID NOT NULL,
        "intent_id" UUID NOT NULL,
        "job_id" UUID,
        "attempt_number" INTEGER NOT NULL,
        "channel" TEXT NOT NULL DEFAULT 'EMAIL',
        "status" TEXT NOT NULL,
        "provider_message_id" TEXT,
        "error_code" TEXT,
        "error_message" TEXT,
        "latency_ms" INTEGER,
        "attempted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "notification_delivery_attempt_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "notification_delivery_attempt_intent_id_fkey" FOREIGN KEY ("intent_id") REFERENCES "notification_intent"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );

      CREATE INDEX IF NOT EXISTS "notification_delivery_attempt_intent_id_idx" ON "notification_delivery_attempt"("intent_id");
      CREATE INDEX IF NOT EXISTS "notification_delivery_attempt_status_idx" ON "notification_delivery_attempt"("status");

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
    await sql('DELETE FROM notification_delivery_attempt');
    await sql('DELETE FROM notification_intent');
    await sql('DELETE FROM notification_audit_event');
    await sql("DELETE FROM job_receipt WHERE job_id IN (SELECT id FROM job_queue WHERE queue = 'notification-email')");
    await sql("DELETE FROM job_attempt WHERE job_id IN (SELECT id FROM job_queue WHERE queue = 'notification-email')");
    await sql("DELETE FROM job_queue WHERE queue = 'notification-email'");

    authority = new TestAuthority();
    slots = new LocalSlots(4);
    jobQueue = new JobQueuePostgres(txs, authority, passThroughPolicy, slots, { candidateScanLimit: 32 });
    emailSender = new FakeEmailSender();
    renderer = new EmailRenderer();
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
    emailService = new EmailNotificationService(txs, jobQueue, emailSender, renderer, auditSink);
  });

  it('Escenario 1: Encola en job_queue, reserva y procesa con FakeEmailSender persistiendo intento SENT y PROCESSED en PostgreSQL 16', async () => {
    // 1. Crear intención vía servicio canónico
    const recorded = await intentService.recordDomainFact({
      actorContext: { actorType: 'SYSTEM', actorId: 'system-worker' },
      dedupKey: 'invite:org-01:user-01',
      recipientRef: 'user-01',
      recipientEmail: 'user01@eventlens.test',
      notificationType: 'TEAM_INVITATION',
      resourceRef: 'evt-welcome-01',
      payload: { inviterName: 'Admin Organizer', role: 'Staff' }
    });

    expect(recorded.outcome).toBe('CREATED');
    const intent = recorded.intent;

    // 2. Encolar job en JobQueuePostgres
    const jobId = await emailService.enqueueEmailJob(intent);
    expect(jobId).toBeDefined();

    // Comprobar que existe en la tabla PostgreSQL 'job_queue'
    const queueRows = await query<{ id: string; status: string; queue: string }>(
      'SELECT id, status, queue FROM job_queue WHERE id = $1::uuid',
      jobId
    );
    expect(queueRows).toHaveLength(1);
    expect(queueRows[0].status).toBe('PENDING');
    expect(queueRows[0].queue).toBe('notification-email');

    // 3. Reservar ejecución desde la cola
    const reservation = await jobQueue.reserve(['notification-email'], 'worker-node-1', 1, 15000);
    expect(reservation.jobs).toHaveLength(1);
    const execution = reservation.jobs[0];
    expect(execution.jobId).toBe(jobId);

    // 4. Procesar el job en EmailNotificationService
    const result = await emailService.processEmailJob(execution);
    reservation.releaseAfterQuiescence();

    expect(result.outcome).toBe('SENT');
    expect(result.attemptNumber).toBe(1);
    expect(result.providerMessageId).toBeDefined();

    // 5. Verificar que el correo fue enviado por el puerto
    const sentEmails = emailSender.getSentEmails();
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe('user01@eventlens.test');
    expect(sentEmails[0].subject).toContain('Invitación');

    // 6. Verificar persistencia en PostgreSQL 16:
    // a) Intención PROCESSED
    const updatedIntents = await query<{ status: string }>(
      'SELECT status FROM notification_intent WHERE id = $1',
      intent.id
    );
    expect(updatedIntents[0].status).toBe('PROCESSED');

    // b) Intento de entrega registrado en notification_delivery_attempt
    const attempts = await query<{
      intent_id: string;
      job_id: string;
      attempt_number: number;
      channel: string;
      status: string;
      provider_message_id: string;
    }>('SELECT * FROM notification_delivery_attempt WHERE intent_id = $1', intent.id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].attempt_number).toBe(1);
    expect(attempts[0].channel).toBe('EMAIL');
    expect(attempts[0].status).toBe('SENT');
    expect(attempts[0].provider_message_id).toBe(result.providerMessageId);

    // c) JobQueue completado
    const finishedJob = await query<{ status: string }>(
      'SELECT status FROM job_queue WHERE id = $1::uuid',
      jobId
    );
    expect(finishedJob[0].status).toBe('COMPLETED');

    // d) Auditoría persistida en PostgreSQL
    const auditRows = await query<{ action: string; result: string }>(
      "SELECT action, result FROM notification_audit_event WHERE intent_id = $1 AND action = 'EMAIL_SENT'",
      intent.id
    );
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].result).toBe('SUCCESS');
  });

  it('Escenario 2: Reintento transitorio y presupuesto DEAD (3 intentos) en PostgreSQL 16', async () => {
    // 1. Crear intención
    const recorded = await intentService.recordDomainFact({
      actorContext: { actorType: 'SYSTEM', actorId: 'system-worker' },
      dedupKey: 'warning:evt-99:80',
      recipientRef: 'org-99',
      recipientEmail: 'org99@eventlens.test',
      notificationType: 'CAPACITY_WARNING_80',
      resourceRef: 'evt-99',
      payload: { current: 80, limit: 100 }
    });
    const intent = recorded.intent;
    const jobId = await emailService.enqueueEmailJob(intent);

    // 2. Simular fallo transitorio en el intento 1
    emailSender.setFailures(1, new Error('SMTP_DNS_RESOLUTION_TIMEOUT'));

    const reservation1 = await jobQueue.reserve(['notification-email'], 'worker-node-1', 1, 15000);
    const execution1 = reservation1.jobs[0];
    const result1 = await emailService.processEmailJob(execution1);
    reservation1.releaseAfterQuiescence();

    expect(result1.outcome).toBe('RETRY_SCHEDULED');
    expect(result1.attemptNumber).toBe(1);

    // Verificar en DB: Intento 1 FAILED, intención sigue PENDING, job en RETRYING
    const attempts1 = await query<{ attempt_number: number; status: string; error_code: string }>(
      'SELECT attempt_number, status, error_code FROM notification_delivery_attempt WHERE intent_id = $1',
      intent.id
    );
    expect(attempts1).toHaveLength(1);
    expect(attempts1[0].attempt_number).toBe(1);
    expect(attempts1[0].status).toBe('FAILED');
    expect(attempts1[0].error_code).toBe('PROVIDER_ERROR');

    const intentAfterRetry = await query<{ status: string }>(
      'SELECT status FROM notification_intent WHERE id = $1',
      intent.id
    );
    expect(intentAfterRetry[0].status).toBe('PENDING');

    const jobAfterRetry = await query<{ status: string }>(
      'SELECT status FROM job_queue WHERE id = $1::uuid',
      jobId
    );
    expect(jobAfterRetry[0].status).toBe('RETRYING');

    // 3. Simular agotamiento de presupuesto (intento 3 con fallo permanente)
    emailSender.setPermanentFailure(true, new Error('FATAL_AUTHENTICATION_FAILURE'));

    // Actualizamos el job en PostgreSQL para que esté listo inmediatamente como attempt = 3
    await sql(
      `UPDATE job_queue
       SET available_at = clock_timestamp() - interval '1 second',
           status = 'PENDING',
           attempt = 2
       WHERE id = $1::uuid`,
      jobId
    );

    const reservation3 = await jobQueue.reserve(['notification-email'], 'worker-node-1', 1, 15000);
    const execution3 = reservation3.jobs[0];
    expect(execution3.attempt).toBe(3);

    const result3 = await emailService.processEmailJob(execution3);
    reservation3.releaseAfterQuiescence();

    expect(result3.outcome).toBe('DEAD');
    expect(result3.attemptNumber).toBe(3);

    // Verificar en DB: Intento 3 registrado como DEAD
    const attempts3 = await query<{ attempt_number: number; status: string; error_code: string }>(
      'SELECT attempt_number, status, error_code FROM notification_delivery_attempt WHERE intent_id = $1 ORDER BY attempt_number ASC',
      intent.id
    );
    expect(attempts3).toHaveLength(2);
    expect(attempts3[1].attempt_number).toBe(3);
    expect(attempts3[1].status).toBe('DEAD');
    expect(attempts3[1].error_code).toBe('BUDGET_EXHAUSTED');

    // Intención en PostgreSQL actualizada a FAILED
    const finalIntent = await query<{ status: string }>(
      'SELECT status FROM notification_intent WHERE id = $1',
      intent.id
    );
    expect(finalIntent[0].status).toBe('FAILED');

    // Job en PostgreSQL marcado DEAD
    const deadJob = await query<{ status: string }>(
      'SELECT status FROM job_queue WHERE id = $1::uuid',
      jobId
    );
    expect(deadJob[0].status).toBe('DEAD');
  });

  it('Escenario 3: No acreditar entrega antes de confirmación y omitir envío por obsolescencia', async () => {
    // 1. Crear intención
    const recorded = await intentService.recordDomainFact({
      actorContext: { actorType: 'SYSTEM', actorId: 'system-worker' },
      dedupKey: 'suspension:evt-55',
      recipientRef: 'org-55',
      recipientEmail: 'org55@eventlens.test',
      notificationType: 'EVENT_SUSPENDED',
      resourceRef: 'evt-55',
      payload: { reason: 'Audit pending' }
    });
    const intent = recorded.intent;

    // Antes de procesar: isDeliveryAcredited es estrictamente falso
    const statusBefore = await emailService.getDeliveryStatus(intent.id);
    expect(statusBefore.isDeliveryAcredited).toBe(false);
    expect(statusBefore.attemptsCount).toBe(0);

    // 2. Reactivar evento -> genera hecho que SUPERSEDES la suspensión anterior
    const reactivated = await intentService.recordDomainFact({
      actorContext: { actorType: 'SYSTEM', actorId: 'system-worker' },
      dedupKey: 'reactivated:evt-55',
      recipientRef: 'org-55',
      recipientEmail: 'org55@eventlens.test',
      notificationType: 'EVENT_REACTIVATED',
      resourceRef: 'evt-55',
      payload: { reason: 'Cleared' },
      supersedesDedupKeys: ['suspension:evt-55']
    });
    expect(reactivated.supersededCount).toBe(1);

    // 3. El worker procesa la intención suspendida que ahora está SUPERSEDED en PostgreSQL
    const jobId = await emailService.enqueueEmailJob(intent);
    const reservation = await jobQueue.reserve(['notification-email'], 'worker-node-1', 1, 15000);
    const execution = reservation.jobs[0];

    const result = await emailService.processEmailJob(execution);
    reservation.releaseAfterQuiescence();

    expect(result.outcome).toBe('SKIPPED_OBSOLETE');
    expect(result.errorCode).toBe('INTENT_OBSOLETE');

    // El email nunca fue emitido por el puerto
    expect(emailSender.getSentEmails()).toHaveLength(0);

    // Intento registrado como SUPERSEDED en DB
    const attempts = await query<{ status: string; error_code: string }>(
      'SELECT status, error_code FROM notification_delivery_attempt WHERE intent_id = $1',
      intent.id
    );
    expect(attempts).toHaveLength(1);
    expect(attempts[0].status).toBe('SUPERSEDED');
    expect(attempts[0].error_code).toBe('INTENT_OBSOLETE');

    // Acreditación de entrega sigue siendo falsa
    const statusAfter = await emailService.getDeliveryStatus(intent.id);
    expect(statusAfter.isDeliveryAcredited).toBe(false);
  });
});
