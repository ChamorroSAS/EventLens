import { Injectable, inject } from '@angular/core';
import { createEventLensClient } from '@eventlens/api-client';
import { OrganizerSessionService } from '../organizer-session.service.js';
import type { OrganizerEventModel, EventConfigurationModel } from './organizer.types.js';
import type { operations } from '@eventlens/api-client';

export type OrganizerLifecycleSnapshot = operations['getOrganizerEventLifecycle']['responses'][200]['content']['application/json'];
export type OrganizerShareSnapshot = operations['getEventShareAccessSnapshot']['responses'][200]['content']['application/json'];

@Injectable({
  providedIn: 'root'
})
export class OrganizerService {
  private readonly client = createEventLensClient({
    baseUrl: typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null'
      ? window.location.origin
      : 'http://localhost:4200'
  });
  private readonly sessionService = inject(OrganizerSessionService, { optional: true });

  async setEventParticipation(params: {
    eventId: string; uploadsEnabled: boolean; guestGalleryEnabled: boolean; expectedRevision: string; idempotencyKey: string;
  }): Promise<{ eventId: string; outcome: 'UPDATED' | 'IDEMPOTENT_REPLAY' }> {
    const csrfToken = this.sessionService?.getCsrfToken() ?? '';
    const { data, response, error } = await this.client.PUT('/api/v1/events/{eventId}/configuration/participation', {
      params: { path: { eventId: params.eventId }, header: { 'Idempotency-Key': params.idempotencyKey, 'X-CSRF-Token': csrfToken } },
      body: { uploadsEnabled: params.uploadsEnabled, guestGalleryEnabled: params.guestGalleryEnabled, expectedRevision: params.expectedRevision }
    }).catch(() => { throw new Error('COMMUNICATION_ERROR'); });
    if (!response.ok || !data) {
      if (response.status === 401 || response.status === 403) throw new Error('ACCESS_DENIED');
      if (response.status === 404) throw new Error('EVENT_NOT_FOUND');
      if (response.status >= 500) throw new Error('COMMUNICATION_ERROR');
      if (response.status === 409) {
        const code = (error as { code?: string } | undefined)?.code;
        throw new Error(code && ['CONCURRENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'INVALID_STATE'].includes(code) ? code : 'PARTICIPATION_CONFLICT');
      }
      throw new Error('INVALID_PARTICIPATION');
    }
    return data;
  }

  async getEventShareAccess(eventId: string): Promise<OrganizerShareSnapshot> {
    const { data, response } = await this.client.GET('/api/v1/events/{eventId}/share-access', {
      params: { path: { eventId } }
    });
    if (!response.ok || !data) {
      const error = new Error('SHARE_ACCESS_UNAVAILABLE') as Error & { status: number };
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async prepareEventShareAccess(params: { eventId: string; expectedRevision: string; idempotencyKey: string }): Promise<void> {
    const { data, response } = await this.client.POST('/api/v1/events/{eventId}/share-access', {
      params: { path: { eventId: params.eventId }, header: { 'Idempotency-Key': params.idempotencyKey } },
      headers: { 'X-CSRF-Token': this.sessionService?.getCsrfToken() ?? '' },
      body: { expectedRevision: params.expectedRevision }
    });
    if (!response.ok || !data) {
      const error = new Error('SHARE_ACCESS_COMMAND_FAILED') as Error & { status: number };
      error.status = response.status;
      throw error;
    }
  }

  async getEventLifecycle(eventId: string): Promise<OrganizerLifecycleSnapshot> {
    const { data, response } = await this.client.GET('/api/v1/events/{eventId}/lifecycle', {
      params: { path: { eventId } }
    });
    if (!response.ok || !data) throw new Error('LIFECYCLE_UNAVAILABLE');
    return data;
  }

  async transitionEventLifecycle(params: {
    eventId: string;
    action: 'schedule' | 'activate';
    expectedRevision: string;
    idempotencyKey: string;
  }): Promise<void> {
    const options = {
      params: { path: { eventId: params.eventId }, header: { 'Idempotency-Key': params.idempotencyKey } },
      headers: { 'X-CSRF-Token': this.sessionService?.getCsrfToken() ?? '' },
      body: { expectedRevision: params.expectedRevision }
    };
    const result = params.action === 'schedule'
      ? await this.client.POST('/api/v1/events/{eventId}/lifecycle/schedule', options)
      : await this.client.POST('/api/v1/events/{eventId}/lifecycle/activate', options);
    if (!result.response.ok || !result.data) {
      const error = new Error('LIFECYCLE_COMMAND_FAILED') as Error & { status: number; code?: string };
      error.status = result.response.status;
      error.code = (result.error as { code?: string } | undefined)?.code;
      throw error;
    }
  }

  /**
   * Retrieves all events owned by the authenticated organizer via generated OpenAPI client (EL-TK-047, EL-TK-210).
   */
  async listEvents(): Promise<OrganizerEventModel[]> {
    const { data, response } = await this.client.GET('/api/v1/events');
    if (!response.ok || !data) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('UNAUTHORIZED');
      }
      throw new Error('COMMUNICATION_ERROR');
    }
    return data;
  }

  /**
   * Retrieves the authorized configuration and capabilities of an event via generated OpenAPI client (EL-TK-047, EL-TK-210).
   */
  async getEventConfiguration(eventId: string): Promise<EventConfigurationModel> {
    const { data, response } = await this.client.GET(
      '/api/v1/events/{eventId}/configuration',
      {
        params: {
          path: { eventId }
        }
      }
    );
    if (!response.ok || !data) {
      if (response.status === 404) {
        throw new Error('EVENT_NOT_FOUND');
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error('ACCESS_DENIED');
      }
      throw new Error('COMMUNICATION_ERROR');
    }
    return data;
  }

  /**
   * Creates a new draft event idempotently (EL-TK-224, EL-TK-229).
   */
  async createEvent(
    name: string,
    idempotencyKey: string
  ): Promise<{ id: string; outcome: 'APPLIED' | 'REPLAYED' }> {
    const csrfToken = this.sessionService?.getCsrfToken() ?? '';
    const headers: Record<string, string> = {};
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    const { data, response, error } = await this.client.POST('/api/v1/events', {
      params: {
        header: {
          'Idempotency-Key': idempotencyKey
        }
      },
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: {
        name
      }
    });

    if (!response.ok || !data) {
      if (response.status === 422) {
        const message = (error as any)?.message || 'El nombre del evento debe tener entre 1 y 120 caracteres';
        const err = new Error(message);
        (err as any).status = 422;
        (err as any).code = 'INVALID_NAME';
        throw err;
      }
      if (response.status === 409) {
        const message = (error as any)?.message || 'Conflicto de idempotencia al crear el evento';
        const err = new Error(message);
        (err as any).status = 409;
        (err as any).code = 'IDEMPOTENCY_CONFLICT';
        throw err;
      }
      if (response.status === 401 || response.status === 403) {
        const err = new Error('Sesión no autorizada');
        (err as any).status = response.status;
        (err as any).code = 'UNAUTHORIZED';
        throw err;
      }
      const err = new Error('COMMUNICATION_ERROR');
      (err as any).status = response.status;
      (err as any).code = 'NETWORK_ERROR';
      throw err;
    }

    const resData = data as any;
    return {
      id: resData.event.id,
      outcome: resData.outcome
    };
  }

  /**
   * Updates the name of a draft event with revision check and idempotency (EL-TK-225, EL-TK-230).
   */
  async updateEventName(params: {
    eventId: string;
    name: string;
    expectedRevision: string;
    idempotencyKey: string;
  }): Promise<{ id: string; name: string; revision: string; outcome: 'APPLIED' | 'REPLAYED' }> {
    const csrfToken = this.sessionService?.getCsrfToken() ?? '';
    const headers: Record<string, string> = {
      'Idempotency-Key': params.idempotencyKey
    };
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    const { data, response, error } = await this.client.PATCH(
      '/api/v1/events/{eventId}/configuration/name',
      {
        params: {
          path: { eventId: params.eventId },
          header: { 'Idempotency-Key': params.idempotencyKey }
        },
        headers,
        body: {
          name: params.name,
          expectedRevision: params.expectedRevision
        }
      }
    );

    if (!response.ok || !data) {
      if (response.status === 409) {
        const message = (error as any)?.message || 'Conflicto de revisión (CAS)';
        const err = new Error(message);
        (err as any).status = 409;
        (err as any).code = 'CONCURRENCY_CONFLICT';
        throw err;
      }
      if (response.status === 422) {
        const message = (error as any)?.message || 'El nombre del evento debe tener entre 1 y 120 caracteres';
        const err = new Error(message);
        (err as any).status = 422;
        (err as any).code = 'INVALID_NAME';
        throw err;
      }
      if (response.status === 404) {
        const err = new Error('EVENT_NOT_FOUND');
        (err as any).status = 404;
        (err as any).code = 'EVENT_NOT_FOUND';
        throw err;
      }
      if (response.status === 401 || response.status === 403) {
        const err = new Error('UNAUTHORIZED');
        (err as any).status = response.status;
        (err as any).code = 'UNAUTHORIZED';
        throw err;
      }
      const err = new Error('COMMUNICATION_ERROR');
      (err as any).status = response.status;
      (err as any).code = 'NETWORK_ERROR';
      throw err;
    }

    const resData = data as any;
    return {
      id: resData.event.id,
      name: resData.event.name,
      revision: resData.revision,
      outcome: resData.outcome
    };
  }

  /**
   * Sets the local schedule before the first activation (EL-TK-226, EL-TK-244).
   */
  async setEventSchedule(params: {
    eventId: string;
    startsAtLocal: string;
    utcOffsetMinutes?: number;
    expectedRevision: string;
    idempotencyKey: string;
  }): Promise<{
    event: OrganizerEventModel;
    outcome: 'UPDATED' | 'IDEMPOTENT_REPLAY';
    receipt?: {
      operationId: string;
      eventId: string;
      operation: string;
      appliedRevision: string;
      outcome: string;
    } | null;
  }> {
    const csrfToken = this.sessionService?.getCsrfToken() ?? '';
    const headers: Record<string, string> = {};
    if (params.idempotencyKey) {
      headers['idempotency-key'] = params.idempotencyKey;
    }
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    const { data, response, error } = await this.client.PUT(
      '/api/v1/events/{eventId}/configuration/schedule',
      {
        params: {
          path: { eventId: params.eventId },
          header: { 'Idempotency-Key': params.idempotencyKey, 'X-CSRF-Token': csrfToken }
        },
        body: {
          startsAtLocal: params.startsAtLocal,
          utcOffsetMinutes: params.utcOffsetMinutes,
          expectedRevision: params.expectedRevision,
          idempotencyKey: params.idempotencyKey
        }
      }
    ).catch(() => { throw new Error('COMMUNICATION_ERROR'); });

    if (!response.ok || !data) {
      if (response.status === 409) {
        const code = (error as { code?: string } | undefined)?.code;
        const allowed = ['CONCURRENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'EVENT_NOT_IN_DRAFT', 'INVALID_STATE'];
        throw new Error(code && allowed.includes(code) ? code : 'SCHEDULE_CONFLICT');
      }
      if (response.status === 422) {
        const errData = error as { code?: string; details?: { availableOffsets?: unknown } } | undefined;
        const scheduleError = new Error(errData?.code || 'UNPROCESSABLE_ENTITY') as Error & { availableOffsets?: number[] };
        if (Array.isArray(errData?.details?.availableOffsets)) {
          scheduleError.availableOffsets = errData.details.availableOffsets.filter((offset): offset is number => typeof offset === 'number' && Number.isInteger(offset) && Math.abs(offset) <= 900);
        }
        throw scheduleError;
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error('ACCESS_DENIED');
      }
      if (response.status === 404) {
        throw new Error('EVENT_NOT_FOUND');
      }
      throw new Error('COMMUNICATION_ERROR');
    }

    return data;
  }

  /**
   * Changes the timezone of an event draft or scheduled event via generated OpenAPI client (EL-TK-227).
   */
  async changeEventTimezone(params: {
    eventId: string;
    timezone: string;
    utcOffsetMinutes?: number;
    expectedRevision?: string;
    idempotencyKey?: string;
  }): Promise<{
    event: OrganizerEventModel;
    previousTimezone: string;
    warning?: 'RECALCULATED_SCHEDULE' | null;
    outcome: 'TIMEZONE_CHANGED' | 'IDEMPOTENT_REPLAY';
    receipt?: {
      operationId: string;
      eventId: string;
      operation: string;
      appliedRevision: string;
      outcome: string;
    } | null;
  }> {
    const csrfToken = this.sessionService?.getCsrfToken() ?? '';
    const headers: Record<string, string> = {};
    if (params.idempotencyKey) {
      headers['idempotency-key'] = params.idempotencyKey;
    }
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    const { data, response, error } = await this.client.PUT(
      '/api/v1/events/{eventId}/configuration/timezone',
      {
        params: {
          path: { eventId: params.eventId }
        },
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        body: {
          timezone: params.timezone,
          utcOffsetMinutes: params.utcOffsetMinutes,
          expectedRevision: params.expectedRevision,
          idempotencyKey: params.idempotencyKey
        }
      }
    );

    if (!response.ok || !data) {
      if (response.status === 409) {
        throw new Error('CONCURRENCY_CONFLICT');
      }
      if (response.status === 422) {
        const errData = error as { code?: string; message?: string } | undefined;
        throw new Error(errData?.code || 'UNPROCESSABLE_ENTITY');
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error('ACCESS_DENIED');
      }
      if (response.status === 404) {
        throw new Error('EVENT_NOT_FOUND');
      }
      throw new Error('COMMUNICATION_ERROR');
    }

    return data;
  }
}
