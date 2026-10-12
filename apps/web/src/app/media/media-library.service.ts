import { Injectable } from '@angular/core';
import type {
  MediaStatusFilter,
  OrganizerMediaLibrarySnapshotModel,
  EventModerationSettingsModel,
  EventModerationMode,
} from './media.types.js';

export interface QueryOrganizerMediaLibraryParams {
  eventRef: string;
  statusFilter?: MediaStatusFilter;
  limit?: number;
  offset?: number;
}

@Injectable({
  providedIn: 'root',
})
export class MediaLibraryService {
  async getOrganizerMediaLibrary(
    params: QueryOrganizerMediaLibraryParams
  ): Promise<OrganizerMediaLibrarySnapshotModel> {
    const searchParams = new URLSearchParams();
    if (params.statusFilter && params.statusFilter !== 'ALL') {
      searchParams.set('statusFilter', params.statusFilter);
    }
    if (params.limit !== undefined) {
      searchParams.set('limit', params.limit.toString());
    }
    if (params.offset !== undefined) {
      searchParams.set('offset', params.offset.toString());
    }

    const queryString = searchParams.toString();
    const endpoint = `/api/v1/events/${encodeURIComponent(params.eventRef)}/media${queryString ? `?${queryString}` : ''}`;
    const res = await fetch(endpoint);

    if (!res.ok) {
      if (res.status === 403) {
        throw new Error('ACCESS_DENIED');
      }
      if (res.status === 404) {
        throw new Error('EVENT_NOT_FOUND');
      }
      throw new Error('COMMUNICATION_ERROR');
    }

    return (await res.json()) as OrganizerMediaLibrarySnapshotModel;
  }

  async approveMedia(eventRef: string, mediaRef: string): Promise<{ status: string }> {
    const endpoint = `/api/v1/events/${encodeURIComponent(eventRef)}/media/${encodeURIComponent(mediaRef)}/approve`;
    const res = await fetch(endpoint, { method: 'POST' });
    if (!res.ok) {
      if (res.status === 409) throw new Error('CONCURRENCY_CONFLICT');
      if (res.status === 422) throw new Error('SAFETY_BLOCKED');
      if (res.status === 403) throw new Error('ACCESS_DENIED');
      throw new Error('COMMUNICATION_ERROR');
    }
    return (await res.json()) as { status: string };
  }

  async rejectMedia(eventRef: string, mediaRef: string, reason?: string): Promise<{ status: string }> {
    const endpoint = `/api/v1/events/${encodeURIComponent(eventRef)}/media/${encodeURIComponent(mediaRef)}/reject`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) {
      if (res.status === 409) throw new Error('CONCURRENCY_CONFLICT');
      if (res.status === 403) throw new Error('ACCESS_DENIED');
      throw new Error('COMMUNICATION_ERROR');
    }
    return (await res.json()) as { status: string };
  }

  async hideMedia(eventRef: string, mediaRef: string): Promise<{ status: string }> {
    const endpoint = `/api/v1/events/${encodeURIComponent(eventRef)}/media/${encodeURIComponent(mediaRef)}/hide`;
    const res = await fetch(endpoint, { method: 'POST' });
    if (!res.ok) {
      if (res.status === 409) throw new Error('CONCURRENCY_CONFLICT');
      if (res.status === 403) throw new Error('ACCESS_DENIED');
      throw new Error('COMMUNICATION_ERROR');
    }
    return (await res.json()) as { status: string };
  }

  async republishMedia(eventRef: string, mediaRef: string): Promise<{ status: string }> {
    const endpoint = `/api/v1/events/${encodeURIComponent(eventRef)}/media/${encodeURIComponent(mediaRef)}/republish`;
    const res = await fetch(endpoint, { method: 'POST' });
    if (!res.ok) {
      if (res.status === 409) throw new Error('CONCURRENCY_CONFLICT');
      if (res.status === 422) throw new Error('SAFETY_BLOCKED');
      if (res.status === 403) throw new Error('ACCESS_DENIED');
      throw new Error('COMMUNICATION_ERROR');
    }
    return (await res.json()) as { status: string };
  }

  async trashMedia(
    eventRef: string,
    mediaRef: string,
    reason?: string
  ): Promise<{ status: string; restoreDeadline: string }> {
    const endpoint = `/api/v1/events/${encodeURIComponent(eventRef)}/media/${encodeURIComponent(mediaRef)}/trash`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) {
      if (res.status === 409) throw new Error('CONCURRENCY_CONFLICT');
      if (res.status === 403) throw new Error('ACCESS_DENIED');
      throw new Error('COMMUNICATION_ERROR');
    }
    return (await res.json()) as { status: string; restoreDeadline: string };
  }

  async restoreMedia(eventRef: string, mediaRef: string): Promise<{ status: string }> {
    const endpoint = `/api/v1/events/${encodeURIComponent(eventRef)}/media/${encodeURIComponent(mediaRef)}/restore`;
    const res = await fetch(endpoint, { method: 'POST' });
    if (!res.ok) {
      if (res.status === 410) throw new Error('RESTORE_WINDOW_EXPIRED');
      if (res.status === 409) throw new Error('CONCURRENCY_CONFLICT');
      if (res.status === 422) throw new Error('SAFETY_BLOCKED');
      if (res.status === 403) throw new Error('ACCESS_DENIED');
      throw new Error('COMMUNICATION_ERROR');
    }
    return (await res.json()) as { status: string };
  }

  async getModerationSettings(eventRef: string): Promise<EventModerationSettingsModel> {
    const endpoint = `/api/v1/events/${encodeURIComponent(eventRef)}/moderation-settings`;
    const res = await fetch(endpoint);
    if (!res.ok) {
      if (res.status === 404) {
        return {
          eventRef,
          moderationMode: 'AUTO_PUBLISH',
          canChangeModerationMode: true,
        };
      }
      throw new Error('COMMUNICATION_ERROR');
    }
    return (await res.json()) as EventModerationSettingsModel;
  }

  async updateModerationMode(
    eventRef: string,
    moderationMode: EventModerationMode
  ): Promise<EventModerationSettingsModel> {
    const endpoint = `/api/v1/events/${encodeURIComponent(eventRef)}/moderation-settings`;
    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moderationMode }),
    });
    if (!res.ok) {
      if (res.status === 403) throw new Error('ACCESS_DENIED');
      throw new Error('COMMUNICATION_ERROR');
    }
    return (await res.json()) as EventModerationSettingsModel;
  }
}
