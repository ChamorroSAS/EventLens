import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  type Execution,
  type JobSpec,
  type JobQueuePostgres
} from '@eventlens/job-queue';
import {
  type EmailSender,
  type NotificationIntentRecord,
  type NotificationDeliveryStatus,
  type NotificationDeliveryAttemptRecord,
  type ProcessEmailJobResult,
  type NotificationAuditSink,
  type DeliveryAttemptStatus,
  NotificationError
} from './contracts.js';
import { EmailRenderer } from './email-renderer.js';

interface NotificationIntentRow {
  id: string;
  dedup_key: string;
  recipient_ref: string;
  recipient_email?: string | null;
  notification_type: string;
  resource_ref: string;
  status: string;
  payload: string | Record<string, unknown>;
  effective_at: Date | string;
  expires_at?: Date | string | null;
  superseded_at?: Date | string | null;
  superseded_by?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface NotificationDeliveryAttemptRow {
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
  attempted_at: Date | string;
}

function parsePayload(payload: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      return {};
    }
  }
  return payload && typeof payload === 'object' ? payload : {};
}

function mapAttemptRow(row: NotificationDeliveryAttemptRow): NotificationDeliveryAttemptRecord {
  return {
    id: row.id,
    intentId: row.intent_id,
    jobId: row.job_id ?? null,
    attemptNumber: row.attempt_number,
    channel: row.channel,
    status: row.status as DeliveryAttemptStatus,
    providerMessageId: row.provider_message_id ?? null,
    errorCode: row.error_code ?? null,
    errorMessage: row.error_message ?? null,
    latencyMs: row.latency_ms ?? null,
    attemptedAt: new Date(row.attempted_at)
  };
}

/**
 * Service managing asynchronous email delivery from persistent notification intents (EL-TK-157, DEC-021, DEC-064).
 * Decouples domain facts from email providers through the neutral EmailSender port,
 * integrates with durable JobQueuePostgres, applies automatic retry with bounded budget (max 3),
 * handles obsolescence prior to dispatch, and persists explicit delivery attempt audit records.
 */
