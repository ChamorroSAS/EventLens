import { createHash, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  EventManagementError,
  type ScheduleDraftEventCommand,
  type ScheduleDraftEventResult,
  type ActivateEventCommand,
  type ActivateEventResult,
  type CloseEventCommand,
  type CloseEventResult,
  type EventAuditSink,
  type EventRecord,
  type EventStatus,
  type ModerationMode
} from './contracts.js';
import {
  calculateEventLifecycleTimeline,
  DEFAULT_VALIDITY_DAYS,
  DEFAULT_GRACE_PERIOD_DAYS
} from './timeline.js';

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
  validity_duration_days?: number | null;
  grace_days?: number | null;
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
    startsAtLocal: row.starts_at_local ?? null,
    scheduledAt: row.scheduled_at ? new Date(row.scheduled_at) : null,
    utcOffsetMinutes: row.utc_offset_minutes !== null && row.utc_offset_minutes !== undefined ? Number(row.utc_offset_minutes) : null,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    graceEndsAt: row.grace_ends_at ? new Date(row.grace_ends_at) : null,
    activatedAt: row.activated_at ? new Date(row.activated_at) : null,
    closedAt: row.closed_at ? new Date(row.closed_at) : null,
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
 * Service managing event lifecycle transitions, canonical scheduling, and timeline persistence (MOD-002, EL-EP-003).
 */
