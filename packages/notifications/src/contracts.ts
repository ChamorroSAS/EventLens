export type NotificationIntentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'SUPERSEDED'
  | 'CANCELLED'
  | 'FAILED';

export interface NotificationIntentRecord {
  id: string;
  dedupKey: string;
  recipientRef: string;
  recipientEmail?: string | null;
  notificationType: string;
  resourceRef: string;
  status: NotificationIntentStatus;
  payload: Record<string, unknown>;
  effectiveAt: Date;
  expiresAt?: Date | null;
  supersededAt?: Date | null;
  supersededBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DomainFactActorContext {
  actorType: 'SYSTEM' | 'ADMIN_HUMAN' | 'ORGANIZER_HUMAN';
  actorId: string;
}

export interface RecordDomainFactCommand {
  actorContext: DomainFactActorContext;
  dedupKey: string;
  recipientRef: string;
  recipientEmail?: string | null;
  notificationType: string;
  resourceRef: string;
  payload: Record<string, unknown>;
  effectiveAt?: Date;
  expiresAt?: Date | null;
  supersedesDedupKeys?: string[];
}

export type RecordFactOutcome = 'CREATED' | 'IDEMPOTENT_REPLAY';

export interface RecordDomainFactResult {
  outcome: RecordFactOutcome;
  intent: NotificationIntentRecord;
  supersededCount?: number;
}

export interface SupersedeIntentCommand {
  actorContext: DomainFactActorContext;
  intentId?: string;
  dedupKey?: string;
  reason: string;
}

export interface NotificationAuditRecord {
  id: string;
  intentId?: string | null;
  dedupKey: string;
  action: string;
  recipientRef: string;
  notificationType: string;
  result: string;
  details?: string | null;
  timestamp: Date;
}

export interface NotificationAuditSink {
  record(audit: NotificationAuditRecord): Promise<void>;
}

export type NotificationErrorCode =
  | 'INVALID_ARGUMENT'
  | 'UNAUTHORIZED'
  | 'INVALID_RECIPIENT'
  | 'INVALID_NOTIFICATION_TYPE'
  | 'INVALID_RESOURCE'
  | 'INVALID_DEDUP_KEY'
  | 'INTENT_NOT_FOUND'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_STATE_TRANSITION';

export class NotificationError extends Error {
  constructor(
    public readonly code: NotificationErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'NotificationError';
  }
}

export interface SendEmailRequest {
  to: string;
  subject: string;
  html: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface SendEmailResponse {
  providerMessageId: string;
  acceptedAt: Date;
}

/**
 * Decoupled port for sending email notifications (EL-TK-157, DEC-021).
 * Implementations may use SMTP, SES, SendGrid, or test lab mocks.
 */
export interface EmailSender {
  send(request: SendEmailRequest): Promise<SendEmailResponse>;
}

export interface EmailNotificationSpec {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type DeliveryAttemptStatus = 'SENT' | 'FAILED' | 'SUPERSEDED' | 'DEAD';

export interface NotificationDeliveryAttemptRecord {
  id: string;
  intentId: string;
  jobId?: string | null;
  attemptNumber: number;
  channel: string;
  status: DeliveryAttemptStatus;
  providerMessageId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  latencyMs?: number | null;
  attemptedAt: Date;
}

export interface NotificationDeliveryStatus {
  intentId: string;
  intentStatus: NotificationIntentStatus;
  attemptsCount: number;
  lastAttemptStatus?: DeliveryAttemptStatus | null;
  isDeliveryAcredited: boolean;
}

export interface ProcessEmailJobResult {
  outcome: 'SENT' | 'RETRY_SCHEDULED' | 'DEAD' | 'SKIPPED_OBSOLETE' | 'ALREADY_COMMITTED';
  attemptNumber: number;
  providerMessageId?: string | null;
  retryAt?: Date | null;
  errorCode?: string | null;
}

/**
 * In-app notice severity semantics (EL-TK-158, ui-mvp-epic-review.md).
 * Used for contextual presentation without intrusive banners or redundant notification centers.
 */
export type InAppNoticeSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface InAppNoticeAction {
  label: string;
  destination: string;
  isExternal?: boolean;
}

export interface InAppNotice {
  id: string;
  intentId: string;
  notificationType: string;
  title: string;
  fact: string;
  date: Date;
  validUntil: Date | null;
  consequence: string;
  action: InAppNoticeAction;
  severity: InAppNoticeSeverity;
  resourceRef: string;
  recipientRef: string;
}

export interface InAppNoticeProjection {
  recipientRef: string;
  resourceRef?: string;
  notices: InAppNotice[];
  totalCount: number;
  hasActiveNotices: boolean;
  projectedAt: Date;
}

/**
 * Contracts for account, security and event lifecycle notice generation (EL-TK-162).
 */
export type SecurityNoticeEventType =
  | 'NEW_LOGIN'
  | 'PASSWORD_CHANGED'
  | 'SESSION_REVOKED'
  | 'RECOVERY_REQUESTED'
  | 'CREDENTIAL_UPDATED';

export interface AccountSecurityFact {
  actorContext: DomainFactActorContext;
  accountRef: string;
  recipientEmail?: string | null;
  eventType: SecurityNoticeEventType;
  ipAddress?: string | null;
  userAgent?: string | null;
  occurredAt?: Date;
  dedupKey?: string;
}

export interface EventSuspensionFact {
  actorContext: DomainFactActorContext;
  eventRef: string;
  organizerRef: string;
  recipientEmail?: string | null;
  reason?: string | null;
  isRestrictedReason?: boolean;
  suppressNotice?: boolean;
  suspendedAt?: Date;
}

export interface EventReactivationFact {
  actorContext: DomainFactActorContext;
  eventRef: string;
  organizerRef: string;
  recipientEmail?: string | null;
  reactivatedAt?: Date;
  previousSuspensionDedupKey?: string;
}

export interface EventUpcomingFact {
  actorContext: DomainFactActorContext;
  eventRef: string;
  eventName: string;
  organizerRef: string;
  recipientEmail?: string | null;
  startsAt: Date;
}

export interface EventConfigurationChangedFact {
  actorContext: DomainFactActorContext;
  eventRef: string;
  organizerRef: string;
  recipientEmail?: string | null;
  changeType: 'DATES_CHANGED' | 'ACCESS_POLICY_UPDATED' | 'GALLERY_VISIBILITY_UPDATED';
  summary: string;
  effectiveAt?: Date;
}

export type NoticeGenerationOutcome =
  | 'NOTICE_GENERATED'
  | 'NOTICE_SUPPRESSED'
  | 'IDEMPOTENT_REPLAY'
  | 'SUPERSEDED_PREVIOUS';

export interface GenerateNoticeResult {
  outcome: NoticeGenerationOutcome;
  intent?: NotificationIntentRecord | null;
  suppressedReason?: string | null;
  supersededCount?: number;
}

/**
 * Contracts for capacity usage threshold notice generation (EL-TK-160, DEC-021, DEC-027).
 * Consumes signals from EL-EP-011 / EL-TK-138 with strict deduplication.
 */
export type CapacityThresholdNoticeType = 'USAGE_80' | 'USAGE_100';

export interface CapacityThresholdFact {
  actorContext: DomainFactActorContext;
  eventId: string;
  organizerRef: string;
  recipientEmail?: string | null;
  thresholdType: CapacityThresholdNoticeType;
  thresholdPercent?: number;
  currentStoragePercent?: number;
  currentFilesPercent?: number;
  consumedBytes?: bigint | number;
  limitBytes?: bigint | number;
  consumedFiles?: number;
  limitFiles?: number;
  dedupKey?: string;
  occurredAt?: Date;
}

/**
 * Contracts for case report and moderation intervention notice generation (EL-TK-163, Q-018, DEC-021, DEC-023, DEC-088).
 * Consumes case facts from EL-EP-009 / media-inspection and audit contracts from EL-EP-014.
 */
export type CaseReportSeverity = 'CRITICAL' | 'NORMAL' | 'UNCLASSIFIED';
export type CaseRecipientRole = 'ADMIN' | 'ORGANIZER';
export type CaseActionType = 'CASE_REPORTED' | 'CASE_RESOLVED' | 'ADMIN_INTERVENTION';

export interface CaseNotificationFact {
  actorContext: DomainFactActorContext;
  caseRef: string;
  eventRef: string;
  recipientRef: string;
  recipientRole: CaseRecipientRole;
  recipientEmail?: string | null;
  severity: CaseReportSeverity;
  actionType: CaseActionType;
  isRestrictedLegalOrSecurity?: boolean;
  suppressNotice?: boolean;
  suppressionRef?: string | null;
  summary?: string | null;
  dedupKey?: string;
  occurredAt?: Date;
}

/**
 * Contracts for lifecycle milestone notices scheduler (EL-TK-159, EL-EP-013).
 * Consumes the canonical EventLifecycleTimeline from EL-EP-003/015 to schedule warning
 * and milestone notices for the event organizer without altering lifecycle logic.
 */

/**
 * All notification types emitted by the lifecycle notice scheduler.
 * Covers: pre-event, expiry warnings (7/3/1d), grace-entry, deletion-upcoming, and deletion.
 */
export type LifecycleMilestoneType =
  | 'LIFECYCLE_EVENT_UPCOMING_24H'
  | 'LIFECYCLE_EXPIRY_WARNING_7D'
  | 'LIFECYCLE_EXPIRY_WARNING_3D'
  | 'LIFECYCLE_EXPIRY_WARNING_1D'
  | 'LIFECYCLE_GRACE_ENTERED'
  | 'LIFECYCLE_DELETION_UPCOMING'
  | 'LIFECYCLE_DELETED';

/**
 * Canonical lifecycle timeline fact consumed from EL-EP-003/015.
 * All timestamps are UTC. Timezone is only used for local string presentation in the notice copy.
 */
export interface LifecycleTimelineFact {
  actorContext: DomainFactActorContext;
  /** Canonical event ID */
  eventRef: string;
  /** Display name of the event (used in notice copy) */
  eventName: string;
  /** Organizer who will receive the notices */
  organizerRef: string;
  recipientEmail?: string | null;
  /** UTC timestamp when the event starts / is activated */
  scheduledAt: Date;
  /** UTC timestamp when validity period ends (expiresAt) */
  expiresAt: Date;
  /** UTC timestamp when the grace period ends (graceEndsAt); after this the event is permanently deleted */
  graceEndsAt: Date;
  /** IANA timezone — only for local copy presentation */
  timezone: string;
  /**
   * Optional: window key prefix distinguishing this validity window.
   * When validity is extended the windowKey changes, making prior window's notices obsolete via supersession.
   * Defaults to a deterministic prefix derived from eventRef + expiresAt ISO string.
   */
  windowKey?: string;
}

/**
 * Outcome for a single milestone notice generation attempt.
 */
export interface LifecycleMilestoneResult {
  milestone: LifecycleMilestoneType;
  outcome: NoticeGenerationOutcome | 'SKIPPED_WINDOW_TOO_SHORT';
  intent?: NotificationIntentRecord | null;
}

/**
 * Result of scheduling all applicable lifecycle notices for a given timeline fact.
 */
export interface ScheduleLifecycleNoticesResult {
  eventRef: string;
  windowKey: string;
  milestones: LifecycleMilestoneResult[];
  scheduledCount: number;
  skippedCount: number;
  supersededCount: number;
}

/**
 * Contracts for export availability, expiration and invalidation notices (EL-TK-161, DEC-021, DEC-048, DEC-090).
 * Consumes verified facts from Export Management (EL-EP-010 / EL-TK-127..131).
 */
export type ExportNoticeType =
  | 'EXPORT_AVAILABLE'
  | 'EXPORT_EXPIRED'
  | 'EXPORT_INVALIDATED';

export interface ExportLifecycleFact {
  actorContext: DomainFactActorContext;
  exportId: string;
  eventId: string;
  organizerRef: string;
  recipientEmail?: string | null;
  noticeType: ExportNoticeType;
  generation?: bigint | number;
  partCount?: number;
  totalSizeBytes?: bigint | number;
  expiresAt?: Date | null;
  invalidationReason?: string | null;
  dedupKey?: string;
  occurredAt?: Date;
}
