import { describe, expect, it } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  addUtcCalendarDays,
  type DeletionCoordinationRepository,
  DeletionCoordinationError,
  type DeletionReceiptRecord,
  type DeletionRequestRecord,
  DeletionFinalizationAndResidualService,
  type DeletionManifestItem,
  type DeletionPurgeAlert,
  DeletionPurgeExecutionService,
  type DeletionTombstoneAuthorityPort,
  type ExternalAuthorityJournalEntry,
  type ObjectStoragePurgePort,
  type QuotaDeletionSettlementPort,
  type ResidualBackupEvidencePort,
} from '../src/index.js';

function createInMemoryHarness() {
  const requests = new Map<string, DeletionRequestRecord>();
  const receipts: DeletionReceiptRecord[] = [];
  const tombstones: Array<Record<string, unknown>> = [];
  const manifests: Array<Record<string, unknown>> = [];
  const evidences = new Map<string, Record<string, unknown>>();
  const eventStates = new Map<string, string>();
  const accountStates = new Map<string, string>();
  const mediaStates = new Map<string, string>();
  const alerts: DeletionPurgeAlert[] = [];

  const repository: DeletionCoordinationRepository = {
    async findById(_tx, id) {
      return requests.get(id) ?? null;
    },
    async findByIdForUpdate(_tx, id) {
      return requests.get(id) ?? null;
    },
    async findBySourceOperationId(_tx, sourceOperationId) {
      for (const req of requests.values()) {
        if (req.sourceOperationId === sourceOperationId) return req;
      }
      return null;
    },
    async findActiveByDedupKey(_tx, dedupKey) {
      for (const req of requests.values()) {
        if (req.dedupKey === dedupKey && req.status !== 'CANCELLED') return req;
      }
      return null;
    },
    async findActiveForScope(_tx, scopeType, scopeRef) {
      return [...requests.values()].filter(
        (r) => r.scopeType === scopeType && r.scopeRef === scopeRef && r.status !== 'CANCELLED'
      );
    },
    async insertRequest(_tx, record) {
      requests.set(record.id, record);
    },
    async updateRequestStatus(_tx, params) {
      const existing = requests.get(params.id);
      if (!existing || existing.currentRevision !== params.expectedRevision) return false;
      requests.set(params.id, {
        ...existing,
        status: params.newStatus,
        currentRevision: params.newRevision,
        recoveryEpoch: params.recoveryEpoch ?? existing.recoveryEpoch,
        mainPurgedAt: params.mainPurgedAt ?? existing.mainPurgedAt,
        completedAt: params.completedAt ?? existing.completedAt,
        updatedAt: params.now,
      });
      return true;
    },
    async insertReceipt(_tx, receipt) {
      receipts.push(receipt);
    },
    async listReceiptsForRequest(_tx, requestId) {
      return receipts.filter((r) => r.requestId === requestId);
    },
  };

  const tx: SqlTransaction = {
    async query<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      if (sql.includes('FROM deletion_authority_tombstone')) {
        const filtered = tombstones.filter((t) => {
          if (params.length === 4) {
            return (
              t.scope_type === params[0] &&
              t.scope_ref === params[1] &&
              BigInt(t.generation as bigint) === BigInt(params[2] as bigint) &&
              t.request_id === params[3]
            );
          }
          return t.scope_type === params[0] && t.scope_ref === params[1];
        });
        return filtered as unknown as T[];
      }
      if (sql.includes('MAX(manifest_revision)')) {
        const reqId = params[0] as string;
        const forReq = manifests.filter((m) => m.request_id === reqId);
        const maxRev = forReq.reduce(
          (max, m) => (BigInt(m.manifest_revision as bigint) > max ? BigInt(m.manifest_revision as bigint) : max),
          0n
        );
        return [{ max_rev: maxRev }] as unknown as T[];
      }
      if (sql.includes('FROM deletion_inventory_manifest')) {
        if (sql.includes('WHERE id = $1::uuid AND request_id = $2::uuid')) {
          return manifests.filter(
            (m) => m.id === params[0] && m.request_id === params[1]
          ) as unknown as T[];
        }
        if (sql.includes('WHERE id = $1::uuid')) {
          return manifests.filter((m) => m.id === params[0]) as unknown as T[];
        }
        const forReq = manifests
          .filter((m) => m.request_id === params[0])
          .sort((a, b) => Number(BigInt(b.manifest_revision as bigint) - BigInt(a.manifest_revision as bigint)));
        return forReq as unknown as T[];
      }
      if (sql.includes('FROM deletion_purge_evidence')) {
        const ev = evidences.get(params[0] as string);
        return (ev ? [ev] : []) as unknown as T[];
      }
      return [];
    },
    async execute(sql: string, ...params: unknown[]): Promise<number> {
      if (sql.includes('INSERT INTO deletion_authority_tombstone')) {
        const isDirectState = !sql.includes("'PREPARED'");
        const row = isDirectState
          ? {
              id: params[0],
              request_id: params[1],
              scope_type: params[2],
              scope_ref: params[3],
              generation: params[4],
              cause: params[5],
              tombstone_state: params[6],
              authority_sequence: params[7],
              recovery_epoch: params[8],
              checkpoint_intact: true,
              anchor_timestamp: params[9],
              purge_started_at: params[10],
              main_purge_deadline: params[11],
              residual_purge_deadline: params[12],
              main_purged_at: params[13],
              residual_verified_at: params[14],
              created_at: params[15],
              updated_at: params[15],
            }
          : {
              id: params[0],
              request_id: params[1],
              scope_type: params[2],
              scope_ref: params[3],
              generation: params[4],
              cause: params[5],
              tombstone_state: 'PREPARED',
              authority_sequence: params[6],
              recovery_epoch: params[7],
              checkpoint_intact: true,
              anchor_timestamp: params[8],
              purge_started_at: params[9],
              main_purge_deadline: params[10],
              residual_purge_deadline: params[11],
              main_purged_at: params[12],
              residual_verified_at: params[13],
              created_at: params[14],
              updated_at: params[14],
            };
        const idx = tombstones.findIndex(
          (t) =>
            t.scope_type === row.scope_type &&
            t.scope_ref === row.scope_ref &&
            BigInt(t.generation as bigint) === BigInt(row.generation as bigint) &&
            t.request_id === row.request_id
        );
        if (idx >= 0) {
          tombstones[idx] = { ...tombstones[idx], ...row };
        } else {
          tombstones.push(row);
        }
        return 1;
      }
      if (sql.includes('UPDATE deletion_authority_tombstone')) {
        if (sql.includes("tombstone_state = 'UNKNOWN'")) {
          const found = tombstones.find(
            (t) =>
              t.scope_type === params[1] &&
              t.scope_ref === params[2] &&
              BigInt(t.generation as bigint) === BigInt(params[3] as bigint) &&
              t.request_id === params[4]
          );
          if (found) {
            found.tombstone_state = 'UNKNOWN';
            found.updated_at = params[0];
          }
          return 1;
        }
        const found = tombstones.find(
          (t) =>
            t.scope_type === params[4] &&
            t.scope_ref === params[5] &&
            BigInt(t.generation as bigint) === BigInt(params[6] as bigint) &&
            t.request_id === params[7]
        );
        if (found) {
          found.tombstone_state = params[0];
          found.main_purged_at = params[1] ?? found.main_purged_at;
          found.residual_verified_at = params[2] ?? found.residual_verified_at;
          found.updated_at = params[3];
        }
        return 1;
      }
      if (sql.includes('UPDATE deletion_request')) {
        if (sql.includes("SET status = 'CLAIMED'")) {
          const req = requests.get(params[3] as string)!;
          requests.set(req.id, {
            ...req,
            status: 'CLAIMED',
            currentRevision: BigInt(params[0] as bigint),
            claimedAt: req.claimedAt ?? (params[1] as Date),
            claimedByWorker: params[2] as string,
            updatedAt: params[1] as Date,
          });
          return 1;
        }
        if (sql.includes("SET status = 'MAIN_PURGED'")) {
          const req = requests.get(params[2] as string)!;
          requests.set(req.id, {
            ...req,
            status: 'MAIN_PURGED',
            currentRevision: BigInt(params[0] as bigint),
            mainPurgedAt: req.mainPurgedAt ?? (params[1] as Date),
            updatedAt: params[1] as Date,
          });
          return 1;
        }
        if (sql.includes("SET status = 'COMPLETED'")) {
          const req = requests.get(params[2] as string)!;
          requests.set(req.id, {
            ...req,
            status: 'COMPLETED',
            currentRevision: BigInt(params[0] as bigint),
            completedAt: req.completedAt ?? (params[1] as Date),
            updatedAt: params[1] as Date,
          });
          return 1;
        }
        if (sql.includes('SET status = $1')) {
          const req = requests.get(params[6] as string)!;
          requests.set(req.id, {
            ...req,
            status: params[0] as DeletionRequestRecord['status'],
            currentRevision: BigInt(params[1] as bigint),
            recoveryEpoch: BigInt(params[2] as bigint),
            mainPurgedAt: (params[3] as Date | null) ?? req.mainPurgedAt,
            completedAt: (params[4] as Date | null) ?? req.completedAt,
            updatedAt: params[5] as Date,
          });
          return 1;
        }
      }
      if (sql.includes('INSERT INTO deletion_inventory_manifest')) {
        manifests.push({
          id: params[0],
          request_id: params[1],
          scope_type: params[2],
          scope_ref: params[3],
          manifest_revision: params[4],
          recovery_epoch: params[5],
          worker_lease_token: params[6],
          worker_fence: params[7],
          writer_drain_state: params[8],
          active_signed_grants_count: params[9],
          active_in_flight_transfers_count: params[10],
          items_json: params[11],
          manifest_hash: params[12],
          prepared_at: params[13],
          quiet_verified_at: params[14],
          created_at: params[13],
          updated_at: params[13],
        });
        return 1;
      }
      if (sql.includes('UPDATE deletion_inventory_manifest')) {
        if (sql.includes("writer_drain_state = 'STALE_OR_UNKNOWN'")) {
          const m = manifests.find((it) => it.id === params[1]);
          if (m) {
            m.writer_drain_state = 'STALE_OR_UNKNOWN';
            m.updated_at = params[0];
          }
          return 1;
        }
        const m = manifests.find((it) => it.id === params[2]);
        if (m) {
          m.items_json = params[0];
          m.updated_at = params[1];
        }
        return 1;
      }
      if (sql.includes('INSERT INTO deletion_purge_evidence')) {
        const reqId = params[1] as string;
        const existing = evidences.get(reqId);
        evidences.set(reqId, {
          id: existing?.id ?? params[0],
          request_id: reqId,
          scope_type: params[2],
          scope_ref: params[3],
          cause: params[4],
          manifest_id: params[5],
          manifest_revision: params[6],
          main_purge_status: params[7],
          residual_purge_status: existing?.residual_purge_status ?? 'PENDING_RESIDUAL',
          attempt_count: params[8],
          verified_missing_count: params[9],
          total_manifest_items_count: params[10],
          unknown_or_present_count: params[11],
          owner_state_finalized: existing?.owner_state_finalized ?? false,
          quota_settled: existing?.quota_settled ?? false,
          quota_settlement_receipt_id: existing?.quota_settlement_receipt_id ?? null,
          bytes_released: existing?.bytes_released ?? 0n,
          notification_emitted: existing?.notification_emitted ?? false,
          notification_intent_id: existing?.notification_intent_id ?? null,
          purge_started_at: params[12],
          main_purge_deadline: params[13],
          residual_purge_deadline: params[14],
          main_purged_at: existing?.main_purged_at ?? params[15],
          residual_verified_at: existing?.residual_verified_at ?? null,
          residual_evidence_json: existing?.residual_evidence_json ?? '{}',
          created_at: existing?.created_at ?? params[16],
          updated_at: params[16],
        });
        return 1;
      }
      if (sql.includes('UPDATE deletion_purge_evidence')) {
        if (sql.includes('SET owner_state_finalized = true')) {
          const reqId = params[4] as string;
          const ev = evidences.get(reqId)!;
          ev.owner_state_finalized = true;
          ev.quota_settled = true;
          ev.quota_settlement_receipt_id = ev.quota_settlement_receipt_id ?? params[0];
          ev.bytes_released = ev.quota_settled ? params[1] : params[1];
          ev.main_purged_at = ev.main_purged_at ?? params[2];
          ev.updated_at = params[3];
          return 1;
        }
        if (sql.includes('SET notification_emitted = true')) {
          const reqId = params[2] as string;
          const ev = evidences.get(reqId)!;
          ev.notification_emitted = true;
          ev.notification_intent_id = ev.notification_intent_id ?? params[0];
          ev.updated_at = params[1];
          return 1;
        }
        if (sql.includes('SET residual_purge_status = $1')) {
          const reqId = params[4] as string;
          const ev = evidences.get(reqId)!;
          ev.residual_purge_status = params[0];
          ev.residual_verified_at = params[1] ?? ev.residual_verified_at;
          ev.residual_evidence_json = params[2];
          ev.updated_at = params[3];
          return 1;
        }
      }
      if (sql.includes("UPDATE event") && sql.includes("SET status = 'DELETED'")) {
        eventStates.set(params[1] as string, 'DELETED');
        return 1;
      }
      if (sql.includes("UPDATE organizer_account") && sql.includes("SET status = 'DELETED'")) {
        accountStates.set(params[1] as string, 'DELETED');
        return 1;
      }
      if (sql.includes("UPDATE media_catalog") && sql.includes("SET status = 'DELETED'")) {
        mediaStates.set(params[1] as string, 'DELETED');
        return 1;
      }
      return 1;
    },
  };

  const runner: TransactionRunner = {
    async run<T>(fn: (tx: SqlTransaction) => Promise<T>): Promise<T> {
      return fn(tx);
    },
  };

  return {
    runner,
    repository,
    requests,
    receipts,
    tombstones,
    manifests,
    evidences,
    eventStates,
    accountStates,
    mediaStates,
    alerts,
  };
}

