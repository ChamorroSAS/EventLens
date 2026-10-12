import type { AdminActorContext, OrganizerActorContext } from '@eventlens/identity';

export type CapacityActorContext = AdminActorContext | OrganizerActorContext;

export type CapacityErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_ARGUMENT'
  | 'EVENT_NOT_FOUND'
  | 'PLAN_NOT_FOUND'
  | 'OVERRIDE_NOT_FOUND'
  | 'CANNOT_REDUCE_BELOW_PAST_EXPIRATION'
  | 'CANNOT_REDUCE_BELOW_USAGE'
  | 'INSUFFICIENT_STORAGE_CAPACITY'
  | 'INSUFFICIENT_FILE_CAPACITY'
  | 'FILE_SIZE_EXCEEDS_LIMIT'
  | 'RESERVATION_NOT_FOUND'
  | 'IDEMPOTENCY_CONFLICT'
  | 'RESERVATION_ALREADY_COMMITTED'
  | 'MEDIA_NOT_FOUND'
  | 'MEDIA_ALREADY_PURGED'
  | 'MEDIA_CONSUMPTION_CONFLICT'
  | 'CONFLICT'
  | 'EXTENSION_REQUEST_NOT_FOUND'
  | 'EXTENSION_REQUEST_INVALID_STATE';

export class CapacityError extends Error {
  constructor(
    public readonly code: CapacityErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'CapacityError';
  }
}

export interface PlanRecord {
  id: string;
  code: string;
  name: string;
  storageBytes: bigint;
  maxFiles: number;
  maxPhotoBytes: bigint;
  maxVideoBytes: bigint;
  maxVideoDurationSeconds: number;
  retentionDays: number;
  createdAt: Date;
}

