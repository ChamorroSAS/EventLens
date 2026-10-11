import {randomUUID} from 'node:crypto';
import type {JobQueuePostgres,SqlTransaction,TransactionRunner} from '@eventlens/job-queue';
import {InspectionError} from './contracts.js';
import {PostgresInspectionRepository} from './repository.js';

export type CycleDenialCode =
  | 'QUARANTINED'
  | 'STATUS_NOT_ELIGIBLE'
  | 'ORGANIZER_NOT_AUTHORIZED'
  | 'BARRED_EVENT'
  | 'INVALID_ARGUMENT'
  | 'IDEMPOTENCY_CONFLICT';

export class CycleDeniedError extends Error {
  constructor(readonly code: CycleDenialCode, message?: string) {
    super(message ?? code);
  }
}

export interface EventOrganizerAuthorization {
  assertAuthorizedOrganizer(
    tx: SqlTransaction,
    scope: { eventRef: string; organizerRef: string }
  ): Promise<void>;
}

export interface RetryCycleReceipt {
  readonly cycleId: string;
  readonly cycleNumber: number;
  readonly mediaRef: string;
  readonly eventRef: string;
  readonly organizerRef: string;
  readonly jobId: string;
  readonly jobType: string;
  readonly safetyOutcome: string;
  readonly status: 'ACTIVE' | 'TERMINATED' | 'COMPLETED';
  readonly operationId: string;
  readonly wasExistingCycle: boolean;
  readonly createdAt: Date;
}

export interface RequestRetryCycleCommand {
  readonly mediaRef: string;
  readonly eventRef: string;
  readonly organizerRef: string;
  readonly kind?: 'PHOTO' | 'VIDEO';
  readonly queueName?: string;
}

export interface RetryCycleRepository {
  findActiveCycle(tx: SqlTransaction, mediaRef: string): Promise<RetryCycleReceipt | null>;
  getReceiptByOperation(tx: SqlTransaction, operationId: string): Promise<RetryCycleReceipt | null>;
  createCycle(
    tx: SqlTransaction,
    params: {
      cycleId: string;
      mediaRef: string;
      eventRef: string;
      organizerRef: string;
      jobId: string;
      jobType: string;
      safetyOutcome: string;
      operationId: string;
    }
  ): Promise<RetryCycleReceipt>;
  recordDenial(
    tx: SqlTransaction,
    params: {
      operationId: string;
      mediaRef: string;
      eventRef: string;
      organizerRef: string;
      reason: string;
    }
  ): Promise<void>;
}

export class PostgresRetryCycleRepository implements RetryCycleRepository {
  async findActiveCycle(tx: SqlTransaction, mediaRef: string): Promise<RetryCycleReceipt | null> {
    const cycles = await tx.query<{
      cycle_id: string;
      cycle_number: number;
      media_ref: string;
      event_ref: string;
      organizer_ref: string;
      job_id: string;
      job_type: string;
      safety_outcome: string;
      status: 'ACTIVE' | 'TERMINATED' | 'COMPLETED';
      operation_id: string;
      created_at: Date;
    }>(
      `SELECT cycle_id, cycle_number, media_ref, event_ref, organizer_ref,
              job_id, job_type, safety_outcome, status, operation_id, created_at
       FROM media_processing_cycle
       WHERE media_ref = $1 AND status = 'ACTIVE'
       FOR UPDATE`,
      mediaRef
    );

    if (!cycles.length) return null;
    const c = cycles[0];

    // Check whether the underlying job in job_queue is still active
    const jobs = await tx.query<{ status: string }>(
      'SELECT status FROM job_queue WHERE id = $1::uuid',
      c.job_id
    );

    if (jobs.length > 0 && ['PENDING', 'PROCESSING', 'RETRYING'].includes(jobs[0].status)) {
      return {
        cycleId: c.cycle_id,
        cycleNumber: c.cycle_number,
        mediaRef: c.media_ref,
        eventRef: c.event_ref,
        organizerRef: c.organizer_ref,
        jobId: c.job_id,
        jobType: c.job_type,
        safetyOutcome: c.safety_outcome,
        status: c.status,
        operationId: c.operation_id,
        wasExistingCycle: true,
        createdAt: c.created_at,
      };
    }

    // Underlying job is no longer active (DEAD, COMPLETED, FAILED): retire this cycle
    const terminalStatus = jobs.length > 0 && jobs[0].status === 'COMPLETED' ? 'COMPLETED' : 'TERMINATED';
    await tx.execute(
      `UPDATE media_processing_cycle SET status = $2 WHERE cycle_id = $1`,
      c.cycle_id,
      terminalStatus
    );
    return null;
  }

