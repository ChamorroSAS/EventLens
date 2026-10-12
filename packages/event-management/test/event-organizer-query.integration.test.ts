import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import type { OrganizerActorContext } from '@eventlens/identity';
import {
  EventDraftService,
  EventManagementError,
  type OrganizerEventSummary,
  type AuthorizedEventConfiguration
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('EL-TK-047: Consultar mis eventos y configuración (Real PostgreSQL 16 Integration)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);
  const service = new EventDraftService(txs);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  const organizer1: OrganizerActorContext = {
    actorType: 'ORGANIZER_HUMAN',
    accountId: randomUUID()
  };

  const organizer2: OrganizerActorContext = {
    actorType: 'ORGANIZER_HUMAN',
    accountId: randomUUID()
  };

  const organizerEmpty: OrganizerActorContext = {
    actorType: 'ORGANIZER_HUMAN',
    accountId: randomUUID()
  };

  let event1Id: string;
  let event2Id: string;

  beforeAll(async () => {
    // Ensure table structure exists
    await sql(`
      CREATE TABLE IF NOT EXISTS event (
        id UUID PRIMARY KEY,
        organizer_id UUID NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        timezone TEXT NOT NULL DEFAULT 'America/Bogota',
        starts_at_local TEXT,
        scheduled_at TIMESTAMPTZ,
        utc_offset_minutes INT,
        expires_at TIMESTAMPTZ,
        grace_ends_at TIMESTAMPTZ,
        activated_at TIMESTAMPTZ,
        closed_at TIMESTAMPTZ,
        purge_started_at TIMESTAMPTZ,
        suspended_at TIMESTAMPTZ,
        suspension_reason TEXT,
        previous_status TEXT,
        validity_duration_days INT,
        grace_days INT,
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
    event1Id = randomUUID();
    event2Id = randomUUID();

    // Insert test event for organizer 1
    await sql(
      `INSERT INTO event (
        id, organizer_id, name, status, timezone, pin_enabled, pin_hash, pin_salt, created_at, updated_at
      ) VALUES ($1, $2, $3, 'DRAFT', 'America/Bogota', true, 'super_secret_hash', 'super_secret_salt', NOW(), NOW())`,
      event1Id,
      organizer1.accountId,
      'Fiesta de Graduación Org1'
    );

    // Insert test event for organizer 2
    await sql(
      `INSERT INTO event (
        id, organizer_id, name, status, timezone, pin_enabled, created_at, updated_at
      ) VALUES ($1, $2, $3, 'ACTIVE', 'America/Bogota', false, NOW(), NOW())`,
      event2Id,
      organizer2.accountId,
      'Conferencia Anual Org2'
    );
  });

  it('lista únicamente los eventos propios del organizador autenticado', async () => {
    const list1 = await service.listOrganizerEvents({ actorContext: organizer1 });
    expect(list1).toHaveLength(1);
    expect(list1[0].id).toBe(event1Id);
    expect(list1[0].name).toBe('Fiesta de Graduación Org1');
    expect(list1[0].organizerId).toBe(organizer1.accountId);
    expect((list1[0] as any).pin_hash).toBeUndefined();

    const list2 = await service.listOrganizerEvents({ actorContext: organizer2 });
    expect(list2).toHaveLength(1);
    expect(list2[0].id).toBe(event2Id);
    expect(list2[0].name).toBe('Conferencia Anual Org2');
  });

  it('devuelve una lista vacía para un organizador sin eventos registrados', async () => {
    const emptyList = await service.listOrganizerEvents({ actorContext: organizerEmpty });
    expect(emptyList).toEqual([]);
    expect(Array.isArray(emptyList)).toBe(true);
  });

  it('obtiene la configuración autorizada del evento propio sin filtrar secretos', async () => {
    const config = await service.getAuthorizedConfiguration({
      actorContext: organizer1,
      eventId: event1Id
    });

    expect(config.event.id).toBe(event1Id);
    expect(config.event.name).toBe('Fiesta de Graduación Org1');
    expect(config.event.status).toBe('DRAFT');
    expect(config.event.pinEnabled).toBe(true);
    expect((config.event as any).pin_hash).toBeUndefined();
    expect((config.event as any).pin_salt).toBeUndefined();

    expect(config.capabilities.canEditSchedule).toBe(true);
    expect(config.capabilities.canEditSettings).toBe(true);
    expect(config.capabilities.canManageAccess).toBe(true);
    expect(config.capabilities.canPublishOrActivate).toBe(true);
  });

  it('rechaza consultas de configuración sobre eventos de otro organizador con EVENT_NOT_FOUND', async () => {
    // Organizer 1 tries to query organizer 2's event
    await expect(
      service.getAuthorizedConfiguration({
        actorContext: organizer1,
        eventId: event2Id
      })
    ).rejects.toMatchObject({
      code: 'EVENT_NOT_FOUND'
    });
  });
});
