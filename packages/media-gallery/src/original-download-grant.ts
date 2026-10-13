import { randomUUID } from 'node:crypto';
import {
  MediaGalleryError,
  type MediaGalleryAuditSink,
  type ObjectStorageDownloadSigner,
  type OriginalDownloadGrant,
  type RequestOriginalDownloadGrantCommand,
  type TransactionRunner
} from './contracts.js';

interface RawEventOwnerRow {
  status: string;
  organizer_id: string;
}

interface RawOriginalMediaRow {
  media_ref: string;
  event_ref: string;
  generation: bigint | number | string;
  status: string;
  original: unknown;
}

const BLOCKED_EVENT_STATUSES = ['SUSPENDED', 'PENDING_DELETION', 'ARCHIVED', 'DELETED'];
// Allowlist: only states that hold an inspected, owner-visible original (DEC-075).
const DOWNLOADABLE_MEDIA_STATUSES = ['READY', 'PUBLISHED', 'HIDDEN', 'PENDING_REVIEW', 'PROCESSING_FAILED'];

function sanitizeFileName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/[\\/\r\n"\0]/g, '_').trim();
  return cleaned ? cleaned.slice(0, 200) : undefined;
}

export class OriginalDownloadGrantService {
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
   * Authorizes a temporary download of the exact original of one media (EL-TK-124).
   * Owner-only; security must be APPROVED (DEC-075); never returns permanent URLs.
   * Neither the URL nor the storage key is written to the audit trail.
   */
  public async requestOriginalDownloadGrant(
    command: RequestOriginalDownloadGrantCommand
  ): Promise<OriginalDownloadGrant> {
    if (!command || typeof command !== 'object') {
      throw new MediaGalleryError('INVALID_ARGUMENT', 'Command is required');
    }
    const { eventId, mediaId, organizerAccountId, ttlSeconds, now = new Date() } = command;
    if (typeof eventId !== 'string' || !eventId.trim()) {
      throw new MediaGalleryError('INVALID_ARGUMENT', 'Valid eventId is required');
    }
    if (typeof mediaId !== 'string' || !mediaId.trim()) {
      throw new MediaGalleryError('INVALID_ARGUMENT', 'Valid mediaId is required');
    }
    if (typeof organizerAccountId !== 'string' || !organizerAccountId.trim()) {
      throw new MediaGalleryError('INVALID_ARGUMENT', 'Valid organizerAccountId is required');
    }

    const cleanEventId = eventId.trim().replace(/^event:/, '');
    const cleanMediaId = mediaId.trim().replace(/^media:/, '');
    const effectiveTtl = Math.min(Math.max(Number(ttlSeconds) || 900, 60), 3600);

    return this.runner.run(async (tx) => {
      const eventRows = await tx.query<RawEventOwnerRow>(
        'SELECT status, organizer_id FROM event WHERE id = $1 LIMIT 1',
        cleanEventId
      );
      // Missing event and foreign owner are indistinguishable to the caller.
      if (!eventRows.length || String(eventRows[0]!.organizer_id) !== organizerAccountId.trim()) {
        throw new MediaGalleryError('UNAUTHORIZED', 'Actor is not the owner of this event');
      }
      if (BLOCKED_EVENT_STATUSES.includes(eventRows[0]!.status)) {
        throw new MediaGalleryError('MEDIA_UNAVAILABLE', 'Event state does not allow original downloads');
      }

      const mediaRows = await tx.query<RawOriginalMediaRow>(
        `SELECT media_ref, event_ref, generation, status, original
         FROM media_catalog
         WHERE (media_ref = $1 OR media_ref = $2) AND (event_ref = $3 OR event_ref = $4)
         LIMIT 1`,
        cleanMediaId,
        `media:${cleanMediaId}`,
        cleanEventId,
        `event:${cleanEventId}`
      );
      if (!mediaRows.length) {
        throw new MediaGalleryError('MEDIA_NOT_FOUND', 'Media not found');
      }
      const media = mediaRows[0]!;

      if (!DOWNLOADABLE_MEDIA_STATUSES.includes(media.status)) {
        throw new MediaGalleryError('MEDIA_UNAVAILABLE', 'Media state does not allow original download');
      }

      const factRows = await tx.query<{ fact: unknown }>(
        'SELECT fact FROM media_inspection WHERE media_ref = $1 AND generation = $2::bigint LIMIT 1',
        media.media_ref,
        media.generation
      );
      const rawFact = factRows[0]?.fact;
      const fact = typeof rawFact === 'string' ? JSON.parse(rawFact) : (rawFact as { outcome?: string } | undefined);
      if (fact?.outcome !== 'APPROVED') {
        throw new MediaGalleryError('MEDIA_UNAVAILABLE', 'Security inspection is not approved');
      }

      const original = (typeof media.original === 'string' ? JSON.parse(media.original) : media.original) as
        | { namespace?: string; key?: string; fileName?: string; name?: string }
        | null;
      if (!original || !original.namespace || !original.key) {
        throw new MediaGalleryError('MEDIA_UNAVAILABLE', 'Original object is not available');
      }

      let downloadUrl: string;
      try {
        downloadUrl = await this.signer.createDownloadUrl({
          namespace: original.namespace,
          key: original.key,
          ttlSeconds: effectiveTtl,
          forceDownload: true,
          fileName: sanitizeFileName(original.fileName ?? original.name)
        });
      } catch {
        throw new MediaGalleryError('TEMPORARY_FAILURE', 'Storage could not authorize the download');
      }

      if (this.auditSink) {
        await this.auditSink.record({
          id: randomUUID(),
          procedure: 'ORIGINAL_DOWNLOAD_GRANT_ISSUED',
          eventId: cleanEventId,
          mediaId: cleanMediaId,
          actorType: 'ORGANIZER',
          timestamp: now
        });
      }

      return {
        grantId: randomUUID(),
        eventId: cleanEventId,
        mediaId: cleanMediaId,
        downloadUrl,
        expiresAt: new Date(now.getTime() + effectiveTtl * 1000).toISOString(),
        ttlSeconds: effectiveTtl,
        securityStatus: 'APPROVED'
      };
    });
  }
}