function seedConfirmedEventRequest(id: string, scopeRef: string): DeletionRequestRecord {
  const anchor = new Date('2026-10-12T10:00:00.000Z');
  const purgeStarted = new Date('2026-10-13T10:00:00.000Z');
  return {
    id,
    sourceOperationId: `src-${id}`,
    cause: 'MANUAL_EVENT_DELETION',
    scopeType: 'EVENT',
    scopeRef,
    parentRequestId: null,
    ownerModule: 'MOD-002',
    expectedGeneration: 1n,
    expectedRevision: 1n,
    currentRevision: 2n,
    policyRef: 'MOD-008-V1',
    policyVersion: '1.0',
    anchorTimestamp: anchor,
    cancelUntil: purgeStarted,
    purgeStartedAt: purgeStarted,
    mainPurgeDeadline: addUtcCalendarDays(purgeStarted, 7),
    residualPurgeDeadline: addUtcCalendarDays(purgeStarted, 30),
    status: 'CONFIRMED',
    recoveryEpoch: 10n,
    dedupKey: `dedup-${id}`,
    payloadHash: 'hash-1',
    relatedResources: [{ resourceType: 'EVENT', resourceRef: scopeRef }],
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    claimedAt: null,
    claimedByWorker: null,
    mainPurgedAt: null,
    completedAt: null,
    createdAt: anchor,
    updatedAt: anchor,
  };
}

