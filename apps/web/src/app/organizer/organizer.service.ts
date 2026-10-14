import { Injectable } from '@angular/core';
import { createEventLensClient } from '@eventlens/api-client';
import type { OrganizerEventModel, EventConfigurationModel } from './organizer.types.js';

@Injectable({
  providedIn: 'root'
})
export class OrganizerService {
  private readonly client = createEventLensClient();

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
   * Sets the local schedule for an event draft via generated OpenAPI client (EL-TK-226).
   */
  async setEventSchedule(params: {
    eventId: string;
    startsAtLocal: string;
    utcOffsetMinutes?: number;
    expectedRevision?: string;
    idempotencyKey?: string;
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
    const headers: Record<string, string> = {};
    if (params.idempotencyKey) {
      headers['idempotency-key'] = params.idempotencyKey;
    }

    const { data, response, error } = await this.client.PUT(
      '/api/v1/events/{eventId}/configuration/schedule',
      {
        params: {
          path: { eventId: params.eventId }
        },
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        body: {
          startsAtLocal: params.startsAtLocal,
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
    const headers: Record<string, string> = {};
    if (params.idempotencyKey) {
      headers['idempotency-key'] = params.idempotencyKey;
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
