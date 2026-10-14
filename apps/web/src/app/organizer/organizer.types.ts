import type { EventStatus } from '../lifecycle/lifecycle.types.js';

export type { EventStatus };

export type ModerationMode = 'AUTO_PUBLISH' | 'MANUAL_REVIEW';


export type EventSettingsSection =
  | 'general'
  | 'schedule'
  | 'access'
  | 'guest'
  | 'lifecycle'
  | 'capacity'
  | 'media';

export interface OrganizerEventModel {
  id: string;
  organizerId: string;
  name: string;
  status: EventStatus;
  timezone: string;
  startsAtLocal?: string | null;
  scheduledAt?: string | null;
  utcOffsetMinutes?: number | null;
  expiresAt?: string | null;
  graceEndsAt?: string | null;
  uploadsEnabled: boolean;
  guestGalleryEnabled: boolean;
  moderationMode: ModerationMode;
  pinEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EventConfigurationCapabilitiesModel {
  canEditSchedule: boolean;
  canEditSettings: boolean;
  canManageAccess: boolean;
  canViewLifecycle: boolean;
  canViewCapacity: boolean;
  canPublishOrActivate: boolean;
  canEditName?: boolean;
  canSetLocalSchedule?: boolean;
  canChangeTimezone?: boolean;
}

export interface EventConfigurationModel {
  event: OrganizerEventModel;
  revision: string;
  capabilities: EventConfigurationCapabilitiesModel;
}
