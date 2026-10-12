import {
  AdminSupportError,
  type AdminGetJobDetailQuery,
  type AdminJobAttemptHistoryItem,
  type AdminJobCapabilities,
  type AdminJobDetail,
  type AdminJobStatus,
  type AdminJobSummaryItem,
  type AdminQueryJobsQuery,
  type AdminQueryJobsResult,
  type AdminSupportAuditSink,
  type SqlTransaction,
  type TransactionRunner
} from './contracts.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitizeTechnicalError(
  rawError: string | null | undefined
): string | null {
  if (!rawError || typeof rawError !== 'string') {
    return null;
  }

  let sanitized = rawError
    // 1. Ocultar connection strings con contraseñas
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]')
    // 2. Ocultar URLs firmadas de storage
    .replace(/https?:\/\/[^\s]+\?[^\s]*Signature=[^\s&]+/gi, '[REDACTED_SIGNED_URL]')
    // 3. Ocultar tokens, secrets y passwords
    .replace(/(?:password|secret|token|bearer|key|signature)[=:\s]+[^\s,;&]+/gi, '[REDACTED_SECRET]')
    // 4. Ocultar rutas absolutas del host
    .replace(/(?:[a-zA-Z]:\\[^\s]+|\/(?:workspace|home|tmp|etc|usr|var)\/[^\s]+)/g, '[PATH_REDACTED]')
    // 5. Eliminar caracteres de control ASCII
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim();

  if (sanitized.length > 300) {
    sanitized = sanitized.slice(0, 297) + '...';
  }

  return sanitized.length > 0 ? sanitized : null;
}

export function calculateJobCapabilities(
  status: string,
  cancelled: boolean
): AdminJobCapabilities {
  if (cancelled) {
    return {
      canRetry: true,
      canCancel: false,
      canMarkDead: false
    };
  }

  switch (status) {
    case 'PENDING':
      return {
        canRetry: false,
        canCancel: true,
        canMarkDead: false
      };
    case 'PROCESSING':
      return {
        canRetry: false,
        canCancel: false,
        canMarkDead: false
      };
    case 'RETRYING':
      return {
        canRetry: true,
        canCancel: true,
        canMarkDead: true
      };
    case 'FAILED':
      return {
        canRetry: true,
        canCancel: false,
        canMarkDead: true
      };
    case 'DEAD':
      return {
        canRetry: true,
        canCancel: false,
        canMarkDead: false
      };
    case 'COMPLETED':
    default:
      return {
        canRetry: false,
        canCancel: false,
        canMarkDead: false
      };
  }
}

interface RawJobRow {
  id: string;
  type: string;
  status: string;
  queue: string;
  priority: number;
  resource_ref: string;
  attempt: number;
  available_at: Date | string;
  deadline: Date | string | null;
  cancelled: boolean;
  last_result: string | null;
}

interface RawAttemptRow {
  number: number;
  started_at: Date | string;
  ended_at: Date | string | null;
  result: string | null;
}

