import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import type { EventAuditSink } from './contracts.js';
import {
  addUtcCalendarDays,
  type DeletionCause,
  type DeletionCoordinationRepository,
  DeletionCoordinationError,
  type DeletionRequestRecord,
  type DeletionScopeType,
  PostgresDeletionCoordinationRepository,
} from './deletion-coordination.js';
import {
  type DeletionInventoryManifestRecord,
  type DeletionPurgeAlertSink,
  type DeletionPurgeEvidenceRecord,
  type DeletionPurgeExecutionService,
  type DeletionTombstoneAuthorityPort,
  type EvidenceRow,
  mapEvidenceRow,
  mapManifestRow,
} from './deletion-purge-execution.js';

// ============================================================================
// MOD-008 — DELETED STATE FINALIZATION, QUOTA SETTLEMENT & +30d UTC RESIDUAL
// (EL-TK-198 & EL-TK-199 / EL-EP-015)
// ============================================================================

export interface QuotaDeletionSettlementRequest {
  readonly settlementIdempotencyKey: string;
  readonly requestId: string;
  readonly scopeType: DeletionScopeType;
  readonly scopeRef: string;
  readonly cause: DeletionCause;
  readonly bytesToRelease: bigint;
  readonly verifiedMainPurgedAt: Date;
}

export interface QuotaDeletionSettlementReceipt {
  readonly receiptId: string;
  readonly releasedBytes: bigint;
  readonly settledAt: Date;
  readonly idempotentReplay: boolean;
}

/**
 * Port to MOD-006 (EL-TK-137) for releasing original storage quota ONLY after
 * physical main purge verification.
 */
export interface QuotaDeletionSettlementPort {
  settleVerifiedDeletionQuota(
    request: QuotaDeletionSettlementRequest
  ): Promise<QuotaDeletionSettlementReceipt>;
}

export interface DeletionCompletedNotificationRequest {
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly scopeType: DeletionScopeType;
  readonly scopeRef: string;
  readonly cause: DeletionCause;
  readonly mainPurgedAt: Date;
  readonly residualPurgeDeadline: Date;
  readonly residualStatus: 'PENDING_RESIDUAL';
}

/**
 * Port to MOD-009 (EL-TK-159) for emitting sanitized deletion completion facts
 * without exposing sensitive media or reverting finalized deletion on email failure.
 */
export interface DeletionNotificationIntentPort {
  emitDeletionMainPurgedNotification(
    request: DeletionCompletedNotificationRequest
  ): Promise<{ readonly notificationIntentId: string }>;
}

export interface FinalizeDeletedStateCommand {
  readonly requestId: string;
  readonly actorId?: string;
  readonly now?: Date;
}

export interface FinalizeDeletedStateResult {
  readonly finalized: boolean;
  readonly reason:
    | 'FINALIZED_AND_QUOTA_SETTLED'
    | 'IDEMPOTENT_ALREADY_FINALIZED'
    | 'BLOCKED_MAIN_PURGE_NOT_VERIFIED'
    | 'BLOCKED_WRITERS_NOT_QUIET';
  readonly request: DeletionRequestRecord;
  readonly evidence: DeletionPurgeEvidenceRecord | null;
  readonly quotaReceiptId: string | null;
  readonly bytesReleased: bigint;
  readonly notificationEmitted: boolean;
  readonly notificationError?: string;
}

export interface ResidualBackupInspectionReport {
  readonly providerVerified: boolean;
  readonly ordinaryBackupsRotatedPastMainPurge: boolean;
  readonly hasUnknownStagingCopy: boolean;
  readonly oldestRetainedSnapshotTimestamp: Date | null;
  readonly sanitizedSummary: string;
}

/**
 * Port to backup/storage retention verifier (EL-TK-172 / EL-TK-174 / EL-TK-199)
 * that inspects ordinary backup retention and staging copies without assuming PASS.
 */
export interface ResidualBackupEvidencePort {
  inspectResidualRetention(params: {
    readonly requestId: string;
    readonly scopeType: DeletionScopeType;
    readonly scopeRef: string;
    readonly purgeStartedAt: Date;
    readonly mainPurgedAt: Date;
    readonly residualPurgeDeadline: Date;
    readonly evaluationTime: Date;
  }): Promise<ResidualBackupInspectionReport>;
}

