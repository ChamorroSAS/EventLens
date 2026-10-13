import { createHash, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import type { EventAuditSink } from './contracts.js';
import {
  type DeletionCause,
  type DeletionOwnerModule,
  type DeletionReceiptRecord,
  type DeletionRequestRecord,
  type DeletionRequestStatus,
  type DeletionScopeType,
  type IrreversibleDeletionCause,
  type RelatedDeletionResourceRef,
  DeletionCoordinationError,
  type DeletionCoordinationRepository,
  PostgresDeletionCoordinationRepository,
  VALID_IRREVERSIBLE_DELETION_CAUSES,
  addUtcCalendarDays,
  computeDeletionDeadlines,
} from './deletion-coordination.js';
import type {
  BarrierObservabilitySink,
  DeletionAccessBarrierRecord,
  DeletionRecoveryBarrierPort,
  ExportDeletionBarrierPort,
} from './manual-deletion-workflows.js';

// ============================================================================
// MOD-008 — IRREVERSIBLE DELETION INTAKE COORDINATOR (EL-TK-194 / EL-EP-015)
// ============================================================================

export type ProducerReceiptStatus = 'CONFIRMED' | 'UNKNOWN';

export interface BaseIrreversibleIntakeCommand {
  readonly sourceOperationId: string;
  readonly producerReceiptId: string;
  readonly producerReceiptStatus?: ProducerReceiptStatus;
  readonly policyRef: string;
  readonly policyVersion?: string;
  readonly expectedGeneration?: bigint;
  readonly expectedRevision: bigint;
  readonly recoveryEpoch: bigint;
  readonly actorId: string;
  readonly relatedResources?: readonly RelatedDeletionResourceRef[];
  readonly idempotencyKey?: string;
  /** Worker or server clock at intake execution; never shifts the accredited owner anchor */
  readonly now?: Date;
}

export interface IngestGracePeriodExpiredCommand extends BaseIrreversibleIntakeCommand {
  readonly cause: 'GRACE_PERIOD_EXPIRED';
  readonly ownerModule: 'MOD-002';
  readonly eventId: string;
  /** Accredited grace_ends_at timestamp persisted on the event */
  readonly graceEndsAt: Date;
}

export interface IngestPrivacyRemovalIntentCommand extends BaseIrreversibleIntakeCommand {
  readonly cause: 'PRIVACY_OWN_REMOVAL' | 'PRIVACY_ADMIN_RESOLUTION';
  readonly ownerModule: 'MOD-004' | 'MOD-002';
  readonly mediaRef: string;
  readonly eventId: string;
  /** Accredited timestamp when own removal or admin privacy resolution was confirmed */
  readonly removalConfirmedAt: Date;
  /** Must be false/undefined; public report intake alone is never an authorized deletion intent */
  readonly isPublicReportIntakeOnly?: boolean;
}

export interface IngestTrashRetentionExpiredCommand extends BaseIrreversibleIntakeCommand {
  readonly cause: 'TRASH_RETENTION_EXPIRED';
  readonly ownerModule: 'MOD-004';
  readonly mediaRef: string;
  readonly eventId: string;
  readonly trashRecordId: string;
  /** Accredited restoreDeadline persisted when the media entered TRASHED */
  readonly restoreDeadline: Date;
}

export interface IngestQuarantineDispositionCommand extends BaseIrreversibleIntakeCommand {
  readonly cause: 'QUARANTINE_DISPOSITION';
  readonly ownerModule: 'MOD-003';
  readonly mediaRef: string;
  readonly eventId: string;
  readonly purgeIntentId: string;
  /** Accredited server timestamp when authorized ADMIN_HUMAN / SECURITY_AUTOMATION disposition committed */
  readonly dispositionConfirmedAt: Date;
  readonly dispositionActorRole: 'ADMIN_HUMAN' | 'SECURITY_AUTOMATION' | 'ORGANIZER' | 'PUBLIC';
}

export type IrreversibleDeletionIntakeCommand =
  | IngestGracePeriodExpiredCommand
  | IngestPrivacyRemovalIntentCommand
  | IngestTrashRetentionExpiredCommand
  | IngestQuarantineDispositionCommand;

export interface IrreversibleDeletionIntakeResult {
  readonly outcome: 'INGESTED' | 'IDEMPOTENT_REPLAY' | 'OUTCOME_UNKNOWN';
  readonly request: DeletionRequestRecord;
  readonly receipt: DeletionReceiptRecord;
  readonly barrier: DeletionAccessBarrierRecord;
  /** Earliest effective purgeStartedAt across all active obligations on the same resource */
  readonly effectivePurgeStartedAt: Date;
  readonly effectiveMainPurgeDeadline: Date;
  readonly effectiveResidualPurgeDeadline: Date;
}

export interface ReconcileLegacyQuarantineRecordCommand {
  readonly mediaRef: string;
  readonly eventId: string;
  readonly legacyOperationId: string;
  readonly legacyCommittedAt: Date;
  readonly expectedGeneration?: bigint;
  readonly expectedRevision?: bigint;
  readonly recoveryEpoch?: bigint;
  readonly now?: Date;
}

export interface ReconcileLegacyQuarantineRecordResult {
  readonly mediaRef: string;
  readonly dbStatus: string;
  readonly isLegacyDeletedWithoutPhysicalProof: boolean;
  readonly reopenedToQuarantined: false;
  readonly countedAsPhysicallyPurged: false;
  readonly accessRestrictedByBarrier: true;
  readonly request: DeletionRequestRecord;
}

export interface IrreversibleDeletionIntakeOptions {
  readonly runner: TransactionRunner;
  readonly repository?: DeletionCoordinationRepository;
  readonly recoveryBarrierPort: DeletionRecoveryBarrierPort;
  readonly exportBarrierPort?: ExportDeletionBarrierPort;
  readonly auditSink?: EventAuditSink;
  readonly observabilitySink?: BarrierObservabilitySink;
}

interface BarrierRow {
  id: string;
  request_id: string;
  cause: string;
  scope_type: string;
  scope_ref: string;
  target_scope_type: string;
  target_scope_ref: string;
  barrier_state: string;
  event_snapshot_status: string | null;
  event_snapshot_previous_status: string | null;
  in_flight_writers_count: number;
  revoked_grants_count: number;
  invalidated_exports_count: number;
  denied_access_count: number;
  export_parts_inventory_json: string;
  prepared_at: Date;
  confirmed_at: Date | null;
  released_at: Date | null;
  released_by: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapBarrierRow(row: BarrierRow): DeletionAccessBarrierRecord {
  return {
    id: row.id,
    requestId: row.request_id,
    cause: row.cause as DeletionCause,
    scopeType: row.scope_type as DeletionScopeType,
    scopeRef: row.scope_ref,
    targetScopeType: row.target_scope_type as 'ACCOUNT' | 'EVENT' | 'MEDIA',
    targetScopeRef: row.target_scope_ref,
    barrierState: row.barrier_state as DeletionAccessBarrierRecord['barrierState'],
    eventSnapshotStatus: row.event_snapshot_status as DeletionAccessBarrierRecord['eventSnapshotStatus'],
    eventSnapshotPreviousStatus:
      row.event_snapshot_previous_status as DeletionAccessBarrierRecord['eventSnapshotPreviousStatus'],
    inFlightWritersCount: Number(row.in_flight_writers_count),
    revokedGrantsCount: Number(row.revoked_grants_count),
    invalidatedExportsCount: Number(row.invalidated_exports_count),
    deniedAccessCount: Number(row.denied_access_count),
    exportPartsInventory: JSON.parse(row.export_parts_inventory_json || '[]'),
    preparedAt: new Date(row.prepared_at),
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at) : null,
    releasedAt: row.released_at ? new Date(row.released_at) : null,
    releasedBy: row.released_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function computeIntakePayloadHash(params: {
  sourceOperationId: string;
  producerReceiptId: string;
  cause: IrreversibleDeletionCause;
  scopeType: DeletionScopeType;
  scopeRef: string;
  ownerModule: DeletionOwnerModule;
  expectedGeneration: bigint;
  expectedRevision: bigint;
  policyRef: string;
  policyVersion: string;
  anchorTimestamp: Date;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        sourceOperationId: params.sourceOperationId,
        producerReceiptId: params.producerReceiptId,
        cause: params.cause,
        scopeType: params.scopeType,
        scopeRef: params.scopeRef,
        ownerModule: params.ownerModule,
        expectedGeneration: params.expectedGeneration.toString(),
        expectedRevision: params.expectedRevision.toString(),
        policyRef: params.policyRef,
        policyVersion: params.policyVersion,
        anchorTimestamp: params.anchorTimestamp.toISOString(),
      })
    )
    .digest('hex');
}

export class IrreversibleDeletionIntakeService {
  private readonly runner: TransactionRunner;
  private readonly repository: DeletionCoordinationRepository;
  private readonly recoveryBarrierPort: DeletionRecoveryBarrierPort;
  private readonly exportBarrierPort?: ExportDeletionBarrierPort;
  private readonly auditSink?: EventAuditSink;
  private readonly observabilitySink?: BarrierObservabilitySink;

  constructor(options: IrreversibleDeletionIntakeOptions) {
    this.runner = options.runner;
    this.repository = options.repository ?? new PostgresDeletionCoordinationRepository();
    this.recoveryBarrierPort = options.recoveryBarrierPort;
    this.exportBarrierPort = options.exportBarrierPort;
    this.auditSink = options.auditSink;
    this.observabilitySink = options.observabilitySink;
  }

  /**
   * EL-TK-194: Coordinates verified non-manual deletion intents across MOD-002, MOD-003, and MOD-004:
   * - GRACE_PERIOD_EXPIRED (EL-TK-067): anchor = graceEndsAt, no extra 72h cancelable window.
   * - PRIVACY_OWN_REMOVAL / PRIVACY_ADMIN_RESOLUTION (EL-TK-114 / EL-TK-119): anchor = removalConfirmedAt,
   *   irreversible, no trash restore or organizer veto; rejects unconfirmed public report intakes.
   * - TRASH_RETENTION_EXPIRED (EL-TK-109 / EL-TK-108 corrective): anchor = restoreDeadline,
   *   strictly serialized against restoration (`now < restoreDeadline` vs `now >= restoreDeadline`).
   * - QUARANTINE_DISPOSITION (EL-TK-187 / EL-TK-042 Option A): anchor = dispositionConfirmedAt,
   *   authorized only for ADMIN_HUMAN / SECURITY_AUTOMATION, preserves QUARANTINED status in DB
   *   while installing immediate access/release barrier until physical purge is verified.
   */
  async ingestIrreversibleIntent(
    command: IrreversibleDeletionIntakeCommand
  ): Promise<IrreversibleDeletionIntakeResult> {
    if (!command || typeof command !== 'object') {
      throw new DeletionCoordinationError('INVALID_DELETION_INTENT', 'Intake command is required');
    }

    if (!VALID_IRREVERSIBLE_DELETION_CAUSES.includes(command.cause)) {
      throw new DeletionCoordinationError(
        'INVALID_DELETION_INTENT',
        `Unsupported irreversible deletion cause: ${(command as { cause?: string }).cause ?? 'UNKNOWN'}`
      );
    }

    if (!command.sourceOperationId || !command.sourceOperationId.trim()) {
      throw new DeletionCoordinationError('INVALID_DELETION_INTENT', 'sourceOperationId is required');
    }

    if (!command.producerReceiptId || !command.producerReceiptId.trim()) {
      throw new DeletionCoordinationError(
        'INVALID_DELETION_INTENT',
        'Verified producerReceiptId is required for non-manual deletion intake'
      );
    }

    if (!command.policyRef || !command.policyRef.trim()) {
      throw new DeletionCoordinationError('INVALID_DELETION_INTENT', 'policyRef is required');
    }

    if (command.policyRef.toUpperCase().includes('HOLD')) {
      throw new DeletionCoordinationError(
        'LEGAL_HOLD_NOT_ENABLED',
        'LEGAL_OR_SECURITY_HOLD is disabled in MVP deletion coordination'
      );
    }

    if (!command.actorId || !command.actorId.trim()) {
      throw new DeletionCoordinationError('INVALID_DELETION_INTENT', 'actorId is required');
    }

    const expectedGeneration = command.expectedGeneration ?? 1n;
    const expectedRevision = BigInt(command.expectedRevision);
    if (expectedGeneration < 1n || expectedRevision < 1n) {
      throw new DeletionCoordinationError(
        'INVALID_DELETION_INTENT',
        'expectedGeneration and expectedRevision must be >= 1'
      );
    }

    // Validate epoch against RecoveryAuthority
    let authorityEpoch: bigint;
    try {
      authorityEpoch = await this.recoveryBarrierPort.getRecoveryEpoch();
    } catch {
      throw new DeletionCoordinationError(
        'INVALID_STATUS_TRANSITION',
        'RecoveryAuthority unavailable; failing closed'
      );
    }

    if (BigInt(command.recoveryEpoch) !== authorityEpoch) {
      throw new DeletionCoordinationError(
        'UNAUTHORIZED_EPOCH',
        `Producer recoveryEpoch ${command.recoveryEpoch} does not match authority epoch ${authorityEpoch}`
      );
    }

    // Cause-specific validations and extraction of accredited anchor & scope
    const { scopeType, scopeRef, ownerModule, anchorTimestamp, defaultResources } =
      this.validateAndExtractCauseAnchor(command);

    const deadlines = computeDeletionDeadlines({
      cause: command.cause,
      anchorTimestamp,
    });

    const cleanSourceOp = command.sourceOperationId.trim();
    const cleanPolicyRef = command.policyRef.trim();
    const cleanPolicyVersion = (command.policyVersion ?? '1.0').trim();
    const relatedResources =
      command.relatedResources && command.relatedResources.length > 0
        ? command.relatedResources
        : defaultResources;

    const dedupKey = command.idempotencyKey?.trim()
      ? `idemp:${command.idempotencyKey.trim()}`
      : `irrev-intake:${cleanSourceOp}:${scopeType}:${scopeRef}:${expectedGeneration.toString()}:${command.cause}`;

    const payloadHash = computeIntakePayloadHash({
      sourceOperationId: cleanSourceOp,
      producerReceiptId: command.producerReceiptId.trim(),
      cause: command.cause,
      scopeType,
      scopeRef,
      ownerModule,
      expectedGeneration,
      expectedRevision,
      policyRef: cleanPolicyRef,
      policyVersion: cleanPolicyVersion,
      anchorTimestamp: deadlines.anchorTimestamp,
    });

    // Step 1: External PREPARE barrier before SQL mutation (AQR-001 / ARCH-010)
    let preparedReceipt: { readonly preparedReceipt: string; readonly sequence: bigint };
    try {
      preparedReceipt = await this.recoveryBarrierPort.prepareDeletionBarrier({
        operationId: cleanSourceOp,
        scopeType,
        scopeRef,
        cause: command.cause,
        expectedRevision,
        recoveryEpoch: authorityEpoch,
      });
    } catch (err) {
      throw new DeletionCoordinationError(
        'INVALID_STATUS_TRANSITION',
        `RecoveryAuthority PREPARE failed for irreversible intake: ${(err as Error).message}`
      );
    }

    // Step 2: Short SQL transaction with serialized row locks, cause-specific state checks,
    // deduplication, obligation non-extension enforcement, and barrier installation.
    const sqlPhase = await this.runner.run(async (tx: SqlTransaction) => {
      // Evaluate server clock inside the serialized transaction boundary (ARCH-019)
      const now = command.now ?? new Date();

      // 2.1 Check exact deduplication by dedupKey first
      const existingByDedup = await this.repository.findByDedupKeyForUpdate(tx, dedupKey);
      if (existingByDedup) {
        if (existingByDedup.payloadHash !== payloadHash) {
          throw new DeletionCoordinationError(
            'DELETION_INTENT_PAYLOAD_CONFLICT',
            `Duplicate delivery for '${dedupKey}' has conflicting anchor, revision, or policy parameters`
          );
        }

        const receipts = await this.repository.findReceiptsByRequestId(tx, existingByDedup.id);
        const barrierRows = await tx.query<BarrierRow>(
          `SELECT * FROM deletion_access_barrier
           WHERE request_id = $1::uuid AND target_scope_type = $2 AND target_scope_ref = $3`,
          existingByDedup.id,
          scopeType,
          scopeRef
        );

        const activeOnScope = await this.repository.findActiveByScopeForUpdate(tx, scopeType, scopeRef);
        const earliest = this.computeEarliestObligation(existingByDedup, activeOnScope);

        return {
          isReplay: true as const,
          request: existingByDedup,
          receipt: receipts[receipts.length - 1]!,
          barrier: mapBarrierRow(barrierRows[0]),
          revokedGrantsCount: 0,
          earliest,
          now,
        };
      }

      // 2.2 Check existing active requests on the same scope
      const activeOnScope = await this.repository.findActiveByScopeForUpdate(tx, scopeType, scopeRef);
      const sameCauseActive = activeOnScope.find((r) => r.cause === command.cause);
      if (sameCauseActive) {
        // Same cause already active with a different sourceOperationId:
        // If incoming tries to push purgeStartedAt later than existing obligation, forbid extension!
        if (deadlines.purgeStartedAt.getTime() > sameCauseActive.purgeStartedAt.getTime()) {
          throw new DeletionCoordinationError(
            'OBLIGATION_EXTENSION_FORBIDDEN',
            `Cannot extend existing '${command.cause}' obligation on ${scopeType}:${scopeRef} from ${sameCauseActive.purgeStartedAt.toISOString()} to ${deadlines.purgeStartedAt.toISOString()}`
          );
        }
        throw new DeletionCoordinationError(
          'DELETION_INTENT_PAYLOAD_CONFLICT',
          `An active deletion request for cause '${command.cause}' already exists on ${scopeType}:${scopeRef}`
        );
      }

      // 2.3 Cause-specific serialized database checks & state transitions
      let revokedGrantsCount = 0;
      let eventSnapshotStatus: string | null = null;
      let eventSnapshotPreviousStatus: string | null = null;
      let inFlightWritersCount = 0;

      if (command.cause === 'GRACE_PERIOD_EXPIRED') {
        const eventCheck = await this.verifyAndTransitionGraceExpiredEvent(
          tx,
          command,
          deadlines.purgeStartedAt,
          activeOnScope,
          now
        );
        revokedGrantsCount = eventCheck.revokedGrantsCount;
        eventSnapshotStatus = eventCheck.snapshotStatus;
        eventSnapshotPreviousStatus = eventCheck.snapshotPreviousStatus;
        inFlightWritersCount = eventCheck.inFlightWritersCount;
      } else if (command.cause === 'TRASH_RETENTION_EXPIRED') {
        await this.verifyAndLockTrashExpiredMedia(tx, command, now);
      } else if (command.cause === 'QUARANTINE_DISPOSITION') {
        await this.verifyAndLockQuarantineDispositionMedia(tx, command);
      } else if (
        command.cause === 'PRIVACY_OWN_REMOVAL' ||
        command.cause === 'PRIVACY_ADMIN_RESOLUTION'
      ) {
        await this.verifyAndLockPrivacyRemovalMedia(tx, command, now);
      }

      // 2.4 Compute effective earliest obligation across any coexisting causes on the same resource
      // (Regla de negocio EL-TK-194: "causa nueva no amplía otra obligación")
      const requestId = randomUUID();
      const createdRequest: DeletionRequestRecord = {
        id: requestId,
        sourceOperationId: cleanSourceOp,
        cause: command.cause,
        scopeType,
        scopeRef,
        parentRequestId: null,
        ownerModule,
        expectedGeneration,
        expectedRevision,
        currentRevision: expectedRevision,
        policyRef: cleanPolicyRef,
        policyVersion: cleanPolicyVersion,
        anchorTimestamp: deadlines.anchorTimestamp,
        cancelUntil: null, // Irreversible causes never have a cancellation window
        purgeStartedAt: deadlines.purgeStartedAt,
        mainPurgeDeadline: deadlines.mainPurgeDeadline,
        residualPurgeDeadline: deadlines.residualPurgeDeadline,
        status: 'PREPARED',
        recoveryEpoch: authorityEpoch,
        dedupKey,
        payloadHash,
        relatedResources,
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

      await this.repository.insertRequest(tx, createdRequest);

      const prepareReceipt: DeletionReceiptRecord = {
        id: randomUUID(),
        requestId,
        operationType: 'PREPARE',
        sourceOperationId: cleanSourceOp,
        cause: command.cause,
        scopeType,
        scopeRef,
        actorId: command.actorId.trim(),
        previousStatus: null,
        newStatus: 'PREPARED',
        revision: expectedRevision,
        recoveryEpoch: authorityEpoch,
        anchorTimestamp: deadlines.anchorTimestamp,
        purgeStartedAt: deadlines.purgeStartedAt,
        mainPurgeDeadline: deadlines.mainPurgeDeadline,
        residualPurgeDeadline: deadlines.residualPurgeDeadline,
        details: {
          producerReceiptId: command.producerReceiptId.trim(),
          producerReceiptStatus: command.producerReceiptStatus ?? 'CONFIRMED',
          preparedReceipt: preparedReceipt.preparedReceipt,
        },
        createdAt: now,
      };

      await this.repository.insertReceipt(tx, prepareReceipt);

      const barrierId = randomUUID();
      await tx.execute(
        `INSERT INTO deletion_access_barrier (
           id, request_id, cause, scope_type, scope_ref,
           target_scope_type, target_scope_ref, barrier_state,
           event_snapshot_status, event_snapshot_previous_status,
           in_flight_writers_count, revoked_grants_count,
           invalidated_exports_count, denied_access_count,
           export_parts_inventory_json, prepared_at, created_at, updated_at
         ) VALUES (
           $1::uuid, $2::uuid, $3, $4, $5,
           $6, $7, 'PREPARED',
           $8, $9,
           $10, $11,
           0, 0,
           '[]', $12, $12, $12
         )`,
        barrierId,
        requestId,
        command.cause,
        scopeType,
        scopeRef,
        scopeType,
        scopeRef,
        eventSnapshotStatus,
        eventSnapshotPreviousStatus,
        inFlightWritersCount,
        revokedGrantsCount,
        now
      );

      const barrierRows = await tx.query<BarrierRow>(
        `SELECT * FROM deletion_access_barrier WHERE id = $1::uuid`,
        barrierId
      );

      const earliest = this.computeEarliestObligation(createdRequest, activeOnScope);

      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'IRREVERSIBLE_DELETION_INTENT_INGESTED',
        actorId: command.actorId.trim(),
        targetIdentifier: `${scopeType}:${scopeRef}`,
        result: 'SUCCESS',
        details: `Ingested cause=${command.cause} owner=${ownerModule} requestId=${requestId} anchor=${deadlines.anchorTimestamp.toISOString()} purgeStartedAt=${deadlines.purgeStartedAt.toISOString()} effectivePurgeStartedAt=${earliest.effectivePurgeStartedAt.toISOString()}`,
        timestamp: now,
      });

      return {
        isReplay: false as const,
        request: createdRequest,
        receipt: prepareReceipt,
        barrier: mapBarrierRow(barrierRows[0]),
        revokedGrantsCount,
        earliest,
        now,
      };
    });

    if (sqlPhase.isReplay) {
      const isUnknown =
        sqlPhase.request.status === 'UNKNOWN' ||
        command.producerReceiptStatus === 'UNKNOWN';
      return {
        outcome: isUnknown ? 'OUTCOME_UNKNOWN' : 'IDEMPOTENT_REPLAY',
        request: sqlPhase.request,
        receipt: sqlPhase.receipt,
        barrier: sqlPhase.barrier,
        effectivePurgeStartedAt: sqlPhase.earliest.effectivePurgeStartedAt,
        effectiveMainPurgeDeadline: sqlPhase.earliest.effectiveMainPurgeDeadline,
        effectiveResidualPurgeDeadline: sqlPhase.earliest.effectiveResidualPurgeDeadline,
      };
    }

    this.observabilitySink?.recordBarrierMetric({
      metric: 'BARRIER_PREPARED',
      scopeType,
      cause: command.cause,
      count: 1,
      timestamp: sqlPhase.now,
    });

    if (sqlPhase.revokedGrantsCount > 0) {
      this.observabilitySink?.recordBarrierMetric({
        metric: 'GRANTS_REVOKED',
        scopeType,
        cause: command.cause,
        count: sqlPhase.revokedGrantsCount,
        timestamp: sqlPhase.now,
      });
    }

    // Step 3: If producerReceiptStatus === 'UNKNOWN', fail closed in UNKNOWN state without ACK confirmation
    if (command.producerReceiptStatus === 'UNKNOWN') {
      const unknownState = await this.transitionIntakeToUnknown(
        sqlPhase.request,
        cleanSourceOp,
        command.actorId.trim(),
        authorityEpoch,
        'Producer receipt status is UNKNOWN; failing closed until reconciled',
        sqlPhase.now
      );

      return {
        outcome: 'OUTCOME_UNKNOWN',
        request: unknownState.request,
        receipt: unknownState.receipt,
        barrier: unknownState.barrier,
        effectivePurgeStartedAt: sqlPhase.earliest.effectivePurgeStartedAt,
        effectiveMainPurgeDeadline: sqlPhase.earliest.effectiveMainPurgeDeadline,
        effectiveResidualPurgeDeadline: sqlPhase.earliest.effectiveResidualPurgeDeadline,
      };
    }

    // Step 4: Invalidate affected exports if applicable (EVENT grace expiration)
    let invalidatedExportsCount = 0;
    let exportPartsJson = '[]';
    if (this.exportBarrierPort && scopeType === 'EVENT') {
      const inv = await this.exportBarrierPort.invalidateExportsForScope({
        scopeType: 'EVENT',
        scopeRef,
        targetEventIds: [scopeRef],
        requestId: sqlPhase.request.id,
        reason: command.cause,
      });
      invalidatedExportsCount = inv.invalidatedExportsCount;
      exportPartsJson = JSON.stringify(inv.partsInventory);
    }

    // Step 5: ACK barrier in RecoveryAuthority
    try {
      await this.recoveryBarrierPort.ackDeletionBarrier({
        preparedReceipt: preparedReceipt.preparedReceipt,
        requestId: sqlPhase.request.id,
        revision: sqlPhase.request.currentRevision,
        recoveryEpoch: authorityEpoch,
      });

      const confirmed = await this.runner.run(async (tx: SqlTransaction) => {
        const nextRev = sqlPhase.request.currentRevision + 1n;
        await this.repository.updateRequestStatus(tx, {
          requestId: sqlPhase.request.id,
          expectedRevision: sqlPhase.request.currentRevision,
          newRevision: nextRev,
          newStatus: 'CONFIRMED',
          updatedAt: sqlPhase.now,
        });

        const updatedReq = (await this.repository.findById(tx, sqlPhase.request.id))!;
        const confirmReceipt: DeletionReceiptRecord = {
          id: randomUUID(),
          requestId: updatedReq.id,
          operationType: 'CONFIRM',
          sourceOperationId: cleanSourceOp,
          cause: command.cause,
          scopeType,
          scopeRef,
          actorId: command.actorId.trim(),
          previousStatus: 'PREPARED',
          newStatus: 'CONFIRMED',
          revision: nextRev,
          recoveryEpoch: authorityEpoch,
          anchorTimestamp: updatedReq.anchorTimestamp,
          purgeStartedAt: updatedReq.purgeStartedAt,
          mainPurgeDeadline: updatedReq.mainPurgeDeadline,
          residualPurgeDeadline: updatedReq.residualPurgeDeadline,
          details: {
            producerReceiptId: command.producerReceiptId.trim(),
            ackConfirmed: true,
          },
          createdAt: sqlPhase.now,
        };
        await this.repository.insertReceipt(tx, confirmReceipt);

        await tx.execute(
          `UPDATE deletion_access_barrier
           SET barrier_state = 'ACTIVE',
               confirmed_at = $1,
               invalidated_exports_count = $2,
               export_parts_inventory_json = $3,
               updated_at = $1
           WHERE request_id = $4::uuid`,
          sqlPhase.now,
          invalidatedExportsCount,
          exportPartsJson,
          updatedReq.id
        );

        const barrierRows = await tx.query<BarrierRow>(
          `SELECT * FROM deletion_access_barrier WHERE request_id = $1::uuid`,
          updatedReq.id
        );

        return {
          request: updatedReq,
          receipt: confirmReceipt,
          barrier: mapBarrierRow(barrierRows[0]),
        };
      });

      this.observabilitySink?.recordBarrierMetric({
        metric: 'BARRIER_CONFIRMED',
        scopeType,
        cause: command.cause,
        count: 1,
        timestamp: sqlPhase.now,
      });

      return {
        outcome: 'INGESTED',
        request: confirmed.request,
        receipt: confirmed.receipt,
        barrier: confirmed.barrier,
        effectivePurgeStartedAt: sqlPhase.earliest.effectivePurgeStartedAt,
        effectiveMainPurgeDeadline: sqlPhase.earliest.effectiveMainPurgeDeadline,
        effectiveResidualPurgeDeadline: sqlPhase.earliest.effectiveResidualPurgeDeadline,
      };
    } catch {
      const unknownState = await this.transitionIntakeToUnknown(
        sqlPhase.request,
        cleanSourceOp,
        command.actorId.trim(),
        authorityEpoch,
        'RecoveryAuthority ACK uncertain; barrier kept fail-closed',
        sqlPhase.now
      );

      return {
        outcome: 'OUTCOME_UNKNOWN',
        request: unknownState.request,
        receipt: unknownState.receipt,
        barrier: unknownState.barrier,
        effectivePurgeStartedAt: sqlPhase.earliest.effectivePurgeStartedAt,
        effectiveMainPurgeDeadline: sqlPhase.earliest.effectiveMainPurgeDeadline,
        effectiveResidualPurgeDeadline: sqlPhase.earliest.effectiveResidualPurgeDeadline,
      };
    }
  }

  /**
   * EL-TK-194 / DEC-109/110 (trash-quarantine-purge-policy.md):
   * Handles legacy rows historically marked DELETED by EL-TK-042 with only a logical receipt:
   * - Maintains restricted access (active barrier) and unknown physical purge evidence (`status = 'UNKNOWN'`).
   * - Never automatically reopens them to QUARANTINED.
   * - Never counts them as physically purged (`MAIN_PURGED` / `COMPLETED`) based on the legacy DELETED label alone.
   */
  async reconcileLegacyQuarantineRecord(
    command: ReconcileLegacyQuarantineRecordCommand
  ): Promise<ReconcileLegacyQuarantineRecordResult> {
    const now = command.now ?? new Date();
    const expectedGeneration = command.expectedGeneration ?? 1n;
    const expectedRevision = command.expectedRevision ?? 1n;
    const recoveryEpoch = command.recoveryEpoch ?? 1n;

    return this.runner.run(async (tx: SqlTransaction) => {
      const mediaRows = await tx
        .query<{ media_ref: string; status: string }>(
          `SELECT media_ref, status FROM media_catalog WHERE media_ref = $1 FOR UPDATE`,
          command.mediaRef
        )
        .catch(() => [] as { media_ref: string; status: string }[]);

      const dbStatus = mediaRows[0]?.status ?? 'DELETED';

      const dedupKey = `legacy-042:${command.legacyOperationId}:${command.mediaRef}`;
      const existing = await this.repository.findByDedupKeyForUpdate(tx, dedupKey);
      if (existing) {
        return {
          mediaRef: command.mediaRef,
          dbStatus,
          isLegacyDeletedWithoutPhysicalProof: dbStatus === 'DELETED',
          reopenedToQuarantined: false,
          countedAsPhysicallyPurged: false,
          accessRestrictedByBarrier: true,
          request: existing,
        };
      }

      const deadlines = computeDeletionDeadlines({
        cause: 'QUARANTINE_DISPOSITION',
        anchorTimestamp: command.legacyCommittedAt,
      });

      const requestId = randomUUID();
      const payloadHash = computeIntakePayloadHash({
        sourceOperationId: command.legacyOperationId,
        producerReceiptId: `legacy-receipt:${command.legacyOperationId}`,
        cause: 'QUARANTINE_DISPOSITION',
        scopeType: 'MEDIA',
        scopeRef: command.mediaRef,
        ownerModule: 'MOD-003',
        expectedGeneration,
        expectedRevision,
        policyRef: 'MOD-008-LEGACY-042-RECONCILIATION-V1',
        policyVersion: '1.0',
        anchorTimestamp: deadlines.anchorTimestamp,
      });

      const record: DeletionRequestRecord = {
        id: requestId,
        sourceOperationId: command.legacyOperationId,
        cause: 'QUARANTINE_DISPOSITION',
        scopeType: 'MEDIA',
        scopeRef: command.mediaRef,
        parentRequestId: null,
        ownerModule: 'MOD-003',
        expectedGeneration,
        expectedRevision,
        currentRevision: expectedRevision,
        policyRef: 'MOD-008-LEGACY-042-RECONCILIATION-V1',
        policyVersion: '1.0',
        anchorTimestamp: deadlines.anchorTimestamp,
        cancelUntil: null,
        purgeStartedAt: deadlines.purgeStartedAt,
        mainPurgeDeadline: deadlines.mainPurgeDeadline,
        residualPurgeDeadline: deadlines.residualPurgeDeadline,
        status: 'UNKNOWN', // Physical purge evidence is unknown until verified by storage inventory
        recoveryEpoch,
        dedupKey,
        payloadHash,
        relatedResources: [
          { resourceType: 'MEDIA', resourceRef: command.mediaRef, generation: expectedGeneration.toString() },
          { resourceType: 'EVENT', resourceRef: command.eventId },
        ],
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

      await this.repository.insertRequest(tx, record);

      await this.repository.insertReceipt(tx, {
        id: randomUUID(),
        requestId,
        operationType: 'MARK_UNKNOWN',
        sourceOperationId: command.legacyOperationId,
        cause: 'QUARANTINE_DISPOSITION',
        scopeType: 'MEDIA',
        scopeRef: command.mediaRef,
        actorId: 'SYSTEM_LEGACY_RECONCILER',
        previousStatus: null,
        newStatus: 'UNKNOWN',
        revision: expectedRevision,
        recoveryEpoch,
        anchorTimestamp: deadlines.anchorTimestamp,
        purgeStartedAt: deadlines.purgeStartedAt,
        mainPurgeDeadline: deadlines.mainPurgeDeadline,
        residualPurgeDeadline: deadlines.residualPurgeDeadline,
        details: {
          legacy042: true,
          dbStatusPreserved: dbStatus,
          physicalPurgeVerified: false,
        },
        createdAt: now,
      });

      await tx.execute(
        `INSERT INTO deletion_access_barrier (
           id, request_id, cause, scope_type, scope_ref,
           target_scope_type, target_scope_ref, barrier_state,
           prepared_at, created_at, updated_at
         ) VALUES (
           $1::uuid, $2::uuid, 'QUARANTINE_DISPOSITION', 'MEDIA', $3,
           'MEDIA', $3, 'UNKNOWN',
           $4, $4, $4
         )`,
        randomUUID(),
        requestId,
        command.mediaRef,
        now
      );

      return {
        mediaRef: command.mediaRef,
        dbStatus,
        isLegacyDeletedWithoutPhysicalProof: dbStatus === 'DELETED',
        reopenedToQuarantined: false,
        countedAsPhysicallyPurged: false,
        accessRestrictedByBarrier: true,
        request: record,
      };
    });
  }

  private validateAndExtractCauseAnchor(command: IrreversibleDeletionIntakeCommand): {
    scopeType: DeletionScopeType;
    scopeRef: string;
    ownerModule: DeletionOwnerModule;
    anchorTimestamp: Date;
    defaultResources: readonly RelatedDeletionResourceRef[];
  } {
    switch (command.cause) {
      case 'GRACE_PERIOD_EXPIRED': {
        if (command.ownerModule !== 'MOD-002') {
          throw new DeletionCoordinationError(
            'INVALID_DELETION_INTENT',
            'GRACE_PERIOD_EXPIRED must be emitted by owner module MOD-002'
          );
        }
        if (!command.eventId || !command.eventId.trim()) {
          throw new DeletionCoordinationError('INVALID_DELETION_INTENT', 'eventId is required');
        }
        if (!(command.graceEndsAt instanceof Date) || Number.isNaN(command.graceEndsAt.getTime())) {
          throw new DeletionCoordinationError(
            'INVALID_DELETION_INTENT',
            'Accredited graceEndsAt timestamp is required for GRACE_PERIOD_EXPIRED'
          );
        }
        const eventId = command.eventId.trim();
        return {
          scopeType: 'EVENT',
          scopeRef: eventId,
          ownerModule: 'MOD-002',
          anchorTimestamp: command.graceEndsAt,
          defaultResources: [{ resourceType: 'EVENT', resourceRef: eventId }],
        };
      }

      case 'PRIVACY_OWN_REMOVAL':
      case 'PRIVACY_ADMIN_RESOLUTION': {
        if (command.isPublicReportIntakeOnly === true) {
          throw new DeletionCoordinationError(
            'INVALID_DELETION_INTENT',
            'Public report or unconfirmed removal intake cannot be ingested as an authorized deletion intent'
          );
        }
        if (command.ownerModule !== 'MOD-004' && command.ownerModule !== 'MOD-002') {
          throw new DeletionCoordinationError(
            'INVALID_DELETION_INTENT',
            `${command.cause} must be emitted by owner module MOD-004 or MOD-002`
          );
        }
        if (!command.mediaRef || !command.mediaRef.trim() || !command.eventId || !command.eventId.trim()) {
          throw new DeletionCoordinationError(
            'INVALID_DELETION_INTENT',
            'mediaRef and eventId are required for privacy removal intake'
          );
        }
        if (
          !(command.removalConfirmedAt instanceof Date) ||
          Number.isNaN(command.removalConfirmedAt.getTime())
        ) {
          throw new DeletionCoordinationError(
            'INVALID_DELETION_INTENT',
            'Accredited removalConfirmedAt timestamp is required'
          );
        }
        const mediaRef = command.mediaRef.trim();
        const eventId = command.eventId.trim();
        return {
          scopeType: 'MEDIA',
          scopeRef: mediaRef,
          ownerModule: command.ownerModule,
          anchorTimestamp: command.removalConfirmedAt,
          defaultResources: [
            {
              resourceType: 'MEDIA',
              resourceRef: mediaRef,
              generation: (command.expectedGeneration ?? 1n).toString(),
            },
            { resourceType: 'EVENT', resourceRef: eventId },
          ],
        };
      }

      case 'TRASH_RETENTION_EXPIRED': {
        if (command.ownerModule !== 'MOD-004') {
          throw new DeletionCoordinationError(
            'INVALID_DELETION_INTENT',
            'TRASH_RETENTION_EXPIRED must be emitted by owner module MOD-004'
          );
        }
        if (
          !command.mediaRef ||
          !command.mediaRef.trim() ||
          !command.eventId ||
          !command.eventId.trim() ||
          !command.trashRecordId ||
          !command.trashRecordId.trim()
        ) {
          throw new DeletionCoordinationError(
            'INVALID_DELETION_INTENT',
            'mediaRef, eventId, and trashRecordId are required for TRASH_RETENTION_EXPIRED'
          );
        }
        if (!(command.restoreDeadline instanceof Date) || Number.isNaN(command.restoreDeadline.getTime())) {
          throw new DeletionCoordinationError(
            'INVALID_DELETION_INTENT',
            'Accredited restoreDeadline timestamp is required for TRASH_RETENTION_EXPIRED'
          );
        }
        const mediaRef = command.mediaRef.trim();
        const eventId = command.eventId.trim();
        return {
          scopeType: 'MEDIA',
          scopeRef: mediaRef,
          ownerModule: 'MOD-004',
          anchorTimestamp: command.restoreDeadline,
          defaultResources: [
            {
              resourceType: 'MEDIA',
              resourceRef: mediaRef,
              generation: (command.expectedGeneration ?? 1n).toString(),
            },
            { resourceType: 'EVENT', resourceRef: eventId },
          ],
        };
      }

      case 'QUARANTINE_DISPOSITION': {
        if (command.ownerModule !== 'MOD-003') {
          throw new DeletionCoordinationError(
            'INVALID_DELETION_INTENT',
            'QUARANTINE_DISPOSITION must be emitted by owner module MOD-003'
          );
        }
        if (
          command.dispositionActorRole !== 'ADMIN_HUMAN' &&
          command.dispositionActorRole !== 'SECURITY_AUTOMATION'
        ) {
          throw new DeletionCoordinationError(
            'UNAUTHORIZED_ACTOR',
            `Quarantine disposition requires ADMIN_HUMAN or SECURITY_AUTOMATION authority; received '${command.dispositionActorRole}'`
          );
        }
        if (
          !command.mediaRef ||
          !command.mediaRef.trim() ||
          !command.eventId ||
          !command.eventId.trim() ||
          !command.purgeIntentId ||
          !command.purgeIntentId.trim()
        ) {
          throw new DeletionCoordinationError(
            'INVALID_DELETION_INTENT',
            'mediaRef, eventId, and purgeIntentId are required for QUARANTINE_DISPOSITION'
          );
        }
        if (
          !(command.dispositionConfirmedAt instanceof Date) ||
          Number.isNaN(command.dispositionConfirmedAt.getTime())
        ) {
          throw new DeletionCoordinationError(
            'INVALID_DELETION_INTENT',
            'Accredited dispositionConfirmedAt server timestamp is required for QUARANTINE_DISPOSITION'
          );
        }
        const mediaRef = command.mediaRef.trim();
        const eventId = command.eventId.trim();
        return {
          scopeType: 'MEDIA',
          scopeRef: mediaRef,
          ownerModule: 'MOD-003',
          anchorTimestamp: command.dispositionConfirmedAt,
          defaultResources: [
            {
              resourceType: 'MEDIA',
              resourceRef: mediaRef,
              generation: (command.expectedGeneration ?? 1n).toString(),
            },
            { resourceType: 'EVENT', resourceRef: eventId },
          ],
        };
      }
    }
  }

  private async verifyAndTransitionGraceExpiredEvent(
    tx: SqlTransaction,
    command: IngestGracePeriodExpiredCommand,
    gracePurgeStartedAt: Date,
    activeOnScope: readonly DeletionRequestRecord[],
    now: Date
  ): Promise<{
    revokedGrantsCount: number;
    snapshotStatus: string;
    snapshotPreviousStatus: string | null;
    inFlightWritersCount: number;
  }> {
    const eventId = command.eventId.trim();
    const rows = await tx.query<{
      id: string;
      status: string;
      previous_status: string | null;
      grace_ends_at: Date | null;
      purge_started_at: Date | null;
    }>(
      `SELECT id, status, previous_status, grace_ends_at, purge_started_at
       FROM event
       WHERE id = $1
       FOR UPDATE`,
      eventId
    );

    if (rows.length === 0) {
      throw new DeletionCoordinationError('REQUEST_NOT_FOUND', `Event '${eventId}' not found`);
    }

    const event = rows[0];
    if (!event.grace_ends_at) {
      throw new DeletionCoordinationError(
        'INVALID_DELETION_INTENT',
        `Event '${eventId}' does not have an accredited grace_ends_at timestamp`
      );
    }

    const dbGraceEndsAt = new Date(event.grace_ends_at);
    if (dbGraceEndsAt.getTime() !== gracePurgeStartedAt.getTime()) {
      throw new DeletionCoordinationError(
        'CLOCK_CONTRADICTION',
        `Provided graceEndsAt (${gracePurgeStartedAt.toISOString()}) does not match event.grace_ends_at (${dbGraceEndsAt.toISOString()})`
      );
    }

    if (now.getTime() < dbGraceEndsAt.getTime()) {
      throw new DeletionCoordinationError(
        'CLOCK_CONTRADICTION',
        `Cannot ingest GRACE_PERIOD_EXPIRED before grace_ends_at (${dbGraceEndsAt.toISOString()}, now=${now.toISOString()})`
      );
    }

    const revokedSessions = await tx.execute(
      `UPDATE guest_session SET revoked_at = $1 WHERE event_id = $2 AND revoked_at IS NULL`,
      now,
      eventId
    );
    const revokedCreds = await tx.execute(
      `UPDATE public_access_credential SET revoked_at = $1 WHERE event_id = $2 AND revoked_at IS NULL`,
      now,
      eventId
    );
    const inFlightRows = await tx.query<{ cnt: number | string }>(
      `SELECT COUNT(*)::int AS cnt FROM upload_attempt WHERE event_id = $1 AND status = 'AUTHORIZED'`,
      eventId
    );

    // Preserve earliest purge_started_at if another obligation already set an earlier timestamp
    const existingEventPurgeStart = event.purge_started_at ? new Date(event.purge_started_at) : null;
    const earliestActiveRequestStart =
      activeOnScope.length > 0
        ? activeOnScope.reduce(
            (min, r) => (r.purgeStartedAt.getTime() < min.getTime() ? r.purgeStartedAt : min),
            activeOnScope[0].purgeStartedAt
          )
        : null;

    let effectiveEventPurgeStart = gracePurgeStartedAt;
    if (
      existingEventPurgeStart &&
      existingEventPurgeStart.getTime() < effectiveEventPurgeStart.getTime()
    ) {
      effectiveEventPurgeStart = existingEventPurgeStart;
    }
    if (
      earliestActiveRequestStart &&
      earliestActiveRequestStart.getTime() < effectiveEventPurgeStart.getTime()
    ) {
      effectiveEventPurgeStart = earliestActiveRequestStart;
    }

    const preservedPrevStatus =
      event.status === 'PENDING_DELETION' ? event.previous_status : event.status;

    await tx.execute(
      `UPDATE event
       SET status = 'PENDING_DELETION',
           previous_status = $1,
           purge_started_at = $2,
           updated_at = $3
       WHERE id = $4`,
      preservedPrevStatus,
      effectiveEventPurgeStart,
      now,
      eventId
    );

    return {
      revokedGrantsCount: revokedSessions + revokedCreds,
      snapshotStatus: event.status,
      snapshotPreviousStatus: event.previous_status,
      inFlightWritersCount: Number(inFlightRows[0]?.cnt ?? 0),
    };
  }

  private async verifyAndLockTrashExpiredMedia(
    tx: SqlTransaction,
    command: IngestTrashRetentionExpiredCommand,
    now: Date
  ): Promise<void> {
    // Boundary check: trash expiration is only valid when now >= restoreDeadline (ARCH-019 / EL-TK-108 & 109)
    if (now.getTime() < command.restoreDeadline.getTime()) {
      throw new DeletionCoordinationError(
        'CLOCK_CONTRADICTION',
        `Cannot ingest TRASH_RETENTION_EXPIRED before restoreDeadline (${command.restoreDeadline.toISOString()}, now=${now.toISOString()})`
      );
    }

    // If media_catalog table is present in the schema, lock the row and verify it wasn't restored before the deadline
    const mediaRows = await tx
      .query<{
        media_ref: string;
        status: string;
        generation: bigint | string | number;
        revision: bigint | string | number;
      }>(
        `SELECT media_ref, status, generation, revision
         FROM media_catalog
         WHERE media_ref = $1
         FOR UPDATE`,
        command.mediaRef.trim()
      )
      .catch(() => null);

    if (mediaRows && mediaRows.length > 0) {
      const media = mediaRows[0];
      // If media was restored prior to deadline, its status is no longer TRASHED/DELETED (e.g. PUBLISHED/HIDDEN)
      if (media.status !== 'TRASHED' && media.status !== 'DELETED') {
        throw new DeletionCoordinationError(
          'REVISION_CONFLICT',
          `Media '${command.mediaRef}' was already restored (status='${media.status}') prior to trash expiration claim`
        );
      }
      if (BigInt(media.revision) !== BigInt(command.expectedRevision)) {
        throw new DeletionCoordinationError(
          'REVISION_CONFLICT',
          `Media '${command.mediaRef}' revision (${media.revision}) does not match producer expectedRevision (${command.expectedRevision})`
        );
      }
    }
  }

  private async verifyAndLockQuarantineDispositionMedia(
    tx: SqlTransaction,
    command: IngestQuarantineDispositionCommand
  ): Promise<void> {
    // Option A (trash-quarantine-purge-policy.md): media remains QUARANTINED in media_catalog until physical purge is verified
    const mediaRows = await tx
      .query<{
        media_ref: string;
        status: string;
        generation: bigint | string | number;
        revision: bigint | string | number;
      }>(
        `SELECT media_ref, status, generation, revision
         FROM media_catalog
         WHERE media_ref = $1
         FOR UPDATE`,
        command.mediaRef.trim()
      )
      .catch(() => null);

    if (mediaRows && mediaRows.length > 0) {
      const media = mediaRows[0];
      if (media.status !== 'QUARANTINED') {
        throw new DeletionCoordinationError(
          'INVALID_STATUS_TRANSITION',
          `Quarantine disposition requires media in QUARANTINED status (Option A); found '${media.status}'`
        );
      }
      if (BigInt(media.revision) !== BigInt(command.expectedRevision)) {
        throw new DeletionCoordinationError(
          'REVISION_CONFLICT',
          `Media '${command.mediaRef}' revision (${media.revision}) does not match disposition expectedRevision (${command.expectedRevision})`
        );
      }
    }
  }

  private async verifyAndLockPrivacyRemovalMedia(
    tx: SqlTransaction,
    command: IngestPrivacyRemovalIntentCommand,
    now: Date
  ): Promise<void> {
    if (now.getTime() < command.removalConfirmedAt.getTime()) {
      throw new DeletionCoordinationError(
        'CLOCK_CONTRADICTION',
        `removalConfirmedAt (${command.removalConfirmedAt.toISOString()}) cannot be in the future relative to server clock (${now.toISOString()})`
      );
    }

    const mediaRows = await tx
      .query<{
        media_ref: string;
        status: string;
        revision: bigint | string | number;
      }>(
        `SELECT media_ref, status, revision
         FROM media_catalog
         WHERE media_ref = $1
         FOR UPDATE`,
        command.mediaRef.trim()
      )
      .catch(() => null);

    if (mediaRows && mediaRows.length > 0) {
      const media = mediaRows[0];
      if (BigInt(media.revision) !== BigInt(command.expectedRevision)) {
        throw new DeletionCoordinationError(
          'REVISION_CONFLICT',
          `Media '${command.mediaRef}' revision (${media.revision}) does not match privacy removal expectedRevision (${command.expectedRevision})`
        );
      }
    }
  }

  private computeEarliestObligation(
    current: DeletionRequestRecord,
    others: readonly DeletionRequestRecord[]
  ): {
    effectivePurgeStartedAt: Date;
    effectiveMainPurgeDeadline: Date;
    effectiveResidualPurgeDeadline: Date;
  } {
    let earliestStart = current.purgeStartedAt;
    for (const other of others) {
      if (other.status !== 'CANCELLED' && other.purgeStartedAt.getTime() < earliestStart.getTime()) {
        earliestStart = other.purgeStartedAt;
      }
    }
    return {
      effectivePurgeStartedAt: earliestStart,
      effectiveMainPurgeDeadline: addUtcCalendarDays(earliestStart, 7),
      effectiveResidualPurgeDeadline: addUtcCalendarDays(earliestStart, 30),
    };
  }

  private async transitionIntakeToUnknown(
    request: DeletionRequestRecord,
    sourceOperationId: string,
    actorId: string,
    recoveryEpoch: bigint,
    reason: string,
    now: Date
  ): Promise<{
    request: DeletionRequestRecord;
    receipt: DeletionReceiptRecord;
    barrier: DeletionAccessBarrierRecord;
  }> {
    const res = await this.runner.run(async (tx: SqlTransaction) => {
      const nextRev = request.currentRevision + 1n;
      await this.repository.updateRequestStatus(tx, {
        requestId: request.id,
        expectedRevision: request.currentRevision,
        newRevision: nextRev,
        newStatus: 'UNKNOWN',
        updatedAt: now,
      });

      const updatedReq = (await this.repository.findById(tx, request.id))!;
      const unknownReceipt: DeletionReceiptRecord = {
        id: randomUUID(),
        requestId: updatedReq.id,
        operationType: 'MARK_UNKNOWN',
        sourceOperationId,
        cause: updatedReq.cause,
        scopeType: updatedReq.scopeType,
        scopeRef: updatedReq.scopeRef,
        actorId,
        previousStatus: request.status,
        newStatus: 'UNKNOWN',
        revision: nextRev,
        recoveryEpoch,
        anchorTimestamp: updatedReq.anchorTimestamp,
        purgeStartedAt: updatedReq.purgeStartedAt,
        mainPurgeDeadline: updatedReq.mainPurgeDeadline,
        residualPurgeDeadline: updatedReq.residualPurgeDeadline,
        details: { reason },
        createdAt: now,
      };
      await this.repository.insertReceipt(tx, unknownReceipt);

      await tx.execute(
        `UPDATE deletion_access_barrier
         SET barrier_state = 'UNKNOWN', updated_at = $1
         WHERE request_id = $2::uuid`,
        now,
        updatedReq.id
      );

      const barrierRows = await tx.query<BarrierRow>(
        `SELECT * FROM deletion_access_barrier WHERE request_id = $1::uuid`,
        updatedReq.id
      );

      return {
        request: updatedReq,
        receipt: unknownReceipt,
        barrier: mapBarrierRow(barrierRows[0]),
      };
    });

    this.observabilitySink?.recordBarrierMetric({
      metric: 'BARRIER_UNKNOWN',
      scopeType: request.scopeType,
      cause: request.cause,
      count: 1,
      timestamp: now,
    });

    return res;
  }
}
