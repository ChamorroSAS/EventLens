import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  EventManagementError,
  type DirectUploadGrant,
  type DirectUploadStoragePort,
  type CreateDirectUploadUrlCommand,
  type CreateDirectUploadUrlResult,
  type ConfirmUploadCommand,
  type ConfirmUploadResult,
  type ValidateUploadCommand,
  type ValidateUploadResult,
  type AcceptUploadCommand,
  type AcceptUploadResult,
  type MediaAcceptancePort,
  type RenewUploadGrantCommand,
  type RenewUploadGrantResult,
  type ReconcilePolicyCancellationsCommand,
  type ReconcilePolicyCancellationsResult,
  type GetUploadBatchSnapshotCommand,
  type UploadBatchSnapshot,
  type UploadBatchItem,
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
import { UploadMediaValidator } from './upload-media-validator.js';

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

export class UploadLifecycleService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly guestSessionService: GuestSessionService,
    private readonly storagePort: DirectUploadStoragePort,
    private readonly capacityPort?: CapacityReservationPort,
    private readonly mediaAcceptancePort?: MediaAcceptancePort,
    private readonly auditSink?: EventAuditSink
  ) {
    if (!runner) {
      throw new EventManagementError('INVALID_ARGUMENT', 'TransactionRunner is required');
    }
    if (!guestSessionService) {
      throw new EventManagementError('INVALID_ARGUMENT', 'GuestSessionService is required');
    }
    if (!storagePort) {
      throw new EventManagementError('INVALID_ARGUMENT', 'DirectUploadStoragePort is required');
    }
  }

  /**
   * EL-TK-087: Emitir una URL temporal para carga directa al object storage privado.
   */
  public async createDirectUploadUrl(
    command: CreateDirectUploadUrlCommand
  ): Promise<CreateDirectUploadUrlResult> {
    const { sessionToken, attemptId } = command;
    const now = command.now ?? new Date();

    if (!sessionToken || typeof sessionToken !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Session token is required');
    }
    if (!attemptId || typeof attemptId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Attempt ID is required');
    }

    const session = await this.guestSessionService.resolveGuestSession(sessionToken, now);

    return this.runner.run(async (tx: SqlTransaction) => {
      // 1. Fetch Attempt with row lock
      const attempts = await tx.query<RawUploadAttemptRow>(
        `SELECT * FROM upload_attempt WHERE id = $1 FOR UPDATE`,
        attemptId
      );

      if (attempts.length === 0) {
        throw new EventManagementError('UPLOAD_ATTEMPT_NOT_FOUND', `Upload attempt '${attemptId}' not found`);
      }

      const attempt = attempts[0];

      // 2. Ownership & Tenant isolation
      if (attempt.guest_session_id !== session.id || attempt.event_id !== session.eventId) {
        throw new EventManagementError('UNAUTHORIZED', 'Upload attempt does not belong to the current guest session');
      }

      // 3. Status checks
      if (attempt.status === 'CANCELLED') {
        throw new EventManagementError('UPLOAD_ATTEMPT_CANCELLED', 'Upload attempt has been cancelled');
      }
      if (attempt.status === 'ACCEPTED') {
        throw new EventManagementError('UPLOAD_ATTEMPT_ALREADY_ACCEPTED', 'Upload attempt has already been accepted');
      }

      const expiresAt = new Date(attempt.expires_at);
      if (now.getTime() >= expiresAt.getTime()) {
        throw new EventManagementError('UPLOAD_ATTEMPT_EXPIRED', 'Upload attempt has expired');
      }

      // 4. Revalidate event policy
      const events = await tx.query<RawEventRow>(
        `SELECT * FROM event WHERE id = $1 FOR UPDATE`,
        attempt.event_id
      );
      if (events.length === 0) {
        throw new EventManagementError('EVENT_NOT_FOUND', `Event '${attempt.event_id}' not found`);
      }
      const eventRow = events[0];

      const accessDecision = EventAccessPolicy.evaluate({
        event: {
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
          previousStatus: (eventRow.previous_status as EventStatus) ?? null,
          validityDurationDays: eventRow.validity_duration_days,
          graceDays: eventRow.grace_days,
          uploadsEnabled: Boolean(eventRow.uploads_enabled),
          guestGalleryEnabled: Boolean(eventRow.guest_gallery_enabled),
          moderationMode: (eventRow.moderation_mode as ModerationMode) ?? 'AUTO_PUBLISH',
          pinEnabled: Boolean(eventRow.pin_enabled),
          createdAt: new Date(eventRow.created_at),
          updatedAt: new Date(eventRow.updated_at)
        },
        action: 'GUEST_UPLOAD',
        actorContext: {
          actorType: 'GUEST_ANONYMOUS',
          guestSessionId: session.id
        }
      });

      if (!accessDecision.allowed) {
        throw new EventManagementError('EVENT_NOT_ACCESSIBLE', accessDecision.reason);
      }

      // 5. Generate deterministic, unpredictable objectKey
      const objectKey = attempt.object_key ?? `events/${attempt.event_id}/originals/${attempt.id}`;
      const ttlSeconds = 900; // 15 minutes TTL

      // 6. Request pre-signed URL from contract-neutral ObjectStoragePort (DEC-063)
      const storageResult = await this.storagePort.createUploadUrl({
        objectKey,
        declaredSize: BigInt(attempt.declared_size),
        declaredType: attempt.declared_type,
        ttlSeconds
      });

      const outcome = attempt.status === 'UPLOADING' ? 'IDEMPOTENT_REPLAY' : 'ISSUED';

      // 7. Update attempt record
      await tx.execute(
        `UPDATE upload_attempt
         SET object_key = $2,
             status = 'UPLOADING',
             updated_at = $3
         WHERE id = $1`,
        attempt.id,
        objectKey,
        now
      );

      // 8. Audit log WITHOUT revealing the signed URL (DEC-013, acceptance criteria)
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'UPLOAD_URL_ISSUED',
        actorId: session.id,
        targetIdentifier: attempt.event_id,
        result: outcome === 'ISSUED' ? 'SUCCESS' : 'IDEMPOTENT_REPLAY',
        details: `Issued direct upload URL for attempt '${attempt.id}', objectKey '${objectKey}'`,
        timestamp: now
      });

      return {
        grant: {
          attemptId: attempt.id,
          objectKey,
          uploadUrl: storageResult.uploadUrl,
          method: storageResult.method,
          headers: storageResult.headers,
          expiresAt: storageResult.expiresAt
        },
        outcome
      };
    });
  }

  /**
   * EL-TK-088: Confirmar la existencia y pertenencia del original cargado.
   */
  public async confirmUpload(
    command: ConfirmUploadCommand
  ): Promise<ConfirmUploadResult> {
    const { sessionToken, attemptId } = command;
    const now = command.now ?? new Date();

    if (!sessionToken || typeof sessionToken !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Session token is required');
    }
    if (!attemptId || typeof attemptId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Attempt ID is required');
    }

    const session = await this.guestSessionService.resolveGuestSession(sessionToken, now);

    return this.runner.run(async (tx: SqlTransaction) => {
      const attempts = await tx.query<RawUploadAttemptRow>(
        `SELECT * FROM upload_attempt WHERE id = $1 FOR UPDATE`,
        attemptId
      );

      if (attempts.length === 0) {
        throw new EventManagementError('UPLOAD_ATTEMPT_NOT_FOUND', `Upload attempt '${attemptId}' not found`);
      }

      const attempt = attempts[0];

      if (attempt.guest_session_id !== session.id || attempt.event_id !== session.eventId) {
        throw new EventManagementError('UNAUTHORIZED', 'Upload attempt does not belong to the current guest session');
      }

      if (attempt.status === 'CANCELLED') {
        throw new EventManagementError('UPLOAD_ATTEMPT_CANCELLED', 'Upload attempt has been cancelled');
      }

      // Idempotency: if already confirmed, validated or accepted
      if (['CONFIRMING', 'VALIDATED', 'ACCEPTED'].includes(attempt.status)) {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'UPLOAD_CONFIRMED',
          actorId: session.id,
          targetIdentifier: attempt.event_id,
          result: 'IDEMPOTENT_REPLAY',
          details: `Idempotent replay: attempt '${attempt.id}' already in status '${attempt.status}'`,
          timestamp: now
        });

        return {
          attempt: mapRowToAttempt(attempt),
          outcome: 'IDEMPOTENT_REPLAY'
        };
      }

      if (!attempt.object_key) {
        throw new EventManagementError('INVALID_STATE', 'Upload URL was not issued for this attempt');
      }

      // Query ObjectStorage to verify existence and actual size
      const metadata = await this.storagePort.getObjectMetadata(attempt.object_key);
      if (!metadata) {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'UPLOAD_CONFIRMED',
          actorId: session.id,
          targetIdentifier: attempt.event_id,
          result: 'REJECTED_OBJECT_NOT_FOUND',
          details: `Object '${attempt.object_key}' not found in storage`,
          timestamp: now
        });
        throw new EventManagementError('OBJECT_NOT_FOUND', `Object '${attempt.object_key}' not found in storage`);
      }

      if (metadata.sizeBytes <= 0n) {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'UPLOAD_CONFIRMED',
          actorId: session.id,
          targetIdentifier: attempt.event_id,
          result: 'REJECTED_SIZE_MISMATCH',
          details: 'Uploaded file has 0 bytes',
          timestamp: now
        });
        throw new EventManagementError('SIZE_MISMATCH', 'Uploaded file has 0 bytes');
      }

      // Update attempt to CONFIRMING with actual_size
      const updatedRows = await tx.query<RawUploadAttemptRow>(
        `UPDATE upload_attempt
         SET status = 'CONFIRMING',
             actual_size = $2,
             updated_at = $3
         WHERE id = $1
         RETURNING *`,
        attempt.id,
        metadata.sizeBytes.toString(),
        now
      );

      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'UPLOAD_CONFIRMED',
        actorId: session.id,
        targetIdentifier: attempt.event_id,
        result: 'SUCCESS',
        details: `Confirmed upload for attempt '${attempt.id}', actualSize: ${metadata.sizeBytes} bytes`,
        timestamp: now
      });

      return {
        attempt: mapRowToAttempt(updatedRows[0]),
        outcome: 'CONFIRMED'
      };
    });
  }

  /**
   * EL-TK-089: Validar restricciones reales del archivo antes de aceptar el original.
   */
  public async validateUpload(
    command: ValidateUploadCommand
  ): Promise<ValidateUploadResult> {
    const { sessionToken, attemptId, headerBytes, limits } = command;
    const now = command.now ?? new Date();

    if (!sessionToken || typeof sessionToken !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Session token is required');
    }
    if (!attemptId || typeof attemptId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Attempt ID is required');
    }

    const session = await this.guestSessionService.resolveGuestSession(sessionToken, now);

    return this.runner.run(async (tx: SqlTransaction) => {
      const attempts = await tx.query<RawUploadAttemptRow>(
        `SELECT * FROM upload_attempt WHERE id = $1 FOR UPDATE`,
        attemptId
      );

      if (attempts.length === 0) {
        throw new EventManagementError('UPLOAD_ATTEMPT_NOT_FOUND', `Upload attempt '${attemptId}' not found`);
      }

      const attempt = attempts[0];

      if (attempt.guest_session_id !== session.id || attempt.event_id !== session.eventId) {
        throw new EventManagementError('UNAUTHORIZED', 'Upload attempt does not belong to the current guest session');
      }

      // Replay
      if (['VALIDATED', 'ACCEPTED'].includes(attempt.status)) {
        return {
          attempt: mapRowToAttempt(attempt),
          valid: true,
          detectedType: attempt.detected_type ?? undefined,
          durationSeconds: attempt.duration_seconds !== null && attempt.duration_seconds !== undefined ? Number(attempt.duration_seconds) : undefined,
          outcome: 'IDEMPOTENT_REPLAY'
        };
      }
      if (attempt.status === 'REJECTED') {
        return {
          attempt: mapRowToAttempt(attempt),
          valid: false,
          rejectionReason: attempt.rejection_reason ?? undefined,
          outcome: 'IDEMPOTENT_REPLAY'
        };
      }

      if (attempt.status !== 'CONFIRMING') {
        throw new EventManagementError(
          'INVALID_STATE',
          `Cannot validate attempt in status '${attempt.status}'. Must be 'CONFIRMING'`
        );
      }

      const actualSize = attempt.actual_size ? BigInt(attempt.actual_size) : 0n;

      // Safe header range inspection if not supplied in command
      let inspectedBytes = headerBytes;
      if (!inspectedBytes && this.storagePort.readBytesRange && attempt.object_key) {
        try {
          inspectedBytes = await this.storagePort.readBytesRange(attempt.object_key, 0, 4096);
        } catch {
          // Non-fatal if storage does not support range reads
        }
      }

      const validation = UploadMediaValidator.validate({
        declaredType: attempt.declared_type as UploadMediaType,
        actualSize,
        headerBytes: inspectedBytes,
        limits
      });

      if (validation.valid) {
        const updated = await tx.query<RawUploadAttemptRow>(
          `UPDATE upload_attempt
           SET status = 'VALIDATED',
               detected_type = $2,
               duration_seconds = $3,
               rejection_reason = NULL,
               updated_at = $4
           WHERE id = $1
           RETURNING *`,
          attempt.id,
          validation.detectedType,
          validation.durationSeconds ?? null,
          now
        );

        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'UPLOAD_VALIDATED',
          actorId: session.id,
          targetIdentifier: attempt.event_id,
          result: 'VALIDATED',
          details: `Validated attempt '${attempt.id}' as '${validation.detectedType}'`,
          timestamp: now
        });

        return {
          attempt: mapRowToAttempt(updated[0]),
          valid: true,
          detectedType: validation.detectedType,
          durationSeconds: validation.durationSeconds,
          outcome: 'VALIDATED'
        };
      }

      // If rejected: update attempt and release reservation
      const updated = await tx.query<RawUploadAttemptRow>(
        `UPDATE upload_attempt
         SET status = 'REJECTED',
             detected_type = $2,
             rejection_reason = $3,
             updated_at = $4
         WHERE id = $1
         RETURNING *`,
        attempt.id,
        validation.detectedType,
        validation.rejectionReason,
        now
      );

      // Release reserved capacity for rejected file
      if (this.capacityPort?.releaseReservation) {
        await this.capacityPort.releaseReservation({
          eventId: attempt.event_id,
          reservationId: attempt.reservation_id,
          reason: validation.rejectionReason
        });
      }

      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'UPLOAD_VALIDATED',
        actorId: session.id,
        targetIdentifier: attempt.event_id,
        result: (validation.rejectionReason === 'FILE_SIZE_EXCEEDS_LIMIT'
          ? 'REJECTED_SIZE_MISMATCH'
          : validation.rejectionReason === 'DURATION_EXCEEDS_LIMIT'
            ? 'REJECTED_DURATION_EXCEEDED'
            : 'REJECTED_UNSUPPORTED_TYPE') as any,
        details: `Validation rejected for attempt '${attempt.id}': ${validation.rejectionReason}`,
        timestamp: now
      });

      return {
        attempt: mapRowToAttempt(updated[0]),
        valid: false,
        rejectionReason: validation.rejectionReason,
        outcome: 'REJECTED'
      };
    });
  }

  /**
   * EL-TK-090: Aceptar un original confirmado y transferirlo al pipeline asíncrono.
   */
  public async acceptUpload(
    command: AcceptUploadCommand
  ): Promise<AcceptUploadResult> {
    const { sessionToken, attemptId, sha256 } = command;
    const now = command.now ?? new Date();

    if (!sessionToken || typeof sessionToken !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Session token is required');
    }
    if (!attemptId || typeof attemptId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Attempt ID is required');
    }

    const session = await this.guestSessionService.resolveGuestSession(sessionToken, now);

    return this.runner.run(async (tx: SqlTransaction) => {
      const attempts = await tx.query<RawUploadAttemptRow>(
        `SELECT * FROM upload_attempt WHERE id = $1 FOR UPDATE`,
        attemptId
      );

      if (attempts.length === 0) {
        throw new EventManagementError('UPLOAD_ATTEMPT_NOT_FOUND', `Upload attempt '${attemptId}' not found`);
      }

      const attempt = attempts[0];

      if (attempt.guest_session_id !== session.id || attempt.event_id !== session.eventId) {
        throw new EventManagementError('UNAUTHORIZED', 'Upload attempt does not belong to the current guest session');
      }

      const mediaRef = `media_${attempt.id}`;

      // Idempotency: already accepted
      if (attempt.status === 'ACCEPTED') {
        return {
          attempt: mapRowToAttempt(attempt),
          mediaRef,
          outcome: 'IDEMPOTENT_REPLAY'
        };
      }

      if (attempt.status !== 'VALIDATED') {
        throw new EventManagementError(
          'INVALID_STATE',
          `Cannot accept attempt in status '${attempt.status}'. Must be 'VALIDATED'`
        );
      }

      // Revalidate event access (DEC-085: event must not have closed/suspended/revoked before acceptance)
      const events = await tx.query<RawEventRow>(
        `SELECT * FROM event WHERE id = $1 FOR UPDATE`,
        attempt.event_id
      );
      if (events.length === 0) {
        throw new EventManagementError('EVENT_NOT_FOUND', `Event '${attempt.event_id}' not found`);
      }
      const eventRow = events[0];

      if (eventRow.status !== 'ACTIVE' || !eventRow.uploads_enabled) {
        throw new EventManagementError('EVENT_NOT_ACCESSIBLE', 'Event is not in an active uploading state');
      }

      // Update attempt to ACCEPTED
      const updated = await tx.query<RawUploadAttemptRow>(
        `UPDATE upload_attempt
         SET status = 'ACCEPTED',
             updated_at = $2
         WHERE id = $1
         RETURNING *`,
        attempt.id,
        now
      );

      // Commit capacity reservation
      if (this.capacityPort?.commitReservation) {
        await this.capacityPort.commitReservation({
          eventId: attempt.event_id,
          reservationId: attempt.reservation_id
        });
      }

      // Publish/handoff to downstream MediaAcceptance pipeline (EL-TK-032)
      if (this.mediaAcceptancePort) {
        const fileSha256 = sha256 ?? '0'.repeat(64);
        await this.mediaAcceptancePort.acceptOriginal({
          intentId: attempt.id,
          mediaRef,
          eventRef: attempt.event_id,
          guestRef: attempt.guest_session_id,
          generation: 1n,
          expectedRevision: 1n,
          original: {
            namespace: 'originals',
            key: attempt.object_key!,
            version: '1',
            sha256: fileSha256,
            bytes: BigInt(attempt.actual_size ?? attempt.declared_size)
          }
        });
      }

      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'UPLOAD_ACCEPTED',
        actorId: session.id,
        targetIdentifier: attempt.event_id,
        result: 'ACCEPTED',
        details: `Accepted upload attempt '${attempt.id}', mediaRef: '${mediaRef}'`,
        timestamp: now
      });

      return {
        attempt: mapRowToAttempt(updated[0]),
        mediaRef,
        outcome: 'ACCEPTED'
      };
    });
  }

  /**
   * EL-TK-091: Renovar una transferencia temporal para un fallo de red elegible.
   */
  public async renewUploadGrant(
    command: RenewUploadGrantCommand
  ): Promise<RenewUploadGrantResult> {
    const { sessionToken, attemptId, reason } = command;
    const now = command.now ?? new Date();

    if (!sessionToken || typeof sessionToken !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Session token is required');
    }
    if (!attemptId || typeof attemptId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Attempt ID is required');
    }

    const session = await this.guestSessionService.resolveGuestSession(sessionToken, now);

    return this.runner.run(async (tx: SqlTransaction) => {
      const attempts = await tx.query<RawUploadAttemptRow>(
        `SELECT * FROM upload_attempt WHERE id = $1 FOR UPDATE`,
        attemptId
      );

      if (attempts.length === 0) {
        throw new EventManagementError('UPLOAD_ATTEMPT_NOT_FOUND', `Upload attempt '${attemptId}' not found`);
      }

      const attempt = attempts[0];

      if (attempt.guest_session_id !== session.id || attempt.event_id !== session.eventId) {
        throw new EventManagementError('UNAUTHORIZED', 'Upload attempt does not belong to the current guest session');
      }

      // Non-retryable terminal statuses
      if (attempt.status === 'ACCEPTED') {
        throw new EventManagementError('UPLOAD_ATTEMPT_ALREADY_ACCEPTED', 'Already accepted; retry not permitted');
      }
      if (attempt.status === 'CANCELLED') {
        throw new EventManagementError('UPLOAD_ATTEMPT_CANCELLED', 'Cancelled attempt cannot be retried');
      }

      // Check event policy
      const events = await tx.query<RawEventRow>(
        `SELECT * FROM event WHERE id = $1 FOR UPDATE`,
        attempt.event_id
      );
      if (events.length === 0 || events[0].status !== 'ACTIVE' || !events[0].uploads_enabled) {
        throw new EventManagementError('EVENT_NOT_ACCESSIBLE', 'Event is no longer active for uploads');
      }

      const objectKey = attempt.object_key ?? `events/${attempt.event_id}/originals/${attempt.id}`;
      const ttlSeconds = 900;

      // Re-issue direct upload grant keeping the exact same reservation
      const storageResult = await this.storagePort.createUploadUrl({
        objectKey,
        declaredSize: BigInt(attempt.declared_size),
        declaredType: attempt.declared_type,
        ttlSeconds
      });

      // Reset attempt status to UPLOADING with updated expiration
      await tx.execute(
        `UPDATE upload_attempt
         SET status = 'UPLOADING',
             expires_at = $2,
             updated_at = $3
         WHERE id = $1`,
        attempt.id,
        storageResult.expiresAt,
        now
      );

      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'UPLOAD_GRANT_RENEWED',
        actorId: session.id,
        targetIdentifier: attempt.event_id,
        result: 'RENEWED',
        details: `Renewed direct upload grant for attempt '${attempt.id}'. Reason: ${reason ?? 'network_retry'}`,
        timestamp: now
      });

      return {
        grant: {
          attemptId: attempt.id,
          objectKey,
          uploadUrl: storageResult.uploadUrl,
          method: storageResult.method,
          headers: storageResult.headers,
          expiresAt: storageResult.expiresAt
        },
        outcome: 'RENEWED'
      };
    });
  }

  /**
   * EL-TK-092: Cancelar intentos no confirmados y liberar sus reservas (DEC-085).
   */
  public async reconcilePolicyCancellations(
    command: ReconcilePolicyCancellationsCommand
  ): Promise<ReconcilePolicyCancellationsResult> {
    const { eventId, guestSessionId, reason } = command;
    const now = command.now ?? new Date();

    if (!eventId || typeof eventId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Event ID is required');
    }

    return this.runner.run(async (tx: SqlTransaction) => {
      // Find all unconfirmed attempts: AUTHORIZED, UPLOADING, CONFIRMING
      let querySql = `
        SELECT id, reservation_id, object_key, status
        FROM upload_attempt
        WHERE event_id = $1
          AND status IN ('AUTHORIZED', 'UPLOADING', 'CONFIRMING')
      `;
      const queryParams: unknown[] = [eventId];

      if (guestSessionId) {
        querySql += ` AND guest_session_id = $2`;
        queryParams.push(guestSessionId);
      }
      querySql += ` FOR UPDATE`;

      const unconfirmed = await tx.query<{
        id: string;
        reservation_id: string;
        object_key: string | null;
        status: string;
      }>(querySql, ...queryParams);

      const countRow = await tx.query<{ count: string | number }>(
        `SELECT count(*)::int as count FROM upload_attempt WHERE event_id = $1 AND status = 'ACCEPTED'`,
        eventId
      );
      const preservedAcceptedCount = Number(countRow[0]?.count ?? 0);

      const cancelledAttemptIds: string[] = [];
      const releasedReservationIds: string[] = [];

      for (const row of unconfirmed) {
        // Mark CANCELLED
        await tx.execute(
          `UPDATE upload_attempt
           SET status = 'CANCELLED',
               rejection_reason = $2,
               updated_at = $3
           WHERE id = $1`,
          row.id,
          reason,
          now
        );
        cancelledAttemptIds.push(row.id);

        // Release reservation atomically
        if (this.capacityPort?.releaseReservation) {
          await this.capacityPort.releaseReservation({
            eventId,
            reservationId: row.reservation_id,
            reason
          });
        }
        releasedReservationIds.push(row.reservation_id);

        // Abort/delete provisional storage object if key exists
        if (row.object_key) {
          try {
            await this.storagePort.abortOrDeleteObject(row.object_key);
          } catch {
            // Clean up best effort
          }
        }
      }

      if (cancelledAttemptIds.length > 0) {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'UPLOAD_POLICY_CANCELLED',
          actorId: 'SYSTEM_POLICY',
          targetIdentifier: eventId,
          result: 'CANCELLED',
          details: `Cancelled ${cancelledAttemptIds.length} unconfirmed attempts (DEC-085). Reason: ${reason}`,
          timestamp: now
        });
      }

      return {
        cancelledAttemptIds,
        releasedReservationIds,
        preservedAcceptedCount
      };
    });
  }

  /**
   * EL-TK-093: Consultar el estado de intentos y resultados de carga del lote.
   */
  public async getUploadBatchSnapshot(
    command: GetUploadBatchSnapshotCommand
  ): Promise<UploadBatchSnapshot> {
    const { sessionToken } = command;
    const now = command.now ?? new Date();

    if (!sessionToken || typeof sessionToken !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Session token is required');
    }

    const session = await this.guestSessionService.resolveGuestSession(sessionToken, now);

    return this.runner.run(async (tx: SqlTransaction) => {
      const rows = await tx.query<RawUploadAttemptRow>(
        `SELECT *
         FROM upload_attempt
         WHERE guest_session_id = $1 AND event_id = $2
         ORDER BY created_at ASC`,
        session.id,
        session.eventId
      );

      let receivedCount = 0;
      let inProgressCount = 0;
      let actionRequiredCount = 0;
      let rejectedCount = 0;

      const items: UploadBatchItem[] = rows.map((r) => {
        const status = r.status as UploadAttemptStatus;
        const actualSize = r.actual_size !== undefined && r.actual_size !== null ? BigInt(r.actual_size) : null;
        const declaredSize = BigInt(r.declared_size);

        // Determine retry eligibility
        const canRetry =
          status === 'UPLOADING' ||
          status === 'CONFIRMING' ||
          (status === 'REJECTED' && r.rejection_reason === 'NETWORK_INTERRUPTED');

        if (status === 'ACCEPTED') {
          receivedCount++;
        } else if (['AUTHORIZED', 'UPLOADING', 'CONFIRMING', 'VALIDATED'].includes(status)) {
          inProgressCount++;
        } else if (canRetry) {
          actionRequiredCount++;
        } else {
          rejectedCount++;
        }

        return {
          attemptId: r.id,
          declaredType: r.declared_type as UploadMediaType,
          declaredSize,
          actualSize,
          status,
          contributorNickname: r.contributor_nickname,
          createdAt: new Date(r.created_at),
          updatedAt: new Date(r.updated_at),
          rejectionReason: r.rejection_reason ?? null,
          canRetry
        };
      });

      return {
        eventId: session.eventId,
        guestSessionId: session.id,
        items,
        totalFiles: items.length,
        receivedCount,
        inProgressCount,
        actionRequiredCount,
        rejectedCount
      };
    });
  }
}
