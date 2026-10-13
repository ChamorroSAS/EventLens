import createClient from 'openapi-fetch';
import type { paths } from './schema.js';

/** Public HTTP boundary only; this package never imports API implementation DTOs. */
export function createEventLensClient(
  options: { baseUrl?: string; fetch?: typeof globalThis.fetch; credentials?: RequestCredentials } = {}
) {
  return createClient<paths>({ credentials: 'same-origin', ...options });
}

export type EventLensClient = ReturnType<typeof createEventLensClient>;
export type { paths, components, operations } from './schema.js';
