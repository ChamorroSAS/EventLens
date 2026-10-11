import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  JobQueuePostgres,
  LocalSlots,
  PrismaTransactions,
  createPrismaClient,
  type RecoveryAuthority,
  type SqlTransaction,
} from '@eventlens/job-queue';
import {
  GetMediaStatusAndCapabilities,
  PostgresMediaStatusRepository,
  MediaStatusError,
  type EventStatusAuthorizer,
  type ActorContext,
} from '../src/media-status.js';
import type { SafetyFact } from '../src/contracts.js';

const client = createPrismaClient(process.env.DATABASE_URL!);
const transactions = new PrismaTransactions(client, 5000);

class Authority implements RecoveryAuthority {
  epoch = 'status-epoch-1';
  reconciled = true;
  available = true;
  barred = false;
  async acquire() {
    if (!this.reconciled || !this.available || this.barred) throw Error('AUTHORITY_UNAVAILABLE');
    const epoch = this.epoch;
    return {
      epoch,
      assertCurrent: () => {
        if (!this.reconciled || !this.available || this.barred || epoch !== this.epoch) {
          throw Error('AUTHORITY_UNAVAILABLE');
        }
      },
      async release() {},
    };
  }
}

class TestEventAuthorizer implements EventStatusAuthorizer {
  async assertAuthorized(
    tx: SqlTransaction,
    scope: { eventRef: string; actor: ActorContext }
  ): Promise<void> {
    const rows = await tx.query<{ organizer_ref: string; barred: boolean }>(
      'SELECT organizer_ref, barred FROM test_event_organizer WHERE event_ref = $1',
      scope.eventRef
    );
    if (!rows.length) {
      throw new MediaStatusError('ACCESS_DENIED');
    }
    if (rows[0].barred) {
      throw new MediaStatusError('BARRED_EVENT');
    }
    if (scope.actor.role === 'ORGANIZER' && rows[0].organizer_ref !== scope.actor.organizerRef) {
      throw new MediaStatusError('ACCESS_DENIED');
    }
  }
}

