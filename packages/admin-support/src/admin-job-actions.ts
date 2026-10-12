import { randomUUID } from 'node:crypto';
import {
  AdminSupportError,
  type AdminJobAction,
  type AdminJobStatus,
  type AdminSupportAuditSink,
  type ExecuteJobActionCommand,
  type ExecuteJobActionResult,
  type SqlTransaction,
  type TransactionRunner
} from './contracts.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RawJobRow {
  id: string;
  status: string;
  cancelled: boolean;
  lease_until: Date | string | null;
}

interface RawReceiptRow {
  id: string;
  job_id: string;
  action: string;
  reason: string;
  principal_id: string;
  idempotency_key: string;
  previous_status: string;
  new_status: string;
  created_at: Date | string;
}

export class AdminJobActionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly auditSink?: AdminSupportAuditSink
  ) {
    if (!runner) {
      throw new AdminSupportError('INVALID_ARGUMENT', 'TransactionRunner is required');
    }
  }

  public async executeAction(
    command: ExecuteJobActionCommand
  ): Promise<ExecuteJobActionResult> {
    if (!command || typeof command !== 'object') {
      throw new AdminSupportError('INVALID_ARGUMENT', 'Command is required');
    }

    const { actorContext, jobId, action, reason, idempotencyKey } = command;

    // 1. Validación de ActorContext (EL-TK-044)
    if (!actorContext || actorContext.actorType !== 'ADMIN_HUMAN' || !actorContext.principalId) {
      throw new AdminSupportError('UNAUTHORIZED', 'Authorized administrative principal required');
    }

    // 2. Validación de jobId
    if (!jobId || typeof jobId !== 'string' || !UUID_REGEX.test(jobId.trim())) {
      throw new AdminSupportError('INVALID_ARGUMENT', 'Valid job UUID is required');
    }
    const cleanJobId = jobId.trim();

    // 3. Validación de acción permitida
    if (!['RETRY', 'CANCEL', 'MARK_DEAD'].includes(action)) {
      throw new AdminSupportError(
        'INVALID_ARGUMENT',
        `Invalid action: expected 'RETRY', 'CANCEL', or 'MARK_DEAD'`
      );
    }

    // 4. Validación de motivo obligatorio (auditado)
    if (!reason || typeof reason !== 'string') {
      throw new AdminSupportError('INVALID_ARGUMENT', 'Operational reason is required');
    }
    const cleanReason = reason.replace(/[\x00-\x1F\x7F]/g, '').trim();
    if (cleanReason.length < 5 || cleanReason.length > 500) {
      throw new AdminSupportError(
        'INVALID_ARGUMENT',
        'Operational reason must be between 5 and 500 characters'
      );
    }

    // 5. Validación de clave de idempotencia
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
      throw new AdminSupportError('INVALID_ARGUMENT', 'Idempotency key is required');
    }
    const cleanIdempotencyKey = idempotencyKey.trim();
    if (cleanIdempotencyKey.length < 8 || cleanIdempotencyKey.length > 128) {
      throw new AdminSupportError(
        'INVALID_ARGUMENT',
        'Idempotency key must be between 8 and 128 characters'
      );
    }

    // 6. Ejecución transaccional con bloqueo pesimista y verificación de idempotencia
    const result = await this.runner.run(async (tx: SqlTransaction) => {
      // a. Verificar idempotencia previa
      const existingReceipts = await tx.query<RawReceiptRow>(
        `SELECT * FROM admin_job_action_receipt WHERE idempotency_key = $1`,
        cleanIdempotencyKey
      );

      const existingReceipt = existingReceipts[0];
      if (existingReceipt) {
        if (
          existingReceipt.job_id !== cleanJobId ||
          existingReceipt.action !== action
        ) {
          throw new AdminSupportError(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key reused with conflicting action or job parameters'
          );
        }

        return {
          outcome: 'IDEMPOTENT_REPLAY' as const,
          jobId: cleanJobId,
          action: existingReceipt.action as AdminJobAction,
          previousStatus: existingReceipt.previous_status as AdminJobStatus,
          newStatus: existingReceipt.new_status as AdminJobStatus,
          executedAt: new Date(existingReceipt.created_at).toISOString()
        };
      }

      // b. Bloquear el job actual en job_queue
      const jobRows = await tx.query<RawJobRow>(
        `SELECT id::text AS id, status::text AS status, cancelled, lease_until FROM job_queue WHERE id = $1 FOR UPDATE`,
        cleanJobId
      );

      const job = jobRows[0];
      if (!job) {
        throw new AdminSupportError('NOT_FOUND', `Job '${cleanJobId}' not found`);
      }

      const previousStatus = job.status as AdminJobStatus;
      const isCancelled = Boolean(job.cancelled);
      const isLeaseActive =
        job.lease_until !== null &&
        new Date(job.lease_until).getTime() > Date.now();

      let newStatus: AdminJobStatus;

      // c. Evaluar compatibilidad de la acción según estado
      switch (action) {
        case 'RETRY': {
          // Elegible si DEAD, FAILED o CANCELLED
          if (!['DEAD', 'FAILED'].includes(previousStatus) && !isCancelled) {
            throw new AdminSupportError(
              'INCOMPATIBLE_JOB_STATUS',
              `Cannot retry job in status '${previousStatus}' (eligible: DEAD, FAILED, or cancelled)`
            );
          }
          newStatus = 'PENDING';
          await tx.execute(
            `UPDATE job_queue 
             SET status = 'PENDING', cancelled = false, attempt = 0, available_at = CURRENT_TIMESTAMP, lease_until = NULL 
             WHERE id = $1`,
            cleanJobId
          );
          break;
        }

        case 'CANCEL': {
          // No se puede cancelar si está activamente en PROCESSING con lease vigente
          if (previousStatus === 'PROCESSING' && isLeaseActive) {
            throw new AdminSupportError(
              'JOB_LOCKED_OR_PROCESSING',
              'Cannot cancel job currently being processed under active worker lease'
            );
          }
          if (!['PENDING', 'RETRYING'].includes(previousStatus)) {
            throw new AdminSupportError(
              'INCOMPATIBLE_JOB_STATUS',
              `Cannot cancel job in status '${previousStatus}' (eligible: PENDING or RETRYING)`
            );
          }
          newStatus = 'CANCELLED';
          await tx.execute(
            `UPDATE job_queue 
             SET status = 'CANCELLED', cancelled = true 
             WHERE id = $1`,
            cleanJobId
          );
          break;
        }

        case 'MARK_DEAD': {
          // Elegible si RETRYING o FAILED
          if (!['RETRYING', 'FAILED'].includes(previousStatus)) {
            throw new AdminSupportError(
              'INCOMPATIBLE_JOB_STATUS',
              `Cannot mark dead a job in status '${previousStatus}' (eligible: RETRYING or FAILED)`
            );
          }
          newStatus = 'DEAD';
          await tx.execute(
            `UPDATE job_queue 
             SET status = 'DEAD' 
             WHERE id = $1`,
            cleanJobId
          );
          break;
        }
      }

      // d. Registrar recibo durable de idempotencia
      const receiptId = randomUUID();
      await tx.execute(
        `INSERT INTO admin_job_action_receipt (
          id, job_id, action, reason, principal_id, idempotency_key, previous_status, new_status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
        receiptId,
        cleanJobId,
        action,
        cleanReason,
        actorContext.principalId,
        cleanIdempotencyKey,
        previousStatus,
        newStatus
      );

      return {
        outcome: 'EXECUTED' as const,
        jobId: cleanJobId,
        action,
        previousStatus,
        newStatus,
        executedAt: new Date().toISOString()
      };
    });

    // 7. Observabilidad y auditoría
    if (this.auditSink) {
      try {
        await this.auditSink.record({
          procedure: 'ADMIN_JOB_ACTION_EXECUTED',
          principalId: actorContext.principalId,
          details: JSON.stringify({
            jobId: cleanJobId,
            action,
            reason: cleanReason,
            outcome: result.outcome,
            previousStatus: result.previousStatus,
            newStatus: result.newStatus
          }),
          timestamp: new Date()
        });
      } catch {
        // Ignorar fallo de auditoría asíncrona
      }
    }

    return result;
  }
}
