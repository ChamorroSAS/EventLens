import { createHash, randomBytes, scryptSync, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  EventManagementError,
  type CreateEventDraftCommand,
  type CreateEventDraftResult,
  type SetEventScheduleCommand,
  type SetEventScheduleResult,
  type SetInitialPinCommand,
  type SetInitialPinResult,
  type EventAuditSink,
  type EventRecord,
  type EventStatus,
  type ModerationMode
} from './contracts.js';
import { resolveScheduleLocalTime } from './timezone.js';

interface EventRow {
  id: string;
  organizer_id: string;
  name: string;
  status: string;
  timezone: string;
  starts_at_local?: string | null;
  scheduled_at?: Date | string | null;
  utc_offset_minutes?: number | null;
  expires_at?: Date | string | null;
  grace_ends_at?: Date | string | null;
  activated_at?: Date | string | null;
  closed_at?: Date | string | null;
  purge_started_at?: Date | string | null;
  suspended_at?: Date | string | null;
  suspension_reason?: string | null;
  previous_status?: string | null;
  validity_duration_days?: number | null;
  grace_days?: number | null;
  uploads_enabled: boolean;
  guest_gallery_enabled: boolean;
  moderation_mode: string;
  pin_enabled: boolean;
  pin_hash?: string | null;
  pin_salt?: string | null;
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
    startsAtLocal: row.starts_at_local ?? null,
    scheduledAt: row.scheduled_at ? new Date(row.scheduled_at) : null,
    utcOffsetMinutes: row.utc_offset_minutes !== null && row.utc_offset_minutes !== undefined ? Number(row.utc_offset_minutes) : null,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    graceEndsAt: row.grace_ends_at ? new Date(row.grace_ends_at) : null,
    activatedAt: row.activated_at ? new Date(row.activated_at) : null,
    closedAt: row.closed_at ? new Date(row.closed_at) : null,
    purgeStartedAt: row.purge_started_at ? new Date(row.purge_started_at) : null,
    suspendedAt: row.suspended_at ? new Date(row.suspended_at) : null,
    suspensionReason: row.suspension_reason ?? null,
    previousStatus: row.previous_status ? (row.previous_status as EventStatus) : null,
    validityDurationDays: row.validity_duration_days !== null && row.validity_duration_days !== undefined ? Number(row.validity_duration_days) : null,
    graceDays: row.grace_days !== null && row.grace_days !== undefined ? Number(row.grace_days) : null,
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
        startsAtLocal: null,
        scheduledAt: null,
        utcOffsetMinutes: null,
        expiresAt: null,
        graceEndsAt: null,
        activatedAt: null,
        closedAt: null,
        purgeStartedAt: null,
        suspendedAt: null,
        suspensionReason: null,
        previousStatus: null,
        validityDurationDays: null,
        graceDays: null,
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

  /**
   * Defines the local date and time for an event draft (EL-TK-023).
   * Validates owner authorization, DRAFT status, IANA timezone consistency,
   * DST gap (spring-forward) rejection, and DST overlap (fall-back) offset selection.
   */
  public async setSchedule(command: SetEventScheduleCommand): Promise<SetEventScheduleResult> {
    if (!command || typeof command !== 'object') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Command is required');
    }

    const { actorContext, eventId, startsAtLocal, utcOffsetMinutes, idempotencyKey } = command;

    if (!actorContext || actorContext.actorType !== 'ORGANIZER_HUMAN' || !actorContext.accountId) {
      throw new EventManagementError('UNAUTHORIZED', 'Authenticated organizer context is required');
    }

    if (!eventId || typeof eventId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Valid eventId is required');
    }

    if (!startsAtLocal || typeof startsAtLocal !== 'string') {
      throw new EventManagementError('INVALID_DATE_TIME', 'Valid startsAtLocal string is required');
    }

    const payloadHash = idempotencyKey
      ? createHash('sha256')
          .update(
            JSON.stringify({
              eventId,
              startsAtLocal: startsAtLocal.trim(),
              utcOffsetMinutes: utcOffsetMinutes ?? null
            })
          )
          .digest('hex')
      : null;

    return this.runner.run(async (tx: SqlTransaction) => {
      // 1. Fetch event with row-level lock
      const rows = await tx.query<EventRow>(
        `SELECT id, organizer_id, name, status, timezone, starts_at_local, scheduled_at, utc_offset_minutes,
                uploads_enabled, guest_gallery_enabled, moderation_mode, pin_enabled,
                idempotency_key, idempotency_payload_hash, created_at, updated_at
         FROM event
         WHERE id = $1
         FOR UPDATE`,
        eventId
      );

      if (!rows.length) {
        throw new EventManagementError('EVENT_NOT_FOUND', `Event with ID ${eventId} not found`);
      }

      const current = rows[0];

      // 2. Authorize owner
      if (current.organizer_id !== actorContext.accountId) {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_SCHEDULE_SET',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'REJECTED_UNAUTHORIZED',
          details: 'Actor attempted to modify schedule of an event owned by another organizer',
          timestamp: new Date()
        });
        throw new EventManagementError('UNAUTHORIZED', 'Actor is not authorized to edit this event draft');
      }

