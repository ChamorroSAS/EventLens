import { Injectable } from '@angular/core';
import { createEventLensClient } from '@eventlens/api-client';
import { AdminSessionService } from './admin-session.service.js';
import type {
  AdminReadOnlyEventDetail,
  AdminReadOnlyResult,
  AdminReadOnlySearchFilter,
  AdminReadOnlySearchResponse
} from './admin-read-only.types.js';

@Injectable({ providedIn: 'root' })
export class AdminReadOnlyApiService {
  private readonly client = createEventLensClient();
  private cacheGeneration = 0;
  private searchGeneration = 0;
  private detailGeneration = 0;

  constructor(private readonly session: AdminSessionService) {
    session.registerPrivateCacheClearer(() => { this.cacheGeneration++; });
  }

  async search(filter: AdminReadOnlySearchFilter): Promise<AdminReadOnlyResult<AdminReadOnlySearchResponse>> {
    const cache = this.cacheGeneration;
    const generation = ++this.searchGeneration;
    const current = () => cache === this.cacheGeneration && generation === this.searchGeneration;
    try {
      const { data, response } = await this.client.GET('/api/v1/admin/search', {
        params: { query: filter }
      });
      if (!current()) return { ok: false, status: 0, kind: 'CANCELLED' };
      if (response.ok && data) return { ok: true, data };
      return this.failure(response.status);
    } catch {
      if (!current()) return { ok: false, status: 0, kind: 'CANCELLED' };
      return this.failure(503);
    }
  }

  async eventDetail(eventId: string): Promise<AdminReadOnlyResult<AdminReadOnlyEventDetail>> {
    const cache = this.cacheGeneration;
    const generation = ++this.detailGeneration;
    const current = () => cache === this.cacheGeneration && generation === this.detailGeneration;
    try {
      const { data, response } = await this.client.GET('/api/v1/admin/events/{eventId}/aggregated-detail', {
        params: { path: { eventId } }
      });
      if (!current()) return { ok: false, status: 0, kind: 'CANCELLED' };
      if (response.ok && data) return { ok: true, data };
      return this.failure(response.status);
    } catch {
      if (!current()) return { ok: false, status: 0, kind: 'CANCELLED' };
      return this.failure(503);
    }
  }

  private failure(status: number): Extract<AdminReadOnlyResult<never>, { readonly ok: false }> {
    if (status === 401 || status === 403 || status === 503) {
      this.session.invalidateProtectedRead(status);
    }
    if (status === 401) return { ok: false, status, kind: 'UNAUTHORIZED' };
    if (status === 403) return { ok: false, status, kind: 'FORBIDDEN' };
    if (status === 404) return { ok: false, status, kind: 'NOT_FOUND' };
    if (status === 503) return { ok: false, status, kind: 'UNAVAILABLE' };
    return { ok: false, status, kind: 'INVALID' };
  }
}
