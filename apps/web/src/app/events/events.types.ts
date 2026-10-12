import type { operations } from '@eventlens/api-client';

export type EventDraft = operations['createEventDraft']['responses'][201]['content']['application/json'];

export interface CreateEventInput {
  name: string;
  idempotencyKey: string;
}

export type CreateEventOutcome =
  | { kind: 'created'; event: EventDraft }
  | { kind: 'replayed'; event: EventDraft };

export class CreateEventError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, code?: string) {
    super('No se pudo crear el borrador del evento.');
    this.name = 'CreateEventError';
    this.status = status;
    this.code = code;
  }
}

export function newIdempotencyKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
