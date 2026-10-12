import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import type { AdminActorContext } from '@eventlens/identity';
import {
  AdminJobActionService,
  AdminSupportError,
  type AdminSupportAuditSink
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('AdminJobActionService (PostgreSQL 16 Integration Tests — EL-TK-149)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  async function querySql<T extends object = Record<string, unknown>>(statement: string, ...args: unknown[]): Promise<T[]> {
    return txs.run((tx) => tx.query<T>(statement, ...args));
  }

  let auditSink: AdminSupportAuditSink;
  let service: AdminJobActionService;
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
      CREATE TABLE IF NOT EXISTS admin_job_action_receipt (
        id UUID PRIMARY KEY,
        job_id UUID NOT NULL,
        action TEXT NOT NULL,
        reason TEXT NOT NULL,
        principal_id TEXT NOT NULL,
        idempotency_key TEXT UNIQUE NOT NULL,
        previous_status TEXT NOT NULL,
        new_status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  });

  beforeEach(async () => {
    auditSink = {
      record: vi.fn(async () => {})
    };

    service = new AdminJobActionService(txs, auditSink);

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

  it('ejecuta RETRY exitosamente sobre job DEAD con justificacion valida y audita recibo', async () => {
    const jobId = randomUUID();
    const dedupKey = 'dedup_' + Date.now() + '_' + Math.random();

    await sql(
      `INSERT INTO job_queue (
        id, dedup_key, fingerprint, type, handler_version, resource_ref, generation, queue, priority, payload, status, available_at, attempt
      ) VALUES (
        $1, $2, 'fp_001', 'MEDIA_EXECUTION', 'v1', 'event:001', 1, 'media', 10, '{}'::jsonb, 'DEAD', NOW(), 3
      )`,
      jobId,
      dedupKey
    );

    const idempotencyKey = 'idem-retry-' + randomUUID();
    const result = await service.executeAction({
      actorContext: adminContext,
      jobId,
      action: 'RETRY',
      reason: 'Reintentando job de procesamiento tras restablecer conectividad',
      idempotencyKey
    });

    expect(result.jobId).toBe(jobId);
    expect(result.action).toBe('RETRY');
    expect(result.previousStatus).toBe('DEAD');
    expect(result.newStatus).toBe('PENDING');
    expect(result.outcome).toBe('EXECUTED');

    // Verificar en DB que el estado cambió
    const rows = await querySql<{ status: string; attempt: number; lease_until: Date | null }>(
      `SELECT status, attempt, lease_until FROM job_queue WHERE id = $1`,
      jobId
    );
    expect(rows[0]?.status).toBe('PENDING');
    expect(rows[0]?.attempt).toBe(0);
    expect(rows[0]?.lease_until).toBeNull();

    // Verificar recibo idempotente
    const receipts = await querySql<{ action: string }>(
      `SELECT * FROM admin_job_action_receipt WHERE idempotency_key = $1`,
      idempotencyKey
    );
    expect(receipts.length).toBe(1);
    expect(receipts[0]?.action).toBe('RETRY');

    // Verificar sink de auditoria
    expect(auditSink.record).toHaveBeenCalledTimes(1);
  });

  it('permite replay idempotente determinista si se reenvia la misma idempotencyKey', async () => {
    const jobId = randomUUID();
    const dedupKey = 'dedup_' + Date.now() + '_' + Math.random();

    await sql(
      `INSERT INTO job_queue (
        id, dedup_key, fingerprint, type, handler_version, resource_ref, generation, queue, priority, payload, status, available_at, attempt
      ) VALUES (
        $1, $2, 'fp_002', 'NOTIFICATION_DISPATCH', 'v1', 'event:002', 1, 'notifications', 10, '{}'::jsonb, 'FAILED', NOW(), 2
      )`,
      jobId,
      dedupKey
    );

    const idempotencyKey = 'idem-replay-' + randomUUID();
    const command = {
      actorContext: adminContext,
      jobId,
      action: 'RETRY' as const,
      reason: 'Reintento tras caida momentanea de webhook',
      idempotencyKey
    };

    const firstRun = await service.executeAction(command);
    expect(firstRun.outcome).toBe('EXECUTED');

    const secondRun = await service.executeAction(command);
    expect(secondRun.outcome).toBe('IDEMPOTENT_REPLAY');
    expect(secondRun.jobId).toBe(jobId);
    expect(secondRun.newStatus).toBe('PENDING');
  });

  it('deniega CANCEL sobre un job en PROCESSING con lease vigente', async () => {
    const jobId = randomUUID();
    const dedupKey = 'dedup_' + Date.now() + '_' + Math.random();

    await sql(
      `INSERT INTO job_queue (
        id, dedup_key, fingerprint, type, handler_version, resource_ref, generation, queue, priority, payload, status, available_at, attempt, lease_until
      ) VALUES (
        $1, $2, 'fp_003', 'ZIP_EXPORT', 'v1', 'event:003', 1, 'exports', 10, '{}'::jsonb, 'PROCESSING', NOW(), 1, NOW() + INTERVAL '1 hour'
      )`,
      jobId,
      dedupKey
    );

    await expect(
      service.executeAction({
        actorContext: adminContext,
        jobId,
        action: 'CANCEL',
        reason: 'Cancelacion forzada de exportacion activa',
        idempotencyKey: 'idem-cancel-' + randomUUID()
      })
    ).rejects.toThrowError(AdminSupportError);
  });
});
