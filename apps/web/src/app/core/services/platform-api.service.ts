import { Injectable } from '@angular/core';
import { createEventLensClient } from '@eventlens/api-client';

@Injectable({ providedIn: 'root' })
export class PlatformApiService {
  private readonly client = createEventLensClient();

  async checkReadiness(): Promise<void> {
    const { error, response } = await this.client.GET('/api/v1/health/ready');
    if (!response.ok || error) throw new Error('API unavailable');
  }
}
