import type { OrganizerActorContext, AdminActorContext } from '@eventlens/identity';
export type { OrganizerActorContext, AdminActorContext };

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
  readonly welcomeMessage?: string | null;
  readonly coverAssetId?: string | null;
  readonly revision?: string;
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
  | 'JUSTIFICATION_REQUIRED'
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
  | 'CREDENTIAL_NOT_FOUND'
  | 'CONSENT_REQUIRED'
  | 'INVALID_CONSENT_VERSION'
  | 'CONSENT_REJECTED'
  | 'INVALID_CONTRIBUTOR_NICKNAME'
  | 'UPLOADS_DISABLED'
  | 'INSUFFICIENT_STORAGE_CAPACITY'
  | 'INSUFFICIENT_FILE_CAPACITY'
  | 'FILE_SIZE_EXCEEDS_LIMIT'
  | 'INVALID_MEDIA_TYPE'
  | 'INVALID_FILE_SIZE'
  | 'UPLOAD_ATTEMPT_NOT_FOUND'
  | 'UPLOAD_ATTEMPT_CANCELLED'
  | 'UPLOAD_ATTEMPT_ALREADY_ACCEPTED'
  | 'UPLOAD_ATTEMPT_EXPIRED'
  | 'UPLOAD_ATTEMPT_NOT_CONFIRMED'
  | 'UPLOAD_ATTEMPT_NOT_VALIDATED'
  | 'OBJECT_NOT_FOUND'
  | 'SIZE_MISMATCH'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'DURATION_EXCEEDS_LIMIT'
  | 'CORRUPTED_OR_UNREADABLE_FILE'
  | 'COVER_ASSET_NOT_FOUND'
  | 'COVER_ASSET_NOT_READY'
  | 'COVER_UPLOAD_INTENT_NOT_FOUND'
  | 'COVER_UPLOAD_INTENT_EXPIRED'
  | 'CONCURRENCY_CONFLICT';

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

export interface CommandReceipt {
  readonly operationId: string;
  readonly eventId: string;
  readonly operation: string;
  readonly appliedRevision: string;
  readonly outcome: 'CREATED' | 'UPDATED' | 'TIMEZONE_CHANGED' | string;
}

export interface CreateEventDraftCommand {
  readonly actorContext: OrganizerActorContext;
  readonly name: string;
  readonly idempotencyKey?: string;
}

export interface CreateEventDraftResult {
  readonly event: EventRecord;
  readonly outcome: 'CREATED' | 'IDEMPOTENT_REPLAY';
  readonly receipt?: CommandReceipt;
}

// ==========================================
// EL-TK-021: Update Event Draft Name Contracts
// ==========================================

export interface UpdateEventDraftNameCommand {
  readonly actorContext: OrganizerActorContext;
  readonly eventId: string;
  readonly name: string;
  readonly expectedRevision?: string;
  readonly idempotencyKey?: string;
}

export interface UpdateEventDraftNameResult {
  readonly event: EventRecord;
  readonly outcome: 'UPDATED' | 'IDEMPOTENT_REPLAY';
  readonly receipt?: CommandReceipt;
}

// ==========================================
// EL-TK-022: Set Event Welcome Message Contracts
// ==========================================

export interface SetEventWelcomeMessageCommand {
  readonly actorContext: OrganizerActorContext;
  readonly eventId: string;
  readonly welcomeMessage: string | null;
  readonly idempotencyKey?: string;
}

export interface SetEventWelcomeMessageResult {
  readonly event: EventRecord;
  readonly outcome: 'UPDATED' | 'IDEMPOTENT_REPLAY';
}

// ==========================================
// EL-TK-028: Set Event Moderation Mode Contracts
// ==========================================

export interface SetEventModerationModeCommand {
  readonly actorContext: OrganizerActorContext;
  readonly eventId: string;
  readonly moderationMode: ModerationMode;
  readonly idempotencyKey?: string;
}

