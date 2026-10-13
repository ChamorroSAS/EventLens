export type EventStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'CLOSED'
  | 'GRACE_PERIOD'
  | 'PENDING_DELETION'
  | 'SUSPENDED'
  | 'ARCHIVED'
  | 'DELETED';

export interface LifecycleCapabilities {
  readonly canSchedule: boolean;
  readonly canActivateEarly: boolean;
  readonly canClose: boolean;
  readonly canReopen: boolean;
  readonly canSuspend: boolean;
  readonly canReactivate: boolean;
  readonly canExtendValidity: boolean;
  readonly canUpload: boolean;
  readonly canViewGuestGallery: boolean;
  readonly canParticipate: boolean;
  readonly isClosed: boolean;
  readonly isInGracePeriod: boolean;
  readonly isSuspended: boolean;
  readonly isTerminal: boolean;
}

export interface LifecycleSnapshotModel {
  readonly eventId: string;
  readonly name: string;
  readonly status: EventStatus;
  readonly timezone: string;
  readonly startsAtLocal?: string | null;
  readonly scheduledAt?: string | null;
  readonly expiresAt?: string | null;
  readonly graceEndsAt?: string | null;
  readonly activatedAt?: string | null;
  readonly closedAt?: string | null;
  readonly capabilities: LifecycleCapabilities;
  readonly organizerId?: string;
  readonly validityDurationDays?: number | null;
  readonly graceDays?: number | null;
  readonly uploadsEnabled?: boolean;
  readonly guestGalleryEnabled?: boolean;
  readonly suspendedAt?: string | null;
  readonly suspensionReason?: string | null;
  readonly previousStatus?: EventStatus | null;
  readonly purgeStartedAt?: string | null;
}

export interface ScheduleEventCommand {
  readonly startsAtLocal: string;
  readonly durationDays: number;
}

export interface SuspendEventCommand {
  readonly reason: string;
}
