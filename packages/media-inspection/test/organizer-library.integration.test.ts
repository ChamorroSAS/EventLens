import { beforeAll, afterAll, it, expect, describe } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  PrismaTransactions,
  createPrismaClient,
  type SqlTransaction
} from '@eventlens/job-queue';
import {
  OrganizerMediaLibraryService,
  PostgresOrganizerMediaLibraryRepository,
  MediaLibraryError
} from '../src/organizer-library.js';
import type { EventStatusAuthorizer } from '../src/media-status.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('OrganizerMediaLibraryService Integration Tests (PostgreSQL 16 — EL-TK-098)', () => {
  const client = createPrismaClient(databaseUrl!);
  const transactions = new PrismaTransactions(client, 5000);
  const repository = new PostgresOrganizerMediaLibraryRepository();

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
        throw new MediaLibraryError('EVENT_NOT_FOUND');
      }
      if (rows[0].organizer_ref !== scope.actor.organizerRef) {
        throw new MediaLibraryError('ACCESS_DENIED');
      }
    }
  }

  const authorizer = new TestAuthorizer();
  const service = new OrganizerMediaLibraryService(transactions, repository, authorizer);

  const event1 = 'event:' + randomUUID();
  const event2 = 'event:' + randomUUID();
  const emptyEvent = 'event:' + randomUUID();

  const org1 = 'org:' + randomUUID();
  const org2 = 'org:' + randomUUID();

  beforeAll(async () => {
    await transactions.run(async tx => {
      await tx.execute(
        'CREATE TABLE IF NOT EXISTS test_event_organizer(event_ref text PRIMARY KEY, organizer_ref text NOT NULL, barred boolean NOT NULL DEFAULT false)'
      );

      // Register test events
      await tx.execute(
        'INSERT INTO test_event_organizer(event_ref, organizer_ref) VALUES ($1, $2), ($3, $4), ($5, $6)',
        event1, org1,
        event2, org2,
        emptyEvent, org1
      );

      // Insert media for event 1 (2 items: 1 PUBLISHED, 1 PROCESSING_FAILED)
      const media1 = 'media:' + randomUUID();
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
      await tx.execute(
        `INSERT INTO media_catalog (media_ref, intent_id, event_ref, guest_ref, generation, revision, status, original, job_id)
         VALUES ($1, $2, $3, 'guest:1', 1, 1, 'PUBLISHED', '{"fileName": "boda.jpg", "bytes": 2048}'::jsonb, $4::uuid)`,
        media1, intent1, event1, job1
      );
      await tx.execute(
        `INSERT INTO media_inspection (media_ref, generation, fact)
         VALUES ($1, 1, '{"outcome": "APPROVED"}'::jsonb)`,
        media1
      );

      const media2 = 'media:' + randomUUID();
      const intent2 = 'intent:' + randomUUID();
      const job2 = randomUUID();

      await tx.execute(
        `INSERT INTO job_queue (id, dedup_key, fingerprint, type, handler_version, resource_ref, generation, queue, priority, payload, status, available_at)
         VALUES ($1::uuid, $2, 'fp', 'MEDIA_INSPECTION', '1', $3, 1, 'q', 1, '{}'::jsonb, 'DEAD', NOW())`,
        job2, 'dedup:' + randomUUID(), media2
      );
      await tx.execute(
        `INSERT INTO media_acceptance_intent (intent_id, media_ref, generation, fingerprint, facts)
         VALUES ($1, $2, 1, 'fp', '{}'::jsonb)`,
        intent2, media2
      );
      await tx.execute(
        `INSERT INTO media_catalog (media_ref, intent_id, event_ref, guest_ref, generation, revision, status, original, job_id)
         VALUES ($1, $2, $3, 'guest:2', 1, 1, 'PROCESSING_FAILED', '{"fileName": "error.mp4", "bytes": 4096}'::jsonb, $4::uuid)`,
        media2, intent2, event1, job2
      );
      await tx.execute(
        `INSERT INTO media_inspection (media_ref, generation, fact)
         VALUES ($1, 1, '{"outcome": "INCONCLUSIVE"}'::jsonb)`,
        media2
      );

      // Insert media for event 2 (1 item for Org 2)
      const media3 = 'media:' + randomUUID();
      const intent3 = 'intent:' + randomUUID();
      const job3 = randomUUID();

      await tx.execute(
        `INSERT INTO job_queue (id, dedup_key, fingerprint, type, handler_version, resource_ref, generation, queue, priority, payload, status, available_at)
         VALUES ($1::uuid, $2, 'fp', 'MEDIA_INSPECTION', '1', $3, 1, 'q', 1, '{}'::jsonb, 'COMPLETED', NOW())`,
        job3, 'dedup:' + randomUUID(), media3
      );
      await tx.execute(
        `INSERT INTO media_acceptance_intent (intent_id, media_ref, generation, fingerprint, facts)
         VALUES ($1, $2, 1, 'fp', '{}'::jsonb)`,
        intent3, media3
      );
      await tx.execute(
        `INSERT INTO media_catalog (media_ref, intent_id, event_ref, guest_ref, generation, revision, status, original, job_id)
         VALUES ($1, $2, $3, 'guest:3', 1, 1, 'PUBLISHED', '{"fileName": "event2.jpg", "bytes": 1024}'::jsonb, $4::uuid)`,
        media3, intent3, event2, job3
      );
    });
  });

  afterAll(async () => {
    await client.$disconnect();
  });

  it('devuelve únicamente los medios pertenecientes al evento propio', async () => {
    const snapshot1 = await service.execute({
      organizerRef: org1,
      eventRef: event1,
      statusFilter: 'ALL'
    });

    expect(snapshot1.eventRef).toBe(event1);
    expect(snapshot1.totalCount).toBe(2);
    expect(snapshot1.filterCount).toBe(2);
    expect(snapshot1.items).toHaveLength(2);
    expect(snapshot1.items.every(i => i.eventRef === event1)).toBe(true);

    const snapshot2 = await service.execute({
      organizerRef: org2,
      eventRef: event2,
      statusFilter: 'ALL'
    });

    expect(snapshot2.eventRef).toBe(event2);
    expect(snapshot2.totalCount).toBe(1);
    expect(snapshot2.filterCount).toBe(1);
    expect(snapshot2.items).toHaveLength(1);
    expect(snapshot2.items[0].eventRef).toBe(event2);
  });

  it('deniega la consulta si el organizador no es propietario del evento', async () => {
    await expect(
      service.execute({
        organizerRef: org1,
        eventRef: event2 // Org1 intenta ver event2 de Org2
      })
    ).rejects.toMatchObject({
      code: 'ACCESS_DENIED'
    });
  });

  it('retorna EMPTY_LIBRARY cuando el evento no tiene medios registrados', async () => {
    const snapshot = await service.execute({
      organizerRef: org1,
      eventRef: emptyEvent,
      statusFilter: 'ALL'
    });

    expect(snapshot.totalCount).toBe(0);
    expect(snapshot.filterCount).toBe(0);
    expect(snapshot.items).toHaveLength(0);
    expect(snapshot.emptyReason).toBe('EMPTY_LIBRARY');
  });

  it('retorna EMPTY_FILTER_RESULTS cuando hay medios pero ninguno coincide con el filtro', async () => {
    const snapshot = await service.execute({
      organizerRef: org1,
      eventRef: event1,
      statusFilter: 'QUARANTINED' // Event1 tiene PUBLISHED y PROCESSING_FAILED, pero no QUARANTINED
    });

    expect(snapshot.totalCount).toBe(2);
    expect(snapshot.filterCount).toBe(0);
    expect(snapshot.items).toHaveLength(0);
    expect(snapshot.emptyReason).toBe('EMPTY_FILTER_RESULTS');
  });

  it('filtra correctamente por estado y calcula capacidades autorizadas', async () => {
    const snapshot = await service.execute({
      organizerRef: org1,
      eventRef: event1,
      statusFilter: 'PROCESSING_FAILED'
    });

    expect(snapshot.totalCount).toBe(2);
    expect(snapshot.filterCount).toBe(1);
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0].status).toBe('PROCESSING_FAILED');
    expect(snapshot.items[0].capabilities.canRetry).toBe(true);
    expect(snapshot.items[0].capabilities.canDownloadOriginal).toBe(false);
  });
});
