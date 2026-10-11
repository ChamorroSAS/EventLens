import {randomUUID} from 'node:crypto';
import {fingerprint,type Execution,type Json,type JobQueuePostgres,type SqlTransaction} from '@eventlens/job-queue';
import {InspectionError,type InspectionInput} from './contracts.js';

export type TransientCategory =
  | 'NETWORK_TIMEOUT'
  | 'STORAGE_UNAVAILABLE'
  | 'DATABASE_UNAVAILABLE'
  | 'WORKER_CRASH'
  | 'INCONCLUSIVE_INSPECTION'
  | 'RESOURCE_EXHAUSTED'
  | 'GENERIC_TRANSIENT';

export interface TransientClassification {
  readonly isTransient: boolean;
  readonly category: TransientCategory | 'NON_TRANSIENT';
  readonly sanitizedReason: string;
}

export interface MediaRetryReceipt {
  readonly operationId: string;
  readonly mediaRef: string;
  readonly generation: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly disposition: 'RETRYING' | 'DEAD';
  readonly retryFingerprint: string;
}

export class MediaRetryPolicy {
  static readonly DEFAULT_MAX_ATTEMPTS = 3;
  static readonly DEFAULT_BASE_DELAY_MS = 1000;
  static readonly DEFAULT_MAX_DELAY_MS = 30000;

  static sanitizeReason(raw: unknown): string {
    if (!raw) return 'Unknown technical error';
    const msg = typeof raw === 'string' ? raw : (raw instanceof Error ? raw.message : String(raw));
    return msg
      .replace(/postgres(?:ql)?:\/\/\S+/gi, '[REDACTED_DB_URL]')
      .replace(/https?:\/\/[^/]+@\S+/gi, '[REDACTED_AUTH_URL]')
      .replace(/(password|token|secret|key|access_key)=['"]?[^'"\s&]+['"]?/gi, '$1=[REDACTED]')
      .replace(/[A-Za-z]:\\[\w.-]+(?:\\[\w.-]+)*/g, '[REDACTED_PATH]')
      .replace(/\/(?:workspace|home|tmp|etc|var|run)\/[\w./-]+/g, '[REDACTED_PATH]')
      .slice(0, 500);
  }

  static classify(error: unknown): TransientClassification {
    const sanitized = this.sanitizeReason(error);
    const errObj = error as {
      code?: string;
      name?: string;
      status?: number;
      statusCode?: number;
      outcome?: string;
      format?: { status?: string; reason?: string };
      malware?: { status?: string; reason?: string };
    };

    if (errObj?.code === 'STALE_ORIGINAL' || errObj?.code === 'INVALID_ARGUMENT') {
      return { isTransient: false, category: 'NON_TRANSIENT', sanitizedReason: sanitized };
    }
    if (
      errObj?.malware?.status === 'THREAT_DETECTED' ||
      errObj?.format?.status === 'INVALID' ||
      errObj?.outcome === 'DENIED'
    ) {
      return { isTransient: false, category: 'NON_TRANSIENT', sanitizedReason: sanitized };
    }

    const msg = typeof error === 'string' ? error : (error instanceof Error ? error.message : '');
    const code = errObj?.code ?? '';
    const status = errObj?.status ?? errObj?.statusCode ?? 0;

    if (
      code === 'ETIMEDOUT' ||
      code === 'ECONNRESET' ||
      code === 'ECONNREFUSED' ||
      msg.includes('timeout') ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('TIMEDOUT')
    ) {
      return { isTransient: true, category: 'NETWORK_TIMEOUT', sanitizedReason: sanitized };
    }
    if (
      (status >= 500 && status < 600) ||
      msg.includes('503 Service Unavailable') ||
      msg.includes('500 Internal') ||
      code === 'SlowDown' ||
      code === 'ServiceUnavailable'
    ) {
      return { isTransient: true, category: 'STORAGE_UNAVAILABLE', sanitizedReason: sanitized };
    }
    if (
      code === '40P01' ||
      code === '40001' ||
      code === '57P01' ||
      msg.includes('deadlock') ||
      msg.includes('lock timeout') ||
      msg.includes('connection lost')
    ) {
      return { isTransient: true, category: 'DATABASE_UNAVAILABLE', sanitizedReason: sanitized };
    }
    if (
      code === 'WORKER_CRASH' ||
      msg.includes('SIGKILL') ||
      msg.includes('OOMKilled') ||
      msg.includes('process exited unexpectedly') ||
      code === 'SUPERVISOR_CRASH'
    ) {
      return { isTransient: true, category: 'WORKER_CRASH', sanitizedReason: sanitized };
    }
    if (
      errObj?.outcome === 'INCONCLUSIVE' ||
      errObj?.format?.status === 'INCONCLUSIVE' ||
      errObj?.malware?.status === 'INCONCLUSIVE'
    ) {
      return { isTransient: true, category: 'INCONCLUSIVE_INSPECTION', sanitizedReason: sanitized };
    }
    if (msg.includes('temporary') || msg.includes('transient') || code === 'TRANSIENT') {
      return { isTransient: true, category: 'GENERIC_TRANSIENT', sanitizedReason: sanitized };
    }

    return { isTransient: true, category: 'GENERIC_TRANSIENT', sanitizedReason: sanitized };
  }

