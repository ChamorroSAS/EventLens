import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { JobQueuePostgres, LocalSlots, PrismaTransactions, createPrismaClient } from '@eventlens/job-queue';
import {
  ExportCleanupWorker,
  ExportInvalidationService,
  ExportPreparationWorker,
  ExportRequestService,
  ExportResourcePolicy,
  type ExportAuditEvent,
  type ExportLifecycleNotice
} from '../src/index.js';
import { MemoryStorage, TestAuthority } from './memory-storage.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('Export Invalidation (PostgreSQL 16 — EL-TK-128 / DEC-090)', () => {
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

  const notifier = {
    async exportAvailable(_tx: unknown, notice: ExportLifecycleNotice) {
      notices.push(notice);
    }
  };
  const auditSink = { record: async (e: ExportAuditEvent) => { audits.push(e); } };

  const prepWorker = () => new ExportPreparationWorker(queue, txs, storage, {
    owner: 'export-prep-test', exportNamespace: 'exports-private', leaseMs: 5000, heartbeatMs: 1000,
    maxAttempts: 3, retryBackoffMs: 0, targetPartBytes: 3000
  }, { auditSink, notifier: notifier as any });

  const cleanupWorker = () => new ExportCleanupWorker(queue, txs, storage, {
    owner: 'export-cleanup-test', leaseMs: 5000, maxAttempts: 2, retryBackoffMs: 0
  }, auditSink);

  const invalidationService = () => new ExportInvalidationService(txs, {
    auditSink,
    jobPublisher: queue,
    clock: () => new Date()
  });

  async function insertMedia() {
    const id = randomUUID();
    const mediaRef = `media:${id}`;
    const intentId = `intent:${id}`;
    const jobId = randomUUID();
    const content = randomBytes(1000);
    mediaRefs.push(mediaRef);
    const key = `k/${id}.jpg`;
    storage.originals.set(`originals/${key}`, content);
    const original = {
      namespace: 'originals',
      key,
      version: 'v1',
      sha256: createHash('sha256').update(content).digest('hex'),
      bytes: '1000',
      fileName: `${id}.jpg`
    };
    await txs.run(async (tx) => {
      await tx.execute(
        `INSERT INTO job_queue (id, dedup_key, fingerprint, type, handler_version, resource_ref, generation, queue, priority, payload, status, available_at)
         VALUES ($1::uuid, $2, 'fp', 'MEDIA_INSPECTION', '1', $3, 1, 'q', 1, '{}'::jsonb, 'COMPLETED', NOW())`,
        jobId, `dedup:${id}`, mediaRef
      );
      await tx.execute(
        `INSERT INTO media_acceptance_intent (intent_id, media_ref, generation, fingerprint, facts) VALUES ($1, $2, 1, 'fp', '{}'::jsonb)`,
        intentId, mediaRef
      );
      await tx.execute(
        `INSERT INTO media_catalog (media_ref, intent_id, event_ref, guest_ref, generation, revision, status, original, job_id)
         VALUES ($1, $2, $3, 'guest:1', 1, 1, 'PUBLISHED', $4::jsonb, $5::uuid)`,
        mediaRef, intentId, eventId, JSON.stringify(original), jobId
      );
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
    for (const ref of mediaRefs.splice(0)) {
      await sql(`DELETE FROM media_catalog WHERE media_ref = $1`, ref);
      await sql(`DELETE FROM media_acceptance_intent WHERE media_ref = $1`, ref);
      await sql(`DELETE FROM job_queue WHERE resource_ref = $1`, ref);
    }
  }

  beforeAll(async () => {
    await sql(`INSERT INTO event (id, organizer_id, status) VALUES ($1::uuid, $2::uuid, 'ACTIVE') ON CONFLICT (id) DO NOTHING`, eventId, organizerId);
  });

  afterAll(async () => {
    await cleanup();
    await sql(`DELETE FROM event WHERE id = $1::uuid`, eventId);
    await client.$disconnect();
  });

  beforeEach(async () => {
    storage = new MemoryStorage();
    audits = [];
    notices = [];
    await cleanup();
  });

  it('invalida exportación AVAILABLE si una media es enviada a papelera y ejecuta cleanup', async () => {
    await insertMedia();
    await insertMedia();
    const req = await requests.requestExport({ eventId, organizerAccountId: organizerId, idempotencyKey: 'inv-1' });
    exportIds.push(req.exportId);

    // Prepare export into AVAILABLE
    const prep = await prepWorker().runOnce();
    expect(prep[0]!.result).toBe('PREPARED');

    const beforeInv = (await query<{ status: string }>(`SELECT status FROM export_request WHERE id = $1::uuid`, req.exportId))[0]!;
    expect(beforeInv.status).toBe('AVAILABLE');

    // Organizar retira la primera foto (mueve a TRASHED)
    await sql(`UPDATE media_catalog SET status = 'TRASHED' WHERE media_ref = $1`, mediaRefs[0]);

    // Revalidación detecta el retiro e invalida
    const reval = await invalidationService().revalidateExport(req.exportId);
    expect(reval).toMatchObject({
      exportId: req.exportId,
      status: 'INVALIDATED',
      ok: false,
      invalidatedNow: true,
      code: 'MEDIA_WITHDRAWN'
    });

    const afterInv = (await query<{ status: string; failure_code: string; invalidated_at: Date }>(
      `SELECT status, failure_code, invalidated_at FROM export_request WHERE id = $1::uuid`,
      req.exportId
    ))[0]!;
    expect(afterInv.status).toBe('INVALIDATED');
    expect(afterInv.failure_code).toBe('MEDIA_WITHDRAWN');
    expect(afterInv.invalidated_at).not.toBeNull();

    // Las partes pasan a INVALIDATED
    const parts = await query<{ status: string }>(`SELECT status FROM export_part WHERE export_id = $1::uuid`, req.exportId);
    expect(parts.every((p) => p.status === 'INVALIDATED')).toBe(true);

    // Cleanup worker consume el job encolado y borra los objetos físicos
    const cleanupResult = await cleanupWorker().runOnce();
    expect(cleanupResult[0]!.result).toBe('CLEANED');
    expect(storage.exports.size).toBe(0);
  });

  it('invalidateExportsForMedia invalida activas y no altera expiradas/fallidas', async () => {
    await insertMedia();
    const req = await requests.requestExport({ eventId, organizerAccountId: organizerId, idempotencyKey: 'inv-2' });
    exportIds.push(req.exportId);
    await prepWorker().runOnce();

    const result = await invalidationService().invalidateExportsForMedia(mediaRefs[0]!);
    expect(result.invalidatedCount).toBe(1);
    expect(result.exportIds).toContain(req.exportId);

    const row = (await query<{ status: string }>(`SELECT status FROM export_request WHERE id = $1::uuid`, req.exportId))[0]!;
    expect(row.status).toBe('INVALIDATED');
  });

  it('invalidateExportsForScope implementa barrera de eliminación y recolecta inventario de partes', async () => {
    await insertMedia();
    const req = await requests.requestExport({ eventId, organizerAccountId: organizerId, idempotencyKey: 'inv-3' });
    exportIds.push(req.exportId);
    await prepWorker().runOnce();

    const barrier = await invalidationService().invalidateExportsForScope({
      scopeType: 'EVENT',
      scopeRef: eventId,
      targetEventIds: [eventId],
      requestId: 'del-req-1',
      reason: 'Evento eliminado'
    });

    expect(barrier.invalidatedExportsCount).toBe(1);
    expect(barrier.partsInventory.length).toBeGreaterThanOrEqual(2); // Partes + Manifest
    expect(barrier.partsInventory.some((p) => p.partKind === 'ZIP_PART')).toBe(true);
    expect(barrier.partsInventory.some((p) => p.partKind === 'MANIFEST')).toBe(true);

    const row = (await query<{ status: string; failure_code: string }>(
      `SELECT status, failure_code FROM export_request WHERE id = $1::uuid`,
      req.exportId
    ))[0]!;
    expect(row.status).toBe('INVALIDATED');
    expect(row.failure_code).toBe('DELETION_BARRIER');
  });
});
