import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { unzipSync } from 'fflate';
import {
  JobQueuePostgres,
  LocalSlots,
  PrismaTransactions,
  createPrismaClient,
} from '@eventlens/job-queue';
import {
  ExportPreparationWorker,
  ExportRequestService,
  ExportResourcePolicy,
  ExportStorageError
} from '../src/index.js';
import { MemoryStorage, TestAuthority } from './support/memory-storage.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;
const pause = () => new Promise((resolve) => setTimeout(resolve, 60));

describeIntegration('Export preparation worker (PostgreSQL 16 — EL-TK-126)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);
  const sql = (statement: string, ...args: unknown[]) => txs.run((tx) => tx.execute(statement, ...args));
  const query = <T extends object>(statement: string, ...args: unknown[]) => txs.run((tx) => tx.query<T>(statement, ...args));

  const authority = new TestAuthority();
  const queue = new JobQueuePostgres(txs, authority, new ExportResourcePolicy(), new LocalSlots(2), { candidateScanLimit: 16 });
  const requests = new ExportRequestService(txs, undefined, queue);

  const eventId = randomUUID();
  const organizerId = randomUUID();
  const mediaRefs: string[] = [];
  const exportIds: string[] = [];
  let storage: MemoryStorage;

  const worker = (overrides: Record<string, unknown> = {}, revalidator?: any) =>
    new ExportPreparationWorker(queue, txs, storage, {
      owner: 'export-worker-test', exportNamespace: 'exports-private', leaseMs: 5000, heartbeatMs: 1000,
      maxAttempts: 3, retryBackoffMs: 0, targetPartBytes: 3000, ...overrides
    } as any, revalidator ? { revalidator } : {});

  async function insertMedia(status = 'PUBLISHED', content = randomBytes(1000), fileName?: string) {
    const id = randomUUID();
    const mediaRef = `media:${id}`;
    const intentId = `intent:${id}`;
    const jobId = randomUUID();
    mediaRefs.push(mediaRef);
    const key = `k/${id}.jpg`;
    storage.originals.set(`originals/${key}`, content);
    const original = {
      namespace: 'originals', key, version: 'v1', sha256: createHash('sha256').update(content).digest('hex'),
      bytes: String(content.length), fileName: fileName ?? `${id}.jpg`
    };
    await txs.run(async (tx) => {
      await tx.execute(
        `INSERT INTO job_queue (id, dedup_key, fingerprint, type, handler_version, resource_ref, generation, queue, priority, payload, status, available_at)
         VALUES ($1::uuid, $2, 'fp', 'MEDIA_INSPECTION', '1', $3, 1, 'q', 1, '{}'::jsonb, 'COMPLETED', NOW())`,
        jobId, `dedup:${id}`, mediaRef
      );
      await tx.execute(`INSERT INTO media_acceptance_intent (intent_id, media_ref, generation, fingerprint, facts) VALUES ($1, $2, 1, 'fp', '{}'::jsonb)`, intentId, mediaRef);
      await tx.execute(
        `INSERT INTO media_catalog (media_ref, intent_id, event_ref, guest_ref, generation, revision, status, original, job_id)
         VALUES ($1, $2, $3, 'guest:1', 1, 1, $4, $5::jsonb, $6::uuid)`,
        mediaRef, intentId, eventId, status, JSON.stringify(original), jobId
      );
    });
    return { mediaRef, content };
  }

  async function cleanup() {
    for (const id of exportIds.splice(0)) {
      await sql(`DELETE FROM job_receipt WHERE job_id IN (SELECT id FROM job_queue WHERE resource_ref = $1)`, `export:${id}`);
      await sql(`DELETE FROM job_attempt WHERE job_id IN (SELECT id FROM job_queue WHERE resource_ref = $1)`, `export:${id}`);
      await sql(`DELETE FROM job_queue WHERE resource_ref = $1`, `export:${id}`);
    }
    await sql(`DELETE FROM export_part WHERE export_id IN (SELECT id FROM export_request WHERE event_id = $1::uuid)`, eventId);
    await sql(`DELETE FROM export_request_item WHERE export_id IN (SELECT id FROM export_request WHERE event_id = $1::uuid)`, eventId);
    await sql(`DELETE FROM export_request WHERE event_id = $1::uuid`, eventId);
    for (const mediaRef of mediaRefs.splice(0)) {
      await sql(`DELETE FROM media_catalog WHERE media_ref = $1`, mediaRef);
      await sql(`DELETE FROM media_acceptance_intent WHERE media_ref = $1`, mediaRef);
      await sql(`DELETE FROM job_queue WHERE resource_ref = $1`, mediaRef);
    }
    await sql(`DELETE FROM event WHERE id = $1::uuid`, eventId);
  }

  async function requestExport(key = 'k-' + randomUUID()) {
    const result = await requests.requestExport({ eventId, organizerAccountId: organizerId, idempotencyKey: key });
    exportIds.push(result.exportId);
    return result;
  }

  const exportRow = async (id: string) =>
    (await query<any>(`SELECT status, failure_code, prepared_at, manifest_key, generation FROM export_request WHERE id = $1::uuid`, id))[0]!;
  const partRows = (id: string) =>
    query<any>(`SELECT part_number, status, object_key, size_bytes, entry_count FROM export_part WHERE export_id = $1::uuid ORDER BY part_number`, id);
  const jobRow = async (id: string) => (await query<any>(`SELECT status, attempt FROM job_queue WHERE resource_ref = $1`, `export:${id}`))[0]!;

  beforeAll(async () => { await cleanup(); });
  afterAll(async () => { await cleanup(); await client.$disconnect(); });
  beforeEach(async () => {
    await cleanup();
    storage = new MemoryStorage();
    await sql(`INSERT INTO event (id, organizer_id, name, status) VALUES ($1::uuid, $2::uuid, 'Evento', 'ACTIVE')`, eventId, organizerId);
  });

  it('publica el job junto con la solicitud y no deja job si la solicitud se revierte', async () => {
    await insertMedia('PROCESSING');
    await expect(requestExport()).rejects.toMatchObject({ code: 'NO_ELIGIBLE_MEDIA' });
    expect((await query<any>(`SELECT count(*)::int n FROM job_queue WHERE type = 'EXPORT_PREPARE'`))[0].n).toBe(0);

    await insertMedia('PUBLISHED');
    const result = await requestExport();
    const job = await query<any>(`SELECT type, queue, status, dedup_key FROM job_queue WHERE resource_ref = $1`, `export:${result.exportId}`);
    expect(job).toHaveLength(1);
    expect(job[0]).toMatchObject({ type: 'EXPORT_PREPARE', queue: 'exports', status: 'PENDING' });
  });

  it('genera manifiesto y partes numeradas en storage privado con originales exactos', async () => {
    const a = await insertMedia();
    const b = await insertMedia('HIDDEN', randomBytes(777));
    const { exportId } = await requestExport();

    const [outcome] = await worker().runOnce();
    expect(outcome).toMatchObject({ exportId, result: 'PREPARED' });

    const row = await exportRow(exportId);
    expect(row.status).toBe('AVAILABLE'); // published atomically with job completion (EL-TK-127)
    expect(row.prepared_at).not.toBeNull();
    expect(await jobRow(exportId)).toMatchObject({ status: 'COMPLETED' });

    const parts = await partRows(exportId);
    expect(parts.every((p: any) => p.status === 'READY')).toBe(true);
    const files = parts.flatMap((p: any) => Object.values(unzipSync(new Uint8Array(storage.outputs.get(`exports-private/${p.object_key}`)!))));
    const contents = files.map((f) => Buffer.from(f as Uint8Array));
    expect(contents.some((c) => c.equals(a.content))).toBe(true);
    expect(contents.some((c) => c.equals(b.content))).toBe(true);

    expect(storage.manifestKeys(exportId)).toHaveLength(1);
    const manifest = JSON.parse(storage.outputs.get(`exports-private/${row.manifest_key}`)!.toString('utf8'));
    expect(manifest.entries).toHaveLength(2);
    expect(JSON.stringify(manifest)).not.toContain('.jpg'); // no file names in the manifest
    for (const key of storage.partKeys(exportId)) expect(key.startsWith('exports-private/')).toBe(true);
  });

  it('divide en varias partes ZIP sin partir ni alterar archivos y sin colisión por nombre duplicado', async () => {
    const contents: Buffer[] = [];
    for (let i = 0; i < 5; i++) contents.push((await insertMedia('PUBLISHED', randomBytes(1000), 'misma.jpg')).content);
    const { exportId } = await requestExport();
    await worker().runOnce();

    const parts = await partRows(exportId);
    expect(parts.map((p: any) => p.entry_count)).toEqual([2, 2, 1]);
    expect(parts.map((p: any) => p.part_number)).toEqual([1, 2, 3]);
    const extracted: Buffer[] = [];
    for (const p of parts) {
      const files = unzipSync(new Uint8Array(storage.outputs.get(`exports-private/${p.object_key}`)!));
      expect(Object.keys(files)).toHaveLength(p.entry_count);
      for (const f of Object.values(files)) extracted.push(Buffer.from(f));
    }
    expect(extracted).toHaveLength(5);
    for (const original of contents) expect(extracted.some((e) => e.equals(original))).toBe(true);
  });

  it('un reintento no duplica partes válidas ni pierde trazabilidad, y no queda disponible a medias', async () => {
    for (let i = 0; i < 4; i++) await insertMedia();
    const { exportId } = await requestExport();
    let part2Failures = 1;
    storage.failWrite = (ref) => (ref.key.includes('part-0002') && part2Failures-- > 0 ? new ExportStorageError('TEMPORARY') : undefined);

    const [first] = await worker().runOnce();
    expect(first).toMatchObject({ result: 'RETRYING' });
    let row = await exportRow(exportId);
    expect(row.status).toBe('PREPARING');
    expect(row.prepared_at).toBeNull(); // partial output is never declared complete
    let parts = await partRows(exportId);
    expect(parts.map((p: any) => p.status)).toEqual(['READY', 'PENDING']);
    expect(storage.partKeys(exportId)).toHaveLength(1); // failed partial output was removed

    await pause();
    const [second] = await worker().runOnce();
    expect(second).toMatchObject({ result: 'PREPARED' });
    parts = await partRows(exportId);
    expect(parts.map((p: any) => p.status)).toEqual(['READY', 'READY']);
    expect(storage.writes.filter((w) => w.includes('part-0001'))).toHaveLength(1); // valid part reused
    expect(storage.partKeys(exportId)).toHaveLength(2);
    expect((await jobRow(exportId)).attempt).toBe(2);
    expect((await exportRow(exportId)).prepared_at).not.toBeNull();
  });

  it('agotado el presupuesto de intentos queda FAILED/DEAD y limpia las salidas', async () => {
    for (let i = 0; i < 4; i++) await insertMedia();
    const { exportId } = await requestExport();
    storage.failWrite = (ref) => (ref.key.includes('part-0002') ? new ExportStorageError('TEMPORARY') : undefined);

    expect((await worker({ maxAttempts: 2 }).runOnce())[0]).toMatchObject({ result: 'RETRYING' });
    await pause();
    expect((await worker({ maxAttempts: 2 }).runOnce())[0]).toMatchObject({ result: 'DEAD', code: 'RETRIES_EXHAUSTED' });

    expect(await exportRow(exportId)).toMatchObject({ status: 'FAILED', failure_code: 'RETRIES_EXHAUSTED' });
    expect((await jobRow(exportId)).status).toBe('DEAD');
    expect(storage.partKeys(exportId)).toHaveLength(0);
    expect((await partRows(exportId)).some((p: any) => p.status === 'READY')).toBe(false);
  });

  it('no prepara si una media del snapshot fue retirada antes de preparar (invalidación, no fallo)', async () => {
    const first = await insertMedia();
    await insertMedia();
    const { exportId } = await requestExport();
    await sql(`UPDATE media_catalog SET status = 'TRASHED' WHERE media_ref = $1`, first.mediaRef);

    expect((await worker().runOnce())[0]).toMatchObject({ result: 'INVALIDATED', code: 'MEDIA_WITHDRAWN' });
    expect(await exportRow(exportId)).toMatchObject({ status: 'INVALIDATED', failure_code: 'MEDIA_WITHDRAWN' });
    expect(storage.writes).toHaveLength(0);
    expect((await jobRow(exportId)).status).toBe('FAILED');
  });

  it('revalida antes de promover: un permiso revocado durante la preparación invalida y limpia todo', async () => {
    for (let i = 0; i < 4; i++) await insertMedia();
    const { exportId } = await requestExport();
    storage.onWritten = async (ref) => {
      if (ref.key.includes('part-0001')) await sql(`UPDATE event SET status = 'SUSPENDED' WHERE id = $1::uuid`, eventId);
    };

    expect((await worker().runOnce())[0]).toMatchObject({ result: 'INVALIDATED', code: 'EVENT_ACCESS_REVOKED' });
    expect(await exportRow(exportId)).toMatchObject({ status: 'INVALIDATED' });
    expect(storage.partKeys(exportId)).toHaveLength(0);
    expect(storage.manifestKeys(exportId)).toHaveLength(0);
    expect((await exportRow(exportId)).prepared_at).toBeNull();
  });

  it('falla de forma terminal si un original no coincide con el manifiesto o falta, sin dejar salidas', async () => {
    const corrupt = await insertMedia();
    await insertMedia();
    const { exportId } = await requestExport();
    storage.corrupt.add(`originals/k/${corrupt.mediaRef.replace('media:', '')}.jpg`);
    expect((await worker().runOnce())[0]).toMatchObject({ result: 'FAILED', code: 'SOURCE_CHECKSUM_MISMATCH' });
    expect(await exportRow(exportId)).toMatchObject({ status: 'FAILED', failure_code: 'SOURCE_CHECKSUM_MISMATCH' });
    expect(storage.partKeys(exportId)).toHaveLength(0);
  });

  it('un original ausente es un fallo terminal SOURCE_MISSING', async () => {
    const gone = await insertMedia();
    const { exportId } = await requestExport();
    storage.missing.add(`originals/k/${gone.mediaRef.replace('media:', '')}.jpg`);
    expect((await worker().runOnce())[0]).toMatchObject({ result: 'FAILED', code: 'SOURCE_MISSING' });
    expect((await exportRow(exportId)).status).toBe('FAILED');
  });

  it('un worker que pierde el lease no promueve sus salidas', async () => {
    for (let i = 0; i < 2; i++) await insertMedia();
    const { exportId } = await requestExport();
    storage.onWritten = async () => {
      await sql(`UPDATE job_queue SET cancelled = true WHERE resource_ref = $1`, `export:${exportId}`);
    };
    expect((await worker().runOnce())[0]).toMatchObject({ result: 'ABANDONED' });
    expect((await partRows(exportId)).some((p: any) => p.status === 'READY')).toBe(false);
    expect(storage.partKeys(exportId)).toHaveLength(0);
    expect((await exportRow(exportId)).prepared_at).toBeNull();
  });

  it('una exportación terminal no vuelve a reservarse', async () => {
    await insertMedia();
    const { exportId } = await requestExport();
    await sql(`UPDATE export_request SET status = 'FAILED' WHERE id = $1::uuid`, exportId);
    expect(await worker().runOnce()).toHaveLength(0);
  });
});