export interface VerifyResidualComplianceCommand {
  readonly requestId: string;
  readonly callerRecoveryEpoch: bigint;
  readonly actorId?: string;
  readonly now?: Date;
}

export interface VerifyResidualComplianceResult {
  readonly gateStatus: 'PASS_RESIDUAL_VERIFIED' | 'PENDING_WITHIN_WINDOW' | 'FAIL_RESIDUAL_GATE';
  readonly reason:
    | 'ORDINARY_BACKUPS_ROTATED_AND_AUTHORITY_VERIFIED'
    | 'WITHIN_30D_WINDOW_AWAITING_ROTATION'
    | 'PROVIDER_UNVERIFIED_OR_UNKNOWN_STAGING'
    | 'CHECKPOINT_OR_EPOCH_GAP'
    | 'DEADLINE_30D_EXCEEDED_WITHOUT_PROOF'
    | 'MAIN_PURGE_NOT_COMPLETED';
  readonly request: DeletionRequestRecord;
  readonly evidence: DeletionPurgeEvidenceRecord | null;
  readonly calculatedResidualDeadlineUtc: Date;
}

export interface IsolatedRestoreDrillCommand {
  readonly scopeType: DeletionScopeType;
  readonly scopeRef: string;
  readonly callerRecoveryEpoch: bigint;
  readonly now?: Date;
}

export interface IsolatedRestoreDrillResult {
  readonly accessRestricted: boolean;
  readonly reason: string;
  readonly mainPurgedAt: Date | null;
  readonly residualPurgeDeadline: Date | null;
}

export interface DeletionFinalizationAndResidualOptions {
  readonly runner: TransactionRunner;
  readonly repository?: DeletionCoordinationRepository;
  readonly purgeExecutionService: DeletionPurgeExecutionService;
  readonly tombstoneAuthorityPort: DeletionTombstoneAuthorityPort;
  readonly quotaSettlementPort: QuotaDeletionSettlementPort;
  readonly notificationIntentPort?: DeletionNotificationIntentPort;
  readonly residualBackupEvidencePort: ResidualBackupEvidencePort;
  readonly alertSink?: DeletionPurgeAlertSink;
  readonly auditSink?: EventAuditSink;
}

interface ManifestLookupRow {
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

export class DeletionFinalizationAndResidualService {
  private readonly runner: TransactionRunner;
  private readonly repository: DeletionCoordinationRepository;
  private readonly purgeExecutionService: DeletionPurgeExecutionService;
  private readonly tombstoneAuthorityPort: DeletionTombstoneAuthorityPort;
  private readonly quotaSettlementPort: QuotaDeletionSettlementPort;
  private readonly notificationIntentPort?: DeletionNotificationIntentPort;
  private readonly residualBackupEvidencePort: ResidualBackupEvidencePort;
  private readonly alertSink?: DeletionPurgeAlertSink;
  private readonly auditSink?: EventAuditSink;

  constructor(options: DeletionFinalizationAndResidualOptions) {
    this.runner = options.runner;
    this.repository = options.repository ?? new PostgresDeletionCoordinationRepository();
    this.purgeExecutionService = options.purgeExecutionService;
    this.tombstoneAuthorityPort = options.tombstoneAuthorityPort;
    this.quotaSettlementPort = options.quotaSettlementPort;
    this.notificationIntentPort = options.notificationIntentPort;
    this.residualBackupEvidencePort = options.residualBackupEvidencePort;
    this.alertSink = options.alertSink;
    this.auditSink = options.auditSink;
  }

  // --------------------------------------------------------------------------
  // EL-TK-198: Cerrar estados DELETED y liquidar consumo solo con prueba principal
  // --------------------------------------------------------------------------

