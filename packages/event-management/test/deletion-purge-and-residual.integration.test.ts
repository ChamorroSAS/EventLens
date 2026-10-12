import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPrismaClient,
  PrismaTransactions,
  type PrismaClientInstance,
  type SqlTransaction,
  type TransactionRunner,
} from '@eventlens/database';
import {
  DeletionFinalizationAndResidualService,
  type DeletionPurgeAlert,
  DeletionPurgeExecutionService,
  type DeletionRecoveryBarrierPort,
  type DeletionTombstoneAuthorityPort,
  type ExternalAuthorityJournalEntry,
  IrreversibleDeletionIntakeService,
  ManualDeletionWorkflowService,
} from '../src/index.js';

class InMemoryRecoveryBarrierAuthority implements DeletionRecoveryBarrierPort {
  public currentEpoch = 25n;
  private seq = 0n;

  async getRecoveryEpoch(): Promise<bigint> {
    return this.currentEpoch;
  }

  async prepareDeletionBarrier(params: {
    operationId: string;
    scopeType: string;
    scopeRef: string;
    cause: string;
    expectedRevision: bigint;
    recoveryEpoch: bigint;
  }): Promise<{ preparedReceipt: string; sequence: bigint }> {
    this.seq += 1n;
    return {
      preparedReceipt: `prep:${params.operationId}:${this.seq.toString()}`,
      sequence: this.seq,
    };
  }

  async ackDeletionBarrier(): Promise<void> {}

  async prepareCancellationBarrierRelease(params: {
    operationId: string;
    requestId: string;
  }): Promise<{ preparedReceipt: string; sequence: bigint }> {
    this.seq += 1n;
    return {
      preparedReceipt: `prep-rel:${params.operationId}:${this.seq.toString()}`,
      sequence: this.seq,
    };
  }

  async ackCancellationBarrierRelease(): Promise<void> {}
}

