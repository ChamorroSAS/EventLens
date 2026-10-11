import type { OrganizerActorContext } from '@eventlens/identity';

export type EventStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
export type ModerationMode = 'AUTO_PUBLISH' | 'MANUAL_REVIEW';

export interface EventRecord {
  readonly id: string;
  readonly organizerId: string;
  readonly name: string;
  readonly status: EventStatus;
  readonly timezone: string;
  readonly startsAtLocal: string | null;
  readonly scheduledAt: Date | null;
  readonly utcOffsetMinutes: number | null;
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
  | 'INVALID_ARGUMENT'
  | 'DST_GAP_TIME'
  | 'AMBIGUOUS_LOCAL_TIME'
  | 'INVALID_OFFSET'
  | 'INVALID_DATE_TIME'
  | 'INVALID_TIMELINE_PARAMETERS'
  | 'EVENT_NOT_IN_DRAFT';

export class EventManagementError extends Error {
  constructor(
    public readonly code: EventManagementErrorCode,
    message?: string,
    public readonly details?: unknown
  ) {
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

export interface SetEventScheduleCommand {
  readonly actorContext: OrganizerActorContext;
  readonly eventId: string;
  readonly startsAtLocal: string;
  readonly utcOffsetMinutes?: number;
  readonly idempotencyKey?: string;
}

export interface SetEventScheduleResult {
  readonly event: EventRecord;
  readonly outcome: 'UPDATED' | 'IDEMPOTENT_REPLAY';
}

export interface EventAuditRecord {
  readonly id: string;
  readonly procedure: 'EVENT_DRAFT_CREATED' | 'EVENT_SCHEDULE_SET';
  readonly actorId: string;
  readonly targetIdentifier: string;
  readonly result:
    | 'SUCCESS'
    | 'REJECTED_INVALID_NAME'
    | 'REJECTED_UNAUTHORIZED'
    | 'REJECTED_DST_GAP'
    | 'REJECTED_AMBIGUOUS_TIME'
    | 'REJECTED_INVALID_OFFSET'
    | 'REJECTED_INVALID_STATE'
    | 'IDEMPOTENT_REPLAY';
  readonly details?: string;
  readonly timestamp: Date;
}

export interface EventAuditSink {
  record(event: EventAuditRecord): Promise<void>;
}
