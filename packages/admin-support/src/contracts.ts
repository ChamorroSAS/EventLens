import type { AdminActorContext } from '@eventlens/identity';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';

export type { AdminActorContext, SqlTransaction, TransactionRunner };

export type AdminSearchEntityType = 'ALL' | 'EVENT' | 'ORGANIZER';

export type AdminSupportErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_ARGUMENT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export class AdminSupportError extends Error {
  constructor(
    public readonly code: AdminSupportErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AdminSupportError';
  }
}

export interface AdminSearchQuery {
  readonly actorContext: AdminActorContext;
  readonly query?: string;
  readonly entityType?: AdminSearchEntityType;
  readonly status?: string;
  readonly page?: number;
  readonly limit?: number;
}

export interface AdminSearchEventItem {
  readonly type: 'EVENT';
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly organizerId: string;
  readonly timezone: string;
  readonly scheduledAt: string | null;
  readonly createdAt: string;
}

export interface AdminSearchOrganizerItem {
  readonly type: 'ORGANIZER';
  readonly id: string;
  readonly email: string;
  readonly status: string;
  readonly declaredAdult: boolean;
  readonly createdAt: string;
}

export type AdminSearchResultItem = AdminSearchEventItem | AdminSearchOrganizerItem;

export interface AdminSearchPagination {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface AdminSearchResult {
  readonly items: readonly AdminSearchResultItem[];
  readonly pagination: AdminSearchPagination;
}

export interface AdminSupportAuditEvent {
  readonly procedure: 'ADMIN_SEARCH_PERFORMED' | 'ADMIN_EVENT_DETAIL_VIEWED';
  readonly principalId: string;
  readonly details: string;
  readonly timestamp: Date;
}

export interface AdminSupportAuditSink {
  record(event: AdminSupportAuditEvent): Promise<void>;
}

// ==========================================
// EL-TK-147: Detalle Administrativo Agregado
// ==========================================

export type SectionAvailability = 'AVAILABLE' | 'UNAVAILABLE' | 'DEGRADED';

export interface AdminEventDetailQuery {
  readonly actorContext: AdminActorContext;
  readonly eventId: string;
}

export interface AdminEventOwnerSection {
  readonly id: string;
  readonly email: string;
  readonly status: string;
  readonly declaredAdult: boolean;
  readonly createdAt: string;
}

export interface AdminEventLifecycleSection {
  readonly status: string;
  readonly timezone: string;
  readonly startsAtLocal: string | null;
  readonly scheduledAt: string | null;
  readonly expiresAt: string | null;
  readonly graceEndsAt: string | null;
  readonly activatedAt: string | null;
  readonly closedAt: string | null;
  readonly suspendedAt: string | null;
  readonly suspensionReason: string | null;
  readonly previousStatus: string | null;
  readonly uploadsEnabled: boolean;
  readonly guestGalleryEnabled: boolean;
}

export interface AdminEventCapacitySection {
  readonly availability: SectionAvailability;
  readonly planCode?: string;
  readonly storageLimitBytes?: string;
  readonly storageUsedBytes?: string;
  readonly fileLimit?: number;
  readonly filesCount?: number;
  readonly unavailableReason?: string;
}

export interface AdminEventJobsSection {
  readonly availability: SectionAvailability;
  readonly totalJobs?: number;
  readonly activeJobs?: number;
  readonly failedJobs?: number;
  readonly deadJobs?: number;
  readonly unavailableReason?: string;
}

export interface AdminEventCapabilities {
  readonly canSuspend: boolean;
  readonly canReactivate: boolean;
  readonly canClose: boolean;
  readonly canReopen: boolean;
  readonly canExtendValidity: boolean;
  readonly canViewAudit: boolean;
  readonly canInspectJobs: boolean;
  readonly canRequestMediaGrant: boolean;
}

export interface AdminEventDetailSnapshot {
  readonly eventId: string;
  readonly name: string;
  readonly overallAvailability: 'COMPLETE' | 'PARTIAL';
  readonly owner: AdminEventOwnerSection;
  readonly lifecycle: AdminEventLifecycleSection;
  readonly capacity: AdminEventCapacitySection;
  readonly jobs: AdminEventJobsSection;
  readonly capabilities: AdminEventCapabilities;
  readonly fetchedAt: string;
}

export interface AdminCapacityPort {
  getEventCapacity(eventId: string): Promise<AdminEventCapacitySection>;
}

export interface AdminJobsPort {
  getEventJobsSummary(eventId: string): Promise<AdminEventJobsSection>;
}
