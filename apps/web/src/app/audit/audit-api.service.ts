import { Injectable } from '@angular/core';
import type { AuditEventPage, AuditQueryFilters } from './audit.types.js';

export interface AuditQueryParams {
  filters?: AuditQueryFilters;
  page?: number;
  limit?: number;
  callerActorId?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuditApiService {
  async queryAuditEvents(params: AuditQueryParams = {}): Promise<AuditEventPage> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.filters?.resourceType) query.set('resourceType', params.filters.resourceType);
    if (params.filters?.resourceId) query.set('resourceId', params.filters.resourceId);
    if (params.filters?.action) query.set('action', params.filters.action);
    if (params.filters?.actorType) query.set('actorType', params.filters.actorType);
    if (params.filters?.actorId) query.set('actorId', params.filters.actorId);
    if (params.filters?.result) query.set('result', params.filters.result);
    if (params.filters?.fromTimestamp) query.set('fromTimestamp', params.filters.fromTimestamp);
    if (params.filters?.toTimestamp) query.set('toTimestamp', params.filters.toTimestamp);

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (params.callerActorId) {
      headers['X-Admin-Actor-Id'] = params.callerActorId;
    }

    const url = `/api/v1/admin/audit/events${query.toString() ? '?' + query.toString() : ''}`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('UNAUTHORIZED_ACCESS');
      }
      if (res.status === 400) {
        throw new Error('INVALID_QUERY');
      }
      throw new Error('COMMUNICATION_ERROR');
    }

    return (await res.json()) as AuditEventPage;
  }
}
