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
  type ReopenEventCommand,
  type ReopenEventResult,
  type AdvanceTemporalLifecycleCommand,
  type AdvanceTemporalLifecycleResult,
  type TemporalAdvanceOutcome,
  type SuspendEventCommand,
  type SuspendEventResult,
  type ReactivateEventCommand,
  type ReactivateEventResult,
  type ExtendEventValidityCommand,
  type ExtendEventValidityResult,
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

      // 3. Idempotent replay check: only if idempotencyKey was provided and matches
      if (idempotencyKey && current.idempotency_key === idempotencyKey && current.status === 'CLOSED') {
        if (current.idempotency_payload_hash !== payloadHash) {
          throw new EventManagementError(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key has already been used with different parameters'
          );
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

  /**
   * Reopens a CLOSED event prior to its expiration (EL-TK-066).
   * - Only authorized organizer owner can execute this action.
   * - Must be in CLOSED status; other statuses are rejected with EVENT_NOT_CLOSED.
   * - Escenario 2: If the event has already reached or passed expiresAt,
   *   reopening is rejected (EVENT_ALREADY_EXPIRED) and no resurrection into ACTIVE is permitted.
   * - DEC-077, DEC-082: Reopening NEVER alters the validity anchor or grace period.
   *   expiresAt and graceEndsAt remain intact.
   * - Transition sets status = 'ACTIVE' and closed_at = NULL.
   * - Idempotency replay: if already ACTIVE, returns existing record cleanly if idempotencyKey matches.
   */
  async reopenEvent(command: ReopenEventCommand): Promise<ReopenEventResult> {
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
            action: 'REOPEN_EVENT'
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
          procedure: 'EVENT_REOPENED',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'REJECTED_UNAUTHORIZED',
          details: `Actor '${actorContext.accountId}' is not authorized to reopen event '${eventId}'`,
          timestamp: new Date()
        });
        throw new EventManagementError('UNAUTHORIZED', 'Actor is not the owner of this event');
      }

      // 3. Idempotent replay check: only if idempotencyKey was provided and matches
      if (idempotencyKey && current.idempotency_key === idempotencyKey && current.status === 'ACTIVE') {
        if (current.idempotency_payload_hash !== payloadHash) {
          throw new EventManagementError(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key has already been used with different parameters'
          );
        }

        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_REOPENED',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'IDEMPOTENT_REPLAY',
          details: `Idempotent replay: event '${eventId}' is already ACTIVE`,
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
            procedure: 'EVENT_REOPENED',
            actorId: actorContext.accountId,
            targetIdentifier: eventId,
            result: 'REJECTED_EVENT_EXPIRED',
            details: `Event '${eventId}' expired at ${expiresAtDate.toISOString()}; cannot reopen an expired event`,
            timestamp: now
          });
          throw new EventManagementError(
            'EVENT_ALREADY_EXPIRED',
            'Cannot reopen an event that is already expired'
          );
        }
      }

      // 5. State validation: Only CLOSED events can be reopened to ACTIVE
      if (current.status !== 'CLOSED') {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_REOPENED',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'REJECTED_EVENT_NOT_CLOSED',
          details: `Event '${eventId}' cannot be reopened from status '${current.status}'`,
          timestamp: now
        });
        throw new EventManagementError(
          'EVENT_NOT_CLOSED',
          `Only CLOSED events can be reopened (current status: '${current.status}')`
        );
      }

      // 6. Atomic transition to ACTIVE, clearing closed_at, preserving expires_at/grace_ends_at
      await tx.execute(
        `UPDATE event
         SET status = 'ACTIVE',
             closed_at = NULL,
             idempotency_key = COALESCE($1, idempotency_key),
             idempotency_payload_hash = COALESCE($2, idempotency_payload_hash),
             updated_at = $3
         WHERE id = $4`,
        idempotencyKey ?? null,
        payloadHash,
        now,
        eventId
      );

      const updatedRecord: EventRecord = {
        ...mapRowToRecord(current),
        status: 'ACTIVE',
        closedAt: null,
        updatedAt: now
      };

      // 7. Audit successful reopen
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_REOPENED',
        actorId: actorContext.accountId,
        targetIdentifier: eventId,
        result: 'SUCCESS',
        details: `Event '${eventId}' reopened from CLOSED to ACTIVE by organizer; validity continues until ${current.expires_at ? new Date(current.expires_at).toISOString() : 'unconfigured'}`,
        timestamp: now
      });

      return {
        event: updatedRecord,
        outcome: 'REOPENED'
      };
    });
  }

  /**
   * Advances the temporal lifecycle of an event based on the canonical clock (EL-TK-067).
   * System-triggered (e.g. background worker / scheduler).
   *
   * - Escenario 1: If ACTIVE or CLOSED and now >= expires_at (and now < grace_ends_at),
   *   transitions idempotently to GRACE_PERIOD.
   * - Escenario 2: If GRACE_PERIOD (or ACTIVE/CLOSED) and now >= grace_ends_at,
   *   transitions idempotently to PENDING_DELETION and sets purge_started_at = now
   *   (without physically deleting content here, in accordance with DEC-092 & EL-EP-015).
   * - Escenario 3: If SUSPENDED, time continues advancing against canonical anchors;
   *   the administrative isolation barrier is preserved (remains SUSPENDED).
   * - Deterministic & Recoverable: delayed, repeated, or replayed runs produce no regressions
   *   or resurrections (idempotent NO_OP or clean replay).
   */
  async advanceTemporalLifecycle(command: AdvanceTemporalLifecycleCommand): Promise<AdvanceTemporalLifecycleResult> {
    const { eventId, jobId } = command;

    if (!eventId || typeof eventId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Event ID is required');
    }

    const now = command.now ?? new Date();

    return this.runner.run(async (tx: SqlTransaction) => {
      // 1. Lock and retrieve current event record
      const rows = await tx.query<EventRow>(
        `SELECT id, organizer_id, name, status, timezone, starts_at_local, scheduled_at,
                utc_offset_minutes, expires_at, grace_ends_at, activated_at, closed_at,
                purge_started_at, validity_duration_days, grace_days, uploads_enabled,
                guest_gallery_enabled, moderation_mode, pin_enabled, idempotency_key,
                idempotency_payload_hash, created_at, updated_at
         FROM event
         WHERE id = $1
         FOR UPDATE`,
        eventId
      );

      if (rows.length === 0) {
        throw new EventManagementError('EVENT_NOT_FOUND', `Event '${eventId}' was not found`);
      }

      const current = rows[0];
      const previousStatus = current.status as EventStatus;

      // 2. If event has not even reached expiration yet (or has no expiration configured)
      if (!current.expires_at) {
        return {
          event: mapRowToRecord(current),
          previousStatus,
          outcome: 'NO_OP'
        };
      }

      const expiresAt = new Date(current.expires_at);
      const graceEndsAt = current.grace_ends_at ? new Date(current.grace_ends_at) : null;

      // Escenario 3: If SUSPENDED, deadlines continue moving physically, but administrative barrier remains
      if (current.status === 'SUSPENDED') {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_TEMPORAL_ADVANCE',
          actorId: 'SYSTEM_SCHEDULER',
          targetIdentifier: eventId,
          result: 'SUSPENDED_PRESERVED',
          details: `Event '${eventId}' is SUSPENDED; canonical time passed expiration or grace anchor but administrative barrier is preserved`,
          timestamp: now
        });

        return {
          event: mapRowToRecord(current),
          previousStatus,
          outcome: 'SUSPENDED_PRESERVED'
        };
      }

      // If already PENDING_DELETION or ARCHIVED: no regression or resurrections
      if (current.status === 'PENDING_DELETION' || current.status === 'ARCHIVED') {
        return {
          event: mapRowToRecord(current),
          previousStatus,
          outcome: 'IDEMPOTENT_REPLAY'
        };
      }

      // 3. Escenario 2: Check for GRACE_PERIOD completion -> PENDING_DELETION
      if (graceEndsAt && now >= graceEndsAt) {
        const purgeStartedAt = current.purge_started_at ? new Date(current.purge_started_at) : now;

        await tx.execute(
          `UPDATE event
           SET status = 'PENDING_DELETION',
               purge_started_at = COALESCE(purge_started_at, $1),
               updated_at = $2
           WHERE id = $3`,
          purgeStartedAt,
          now,
          eventId
        );

        const updatedRecord: EventRecord = {
          ...mapRowToRecord(current),
          status: 'PENDING_DELETION',
          purgeStartedAt,
          updatedAt: now
        };

        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_TEMPORAL_ADVANCE',
          actorId: 'SYSTEM_SCHEDULER',
          targetIdentifier: eventId,
          result: 'TRANSITIONED_TO_PENDING_DELETION',
          details: `Event '${eventId}' grace period completed at ${graceEndsAt.toISOString()}; transitioned from '${current.status}' to PENDING_DELETION (jobId: ${jobId ?? 'direct'})`,
          timestamp: now
        });

        return {
          event: updatedRecord,
          previousStatus,
          outcome: 'TRANSITIONED_TO_PENDING_DELETION'
        };
      }

      // 4. Escenario 1: Check for expiration -> GRACE_PERIOD
      if (now >= expiresAt) {
        if (current.status === 'ACTIVE' || current.status === 'CLOSED') {
          await tx.execute(
            `UPDATE event
             SET status = 'GRACE_PERIOD',
                 updated_at = $1
             WHERE id = $2`,
            now,
            eventId
          );

          const updatedRecord: EventRecord = {
            ...mapRowToRecord(current),
            status: 'GRACE_PERIOD',
            updatedAt: now
          };

          await this.auditSink?.record({
            id: randomUUID(),
            procedure: 'EVENT_TEMPORAL_ADVANCE',
            actorId: 'SYSTEM_SCHEDULER',
            targetIdentifier: eventId,
            result: 'TRANSITIONED_TO_GRACE_PERIOD',
            details: `Event '${eventId}' expired at ${expiresAt.toISOString()}; transitioned from '${current.status}' to GRACE_PERIOD (jobId: ${jobId ?? 'direct'})`,
            timestamp: now
          });

          return {
            event: updatedRecord,
            previousStatus,
            outcome: 'TRANSITIONED_TO_GRACE_PERIOD'
          };
        }

        if (current.status === 'GRACE_PERIOD') {
          return {
            event: mapRowToRecord(current),
            previousStatus,
            outcome: 'IDEMPOTENT_REPLAY'
          };
        }
      }

      // Not expired yet
      return {
        event: mapRowToRecord(current),
        previousStatus,
        outcome: 'NO_OP'
      };
    });
  }

  /**
   * Administratively suspends an event preserving its previous status and reason (EL-TK-068).
   * - Authorized administrative actor only (AdminActorContext with ADMIN_HUMAN).
   * - Reason is strictly mandatory (sanitized non-empty string).
   * - Escenario 2: If event is in a terminal status (e.g. ARCHIVED or PENDING_DELETION),
   *   suspension is rejected with EVENT_TERMINAL (409 Conflict).
   * - If already SUSPENDED:
   *   returns clean IDEMPOTENT_REPLAY if idempotencyKey matches;
   *   does NOT overwrite the original previousStatus.
   * - Non-terminal statuses (DRAFT, SCHEDULED, ACTIVE, CLOSED, GRACE_PERIOD):
   *   transitions status to 'SUSPENDED',
   *   stores previous_status = current.status,
   *   stores suspension_reason = trimmedReason,
   *   stores suspended_at = now.
   * - DEC-078: Suspension does NOT pause validity or grace periods (expiresAt and graceEndsAt intact).
   * - Audited via EVENT_SUSPENDED.
   */
  async suspendEvent(command: SuspendEventCommand): Promise<SuspendEventResult> {
    const { actorContext, eventId, reason, idempotencyKey } = command;

    if (!actorContext || actorContext.actorType !== 'ADMIN_HUMAN') {
      throw new EventManagementError('UNAUTHORIZED', 'Authorized administrative actor context (ADMIN_HUMAN) is required');
    }

    if (!eventId || typeof eventId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Event ID is required');
    }

    const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
    if (!trimmedReason) {
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_SUSPENDED',
        actorId: actorContext.principalId,
        targetIdentifier: eventId,
        result: 'REJECTED_REASON_REQUIRED',
        details: 'Administrative suspension rejected: reason is mandatory',
        timestamp: new Date()
      });
      throw new EventManagementError('SUSPENSION_REASON_REQUIRED', 'Suspension reason is mandatory');
    }

    const now = command.now ?? new Date();

    const payloadHash = idempotencyKey
      ? createHash('sha256')
          .update(JSON.stringify({
            eventId,
            adminId: actorContext.principalId,
            reason: trimmedReason,
            action: 'SUSPEND_EVENT'
          }))
          .digest('hex')
      : null;

    return this.runner.run(async (tx: SqlTransaction) => {
      // 1. Lock and retrieve current event record
      const rows = await tx.query<EventRow>(
        `SELECT id, organizer_id, name, status, timezone, starts_at_local, scheduled_at,
                utc_offset_minutes, expires_at, grace_ends_at, activated_at, closed_at,
                purge_started_at, suspended_at, suspension_reason, previous_status,
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

      // 2. Escenario 2: Reject if event is terminal (PENDING_DELETION or ARCHIVED)
      if (current.status === 'PENDING_DELETION' || current.status === 'ARCHIVED') {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_SUSPENDED',
          actorId: actorContext.principalId,
          targetIdentifier: eventId,
          result: 'REJECTED_EVENT_TERMINAL',
          details: `Event '${eventId}' is in terminal status '${current.status}'; cannot be suspended`,
          timestamp: now
        });
        throw new EventManagementError(
          'EVENT_TERMINAL',
          `Cannot suspend an event in terminal status '${current.status}'`
        );
      }

      // 3. If already SUSPENDED: handle replay or idempotency conflict
      if (current.status === 'SUSPENDED') {
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
          procedure: 'EVENT_SUSPENDED',
          actorId: actorContext.principalId,
          targetIdentifier: eventId,
          result: 'IDEMPOTENT_REPLAY',
          details: `Idempotent replay: event '${eventId}' is already SUSPENDED`,
          timestamp: now
        });

        return {
          event: mapRowToRecord(current),
          previousStatus: (current.previous_status as EventStatus) ?? 'ACTIVE',
          outcome: 'IDEMPOTENT_REPLAY'
        };
      }

      // 4. Transition to SUSPENDED, recording previous_status, suspension_reason, and suspended_at
      const previousStatus = current.status as EventStatus;

      await tx.execute(
        `UPDATE event
         SET status = 'SUSPENDED',
             previous_status = $1,
             suspension_reason = $2,
             suspended_at = $3,
             idempotency_key = COALESCE($4, idempotency_key),
             idempotency_payload_hash = COALESCE($5, idempotency_payload_hash),
             updated_at = $6
         WHERE id = $7`,
        previousStatus,
        trimmedReason,
        now,
        idempotencyKey ?? null,
        payloadHash,
        now,
        eventId
      );

      const updatedRecord: EventRecord = {
        ...mapRowToRecord(current),
        status: 'SUSPENDED',
        previousStatus,
        suspensionReason: trimmedReason,
        suspendedAt: now,
        updatedAt: now
      };

      // 5. Audit successful suspension
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_SUSPENDED',
        actorId: actorContext.principalId,
        targetIdentifier: eventId,
        result: 'SUCCESS',
        details: `Event '${eventId}' administratively suspended from '${previousStatus}'. Reason: ${trimmedReason}`,
        timestamp: now
      });

      return {
        event: updatedRecord,
        previousStatus,
        outcome: 'SUSPENDED'
      };
    });
  }

  /**
   * Reactiva un evento SUSPENDED recalculando su estado vigente a tiempo real conforme a DEC-081 y DEC-078 (EL-TK-069).
   */
  async reactivateEvent(command: ReactivateEventCommand): Promise<ReactivateEventResult> {
    const { actorContext, eventId, idempotencyKey, now: providedNow } = command;

    if (!actorContext || actorContext.actorType !== 'ADMIN_HUMAN') {
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_REACTIVATED',
        actorId: actorContext?.principalId ?? 'UNKNOWN',
        targetIdentifier: eventId,
        result: 'REJECTED_UNAUTHORIZED',
        details: 'Only authorized administrative actors (ADMIN_HUMAN) may reactivate suspended events',
        timestamp: new Date()
      });
      throw new EventManagementError(
        'UNAUTHORIZED',
        'Only authorized administrative actors may reactivate suspended events'
      );
    }

    const payloadHash = idempotencyKey
      ? createHash('sha256')
          .update(JSON.stringify({ eventId, principalId: actorContext.principalId }))
          .digest('hex')
      : null;

    return this.runner.run(async (tx: SqlTransaction) => {
      const now = providedNow ?? new Date();

      // 1. Pessimistic lock
      const rows = await tx.query<EventRow>(
        `SELECT id, organizer_id, name, status, timezone, starts_at_local,
                scheduled_at, utc_offset_minutes, expires_at, grace_ends_at,
                activated_at, closed_at, purge_started_at, suspended_at,
                suspension_reason, previous_status, validity_duration_days,
                grace_days, uploads_enabled, guest_gallery_enabled,
                moderation_mode, pin_enabled, idempotency_key,
                idempotency_payload_hash, created_at, updated_at
         FROM event
         WHERE id = $1
         FOR UPDATE`,
        eventId
      );

      if (rows.length === 0) {
        throw new EventManagementError('EVENT_NOT_FOUND', `Event '${eventId}' not found`);
      }

      const current = rows[0];

      // 2. If not SUSPENDED: check for idempotent replay
      if (current.status !== 'SUSPENDED') {
        if (idempotencyKey && current.idempotency_key === idempotencyKey) {
          if (current.idempotency_payload_hash !== payloadHash) {
            throw new EventManagementError(
              'IDEMPOTENCY_CONFLICT',
              'Idempotency key has already been used with different parameters'
            );
          }

          await this.auditSink?.record({
            id: randomUUID(),
            procedure: 'EVENT_REACTIVATED',
            actorId: actorContext.principalId,
            targetIdentifier: eventId,
            result: 'IDEMPOTENT_REPLAY',
            details: `Idempotent replay: event '${eventId}' is already in status '${current.status}'`,
            timestamp: now
          });

          return {
            event: mapRowToRecord(current),
            previousSuspendedStatus: 'SUSPENDED',
            targetStatus: current.status as EventStatus,
            outcome: 'IDEMPOTENT_REPLAY'
          };
        }

        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_REACTIVATED',
          actorId: actorContext.principalId,
          targetIdentifier: eventId,
          result: 'REJECTED_EVENT_NOT_SUSPENDED',
          details: `Event '${eventId}' is not in SUSPENDED status (current: '${current.status}')`,
          timestamp: now
        });
        throw new EventManagementError(
          'EVENT_NOT_SUSPENDED',
          `Event '${eventId}' is not in SUSPENDED status (current: '${current.status}')`
        );
      }

      // 3. Validate previous_status: cannot be terminal or missing
      const previousStatus = current.previous_status as EventStatus | undefined;
      if (!previousStatus || previousStatus === 'PENDING_DELETION' || previousStatus === 'ARCHIVED') {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_REACTIVATED',
          actorId: actorContext.principalId,
          targetIdentifier: eventId,
          result: 'REJECTED_INVALID_PREVIOUS_STATUS',
          details: `Event '${eventId}' has invalid or terminal previous status: '${previousStatus}'`,
          timestamp: now
        });
        throw new EventManagementError(
          'INVALID_PREVIOUS_STATUS',
          `Cannot reactivate event with terminal or missing previous status: '${previousStatus}'`
        );
      }

      // 4. Calculate targetStatus per DEC-081, DEC-078 & DEC-082
      let targetStatus: EventStatus;
      let newPurgeStartedAt: Date | null = current.purge_started_at ? new Date(current.purge_started_at) : null;
      let newActivatedAt: Date | null = current.activated_at ? new Date(current.activated_at) : null;

      const graceEndsAt = current.grace_ends_at ? new Date(current.grace_ends_at) : null;
      const expiresAt = current.expires_at ? new Date(current.expires_at) : null;
      const scheduledAt = current.scheduled_at ? new Date(current.scheduled_at) : null;

      if (graceEndsAt && now.getTime() >= graceEndsAt.getTime()) {
        // Prevalencia: fin de gracia transcurrido -> PENDING_DELETION
        targetStatus = 'PENDING_DELETION';
        if (!newPurgeStartedAt) {
          newPurgeStartedAt = now;
        }
      } else if (expiresAt && now.getTime() >= expiresAt.getTime()) {
        // Prevalencia: vigencia transcurrida -> GRACE_PERIOD
        targetStatus = 'GRACE_PERIOD';
      } else {
        // Dentro de vigencia o sin vencimiento configurado (DRAFT)
        switch (previousStatus) {
          case 'DRAFT':
            targetStatus = 'DRAFT';
            break;
          case 'CLOSED':
            targetStatus = 'CLOSED';
            break;
          case 'ACTIVE':
            targetStatus = 'ACTIVE';
            break;
          case 'SCHEDULED':
            if (scheduledAt && now.getTime() >= scheduledAt.getTime()) {
              targetStatus = 'ACTIVE';
              if (!newActivatedAt) {
                newActivatedAt = now;
              }
            } else {
              targetStatus = 'SCHEDULED';
            }
            break;
          default:
            throw new EventManagementError(
              'INVALID_PREVIOUS_STATUS',
              `Unsupported previous status for reactivation: '${previousStatus}'`
            );
        }
      }

      // 5. Update event in database: clear suspension fields and set recalculated status
      await tx.execute(
        `UPDATE event
         SET status = $1,
             suspended_at = NULL,
             suspension_reason = NULL,
             previous_status = NULL,
             purge_started_at = COALESCE($2, purge_started_at),
             activated_at = COALESCE($3, activated_at),
             idempotency_key = COALESCE($4, idempotency_key),
             idempotency_payload_hash = COALESCE($5, idempotency_payload_hash),
             updated_at = $6
         WHERE id = $7`,
        targetStatus,
        newPurgeStartedAt,
        newActivatedAt,
        idempotencyKey ?? null,
        payloadHash,
        now,
        eventId
      );

      const updatedRecord: EventRecord = {
        ...mapRowToRecord(current),
        status: targetStatus,
        suspendedAt: null,
        suspensionReason: null,
        previousStatus: null,
        purgeStartedAt: newPurgeStartedAt,
        activatedAt: newActivatedAt,
        updatedAt: now
      };

      // 6. Audit successful reactivation
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_REACTIVATED',
        actorId: actorContext.principalId,
        targetIdentifier: eventId,
        result: 'SUCCESS',
        details: `Reactivated event '${eventId}' from SUSPENDED (previous: '${previousStatus}') to recalculated status '${targetStatus}'`,
        timestamp: now
      });

      return {
        event: updatedRecord,
        previousSuspendedStatus: 'SUSPENDED',
        targetStatus,
        outcome: 'REACTIVATED'
      };
    });
  }

  /**
   * Extiende la vigencia autorizada de un evento aplicando override/extensión conforme a DEC-095, DEC-100 y DEC-102 (EL-TK-070).
   */
  async extendEventValidity(command: ExtendEventValidityCommand): Promise<ExtendEventValidityResult> {
    const { actorContext, eventId, totalValidityDurationDays, graceDays: customGraceDays, reason, idempotencyKey, now: providedNow } = command;

    if (!actorContext || actorContext.actorType !== 'ADMIN_HUMAN') {
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_VALIDITY_EXTENDED',
        actorId: actorContext?.principalId ?? 'UNKNOWN',
        targetIdentifier: eventId,
        result: 'REJECTED_UNAUTHORIZED',
        details: 'Only authorized administrative actors (ADMIN_HUMAN) may extend event validity',
        timestamp: new Date()
      });
      throw new EventManagementError(
        'UNAUTHORIZED',
        'Only authorized administrative actors may extend event validity'
      );
    }

    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_VALIDITY_EXTENDED',
        actorId: actorContext.principalId,
        targetIdentifier: eventId,
        result: 'REJECTED_EXTENSION_REASON_REQUIRED',
        details: 'Extension reason is mandatory',
        timestamp: new Date()
      });
      throw new EventManagementError(
        'EXTENSION_REASON_REQUIRED',
        'A justified administrative reason is required to extend event validity'
      );
    }

    if (!Number.isInteger(totalValidityDurationDays) || totalValidityDurationDays <= 0) {
      throw new EventManagementError(
        'INVALID_VALIDITY_EXTENSION',
        'Total validity duration days must be a positive integer'
      );
    }

    const payloadHash = idempotencyKey
      ? createHash('sha256')
          .update(JSON.stringify({ eventId, totalValidityDurationDays, customGraceDays, principalId: actorContext.principalId }))
          .digest('hex')
      : null;

    return this.runner.run(async (tx: SqlTransaction) => {
      const now = providedNow ?? new Date();

      // 1. Pessimistic lock
      const rows = await tx.query<EventRow>(
        `SELECT id, organizer_id, name, status, timezone, starts_at_local,
                scheduled_at, utc_offset_minutes, expires_at, grace_ends_at,
                activated_at, closed_at, purge_started_at, suspended_at,
                suspension_reason, previous_status, validity_duration_days,
                grace_days, uploads_enabled, guest_gallery_enabled,
                moderation_mode, pin_enabled, idempotency_key,
                idempotency_payload_hash, created_at, updated_at
         FROM event
         WHERE id = $1
         FOR UPDATE`,
        eventId
      );

      if (rows.length === 0) {
        throw new EventManagementError('EVENT_NOT_FOUND', `Event '${eventId}' not found`);
      }

      const current = rows[0];

      // 2. State validation: PENDING_DELETION and ARCHIVED cannot be extended (terminal conflict per EL-EP-015 / DEC-102)
      if (current.status === 'PENDING_DELETION' || current.status === 'ARCHIVED') {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_VALIDITY_EXTENDED',
          actorId: actorContext.principalId,
          targetIdentifier: eventId,
          result: 'REJECTED_EVENT_TERMINAL',
          details: `Event '${eventId}' is in terminal status '${current.status}'; cannot extend validity`,
          timestamp: now
        });
        throw new EventManagementError(
          'EVENT_TERMINAL',
          `Cannot extend validity for an event in terminal status '${current.status}'`
        );
      }

      if (current.status === 'DRAFT') {
        throw new EventManagementError(
          'EVENT_NOT_EXTENDABLE',
          `Draft events must be scheduled first before applying validity extensions`
        );
      }

      // Check for idempotent replay
      if (
        idempotencyKey &&
        current.idempotency_key === idempotencyKey &&
        current.validity_duration_days === totalValidityDurationDays
      ) {
        if (current.idempotency_payload_hash !== payloadHash) {
          throw new EventManagementError(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key has already been used with different parameters'
          );
        }

        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_VALIDITY_EXTENDED',
          actorId: actorContext.principalId,
          targetIdentifier: eventId,
          result: 'IDEMPOTENT_REPLAY',
          details: `Idempotent replay: event '${eventId}' already has validity extended to ${totalValidityDurationDays} days`,
          timestamp: now
        });

        return {
          event: mapRowToRecord(current),
          previousStatus: current.status as EventStatus,
          previousExpiresAt: current.expires_at ? new Date(current.expires_at) : null,
          previousGraceEndsAt: current.grace_ends_at ? new Date(current.grace_ends_at) : null,
          outcome: 'IDEMPOTENT_REPLAY'
        };
      }

      const scheduledAt = current.scheduled_at ? new Date(current.scheduled_at) : null;
      if (!scheduledAt) {
        throw new EventManagementError(
          'SCHEDULE_NOT_CONFIGURED',
          `Event '${eventId}' does not have a scheduled anchor timestamp`
        );
      }

      const effectiveGraceDays = customGraceDays ?? current.grace_days ?? DEFAULT_GRACE_PERIOD_DAYS;

      // 3. Recalculate canonical timeline with the new total duration from scheduled anchor (DEC-095, DEC-100, DEC-082)
      const newTimeline = calculateEventLifecycleTimeline({
        scheduledAt,
        timezone: current.timezone,
        validityDurationDays: totalValidityDurationDays,
        graceDays: effectiveGraceDays
      });

      // 4. DEC-102 validation: Después de ACTIVE se bloquean reducciones de vigencia que dejen el vencimiento en el pasado
      const wasEverActive = current.activated_at != null || current.status === 'ACTIVE' || current.status === 'CLOSED' || current.status === 'GRACE_PERIOD';
      if (wasEverActive && newTimeline.expiresAt.getTime() <= now.getTime()) {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_VALIDITY_EXTENDED',
          actorId: actorContext.principalId,
          targetIdentifier: eventId,
          result: 'REJECTED_INVALID_VALIDITY_EXTENSION',
          details: `Extension leaves expiresAt (${newTimeline.expiresAt.toISOString()}) in the past (DEC-102)`,
          timestamp: now
        });
        throw new EventManagementError(
          'INVALID_VALIDITY_EXTENSION',
          `Validity extension cannot leave expiration in the past for an activated event (DEC-102)`
        );
      }

      // 5. Lifecycle reconciliation (Escenario 2):
      // Si el evento estaba en GRACE_PERIOD y la nueva vigencia lo vuelve a dejar dentro de vigencia (now < newTimeline.expiresAt):
      let targetStatus = current.status as EventStatus;
      if (current.status === 'GRACE_PERIOD' && now.getTime() < newTimeline.expiresAt.getTime()) {
        if (current.closed_at) {
          targetStatus = 'CLOSED'; // Preserva cierre voluntario
        } else {
          targetStatus = 'ACTIVE';
        }
      }

      const previousExpiresAt = current.expires_at ? new Date(current.expires_at) : null;
      const previousGraceEndsAt = current.grace_ends_at ? new Date(current.grace_ends_at) : null;
      const previousStatus = current.status as EventStatus;

      // 6. Update event in database
      await tx.execute(
        `UPDATE event
         SET validity_duration_days = $1,
             grace_days = $2,
             expires_at = $3,
             grace_ends_at = $4,
             status = $5,
             idempotency_key = COALESCE($6, idempotency_key),
             idempotency_payload_hash = COALESCE($7, idempotency_payload_hash),
             updated_at = $8
         WHERE id = $9`,
        totalValidityDurationDays,
        effectiveGraceDays,
        newTimeline.expiresAt,
        newTimeline.graceEndsAt,
        targetStatus,
        idempotencyKey ?? null,
        payloadHash,
        now,
        eventId
      );

      const updatedRecord: EventRecord = {
        ...mapRowToRecord(current),
        validityDurationDays: totalValidityDurationDays,
        graceDays: effectiveGraceDays,
        expiresAt: newTimeline.expiresAt,
        graceEndsAt: newTimeline.graceEndsAt,
        status: targetStatus,
        updatedAt: now
      };

      // 7. Audit successful extension
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_VALIDITY_EXTENDED',
        actorId: actorContext.principalId,
        targetIdentifier: eventId,
        result: 'SUCCESS',
        details: `Extended event '${eventId}' validity to ${totalValidityDurationDays} days. Status reconciled from '${previousStatus}' to '${targetStatus}'. Reason: ${trimmedReason}`,
        timestamp: now
      });

      return {
        event: updatedRecord,
        previousStatus,
        previousExpiresAt,
        previousGraceEndsAt,
        outcome: 'EXTENDED'
      };
    });
  }
}
