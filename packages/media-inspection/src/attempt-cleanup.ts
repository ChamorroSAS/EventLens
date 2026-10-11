import { randomUUID } from 'node:crypto';
import type { SqlTransaction } from '@eventlens/job-queue';
import type { OutputRef, ResultCode } from '@eventlens/media-execution';
import { InspectionError } from './contracts.js';

export type StorageDeleteOutcome = 'DELETED' | 'MISSING' | 'UNKNOWN' | 'FAILED';

export interface StorageDeleteResult {
  readonly ref: OutputRef;
  readonly outcome: StorageDeleteOutcome;
  readonly bytesReleased?: bigint | number;
  readonly error?: string;
}

export interface CleanupStoragePort {
  deleteObject(ref: OutputRef, operationId: string): Promise<StorageDeleteResult>;
}

export interface RetentionPolicy {
  isEligible(context: {
    mediaRef: string;
    generation: bigint;
    attemptResult?: ResultCode;
    status: string;
  }): boolean;
}

export class DefaultRetentionPolicy implements RetentionPolicy {
  isEligible(context: {
    mediaRef: string;
    generation: bigint;
    attemptResult?: ResultCode;
    status: string;
  }): boolean {
    if (context.status === 'ACTIVE') return false;
    return true;
  }
}

export interface AttemptOutputCandidate {
  readonly file: string;
  readonly destination: OutputRef;
  readonly operationId: string;
  readonly sizeBytes?: bigint | number;
}

export interface AttemptCleanupCandidate {
  readonly attemptId: string;
  readonly token: string;
  readonly jobId: string;
  readonly mediaRef: string;
  readonly generation: bigint;
  readonly phaseId?: string;
  readonly outputs: readonly AttemptOutputCandidate[];
  readonly status: 'ACTIVE' | 'UNKNOWN' | 'QUIESCENT';
  readonly result?: ResultCode;
  readonly ioProofs?: readonly { operationId: string; terminal: boolean }[];
}

export interface AttemptCleanupCommand {
  readonly attemptId: string;
  readonly mediaRef: string;
  readonly generation: bigint;
  readonly operationId: string;
  readonly candidate?: AttemptCleanupCandidate;
}

export type AttemptCleanupStatus = 'COMPLETED' | 'PARTIAL' | 'SKIPPED';

export interface AttemptCleanupReceipt {
  readonly operationId: string;
  readonly attemptId: string;
  readonly mediaRef: string;
  readonly generation: string;
  readonly status: AttemptCleanupStatus;
  readonly deletedCount: number;
  readonly retainedCount: number;
  readonly pendingCount: number;
  readonly details: {
    readonly deleted: readonly {
      namespace: string;
      key: string;
      outcome: StorageDeleteOutcome;
      bytesReleased: string;
    }[];
    readonly retained: readonly {
      namespace: string;
      key: string;
      reason: 'ORIGINAL' | 'ACTIVE_DERIVATIVE';
    }[];
    readonly pending: readonly {
      namespace: string;
      key: string;
      outcome: StorageDeleteOutcome;
    }[];
  };
  readonly committedAt: Date;
  readonly wasExisting?: boolean;
}

export type AttemptCleanupDeniedCode =
  | 'NON_QUIESCENT_WRITER'
  | 'ACTIVE_LEASE_HELD'
  | 'INELIGIBLE_RETENTION'
  | 'MEDIA_NOT_FOUND'
  | 'ATTEMPT_NOT_FOUND'
  | 'IDEMPOTENCY_CONFLICT'
  | 'PROMOTION_CLEANUP_RACE'
  | 'INVALID_ARGUMENT';

export class AttemptCleanupError extends Error {
  constructor(readonly code: AttemptCleanupDeniedCode, message?: string) {
    super(message ?? code);
  }
}

