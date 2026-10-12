import { Injectable } from '@angular/core';
import type { OrganizerEventModel, EventConfigurationModel } from './organizer.types.js';

@Injectable({
  providedIn: 'root'
})
export class OrganizerService {
  /**
   * Retrieves all events owned by the authenticated organizer (EL-TK-047).
   */
  async listEvents(): Promise<OrganizerEventModel[]> {
    const res = await fetch('/api/v1/events');
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('UNAUTHORIZED');
      }
      throw new Error('COMMUNICATION_ERROR');
    }
    return (await res.json()) as OrganizerEventModel[];
  }

  /**
   * Retrieves the authorized configuration and capabilities of an event (EL-TK-047).
   */
  async getEventConfiguration(eventId: string): Promise<EventConfigurationModel> {
    const res = await fetch(`/api/v1/events/${encodeURIComponent(eventId)}/configuration`);
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('EVENT_NOT_FOUND');
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error('ACCESS_DENIED');
      }
      throw new Error('COMMUNICATION_ERROR');
    }
    return (await res.json()) as EventConfigurationModel;
  }
}
