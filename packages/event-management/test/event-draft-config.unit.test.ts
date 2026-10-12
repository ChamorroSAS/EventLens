import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import type { OrganizerActorContext } from '@eventlens/identity';
import {
  EventDraftService,
  EventManagementError,
  type EventAuditSink,
  type EventAuditRecord,
  type EventRecord,
  type ModerationMode
} from '../src/index.js';

interface InMemoryDb {
  events: Map<string, any>;
  auditEvents: EventAuditRecord[];
}

function createInMemoryRunner(db: InMemoryDb): TransactionRunner {
  return {
    async run<R>(callback: (tx: SqlTransaction) => Promise<R>): Promise<R> {
      const tx: SqlTransaction = {
        async query<T extends object>(sql: string, ...params: unknown[]): Promise<T[]> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // SELECT ... FROM event WHERE id = $1 (with or without FOR UPDATE)
          if (normalized.includes('FROM event') && normalized.includes('WHERE id = $1')) {
            const id = params[0] as string;
            const ev = db.events.get(id);
            if (ev) return [{ ...ev }] as unknown as T[];
            return [] as unknown as T[];
          }

          // UPDATE event
          if (normalized.includes('UPDATE event')) {
            const id = params[params.length - 1] as string;
            const existing = db.events.get(id);
            if (!existing) throw new Error(`Event not found for update: ${id}`);

            if (normalized.includes('SET name = $1')) {
              existing.name = params[0];
            } else if (normalized.includes('SET welcome_message = $1')) {
              existing.welcome_message = params[0];
            } else if (normalized.includes('SET moderation_mode = $1')) {
              existing.moderation_mode = params[0];
            } else if (normalized.includes('SET uploads_enabled = $1')) {
              existing.uploads_enabled = params[0];
            } else if (normalized.includes('SET guest_gallery_enabled = $1')) {
              existing.guest_gallery_enabled = params[0];
            }

            existing.idempotency_key = params[1] ?? null;
            existing.idempotency_payload_hash = params[2] ?? null;
            existing.updated_at = params[3];

            db.events.set(id, existing);
            return [{ ...existing }] as unknown as T[];
          }

          throw new Error(`Unhandled mock query: ${sql}`);
        },

        async execute(sql: string, ..._params: unknown[]): Promise<number> {
          throw new Error(`Unhandled mock execute: ${sql}`);
        }
      };

      return callback(tx);
    }
  };
}

