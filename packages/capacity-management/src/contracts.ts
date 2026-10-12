import type { AdminActorContext, OrganizerActorContext } from '@eventlens/identity';

export type CapacityActorContext = AdminActorContext | OrganizerActorContext;

export type CapacityErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_ARGUMENT'
  | 'EVENT_NOT_FOUND'
  | 'PLAN_NOT_FOUND'
  | 'OVERRIDE_NOT_FOUND'
  | 'CANNOT_REDUCE_BELOW_PAST_EXPIRATION'
  | 'INSUFFICIENT_STORAGE_CAPACITY'
  | 'INSUFFICIENT_FILE_CAPACITY'
  | 'FILE_SIZE_EXCEEDS_LIMIT'
  | 'RESERVATION_NOT_FOUND'
  | 'IDEMPOTENCY_CONFLICT'
  | 'RESERVATION_ALREADY_COMMITTED'
  | 'MEDIA_NOT_FOUND'
  | 'MEDIA_ALREADY_PURGED'
  | 'MEDIA_CONSUMPTION_CONFLICT';

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

