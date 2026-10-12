import { createHash, randomUUID } from 'node:crypto';
import { EventAccessPolicy, type EventRecord, type EventStatus } from '@eventlens/event-management';
import {
  MediaGalleryError,
  type GuestGallerySnapshot,
  type GuestGalleryStatus,
  type GalleryMediaSummary,
  type GalleryMediaThumbnail,
  type QueryGuestGalleryCommand,
  type MediaGalleryAuditSink,
  type TransactionRunner
} from './contracts.js';

interface RawEventRow {
  id: string;
  name: string;
  status: string;
  timezone: string;
  organizer_id: string;
  guest_gallery_enabled: boolean;
  uploads_enabled: boolean;
  pin_enabled: boolean;
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

interface RawMediaCatalogRow {
  media_ref: string;
  event_ref: string;
  status: string;
  original: unknown;
  published_at: Date | string;
  thumbnail_ref: unknown;
}

function parseCursor(cursorString?: string): { committedAt: Date; mediaRef: string } | null {
  if (!cursorString || typeof cursorString !== 'string') return null;
  try {
    const decoded = Buffer.from(cursorString, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== 'object') return null;
    const date = new Date(parsed.t);
    if (Number.isNaN(date.getTime()) || typeof parsed.m !== 'string' || !parsed.m) return null;
    return { committedAt: date, mediaRef: parsed.m };
  } catch {
    return null;
  }
}

function encodeCursor(committedAt: Date, mediaRef: string): string {
  const payload = JSON.stringify({ t: committedAt.toISOString(), m: mediaRef });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export class GuestGalleryService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly auditSink?: MediaGalleryAuditSink
  ) {
    if (!runner) {
      throw new MediaGalleryError('INVALID_ARGUMENT', 'TransactionRunner is required');
    }
  }

  /**
   * Queries the published guest gallery for an event (EL-TK-096).
   * - Enforces server-side lifecycle & guest gallery visibility policies.
   * - Isolates strictly to PUBLISHED media within the specified event.
   * - Provides deterministic, duplicate-free pagination.
   * - Distinguishes EMPTY_GALLERY from GALLERY_DISABLED.
   */
  public async queryGuestGallery(
    command: QueryGuestGalleryCommand
  ): Promise<GuestGallerySnapshot> {
    if (!command || typeof command !== 'object') {
      throw new MediaGalleryError('INVALID_ARGUMENT', 'Command is required');
    }

    const { eventId, guestSessionToken, publicLookupKey, cursor, limit, now = new Date() } = command;

    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      throw new MediaGalleryError('INVALID_ARGUMENT', 'Valid eventId is required');
    }

    const cleanEventId = eventId.trim().replace(/^event:/, '');
    const eventRefs = [cleanEventId, `event:${cleanEventId}`];
    const effectiveLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

