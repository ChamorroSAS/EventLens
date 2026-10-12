import { Injectable } from '@angular/core';
import type {
  MediaStatusFilter,
  OrganizerMediaLibrarySnapshotModel,
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
}
