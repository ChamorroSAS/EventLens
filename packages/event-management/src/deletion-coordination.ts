import { createHash, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';

// ============================================================================
// MOD-008 — DELETION COORDINATION CANONICAL CONTRACTS (EL-TK-188 / EL-EP-015)
// ============================================================================

export type ManualDeletionCause =
  | 'MANUAL_EVENT_DELETION'
  | 'MANUAL_ACCOUNT_DELETION';

export type IrreversibleDeletionCause =
  | 'GRACE_PERIOD_EXPIRED'
  | 'PRIVACY_OWN_REMOVAL'
  | 'PRIVACY_ADMIN_RESOLUTION'
  | 'TRASH_RETENTION_EXPIRED'
  | 'QUARANTINE_DISPOSITION';

export type DeletionCause = ManualDeletionCause | IrreversibleDeletionCause;

export const VALID_MANUAL_DELETION_CAUSES: readonly ManualDeletionCause[] = [
  'MANUAL_EVENT_DELETION',
  'MANUAL_ACCOUNT_DELETION',
];

export const VALID_IRREVERSIBLE_DELETION_CAUSES: readonly IrreversibleDeletionCause[] = [
  'GRACE_PERIOD_EXPIRED',
  'PRIVACY_OWN_REMOVAL',
  'PRIVACY_ADMIN_RESOLUTION',
  'TRASH_RETENTION_EXPIRED',
  'QUARANTINE_DISPOSITION',
];

export const VALID_DELETION_CAUSES: readonly DeletionCause[] = [
  ...VALID_MANUAL_DELETION_CAUSES,
  ...VALID_IRREVERSIBLE_DELETION_CAUSES,
];

export type DeletionScopeType = 'EVENT' | 'ACCOUNT' | 'MEDIA';

export type DeletionOwnerModule = 'MOD-001' | 'MOD-002' | 'MOD-003' | 'MOD-004' | 'MOD-008';

export type DeletionRequestStatus =
  | 'PREPARED'
  | 'CONFIRMED'
  | 'UNKNOWN'
  | 'CANCELLED'
  | 'CLAIMED'
  | 'MAIN_PURGED'
  | 'COMPLETED';

export type DeletionOperationType =
  | 'PREPARE'
  | 'CONFIRM'
  | 'MARK_UNKNOWN'
  | 'RECONCILE'
  | 'CANCEL'
  | 'CLAIM'
  | 'MAIN_PURGE_VERIFIED'
  | 'RESIDUAL_VERIFIED';

export type DeletionCoordinationErrorCode =
  | 'INVALID_DELETION_INTENT'
  | 'LEGAL_HOLD_NOT_ENABLED'
  | 'IRREVERSIBLE_CAUSE_CANNOT_CANCEL'
  | 'MANUAL_CAUSE_REQUIRES_CANCEL_WINDOW'
  | 'CLOCK_CONTRADICTION'
  | 'DELETION_INTENT_PAYLOAD_CONFLICT'
  | 'REVISION_CONFLICT'
  | 'OBLIGATION_EXTENSION_FORBIDDEN'
  | 'REQUEST_NOT_FOUND'
  | 'INVALID_STATUS_TRANSITION'
  | 'UNAUTHORIZED_EPOCH'
  | 'UNAUTHORIZED_ACTOR';

export class DeletionCoordinationError extends Error {
  constructor(
    public readonly code: DeletionCoordinationErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DeletionCoordinationError';
  }
}

export interface RelatedDeletionResourceRef {
  readonly resourceType: 'ACCOUNT' | 'EVENT' | 'MEDIA' | 'COVER_ASSET' | 'EXPORT' | 'GUEST_SESSION';
  readonly resourceRef: string;
  readonly generation?: string;
}

export interface DeletionRequestRecord {
  readonly id: string;
  readonly sourceOperationId: string;
  readonly cause: DeletionCause;
  readonly scopeType: DeletionScopeType;
  readonly scopeRef: string;
  readonly parentRequestId: string | null;
  readonly ownerModule: DeletionOwnerModule;
  readonly expectedGeneration: bigint;
  readonly expectedRevision: bigint;
  readonly currentRevision: bigint;
  readonly policyRef: string;
  readonly policyVersion: string;
  readonly anchorTimestamp: Date;
  readonly cancelUntil: Date | null;
  readonly purgeStartedAt: Date;
  readonly mainPurgeDeadline: Date;
  readonly residualPurgeDeadline: Date;
  readonly status: DeletionRequestStatus;
  readonly recoveryEpoch: bigint;
  readonly dedupKey: string;
  readonly payloadHash: string;
  readonly relatedResources: readonly RelatedDeletionResourceRef[];
  readonly cancelledAt: Date | null;
  readonly cancelledBy: string | null;
  readonly cancelReason: string | null;
  readonly claimedAt: Date | null;
  readonly claimedByWorker: string | null;
  readonly mainPurgedAt: Date | null;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DeletionReceiptRecord {
  readonly id: string;
  readonly requestId: string;
  readonly operationType: DeletionOperationType;
  readonly sourceOperationId: string;
  readonly cause: DeletionCause;
  readonly scopeType: DeletionScopeType;
  readonly scopeRef: string;
  readonly actorId: string;
  readonly previousStatus: DeletionRequestStatus | null;
  readonly newStatus: DeletionRequestStatus;
  readonly revision: bigint;
  readonly recoveryEpoch: bigint;
  readonly anchorTimestamp: Date;
  readonly purgeStartedAt: Date;
  readonly mainPurgeDeadline: Date;
  readonly residualPurgeDeadline: Date;
  readonly details: Record<string, unknown> | null;
  readonly createdAt: Date;
}

export interface DeletionTelemetryMetric {
  readonly cause: DeletionCause | string;
  readonly outcome:
    | 'REGISTERED'
    | 'IDEMPOTENT_REPLAY'
    | 'CONFIRMED'
    | 'MARKED_UNKNOWN'
    | 'RECONCILED'
    | 'REJECTED';
  readonly status?: DeletionRequestStatus;
  readonly errorCode?: DeletionCoordinationErrorCode;
}

export interface DeletionTelemetrySink {
  recordDeletionMetric(metric: DeletionTelemetryMetric): void | Promise<void>;
}

export interface ComputeDeletionDeadlinesInput {
  readonly cause: DeletionCause;
  readonly anchorTimestamp: Date;
  readonly cancelUntil?: Date | null;
  readonly purgeStartedAt?: Date | null;
}

export interface ComputedDeletionDeadlines {
  readonly anchorTimestamp: Date;
  readonly cancelUntil: Date | null;
  readonly purgeStartedAt: Date;
  readonly mainPurgeDeadline: Date;
  readonly residualPurgeDeadline: Date;
}

export interface RegisterDeletionIntentCommand {
  readonly requestId?: string;
  readonly sourceOperationId: string;
  readonly cause: DeletionCause;
  readonly scopeType: DeletionScopeType;
  readonly scopeRef: string;
  readonly parentRequestId?: string | null;
  readonly ownerModule: DeletionOwnerModule;
  readonly expectedGeneration?: bigint;
  readonly expectedRevision?: bigint;
  readonly policyRef: string;
  readonly policyVersion?: string;
  readonly anchorTimestamp: Date;
  readonly cancelUntil?: Date | null;
  readonly purgeStartedAt?: Date | null;
  readonly initialStatus?: 'PREPARED' | 'CONFIRMED';
  readonly recoveryEpoch?: bigint;
  readonly actorId: string;
  readonly idempotencyKey?: string;
  readonly relatedResources?: readonly RelatedDeletionResourceRef[];
  readonly legalHold?: boolean;
  /** Worker or server clock at execution time; never shifts anchorTimestamp or deadlines */
  readonly now?: Date;
}

export interface RegisterDeletionIntentResult {
  readonly request: DeletionRequestRecord;
  readonly receipt: DeletionReceiptRecord;
  readonly outcome: 'REGISTERED' | 'IDEMPOTENT_REPLAY';
}

export interface ConfirmDeletionRequestCommand {
  readonly requestId: string;
  readonly expectedRevision: bigint;
  readonly recoveryEpoch: bigint;
  readonly actorId: string;
  readonly sourceOperationId: string;
  readonly now?: Date;
}

export interface MarkDeletionRequestUnknownCommand {
  readonly requestId: string;
  readonly expectedRevision: bigint;
  readonly recoveryEpoch: bigint;
  readonly actorId: string;
  readonly sourceOperationId: string;
  readonly reason: string;
  readonly now?: Date;
}

export interface ReconcileDeletionRequestCommand {
  readonly requestId: string;
  readonly targetStatus: 'CONFIRMED' | 'CANCELLED';
  readonly expectedRevision: bigint;
  readonly recoveryEpoch: bigint;
  readonly actorId: string;
  readonly sourceOperationId: string;
  readonly resolutionNotes: string;
  readonly now?: Date;
}

export interface GetDeletionProjectionQuery {
  readonly requestId?: string;
  readonly scopeType?: DeletionScopeType;
  readonly scopeRef?: string;
  readonly now?: Date;
}

export interface DeletionProjection {
  readonly requestId: string;
  readonly sourceOperationId: string;
  readonly cause: DeletionCause;
  readonly scopeType: DeletionScopeType;
  readonly scopeRef: string;
  readonly status: DeletionRequestStatus;
  readonly policyRef: string;
  readonly policyVersion: string;
  readonly anchorTimestamp: string;
  readonly cancelUntil: string | null;
  readonly purgeStartedAt: string;
  readonly mainPurgeDeadline: string;
  readonly residualPurgeDeadline: string;
  readonly isCancellable: boolean;
  readonly currentRevision: string;
  readonly recoveryEpoch: string;
  readonly receipts: readonly {
    readonly id: string;
    readonly operationType: DeletionOperationType;
    readonly previousStatus: DeletionRequestStatus | null;
    readonly newStatus: DeletionRequestStatus;
    readonly createdAt: string;
  }[];
}

// ============================================================================
// UTC CALENDAR DEADLINE ARITHMETIC (DEC-092 / DEC-097..099)
// ============================================================================

/**
 * Adds exact UTC calendar days while preserving UTC time of day (HH:mm:ss.sss).
 * Immune to local timezone DST transitions and worker execution delays.
 */
export function addUtcCalendarDays(anchor: Date, days: number): Date {
  if (!(anchor instanceof Date) || Number.isNaN(anchor.getTime())) {
    throw new DeletionCoordinationError('CLOCK_CONTRADICTION', 'Invalid anchor Date provided for UTC calendar calculation');
  }
  if (!Number.isInteger(days) || days < 0) {
    throw new DeletionCoordinationError('INVALID_DELETION_INTENT', 'Days offset must be a non-negative integer');
  }
  return new Date(
    Date.UTC(
      anchor.getUTCFullYear(),
      anchor.getUTCMonth(),
      anchor.getUTCDate() + days,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds()
    )
  );
}

/**
 * Adds exact UTC hours (e.g. 72 hours for manual event deletion window per DEC-043/DEC-092).
 */
export function addUtcHours(anchor: Date, hours: number): Date {
  if (!(anchor instanceof Date) || Number.isNaN(anchor.getTime())) {
    throw new DeletionCoordinationError('CLOCK_CONTRADICTION', 'Invalid anchor Date provided for UTC hours calculation');
  }
  if (!Number.isFinite(hours) || hours < 0) {
    throw new DeletionCoordinationError('INVALID_DELETION_INTENT', 'Hours offset must be non-negative');
  }
  return new Date(anchor.getTime() + hours * 3600 * 1000);
}

export function isManualDeletionCause(cause: DeletionCause): cause is ManualDeletionCause {
  return (VALID_MANUAL_DELETION_CAUSES as readonly string[]).includes(cause);
}

export function isIrreversibleDeletionCause(cause: DeletionCause): cause is IrreversibleDeletionCause {
  return (VALID_IRREVERSIBLE_DELETION_CAUSES as readonly string[]).includes(cause);
}

/**
 * Computes canonical cancelUntil, purgeStartedAt, mainPurgeDeadline (+7 UTC calendar days),
 * and residualPurgeDeadline (+30 UTC calendar days) strictly from the confirmed owner anchor.
 */
export function computeDeletionDeadlines(input: ComputeDeletionDeadlinesInput): ComputedDeletionDeadlines {
  const { cause, anchorTimestamp } = input;
  if (!(anchorTimestamp instanceof Date) || Number.isNaN(anchorTimestamp.getTime())) {
    throw new DeletionCoordinationError('CLOCK_CONTRADICTION', 'anchorTimestamp must be a valid Date');
  }
  if (!VALID_DELETION_CAUSES.includes(cause)) {
    throw new DeletionCoordinationError('INVALID_DELETION_INTENT', `Unsupported deletion cause: ${String(cause)}`);
  }

  let cancelUntil: Date | null = null;
  let purgeStartedAt: Date;

  if (cause === 'MANUAL_EVENT_DELETION') {
    const expectedCancelUntil = addUtcHours(anchorTimestamp, 72);
    if (input.cancelUntil !== undefined && input.cancelUntil !== null) {
      if (!(input.cancelUntil instanceof Date) || Number.isNaN(input.cancelUntil.getTime())) {
        throw new DeletionCoordinationError('CLOCK_CONTRADICTION', 'Invalid cancelUntil Date');
      }
      if (input.cancelUntil.getTime() !== expectedCancelUntil.getTime()) {
        throw new DeletionCoordinationError(
          'CLOCK_CONTRADICTION',
          'MANUAL_EVENT_DELETION cancelUntil must equal anchorTimestamp + 72 hours UTC'
        );
      }
    }
    cancelUntil = expectedCancelUntil;
    purgeStartedAt = expectedCancelUntil;
  } else if (cause === 'MANUAL_ACCOUNT_DELETION') {
    const expectedCancelUntil = addUtcCalendarDays(anchorTimestamp, 7);
    if (input.cancelUntil !== undefined && input.cancelUntil !== null) {
      if (!(input.cancelUntil instanceof Date) || Number.isNaN(input.cancelUntil.getTime())) {
        throw new DeletionCoordinationError('CLOCK_CONTRADICTION', 'Invalid cancelUntil Date');
      }
      if (input.cancelUntil.getTime() !== expectedCancelUntil.getTime()) {
        throw new DeletionCoordinationError(
          'CLOCK_CONTRADICTION',
          'MANUAL_ACCOUNT_DELETION cancelUntil must equal anchorTimestamp + 7 UTC calendar days'
        );
      }
    }
    cancelUntil = expectedCancelUntil;
    purgeStartedAt = expectedCancelUntil;
  } else {
    // Irreversible causes: GRACE_PERIOD_EXPIRED, PRIVACY_OWN_REMOVAL, PRIVACY_ADMIN_RESOLUTION, TRASH_RETENTION_EXPIRED, QUARANTINE_DISPOSITION
    if (input.cancelUntil !== undefined && input.cancelUntil !== null) {
      throw new DeletionCoordinationError(
        'IRREVERSIBLE_CAUSE_CANNOT_CANCEL',
        `Irreversible cause ${cause} cannot define a cancelUntil window`
      );
    }
    cancelUntil = null;
    purgeStartedAt = new Date(anchorTimestamp.getTime());
  }

  if (input.purgeStartedAt !== undefined && input.purgeStartedAt !== null) {
    if (!(input.purgeStartedAt instanceof Date) || Number.isNaN(input.purgeStartedAt.getTime())) {
      throw new DeletionCoordinationError('CLOCK_CONTRADICTION', 'Invalid purgeStartedAt Date');
    }
    if (input.purgeStartedAt.getTime() !== purgeStartedAt.getTime()) {
      throw new DeletionCoordinationError(
        'CLOCK_CONTRADICTION',
        `Provided purgeStartedAt (${input.purgeStartedAt.toISOString()}) contradicts canonical anchor calculation (${purgeStartedAt.toISOString()})`
      );
    }
  }

  const mainPurgeDeadline = addUtcCalendarDays(purgeStartedAt, 7);
  const residualPurgeDeadline = addUtcCalendarDays(purgeStartedAt, 30);

  return {
    anchorTimestamp: new Date(anchorTimestamp.getTime()),
    cancelUntil,
    purgeStartedAt,
    mainPurgeDeadline,
    residualPurgeDeadline,
  };
}

// ============================================================================
// REPOSITORY INTERFACE & POSTGRES IMPLEMENTATION
// ============================================================================

export interface DeletionCoordinationRepository {
  findByDedupKeyForUpdate(tx: SqlTransaction, dedupKey: string): Promise<DeletionRequestRecord | null>;
  findByIdForUpdate(tx: SqlTransaction, requestId: string): Promise<DeletionRequestRecord | null>;
  findById(tx: SqlTransaction, requestId: string): Promise<DeletionRequestRecord | null>;
  findActiveByScopeForUpdate(
    tx: SqlTransaction,
    scopeType: DeletionScopeType,
    scopeRef: string
  ): Promise<DeletionRequestRecord[]>;
  findLatestByScope(
    tx: SqlTransaction,
    scopeType: DeletionScopeType,
    scopeRef: string
  ): Promise<DeletionRequestRecord | null>;
  insertRequest(tx: SqlTransaction, record: DeletionRequestRecord): Promise<void>;
  updateRequestStatus(
    tx: SqlTransaction,
    params: {
      requestId: string;
      expectedRevision: bigint;
      newStatus: DeletionRequestStatus;
      newRevision: bigint;
      cancelledAt?: Date | null;
      cancelledBy?: string | null;
      cancelReason?: string | null;
      updatedAt: Date;
    }
  ): Promise<boolean>;
  insertReceipt(tx: SqlTransaction, receipt: DeletionReceiptRecord): Promise<void>;
  findReceiptsByRequestId(tx: SqlTransaction, requestId: string): Promise<DeletionReceiptRecord[]>;
}

interface DeletionRequestRow {
  id: string;
  source_operation_id: string;
  cause: string;
  scope_type: string;
  scope_ref: string;
  parent_request_id: string | null;
  owner_module: string;
  expected_generation: bigint | string | number;
  expected_revision: bigint | string | number;
  current_revision: bigint | string | number;
  policy_ref: string;
  policy_version: string;
  anchor_timestamp: Date | string;
  cancel_until: Date | string | null;
  purge_started_at: Date | string;
  main_purge_deadline: Date | string;
  residual_purge_deadline: Date | string;
  status: string;
  recovery_epoch: bigint | string | number;
  dedup_key: string;
  payload_hash: string;
  related_resources_json: string;
  cancelled_at: Date | string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  claimed_at: Date | string | null;
  claimed_by_worker: string | null;
  main_purged_at: Date | string | null;
  completed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface DeletionReceiptRow {
  id: string;
  request_id: string;
  operation_type: string;
  source_operation_id: string;
  cause: string;
  scope_type: string;
  scope_ref: string;
  actor_id: string;
  previous_status: string | null;
  new_status: string;
  revision: bigint | string | number;
  recovery_epoch: bigint | string | number;
  anchor_timestamp: Date | string;
  purge_started_at: Date | string;
  main_purge_deadline: Date | string;
  residual_purge_deadline: Date | string;
  details_json: string | null;
  created_at: Date | string;
}

function mapRequestRow(row: DeletionRequestRow): DeletionRequestRecord {
  let relatedResources: RelatedDeletionResourceRef[] = [];
  try {
    relatedResources = JSON.parse(row.related_resources_json || '[]');
  } catch {
    relatedResources = [];
  }
  return {
    id: row.id,
    sourceOperationId: row.source_operation_id,
    cause: row.cause as DeletionCause,
    scopeType: row.scope_type as DeletionScopeType,
    scopeRef: row.scope_ref,
    parentRequestId: row.parent_request_id,
    ownerModule: row.owner_module as DeletionOwnerModule,
    expectedGeneration: BigInt(row.expected_generation),
    expectedRevision: BigInt(row.expected_revision),
    currentRevision: BigInt(row.current_revision),
    policyRef: row.policy_ref,
    policyVersion: row.policy_version,
    anchorTimestamp: new Date(row.anchor_timestamp),
    cancelUntil: row.cancel_until ? new Date(row.cancel_until) : null,
    purgeStartedAt: new Date(row.purge_started_at),
    mainPurgeDeadline: new Date(row.main_purge_deadline),
    residualPurgeDeadline: new Date(row.residual_purge_deadline),
    status: row.status as DeletionRequestStatus,
    recoveryEpoch: BigInt(row.recovery_epoch),
    dedupKey: row.dedup_key,
    payloadHash: row.payload_hash,
    relatedResources,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
    cancelledBy: row.cancelled_by,
    cancelReason: row.cancel_reason,
    claimedAt: row.claimed_at ? new Date(row.claimed_at) : null,
    claimedByWorker: row.claimed_by_worker,
    mainPurgedAt: row.main_purged_at ? new Date(row.main_purged_at) : null,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapReceiptRow(row: DeletionReceiptRow): DeletionReceiptRecord {
  let details: Record<string, unknown> | null = null;
  if (row.details_json) {
    try {
      details = JSON.parse(row.details_json);
    } catch {
      details = null;
    }
  }
  return {
    id: row.id,
    requestId: row.request_id,
    operationType: row.operation_type as DeletionOperationType,
    sourceOperationId: row.source_operation_id,
    cause: row.cause as DeletionCause,
    scopeType: row.scope_type as DeletionScopeType,
    scopeRef: row.scope_ref,
    actorId: row.actor_id,
    previousStatus: row.previous_status ? (row.previous_status as DeletionRequestStatus) : null,
    newStatus: row.new_status as DeletionRequestStatus,
    revision: BigInt(row.revision),
    recoveryEpoch: BigInt(row.recovery_epoch),
    anchorTimestamp: new Date(row.anchor_timestamp),
    purgeStartedAt: new Date(row.purge_started_at),
    mainPurgeDeadline: new Date(row.main_purge_deadline),
    residualPurgeDeadline: new Date(row.residual_purge_deadline),
    details,
    createdAt: new Date(row.created_at),
  };
}

export class PostgresDeletionCoordinationRepository implements DeletionCoordinationRepository {
  async findByDedupKeyForUpdate(
    tx: SqlTransaction,
    dedupKey: string
  ): Promise<DeletionRequestRecord | null> {
    const rows = await tx.query<DeletionRequestRow>(
      `SELECT * FROM "deletion_request" WHERE "dedup_key" = $1 FOR UPDATE`,
      dedupKey
    );
    return rows.length ? mapRequestRow(rows[0]) : null;
  }

  async findByIdForUpdate(
    tx: SqlTransaction,
    requestId: string
  ): Promise<DeletionRequestRecord | null> {
    const rows = await tx.query<DeletionRequestRow>(
      `SELECT * FROM "deletion_request" WHERE "id" = $1::uuid FOR UPDATE`,
      requestId
    );
    return rows.length ? mapRequestRow(rows[0]) : null;
  }

  async findById(tx: SqlTransaction, requestId: string): Promise<DeletionRequestRecord | null> {
    const rows = await tx.query<DeletionRequestRow>(
      `SELECT * FROM "deletion_request" WHERE "id" = $1::uuid`,
      requestId
    );
    return rows.length ? mapRequestRow(rows[0]) : null;
  }

  async findActiveByScopeForUpdate(
    tx: SqlTransaction,
    scopeType: DeletionScopeType,
    scopeRef: string
  ): Promise<DeletionRequestRecord[]> {
    const rows = await tx.query<DeletionRequestRow>(
      `SELECT * FROM "deletion_request"
       WHERE "scope_type" = $1
         AND "scope_ref" = $2
         AND "status" IN ('PREPARED', 'CONFIRMED', 'UNKNOWN', 'CLAIMED', 'MAIN_PURGED')
       ORDER BY "main_purge_deadline" ASC
       FOR UPDATE`,
      scopeType,
      scopeRef
    );
    return rows.map(mapRequestRow);
  }

  async findLatestByScope(
    tx: SqlTransaction,
    scopeType: DeletionScopeType,
    scopeRef: string
  ): Promise<DeletionRequestRecord | null> {
    const rows = await tx.query<DeletionRequestRow>(
      `SELECT * FROM "deletion_request"
       WHERE "scope_type" = $1 AND "scope_ref" = $2
       ORDER BY "created_at" DESC
       LIMIT 1`,
      scopeType,
      scopeRef
    );
    return rows.length ? mapRequestRow(rows[0]) : null;
  }

  async insertRequest(tx: SqlTransaction, record: DeletionRequestRecord): Promise<void> {
    await tx.execute(
      `INSERT INTO "deletion_request" (
         "id", "source_operation_id", "cause", "scope_type", "scope_ref",
         "parent_request_id", "owner_module", "expected_generation", "expected_revision",
         "current_revision", "policy_ref", "policy_version", "anchor_timestamp",
         "cancel_until", "purge_started_at", "main_purge_deadline", "residual_purge_deadline",
         "status", "recovery_epoch", "dedup_key", "payload_hash", "related_resources_json",
         "cancelled_at", "cancelled_by", "cancel_reason", "claimed_at", "claimed_by_worker",
         "main_purged_at", "completed_at", "created_at", "updated_at"
       ) VALUES (
         $1::uuid, $2, $3, $4, $5,
         $6::uuid, $7, $8::bigint, $9::bigint,
         $10::bigint, $11, $12, $13,
         $14, $15, $16, $17,
         $18, $19::bigint, $20, $21, $22,
         $23, $24, $25, $26, $27,
         $28, $29, $30, $31
       )`,
      record.id,
      record.sourceOperationId,
      record.cause,
      record.scopeType,
      record.scopeRef,
      record.parentRequestId,
      record.ownerModule,
      record.expectedGeneration,
      record.expectedRevision,
      record.currentRevision,
      record.policyRef,
      record.policyVersion,
      record.anchorTimestamp,
      record.cancelUntil,
      record.purgeStartedAt,
      record.mainPurgeDeadline,
      record.residualPurgeDeadline,
      record.status,
      record.recoveryEpoch,
      record.dedupKey,
      record.payloadHash,
      JSON.stringify(record.relatedResources ?? []),
      record.cancelledAt,
      record.cancelledBy,
      record.cancelReason,
      record.claimedAt,
      record.claimedByWorker,
      record.mainPurgedAt,
      record.completedAt,
      record.createdAt,
      record.updatedAt
    );
  }

  async updateRequestStatus(
    tx: SqlTransaction,
    params: {
      requestId: string;
      expectedRevision: bigint;
      newStatus: DeletionRequestStatus;
      newRevision: bigint;
      cancelledAt?: Date | null;
      cancelledBy?: string | null;
      cancelReason?: string | null;
      updatedAt: Date;
    }
  ): Promise<boolean> {
    const rows = await tx.query<{ id: string }>(
      `UPDATE "deletion_request"
       SET "status" = $1,
           "current_revision" = $2::bigint,
           "cancelled_at" = COALESCE($3, "cancelled_at"),
           "cancelled_by" = COALESCE($4, "cancelled_by"),
           "cancel_reason" = COALESCE($5, "cancel_reason"),
           "updated_at" = $6
       WHERE "id" = $7::uuid AND "current_revision" = $8::bigint
       RETURNING "id"`,
      params.newStatus,
      params.newRevision,
      params.cancelledAt ?? null,
      params.cancelledBy ?? null,
      params.cancelReason ?? null,
      params.updatedAt,
      params.requestId,
      params.expectedRevision
    );
    return rows.length > 0;
  }

  async insertReceipt(tx: SqlTransaction, receipt: DeletionReceiptRecord): Promise<void> {
    await tx.execute(
      `INSERT INTO "deletion_receipt" (
         "id", "request_id", "operation_type", "source_operation_id", "cause",
         "scope_type", "scope_ref", "actor_id", "previous_status", "new_status",
         "revision", "recovery_epoch", "anchor_timestamp", "purge_started_at",
         "main_purge_deadline", "residual_purge_deadline", "details_json", "created_at"
       ) VALUES (
         $1::uuid, $2::uuid, $3, $4, $5,
         $6, $7, $8, $9, $10,
         $11::bigint, $12::bigint, $13, $14,
         $15, $16, $17, $18
       )`,
      receipt.id,
      receipt.requestId,
      receipt.operationType,
      receipt.sourceOperationId,
      receipt.cause,
      receipt.scopeType,
      receipt.scopeRef,
      receipt.actorId,
      receipt.previousStatus,
      receipt.newStatus,
      receipt.revision,
      receipt.recoveryEpoch,
      receipt.anchorTimestamp,
      receipt.purgeStartedAt,
      receipt.mainPurgeDeadline,
      receipt.residualPurgeDeadline,
      receipt.details ? JSON.stringify(receipt.details) : null,
      receipt.createdAt
    );
  }

  async findReceiptsByRequestId(
    tx: SqlTransaction,
    requestId: string
  ): Promise<DeletionReceiptRecord[]> {
    const rows = await tx.query<DeletionReceiptRow>(
      `SELECT * FROM "deletion_receipt"
       WHERE "request_id" = $1::uuid
       ORDER BY "created_at" ASC, "revision" ASC`,
      requestId
    );
    return rows.map(mapReceiptRow);
  }
}

// ============================================================================
// DELETION COORDINATION SERVICE (MOD-008 / EL-TK-188)
// ============================================================================

const VALID_SCOPE_TYPES: readonly DeletionScopeType[] = ['EVENT', 'ACCOUNT', 'MEDIA'];
const VALID_OWNER_MODULES: readonly DeletionOwnerModule[] = [
  'MOD-001',
  'MOD-002',
  'MOD-003',
  'MOD-004',
  'MOD-008',
];

function computeCanonicalPayloadHash(params: {
  sourceOperationId: string;
  cause: DeletionCause;
  scopeType: DeletionScopeType;
  scopeRef: string;
  ownerModule: DeletionOwnerModule;
  expectedGeneration: bigint;
  expectedRevision: bigint;
  policyRef: string;
  policyVersion: string;
  anchorTimestamp: Date;
  cancelUntil: Date | null;
  purgeStartedAt: Date;
}): string {
  const canonical = JSON.stringify({
    sourceOperationId: params.sourceOperationId,
    cause: params.cause,
    scopeType: params.scopeType,
    scopeRef: params.scopeRef,
    ownerModule: params.ownerModule,
    expectedGeneration: params.expectedGeneration.toString(),
    expectedRevision: params.expectedRevision.toString(),
    policyRef: params.policyRef,
    policyVersion: params.policyVersion,
    anchorTimestamp: params.anchorTimestamp.toISOString(),
    cancelUntil: params.cancelUntil ? params.cancelUntil.toISOString() : null,
    purgeStartedAt: params.purgeStartedAt.toISOString(),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function validateCauseScopeAlignment(cause: DeletionCause, scopeType: DeletionScopeType): void {
  if (
    (cause === 'MANUAL_EVENT_DELETION' || cause === 'GRACE_PERIOD_EXPIRED') &&
    scopeType !== 'EVENT'
  ) {
    throw new DeletionCoordinationError(
      'INVALID_DELETION_INTENT',
      `Cause ${cause} requires scopeType EVENT, received ${scopeType}`
    );
  }
  if (cause === 'MANUAL_ACCOUNT_DELETION' && scopeType !== 'ACCOUNT') {
    throw new DeletionCoordinationError(
      'INVALID_DELETION_INTENT',
      `Cause ${cause} requires scopeType ACCOUNT, received ${scopeType}`
    );
  }
  if (
    (cause === 'PRIVACY_OWN_REMOVAL' ||
      cause === 'PRIVACY_ADMIN_RESOLUTION' ||
      cause === 'TRASH_RETENTION_EXPIRED' ||
      cause === 'QUARANTINE_DISPOSITION') &&
    scopeType !== 'MEDIA'
  ) {
    throw new DeletionCoordinationError(
      'INVALID_DELETION_INTENT',
      `Cause ${cause} requires scopeType MEDIA, received ${scopeType}`
    );
  }
}

export class DeletionCoordinationService {
  private readonly repository: DeletionCoordinationRepository;

  constructor(
    private readonly transactions: TransactionRunner,
    repository?: DeletionCoordinationRepository,
    private readonly telemetry?: DeletionTelemetrySink
  ) {
    this.repository = repository ?? new PostgresDeletionCoordinationRepository();
  }

  private async emitMetric(metric: DeletionTelemetryMetric): Promise<void> {
    if (this.telemetry) {
      await this.telemetry.recordDeletionMetric(metric);
    }
  }

  /**
   * EL-TK-188: Registers a canonical DeletionRequest / DeletionIntent in MOD-008.
   * Preserves owner anchor and UTC calendar deadlines (+7 / +30 days), enforces deterministic
   * idempotency (dedupKey + payloadHash), rejects legal holds, and prevents extending prior obligations.
   */
  async registerDeletionIntent(
    command: RegisterDeletionIntentCommand
  ): Promise<RegisterDeletionIntentResult> {
    if (!command) {
      throw new DeletionCoordinationError('INVALID_DELETION_INTENT', 'Command is required');
    }

    // 1. Legal Hold disabled in ordinary MVP (DEC-092 / EL-EP-015)
    if (
      command.legalHold === true ||
      (typeof command.policyRef === 'string' &&
        command.policyRef.toUpperCase().includes('HOLD'))
    ) {
      await this.emitMetric({
        cause: command.cause ?? 'UNKNOWN',
        outcome: 'REJECTED',
        errorCode: 'LEGAL_HOLD_NOT_ENABLED',
      });
      throw new DeletionCoordinationError(
        'LEGAL_HOLD_NOT_ENABLED',
        'LEGAL_OR_SECURITY_HOLD is disabled in ordinary MVP deletion coordination'
      );
    }

    // 2. Validate required fields
    if (!command.sourceOperationId || !command.sourceOperationId.trim()) {
      throw new DeletionCoordinationError('INVALID_DELETION_INTENT', 'sourceOperationId is required');
    }
    if (!command.cause || !VALID_DELETION_CAUSES.includes(command.cause)) {
      throw new DeletionCoordinationError('INVALID_DELETION_INTENT', 'Valid deletion cause is required');
    }
    if (!command.scopeType || !VALID_SCOPE_TYPES.includes(command.scopeType)) {
      throw new DeletionCoordinationError('INVALID_DELETION_INTENT', 'Valid scopeType is required');
    }
    if (!command.scopeRef || !command.scopeRef.trim()) {
      throw new DeletionCoordinationError('INVALID_DELETION_INTENT', 'scopeRef is required');
    }
    if (!command.ownerModule || !VALID_OWNER_MODULES.includes(command.ownerModule)) {
      throw new DeletionCoordinationError('INVALID_DELETION_INTENT', 'Valid ownerModule is required');
    }
    if (!command.policyRef || !command.policyRef.trim()) {
      throw new DeletionCoordinationError('INVALID_DELETION_INTENT', 'policyRef is required');
    }
    if (!command.actorId || !command.actorId.trim()) {
      throw new DeletionCoordinationError('INVALID_DELETION_INTENT', 'actorId is required');
    }

    validateCauseScopeAlignment(command.cause, command.scopeType);

    const expectedGeneration = command.expectedGeneration ?? 1n;
    const expectedRevision = command.expectedRevision ?? 1n;
    const recoveryEpoch = command.recoveryEpoch ?? 1n;

    if (expectedGeneration < 1n || expectedRevision < 1n) {
      throw new DeletionCoordinationError(
        'INVALID_DELETION_INTENT',
        'expectedGeneration and expectedRevision must be >= 1'
      );
    }
    if (recoveryEpoch < 1n) {
      throw new DeletionCoordinationError(
        'UNAUTHORIZED_EPOCH',
        'recoveryEpoch must be a valid positive epoch >= 1'
      );
    }

    // 3. Compute canonical UTC deadlines from the confirmed owner anchor (never from worker now)
    const computed = computeDeletionDeadlines({
      cause: command.cause,
      anchorTimestamp: command.anchorTimestamp,
      cancelUntil: command.cancelUntil,
      purgeStartedAt: command.purgeStartedAt,
    });

    const cleanScopeRef = command.scopeRef.trim();
    const cleanSourceOp = command.sourceOperationId.trim();
    const cleanPolicyRef = command.policyRef.trim();
    const cleanPolicyVersion = (command.policyVersion ?? '1.0').trim();
    const initialStatus: DeletionRequestStatus = command.initialStatus ?? 'CONFIRMED';

    const dedupKey = command.idempotencyKey?.trim()
      ? `idemp:${command.idempotencyKey.trim()}`
      : `del-intent:${cleanSourceOp}:${command.scopeType}:${cleanScopeRef}:${expectedGeneration.toString()}:${command.cause}`;

    const payloadHash = computeCanonicalPayloadHash({
      sourceOperationId: cleanSourceOp,
      cause: command.cause,
      scopeType: command.scopeType,
      scopeRef: cleanScopeRef,
      ownerModule: command.ownerModule,
      expectedGeneration,
      expectedRevision,
      policyRef: cleanPolicyRef,
      policyVersion: cleanPolicyVersion,
      anchorTimestamp: computed.anchorTimestamp,
      cancelUntil: computed.cancelUntil,
      purgeStartedAt: computed.purgeStartedAt,
    });

    const now = command.now ?? new Date();

    return this.transactions.run(async (tx) => {
      // 4. Deterministic Idempotency & Replay check (Escenario 2)
      const existing = await this.repository.findByDedupKeyForUpdate(tx, dedupKey);
      if (existing) {
        if (existing.payloadHash !== payloadHash) {
          await this.emitMetric({
            cause: command.cause,
            outcome: 'REJECTED',
            errorCode: 'DELETION_INTENT_PAYLOAD_CONFLICT',
          });
          throw new DeletionCoordinationError(
            'DELETION_INTENT_PAYLOAD_CONFLICT',
            'A deletion intent with the same deduplication key already exists with a different payload or policy'
          );
        }

        const receipts = await this.repository.findReceiptsByRequestId(tx, existing.id);
        await this.emitMetric({
          cause: existing.cause,
          outcome: 'IDEMPOTENT_REPLAY',
          status: existing.status,
        });
        return {
          request: existing,
          receipt: receipts[0],
          outcome: 'IDEMPOTENT_REPLAY',
        };
      }

      // 5. Check active obligations for the same scope:
      // Rule: "causa nueva no extiende obligaciones anteriores" & revision CAS
      const activeObligations = await this.repository.findActiveByScopeForUpdate(
        tx,
        command.scopeType,
        cleanScopeRef
      );

      for (const active of activeObligations) {
        if (expectedRevision < active.expectedRevision) {
          await this.emitMetric({
            cause: command.cause,
            outcome: 'REJECTED',
            errorCode: 'REVISION_CONFLICT',
          });
          throw new DeletionCoordinationError(
            'REVISION_CONFLICT',
            `Incoming expectedRevision (${expectedRevision}) is older than active obligation revision (${active.expectedRevision})`
          );
        }

        if (computed.mainPurgeDeadline.getTime() > active.mainPurgeDeadline.getTime()) {
          await this.emitMetric({
            cause: command.cause,
            outcome: 'REJECTED',
            errorCode: 'OBLIGATION_EXTENSION_FORBIDDEN',
          });
          throw new DeletionCoordinationError(
            'OBLIGATION_EXTENSION_FORBIDDEN',
            `New deletion cause (${command.cause}) cannot extend an earlier active mainPurgeDeadline (${active.mainPurgeDeadline.toISOString()}) to a later date (${computed.mainPurgeDeadline.toISOString()})`
          );
        }
      }

      // 6. Persist canonical DeletionRequest & initial DeletionReceipt
      const requestId = command.requestId ?? randomUUID();
      const requestRecord: DeletionRequestRecord = {
        id: requestId,
        sourceOperationId: cleanSourceOp,
        cause: command.cause,
        scopeType: command.scopeType,
        scopeRef: cleanScopeRef,
        parentRequestId: command.parentRequestId ?? null,
        ownerModule: command.ownerModule,
        expectedGeneration,
        expectedRevision,
        currentRevision: expectedRevision,
        policyRef: cleanPolicyRef,
        policyVersion: cleanPolicyVersion,
        anchorTimestamp: computed.anchorTimestamp,
        cancelUntil: computed.cancelUntil,
        purgeStartedAt: computed.purgeStartedAt,
        mainPurgeDeadline: computed.mainPurgeDeadline,
        residualPurgeDeadline: computed.residualPurgeDeadline,
        status: initialStatus,
        recoveryEpoch,
        dedupKey,
        payloadHash,
        relatedResources: command.relatedResources ? [...command.relatedResources] : [],
        cancelledAt: null,
        cancelledBy: null,
        cancelReason: null,
        claimedAt: null,
        claimedByWorker: null,
        mainPurgedAt: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      const receiptRecord: DeletionReceiptRecord = {
        id: randomUUID(),
        requestId,
        operationType: initialStatus === 'PREPARED' ? 'PREPARE' : 'CONFIRM',
        sourceOperationId: cleanSourceOp,
        cause: command.cause,
        scopeType: command.scopeType,
        scopeRef: cleanScopeRef,
        actorId: command.actorId.trim(),
        previousStatus: null,
        newStatus: initialStatus,
        revision: expectedRevision,
        recoveryEpoch,
        anchorTimestamp: computed.anchorTimestamp,
        purgeStartedAt: computed.purgeStartedAt,
        mainPurgeDeadline: computed.mainPurgeDeadline,
        residualPurgeDeadline: computed.residualPurgeDeadline,
        details: {
          policyRef: cleanPolicyRef,
          policyVersion: cleanPolicyVersion,
        },
        createdAt: now,
      };

      await this.repository.insertRequest(tx, requestRecord);
      await this.repository.insertReceipt(tx, receiptRecord);

      await this.emitMetric({
        cause: command.cause,
        outcome: 'REGISTERED',
        status: initialStatus,
      });

      return {
        request: requestRecord,
        receipt: receiptRecord,
        outcome: 'REGISTERED',
      };
    });
  }

  /**
   * Transitions a PREPARED request to CONFIRMED upon receiving external ACK,
   * preserving original anchorTimestamp and UTC deadlines without shifting them.
   */
  async confirmPreparedRequest(
    command: ConfirmDeletionRequestCommand
  ): Promise<DeletionRequestRecord> {
    if (command.recoveryEpoch < 1n) {
      throw new DeletionCoordinationError('UNAUTHORIZED_EPOCH', 'Valid recoveryEpoch is required');
    }

    const now = command.now ?? new Date();

    return this.transactions.run(async (tx) => {
      const existing = await this.repository.findByIdForUpdate(tx, command.requestId);
      if (!existing) {
        throw new DeletionCoordinationError('REQUEST_NOT_FOUND', 'Deletion request not found');
      }

      if (existing.recoveryEpoch > command.recoveryEpoch) {
        throw new DeletionCoordinationError(
          'UNAUTHORIZED_EPOCH',
          'Command recoveryEpoch is stale compared to persisted request epoch'
        );
      }

      // Idempotent if already CONFIRMED at current or expected revision
      if (existing.status === 'CONFIRMED') {
        return existing;
      }

      if (existing.status !== 'PREPARED') {
        throw new DeletionCoordinationError(
          'INVALID_STATUS_TRANSITION',
          `Cannot confirm deletion request from status ${existing.status}`
        );
      }

      if (existing.currentRevision !== command.expectedRevision) {
        throw new DeletionCoordinationError(
          'REVISION_CONFLICT',
          `Revision mismatch: expected ${command.expectedRevision}, found ${existing.currentRevision}`
        );
      }

      const newRevision = existing.currentRevision + 1n;
      const updated = await this.repository.updateRequestStatus(tx, {
        requestId: existing.id,
        expectedRevision: existing.currentRevision,
        newStatus: 'CONFIRMED',
        newRevision,
        updatedAt: now,
      });

      if (!updated) {
        throw new DeletionCoordinationError('REVISION_CONFLICT', 'Concurrent modification detected');
      }

      await this.repository.insertReceipt(tx, {
        id: randomUUID(),
        requestId: existing.id,
        operationType: 'CONFIRM',
        sourceOperationId: command.sourceOperationId,
        cause: existing.cause,
        scopeType: existing.scopeType,
        scopeRef: existing.scopeRef,
        actorId: command.actorId,
        previousStatus: existing.status,
        newStatus: 'CONFIRMED',
        revision: newRevision,
        recoveryEpoch: command.recoveryEpoch,
        anchorTimestamp: existing.anchorTimestamp,
        purgeStartedAt: existing.purgeStartedAt,
        mainPurgeDeadline: existing.mainPurgeDeadline,
        residualPurgeDeadline: existing.residualPurgeDeadline,
        details: { confirmedAt: now.toISOString() },
        createdAt: now,
      });

      await this.emitMetric({
        cause: existing.cause,
        outcome: 'CONFIRMED',
        status: 'CONFIRMED',
      });

      return {
        ...existing,
        status: 'CONFIRMED',
        currentRevision: newRevision,
        updatedAt: now,
      };
    });
  }

  /**
   * Marks a PREPARED request as UNKNOWN when ACK fails or times out.
   * Fails closed: neither reopens public access nor authorizes automatic physical purge.
   */
  async markRequestUnknown(
    command: MarkDeletionRequestUnknownCommand
  ): Promise<DeletionRequestRecord> {
    const now = command.now ?? new Date();

    return this.transactions.run(async (tx) => {
      const existing = await this.repository.findByIdForUpdate(tx, command.requestId);
      if (!existing) {
        throw new DeletionCoordinationError('REQUEST_NOT_FOUND', 'Deletion request not found');
      }

      if (existing.status === 'UNKNOWN') {
        return existing;
      }

      if (existing.status !== 'PREPARED') {
        throw new DeletionCoordinationError(
          'INVALID_STATUS_TRANSITION',
          `Cannot mark UNKNOWN from status ${existing.status}`
        );
      }

      if (existing.currentRevision !== command.expectedRevision) {
        throw new DeletionCoordinationError(
          'REVISION_CONFLICT',
          `Revision mismatch: expected ${command.expectedRevision}, found ${existing.currentRevision}`
        );
      }

      const newRevision = existing.currentRevision + 1n;
      await this.repository.updateRequestStatus(tx, {
        requestId: existing.id,
        expectedRevision: existing.currentRevision,
        newStatus: 'UNKNOWN',
        newRevision,
        updatedAt: now,
      });

      await this.repository.insertReceipt(tx, {
        id: randomUUID(),
        requestId: existing.id,
        operationType: 'MARK_UNKNOWN',
        sourceOperationId: command.sourceOperationId,
        cause: existing.cause,
        scopeType: existing.scopeType,
        scopeRef: existing.scopeRef,
        actorId: command.actorId,
        previousStatus: existing.status,
        newStatus: 'UNKNOWN',
        revision: newRevision,
        recoveryEpoch: command.recoveryEpoch,
        anchorTimestamp: existing.anchorTimestamp,
        purgeStartedAt: existing.purgeStartedAt,
        mainPurgeDeadline: existing.mainPurgeDeadline,
        residualPurgeDeadline: existing.residualPurgeDeadline,
        details: { reason: command.reason },
        createdAt: now,
      });

      await this.emitMetric({
        cause: existing.cause,
        outcome: 'MARKED_UNKNOWN',
        status: 'UNKNOWN',
      });

      return {
        ...existing,
        status: 'UNKNOWN',
        currentRevision: newRevision,
        updatedAt: now,
      };
    });
  }

  /**
   * Reconciles a PREPARED or UNKNOWN request to CONFIRMED or CANCELLED
   * preserving original anchorTimestamp and UTC deadlines without shifting them.
   */
  async reconcileUnknownRequest(
    command: ReconcileDeletionRequestCommand
  ): Promise<DeletionRequestRecord> {
    if (command.recoveryEpoch < 1n) {
      throw new DeletionCoordinationError('UNAUTHORIZED_EPOCH', 'Valid recoveryEpoch is required');
    }

    const now = command.now ?? new Date();

    return this.transactions.run(async (tx) => {
      const existing = await this.repository.findByIdForUpdate(tx, command.requestId);
      if (!existing) {
        throw new DeletionCoordinationError('REQUEST_NOT_FOUND', 'Deletion request not found');
      }

      if (existing.recoveryEpoch > command.recoveryEpoch) {
        throw new DeletionCoordinationError(
          'UNAUTHORIZED_EPOCH',
          'Reconciliation recoveryEpoch cannot be older than request epoch'
        );
      }

      if (existing.status === command.targetStatus) {
        return existing;
      }

      if (existing.status !== 'UNKNOWN' && existing.status !== 'PREPARED') {
        throw new DeletionCoordinationError(
          'INVALID_STATUS_TRANSITION',
          `Cannot reconcile request from status ${existing.status}`
        );
      }

      if (existing.currentRevision !== command.expectedRevision) {
        throw new DeletionCoordinationError(
          'REVISION_CONFLICT',
          `Revision mismatch: expected ${command.expectedRevision}, found ${existing.currentRevision}`
        );
      }

      const newRevision = existing.currentRevision + 1n;
      await this.repository.updateRequestStatus(tx, {
        requestId: existing.id,
        expectedRevision: existing.currentRevision,
        newStatus: command.targetStatus,
        newRevision,
        cancelledAt: command.targetStatus === 'CANCELLED' ? now : undefined,
        cancelledBy: command.targetStatus === 'CANCELLED' ? command.actorId : undefined,
        cancelReason: command.targetStatus === 'CANCELLED' ? command.resolutionNotes : undefined,
        updatedAt: now,
      });

      await this.repository.insertReceipt(tx, {
        id: randomUUID(),
        requestId: existing.id,
        operationType: 'RECONCILE',
        sourceOperationId: command.sourceOperationId,
        cause: existing.cause,
        scopeType: existing.scopeType,
        scopeRef: existing.scopeRef,
        actorId: command.actorId,
        previousStatus: existing.status,
        newStatus: command.targetStatus,
        revision: newRevision,
        recoveryEpoch: command.recoveryEpoch,
        anchorTimestamp: existing.anchorTimestamp,
        purgeStartedAt: existing.purgeStartedAt,
        mainPurgeDeadline: existing.mainPurgeDeadline,
        residualPurgeDeadline: existing.residualPurgeDeadline,
        details: { resolutionNotes: command.resolutionNotes },
        createdAt: now,
      });

      await this.emitMetric({
        cause: existing.cause,
        outcome: 'RECONCILED',
        status: command.targetStatus,
      });

      return {
        ...existing,
        status: command.targetStatus,
        currentRevision: newRevision,
        cancelledAt: command.targetStatus === 'CANCELLED' ? now : existing.cancelledAt,
        cancelledBy: command.targetStatus === 'CANCELLED' ? command.actorId : existing.cancelledBy,
        cancelReason:
          command.targetStatus === 'CANCELLED' ? command.resolutionNotes : existing.cancelReason,
        updatedAt: now,
      };
    });
  }

  /**
   * EL-TK-188: Minimal OpenAPI-compatible query projection for deletion requests and receipts.
   */
  async getDeletionProjection(
    query: GetDeletionProjectionQuery
  ): Promise<DeletionProjection | null> {
    const now = query.now ?? new Date();

    return this.transactions.run(async (tx) => {
      let request: DeletionRequestRecord | null = null;
      if (query.requestId) {
        request = await this.repository.findById(tx, query.requestId);
      } else if (query.scopeType && query.scopeRef) {
        request = await this.repository.findLatestByScope(tx, query.scopeType, query.scopeRef);
      } else {
        throw new DeletionCoordinationError(
          'INVALID_DELETION_INTENT',
          'Either requestId or (scopeType, scopeRef) must be provided'
        );
      }

      if (!request) {
        return null;
      }

      const receipts = await this.repository.findReceiptsByRequestId(tx, request.id);

      const isCancellable =
        isManualDeletionCause(request.cause) &&
        request.status === 'CONFIRMED' &&
        request.cancelUntil !== null &&
        now.getTime() < request.cancelUntil.getTime();

      return {
        requestId: request.id,
        sourceOperationId: request.sourceOperationId,
        cause: request.cause,
        scopeType: request.scopeType,
        scopeRef: request.scopeRef,
        status: request.status,
        policyRef: request.policyRef,
        policyVersion: request.policyVersion,
        anchorTimestamp: request.anchorTimestamp.toISOString(),
        cancelUntil: request.cancelUntil ? request.cancelUntil.toISOString() : null,
        purgeStartedAt: request.purgeStartedAt.toISOString(),
        mainPurgeDeadline: request.mainPurgeDeadline.toISOString(),
        residualPurgeDeadline: request.residualPurgeDeadline.toISOString(),
        isCancellable,
        currentRevision: request.currentRevision.toString(),
        recoveryEpoch: request.recoveryEpoch.toString(),
        receipts: receipts.map((r) => ({
          id: r.id,
          operationType: r.operationType,
          previousStatus: r.previousStatus,
          newStatus: r.newStatus,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    });
  }
}