export class AdminJobInspectionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly auditSink?: AdminSupportAuditSink
  ) {
    if (!runner) {
      throw new AdminSupportError('INVALID_ARGUMENT', 'TransactionRunner is required');
    }
  }

  public async queryJobs(query: AdminQueryJobsQuery): Promise<AdminQueryJobsResult> {
    if (!query || typeof query !== 'object') {
      throw new AdminSupportError('INVALID_ARGUMENT', 'Query is required');
    }

    const { actorContext } = query;

    // Control de acceso administrativo (EL-TK-044)
    if (!actorContext || actorContext.actorType !== 'ADMIN_HUMAN' || !actorContext.principalId) {
      throw new AdminSupportError('UNAUTHORIZED', 'Authorized administrative principal required');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) {
      throw new AdminSupportError('INVALID_ARGUMENT', 'Page must be an integer >= 1');
    }

    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new AdminSupportError('INVALID_ARGUMENT', 'Limit must be an integer between 1 and 100');
    }

    const offset = (page - 1) * limit;

    const result = await this.runner.run(async (tx: SqlTransaction) => {
      let whereClause = 'WHERE 1=1';
      const sqlParams: unknown[] = [];
      let paramIdx = 1;

      if (query.resourceRef) {
        whereClause += ` AND j.resource_ref ILIKE $${paramIdx}`;
        sqlParams.push(`%${query.resourceRef.trim()}%`);
        paramIdx++;
      }

      if (query.status) {
        whereClause += ` AND j.status = $${paramIdx}`;
        sqlParams.push(query.status);
        paramIdx++;
      }

      // 1. Conteo total
      const countRows = await tx.query<{ total: string | number }>(
        `SELECT COUNT(*)::bigint AS total FROM job_queue j ${whereClause}`,
        ...sqlParams
      );
      const total = countRows[0] ? Number(countRows[0].total) : 0;
      const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

      if (total === 0) {
        return {
          items: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0
          }
        };
      }

      // 2. Consulta de filas con último attempt
      const pagedSql = `
        SELECT 
          j.id::text AS id,
          j.type AS type,
          j.status::text AS status,
          j.queue AS queue,
          j.priority AS priority,
          j.resource_ref AS resource_ref,
          j.attempt AS attempt,
          j.available_at AS available_at,
          j.deadline AS deadline,
          j.cancelled AS cancelled,
          (
            SELECT a.result 
            FROM job_attempt a 
            WHERE a.job_id = j.id 
            ORDER BY a.number DESC 
            LIMIT 1
          ) AS last_result
        FROM job_queue j
        ${whereClause}
        ORDER BY j.available_at DESC
        LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
      `;

      const rows = await tx.query<RawJobRow>(pagedSql, ...sqlParams, limit, offset);

      const items: AdminJobSummaryItem[] = rows.map((r) => {
        const sanitized = sanitizeTechnicalError(r.last_result);
        return {
          id: r.id,
          type: r.type,
          status: r.status as AdminJobStatus,
          queue: r.queue,
          priority: r.priority,
          resourceRef: r.resource_ref,
          attempts: r.attempt,
          availableAt: new Date(r.available_at).toISOString(),
          cancelled: Boolean(r.cancelled),
          lastError: sanitized ?? undefined,
          capabilities: calculateJobCapabilities(r.status, Boolean(r.cancelled))
        };
      });

      return {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      };
    });

    if (this.auditSink) {
      try {
        await this.auditSink.record({
          procedure: 'ADMIN_JOB_LIST_VIEWED',
          principalId: actorContext.principalId,
          details: JSON.stringify({
            resourceRefFilter: Boolean(query.resourceRef),
            statusFilter: Boolean(query.status),
            page,
            resultsCount: result.items.length,
            total: result.pagination.total
          }),
          timestamp: new Date()
        });
      } catch {
        // Ignorar fallo de auditoría asíncrona
      }
    }

    return result;
  }

  public async getJobDetail(query: AdminGetJobDetailQuery): Promise<AdminJobDetail> {
    if (!query || typeof query !== 'object') {
      throw new AdminSupportError('INVALID_ARGUMENT', 'Query is required');
    }

    const { actorContext, jobId } = query;

    if (!actorContext || actorContext.actorType !== 'ADMIN_HUMAN' || !actorContext.principalId) {
      throw new AdminSupportError('UNAUTHORIZED', 'Authorized administrative principal required');
    }

    if (!jobId || typeof jobId !== 'string' || !UUID_REGEX.test(jobId.trim())) {
      throw new AdminSupportError('INVALID_ARGUMENT', 'Valid job UUID is required');
    }

    const cleanJobId = jobId.trim();

    const detail = await this.runner.run(async (tx: SqlTransaction) => {
      // 1. Obtener fila del job
      const jobRows = await tx.query<RawJobRow>(
        `
        SELECT 
          j.id::text AS id,
          j.type AS type,
          j.status::text AS status,
          j.queue AS queue,
          j.priority AS priority,
          j.resource_ref AS resource_ref,
          j.attempt AS attempt,
          j.available_at AS available_at,
          j.deadline AS deadline,
          j.cancelled AS cancelled,
          NULL AS last_result
        FROM job_queue j
        WHERE j.id = $1
        `,
        cleanJobId
      );

      const job = jobRows[0];
      if (!job) {
        throw new AdminSupportError('INVALID_ARGUMENT', `Job '${cleanJobId}' not found`);
      }

      // 2. Obtener historial de attempts
      const attemptRows = await tx.query<RawAttemptRow>(
        `
        SELECT 
          a.number AS number,
          a.started_at AS started_at,
          a.ended_at AS ended_at,
          a.result AS result
        FROM job_attempt a
        WHERE a.job_id = $1
        ORDER BY a.number ASC
        `,
        cleanJobId
      );

      const attemptsHistory: AdminJobAttemptHistoryItem[] = attemptRows.map((a) => ({
        number: a.number,
        startedAt: new Date(a.started_at).toISOString(),
        endedAt: a.ended_at ? new Date(a.ended_at).toISOString() : null,
        result: sanitizeTechnicalError(a.result)
      }));

      // El último error sanitizado del último intento
      const lastAttempt = attemptsHistory[attemptsHistory.length - 1];
      const sanitizedError = lastAttempt?.result ?? null;

      const jobDetail: AdminJobDetail = {
        id: job.id,
        type: job.type,
        status: job.status as AdminJobStatus,
        queue: job.queue,
        priority: job.priority,
        resourceRef: job.resource_ref,
        attempts: job.attempt,
        availableAt: new Date(job.available_at).toISOString(),
        deadline: job.deadline ? new Date(job.deadline).toISOString() : null,
        cancelled: Boolean(job.cancelled),
        sanitizedError,
        attemptsHistory,
        capabilities: calculateJobCapabilities(job.status, Boolean(job.cancelled))
      };

      return jobDetail;
    });

    if (this.auditSink) {
      try {
        await this.auditSink.record({
          procedure: 'ADMIN_JOB_DETAIL_VIEWED',
          principalId: actorContext.principalId,
          details: JSON.stringify({
            jobId: cleanJobId,
            jobStatus: detail.status,
            attempts: detail.attempts,
            hasError: Boolean(detail.sanitizedError)
          }),
          timestamp: new Date()
        });
      } catch {
        // Ignorar fallo de auditoría asíncrona
      }
    }

    return detail;
  }
}
