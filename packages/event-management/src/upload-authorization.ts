import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  EventManagementError,
  type AuthorizeUploadAttemptCommand,
  type AuthorizeUploadAttemptResult,
  type CapacityReservationPort,
  type EventAuditSink,
  type UploadAttemptRecord,
  type UploadMediaType,
  type UploadAttemptStatus,
  type EventStatus,
  type ModerationMode
} from './contracts.js';
import { EventAccessPolicy } from './access-policy.js';
import { GuestSessionService } from './guest-session.js';

interface RawEventRow {
  id: string;
  organizer_id: string;
  name: string;
  status: string;
  timezone: string;
  starts_at_local: string | null;
  scheduled_at: Date | string | null;
  utc_offset_minutes: number | null;
  expires_at: Date | string | null;
  grace_ends_at: Date | string | null;
  activated_at: Date | string | null;
  closed_at: Date | string | null;
  purge_started_at: Date | string | null;
  suspended_at: Date | string | null;
  suspension_reason: string | null;
  previous_status: string | null;
  validity_duration_days: number | null;
  grace_days: number | null;
  uploads_enabled: boolean;
  guest_gallery_enabled: boolean;
  moderation_mode: string;
  pin_enabled: boolean;
  pin_hash: string | null;
  pin_salt: string | null;
  idempotency_key: string | null;
  idempotency_payload_hash: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface RawUploadAttemptRow {
  id: string;
  event_id: string;
  guest_session_id: string;
  reservation_id: string;
  idempotency_key: string;
  declared_size: string | bigint;
  declared_type: string;
  contributor_nickname: string;
  status: string;
  object_key?: string | null;
  actual_size?: string | bigint | null;
  detected_type?: string | null;
  duration_seconds?: string | number | null;
  rejection_reason?: string | null;
  created_at: Date | string;
  expires_at: Date | string;
  updated_at: Date | string;
}

function mapRowToAttempt(row: RawUploadAttemptRow): UploadAttemptRecord {
  return {
    id: row.id,
    eventId: row.event_id,
    guestSessionId: row.guest_session_id,
    reservationId: row.reservation_id,
    idempotencyKey: row.idempotency_key,
    declaredSize: BigInt(row.declared_size),
    declaredType: row.declared_type as UploadMediaType,
    contributorNickname: row.contributor_nickname,
    status: row.status as UploadAttemptStatus,
    objectKey: row.object_key ?? null,
    actualSize: row.actual_size !== undefined && row.actual_size !== null ? BigInt(row.actual_size) : null,
    detectedType: row.detected_type ?? null,
    durationSeconds: row.duration_seconds !== undefined && row.duration_seconds !== null ? Number(row.duration_seconds) : null,
    rejectionReason: row.rejection_reason ?? null,
    createdAt: new Date(row.created_at),
    expiresAt: new Date(row.expires_at),
    updatedAt: new Date(row.updated_at)
  };
}

export class UploadAuthorizationService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly guestSessionService: GuestSessionService,
    private readonly capacityReservationService: CapacityReservationPort,
    private readonly auditSink?: EventAuditSink
  ) {
    if (!runner) {
      throw new EventManagementError('INVALID_ARGUMENT', 'TransactionRunner is required');
    }
    if (!guestSessionService) {
      throw new EventManagementError('INVALID_ARGUMENT', 'GuestSessionService is required');
    }
    if (!capacityReservationService) {
      throw new EventManagementError('INVALID_ARGUMENT', 'CapacityReservationPort is required');
    }
  }

  public async authorizeUploadAttempt(
    command: AuthorizeUploadAttemptCommand
  ): Promise<AuthorizeUploadAttemptResult> {
    if (!command || typeof command !== 'object') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Command is required');
    }

    const { sessionToken, idempotencyKey, declaredType } = command;

    if (!sessionToken || typeof sessionToken !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Session token is required');
    }

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Idempotency key is required');
    }

    if (declaredType !== 'PHOTO' && declaredType !== 'VIDEO') {
      throw new EventManagementError('INVALID_MEDIA_TYPE', 'Declared type must be PHOTO or VIDEO');
    }

    let declaredBytes: bigint;
    try {
      declaredBytes = BigInt(command.declaredSize);
    } catch {
      throw new EventManagementError('INVALID_FILE_SIZE', 'Declared size must be a valid integer');
    }

    if (declaredBytes <= 0n) {
      throw new EventManagementError('INVALID_FILE_SIZE', 'Declared size must be positive');
    }

    const now = command.now ?? new Date();

    // 1. Resolve guest session (verifies token, expiration, revocation, and basic event accessibility)
    const session = await this.guestSessionService.resolveGuestSession(sessionToken, now);

    // 2. Validate versioned consent (EL-TK-076)
    if (!session.consentRecordedAt) {
      throw new EventManagementError('CONSENT_REQUIRED', 'Guest consent required prior to upload');
    }

    // 3. Validate contributor nickname (EL-TK-077)
    const contributorNickname = session.contributorNickname;
    if (!contributorNickname || contributorNickname.trim().length === 0) {
      throw new EventManagementError(
        'INVALID_CONTRIBUTOR_NICKNAME',
        'Contributor nickname required prior to upload'
      );
    }

    // 4. Validate event status & lifecycle upload policy (EL-TK-072) under transaction
    return this.runner.run(async (tx: SqlTransaction) => {
      const eventRows = await tx.query<RawEventRow>(
        `SELECT * FROM event WHERE id = $1 FOR SHARE`,
        session.eventId
      );
      const eventRow = eventRows[0];
      if (!eventRow) {
        throw new EventManagementError('EVENT_NOT_FOUND', 'Event not found');
      }

      const mappedEvent = {
        id: eventRow.id,
        organizerId: eventRow.organizer_id,
        name: eventRow.name,
        status: eventRow.status as EventStatus,
        timezone: eventRow.timezone,
        startsAtLocal: eventRow.starts_at_local,
        scheduledAt: eventRow.scheduled_at ? new Date(eventRow.scheduled_at) : null,
        utcOffsetMinutes: eventRow.utc_offset_minutes,
        expiresAt: eventRow.expires_at ? new Date(eventRow.expires_at) : null,
        graceEndsAt: eventRow.grace_ends_at ? new Date(eventRow.grace_ends_at) : null,
        activatedAt: eventRow.activated_at ? new Date(eventRow.activated_at) : null,
        closedAt: eventRow.closed_at ? new Date(eventRow.closed_at) : null,
        purgeStartedAt: eventRow.purge_started_at ? new Date(eventRow.purge_started_at) : null,
        suspendedAt: eventRow.suspended_at ? new Date(eventRow.suspended_at) : null,
        suspensionReason: eventRow.suspension_reason,
        previousStatus: eventRow.previous_status as EventStatus | null,
        validityDurationDays: eventRow.validity_duration_days,
        graceDays: eventRow.grace_days,
        uploadsEnabled: Boolean(eventRow.uploads_enabled),
        guestGalleryEnabled: Boolean(eventRow.guest_gallery_enabled),
        moderationMode: eventRow.moderation_mode as ModerationMode,
        pinEnabled: Boolean(eventRow.pin_enabled),
        createdAt: new Date(eventRow.created_at),
        updatedAt: new Date(eventRow.updated_at)
      };

      const accessDecision = EventAccessPolicy.evaluate({
        event: mappedEvent,
        action: 'GUEST_UPLOAD',
        actorContext: {
          actorType: 'GUEST_ANONYMOUS',
          guestSessionId: session.id
        }
      });

      if (!accessDecision.allowed) {
        throw new EventManagementError(
          accessDecision.code as any,
          accessDecision.reason ?? 'Uploads not allowed under current lifecycle'
        );
      }

      if (!mappedEvent.uploadsEnabled) {
        throw new EventManagementError(
          'UPLOADS_DISABLED',
          'Uploads are currently disabled for this event'
        );
      }

      // 5. Idempotency Check on upload_attempt
      const existingAttempts = await tx.query<RawUploadAttemptRow>(
        `SELECT * FROM upload_attempt WHERE event_id = $1 AND idempotency_key = $2 FOR UPDATE`,
        session.eventId,
        idempotencyKey
      );

      const existing = existingAttempts[0];
      if (existing) {
        if (
          BigInt(existing.declared_size) === declaredBytes &&
          existing.declared_type === declaredType &&
          existing.guest_session_id === session.id
        ) {
          return {
            attempt: mapRowToAttempt(existing),
            outcome: 'IDEMPOTENT_REPLAY'
          };
        }
        throw new EventManagementError(
          'IDEMPOTENCY_CONFLICT',
          'Conflicting parameters for existing upload attempt idempotency key'
        );
      }

      // 6. Reserve Capacity (DEC-080): atomic reservation of 1 fileSlot and declared bytes
      let reservationResult;
      try {
        reservationResult = await this.capacityReservationService.reserveCapacity({
          eventId: session.eventId,
          bytes: declaredBytes,
          fileSlots: 1,
          mediaType: declaredType,
          idempotencyKey: `upload_attempt_${idempotencyKey}`
        });
      } catch (err: any) {
        if (
          err.code === 'INSUFFICIENT_STORAGE_CAPACITY' ||
          err.code === 'INSUFFICIENT_FILE_CAPACITY' ||
          err.code === 'FILE_SIZE_EXCEEDS_LIMIT'
        ) {
          throw new EventManagementError(err.code, err.message);
        }
        throw err;
      }

      // 7. Persist UploadAttempt record in AUTHORIZED state with a 1-hour expiration lease
      const attemptId = randomUUID();
      const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour lease

      await tx.execute(
        `INSERT INTO upload_attempt (
          id, event_id, guest_session_id, reservation_id, idempotency_key,
          declared_size, declared_type, contributor_nickname, status,
          created_at, expires_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'AUTHORIZED', $9, $10, $11)`,
        attemptId,
        session.eventId,
        session.id,
        reservationResult.reservation.id,
        idempotencyKey,
        declaredBytes.toString(),
        declaredType,
        session.contributorNickname,
        now,
        expiresAt,
        now
      );

      // 8. Auditing without secrets or binary data
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'UPLOAD_ATTEMPT_AUTHORIZED',
        actorId: 'GUEST_ANONYMOUS',
        targetIdentifier: session.eventId,
        result: 'SUCCESS',
        details: `Upload attempt authorized for ${declaredType} (${declaredBytes} bytes, slot 1)`,
        timestamp: now
      });

      const attemptRecord: UploadAttemptRecord = {
        id: attemptId,
        eventId: session.eventId,
        guestSessionId: session.id,
        reservationId: reservationResult.reservation.id,
        idempotencyKey,
        declaredSize: declaredBytes,
        declaredType,
        contributorNickname: contributorNickname,
        status: 'AUTHORIZED',
        createdAt: now,
        expiresAt,
        updatedAt: now
      };

      return {
        attempt: attemptRecord,
        outcome: 'AUTHORIZED'
      };
    });
  }
}