  async getReceiptByOperation(tx: SqlTransaction, operationId: string): Promise<RetryCycleReceipt | null> {
    const rows = await tx.query<{
      cycle_id: string;
      cycle_number: number;
      media_ref: string;
      event_ref: string;
      organizer_ref: string;
      job_id: string;
      job_type: string;
      safety_outcome: string;
      status: 'ACTIVE' | 'TERMINATED' | 'COMPLETED';
      operation_id: string;
      created_at: Date;
    }>(
      `SELECT cycle_id, cycle_number, media_ref, event_ref, organizer_ref,
              job_id, job_type, safety_outcome, status, operation_id, created_at
       FROM media_processing_cycle
       WHERE operation_id = $1`,
      operationId
    );
    if (!rows.length) return null;
    const c = rows[0];
    return {
      cycleId: c.cycle_id,
      cycleNumber: c.cycle_number,
      mediaRef: c.media_ref,
      eventRef: c.event_ref,
      organizerRef: c.organizer_ref,
      jobId: c.job_id,
      jobType: c.job_type,
      safetyOutcome: c.safety_outcome,
      status: c.status,
      operationId: c.operation_id,
      wasExistingCycle: true,
      createdAt: c.created_at,
    };
  }

  async createCycle(
    tx: SqlTransaction,
    params: {
      cycleId: string;
      mediaRef: string;
      eventRef: string;
      organizerRef: string;
      jobId: string;
      jobType: string;
      safetyOutcome: string;
      operationId: string;
    }
  ): Promise<RetryCycleReceipt> {
    // Determine next cycle number
    const maxRows = await tx.query<{ max_num: number | null }>(
      'SELECT MAX(cycle_number) as max_num FROM media_processing_cycle WHERE media_ref = $1',
      params.mediaRef
    );
    const nextCycleNumber = (maxRows[0]?.max_num ?? 0) + 1;

    // Insert cycle record
    await tx.execute(
      `INSERT INTO media_processing_cycle(
         cycle_id, media_ref, cycle_number, event_ref, organizer_ref,
         job_id, job_type, safety_outcome, status, operation_id, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6::uuid, $7, $8, 'ACTIVE', $9, clock_timestamp())`,
      params.cycleId,
      params.mediaRef,
      nextCycleNumber,
      params.eventRef,
      params.organizerRef,
      params.jobId,
      params.jobType,
      params.safetyOutcome,
      params.operationId
    );

    // Insert audit record
    await tx.execute(
      `INSERT INTO media_cycle_audit(
         id, operation_id, cycle_id, media_ref, cycle_number, event_ref,
         organizer_ref, job_id, job_type, safety_outcome, action, actor, committed_at
       ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::uuid, $9, $10, 'CYCLE_CREATED', $11, clock_timestamp())`,
      randomUUID(),
      params.operationId,
      params.cycleId,
      params.mediaRef,
      nextCycleNumber,
      params.eventRef,
      params.organizerRef,
      params.jobId,
      params.jobType,
      params.safetyOutcome,
      params.organizerRef
    );

    // Update media_catalog link to new job, advancing revision while keeping PROCESSING_FAILED
    await tx.execute(
      `UPDATE media_catalog
       SET job_id = $2::uuid, revision = revision + 1
       WHERE media_ref = $1`,
      params.mediaRef,
      params.jobId
    );

    return {
      cycleId: params.cycleId,
      cycleNumber: nextCycleNumber,
      mediaRef: params.mediaRef,
      eventRef: params.eventRef,
      organizerRef: params.organizerRef,
      jobId: params.jobId,
      jobType: params.jobType,
      safetyOutcome: params.safetyOutcome,
      status: 'ACTIVE',
      operationId: params.operationId,
      wasExistingCycle: false,
      createdAt: new Date(),
    };
  }

  async recordDenial(
    tx: SqlTransaction,
    params: {
      operationId: string;
      mediaRef: string;
      eventRef: string;
      organizerRef: string;
      reason: string;
    }
  ): Promise<void> {
    await tx.execute(
      `INSERT INTO media_cycle_denial_audit(
         id, operation_id, media_ref, event_ref, organizer_ref, reason, actor, attempted_at
       ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, clock_timestamp())`,
      randomUUID(),
      params.operationId,
      params.mediaRef,
      params.eventRef,
      params.organizerRef,
      params.reason,
      params.organizerRef
    );
  }
}