  static calculateDelay(
    attempt: number,
    baseMs = MediaRetryPolicy.DEFAULT_BASE_DELAY_MS,
    maxMs = MediaRetryPolicy.DEFAULT_MAX_DELAY_MS
  ): number {
    const factor = Math.max(1, Math.pow(2, Math.max(0, attempt - 1)));
    return Math.min(baseMs * factor, maxMs);
  }
}

export interface MediaRetryRepository {
  lock(tx: SqlTransaction, mediaRef: string, generation: bigint): Promise<void>;
  record(
    tx: SqlTransaction,
    job: Execution,
    input: InspectionInput,
    operationId: string,
    disposition: 'RETRYING' | 'DEAD',
    category: string,
    sanitizedReason: string,
    retryAt: Date | null,
    hash: string
  ): Promise<MediaRetryReceipt>;
  receipt(tx: SqlTransaction, operationId: string): Promise<MediaRetryReceipt | null>;
}

export class PostgresMediaRetryRepository implements MediaRetryRepository {
  async lock(tx: SqlTransaction, mediaRef: string, generation: bigint): Promise<void> {
    const rows = await tx.query<{ generation: bigint; status: string; original: unknown }>(
      'SELECT generation, status, original FROM media_catalog WHERE media_ref = $1 FOR UPDATE',
      mediaRef
    );
    if (!rows.length || rows[0].generation !== generation) {
      throw new InspectionError('STALE_ORIGINAL');
    }
    if (!['UPLOADED', 'PROCESSING'].includes(rows[0].status)) {
      throw new InspectionError('CONFLICT');
    }
  }

  async receipt(tx: SqlTransaction, operationId: string): Promise<MediaRetryReceipt | null> {
    const rows = await tx.query<{
      operation_id: string;
      media_ref: string;
      generation: bigint;
      job_id: string;
      attempt: number;
      disposition: 'RETRYING' | 'DEAD';
      retry_fingerprint: string;
    }>(
      `SELECT operation_id, media_ref, generation, job_id, attempt, disposition, retry_fingerprint
       FROM media_retry_receipt
       WHERE operation_id = $1`,
      operationId
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      operationId: r.operation_id,
      mediaRef: r.media_ref,
      generation: String(r.generation),
      jobId: r.job_id,
      attempt: r.attempt,
      disposition: r.disposition,
      retryFingerprint: r.retry_fingerprint,
    };
  }

