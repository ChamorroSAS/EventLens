import { createHash, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import type { EventAuditSink } from './contracts.js';
import {
  type DeletionCause,
  type DeletionOwnerModule,
  type DeletionReceiptRecord,
  type DeletionRequestRecord,
  type DeletionScopeType,
  DeletionCoordinationError,
  type DeletionCoordinationRepository,
  PostgresDeletionCoordinationRepository,
} from './deletion-coordination.js';

// ============================================================================
// MOD-008 — TOMBSTONES, INVENTORY MANIFEST, WRITER DRAIN & MAIN PURGE
// (EL-TK-197, EL-TK-195, EL-TK-196 / EL-EP-015)
// ============================================================================

export type DeletionTombstoneState =
  | 'PREPARED'
  | 'ACTIVE_BARRIER'
  | 'CANCELLED'
  | 'CLAIMED'
  | 'MAIN_PURGED'
  | 'RESIDUAL_COMPLETED'
  | 'UNKNOWN';

export interface DeletionAuthorityTombstoneRecord {
  readonly id: string;
  readonly requestId: string;
  readonly scopeType: DeletionScopeType;
  readonly scopeRef: string;
  readonly generation: bigint;
  readonly cause: DeletionCause;
  readonly tombstoneState: DeletionTombstoneState;
  readonly authoritySequence: bigint;
  readonly recoveryEpoch: bigint;
  readonly checkpointIntact: boolean;
  readonly anchorTimestamp: Date;
  readonly purgeStartedAt: Date;
  readonly mainPurgeDeadline: Date;
  readonly residualPurgeDeadline: Date;
  readonly mainPurgedAt: Date | null;
  readonly residualVerifiedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ExternalAuthorityJournalEntry {
  readonly sequence: bigint;
  readonly requestId: string;
  readonly scopeType: DeletionScopeType;
  readonly scopeRef: string;
  readonly generation: bigint;
  readonly cause: DeletionCause;
  readonly tombstoneState: DeletionTombstoneState;
  readonly recoveryEpoch: bigint;
  readonly anchorTimestamp: Date;
  readonly purgeStartedAt: Date;
  readonly mainPurgeDeadline: Date;
  readonly residualPurgeDeadline: Date;
  readonly mainPurgedAt?: Date | null;
  readonly residualVerifiedAt?: Date | null;
  readonly ackConfirmed: boolean;
}

export interface RecoveryCheckpointStatus {
  readonly recoveryEpoch: bigint;
  readonly checkpointIntact: boolean;
  readonly lastContiguousSequence: bigint;
  readonly hasSequenceGap: boolean;
}

export interface DeletionTombstoneAuthorityPort {
  getCheckpointStatus(): Promise<RecoveryCheckpointStatus>;
  prepareTombstoneEntry(
    entry: Omit<ExternalAuthorityJournalEntry, 'sequence' | 'ackConfirmed'>
  ): Promise<{ readonly preparedReceipt: string; readonly sequence: bigint }>;
  ackTombstoneEntry(params: {
    readonly preparedReceipt: string;
    readonly sequence: bigint;
    readonly recoveryEpoch: bigint;
  }): Promise<void>;
  getJournalEntriesForScope(params: {
    readonly scopeType: DeletionScopeType;
    readonly scopeRef: string;
  }): Promise<readonly ExternalAuthorityJournalEntry[]>;
}

export type ManifestObjectCategory =
  | 'ORIGINAL'
  | 'DERIVATIVE'
  | 'COVER_ASSET'
  | 'EXPORT_ARCHIVE'
  | 'EXPORT_PART'
  | 'STAGING_PARTIAL'
  | 'MULTIPART_UPLOAD';

export type ObjectAbsenceVerificationStatus =
  | 'PENDING'
  | 'PRESENT'
  | 'MISSING_VERIFIED'
  | 'UNKNOWN';

export interface DeletionManifestItem {
  readonly itemRef: string;
  readonly ownerModule: DeletionOwnerModule | 'MOD-005';
  readonly category: ManifestObjectCategory;
  readonly namespace: string;
  readonly objectKey: string;
  readonly versionId: string | null;
  readonly multipartUploadId: string | null;
  readonly generation: bigint;
  readonly sizeBytes: bigint;
  readonly sha256: string | null;
  readonly verificationStatus: ObjectAbsenceVerificationStatus;
}

export type WriterDrainState =
  | 'DRAINING'
  | 'QUIET_VERIFIED'
  | 'ACTIVE_WRITERS_BLOCKED'
  | 'STALE_OR_UNKNOWN';

export interface DeletionInventoryManifestRecord {
  readonly id: string;
  readonly requestId: string;
  readonly scopeType: DeletionScopeType;
  readonly scopeRef: string;
  readonly manifestRevision: bigint;
  readonly recoveryEpoch: bigint;
  readonly workerLeaseToken: string;
  readonly workerFence: bigint;
  readonly writerDrainState: WriterDrainState;
  readonly activeSignedGrantsCount: number;
  readonly activeInFlightTransfersCount: number;
  readonly items: readonly DeletionManifestItem[];
  readonly manifestHash: string;
  readonly preparedAt: Date;
  readonly quietVerifiedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OwnerInventoryInspectionResult {
  readonly items: readonly Omit<DeletionManifestItem, 'verificationStatus'>[];
  /** Unexpired presigned URLs or grants whose TTL has not elapsed yet (API revocation alone does not undo issued URLs) */
  readonly activeSignedGrantsCount: number;
  /** Currently active uploads/transfers or jobs writing to the target prefix */
  readonly activeInFlightTransfersCount: number;
}

export interface DeletionOwnerInventoryPort {
  inspectScopeInventoryAndWriters(params: {
    readonly requestId: string;
    readonly scopeType: DeletionScopeType;
    readonly scopeRef: string;
    readonly now: Date;
  }): Promise<OwnerInventoryInspectionResult>;
}

export interface ObjectStoragePurgeItemResult {
  readonly itemRef: string;
  readonly objectKey: string;
  readonly versionId: string | null;
  readonly status: 'MISSING_VERIFIED' | 'PRESENT' | 'UNKNOWN';
  readonly errorDetail?: string;
}

export interface ObjectStoragePurgePort {
  deleteAndVerifyItem(params: {
    readonly namespace: string;
    readonly objectKey: string;
    readonly versionId: string | null;
    readonly multipartUploadId: string | null;
    readonly category: ManifestObjectCategory;
  }): Promise<ObjectStoragePurgeItemResult>;
}

export interface WorkerExecutionContext {
  readonly workerId: string;
  readonly leaseToken: string;
  readonly workerFence: bigint;
  readonly recoveryEpoch: bigint;
  readonly leaseExpiresAt: Date;
}

export type MainPurgeStatus =
  | 'PENDING'
  | 'PARTIAL_OR_UNKNOWN'
  | 'MAIN_PURGED_VERIFIED'
  | 'DEAD_LETTER';

export type ResidualPurgeStatus =
  | 'PENDING_RESIDUAL'
  | 'RESIDUAL_VERIFIED'
  | 'RESIDUAL_FAILED_GATE';

export interface DeletionPurgeEvidenceRecord {
  readonly id: string;
  readonly requestId: string;
  readonly scopeType: DeletionScopeType;
  readonly scopeRef: string;
  readonly cause: DeletionCause;
  readonly manifestId: string;
  readonly manifestRevision: bigint;
  readonly mainPurgeStatus: MainPurgeStatus;
  readonly residualPurgeStatus: ResidualPurgeStatus;
  readonly attemptCount: number;
  readonly verifiedMissingCount: number;
  readonly totalManifestItemsCount: number;
  readonly unknownOrPresentCount: number;
  readonly ownerStateFinalized: boolean;
  readonly quotaSettled: boolean;
  readonly quotaSettlementReceiptId: string | null;
  readonly bytesReleased: bigint;
  readonly notificationEmitted: boolean;
  readonly notificationIntentId: string | null;
  readonly purgeStartedAt: Date;
  readonly mainPurgeDeadline: Date;
  readonly residualPurgeDeadline: Date;
  readonly mainPurgedAt: Date | null;
  readonly residualVerifiedAt: Date | null;
  readonly residualEvidence: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DeletionPurgeAlert {
  readonly alertType:
    | 'MAIN_PURGE_PARTIAL_OR_UNKNOWN'
    | 'MAIN_PURGE_DEAD_LETTER'
    | 'MAIN_PURGE_DEADLINE_BREACH'
    | 'RESIDUAL_GATE_FAILED';
  readonly requestId: string;
  readonly scopeType: DeletionScopeType;
  readonly scopeRef: string;
  readonly cause: DeletionCause;
  readonly details: string;
  readonly timestamp: Date;
}

export interface DeletionPurgeAlertSink {
  emitAlert(alert: DeletionPurgeAlert): void | Promise<void>;
}

export interface ReconcileScopeWithAuthorityCommand {
  readonly scopeType: DeletionScopeType;
  readonly scopeRef: string;
  readonly callerRecoveryEpoch: bigint;
  readonly now?: Date;
}

export interface ReconcileScopeWithAuthorityResult {
  readonly admissionAllowed: boolean;
  readonly reason:
    | 'NO_TOMBSTONE_RESTRICTIONS'
    | 'RELEASED_AFTER_CAUSAL_CANCEL_ACK'
    | 'BLOCKED_BY_PREPARED_UNCERTAIN_TOMBSTONE'
    | 'BLOCKED_BY_RESTORED_SNAPSHOT_TOMBSTONE'
    | 'BLOCKED_BY_CHECKPOINT_OR_EPOCH_FAILURE';
  readonly reconciledTombstones: readonly DeletionAuthorityTombstoneRecord[];
}

export interface PrepareDeletionManifestCommand {
  readonly requestId: string;
  readonly workerContext: WorkerExecutionContext;
  readonly expectedManifestRevision?: bigint;
  readonly now?: Date;
}

export interface PrepareDeletionManifestResult {
  readonly manifest: DeletionInventoryManifestRecord;
  readonly readyForMainPurge: boolean;
}

export interface ExecuteMainPurgeCommand {
  readonly requestId: string;
  readonly manifestId: string;
  readonly expectedManifestRevision: bigint;
  readonly workerContext: WorkerExecutionContext;
  readonly maxAttemptsBeforeDeadLetter?: number;
  readonly now?: Date;
}

export interface ExecuteMainPurgeResult {
  readonly outcome: 'MAIN_PURGED_VERIFIED' | 'RETRY_SCHEDULED_PARTIAL_OR_UNKNOWN' | 'DEAD_LETTER';
  readonly request: DeletionRequestRecord;
  readonly evidence: DeletionPurgeEvidenceRecord;
  readonly itemResults: readonly ObjectStoragePurgeItemResult[];
}

export interface DeletionPurgeExecutionOptions {
  readonly runner: TransactionRunner;
  readonly repository?: DeletionCoordinationRepository;
  readonly tombstoneAuthorityPort: DeletionTombstoneAuthorityPort;
  readonly inventoryPort: DeletionOwnerInventoryPort;
  readonly storagePurgePort: ObjectStoragePurgePort;
  readonly alertSink?: DeletionPurgeAlertSink;
  readonly auditSink?: EventAuditSink;
}

interface TombstoneRow {
  id: string;
  request_id: string;
  scope_type: string;
  scope_ref: string;
  generation: bigint | string | number;
  cause: string;
  tombstone_state: string;
  authority_sequence: bigint | string | number;
  recovery_epoch: bigint | string | number;
  checkpoint_intact: boolean;
  anchor_timestamp: Date;
  purge_started_at: Date;
  main_purge_deadline: Date;
  residual_purge_deadline: Date;
  main_purged_at: Date | null;
  residual_verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface ManifestRow {
  id: string;
  request_id: string;
  scope_type: string;
  scope_ref: string;
  manifest_revision: bigint | string | number;
  recovery_epoch: bigint | string | number;
  worker_lease_token: string;
  worker_fence: bigint | string | number;
  writer_drain_state: string;
  active_signed_grants_count: number;
  active_in_flight_transfers_count: number;
  items_json: string;
  manifest_hash: string;
  prepared_at: Date;
  quiet_verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface EvidenceRow {
  id: string;
  request_id: string;
  scope_type: string;
  scope_ref: string;
  cause: string;
  manifest_id: string;
  manifest_revision: bigint | string | number;
  main_purge_status: string;
  residual_purge_status: string;
  attempt_count: number;
  verified_missing_count: number;
  total_manifest_items_count: number;
  unknown_or_present_count: number;
  owner_state_finalized: boolean;
  quota_settled: boolean;
  quota_settlement_receipt_id: string | null;
  bytes_released: bigint | string | number;
  notification_emitted: boolean;
  notification_intent_id: string | null;
  purge_started_at: Date;
  main_purge_deadline: Date;
  residual_purge_deadline: Date;
  main_purged_at: Date | null;
  residual_verified_at: Date | null;
  residual_evidence_json: string;
  created_at: Date;
  updated_at: Date;
}

export function mapTombstoneRow(row: TombstoneRow): DeletionAuthorityTombstoneRecord {
  return {
    id: row.id,
    requestId: row.request_id,
    scopeType: row.scope_type as DeletionScopeType,
    scopeRef: row.scope_ref,
    generation: BigInt(row.generation),
    cause: row.cause as DeletionCause,
    tombstoneState: row.tombstone_state as DeletionTombstoneState,
    authoritySequence: BigInt(row.authority_sequence),
    recoveryEpoch: BigInt(row.recovery_epoch),
    checkpointIntact: Boolean(row.checkpoint_intact),
    anchorTimestamp: new Date(row.anchor_timestamp),
    purgeStartedAt: new Date(row.purge_started_at),
    mainPurgeDeadline: new Date(row.main_purge_deadline),
    residualPurgeDeadline: new Date(row.residual_purge_deadline),
    mainPurgedAt: row.main_purged_at ? new Date(row.main_purged_at) : null,
    residualVerifiedAt: row.residual_verified_at ? new Date(row.residual_verified_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function serializeManifestItems(items: readonly DeletionManifestItem[]): string {
  return JSON.stringify(
    items.map((it) => ({
      ...it,
      generation: it.generation.toString(),
      sizeBytes: it.sizeBytes.toString(),
    }))
  );
}

function deserializeManifestItems(json: string): DeletionManifestItem[] {
  const parsed = JSON.parse(json || '[]') as Array<{
    itemRef: string;
    ownerModule: DeletionOwnerModule | 'MOD-005';
    category: ManifestObjectCategory;
    namespace: string;
    objectKey: string;
    versionId: string | null;
    multipartUploadId: string | null;
    generation: string | number;
    sizeBytes: string | number;
    sha256: string | null;
    verificationStatus: ObjectAbsenceVerificationStatus;
  }>;
  return parsed.map((it) => ({
    ...it,
    generation: BigInt(it.generation),
    sizeBytes: BigInt(it.sizeBytes),
  }));
}

export function mapManifestRow(row: ManifestRow): DeletionInventoryManifestRecord {
  return {
    id: row.id,
    requestId: row.request_id,
    scopeType: row.scope_type as DeletionScopeType,
    scopeRef: row.scope_ref,
    manifestRevision: BigInt(row.manifest_revision),
    recoveryEpoch: BigInt(row.recovery_epoch),
    workerLeaseToken: row.worker_lease_token,
    workerFence: BigInt(row.worker_fence),
    writerDrainState: row.writer_drain_state as WriterDrainState,
    activeSignedGrantsCount: Number(row.active_signed_grants_count),
    activeInFlightTransfersCount: Number(row.active_in_flight_transfers_count),
    items: deserializeManifestItems(row.items_json),
    manifestHash: row.manifest_hash,
    preparedAt: new Date(row.prepared_at),
    quietVerifiedAt: row.quiet_verified_at ? new Date(row.quiet_verified_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function mapEvidenceRow(row: EvidenceRow): DeletionPurgeEvidenceRecord {
  return {
    id: row.id,
    requestId: row.request_id,
    scopeType: row.scope_type as DeletionScopeType,
    scopeRef: row.scope_ref,
    cause: row.cause as DeletionCause,
    manifestId: row.manifest_id,
    manifestRevision: BigInt(row.manifest_revision),
    mainPurgeStatus: row.main_purge_status as MainPurgeStatus,
    residualPurgeStatus: row.residual_purge_status as ResidualPurgeStatus,
    attemptCount: Number(row.attempt_count),
    verifiedMissingCount: Number(row.verified_missing_count),
    totalManifestItemsCount: Number(row.total_manifest_items_count),
    unknownOrPresentCount: Number(row.unknown_or_present_count),
    ownerStateFinalized: Boolean(row.owner_state_finalized),
    quotaSettled: Boolean(row.quota_settled),
    quotaSettlementReceiptId: row.quota_settlement_receipt_id,
    bytesReleased: BigInt(row.bytes_released),
    notificationEmitted: Boolean(row.notification_emitted),
    notificationIntentId: row.notification_intent_id,
    purgeStartedAt: new Date(row.purge_started_at),
    mainPurgeDeadline: new Date(row.main_purge_deadline),
    residualPurgeDeadline: new Date(row.residual_purge_deadline),
    mainPurgedAt: row.main_purged_at ? new Date(row.main_purged_at) : null,
    residualVerifiedAt: row.residual_verified_at ? new Date(row.residual_verified_at) : null,
    residualEvidence: JSON.parse(row.residual_evidence_json || '{}'),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class DeletionPurgeExecutionService {
  private readonly runner: TransactionRunner;
  private readonly repository: DeletionCoordinationRepository;
  private readonly tombstoneAuthorityPort: DeletionTombstoneAuthorityPort;
  private readonly inventoryPort: DeletionOwnerInventoryPort;
  private readonly storagePurgePort: ObjectStoragePurgePort;
  private readonly alertSink?: DeletionPurgeAlertSink;
  private readonly auditSink?: EventAuditSink;

  constructor(options: DeletionPurgeExecutionOptions) {
    this.runner = options.runner;
    this.repository = options.repository ?? new PostgresDeletionCoordinationRepository();
    this.tombstoneAuthorityPort = options.tombstoneAuthorityPort;
    this.inventoryPort = options.inventoryPort;
    this.storagePurgePort = options.storagePurgePort;
    this.alertSink = options.alertSink;
    this.auditSink = options.auditSink;
  }

  // --------------------------------------------------------------------------
  // EL-TK-197: Persistir tombstones y reconciliar eliminación con RecoveryAuthority
  // --------------------------------------------------------------------------

  async recordAndSyncTombstone(params: {
    readonly requestId: string;
    readonly tombstoneState: DeletionTombstoneState;
    readonly now?: Date;
  }): Promise<DeletionAuthorityTombstoneRecord> {
    const now = params.now ?? new Date();
    const checkpoint = await this.tombstoneAuthorityPort.getCheckpointStatus();
    if (!checkpoint.checkpointIntact || checkpoint.hasSequenceGap) {
      throw new DeletionCoordinationError(
        'INVALID_STATUS_TRANSITION',
        'RecoveryAuthority checkpoint is incomplete or has sequence gap; failing closed'
      );
    }

    const req = await this.runner.run((tx) => this.repository.findById(tx, params.requestId));
    if (!req) {
      throw new DeletionCoordinationError('REQUEST_NOT_FOUND', `Request '${params.requestId}' not found`);
    }

    // Step 1: PREPARE in external journal
    const prepared = await this.tombstoneAuthorityPort.prepareTombstoneEntry({
      requestId: req.id,
      scopeType: req.scopeType,
      scopeRef: req.scopeRef,
      generation: req.expectedGeneration,
      cause: req.cause,
      tombstoneState: params.tombstoneState,
      recoveryEpoch: checkpoint.recoveryEpoch,
      anchorTimestamp: req.anchorTimestamp,
      purgeStartedAt: req.purgeStartedAt,
      mainPurgeDeadline: req.mainPurgeDeadline,
      residualPurgeDeadline: req.residualPurgeDeadline,
      mainPurgedAt: req.mainPurgedAt,
      residualVerifiedAt: req.completedAt,
    });

    // Step 2: Persist SQL tombstone in PREPARED/UNKNOWN or target state prior to ACK
    const tombstoneId = randomUUID();
    await this.runner.run(async (tx: SqlTransaction) => {
      await tx.execute(
        `INSERT INTO deletion_authority_tombstone (
           id, request_id, scope_type, scope_ref, generation, cause,
           tombstone_state, authority_sequence, recovery_epoch, checkpoint_intact,
           anchor_timestamp, purge_started_at, main_purge_deadline, residual_purge_deadline,
           main_purged_at, residual_verified_at, created_at, updated_at
         ) VALUES (
           $1::uuid, $2::uuid, $3, $4, $5::bigint, $6,
           'PREPARED', $7::bigint, $8::bigint, true,
           $9, $10, $11, $12,
           $13, $14, $15, $15
         )
         ON CONFLICT (scope_type, scope_ref, generation, request_id)
         DO UPDATE SET
           tombstone_state = 'PREPARED',
           authority_sequence = EXCLUDED.authority_sequence,
           recovery_epoch = EXCLUDED.recovery_epoch,
           updated_at = EXCLUDED.updated_at`,
        tombstoneId,
        req.id,
        req.scopeType,
        req.scopeRef,
        req.expectedGeneration,
        req.cause,
        prepared.sequence,
        checkpoint.recoveryEpoch,
        req.anchorTimestamp,
        req.purgeStartedAt,
        req.mainPurgeDeadline,
        req.residualPurgeDeadline,
        req.mainPurgedAt,
        req.completedAt,
        now
      );
    });

    // Step 3: ACK in RecoveryAuthority; if ACK fails, mark tombstone UNKNOWN (fail-closed)
    try {
      await this.tombstoneAuthorityPort.ackTombstoneEntry({
        preparedReceipt: prepared.preparedReceipt,
        sequence: prepared.sequence,
        recoveryEpoch: checkpoint.recoveryEpoch,
      });

      return await this.runner.run(async (tx: SqlTransaction) => {
        await tx.execute(
          `UPDATE deletion_authority_tombstone
           SET tombstone_state = $1,
               main_purged_at = COALESCE($2, main_purged_at),
               residual_verified_at = COALESCE($3, residual_verified_at),
               updated_at = $4
           WHERE scope_type = $5 AND scope_ref = $6 AND generation = $7::bigint AND request_id = $8::uuid`,
          params.tombstoneState,
          req.mainPurgedAt,
          req.completedAt,
          now,
          req.scopeType,
          req.scopeRef,
          req.expectedGeneration,
          req.id
        );

        const rows = await tx.query<TombstoneRow>(
          `SELECT * FROM deletion_authority_tombstone
           WHERE scope_type = $1 AND scope_ref = $2 AND generation = $3::bigint AND request_id = $4::uuid`,
          req.scopeType,
          req.scopeRef,
          req.expectedGeneration,
          req.id
        );
        return mapTombstoneRow(rows[0]);
      });
    } catch {
      return await this.runner.run(async (tx: SqlTransaction) => {
        await tx.execute(
          `UPDATE deletion_authority_tombstone
           SET tombstone_state = 'UNKNOWN', updated_at = $1
           WHERE scope_type = $2 AND scope_ref = $3 AND generation = $4::bigint AND request_id = $5::uuid`,
          now,
          req.scopeType,
          req.scopeRef,
          req.expectedGeneration,
          req.id
        );

        const rows = await tx.query<TombstoneRow>(
          `SELECT * FROM deletion_authority_tombstone
           WHERE scope_type = $1 AND scope_ref = $2 AND generation = $3::bigint AND request_id = $4::uuid`,
          req.scopeType,
          req.scopeRef,
          req.expectedGeneration,
          req.id
        );
        return mapTombstoneRow(rows[0]);
      });
    }
  }

  /**
   * EL-TK-197 Escenarios 1, 2 y 3:
   * Reconciles SQL state after a crash, lost ACK, or PITR restore of an old snapshot
   * against the external RecoveryAuthority journal before admitting traffic to the scope.
   */
  async reconcileScopeWithAuthority(
    command: ReconcileScopeWithAuthorityCommand
  ): Promise<ReconcileScopeWithAuthorityResult> {
    const now = command.now ?? new Date();

    let checkpoint: RecoveryCheckpointStatus;
    try {
      checkpoint = await this.tombstoneAuthorityPort.getCheckpointStatus();
    } catch {
      return {
        admissionAllowed: false,
        reason: 'BLOCKED_BY_CHECKPOINT_OR_EPOCH_FAILURE',
        reconciledTombstones: [],
      };
    }

    // Escenario 3: Checkpoint incompleto, gap de secuencia o epoch stale -> fail-closed
    if (
      !checkpoint.checkpointIntact ||
      checkpoint.hasSequenceGap ||
      BigInt(command.callerRecoveryEpoch) !== checkpoint.recoveryEpoch
    ) {
      return {
        admissionAllowed: false,
        reason: 'BLOCKED_BY_CHECKPOINT_OR_EPOCH_FAILURE',
        reconciledTombstones: [],
      };
    }

    const journalEntries = await this.tombstoneAuthorityPort.getJournalEntriesForScope({
      scopeType: command.scopeType,
      scopeRef: command.scopeRef,
    });

    const reconciled = await this.runner.run(async (tx: SqlTransaction) => {
      for (const entry of journalEntries) {
        // Ensure the parent deletion_request exists in SQL even if a PITR snapshot predated the request!
        const existingReq = await this.repository.findByIdForUpdate(tx, entry.requestId);
        const mappedStatus =
          !entry.ackConfirmed || entry.tombstoneState === 'PREPARED' || entry.tombstoneState === 'UNKNOWN'
            ? 'UNKNOWN'
            : entry.tombstoneState === 'CANCELLED'
              ? 'CANCELLED'
              : entry.tombstoneState === 'CLAIMED'
                ? 'CLAIMED'
                : entry.tombstoneState === 'MAIN_PURGED'
                  ? 'MAIN_PURGED'
                  : entry.tombstoneState === 'RESIDUAL_COMPLETED'
                    ? 'COMPLETED'
                    : 'CONFIRMED';

        if (!existingReq) {
          // PITR restore brought back an older DB snapshot where deletion_request didn't exist yet!
          // Re-materialize the deletion_request and access barrier from the authority journal without shifting purgeStartedAt!
          const isManual =
            entry.cause === 'MANUAL_EVENT_DELETION' || entry.cause === 'MANUAL_ACCOUNT_DELETION';
          const restoredReq: DeletionRequestRecord = {
            id: entry.requestId,
            sourceOperationId: `pitr-reconciled:${entry.requestId}`,
            cause: entry.cause,
            scopeType: entry.scopeType,
            scopeRef: entry.scopeRef,
            parentRequestId: null,
            ownerModule:
              entry.scopeType === 'ACCOUNT'
                ? 'MOD-001'
                : entry.scopeType === 'EVENT'
                  ? 'MOD-002'
                  : 'MOD-003',
            expectedGeneration: entry.generation,
            expectedRevision: 1n,
            currentRevision: 1n,
            policyRef: 'MOD-008-PITR-RECONCILED-V1',
            policyVersion: '1.0',
            anchorTimestamp: entry.anchorTimestamp,
            cancelUntil: isManual ? entry.purgeStartedAt : null,
            purgeStartedAt: entry.purgeStartedAt,
            mainPurgeDeadline: entry.mainPurgeDeadline,
            residualPurgeDeadline: entry.residualPurgeDeadline,
            status: mappedStatus,
            recoveryEpoch: checkpoint.recoveryEpoch,
            dedupKey: `pitr:${entry.requestId}:${entry.scopeType}:${entry.scopeRef}`,
            payloadHash: `pitr-hash-${entry.sequence.toString()}`,
            relatedResources: [{ resourceType: entry.scopeType, resourceRef: entry.scopeRef }],
            cancelledAt: mappedStatus === 'CANCELLED' ? now : null,
            cancelledBy: mappedStatus === 'CANCELLED' ? 'AUTHORITY_RECONCILER' : null,
            cancelReason: mappedStatus === 'CANCELLED' ? 'Reconciled causal cancellation from journal' : null,
            claimedAt:
              mappedStatus === 'CLAIMED' || mappedStatus === 'MAIN_PURGED' || mappedStatus === 'COMPLETED'
                ? now
                : null,
            claimedByWorker:
              mappedStatus === 'CLAIMED' || mappedStatus === 'MAIN_PURGED' || mappedStatus === 'COMPLETED'
                ? 'AUTHORITY_RECONCILER'
                : null,
            mainPurgedAt: entry.mainPurgedAt ?? null,
            completedAt: entry.residualVerifiedAt ?? null,
            createdAt: now,
            updatedAt: now,
          };
          await this.repository.insertRequest(tx, restoredReq);
        } else if (existingReq.status !== mappedStatus) {
          const nextRev = existingReq.currentRevision + 1n;
          await tx.execute(
            `UPDATE deletion_request
             SET status = $1,
                 current_revision = $2::bigint,
                 recovery_epoch = $3::bigint,
                 main_purged_at = COALESCE($4, main_purged_at),
                 completed_at = COALESCE($5, completed_at),
                 updated_at = $6
             WHERE id = $7::uuid`,
            mappedStatus,
            nextRev,
            checkpoint.recoveryEpoch,
            entry.mainPurgedAt ?? null,
            entry.residualVerifiedAt ?? null,
            now,
            entry.requestId
          );
        }

        const effectiveTombstoneState: DeletionTombstoneState = !entry.ackConfirmed
          ? 'UNKNOWN'
          : entry.tombstoneState;

        await tx.execute(
          `INSERT INTO deletion_authority_tombstone (
             id, request_id, scope_type, scope_ref, generation, cause,
             tombstone_state, authority_sequence, recovery_epoch, checkpoint_intact,
             anchor_timestamp, purge_started_at, main_purge_deadline, residual_purge_deadline,
             main_purged_at, residual_verified_at, created_at, updated_at
           ) VALUES (
             $1::uuid, $2::uuid, $3, $4, $5::bigint, $6,
             $7, $8::bigint, $9::bigint, true,
             $10, $11, $12, $13,
             $14, $15, $16, $16
           )
           ON CONFLICT (scope_type, scope_ref, generation, request_id)
           DO UPDATE SET
             tombstone_state = EXCLUDED.tombstone_state,
             authority_sequence = EXCLUDED.authority_sequence,
             recovery_epoch = EXCLUDED.recovery_epoch,
             main_purged_at = COALESCE(EXCLUDED.main_purged_at, deletion_authority_tombstone.main_purged_at),
             residual_verified_at = COALESCE(EXCLUDED.residual_verified_at, deletion_authority_tombstone.residual_verified_at),
             updated_at = EXCLUDED.updated_at`,
          randomUUID(),
          entry.requestId,
          entry.scopeType,
          entry.scopeRef,
          entry.generation,
          entry.cause,
          effectiveTombstoneState,
          entry.sequence,
          checkpoint.recoveryEpoch,
          entry.anchorTimestamp,
          entry.purgeStartedAt,
          entry.mainPurgeDeadline,
          entry.residualPurgeDeadline,
          entry.mainPurgedAt ?? null,
          entry.residualVerifiedAt ?? null,
          now
        );

        // Enforce access barrier in SQL and prevent resurrection of old snapshot rows
        const desiredBarrierState =
          effectiveTombstoneState === 'CANCELLED'
            ? 'RELEASED'
            : effectiveTombstoneState === 'UNKNOWN' || effectiveTombstoneState === 'PREPARED'
              ? 'UNKNOWN'
              : 'ACTIVE';

        await tx.execute(
          `INSERT INTO deletion_access_barrier (
             id, request_id, cause, scope_type, scope_ref,
             target_scope_type, target_scope_ref, barrier_state,
             prepared_at, confirmed_at, released_at, created_at, updated_at
           ) VALUES (
             $1::uuid, $2::uuid, $3, $4, $5,
             $4, $5, $6,
             $7, $8, $9, $7, $7
           )
           ON CONFLICT (request_id, target_scope_type, target_scope_ref)
           DO UPDATE SET
             barrier_state = EXCLUDED.barrier_state,
             released_at = EXCLUDED.released_at,
             updated_at = EXCLUDED.updated_at`,
          randomUUID(),
          entry.requestId,
          entry.cause,
          entry.scopeType,
          entry.scopeRef,
          desiredBarrierState,
          now,
          desiredBarrierState === 'ACTIVE' ? now : null,
          desiredBarrierState === 'RELEASED' ? now : null
        );

        // If an old PITR snapshot had event/account in ACTIVE, enforce PENDING_DELETION / revoke guest sessions
        if (desiredBarrierState !== 'RELEASED') {
          if (entry.scopeType === 'EVENT') {
            await tx.execute(
              `UPDATE event
               SET status = CASE WHEN status = 'ARCHIVED' THEN status ELSE 'PENDING_DELETION' END,
                   purge_started_at = $1,
                   updated_at = $2
               WHERE id = $3::uuid AND status NOT IN ('PENDING_DELETION', 'ARCHIVED')`,
              entry.purgeStartedAt,
              now,
              entry.scopeRef
            );
            await tx.execute(
              `UPDATE guest_session SET revoked_at = $1 WHERE event_id = $2::uuid AND revoked_at IS NULL`,
              now,
              entry.scopeRef
            );
            await tx.execute(
              `UPDATE public_access_credential SET revoked_at = $1 WHERE event_id = $2::uuid AND revoked_at IS NULL`,
              now,
              entry.scopeRef
            );
          } else if (entry.scopeType === 'ACCOUNT') {
            await tx.execute(
              `UPDATE organizer_account
               SET status = CASE WHEN status = 'DELETED' THEN 'DELETED' ELSE 'PENDING_DELETION' END,
                   updated_at = $1
               WHERE id = $2::uuid AND status = 'ACTIVE'`,
              now,
              entry.scopeRef
            );
          }
        }
      }

      const tombstoneRows = await tx.query<TombstoneRow>(
        `SELECT * FROM deletion_authority_tombstone
         WHERE scope_type = $1 AND scope_ref = $2
         ORDER BY authority_sequence ASC`,
        command.scopeType,
        command.scopeRef
      );

      return tombstoneRows.map(mapTombstoneRow);
    });

    await this.auditSink?.record({
      id: randomUUID(),
      procedure: 'DELETION_TOMBSTONE_RECONCILED',
      actorId: 'SYSTEM_RECOVERY_AUTHORITY',
      targetIdentifier: `${command.scopeType}:${command.scopeRef}`,
      result: 'SUCCESS',
      details: `Reconciled ${reconciled.length} tombstones at epoch=${checkpoint.recoveryEpoch.toString()} seq=${checkpoint.lastContiguousSequence.toString()}`,
      timestamp: now,
    });

    if (reconciled.length === 0) {
      return {
        admissionAllowed: true,
        reason: 'NO_TOMBSTONE_RESTRICTIONS',
        reconciledTombstones: [],
      };
    }

    const hasUncertain = reconciled.some(
      (t) => t.tombstoneState === 'PREPARED' || t.tombstoneState === 'UNKNOWN'
    );
    if (hasUncertain) {
      return {
        admissionAllowed: false,
        reason: 'BLOCKED_BY_PREPARED_UNCERTAIN_TOMBSTONE',
        reconciledTombstones: reconciled,
      };
    }

    const hasActiveOrPurged = reconciled.some(
      (t) =>
        t.tombstoneState === 'ACTIVE_BARRIER' ||
        t.tombstoneState === 'CLAIMED' ||
        t.tombstoneState === 'MAIN_PURGED' ||
        t.tombstoneState === 'RESIDUAL_COMPLETED'
    );
    if (hasActiveOrPurged) {
      return {
        admissionAllowed: false,
        reason: 'BLOCKED_BY_RESTORED_SNAPSHOT_TOMBSTONE',
        reconciledTombstones: reconciled,
      };
    }

    return {
      admissionAllowed: true,
      reason: 'RELEASED_AFTER_CAUSAL_CANCEL_ACK',
      reconciledTombstones: reconciled,
    };
  }

  // --------------------------------------------------------------------------
  // EL-TK-195: Construir inventario verificable y detener escritores antes de purgar
  // --------------------------------------------------------------------------

  async prepareVerifiableManifestAndDrainWriters(
    command: PrepareDeletionManifestCommand
  ): Promise<PrepareDeletionManifestResult> {
    const now = command.now ?? new Date();
    const { workerContext } = command;

    this.validateWorkerExecutionContext(workerContext, now);

    const checkpoint = await this.tombstoneAuthorityPort.getCheckpointStatus();
    if (
      !checkpoint.checkpointIntact ||
      checkpoint.hasSequenceGap ||
      BigInt(workerContext.recoveryEpoch) !== checkpoint.recoveryEpoch
    ) {
      throw new DeletionCoordinationError(
        'UNAUTHORIZED_EPOCH',
        'RecoveryAuthority checkpoint is incomplete or worker recoveryEpoch is stale'
      );
    }

    const req = await this.runner.run((tx) => this.repository.findById(tx, command.requestId));
    if (!req) {
      throw new DeletionCoordinationError('REQUEST_NOT_FOUND', `Deletion request '${command.requestId}' not found`);
    }

    if (req.status === 'CANCELLED') {
      throw new DeletionCoordinationError(
        'INVALID_STATUS_TRANSITION',
        `Cannot prepare purge manifest for cancelled request '${req.id}'`
      );
    }

    if (req.status === 'PREPARED' || req.status === 'UNKNOWN') {
      throw new DeletionCoordinationError(
        'INVALID_STATUS_TRANSITION',
        `Cannot prepare purge manifest while request '${req.id}' is in uncertain status '${req.status}'`
      );
    }

    // Must have reached purgeStartedAt before claiming/building irreversible purge manifest
    if (now.getTime() < req.purgeStartedAt.getTime()) {
      throw new DeletionCoordinationError(
        'CLOCK_CONTRADICTION',
        `Cannot prepare purge manifest before purgeStartedAt (${req.purgeStartedAt.toISOString()}, now=${now.toISOString()})`
      );
    }

    // Inspect physical inventory and active writers/grants via owner port
    const inspection = await this.inventoryPort.inspectScopeInventoryAndWriters({
      requestId: req.id,
      scopeType: req.scopeType,
      scopeRef: req.scopeRef,
      now,
    });

    const manifestItems: DeletionManifestItem[] = inspection.items.map((item) => ({
      ...item,
      generation: BigInt(item.generation),
      sizeBytes: BigInt(item.sizeBytes),
      verificationStatus: 'PENDING',
    }));

    // EL-TK-195 Escenario 2: If signed URLs/grants are still unexpired or transfers are in flight,
    // writer drain is NOT quiet and main purge cannot proceed yet.
    const isWriterQuiet =
      inspection.activeSignedGrantsCount === 0 && inspection.activeInFlightTransfersCount === 0;
    const writerDrainState: WriterDrainState = isWriterQuiet
      ? 'QUIET_VERIFIED'
      : 'ACTIVE_WRITERS_BLOCKED';

    const manifestHash = createHash('sha256')
      .update(serializeManifestItems(manifestItems))
      .digest('hex');

    const manifest = await this.runner.run(async (tx: SqlTransaction) => {
      const currentReq = await this.repository.findByIdForUpdate(tx, req.id);
      if (!currentReq || currentReq.status === 'CANCELLED') {
        throw new DeletionCoordinationError('INVALID_STATUS_TRANSITION', 'Request cancelled concurrently');
      }

      const existingManifests = await tx.query<ManifestRow>(
        `SELECT * FROM deletion_inventory_manifest
         WHERE request_id = $1::uuid
         ORDER BY manifest_revision DESC
         FOR UPDATE`,
        req.id
      );

      const latestManifest = existingManifests[0] ? mapManifestRow(existingManifests[0]) : null;
      if (latestManifest && BigInt(workerContext.workerFence) < latestManifest.workerFence) {
        throw new DeletionCoordinationError(
          'REVISION_CONFLICT',
          `Worker fence ${workerContext.workerFence} is older than manifest fence ${latestManifest.workerFence}`
        );
      }

      const nextManifestRevision = latestManifest ? latestManifest.manifestRevision + 1n : 1n;
      if (
        command.expectedManifestRevision !== undefined &&
        BigInt(command.expectedManifestRevision) !== nextManifestRevision
      ) {
        throw new DeletionCoordinationError(
          'REVISION_CONFLICT',
          `Expected manifest revision ${command.expectedManifestRevision} does not match ${nextManifestRevision}`
        );
      }

      // Claim the request if not already CLAIMED/MAIN_PURGED
      if (currentReq.status === 'CONFIRMED') {
        const nextReqRev = currentReq.currentRevision + 1n;
        await tx.execute(
          `UPDATE deletion_request
           SET status = 'CLAIMED',
               current_revision = $1::bigint,
               claimed_at = COALESCE(claimed_at, $2),
               claimed_by_worker = $3,
               updated_at = $2
           WHERE id = $4::uuid`,
          nextReqRev,
          now,
          workerContext.workerId,
          req.id
        );

        await this.repository.insertReceipt(tx, {
          id: randomUUID(),
          requestId: req.id,
          operationType: 'CLAIM',
          sourceOperationId: `claim:${req.id}:rev-${nextManifestRevision.toString()}`,
          cause: req.cause,
          scopeType: req.scopeType,
          scopeRef: req.scopeRef,
          actorId: workerContext.workerId,
          previousStatus: currentReq.status,
          newStatus: 'CLAIMED',
          revision: nextReqRev,
          recoveryEpoch: checkpoint.recoveryEpoch,
          anchorTimestamp: req.anchorTimestamp,
          purgeStartedAt: req.purgeStartedAt,
          mainPurgeDeadline: req.mainPurgeDeadline,
          residualPurgeDeadline: req.residualPurgeDeadline,
          details: {
            workerFence: workerContext.workerFence.toString(),
            leaseToken: workerContext.leaseToken,
          },
          createdAt: now,
        });
      }

      const manifestId = randomUUID();
      await tx.execute(
        `INSERT INTO deletion_inventory_manifest (
           id, request_id, scope_type, scope_ref, manifest_revision,
           recovery_epoch, worker_lease_token, worker_fence, writer_drain_state,
           active_signed_grants_count, active_in_flight_transfers_count,
           items_json, manifest_hash, prepared_at, quiet_verified_at,
           created_at, updated_at
         ) VALUES (
           $1::uuid, $2::uuid, $3, $4, $5::bigint,
           $6::bigint, $7, $8::bigint, $9,
           $10, $11,
           $12, $13, $14, $15,
           $14, $14
         )`,
        manifestId,
        req.id,
        req.scopeType,
        req.scopeRef,
        nextManifestRevision,
        checkpoint.recoveryEpoch,
        workerContext.leaseToken,
        workerContext.workerFence,
        writerDrainState,
        inspection.activeSignedGrantsCount,
        inspection.activeInFlightTransfersCount,
        serializeManifestItems(manifestItems),
        manifestHash,
        now,
        isWriterQuiet ? now : null
      );

      const createdRows = await tx.query<ManifestRow>(
        `SELECT * FROM deletion_inventory_manifest WHERE id = $1::uuid`,
        manifestId
      );
      return mapManifestRow(createdRows[0]);
    });

    await this.recordAndSyncTombstone({
      requestId: req.id,
      tombstoneState: 'CLAIMED',
      now,
    });

    await this.auditSink?.record({
      id: randomUUID(),
      procedure: 'DELETION_MANIFEST_PREPARED',
      actorId: workerContext.workerId,
      targetIdentifier: `${req.scopeType}:${req.scopeRef}`,
      result: 'SUCCESS',
      details: `Manifest rev=${manifest.manifestRevision.toString()} hash=${manifest.manifestHash} items=${manifest.items.length} drain=${manifest.writerDrainState}`,
      timestamp: now,
    });

    return {
      manifest,
      readyForMainPurge: isWriterQuiet,
    };
  }

  // --------------------------------------------------------------------------
  // EL-TK-196: Ejecutar purga física durable e idempotente de principales (+7d UTC)
  // --------------------------------------------------------------------------

  async executeMainPurge(command: ExecuteMainPurgeCommand): Promise<ExecuteMainPurgeResult> {
    const now = command.now ?? new Date();
    const maxAttempts = command.maxAttemptsBeforeDeadLetter ?? 3;
    const { workerContext } = command;

    this.validateWorkerExecutionContext(workerContext, now);

    const checkpoint = await this.tombstoneAuthorityPort.getCheckpointStatus();
    if (
      !checkpoint.checkpointIntact ||
      checkpoint.hasSequenceGap ||
      BigInt(workerContext.recoveryEpoch) !== checkpoint.recoveryEpoch
    ) {
      throw new DeletionCoordinationError(
        'UNAUTHORIZED_EPOCH',
        'RecoveryAuthority checkpoint is incomplete or worker recoveryEpoch is stale'
      );
    }

    // Phase 1: Validate request, manifest, CAS revision, fence, and writer quiescence in short SQL read/lock
    const prePurgeState = await this.runner.run(async (tx: SqlTransaction) => {
      const req = await this.repository.findByIdForUpdate(tx, command.requestId);
      if (!req) {
        throw new DeletionCoordinationError('REQUEST_NOT_FOUND', `Request '${command.requestId}' not found`);
      }

      if (req.status === 'CANCELLED' || req.status === 'PREPARED' || req.status === 'UNKNOWN') {
        throw new DeletionCoordinationError(
          'INVALID_STATUS_TRANSITION',
          `Request '${req.id}' in status '${req.status}' cannot execute main purge`
        );
      }

      const manifestRows = await tx.query<ManifestRow>(
        `SELECT * FROM deletion_inventory_manifest
         WHERE id = $1::uuid AND request_id = $2::uuid
         FOR UPDATE`,
        command.manifestId,
        command.requestId
      );
      if (manifestRows.length === 0) {
        throw new DeletionCoordinationError(
          'REQUEST_NOT_FOUND',
          `Manifest '${command.manifestId}' not found for request '${command.requestId}'`
        );
      }

      const manifest = mapManifestRow(manifestRows[0]);
      if (manifest.manifestRevision !== BigInt(command.expectedManifestRevision)) {
        throw new DeletionCoordinationError(
          'REVISION_CONFLICT',
          `Expected manifest revision ${command.expectedManifestRevision} does not match ${manifest.manifestRevision}`
        );
      }

      const latestManifestRows = await tx.query<{ max_rev: bigint | string | number }>(
        `SELECT MAX(manifest_revision) AS max_rev
         FROM deletion_inventory_manifest
         WHERE request_id = $1::uuid`,
        command.requestId
      );
      const maxRev = BigInt(latestManifestRows[0]?.max_rev ?? manifest.manifestRevision);
      if (manifest.manifestRevision < maxRev) {
        throw new DeletionCoordinationError(
          'REVISION_CONFLICT',
          `Manifest revision ${manifest.manifestRevision} is stale; latest is ${maxRev}`
        );
      }

      if (BigInt(workerContext.workerFence) < manifest.workerFence) {
        throw new DeletionCoordinationError(
          'REVISION_CONFLICT',
          `Worker fence ${workerContext.workerFence} is lower than manifest fence ${manifest.workerFence}`
        );
      }

      if (manifest.writerDrainState !== 'QUIET_VERIFIED') {
        throw new DeletionCoordinationError(
          'INVALID_STATUS_TRANSITION',
          `Cannot execute main purge while writerDrainState is '${manifest.writerDrainState}'`
        );
      }

      const existingEvidenceRows = await tx.query<EvidenceRow>(
        `SELECT * FROM deletion_purge_evidence WHERE request_id = $1::uuid FOR UPDATE`,
        command.requestId
      );
      const existingEvidence = existingEvidenceRows[0] ? mapEvidenceRow(existingEvidenceRows[0]) : null;

      // Escenario 3: Idempotent replay if main purge is already verified
      if (
        (req.status === 'MAIN_PURGED' || req.status === 'COMPLETED') &&
        existingEvidence?.mainPurgeStatus === 'MAIN_PURGED_VERIFIED'
      ) {
        return {
          alreadyVerified: true as const,
          request: req,
          manifest,
          evidence: existingEvidence,
        };
      }

      return {
        alreadyVerified: false as const,
        request: req,
        manifest,
        existingEvidence,
      };
    });

    if (prePurgeState.alreadyVerified) {
      return {
        outcome: 'MAIN_PURGED_VERIFIED',
        request: prePurgeState.request,
        evidence: prePurgeState.evidence,
        itemResults: prePurgeState.manifest.items.map((it) => ({
          itemRef: it.itemRef,
          objectKey: it.objectKey,
          versionId: it.versionId,
          status: 'MISSING_VERIFIED' as const,
        })),
      };
    }

    // Phase 2: Re-check writer drain and execute physical object deletions OUTSIDE SQL transaction
    const postDrainCheck = await this.inventoryPort.inspectScopeInventoryAndWriters({
      requestId: prePurgeState.request.id,
      scopeType: prePurgeState.request.scopeType,
      scopeRef: prePurgeState.request.scopeRef,
      now,
    });

    if (
      postDrainCheck.activeSignedGrantsCount > 0 ||
      postDrainCheck.activeInFlightTransfersCount > 0 ||
      postDrainCheck.items.length > prePurgeState.manifest.items.length
    ) {
      // Late writer appeared or manifest became stale; mark manifest stale and require rebuild
      await this.runner.run(async (tx: SqlTransaction) => {
        await tx.execute(
          `UPDATE deletion_inventory_manifest
           SET writer_drain_state = 'STALE_OR_UNKNOWN', updated_at = $1
           WHERE id = $2::uuid`,
          now,
          prePurgeState.manifest.id
        );
      });
      throw new DeletionCoordinationError(
        'REVISION_CONFLICT',
        'Late writer or new object detected during purge preparation; manifest marked STALE_OR_UNKNOWN'
      );
    }

    const itemResults: ObjectStoragePurgeItemResult[] = [];
    const updatedManifestItems: DeletionManifestItem[] = [];

    for (const item of prePurgeState.manifest.items) {
      if (item.verificationStatus === 'MISSING_VERIFIED') {
        itemResults.push({
          itemRef: item.itemRef,
          objectKey: item.objectKey,
          versionId: item.versionId,
          status: 'MISSING_VERIFIED',
        });
        updatedManifestItems.push(item);
        continue;
      }

      try {
        const res = await this.storagePurgePort.deleteAndVerifyItem({
          namespace: item.namespace,
          objectKey: item.objectKey,
          versionId: item.versionId,
          multipartUploadId: item.multipartUploadId,
          category: item.category,
        });
        itemResults.push(res);
        updatedManifestItems.push({
          ...item,
          verificationStatus: res.status,
        });
      } catch (err) {
        itemResults.push({
          itemRef: item.itemRef,
          objectKey: item.objectKey,
          versionId: item.versionId,
          status: 'UNKNOWN',
          errorDetail: (err as Error).message,
        });
        updatedManifestItems.push({
          ...item,
          verificationStatus: 'UNKNOWN',
        });
      }
    }

    const verifiedMissingCount = itemResults.filter((r) => r.status === 'MISSING_VERIFIED').length;
    const totalCount = prePurgeState.manifest.items.length;
    const unknownOrPresentCount = totalCount - verifiedMissingCount;
    const allMissingVerified = unknownOrPresentCount === 0;

    // Phase 3: Persist item verification results and evidence in SQL under CAS & fence check
    const commitResult = await this.runner.run(async (tx: SqlTransaction) => {
      const currentReq = await this.repository.findByIdForUpdate(tx, prePurgeState.request.id);
      if (!currentReq) {
        throw new DeletionCoordinationError('REQUEST_NOT_FOUND', 'Request disappeared');
      }

      const prevAttemptCount = prePurgeState.existingEvidence?.attemptCount ?? 0;
      const attemptCount = prevAttemptCount + 1;

      await tx.execute(
        `UPDATE deletion_inventory_manifest
         SET items_json = $1,
             updated_at = $2
         WHERE id = $3::uuid`,
        serializeManifestItems(updatedManifestItems),
        now,
        prePurgeState.manifest.id
      );

      let mainPurgeStatus: MainPurgeStatus;
      let outcome: ExecuteMainPurgeResult['outcome'];
      let mainPurgedAt: Date | null = null;

      if (allMissingVerified) {
        mainPurgeStatus = 'MAIN_PURGED_VERIFIED';
        outcome = 'MAIN_PURGED_VERIFIED';
        // Preserve original mainPurgedAt if already set
        mainPurgedAt = currentReq.mainPurgedAt ?? now;

        const nextRev = currentReq.currentRevision + 1n;
        await tx.execute(
          `UPDATE deletion_request
           SET status = 'MAIN_PURGED',
               current_revision = $1::bigint,
               main_purged_at = COALESCE(main_purged_at, $2),
               updated_at = $2
           WHERE id = $3::uuid`,
          nextRev,
          mainPurgedAt,
          currentReq.id
        );

        await this.repository.insertReceipt(tx, {
          id: randomUUID(),
          requestId: currentReq.id,
          operationType: 'MAIN_PURGE_VERIFIED',
          sourceOperationId: `main-purge:${currentReq.id}:attempt-${attemptCount}`,
          cause: currentReq.cause,
          scopeType: currentReq.scopeType,
          scopeRef: currentReq.scopeRef,
          actorId: workerContext.workerId,
          previousStatus: currentReq.status,
          newStatus: 'MAIN_PURGED',
          revision: nextRev,
          recoveryEpoch: checkpoint.recoveryEpoch,
          anchorTimestamp: currentReq.anchorTimestamp,
          purgeStartedAt: currentReq.purgeStartedAt,
          mainPurgeDeadline: currentReq.mainPurgeDeadline,
          residualPurgeDeadline: currentReq.residualPurgeDeadline,
          details: {
            manifestId: prePurgeState.manifest.id,
            manifestRevision: prePurgeState.manifest.manifestRevision.toString(),
            verifiedMissingCount,
            totalCount,
          },
          createdAt: now,
        });
      } else {
        // Escenario 2: Three exhausted attempts are DEAD_LETTER, NEVER success!
        if (attemptCount >= maxAttempts) {
          mainPurgeStatus = 'DEAD_LETTER';
          outcome = 'DEAD_LETTER';
        } else {
          mainPurgeStatus = 'PARTIAL_OR_UNKNOWN';
          outcome = 'RETRY_SCHEDULED_PARTIAL_OR_UNKNOWN';
        }
      }

      const evidenceId = prePurgeState.existingEvidence?.id ?? randomUUID();
      await tx.execute(
        `INSERT INTO deletion_purge_evidence (
           id, request_id, scope_type, scope_ref, cause,
           manifest_id, manifest_revision, main_purge_status, residual_purge_status,
           attempt_count, verified_missing_count, total_manifest_items_count, unknown_or_present_count,
           owner_state_finalized, quota_settled, bytes_released, notification_emitted,
           purge_started_at, main_purge_deadline, residual_purge_deadline,
           main_purged_at, created_at, updated_at
         ) VALUES (
           $1::uuid, $2::uuid, $3, $4, $5,
           $6::uuid, $7::bigint, $8, 'PENDING_RESIDUAL',
           $9, $10, $11, $12,
           false, false, 0, false,
           $13, $14, $15,
           $16, $17, $17
         )
         ON CONFLICT (request_id)
         DO UPDATE SET
           manifest_id = EXCLUDED.manifest_id,
           manifest_revision = EXCLUDED.manifest_revision,
           main_purge_status = EXCLUDED.main_purge_status,
           attempt_count = EXCLUDED.attempt_count,
           verified_missing_count = EXCLUDED.verified_missing_count,
           total_manifest_items_count = EXCLUDED.total_manifest_items_count,
           unknown_or_present_count = EXCLUDED.unknown_or_present_count,
           main_purged_at = COALESCE(deletion_purge_evidence.main_purged_at, EXCLUDED.main_purged_at),
           updated_at = EXCLUDED.updated_at`,
        evidenceId,
        currentReq.id,
        currentReq.scopeType,
        currentReq.scopeRef,
        currentReq.cause,
        prePurgeState.manifest.id,
        prePurgeState.manifest.manifestRevision,
        mainPurgeStatus,
        attemptCount,
        verifiedMissingCount,
        totalCount,
        unknownOrPresentCount,
        currentReq.purgeStartedAt,
        currentReq.mainPurgeDeadline,
        currentReq.residualPurgeDeadline,
        mainPurgedAt,
        now
      );

      const updatedReq = (await this.repository.findById(tx, currentReq.id))!;
      const evidenceRows = await tx.query<EvidenceRow>(
        `SELECT * FROM deletion_purge_evidence WHERE request_id = $1::uuid`,
        currentReq.id
      );

      return {
        outcome,
        request: updatedReq,
        evidence: mapEvidenceRow(evidenceRows[0]),
      };
    });

    if (commitResult.outcome === 'MAIN_PURGED_VERIFIED') {
      await this.recordAndSyncTombstone({
        requestId: commitResult.request.id,
        tombstoneState: 'MAIN_PURGED',
        now,
      });
    } else {
      await this.alertSink?.emitAlert({
        alertType:
          commitResult.outcome === 'DEAD_LETTER'
            ? 'MAIN_PURGE_DEAD_LETTER'
            : 'MAIN_PURGE_PARTIAL_OR_UNKNOWN',
        requestId: commitResult.request.id,
        scopeType: commitResult.request.scopeType,
        scopeRef: commitResult.request.scopeRef,
        cause: commitResult.request.cause,
        details: `Main purge attempt ${commitResult.evidence.attemptCount} incomplete: verified=${verifiedMissingCount}/${totalCount}, unknownOrPresent=${unknownOrPresentCount}`,
        timestamp: now,
      });

      if (now.getTime() > commitResult.request.mainPurgeDeadline.getTime()) {
        await this.alertSink?.emitAlert({
          alertType: 'MAIN_PURGE_DEADLINE_BREACH',
          requestId: commitResult.request.id,
          scopeType: commitResult.request.scopeType,
          scopeRef: commitResult.request.scopeRef,
          cause: commitResult.request.cause,
          details: `Main purge +7d UTC deadline (${commitResult.request.mainPurgeDeadline.toISOString()}) exceeded at ${now.toISOString()}`,
          timestamp: now,
        });
      }
    }

    await this.auditSink?.record({
      id: randomUUID(),
      procedure: 'MAIN_PURGE_EXECUTED',
      actorId: workerContext.workerId,
      targetIdentifier: `${commitResult.request.scopeType}:${commitResult.request.scopeRef}`,
      result: 'SUCCESS',
      details: `Main purge outcome=${commitResult.outcome} verified=${verifiedMissingCount}/${totalCount} attempt=${commitResult.evidence.attemptCount}`,
      timestamp: now,
    });

    return {
      outcome: commitResult.outcome,
      request: commitResult.request,
      evidence: commitResult.evidence,
      itemResults,
    };
  }

  private validateWorkerExecutionContext(ctx: WorkerExecutionContext, now: Date): void {
    if (!ctx || !ctx.workerId || !ctx.leaseToken) {
      throw new DeletionCoordinationError(
        'UNAUTHORIZED_ACTOR',
        'Valid SYSTEM workerId and leaseToken are required'
      );
    }
    if (BigInt(ctx.workerFence) < 1n) {
      throw new DeletionCoordinationError('REVISION_CONFLICT', 'workerFence must be >= 1');
    }
    if (now.getTime() >= new Date(ctx.leaseExpiresAt).getTime()) {
      throw new DeletionCoordinationError(
        'REVISION_CONFLICT',
        `Worker lease '${ctx.leaseToken}' expired at ${new Date(ctx.leaseExpiresAt).toISOString()}`
      );
    }
  }
}