export class RequestRetryCycle {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly repository: RetryCycleRepository,
    private readonly authorizer: EventOrganizerAuthorization,
    private readonly queue: Pick<JobQueuePostgres, 'publish'>,
    private readonly inspections = new PostgresInspectionRepository()
  ) {}

  async execute(command: RequestRetryCycleCommand, operationId: string): Promise<RetryCycleReceipt> {
    if (!operationId || !command.mediaRef || !command.eventRef || !command.organizerRef) {
      throw new CycleDeniedError('INVALID_ARGUMENT');
    }

    try {
      return await this.transactions.run(async tx => {
        // 1. Check idempotency for this exact operationId
        const prior = await this.repository.getReceiptByOperation(tx, operationId);
        if (prior) {
          if (
            prior.mediaRef !== command.mediaRef ||
            prior.eventRef !== command.eventRef ||
            prior.organizerRef !== command.organizerRef
          ) {
            throw new CycleDeniedError('IDEMPOTENCY_CONFLICT');
          }
          return prior;
        }

        // 2. Authorize organizer for event
        try {
          await this.authorizer.assertAuthorizedOrganizer(tx, {
            eventRef: command.eventRef,
            organizerRef: command.organizerRef,
          });
        } catch (err) {
          if (err instanceof CycleDeniedError) throw err;
          throw new CycleDeniedError('ORGANIZER_NOT_AUTHORIZED');
        }

        // 3. Lock media row and verify eligibility
        const mediaRows = await tx.query<{
          generation: bigint;
          revision: bigint;
          status: string;
          event_ref: string;
          original: unknown;
          job_id: string;
        }>(
          'SELECT generation, revision, status, event_ref, original, job_id FROM media_catalog WHERE media_ref = $1 FOR UPDATE',
          command.mediaRef
        );

        if (!mediaRows.length || mediaRows[0].event_ref !== command.eventRef) {
          throw new CycleDeniedError('ORGANIZER_NOT_AUTHORIZED');
        }

        const media = mediaRows[0];

        // Denial on QUARANTINED or non-PROCESSING_FAILED
        if (media.status === 'QUARANTINED') {
          throw new CycleDeniedError('QUARANTINED');
        }

        if (media.status !== 'PROCESSING_FAILED') {
          throw new CycleDeniedError('STATUS_NOT_ELIGIBLE');
        }

      // 4. Check for active/concurrent cycle already running
      const activeCycle = await this.repository.findActiveCycle(tx, command.mediaRef);
      if (activeCycle) {
        // Return active cycle without creating duplicate job or resetting budget
        return activeCycle;
      }

      // 5. Evaluate safety fact to determine initial job type for the new cycle
      // If safety was APPROVED, skip inspection and enqueue derivatives directly.
      // If safety was NOT approved (inconclusive/pending), re-inspect first!
      const safety = await this.inspections.get(tx, command.mediaRef, media.generation);
      const isSafetyApproved = safety?.schemaVersion === 1 && safety?.outcome === 'APPROVED';
      const safetyOutcome = safety?.outcome ?? 'PENDING';

      const jobType = isSafetyApproved
        ? (command.kind === 'VIDEO' ? 'VIDEO_DERIVATIVES' : 'PHOTO_DERIVATIVES')
        : 'MEDIA_INSPECTION';

      const cycleId = 'cycle:' + randomUUID();
      const queueName = command.queueName ?? 'media';

      // 6. Enqueue execution with up to 3 total automatic attempts
      const newJobId = await this.queue.publish(tx, {
        type: jobType,
        handlerVersion: '1',
        resourceRef: command.mediaRef,
        generation: media.generation,
        queue: queueName,
        dedupKey: cycleId,
        priority: 1,
        payload: null,
        availableAt: new Date(0),
      });

      // 7. Persist cycle record, audit and update media link
      return await this.repository.createCycle(tx, {
        cycleId,
        mediaRef: command.mediaRef,
        eventRef: command.eventRef,
        organizerRef: command.organizerRef,
        jobId: newJobId,
        jobType,
        safetyOutcome,
        operationId,
      });
    });
  } catch (err) {
    if (err instanceof CycleDeniedError && err.code !== 'IDEMPOTENCY_CONFLICT' && err.code !== 'INVALID_ARGUMENT') {
      try {
        await this.transactions.run(async auditTx => {
          await this.repository.recordDenial(auditTx, {
            operationId,
            mediaRef: command.mediaRef,
            eventRef: command.eventRef,
            organizerRef: command.organizerRef,
            reason: err.code,
          });
        });
      } catch {}
    }
    throw err;
  }
  }
}