export interface SetEventModerationModeResult {
  readonly event: EventRecord;
  readonly outcome: 'UPDATED' | 'IDEMPOTENT_REPLAY';
}

// ==========================================
// EL-TK-029: Set Event Guest Uploads Contracts
// ==========================================

export interface SetEventGuestUploadsCommand {
  readonly actorContext: OrganizerActorContext;
  readonly eventId: string;
  readonly uploadsEnabled: boolean;
  readonly idempotencyKey?: string;
}

export interface SetEventGuestUploadsResult {
  readonly event: EventRecord;
  readonly outcome: 'UPDATED' | 'IDEMPOTENT_REPLAY';
}

// ==========================================
// EL-TK-030: Set Event Guest Gallery Contracts
// ==========================================

export interface SetEventGuestGalleryCommand {
  readonly actorContext: OrganizerActorContext;
  readonly eventId: string;
  readonly guestGalleryEnabled: boolean;
  readonly idempotencyKey?: string;
}

export interface SetEventGuestGalleryResult {
  readonly event: EventRecord;
  readonly outcome: 'UPDATED' | 'IDEMPOTENT_REPLAY';
}

// ==========================================
// EL-TK-024: Change Prepared Event Timezone Contracts
// ==========================================

export interface ChangePreparedEventTimezoneCommand {
  readonly actorContext: OrganizerActorContext;
  readonly eventId: string;
  readonly timezone: string;
  readonly utcOffsetMinutes?: number;
  readonly expectedRevision?: string;
  readonly idempotencyKey?: string;
}

export interface ChangePreparedEventTimezoneResult {
  readonly event: EventRecord;
  readonly previousTimezone: string;
  readonly warning?: 'RECALCULATED_SCHEDULE' | null;
  readonly outcome: 'TIMEZONE_CHANGED' | 'IDEMPOTENT_REPLAY';
  readonly receipt?: CommandReceipt;
}

// ==========================================
// EL-TK-025: Admin Correct Event Timezone Contracts
// ==========================================

export interface AdminCorrectEventTimezoneCommand {
  readonly actorContext: AdminActorContext;
  readonly eventId: string;
  readonly timezone: string;
  readonly justification: string;
  readonly utcOffsetMinutes?: number;
  readonly idempotencyKey?: string;
}

export interface AdminCorrectEventTimezoneResult {
  readonly event: EventRecord;
  readonly previousTimezone: string;
  readonly outcome: 'TIMEZONE_CORRECTED' | 'IDEMPOTENT_REPLAY';
}

// ==========================================
// EL-TK-031: Preview Draft As Guest Contracts
// ==========================================

export interface EventSnapshot {
  readonly eventId: string;
  readonly name: string;
  readonly status: EventStatus;
  readonly timezone: string;
  readonly startsAtLocal: string | null;
  readonly scheduledAt: Date | null;
  readonly utcOffsetMinutes: number | null;
  readonly welcomeMessage: string | null;
  readonly coverPreviewUrl: string | null;
  readonly uploadsEnabled: boolean;
  readonly guestGalleryEnabled: boolean;
  readonly moderationMode: ModerationMode;
  readonly pinEnabled: boolean;
  readonly isPreview: true;
}

export interface PreviewDraftAsGuestCommand {
  readonly actorContext: OrganizerActorContext;
  readonly eventId: string;
}

export interface PreviewDraftAsGuestResult {
  readonly snapshot: EventSnapshot;
}

// ==========================================
// EL-TK-049: Event Cover Upload Authorization & Confirmation Contracts
// ==========================================

export type CoverAssetStatus =
  | 'RECEIVED'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED'
  | 'QUARANTINED'
  | 'DELETED';

