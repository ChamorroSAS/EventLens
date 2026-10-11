import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  AdminProvisioningService,
  ProvisioningError
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('AdminProvisioningService (Real PostgreSQL Integration Tests)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);
  const secret = 'real-pg-bootstrap-secret-token';
  const service = new AdminProvisioningService(txs, secret);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  async function query<T extends object>(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.query<T>(statement, ...args));
  }

  async function count(table: string): Promise<number> {
    const rows = await query<{ n: bigint }>(`SELECT count(*)::bigint AS n FROM "${table}"`);
    return Number(rows[0].n);
  }

  beforeAll(async () => {
    // Ensure tables exist
    await sql(`
      CREATE TABLE IF NOT EXISTS "admin_principal" (
        "id" UUID NOT NULL,
        "identifier" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "auth_revision" BIGINT NOT NULL DEFAULT 1,
        "provision_procedure" TEXT NOT NULL,
        "provisioned_by" TEXT NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "admin_principal_pkey" PRIMARY KEY ("id")
      );
    `);
    await sql(`
      CREATE UNIQUE INDEX IF NOT EXISTS "admin_principal_identifier_key" ON "admin_principal"("identifier");
    `);
    await sql(`
      CREATE TABLE IF NOT EXISTS "operational_bootstrap_state" (
        "id" TEXT NOT NULL,
        "is_consumed" BOOLEAN NOT NULL DEFAULT false,
        "consumed_at" TIMESTAMPTZ,
        "consumed_by" TEXT,
        CONSTRAINT "operational_bootstrap_state_pkey" PRIMARY KEY ("id")
      );
    `);
    await sql(`
      CREATE TABLE IF NOT EXISTS "admin_audit_event" (
        "id" UUID NOT NULL,
        "procedure" TEXT NOT NULL,
        "actor_id" TEXT NOT NULL,
        "target_identifier" TEXT NOT NULL,
        "target_principal_id" UUID,
        "result" TEXT NOT NULL,
        "details" TEXT,
        "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "admin_audit_event_pkey" PRIMARY KEY ("id")
      );
    `);
  });

  afterAll(async () => {
    await client.$disconnect();
  });

  beforeEach(async () => {
    await sql('TRUNCATE "admin_audit_event", "admin_credential", "admin_session", "admin_principal", "operational_bootstrap_state" CASCADE');
    await sql(`
      INSERT INTO "operational_bootstrap_state" ("id", "is_consumed", "consumed_at", "consumed_by")
      VALUES ('SYSTEM_BOOTSTRAP', false, NULL, NULL)
      ON CONFLICT ("id") DO UPDATE SET "is_consumed" = false, "consumed_at" = NULL, "consumed_by" = NULL
    `);
  });

  it('provisions initial administrative principal and disables bootstrap state atomically in PostgreSQL', async () => {
    expect(await service.isBootstrapConsumed()).toBe(false);

    const principal = await service.provisionInitialBootstrap({
      operatorToken: secret,
      identifier: 'pg-admin@eventlens.local'
    });

    expect(principal.id).toBeTruthy();
    expect(principal.identifier).toBe('pg-admin@eventlens.local');
    expect(principal.status).toBe('ACTIVE');

    expect(await count('admin_principal')).toBe(1);
    expect(await count('admin_audit_event')).toBe(1);

    const stateRows = await query<{ is_consumed: boolean; consumed_by: string }>(
      `SELECT is_consumed, consumed_by FROM "operational_bootstrap_state" WHERE id = 'SYSTEM_BOOTSTRAP'`
    );
    expect(stateRows[0].is_consumed).toBe(true);
    expect(stateRows[0].consumed_by).toBe('INITIAL_BOOTSTRAP');
    expect(await service.isBootstrapConsumed()).toBe(true);
  });

  it('rolls back completely if a failure occurs before transaction completion', async () => {
    const failingService = new AdminProvisioningService(
      {
        async run<T>(work: any): Promise<T> {
          return txs.run(async (tx) => {
            await work(tx);
            throw new Error('SIMULATED_TRANSACTION_FAILURE');
          });
        }
      },
      secret
    );

    await expect(
      failingService.provisionInitialBootstrap({
        operatorToken: secret,
        identifier: 'rollback-admin@eventlens.local'
      })
    ).rejects.toThrow('SIMULATED_TRANSACTION_FAILURE');

    // Due to transaction rollback, neither principal nor consumed state should persist
    expect(await count('admin_principal')).toBe(0);
    expect(await count('admin_audit_event')).toBe(0);

    const stateRows = await query<{ is_consumed: boolean }>(
      `SELECT is_consumed FROM "operational_bootstrap_state" WHERE id = 'SYSTEM_BOOTSTRAP'`
    );
    expect(stateRows[0].is_consumed).toBe(false);
  });

  it('concurrent race: exactly 1 bootstrap succeeds and others are rejected under PostgreSQL locks', async () => {
    const attempts = Array.from({ length: 6 }, (_, i) =>
      service
        .provisionInitialBootstrap({
          operatorToken: secret,
          identifier: `concurrent-admin-${i}@eventlens.local`
        })
        .then(() => 'SUCCESS')
        .catch((err) => (err instanceof ProvisioningError ? err.code : 'ERROR'))
    );

    const results = await Promise.all(attempts);
    const successes = results.filter((r) => r === 'SUCCESS');
    const consumedRejections = results.filter((r) => r === 'BOOTSTRAP_ALREADY_CONSUMED');

    expect(successes).toHaveLength(1);
    expect(consumedRejections).toHaveLength(5);
    expect(await count('admin_principal')).toBe(1);
    expect(await service.isBootstrapConsumed()).toBe(true);
  });

  it('allows authorized subsequent administrative provisioning in real PostgreSQL', async () => {
    const initial = await service.provisionInitialBootstrap({
      operatorToken: secret,
      identifier: 'initial-admin@eventlens.local'
    });

    const second = await service.provisionSubsequent({
      authorizingActor: {
        id: initial.id,
        isAuthorizedProvisioner: true
      },
      identifier: 'second-admin@eventlens.local'
    });

    expect(second.id).toBeTruthy();
    expect(second.identifier).toBe('second-admin@eventlens.local');
    expect(second.provisionProcedure).toBe('AUTHORIZED_PROVISION');
    expect(second.provisionedBy).toBe(initial.id);

    expect(await count('admin_principal')).toBe(2);
  });

  it('rejects unauthorized subsequent provision and logs audit event into PostgreSQL', async () => {
    const initial = await service.provisionInitialBootstrap({
      operatorToken: secret,
      identifier: 'initial-admin@eventlens.local'
    });

    await expect(
      service.provisionSubsequent({
        authorizingActor: {
          id: initial.id,
          isAuthorizedProvisioner: false
        },
        identifier: 'unauthorized@eventlens.local'
      })
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED_PROVISIONER'
    });

    expect(await count('admin_principal')).toBe(1);

    const auditRows = await query<{ result: string }>(
      `SELECT result FROM "admin_audit_event" WHERE result = 'REJECTED_UNAUTHORIZED'`
    );
    expect(auditRows.length).toBeGreaterThan(0);
  });

  it('records public elevation denial in real PostgreSQL audit table without privilege grant', async () => {
    await expect(
      service.guardPublicRegistration({
        email: 'public-attacker@example.com',
        role: 'admin'
      })
    ).rejects.toMatchObject({
      code: 'PUBLIC_ELEVATION_DENIED'
    });

    expect(await count('admin_principal')).toBe(0);

    const auditRows = await query<{ result: string; target_identifier: string }>(
      `SELECT result, target_identifier FROM "admin_audit_event" WHERE result = 'REJECTED_PUBLIC_ELEVATION'`
    );
    expect(auditRows.length).toBe(1);
    expect(auditRows[0].target_identifier).toBe('public-attacker@example.com');
  });
});
