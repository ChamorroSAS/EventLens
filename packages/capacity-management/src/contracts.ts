import type { AdminActorContext, OrganizerActorContext } from '@eventlens/identity';

export type CapacityActorContext = AdminActorContext | OrganizerActorContext;

export type CapacityErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_ARGUMENT'
  | 'EVENT_NOT_FOUND'
  | 'PLAN_NOT_FOUND'
  | 'OVERRIDE_NOT_FOUND'
  | 'CANNOT_REDUCE_BELOW_PAST_EXPIRATION';

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