export interface AttemptCleanupRepository {
  findReceipt(tx: SqlTransaction, operationId: string): Promise<AttemptCleanupReceipt | null>;
  loadCandidate(tx: SqlTransaction, attemptId: string): Promise<AttemptCleanupCandidate | null>;
  loadMediaFacts(
    tx: SqlTransaction,
    mediaRef: string
  ): Promise<{
    generation: bigint;
    revision: bigint;
    status: string;
    original: { namespace: string; key: string };
    activeDerivatives: readonly { namespace: string; key: string; role: string }[];
  } | null>;
  isJobLeaseActive(tx: SqlTransaction, jobId: string): Promise<boolean>;
  findAlreadyReleasedKeys(
    tx: SqlTransaction,
    keys: readonly { namespace: string; key: string }[]
  ): Promise<Set<string>>;
  recordCleanup(
    tx: SqlTransaction,
    receipt: AttemptCleanupReceipt,
    confirmedDeletions: readonly {
      namespace: string;
      key: string;
      status: 'DELETED' | 'MISSING';
      bytesReleased: bigint;
    }[]
  ): Promise<void>;
}

export class PostgresAttemptCleanupRepository implements AttemptCleanupRepository {
  async findReceipt(tx: SqlTransaction, operationId: string): Promise<AttemptCleanupReceipt | null> {
    const rows = await tx.query<{
      operation_id: string;
      attempt_id: string;
      media_ref: string;
      generation: bigint;
      status: AttemptCleanupStatus;
      deleted_count: number;
      retained_count: number;
      pending_count: number;
      details: AttemptCleanupReceipt['details'];
      committed_at: Date;
    }>(
      `SELECT operation_id, attempt_id, media_ref, generation, status,
              deleted_count, retained_count, pending_count, details, committed_at
       FROM media_attempt_cleanup_receipt
       WHERE operation_id = $1`,
      operationId
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      operationId: r.operation_id,
      attemptId: r.attempt_id,
      mediaRef: r.media_ref,
      generation: String(r.generation),
      status: r.status,
      deletedCount: r.deleted_count,
      retainedCount: r.retained_count,
      pendingCount: r.pending_count,
      details: r.details,
      committedAt: r.committed_at,
    };
  }

  async loadCandidate(tx: SqlTransaction, attemptId: string): Promise<AttemptCleanupCandidate | null> {
    const rows = await tx.query<{
      id: string;
      token: string;
      phase_id: string;
      status: string;
      record: any;
    }>(
      `SELECT id, token, phase_id, status, record
       FROM execution_inventory
       WHERE id = $1::uuid`,
      attemptId
    );
    if (!rows.length) return null;
    const row = rows[0];
    const rec = row.record;
    if (!rec) return null;

    const outputs: AttemptOutputCandidate[] = Array.isArray(rec.outputs)
      ? rec.outputs.map((o: any) => ({
          file: o.file ?? 'unknown',
          destination: {
            namespace: o.destination?.namespace ?? '',
            key: o.destination?.key ?? '',
          },
          operationId: o.operationId ?? '',
          sizeBytes: o.sizeBytes ? BigInt(o.sizeBytes) : undefined,
        }))
      : [];

    return {
      attemptId: row.id,
      token: row.token,
      jobId: rec.jobId ?? '',
      mediaRef: rec.resourceRef ?? '',
      generation: rec.generation ? BigInt(rec.generation) : 0n,
      phaseId: row.phase_id,
      outputs,
      status: row.status as 'ACTIVE' | 'UNKNOWN' | 'QUIESCENT',
      result: rec.result as ResultCode | undefined,
      ioProofs: rec.ioProofs,
    };
  }

  async loadMediaFacts(
    tx: SqlTransaction,
    mediaRef: string
  ): Promise<{
    generation: bigint;
    revision: bigint;
    status: string;
    original: { namespace: string; key: string };
    activeDerivatives: readonly { namespace: string; key: string; role: string }[];
  } | null> {
    const mediaRows = await tx.query<{
      generation: bigint;
      revision: bigint;
      status: string;
      original: any;
    }>(
      `SELECT generation, revision, status, original
       FROM media_catalog
       WHERE media_ref = $1
       FOR UPDATE`,
      mediaRef
    );
    if (!mediaRows.length) return null;
    const m = mediaRows[0];
    const original = {
      namespace: m.original?.namespace ?? '',
      key: m.original?.key ?? '',
    };

    const derivRows = await tx.query<{
      role: string;
      reference: any;
    }>(
      `SELECT role, reference
       FROM media_active_derivative
       WHERE media_ref = $1
       FOR UPDATE`,
      mediaRef
    );

    const activeDerivatives = derivRows.map(d => ({
      role: d.role,
      namespace: d.reference?.namespace ?? '',
      key: d.reference?.key ?? '',
    }));

    return {
      generation: m.generation,
      revision: m.revision,
      status: m.status,
      original,
      activeDerivatives,
    };
  }

