import type { AdminActorContext, OrganizerActorContext } from '@eventlens/identity';

export type EventStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'CLOSED'
  | 'GRACE_PERIOD'
  | 'PENDING_DELETION'
  | 'SUSPENDED'
  | 'DELETED';

export type ModerationMode = 'AUTO_PUBLISH' | 'MANUAL_REVIEW';

export interface EventRecord {
  readonly id: string;
  readonly organizerId: string;
  readonly name: string;
  readonly status: EventStatus;
  readonly previousStatus?: EventStatus | null;
  readonly suspensionReason?: string | null;
  readonly suspendedAt?: Date | null;
  readonly scheduledAt?: Date | null;
  readonly expiresAt?: Date | null;
  readonly graceEndsAt?: Date | null;
  readonly revision: bigint;
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
  | 'TERMINAL_STATE_CANNOT_SUSPEND'
  | 'CONCURRENCY_CONFLICT'
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

export interface SuspendEventCommand {
  readonly actorContext: AdminActorContext;
  readonly eventId: string;
  readonly reason: string;
  readonly expectedRevision?: bigint | number;
}

export interface SuspendEventResult {
  readonly event: EventRecord;
  readonly previousStatus: EventStatus;
  readonly suspendedAt: Date;
  readonly suspensionReason: string;
  readonly revision: bigint;
}

export interface EventAuditRecord {
  readonly id: string;
  readonly procedure: 'EVENT_DRAFT_CREATED' | 'EVENT_SUSPENDED';
  readonly actorId: string;
  readonly targetIdentifier: string;
  readonly result:
    | 'SUCCESS'
    | 'REJECTED_INVALID_NAME'
    | 'REJECTED_UNAUTHORIZED'
    | 'REJECTED_INVALID_STATE'
    | 'IDEMPOTENT_REPLAY'
    | 'CONCURRENCY_CONFLICT'
    | 'FAILURE';
  readonly details?: string;
  readonly timestamp: Date;
}

export interface EventAuditSink {
  record(event: EventAuditRecord): Promise<void>;
}
