import { createHash, randomUUID } from 'node:crypto';
import { EventAccessPolicy, type EventRecord, type EventStatus } from '@eventlens/event-management';
import {
  MediaGalleryError,
  type MediaViewGrant,
  type RequestMediaViewGrantCommand,
  type ObjectStorageDownloadSigner,
  type MediaGalleryAuditSink,
  type TransactionRunner,
  type DerivativeRole
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

interface RawMediaRow {
  media_ref: string;
  event_ref: string;
  status: string;
  original: unknown;
}

interface RawDerivativeRow {
  role: string;
  reference: unknown;
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

export class MediaViewGrantService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly signer: ObjectStorageDownloadSigner,
    private readonly auditSink?: MediaGalleryAuditSink
  ) {
    if (!runner) {
      throw new MediaGalleryError('INVALID_ARGUMENT', 'TransactionRunner is required');
    }
    if (!signer) {
      throw new MediaGalleryError('INVALID_ARGUMENT', 'ObjectStorageDownloadSigner is required');
    }
  }

  /**
   * Authorizes temporary viewing of a private derivative (EL-TK-097).
   * - Enforces server-side revalidation of actor, event, visibility, lifecycle, and media state.
   * - Prevents direct access to original media for guests (DEC-013, DEC-018).
   * - Restricts access to private storage via short-lived pre-signed URLs (DEC-063).
   * - Denies revoked sessions, withdrawn media, and mismatched events.
   */
  public async requestViewGrant(
    command: RequestMediaViewGrantCommand
  ): Promise<MediaViewGrant> {
    if (!command || typeof command !== 'object') {
      throw new MediaGalleryError('INVALID_ARGUMENT', 'Command is required');
    }

    const { eventId, mediaId, actor, preferredRole, ttlSeconds, now = new Date() } = command;

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
    const effectiveTtl = Math.min(Math.max(Number(ttlSeconds) || 900, 60), 3600);

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
        throw new MediaGalleryError('EVENT_NOT_FOUND', `Event '${cleanEventId}' not found`);
      }

      const rawEvent = eventRows[0]!;

      if (['PENDING_DELETION', 'ARCHIVED', 'DELETED'].includes(rawEvent.status)) {
        throw new MediaGalleryError(
          'EVENT_NOT_FOUND',
          `Event is in terminal status '${rawEvent.status}' and not accessible`
        );
      }

      // 2. Fetch Media Catalog Entry
      const mediaRows = await tx.query<RawMediaRow>(
        `SELECT media_ref, event_ref, status, original
         FROM media_catalog
         WHERE media_ref = $1 OR media_ref = $2
         LIMIT 1`,
        cleanMediaId,
        `media:${cleanMediaId}`
      );

      if (!mediaRows.length) {
        throw new MediaGalleryError('MEDIA_NOT_FOUND', `Media '${cleanMediaId}' not found`);
      }

      const media = mediaRows[0]!;

      // Cross-event mismatch check
      const eventRefs = [cleanEventId, `event:${cleanEventId}`];
      if (!eventRefs.includes(media.event_ref)) {
        throw new MediaGalleryError(
          'CROSS_EVENT_MISMATCH',
          `Media '${cleanMediaId}' does not belong to event '${cleanEventId}'`
        );
      }

      // 3. Actor Validation & Permissions
      if (actor.actorType === 'GUEST') {
        // Guests can ONLY view PUBLISHED media
        if (media.status !== 'PUBLISHED') {
          throw new MediaGalleryError(
            'MEDIA_UNAVAILABLE',
            `Media in status '${media.status}' is not viewable by guests`
          );
        }

        // Validate event guest gallery permission
        if (!rawEvent.guest_gallery_enabled) {
          throw new MediaGalleryError('GALLERY_DISABLED', 'Guest gallery is disabled for this event');
        }

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

        const decision = EventAccessPolicy.evaluate({
          event: eventRecord,
          action: 'GUEST_VIEW_GALLERY',
          actorContext: { actorType: 'GUEST_ANONYMOUS' }
        });

        if (!decision.allowed) {
          throw new MediaGalleryError('GALLERY_DISABLED', decision.reason);
        }

        // Validate guest session or credential
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
            throw new MediaGalleryError('INVALID_CREDENTIAL', 'Guest session not found');
          }

          const session = sessionRows[0]!;
          if (session.event_id !== cleanEventId) {
            throw new MediaGalleryError('INVALID_CREDENTIAL', 'Session does not belong to requested event');
          }
          if (session.revoked_at !== null) {
            throw new MediaGalleryError('ACCESS_REVOKED', 'Guest session has been revoked');
          }
          if (new Date(session.expires_at).getTime() <= now.getTime()) {
            throw new MediaGalleryError('SESSION_EXPIRED', 'Guest session has expired');
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
            throw new MediaGalleryError('INVALID_CREDENTIAL', 'Public credential is invalid or has been revoked');
          }

          const cred = credRows[0]!;
          if (cred.event_id !== cleanEventId) {
            throw new MediaGalleryError('INVALID_CREDENTIAL', 'Public credential does not belong to requested event');
          }
          if (cred.pin_required || rawEvent.pin_enabled) {
            throw new MediaGalleryError('PIN_REQUIRED', 'Event requires PIN validation before viewing media');
          }
        } else {
          if (rawEvent.pin_enabled) {
            throw new MediaGalleryError('PIN_REQUIRED', 'PIN validation required to view media');
          }
        }
      } else if (actor.actorType === 'ORGANIZER') {
        // Organizer must own the event
        if (rawEvent.organizer_id !== actor.organizerAccountId) {
          throw new MediaGalleryError('UNAUTHORIZED', 'Actor is not the owner of this event');
        }

        // Deleted or purged media cannot be viewed
        if (['DELETED', 'PURGED'].includes(media.status)) {
          throw new MediaGalleryError(
            'MEDIA_UNAVAILABLE',
            `Media is in status '${media.status}' and cannot be viewed`
          );
        }

        // Quarantined media cannot have public/ordinary view grants
        if (media.status === 'QUARANTINED') {
          throw new MediaGalleryError(
            'MEDIA_UNAVAILABLE',
            'Quarantined media derivatives are barred from ordinary library viewing'
          );
        }
      } else {
        throw new MediaGalleryError('UNAUTHORIZED', 'Unrecognized actor type');
      }

      // 4. Fetch Active Derivatives
      const derivativeRows = await tx.query<RawDerivativeRow>(
        `SELECT role, reference
         FROM media_active_derivative
         WHERE media_ref = $1 OR media_ref = $2`,
        cleanMediaId,
        `media:${cleanMediaId}`
      );

      if (!derivativeRows.length) {
        throw new MediaGalleryError(
          'DERIVATIVE_NOT_READY',
          `No active derivative available for media '${cleanMediaId}'`
        );
      }

      // Resolve requested role
      let selectedRow: RawDerivativeRow | undefined;
      if (preferredRole) {
        selectedRow = derivativeRows.find((d) => d.role === preferredRole);
      }

      if (!selectedRow) {
        selectedRow =
          derivativeRows.find((d) => d.role === 'PREVIEW') ??
          derivativeRows.find((d) => d.role === 'PLAYBACK') ??
          derivativeRows.find((d) => d.role === 'THUMBNAIL');
      }

      if (!selectedRow) {
        throw new MediaGalleryError(
          'DERIVATIVE_NOT_READY',
          `Requested derivative role '${preferredRole}' is not available`
        );
      }

      const ref = typeof selectedRow.reference === 'string'
        ? JSON.parse(selectedRow.reference)
        : (selectedRow.reference as any);

      if (!ref || !ref.namespace || !ref.key) {
        throw new MediaGalleryError(
          'DERIVATIVE_NOT_READY',
          'Derivative reference is missing storage namespace or key'
        );
      }

      // 5. Generate Pre-signed Download URL via Storage Port
      const downloadUrl = await this.signer.createDownloadUrl({
        namespace: ref.namespace,
        key: ref.key,
        ttlSeconds: effectiveTtl
      });

      const originalObj = typeof media.original === 'string'
        ? JSON.parse(media.original)
        : (media.original as any) || {};

      const mediaType: 'PHOTO' | 'VIDEO' =
        originalObj.mediaType === 'VIDEO' ||
        (typeof originalObj.mimeType === 'string' && originalObj.mimeType.startsWith('video/')) ||
        (typeof originalObj.format === 'string' && ['mp4', 'mov', 'webm'].includes(originalObj.format.toLowerCase()))
          ? 'VIDEO'
          : 'PHOTO';

      const grantId = randomUUID();
      const expiresAt = new Date(now.getTime() + effectiveTtl * 1000).toISOString();

      if (this.auditSink) {
        await this.auditSink.record({
          id: randomUUID(),
          procedure: 'MEDIA_VIEW_GRANT_ISSUED',
          eventId: cleanEventId,
          mediaId: cleanMediaId,
          role: selectedRow.role,
          actorType: actor.actorType,
          timestamp: now
        });
      }

      return {
        grantId,
        eventId: cleanEventId,
        mediaId: cleanMediaId,
        role: selectedRow.role as DerivativeRole,
        mediaType,
        downloadUrl,
        expiresAt,
        ttlSeconds: effectiveTtl
      };
    });
  }
}