  async isJobLeaseActive(tx: SqlTransaction, jobId: string): Promise<boolean> {
    if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) return false;
    const rows = await tx.query<{ status: string; lease_until: Date | null }>(
      `SELECT status, lease_until
       FROM job_queue
       WHERE id = $1::uuid`,
      jobId
    );
    if (!rows.length) return false;
    const j = rows[0];
    if (j.status === 'PROCESSING' && j.lease_until && j.lease_until.getTime() > Date.now()) {
      return true;
    }
    return false;
  }

  async findAlreadyReleasedKeys(
    tx: SqlTransaction,
    keys: readonly { namespace: string; key: string }[]
  ): Promise<Set<string>> {
    if (!keys.length) return new Set();
    const released = new Set<string>();
    for (const item of keys) {
      const rows = await tx.query<{ id: string }>(
        `SELECT id FROM media_physical_cleanup_ledger
         WHERE namespace = $1 AND key = $2`,
        item.namespace,
        item.key
      );
      if (rows.length > 0) {
        released.add(`${item.namespace}:${item.key}`);
      }
    }
    return released;
  }

  async recordCleanup(
    tx: SqlTransaction,
    receipt: AttemptCleanupReceipt,
    confirmedDeletions: readonly {
      namespace: string;
      key: string;
      status: 'DELETED' | 'MISSING';
      bytesReleased: bigint;
    }[]
  ): Promise<void> {
    // 1. Advance physical ledger idempotently (ON CONFLICT DO NOTHING guarantees no double-release)
    for (const item of confirmedDeletions) {
      await tx.execute(
        `INSERT INTO media_physical_cleanup_ledger(
          id, operation_id, attempt_id, media_ref, generation,
          namespace, key, status, bytes_released, committed_at
        ) VALUES(
          $1::uuid, $2, $3, $4, $5::bigint,
          $6, $7, $8, $9::bigint, clock_timestamp()
        ) ON CONFLICT (namespace, key) DO NOTHING`,
        randomUUID(),
        receipt.operationId,
        receipt.attemptId,
        receipt.mediaRef,
        receipt.generation,
        item.namespace,
        item.key,
        item.status,
        item.bytesReleased
      );
    }

    // 2. Insert audit trail
    await tx.execute(
      `INSERT INTO media_attempt_cleanup_audit(
        id, operation_id, attempt_id, media_ref, generation,
        decision, reason, actor, committed_at
      ) VALUES(
        $1::uuid, $2, $3, $4, $5::bigint,
        $6, $7, $8, clock_timestamp()
      )`,
      randomUUID(),
      receipt.operationId,
      receipt.attemptId,
      receipt.mediaRef,
      receipt.generation,
      receipt.status === 'COMPLETED'
        ? 'CLEANED'
        : receipt.status === 'PARTIAL'
        ? 'PARTIAL'
        : 'SKIPPED',
      `Cleanup executed: deleted=${receipt.deletedCount}, retained=${receipt.retainedCount}, pending=${receipt.pendingCount}`,
      'SYSTEM'
    );

    // 3. Insert receipt
    await tx.execute(
      `INSERT INTO media_attempt_cleanup_receipt(
        operation_id, attempt_id, media_ref, generation, status,
        deleted_count, retained_count, pending_count, details, committed_at
      ) VALUES(
        $1, $2, $3, $4::bigint, $5,
        $6, $7, $8, $9::jsonb, clock_timestamp()
      )`,
      receipt.operationId,
      receipt.attemptId,
      receipt.mediaRef,
      receipt.generation,
      receipt.status,
      receipt.deletedCount,
      receipt.retainedCount,
      receipt.pendingCount,
      JSON.stringify(receipt.details)
    );
  }
}

export class AttemptCleanupService {
  constructor(
    private readonly repository: AttemptCleanupRepository,
    private readonly storage: CleanupStoragePort,
    private readonly retention: RetentionPolicy = new DefaultRetentionPolicy(),
    private readonly runTransaction: <T>(action: (tx: SqlTransaction) => Promise<T>) => Promise<T>
  ) {}