  async record(
    tx: SqlTransaction,
    job: Execution,
    input: InspectionInput,
    operationId: string,
    disposition: 'RETRYING' | 'DEAD',
    category: string,
    sanitizedReason: string,
    retryAt: Date | null,
    hash: string
  ): Promise<MediaRetryReceipt> {
    await tx.execute(
      `INSERT INTO media_retry_receipt(operation_id, media_ref, generation, job_id, token, epoch, attempt, disposition, retry_fingerprint, committed_at)
       VALUES($1, $2, $3::bigint, $4::uuid, $5::uuid, $6, $7, $8, $9, clock_timestamp())`,
      operationId, input.mediaRef, input.generation, job.jobId, job.token, job.epoch, job.attempt, disposition, hash
    );
    await tx.execute(
      `INSERT INTO media_retry_audit(id, operation_id, media_ref, generation, job_id, token, epoch, attempt, disposition, category, sanitized_reason, retry_at, committed_at)
       VALUES($1::uuid, $2, $3, $4::bigint, $5::uuid, $6::uuid, $7, $8, $9, $10, $11, $12::timestamptz, clock_timestamp())`,
      randomUUID(), operationId, input.mediaRef, input.generation, job.jobId, job.token, job.epoch, job.attempt, disposition, category, sanitizedReason, retryAt
    );
    return {
      operationId,
      mediaRef: input.mediaRef,
      generation: String(input.generation),
      jobId: job.jobId,
      attempt: job.attempt,
      disposition,
      retryFingerprint: hash,
    };
  }
}

export class ApplyTransientRetry {
  constructor(
    private readonly repository: MediaRetryRepository,
    private readonly queue: Pick<JobQueuePostgres, 'retry'>,
    private readonly options?: {
      maxAttempts?: number;
      baseDelayMs?: number;
      maxDelayMs?: number;
    }
  ) {}

  async execute(
    job: Execution,
    input: InspectionInput,
    error: unknown,
    operationId: string
  ): Promise<{
    result: 'COMPLETED' | 'ALREADY_COMMITTED';
    disposition: 'RETRYING' | 'DEAD';
    retryAt: Date | null;
    receipt: MediaRetryReceipt;
  }> {
    if (!operationId || input.mediaRef !== job.resourceRef || input.generation !== job.generation) {
      throw new InspectionError('INVALID_ARGUMENT');
    }
    const classification = MediaRetryPolicy.classify(error);
    if (!classification.isTransient) {
      throw new InspectionError('CONFLICT');
    }

    const maxAttempts = this.options?.maxAttempts ?? MediaRetryPolicy.DEFAULT_MAX_ATTEMPTS;
    const isExhausted = job.attempt >= maxAttempts;
    const disposition: 'RETRYING' | 'DEAD' = isExhausted ? 'DEAD' : 'RETRYING';
    const retryAt = isExhausted
      ? null
      : new Date(Date.now() + MediaRetryPolicy.calculateDelay(job.attempt, this.options?.baseDelayMs, this.options?.maxDelayMs));

    const outcome = JSON.parse(JSON.stringify({
      jobId: job.jobId,
      mediaRef: input.mediaRef,
      generation: String(input.generation),
      attempt: job.attempt,
      disposition,
      category: classification.category,
      sanitizedReason: classification.sanitizedReason,
    })) as Json;

    const hash = fingerprint(outcome);
    let receipt: MediaRetryReceipt | undefined;

    const result = await this.queue.retry(
      job,
      operationId,
      outcome,
      retryAt,
      disposition,
      async tx => {
        receipt = await this.repository.record(
          tx,
          job,
          input,
          operationId,
          disposition,
          classification.category,
          classification.sanitizedReason,
          retryAt,
          hash
        );
      },
      async tx => {
        await this.repository.lock(tx, input.mediaRef, input.generation);
        const previous = await this.repository.receipt(tx, operationId);
        if (previous) receipt = previous;
      }
    );

    if (!receipt) {
      throw new InspectionError('CONFLICT');
    }

    return {
      result,
      disposition,
      retryAt,
      receipt,
    };
  }
}
