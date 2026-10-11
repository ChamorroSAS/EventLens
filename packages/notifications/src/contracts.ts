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