export class EmailNotificationService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly jobQueue: JobQueuePostgres,
    private readonly emailSender: EmailSender,
    private readonly renderer: EmailRenderer = new EmailRenderer(),
    private readonly auditSink?: NotificationAuditSink
  ) {}

  /**
   * Publishes an asynchronous email job for a persistent notification intent.
   * Does NOT credit delivery: delivery is only accredited when the provider confirms execution.
   */
  public async enqueueEmailJob(
    intent: NotificationIntentRecord,
    tx?: SqlTransaction
  ): Promise<string> {
    if (!intent || !intent.id) {
      throw new NotificationError('INVALID_ARGUMENT', 'Valid notification intent is required');
    }

    if (!intent.recipientEmail || !intent.recipientEmail.includes('@')) {
      throw new NotificationError(
        'INVALID_RECIPIENT',
        `Intent ${intent.id} lacks a valid recipient email address`
      );
    }

    const spec: JobSpec = {
      type: 'NOTIFICATION_EMAIL',
      handlerVersion: '1.0',
      resourceRef: intent.recipientRef,
      generation: 1n,
      dedupKey: `email-job:${intent.dedupKey}`,
      queue: 'notification-email',
      priority: 10,
      payload: {
        intentId: intent.id,
        dedupKey: intent.dedupKey,
        recipientRef: intent.recipientRef,
        recipientEmail: intent.recipientEmail,
        notificationType: intent.notificationType,
        resourceRef: intent.resourceRef
      },
      availableAt: intent.effectiveAt,
      deadline: intent.expiresAt ?? undefined
    };

    const publishWork = async (transaction: SqlTransaction): Promise<string> => {
      const jobId = await this.jobQueue.publish(transaction, spec);

      await this.auditSink?.record({
        id: randomUUID(),
        intentId: intent.id,
        dedupKey: intent.dedupKey,
        action: 'EMAIL_JOB_ENQUEUED',
        recipientRef: intent.recipientRef,
        notificationType: intent.notificationType,
        result: 'SUCCESS',
        details: `Job ${jobId} published to queue notification-email`,
        timestamp: new Date()
      });

      return jobId;
    };

    if (tx) {
      return publishWork(tx);
    }
    return this.runner.run(publishWork);
  }

  /**
   * Processes an email job claimed from JobQueuePostgres.
   * Revalidates intent and recipient, renders accessible template, invokes EmailSender port,
   * applies retry/DEAD semantics according to JobQueue policy, and persists delivery attempt.
   */
  public async processEmailJob(execution: Execution): Promise<ProcessEmailJobResult> {
    if (!execution || !execution.jobId || !execution.payload) {
      throw new NotificationError('INVALID_ARGUMENT', 'Valid execution is required');
    }

    const payload = execution.payload as {
      intentId?: string;
      dedupKey?: string;
      recipientRef?: string;
      recipientEmail?: string;
      notificationType?: string;
      resourceRef?: string;
    };

    const intentId = payload.intentId;
    if (!intentId) {
      throw new NotificationError('INVALID_ARGUMENT', 'Execution payload missing intentId');
    }

    // 1. Revalidar la intención en PostgreSQL (Escenario 1 & Escenario 3)
    const intentRow = await this.runner.run(async (tx) => {
      const rows = await tx.query<NotificationIntentRow>(
        `SELECT id, dedup_key, recipient_ref, recipient_email, notification_type,
                resource_ref, status, payload, effective_at, expires_at,
                superseded_at, superseded_by, created_at, updated_at
         FROM notification_intent
         WHERE id = $1`,
        intentId
      );
      return rows[0] ?? null;
    });

    if (!intentRow) {
      throw new NotificationError('INTENT_NOT_FOUND', `Notification intent ${intentId} not found`);
    }

    // 2. Comprobar si el hecho quedó obsoleto antes de entrega (Escenario 3)
    if (intentRow.status === 'SUPERSEDED' || intentRow.status === 'CANCELLED') {
      const operationId = `email-superseded:${execution.jobId}:${execution.attempt}`;
      const now = new Date();

      await this.jobQueue.complete(
        execution,
        operationId,
        { outcome: 'SKIPPED_OBSOLETE', reason: intentRow.superseded_by ?? 'INTENT_SUPERSEDED' },
        async (tx) => {
          await tx.execute(
            `INSERT INTO notification_delivery_attempt (
               id, intent_id, job_id, attempt_number, channel, status,
               provider_message_id, error_code, error_message, latency_ms, attempted_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            randomUUID(),
            intentId,
            execution.jobId,
            execution.attempt,
            'EMAIL',
            'SUPERSEDED',
            null,
            'INTENT_OBSOLETE',
            `Skipped sending: intent status is ${intentRow.status}`,
            0,
            now
          );

          await this.auditSink?.record({
            id: randomUUID(),
            intentId,
            dedupKey: intentRow.dedup_key,
            action: 'EMAIL_SKIPPED_OBSOLETE',
            recipientRef: intentRow.recipient_ref,
            notificationType: intentRow.notification_type,
            result: 'SUPERSEDED',
            details: `Skipped sending email because intent is ${intentRow.status}`,
            timestamp: now
          });
        }
      );

      return {
        outcome: 'SKIPPED_OBSOLETE',
        attemptNumber: execution.attempt,
        errorCode: 'INTENT_OBSOLETE'
      };
    }

    const intentRecord: NotificationIntentRecord = {
      id: intentRow.id,
      dedupKey: intentRow.dedup_key,
      recipientRef: intentRow.recipient_ref,
      recipientEmail: intentRow.recipient_email ?? null,
      notificationType: intentRow.notification_type,
      resourceRef: intentRow.resource_ref,
      status: intentRow.status as any,
      payload: parsePayload(intentRow.payload),
      effectiveAt: new Date(intentRow.effective_at),
      expiresAt: intentRow.expires_at ? new Date(intentRow.expires_at) : null,
      supersededAt: intentRow.superseded_at ? new Date(intentRow.superseded_at) : null,
      supersededBy: intentRow.superseded_by ?? null,
      createdAt: new Date(intentRow.created_at),
      updatedAt: new Date(intentRow.updated_at)
    };

    // 3. Renderizar especificación de correo accesible
    const emailSpec = this.renderer.render(intentRecord);
    const startTime = Date.now();

    // 4. Intentar envío mediante puerto EmailSender
    try {
      const response = await this.emailSender.send(emailSpec);
      const latencyMs = Date.now() - startTime;
      const operationId = `email-complete:${execution.jobId}:${execution.attempt}`;
      const now = new Date();

      await this.jobQueue.complete(
        execution,
        operationId,
        { providerMessageId: response.providerMessageId, latencyMs },
        async (tx) => {
          // Actualizar estado de la intención
          await tx.execute(
            `UPDATE notification_intent
             SET status = $1, updated_at = $2
             WHERE id = $3`,
            'PROCESSED',
            now,
            intentId
          );

          // Persistir resultado exitoso del intento
          await tx.execute(
            `INSERT INTO notification_delivery_attempt (
               id, intent_id, job_id, attempt_number, channel, status,
               provider_message_id, error_code, error_message, latency_ms, attempted_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            randomUUID(),
            intentId,
            execution.jobId,
            execution.attempt,
            'EMAIL',
            'SENT',
            response.providerMessageId,
            null,
            null,
            latencyMs,
            now
          );

          await this.auditSink?.record({
            id: randomUUID(),
            intentId,
            dedupKey: intentRecord.dedupKey,
            action: 'EMAIL_SENT',
            recipientRef: intentRecord.recipientRef,
            notificationType: intentRecord.notificationType,
            result: 'SUCCESS',
            details: `Email confirmed by provider with message ID ${response.providerMessageId}`,
            timestamp: now
          });
        }
      );

      return {
        outcome: 'SENT',
        attemptNumber: execution.attempt,
        providerMessageId: response.providerMessageId
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      const rawError = err instanceof Error ? err.message : 'Unknown provider error';
      // Sanitizar mensaje de error sin fugar credenciales ni tokens
      const sanitizedError = rawError.replace(/(?:password|token|secret|key)=\S+/gi, '[REDACTED]');
      const errorCode = 'PROVIDER_ERROR';
      const now = new Date();

      // Política de reintentos JobQueue (DEC-064: hasta 3 intentos automáticos)
      if (execution.attempt < 3) {
        // Backoff determinista: attempt 1 -> 5s, attempt 2 -> 15s
        const backoffMs = execution.attempt === 1 ? 5000 : 15000;
        const retryAt = new Date(Date.now() + backoffMs);
        const operationId = `email-retry:${execution.jobId}:${execution.attempt}`;

        await this.jobQueue.retry(
          execution,
          operationId,
          { error: errorCode, attempt: execution.attempt, sanitizedError },
          retryAt,
          'RETRYING',
          async (tx) => {
            await tx.execute(
              `INSERT INTO notification_delivery_attempt (
                 id, intent_id, job_id, attempt_number, channel, status,
                 provider_message_id, error_code, error_message, latency_ms, attempted_at
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
              randomUUID(),
              intentId,
              execution.jobId,
              execution.attempt,
              'EMAIL',
              'FAILED',
              null,
              errorCode,
              sanitizedError,
              latencyMs,
              now
            );

            await this.auditSink?.record({
              id: randomUUID(),
              intentId,
              dedupKey: intentRecord.dedupKey,
              action: 'EMAIL_ATTEMPT_FAILED',
              recipientRef: intentRecord.recipientRef,
              notificationType: intentRecord.notificationType,
              result: 'FAILED_RETRYING',
              details: `Attempt ${execution.attempt} failed: ${sanitizedError}`,
              timestamp: now
            });
          }
        );

        return {
          outcome: 'RETRY_SCHEDULED',
          attemptNumber: execution.attempt,
          retryAt,
          errorCode
        };
      }

      // Presupuesto agotado (attempt >= 3): marcar DEAD (Escenario 2)
      const operationId = `email-dead:${execution.jobId}:${execution.attempt}`;
      await this.jobQueue.retry(
        execution,
        operationId,
        { error: 'BUDGET_EXHAUSTED', attempt: execution.attempt, sanitizedError },
        null,
        'DEAD',
        async (tx) => {
          await tx.execute(
            `UPDATE notification_intent
             SET status = $1, updated_at = $2
             WHERE id = $3`,
            'FAILED',
            now,
            intentId
          );

          await tx.execute(
            `INSERT INTO notification_delivery_attempt (
               id, intent_id, job_id, attempt_number, channel, status,
               provider_message_id, error_code, error_message, latency_ms, attempted_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            randomUUID(),
            intentId,
            execution.jobId,
            execution.attempt,
            'EMAIL',
            'DEAD',
            null,
            'BUDGET_EXHAUSTED',
            sanitizedError,
            latencyMs,
            now
          );

          await this.auditSink?.record({
            id: randomUUID(),
            intentId,
            dedupKey: intentRecord.dedupKey,
            action: 'EMAIL_DEAD',
            recipientRef: intentRecord.recipientRef,
            notificationType: intentRecord.notificationType,
            result: 'DEAD',
            details: `All 3 attempts exhausted: ${sanitizedError}`,
            timestamp: now
          });
        }
      );

      return {
        outcome: 'DEAD',
        attemptNumber: execution.attempt,
        errorCode: 'BUDGET_EXHAUSTED'
      };
    }
  }

  /**
   * Retrieves delivery status and accredited confirmation for an intent (Escenario 3).
   * Delivery is accredited ONLY when the provider confirmed execution (`SENT`),
   * never solely because a job was enqueued or retried.
   */
  public async getDeliveryStatus(intentId: string): Promise<NotificationDeliveryStatus> {
    if (!intentId) {
      throw new NotificationError('INVALID_ARGUMENT', 'Intent ID is required');
    }

    return this.runner.run(async (tx) => {
      const intentRows = await tx.query<NotificationIntentRow>(
        `SELECT id, status FROM notification_intent WHERE id = $1`,
        intentId
      );

      if (!intentRows.length) {
        throw new NotificationError('INTENT_NOT_FOUND', `Notification intent ${intentId} not found`);
      }

      const attemptRows = await tx.query<NotificationDeliveryAttemptRow>(
        `SELECT id, status, attempt_number
         FROM notification_delivery_attempt
         WHERE intent_id = $1
         ORDER BY attempt_number DESC, attempted_at DESC`,
        intentId
      );

      const lastAttempt = attemptRows[0];
      const isAcredited = lastAttempt?.status === 'SENT';

      return {
        intentId,
        intentStatus: intentRows[0].status as any,
        attemptsCount: attemptRows.length,
        lastAttemptStatus: lastAttempt ? (lastAttempt.status as DeliveryAttemptStatus) : null,
        isDeliveryAcredited: isAcredited
      };
    });
  }

  /**
   * Lists all recorded delivery attempts for an intent.
   */
  public async listDeliveryAttempts(
    intentId: string
  ): Promise<NotificationDeliveryAttemptRecord[]> {
    if (!intentId) return [];

    return this.runner.run(async (tx) => {
      const rows = await tx.query<NotificationDeliveryAttemptRow>(
        `SELECT id, intent_id, job_id, attempt_number, channel, status,
                provider_message_id, error_code, error_message, latency_ms, attempted_at
         FROM notification_delivery_attempt
         WHERE intent_id = $1
         ORDER BY attempt_number ASC, attempted_at ASC`,
        intentId
      );

      return rows.map(mapAttemptRow);
    });
  }
}
