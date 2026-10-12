import { Injectable } from '@angular/core';
import { createEventLensClient } from '@eventlens/api-client';
import { CreateEventError } from './events.types.js';
import type { CreateEventInput, CreateEventOutcome } from './events.types.js';

@Injectable({ providedIn: 'root' })
export class EventsService {
  private readonly client = createEventLensClient();

  async createDraft(input: CreateEventInput): Promise<CreateEventOutcome> {
    const { data, error, response } = await this.client.POST('/api/v1/events', {
      body: { name: input.name },
      params: { header: { 'Idempotency-Key': input.idempotencyKey } },
    });
    if (error || !data) {
      throw new CreateEventError(response.status, error?.code);
    }
    return { kind: response.status === 200 ? 'replayed' : 'created', event: data };
  }
}
