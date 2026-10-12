import type { EventRecord } from '@eventlens/event-management';

export interface EventDraftResponse {
  id: string;
  name: string;
  status: string;
  timezone: string;
  uploadsEnabled: boolean;
  guestGalleryEnabled: boolean;
  moderationMode: string;
  pinEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Explicit HTTP projection of an event draft: never exposes infrastructure row shapes. */
export function toEventDraftResponse(record: EventRecord): EventDraftResponse {
  return {
    id: record.id,
    name: record.name,
    status: record.status,
    timezone: record.timezone,
    uploadsEnabled: record.uploadsEnabled,
    guestGalleryEnabled: record.guestGalleryEnabled,
    moderationMode: record.moderationMode,
    pinEnabled: record.pinEnabled,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export const createEventDraftRequestSchema = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: { name: { type: 'string', minLength: 1, maxLength: 120 } }
};

const eventDraftProperties = {
  id: { type: 'string', format: 'uuid' },
  name: { type: 'string' },
  status: { type: 'string', enum: ['DRAFT', 'SCHEDULED', 'ACTIVE', 'CLOSED', 'ARCHIVED'] },
  timezone: { type: 'string' },
  uploadsEnabled: { type: 'boolean' },
  guestGalleryEnabled: { type: 'boolean' },
  moderationMode: { type: 'string', enum: ['AUTO_PUBLISH', 'MANUAL_REVIEW'] },
  pinEnabled: { type: 'boolean' },
  createdAt: { type: 'string', format: 'date-time' },
  updatedAt: { type: 'string', format: 'date-time' }
};

export const eventDraftSchema = {
  type: 'object',
  required: Object.keys(eventDraftProperties),
  properties: eventDraftProperties
};