  async finalizeDeletedStateAndSettleQuota(
    command: FinalizeDeletedStateCommand
  ): Promise<FinalizeDeletedStateResult> {
    const now = command.now ?? new Date();
    const actorId = command.actorId ?? 'SYSTEM_DELETION_FINALIZER';

    // Phase 1: Inspect request, manifest and evidence under lock
    const inspection = await this.runner.run(async (tx: SqlTransaction) => {
      const req = await this.repository.findByIdForUpdate(tx, command.requestId);
      if (!req) {
        throw new DeletionCoordinationError('REQUEST_NOT_FOUND', `Request '${command.requestId}' not found`);
      }

      const evidenceRows = await tx.query<EvidenceRow>(
        `SELECT * FROM deletion_purge_evidence WHERE request_id = $1::uuid FOR UPDATE`,
        req.id
      );
      const evidence = evidenceRows[0] ? mapEvidenceRow(evidenceRows[0]) : null;

      if (!evidence || evidence.mainPurgeStatus !== 'MAIN_PURGED_VERIFIED' || evidence.unknownOrPresentCount > 0) {
        return {
          status: 'MAIN_PURGE_NOT_VERIFIED' as const,
          request: req,
          evidence,
          manifest: null as DeletionInventoryManifestRecord | null,
        };
      }

      const manifestRows = await tx.query<ManifestLookupRow>(
        `SELECT * FROM deletion_inventory_manifest WHERE id = $1::uuid AND request_id = $2::uuid`,
        evidence.manifestId,
        req.id
      );
      const manifest = manifestRows[0] ? mapManifestRow(manifestRows[0]) : null;
      if (!manifest || manifest.writerDrainState !== 'QUIET_VERIFIED') {
        return {
          status: 'WRITERS_NOT_QUIET' as const,
          request: req,
          evidence,
          manifest,
        };
      }

      // Escenario 3: If already finalized and quota settled, check if notification still needs retry
      if (evidence.ownerStateFinalized && evidence.quotaSettled) {
        return {
          status: 'ALREADY_FINALIZED' as const,
          request: req,
          evidence,
          manifest,
        };
      }

      return {
        status: 'READY_TO_FINALIZE' as const,
        request: req,
        evidence,
        manifest,
      };
    });

    if (inspection.status === 'MAIN_PURGE_NOT_VERIFIED') {
      return {
        finalized: false,
        reason: 'BLOCKED_MAIN_PURGE_NOT_VERIFIED',
        request: inspection.request,
        evidence: inspection.evidence,
        quotaReceiptId: null,
        bytesReleased: 0n,
        notificationEmitted: false,
      };
    }

    if (inspection.status === 'WRITERS_NOT_QUIET') {
      return {
        finalized: false,
        reason: 'BLOCKED_WRITERS_NOT_QUIET',
        request: inspection.request,
        evidence: inspection.evidence,
        quotaReceiptId: null,
        bytesReleased: 0n,
        notificationEmitted: false,
      };
    }

    const { request, manifest } = inspection;
    const currentEvidence = inspection.evidence!;

    // Compute original bytes to release from verified manifest items (originals count toward ledger quota)
    const originalBytesToRelease = manifest.items
      .filter((item) => item.category === 'ORIGINAL')
      .reduce((acc, item) => acc + item.sizeBytes, 0n);

    const verifiedMainPurgedAt = currentEvidence.mainPurgedAt ?? request.mainPurgedAt ?? now;

    // Phase 2: Settle quota exactly once via idempotent key if not settled yet
    let quotaReceiptId = currentEvidence.quotaSettlementReceiptId;
    let releasedBytes = currentEvidence.bytesReleased;

    if (!currentEvidence.quotaSettled) {
      const settlementReceipt = await this.quotaSettlementPort.settleVerifiedDeletionQuota({
        settlementIdempotencyKey: `quota-settle:${request.id}`,
        requestId: request.id,
        scopeType: request.scopeType,
        scopeRef: request.scopeRef,
        cause: request.cause,
        bytesToRelease: originalBytesToRelease,
        verifiedMainPurgedAt,
      });
      quotaReceiptId = settlementReceipt.receiptId;
      releasedBytes = settlementReceipt.releasedBytes;
    }

    // Phase 3: Commit owner DELETED state transition and quota settlement state in SQL
    // Keep residualPurgeStatus explicitly 'PENDING_RESIDUAL' (never claim instant backup deletion)
    const finalizedState = await this.runner.run(async (tx: SqlTransaction) => {
      const lockedReq = await this.repository.findByIdForUpdate(tx, request.id);
      if (!lockedReq) {
        throw new DeletionCoordinationError('REQUEST_NOT_FOUND', 'Request disappeared');
      }

      const lockedEvRows = await tx.query<EvidenceRow>(
        `SELECT * FROM deletion_purge_evidence WHERE request_id = $1::uuid FOR UPDATE`,
        request.id
      );
      const lockedEv = mapEvidenceRow(lockedEvRows[0]);

      if (!lockedEv.ownerStateFinalized) {
        await this.mutateOwnerResourceToDeleted(tx, lockedReq, now);
      }

      await tx.execute(
        `UPDATE deletion_purge_evidence
         SET owner_state_finalized = true,
             quota_settled = true,
             quota_settlement_receipt_id = COALESCE(quota_settlement_receipt_id, $1),
             bytes_released = CASE WHEN quota_settled THEN bytes_released ELSE $2::bigint END,
             main_purged_at = COALESCE(main_purged_at, $3),
             updated_at = $4
         WHERE request_id = $5::uuid`,
        quotaReceiptId,
        releasedBytes,
        verifiedMainPurgedAt,
        now,
        request.id
      );

      const updatedEvRows = await tx.query<EvidenceRow>(
        `SELECT * FROM deletion_purge_evidence WHERE request_id = $1::uuid`,
        request.id
      );
      const updatedReq = (await this.repository.findById(tx, request.id))!;

      return {
        wasAlreadyFinalized: lockedEv.ownerStateFinalized && lockedEv.quotaSettled,
        request: updatedReq,
        evidence: mapEvidenceRow(updatedEvRows[0]),
      };
    });

    // Phase 4: Emit notification fact (EL-TK-159) isolated from SQL transaction so email failure
    // never rolls back DELETED state or causes double quota settlement
    let notificationEmitted = finalizedState.evidence.notificationEmitted;
    let notificationError: string | undefined;

    if (!notificationEmitted && this.notificationIntentPort) {
      try {
        const notifResult = await this.notificationIntentPort.emitDeletionMainPurgedNotification({
          idempotencyKey: `deletion-main-purged-notif:${request.id}`,
          requestId: request.id,
          scopeType: request.scopeType,
          scopeRef: request.scopeRef,
          cause: request.cause,
          mainPurgedAt: verifiedMainPurgedAt,
          residualPurgeDeadline: request.residualPurgeDeadline,
          residualStatus: 'PENDING_RESIDUAL',
        });

        await this.runner.run(async (tx: SqlTransaction) => {
          await tx.execute(
            `UPDATE deletion_purge_evidence
             SET notification_emitted = true,
                 notification_intent_id = COALESCE(notification_intent_id, $1),
                 updated_at = $2
             WHERE request_id = $3::uuid`,
            notifResult.notificationIntentId,
            now,
            request.id
          );
        });
        notificationEmitted = true;
      } catch (err) {
        notificationError = (err as Error).message;
      }
    }

    const finalEvidence = await this.runner.run(async (tx: SqlTransaction) => {
      const rows = await tx.query<EvidenceRow>(
        `SELECT * FROM deletion_purge_evidence WHERE request_id = $1::uuid`,
        request.id
      );
      return mapEvidenceRow(rows[0]);
    });

    await this.auditSink?.record({
      id: randomUUID(),
      procedure: 'DELETION_FINALIZED',
      actorId,
      targetIdentifier: `${request.scopeType}:${request.scopeRef}`,
      result: 'SUCCESS',
      details: `Finalized DELETED state for request=${request.id} mainPurgedAt=${verifiedMainPurgedAt.toISOString()} quotaReceipt=${finalEvidence.quotaSettlementReceiptId ?? 'NONE'} residual=${finalEvidence.residualPurgeStatus}`,
      timestamp: now,
    });

    return {
      finalized: true,
      reason:
        inspection.status === 'ALREADY_FINALIZED' && finalizedState.wasAlreadyFinalized
          ? 'IDEMPOTENT_ALREADY_FINALIZED'
          : 'FINALIZED_AND_QUOTA_SETTLED',
      request: finalizedState.request,
      evidence: finalEvidence,
      quotaReceiptId: finalEvidence.quotaSettlementReceiptId,
      bytesReleased: finalEvidence.bytesReleased,
      notificationEmitted: finalEvidence.notificationEmitted,
      notificationError,
    };
  }

