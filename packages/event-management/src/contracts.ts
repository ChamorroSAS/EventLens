import type { OrganizerActorContext, AdminActorContext } from '@eventlens/identity';

export type EventStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'CLOSED'
  | 'GRACE_PERIOD'
  | 'PENDING_DELETION'
  | 'SUSPENDED'
  | 'ARCHIVED';
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
  readonly expiresAt: Date | null;
  readonly graceEndsAt: Date | null;
  readonly activatedAt: Date | null;
  readonly closedAt: Date | null;
  readonly purgeStartedAt: Date | null;
  readonly suspendedAt: Date | null;
  readonly suspensionReason: string | null;
  readonly previousStatus: EventStatus | null;
  readonly validityDurationDays: number | null;
  readonly graceDays: number | null;
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
  | 'SCHEDULE_NOT_CONFIGURED'
  | 'INCOMPLETE_CONFIGURATION'
  | 'EVENT_NOT_IN_DRAFT'
  | 'EVENT_NOT_IN_SCHEDULED'
  | 'EVENT_NOT_ACTIVE'
  | 'EVENT_NOT_CLOSED'
  | 'EVENT_ALREADY_EXPIRED'
  | 'EVENT_TERMINAL'
  | 'SUSPENSION_REASON_REQUIRED'
  | 'EVENT_NOT_SUSPENDED'
  | 'INVALID_PREVIOUS_STATUS'
  | 'EXTENSION_REASON_REQUIRED'
  | 'INVALID_VALIDITY_EXTENSION'
  | 'EVENT_NOT_EXTENDABLE'
  | 'PIN_ALREADY_CONFIGURED'
  | 'INVALID_PIN_FORMAT'
  | 'INVALID_CREDENTIAL'
  | 'INVALID_PIN'
  | 'PIN_REQUIRED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'EVENT_NOT_ACCESSIBLE'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'CONSENT_REQUIRED'
  | 'INVALID_CONSENT_VERSION'
  | 'CONSENT_REJECTED'
  | 'INVALID_CONTRIBUTOR_NICKNAME';

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

export interface SetInitialPinCommand {
  readonly actorContext: OrganizerActorContext;
  readonly eventId: string;
  readonly pin: string;
  readonly idempotencyKey?: string;
}

export interface SetInitialPinResult {
  readonly event: EventRecord;
  readonly outcome: 'PIN_SET' | 'IDEMPOTENT_REPLAY';
}

export interface ScheduleDraftEventCommand {
  readonly actorContext: OrganizerActorContext;
  readonly eventId: string;
  readonly validityDurationDays?: number;
  readonly graceDays?: number;
  readonly idempotencyKey?: string;
}

export interface ScheduleDraftEventResult {
  readonly event: EventRecord;
  readonly outcome: 'SCHEDULED' | 'IDEMPOTENT_REPLAY';
}

export type ActivationTrigger = 'MANUAL_EARLY' | 'SCHEDULED_AUTO';

export interface ActivateEventCommand {
  readonly actorContext?: OrganizerActorContext;
  readonly trigger: ActivationTrigger;
  readonly eventId: string;
  readonly idempotencyKey?: string;
}

export interface ActivateEventResult {
  readonly event: EventRecord;
  readonly outcome: 'ACTIVATED' | 'IDEMPOTENT_REPLAY';
}

export interface CloseEventCommand {
  readonly actorContext: OrganizerActorContext;
  readonly eventId: string;
  readonly idempotencyKey?: string;
  readonly now?: Date;
}

export interface CloseEventResult {
  readonly event: EventRecord;
  readonly outcome: 'CLOSED' | 'IDEMPOTENT_REPLAY';
}

export interface ReopenEventCommand {
  readonly actorContext: OrganizerActorContext;
  readonly eventId: string;
  readonly idempotencyKey?: string;
  readonly now?: Date;
}

export interface ReopenEventResult {
  readonly event: EventRecord;
  readonly outcome: 'REOPENED' | 'IDEMPOTENT_REPLAY';
}

export interface AdvanceTemporalLifecycleCommand {
  readonly eventId: string;
  readonly now?: Date;
  readonly jobId?: string;
  readonly scheduledAt?: Date;
}

export type TemporalAdvanceOutcome =
  | 'TRANSITIONED_TO_GRACE_PERIOD'
  | 'TRANSITIONED_TO_PENDING_DELETION'
  | 'SUSPENDED_PRESERVED'
  | 'IDEMPOTENT_REPLAY'
  | 'NO_OP';

export interface AdvanceTemporalLifecycleResult {
  readonly event: EventRecord;
  readonly previousStatus: EventStatus;
  readonly outcome: TemporalAdvanceOutcome;
}

export interface SuspendEventCommand {
  readonly actorContext: AdminActorContext;
  readonly eventId: string;
  readonly reason: string;
  readonly idempotencyKey?: string;
  readonly now?: Date;
}

export interface SuspendEventResult {
  readonly event: EventRecord;
  readonly previousStatus: EventStatus;
  readonly outcome: 'SUSPENDED' | 'IDEMPOTENT_REPLAY';
}

