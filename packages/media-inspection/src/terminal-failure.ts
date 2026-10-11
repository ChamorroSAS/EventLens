import {randomUUID} from 'node:crypto';
import {fingerprint,type Execution,type Json,type JobQueuePostgres,type SqlTransaction} from '@eventlens/job-queue';
import {InspectionError,type InspectionInput,type SafetyFact} from './contracts.js';
import {PostgresInspectionRepository} from './repository.js';
import {MediaRetryPolicy} from './transient-retry.js';

export type TerminalFailureCause = 'BUDGET_EXHAUSTED' | 'TERMINAL_TECHNICAL_ERROR';

export interface TerminalFailureReceipt {
  readonly operationId: string;
  readonly mediaRef: string;
  readonly generation: string;
  readonly previousRevision: string;
  readonly revision: string;
  readonly jobId: string;
  readonly token: string;
  readonly epoch: string;
  readonly cause: TerminalFailureCause;
  readonly sanitizedReason: string;
  readonly downloadEligible: boolean;
  readonly failureFingerprint: string;
  readonly committedAt: Date;
}

export interface DownloadEligibilityFact {
  readonly downloadEligible: boolean;
  readonly safetyOutcome: 'APPROVED' | 'INCONCLUSIVE' | 'DENIED' | 'PENDING';
}

export class TerminalFailurePolicy {
  /**
   * DEC-075: Download of the original on technical processing failure is permitted
   * IF AND ONLY IF the media was explicitly and completely safety approved.
   * Pending, inconclusive, or quarantined/denied media are strictly ineligible.
   */
  static determineDownloadEligibility(safety: SafetyFact | null): DownloadEligibilityFact {
    if (!safety) {
      return { downloadEligible: false, safetyOutcome: 'PENDING' };
    }
    if (safety.schemaVersion === 1 && safety.outcome === 'APPROVED') {
      return { downloadEligible: true, safetyOutcome: 'APPROVED' };
    }
    if (safety.outcome === 'DENIED') {
      return { downloadEligible: false, safetyOutcome: 'DENIED' };
    }
    return { downloadEligible: false, safetyOutcome: 'INCONCLUSIVE' };
  }

  static classifyCause(job: Execution, errorOrCause: unknown, maxAttempts = 3): TerminalFailureCause {
    if (job.attempt >= maxAttempts) {
      return 'BUDGET_EXHAUSTED';
    }
    const errObj = errorOrCause as { code?: string; cause?: string };
    if (errObj?.cause === 'BUDGET_EXHAUSTED' || errObj?.code === 'BUDGET_EXHAUSTED') {
      return 'BUDGET_EXHAUSTED';
    }
    return 'TERMINAL_TECHNICAL_ERROR';
  }
}

export interface TerminalFailureRepository {
  lock(tx: SqlTransaction, mediaRef: string, generation: bigint): Promise<void>;
  receipt(tx: SqlTransaction, operationId: string): Promise<TerminalFailureReceipt | null>;
  apply(
    tx: SqlTransaction,
    job: Execution,
    input: InspectionInput,
    operationId: string,
    cause: TerminalFailureCause,
    sanitizedReason: string,
    failureFingerprint: string
  ): Promise<TerminalFailureReceipt>;
}

export class PostgresTerminalFailureRepository implements TerminalFailureRepository {
  constructor(private readonly inspections = new PostgresInspectionRepository()) {}

  async lock(tx: SqlTransaction, mediaRef: string, generation: bigint): Promise<void> {
    const rows = await tx.query<{ generation: bigint; status: string }>(
      'SELECT generation, status FROM media_catalog WHERE media_ref = $1 FOR UPDATE',
      mediaRef
    );
    if (!rows.length || rows[0].generation !== generation) {
      throw new InspectionError('STALE_ORIGINAL');
    }
  }

  async receipt(tx: SqlTransaction, operationId: string): Promise<TerminalFailureReceipt | null> {
    const rows = await tx.query<{
      operation_id: string;
      media_ref: string;
      generation: bigint;
      previous_revision: bigint;
      revision: bigint;
      job_id: string;
      token: string;
      epoch: string;
      cause: TerminalFailureCause;
      sanitized_reason: string;
      download_eligible: boolean;
      failure_fingerprint: string;
      committed_at: Date;
    }>(
      `SELECT operation_id, media_ref, generation, previous_revision, revision,
              job_id, token, epoch, cause, sanitized_reason, download_eligible,
              failure_fingerprint, committed_at
       FROM media_terminal_failure_receipt
       WHERE operation_id = $1`,
      operationId
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      operationId: r.operation_id,
      mediaRef: r.media_ref,
      generation: String(r.generation),
      previousRevision: String(r.previous_revision),
      revision: String(r.revision),
      jobId: r.job_id,
      token: r.token,
      epoch: r.epoch,
      cause: r.cause,
      sanitizedReason: r.sanitized_reason,
      downloadEligible: r.download_eligible,
      failureFingerprint: r.failure_fingerprint,
      committedAt: r.committed_at,
    };
  }

