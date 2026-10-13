import { Injectable } from '@angular/core';
import type {
  GallerySnapshot,
  MediaViewGrant,
  FetchGalleryOptions,
  RequestGrantOptions,
  SubmitReportPayload,
  SubmitReportResult
} from './gallery.types.js';

@Injectable({
  providedIn: 'root'
})
export class GalleryService {
  /**
   * Fetches an authorized page of the guest gallery (EL-TK-096).
   */
  public async getGallerySnapshot(options: FetchGalleryOptions): Promise<GallerySnapshot> {
    const params = new URLSearchParams();
    params.set('eventId', options.eventId);
    if (options.cursor) {
      params.set('cursor', options.cursor);
    }
    if (options.limit) {
      params.set('limit', String(options.limit));
    }

    const headers: Record<string, string> = {
      'Accept': 'application/json'
    };
    if (options.guestSessionToken) {
      headers['X-Guest-Session'] = options.guestSessionToken;
    }
    if (options.publicLookupKey) {
      headers['X-Public-Key'] = options.publicLookupKey;
    }

    const res = await fetch(`/api/v1/gallery?${params.toString()}`, {
      method: 'GET',
      headers
    });

    if (!res.ok) {
      if (res.status === 403) {
        throw new Error('GALLERY_DISABLED');
      }
      if (res.status === 401) {
        throw new Error('ACCESS_REVOKED');
      }
      if (res.status === 404) {
        throw new Error('EVENT_NOT_FOUND');
      }
      throw new Error('COMMUNICATION_ERROR');
    }

    return (await res.json()) as GallerySnapshot;
  }

  /**
   * Requests a temporary signed view grant for a private derivative (EL-TK-097 / EL-TK-101).
   */
  public async requestViewGrant(options: RequestGrantOptions): Promise<MediaViewGrant> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (options.guestSessionToken) {
      headers['X-Guest-Session'] = options.guestSessionToken;
    }
    if (options.publicLookupKey) {
      headers['X-Public-Key'] = options.publicLookupKey;
    }

    const res = await fetch(`/api/v1/gallery/view-grant`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        eventId: options.eventId,
        mediaId: options.mediaId,
        role: options.role
      })
    });

    if (!res.ok) {
      if (res.status === 404 || res.status === 410) {
        throw new Error('MEDIA_UNAVAILABLE');
      }
      if (res.status === 403) {
        throw new Error('ACCESS_REVOKED');
      }
      if (res.status === 401) {
        throw new Error('SESSION_EXPIRED');
      }
      throw new Error('COMMUNICATION_ERROR');
    }

    return (await res.json()) as MediaViewGrant;
  }

  /**
   * Submits a report for a media item (EL-TK-113 / EL-TK-121).
   * Note: Receipt does NOT auto-hide content (DEC-088).
   */
  public async submitReport(payload: SubmitReportPayload): Promise<SubmitReportResult> {
    const res = await fetch(`/api/v1/gallery/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      if (res.status === 429) {
        throw new Error('RATE_LIMIT_EXCEEDED');
      }
      if (res.status === 400) {
        throw new Error('INVALID_ARGUMENT');
      }
      throw new Error('COMMUNICATION_ERROR');
    }

    return (await res.json()) as SubmitReportResult;
  }
}
