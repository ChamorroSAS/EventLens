import { Injectable } from '@angular/core';
import type {
  CapacityUsageSummaryModel,
  CreateExtensionRequestCommandModel,
  ExtensionRequestModel,
  RespondExtensionInfoCommandModel,
} from './capacity.types.js';

@Injectable({
  providedIn: 'root',
})
export class EventCapacityService {
  /**
   * Obtiene el snapshot de consumo comercial y capacidad disponible (EL-TK-135).
   */
  async getCapacitySummary(eventId: string): Promise<CapacityUsageSummaryModel> {
    const url = `/api/v1/events/${encodeURIComponent(eventId)}/capacity`;
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 404) throw new Error('EVENT_NOT_FOUND');
      if (res.status === 403) throw new Error('ACCESS_DENIED');
      throw new Error('COMMUNICATION_ERROR');
    }
    return (await res.json()) as CapacityUsageSummaryModel;
  }

  /**
   * Obtiene la solicitud de ampliación abierta del evento, o null si no hay (EL-TK-139).
   */
  async getOpenExtensionRequest(eventId: string): Promise<ExtensionRequestModel | null> {
    const url = `/api/v1/events/${encodeURIComponent(eventId)}/extension-requests/open`;
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 404) return null;
      if (res.status === 403) throw new Error('ACCESS_DENIED');
      throw new Error('COMMUNICATION_ERROR');
    }
    return (await res.json()) as ExtensionRequestModel;
  }

  /**
   * Crea una solicitud de ampliación para almacenamiento o vigencia (EL-TK-139).
   */
  async createExtensionRequest(
    command: CreateExtensionRequestCommandModel
  ): Promise<ExtensionRequestModel> {
    const url = `/api/v1/events/${encodeURIComponent(command.eventId)}/extension-requests`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!res.ok) {
      if (res.status === 409) {
        const errorData = await res.json().catch(() => ({}));
        const err = new Error('OPEN_REQUEST_ALREADY_EXISTS');
        (err as any).existingRequest = (errorData as any).existingRequest;
        throw err;
      }
      if (res.status === 400) throw new Error('VALIDATION_FAILED');
      if (res.status === 403) throw new Error('ACCESS_DENIED');
      throw new Error('COMMUNICATION_ERROR');
    }
    return (await res.json()) as ExtensionRequestModel;
  }

  /**
   * Responde a una solicitud de información adicional (EL-TK-140).
   */
  async respondToExtensionInfo(
    command: RespondExtensionInfoCommandModel
  ): Promise<ExtensionRequestModel> {
    const url = `/api/v1/extension-requests/${encodeURIComponent(command.requestId)}/respond`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: command.response }),
    });
    if (!res.ok) {
      if (res.status === 409 || res.status === 422) throw new Error('INVALID_STATE');
      if (res.status === 400) throw new Error('VALIDATION_FAILED');
      if (res.status === 403) throw new Error('ACCESS_DENIED');
      throw new Error('COMMUNICATION_ERROR');
    }
    return (await res.json()) as ExtensionRequestModel;
  }
}
