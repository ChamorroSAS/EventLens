import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import type { AdminActorContext, OrganizerActorContext } from '@eventlens/identity';
import {
  CapacityPlanService,
  CapacityError,
  DEFAULT_PLAN_CODE
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('CapacityPlanService (Real PostgreSQL Integration Tests — EL-TK-134)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  beforeAll(async () => {
    await sql(`
      CREATE TABLE IF NOT EXISTS plan (
        id UUID PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        storage_bytes BIGINT NOT NULL CHECK(storage_bytes > 0),
        max_files INTEGER NOT NULL CHECK(max_files > 0),
        max_photo_bytes BIGINT NOT NULL CHECK(max_photo_bytes > 0),
        max_video_bytes BIGINT NOT NULL CHECK(max_video_bytes > 0),
        max_video_duration_seconds INTEGER NOT NULL CHECK(max_video_duration_seconds > 0),
        retention_days INTEGER NOT NULL CHECK(retention_days > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS plan_assignment (
        id UUID PRIMARY KEY,
        event_id UUID NOT NULL UNIQUE,
        plan_id UUID NOT NULL REFERENCES plan(id),
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'INACTIVE')),
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS plan_override (
        id UUID PRIMARY KEY,
        event_id UUID NOT NULL,
        storage_bytes BIGINT CHECK(storage_bytes IS NULL OR storage_bytes > 0),
        max_files INTEGER CHECK(max_files IS NULL OR max_files > 0),
        retention_days INTEGER CHECK(retention_days IS NULL OR retention_days > 0),
        reason TEXT NOT NULL,
        authorized_by TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'REMOVED')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        removed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_plan_override_event_status ON plan_override(event_id, status);

      CREATE TABLE IF NOT EXISTS admin_audit_event (
        id UUID PRIMARY KEY,
        procedure TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        target_identifier TEXT NOT NULL,
        result TEXT NOT NULL,
        details TEXT,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      INSERT INTO plan (
        id, code, name, storage_bytes, max_files, max_photo_bytes, max_video_bytes, max_video_duration_seconds, retention_days, created_at
      ) VALUES (
        '00000000-0000-0000-0000-000000000001',
        'BETA_DEFAULT',
        'Plan BETA EventLens',
        10000000000,
        1500,
        25000000,
        500000000,
        300,
        30,
        NOW()
      ) ON CONFLICT (code) DO NOTHING;
    `);
  });

  beforeEach(async () => {
    await sql('DELETE FROM plan_override');
    await sql('DELETE FROM plan_assignment');
    await sql('DELETE FROM admin_audit_event');
  });

  const mockAdmin: AdminActorContext = {
    actorType: 'ADMIN_HUMAN',
    principalId: randomUUID(),
    identifier: 'admin@eventlens.test',
    sessionId: randomUUID(),
    authTime: new Date(),
    credentialRevision: 1n,
    adminAuthRevision: 1n,
    sessionWatermark: 1n,
    recoveryEpoch: 1n
  };

  const mockOrganizer: OrganizerActorContext = {
    actorType: 'ORGANIZER_HUMAN',
    accountId: randomUUID(),
    email: 'organizer@eventlens.test',
    sessionId: randomUUID(),
    authTime: new Date(),
    credentialRevision: 1n,
    sessionWatermark: 1n,
    recoveryEpoch: 1n
  };

  it('Escenario 1: Asigna y resuelve el plan BETA base en PostgreSQL real', async () => {
    const service = new CapacityPlanService(txs);
    const eventId = randomUUID();

    const limits = await service.resolveEffectiveLimits({
      eventId,
      actorContext: mockOrganizer
    });

    expect(limits.eventId).toBe(eventId);
    expect(limits.planCode).toBe(DEFAULT_PLAN_CODE);
    expect(limits.storageBytes).toBe(10_000_000_000n);
    expect(limits.maxFiles).toBe(1500);
    expect(limits.maxPhotoBytes).toBe(25_000_000n);
    expect(limits.maxVideoBytes).toBe(500_000_000n);
    expect(limits.maxVideoDurationSeconds).toBe(300);
    expect(limits.retentionDays).toBe(30);
    expect(limits.isOverrideActive).toBe(false);

    // Verificar persistencia de asignación
    const rows = await txs.run((tx) =>
      tx.query<{ event_id: string; status: string }>(
        'SELECT event_id, status FROM plan_assignment WHERE event_id = $1',
        eventId
      )
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('ACTIVE');
  });

  it('Escenario 2: Aplica override administrativo y resuelve límites efectivos combinados', async () => {
    const service = new CapacityPlanService(txs);
    const eventId = randomUUID();

    const { override, effectiveLimits } = await service.applyOverride({
      eventId,
      actorContext: mockAdmin,
      storageBytes: 25_000_000_000n, // 25 GB decimales
      maxFiles: 3000,
      reason: 'Ampliacion para festival'
    });

    expect(override.eventId).toBe(eventId);
    expect(override.storageBytes).toBe(25_000_000_000n);
    expect(override.maxFiles).toBe(3000);
    expect(override.status).toBe('ACTIVE');

    expect(effectiveLimits.storageBytes).toBe(25_000_000_000n);
    expect(effectiveLimits.maxFiles).toBe(3000);
    expect(effectiveLimits.retentionDays).toBe(30); // Base conservada
    expect(effectiveLimits.isOverrideActive).toBe(true);
    expect(effectiveLimits.activeOverrideId).toBe(override.id);

    // Auditoría registrada
    const audits = await txs.run((tx) =>
      tx.query<{ procedure: string; target_identifier: string }>(
        'SELECT procedure, target_identifier FROM admin_audit_event WHERE procedure = $1',
        'PLAN_OVERRIDE_APPLIED'
      )
    );
    expect(audits).toHaveLength(1);
    expect(audits[0].target_identifier).toBe(eventId);
  });

  it('Escenario 3: Retira override volviendo al plan base y valida restricción DEC-102 en ACTIVE', async () => {
    const service = new CapacityPlanService(txs);
    const eventId = randomUUID();

    await service.applyOverride({
      eventId,
      actorContext: mockAdmin,
      storageBytes: 15_000_000_000n,
      reason: 'Ajuste previo'
    });

    const { effectiveLimits } = await service.removeOverride({
      eventId,
      actorContext: mockAdmin,
      reason: 'Cierre de ampliacion'
    });

    expect(effectiveLimits.storageBytes).toBe(10_000_000_000n);
    expect(effectiveLimits.isOverrideActive).toBe(false);

    // Test DEC-102
    await service.applyOverride({
      eventId,
      actorContext: mockAdmin,
      retentionDays: 90,
      reason: 'Ampliacion larga'
    });

    const now = new Date('2026-10-20T00:00:00Z');
    const pastAnchor = new Date('2026-08-01T00:00:00Z'); // Hace 80 días

    // Plan base (30 días) dejaría vencimiento en agosto 31 (hace casi 2 meses)
    await expect(
      service.removeOverride({
        eventId,
        actorContext: mockAdmin,
        eventStatus: 'ACTIVE',
        eventAnchorDate: pastAnchor,
        now,
        reason: 'Intento ilegal de reduccion'
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'CANNOT_REDUCE_BELOW_PAST_EXPIRATION'
      })
    );
  });
});