describe('Ruta 4 & Ruta 5 — Integration Tests in PostgreSQL 16 (EL-TK-197, EL-TK-195, EL-TK-196, EL-TK-198, EL-TK-199)', () => {
  let db: PrismaClientInstance;
  let runner: TransactionRunner;

  beforeAll(async () => {
    db = createPrismaClient(process.env.DATABASE_URL!);
    runner = new PrismaTransactions(db, 15000);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  beforeEach(async () => {
    await runner.run(async (tx: SqlTransaction) => {
      await tx.execute('DELETE FROM deletion_purge_evidence');
      await tx.execute('DELETE FROM deletion_inventory_manifest');
      await tx.execute('DELETE FROM deletion_authority_tombstone');
      await tx.execute('DELETE FROM deletion_access_barrier');
      await tx.execute('DELETE FROM deletion_receipt');
      await tx.execute('DELETE FROM deletion_request');
    });
  });

  async function seedOrganizerAndEvent(params: {
    organizerId: string;
    eventId: string;
    status: string;
    graceEndsAt?: Date | null;
    purgeStartedAt?: Date | null;
  }): Promise<void> {
    const now = new Date('2026-10-10T10:00:00.000Z');
    const adminId = randomUUID();
    const invitationId = randomUUID();
    const email = `org-${params.organizerId.slice(0, 8)}@eventlens.test`;

    await runner.run(async (tx: SqlTransaction) => {
      await tx.execute(
        `INSERT INTO admin_principal (
           id, identifier, status, auth_revision, provision_procedure, provisioned_by, created_at, updated_at
         ) VALUES ($1::uuid, $2, 'ACTIVE', 1, 'INITIAL_BOOTSTRAP', 'SYSTEM', $3, $3)`,
        adminId,
        `adm-${adminId.slice(0, 8)}@eventlens.internal`,
        now
      );
      await tx.execute(
        `INSERT INTO beta_invitation (
           id, email, email_normalized, token_digest, status, issued_by, created_at, expires_at
         ) VALUES ($1::uuid, $2, $3, $4, 'CONSUMED', $5::uuid, $6, $7)`,
        invitationId,
        email,
        email.toLowerCase(),
        `tok-${invitationId}`,
        adminId,
        now,
        new Date('2026-12-31T00:00:00.000Z')
      );
      await tx.execute(
        `INSERT INTO organizer_account (
           id, email, email_normalized, status, declared_adult, declared_adult_at,
           invitation_id, verified_at, created_at, updated_at
         ) VALUES ($1::uuid, $2, $3, 'ACTIVE', true, $4, $5::uuid, $4, $4, $4)`,
        params.organizerId,
        email,
        email.toLowerCase(),
        now,
        invitationId
      );
      await tx.execute(
        `INSERT INTO event (
           id, organizer_id, name, status, timezone,
           grace_ends_at, purge_started_at,
           uploads_enabled, guest_gallery_enabled,
           created_at, updated_at
         ) VALUES ($1::uuid, $2::uuid, 'Evento Ruta 4-5', $3, 'UTC', $4, $5, true, true, $6, $6)`,
        params.eventId,
        params.organizerId,
        params.status,
        params.graceEndsAt ?? null,
        params.purgeStartedAt ?? null,
        now
      );
    });
  }

  async function seedMediaCatalog(params: {
    mediaRef: string;
    eventRef: string;
    generation: number;
    revision: number;
    status: string;
  }): Promise<void> {
    const jobId = randomUUID();
    const intentId = randomUUID();
    await runner.run(async (tx: SqlTransaction) => {
      await tx.execute(
        `INSERT INTO job_queue (
           id, dedup_key, fingerprint, type, handler_version, resource_ref,
           generation, queue, priority, payload, status, available_at
         ) VALUES ($1::uuid, $2, 'fp', 'MEDIA_INSPECTION', '1', $3, $4, 'q', 1, 'null'::jsonb, 'PENDING', NOW())`,
        jobId,
        `dedup-${jobId}`,
        params.mediaRef,
        params.generation
      );
      await tx.execute(
        `INSERT INTO media_acceptance_intent VALUES ($1, $2, $3, $4, '{}'::jsonb)`,
        intentId,
        params.mediaRef,
        params.generation,
        'e'.repeat(64)
      );
      await tx.execute(
        `INSERT INTO media_catalog VALUES ($1, $2, $3, 'guest-1', $4, $5, $6, '{}'::jsonb, $7::uuid)`,
        params.mediaRef,
        intentId,
        params.eventRef,
        params.generation,
        params.revision,
        params.status,
        jobId
      );
    });
  }

  it('EL-TK-197: persists tombstones and reconciles PITR-restored old DB snapshots with external RecoveryAuthority without shifting purgeStartedAt', async () => {
    const organizerId = randomUUID();
    const eventId = randomUUID();
    await seedOrganizerAndEvent({
      organizerId,
      eventId,
      status: 'CLOSED',
    });

    const journal: ExternalAuthorityJournalEntry[] = [];
    let nextSeq = 1n;

    const authorityPort: DeletionTombstoneAuthorityPort = {
      async getCheckpointStatus() {
        return {
          recoveryEpoch: 25n,
          checkpointIntact: true,
          lastContiguousSequence: BigInt(journal.length),
          hasSequenceGap: false,
        };
      },
      async prepareTombstoneEntry(entry) {
        const seq = nextSeq++;
        journal.push({
          ...entry,
          sequence: seq,
          ackConfirmed: false,
        });
        return { preparedReceipt: `prep-${seq.toString()}`, sequence: seq };
      },
      async ackTombstoneEntry(params) {
        const idx = journal.findIndex((e) => e.sequence === params.sequence);
        if (idx >= 0) {
          journal[idx] = { ...journal[idx], ackConfirmed: true };
        }
      },
      async getJournalEntriesForScope(params) {
        return journal.filter(
          (e) => e.scopeType === params.scopeType && e.scopeRef === params.scopeRef
        );
      },
    };

    const barrierAuthority = new InMemoryRecoveryBarrierAuthority();
    const manualWorkflows = new ManualDeletionWorkflowService(runner, {
      recoveryBarrierPort: barrierAuthority,
    });

    const purgeService = new DeletionPurgeExecutionService({
      runner,
      tombstoneAuthorityPort: authorityPort,
      inventoryPort: {
        async inspectScopeInventoryAndWriters() {
          return { items: [], activeSignedGrantsCount: 0, activeInFlightTransfersCount: 0 };
        },
      },
      storagePurgePort: {
        async deleteAndVerifyItem(p) {
          return {
            itemRef: p.objectKey,
            objectKey: p.objectKey,
            versionId: p.versionId,
            status: 'MISSING_VERIFIED',
          };
        },
      },
    });

    const requestedAt = new Date('2026-10-12T14:00:00.000Z');
    const reqResult = await manualWorkflows.requestManualEventDeletion({
      actorContext: {
        actorType: 'ORGANIZER_HUMAN',
        accountId: organizerId,
        recoveryEpoch: 25n,
      },
      eventId,
      confirmation: true,
      expectedRevision: 1n,
      idempotencyKey: `manual-del-${eventId}`,
      now: requestedAt,
    });

    const originalPurgeStartedAt = reqResult.request.purgeStartedAt;
    await purgeService.recordAndSyncTombstone({
      requestId: reqResult.request.id,
      tombstoneState: 'ACTIVE_BARRIER',
      now: requestedAt,
    });

    // Simulate a PITR restore to a snapshot BEFORE the deletion request existed in SQL:
    // Wipe deletion tables and reset event status back to CLOSED!
    await runner.run(async (tx) => {
      await tx.execute(
        'DELETE FROM deletion_authority_tombstone WHERE request_id = $1::uuid',
        reqResult.request.id
      );
      await tx.execute(
        'DELETE FROM deletion_access_barrier WHERE request_id = $1::uuid',
        reqResult.request.id
      );
      await tx.execute(
        'DELETE FROM deletion_receipt WHERE request_id = $1::uuid',
        reqResult.request.id
      );
      await tx.execute('DELETE FROM deletion_request WHERE id = $1::uuid', reqResult.request.id);
      await tx.execute(
        "UPDATE event SET status = 'CLOSED', purge_started_at = NULL WHERE id = $1::uuid",
        eventId
      );
    });

    // Reconcile scope against external RecoveryAuthority journal after PITR restore
    const reconciled = await purgeService.reconcileScopeWithAuthority({
      scopeType: 'EVENT',
      scopeRef: eventId,
      callerRecoveryEpoch: 25n,
      now: new Date('2026-10-12T16:00:00.000Z'),
    });

    expect(reconciled.admissionAllowed).toBe(false);
    expect(reconciled.reason).toBe('BLOCKED_BY_RESTORED_SNAPSHOT_TOMBSTONE');
    expect(reconciled.reconciledTombstones).toHaveLength(1);
    expect(reconciled.reconciledTombstones[0].purgeStartedAt.toISOString()).toBe(
      originalPurgeStartedAt.toISOString()
    );

    // Verify SQL event was re-fenced as PENDING_DELETION and deletion_request was re-materialized
    const restoredEventRows = await runner.run((tx) =>
      tx.query<{ status: string; purge_started_at: Date }>(
        'SELECT status, purge_started_at FROM event WHERE id = $1::uuid',
        eventId
      )
    );
    expect(restoredEventRows[0].status).toBe('PENDING_DELETION');
    expect(new Date(restoredEventRows[0].purge_started_at).toISOString()).toBe(
      originalPurgeStartedAt.toISOString()
    );
  });

  it('EL-TK-195, EL-TK-196, EL-TK-198 & EL-TK-199: executes full lifecycle from manifest & writer drain -> main purge (+7d UTC) -> DELETED & single quota settlement -> +30d UTC residual verification', async () => {
    const organizerId = randomUUID();
    const eventId = randomUUID();
    const mediaRef = `media-int-${randomUUID()}`;
    await seedOrganizerAndEvent({
      organizerId,
      eventId,
      status: 'CLOSED',
    });
    await seedMediaCatalog({
      mediaRef,
      eventRef: eventId,
      generation: 1,
      revision: 2,
      status: 'QUARANTINED',
    });

    const journal: ExternalAuthorityJournalEntry[] = [];
    let nextSeq = 1n;

    const authorityPort: DeletionTombstoneAuthorityPort = {
      async getCheckpointStatus() {
        return {
          recoveryEpoch: 30n,
          checkpointIntact: true,
          lastContiguousSequence: BigInt(journal.length),
          hasSequenceGap: false,
        };
      },
      async prepareTombstoneEntry(entry) {
        const seq = nextSeq++;
        journal.push({ ...entry, sequence: seq, ackConfirmed: false });
        return { preparedReceipt: `prep-${seq.toString()}`, sequence: seq };
      },
      async ackTombstoneEntry(params) {
        const idx = journal.findIndex((e) => e.sequence === params.sequence);
        if (idx >= 0) journal[idx] = { ...journal[idx], ackConfirmed: true };
      },
      async getJournalEntriesForScope(params) {
        return journal.filter(
          (e) => e.scopeType === params.scopeType && e.scopeRef === params.scopeRef
        );
      },
    };

    const barrierAuthority = new InMemoryRecoveryBarrierAuthority();
    barrierAuthority.currentEpoch = 30n;

    const intakeService = new IrreversibleDeletionIntakeService({
      runner,
      recoveryBarrierPort: barrierAuthority,
    });

    // Ingest quarantine disposition into an irreversible deletion request
    const purgeAnchor = new Date('2026-10-12T18:30:00.000Z');
    const intakeRes = await intakeService.ingestIrreversibleIntent({
      cause: 'QUARANTINE_DISPOSITION',
      ownerModule: 'MOD-003',
      sourceOperationId: `quar-disp-${mediaRef}`,
      producerReceiptId: `quar-rcpt-${mediaRef}`,
      mediaRef,
      eventId,
      purgeIntentId: randomUUID(),
      dispositionConfirmedAt: purgeAnchor,
      dispositionActorRole: 'ADMIN_HUMAN',
      policyRef: 'MOD-008-TRASH-QUARANTINE-PURGE-POLICY-V1',
      expectedGeneration: 1n,
      expectedRevision: 2n,
      recoveryEpoch: 30n,
      actorId: 'admin-reconciler',
      now: purgeAnchor,
    });
    const requestId = intakeRes.request.id;

    // Verify +7d and +30d UTC calendar deadlines preserve exact UTC hour
    expect(intakeRes.request.mainPurgeDeadline.toISOString()).toBe('2026-10-19T18:30:00.000Z');
    expect(intakeRes.request.residualPurgeDeadline.toISOString()).toBe(
      '2026-11-11T18:30:00.000Z'
    );

    const deletedStorageKeys = new Set<string>();
    const alerts: DeletionPurgeAlert[] = [];

    const purgeService = new DeletionPurgeExecutionService({
      runner,
      tombstoneAuthorityPort: authorityPort,
      inventoryPort: {
        async inspectScopeInventoryAndWriters() {
          return {
            items: [
              {
                itemRef: `orig:${mediaRef}`,
                ownerModule: 'MOD-003',
                category: 'ORIGINAL',
                namespace: 'quarantine',
                objectKey: `events/${eventId}/${mediaRef}.jpg`,
                versionId: 'v1',
                multipartUploadId: null,
                generation: 1n,
                sizeBytes: 4_096_000n,
                sha256: 'aaaa',
              },
              {
                itemRef: `thumb:${mediaRef}`,
                ownerModule: 'MOD-003',
                category: 'DERIVATIVE',
                namespace: 'derivatives',
                objectKey: `events/${eventId}/${mediaRef}-thumb.webp`,
                versionId: 'v1',
                multipartUploadId: null,
                generation: 1n,
                sizeBytes: 128_000n,
                sha256: 'bbbb',
              },
            ],
            activeSignedGrantsCount: 0,
            activeInFlightTransfersCount: 0,
          };
        },
      },
      storagePurgePort: {
        async deleteAndVerifyItem(p) {
          deletedStorageKeys.add(`${p.namespace}:${p.objectKey}:${p.versionId}`);
          return {
            itemRef: p.objectKey,
            objectKey: p.objectKey,
            versionId: p.versionId,
            status: 'MISSING_VERIFIED',
          };
        },
      },
      alertSink: {
        emitAlert(a) {
          alerts.push(a);
        },
      },
    });

    let quotaSettlementCount = 0;
    let notificationCount = 0;

    const finalizationService = new DeletionFinalizationAndResidualService({
      runner,
      purgeExecutionService: purgeService,
      tombstoneAuthorityPort: authorityPort,
      quotaSettlementPort: {
        async settleVerifiedDeletionQuota(qReq) {
          quotaSettlementCount += 1;
          return {
            receiptId: `quota-ledger-${requestId}`,
            releasedBytes: qReq.bytesToRelease,
            settledAt: new Date('2026-10-12T19:05:00.000Z'),
            idempotentReplay: quotaSettlementCount > 1,
          };
        },
      },
      notificationIntentPort: {
        async emitDeletionMainPurgedNotification() {
          notificationCount += 1;
          return { notificationIntentId: `notif-${requestId}` };
        },
      },
      residualBackupEvidencePort: {
        async inspectResidualRetention(params) {
          const rotated =
            params.evaluationTime.getTime() >= params.residualPurgeDeadline.getTime();
          return {
            providerVerified: true,
            ordinaryBackupsRotatedPastMainPurge: rotated,
            hasUnknownStagingCopy: false,
            oldestRetainedSnapshotTimestamp: rotated
              ? new Date('2026-10-20T00:00:00.000Z')
              : new Date('2026-10-10T00:00:00.000Z'),
            sanitizedSummary: rotated
              ? 'All ordinary backups rotated past mainPurgedAt'
              : 'Ordinary backups still within 30d retention window',
          };
        },
      },
      alertSink: {
        emitAlert(a) {
          alerts.push(a);
        },
      },
    });

    const workerContext = {
      workerId: 'worker-int-1',
      leaseToken: 'lease-int-1',
      workerFence: 1n,
      recoveryEpoch: 30n,
      leaseExpiresAt: new Date('2026-10-13T00:00:00.000Z'),
    };

    // 1. Prepare manifest and verify writer quiescence (EL-TK-195)
    const manifestRes = await purgeService.prepareVerifiableManifestAndDrainWriters({
      requestId,
      workerContext,
      now: new Date('2026-10-12T19:00:00.000Z'),
    });
    expect(manifestRes.readyForMainPurge).toBe(true);
    expect(manifestRes.manifest.items).toHaveLength(2);

    // 2. Execute physical main purge (EL-TK-196)
    const purgeRes = await purgeService.executeMainPurge({
      requestId,
      manifestId: manifestRes.manifest.id,
      expectedManifestRevision: manifestRes.manifest.manifestRevision,
      workerContext,
      now: new Date('2026-10-12T19:02:00.000Z'),
    });
    expect(purgeRes.outcome).toBe('MAIN_PURGED_VERIFIED');
    expect(deletedStorageKeys.size).toBe(2);

    // 3. Finalize DELETED state and settle quota once (EL-TK-198)
    const finRes1 = await finalizationService.finalizeDeletedStateAndSettleQuota({
      requestId,
      now: new Date('2026-10-12T19:05:00.000Z'),
    });
    expect(finRes1.finalized).toBe(true);
    expect(finRes1.bytesReleased).toBe(4_096_000n);
    expect(finRes1.evidence?.residualPurgeStatus).toBe('PENDING_RESIDUAL');
    expect(quotaSettlementCount).toBe(1);
    expect(notificationCount).toBe(1);

    // Verify media_catalog status in PostgreSQL is now DELETED
    const mediaRows = await runner.run((tx) =>
      tx.query<{ status: string }>(
        'SELECT status FROM media_catalog WHERE media_ref = $1',
        mediaRef
      )
    );
    expect(mediaRows[0].status).toBe('DELETED');

    // Duplicate finalization call is idempotent
    const finRes2 = await finalizationService.finalizeDeletedStateAndSettleQuota({
      requestId,
      now: new Date('2026-10-12T19:06:00.000Z'),
    });
    expect(finRes2.reason).toBe('IDEMPOTENT_ALREADY_FINALIZED');
    expect(quotaSettlementCount).toBe(1);
    expect(notificationCount).toBe(1);

    // 4. Residual check before +30d UTC returns PENDING_WITHIN_WINDOW (never implicit PASS)
    const residualPending = await finalizationService.verifyResidualComplianceAndRestoreProtection({
      requestId,
      callerRecoveryEpoch: 30n,
      now: new Date('2026-10-25T18:30:00.000Z'),
    });
    expect(residualPending.gateStatus).toBe('PENDING_WITHIN_WINDOW');
    expect(residualPending.evidence?.residualPurgeStatus).toBe('PENDING_RESIDUAL');

    // 5. Residual check at +30d UTC (2026-11-11T18:30:00.000Z) with rotated backups passes and completes request
    const residualPass = await finalizationService.verifyResidualComplianceAndRestoreProtection({
      requestId,
      callerRecoveryEpoch: 30n,
      now: new Date('2026-11-11T18:30:00.000Z'),
    });
    expect(residualPass.gateStatus).toBe('PASS_RESIDUAL_VERIFIED');
    expect(residualPass.request.status).toBe('COMPLETED');
    expect(residualPass.evidence?.residualPurgeStatus).toBe('RESIDUAL_VERIFIED');
  });
});
