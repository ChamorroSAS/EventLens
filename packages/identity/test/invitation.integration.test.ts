import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  BetaInvitationService,
  type AdminActorContext
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('BetaInvitationService (Real PostgreSQL Integration Tests — EL-TK-005)', () => {
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
      CREATE TABLE IF NOT EXISTS beta_invitation (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL,
        email_normalized TEXT NOT NULL,
        token_digest TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        issued_by UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        revision BIGINT NOT NULL DEFAULT 1
      );

      CREATE INDEX IF NOT EXISTS beta_invitation_email_normalized_status_idx 
      ON beta_invitation(email_normalized, status);

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
    await sql('DELETE FROM beta_invitation');
    await sql('DELETE FROM admin_audit_event');
  });

  it('persists a new beta invitation and audit event in PostgreSQL with 7-day TTL', async () => {
    const service = new BetaInvitationService(txs);
    const email = 'real-test@eventlens.internal';

    const result = await service.issueInvitation({
      actorContext: adminActor,
      email
    });

    expect(result.outcome).toBe('ISSUED');
    expect(result.invitation.emailNormalized).toBe(email);

    // Verify row in beta_invitation
    const rows = await txs.run((tx) =>
      tx.query<{ id: string; status: string; email_normalized: string }>(
        `SELECT id, status, email_normalized FROM beta_invitation WHERE id = $1`,
        result.invitation.id
      )
    );
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('PENDING');
    expect(rows[0].email_normalized).toBe(email);

    // Verify audit event row
    const auditRows = await txs.run((tx) =>
      tx.query<{ procedure: string; result: string }>(
        `SELECT procedure, result FROM admin_audit_event WHERE target_identifier = $1`,
        email
      )
    );
    expect(auditRows.length).toBe(1);
    expect(auditRows[0].procedure).toBe('BETA_INVITE_ISSUE');
    expect(auditRows[0].result).toBe('SUCCESS');
  });

  it('handles duplicate issuance idempotently by returning existing pending invitation', async () => {
    const service = new BetaInvitationService(txs);
    const email = 'duplicate-test@eventlens.internal';

    const first = await service.issueInvitation({
      actorContext: adminActor,
      email
    });
    expect(first.outcome).toBe('ISSUED');

    const second = await service.issueInvitation({
      actorContext: adminActor,
      email
    });
    expect(second.outcome).toBe('ALREADY_PENDING');
    expect(second.invitation.id).toBe(first.invitation.id);
    expect(second.message).toBe('ya está pendiente');

    // Verify exactly ONE invitation row exists in DB
    const countRows = await txs.run((tx) =>
      tx.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM beta_invitation WHERE email_normalized = $1`,
        email
      )
    );
    expect(Number(countRows[0].count)).toBe(1);
  });

  it('renews an expired invitation by marking the old one EXPIRED and creating a fresh 7-day invitation', async () => {
    const service = new BetaInvitationService(txs);
    const email = 'expired-real@eventlens.internal';

    // Seed expired invitation directly in DB
    const oldId = randomUUID();
    await sql(
      `INSERT INTO beta_invitation (id, email, email_normalized, token_digest, status, issued_by, created_at, expires_at)
       VALUES ($1, $2, $2, 'old-digest', 'PENDING', $3, NOW() - INTERVAL '8 days', NOW() - INTERVAL '1 day')`,
      oldId,
      email,
      adminActor.principalId
    );

    const result = await service.issueInvitation({
      actorContext: adminActor,
      email
    });

    expect(result.outcome).toBe('RENEWED_EXPIRED');
    expect(result.invitation.id).not.toBe(oldId);
    expect(result.invitation.status).toBe('PENDING');

    // Verify old row status was updated to EXPIRED
    const oldRow = await txs.run((tx) =>
      tx.query<{ status: string }>(`SELECT status FROM beta_invitation WHERE id = $1`, oldId)
    );
    expect(oldRow[0].status).toBe('EXPIRED');

    // Verify new row is PENDING
    const newRow = await txs.run((tx) =>
      tx.query<{ status: string }>(`SELECT status FROM beta_invitation WHERE id = $1`, result.invitation.id)
    );
    expect(newRow[0].status).toBe('PENDING');
  });

  it('guarantees concurrency safety: concurrent calls for the same email do not create two active invitations', async () => {
    const service = new BetaInvitationService(txs);
    const email = 'concurrent-race@eventlens.internal';

    // Execute two concurrent issue requests
    const [res1, res2] = await Promise.all([
      service.issueInvitation({ actorContext: adminActor, email }),
      service.issueInvitation({ actorContext: adminActor, email })
    ]);

    const outcomes = [res1.outcome, res2.outcome].sort();
    expect(outcomes).toEqual(['ALREADY_PENDING', 'ISSUED']);

    // Total active pending invitations for this email must be strictly 1
    const activeCount = await txs.run((tx) =>
      tx.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM beta_invitation WHERE email_normalized = $1 AND status = 'PENDING'`,
        email
      )
    );
    expect(Number(activeCount[0].count)).toBe(1);
  });
});