  async apply(
    tx: SqlTransaction,
    job: Execution,
    input: InspectionInput,
    operationId: string,
    cause: TerminalFailureCause,
    sanitizedReason: string,
    failureFingerprint: string
  ): Promise<TerminalFailureReceipt> {
    // 1. Lock media row and verify eligible state
    const rows = await tx.query<{ generation: bigint; revision: bigint; status: string; original: unknown }>(
      'SELECT generation, revision, status, original FROM media_catalog WHERE media_ref = $1 FOR UPDATE',
      input.mediaRef
    );
    if (!rows.length || rows[0].generation !== input.generation) {
      throw new InspectionError('STALE_ORIGINAL');
    }
    const current = rows[0];
    if (current.revision !== input.revision) {
      throw new InspectionError('CONFLICT');
    }
    // Fail closed: never overwrite terminal, restrictive, or published states
    if (!['UPLOADED', 'PROCESSING'].includes(current.status)) {
      throw new InspectionError('CONFLICT');
    }

    // 2. Query safety facts to determine DEC-075 download eligibility
    const safety = await this.inspections.get(tx, input.mediaRef, input.generation);
    const eligibility = TerminalFailurePolicy.determineDownloadEligibility(safety);

    // 3. Update media_catalog: status -> PROCESSING_FAILED, revision -> revision + 1, original untouched
    const nextRevision = input.revision + 1n;
    const updated = await tx.execute(
      `UPDATE media_catalog
       SET status = 'PROCESSING_FAILED', revision = revision + 1
       WHERE media_ref = $1
         AND generation = $2::bigint
         AND revision = $3::bigint
         AND status IN ('UPLOADED', 'PROCESSING')`,
      input.mediaRef,
      input.generation,
      input.revision
    );
    if (updated !== 1) {
      throw new InspectionError('CONFLICT');
    }

    // 4. Record terminal failure receipt
    await tx.execute(
      `INSERT INTO media_terminal_failure_receipt(
         operation_id, media_ref, generation, previous_revision, revision,
         job_id, token, epoch, cause, sanitized_reason, download_eligible,
         failure_fingerprint, committed_at
       ) VALUES (
         $1, $2, $3::bigint, $4::bigint, $5::bigint,
         $6::uuid, $7::uuid, $8, $9, $10, $11,
         $12, clock_timestamp()
       )`,
      operationId,
      input.mediaRef,
      input.generation,
      input.revision,
      nextRevision,
      job.jobId,
      job.token,
      job.epoch,
      cause,
      sanitizedReason,
      eligibility.downloadEligible,
      failureFingerprint
    );

    // 5. Record terminal failure audit
    await tx.execute(
      `INSERT INTO media_terminal_failure_audit(
         id, operation_id, media_ref, generation, previous_revision, revision,
         job_id, token, epoch, cause, sanitized_reason, download_eligible,
         safety_outcome, actor, transition, committed_at
       ) VALUES (
         $1::uuid, $2, $3, $4::bigint, $5::bigint, $6::bigint,
         $7::uuid, $8::uuid, $9, $10, $11, $12,
         $13, 'SYSTEM', 'PROCESSING_FAILED', clock_timestamp()
       )`,
      randomUUID(),
      operationId,
      input.mediaRef,
      input.generation,
      input.revision,
      nextRevision,
      job.jobId,
      job.token,
      job.epoch,
      cause,
      sanitizedReason,
      eligibility.downloadEligible,
      eligibility.safetyOutcome
    );

    return {
      operationId,
      mediaRef: input.mediaRef,
      generation: String(input.generation),
      previousRevision: String(input.revision),
      revision: String(nextRevision),
      jobId: job.jobId,
      token: job.token,
      epoch: job.epoch,
      cause,
      sanitizedReason,
      downloadEligible: eligibility.downloadEligible,
      failureFingerprint,
      committedAt: new Date(),
    };
  }
}

export class ApplyTerminalFailure {
  constructor(
    private readonly repository: TerminalFailureRepository,
    private readonly queue: Pick<JobQueuePostgres, 'retry'>
  ) {}

  async execute(
    job: Execution,
    input: InspectionInput,
    errorOrCause: unknown,
    operationId: string,
    explicitCause?: TerminalFailureCause
  ): Promise<{
    result: 'COMPLETED' | 'ALREADY_COMMITTED';
    receipt: TerminalFailureReceipt;
  }> {
    if (!operationId || input.mediaRef !== job.resourceRef || input.generation !== job.generation) {
      throw new InspectionError('INVALID_ARGUMENT');
    }

    const cause = explicitCause ?? TerminalFailurePolicy.classifyCause(job, errorOrCause);
    const sanitizedReason = MediaRetryPolicy.sanitizeReason(errorOrCause);

    const outcome = JSON.parse(
      JSON.stringify({
        jobId: job.jobId,
        mediaRef: input.mediaRef,
        generation: String(input.generation),
        revision: String(input.revision),
        cause,
        sanitizedReason,
      })
    ) as Json;

    const hash = fingerprint(outcome);
    let receipt: TerminalFailureReceipt | undefined;

    const result = await this.queue.retry(
      job,
      operationId,
      outcome,
      null,
      'DEAD',
      async tx => {
        receipt = await this.repository.apply(
          tx,
          job,
          input,
          operationId,
          cause,
          sanitizedReason,
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
      receipt,
    };
  }
}
