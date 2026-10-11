import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  Mod001RecoveryCoordinator,
  type RecoveryAuthorityPort,
  type PrepareSensitiveOperationCommand,
  type Mod001RecoveryFact,
  type RecoveryCheckpoint
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('Mod001RecoveryCoordinator (Real PostgreSQL Integration Tests)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  beforeAll(async () => {
    await sql(`
      CREATE TABLE IF NOT EXISTS admin_principal (
        id UUID PRIMARY KEY,
        identifier TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        auth_revision BIGINT NOT NULL DEFAULT 1,
        provision_procedure TEXT NOT NULL,
        provisioned_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS admin_credential (
        id UUID PRIMARY KEY,
        principal_id UUID NOT NULL,
        purpose TEXT NOT NULL DEFAULT 'ADMIN_AUTHENTICATION',
        secret_digest TEXT NOT NULL,
        revision BIGINT NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS admin_session (
        id UUID PRIMARY KEY,
        principal_id UUID NOT NULL,
        token_digest TEXT UNIQUE NOT NULL,
        csrf_token_digest TEXT NOT NULL,
        auth_time TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        last_active_at TIMESTAMPTZ NOT NULL,
        idle_expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        revocation_reason TEXT,
        session_watermark BIGINT NOT NULL DEFAULT 1
      );
    `);
  });

  beforeEach(async () => {
    await sql('DELETE FROM admin_session');
    await sql('DELETE FROM admin_credential');
    await sql('DELETE FROM admin_principal');
  });

  it('executes PREPARE -> SQL commit -> ACK against real PostgreSQL', async () => {
    const principalId = randomUUID();
    const ackCalls: string[] = [];

    const authority: RecoveryAuthorityPort = {
      getRecoveryEpoch: async () => 1n,
      getCredentialRevision: async () => 1n,
      getAdminAuthWatermark: async () => 1n,
      prepare: async (cmd) => ({
        preparedReceipt: `rcpt-${cmd.operationId}`,
        sequence: 1n,
        operationId: cmd.operationId,
        subjectRef: cmd.subjectRef
      }),
      ackCommit: async (receipt) => {
        ackCalls.push(receipt);
      }
    };

    const coordinator = new Mod001RecoveryCoordinator({ authority, transactions: txs });
    const command: PrepareSensitiveOperationCommand = {
      operationId: 'op-real-pg-1',
      subjectRef: principalId,
      fact: {
        type: 'ADMIN_PRINCIPAL_PROVISIONED',
        data: { identifier: 'admin@eventlens.internal' }
      }
    };

    const result = await coordinator.executeSensitiveTransaction(command, async (_rcpt, tx) => {
      await tx.execute(
        `INSERT INTO admin_principal (id, identifier, status, auth_revision, provision_procedure, provisioned_by)
         VALUES ($1, $2, 'ACTIVE', 1, 'INITIAL_BOOTSTRAP', 'system')`,
        principalId,
        'admin@eventlens.internal'
      );
      return { result: { id: principalId }, revision: 1n };
    });

    expect(result.id).toBe(principalId);
    expect(ackCalls).toEqual(['rcpt-op-real-pg-1']);

    // Verify row was persisted in PostgreSQL
    const rows = await txs.run((tx) =>
      tx.query<{ id: string; identifier: string }>(
        `SELECT id, identifier FROM admin_principal WHERE id = $1`,
        principalId
      )
    );
    expect(rows.length).toBe(1);
    expect(rows[0].identifier).toBe('admin@eventlens.internal');
  });

  it('rolls back SQL and calls resolveAbort when transaction encounters an error', async () => {
    const principalId = randomUUID();
    const abortCalls: { receipt: string; reason: string }[] = [];

    const authority: RecoveryAuthorityPort = {
      getRecoveryEpoch: async () => 1n,
      getCredentialRevision: async () => 1n,
      getAdminAuthWatermark: async () => 1n,
      prepare: async (cmd) => ({
        preparedReceipt: `rcpt-${cmd.operationId}`,
        sequence: 2n,
        operationId: cmd.operationId,
        subjectRef: cmd.subjectRef
      }),
      resolveAbort: async (receipt, reason) => {
        abortCalls.push({ receipt, reason });
      }
    };

    const coordinator = new Mod001RecoveryCoordinator({ authority, transactions: txs });
    const command: PrepareSensitiveOperationCommand = {
      operationId: 'op-abort-real-pg',
      subjectRef: principalId,
      fact: {
        type: 'ADMIN_PRINCIPAL_PROVISIONED',
        data: { identifier: 'failed@eventlens.internal' }
      }
    };

    await expect(
      coordinator.executeSensitiveTransaction(command, async (_rcpt, tx) => {
        await tx.execute(
          `INSERT INTO admin_principal (id, identifier, status, auth_revision, provision_procedure, provisioned_by)
           VALUES ($1, $2, 'ACTIVE', 1, 'INITIAL_BOOTSTRAP', 'system')`,
          principalId,
          'failed@eventlens.internal'
        );
        throw new Error('INTENTIONAL_SQL_ABORT');
      })
    ).rejects.toThrow('INTENTIONAL_SQL_ABORT');

    expect(abortCalls.length).toBe(1);
    expect(abortCalls[0].receipt).toBe('rcpt-op-abort-real-pg');

    // Verify row was NOT persisted due to transaction rollback
    const rows = await txs.run((tx) =>
      tx.query(`SELECT id FROM admin_principal WHERE id = $1`, principalId)
    );
    expect(rows.length).toBe(0);
  });

  it('reconciles restored PostgreSQL state against RecoveryAuthority facts post-PITR', async () => {
    const p1 = randomUUID();
    const p2 = randomUUID();
    const credId = randomUUID();
    const sessionId = randomUUID();

    // 1. Seed PostgreSQL simulating a restored historical snapshot
    await sql(`
      INSERT INTO admin_principal (id, identifier, status, auth_revision, provision_procedure, provisioned_by)
      VALUES 
        ('${p1}', 'revoked@eventlens.internal', 'ACTIVE', 1, 'INITIAL_BOOTSTRAP', 'system'),
        ('${p2}', 'active@eventlens.internal', 'ACTIVE', 1, 'INITIAL_BOOTSTRAP', 'system');

      INSERT INTO admin_credential (id, principal_id, purpose, secret_digest, revision, status)
      VALUES ('${credId}', '${p2}', 'ADMIN_AUTHENTICATION', 'old-sha256-digest', 1, 'ACTIVE');

      INSERT INTO admin_session (id, principal_id, token_digest, csrf_token_digest, auth_time, expires_at, last_active_at, idle_expires_at, session_watermark)
      VALUES ('${sessionId}', '${p2}', 'tok-digest-1', 'csrf-1', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '7 hours', NOW(), NOW() + INTERVAL '25 minutes', 1);
    `);

    // 2. Set up RecoveryAuthority with post-snapshot facts:
    // - Fact 1: p1 was revoked
    // - Fact 2: credential for p2 was rotated to revision 2
    // - Fact 3: session for p2 was revoked with watermark 2
    const checkpoint: RecoveryCheckpoint = {
      epoch: 2n,
      checkpointSequence: 3n,
      checkpointDigest: 'pg-integration-checkpoint-digest'
    };

    const recoveryFacts: Mod001RecoveryFact[] = [
      {
        type: 'ADMIN_PRINCIPAL_REVOKED',
        subjectRef: p1,
        revision: 2n,
        sequence: 1n,
        facts: {},
        timestamp: new Date()
      },
      {
        type: 'CREDENTIAL_ROTATED',
        subjectRef: p2,
        revision: 2n,
        sequence: 2n,
        facts: {},
        timestamp: new Date()
      },
      {
        type: 'SESSION_REVOKED',
        subjectRef: sessionId,
        revision: 1n,
        sequence: 3n,
        facts: { watermark: 2n, principalId: p2 },
        timestamp: new Date()
      }
    ];

    const acknowledged: any[] = [];
    const authority: RecoveryAuthorityPort = {
      getRecoveryEpoch: async () => 2n,
      getCredentialRevision: async () => 2n,
      getAdminAuthWatermark: async () => 2n,
      readCheckpoint: async () => checkpoint,
      readFacts: async () => recoveryFacts,
      ackReconciled: async (scope, epoch, seq, dig) => {
        acknowledged.push({ scope, epoch, seq, dig });
      }
    };

    const coordinator = new Mod001RecoveryCoordinator({ authority, transactions: txs });
    const outcome = await coordinator.reconcileMod001('MOD-001');

    expect(outcome.status).toBe('RECONCILED');
    expect(outcome.factsEvaluated).toBe(3);
    expect(outcome.restrictionsApplied).toBeGreaterThanOrEqual(3);
    expect(acknowledged.length).toBe(1);

    // 3. Verify PostgreSQL rows were updated to prevent stale authorization:
    // Principal p1 should now be REVOKED
    const principalRows = await txs.run((tx) =>
      tx.query<{ status: string }>(`SELECT status FROM admin_principal WHERE id = $1`, p1)
    );
    expect(principalRows[0].status).toBe('REVOKED');

    // Credential for p2 with revision 1 should now be REVOKED
    const credRows = await txs.run((tx) =>
      tx.query<{ status: string }>(`SELECT status FROM admin_credential WHERE id = $1`, credId)
    );
    expect(credRows[0].status).toBe('REVOKED');

    // Session should be REVOKED
    const sessionRows = await txs.run((tx) =>
      tx.query<{ revoked_at: Date; revocation_reason: string }>(
        `SELECT revoked_at, revocation_reason FROM admin_session WHERE id = $1`,
        sessionId
      )
    );
    expect(sessionRows[0].revoked_at).not.toBeNull();
    expect(sessionRows[0].revocation_reason).toBe('RECOVERY_RECONCILIATION');
  });
});