  // --------------------------------------------------------------------------
  // EL-TK-199: Verificar residual y restauraciones hasta deadline UTC +30 días
  // --------------------------------------------------------------------------

  async verifyResidualComplianceAndRestoreProtection(
    command: VerifyResidualComplianceCommand
  ): Promise<VerifyResidualComplianceResult> {
    const now = command.now ?? new Date();
    const actorId = command.actorId ?? 'SYSTEM_RECOVERY_OPERATOR';

    const req = await this.runner.run((tx) => this.repository.findById(tx, command.requestId));
    if (!req) {
      throw new DeletionCoordinationError('REQUEST_NOT_FOUND', `Request '${command.requestId}' not found`);
    }

    // Rule: +30 calendar days UTC is ALWAYS measured from the original purgeStartedAt anchor,
    // regardless of worker delays!
    const calculatedResidualDeadlineUtc = addUtcCalendarDays(req.purgeStartedAt, 30);

    const evidence = await this.runner.run(async (tx: SqlTransaction) => {
      const rows = await tx.query<EvidenceRow>(
        `SELECT * FROM deletion_purge_evidence WHERE request_id = $1::uuid`,
        req.id
      );
      return rows[0] ? mapEvidenceRow(rows[0]) : null;
    });

    if (
      !evidence ||
      evidence.mainPurgeStatus !== 'MAIN_PURGED_VERIFIED' ||
      !evidence.ownerStateFinalized ||
      !evidence.mainPurgedAt
    ) {
      return {
        gateStatus: 'FAIL_RESIDUAL_GATE',
        reason: 'MAIN_PURGE_NOT_COMPLETED',
        request: req,
        evidence,
        calculatedResidualDeadlineUtc,
      };
    }

    // Step 1: Check RecoveryAuthority checkpoint integrity and epoch
    let checkpointIntact = false;
    let hasSequenceGap = true;
    let authorityEpoch = -1n;

    try {
      const cp = await this.tombstoneAuthorityPort.getCheckpointStatus();
      checkpointIntact = cp.checkpointIntact;
      hasSequenceGap = cp.hasSequenceGap;
      authorityEpoch = cp.recoveryEpoch;
    } catch {
      checkpointIntact = false;
    }

    if (
      !checkpointIntact ||
      hasSequenceGap ||
      BigInt(command.callerRecoveryEpoch) !== authorityEpoch
    ) {
      const updatedEv = await this.persistResidualGateOutcome(
        req.id,
        'RESIDUAL_FAILED_GATE',
        null,
        {
          gateResult: 'FAIL',
          reason: 'CHECKPOINT_OR_EPOCH_GAP',
          evaluatedAt: now.toISOString(),
        },
        now
      );

      await this.alertSink?.emitAlert({
        alertType: 'RESIDUAL_GATE_FAILED',
        requestId: req.id,
        scopeType: req.scopeType,
        scopeRef: req.scopeRef,
        cause: req.cause,
        details: 'Residual verification blocked by RecoveryAuthority checkpoint corruption or sequence/epoch gap',
        timestamp: now,
      });

      return {
        gateStatus: 'FAIL_RESIDUAL_GATE',
        reason: 'CHECKPOINT_OR_EPOCH_GAP',
        request: req,
        evidence: updatedEv,
        calculatedResidualDeadlineUtc,
      };
    }

    // Step 2: Inspect backup/storage retention evidence via adapter
    const backupReport = await this.residualBackupEvidencePort.inspectResidualRetention({
      requestId: req.id,
      scopeType: req.scopeType,
      scopeRef: req.scopeRef,
      purgeStartedAt: req.purgeStartedAt,
      mainPurgedAt: evidence.mainPurgedAt,
      residualPurgeDeadline: calculatedResidualDeadlineUtc,
      evaluationTime: now,
    });

    // Escenario 3: Unverified provider or unknown staging copy -> FAIL gate, NEVER implicit PASS
    if (!backupReport.providerVerified || backupReport.hasUnknownStagingCopy) {
      const updatedEv = await this.persistResidualGateOutcome(
        req.id,
        'RESIDUAL_FAILED_GATE',
        null,
        {
          gateResult: 'FAIL',
          reason: 'PROVIDER_UNVERIFIED_OR_UNKNOWN_STAGING',
          providerVerified: backupReport.providerVerified,
          hasUnknownStagingCopy: backupReport.hasUnknownStagingCopy,
          sanitizedSummary: backupReport.sanitizedSummary,
          evaluatedAt: now.toISOString(),
        },
        now
      );

      await this.alertSink?.emitAlert({
        alertType: 'RESIDUAL_GATE_FAILED',
        requestId: req.id,
        scopeType: req.scopeType,
        scopeRef: req.scopeRef,
        cause: req.cause,
        details: `Residual verification failed: providerVerified=${backupReport.providerVerified}, unknownStaging=${backupReport.hasUnknownStagingCopy}`,
        timestamp: now,
      });

      return {
        gateStatus: 'FAIL_RESIDUAL_GATE',
        reason: 'PROVIDER_UNVERIFIED_OR_UNKNOWN_STAGING',
        request: req,
        evidence: updatedEv,
        calculatedResidualDeadlineUtc,
      };
    }

    const deadlineReachedOrPassed = now.getTime() >= calculatedResidualDeadlineUtc.getTime();

    if (!backupReport.ordinaryBackupsRotatedPastMainPurge) {
      if (deadlineReachedOrPassed) {
        // Deadline +30d UTC reached/exceeded without ordinary backup rotation proof -> FAIL gate + alert
        const updatedEv = await this.persistResidualGateOutcome(
          req.id,
          'RESIDUAL_FAILED_GATE',
          null,
          {
            gateResult: 'FAIL',
            reason: 'DEADLINE_30D_EXCEEDED_WITHOUT_PROOF',
            calculatedResidualDeadlineUtc: calculatedResidualDeadlineUtc.toISOString(),
            oldestRetainedSnapshotTimestamp:
              backupReport.oldestRetainedSnapshotTimestamp?.toISOString() ?? null,
            sanitizedSummary: backupReport.sanitizedSummary,
            evaluatedAt: now.toISOString(),
          },
          now
        );

        await this.alertSink?.emitAlert({
          alertType: 'RESIDUAL_GATE_FAILED',
          requestId: req.id,
          scopeType: req.scopeType,
          scopeRef: req.scopeRef,
          cause: req.cause,
          details: `Residual +30d UTC deadline (${calculatedResidualDeadlineUtc.toISOString()}) reached without ordinary backup expiration proof`,
          timestamp: now,
        });

        return {
          gateStatus: 'FAIL_RESIDUAL_GATE',
          reason: 'DEADLINE_30D_EXCEEDED_WITHOUT_PROOF',
          request: req,
          evidence: updatedEv,
          calculatedResidualDeadlineUtc,
        };
      }

      // Within 30d window and ordinary backups still rotating -> PENDING_RESIDUAL (never implicit PASS)
      const updatedEv = await this.persistResidualGateOutcome(
        req.id,
        'PENDING_RESIDUAL',
        null,
        {
          gateResult: 'PENDING',
          reason: 'WITHIN_30D_WINDOW_AWAITING_ROTATION',
          calculatedResidualDeadlineUtc: calculatedResidualDeadlineUtc.toISOString(),
          sanitizedSummary: backupReport.sanitizedSummary,
          evaluatedAt: now.toISOString(),
        },
        now
      );

      return {
        gateStatus: 'PENDING_WITHIN_WINDOW',
        reason: 'WITHIN_30D_WINDOW_AWAITING_ROTATION',
        request: req,
        evidence: updatedEv,
        calculatedResidualDeadlineUtc,
      };
    }

    // Escenario 2: At/after +30d UTC (or with verified ordinary backup rotation + tombstone intact),
    // verify that all ordinary snapshots prior to mainPurgedAt have expired and finalize RESIDUAL_VERIFIED
    if (!deadlineReachedOrPassed) {
      // Even if provider rotated early, +30d UTC window check keeps explicit pending until +30d UTC checkpoint or records pending
      const updatedEv = await this.persistResidualGateOutcome(
        req.id,
        'PENDING_RESIDUAL',
        null,
        {
          gateResult: 'PENDING',
          reason: 'WITHIN_30D_WINDOW_AWAITING_ROTATION',
          calculatedResidualDeadlineUtc: calculatedResidualDeadlineUtc.toISOString(),
          sanitizedSummary: backupReport.sanitizedSummary,
          evaluatedAt: now.toISOString(),
        },
        now
      );

      return {
        gateStatus: 'PENDING_WITHIN_WINDOW',
        reason: 'WITHIN_30D_WINDOW_AWAITING_ROTATION',
        request: req,
        evidence: updatedEv,
        calculatedResidualDeadlineUtc,
      };
    }

    const completed = await this.runner.run(async (tx: SqlTransaction) => {
      const lockedReq = await this.repository.findByIdForUpdate(tx, req.id);
      if (!lockedReq) {
        throw new DeletionCoordinationError('REQUEST_NOT_FOUND', 'Request disappeared');
      }

      const nextRev = lockedReq.currentRevision + 1n;
      await tx.execute(
        `UPDATE deletion_request
         SET status = 'COMPLETED',
             current_revision = $1::bigint,
             completed_at = COALESCE(completed_at, $2),
             updated_at = $2
         WHERE id = $3::uuid`,
        nextRev,
        now,
        req.id
      );

      await this.repository.insertReceipt(tx, {
        id: randomUUID(),
        requestId: req.id,
        operationType: 'RESIDUAL_VERIFIED',
        sourceOperationId: `residual-complete:${req.id}`,
        cause: req.cause,
        scopeType: req.scopeType,
        scopeRef: req.scopeRef,
        actorId,
        previousStatus: lockedReq.status,
        newStatus: 'COMPLETED',
        revision: nextRev,
        recoveryEpoch: authorityEpoch,
        anchorTimestamp: req.anchorTimestamp,
        purgeStartedAt: req.purgeStartedAt,
        mainPurgeDeadline: req.mainPurgeDeadline,
        residualPurgeDeadline: calculatedResidualDeadlineUtc,
        details: {
          mainPurgedAt: evidence.mainPurgedAt?.toISOString() ?? null,
          residualVerifiedAt: now.toISOString(),
          oldestRetainedSnapshotTimestamp:
            backupReport.oldestRetainedSnapshotTimestamp?.toISOString() ?? null,
        },
        createdAt: now,
      });

      const updatedReq = (await this.repository.findById(tx, req.id))!;
      return updatedReq;
    });

    const updatedEv = await this.persistResidualGateOutcome(
      req.id,
      'RESIDUAL_VERIFIED',
      now,
      {
        gateResult: 'PASS',
        reason: 'ORDINARY_BACKUPS_ROTATED_AND_AUTHORITY_VERIFIED',
        purgeStartedAt: req.purgeStartedAt.toISOString(),
        mainPurgedAt: evidence.mainPurgedAt.toISOString(),
        calculatedResidualDeadlineUtc: calculatedResidualDeadlineUtc.toISOString(),
        residualVerifiedAt: now.toISOString(),
        oldestRetainedSnapshotTimestamp:
          backupReport.oldestRetainedSnapshotTimestamp?.toISOString() ?? null,
        sanitizedSummary: backupReport.sanitizedSummary,
      },
      now
    );

    await this.purgeExecutionService.recordAndSyncTombstone({
      requestId: req.id,
      tombstoneState: 'RESIDUAL_COMPLETED',
      now,
    });

    await this.auditSink?.record({
      id: randomUUID(),
      procedure: 'RESIDUAL_COMPLIANCE_VERIFIED',
      actorId,
      targetIdentifier: `${req.scopeType}:${req.scopeRef}`,
      result: 'SUCCESS',
      details: `Residual +30d UTC verified for request=${req.id} purgeStartedAt=${req.purgeStartedAt.toISOString()} mainPurgedAt=${evidence.mainPurgedAt.toISOString()} residualDeadline=${calculatedResidualDeadlineUtc.toISOString()}`,
      timestamp: now,
    });

    return {
      gateStatus: 'PASS_RESIDUAL_VERIFIED',
      reason: 'ORDINARY_BACKUPS_ROTATED_AND_AUTHORITY_VERIFIED',
      request: completed,
      evidence: updatedEv,
      calculatedResidualDeadlineUtc,
    };
  }