export interface PlanAssignmentRecord {
  id: string;
  eventId: string;
  planId: string;
  status: 'ACTIVE' | 'INACTIVE';
  assignedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanOverrideRecord {
  id: string;
  eventId: string;
  storageBytes: bigint | null;
  maxFiles: number | null;
  retentionDays: number | null;
  reason: string;
  authorizedBy: string;
  status: 'ACTIVE' | 'REMOVED';
  createdAt: Date;
  removedAt: Date | null;
  updatedAt: Date;
}

export interface EffectiveLimits {
  eventId: string;
  planCode: string;
  planName: string;
  storageBytes: bigint;
  maxFiles: number;
  maxPhotoBytes: bigint;
  maxVideoBytes: bigint;
  maxVideoDurationSeconds: number;
  retentionDays: number;
  isOverrideActive: boolean;
  activeOverrideId: string | null;
  resolvedAt: Date;
}

export interface AssignPlanCommand {
  eventId: string;
  planCode?: string;
  actorContext?: CapacityActorContext;
}

export interface ResolveEffectiveLimitsCommand {
  eventId: string;
  actorContext?: CapacityActorContext;
}

export interface ApplyPlanOverrideCommand {
  eventId: string;
  actorContext: AdminActorContext;
  storageBytes?: bigint;
  maxFiles?: number;
  retentionDays?: number;
  reason: string;
}

export interface RemovePlanOverrideCommand {
  eventId: string;
  actorContext: AdminActorContext;
  eventStatus?: string;
  eventAnchorDate?: Date;
  now?: Date;
  reason: string;
}

export interface CapacityAuditRecord {
  id: string;
  procedure: string;
  actorId: string;
  eventId: string;
  details?: string;
  timestamp: Date;
}

export type ReservationStatus = 'ACTIVE' | 'RELEASED' | 'COMMITTED';

export interface CapacityReservationRecord {
  id: string;
  eventId: string;
  idempotencyKey: string;
  bytes: bigint;
  fileSlots: number;
  mediaType: 'PHOTO' | 'VIDEO' | null;
  status: ReservationStatus;
  releaseReason: string | null;
  createdAt: Date;
  releasedAt: Date | null;
  committedAt: Date | null;
  updatedAt: Date;
}

export interface ReserveCapacityCommand {
  eventId: string;
  bytes: bigint | number;
  fileSlots?: number;
  mediaType?: 'PHOTO' | 'VIDEO';
  idempotencyKey: string;
}

export interface ReserveCapacityResult {
  reservation: CapacityReservationRecord;
  isExisting: boolean;
}

export interface ReleaseReservationCommand {
  eventId: string;
  reservationId?: string;
  idempotencyKey?: string;
  reason?: string;
}

export interface CommitReservationCommand {
  eventId: string;
  reservationId?: string;
  idempotencyKey?: string;
}

export interface EventCapacitySnapshot {
  eventId: string;
  effectiveLimits: EffectiveLimits;
  consumedBytes: bigint;
  consumedFiles: number;
  activeReservedBytes: bigint;
  activeReservedFiles: number;
  availableStorageBytes: bigint;
  availableFiles: number;
  snapshotAt: Date;
}

// ==========================================
// EL-TK-137: Consolidación y Purga de Originales
// ==========================================

export type MediaLifecycleLogicalStatus =
  | 'ACTIVE'
  | 'TRASHED'
  | 'QUARANTINED'
  | 'HIDDEN'
  | 'PURGED';

/**
 * DEC-079 / DEC-080: Estados lógicos no liberan cuota comercial.
 * Solo la confirmación de purga física ('PURGED') libera cuota.
 */
export function doesMediaRetainCommercialQuota(status: MediaLifecycleLogicalStatus): boolean {
  return status !== 'PURGED';
}

export type MediaArtifactRole =
  | 'ORIGINAL'
  | 'PREVIEW'
  | 'THUMBNAIL'
  | 'EXPORT_ARCHIVE'
  | 'COVER_DERIVATIVE';

/**
 * DEC-096: Portadas, derivados y ZIP permanecen fuera del consumo comercial.
 * Solo los originales cuentan para la cuota del evento.
 */
export function isArtifactBillableAgainstQuota(role: MediaArtifactRole): boolean {
  return role === 'ORIGINAL';
}

export interface SettleOriginalAcceptanceCommand {
  eventId: string;
  mediaId: string;
  bytes: bigint | number;
  fileSlots?: number;
  reservationId?: string;
  idempotencyKey?: string;
  mediaType?: 'PHOTO' | 'VIDEO';
  artifactRole?: MediaArtifactRole;
}

export interface SettleOriginalAcceptanceResult {
  eventId: string;
  mediaId: string;
  bytes: bigint;
  fileSlots: number;
  isExisting: boolean;
  settledAt: Date;
  reservationCommitted: boolean;
}

export interface ConfirmPhysicalPurgeCommand {
  eventId: string;
  mediaId: string;
  purgeReceiptId: string;
  bytes?: bigint | number;
  fileSlots?: number;
}

export interface ConfirmPhysicalPurgeResult {
  eventId: string;
  mediaId: string;
  purgeReceiptId: string;
  bytesReleased: bigint;
  filesReleased: number;
  isExisting: boolean;
  releasedAt: Date;
}

export interface MediaConsumptionRecord {
  id: string;
  eventId: string;
  mediaId: string;
  bytes: bigint;
  fileSlots: number;
  reservationId: string | null;
  status: 'COMMITTED' | 'PURGED';
  committedAt: Date;
  purgedAt: Date | null;
}

// ==========================================
// EL-TK-135: Consulta de Consumo Comercial y Capacidad
// ==========================================

export interface QueryCommercialCapacityCommand {
  eventId: string;
  actorContext?: CapacityActorContext;
}

export interface CapacityResourceQuantity {
  bytes: bigint;
  megabytes: number;
  gigabytes: number;
  files: number;
}

export interface CapacityUsagePercentages {
  storagePercent: number;
  filesPercent: number;
}

export interface CapacityUsageFlags {
  isZeroUsage: boolean;
  isOverStorageQuota: boolean;
  isOverFilesQuota: boolean;
  isNearStorageLimit: boolean;
  isNearFilesLimit: boolean;
}

export interface CommercialCapacityUsageSummary {
  eventId: string;
  effectiveLimits: EffectiveLimits;
  consumedStorage: CapacityResourceQuantity;
  activeReservations: CapacityResourceQuantity;
  available: CapacityResourceQuantity;
  usagePercentage: CapacityUsagePercentages;
  flags: CapacityUsageFlags;
  snapshotAt: Date;
}

// ==========================================
// EL-TK-138: Señales Deduplicadas de Uso al 80% y 100%
// ==========================================

export type CapacityThresholdType = 'USAGE_80' | 'USAGE_100';

export interface UsageThresholdSignal {
  readonly eventId: string;
  readonly thresholdType: CapacityThresholdType;
  readonly thresholdPercent: number;
  readonly currentStoragePercent: number;
  readonly currentFilesPercent: number;
  readonly consumedBytes: bigint;
  readonly limitBytes: bigint;
  readonly consumedFiles: number;
  readonly limitFiles: number;
  readonly dedupKey: string;
  readonly emittedAt: Date;
}

export interface EvaluateUsageThresholdsCommand {
  readonly eventId: string;
  readonly now?: Date;
}

export interface EvaluateUsageThresholdsResult {
  readonly eventId: string;
  readonly signalsEmitted: readonly UsageThresholdSignal[];
  readonly thresholdStates: {
    readonly usage80: 'ARMED' | 'TRIGGERED';
    readonly usage100: 'ARMED' | 'TRIGGERED';
  };
}

export interface CapacitySignalSink {
  emitSignal(signal: UsageThresholdSignal): Promise<void>;
}

// ==========================================
// EL-TK-139 / 140 / 141: Solicitudes de Ampliación
// ==========================================

export type ExtensionRequestType = 'STORAGE' | 'DURATION' | 'BOTH';

export type ExtensionRequestStatus =
  | 'PENDING_REVIEW'
  | 'INFORMATION_REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export type ExtensionMessageAuthorRole = 'ORGANIZER' | 'ADMIN';

export type ExtensionMessageType =
  | 'INITIAL_REQUEST'
  | 'INFORMATION_REQUESTED'
  | 'INFORMATION_PROVIDED'
  | 'APPROVED'
  | 'REJECTED';

export interface ExtensionRequestMessage {
  id: string;
  requestId: string;
  authorRole: ExtensionMessageAuthorRole;
  authorId: string;
  messageType: ExtensionMessageType;
  content: string;
  createdAt: Date;
}

export interface ExtensionRequest {
  id: string;
  eventId: string;
  requestedBy: string;
  requestType: ExtensionRequestType;
  additionalGb: number | null;
  additionalDays: number | null;
  reason: string;
  status: ExtensionRequestStatus;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  decisionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  messages?: ExtensionRequestMessage[];
}

export interface CreateExtensionRequestCommand {
  eventId: string;
  actorContext: CapacityActorContext;
  requestType: ExtensionRequestType;
  additionalGb?: number;
  additionalDays?: number;
  reason: string;
}

export interface RespondExtensionInfoCommand {
  requestId: string;
  actorContext: CapacityActorContext;
  response: string;
}

export type ExtensionDecisionType = 'APPROVE' | 'REJECT' | 'REQUEST_INFO';

export interface ReviewExtensionRequestCommand {
  requestId: string;
  actorContext: CapacityActorContext;
  decision: ExtensionDecisionType;
  decisionReason: string;
  approvedGb?: number;
  approvedDays?: number;
}



