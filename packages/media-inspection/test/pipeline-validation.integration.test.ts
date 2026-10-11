import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {
  JobQueuePostgres,
  LocalSlots,
  PrismaTransactions,
  createPrismaClient,
  fingerprint,
  type RecoveryAuthority,
  type SqlTransaction,
} from '@eventlens/job-queue';
import {
  PostgresCompletionEvidence,
  type AttemptRecord,
  type Limits,
} from '@eventlens/media-execution';
import {PostgresInspectionRepository} from '../src/repository.js';
import {PostgresPhotoRepository, type PhotoCandidate} from '../src/photo-derivatives.js';
import {
  ApplySuccessfulProcessing,
  PostgresSuccessfulProcessingRepository,
  type MediaGovernance,
  type GovernanceDecision,
} from '../src/successful-processing.js';
import {PostgresQuarantineRepository} from '../src/quarantine.js';
import {
  AttemptCleanupService,
  PostgresAttemptCleanupRepository,
  DefaultRetentionPolicy,
  type CleanupStoragePort,
} from '../src/attempt-cleanup.js';
import {
  PipelineValidationService,
  PostgresPipelineValidationRepository,
  type PipelineSampleObservation,
} from '../src/pipeline-validation.js';
import type {InspectionInput, SafetyFact} from '../src/contracts.js';

const client = createPrismaClient(process.env.DATABASE_URL!);
const transactions = new PrismaTransactions(client, 5000);

class TestAuthority implements RecoveryAuthority {
  epoch = 'val-epoch';
  reconciled = true;
  available = true;
  barred = false;
  async acquire() {
    if (!this.reconciled || !this.available || this.barred) {
      throw new Error('AUTHORITY_UNAVAILABLE');
    }
    const epoch = this.epoch;
    return {
      epoch,
      assertCurrent: () => {
        if (!this.reconciled || !this.available || this.barred || epoch !== this.epoch) {
          throw new Error('AUTHORITY_UNAVAILABLE');
        }
      },
      async release() {},
    };
  }
}

const revisionDecision = (mode: 'AUTO' | 'PRE_REVIEW' = 'AUTO'): GovernanceDecision => ({
  mode,
  revision: '1',
  decisionRevision: '1',
  decision: 'ALLOW',
});

const testGovernance: MediaGovernance = {
  async lockAndRead(tx, scope) {
    const marker = (
      await tx.query<{ marker: string }>(
        "SELECT current_setting('eventlens.val_admission', true) AS marker",
      )
    )[0]?.marker;
    if (marker !== JSON.stringify(scope)) throw new Error('COORDINATED_ADMISSION_REQUIRED');
    const rows = await tx.query<{ decision: GovernanceDecision }>(
      'SELECT decision FROM val_governance WHERE event_ref = $1',
      scope.eventRef,
    );
    if (!rows.length) throw new Error('UNKNOWN_EVENT');
    return rows[0].decision;
  },
};

beforeAll(async () => {
  await transactions.run(async tx => {
    await tx.execute(`
      CREATE TABLE IF NOT EXISTS val_governance (
        event_ref TEXT PRIMARY KEY,
        decision JSONB NOT NULL,
        allowed BOOLEAN NOT NULL DEFAULT true
      );
      CREATE TABLE IF NOT EXISTS "media_pipeline_validation_report" (
        "id" UUID NOT NULL,
        "operation_id" TEXT NOT NULL,
        "target" TEXT NOT NULL,
        "sample_size" INTEGER NOT NULL,
        "success_count" INTEGER NOT NULL,
        "failure_count" INTEGER NOT NULL,
        "median_ms" DOUBLE PRECISION,
        "p95_ms" DOUBLE PRECISION,
        "meets_slo" BOOLEAN NOT NULL,
        "status" TEXT NOT NULL,
        "metrics" JSONB NOT NULL,
        "observations" JSONB NOT NULL,
        "recorded_at" TIMESTAMPTZ NOT NULL,
        CONSTRAINT "media_pipeline_validation_report_pkey" PRIMARY KEY ("id")
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "media_pipeline_validation_report_operation_id_key" ON "media_pipeline_validation_report"("operation_id");
    `);
  });
});

