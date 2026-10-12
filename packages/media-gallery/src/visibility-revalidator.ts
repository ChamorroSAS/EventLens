import { createHash, randomUUID } from 'node:crypto';
import { EventAccessPolicy, type EventRecord, type EventStatus } from '@eventlens/event-management';
import {
  MediaGalleryError,
  type RevalidateMediaVisibilityCommand,
  type MediaVisibilityResult,
  type RevalidateBatchVisibilityCommand,
  type BatchVisibilityResult,
  type MediaGalleryAuditSink,
  type TransactionRunner,
  type MediaGalleryDenialCode
} from './contracts.js';

interface RawEventRow {
  id: string;
  name: string;
  status: string;
  organizer_id: string;
  guest_gallery_enabled: boolean;
  uploads_enabled: boolean;
  pin_enabled: boolean;
  timezone: string;
  starts_at_local: string | null;
  scheduled_at: Date | string | null;
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
  moderation_mode: string;
}

interface RawMediaCatalogRow {
  media_ref: string;
  event_ref: string;
  status: string;
  revision: string | bigint | number;
}

interface RawGuestSessionRow {
  id: string;
  event_id: string;
  token_hash: string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
}

interface RawPublicCredentialRow {
  id: string;
  event_id: string;
  lookup_key: string;
  pin_required: boolean;
  revoked_at: Date | string | null;
}