export type CoverUploadIntentStatus =
  | 'AUTHORIZED'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface CoverUploadIntentRecord {
  readonly id: string;
  readonly eventId: string;
  readonly ownerId: string;
  readonly assetId: string;
  readonly declaredSize: bigint;
  readonly declaredType: string;
  readonly stagingKey: string;
  readonly status: CoverUploadIntentStatus;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CoverAssetRecord {
  readonly id: string;
  readonly eventId: string;
  readonly ownerId: string;
  readonly purpose: 'EVENT_COVER';
  readonly status: CoverAssetStatus;
  readonly originalKey: string;
  readonly declaredSize: bigint;
  readonly declaredType: string;
  readonly actualSize: bigint | null;
  readonly detectedType: string | null;
  readonly checksumSha256: string | null;
  readonly thumbnailKey: string | null;
  readonly previewKey: string | null;
  readonly previewUrl: string | null;
  readonly generation: bigint;
  readonly failureReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateCoverUploadCommand {
  readonly actorContext: OrganizerActorContext;
  readonly eventId: string;
  readonly declaredSize: bigint | number;
  readonly declaredType: string;
  readonly expectedConfigRevision?: string;
  readonly idempotencyKey?: string;
  readonly now?: Date;
}

export interface CreateCoverUploadResult {
  readonly intent: CoverUploadIntentRecord;
  readonly uploadGrant: DirectUploadGrant;
  readonly outcome: 'AUTHORIZED' | 'IDEMPOTENT_REPLAY';
}

export interface ConfirmCoverUploadCommand {
  readonly actorContext: OrganizerActorContext;
  readonly intentId: string;
  readonly now?: Date;
}

export interface ConfirmCoverUploadResult {
  readonly asset: CoverAssetRecord;
  readonly outcome: 'CONFIRMED' | 'IDEMPOTENT_REPLAY';
}

// ==========================================
// EL-TK-050: Secure Cover Asset Processing Contracts
// ==========================================

export interface ProcessCoverAssetCommand {
  readonly assetId: string;
  readonly headerBytes?: Buffer | Uint8Array;
  readonly checksumSha256?: string;
  readonly now?: Date;
}

export interface ProcessCoverAssetResult {
  readonly asset: CoverAssetRecord;
  readonly status: 'READY' | 'FAILED' | 'QUARANTINED';
  readonly outcome: 'PROCESSED' | 'IDEMPOTENT_REPLAY';
}

// ==========================================
// EL-TK-051: Assign READY Cover Asset via CAS Contracts
// ==========================================

export interface AssignCoverAssetCommand {
  readonly actorContext: OrganizerActorContext;
  readonly eventId: string;
  readonly assetId: string;
  readonly expectedCoverRevision?: string;
  readonly idempotencyKey?: string;
  readonly now?: Date;
}

export interface AssignCoverAssetResult {
  readonly event: EventRecord;
  readonly assignedAssetId: string;
  readonly previousCoverAssetId: string | null;
  readonly newConfigRevision: string;
  readonly outcome: 'ASSIGNED' | 'IDEMPOTENT_REPLAY';
}

// ==========================================
// EL-TK-052: Asynchronous Cover Assets Cleanup Contracts
// ==========================================

export interface CleanupCoverAssetsCommand {
  readonly eventId: string;
  readonly targetAssetIds?: string[];
  readonly now?: Date;
}

export interface CleanupCoverAssetsResult {
  readonly cleanedAssetIds: string[];
  readonly preservedActiveAssetId: string | null;
  readonly outcome: 'CLEANED_UP';
}

export interface SetEventScheduleCommand {
  readonly actorContext: OrganizerActorContext;
  readonly eventId: string;
  readonly startsAtLocal: string;
  readonly utcOffsetMinutes?: number;
  readonly expectedRevision?: string;
  readonly idempotencyKey?: string;
}

export interface SetEventScheduleResult {
  readonly event: EventRecord;
  readonly outcome: 'UPDATED' | 'IDEMPOTENT_REPLAY';
  readonly receipt?: CommandReceipt;
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

export type UploadMediaType = 'PHOTO' | 'VIDEO';
export type UploadAttemptStatus =
  | 'AUTHORIZED'
  | 'UPLOADING'
  | 'CONFIRMING'
  | 'VALIDATED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface CapacityReservationPort {
  reserveCapacity(command: {
    eventId: string;
    bytes: bigint | number;
    fileSlots?: number;
    mediaType?: 'PHOTO' | 'VIDEO';
    idempotencyKey: string;
  }): Promise<{
    reservation: { id: string; bytes: bigint; fileSlots: number; status: string };
    isExisting: boolean;
  }>;
  releaseReservation?(command: {
    eventId: string;
    reservationId?: string;
    idempotencyKey?: string;
    reason?: string;
  }): Promise<void>;
  commitReservation?(command: {
    eventId: string;
    reservationId?: string;
    idempotencyKey?: string;
  }): Promise<void>;
}

export interface AuthorizeUploadAttemptCommand {
  readonly sessionToken: string;
  readonly declaredSize: bigint | number;
  readonly declaredType: UploadMediaType;
  readonly idempotencyKey: string;
  readonly now?: Date;
}

export interface UploadAttemptRecord {
  readonly id: string;
  readonly eventId: string;
  readonly guestSessionId: string;
  readonly reservationId: string;
  readonly idempotencyKey: string;
  readonly declaredSize: bigint;
  readonly declaredType: UploadMediaType;
  readonly contributorNickname: string;
  readonly status: UploadAttemptStatus;
  readonly objectKey?: string | null;
  readonly actualSize?: bigint | null;
  readonly detectedType?: string | null;
  readonly durationSeconds?: number | null;
  readonly rejectionReason?: string | null;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly updatedAt: Date;
}

export interface AuthorizeUploadAttemptResult {
  readonly attempt: UploadAttemptRecord;
  readonly outcome: 'AUTHORIZED' | 'IDEMPOTENT_REPLAY';
}

export interface DirectUploadGrant {
  readonly attemptId: string;
  readonly objectKey: string;
  readonly uploadUrl: string;
  readonly method: 'PUT' | 'POST';
  readonly headers?: Record<string, string>;
  readonly expiresAt: Date;
}

export interface DirectUploadStoragePort {
  createUploadUrl(params: {
    readonly objectKey: string;
    readonly declaredSize: bigint | number;
    readonly declaredType: string;
    readonly ttlSeconds: number;
  }): Promise<{
    readonly uploadUrl: string;
    readonly method: 'PUT' | 'POST';
    readonly headers?: Record<string, string>;
    readonly expiresAt: Date;
  }>;
  getObjectMetadata(objectKey: string): Promise<{
    readonly objectKey: string;
    readonly sizeBytes: bigint;
    readonly contentType?: string;
    readonly etag?: string;
    readonly lastModified?: Date;
  } | null>;
  readBytesRange?(objectKey: string, start: number, end: number): Promise<Buffer | Uint8Array>;
  abortOrDeleteObject(objectKey: string): Promise<void>;
}

export interface CreateDirectUploadUrlCommand {
  readonly sessionToken: string;
  readonly attemptId: string;
  readonly now?: Date;
}

export interface CreateDirectUploadUrlResult {
  readonly grant: DirectUploadGrant;
  readonly outcome: 'ISSUED' | 'IDEMPOTENT_REPLAY';
}

export interface ConfirmUploadCommand {
  readonly sessionToken: string;
  readonly attemptId: string;
  readonly now?: Date;
}

export interface ConfirmUploadResult {
  readonly attempt: UploadAttemptRecord;
  readonly outcome: 'CONFIRMED' | 'IDEMPOTENT_REPLAY';
}

export interface MediaLimitsConfig {
  readonly maxPhotoBytes: bigint;
  readonly maxVideoBytes: bigint;
  readonly maxVideoDurationSeconds: number;
}

export interface ValidateUploadCommand {
  readonly sessionToken: string;
  readonly attemptId: string;
  readonly headerBytes?: Buffer | Uint8Array;
  readonly limits?: MediaLimitsConfig;
  readonly now?: Date;
}

export interface ValidateUploadResult {
  readonly attempt: UploadAttemptRecord;
  readonly valid: boolean;
  readonly detectedType?: string;
  readonly durationSeconds?: number;
  readonly rejectionReason?: string;
  readonly outcome: 'VALIDATED' | 'REJECTED' | 'IDEMPOTENT_REPLAY';
}

export interface MediaAcceptancePort {
  acceptOriginal(command: {
    readonly intentId: string;
    readonly mediaRef: string;
    readonly eventRef: string;
    readonly guestRef: string;
    readonly generation: bigint;
    readonly expectedRevision: bigint;
    readonly original: {
      readonly namespace: string;
      readonly key: string;
      readonly version: string;
      readonly sha256: string;
      readonly bytes: bigint;
    };
  }): Promise<{
    readonly mediaRef: string;
    readonly jobId: string;
    readonly acceptedAt: Date;
  }>;
}

export interface AcceptUploadCommand {
  readonly sessionToken: string;
  readonly attemptId: string;
  readonly sha256?: string;
  readonly now?: Date;
}

export interface AcceptUploadResult {
  readonly attempt: UploadAttemptRecord;
  readonly mediaRef: string;
  readonly outcome: 'ACCEPTED' | 'IDEMPOTENT_REPLAY';
}

export interface RenewUploadGrantCommand {
  readonly sessionToken: string;
  readonly attemptId: string;
  readonly reason?: string;
  readonly now?: Date;
}

export interface RenewUploadGrantResult {
  readonly grant: DirectUploadGrant;
  readonly outcome: 'RENEWED';
}

export interface ReconcilePolicyCancellationsCommand {
  readonly eventId: string;
  readonly guestSessionId?: string;
  readonly reason: string;
  readonly now?: Date;
}

export interface ReconcilePolicyCancellationsResult {
  readonly cancelledAttemptIds: string[];
  readonly releasedReservationIds: string[];
  readonly preservedAcceptedCount: number;
}

export interface GetUploadBatchSnapshotCommand {
  readonly sessionToken: string;
  readonly now?: Date;
}

export interface UploadBatchItem {
  readonly attemptId: string;
  readonly declaredType: UploadMediaType;
  readonly declaredSize: bigint;
  readonly actualSize: bigint | null;
  readonly status: UploadAttemptStatus;
  readonly contributorNickname: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly rejectionReason: string | null;
  readonly canRetry: boolean;
}

export interface UploadBatchSnapshot {
  readonly eventId: string;
  readonly guestSessionId: string;
  readonly items: UploadBatchItem[];
  readonly totalFiles: number;
  readonly receivedCount: number;
  readonly inProgressCount: number;
  readonly actionRequiredCount: number;
  readonly rejectedCount: number;
}

export interface GetGuestContributionsCommand {
  readonly sessionToken: string;
  readonly now?: Date;
}

export interface GuestContributionItem {
  readonly attemptId: string;
  readonly mediaType: UploadMediaType;
  readonly status: UploadAttemptStatus;
  readonly declaredSize: bigint;
  readonly actualSize: bigint | null;
  readonly detectedType: string | null;
  readonly durationSeconds: number | null;
  readonly rejectionReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface GetGuestContributionsResult {
  readonly eventId: string;
  readonly sessionId: string;
  readonly contributorNickname: string | null;
  readonly items: GuestContributionItem[];
  readonly totalCount: number;
  readonly acceptedCount: number;
}

export interface UpdateEventPinCommand {
  readonly actorContext: OrganizerActorContext;
  readonly eventId: string;
  readonly action: 'CHANGE_PIN' | 'DISABLE_PIN';
  readonly newPin?: string;
  readonly now?: Date;
}

export interface UpdateEventPinResult {
  readonly eventId: string;
  readonly pinEnabled: boolean;
  readonly revokedSessionsCount: number;
  readonly updatedAt: Date;
}

export interface RegeneratePublicCredentialCommand {
  readonly actorContext: OrganizerActorContext;
  readonly eventId: string;
  readonly now?: Date;
}

export interface RegeneratePublicCredentialResult {
  readonly credential: PublicAccessCredentialRecord;
  readonly previousGeneration: number;
  readonly revokedSessionsCount: number;
  readonly outcome: 'REGENERATED';
}

export interface GetShareAccessSnapshotCommand {
  readonly actorContext: OrganizerActorContext;
  readonly eventId: string;
  readonly baseUrl?: string;
  readonly now?: Date;
}

export interface ShareAccessSnapshotResult {
  readonly eventId: string;
  readonly lookupKey: string;
  readonly sharePath: string;
  readonly shareUrl: string;
  readonly generation: number;
  readonly pinRequired: boolean;
  readonly qrPayload: string;
  readonly qrSvg: string;
}

export interface GetRemovalIntakeRouteCommand {
  readonly lookupKey: string;
  readonly baseUrl?: string;
  readonly now?: Date;
}

export interface RemovalIntakeRouteResult {
  readonly eventId: string;
  readonly eventName: string;
  readonly intakePath: string;
  readonly disclaimer: string;
  readonly requiresSession: false;
}

export interface EventAuditRecord {
  readonly id: string;
  readonly procedure:
    | 'EVENT_DRAFT_CREATED'
    | 'EVENT_DRAFT_NAME_UPDATED'
    | 'EVENT_WELCOME_MESSAGE_SET'
    | 'EVENT_MODERATION_MODE_SET'
    | 'EVENT_GUEST_UPLOADS_CONFIGURED'
    | 'EVENT_GUEST_GALLERY_CONFIGURED'
    | 'EVENT_SCHEDULE_SET'
    | 'EVENT_TIMEZONE_CHANGED'
    | 'ADMIN_EVENT_TIMEZONE_CORRECTED'
    | 'EVENT_DRAFT_PREVIEWED'
    | 'EVENT_COVER_UPLOAD_AUTHORIZED'
    | 'EVENT_COVER_UPLOAD_CONFIRMED'
    | 'EVENT_COVER_PROCESSED_READY'
    | 'EVENT_COVER_PROCESSING_FAILED'
    | 'EVENT_COVER_ASSIGNED'
    | 'EVENT_COVER_CLEANED_UP'
    | 'EVENT_SCHEDULED'
    | 'EVENT_ACTIVATED'
    | 'EVENT_CLOSED'
    | 'EVENT_REOPENED'
    | 'EVENT_TEMPORAL_ADVANCE'
    | 'EVENT_SUSPENDED'
    | 'EVENT_REACTIVATED'
    | 'EVENT_VALIDITY_EXTENDED'
    | 'EVENT_INITIAL_PIN_SET'
    | 'EVENT_PIN_UPDATED'
    | 'EVENT_PUBLIC_CREDENTIAL_ISSUED'
    | 'EVENT_PUBLIC_CREDENTIAL_REGENERATED'
    | 'EVENT_PUBLIC_ACCESS_RESOLVED'
    | 'EVENT_SHARE_ACCESS_QUERIED'
    | 'GUEST_SESSION_CREATED'
    | 'GUEST_PIN_VALIDATION_FAILED'
    | 'GUEST_CONSENT_RECORDED'
    | 'GUEST_NICKNAME_SET'
    | 'GUEST_CONTRIBUTIONS_QUERIED'
    | 'REMOVAL_INTAKE_ROUTED'
    | 'UPLOAD_ATTEMPT_AUTHORIZED'
    | 'UPLOAD_URL_ISSUED'
    | 'UPLOAD_CONFIRMED'
    | 'UPLOAD_VALIDATED'
    | 'UPLOAD_ACCEPTED'
    | 'UPLOAD_GRANT_RENEWED'
    | 'UPLOAD_POLICY_CANCELLED'
    | 'EVENT_MANUAL_DELETION_REQUESTED'
    | 'EVENT_MANUAL_DELETION_CANCELLED'
    | 'IRREVERSIBLE_DELETION_INTENT_INGESTED'
    | 'DELETION_MANIFEST_PREPARED'
    | 'MAIN_PURGE_EXECUTED'
    | 'DELETION_TOMBSTONE_RECONCILED'
    | 'DELETION_FINALIZED'
    | 'RESIDUAL_COMPLIANCE_VERIFIED';
  readonly actorId: string;
  readonly targetIdentifier: string;
  readonly result:
    | 'SUCCESS'
    | 'UPDATED'
    | 'RECALCULATED_SCHEDULE'
    | 'TIMEZONE_CHANGED'
    | 'TIMEZONE_CORRECTED'
    | 'COVER_UPLOAD_AUTHORIZED'
    | 'COVER_UPLOAD_CONFIRMED'
    | 'COVER_PROCESSED_READY'
    | 'COVER_PROCESSING_FAILED'
    | 'COVER_ASSIGNED'
    | 'COVER_CLEANED_UP'
    | 'REJECTED_ASSET_NOT_READY'
    | 'REJECTED_REVISION_MISMATCH'
    | 'EXTENDED'
    | 'REACTIVATED'
    | 'REGENERATED'
    | 'PIN_UPDATED'
    | 'PIN_DISABLED'
    | 'TRANSITIONED_TO_GRACE_PERIOD'
    | 'TRANSITIONED_TO_PENDING_DELETION'
    | 'SUSPENDED_PRESERVED'
    | 'NO_OP'
    | 'IDEMPOTENT_REPLAY'
    | 'VALIDATED'
    | 'ACCEPTED'
    | 'CANCELLED'
    | 'RENEWED'
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
    | 'REJECTED_SIZE_MISMATCH'
    | 'REJECTED_UNSUPPORTED_TYPE'
    | 'REJECTED_DURATION_EXCEEDED'
    | 'REJECTED_FILE_CORRUPTED'
    | 'REJECTED_OBJECT_NOT_FOUND'
    | 'REJECTED_ATTEMPT_NOT_FOUND'
    | 'REJECTED_ATTEMPT_EXPIRED'
    | 'REJECTED_ATTEMPT_CANCELLED'
    | 'REJECTED_ATTEMPT_NOT_RETRYABLE'
    | 'REJECTED_TIMEZONE_INVALID'
    | 'CONCURRENCY_CONFLICT'
    | 'FAILURE';
  readonly details?: string;
  readonly timestamp: Date;
}

export interface EventAuditSink {
  record(event: EventAuditRecord): Promise<void>;
}

// ==========================================
// EL-TK-047: Organizer Event & Configuration Query Contracts
// ==========================================

export interface OrganizerEventSummary {
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
  readonly uploadsEnabled: boolean;
  readonly guestGalleryEnabled: boolean;
  readonly moderationMode: ModerationMode;
  readonly pinEnabled: boolean;
  readonly welcomeMessage?: string | null;
  readonly coverAssetId?: string | null;
  readonly revision?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface EventConfigurationCapabilities {
  readonly canEditSchedule: boolean;
  readonly canEditSettings: boolean;
  readonly canManageAccess: boolean;
  readonly canViewLifecycle: boolean;
  readonly canViewCapacity: boolean;
  readonly canPublishOrActivate: boolean;
  readonly canEditName: boolean;
  readonly canSetLocalSchedule: boolean;
  readonly canChangeTimezone: boolean;
}

export interface AuthorizedEventConfiguration {
  readonly event: OrganizerEventSummary;
  readonly revision: string;
  readonly capabilities: EventConfigurationCapabilities;
}

export interface ListOrganizerEventsCommand {
  readonly actorContext: OrganizerActorContext;
}

export interface GetAuthorizedConfigurationCommand {
  readonly actorContext: OrganizerActorContext;
  readonly eventId: string;
}


