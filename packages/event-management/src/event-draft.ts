import { createHash, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  EventManagementError,
  type CreateEventDraftCommand,
  type CreateEventDraftResult,
  type EventAuditSink,
  type EventRecord,
  type EventStatus,
  type ModerationMode
} from './contracts.js';

interface EventRow {
  id: string;
  organizer_id: string;
  name: string;
  status: string;
  timezone: string;
  uploads_enabled: boolean;
  guest_gallery_enabled: boolean;
  moderation_mode: string;
  pin_enabled: boolean;
  idempotency_key?: string | null;
  idempotency_payload_hash?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapRowToRecord(row: EventRow): EventRecord {
  return {
    id: row.id,
    organizerId: row.organizer_id,
    name: row.name,
    status: row.status as EventStatus,
    timezone: row.timezone,
    uploadsEnabled: Boolean(row.uploads_enabled),
    guestGalleryEnabled: Boolean(row.guest_gallery_enabled),
    moderationMode: row.moderation_mode as ModerationMode,
    pinEnabled: Boolean(row.pin_enabled),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

/**
 * Service responsible for event draft creation, isolation, and lifecycle preparation (MOD-002, EL-TK-020).
 * Enforces DEC-069 default values: DRAFT status, America/Bogota TZ, disabled uploads and gallery,
 * AUTO_PUBLISH moderation, and disabled PIN.
 */
export class EventDraftService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly auditSink?: EventAuditSink
  ) {}

  /**
   * Creates an event draft for an authenticated organizer (EL-TK-020).
   */
  public async createDraft(command: CreateEventDraftCommand): Promise<CreateEventDraftResult> {
    if (!command || typeof command !== 'object') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Create event command is required');
    }

    const { actorContext, name, idempotencyKey } = command;

    // 1. Validar autorización del actor
    if (
      !actorContext ||
      actorContext.actorType !== 'ORGANIZER_HUMAN' ||
      !actorContext.accountId ||
      typeof actorContext.accountId !== 'string'
    ) {
      throw new EventManagementError('UNAUTHORIZED', 'Authenticated organizer context is required');
    }

    // 2. Validar nombre del evento (Escenario 2)
    if (!name || typeof name !== 'string') {
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_DRAFT_CREATED',
        actorId: actorContext.accountId,
        targetIdentifier: 'UNKNOWN',
        result: 'REJECTED_INVALID_NAME',
        details: 'Event creation rejected: missing or invalid name string',
        timestamp: new Date()
      });
      throw new EventManagementError('INVALID_NAME', 'Event name is required and cannot be empty');
    }

    const trimmedName = name.trim();
    if (trimmedName.length === 0 || trimmedName.length > 120) {
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_DRAFT_CREATED',
        actorId: actorContext.accountId,
        targetIdentifier: 'INVALID_NAME',
        result: 'REJECTED_INVALID_NAME',
        details: `Event creation rejected: name length ${trimmedName.length} outside [1, 120]`,
        timestamp: new Date()
      });
      throw new EventManagementError('INVALID_NAME', 'Event name must be between 1 and 120 characters');
    }

    const payloadHash = createHash('sha256')
      .update(JSON.stringify({ organizerId: actorContext.accountId, name: trimmedName }))
      .digest('hex');

    return this.runner.run(async (tx: SqlTransaction) => {
      const now = new Date();

      // 3. Manejo de idempotencia compatible
      if (idempotencyKey) {
        const existingRows = await tx.query<EventRow>(
          `SELECT id, organizer_id, name, status, timezone, uploads_enabled,
                  guest_gallery_enabled, moderation_mode, pin_enabled,
                  idempotency_key, idempotency_payload_hash, created_at, updated_at
           FROM event
           WHERE idempotency_key = $1
           FOR UPDATE`,
          idempotencyKey
        );

        if (existingRows.length > 0) {
          const existing = existingRows[0];
          if (
            existing.idempotency_payload_hash === payloadHash &&
            existing.organizer_id === actorContext.accountId
          ) {
            await this.auditSink?.record({
              id: randomUUID(),
              procedure: 'EVENT_DRAFT_CREATED',
              actorId: actorContext.accountId,
              targetIdentifier: existing.id,
              result: 'IDEMPOTENT_REPLAY',
              details: 'Idempotent replay of existing event draft',
              timestamp: now
            });
            return {
              event: mapRowToRecord(existing),
              outcome: 'IDEMPOTENT_REPLAY'
            };
          }

          throw new EventManagementError(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key has already been used with different parameters'
          );
        }
      }

      // 4. Crear el borrador con los valores iniciales confirmados (DEC-069, Escenario 1)
      const eventId = randomUUID();
      const timezone = 'America/Bogota';
      const status: EventStatus = 'DRAFT';
      const uploadsEnabled = false;
      const guestGalleryEnabled = false;
      const moderationMode: ModerationMode = 'AUTO_PUBLISH';
      const pinEnabled = false;

      const insertSql = idempotencyKey
        ? `INSERT INTO event (
             id, organizer_id, name, status, timezone, uploads_enabled,
             guest_gallery_enabled, moderation_mode, pin_enabled,
             idempotency_key, idempotency_payload_hash, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (idempotency_key) DO NOTHING`
        : `INSERT INTO event (
             id, organizer_id, name, status, timezone, uploads_enabled,
             guest_gallery_enabled, moderation_mode, pin_enabled,
             idempotency_key, idempotency_payload_hash, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`;

      const insertedCount = await tx.execute(
        insertSql,
        eventId,
        actorContext.accountId,
        trimmedName,
        status,
        timezone,
        uploadsEnabled,
        guestGalleryEnabled,
        moderationMode,
        pinEnabled,
        idempotencyKey ?? null,
        idempotencyKey ? payloadHash : null,
        now,
        now
      );

      // Si hubo carrera de idempotencia y otra transacción ganó la inserción
      if (idempotencyKey && insertedCount === 0) {
        const raceRows = await tx.query<EventRow>(
          `SELECT id, organizer_id, name, status, timezone, uploads_enabled,
                  guest_gallery_enabled, moderation_mode, pin_enabled,
                  idempotency_key, idempotency_payload_hash, created_at, updated_at
           FROM event
           WHERE idempotency_key = $1`,
          idempotencyKey
        );

        if (raceRows.length > 0) {
          const raceWinner = raceRows[0];
          if (
            raceWinner.idempotency_payload_hash === payloadHash &&
            raceWinner.organizer_id === actorContext.accountId
          ) {
            return {
              event: mapRowToRecord(raceWinner),
              outcome: 'IDEMPOTENT_REPLAY'
            };
          }
        }

        throw new EventManagementError(
          'IDEMPOTENCY_CONFLICT',
          'Idempotency key has already been used with different parameters'
        );
      }

      const createdRecord: EventRecord = {
        id: eventId,
        organizerId: actorContext.accountId,
        name: trimmedName,
        status,
        timezone,
        uploadsEnabled,
        guestGalleryEnabled,
        moderationMode,
        pinEnabled,
        createdAt: now,
        updatedAt: now
      };

      // Registrar auditoría de creación
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_DRAFT_CREATED',
        actorId: actorContext.accountId,
        targetIdentifier: eventId,
        result: 'SUCCESS',
        details: `Event draft "${trimmedName}" created with ID ${eventId}`,
        timestamp: now
      });

      return {
        event: createdRecord,
        outcome: 'CREATED'
      };
    });
  }

  /**
   * Retrieves an event by ID.
   */
  public async getEventById(eventId: string): Promise<EventRecord> {
    if (!eventId || typeof eventId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Event ID is required');
    }

    return this.runner.run(async (tx: SqlTransaction) => {
      const rows = await tx.query<EventRow>(
        `SELECT id, organizer_id, name, status, timezone, uploads_enabled,
                guest_gallery_enabled, moderation_mode, pin_enabled,
                created_at, updated_at
         FROM event
         WHERE id = $1`,
        eventId
      );

      if (!rows.length) {
        throw new EventManagementError('EVENT_NOT_FOUND', `Event with ID ${eventId} not found`);
      }

      return mapRowToRecord(rows[0]);
    });
  }
}
