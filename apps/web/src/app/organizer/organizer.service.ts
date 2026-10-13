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
}