describe('Ruta 4 & Ruta 5 — Unit Tests (EL-TK-197, EL-TK-195, EL-TK-196, EL-TK-198, EL-TK-199)', () => {
  it('EL-TK-195: blocks main purge readiness when signed URL grants are still unexpired, and allows when quiet', async () => {
    const h = createInMemoryHarness();
    const req = seedConfirmedEventRequest(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222'
    );
    h.requests.set(req.id, req);

    let activeSignedGrants = 2;

    const authorityPort: DeletionTombstoneAuthorityPort = {
      async getCheckpointStatus() {
        return {
          recoveryEpoch: 10n,
          checkpointIntact: true,
          lastContiguousSequence: 1n,
          hasSequenceGap: false,
        };
      },
      async prepareTombstoneEntry() {
        return { preparedReceipt: 'prep-1', sequence: 2n };
      },
      async ackTombstoneEntry() {},
      async getJournalEntriesForScope() {
        return [];
      },
    };

    const purgeService = new DeletionPurgeExecutionService({
      runner: h.runner,
      repository: h.repository,
      tombstoneAuthorityPort: authorityPort,
      inventoryPort: {
        async inspectScopeInventoryAndWriters() {
          return {
            items: [
              {
                itemRef: 'media-orig-1',
                ownerModule: 'MOD-003',
                category: 'ORIGINAL',
                namespace: 'media-bucket',
                objectKey: 'events/e1/orig-1.jpg',
                versionId: 'v1',
                multipartUploadId: null,
                generation: 1n,
                sizeBytes: 5_000_000n,
                sha256: 'abc',
              },
            ],
            activeSignedGrantsCount: activeSignedGrants,
            activeInFlightTransfersCount: 0,
          };
        },
      },
      storagePurgePort: {
        async deleteAndVerifyItem(p) {
          return {
            itemRef: 'media-orig-1',
            objectKey: p.objectKey,
            versionId: p.versionId,
            status: 'MISSING_VERIFIED',
          };
        },
      },
    });

    const workerContext = {
      workerId: 'worker-purge-1',
      leaseToken: 'lease-1',
      workerFence: 1n,
      recoveryEpoch: 10n,
      leaseExpiresAt: new Date('2026-10-14T12:00:00.000Z'),
    };

    // First attempt while signed grants are unexpired -> ACTIVE_WRITERS_BLOCKED
    const prepBlocked = await purgeService.prepareVerifiableManifestAndDrainWriters({
      requestId: req.id,
      workerContext,
      now: new Date('2026-10-14T10:00:00.000Z'),
    });

    expect(prepBlocked.readyForMainPurge).toBe(false);
    expect(prepBlocked.manifest.writerDrainState).toBe('ACTIVE_WRITERS_BLOCKED');

    await expect(
      purgeService.executeMainPurge({
        requestId: req.id,
        manifestId: prepBlocked.manifest.id,
        expectedManifestRevision: prepBlocked.manifest.manifestRevision,
        workerContext,
        now: new Date('2026-10-14T10:01:00.000Z'),
      })
    ).rejects.toThrow(DeletionCoordinationError);

    // Once signed grants expire -> QUIET_VERIFIED
    activeSignedGrants = 0;
    const prepQuiet = await purgeService.prepareVerifiableManifestAndDrainWriters({
      requestId: req.id,
      workerContext: { ...workerContext, workerFence: 2n },
      now: new Date('2026-10-14T10:05:00.000Z'),
    });

    expect(prepQuiet.readyForMainPurge).toBe(true);
    expect(prepQuiet.manifest.writerDrainState).toBe('QUIET_VERIFIED');
    expect(prepQuiet.manifest.manifestRevision).toBe(2n);
  });

  it('EL-TK-196 & EL-TK-198: partial failures retry and dead-letter after 3 attempts without finalizing DELETED or settling quota; full verification finalizes once', async () => {
    const h = createInMemoryHarness();
    const req = seedConfirmedEventRequest(
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444'
    );
    h.requests.set(req.id, req);

    let failSecondObject = true;
    let quotaSettlementCalls = 0;
    let emailShouldFail = true;

    const authorityPort: DeletionTombstoneAuthorityPort = {
      async getCheckpointStatus() {
        return {
          recoveryEpoch: 10n,
          checkpointIntact: true,
          lastContiguousSequence: 1n,
          hasSequenceGap: false,
        };
      },
      async prepareTombstoneEntry() {
        return { preparedReceipt: 'prep-2', sequence: 3n };
      },
      async ackTombstoneEntry() {},
      async getJournalEntriesForScope() {
        return [];
      },
    };

    const storagePurgePort: ObjectStoragePurgePort = {
      async deleteAndVerifyItem(p) {
        if (p.objectKey.includes('thumb') && failSecondObject) {
          return {
            itemRef: 'item-thumb',
            objectKey: p.objectKey,
            versionId: p.versionId,
            status: 'UNKNOWN',
            errorDetail: 'Storage timeout',
          };
        }
        return {
          itemRef: p.objectKey,
          objectKey: p.objectKey,
          versionId: p.versionId,
          status: 'MISSING_VERIFIED',
        };
      },
    };

    const purgeService = new DeletionPurgeExecutionService({
      runner: h.runner,
      repository: h.repository,
      tombstoneAuthorityPort: authorityPort,
      inventoryPort: {
        async inspectScopeInventoryAndWriters() {
          return {
            items: [
              {
                itemRef: 'item-orig',
                ownerModule: 'MOD-003',
                category: 'ORIGINAL',
                namespace: 'media-bucket',
                objectKey: 'events/e2/orig.jpg',
                versionId: 'v1',
                multipartUploadId: null,
                generation: 1n,
                sizeBytes: 8_388_608n,
                sha256: 'hash-orig',
              },
              {
                itemRef: 'item-thumb',
                ownerModule: 'MOD-003',
                category: 'DERIVATIVE',
                namespace: 'media-bucket',
                objectKey: 'events/e2/thumb.jpg',
                versionId: 'v1',
                multipartUploadId: null,
                generation: 1n,
                sizeBytes: 256_000n,
                sha256: 'hash-thumb',
              },
            ],
            activeSignedGrantsCount: 0,
            activeInFlightTransfersCount: 0,
          };
        },
      },
      storagePurgePort,
      alertSink: {
        emitAlert(alert) {
          h.alerts.push(alert);
        },
      },
    });

    const quotaPort: QuotaDeletionSettlementPort = {
      async settleVerifiedDeletionQuota(qReq) {
        quotaSettlementCalls += 1;
        return {
          receiptId: `quota-rcpt-${quotaSettlementCalls}`,
          releasedBytes: qReq.bytesToRelease,
          settledAt: new Date('2026-10-14T11:00:00.000Z'),
          idempotentReplay: quotaSettlementCalls > 1,
        };
      },
    };

    const finalizationService = new DeletionFinalizationAndResidualService({
      runner: h.runner,
      repository: h.repository,
      purgeExecutionService: purgeService,
      tombstoneAuthorityPort: authorityPort,
      quotaSettlementPort: quotaPort,
      notificationIntentPort: {
        async emitDeletionMainPurgedNotification() {
          if (emailShouldFail) {
            throw new Error('SMTP temporary outage');
          }
          return { notificationIntentId: 'notif-intent-1' };
        },
      },
      residualBackupEvidencePort: {
        async inspectResidualRetention() {
          return {
            providerVerified: true,
            ordinaryBackupsRotatedPastMainPurge: true,
            hasUnknownStagingCopy: false,
            oldestRetainedSnapshotTimestamp: new Date('2026-11-15T00:00:00.000Z'),
            sanitizedSummary: 'All ordinary snapshots prior to mainPurgedAt expired',
          };
        },
      },
      alertSink: {
        emitAlert(alert) {
          h.alerts.push(alert);
        },
      },
    });

    const workerContext = {
      workerId: 'worker-purge-2',
      leaseToken: 'lease-2',
      workerFence: 1n,
      recoveryEpoch: 10n,
      leaseExpiresAt: new Date('2026-10-15T00:00:00.000Z'),
    };

    const prepared = await purgeService.prepareVerifiableManifestAndDrainWriters({
      requestId: req.id,
      workerContext,
      now: new Date('2026-10-14T10:00:00.000Z'),
    });

    // Attempt 1 & 2: partial failure -> RETRY_SCHEDULED_PARTIAL_OR_UNKNOWN
    const attempt1 = await purgeService.executeMainPurge({
      requestId: req.id,
      manifestId: prepared.manifest.id,
      expectedManifestRevision: prepared.manifest.manifestRevision,
      workerContext,
      maxAttemptsBeforeDeadLetter: 3,
      now: new Date('2026-10-14T10:01:00.000Z'),
    });
    expect(attempt1.outcome).toBe('RETRY_SCHEDULED_PARTIAL_OR_UNKNOWN');

    // EL-TK-198 Escenario 2: partial purge must NOT finalize DELETED or settle quota
    const prematureFinalize = await finalizationService.finalizeDeletedStateAndSettleQuota({
      requestId: req.id,
      now: new Date('2026-10-14T10:02:00.000Z'),
    });
    expect(prematureFinalize.finalized).toBe(false);
    expect(prematureFinalize.reason).toBe('BLOCKED_MAIN_PURGE_NOT_VERIFIED');
    expect(quotaSettlementCalls).toBe(0);

    await purgeService.executeMainPurge({
      requestId: req.id,
      manifestId: prepared.manifest.id,
      expectedManifestRevision: prepared.manifest.manifestRevision,
      workerContext,
      maxAttemptsBeforeDeadLetter: 3,
      now: new Date('2026-10-14T10:03:00.000Z'),
    });

    // Attempt 3: exhausted -> DEAD_LETTER (never success!)
    const attempt3 = await purgeService.executeMainPurge({
      requestId: req.id,
      manifestId: prepared.manifest.id,
      expectedManifestRevision: prepared.manifest.manifestRevision,
      workerContext,
      maxAttemptsBeforeDeadLetter: 3,
      now: new Date('2026-10-14T10:04:00.000Z'),
    });
    expect(attempt3.outcome).toBe('DEAD_LETTER');
    expect(attempt3.evidence.mainPurgeStatus).toBe('DEAD_LETTER');
    expect(h.alerts.some((a) => a.alertType === 'MAIN_PURGE_DEAD_LETTER')).toBe(true);

    // Recovery retry once storage succeeds -> MAIN_PURGED_VERIFIED
    failSecondObject = false;
    const attempt4 = await purgeService.executeMainPurge({
      requestId: req.id,
      manifestId: prepared.manifest.id,
      expectedManifestRevision: prepared.manifest.manifestRevision,
      workerContext,
      maxAttemptsBeforeDeadLetter: 5,
      now: new Date('2026-10-14T10:10:00.000Z'),
    });
    expect(attempt4.outcome).toBe('MAIN_PURGED_VERIFIED');
    expect(attempt4.request.status).toBe('MAIN_PURGED');

    // Finalize DELETED state when email fails: state & quota still finalize, email error captured
    const fin1 = await finalizationService.finalizeDeletedStateAndSettleQuota({
      requestId: req.id,
      now: new Date('2026-10-14T10:11:00.000Z'),
    });
    expect(fin1.finalized).toBe(true);
    expect(fin1.bytesReleased).toBe(8_388_608n); // Only ORIGINAL bytes released
    expect(fin1.notificationEmitted).toBe(false);
    expect(fin1.notificationError).toContain('SMTP temporary outage');
    expect(fin1.evidence?.residualPurgeStatus).toBe('PENDING_RESIDUAL');
    expect(quotaSettlementCalls).toBe(1);
    expect(h.eventStates.get(req.scopeRef)).toBe('DELETED');

    // Replay finalization when email succeeds: quota NOT settled a second time, notification emitted once
    emailShouldFail = false;
    const fin2 = await finalizationService.finalizeDeletedStateAndSettleQuota({
      requestId: req.id,
      now: new Date('2026-10-14T10:12:00.000Z'),
    });
    expect(fin2.finalized).toBe(true);
    expect(fin2.reason).toBe('IDEMPOTENT_ALREADY_FINALIZED');
    expect(fin2.notificationEmitted).toBe(true);
    expect(quotaSettlementCalls).toBe(1);
  });

  it('EL-TK-197 & EL-TK-199: blocks access on uncertain/restored tombstones and enforces +30d UTC residual gate without implicit PASS', async () => {
    const h = createInMemoryHarness();
    const req = seedConfirmedEventRequest(
      '55555555-5555-4555-8555-555555555555',
      '66666666-6666-4666-8666-666666666666'
    );
    h.requests.set(req.id, req);

    let checkpointIntact = true;
    let journalEntries: ExternalAuthorityJournalEntry[] = [
      {
        sequence: 10n,
        requestId: req.id,
        scopeType: 'EVENT',
        scopeRef: req.scopeRef,
        generation: 1n,
        cause: 'MANUAL_EVENT_DELETION',
        tombstoneState: 'MAIN_PURGED',
        recoveryEpoch: 10n,
        anchorTimestamp: req.anchorTimestamp,
        purgeStartedAt: req.purgeStartedAt,
        mainPurgeDeadline: req.mainPurgeDeadline,
        residualPurgeDeadline: req.residualPurgeDeadline,
        mainPurgedAt: new Date('2026-10-14T10:00:00.000Z'),
        ackConfirmed: true,
      },
    ];

    const authorityPort: DeletionTombstoneAuthorityPort = {
      async getCheckpointStatus() {
        return {
          recoveryEpoch: 10n,
          checkpointIntact,
          lastContiguousSequence: 10n,
          hasSequenceGap: false,
        };
      },
      async prepareTombstoneEntry() {
        return { preparedReceipt: 'prep-3', sequence: 11n };
      },
      async ackTombstoneEntry() {},
      async getJournalEntriesForScope() {
        return journalEntries;
      },
    };

    const purgeService = new DeletionPurgeExecutionService({
      runner: h.runner,
      repository: h.repository,
      tombstoneAuthorityPort: authorityPort,
      inventoryPort: {
        async inspectScopeInventoryAndWriters() {
          return {
            items: [] as DeletionManifestItem[],
            activeSignedGrantsCount: 0,
            activeInFlightTransfersCount: 0,
          };
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
      alertSink: {
        emitAlert(alert) {
          h.alerts.push(alert);
        },
      },
    });

    let backupReport = {
      providerVerified: false,
      ordinaryBackupsRotatedPastMainPurge: false,
      hasUnknownStagingCopy: true,
      oldestRetainedSnapshotTimestamp: new Date('2026-10-10T00:00:00.000Z'),
      sanitizedSummary: 'Unverified provider and unknown staging copy',
    };

    const backupPort: ResidualBackupEvidencePort = {
      async inspectResidualRetention() {
        return backupReport;
      },
    };

    const finalizationService = new DeletionFinalizationAndResidualService({
      runner: h.runner,
      repository: h.repository,
      purgeExecutionService: purgeService,
      tombstoneAuthorityPort: authorityPort,
      quotaSettlementPort: {
        async settleVerifiedDeletionQuota(qReq) {
          return {
            receiptId: 'rcpt-1',
            releasedBytes: qReq.bytesToRelease,
            settledAt: new Date('2026-10-14T10:05:00.000Z'),
            idempotentReplay: false,
          };
        },
      },
      residualBackupEvidencePort: backupPort,
      alertSink: {
        emitAlert(alert) {
          h.alerts.push(alert);
        },
      },
    });

    // Prepare, execute main purge, and finalize DELETED
    const workerContext = {
      workerId: 'worker-purge-3',
      leaseToken: 'lease-3',
      workerFence: 1n,
      recoveryEpoch: 10n,
      leaseExpiresAt: new Date('2026-10-15T00:00:00.000Z'),
    };
    const prep = await purgeService.prepareVerifiableManifestAndDrainWriters({
      requestId: req.id,
      workerContext,
      now: new Date('2026-10-14T10:00:00.000Z'),
    });
    await purgeService.executeMainPurge({
      requestId: req.id,
      manifestId: prep.manifest.id,
      expectedManifestRevision: prep.manifest.manifestRevision,
      workerContext,
      now: new Date('2026-10-14T10:01:00.000Z'),
    });
    await finalizationService.finalizeDeletedStateAndSettleQuota({
      requestId: req.id,
      now: new Date('2026-10-14T10:02:00.000Z'),
    });

    // EL-TK-199 Escenario 1: Old backup restored in isolated environment is blocked by tombstone
    const restoreDrill = await finalizationService.verifyIsolatedRestoreAccessRestricted({
      scopeType: 'EVENT',
      scopeRef: req.scopeRef,
      callerRecoveryEpoch: 10n,
      now: new Date('2026-10-20T10:00:00.000Z'),
    });
    expect(restoreDrill.accessRestricted).toBe(true);
    expect(restoreDrill.reason).toBe('BLOCKED_BY_RESTORED_SNAPSHOT_TOMBSTONE');

    // EL-TK-199 Escenario 3: Unverified provider / unknown staging copy -> FAIL_RESIDUAL_GATE (never implicit PASS)
    const gateFailProvider = await finalizationService.verifyResidualComplianceAndRestoreProtection({
      requestId: req.id,
      callerRecoveryEpoch: 10n,
      now: new Date('2026-11-12T10:00:00.000Z'),
    });
    expect(gateFailProvider.gateStatus).toBe('FAIL_RESIDUAL_GATE');
    expect(gateFailProvider.reason).toBe('PROVIDER_UNVERIFIED_OR_UNKNOWN_STAGING');

    // EL-TK-199 Escenario 3: Corrupted checkpoint -> FAIL_RESIDUAL_GATE
    checkpointIntact = false;
    const gateFailCheckpoint = await finalizationService.verifyResidualComplianceAndRestoreProtection({
      requestId: req.id,
      callerRecoveryEpoch: 10n,
      now: new Date('2026-11-12T10:00:00.000Z'),
    });
    expect(gateFailCheckpoint.gateStatus).toBe('FAIL_RESIDUAL_GATE');
    expect(gateFailCheckpoint.reason).toBe('CHECKPOINT_OR_EPOCH_GAP');

    // EL-TK-199 Escenario 2: At +30 calendar days UTC from purgeStartedAt (2026-10-13T10:00:00Z -> 2026-11-12T10:00:00Z),
    // with verified provider and rotated backups -> PASS_RESIDUAL_VERIFIED
    checkpointIntact = true;
    backupReport = {
      providerVerified: true,
      ordinaryBackupsRotatedPastMainPurge: true,
      hasUnknownStagingCopy: false,
      oldestRetainedSnapshotTimestamp: new Date('2026-10-15T00:00:00.000Z'),
      sanitizedSummary: 'All ordinary backups before 2026-10-15 expired',
    };

    const gatePass = await finalizationService.verifyResidualComplianceAndRestoreProtection({
      requestId: req.id,
      callerRecoveryEpoch: 10n,
      now: new Date('2026-11-12T10:00:00.000Z'),
    });
    expect(gatePass.gateStatus).toBe('PASS_RESIDUAL_VERIFIED');
    expect(gatePass.calculatedResidualDeadlineUtc.toISOString()).toBe('2026-11-12T10:00:00.000Z');
    expect(gatePass.request.status).toBe('COMPLETED');
    expect(gatePass.evidence?.residualPurgeStatus).toBe('RESIDUAL_VERIFIED');
  });
});