export class MediaVisibilityRevalidator {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly auditSink?: MediaGalleryAuditSink
  ) {
    if (!runner) {
      throw new MediaGalleryError('INVALID_ARGUMENT', 'TransactionRunner is required');
    }
  }

  /**
   * Revalidates live visibility of a media item before grant emission or viewing (EL-TK-101).
   * Checks event lifecycle, gallery status, actor session, and live media state.
   */
  public async revalidateMediaVisibility(
    command: RevalidateMediaVisibilityCommand
  ): Promise<MediaVisibilityResult> {
    if (!command || typeof command !== 'object') {
      throw new MediaGalleryError('INVALID_ARGUMENT', 'Command is required');
    }

    const { eventId, mediaId, actor, expectedRevision, now = new Date() } = command;

    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      throw new MediaGalleryError('INVALID_ARGUMENT', 'Valid eventId is required');
    }
    if (!mediaId || typeof mediaId !== 'string' || !mediaId.trim()) {
      throw new MediaGalleryError('INVALID_ARGUMENT', 'Valid mediaId is required');
    }
    if (!actor || typeof actor !== 'object') {
      throw new MediaGalleryError('INVALID_ARGUMENT', 'Valid actor is required');
    }

    const cleanEventId = eventId.trim().replace(/^event:/, '');
    const cleanMediaId = mediaId.trim().replace(/^media:/, '');

    return this.runner.run(async (tx) => {
      // 1. Fetch Event
      const eventRows = await tx.query<RawEventRow>(
        `SELECT
           id, name, status, organizer_id, guest_gallery_enabled, uploads_enabled,
           pin_enabled, timezone, starts_at_local, scheduled_at, expires_at, grace_ends_at,
           activated_at, closed_at, purge_started_at, suspended_at, suspension_reason,
           previous_status, validity_duration_days, grace_days, moderation_mode
         FROM event
         WHERE id = $1
         LIMIT 1`,
        cleanEventId
      );

      if (!eventRows.length) {
        return this.recordAndReturnDenial(
          cleanEventId,
          cleanMediaId,
          actor.actorType,
          'EVENT_NOT_FOUND',
          `Event '${cleanEventId}' not found`,
          now
        );
      }

      const rawEvent = eventRows[0]!;

      if (['PENDING_DELETION', 'ARCHIVED', 'DELETED'].includes(rawEvent.status)) {
        return this.recordAndReturnDenial(
          cleanEventId,
          cleanMediaId,
          actor.actorType,
          'EVENT_NOT_FOUND',
          `Event is in terminal state '${rawEvent.status}'`,
          now
        );
      }

      // 2. Lifecycle & Policy
      const eventRecord: EventRecord = {
        id: rawEvent.id,
        organizerId: rawEvent.organizer_id,
        name: rawEvent.name,
        status: rawEvent.status as EventStatus,
        timezone: rawEvent.timezone,
        startsAtLocal: rawEvent.starts_at_local,
        scheduledAt: rawEvent.scheduled_at ? new Date(rawEvent.scheduled_at) : null,
        utcOffsetMinutes: null,
        expiresAt: rawEvent.expires_at ? new Date(rawEvent.expires_at) : null,
        graceEndsAt: rawEvent.grace_ends_at ? new Date(rawEvent.grace_ends_at) : null,
        activatedAt: rawEvent.activated_at ? new Date(rawEvent.activated_at) : null,
        closedAt: rawEvent.closed_at ? new Date(rawEvent.closed_at) : null,
        purgeStartedAt: rawEvent.purge_started_at ? new Date(rawEvent.purge_started_at) : null,
        suspendedAt: rawEvent.suspended_at ? new Date(rawEvent.suspended_at) : null,
        suspensionReason: rawEvent.suspension_reason,
        previousStatus: rawEvent.previous_status as EventStatus | null,
        validityDurationDays: rawEvent.validity_duration_days,
        graceDays: rawEvent.grace_days,
        uploadsEnabled: Boolean(rawEvent.uploads_enabled),
        guestGalleryEnabled: Boolean(rawEvent.guest_gallery_enabled),
        moderationMode: rawEvent.moderation_mode as any,
        pinEnabled: Boolean(rawEvent.pin_enabled),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      if (actor.actorType === 'GUEST') {
        if (!rawEvent.guest_gallery_enabled) {
          return this.recordAndReturnDenial(
            cleanEventId,
            cleanMediaId,
            actor.actorType,
            'GALLERY_DISABLED',
            'Guest gallery is explicitly disabled for this event',
            now
          );
        }

        const decision = EventAccessPolicy.evaluate({
          event: eventRecord,
          action: 'GUEST_VIEW_GALLERY',
          actorContext: { actorType: 'GUEST_ANONYMOUS' }
        });

        if (!decision.allowed) {
          return this.recordAndReturnDenial(
            cleanEventId,
            cleanMediaId,
            actor.actorType,
            'GALLERY_DISABLED',
            decision.reason,
            now
          );
        }

        // Validate session or credential
        if (actor.guestSessionToken) {
          const tokenHash = createHash('sha256').update(actor.guestSessionToken.trim()).digest('hex');
          const sessionRows = await tx.query<RawGuestSessionRow>(
            `SELECT id, event_id, token_hash, expires_at, revoked_at
             FROM guest_session
             WHERE token_hash = $1
             LIMIT 1`,
            tokenHash
          );

          if (!sessionRows.length) {
            return this.recordAndReturnDenial(
              cleanEventId,
              cleanMediaId,
              actor.actorType,
              'INVALID_CREDENTIAL',
              'Guest session not found',
              now
            );
          }

          const session = sessionRows[0]!;
          if (session.event_id !== cleanEventId) {
            return this.recordAndReturnDenial(
              cleanEventId,
              cleanMediaId,
              actor.actorType,
              'INVALID_CREDENTIAL',
              'Session does not belong to requested event',
              now
            );
          }
          if (session.revoked_at !== null) {
            return this.recordAndReturnDenial(
              cleanEventId,
              cleanMediaId,
              actor.actorType,
              'ACCESS_REVOKED',
              'Guest session has been revoked',
              now
            );
          }
          if (new Date(session.expires_at).getTime() <= now.getTime()) {
            return this.recordAndReturnDenial(
              cleanEventId,
              cleanMediaId,
              actor.actorType,
              'SESSION_EXPIRED',
              'Guest session has expired',
              now
            );
          }
        } else if (actor.publicLookupKey) {
          const credRows = await tx.query<RawPublicCredentialRow>(
            `SELECT id, event_id, lookup_key, pin_required, revoked_at
             FROM public_access_credential
             WHERE lookup_key = $1
             LIMIT 1`,
            actor.publicLookupKey.trim()
          );

          if (!credRows.length || credRows[0]!.revoked_at !== null) {
            return this.recordAndReturnDenial(
              cleanEventId,
              cleanMediaId,
              actor.actorType,
              'INVALID_CREDENTIAL',
              'Public access credential is invalid or has been revoked',
              now
            );
          }

          const cred = credRows[0]!;
          if (cred.event_id !== cleanEventId) {
            return this.recordAndReturnDenial(
              cleanEventId,
              cleanMediaId,
              actor.actorType,
              'INVALID_CREDENTIAL',
              'Public credential does not belong to requested event',
              now
            );
          }
          if (cred.pin_required || rawEvent.pin_enabled) {
            return this.recordAndReturnDenial(
              cleanEventId,
              cleanMediaId,
              actor.actorType,
              'PIN_REQUIRED',
              'Event requires PIN validation before accessing media',
              now
            );
          }
        } else {
          if (rawEvent.pin_enabled) {
            return this.recordAndReturnDenial(
              cleanEventId,
              cleanMediaId,
              actor.actorType,
              'PIN_REQUIRED',
              'PIN validation required to access gallery',
              now
            );
          }
        }
      } else if (actor.actorType === 'ORGANIZER') {
        if (rawEvent.organizer_id !== actor.organizerAccountId) {
          return this.recordAndReturnDenial(
            cleanEventId,
            cleanMediaId,
            actor.actorType,
            'UNAUTHORIZED',
            'Organizer is not the owner of this event',
            now
          );
        }
      }

      // 3. Query Media Catalog
      const mediaRows = await tx.query<RawMediaCatalogRow>(
        `SELECT media_ref, event_ref, status, revision
         FROM media_catalog
         WHERE media_ref = $1 OR media_ref = $2
         LIMIT 1`,
        cleanMediaId,
        `media:${cleanMediaId}`
      );

      if (!mediaRows.length) {
        return this.recordAndReturnDenial(
          cleanEventId,
          cleanMediaId,
          actor.actorType,
          'MEDIA_NOT_FOUND',
          `Media '${cleanMediaId}' not found`,
          now
        );
      }

      const media = mediaRows[0]!;
      const eventRefs = [cleanEventId, `event:${cleanEventId}`];
      if (!eventRefs.includes(media.event_ref)) {
        return this.recordAndReturnDenial(
          cleanEventId,
          cleanMediaId,
          actor.actorType,
          'CROSS_EVENT_MISMATCH',
          'Media does not belong to requested event',
          now
        );
      }

      const currentRevision = BigInt(media.revision);

      // Check revision consistency if caller specified expectedRevision
      if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
        return this.recordAndReturnDenial(
          cleanEventId,
          cleanMediaId,
          actor.actorType,
          'MEDIA_UNAVAILABLE',
          `Media revision changed concurrently (expected: ${expectedRevision}, current: ${currentRevision})`,
          now,
          media.status,
          currentRevision
        );
      }

      // Check status rules
      if (actor.actorType === 'GUEST') {
        if (media.status !== 'PUBLISHED') {
          return this.recordAndReturnDenial(
            cleanEventId,
            cleanMediaId,
            actor.actorType,
            'MEDIA_UNAVAILABLE',
            `Media is in status '${media.status}' and not visible to guests`,
            now,
            media.status,
            currentRevision
          );
        }
      } else if (actor.actorType === 'ORGANIZER') {
        if (['DELETED', 'PURGED'].includes(media.status)) {
          return this.recordAndReturnDenial(
            cleanEventId,
            cleanMediaId,
            actor.actorType,
            'MEDIA_UNAVAILABLE',
            `Media is in status '${media.status}' and cannot be inspected`,
            now,
            media.status,
            currentRevision
          );
        }
        if (media.status === 'QUARANTINED') {
          return this.recordAndReturnDenial(
            cleanEventId,
            cleanMediaId,
            actor.actorType,
            'MEDIA_UNAVAILABLE',
            'Quarantined media is excluded from library viewing',
            now,
            media.status,
            currentRevision
          );
        }
      }

      return {
        isVisible: true,
        currentStatus: media.status,
        currentRevision
      };
    });
  }

  /**
   * Revalidates a list of media items in a batch.
   * Useful when refreshing gallery views or handling concurrent moderation updates.
   */
  public async revalidateBatchVisibility(
    command: RevalidateBatchVisibilityCommand
  ): Promise<BatchVisibilityResult> {
    if (!command || typeof command !== 'object') {
      throw new MediaGalleryError('INVALID_ARGUMENT', 'Command is required');
    }

    const { eventId, mediaIds, actor, now = new Date() } = command;

    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      throw new MediaGalleryError('INVALID_ARGUMENT', 'Valid eventId is required');
    }
    if (!Array.isArray(mediaIds)) {
      throw new MediaGalleryError('INVALID_ARGUMENT', 'mediaIds must be an array');
    }

    const visibleMediaIds: string[] = [];
    const withdrawnMediaIds: string[] = [];

    for (const mediaId of mediaIds) {
      const result = await this.revalidateMediaVisibility({
        eventId,
        mediaId,
        actor,
        now
      });

      if (result.isVisible) {
        visibleMediaIds.push(mediaId.replace(/^media:/, ''));
      } else {
        withdrawnMediaIds.push(mediaId.replace(/^media:/, ''));
      }
    }

    return {
      eventId: eventId.replace(/^event:/, ''),
      visibleMediaIds,
      withdrawnMediaIds
    };
  }

  /**
   * Asserts that a media item is visible, throwing MediaGalleryError if not.
   */
  public async assertVisible(
    command: RevalidateMediaVisibilityCommand
  ): Promise<MediaVisibilityResult> {
    const result = await this.revalidateMediaVisibility(command);
    if (!result.isVisible) {
      throw new MediaGalleryError(
        result.denialCode ?? 'MEDIA_UNAVAILABLE',
        result.denialReason ?? 'Media is not currently visible'
      );
    }
    return result;
  }

  private async recordAndReturnDenial(
    eventId: string,
    mediaId: string,
    actorType: string,
    denialCode: MediaGalleryDenialCode,
    denialReason: string,
    timestamp: Date,
    currentStatus?: string,
    currentRevision?: bigint
  ): Promise<MediaVisibilityResult> {
    if (this.auditSink) {
      await this.auditSink.record({
        id: randomUUID(),
        procedure: 'VISIBILITY_REVALIDATION_DENIED',
        eventId,
        mediaId,
        actorType,
        details: `${denialCode}: ${denialReason}`,
        timestamp
      });
    }

    return {
      isVisible: false,
      denialCode,
      denialReason,
      currentStatus,
      currentRevision
    };
  }
}