describe('EL-EP-002 Ruta 1: Configuración del Borrador (Unit Tests)', () => {
  let db: InMemoryDb;
  let auditRecords: EventAuditRecord[];
  let auditSink: EventAuditSink;
  let service: EventDraftService;
  let ownerActor: OrganizerActorContext;
  let otherActor: OrganizerActorContext;
  let eventId: string;

  beforeEach(() => {
    auditRecords = [];
    auditSink = {
      record: async (rec: EventAuditRecord) => {
        auditRecords.push(rec);
      }
    };

    db = {
      events: new Map(),
      auditEvents: auditRecords
    };

    service = new EventDraftService(createInMemoryRunner(db), auditSink);

    ownerActor = {
      actorType: 'ORGANIZER_HUMAN',
      accountId: randomUUID(),
      email: 'organizer@eventlens.local',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };

    otherActor = {
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

    // Evento inicial en DRAFT con defaults confirmados (DEC-069)
    db.events.set(eventId, {
      id: eventId,
      organizer_id: ownerActor.accountId,
      name: 'Boda Carlos y Maria',
      status: 'DRAFT',
      timezone: 'America/Bogota',
      starts_at_local: null,
      scheduled_at: null,
      utc_offset_minutes: null,
      expires_at: null,
      grace_ends_at: null,
      activated_at: null,
      closed_at: null,
      purge_started_at: null,
      suspended_at: null,
      suspension_reason: null,
      previous_status: null,
      validity_duration_days: null,
      grace_days: null,
      uploads_enabled: false,
      guest_gallery_enabled: false,
      moderation_mode: 'AUTO_PUBLISH',
      pin_enabled: false,
      welcome_message: null,
      idempotency_key: null,
      idempotency_payload_hash: null,
      created_at: new Date('2026-10-12T10:00:00Z'),
      updated_at: new Date('2026-10-12T10:00:00Z')
    });
  });

  // =========================================================================
  // EL-TK-021: Cambiar el nombre de un borrador
  // =========================================================================
  describe('EL-TK-021: updateDraftName', () => {
    it('actualiza exitosamente el nombre del borrador para el propietario', async () => {
      const res = await service.updateDraftName({
        actorContext: ownerActor,
        eventId,
        name: 'Boda Carlos y María - Oficial'
      });

      expect(res.outcome).toBe('UPDATED');
      expect(res.event.name).toBe('Boda Carlos y María - Oficial');
      expect(db.events.get(eventId).name).toBe('Boda Carlos y María - Oficial');

      const audit = auditRecords.find(a => a.procedure === 'EVENT_DRAFT_NAME_UPDATED' && a.result === 'SUCCESS');
      expect(audit).toBeDefined();
      expect(audit?.actorId).toBe(ownerActor.accountId);
      expect(audit?.targetIdentifier).toBe(eventId);
    });

    it('rechaza nombre vacío o que solo contiene espacios con INVALID_NAME', async () => {
      await expect(
        service.updateDraftName({
          actorContext: ownerActor,
          eventId,
          name: '   '
        })
      ).rejects.toThrowError(EventManagementError);

      await expect(
        service.updateDraftName({
          actorContext: ownerActor,
          eventId,
          name: '   '
        })
      ).rejects.toMatchObject({ code: 'INVALID_NAME' });

      expect(db.events.get(eventId).name).toBe('Boda Carlos y Maria');
    });

    it('rechaza nombre con más de 120 caracteres con INVALID_NAME', async () => {
      const longName = 'A'.repeat(121);
      await expect(
        service.updateDraftName({
          actorContext: ownerActor,
          eventId,
          name: longName
        })
      ).rejects.toMatchObject({ code: 'INVALID_NAME' });
    });

    it('rechaza intento de actualización por organizador ajeno con UNAUTHORIZED', async () => {
      await expect(
        service.updateDraftName({
          actorContext: otherActor,
          eventId,
          name: 'Nuevo Nombre Invasor'
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

      expect(db.events.get(eventId).name).toBe('Boda Carlos y Maria');
      const audit = auditRecords.find(a => a.result === 'REJECTED_UNAUTHORIZED');
      expect(audit).toBeDefined();
    });

    it('rechaza si el evento no existe con EVENT_NOT_FOUND', async () => {
      await expect(
        service.updateDraftName({
          actorContext: ownerActor,
          eventId: randomUUID(),
          name: 'Nombre Valido'
        })
      ).rejects.toMatchObject({ code: 'EVENT_NOT_FOUND' });
    });

    it('rechaza si el evento no está en estado DRAFT con EVENT_NOT_IN_DRAFT', async () => {
      db.events.get(eventId).status = 'ACTIVE';

      await expect(
        service.updateDraftName({
          actorContext: ownerActor,
          eventId,
          name: 'Nombre Valido'
        })
      ).rejects.toMatchObject({ code: 'EVENT_NOT_IN_DRAFT' });

      expect(db.events.get(eventId).name).toBe('Boda Carlos y Maria');
    });

    it('maneja idempotencia con replay compatible y conflicto ante payload diferente', async () => {
      const key = 'idemp-name-001';

      const first = await service.updateDraftName({
        actorContext: ownerActor,
        eventId,
        name: 'Nombre Idempotente',
        idempotencyKey: key
      });
      expect(first.outcome).toBe('UPDATED');

      // Replay compatible
      const replay = await service.updateDraftName({
        actorContext: ownerActor,
        eventId,
        name: 'Nombre Idempotente',
        idempotencyKey: key
      });
      expect(replay.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(replay.event.name).toBe('Nombre Idempotente');

      // Conflicto con distinta payload
      await expect(
        service.updateDraftName({
          actorContext: ownerActor,
          eventId,
          name: 'Otro Nombre Distinto',
          idempotencyKey: key
        })
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    });
  });

  // =========================================================================
  // EL-TK-022: Definir la bienvenida de un borrador
  // =========================================================================
  describe('EL-TK-022: setWelcomeMessage', () => {
    it('guarda exitosamente el mensaje de bienvenida y lo asocia al evento', async () => {
      const res = await service.setWelcomeMessage({
        actorContext: ownerActor,
        eventId,
        welcomeMessage: '¡Bienvenidos a nuestra celebración especial!'
      });

      expect(res.outcome).toBe('UPDATED');
      expect(res.event.welcomeMessage).toBe('¡Bienvenidos a nuestra celebración especial!');
      expect(db.events.get(eventId).welcome_message).toBe('¡Bienvenidos a nuestra celebración especial!');

      const audit = auditRecords.find(a => a.procedure === 'EVENT_WELCOME_MESSAGE_SET' && a.result === 'SUCCESS');
      expect(audit).toBeDefined();
      expect(audit?.details).not.toContain('celebración especial'); // Sin texto sensible innecesario
    });

    it('permite limpiar o dejar vacía la bienvenida pasando null o string vacío', async () => {
      db.events.get(eventId).welcome_message = 'Mensaje anterior';

      const res = await service.setWelcomeMessage({
        actorContext: ownerActor,
        eventId,
        welcomeMessage: null
      });

      expect(res.outcome).toBe('UPDATED');
      expect(res.event.welcomeMessage).toBeNull();
      expect(db.events.get(eventId).welcome_message).toBeNull();

      const res2 = await service.setWelcomeMessage({
        actorContext: ownerActor,
        eventId,
        welcomeMessage: '   '
      });
      expect(res2.event.welcomeMessage).toBeNull();
    });

    it('rechaza mensaje que excede 1000 caracteres con INVALID_ARGUMENT', async () => {
      await expect(
        service.setWelcomeMessage({
          actorContext: ownerActor,
          eventId,
          welcomeMessage: 'W'.repeat(1001)
        })
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('rechaza intento por organizador ajeno con UNAUTHORIZED', async () => {
      await expect(
        service.setWelcomeMessage({
          actorContext: otherActor,
          eventId,
          welcomeMessage: 'Bienvenida fraudulenta'
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

      expect(db.events.get(eventId).welcome_message).toBeNull();
    });

    it('rechaza si el evento no está en DRAFT con EVENT_NOT_IN_DRAFT', async () => {
      db.events.get(eventId).status = 'CLOSED';

      await expect(
        service.setWelcomeMessage({
          actorContext: ownerActor,
          eventId,
          welcomeMessage: 'Bienvenida'
        })
      ).rejects.toMatchObject({ code: 'EVENT_NOT_IN_DRAFT' });
    });

    it('soporta idempotencia replay y detecta conflicto', async () => {
      const key = 'idemp-welcome-001';

      const first = await service.setWelcomeMessage({
        actorContext: ownerActor,
        eventId,
        welcomeMessage: 'Bienvenida 1',
        idempotencyKey: key
      });
      expect(first.outcome).toBe('UPDATED');

      const replay = await service.setWelcomeMessage({
        actorContext: ownerActor,
        eventId,
        welcomeMessage: 'Bienvenida 1',
        idempotencyKey: key
      });
      expect(replay.outcome).toBe('IDEMPOTENT_REPLAY');

      await expect(
        service.setWelcomeMessage({
          actorContext: ownerActor,
          eventId,
          welcomeMessage: 'Bienvenida 2',
          idempotencyKey: key
        })
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    });
  });

  // =========================================================================
  // EL-TK-028: Elegir el modo de moderación de un borrador
  // =========================================================================
  describe('EL-TK-028: setModerationMode', () => {
    it('cambia el modo de moderación a MANUAL_REVIEW y luego a AUTO_PUBLISH', async () => {
      const res1 = await service.setModerationMode({
        actorContext: ownerActor,
        eventId,
        moderationMode: 'MANUAL_REVIEW'
      });

      expect(res1.outcome).toBe('UPDATED');
      expect(res1.event.moderationMode).toBe('MANUAL_REVIEW');
      expect(db.events.get(eventId).moderation_mode).toBe('MANUAL_REVIEW');

      const res2 = await service.setModerationMode({
        actorContext: ownerActor,
        eventId,
        moderationMode: 'AUTO_PUBLISH'
      });

      expect(res2.outcome).toBe('UPDATED');
      expect(res2.event.moderationMode).toBe('AUTO_PUBLISH');
      expect(db.events.get(eventId).moderation_mode).toBe('AUTO_PUBLISH');

      const audit = auditRecords.find(a => a.procedure === 'EVENT_MODERATION_MODE_SET' && a.result === 'SUCCESS');
      expect(audit).toBeDefined();
      expect(audit?.details).toContain('AUTO_PUBLISH');
    });

    it('rechaza modo de moderación inválido con INVALID_ARGUMENT', async () => {
      await expect(
        service.setModerationMode({
          actorContext: ownerActor,
          eventId,
          moderationMode: 'INVALID_MODE' as any
        })
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });

      expect(db.events.get(eventId).moderation_mode).toBe('AUTO_PUBLISH');
    });

    it('rechaza intento por organizador ajeno con UNAUTHORIZED', async () => {
      await expect(
        service.setModerationMode({
          actorContext: otherActor,
          eventId,
          moderationMode: 'MANUAL_REVIEW'
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

      expect(db.events.get(eventId).moderation_mode).toBe('AUTO_PUBLISH');
    });

    it('permite cambiar moderación en DRAFT, SCHEDULED y ACTIVE, y rechaza en CLOSED con INVALID_STATE (EL-TK-110)', async () => {
      // SCHEDULED permitido
      db.events.get(eventId).status = 'SCHEDULED';
      const resScheduled = await service.setModerationMode({
        actorContext: ownerActor,
        eventId,
        moderationMode: 'MANUAL_REVIEW'
      });
      expect(resScheduled.outcome).toBe('UPDATED');
      expect(resScheduled.event.moderationMode).toBe('MANUAL_REVIEW');

      // ACTIVE permitido
      db.events.get(eventId).status = 'ACTIVE';
      const resActive = await service.setModerationMode({
        actorContext: ownerActor,
        eventId,
        moderationMode: 'AUTO_PUBLISH'
      });
      expect(resActive.outcome).toBe('UPDATED');
      expect(resActive.event.moderationMode).toBe('AUTO_PUBLISH');

      // CLOSED rechazado
      db.events.get(eventId).status = 'CLOSED';
      await expect(
        service.setModerationMode({
          actorContext: ownerActor,
          eventId,
          moderationMode: 'MANUAL_REVIEW'
        })
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    });

    it('soporta idempotencia replay y conflicto', async () => {
      const key = 'idemp-mod-001';

      const first = await service.setModerationMode({
        actorContext: ownerActor,
        eventId,
        moderationMode: 'MANUAL_REVIEW',
        idempotencyKey: key
      });
      expect(first.outcome).toBe('UPDATED');

      const replay = await service.setModerationMode({
        actorContext: ownerActor,
        eventId,
        moderationMode: 'MANUAL_REVIEW',
        idempotencyKey: key
      });
      expect(replay.outcome).toBe('IDEMPOTENT_REPLAY');

      await expect(
        service.setModerationMode({
          actorContext: ownerActor,
          eventId,
          moderationMode: 'AUTO_PUBLISH',
          idempotencyKey: key
        })
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    });
  });

  // =========================================================================
  // EL-TK-029: Configurar la carga de invitados en un borrador
  // =========================================================================
  describe('EL-TK-029: setGuestUploads', () => {
    it('habilita uploads_enabled sin alterar guest_gallery_enabled', async () => {
      expect(db.events.get(eventId).uploads_enabled).toBe(false);
      expect(db.events.get(eventId).guest_gallery_enabled).toBe(false);

      const res = await service.setGuestUploads({
        actorContext: ownerActor,
        eventId,
        uploadsEnabled: true
      });

      expect(res.outcome).toBe('UPDATED');
      expect(res.event.uploadsEnabled).toBe(true);
      expect(res.event.guestGalleryEnabled).toBe(false);
      expect(db.events.get(eventId).uploads_enabled).toBe(true);
      expect(db.events.get(eventId).guest_gallery_enabled).toBe(false);

      const audit = auditRecords.find(a => a.procedure === 'EVENT_GUEST_UPLOADS_CONFIGURED' && a.result === 'SUCCESS');
      expect(audit).toBeDefined();
    });

    it('deshabilita uploads_enabled conservando guest_gallery_enabled previo', async () => {
      db.events.get(eventId).uploads_enabled = true;
      db.events.get(eventId).guest_gallery_enabled = true;

      const res = await service.setGuestUploads({
        actorContext: ownerActor,
        eventId,
        uploadsEnabled: false
      });

      expect(res.event.uploadsEnabled).toBe(false);
      expect(res.event.guestGalleryEnabled).toBe(true);
      expect(db.events.get(eventId).uploads_enabled).toBe(false);
      expect(db.events.get(eventId).guest_gallery_enabled).toBe(true);
    });

    it('rechaza tipo inválido no booleano con INVALID_ARGUMENT', async () => {
      await expect(
        service.setGuestUploads({
          actorContext: ownerActor,
          eventId,
          uploadsEnabled: 'true' as any
        })
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('rechaza intento por organizador ajeno con UNAUTHORIZED', async () => {
      await expect(
        service.setGuestUploads({
          actorContext: otherActor,
          eventId,
          uploadsEnabled: true
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

      expect(db.events.get(eventId).uploads_enabled).toBe(false);
    });

    it('rechaza si no está en DRAFT con EVENT_NOT_IN_DRAFT', async () => {
      db.events.get(eventId).status = 'SCHEDULED';

      await expect(
        service.setGuestUploads({
          actorContext: ownerActor,
          eventId,
          uploadsEnabled: true
        })
      ).rejects.toMatchObject({ code: 'EVENT_NOT_IN_DRAFT' });
    });

    it('soporta idempotencia replay y conflicto', async () => {
      const key = 'idemp-uploads-001';

      const first = await service.setGuestUploads({
        actorContext: ownerActor,
        eventId,
        uploadsEnabled: true,
        idempotencyKey: key
      });
      expect(first.outcome).toBe('UPDATED');

      const replay = await service.setGuestUploads({
        actorContext: ownerActor,
        eventId,
        uploadsEnabled: true,
        idempotencyKey: key
      });
      expect(replay.outcome).toBe('IDEMPOTENT_REPLAY');

      await expect(
        service.setGuestUploads({
          actorContext: ownerActor,
          eventId,
          uploadsEnabled: false,
          idempotencyKey: key
        })
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    });
  });

  // =========================================================================
  // EL-TK-030: Configurar la galería invitada en un borrador
  // =========================================================================
  describe('EL-TK-030: setGuestGallery', () => {
    it('habilita guest_gallery_enabled sin alterar uploads_enabled', async () => {
      expect(db.events.get(eventId).guest_gallery_enabled).toBe(false);
      expect(db.events.get(eventId).uploads_enabled).toBe(false);

      const res = await service.setGuestGallery({
        actorContext: ownerActor,
        eventId,
        guestGalleryEnabled: true
      });

      expect(res.outcome).toBe('UPDATED');
      expect(res.event.guestGalleryEnabled).toBe(true);
      expect(res.event.uploadsEnabled).toBe(false);
      expect(db.events.get(eventId).guest_gallery_enabled).toBe(true);
      expect(db.events.get(eventId).uploads_enabled).toBe(false);

      const audit = auditRecords.find(a => a.procedure === 'EVENT_GUEST_GALLERY_CONFIGURED' && a.result === 'SUCCESS');
      expect(audit).toBeDefined();
    });

    it('deshabilita guest_gallery_enabled conservando uploads_enabled previo', async () => {
      db.events.get(eventId).guest_gallery_enabled = true;
      db.events.get(eventId).uploads_enabled = true;

      const res = await service.setGuestGallery({
        actorContext: ownerActor,
        eventId,
        guestGalleryEnabled: false
      });

      expect(res.event.guestGalleryEnabled).toBe(false);
      expect(res.event.uploadsEnabled).toBe(true);
      expect(db.events.get(eventId).guest_gallery_enabled).toBe(false);
      expect(db.events.get(eventId).uploads_enabled).toBe(true);
    });

    it('rechaza tipo inválido no booleano con INVALID_ARGUMENT', async () => {
      await expect(
        service.setGuestGallery({
          actorContext: ownerActor,
          eventId,
          guestGalleryEnabled: 'yes' as any
        })
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('rechaza intento por organizador ajeno con UNAUTHORIZED', async () => {
      await expect(
        service.setGuestGallery({
          actorContext: otherActor,
          eventId,
          guestGalleryEnabled: true
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

      expect(db.events.get(eventId).guest_gallery_enabled).toBe(false);
    });

    it('rechaza si no está en DRAFT con EVENT_NOT_IN_DRAFT', async () => {
      db.events.get(eventId).status = 'ACTIVE';

      await expect(
        service.setGuestGallery({
          actorContext: ownerActor,
          eventId,
          guestGalleryEnabled: true
        })
      ).rejects.toMatchObject({ code: 'EVENT_NOT_IN_DRAFT' });
    });

    it('soporta idempotencia replay y conflicto', async () => {
      const key = 'idemp-gallery-001';

      const first = await service.setGuestGallery({
        actorContext: ownerActor,
        eventId,
        guestGalleryEnabled: true,
        idempotencyKey: key
      });
      expect(first.outcome).toBe('UPDATED');

      const replay = await service.setGuestGallery({
        actorContext: ownerActor,
        eventId,
        guestGalleryEnabled: true,
        idempotencyKey: key
      });
      expect(replay.outcome).toBe('IDEMPOTENT_REPLAY');

      await expect(
        service.setGuestGallery({
          actorContext: ownerActor,
          eventId,
          guestGalleryEnabled: false,
          idempotencyKey: key
        })
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    });
  });
});
