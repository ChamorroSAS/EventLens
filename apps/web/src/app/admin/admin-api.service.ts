import { Injectable } from '@angular/core';
import type {
  AdminSearchFilter,
  AdminSearchResult,
  AdminEventDetailSnapshot,
  AdminMediaPurpose,
  AdministrativeSupportMediaGrant,
  ExecuteInterventionPayload,
  ExecuteInterventionResult,
} from './admin.types.js';

@Injectable({
  providedIn: 'root',
})
export class AdminApiService {
  private readonly baseUrl = '/api/admin';

  async search(filter: AdminSearchFilter, callerActorId?: string): Promise<AdminSearchResult> {
    const params = new URLSearchParams();
    if (filter.query) params.set('query', filter.query);
    if (filter.entityType && filter.entityType !== 'ALL') params.set('entityType', filter.entityType);
    if (filter.status) params.set('status', filter.status);
    if (filter.page) params.set('page', String(filter.page));
    if (filter.limit) params.set('limit', String(filter.limit));

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (callerActorId) {
      headers['x-admin-actor-id'] = callerActorId;
    }

    const response = await fetch(`${this.baseUrl}/search?${params.toString()}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message || `Error searching: ${response.status}`);
    }

    return response.json() as Promise<AdminSearchResult>;
  }

  async getEventDetail(eventId: string, callerActorId?: string): Promise<AdminEventDetailSnapshot> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (callerActorId) {
      headers['x-admin-actor-id'] = callerActorId;
    }

    const response = await fetch(`${this.baseUrl}/events/${encodeURIComponent(eventId)}/aggregated-detail`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message || `Error loading event detail: ${response.status}`);
    }

    return response.json() as Promise<AdminEventDetailSnapshot>;
  }

  async requestMediaGrant(
    payload: {
      eventId: string;
      mediaId: string;
      purpose: AdminMediaPurpose;
      reason: string;
      preferredTarget?: 'PREVIEW' | 'DETAIL';
    },
    callerActorId?: string
  ): Promise<AdministrativeSupportMediaGrant> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (callerActorId) {
      headers['x-admin-actor-id'] = callerActorId;
    }

    const response = await fetch(`${this.baseUrl}/media/${encodeURIComponent(payload.mediaId)}/authorize-view`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message || `Error requesting media grant: ${response.status}`);
    }

    return response.json() as Promise<AdministrativeSupportMediaGrant>;
  }

  async executeIntervention(
    eventId: string,
    payload: ExecuteInterventionPayload,
    callerActorId?: string
  ): Promise<ExecuteInterventionResult> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (callerActorId) {
      headers['x-admin-actor-id'] = callerActorId;
    }

    const response = await fetch(`${this.baseUrl}/events/${encodeURIComponent(eventId)}/interventions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message || `Error executing intervention: ${response.status}`);
    }

    return response.json() as Promise<ExecuteInterventionResult>;
  }
}
