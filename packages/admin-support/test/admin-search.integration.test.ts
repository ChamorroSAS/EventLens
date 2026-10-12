import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import type { AdminActorContext } from '@eventlens/identity';
import {
  AdminSearchService,
  type AdminSupportAuditSink
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('AdminSearchService (PostgreSQL 16 Integration Tests — EL-TK-146)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  async function query<T extends object>(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.query<T>(statement, ...args));
  }

  let auditSink: AdminSupportAuditSink;
  let service: AdminSearchService;
  let adminContext: AdminActorContext;

  beforeAll(async () => {
    // Asegurar existencia de tablas base
    await sql(`
      CREATE TABLE IF NOT EXISTS organizer_account (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL,
        email_normalized TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
        declared_adult BOOLEAN NOT NULL DEFAULT false,
        declared_adult_at TIMESTAMPTZ,
        invitation_id UUID NOT NULL,
        verified_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await sql(`
      CREATE TABLE IF NOT EXISTS event (
        id UUID PRIMARY KEY,
        organizer_id UUID NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        timezone TEXT NOT NULL DEFAULT 'America/Bogota',
        starts_at_local TEXT,
        scheduled_at TIMESTAMPTZ,
        utc_offset_minutes INTEGER,
        expires_at TIMESTAMPTZ,
        grace_ends_at TIMESTAMPTZ,
        activated_at TIMESTAMPTZ,
        closed_at TIMESTAMPTZ,
        purge_started_at TIMESTAMPTZ,
        suspended_at TIMESTAMPTZ,
        suspension_reason TEXT,
        previous_status TEXT,
        validity_duration_days INTEGER,
        grace_days INTEGER,
        uploads_enabled BOOLEAN NOT NULL DEFAULT false,
        guest_gallery_enabled BOOLEAN NOT NULL DEFAULT false,
        moderation_mode TEXT NOT NULL DEFAULT 'AUTO_PUBLISH',
        pin_enabled BOOLEAN NOT NULL DEFAULT false,
        pin_hash TEXT,
        pin_salt TEXT,
        idempotency_key TEXT UNIQUE,
        idempotency_payload_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  });

  beforeEach(async () => {
    auditSink = {
      record: vi.fn(async () => {})
    };

    service = new AdminSearchService(txs, auditSink);

    adminContext = {
      actorType: 'ADMIN_HUMAN',
      principalId: randomUUID(),
      identifier: 'sec-admin@eventlens.test',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      adminAuthRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };
  });

  it('Ejecuta búsqueda combinada en PostgreSQL 16 con paginación determinista (Escenario 1)', async () => {
    const orgId = randomUUID();
    const eventId = randomUUID();

    const uniqueTag = 'real_pg_' + Date.now();

    // 1. Insertar organizador de prueba
    await sql(
      `INSERT INTO organizer_account (id, email, email_normalized, status, declared_adult, invitation_id, created_at)
       VALUES ($1, $2, $3, 'ACTIVE', true, $4, NOW())`,
      orgId,
      `org_${uniqueTag}@eventlens.test`,
      `org_${uniqueTag}@eventlens.test`,
      randomUUID()
    );

    // 2. Insertar evento de prueba
    await sql(
      `INSERT INTO event (id, organizer_id, name, status, timezone, created_at)
       VALUES ($1, $2, $3, 'ACTIVE', 'America/Bogota', NOW())`,
      eventId,
      orgId,
      `Concierto ${uniqueTag}`
    );

    // 3. Buscar por el tag común
    const result = await service.search({
      actorContext: adminContext,
      query: uniqueTag,
      entityType: 'ALL',
      page: 1,
      limit: 10
    });

    expect(result.items.length).toBe(2);
    expect(result.pagination.total).toBe(2);
    expect(result.pagination.totalPages).toBe(1);

    const eventResult = result.items.find((i) => i.type === 'EVENT');
    expect(eventResult).toBeDefined();
    expect(eventResult?.id).toBe(eventId);

    const orgResult = result.items.find((i) => i.type === 'ORGANIZER');
    expect(orgResult).toBeDefined();
    expect(orgResult?.id).toBe(orgId);
  });

  it('Retorna lista vacía ante un término inexistente sin generar errores en PostgreSQL (Escenario 2)', async () => {
    const result = await service.search({
      actorContext: adminContext,
      query: 'non_existent_term_9876543210',
      entityType: 'ALL',
      page: 1,
      limit: 20
    });

    expect(result.items).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.totalPages).toBe(0);
  });

  it('Filtra correctamente por tipo de entidad EVENT vs ORGANIZER en PostgreSQL', async () => {
    const orgId = randomUUID();
    const eventId = randomUUID();
    const tag = 'filter_pg_' + Date.now();

    await sql(
      `INSERT INTO organizer_account (id, email, email_normalized, status, declared_adult, invitation_id, created_at)
       VALUES ($1, $2, $3, 'ACTIVE', true, $4, NOW())`,
      orgId,
      `org_${tag}@eventlens.test`,
      `org_${tag}@eventlens.test`,
      randomUUID()
    );

    await sql(
      `INSERT INTO event (id, organizer_id, name, status, timezone, created_at)
       VALUES ($1, $2, $3, 'SCHEDULED', 'America/Bogota', NOW())`,
      eventId,
      orgId,
      `Evento ${tag}`
    );

    // Solo EVENT
    const eventsOnly = await service.search({
      actorContext: adminContext,
      query: tag,
      entityType: 'EVENT'
    });
    expect(eventsOnly.items).toHaveLength(1);
    expect(eventsOnly.items[0].type).toBe('EVENT');
    expect(eventsOnly.items[0].id).toBe(eventId);

    // Solo ORGANIZER
    const orgsOnly = await service.search({
      actorContext: adminContext,
      query: tag,
      entityType: 'ORGANIZER'
    });
    expect(orgsOnly.items).toHaveLength(1);
    expect(orgsOnly.items[0].type).toBe('ORGANIZER');
    expect(orgsOnly.items[0].id).toBe(orgId);
  });
});
