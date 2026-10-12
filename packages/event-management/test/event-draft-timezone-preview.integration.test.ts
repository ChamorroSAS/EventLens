import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import type { OrganizerActorContext, AdminActorContext } from '@eventlens/identity';
import {
  EventDraftService,
  EventManagementError,
  type EventAuditSink,
  type EventAuditRecord
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('EventDraftTimezonePreview (Real PostgreSQL Integration Tests — EL-TK-024, 025, 031)', () => {
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
  let adminContext: AdminActorContext;
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
    `);
    await sql('ALTER TABLE event ADD COLUMN IF NOT EXISTS welcome_message TEXT;');
  });

  beforeEach(async () => {
    recordedAudits.length = 0;
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

    adminContext = {
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

    eventId = randomUUID();
  });

  // =========================================================================
  // EL-TK-024: Cambiar la zona horaria de un evento preparado en PostgreSQL
  // =========================================================================
  it('EL-TK-024: cambia zona IANA en PostgreSQL en DRAFT conservando hora local y recalculando UTC', async () => {
    // Inserta evento en DRAFT con horario local 2026-12-20T16:00:00 en Bogota (UTC-5 -> 21:00 UTC)
    await sql(
      `INSERT INTO event (
         id, organizer_id, name, status, timezone, starts_at_local, scheduled_at, utc_offset_minutes,
         uploads_enabled, guest_gallery_enabled, moderation_mode, pin_enabled, created_at, updated_at
       ) VALUES ($1, $2, $3, 'DRAFT', 'America/Bogota', '2026-12-20T16:00:00', '2026-12-20 21:00:00+00', -300, false, false, 'AUTO_PUBLISH', false, NOW(), NOW())`,
      eventId,
      ownerContext.accountId,
      'Gala de Fin de Año'
    );

    // Cambia a Europe/Madrid (UTC+1 en invierno): 16:00 Madrid = 15:00 UTC
    const result = await service.changeTimezone({
      actorContext: ownerContext,
      eventId,
      timezone: 'Europe/Madrid'
    });

    expect(result.outcome).toBe('TIMEZONE_CHANGED');
    expect(result.previousTimezone).toBe('America/Bogota');
    expect(result.warning).toBeNull();
    expect(result.event.timezone).toBe('Europe/Madrid');
    expect(result.event.startsAtLocal).toBe('2026-12-20T16:00:00');
    expect(result.event.scheduledAt?.toISOString()).toBe('2026-12-20T15:00:00.000Z');
    expect(result.event.utcOffsetMinutes).toBe(60);

    // Verifica persistencia real en PostgreSQL
    const rows = await query<any>('SELECT timezone, starts_at_local, scheduled_at, utc_offset_minutes FROM event WHERE id = $1', eventId);
    expect(rows[0].timezone).toBe('Europe/Madrid');
    expect(rows[0].starts_at_local).toBe('2026-12-20T16:00:00');
    expect(new Date(rows[0].scheduled_at).toISOString()).toBe('2026-12-20T15:00:00.000Z');
    expect(rows[0].utc_offset_minutes).toBe(60);

    // Verifica auditoría
    expect(recordedAudits).toHaveLength(1);
    expect(recordedAudits[0].procedure).toBe('EVENT_TIMEZONE_CHANGED');
    expect(recordedAudits[0].result).toBe('TIMEZONE_CHANGED');
  });

  it('EL-TK-024: cambia zona IANA en PostgreSQL en SCHEDULED emitiendo warning RECALCULATED_SCHEDULE', async () => {
    await sql(
      `INSERT INTO event (
         id, organizer_id, name, status, timezone, starts_at_local, scheduled_at, utc_offset_minutes,
         uploads_enabled, guest_gallery_enabled, moderation_mode, pin_enabled, created_at, updated_at
       ) VALUES ($1, $2, $3, 'SCHEDULED', 'America/Bogota', '2026-12-20T16:00:00', '2026-12-20 21:00:00+00', -300, false, false, 'AUTO_PUBLISH', false, NOW(), NOW())`,
      eventId,
      ownerContext.accountId,
      'Evento Programado'
    );

    const result = await service.changeTimezone({
      actorContext: ownerContext,
      eventId,
      timezone: 'Europe/Madrid'
    });

    expect(result.outcome).toBe('TIMEZONE_CHANGED');
    expect(result.warning).toBe('RECALCULATED_SCHEDULE');
    expect(result.event.timezone).toBe('Europe/Madrid');
    expect(result.event.scheduledAt?.toISOString()).toBe('2026-12-20T15:00:00.000Z');

    expect(recordedAudits[0].result).toBe('RECALCULATED_SCHEDULE');
  });

  it('EL-TK-024: soporta idempotencia en PostgreSQL y rechaza actor no propietario sin modificar la base de datos', async () => {
    await sql(
      `INSERT INTO event (
         id, organizer_id, name, status, timezone, uploads_enabled, guest_gallery_enabled, moderation_mode, pin_enabled, created_at, updated_at
       ) VALUES ($1, $2, $3, 'DRAFT', 'America/Bogota', false, false, 'AUTO_PUBLISH', false, NOW(), NOW())`,
      eventId,
      ownerContext.accountId,
      'Borrador Idempotente'
    );

    const key = 'idem-pg-tz-1';
    const first = await service.changeTimezone({
      actorContext: ownerContext,
      eventId,
      timezone: 'America/Argentina/Buenos_Aires',
      idempotencyKey: key
    });
    expect(first.outcome).toBe('TIMEZONE_CHANGED');

    const replay = await service.changeTimezone({
      actorContext: ownerContext,
      eventId,
      timezone: 'America/Argentina/Buenos_Aires',
      idempotencyKey: key
    });
    expect(replay.outcome).toBe('IDEMPOTENT_REPLAY');

    // Intento con actor no propietario
    await expect(
      service.changeTimezone({
        actorContext: otherContext,
        eventId,
        timezone: 'Asia/Tokyo'
      })
    ).rejects.toThrowError(EventManagementError);

    // Comprueba que no se mutó a Asia/Tokyo
    const rows = await query<any>('SELECT timezone FROM event WHERE id = $1', eventId);
    expect(rows[0].timezone).toBe('America/Argentina/Buenos_Aires');
  });

  // =========================================================================
  // EL-TK-025: Corregir zona horaria de evento post-ACTIVE en PostgreSQL
  // =========================================================================
  it('EL-TK-025: administrador autorizado corrige zona IANA de evento ACTIVE en PostgreSQL con justificación preservando ciclo de vida', async () => {
    const expiresAt = new Date('2026-11-15T23:00:00Z');
    const graceEndsAt = new Date('2026-11-22T23:00:00Z');

    await sql(
      `INSERT INTO event (
         id, organizer_id, name, status, timezone, starts_at_local, scheduled_at, utc_offset_minutes,
         expires_at, grace_ends_at, uploads_enabled, guest_gallery_enabled, moderation_mode, pin_enabled, created_at, updated_at
       ) VALUES ($1, $2, $3, 'ACTIVE', 'America/Bogota', '2026-11-01T10:00:00', '2026-11-01 15:00:00+00', -300, $4, $5, false, false, 'AUTO_PUBLISH', false, NOW(), NOW())`,
      eventId,
      ownerContext.accountId,
      'Conferencia Internacional',
      expiresAt,
      graceEndsAt
    );

    // Corrige a America/Lima (-5): 10:00 Lima = 15:00 UTC
    const result = await service.adminCorrectTimezone({
      actorContext: adminContext,
      eventId,
      timezone: 'America/Lima',
      justification: 'Corrección aprobada por ticket de soporte SUP-10492'
    });

    expect(result.outcome).toBe('TIMEZONE_CORRECTED');
    expect(result.previousTimezone).toBe('America/Bogota');
    expect(result.event.timezone).toBe('America/Lima');
    expect(result.event.startsAtLocal).toBe('2026-11-01T10:00:00');
    expect(result.event.scheduledAt?.toISOString()).toBe('2026-11-01T15:00:00.000Z');

    // Verifica persistencia en PostgreSQL
    const rows = await query<any>('SELECT timezone, starts_at_local, scheduled_at, expires_at, grace_ends_at FROM event WHERE id = $1', eventId);
    expect(rows[0].timezone).toBe('America/Lima');
    expect(rows[0].starts_at_local).toBe('2026-11-01T10:00:00');
    expect(new Date(rows[0].scheduled_at).toISOString()).toBe('2026-11-01T15:00:00.000Z');
    // Lifecycle intacto
    expect(new Date(rows[0].expires_at).toISOString()).toBe(expiresAt.toISOString());
    expect(new Date(rows[0].grace_ends_at).toISOString()).toBe(graceEndsAt.toISOString());

    expect(recordedAudits).toHaveLength(1);
    expect(recordedAudits[0].procedure).toBe('ADMIN_EVENT_TIMEZONE_CORRECTED');
    expect(recordedAudits[0].result).toBe('TIMEZONE_CORRECTED');
    expect(recordedAudits[0].details).toContain('SUP-10492');
  });

  it('EL-TK-025: rechaza corrección administrativa en PostgreSQL si el evento está en DRAFT o falta justificación', async () => {
    await sql(
      `INSERT INTO event (
         id, organizer_id, name, status, timezone, uploads_enabled, guest_gallery_enabled, moderation_mode, pin_enabled, created_at, updated_at
       ) VALUES ($1, $2, $3, 'DRAFT', 'America/Bogota', false, false, 'AUTO_PUBLISH', false, NOW(), NOW())`,
      eventId,
      ownerContext.accountId,
      'Evento en Borrador'
    );

    // Intento en DRAFT -> rechaza INVALID_STATE
    await expect(
      service.adminCorrectTimezone({
        actorContext: adminContext,
        eventId,
        timezone: 'America/Lima',
        justification: 'Intento en DRAFT'
      })
    ).rejects.toThrowError(EventManagementError);

    // Cambia estado a ACTIVE en DB
    await sql(`UPDATE event SET status = 'ACTIVE' WHERE id = $1`, eventId);

    // Intento sin justificación -> rechaza JUSTIFICATION_REQUIRED
    await expect(
      service.adminCorrectTimezone({
        actorContext: adminContext,
        eventId,
        timezone: 'America/Lima',
        justification: '   '
      })
    ).rejects.toThrowError(EventManagementError);

    // No se mutó la zona horaria en PostgreSQL
    const rows = await query<any>('SELECT timezone FROM event WHERE id = $1', eventId);
    expect(rows[0].timezone).toBe('America/Bogota');
  });

  // =========================================================================
  // EL-TK-031: Previsualizar borrador como invitado en PostgreSQL
  // =========================================================================
  it('EL-TK-031: previsualiza borrador en PostgreSQL retornando EventSnapshot privado sin modificar la base de datos', async () => {
    await sql(
      `INSERT INTO event (
         id, organizer_id, name, status, timezone, starts_at_local, scheduled_at, utc_offset_minutes,
         welcome_message, uploads_enabled, guest_gallery_enabled, moderation_mode, pin_enabled, pin_hash, pin_salt, created_at, updated_at
       ) VALUES ($1, $2, $3, 'DRAFT', 'America/Bogota', '2026-11-25T19:00:00', '2026-11-26 00:00:00+00', -300, 'Bienvenidos a todos', false, false, 'AUTO_PUBLISH', true, 'hash123', 'salt123', NOW(), NOW())`,
      eventId,
      ownerContext.accountId,
      'Borrador de Prueba Privado'
    );

    const result = await service.previewDraftAsGuest({
      actorContext: ownerContext,
      eventId
    });

    expect(result.snapshot).toBeDefined();
    expect(result.snapshot.eventId).toBe(eventId);
    expect(result.snapshot.name).toBe('Borrador de Prueba Privado');
    expect(result.snapshot.status).toBe('DRAFT');
    expect(result.snapshot.timezone).toBe('America/Bogota');
    expect(result.snapshot.startsAtLocal).toBe('2026-11-25T19:00:00');
    expect(result.snapshot.welcomeMessage).toBe('Bienvenidos a todos');
    expect(result.snapshot.pinEnabled).toBe(true);
    expect(result.snapshot.isPreview).toBe(true);
    expect((result.snapshot as any).pin_hash).toBeUndefined();
    expect((result.snapshot as any).pinHash).toBeUndefined();

    // Verifica que la fila en PostgreSQL no fue alterada
    const rows = await query<any>('SELECT status, name FROM event WHERE id = $1', eventId);
    expect(rows[0].status).toBe('DRAFT');

    // Verifica aislamiento anti-enumeración ante actor ajeno
    await expect(
      service.previewDraftAsGuest({
        actorContext: otherContext,
        eventId
      })
    ).rejects.toThrowError(EventManagementError);

    try {
      await service.previewDraftAsGuest({
        actorContext: otherContext,
        eventId
      });
    } catch (err: any) {
      expect(err.code).toBe('EVENT_NOT_FOUND');
    }

    expect(recordedAudits).toHaveLength(1);
    expect(recordedAudits[0].procedure).toBe('EVENT_DRAFT_PREVIEWED');
  });
});
