import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import { OriginalDownloadGrantService, type ObjectStorageDownloadSigner } from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('OriginalDownloadGrantService (PostgreSQL 16 — EL-TK-124)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);
  const sql = (statement: string, ...args: unknown[]) => txs.run((tx) => tx.execute(statement, ...args));

  const signer: ObjectStorageDownloadSigner = {
    createDownloadUrl: async ({ namespace, key, ttlSeconds }) => `https://s3.local/${namespace}/${key}?exp=${ttlSeconds}`
  };
  const service = new OriginalDownloadGrantService(txs, signer);

  const eventId = randomUUID();
  const otherEventId = randomUUID();
  const organizerId = randomUUID();
  const otherOrganizerId = randomUUID();

  const created: string[] = [];

  async function insertMedia(status: string, outcome: string | null, event = eventId) {
    const id = randomUUID();
    const mediaRef = `media:${id}`;
    const intentId = `intent:${id}`;
    const jobId = randomUUID();
    created.push(mediaRef);
    await txs.run(async (tx) => {
      await tx.execute(
        `INSERT INTO job_queue (id, dedup_key, fingerprint, type, handler_version, resource_ref, generation, queue, priority, payload, status, available_at)
         VALUES ($1::uuid, $2, 'fp', 'MEDIA_INSPECTION', '1', $3, 1, 'q', 1, '{}'::jsonb, 'COMPLETED', NOW())`,
        jobId, `dedup:${id}`, mediaRef
      );
      await tx.execute(
        `INSERT INTO media_acceptance_intent (intent_id, media_ref, generation, fingerprint, facts)
         VALUES ($1, $2, 1, 'fp', '{}'::jsonb)`,
        intentId, mediaRef
      );
      await tx.execute(
        `INSERT INTO media_catalog (media_ref, intent_id, event_ref, guest_ref, generation, revision, status, original, job_id)
         VALUES ($1, $2, $3, 'guest:1', 1, 1, $4, $5::jsonb, $6::uuid)`,
        mediaRef, intentId, event, status,
        JSON.stringify({ namespace: 'originals', key: `k/${id}.jpg`, fileName: 'foto.jpg' }),
        jobId
      );
      if (outcome) {
        await tx.execute(
          `INSERT INTO media_inspection (media_ref, generation, fact) VALUES ($1, 1, $2::jsonb)`,
          mediaRef, JSON.stringify({ outcome })
        );
      }
    });
    return id;
  }

  async function cleanup() {
    for (const mediaRef of created.splice(0)) {
      await sql(`DELETE FROM media_inspection WHERE media_ref = $1`, mediaRef);
      await sql(`DELETE FROM media_catalog WHERE media_ref = $1`, mediaRef);
      await sql(`DELETE FROM media_acceptance_intent WHERE media_ref = $1`, mediaRef);
      await sql(`DELETE FROM job_queue WHERE resource_ref = $1`, mediaRef);
    }
    await sql(`DELETE FROM event WHERE id = $1::uuid`, eventId);
    await sql(`DELETE FROM event WHERE id = $1::uuid`, otherEventId);
  }

  beforeAll(async () => {
    await sql(`CREATE TABLE IF NOT EXISTS event (
      id UUID PRIMARY KEY, organizer_id UUID NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  });

  afterAll(cleanup);

  beforeEach(async () => {
    await cleanup();
    await sql(`INSERT INTO event (id, organizer_id, name, status) VALUES ($1::uuid, $2::uuid, 'Evento A', 'GRACE_PERIOD')`, eventId, organizerId);
    await sql(`INSERT INTO event (id, organizer_id, name, status) VALUES ($1::uuid, $2::uuid, 'Evento B', 'ACTIVE')`, otherEventId, otherOrganizerId);
  });

  it('emite grant para media PUBLISHED aprobada, incluso en periodo de gracia', async () => {
    const id = await insertMedia('PUBLISHED', 'APPROVED');
    const grant = await service.requestOriginalDownloadGrant({ eventId, mediaId: id, organizerAccountId: organizerId });
    expect(grant.downloadUrl).toContain(`originals/k/${id}.jpg`);
  });

  it('emite grant para PROCESSING_FAILED con inspección aprobada y lo deniega si es inconclusa', async () => {
    const ok = await insertMedia('PROCESSING_FAILED', 'APPROVED');
    await expect(service.requestOriginalDownloadGrant({ eventId, mediaId: ok, organizerAccountId: organizerId })).resolves.toBeDefined();
    const inconclusive = await insertMedia('PROCESSING_FAILED', 'INCONCLUSIVE');
    await expect(service.requestOriginalDownloadGrant({ eventId, mediaId: inconclusive, organizerAccountId: organizerId }))
      .rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' });
    const pending = await insertMedia('PROCESSING_FAILED', null);
    await expect(service.requestOriginalDownloadGrant({ eventId, mediaId: pending, organizerAccountId: organizerId }))
      .rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' });
  });

  it('deniega cuarentena aunque exista un hecho aprobado', async () => {
    const id = await insertMedia('QUARANTINED', 'APPROVED');
    await expect(service.requestOriginalDownloadGrant({ eventId, mediaId: id, organizerAccountId: organizerId }))
      .rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' });
  });

  it('aísla por evento y por organizador', async () => {
    const foreignMedia = await insertMedia('PUBLISHED', 'APPROVED', otherEventId);
    await expect(service.requestOriginalDownloadGrant({ eventId, mediaId: foreignMedia, organizerAccountId: organizerId }))
      .rejects.toMatchObject({ code: 'MEDIA_NOT_FOUND' });
    const own = await insertMedia('PUBLISHED', 'APPROVED');
    await expect(service.requestOriginalDownloadGrant({ eventId, mediaId: own, organizerAccountId: otherOrganizerId }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('deniega cuando el evento queda suspendido tras la solicitud previa', async () => {
    const id = await insertMedia('PUBLISHED', 'APPROVED');
    await sql(`UPDATE event SET status = 'SUSPENDED' WHERE id = $1::uuid`, eventId);
    await expect(service.requestOriginalDownloadGrant({ eventId, mediaId: id, organizerAccountId: organizerId }))
      .rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' });
  });
});