async function prepareMediaFixture(options: {
  status?: string;
  safetyOutcome?: 'APPROVED' | 'INCONCLUSIVE' | 'DENIED' | 'NONE';
  barred?: boolean;
  guestRef?: string;
} = {}) {
  const authority = new Authority();
  const slots = new LocalSlots(2);
  const eventRef = 'event:' + randomUUID();
  const organizerRef = 'organizer:' + randomUUID();
  const ref = 'media:' + randomUUID();
  const guestRef = options.guestRef ?? 'guest:' + randomUUID();
  const queueName = 'media-status-' + randomUUID();

  // Create event record
  await transactions.run(async tx => {
    await tx.execute(
      'INSERT INTO test_event_organizer(event_ref, organizer_ref, barred) VALUES($1, $2, $3)',
      eventRef,
      organizerRef,
      options.barred ?? false
    );
  });

  const policy = {
    async lockAndAuthorize(tx: SqlTransaction, resourceRef: string, generation: bigint) {
      const rows = await tx.query<{ generation: bigint }>(
        'SELECT generation FROM media_catalog WHERE media_ref=$1 FOR UPDATE',
        resourceRef
      );
      return rows.length > 0 && rows[0].generation === generation;
    },
  };

  const queue = new JobQueuePostgres(transactions, authority, policy, slots, { candidateScanLimit: 16 });

  const jobId = await transactions.run(tx =>
    queue.publish(tx, {
      type: 'MEDIA_INSPECTION',
      handlerVersion: '1',
      resourceRef: ref,
      generation: 1n,
      queue: queueName,
      dedupKey: 'initial:' + randomUUID(),
      priority: 1,
      payload: null,
      availableAt: new Date(0),
    })
  );

  const original = {
    namespace: 'fixture-private',
    key: 'immutable-original/' + randomUUID(),
    immutableVersion: randomUUID(),
    sha256: 'f'.repeat(64),
    sizeBytes: 1024,
  };

  const status = options.status ?? 'PROCESSING_FAILED';

  await transactions.run(async tx => {
    const intent = randomUUID();
    await tx.execute(
      'INSERT INTO media_acceptance_intent VALUES($1, $2, 1, $3, $4::jsonb)',
      intent,
      ref,
      original.sha256,
      '{}'
    );
    await tx.execute(
      'INSERT INTO media_catalog VALUES($1, $2, $3, $4, 1, 1, $5, $6::jsonb, $7::uuid)',
      ref,
      intent,
      eventRef,
      guestRef,
      status,
      JSON.stringify(original),
      jobId
    );
  });

  if (options.safetyOutcome && options.safetyOutcome !== 'NONE') {
    const fact: SafetyFact = {
      schemaVersion: 1,
      jobId,
      executionToken: randomUUID(),
      fence: '1',
      epoch: 'ep1',
      mediaRef: ref,
      generation: '1',
      revision: '1',
      originalSha256: original.sha256,
      originalVersion: original.immutableVersion,
      outcome: options.safetyOutcome,
      format: {
        status: options.safetyOutcome === 'APPROVED' ? 'VALID' : 'INCONCLUSIVE',
        reason: 'INTEGRATION_TEST',
        metadata: {
          format: 'JPEG',
          width: 1024,
          height: 768,
          streams: 1,
          audio: false,
        },
      },
      malware: {
        status: options.safetyOutcome === 'APPROVED' ? 'NO_THREAT_DETECTED' : 'INCONCLUSIVE',
        reason: 'TEST',
        engine: 'ClamAV',
        engineVersion: '1.4.6',
        imageDigest: 'digest',
        snapshotId: 's',
        profileHash: 'p',
      },
    };

    await transactions.run(async tx => {
      await tx.execute(
        'INSERT INTO media_inspection(media_ref, generation, fact) VALUES($1, 1, $2::jsonb)',
        ref,
        JSON.stringify(fact)
      );
    });
  }

  const repository = new PostgresMediaStatusRepository();
  const authorizer = new TestEventAuthorizer();
  const handler = new GetMediaStatusAndCapabilities(transactions, repository, authorizer);

  return { handler, ref, eventRef, organizerRef, guestRef, jobId };
}

beforeAll(async () => {
  await client.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS test_event_organizer(event_ref text PRIMARY KEY, organizer_ref text NOT NULL, barred boolean NOT NULL DEFAULT false)'
  );
});

afterAll(async () => {
  await client.$disconnect();
});

it('Scenario 1: Organizer queries PROCESSING_FAILED with INCONCLUSIVE safety (DEC-075: canRetry=true, canDownloadOriginal=false)', async () => {
  const { handler, ref, eventRef, organizerRef } = await prepareMediaFixture({
    status: 'PROCESSING_FAILED',
    safetyOutcome: 'INCONCLUSIVE',
  });

  const result = await handler.execute({
    mediaRef: ref,
    eventRef,
    actor: { role: 'ORGANIZER', organizerRef },
    operationId: 'op-status-inconclusive',
  });

  expect(result.mediaRef).toBe(ref);
  expect(result.eventRef).toBe(eventRef);
  expect(result.status).toBe('PROCESSING_FAILED');
  expect(result.safety.outcome).toBe('INCONCLUSIVE');
  expect(result.capabilities.canRetry).toBe(true);
  expect(result.capabilities.canDownloadOriginal).toBe(false); // DEC-075 invariant!
  expect(result.capabilities.canView).toBe(true);

  // Verify audit record written to PostgreSQL
  const auditRows = await client.$queryRawUnsafe<any[]>(
    'SELECT * FROM media_status_query_audit WHERE operation_id = $1',
    'op-status-inconclusive'
  );
  expect(auditRows.length).toBe(1);
  expect(auditRows[0].media_ref).toBe(ref);
  expect(auditRows[0].actor_role).toBe('ORGANIZER');
  expect(auditRows[0].safety_outcome).toBe('INCONCLUSIVE');
});

