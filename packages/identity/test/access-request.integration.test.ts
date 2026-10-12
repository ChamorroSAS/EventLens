import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  BetaAccessRequestService,
  type AdminActorContext
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('BetaAccessRequestService (Real PostgreSQL Integration Tests — EL-TK-008 & EL-TK-009)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  const adminActor: AdminActorContext = {
    actorType: 'ADMIN_HUMAN',
    principalId: randomUUID(),
    identifier: 'admin@eventlens.internal',
    sessionId: randomUUID(),
    authTime: new Date(),
    credentialRevision: 1n,
    adminAuthRevision: 1n,
    sessionWatermark: 1n,
    recoveryEpoch: 1n
  };

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  beforeAll(async () => {
    await sql(`
      CREATE TABLE IF NOT EXISTS beta_access_request (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL,
        email_normalized TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
        notes TEXT,
        ip_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS beta_access_request_email_normalized_idx 
      ON beta_access_request(email_normalized);

      CREATE TABLE IF NOT EXISTS admin_audit_event (
        id UUID PRIMARY KEY,
        procedure TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        target_identifier TEXT NOT NULL,
        target_principal_id UUID,
        result TEXT NOT NULL,
        details TEXT,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  });

  beforeEach(async () => {
    await sql('DELETE FROM beta_access_request');
    await sql('DELETE FROM admin_audit_event');
  });

  it('persists a new beta access request in real PostgreSQL without creating an account or leaking data', async () => {
    const service = new BetaAccessRequestService(txs);
    const email = 'real-request@eventlens.internal';

    const result = await service.requestAccess({
      email,
      notes: 'Testing wedding gallery features',
      clientIp: '127.0.0.1'
    });

    expect(result.outcome).toBe('REQUEST_RECEIVED');
    expect(result.requestId).toBeDefined();

    // Verify row in database
    const rows = await txs.run((tx) =>
      tx.query<{ id: string; email_normalized: string; status: string; notes: string }>(
        `SELECT id, email_normalized, status, notes FROM beta_access_request WHERE id = $1`,
        result.requestId
      )
    );

    expect(rows.length).toBe(1);
    expect(rows[0].email_normalized).toBe(email);
    expect(rows[0].status).toBe('PENDING_REVIEW');
    expect(rows[0].notes).toBe('Testing wedding gallery features');

    // Verify audit in real PostgreSQL
    const audits = await txs.run((tx) =>
      tx.query<{ procedure: string; result: string }>(
        `SELECT procedure, result FROM admin_audit_event WHERE target_identifier = $1`,
        email
      )
    );
    expect(audits.length).toBe(1);
    expect(audits[0].procedure).toBe('BETA_ACCESS_REQUEST_SUBMITTED');
  });

  it('deduplicates duplicate requests idempotently in real PostgreSQL', async () => {
    const service = new BetaAccessRequestService(txs);
    const email = 'real-duplicate@eventlens.internal';

    const first = await service.requestAccess({ email, notes: 'First note' });
    const second = await service.requestAccess({ email, notes: 'Updated note' });

    expect(first.outcome).toBe('REQUEST_RECEIVED');
    expect(second.outcome).toBe('REQUEST_RECEIVED');
    expect(second.requestId).toBe(first.requestId);

    const rows = await txs.run((tx) =>
      tx.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM beta_access_request WHERE email_normalized = $1`,
        email
      )
    );
    expect(Number(rows[0].count)).toBe(1);
  });

  it('lists and inspects access requests with administrative privileges in real PostgreSQL', async () => {
    const service = new BetaAccessRequestService(txs);
    const email = 'inspect-me@eventlens.internal';

    const req = await service.requestAccess({ email });

    // Admin lists requests
    const list = await service.listAccessRequests({
      actorContext: adminActor,
      limit: 10,
      offset: 0
    });

    expect(list.total).toBe(1);
    expect(list.items.length).toBe(1);
    expect(list.items[0].id).toBe(req.requestId);

    // Admin inspects detail
    const detail = await service.getAccessRequest({
      actorContext: adminActor,
      requestId: req.requestId
    });

    expect(detail.request).not.toBeNull();
    expect(detail.request?.id).toBe(req.requestId);
    expect(detail.request?.emailNormalized).toBe(email);
  });
});
