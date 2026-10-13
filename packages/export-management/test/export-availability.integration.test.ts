import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { JobQueuePostgres, LocalSlots, PrismaTransactions, createPrismaClient } from '@eventlens/job-queue';
import {
  EXPORT_AVAILABILITY_HOURS,
  ExportAvailabilityService,
  ExportCleanupWorker,
  ExportExpiryReconciler,
  ExportPreparationWorker,
  ExportRequestService,
  ExportResourcePolicy,
  ExportStorageError,
  isExportAvailable,
  type ExportAuditEvent,
  type ExportLifecycleNotice
} from '../src/index.js';
import { MemoryStorage, TestAuthority } from './memory-storage.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;
const pause = () => new Promise((resolve) => setTimeout(resolve, 60));

describe('isExportAvailable (EL-TK-127)', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  it('exige estado AVAILABLE y ventana vigente', () => {
    expect(isExportAvailable({ status: 'AVAILABLE', expiresAt: new Date('2026-10-12T12:00:01Z') }, now)).toBe(true);
    expect(isExportAvailable({ status: 'AVAILABLE', expiresAt: new Date('2026-10-12T12:00:00Z') }, now)).toBe(false);
    expect(isExportAvailable({ status: 'AVAILABLE', expiresAt: null }, now)).toBe(false);
    for (const status of ['REQUESTED', 'PREPARING', 'FAILED', 'EXPIRED', 'INVALIDATED']) {
      expect(isExportAvailable({ status, expiresAt: new Date('2027-01-01T00:00:00Z') }, now)).toBe(false);
    }
  });
});