it('Scenario 2: Organizer queries PUBLISHED media with APPROVED safety (canRetry=false, canDownloadOriginal=true)', async () => {
  const { handler, ref, eventRef, organizerRef } = await prepareMediaFixture({
    status: 'PUBLISHED',
    safetyOutcome: 'APPROVED',
  });

  const result = await handler.execute({
    mediaRef: ref,
    eventRef,
    actor: { role: 'ORGANIZER', organizerRef },
    operationId: 'op-status-approved',
  });

  expect(result.status).toBe('PUBLISHED');
  expect(result.safety.outcome).toBe('APPROVED');
  expect(result.capabilities.canRetry).toBe(false);
  expect(result.capabilities.canDownloadOriginal).toBe(true);
  expect(result.capabilities.canView).toBe(true);
});

it('Scenario 3: Organizer queries QUARANTINED media (canRetry=false, canDownloadOriginal=false, canView=false)', async () => {
  const { handler, ref, eventRef, organizerRef } = await prepareMediaFixture({
    status: 'QUARANTINED',
    safetyOutcome: 'DENIED',
  });

  const result = await handler.execute({
    mediaRef: ref,
    eventRef,
    actor: { role: 'ORGANIZER', organizerRef },
  });

  expect(result.status).toBe('QUARANTINED');
  expect(result.safety.outcome).toBe('DENIED');
  expect(result.capabilities.canRetry).toBe(false);
  expect(result.capabilities.canDownloadOriginal).toBe(false);
  expect(result.capabilities.canView).toBe(false);
});

it('Scenario 4: Guest queries their own upload in PROCESSING state ("Mis aportes")', async () => {
  const { handler, ref, eventRef, guestRef } = await prepareMediaFixture({
    status: 'PROCESSING',
    safetyOutcome: 'NONE',
  });

  const result = await handler.execute({
    mediaRef: ref,
    eventRef,
    actor: { role: 'GUEST', guestRef },
  });

  expect(result.status).toBe('PROCESSING');
  expect(result.safety.outcome).toBe('PENDING');
  expect(result.capabilities.canRetry).toBe(false);
  expect(result.capabilities.canDownloadOriginal).toBe(false);
  expect(result.capabilities.canView).toBe(true);
  expect(result.observableProgress).toBeDefined();
  expect(result.observableProgress?.phase).toBe('PENDING');
});

it('Scenario 5: Guest queries another guest media -> rejects with MEDIA_NOT_FOUND (non-enumeration isolation)', async () => {
  const { handler, ref, eventRef } = await prepareMediaFixture({
    status: 'PUBLISHED',
    guestRef: 'guest-original-owner',
  });

  await expect(
    handler.execute({
      mediaRef: ref,
      eventRef,
      actor: { role: 'GUEST', guestRef: 'guest-intruder-123' },
    })
  ).rejects.toMatchObject({ code: 'MEDIA_NOT_FOUND' });
});

it('Scenario 6: Query rejected when event is barred (BARRED_EVENT)', async () => {
  const { handler, ref, eventRef, organizerRef } = await prepareMediaFixture({
    status: 'PROCESSING_FAILED',
    barred: true,
  });

  await expect(
    handler.execute({
      mediaRef: ref,
      eventRef,
      actor: { role: 'ORGANIZER', organizerRef },
    })
  ).rejects.toMatchObject({ code: 'BARRED_EVENT' });
});

it('Scenario 7: Query rejected when organizer is unauthorized (ACCESS_DENIED)', async () => {
  const { handler, ref, eventRef } = await prepareMediaFixture({
    status: 'PUBLISHED',
  });

  await expect(
    handler.execute({
      mediaRef: ref,
      eventRef,
      actor: { role: 'ORGANIZER', organizerRef: 'stranger-organizer' },
    })
  ).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
});
