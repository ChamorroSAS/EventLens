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
   * Creates a new draft event idempotently (EL-TK-224, EL-TK-229).
   */
  async createEvent(
    name: string,
    idempotencyKey: string
  ): Promise<{ id: string; outcome: 'APPLIED' | 'REPLAYED' }> {
    const { data, response, error } = await this.client.POST('/api/v1/events', {
      params: {
        header: {
          'Idempotency-Key': idempotencyKey
        }
      },
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
    const { data, response, error } = await this.client.PATCH(
      '/api/v1/events/{eventId}/configuration/name',
      {
        params: {
          path: { eventId: params.eventId },
          header: { 'Idempotency-Key': params.idempotencyKey }
        },
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