      // 3. Status must be DRAFT
      if (current.status !== 'DRAFT') {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_SCHEDULE_SET',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'REJECTED_INVALID_STATE',
          details: `Attempted to set schedule on event in '${current.status}' status (must be DRAFT)`,
          timestamp: new Date()
        });
        throw new EventManagementError(
          'EVENT_NOT_IN_DRAFT',
          `Schedule can only be defined for events in DRAFT status, current is '${current.status}'`
        );
      }

      // 4. Check idempotency
      if (idempotencyKey && current.idempotency_key === idempotencyKey) {
        if (current.idempotency_payload_hash === payloadHash) {
          return {
            event: mapRowToRecord(current),
            outcome: 'IDEMPOTENT_REPLAY'
          };
        }
        throw new EventManagementError(
          'IDEMPOTENCY_CONFLICT',
          'Idempotency key has already been used with different parameters'
        );
      }

      // 5. Resolve local time with DEC-070 DST validation
      let resolved;
      try {
        resolved = resolveScheduleLocalTime(current.timezone, startsAtLocal, utcOffsetMinutes);
      } catch (err) {
        if (err instanceof EventManagementError) {
          const auditResult =
            err.code === 'DST_GAP_TIME'
              ? 'REJECTED_DST_GAP'
              : err.code === 'AMBIGUOUS_LOCAL_TIME'
              ? 'REJECTED_AMBIGUOUS_TIME'
              : err.code === 'INVALID_OFFSET'
              ? 'REJECTED_INVALID_OFFSET'
              : 'REJECTED_INVALID_NAME';

          await this.auditSink?.record({
            id: randomUUID(),
            procedure: 'EVENT_SCHEDULE_SET',
            actorId: actorContext.accountId,
            targetIdentifier: eventId,
            result: auditResult,
            details: err.message,
            timestamp: new Date()
          });
        }
        throw err;
      }

      // 6. Update event in database
      const now = new Date();
      const updatedRows = await tx.query<EventRow>(
        `UPDATE event
         SET starts_at_local = $2,
             scheduled_at = $3,
             utc_offset_minutes = $4,
             idempotency_key = COALESCE($5, idempotency_key),
             idempotency_payload_hash = COALESCE($6, idempotency_payload_hash),
             updated_at = $7
         WHERE id = $1
         RETURNING id, organizer_id, name, status, timezone, starts_at_local, scheduled_at, utc_offset_minutes,
                   uploads_enabled, guest_gallery_enabled, moderation_mode, pin_enabled,
                   idempotency_key, idempotency_payload_hash, created_at, updated_at`,
        eventId,
        resolved.startsAtLocal,
        resolved.scheduledAt,
        resolved.utcOffsetMinutes,
        idempotencyKey ?? null,
        payloadHash ?? null,
        now
      );

      const updatedRecord = mapRowToRecord(updatedRows[0]);

      // 7. Audit log
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_SCHEDULE_SET',
        actorId: actorContext.accountId,
        targetIdentifier: eventId,
        result: 'SUCCESS',
        details: `Event schedule set to ${resolved.startsAtLocal} (${current.timezone}, UTC ${resolved.scheduledAt.toISOString()})`,
        timestamp: now
      });

      return {
        event: updatedRecord,
        outcome: 'UPDATED'
      };
    });
  }

  /**
   * Sets the initial PIN for a draft event (EL-TK-027, DEC-072, DEC-073).
   * - Only the creating organizer owner can set the initial PIN.
   * - Must be in DRAFT status.
   * - PIN must consist of exactly 6 numeric digits [0-9]{6}, preserving leading zeros.
   * - Letters, spaces, special chars, or different lengths are strictly rejected.
   * - Stored as a securely hashed credential without plaintext.
   * - Once configured, subsequent changes/deactivations are rejected under EL-EP-002
   *   (modifications belong to EL-EP-004).
   * - Concurrent writes under row-level lock guarantee single winner.
   */
  public async setInitialPin(command: SetInitialPinCommand): Promise<SetInitialPinResult> {
    if (!command || typeof command !== 'object') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Set initial PIN command is required');
    }

    const { actorContext, eventId, pin, idempotencyKey } = command;

    // 1. Validate authenticated organizer
    if (
      !actorContext ||
      actorContext.actorType !== 'ORGANIZER_HUMAN' ||
      !actorContext.accountId ||
      typeof actorContext.accountId !== 'string'
    ) {
      throw new EventManagementError('UNAUTHORIZED', 'Authenticated organizer context is required');
    }

    if (!eventId || typeof eventId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Event ID is required');
    }

    // 2. Validate PIN format per DEC-073 (exactly 6 numeric digits including leading zeros)
    const PIN_REGEX = /^[0-9]{6}$/;
    if (typeof pin !== 'string' || !PIN_REGEX.test(pin)) {
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_INITIAL_PIN_SET',
        actorId: actorContext.accountId,
        targetIdentifier: eventId,
        result: 'REJECTED_INVALID_PIN_FORMAT',
        details: 'Initial PIN must consist of exactly 6 numeric digits',
        timestamp: new Date()
      });
      throw new EventManagementError(
        'INVALID_PIN_FORMAT',
        'Initial PIN must consist of exactly 6 numeric digits [0-9]{6}'
      );
    }

    const payloadHash = idempotencyKey
      ? createHash('sha256')
          .update(JSON.stringify({ eventId, pin, organizerId: actorContext.accountId }))
          .digest('hex')
      : null;

    return this.runner.run(async (tx: SqlTransaction) => {
      // 3. Pessimistic lock
      const rows = await tx.query<EventRow>(
        `SELECT id, organizer_id, name, status, timezone, starts_at_local, scheduled_at, utc_offset_minutes,
                expires_at, grace_ends_at, activated_at, closed_at, purge_started_at, suspended_at,
                suspension_reason, previous_status, validity_duration_days, grace_days,
                uploads_enabled, guest_gallery_enabled, moderation_mode, pin_enabled, pin_hash, pin_salt,
                idempotency_key, idempotency_payload_hash, created_at, updated_at
         FROM event
         WHERE id = $1
         FOR UPDATE`,
        eventId
      );

      if (rows.length === 0) {
        throw new EventManagementError('EVENT_NOT_FOUND', `Event '${eventId}' not found`);
      }

      const current = rows[0];

      // 4. Owner isolation
      if (current.organizer_id !== actorContext.accountId) {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_INITIAL_PIN_SET',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'REJECTED_UNAUTHORIZED',
          details: 'Actor is not the owner of this draft',
          timestamp: new Date()
        });
        throw new EventManagementError('UNAUTHORIZED', 'Actor is not the owner of this draft');
      }

      // 5. State restriction: must be DRAFT
      if (current.status !== 'DRAFT') {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_INITIAL_PIN_SET',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'REJECTED_INVALID_STATE',
          details: `Initial PIN cannot be set on event in status '${current.status}'`,
          timestamp: new Date()
        });
        throw new EventManagementError(
          'EVENT_NOT_IN_DRAFT',
          `Initial PIN can only be configured for DRAFT events (current: ${current.status})`
        );
      }

      // 6. Check if initial PIN is already set (DEC-072, Q-037)
      if (Boolean(current.pin_enabled)) {
        if (idempotencyKey && current.idempotency_key === idempotencyKey) {
          if (current.idempotency_payload_hash === payloadHash) {
            await this.auditSink?.record({
              id: randomUUID(),
              procedure: 'EVENT_INITIAL_PIN_SET',
              actorId: actorContext.accountId,
              targetIdentifier: eventId,
              result: 'IDEMPOTENT_REPLAY',
              details: 'Idempotent replay of initial PIN setup',
              timestamp: new Date()
            });
            return {
              event: mapRowToRecord(current),
              outcome: 'IDEMPOTENT_REPLAY'
            };
          }
          throw new EventManagementError(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key reused with different parameters'
          );
        }

        // Attempting to change or reconfigure already set initial PIN is rejected under EL-EP-002
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_INITIAL_PIN_SET',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'REJECTED_PIN_ALREADY_CONFIGURED',
          details: 'Draft already has a configured initial PIN',
          timestamp: new Date()
        });
        throw new EventManagementError(
          'PIN_ALREADY_CONFIGURED',
          'Initial PIN is already configured for this draft. Modifications belong to EL-EP-004'
        );
      }

      // 7. Securely hash the initial PIN without plaintext retention (DEC-004, DEC-073)
      const salt = randomBytes(16).toString('hex');
      const hash = scryptSync(pin, salt, 32).toString('hex');
      const now = new Date();

      // 8. Update database
      const updatedRows = await tx.query<EventRow>(
        `UPDATE event
         SET pin_enabled = true,
             pin_hash = $2,
             pin_salt = $3,
             idempotency_key = COALESCE($4, idempotency_key),
             idempotency_payload_hash = COALESCE($5, idempotency_payload_hash),
             updated_at = $6
         WHERE id = $1
         RETURNING id, organizer_id, name, status, timezone, starts_at_local, scheduled_at, utc_offset_minutes,
                   expires_at, grace_ends_at, activated_at, closed_at, purge_started_at, suspended_at,
                   suspension_reason, previous_status, validity_duration_days, grace_days,
                   uploads_enabled, guest_gallery_enabled, moderation_mode, pin_enabled, pin_hash, pin_salt,
                   idempotency_key, idempotency_payload_hash, created_at, updated_at`,
        eventId,
        hash,
        salt,
        idempotencyKey ?? null,
        payloadHash ?? null,
        now
      );

      const updatedRecord = mapRowToRecord(updatedRows[0]);

      // 9. Audit log (never expose PIN, salt or hash)
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_INITIAL_PIN_SET',
        actorId: actorContext.accountId,
        targetIdentifier: eventId,
        result: 'SUCCESS',
        details: 'Initial PIN enabled for draft event',
        timestamp: now
      });

      return {
        event: updatedRecord,
        outcome: 'PIN_SET'
      };
    });
  }
}