  async execute(command: AttemptCleanupCommand): Promise<AttemptCleanupReceipt> {
    if (!command.operationId || !command.attemptId || !command.mediaRef) {
      throw new AttemptCleanupError('INVALID_ARGUMENT', 'operationId, attemptId, and mediaRef are required');
    }

    // 1. Initial transaction: Check existing receipt for idempotent replay, or load & validate candidate and facts
    const initialCheck = await this.runTransaction(async tx => {
      const existing = await this.repository.findReceipt(tx, command.operationId);
      if (existing) {
        return { existing };
      }

      const cand = command.candidate ?? (await this.repository.loadCandidate(tx, command.attemptId));
      if (!cand) {
        throw new AttemptCleanupError('ATTEMPT_NOT_FOUND', `Attempt '${command.attemptId}' not found`);
      }

      const mFacts = await this.repository.loadMediaFacts(tx, command.mediaRef);
      if (!mFacts) {
        throw new AttemptCleanupError('MEDIA_NOT_FOUND', `Media '${command.mediaRef}' not found`);
      }

      // Check writer quiescence
      if (cand.status === 'ACTIVE') {
        throw new AttemptCleanupError(
          'NON_QUIESCENT_WRITER',
          `Attempt '${command.attemptId}' is still ACTIVE; cannot clean non-quiescent attempt`
        );
      }

      // Check active job lease
      if (cand.jobId) {
        const leaseActive = await this.repository.isJobLeaseActive(tx, cand.jobId);
        if (leaseActive) {
          throw new AttemptCleanupError(
            'ACTIVE_LEASE_HELD',
            `Job '${cand.jobId}' holds an active lease; writers may still be executing`
          );
        }
      }

      // Check retention policy
      const eligible = this.retention.isEligible({
        mediaRef: command.mediaRef,
        generation: command.generation,
        attemptResult: cand.result,
        status: cand.status,
      });
      if (!eligible) {
        throw new AttemptCleanupError(
          'INELIGIBLE_RETENTION',
          `Attempt '${command.attemptId}' is not eligible under retention policy`
        );
      }

      // Check if any keys are already released in physical ledger
      const allOutputKeys = cand.outputs.map(o => ({
        namespace: o.destination.namespace,
        key: o.destination.key,
      }));
      const released = await this.repository.findAlreadyReleasedKeys(tx, allOutputKeys);

      return { candidate: cand, mediaFacts: mFacts, alreadyReleasedKeys: released };
    });

    if ('existing' in initialCheck && initialCheck.existing) {
      const existing = initialCheck.existing;
      if (
        existing.attemptId !== command.attemptId ||
        existing.mediaRef !== command.mediaRef ||
        existing.generation !== String(command.generation)
      ) {
        throw new AttemptCleanupError(
          'IDEMPOTENCY_CONFLICT',
          `operationId '${command.operationId}' already used for different attempt parameters`
        );
      }
      return { ...existing, wasExisting: true };
    }

    const { candidate, mediaFacts, alreadyReleasedKeys } = initialCheck as {
      candidate: AttemptCleanupCandidate;
      mediaFacts: NonNullable<Awaited<ReturnType<AttemptCleanupRepository['loadMediaFacts']>>>;
      alreadyReleasedKeys: Set<string>;
    };

    // 3. Filter outputs: NEVER delete original or active derivatives
    const originalRef = `${mediaFacts.original.namespace}:${mediaFacts.original.key}`;
    const activeDerivativeRefs = new Set(
      mediaFacts.activeDerivatives.map(d => `${d.namespace}:${d.key}`)
    );

    const deletedDetails: {
      namespace: string;
      key: string;
      outcome: StorageDeleteOutcome;
      bytesReleased: string;
    }[] = [];

    const retainedDetails: {
      namespace: string;
      key: string;
      reason: 'ORIGINAL' | 'ACTIVE_DERIVATIVE';
    }[] = [];

    const pendingDetails: {
      namespace: string;
      key: string;
      outcome: StorageDeleteOutcome;
    }[] = [];

    const toDeleteInStorage: AttemptOutputCandidate[] = [];

    for (const output of candidate.outputs) {
      const refKey = `${output.destination.namespace}:${output.destination.key}`;

      // Inviolable rule: original is NEVER deleted
      if (refKey === originalRef) {
        retainedDetails.push({
          namespace: output.destination.namespace,
          key: output.destination.key,
          reason: 'ORIGINAL',
        });
        continue;
      }

      // Inviolable rule: active derivatives are NEVER deleted
      if (activeDerivativeRefs.has(refKey)) {
        retainedDetails.push({
          namespace: output.destination.namespace,
          key: output.destination.key,
          reason: 'ACTIVE_DERIVATIVE',
        });
        continue;
      }

      // If already recorded in physical cleanup ledger, treat as already confirmed
      if (alreadyReleasedKeys.has(refKey)) {
        deletedDetails.push({
          namespace: output.destination.namespace,
          key: output.destination.key,
          outcome: 'DELETED',
          bytesReleased: String(output.sizeBytes ?? 0n),
        });
        continue;
      }

      toDeleteInStorage.push(output);
    }

    // 4. Execute storage deletions OUTSIDE SQL transaction
    const storageResults: StorageDeleteResult[] = [];
    for (const output of toDeleteInStorage) {
      const res = await this.storage.deleteObject(output.destination, command.operationId);
      storageResults.push(res);
    }

    // 5. Partition storage outcomes
    const confirmedForLedger: {
      namespace: string;
      key: string;
      status: 'DELETED' | 'MISSING';
      bytesReleased: bigint;
    }[] = [];

    for (let i = 0; i < toDeleteInStorage.length; i++) {
      const output = toDeleteInStorage[i];
      const res = storageResults[i];

      if (res.outcome === 'DELETED' || res.outcome === 'MISSING') {
        const bytes = BigInt(res.bytesReleased ?? output.sizeBytes ?? 0n);
        deletedDetails.push({
          namespace: output.destination.namespace,
          key: output.destination.key,
          outcome: res.outcome,
          bytesReleased: String(bytes),
        });
        confirmedForLedger.push({
          namespace: output.destination.namespace,
          key: output.destination.key,
          status: res.outcome,
          bytesReleased: bytes,
        });
      } else {
        pendingDetails.push({
          namespace: output.destination.namespace,
          key: output.destination.key,
          outcome: res.outcome,
        });
      }
    }

    // Determine status
    let finalStatus: AttemptCleanupStatus;
    if (pendingDetails.length > 0) {
      finalStatus = 'PARTIAL';
    } else if (deletedDetails.length > 0 || candidate.outputs.length === 0) {
      finalStatus = 'COMPLETED';
    } else {
      finalStatus = 'SKIPPED';
    }

    const receipt: AttemptCleanupReceipt = {
      operationId: command.operationId,
      attemptId: command.attemptId,
      mediaRef: command.mediaRef,
      generation: String(command.generation),
      status: finalStatus,
      deletedCount: deletedDetails.length,
      retainedCount: retainedDetails.length,
      pendingCount: pendingDetails.length,
      details: {
        deleted: deletedDetails,
        retained: retainedDetails,
        pending: pendingDetails,
      },
      committedAt: new Date(),
    };

    // 6. Commit atomic SQL changes under CAS guard
    await this.runTransaction(async tx => {
      // Re-verify CAS guard: ensure media or derivatives didn't concurrently race
      const latestFacts = await this.repository.loadMediaFacts(tx, command.mediaRef);
      if (!latestFacts) {
        throw new AttemptCleanupError('MEDIA_NOT_FOUND', `Media '${command.mediaRef}' not found during commit`);
      }

      // Verify that no deleted ref was concurrently promoted to active derivative
      const currentActiveRefs = new Set(
        latestFacts.activeDerivatives.map(d => `${d.namespace}:${d.key}`)
      );
      for (const del of confirmedForLedger) {
        const delKey = `${del.namespace}:${del.key}`;
        if (currentActiveRefs.has(delKey)) {
          throw new AttemptCleanupError(
            'PROMOTION_CLEANUP_RACE',
            `Output '${delKey}' was concurrently promoted to active derivative; aborting cleanup`
          );
        }
      }

      // Check if receipt was written by concurrent transaction
      const existingReceipt = await this.repository.findReceipt(tx, command.operationId);
      if (existingReceipt) {
        return;
      }

      await this.repository.recordCleanup(tx, receipt, confirmedForLedger);
    });

    return receipt;
  }
}