  /**
   * EL-TK-199 Escenario 1:
   * Simulates/evaluates an old backup restored in an isolated environment attempting
   * to access a purged resource; reconciles with RecoveryAuthority tombstones and
   * enforces access restriction so purged content is never reactivated.
   */
  async verifyIsolatedRestoreAccessRestricted(
    command: IsolatedRestoreDrillCommand
  ): Promise<IsolatedRestoreDrillResult> {
    const reconciliation = await this.purgeExecutionService.reconcileScopeWithAuthority({
      scopeType: command.scopeType,
      scopeRef: command.scopeRef,
      callerRecoveryEpoch: command.callerRecoveryEpoch,
      now: command.now,
    });

    const latestTombstone =
      reconciliation.reconciledTombstones[reconciliation.reconciledTombstones.length - 1] ?? null;

    return {
      accessRestricted: !reconciliation.admissionAllowed,
      reason: reconciliation.reason,
      mainPurgedAt: latestTombstone?.mainPurgedAt ?? null,
      residualPurgeDeadline: latestTombstone?.residualPurgeDeadline ?? null,
    };
  }

  private async mutateOwnerResourceToDeleted(
    tx: SqlTransaction,
    req: DeletionRequestRecord,
    now: Date
  ): Promise<void> {
    if (req.scopeType === 'ACCOUNT') {
      await tx.execute(
        `UPDATE organizer_account
         SET status = 'DELETED',
             updated_at = $1
         WHERE id = $2::uuid`,
        now,
        req.scopeRef
      );
      await tx.execute(
        `UPDATE event
         SET status = 'DELETED',
             updated_at = $1
         WHERE organizer_id = $2::uuid`,
        now,
        req.scopeRef
      );
      await tx.execute(
        `UPDATE media_catalog
         SET status = 'DELETED',
             revision = revision + 1
         WHERE event_ref IN (SELECT id::text FROM event WHERE organizer_id = $1::uuid)`,
        req.scopeRef
      );
    } else if (req.scopeType === 'EVENT') {
      await tx.execute(
        `UPDATE event
         SET status = 'DELETED',
             updated_at = $1
         WHERE id = $2::uuid`,
        now,
        req.scopeRef
      );
      await tx.execute(
        `UPDATE media_catalog
         SET status = 'DELETED',
             revision = revision + 1
         WHERE event_ref = $1`,
        req.scopeRef
      );
    } else if (req.scopeType === 'MEDIA') {
      await tx.execute(
        `UPDATE media_catalog
         SET status = 'DELETED',
             revision = revision + 1
         WHERE media_ref = $1`,
        req.scopeRef
      );
    }
  }

  private async persistResidualGateOutcome(
    requestId: string,
    residualStatus: 'PENDING_RESIDUAL' | 'RESIDUAL_VERIFIED' | 'RESIDUAL_FAILED_GATE',
    residualVerifiedAt: Date | null,
    residualEvidence: Record<string, unknown>,
    now: Date
  ): Promise<DeletionPurgeEvidenceRecord> {
    return this.runner.run(async (tx: SqlTransaction) => {
      await tx.execute(
        `UPDATE deletion_purge_evidence
         SET residual_purge_status = $1,
             residual_verified_at = COALESCE($2, residual_verified_at),
             residual_evidence_json = $3,
             updated_at = $4
         WHERE request_id = $5::uuid`,
        residualStatus,
        residualVerifiedAt,
        JSON.stringify(residualEvidence),
        now,
        requestId
      );

      const rows = await tx.query<EvidenceRow>(
        `SELECT * FROM deletion_purge_evidence WHERE request_id = $1::uuid`,
        requestId
      );
      return mapEvidenceRow(rows[0]);
    });
  }
}