describeIntegration('Export availability and expiry (PostgreSQL 16 — EL-TK-127)', () => {
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
  let audits: ExportAuditEvent[];
  let notices: ExportLifecycleNotice[];
  let failNotifier = false;

  const notifier = {
    async exportAvailable(_tx: unknown, notice: ExportLifecycleNotice) {
      if (failNotifier) throw new Error('notifier down');
      notices.push(notice);
    }
  };
  const auditSink = { record: async (e: ExportAuditEvent) => { audits.push(e); } };

  const prepWorker = () => new ExportPreparationWorker(queue, txs, storage, {
    owner: 'export-worker-test', exportNamespace: 'exports-private', leaseMs: 5000, heartbeatMs: 1000,
    maxAttempts: 3, retryBackoffMs: 0, targetPartBytes: 3000
  }, { auditSink, notifier: notifier as any });
  const cleanupWorker = () => new ExportCleanupWorker(queue, txs, storage, { owner: 'export-cleanup-test', leaseMs: 5000, maxAttempts: 2, retryBackoffMs: 0 }, auditSink);
  const reconciler = () => new ExportExpiryReconciler(txs, queue, auditSink);

  async function insertMedia() {
    const id = randomUUID();
    const mediaRef = `media:${id}`;
    const intentId = `intent:${id}`;
    const jobId = randomUUID();
    const content = randomBytes(1000);
    mediaRefs.push(mediaRef);
    const key = `k/${id}.jpg`;
    storage.originals.set(`originals/${key}`, content);
    const original = { namespace: 'originals', key, version: 'v1', sha256: createHash('sha256').update(content).digest('hex'), bytes: '1000', fileName: `${id}.jpg` };
    await txs.run(async (tx) => {
      await tx.execute(
        `INSERT INTO job_queue (id, dedup_key, fingerprint, type, handler_version, resource_ref, generation, queue, priority, payload, status, available_at)
         VALUES ($1::uuid, $2, 'fp', 'MEDIA_INSPECTION', '1', $3, 1, 'q', 1, '{}'::jsonb, 'COMPLETED', NOW())`, jobId, `dedup:${id}`, mediaRef);
      await tx.execute(`INSERT INTO media_acceptance_intent (intent_id, media_ref, generation, fingerprint, facts) VALUES ($1, $2, 1, 'fp', '{}'::jsonb)`, intentId, mediaRef);
      await tx.execute(
        `INSERT INTO media_catalog (media_ref, intent_id, event_ref, guest_ref, generation, revision, status, original, job_id)
         VALUES ($1, $2, $3, 'guest:1', 1, 1, 'PUBLISHED', $4::jsonb, $5::uuid)`, mediaRef, intentId, eventId, JSON.stringify(original), jobId);
    });
  }

  async function cleanup() {
    for (const id of exportIds.splice(0)) {
      for (const ref of [`export:${id}`, `export-cleanup:${id}`]) {
        await sql(`DELETE FROM job_receipt WHERE job_id IN (SELECT id FROM job_queue WHERE resource_ref = $1)`, ref);
        await sql(`DELETE FROM job_attempt WHERE job_id IN (SELECT id FROM job_queue WHERE resource_ref = $1)`, ref);
        await sql(`DELETE FROM job_queue WHERE resource_ref = $1`, ref);
      }
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

  /** Prepared and AVAILABLE export with 3 parts (5 files, 2 per part target). */
  async function availableExport(files = 5) {
    for (let i = 0; i < files; i++) await insertMedia();
    const { exportId } = await requests.requestExport({ eventId, organizerAccountId: organizerId, idempotencyKey: 'k-' + randomUUID() });
    exportIds.push(exportId);
    const [outcome] = await prepWorker().runOnce();
    expect(outcome).toMatchObject({ result: 'PREPARED' });
    return exportId;
  }

  const row = async (id: string) => (await query<any>(`SELECT status, available_at, expires_at, expired_at, prepared_at, manifest_key,
    EXTRACT(EPOCH FROM (expires_at - available_at))::float8 AS window_seconds FROM export_request WHERE id = $1::uuid`, id))[0]!;
  const jobs = (id: string, ref = `export-cleanup:${id}`) => query<any>(`SELECT status FROM job_queue WHERE resource_ref = $1`, ref);
  const makeDue = (id: string) => sql(`UPDATE export_request SET available_at = clock_timestamp() - interval '49 hours', expires_at = clock_timestamp() - interval '1 hour' WHERE id = $1::uuid`, id);

  beforeAll(async () => { await cleanup(); });
  afterAll(async () => { await cleanup(); await client.$disconnect(); });
  beforeEach(async () => {
    await cleanup();
    storage = new MemoryStorage();
    audits = [];
    notices = [];
    failNotifier = false;
    await sql(`INSERT INTO event (id, organizer_id, name, status) VALUES ($1::uuid, $2::uuid, 'Evento', 'ACTIVE')`, eventId, organizerId);
  });

  it('marca AVAILABLE con ventana de 48 h al completar todas las partes y avisa una sola vez', async () => {
    const exportId = await availableExport();
    const r = await row(exportId);
    expect(r.status).toBe('AVAILABLE');
    expect(r.available_at).not.toBeNull();
    expect(r.window_seconds).toBeCloseTo(EXPORT_AVAILABILITY_HOURS * 3600, 3);
    expect(r.manifest_key).not.toBeNull();

    const parts = await query<any>(`SELECT status, size_bytes FROM export_part WHERE export_id = $1::uuid`, exportId);
    expect(parts).toHaveLength(3);
    expect(parts.every((p: any) => p.status === 'READY' && Number(p.size_bytes) > 0)).toBe(true);

    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ exportId, organizerId, partCount: 3 });
    const availableAudit = audits.filter((a) => a.procedure === 'EXPORT_AVAILABLE');
    expect(availableAudit).toHaveLength(1);
    expect(availableAudit[0]).toMatchObject({ partCount: 3 });
    expect(JSON.stringify(audits)).not.toContain('exports/');
  });

  it('no declara AVAILABLE una exportación parcial por la mera existencia de partes', async () => {
    for (let i = 0; i < 4; i++) await insertMedia();
    const { exportId } = await requests.requestExport({ eventId, organizerAccountId: organizerId, idempotencyKey: 'k-' + randomUUID() });
    exportIds.push(exportId);
    storage.failWrite = (ref) => (ref.key.includes('part-0002') ? new ExportStorageError('TEMPORARY') : undefined);
    expect((await prepWorker().runOnce())[0]).toMatchObject({ result: 'RETRYING' });

    const service = new ExportAvailabilityService(txs, auditSink, notifier as any);
    await expect(service.publish(exportId)).rejects.toMatchObject({ code: 'PARTS_INCOMPLETE' });
    expect((await row(exportId)).status).toBe('PREPARING');
    expect(notices).toHaveLength(0);
  });

  it('un reintento o replay no mueve la ventana ni duplica avisos', async () => {
    const exportId = await availableExport();
    const before = await row(exportId);
    const service = new ExportAvailabilityService(txs, auditSink, notifier as any);
    const again = await service.publish(exportId);
    expect(again.publishedNow).toBe(false);
    expect(again.expiresAt.getTime()).toBe(new Date(before.expires_at).getTime());
    expect(notices).toHaveLength(1);
    expect(audits.filter((a) => a.procedure === 'EXPORT_AVAILABLE')).toHaveLength(1);
  });

  it('rechaza manifiesto inconsistente o parte faltante y no publica', async () => {
    const exportId = await availableExport();
    const service = new ExportAvailabilityService(txs);
    const revert = () => sql(`UPDATE export_request SET status = 'PREPARING' WHERE id = $1::uuid`, exportId);

    await revert();
    await sql(`UPDATE export_request SET manifest_key = NULL WHERE id = $1::uuid`, exportId);
    await expect(service.publish(exportId)).rejects.toMatchObject({ code: 'MANIFEST_INCONSISTENT' });
    await sql(`UPDATE export_request SET manifest_key = 'exports/x/manifest.json' WHERE id = $1::uuid`, exportId);

    await sql(`UPDATE export_request_item SET part_number = NULL WHERE export_id = $1::uuid AND position = 1`, exportId);
    await expect(service.publish(exportId)).rejects.toMatchObject({ code: 'MANIFEST_INCONSISTENT' });
    await sql(`UPDATE export_request_item SET part_number = 1 WHERE export_id = $1::uuid AND position = 1`, exportId);

    await sql(`UPDATE export_part SET entry_count = 1 WHERE export_id = $1::uuid AND part_number = 1`, exportId);
    await expect(service.publish(exportId)).rejects.toMatchObject({ code: 'MANIFEST_INCONSISTENT' });
    await sql(`UPDATE export_part SET entry_count = 2 WHERE export_id = $1::uuid AND part_number = 1`, exportId);

    await sql(`UPDATE export_part SET status = 'FAILED', object_key = NULL, object_namespace = NULL WHERE export_id = $1::uuid AND part_number = 2`, exportId);
    await expect(service.publish(exportId)).rejects.toMatchObject({ code: 'PARTS_INCOMPLETE' });
    expect((await row(exportId)).status).toBe('PREPARING');
  });

  it('si el aviso falla, la disponibilidad se revierte junto con el job y se publica en el reintento', async () => {
    for (let i = 0; i < 2; i++) await insertMedia();
    const { exportId } = await requests.requestExport({ eventId, organizerAccountId: organizerId, idempotencyKey: 'k-' + randomUUID() });
    exportIds.push(exportId);
    failNotifier = true;
    expect((await prepWorker().runOnce())[0]).toMatchObject({ result: 'RETRYING' });
    let r = await row(exportId);
    expect(r.status).toBe('PREPARING');
    expect(r.prepared_at).toBeNull(); // state change and job completion rolled back together

    failNotifier = false;
    await pause();
    expect((await prepWorker().runOnce())[0]).toMatchObject({ result: 'PREPARED' });
    r = await row(exportId);
    expect(r.status).toBe('AVAILABLE');
    expect(notices).toHaveLength(1);
  });

  it('una exportación terminal no se publica como disponible', async () => {
    const exportId = await availableExport(2);
    await sql(`UPDATE export_request SET status = 'FAILED' WHERE id = $1::uuid`, exportId);
    await expect(new ExportAvailabilityService(txs).publish(exportId)).rejects.toMatchObject({ code: 'NOT_PUBLISHABLE' });
    await expect(new ExportAvailabilityService(txs).publish(randomUUID())).rejects.toMatchObject({ code: 'EXPORT_NOT_FOUND' });
  });

  it('al llegar expiresAt pasa a EXPIRED, deja de emitir grants y encola un cleanup idempotente', async () => {
    const exportId = await availableExport();
    expect((await reconciler().reconcile()).expiredExportIds).not.toContain(exportId); // not due yet
    expect((await row(exportId)).status).toBe('AVAILABLE');

    await makeDue(exportId);
    const before = await row(exportId);
    expect(isExportAvailable({ status: before.status, expiresAt: before.expires_at }, new Date())).toBe(false); // blocked even before reconcile

    expect((await reconciler().reconcile()).expiredExportIds).toEqual([exportId]);
    const after = await row(exportId);
    expect(after.status).toBe('EXPIRED');
    expect(after.expired_at).not.toBeNull();
    expect(isExportAvailable({ status: after.status, expiresAt: after.expires_at }, new Date())).toBe(false);
    expect(audits.filter((a) => a.procedure === 'EXPORT_EXPIRED')).toHaveLength(1);

    expect((await reconciler().reconcile()).expiredExportIds).toEqual([]);
    expect(await jobs(exportId)).toHaveLength(1);
  });

  it('reconcilers simultáneos expiran una sola vez', async () => {
    const exportId = await availableExport(2);
    await makeDue(exportId);
    const results = await Promise.all([reconciler().reconcile(), reconciler().reconcile(), reconciler().reconcile()]);
    expect(results.flatMap((r) => r.expiredExportIds)).toEqual([exportId]);
    expect(await jobs(exportId)).toHaveLength(1);
  });

  it('el cleanup elimina partes y manifiesto, conserva metadatos de tamaño y no deshace la expiración', async () => {
    const exportId = await availableExport();
    expect(storage.partKeys(exportId)).toHaveLength(3);
    await makeDue(exportId);
    await reconciler().reconcile();

    expect((await cleanupWorker().runOnce())[0]).toMatchObject({ exportId, result: 'CLEANED', deletedObjects: 4 });
    expect(storage.partKeys(exportId)).toHaveLength(0);
    expect(storage.manifestKeys(exportId)).toHaveLength(0);
    const parts = await query<any>(`SELECT status, object_key, size_bytes FROM export_part WHERE export_id = $1::uuid`, exportId);
    expect(parts.every((p: any) => p.status === 'EXPIRED' && p.object_key === null && Number(p.size_bytes) > 0)).toBe(true);
    expect((await row(exportId)).status).toBe('EXPIRED');
    expect((await jobs(exportId))[0].status).toBe('COMPLETED');
    expect(await cleanupWorker().runOnce()).toHaveLength(0);
  });

  it('un cleanup que falla se reintenta sin afectar el estado EXPIRED', async () => {
    const exportId = await availableExport(2);
    await makeDue(exportId);
    await reconciler().reconcile();
    let failures = 1;
    storage.failDelete = () => (failures-- > 0 ? new Error('storage down') : undefined);

    expect((await cleanupWorker().runOnce())[0]).toMatchObject({ result: 'RETRYING' });
    expect((await row(exportId)).status).toBe('EXPIRED');
    await pause();
    expect((await cleanupWorker().runOnce())[0]).toMatchObject({ result: 'CLEANED' });
    expect(storage.partKeys(exportId)).toHaveLength(0);
  });

  it('el cleanup agotado queda DEAD para alertar, sin reabrir la exportación', async () => {
    const exportId = await availableExport(2);
    await makeDue(exportId);
    await reconciler().reconcile();
    storage.failDelete = () => new Error('storage down');
    expect((await cleanupWorker().runOnce())[0]).toMatchObject({ result: 'RETRYING' });
    await pause();
    expect((await cleanupWorker().runOnce())[0]).toMatchObject({ result: 'DEAD' });
    expect((await jobs(exportId))[0].status).toBe('DEAD');
    expect((await row(exportId)).status).toBe('EXPIRED');
  });
});
