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
