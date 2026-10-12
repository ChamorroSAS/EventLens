import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import type { AdminActorContext } from '@eventlens/identity';
import {
  AdminJobInspectionService,
  type AdminSupportAuditSink
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('AdminJobInspectionService (PostgreSQL 16 Integration Tests — EL-TK-148)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  let auditSink: AdminSupportAuditSink;
  let service: AdminJobInspectionService;
  let adminContext: AdminActorContext;

  beforeAll(async () => {
    await sql(`
      CREATE TABLE IF NOT EXISTS job_queue (
        id UUID PRIMARY KEY,
        dedup_key TEXT UNIQUE NOT NULL,
        fingerprint TEXT NOT NULL,
        type TEXT NOT NULL,
        handler_version TEXT NOT NULL,
        resource_ref TEXT NOT NULL,
        generation BIGINT NOT NULL,
        queue TEXT NOT NULL,
        priority INTEGER NOT NULL,
        payload JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        available_at TIMESTAMPTZ NOT NULL,
        deadline TIMESTAMPTZ,
        attempt INTEGER NOT NULL DEFAULT 0,
        fence BIGINT NOT NULL DEFAULT 0,
        owner TEXT,
        token UUID,
        epoch TEXT,
        lease_until TIMESTAMPTZ,
        cancelled BOOLEAN NOT NULL DEFAULT false
      );
    `);

    await sql(`
      CREATE TABLE IF NOT EXISTS job_attempt (
        token UUID PRIMARY KEY,
        job_id UUID NOT NULL,
        number INTEGER NOT NULL,
        fence BIGINT NOT NULL,
        owner TEXT NOT NULL,
        epoch TEXT NOT NULL,
        generation BIGINT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        ended_at TIMESTAMPTZ,
        result TEXT,
        UNIQUE(job_id, number)
      );
    `);
  });

  beforeEach(async () => {
    auditSink = {
      record: vi.fn(async () => {})
    };

    service = new AdminJobInspectionService(txs, auditSink);

    adminContext = {
      actorType: 'ADMIN_HUMAN',
      principalId: randomUUID(),
      identifier: 'jobs-admin@eventlens.test',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      adminAuthRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };
  });

  it('Consulta lista de jobs filtrada por resource_ref en PostgreSQL 16 (Escenario 1)', async () => {
    const eventId = randomUUID();
    const jobId = randomUUID();
    const tag = 'pg_job_' + Date.now();

    await sql(
      `INSERT INTO job_queue (
        id, dedup_key, fingerprint, type, handler_version, resource_ref, generation, queue, priority, payload, status, available_at, attempt
      ) VALUES (
        $1, $2, 'fp_001', 'MEDIA_EXECUTION', 'v1', $3, 1, 'media', 10, '{}'::jsonb, 'FAILED', NOW(), 2
      )`,
      jobId,
      tag,
      `event:${eventId}`
    );

    await sql(
      `INSERT INTO job_attempt (
        token, job_id, number, fence, owner, epoch, generation, started_at, ended_at, result
      ) VALUES (
        $1, $2, 1, 1, 'worker-1', 'epoch-1', 1, NOW(), NOW(), 'Transient failure'
      ), (
        $3, $2, 2, 2, 'worker-2', 'epoch-1', 1, NOW(), NOW(), 'Worker timeout postgresql://user:secret@localhost:5432/db'
      )`,
      randomUUID(),
      jobId,
      randomUUID()
    );

    const result = await service.queryJobs({
      actorContext: adminContext,
      resourceRef: eventId
    });

    expect(result.items.length).toBe(1);
    expect(result.items[0].id).toBe(jobId);
    expect(result.items[0].status).toBe('FAILED');
    expect(result.items[0].attempts).toBe(2);
    expect(result.items[0].lastError).toContain('[REDACTED_DATABASE_URL]');
    expect(result.items[0].lastError).not.toContain('secret@localhost');
  });

  it('Obtiene detalle completo de un job DEAD con historial de intentos sanitizado (Escenario 2)', async () => {
    const jobId = randomUUID();
    const tag = 'pg_dead_' + Date.now();

    await sql(
      `INSERT INTO job_queue (
        id, dedup_key, fingerprint, type, handler_version, resource_ref, generation, queue, priority, payload, status, available_at, attempt
      ) VALUES (
        $1, $2, 'fp_dead', 'IMAGE_THUMBNAIL', 'v1', 'resource_404', 1, 'media', 5, '{}'::jsonb, 'DEAD', NOW(), 1
      )`,
      jobId,
      tag
    );

    await sql(
      `INSERT INTO job_attempt (
        token, job_id, number, fence, owner, epoch, generation, started_at, ended_at, result
      ) VALUES (
        $1, $2, 1, 1, 'worker-1', 'epoch-1', 1, NOW(), NOW(), 'Unrecoverable format at /workspace/storage/img.png token=secretToken123'
      )`,
      randomUUID(),
      jobId
    );

    const detail = await service.getJobDetail({
      actorContext: adminContext,
      jobId
    });

    expect(detail.id).toBe(jobId);
    expect(detail.status).toBe('DEAD');
    expect(detail.capabilities.canRetry).toBe(true);
    expect(detail.capabilities.canCancel).toBe(false);
    expect(detail.sanitizedError).toContain('[PATH_REDACTED]');
    expect(detail.sanitizedError).toContain('[REDACTED_SECRET]');
    expect(detail.sanitizedError).not.toContain('secretToken123');
  });

  it('Retorna lista vacía distinguible de error si no hay jobs para el recurso (Escenario 3)', async () => {
    const result = await service.queryJobs({
      actorContext: adminContext,
      resourceRef: 'no_jobs_resource_' + Date.now()
    });

    expect(result.items).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.totalPages).toBe(0);
  });
});
