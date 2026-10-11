import type { OrganizerActorContext } from '@eventlens/identity';

export type EventStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
export type ModerationMode = 'AUTO_PUBLISH' | 'MANUAL_REVIEW';

export interface EventRecord {
  readonly id: string;
  readonly organizerId: string;
  readonly name: string;
  readonly status: EventStatus;
  readonly timezone: string;
  readonly uploadsEnabled: boolean;
  readonly guestGalleryEnabled: boolean;
  readonly moderationMode: ModerationMode;
  readonly pinEnabled: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type EventManagementErrorCode =
  | 'INVALID_NAME'
  | 'UNAUTHORIZED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'EVENT_NOT_FOUND'
  | 'INVALID_STATE'
  | 'INVALID_ARGUMENT';

export class EventManagementError extends Error {
  constructor(public readonly code: EventManagementErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'EventManagementError';
  }
}

export interface CreateEventDraftCommand {
  readonly actorContext: OrganizerActorContext;
  readonly name: string;
  readonly idempotencyKey?: string;
}

export interface CreateEventDraftResult {
  readonly event: EventRecord;
  readonly outcome: 'CREATED' | 'IDEMPOTENT_REPLAY';
}

export interface EventAuditRecord {
  readonly id: string;
  readonly procedure: 'EVENT_DRAFT_CREATED';
  readonly actorId: string;
  readonly targetIdentifier: string;
  readonly result: 'SUCCESS' | 'REJECTED_INVALID_NAME' | 'REJECTED_UNAUTHORIZED' | 'IDEMPOTENT_REPLAY';
  readonly details?: string;
  readonly timestamp: Date;
}

export interface EventAuditSink {
  record(event: EventAuditRecord): Promise<void>;
}
