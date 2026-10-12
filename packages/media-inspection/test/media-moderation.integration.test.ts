import { beforeAll, afterAll, it, expect, describe } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  PrismaTransactions,
  createPrismaClient,
  type SqlTransaction
} from '@eventlens/job-queue';
import {
  MediaModerationService,
  PostgresMediaModerationRepository,
  MediaModerationError
} from '../src/media-moderation.js';
import type { EventStatusAuthorizer } from '../src/media-status.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('MediaModerationService Integration Tests (PostgreSQL 16 — EL-TK-103)', () => {
  const client = createPrismaClient(databaseUrl!);
  const transactions = new PrismaTransactions(client, 5000);
  const repository = new PostgresMediaModerationRepository();

  class TestAuthorizer implements EventStatusAuthorizer {
    async assertAuthorized(
      tx: SqlTransaction,
      scope: { eventRef: string; actor: { role: string; organizerRef?: string } }
    ): Promise<void> {
      const rows = await tx.query<{ organizer_ref: string }>(
        'SELECT organizer_ref FROM test_event_organizer WHERE event_ref = $1',
        scope.eventRef
      );
      if (!rows.length) {
        throw new MediaModerationError('MEDIA_NOT_FOUND');
      }
      if (rows[0].organizer_ref !== scope.actor.organizerRef) {
        throw new MediaModerationError('ACCESS_DENIED');
      }
    }
  }

  const authorizer = new TestAuthorizer();
  const service = new MediaModerationService(transactions, repository, authorizer);

  const event1 = 'event:' + randomUUID();
  const org1 = 'org:' + randomUUID();
  const media1 = 'media:' + randomUUID();

  beforeAll(async () => {
    await transactions.run(async tx => {
      await tx.execute(
        'CREATE TABLE IF NOT EXISTS test_event_organizer(event_ref text PRIMARY KEY, organizer_ref text NOT NULL, barred boolean NOT NULL DEFAULT false)'
      );

      await tx.execute(
        'INSERT INTO test_event_organizer(event_ref, organizer_ref) VALUES ($1, $2)',
        event1,
        org1
      );

      // Insert prerequisite job and intent
      const intent1 = 'intent:' + randomUUID();
      const job1 = randomUUID();
      await tx.execute(
        `INSERT INTO job_queue (id, dedup_key, fingerprint, type, handler_version, resource_ref, generation, queue, priority, payload, status, available_at)
         VALUES ($1::uuid, $2, 'fp', 'MEDIA_INSPECTION', '1', $3, 1, 'q', 1, '{}'::jsonb, 'COMPLETED', NOW())`,
        job1, 'dedup:' + randomUUID(), media1
      );
      await tx.execute(
        `INSERT INTO media_acceptance_intent (intent_id, media_ref, generation, fingerprint, facts)
         VALUES ($1, $2, 1, 'fp', '{}'::jsonb)`,
        intent1, media1
      );

      // Insert dummy media in PENDING_REVIEW
      await tx.execute(
        `INSERT INTO media_catalog (media_ref, intent_id, event_ref, guest_ref, generation, revision, status, original, job_id)
         VALUES ($1, $2, $3, 'guest:1', 1, 1, 'PENDING_REVIEW', '{"name":"foto.jpg"}'::jsonb, $4::uuid)
         ON CONFLICT (media_ref) DO UPDATE SET status = 'PENDING_REVIEW'`,
        media1,
        intent1,
        event1,
        job1
      );

      // Insert safety fact APPROVED
      await tx.execute(
        `INSERT INTO media_inspection (media_ref, generation, fact)
         VALUES ($1, 1, $2::jsonb)
         ON CONFLICT (media_ref, generation) DO NOTHING`,
        media1,
        JSON.stringify({
          schemaVersion: 1,
          jobId: randomUUID(),
          executionToken: randomUUID(),
          fence: '1',
          epoch: '1',
          mediaRef: media1,
          generation: '1',
          revision: '1',
          originalSha256: 'sha256',
          originalVersion: '1',
          outcome: 'APPROVED',
          format: { status: 'VALID', reason: 'ok' },
          malware: { status: 'NO_THREAT_DETECTED', reason: 'clean' }
        })
      );
    });
  });

  afterAll(async () => {
    await transactions.run(async tx => {
      await tx.execute('DELETE FROM audit_event WHERE resource_id = $1', media1);
      await tx.execute('DELETE FROM media_inspection WHERE media_ref = $1', media1);
      await tx.execute('DELETE FROM media_catalog WHERE media_ref = $1', media1);
      await tx.execute('DELETE FROM media_acceptance_intent WHERE media_ref = $1', media1);
      await tx.execute('DELETE FROM test_event_organizer WHERE event_ref = $1', event1);
    });
  });

  it('aprueba exitosamente una media en PENDING_REVIEW y la pasa a PUBLISHED', async () => {
    const res = await service.approveMedia({
      organizerRef: org1,
      eventRef: event1,
      mediaRef: media1
    });

    expect(res.status).toBe('PUBLISHED');
    expect(res.previousStatus).toBe('PENDING_REVIEW');
    expect(res.revision).toBe(2n);

    // Verify row in DB
    await transactions.run(async tx => {
      const rows = await tx.query<{ status: string; revision: bigint }>(
        'SELECT status, revision FROM media_catalog WHERE media_ref = $1',
        media1
      );
      expect(rows[0].status).toBe('PUBLISHED');
      expect(BigInt(rows[0].revision)).toBe(2n);
    });
  });

  it('replay idempotente devuelve PUBLISHED sin error', async () => {
    const res = await service.approveMedia({
      organizerRef: org1,
      eventRef: event1,
      mediaRef: media1
    });

    expect(res.status).toBe('PUBLISHED');
    expect(res.revision).toBe(2n);
  });
});
