import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import { ExportRequestService } from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('ExportRequestService (PostgreSQL 16 — EL-TK-125)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);
  const sql = (statement: string, ...args: unknown[]) => txs.run((tx) => tx.execute(statement, ...args));
  const query = <T extends object>(statement: string, ...args: unknown[]) => txs.run((tx) => tx.query<T>(statement, ...args));
  const service = new ExportRequestService(txs);

  const eventId = randomUUID();
  const otherEventId = randomUUID();
  const organizerId = randomUUID();
  const otherOrganizerId = randomUUID();
  const created: string[] = [];

  async function insertMedia(status: string, opts: { event?: string; bytes?: number | null; fileName?: string } = {}) {
    const id = randomUUID();
    const mediaRef = `media:${id}`;
    const intentId = `intent:${id}`;
    const jobId = randomUUID();
    created.push(mediaRef);
    const original: Record<string, unknown> = {
      namespace: 'originals', key: `k/${id}.jpg`, version: 'v1', sha256: 'a'.repeat(64), fileName: opts.fileName ?? `${id}.jpg`
    };
    if (opts.bytes !== null) original.bytes = String(opts.bytes ?? 1000);
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
        mediaRef, intentId, opts.event ?? eventId, status, JSON.stringify(original), jobId
      );
    });
    return mediaRef;
  }

  async function cleanup() {
    await sql(`DELETE FROM export_request_item WHERE export_id IN (SELECT id FROM export_request WHERE event_id = ANY(ARRAY[$1::uuid, $2::uuid]))`, eventId, otherEventId);
    await sql(`DELETE FROM export_request WHERE event_id = ANY(ARRAY[$1::uuid, $2::uuid])`, eventId, otherEventId);
    for (const mediaRef of created.splice(0)) {
      await sql(`DELETE FROM media_catalog WHERE media_ref = $1`, mediaRef);
      await sql(`DELETE FROM media_acceptance_intent WHERE media_ref = $1`, mediaRef);
      await sql(`DELETE FROM job_queue WHERE resource_ref = $1`, mediaRef);
    }
    await sql(`DELETE FROM event WHERE id = $1::uuid`, eventId);
    await sql(`DELETE FROM event WHERE id = $1::uuid`, otherEventId);
  }

  beforeAll(cleanup);
  afterAll(async () => { await cleanup(); await client.$disconnect(); });
  beforeEach(async () => {
    await cleanup();
    await sql(`INSERT INTO event (id, organizer_id, name, status) VALUES ($1::uuid, $2::uuid, 'Evento A', 'ACTIVE')`, eventId, organizerId);
    await sql(`INSERT INTO event (id, organizer_id, name, status) VALUES ($1::uuid, $2::uuid, 'Evento B', 'ACTIVE')`, otherEventId, otherOrganizerId);
  });

  const request = (key = 'key-' + randomUUID(), overrides: Record<string, unknown> = {}) =>
    service.requestExport({ eventId, organizerAccountId: organizerId, idempotencyKey: key, ...overrides } as any);

  it('fija el manifiesto solo con PUBLISHED/HIDDEN y registra exclusiones', async () => {
    await insertMedia('PUBLISHED', { bytes: 1000 });
    await insertMedia('HIDDEN', { bytes: 2000 });
    for (const status of ['UPLOADED', 'PROCESSING', 'PROCESSING_FAILED', 'PENDING_REVIEW', 'REJECTED', 'TRASHED', 'QUARANTINED']) {
      await insertMedia(status);
    }
    await insertMedia('PUBLISHED', { event: otherEventId });

    const result = await request();
    expect(result).toMatchObject({ status: 'REQUESTED', selectedCount: 2, selectedBytes: 3000n, replayed: false });
    expect(result.exclusions).toEqual({
      UPLOADED: 1, PROCESSING: 1, PROCESSING_FAILED: 1, PENDING_REVIEW: 1, REJECTED: 1, TRASHED: 1, QUARANTINED: 1
    });
    const stored = await query<{ status: string; selected_count: number }>(`SELECT status, selected_count FROM export_request WHERE id = $1::uuid`, result.exportId);
    expect(stored[0]).toMatchObject({ status: 'REQUESTED', selected_count: 2 });
  });

  it('no amplía el snapshot cuando aparece o cambia media después', async () => {
    const first = await insertMedia('PUBLISHED');
    const result = await request();
    await insertMedia('PUBLISHED');
    await sql(`UPDATE media_catalog SET status = 'TRASHED' WHERE media_ref = $1`, first);
    const items = await query<{ media_ref: string }>(`SELECT media_ref FROM export_request_item WHERE export_id = $1::uuid`, result.exportId);
    expect(items.map((i) => i.media_ref)).toEqual([first]);
  });

  it('informa sin crear una exportación vacía', async () => {
    await insertMedia('PROCESSING');
    const error = await request().catch((e) => e);
    expect(error).toMatchObject({ code: 'NO_ELIGIBLE_MEDIA', exclusions: { PROCESSING: 1 } });
    const rows = await query<{ n: number }>(`SELECT count(*)::int n FROM export_request WHERE event_id = $1::uuid`, eventId);
    expect(rows[0]!.n).toBe(0);
  });

  it('excluye como MISSING_ORIGINAL la media publicada sin original completo', async () => {
    await insertMedia('PUBLISHED');
    await insertMedia('PUBLISHED', { bytes: null });
    const result = await request();
    expect(result.selectedCount).toBe(1);
    expect(result.exclusions).toEqual({ MISSING_ORIGINAL: 1 });
  });

  it('es idempotente y detecta una clave reutilizada para otro evento', async () => {
    await insertMedia('PUBLISHED');
    const first = await request('same-key');
    const replay = await request('same-key');
    expect(replay).toMatchObject({ exportId: first.exportId, replayed: true, selectedCount: 1 });
    const rows = await query<{ n: number }>(`SELECT count(*)::int n FROM export_request WHERE event_id = $1::uuid`, eventId);
    expect(rows[0]!.n).toBe(1);

    await sql(`UPDATE event SET organizer_id = $2::uuid WHERE id = $1::uuid`, otherEventId, organizerId);
    await expect(service.requestExport({ eventId: otherEventId, organizerAccountId: organizerId, idempotencyKey: 'same-key' }))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('serializa solicitudes simultáneas: solo una exportación activa por evento', async () => {
    await insertMedia('PUBLISHED');
    const results = await Promise.allSettled([request('a'), request('b'), request('c')]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed.every((r) => r.reason.code === 'EXPORT_IN_PROGRESS')).toBe(true);
  });

  it('aísla por organizador y bloquea eventos suspendidos', async () => {
    await insertMedia('PUBLISHED');
    await expect(service.requestExport({ eventId, organizerAccountId: otherOrganizerId, idempotencyKey: 'k' }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await sql(`UPDATE event SET status = 'SUSPENDED' WHERE id = $1::uuid`, eventId);
    await expect(request()).rejects.toMatchObject({ code: 'EVENT_NOT_ELIGIBLE' });
  });
});