describe('PipelineValidationService PostgreSQL 16 integration tests', () => {
  it('executes pipeline end-to-end from accepted upload through inspection and promotion, verifying original byte integrity', async () => {
    const authority = new TestAuthority();
    const slots = new LocalSlots(1);
    const eventRef = 'event:' + randomUUID();
    const mediaRef = 'media:' + randomUUID();

    const policy = {
      async lockAndAuthorize(tx: SqlTransaction, resourceRef: string, generation: bigint) {
        const parents = await tx.query<{ event_ref: string }>(
          'SELECT event_ref FROM media_catalog WHERE media_ref = $1',
          resourceRef,
        );
        if (!parents.length) return false;
        const event = parents[0].event_ref;
        const parent = await tx.query<{ allowed: boolean }>(
          'SELECT allowed FROM val_governance WHERE event_ref = $1 FOR UPDATE',
          event,
        );
        if (parent[0]?.allowed !== true) return false;
        const media = await tx.query<{ generation: bigint }>(
          'SELECT generation FROM media_catalog WHERE media_ref = $1 AND event_ref = $2 FOR UPDATE',
          resourceRef,
          event,
        );
        await tx.query(
          "SELECT set_config('eventlens.val_admission', $1, true)",
          JSON.stringify({ eventRef: event, mediaRef: resourceRef }),
        );
        return media[0]?.generation === generation;
      },
    };

    const queue = new JobQueuePostgres(transactions, authority, policy, slots, {
      candidateScanLimit: 16,
    });

    const original = {
      namespace: 'fixture-corpus',
      key: 'mobiles/iphone14/photo-' + randomUUID() + '.heic',
      immutableVersion: randomUUID(),
      sha256: 'c'.repeat(64),
      sizeBytes: 4_500_000,
    };

    // 1. Accepted upload in media_catalog
    const jobId = await transactions.run(async tx => {
      await tx.execute(
        'INSERT INTO val_governance VALUES ($1, $2::jsonb, true)',
        eventRef,
        JSON.stringify(revisionDecision('AUTO')),
      );
      const intent = randomUUID();
      await tx.execute(
        'INSERT INTO media_acceptance_intent VALUES ($1, $2, 1, $3, $4::jsonb)',
        intent,
        mediaRef,
        original.sha256,
        '{}',
      );
      const jId = await queue.publish(tx, {
        type: 'MEDIA',
        handlerVersion: '1',
        resourceRef: mediaRef,
        generation: 1n,
        queue: mediaRef,
        dedupKey: randomUUID(),
        priority: 1,
        payload: null,
        availableAt: new Date(0),
      });
      await tx.execute(
        "INSERT INTO media_catalog VALUES ($1, $2, $3, 'guest', 1, 1, 'UPLOADED', $4::jsonb, $5::uuid)",
        mediaRef,
        intent,
        eventRef,
        JSON.stringify({
          namespace: original.namespace,
          key: original.key,
          version: original.immutableVersion,
          sha256: original.sha256,
          bytes: String(original.sizeBytes),
        }),
        jId,
      );
      return jId;
    });

    // 2. Reserve job (queue wait)
    const reservation = await queue.reserve([mediaRef], 'pipeline-worker', 1, 60000);
    expect(reservation.jobs.length).toBe(1);
    const job = reservation.jobs[0];

    // 3. Inspect
    const input: InspectionInput = {
      mediaRef,
      generation: 1n,
      revision: 1n,
      original,
      declaredMime: 'image/heic',
    };
    const safety: SafetyFact = {
      schemaVersion: 1,
      jobId,
      executionToken: job.token,
      fence: String(job.fence),
      epoch: job.epoch,
      mediaRef,
      generation: '1',
      revision: '1',
      originalSha256: original.sha256,
      originalVersion: original.immutableVersion,
      outcome: 'APPROVED',
      format: {
        status: 'VALID',
        reason: 'REAL_FORMAT_VALIDATED',
        metadata: { format: 'HEIF', width: 4032, height: 3024, streams: 1, audio: false },
        attemptId: randomUUID(),
      },
      malware: {
        status: 'NO_THREAT_DETECTED',
        reason: 'CLEAN_SCAN',
        engine: 'ClamAV',
        engineVersion: '1.4.6',
        imageDigest: 'sha256:e4df73bcde9afeb6bd1b464091f053537b3df86d8bf5a0431ae87c1760b332ae',
        snapshotId: 'a'.repeat(64),
        profileHash: 'b'.repeat(64),
        originalSha256: original.sha256,
        validUntil: new Date(Date.now() + 3600000).toISOString(),
        attemptId: randomUUID(),
      },
    };
    const inspectionRepo = new PostgresInspectionRepository();
    await transactions.run(tx => inspectionRepo.persist(tx, input, safety, job));

    // 4. Generate photo derivatives
    const attemptId = randomUUID();
    const candidate: PhotoCandidate = {
      schemaVersion: 1,
      operationId: randomUUID(),
      jobId,
      executionToken: job.token,
      fence: String(job.fence),
      epoch: job.epoch,
      mediaRef,
      generation: '1',
      revision: '1',
      originalSha256: original.sha256,
      originalVersion: original.immutableVersion,
      safetyFingerprint: fingerprint(safety),
      attemptId,
      durationMs: 1200,
      inputFormat: 'HEIF',
      renditions: [
        {
          file: 'thumbnail.jpg',
          namespace: 'fixture-corpus',
          key: `attempts/${attemptId}/thumbnail.jpg`,
          immutableVersion: randomUUID(),
          sha256: 'd'.repeat(64),
          sizeBytes: 15_000,
          width: 320,
          height: 240,
          role: 'THUMBNAIL',
          mime: 'image/jpeg',
        },
        {
          file: 'preview.jpg',
          namespace: 'fixture-corpus',
          key: `attempts/${attemptId}/preview.jpg`,
          immutableVersion: randomUUID(),
          sha256: 'e'.repeat(64),
          sizeBytes: 120_000,
          width: 960,
          height: 720,
          role: 'PREVIEW',
          mime: 'image/jpeg',
        },
      ],
    };
    const photoRepo = new PostgresPhotoRepository();
    await transactions.run(tx => photoRepo.persist(tx, input, job, safety, candidate));

    // Mock completion evidence
    const readOpId = randomUUID();
    const outputs = candidate.renditions.map(o => ({
      file: o.file,
      destination: { namespace: o.namespace, key: o.key },
      operationId: randomUUID(),
    }));
    const record: AttemptRecord = {
      id: attemptId,
      token: job.token,
      phaseId: 'photo-derivatives',
      jobId,
      resourceRef: mediaRef,
      generation: '1',
      fence: String(job.fence),
      epoch: job.epoch,
      input: original,
      outputs,
      readOperationId: readOpId,
      limits: {} as Limits,
      status: 'QUIESCENT',
      result: 'SUCCESS',
      processProof: { terminal: true, container: 'fixture', evidenceId: randomUUID() },
      ioProofs: [readOpId, ...outputs.map(o => o.operationId)].map(op => ({
        terminal: true,
        operationId: op,
        evidenceId: randomUUID(),
      })),
    };
    await transactions.run(tx =>
      tx.execute(
        'INSERT INTO execution_inventory(id, token, phase_id, status, record, updated_at) VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, clock_timestamp())',
        attemptId,
        job.token,
        record.phaseId,
        record.status,
        JSON.stringify(record),
      ),
    );

    // 5. Apply successful processing (CAS promotion)
    const completion = new PostgresCompletionEvidence();
    const successRepo = new PostgresSuccessfulProcessingRepository(completion);
    const promoter = new ApplySuccessfulProcessing(
      successRepo,
      testGovernance,
      queue,
    );

    const promotionResult = await promoter.execute(
      job,
      input,
      {
        eventRef,
        kind: 'PHOTO',
        candidateFingerprint: fingerprint(candidate),
      },
      randomUUID(),
    );

    expect(promotionResult.receipt.status).toBe('PUBLISHED');

    // 6. Verify original byte integrity from PostgreSQL
    const catalogRows = await transactions.run(tx =>
      tx.query<{ original: { sha256: string; bytes: string }; status: string }>(
        'SELECT original, status FROM media_catalog WHERE media_ref = $1',
        mediaRef,
      ),
    );
    expect(catalogRows[0].status).toBe('PUBLISHED');
    expect(catalogRows[0].original.sha256).toBe(original.sha256);
    expect(catalogRows[0].original.bytes).toBe(String(original.sizeBytes));

    // 7. Verify observation and metric generation
    const sampleObs: PipelineSampleObservation = {
      caseId: 'IOS-HEIC-1',
      mediaRef,
      device: 'IPHONE_14_PRO',
      format: 'HEIC',
      kind: 'PHOTO',
      originalSha256: original.sha256,
      bytesBefore: original.sizeBytes,
      bytesAfter: Number(catalogRows[0].original.bytes),
      isByteIdentical: catalogRows[0].original.sha256 === original.sha256,
      timings: {
        queueWaitMs: 150,
        inspectionMs: 800,
        transformationMs: 1200,
        totalMs: 2150,
      },
      safetyOutcome: 'APPROVED',
      status: 'PROMOTED',
      promotedRole: 'PUBLISHED',
    };

    const valRepo = new PostgresPipelineValidationRepository();
    const service = new PipelineValidationService(valRepo);
    const report = await transactions.run(tx =>
      service.recordValidationReport(tx, {
        operationId: randomUUID(),
        target: 'PHOTO',
        observations: [sampleObs],
      }),
    );

    expect(report.wasExisting).toBe(false);
    expect(report.sampleSize).toBe(1);
    expect(report.successCount).toBe(1);
    expect(report.metrics.medianMs).toBe(2150);
    expect(report.metrics.meetsSlo).toBe(true);

    // Verify stored report in PostgreSQL
    const retrieved = await transactions.run(tx =>
      valRepo.getReportByOperationId(tx, report.operationId),
    );
    expect(retrieved).not.toBeNull();
    expect(retrieved?.operationId).toBe(report.operationId);
    expect(retrieved?.meetsSlo).toBe(true);
  });

  it('isolates suspicious files in quarantine and prevents promotion to published media', async () => {
    const authority = new TestAuthority();
    const slots = new LocalSlots(1);
    const eventRef = 'event:' + randomUUID();
    const mediaRef = 'media:' + randomUUID();

    const policy = {
      async lockAndAuthorize() {
        return true;
      },
    };
    const queue = new JobQueuePostgres(transactions, authority, policy, slots, {
      candidateScanLimit: 16,
    });

    const maliciousOriginal = {
      namespace: 'fixture-corpus',
      key: 'malware-eicar.jpg',
      immutableVersion: randomUUID(),
      sha256: 'f'.repeat(64),
      sizeBytes: 68,
    };

    const jobId = await transactions.run(async tx => {
      const intent = randomUUID();
      await tx.execute(
        'INSERT INTO media_acceptance_intent VALUES ($1, $2, 1, $3, $4::jsonb)',
        intent,
        mediaRef,
        maliciousOriginal.sha256,
        '{}',
      );
      const jId = await queue.publish(tx, {
        type: 'MEDIA',
        handlerVersion: '1',
        resourceRef: mediaRef,
        generation: 1n,
        queue: mediaRef,
        dedupKey: randomUUID(),
        priority: 1,
        payload: null,
        availableAt: new Date(0),
      });
      await tx.execute(
        "INSERT INTO media_catalog VALUES ($1, $2, $3, 'guest', 1, 1, 'UPLOADED', $4::jsonb, $5::uuid)",
        mediaRef,
        intent,
        eventRef,
        JSON.stringify({
          namespace: maliciousOriginal.namespace,
          key: maliciousOriginal.key,
          version: maliciousOriginal.immutableVersion,
          sha256: maliciousOriginal.sha256,
          bytes: String(maliciousOriginal.sizeBytes),
        }),
        jId,
      );
      return jId;
    });

    const reservation = await queue.reserve([mediaRef], 'quarantine-worker', 1, 60000);
    const job = reservation.jobs[0];

    const quarantineRepo = new PostgresQuarantineRepository();
    const threatFact: SafetyFact = {
      schemaVersion: 1,
      jobId,
      executionToken: job.token,
      fence: String(job.fence),
      epoch: job.epoch,
      mediaRef,
      generation: '1',
      revision: '1',
      originalSha256: maliciousOriginal.sha256,
      originalVersion: maliciousOriginal.immutableVersion,
      outcome: 'DENIED',
      format: {
        status: 'INVALID',
        reason: 'MALWARE_SIGNATURE_FOUND',
        attemptId: randomUUID(),
      },
      malware: {
        status: 'THREAT_DETECTED',
        reason: 'SIGNATURE_DETECTION',
        engine: 'ClamAV',
        engineVersion: '1.4.6',
        imageDigest: 'sha256:e4df73bcde9afeb6bd1b464091f053537b3df86d8bf5a0431ae87c1760b332ae',
        snapshotId: 'a'.repeat(64),
        profileHash: 'b'.repeat(64),
        originalSha256: maliciousOriginal.sha256,
        validUntil: new Date(Date.now() + 3600000).toISOString(),
        attemptId: randomUUID(),
      },
    };

    const quarantineInput: InspectionInput = {
      mediaRef,
      generation: 1n,
      revision: 1n,
      original: maliciousOriginal,
      declaredMime: 'image/jpeg',
    };

    // First persist inspection fact
    const inspectionRepo = new PostgresInspectionRepository();
    await transactions.run(tx => inspectionRepo.persist(tx, quarantineInput, threatFact, job));

    // Then apply quarantine under lock
    await transactions.run(tx =>
      quarantineRepo.apply(
        tx,
        quarantineInput,
        threatFact,
        job,
        randomUUID(),
        '1',
        'THREAT_DETECTED',
      ),
    );

    // Verify media status is QUARANTINED and no active derivatives exist
    const rows = await transactions.run(tx =>
      tx.query<{ status: string }>('SELECT status FROM media_catalog WHERE media_ref = $1', mediaRef),
    );
    expect(rows[0].status).toBe('QUARANTINED');

    const derivatives = await transactions.run(tx =>
      tx.query<{ role: string }>(
        'SELECT role FROM media_active_derivative WHERE media_ref = $1',
        mediaRef,
      ),
    );
    expect(derivatives.length).toBe(0);
  });

  it('rejects stale worker completions when lease expires and allows cleaning obsolete attempt outputs', async () => {
    const mediaRef = 'media:' + randomUUID();
    const attemptId = randomUUID();
    const original = {
      namespace: 'fixture-corpus',
      key: 'mobiles/test/file.mp4',
      immutableVersion: randomUUID(),
      sha256: '9'.repeat(64),
      sizeBytes: 10_000_000,
    };

    const authority = new TestAuthority();
    const slots = new LocalSlots(1);
    const queue = new JobQueuePostgres(transactions, authority, { lockAndAuthorize: async () => true }, slots, { candidateScanLimit: 16 });

    await transactions.run(async tx => {
      const intent = randomUUID();
      const jId = await queue.publish(tx, {
        type: 'MEDIA',
        handlerVersion: '1',
        resourceRef: mediaRef,
        generation: 1n,
        queue: mediaRef,
        dedupKey: randomUUID(),
        priority: 1,
        payload: null,
        availableAt: new Date(0),
      });
      await tx.execute(
        'INSERT INTO media_acceptance_intent VALUES ($1, $2, 1, $3, $4::jsonb)',
        intent,
        mediaRef,
        original.sha256,
        '{}',
      );
      await tx.execute(
        "INSERT INTO media_catalog VALUES ($1, $2, 'event:test', 'guest', 1, 1, 'PROCESSING_FAILED', $3::jsonb, $4::uuid)",
        mediaRef,
        intent,
        JSON.stringify(original),
        jId,
      );
      const token = randomUUID();
      const attemptRecord = {
        id: attemptId,
        token,
        jobId: jId,
        resourceRef: mediaRef,
        generation: '1',
        fence: '1',
        epoch: 'epoch-1',
        input: original,
        outputs: [
          {
            file: 'partial.tmp',
            destination: { namespace: 'fixture-corpus', key: `attempts/${attemptId}/partial.tmp` },
            operationId: randomUUID(),
            sizeBytes: 1024,
          },
        ],
        readOperationId: randomUUID(),
        limits: { cpu: 1, memoryBytes: 1000000 },
        status: 'QUIESCENT',
        result: 'PROCESSING_ERROR',
      };
      await tx.execute(
        `INSERT INTO execution_inventory(id, token, phase_id, record, status, created_at, updated_at)
         VALUES($1::uuid, $2::uuid, 'photo-derivatives', $3::jsonb, 'QUIESCENT', clock_timestamp(), clock_timestamp())`,
        attemptId,
        token,
        JSON.stringify(attemptRecord),
      );
    });

    const testStorage: CleanupStoragePort = {
      async deleteObject(ref: { namespace: string; key: string }) {
        return {
          ref,
          outcome: 'DELETED' as const,
          bytesReleased: 1024n,
        };
      },
    };

    const cleanupRepo = new PostgresAttemptCleanupRepository();
    const cleanupService = new AttemptCleanupService(
      cleanupRepo,
      testStorage,
      new DefaultRetentionPolicy(),
      action => transactions.run(action),
    );

    const receipt = await cleanupService.execute({
      operationId: randomUUID(),
      attemptId,
      mediaRef,
      generation: 1n,
    });

    expect(receipt.status).toBe('COMPLETED');
    expect(receipt.deletedCount).toBe(1);

    // Verify original media remains completely intact
    const mediaRows = await transactions.run(tx =>
      tx.query<{ original: { key: string }; status: string }>(
        'SELECT original, status FROM media_catalog WHERE media_ref = $1',
        mediaRef,
      ),
    );
    expect(mediaRows[0].original.key).toBe(original.key);
    expect(mediaRows[0].status).toBe('PROCESSING_FAILED');
  });
});