    return this.runner.run(async (tx) => {
      // 1. Fetch Event Record
      const eventRows = await tx.query<RawEventRow>(
        `SELECT
           id, name, status, timezone, organizer_id, guest_gallery_enabled, uploads_enabled,
           pin_enabled, starts_at_local, scheduled_at, expires_at, grace_ends_at, activated_at,
           closed_at, purge_started_at, suspended_at, suspension_reason, previous_status,
           validity_duration_days, grace_days, moderation_mode
         FROM event
         WHERE id = $1
         LIMIT 1`,
        cleanEventId
      );

      if (!eventRows.length) {
        throw new MediaGalleryError('EVENT_NOT_FOUND', `Event '${cleanEventId}' not found`);
      }

      const rawEvent = eventRows[0]!;

      // Guard terminal events fail closed
      if (['PENDING_DELETION', 'ARCHIVED', 'DELETED'].includes(rawEvent.status)) {
        throw new MediaGalleryError(
          'EVENT_NOT_FOUND',
          `Event is in terminal status '${rawEvent.status}' and not accessible`
        );
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

      // 2. Evaluate Lifecycle Policy for Guest Gallery
      const lifecycleDecision = EventAccessPolicy.evaluate({
        event: eventRecord,
        action: 'GUEST_VIEW_GALLERY',
        actorContext: { actorType: 'GUEST_ANONYMOUS' }
      });

      // If gallery is disabled by flag or lifecycle (e.g. SCHEDULED, SUSPENDED, guestGalleryEnabled: false)
      if (!lifecycleDecision.allowed || !rawEvent.guest_gallery_enabled) {
        return {
          eventId: cleanEventId,
          eventName: rawEvent.name,
          status: 'GALLERY_DISABLED',
          items: [],
          pagination: {
            cursor,
            hasMore: false,
            limit: effectiveLimit
          },
          capabilities: {
            canViewGallery: false,
            canUpload: Boolean(rawEvent.uploads_enabled) && rawEvent.status === 'ACTIVE'
          }
        };
      }

      // 3. Validate Guest Credential / Session Access
      if (guestSessionToken && typeof guestSessionToken === 'string') {
        const tokenHash = createHash('sha256').update(guestSessionToken.trim()).digest('hex');
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

        // Cross-event mismatch check
        if (session.event_id !== cleanEventId) {
          throw new MediaGalleryError(
            'INVALID_CREDENTIAL',
            'Session does not belong to requested event'
          );
        }

        if (session.revoked_at !== null) {
          throw new MediaGalleryError('ACCESS_REVOKED', 'Guest session has been revoked');
        }

        const sessionExpiry = new Date(session.expires_at);
        if (sessionExpiry.getTime() <= now.getTime()) {
          throw new MediaGalleryError('SESSION_EXPIRED', 'Guest session has expired');
        }
      } else if (publicLookupKey && typeof publicLookupKey === 'string') {
        const credRows = await tx.query<RawPublicCredentialRow>(
          `SELECT id, event_id, lookup_key, pin_required, revoked_at
           FROM public_access_credential
           WHERE lookup_key = $1
           LIMIT 1`,
          publicLookupKey.trim()
        );

        if (!credRows.length || credRows[0]!.revoked_at !== null) {
          throw new MediaGalleryError(
            'INVALID_CREDENTIAL',
            'Public credential is invalid or has been revoked'
          );
        }

        const cred = credRows[0]!;
        if (cred.event_id !== cleanEventId) {
          throw new MediaGalleryError(
            'INVALID_CREDENTIAL',
            'Public credential does not belong to requested event'
          );
        }

        if (cred.pin_required || rawEvent.pin_enabled) {
          throw new MediaGalleryError(
            'PIN_REQUIRED',
            'Event requires PIN validation before accessing private media gallery'
          );
        }
      } else {
        // Neither session token nor lookup key provided
        if (rawEvent.pin_enabled) {
          throw new MediaGalleryError(
            'PIN_REQUIRED',
            'PIN validation is required to access guest gallery'
          );
        }

        // Check if there is at least one active, non-revoked public credential for this event
        const activeCreds = await tx.query<{ id: string }>(
          `SELECT id FROM public_access_credential
           WHERE event_id = $1 AND revoked_at IS NULL AND pin_required = false
           LIMIT 1`,
          cleanEventId
        );

        if (!activeCreds.length) {
          throw new MediaGalleryError(
            'INVALID_CREDENTIAL',
            'No active public access credential available for this event'
          );
        }
      }

      // 4. Query Published Media with Stable Cursor Pagination
      const parsed = parseCursor(cursor);
      const queryParams: unknown[] = [cleanEventId, `event:${cleanEventId}`];
      let cursorFilter = '';

      if (parsed) {
        queryParams.push(parsed.committedAt.toISOString(), parsed.mediaRef);
        cursorFilter = `
          AND (
            COALESCE(r.committed_at, NOW()) < $3::timestamptz
            OR (COALESCE(r.committed_at, NOW()) = $3::timestamptz AND m.media_ref < $4)
          )
        `;
      }

      queryParams.push(effectiveLimit + 1);
      const limitParamIndex = queryParams.length;

      const mediaRows = await tx.query<RawMediaCatalogRow>(
        `SELECT
           m.media_ref,
           m.event_ref,
           m.status,
           m.original,
           COALESCE(r.committed_at, NOW()) AS published_at,
           d.reference AS thumbnail_ref
         FROM media_catalog m
         LEFT JOIN media_promotion_receipt r
           ON r.media_ref = m.media_ref AND r.status = 'PUBLISHED'
         LEFT JOIN media_active_derivative d
           ON d.media_ref = m.media_ref AND d.role = 'THUMBNAIL'
         WHERE (m.event_ref = $1 OR m.event_ref = $2)
           AND m.status = 'PUBLISHED'
           ${cursorFilter}
         ORDER BY COALESCE(r.committed_at, NOW()) DESC, m.media_ref DESC
         LIMIT $${limitParamIndex}`,
        ...queryParams
      );

      const hasMore = mediaRows.length > effectiveLimit;
      const returnedRows = hasMore ? mediaRows.slice(0, effectiveLimit) : mediaRows;

      const items: GalleryMediaSummary[] = returnedRows.map((row) => {
        const cleanMediaId = row.media_ref.replace(/^media:/, '');
        const originalObj = typeof row.original === 'string'
          ? JSON.parse(row.original)
          : (row.original as any) || {};

        const mediaType: 'PHOTO' | 'VIDEO' =
          originalObj.mediaType === 'VIDEO' ||
          (typeof originalObj.mimeType === 'string' && originalObj.mimeType.startsWith('video/')) ||
          (typeof originalObj.format === 'string' && ['mp4', 'mov', 'webm', 'video'].includes(originalObj.format.toLowerCase()))
            ? 'VIDEO'
            : 'PHOTO';

        let thumbnail: GalleryMediaThumbnail | undefined;
        if (row.thumbnail_ref) {
          const thumbObj = typeof row.thumbnail_ref === 'string'
            ? JSON.parse(row.thumbnail_ref)
            : (row.thumbnail_ref as any);

          thumbnail = {
            role: 'THUMBNAIL',
            width: thumbObj.width,
            height: thumbObj.height,
            format: thumbObj.format,
            bytes: thumbObj.bytes
          };
        }

        const publishedDate = new Date(row.published_at);
        const publishedAt = Number.isNaN(publishedDate.getTime())
          ? now.toISOString()
          : publishedDate.toISOString();

        return {
          mediaId: cleanMediaId,
          mediaType,
          publishedAt,
          thumbnail,
          durationSeconds: originalObj.durationSeconds ?? originalObj.duration,
          aspectRatio: originalObj.aspectRatio
        };
      });

      let nextCursor: string | undefined;
      if (hasMore && returnedRows.length > 0) {
        const lastRow = returnedRows[returnedRows.length - 1]!;
        const lastDate = new Date(lastRow.published_at);
        nextCursor = encodeCursor(
          Number.isNaN(lastDate.getTime()) ? now : lastDate,
          lastRow.media_ref
        );
      }

      // Distinguish EMPTY_GALLERY vs ACTIVE
      const status: GuestGalleryStatus =
        items.length === 0 && !cursor ? 'EMPTY_GALLERY' : 'ACTIVE';

      if (this.auditSink) {
        await this.auditSink.record({
          id: randomUUID(),
          procedure: 'GUEST_GALLERY_QUERY',
          eventId: cleanEventId,
          itemCount: items.length,
          timestamp: now
        });
      }

      return {
        eventId: cleanEventId,
        eventName: rawEvent.name,
        status,
        items,
        pagination: {
          cursor,
          hasMore,
          limit: effectiveLimit,
          nextCursor
        },
        capabilities: {
          canViewGallery: true,
          canUpload: Boolean(rawEvent.uploads_enabled) && rawEvent.status === 'ACTIVE'
        }
      };
    });
  }
}