export interface ReactivateEventCommand {
  readonly actorContext: AdminActorContext;
  readonly eventId: string;
  readonly idempotencyKey?: string;
  readonly now?: Date;
}

export interface ReactivateEventResult {
  readonly event: EventRecord;
  readonly previousSuspendedStatus: EventStatus;
  readonly targetStatus: EventStatus;
  readonly outcome: 'REACTIVATED' | 'IDEMPOTENT_REPLAY';
}

export interface ExtendEventValidityCommand {
  readonly actorContext: AdminActorContext;
  readonly eventId: string;
  readonly totalValidityDurationDays: number;
  readonly graceDays?: number;
  readonly reason: string;
  readonly idempotencyKey?: string;
  readonly now?: Date;
}

export interface ExtendEventValidityResult {
  readonly event: EventRecord;
  readonly previousStatus: EventStatus;
  readonly previousExpiresAt: Date | null;
  readonly previousGraceEndsAt: Date | null;
  readonly outcome: 'EXTENDED' | 'IDEMPOTENT_REPLAY';
}

export interface GuestActorContext {
  readonly actorType: 'GUEST_ANONYMOUS';
  readonly guestSessionId?: string;
}

export type EventLifecycleActorContext =
  | AdminActorContext
  | OrganizerActorContext
  | GuestActorContext;

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

export interface LifecycleSnapshot {
  readonly eventId: string;
  readonly name: string;
  readonly status: EventStatus;
  readonly timezone: string;
  readonly startsAtLocal: string | null;
  readonly scheduledAt: Date | null;
  readonly expiresAt: Date | null;
  readonly graceEndsAt: Date | null;
  readonly activatedAt: Date | null;
  readonly closedAt: Date | null;
  readonly capabilities: LifecycleCapabilities;
  readonly organizerId?: string;
  readonly validityDurationDays?: number | null;
  readonly graceDays?: number | null;
  readonly uploadsEnabled?: boolean;
  readonly guestGalleryEnabled?: boolean;
  readonly moderationMode?: ModerationMode;
  readonly suspendedAt?: Date | null;
  readonly suspensionReason?: string | null;
  readonly previousStatus?: EventStatus | null;
  readonly purgeStartedAt?: Date | null;
}

export interface GetLifecycleSnapshotCommand {
  readonly eventId: string;
  readonly actorContext?: EventLifecycleActorContext | null;
  readonly now?: Date;
}

export type EventAction =
  | 'GUEST_VIEW_LANDING'
  | 'GUEST_VIEW_GALLERY'
  | 'GUEST_UPLOAD'
  | 'GUEST_VIEW_OWN_CONTRIBUTIONS'
  | 'GUEST_REQUEST_OWN_REMOVAL'
  | 'ORGANIZER_MANAGE'
  | 'ADMIN_INTERVENE';

export interface EvaluateAccessParams {
  readonly event: EventRecord | LifecycleSnapshot | null | undefined;
  readonly action: EventAction;
  readonly actorContext?: EventLifecycleActorContext | null;
}

export interface AccessDecision {
  readonly allowed: boolean;
  readonly code:
    | 'ALLOWED'
    | 'EVENT_NOT_FOUND'
    | 'EVENT_NOT_ACCESSIBLE'
    | 'EVENT_SUSPENDED'
    | 'EVENT_TERMINAL'
    | 'UPLOADS_DISABLED'
    | 'GALLERY_DISABLED'
    | 'SESSION_REQUIRED'
    | 'UNAUTHORIZED_ORGANIZER'
    | 'UNAUTHORIZED_ADMIN'
    | 'FAIL_CLOSED';
  readonly reason: string;
}

export interface PublicAccessCredentialRecord {
  readonly id: string;
  readonly eventId: string;
  readonly lookupKey: string;
  readonly tokenHash: string;
  readonly generation: number;
  readonly pinRequired: boolean;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
}

export interface IssueInitialPublicCredentialCommand {
  readonly actorContext: OrganizerActorContext;
  readonly eventId: string;
  readonly idempotencyKey?: string;
  readonly now?: Date;
}

export interface IssueInitialPublicCredentialResult {
  readonly credential: PublicAccessCredentialRecord;
  readonly outcome: 'ISSUED' | 'IDEMPOTENT_REPLAY';
}

export type PublicAccessState =
  | 'ALLOWED'
  | 'RESTRICTED'
  | 'UNAVAILABLE';

export interface PublicAccessCapabilities {
  readonly canViewLanding: boolean;
  readonly canUpload: boolean;
  readonly canViewGallery: boolean;
}

export interface ResolvePublicAccessCommand {
  readonly lookupKey: string;
  readonly now?: Date;
}

export interface ResolvePublicAccessResult {
  readonly accessState: PublicAccessState;
  readonly eventId: string;
  readonly name: string;
  readonly status: EventStatus;
  readonly timezone: string;
  readonly generation: number;
  readonly pinRequired: boolean;
  readonly capabilities: PublicAccessCapabilities;
  readonly restrictionReason?: string;
}

