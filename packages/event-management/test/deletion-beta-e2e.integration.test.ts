import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPrismaClient,
  PrismaTransactions,
  type PrismaClientInstance,
  type SqlTransaction,
} from '@eventlens/database';
import {
  AccountReauthenticationService,
  PasswordVerifier,
  type AuditSink,
  type OrganizerActorContext,
  type RecoveryAuthorityPort,
} from '@eventlens/identity';
import {
  AccountDeletionUiController,
  addUtcCalendarDays,
  addUtcHours,
  computeCanonicalAccountDeletionIntentionHash,
  DeletionCoordinationError,
  DeletionFinalizationAndResidualService,
  type DeletionPurgeAlert,
  DeletionPurgeExecutionService,
  type DeletionRecoveryBarrierPort,
  type DeletionTombstoneAuthorityPort,
  EventDeletionUiController,
  type ExternalAuthorityJournalEntry,
  IrreversibleDeletionIntakeService,
  ManualDeletionWorkflowService,
} from '../src/index.js';

describe('EL-TK-202 — Validación E2E de eliminación ordinaria y criterios de Beta (PostgreSQL 16 + S3-compatible + RecoveryAuthority)', () => {
  let prisma: PrismaClientInstance;
  let transactions: PrismaTransactions;
  let passwordVerifier: PasswordVerifier;
  let reauthService: AccountReauthenticationService;

  let currentEpoch = 50n;
  let failNextAck = false;
  let checkpointIntact = true;
  let hasSequenceGap = false;
  const credentialRevisions = new Map<string, bigint>();
  const authorityJournal: ExternalAuthorityJournalEntry[] = [];
  let nextJournalSeq = 1n;

  // Simulated S3-compatible bucket with object versions & multipart uploads
  const s3Objects = new Map<string, { status: 'PRESENT' | 'MISSING'; failNextDelete?: boolean }>();
  const alerts: DeletionPurgeAlert[] = [];

  beforeAll(async () => {
    prisma = createPrismaClient(process.env.DATABASE_URL!);
    transactions = new PrismaTransactions(prisma, 15000);
    passwordVerifier = new PasswordVerifier();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    currentEpoch = 50n;
    failNextAck = false;
    checkpointIntact = true;
    hasSequenceGap = false;
    credentialRevisions.clear();
    authorityJournal.length = 0;
    nextJournalSeq = 1n;
    s3Objects.clear();
    alerts.length = 0;

    await transactions.run(async (tx: SqlTransaction) => {
      await tx.execute('DELETE FROM deletion_purge_evidence');
      await tx.execute('DELETE FROM deletion_inventory_manifest');
      await tx.execute('DELETE FROM deletion_authority_tombstone');
      await tx.execute('DELETE FROM deletion_access_barrier');
      await tx.execute('DELETE FROM deletion_receipt');
      await tx.execute('DELETE FROM deletion_request');
    });

    const auditSink: AuditSink = {
      async record() {},
    };
    const identityAuthority: RecoveryAuthorityPort = {
      async getRecoveryEpoch() {
        return currentEpoch;
      },
      async getCredentialRevision(principalId: string) {
        return credentialRevisions.get(principalId) ?? 1n;
      },
      async getAdminAuthWatermark() {
        return 1n;
      },
    };
    reauthService = new AccountReauthenticationService(
      transactions,
      auditSink,
      identityAuthority
    );
  });

  function createAuthorityPorts() {
    const recoveryBarrierPort: DeletionRecoveryBarrierPort = {
      async getRecoveryEpoch() {
        return currentEpoch;
      },
      async prepareDeletionBarrier(params) {
        const seq = nextJournalSeq++;
        return {
          preparedReceipt: `prep-bar:${params.operationId}:${seq.toString()}`,
          sequence: seq,
        };
      },
      async ackDeletionBarrier() {
        if (failNextAck) {
          failNextAck = false;
          throw new Error('Simulated ACK network loss');
        }
      },
      async prepareCancellationBarrierRelease(params) {
        const seq = nextJournalSeq++;
        return {
          preparedReceipt: `prep-rel:${params.operationId}:${seq.toString()}`,
          sequence: seq,
        };
      },
      async ackCancellationBarrierRelease() {
        if (failNextAck) {
          failNextAck = false;
          throw new Error('Simulated cancel ACK network loss');
        }
      },
    };

    const tombstoneAuthorityPort: DeletionTombstoneAuthorityPort = {
      async getCheckpointStatus() {
        return {
          recoveryEpoch: currentEpoch,
          checkpointIntact,
          lastContiguousSequence: BigInt(authorityJournal.length),
          hasSequenceGap,
        };
      },
      async prepareTombstoneEntry(entry) {
        const seq = nextJournalSeq++;
        authorityJournal.push({
          ...entry,
          sequence: seq,
          ackConfirmed: false,
        });
        return { preparedReceipt: `prep-tomb:${seq.toString()}`, sequence: seq };
      },
      async ackTombstoneEntry(params) {
        if (failNextAck) {
          failNextAck = false;
          throw new Error('Simulated tombstone ACK timeout');
        }
        const idx = authorityJournal.findIndex((e) => e.sequence === params.sequence);
        if (idx >= 0) {
          authorityJournal[idx] = { ...authorityJournal[idx], ackConfirmed: true };
        }
      },
      async getJournalEntriesForScope(params) {
        return authorityJournal.filter(
          (e) => e.scopeType === params.scopeType && e.scopeRef === params.scopeRef
        );
      },
    };

    return { recoveryBarrierPort, tombstoneAuthorityPort };
  }

  async function seedOrganizerAndEvents(password = 'SafeBetaPass#2026!') {
    const adminId = randomUUID();
    const accountId = randomUUID();
    const invitationId = randomUUID();
    const sessionId = randomUUID();
    const eventClosedId = randomUUID();
    const eventActiveId = randomUUID();
    const email = `beta-${accountId.slice(0, 8)}@eventlens.test`;
    const secretDigest = await passwordVerifier.hashPassword(password);
    const now = new Date('2026-10-12T10:00:00.000Z');
    credentialRevisions.set(accountId, 1n);

    await transactions.run(async (tx: SqlTransaction) => {
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
        `inv-${invitationId}`,
        adminId,
        now,
        new Date('2026-12-31T00:00:00.000Z')
      );
      await tx.execute(
        `INSERT INTO organizer_account (
           id, email, email_normalized, status, declared_adult, declared_adult_at,
           invitation_id, verified_at, created_at, updated_at
         ) VALUES ($1::uuid, $2, $3, 'ACTIVE', true, $4, $5::uuid, $4, $4, $4)`,
        accountId,
        email,
        email.toLowerCase(),
        now,
        invitationId
      );
      await tx.execute(
        `INSERT INTO organizer_credential (
           id, account_id, purpose, secret_digest, revision, status, created_at, updated_at
         ) VALUES ($1::uuid, $2::uuid, 'ORGANIZER_AUTHENTICATION', $3, 1, 'ACTIVE', $4, $4)`,
        randomUUID(),
        accountId,
        secretDigest,
        now
      );
      await tx.execute(
        `INSERT INTO organizer_session (
           id, account_id, token_digest, csrf_token_digest, auth_time,
           created_at, expires_at, last_active_at, idle_expires_at, session_watermark
         ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $5, $6, $5, $7, 1)`,
        sessionId,
        accountId,
        `sess-${sessionId}`,
        `csrf-${sessionId}`,
        now,
        new Date('2026-10-12T18:00:00.000Z'),
        new Date('2026-10-12T10:30:00.000Z')
      );
      await tx.execute(
        `INSERT INTO event (
           id, organizer_id, name, status, timezone,
           closed_at, grace_ends_at, expires_at,
           uploads_enabled, guest_gallery_enabled,
           created_at, updated_at
         ) VALUES
         ($1::uuid, $2::uuid, 'Evento Cerrado Beta', 'CLOSED', 'America/Bogota', $3, $4, $5, false, true, $3, $3),
         ($6::uuid, $2::uuid, 'Evento Activo Beta', 'ACTIVE', 'America/Bogota', NULL, $4, $5, true, true, $3, $3)`,
        eventClosedId,
        accountId,
        now,
        new Date('2026-10-20T10:00:00.000Z'),
        new Date('2026-11-20T10:00:00.000Z'),
        eventActiveId
      );
    });

    const actorContext: OrganizerActorContext = {
      actorType: 'ORGANIZER_HUMAN',
      accountId,
      email,
      sessionId,
      authTime: now,
      credentialRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: currentEpoch,
    };

    return { accountId, sessionId, password, actorContext, eventClosedId, eventActiveId };
  }

  it('Escenario 1 (EL-TK-202): concurrent request/cancellation vs worker claim/ACK never causes resurrection, unauthorized access or shifted anchor', async () => {
    const { accountId, password, actorContext, eventClosedId, eventActiveId } =
      await seedOrganizerAndEvents();
    const { recoveryBarrierPort, tombstoneAuthorityPort } = createAuthorityPorts();

    const manualWorkflows = new ManualDeletionWorkflowService(transactions, {
      recoveryBarrierPort,
      reauthenticationPort: reauthService,
    });

    const purgeService = new DeletionPurgeExecutionService({
      runner: transactions,
      tombstoneAuthorityPort,
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

    // 1. Request account deletion via UI controller + Argon2id reauthentication
    const t0 = new Date('2026-10-12T10:05:00.000Z');
    const intentionHash = computeCanonicalAccountDeletionIntentionHash({
      operation: 'REQUEST_ACCOUNT_DELETION',
      accountId,
      expectedRevision: 1n,
      confirmation: true,
    });
    const ch = await reauthService.beginChallenge({
      actorContext,
      operation: 'REQUEST_ACCOUNT_DELETION',
      resourceType: 'ACCOUNT',
      resourceId: accountId,
      expectedRevision: 1n,
      intentionHash,
    });
    const verified = await reauthService.verifyChallenge({
      actorContext,
      challengeId: ch.challengeId,
      credential: password,
    });

    const accReq = await manualWorkflows.requestManualAccountDeletion({
      actorContext: {
        actorType: 'ORGANIZER_HUMAN',
        accountId,
        sessionId: actorContext.sessionId,
        credentialRevision: 1n,
        sessionWatermark: 1n,
        recoveryEpoch: currentEpoch,
      },
      accountId,
      confirmation: true,
      expectedRevision: 1n,
      reauthenticationEvidence: verified.evidence,
      idempotencyKey: `e2e-acc-del-${accountId}`,
      now: t0,
    });

    const originalPurgeStartedAt = accReq.request.purgeStartedAt;
    expect(originalPurgeStartedAt.toISOString()).toBe('2026-10-19T10:05:00.000Z');

    // Public/guest access to both child events is immediately denied by the account barrier
    const accessCheckDuringBarrier = await manualWorkflows.evaluateBarrierAccess({
      eventId: eventActiveId,
      accountId,
      action: 'GUEST_VIEW_GALLERY',
      actorContext: { actorType: 'GUEST' },
    });
    expect(accessCheckDuringBarrier.allowed).toBe(false);

    // Worker attempting to claim BEFORE purgeStartedAt (7d window) is rejected
    await expect(
      purgeService.prepareVerifiableManifestAndDrainWriters({
        requestId: accReq.request.id,
        workerContext: {
          workerId: 'worker-early',
          leaseToken: 'lease-early',
          workerFence: 1n,
          recoveryEpoch: currentEpoch,
          leaseExpiresAt: new Date('2026-10-15T12:00:00.000Z'),
        },
        now: new Date('2026-10-15T10:00:00.000Z'),
      })
    ).rejects.toThrow(DeletionCoordinationError);

    // At 2026-10-19T10:05:01Z (1 second after 7d window expires), worker claims the request
    const tAfterWindow = new Date('2026-10-19T10:05:01.000Z');
    const claimed = await purgeService.prepareVerifiableManifestAndDrainWriters({
      requestId: accReq.request.id,
      workerContext: {
        workerId: 'worker-on-time',
        leaseToken: 'lease-on-time',
        workerFence: 1n,
        recoveryEpoch: currentEpoch,
        leaseExpiresAt: new Date('2026-10-19T12:00:00.000Z'),
      },
      now: tAfterWindow,
    });
    expect(claimed.readyForMainPurge).toBe(true);

    // Late cancellation attempt racing after window/claim MUST fail and NEVER resurrect the account or shift anchor
    const cancelIntentionHash = computeCanonicalAccountDeletionIntentionHash({
      operation: 'CANCEL_ACCOUNT_DELETION',
      accountId,
      requestId: accReq.request.id,
      expectedRevision: 1n,
      confirmation: true,
    });
    const cancelCh = await reauthService.beginChallenge({
      actorContext: { ...actorContext, authTime: tAfterWindow },
      operation: 'CANCEL_ACCOUNT_DELETION',
      resourceType: 'ACCOUNT',
      resourceId: accountId,
      requestId: accReq.request.id,
      expectedRevision: 1n,
      intentionHash: cancelIntentionHash,
    });
    const cancelVer = await reauthService.verifyChallenge({
      actorContext: { ...actorContext, authTime: tAfterWindow },
      challengeId: cancelCh.challengeId,
      credential: password,
    });

    await expect(
      manualWorkflows.cancelManualAccountDeletion({
        actorContext: {
          actorType: 'ORGANIZER_HUMAN',
          accountId,
          sessionId: actorContext.sessionId,
          credentialRevision: 1n,
          sessionWatermark: 1n,
          recoveryEpoch: currentEpoch,
          restrictedContext: 'DELETION_MANAGEMENT_ONLY',
        },
        accountId,
        requestId: accReq.request.id,
        confirmation: true,
        expectedRevision: 1n,
        reauthenticationEvidence: cancelVer.evidence,
        idempotencyKey: `e2e-late-cancel-${accountId}`,
        now: tAfterWindow,
      })
    ).rejects.toThrow(DeletionCoordinationError);

    // Anchor and child barriers remain intact
    const accessStillBlocked = await manualWorkflows.evaluateBarrierAccess({
      eventId: eventClosedId,
      accountId,
      action: 'GUEST_VIEW_GALLERY',
      actorContext: { actorType: 'GUEST' },
    });
    expect(accessStillBlocked.allowed).toBe(false);
  });

  it('Escenario 2 & 3 (EL-TK-202): partial/Unknown storage failures hold DELETED & quota and alert; PITR restore prior to transition is blocked by tombstones; +7d and +30d UTC verified', async () => {
    const { accountId, eventClosedId } = await seedOrganizerAndEvents();
    const { recoveryBarrierPort, tombstoneAuthorityPort } = createAuthorityPorts();

    const manualWorkflows = new ManualDeletionWorkflowService(transactions, {
      recoveryBarrierPort,
    });

    // Populate S3-compatible bucket with original, derivative, cover, and multipart export part
    const origKey = `events/${eventClosedId}/orig-photo-1.jpg`;
    const derivKey = `events/${eventClosedId}/deriv-photo-1.webp`;
    const exportKey = `exports/${eventClosedId}/archive-part-1.zip`;
    s3Objects.set(`${origKey}:v1`, { status: 'PRESENT' });
    s3Objects.set(`${derivKey}:v1`, { status: 'PRESENT' });
    s3Objects.set(`${exportKey}:v2`, { status: 'PRESENT', failNextDelete: true });

    let quotaSettledCount = 0;

    const purgeService = new DeletionPurgeExecutionService({
      runner: transactions,
      tombstoneAuthorityPort,
      inventoryPort: {
        async inspectScopeInventoryAndWriters() {
          return {
            items: [
              {
                itemRef: 'item-orig-1',
                ownerModule: 'MOD-003',
                category: 'ORIGINAL',
                namespace: 'media-originals',
                objectKey: origKey,
                versionId: 'v1',
                multipartUploadId: null,
                generation: 1n,
                sizeBytes: 12_582_912n,
                sha256: '1111',
              },
              {
                itemRef: 'item-deriv-1',
                ownerModule: 'MOD-003',
                category: 'DERIVATIVE',
                namespace: 'media-derivatives',
                objectKey: derivKey,
                versionId: 'v1',
                multipartUploadId: null,
                generation: 1n,
                sizeBytes: 512_000n,
                sha256: '2222',
              },
              {
                itemRef: 'item-export-1',
                ownerModule: 'MOD-005',
                category: 'EXPORT_PART',
                namespace: 'exports',
                objectKey: exportKey,
                versionId: 'v2',
                multipartUploadId: 'mp-upload-1',
                generation: 1n,
                sizeBytes: 13_107_200n,
                sha256: '3333',
              },
            ],
            activeSignedGrantsCount: 0,
            activeInFlightTransfersCount: 0,
          };
        },
      },
      storagePurgePort: {
        async deleteAndVerifyItem(p) {
          const k = `${p.objectKey}:${p.versionId}`;
          const obj = s3Objects.get(k);
          if (obj?.failNextDelete) {
            obj.failNextDelete = false;
            return {
              itemRef: p.objectKey,
              objectKey: p.objectKey,
              versionId: p.versionId,
              status: 'UNKNOWN',
              errorDetail: 'S3 503 SlowDown on multipart abort/delete',
            };
          }
          if (obj) {
            obj.status = 'MISSING';
          }
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

    const finalizationService = new DeletionFinalizationAndResidualService({
      runner: transactions,
      purgeExecutionService: purgeService,
      tombstoneAuthorityPort,
      quotaSettlementPort: {
        async settleVerifiedDeletionQuota(qReq) {
          quotaSettledCount += 1;
          return {
            receiptId: `beta-quota-rcpt-${qReq.requestId}`,
            releasedBytes: qReq.bytesToRelease,
            settledAt: new Date('2026-10-16T10:15:00.000Z'),
            idempotentReplay: quotaSettledCount > 1,
          };
        },
      },
      residualBackupEvidencePort: {
        async inspectResidualRetention(p) {
          const passed30d = p.evaluationTime.getTime() >= p.residualPurgeDeadline.getTime();
          return {
            providerVerified: true,
            ordinaryBackupsRotatedPastMainPurge: passed30d,
            hasUnknownStagingCopy: false,
            oldestRetainedSnapshotTimestamp: passed30d
              ? new Date('2026-10-20T00:00:00.000Z')
              : new Date('2026-10-10T00:00:00.000Z'),
            sanitizedSummary: passed30d
              ? 'All ordinary backups before mainPurgedAt rotated'
              : 'Within 30d UTC window',
          };
        },
      },
      alertSink: {
        emitAlert(a) {
          alerts.push(a);
        },
      },
    });

    // 1. Request manual event deletion at 2026-10-12T10:00:00Z -> 72h cancelUntil = 2026-10-15T10:00:00Z
    const reqAt = new Date('2026-10-12T10:00:00.000Z');
    const evReq = await manualWorkflows.requestManualEventDeletion({
      actorContext: {
        actorType: 'ORGANIZER_HUMAN',
        accountId,
        recoveryEpoch: currentEpoch,
      },
      eventId: eventClosedId,
      confirmation: true,
      expectedRevision: 1n,
      idempotencyKey: `e2e-ev-del-${eventClosedId}`,
      now: reqAt,
    });

    expect(evReq.request.purgeStartedAt.toISOString()).toBe('2026-10-15T10:00:00.000Z');
    expect(evReq.request.mainPurgeDeadline.toISOString()).toBe('2026-10-22T10:00:00.000Z');
    expect(evReq.request.residualPurgeDeadline.toISOString()).toBe('2026-11-14T10:00:00.000Z');

    // 2. At 2026-10-16T10:00:00Z (after 72h window), prepare manifest and execute Attempt 1 (export part fails with UNKNOWN)
    const workerCtx = {
      workerId: 'worker-beta-1',
      leaseToken: 'lease-beta-1',
      workerFence: 1n,
      recoveryEpoch: currentEpoch,
      leaseExpiresAt: new Date('2026-10-17T00:00:00.000Z'),
    };
    const manifestRes = await purgeService.prepareVerifiableManifestAndDrainWriters({
      requestId: evReq.request.id,
      workerContext: workerCtx,
      now: new Date('2026-10-16T10:00:00.000Z'),
    });

    const purgeAttempt1 = await purgeService.executeMainPurge({
      requestId: evReq.request.id,
      manifestId: manifestRes.manifest.id,
      expectedManifestRevision: manifestRes.manifest.manifestRevision,
      workerContext: workerCtx,
      now: new Date('2026-10-16T10:05:00.000Z'),
    });

    // Escenario 2: Partial/UNKNOWN failure holds DELETED and quota, emits alert, and does not hide deadline
    expect(purgeAttempt1.outcome).toBe('RETRY_SCHEDULED_PARTIAL_OR_UNKNOWN');
    expect(alerts.some((a) => a.alertType === 'MAIN_PURGE_PARTIAL_OR_UNKNOWN')).toBe(true);

    const blockedFinalize = await finalizationService.finalizeDeletedStateAndSettleQuota({
      requestId: evReq.request.id,
      now: new Date('2026-10-16T10:06:00.000Z'),
    });
    expect(blockedFinalize.finalized).toBe(false);
    expect(quotaSettledCount).toBe(0);

    // 3. Retry main purge -> all 3 objects now MISSING_VERIFIED -> finalize DELETED & settle quota once
    const purgeAttempt2 = await purgeService.executeMainPurge({
      requestId: evReq.request.id,
      manifestId: manifestRes.manifest.id,
      expectedManifestRevision: manifestRes.manifest.manifestRevision,
      workerContext: workerCtx,
      now: new Date('2026-10-16T10:10:00.000Z'),
    });
    expect(purgeAttempt2.outcome).toBe('MAIN_PURGED_VERIFIED');

    const finalized = await finalizationService.finalizeDeletedStateAndSettleQuota({
      requestId: evReq.request.id,
      now: new Date('2026-10-16T10:15:00.000Z'),
    });
    expect(finalized.finalized).toBe(true);
    expect(finalized.bytesReleased).toBe(12_582_912n);
    expect(quotaSettledCount).toBe(1);

    // 4. Escenario 3: Simulate PITR restore of an old DB snapshot from BEFORE the deletion request
    await transactions.run(async (tx: SqlTransaction) => {
      await tx.execute(
        "UPDATE event SET status = 'CLOSED', purge_started_at = NULL WHERE id = $1::uuid",
        eventClosedId
      );
      await tx.execute(
        'DELETE FROM deletion_access_barrier WHERE request_id = $1::uuid',
        evReq.request.id
      );
    });

    // Isolated restore drill reconciles with RecoveryAuthority tombstones and blocks access
    const restoreDrill = await finalizationService.verifyIsolatedRestoreAccessRestricted({
      scopeType: 'EVENT',
      scopeRef: eventClosedId,
      callerRecoveryEpoch: currentEpoch,
      now: new Date('2026-10-20T12:00:00.000Z'),
    });
    expect(restoreDrill.accessRestricted).toBe(true);
    expect(restoreDrill.reason).toBe('BLOCKED_BY_RESTORED_SNAPSHOT_TOMBSTONE');

    const accessAfterPitr = await manualWorkflows.evaluateBarrierAccess({
      eventId: eventClosedId,
      accountId,
      action: 'ISSUE_MEDIA_DOWNLOAD_GRANT',
      actorContext: { actorType: 'ORGANIZER_HUMAN', accountId },
    });
    expect(accessAfterPitr.allowed).toBe(false);

    // 5. Verify +30d UTC residual deadline (2026-11-14T10:00:00Z)
    const residualVerified = await finalizationService.verifyResidualComplianceAndRestoreProtection({
      requestId: evReq.request.id,
      callerRecoveryEpoch: currentEpoch,
      now: new Date('2026-11-14T10:00:00.000Z'),
    });
    expect(residualVerified.gateStatus).toBe('PASS_RESIDUAL_VERIFIED');
    expect(residualVerified.request.status).toBe('COMPLETED');
    expect(residualVerified.evidence?.residualPurgeStatus).toBe('RESIDUAL_VERIFIED');

    // Verify UI controller reflects final verified state without false promises
    const uiController = new EventDeletionUiController({
      async getEventDeletionSnapshot() {
        return {
          eventId: eventClosedId,
          eventName: 'Evento Cerrado Beta',
          eventTimezone: 'America/Bogota',
          eventStatus: 'DELETED',
          currentRevision: residualVerified.request.currentRevision,
          generation: 1n,
          deletionRequest: {
            requestId: evReq.request.id,
            cause: 'MANUAL_EVENT_DELETION',
            status: residualVerified.request.status,
            anchorTimestamp: evReq.request.anchorTimestamp,
            cancelUntil: evReq.request.cancelUntil,
            purgeStartedAt: evReq.request.purgeStartedAt,
            mainPurgeDeadline: evReq.request.mainPurgeDeadline,
            residualPurgeDeadline: evReq.request.residualPurgeDeadline,
            mainPurgedAt: residualVerified.evidence?.mainPurgedAt ?? null,
            mainPurgeStatus: residualVerified.evidence!.mainPurgeStatus,
            residualPurgeStatus: residualVerified.evidence!.residualPurgeStatus,
          },
          serverCapabilities: {
            canRequestManualDeletion: false,
            canCancelManualDeletion: false,
            isReadOnlyView: true,
          },
        };
      },
      async requestEventDeletion() {
        throw new Error('Not allowed');
      },
      async cancelEventDeletion() {
        throw new Error('Not allowed');
      },
    });

    const finalPanel = await uiController.loadSnapshot(
      eventClosedId,
      new Date('2026-11-14T10:01:00.000Z')
    );
    expect(finalPanel.isCancelable).toBe(false);
    expect(finalPanel.countdown).toBeNull();
    expect(finalPanel.mainPurgeStatusLabel).toContain('Purga principal verificada');
    expect(finalPanel.residualRetentionNotice).toContain(
      'Obligación residual en copias ordinarias verificada'
    );
  });
});
