import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import type { OrganizerActorContext } from '@eventlens/identity';
import {
  EventDraftService,
  EventManagementError,
  type EventAuditSink,
  type EventAuditRecord
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('EventDraftConfig (Real PostgreSQL Integration Tests — EL-TK-021, 022, 028, 029, 030)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  async function query<T extends object>(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.query<T>(statement, ...args));
  }

  const recordedAudits: EventAuditRecord[] = [];
  const auditSink: EventAuditSink = {
    record: async (rec: EventAuditRecord) => {
      recordedAudits.push(rec);
    }
  };

  const service = new EventDraftService(txs, auditSink);

  let ownerContext: OrganizerActorContext;
  let otherContext: OrganizerActorContext;
  let eventId: string;

  beforeAll(async () => {
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
        welcome_message TEXT,
        idempotency_key TEXT UNIQUE,
        idempotency_payload_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS event_command_receipt (
        operation_id UUID PRIMARY KEY,
        event_id UUID NOT NULL,
        actor_id UUID NOT NULL,
        operation TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        applied_revision BIGINT NOT NULL DEFAULT 1,
        outcome TEXT NOT NULL,
        warning TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMPTZ,
        CONSTRAINT uq_event_command_receipt_actor_op_key UNIQUE (actor_id, operation, idempotency_key)
      );
    `);
    // Ensure column exists in case table was created previously without it
    await sql('ALTER TABLE event ADD COLUMN IF NOT EXISTS welcome_message TEXT;');
  });

  beforeEach(async () => {
    recordedAudits.length = 0;
    await sql('DELETE FROM event_command_receipt');
    await sql('DELETE FROM event');

    ownerContext = {
      actorType: 'ORGANIZER_HUMAN',
      accountId: randomUUID(),
      email: 'owner@eventlens.local',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };

    otherContext = {
      actorType: 'ORGANIZER_HUMAN',
      accountId: randomUUID(),
      email: 'other@eventlens.local',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };

    eventId = randomUUID();

    // Seed event in DRAFT
    await sql(
      `INSERT INTO event (
         id, organizer_id, name, status, timezone, uploads_enabled, guest_gallery_enabled, moderation_mode, pin_enabled, created_at, updated_at
       ) VALUES ($1, $2, $3, 'DRAFT', 'America/Bogota', false, false, 'AUTO_PUBLISH', false, NOW(), NOW())`,
      eventId,
      ownerContext.accountId,
      'Evento Inicial de Prueba'
    );
  });

  // =========================================================================
  // EL-TK-021: Cambiar el nombre de un borrador en PostgreSQL
  // =========================================================================
  it('EL-TK-021: actualiza el nombre del borrador en PostgreSQL con auditoría e idempotencia', async () => {
    const key = `key-name-${randomUUID()}`;

    const res = await service.updateDraftName({
      actorContext: ownerContext,
      eventId,
      name: 'Nuevo Nombre Confirmado en DB',
      idempotencyKey: key
    });

    expect(res.outcome).toBe('UPDATED');
    expect(res.event.name).toBe('Nuevo Nombre Confirmado en DB');

    // Comprobación directa en base de datos real
    const rows = await query<{ name: string; idempotency_key: string }>(
      'SELECT name, idempotency_key FROM event WHERE id = $1',
      eventId
    );
    expect(rows[0].name).toBe('Nuevo Nombre Confirmado en DB');
    expect(rows[0].idempotency_key).toBe(key);

    // Replay idempotente
    const replay = await service.updateDraftName({
      actorContext: ownerContext,
      eventId,
      name: 'Nuevo Nombre Confirmado en DB',
      idempotencyKey: key
    });
    expect(replay.outcome).toBe('IDEMPOTENT_REPLAY');

    // Aislamiento: otro organizador no puede mutar
    await expect(
      service.updateDraftName({
        actorContext: otherContext,
        eventId,
        name: 'Nombre Intruso'
      })
    ).rejects.toThrow(EventManagementError);

    const recheck = await query<{ name: string }>('SELECT name FROM event WHERE id = $1', eventId);
    expect(recheck[0].name).toBe('Nuevo Nombre Confirmado en DB');
  });

  // =========================================================================
  // EL-TK-022: Definir la bienvenida de un borrador en PostgreSQL
  // =========================================================================
  it('EL-TK-022: guarda y limpia welcome_message en PostgreSQL con idempotencia', async () => {
    const key = `key-welcome-${randomUUID()}`;

    const res = await service.setWelcomeMessage({
      actorContext: ownerContext,
      eventId,
      welcomeMessage: '¡Bienvenidos todos a nuestro espacio privado!',
      idempotencyKey: key
    });

    expect(res.outcome).toBe('UPDATED');
    expect(res.event.welcomeMessage).toBe('¡Bienvenidos todos a nuestro espacio privado!');

    // Verificación en PostgreSQL
    const rows = await query<{ welcome_message: string; idempotency_key: string }>(
      'SELECT welcome_message, idempotency_key FROM event WHERE id = $1',
      eventId
    );
    expect(rows[0].welcome_message).toBe('¡Bienvenidos todos a nuestro espacio privado!');
    expect(rows[0].idempotency_key).toBe(key);

    // Limpieza de bienvenida pasando null
    const resClear = await service.setWelcomeMessage({
      actorContext: ownerContext,
      eventId,
      welcomeMessage: null
    });
    expect(resClear.event.welcomeMessage).toBeNull();

    const clearRows = await query<{ welcome_message: string | null }>(
      'SELECT welcome_message FROM event WHERE id = $1',
      eventId
    );
    expect(clearRows[0].welcome_message).toBeNull();
  });

  // =========================================================================
  // EL-TK-028: Elegir el modo de moderación en PostgreSQL
  // =========================================================================
  it('EL-TK-028: alterna moderation_mode en PostgreSQL conservando la integridad de datos', async () => {
    const key = `key-mod-${randomUUID()}`;

    const res = await service.setModerationMode({
      actorContext: ownerContext,
      eventId,
      moderationMode: 'MANUAL_REVIEW',
      idempotencyKey: key
    });

    expect(res.outcome).toBe('UPDATED');
    expect(res.event.moderationMode).toBe('MANUAL_REVIEW');

    const rows = await query<{ moderation_mode: string }>(
      'SELECT moderation_mode FROM event WHERE id = $1',
      eventId
    );
    expect(rows[0].moderation_mode).toBe('MANUAL_REVIEW');

    // Cambiar de vuelta a AUTO_PUBLISH
    const resAuto = await service.setModerationMode({
      actorContext: ownerContext,
      eventId,
      moderationMode: 'AUTO_PUBLISH'
    });
    expect(resAuto.event.moderationMode).toBe('AUTO_PUBLISH');

    const rowsAuto = await query<{ moderation_mode: string }>(
      'SELECT moderation_mode FROM event WHERE id = $1',
      eventId
    );
    expect(rowsAuto[0].moderation_mode).toBe('AUTO_PUBLISH');
  });

  // =========================================================================
  // EL-TK-029: Configurar la carga de invitados (uploads_enabled) en PostgreSQL
  // =========================================================================
  it('EL-TK-029: conmuta uploads_enabled en PostgreSQL sin alterar guest_gallery_enabled', async () => {
    // 1. uploads_enabled a true
    const res1 = await service.setGuestUploads({
      actorContext: ownerContext,
      eventId,
      uploadsEnabled: true
    });

    expect(res1.event.uploadsEnabled).toBe(true);
    expect(res1.event.guestGalleryEnabled).toBe(false);

    let rows = await query<{ uploads_enabled: boolean; guest_gallery_enabled: boolean }>(
      'SELECT uploads_enabled, guest_gallery_enabled FROM event WHERE id = $1',
      eventId
    );
    expect(rows[0].uploads_enabled).toBe(true);
    expect(rows[0].guest_gallery_enabled).toBe(false);

    // 2. uploads_enabled a false
    const res2 = await service.setGuestUploads({
      actorContext: ownerContext,
      eventId,
      uploadsEnabled: false
    });

    expect(res2.event.uploadsEnabled).toBe(false);
    expect(res2.event.guestGalleryEnabled).toBe(false);

    rows = await query<{ uploads_enabled: boolean; guest_gallery_enabled: boolean }>(
      'SELECT uploads_enabled, guest_gallery_enabled FROM event WHERE id = $1',
      eventId
    );
    expect(rows[0].uploads_enabled).toBe(false);
    expect(rows[0].guest_gallery_enabled).toBe(false);
  });

  // =========================================================================
  // EL-TK-030: Configurar la galería invitada (guest_gallery_enabled) en PostgreSQL
  // =========================================================================
  it('EL-TK-030: conmuta guest_gallery_enabled en PostgreSQL sin alterar uploads_enabled', async () => {
    // 1. guest_gallery_enabled a true
    const res1 = await service.setGuestGallery({
      actorContext: ownerContext,
      eventId,
      guestGalleryEnabled: true
    });

    expect(res1.event.guestGalleryEnabled).toBe(true);
    expect(res1.event.uploadsEnabled).toBe(false);

    let rows = await query<{ uploads_enabled: boolean; guest_gallery_enabled: boolean }>(
      'SELECT uploads_enabled, guest_gallery_enabled FROM event WHERE id = $1',
      eventId
    );
    expect(rows[0].guest_gallery_enabled).toBe(true);
    expect(rows[0].uploads_enabled).toBe(false);

    // 2. guest_gallery_enabled a false
    const res2 = await service.setGuestGallery({
      actorContext: ownerContext,
      eventId,
      guestGalleryEnabled: false
    });

    expect(res2.event.guestGalleryEnabled).toBe(false);
    expect(res2.event.uploadsEnabled).toBe(false);

    rows = await query<{ uploads_enabled: boolean; guest_gallery_enabled: boolean }>(
      'SELECT uploads_enabled, guest_gallery_enabled FROM event WHERE id = $1',
      eventId
    );
    expect(rows[0].guest_gallery_enabled).toBe(false);
    expect(rows[0].uploads_enabled).toBe(false);
  });

  // =========================================================================
  // Concurrencia y Serialización SQL (EL-TD-001..007)
  // =========================================================================
  it('soporta dos escrituras concurrentes mediante FOR UPDATE sin lost update ni estado inconsistente', async () => {
    // Ejecutar dos actualizaciones concurrentes (nombre y bienvenida)
    const [p1, p2] = await Promise.all([
      service.updateDraftName({
        actorContext: ownerContext,
        eventId,
        name: 'Nombre Final Concurrente'
      }),
      service.setWelcomeMessage({
        actorContext: ownerContext,
        eventId,
        welcomeMessage: 'Bienvenida Final Concurrente'
      })
    ]);

    expect(p1.outcome).toBe('UPDATED');
    expect(p2.outcome).toBe('UPDATED');

    const finalRow = await query<{ name: string; welcome_message: string }>(
      'SELECT name, welcome_message FROM event WHERE id = $1',
      eventId
    );
    expect(finalRow[0].name).toBe('Nombre Final Concurrente');
    expect(finalRow[0].welcome_message).toBe('Bienvenida Final Concurrente');
  });
});