export interface GuestSessionRecord {
  readonly id: string;
  readonly eventId: string;
  readonly tokenHash: string;
  readonly credentialGeneration: number;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly consentRecordedAt: Date | null;
  readonly consentVersion: string | null;
  readonly contributorNickname: string | null;
}

export interface CreateGuestSessionCommand {
  readonly lookupKey: string;
  readonly pin?: string;
  readonly now?: Date;
}

export interface CreateGuestSessionResult {
  readonly session: {
    readonly id: string;
    readonly eventId: string;
    readonly token: string;
    readonly credentialGeneration: number;
    readonly createdAt: Date;
    readonly expiresAt: Date;
  };
  readonly event: {
    readonly id: string;
    readonly name: string;
    readonly status: EventStatus;
    readonly timezone: string;
  };
}

export interface RecordGuestConsentCommand {
  readonly sessionToken: string;
  readonly documentVersion: string;
  readonly accepted: boolean;
  readonly now?: Date;
}

export interface RecordGuestConsentResult {
  readonly sessionId: string;
  readonly eventId: string;
  readonly documentVersion: string;
  readonly acceptedAt: Date;
  readonly outcome: 'RECORDED' | 'IDEMPOTENT_REPLAY';
}

export interface CheckGuestConsentCommand {
  readonly sessionToken: string;
  readonly requiredVersion?: string;
  readonly now?: Date;
}

export interface CheckGuestConsentResult {
  readonly hasConsented: boolean;
  readonly consentVersion: string | null;
  readonly consentRecordedAt: Date | null;
  readonly requiresAcceptance: boolean;
}

export interface SetContributorNicknameCommand {
  readonly sessionToken: string;
  readonly nickname: string;
  readonly now?: Date;
}

export interface SetContributorNicknameResult {
  readonly sessionId: string;
  readonly eventId: string;
  readonly contributorNickname: string;
  readonly updatedAt: Date;
}

export interface EventAuditRecord {
  readonly id: string;
  readonly procedure:
    | 'EVENT_DRAFT_CREATED'
    | 'EVENT_SCHEDULE_SET'
    | 'EVENT_SCHEDULED'
    | 'EVENT_ACTIVATED'
    | 'EVENT_CLOSED'
    | 'EVENT_REOPENED'
    | 'EVENT_TEMPORAL_ADVANCE'
    | 'EVENT_SUSPENDED'
    | 'EVENT_REACTIVATED'
    | 'EVENT_VALIDITY_EXTENDED'
    | 'EVENT_INITIAL_PIN_SET'
    | 'EVENT_PUBLIC_CREDENTIAL_ISSUED'
    | 'EVENT_PUBLIC_ACCESS_RESOLVED'
    | 'GUEST_SESSION_CREATED'
    | 'GUEST_PIN_VALIDATION_FAILED'
    | 'GUEST_CONSENT_RECORDED'
    | 'GUEST_NICKNAME_SET';
  readonly actorId: string;
  readonly targetIdentifier: string;
  readonly result:
    | 'SUCCESS'
    | 'EXTENDED'
    | 'REACTIVATED'
    | 'TRANSITIONED_TO_GRACE_PERIOD'
    | 'TRANSITIONED_TO_PENDING_DELETION'
    | 'SUSPENDED_PRESERVED'
    | 'NO_OP'
    | 'IDEMPOTENT_REPLAY'
    | 'REJECTED_INVALID_NAME'
    | 'REJECTED_UNAUTHORIZED'
    | 'REJECTED_DST_GAP'
    | 'REJECTED_AMBIGUOUS_TIME'
    | 'REJECTED_INVALID_OFFSET'
    | 'REJECTED_INVALID_STATE'
    | 'REJECTED_SCHEDULE_NOT_CONFIGURED'
    | 'REJECTED_EVENT_NOT_SUSPENDED'
    | 'REJECTED_INVALID_PREVIOUS_STATUS'
    | 'REJECTED_INCOMPLETE_CONFIG'
    | 'REJECTED_EVENT_NOT_IN_SCHEDULED'
    | 'REJECTED_EVENT_NOT_ACTIVE'
    | 'REJECTED_EVENT_NOT_CLOSED'
    | 'REJECTED_EVENT_EXPIRED'
    | 'REJECTED_EVENT_TERMINAL'
    | 'REJECTED_REASON_REQUIRED'
    | 'REJECTED_EXTENSION_REASON_REQUIRED'
    | 'REJECTED_INVALID_VALIDITY_EXTENSION'
    | 'REJECTED_EVENT_NOT_EXTENDABLE'
    | 'REJECTED_PIN_ALREADY_CONFIGURED'
    | 'REJECTED_INVALID_PIN_FORMAT'
    | 'IDEMPOTENT_REPLAY';
  readonly details?: string;
  readonly timestamp: Date;
}

export interface EventAuditSink {
  record(event: EventAuditRecord): Promise<void>;
}
