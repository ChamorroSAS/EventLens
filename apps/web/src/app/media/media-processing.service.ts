import { Injectable } from '@angular/core';
import type { MediaCardModel, RetryCycleResponse } from './media.types.js';

export interface RetryCycleRequest {
  mediaRef: string;
  eventRef: string;
  operationId?: string;
}

@Injectable({
  providedIn: 'root',
})
export class MediaProcessingService {
  async getMediaStatus(mediaRef: string, eventRef: string): Promise<MediaCardModel> {
    const res = await fetch(`/api/v1/media/${encodeURIComponent(mediaRef)}/status?eventRef=${encodeURIComponent(eventRef)}`);
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('MEDIA_NOT_FOUND');
      }
      if (res.status === 403) {
        throw new Error('ACCESS_DENIED');
      }
      throw new Error('COMMUNICATION_ERROR');
    }
    return (await res.json()) as MediaCardModel;
  }

  async requestRetryCycle(command: RetryCycleRequest): Promise<RetryCycleResponse> {
    const res = await fetch(`/api/v1/media/${encodeURIComponent(command.mediaRef)}/retry-cycle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eventRef: command.eventRef,
        operationId: command.operationId ?? `ui-retry-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      }),
    });

    if (!res.ok) {
      if (res.status === 409) {
        throw new Error('CYCLE_ALREADY_ACTIVE');
      }
      if (res.status === 403) {
        throw new Error('RETRY_DENIED');
      }
      throw new Error('COMMUNICATION_ERROR');
    }

    return (await res.json()) as RetryCycleResponse;
  }
}