export class EventLifecycleService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly auditSink?: EventAuditSink
  ) {}

  /**
   * Transitions a DRAFT event to SCHEDULED for future opening (EL-TK-063).
   * - Validates organizer ownership (isolation)
   * - Validates minimum configuration (name, scheduledAt)
   * - Only DRAFT events can be scheduled
   * - Calculates deterministic canonical timeline (DEC-077, DEC-082)
   * - Persists expiresAt, graceEndsAt, validityDurationDays, graceDays
   * - Atomically audits transition under SQL transaction
   */
  async scheduleDraft(command: ScheduleDraftEventCommand): Promise<ScheduleDraftEventResult> {
    const { actorContext, eventId, validityDurationDays, graceDays, idempotencyKey } = command;

    if (!actorContext || !actorContext.accountId) {
      throw new EventManagementError('UNAUTHORIZED', 'Authenticated organizer actor context is required');
    }

    if (!eventId || typeof eventId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Event ID is required');
    }

    const payloadHash = idempotencyKey
      ? createHash('sha256')
          .update(JSON.stringify({
            eventId,
            organizerId: actorContext.accountId,
            action: 'SCHEDULE_DRAFT',
            validityDurationDays: validityDurationDays ?? DEFAULT_VALIDITY_DAYS,
            graceDays: graceDays ?? DEFAULT_GRACE_PERIOD_DAYS
          }))
          .digest('hex')
      : null;

    return this.runner.run(async (tx: SqlTransaction) => {
      // 1. Lock and retrieve current event record
      const rows = await tx.query<EventRow>(
        `SELECT id, organizer_id, name, status, timezone, starts_at_local, scheduled_at,
                utc_offset_minutes, expires_at, grace_ends_at, validity_duration_days, grace_days,
                uploads_enabled, guest_gallery_enabled, moderation_mode, pin_enabled,
                idempotency_key, idempotency_payload_hash, created_at, updated_at
         FROM event
         WHERE id = $1
         FOR UPDATE`,
        eventId
      );

      if (rows.length === 0) {
        throw new EventManagementError('EVENT_NOT_FOUND', `Event '${eventId}' was not found`);
      }

      const current = rows[0];

      // 2. Authorization check (Owner isolation)
      if (current.organizer_id !== actorContext.accountId) {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_SCHEDULED',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'REJECTED_UNAUTHORIZED',
          details: `Actor '${actorContext.accountId}' is not authorized to schedule event '${eventId}'`,
          timestamp: new Date()
        });
        throw new EventManagementError('UNAUTHORIZED', 'Actor is not the owner of this event');
      }

      // 3. Idempotency replay check
      if (idempotencyKey && current.status === 'SCHEDULED') {
        if (current.idempotency_key === idempotencyKey) {
          if (current.idempotency_payload_hash === payloadHash) {
            await this.auditSink?.record({
              id: randomUUID(),
              procedure: 'EVENT_SCHEDULED',
              actorId: actorContext.accountId,
              targetIdentifier: eventId,
              result: 'IDEMPOTENT_REPLAY',
              details: `Idempotent replay for scheduling event '${eventId}'`,
              timestamp: new Date()
            });
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
      }

      // 4. State validation: Only DRAFT can be scheduled
      if (current.status !== 'DRAFT') {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_SCHEDULED',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'REJECTED_INVALID_STATE',
          details: `Event '${eventId}' cannot be scheduled from status '${current.status}'`,
          timestamp: new Date()
        });
        throw new EventManagementError(
          'EVENT_NOT_IN_DRAFT',
          `Only DRAFT events can be scheduled (current status: '${current.status}')`
        );
      }

      // 5. Minimum configuration validation (Escenario 2)
      if (!current.scheduled_at) {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_SCHEDULED',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'REJECTED_SCHEDULE_NOT_CONFIGURED',
          details: `Event '${eventId}' does not have a scheduled date/time configured`,
          timestamp: new Date()
        });
        throw new EventManagementError(
          'SCHEDULE_NOT_CONFIGURED',
          'Event cannot be scheduled without a configured date and time'
        );
      }

      if (!current.name || current.name.trim().length === 0) {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_SCHEDULED',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'REJECTED_INCOMPLETE_CONFIG',
          details: `Event '${eventId}' has an incomplete configuration (missing or empty name)`,
          timestamp: new Date()
        });
        throw new EventManagementError(
          'INCOMPLETE_CONFIGURATION',
          'Event draft must have a non-empty name to be scheduled'
        );
      }

      // 6. Calculate canonical deterministic timeline (DEC-077, DEC-082)
      const effectiveValidityDays = validityDurationDays ?? current.validity_duration_days ?? DEFAULT_VALIDITY_DAYS;
      const effectiveGraceDays = graceDays ?? current.grace_days ?? DEFAULT_GRACE_PERIOD_DAYS;

      const timeline = calculateEventLifecycleTimeline({
        scheduledAt: new Date(current.scheduled_at),
        timezone: current.timezone,
        validityDurationDays: effectiveValidityDays,
        graceDays: effectiveGraceDays
      });

      // 7. Persist transition and timeline in database
      const now = new Date();
      await tx.execute(
        `UPDATE event
         SET status = 'SCHEDULED',
             expires_at = $1,
             grace_ends_at = $2,
             validity_duration_days = $3,
             grace_days = $4,
             idempotency_key = COALESCE($5, idempotency_key),
             idempotency_payload_hash = COALESCE($6, idempotency_payload_hash),
             updated_at = $7
         WHERE id = $8`,
        timeline.expiresAt,
        timeline.graceEndsAt,
        effectiveValidityDays,
        effectiveGraceDays,
        idempotencyKey ?? null,
        payloadHash,
        now,
        eventId
      );

      const updatedRecord: EventRecord = {
        ...mapRowToRecord(current),
        status: 'SCHEDULED',
        expiresAt: timeline.expiresAt,
        graceEndsAt: timeline.graceEndsAt,
        validityDurationDays: effectiveValidityDays,
        graceDays: effectiveGraceDays,
        updatedAt: now
      };

      // 8. Audit successful schedule transition
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_SCHEDULED',
        actorId: actorContext.accountId,
        targetIdentifier: eventId,
        result: 'SUCCESS',
        details: `Event '${eventId}' scheduled: starts at ${timeline.startsAtLocal} (${current.timezone}), expires at ${timeline.expiresAt.toISOString()}, grace ends at ${timeline.graceEndsAt.toISOString()}`,
        timestamp: now
      });

      return {
        event: updatedRecord,
        outcome: 'SCHEDULED'
      };
    });
  }

  /**
   * Activates a SCHEDULED event either early manually by the organizer or automatically by the scheduler (EL-TK-064).
   * - Trigger MANUAL_EARLY requires organizer ownership.
   * - Trigger SCHEDULED_AUTO can be triggered by system scheduler.
   * - DEC-077: Early activation NEVER shifts the scheduled expiration anchor.
   *   expiresAt and graceEndsAt remain strictly anchored to scheduledAt.
   * - Idempotent replay: if already ACTIVE, returns existing record without incompatible second transition.
   * - Concurrent races (manual vs scheduler) are serialized via pessimistic row lock (FOR UPDATE).
   */
  async activateEvent(command: ActivateEventCommand): Promise<ActivateEventResult> {
    const { actorContext, trigger, eventId, idempotencyKey } = command;

    if (!eventId || typeof eventId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Event ID is required');
    }

    if (trigger === 'MANUAL_EARLY') {
      if (!actorContext || !actorContext.accountId) {
        throw new EventManagementError('UNAUTHORIZED', 'Authenticated organizer actor context is required for manual early activation');
      }
    }

    const effectiveActorId = actorContext?.accountId ?? 'SYSTEM_SCHEDULER';

    const payloadHash = idempotencyKey
      ? createHash('sha256')
          .update(JSON.stringify({
            eventId,
            actorId: effectiveActorId,
            action: 'ACTIVATE_EVENT',
            trigger
          }))
          .digest('hex')
      : null;

    return this.runner.run(async (tx: SqlTransaction) => {
      // 1. Lock and retrieve current event record
      const rows = await tx.query<EventRow>(
        `SELECT id, organizer_id, name, status, timezone, starts_at_local, scheduled_at,
                utc_offset_minutes, expires_at, grace_ends_at, activated_at, validity_duration_days, grace_days,
                uploads_enabled, guest_gallery_enabled, moderation_mode, pin_enabled,
                idempotency_key, idempotency_payload_hash, created_at, updated_at
         FROM event
         WHERE id = $1
         FOR UPDATE`,
        eventId
      );

      if (rows.length === 0) {
        throw new EventManagementError('EVENT_NOT_FOUND', `Event '${eventId}' was not found`);
      }

      const current = rows[0];

      // 2. Authorization check for manual activation
      if (trigger === 'MANUAL_EARLY') {
        if (current.organizer_id !== actorContext!.accountId) {
          await this.auditSink?.record({
            id: randomUUID(),
            procedure: 'EVENT_ACTIVATED',
            actorId: actorContext!.accountId,
            targetIdentifier: eventId,
            result: 'REJECTED_UNAUTHORIZED',
            details: `Actor '${actorContext!.accountId}' is not authorized to activate event '${eventId}' manually`,
            timestamp: new Date()
          });
          throw new EventManagementError('UNAUTHORIZED', 'Actor is not the owner of this event');
        }
      }

      // 3. Idempotency & race handling: if already ACTIVE
      if (current.status === 'ACTIVE') {
        if (idempotencyKey && current.idempotency_key === idempotencyKey) {
          if (current.idempotency_payload_hash !== payloadHash) {
            throw new EventManagementError(
              'IDEMPOTENCY_CONFLICT',
              'Idempotency key has already been used with different parameters'
            );
          }
        }

        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_ACTIVATED',
          actorId: effectiveActorId,
          targetIdentifier: eventId,
          result: 'IDEMPOTENT_REPLAY',
          details: `Idempotent replay: event '${eventId}' is already ACTIVE (trigger: ${trigger})`,
          timestamp: new Date()
        });

        return {
          event: mapRowToRecord(current),
          outcome: 'IDEMPOTENT_REPLAY'
        };
      }

      // 4. State validation: Only SCHEDULED events can be activated
      if (current.status !== 'SCHEDULED') {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_ACTIVATED',
          actorId: effectiveActorId,
          targetIdentifier: eventId,
          result: 'REJECTED_EVENT_NOT_IN_SCHEDULED',
          details: `Event '${eventId}' cannot be activated from status '${current.status}'`,
          timestamp: new Date()
        });
        throw new EventManagementError(
          'EVENT_NOT_IN_SCHEDULED',
          `Only SCHEDULED events can be activated (current status: '${current.status}')`
        );
      }

      // 5. Atomic activation transition without altering expiration anchor (DEC-077)
      const now = new Date();
      await tx.execute(
        `UPDATE event
         SET status = 'ACTIVE',
             activated_at = $1,
             idempotency_key = COALESCE($2, idempotency_key),
             idempotency_payload_hash = COALESCE($3, idempotency_payload_hash),
             updated_at = $4
         WHERE id = $5`,
        now,
        idempotencyKey ?? null,
        payloadHash,
        now,
        eventId
      );

      const updatedRecord: EventRecord = {
        ...mapRowToRecord(current),
        status: 'ACTIVE',
        activatedAt: now,
        updatedAt: now
      };

      // 6. Audit successful activation
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_ACTIVATED',
        actorId: effectiveActorId,
        targetIdentifier: eventId,
        result: 'SUCCESS',
        details: `Event '${eventId}' activated via '${trigger}' at ${now.toISOString()}; expiresAt remains anchored at ${current.expires_at ? new Date(current.expires_at).toISOString() : 'none'}`,
        timestamp: now
      });

      return {
        event: updatedRecord,
        outcome: 'ACTIVATED'
      };
    });
  }

  /**
   * Manually closes an ACTIVE event prior to its expiration (EL-TK-065).
   * - Only authorized organizer owner can execute this action.
   * - Must be in ACTIVE status; other statuses are rejected with EVENT_NOT_ACTIVE.
   * - Escenario 2: If the event has already reached or passed expiresAt,
   *   the temporal expiration transition takes precedence and manual closing is rejected (EVENT_ALREADY_EXPIRED).
   * - DEC-077, DEC-082: Manual closing NEVER pauses or alters the validity or grace timeline.
   *   expiresAt and graceEndsAt remain intact.
   * - Idempotency replay: if already CLOSED, returns existing record cleanly.
   */
  async closeEvent(command: CloseEventCommand): Promise<CloseEventResult> {
    const { actorContext, eventId, idempotencyKey } = command;

    if (!actorContext || !actorContext.accountId) {
      throw new EventManagementError('UNAUTHORIZED', 'Authenticated organizer actor context is required');
    }

    if (!eventId || typeof eventId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Event ID is required');
    }

    const payloadHash = idempotencyKey
      ? createHash('sha256')
          .update(JSON.stringify({
            eventId,
            organizerId: actorContext.accountId,
            action: 'CLOSE_EVENT'
          }))
          .digest('hex')
      : null;

    return this.runner.run(async (tx: SqlTransaction) => {
      // 1. Lock and retrieve current event record
      const rows = await tx.query<EventRow>(
        `SELECT id, organizer_id, name, status, timezone, starts_at_local, scheduled_at,
                utc_offset_minutes, expires_at, grace_ends_at, activated_at, closed_at,
                validity_duration_days, grace_days, uploads_enabled, guest_gallery_enabled,
                moderation_mode, pin_enabled, idempotency_key, idempotency_payload_hash,
                created_at, updated_at
         FROM event
         WHERE id = $1
         FOR UPDATE`,
        eventId
      );

      if (rows.length === 0) {
        throw new EventManagementError('EVENT_NOT_FOUND', `Event '${eventId}' was not found`);
      }

      const current = rows[0];

      // 2. Authorization check (Owner isolation)
      if (current.organizer_id !== actorContext.accountId) {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_CLOSED',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'REJECTED_UNAUTHORIZED',
          details: `Actor '${actorContext.accountId}' is not authorized to close event '${eventId}'`,
          timestamp: new Date()
        });
        throw new EventManagementError('UNAUTHORIZED', 'Actor is not the owner of this event');
      }

      // 3. Idempotent replay check: if already CLOSED
      if (current.status === 'CLOSED') {
        if (idempotencyKey && current.idempotency_key === idempotencyKey) {
          if (current.idempotency_payload_hash !== payloadHash) {
            throw new EventManagementError(
              'IDEMPOTENCY_CONFLICT',
              'Idempotency key has already been used with different parameters'
            );
          }
        }

        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_CLOSED',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'IDEMPOTENT_REPLAY',
          details: `Idempotent replay: event '${eventId}' is already CLOSED`,
          timestamp: new Date()
        });

        return {
          event: mapRowToRecord(current),
          outcome: 'IDEMPOTENT_REPLAY'
        };
      }

      // 4. Escenario 2: Check if event is already expired
      const now = command.now ?? new Date();
      if (current.expires_at) {
        const expiresAtDate = new Date(current.expires_at);
        if (now >= expiresAtDate) {
          await this.auditSink?.record({
            id: randomUUID(),
            procedure: 'EVENT_CLOSED',
            actorId: actorContext.accountId,
            targetIdentifier: eventId,
            result: 'REJECTED_EVENT_EXPIRED',
            details: `Event '${eventId}' is already expired at ${expiresAtDate.toISOString()}; temporal lifecycle transition takes precedence`,
            timestamp: now
          });
          throw new EventManagementError(
            'EVENT_ALREADY_EXPIRED',
            'Cannot close an event that is already expired; temporal lifecycle transition takes precedence'
          );
        }
      }

      // 5. State validation: Only ACTIVE events can be manually closed
      if (current.status !== 'ACTIVE') {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_CLOSED',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'REJECTED_EVENT_NOT_ACTIVE',
          details: `Event '${eventId}' cannot be closed from status '${current.status}'`,
          timestamp: now
        });
        throw new EventManagementError(
          'EVENT_NOT_ACTIVE',
          `Only ACTIVE events can be manually closed (current status: '${current.status}')`
        );
      }

      // 6. Atomic transition to CLOSED without pausing validity or grace
      await tx.execute(
        `UPDATE event
         SET status = 'CLOSED',
             closed_at = $1,
             idempotency_key = COALESCE($2, idempotency_key),
             idempotency_payload_hash = COALESCE($3, idempotency_payload_hash),
             updated_at = $4
         WHERE id = $5`,
        now,
        idempotencyKey ?? null,
        payloadHash,
        now,
        eventId
      );

      const updatedRecord: EventRecord = {
        ...mapRowToRecord(current),
        status: 'CLOSED',
        closedAt: now,
        updatedAt: now
      };

      // 7. Audit successful close
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_CLOSED',
        actorId: actorContext.accountId,
        targetIdentifier: eventId,
        result: 'SUCCESS',
        details: `Event '${eventId}' manually closed by organizer at ${now.toISOString()}; validity continues until ${current.expires_at ? new Date(current.expires_at).toISOString() : 'unconfigured'}`,
        timestamp: now
      });

      return {
        event: updatedRecord,
        outcome: 'CLOSED'
      };
    });
  }
}
