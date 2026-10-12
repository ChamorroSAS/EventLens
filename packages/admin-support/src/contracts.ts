import type { AdminActorContext } from '@eventlens/identity';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';

export type { AdminActorContext, SqlTransaction, TransactionRunner };

export type AdminSearchEntityType = 'ALL' | 'EVENT' | 'ORGANIZER';

export type AdminSupportErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_ARGUMENT'
  | 'NOT_FOUND'
  | 'MEDIA_NOT_FOUND'
  | 'MEDIA_UNAVAILABLE'
  | 'CROSS_EVENT_MISMATCH'
  | 'INCOMPATIBLE_JOB_STATUS'
  | 'JOB_LOCKED_OR_PROCESSING'
  | 'IDEMPOTENCY_CONFLICT'
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
  readonly procedure:
    | 'ADMIN_SEARCH_PERFORMED'
    | 'ADMIN_EVENT_DETAIL_VIEWED'
    | 'ADMIN_JOB_LIST_VIEWED'
    | 'ADMIN_JOB_DETAIL_VIEWED'
    | 'ADMIN_JOB_ACTION_EXECUTED'
    | 'ADMIN_MEDIA_ACCESS_GRANTED';
  readonly principalId: string;
  readonly details: string;
  readonly timestamp: Date;
}

export interface AdminSupportAuditSink {
  record(event: AdminSupportAuditEvent): Promise<void>;
}

// ==========================================
// EL-TK-148: Diagnóstico y Consulta de Jobs
// ==========================================

export type AdminJobStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'RETRYING'
  | 'FAILED'
  | 'DEAD'
  | 'CANCELLED';

export interface AdminJobCapabilities {
  readonly canRetry: boolean;
  readonly canCancel: boolean;
  readonly canMarkDead: boolean;
}

export interface AdminJobAttemptHistoryItem {
  readonly number: number;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly result: string | null;
}

export interface AdminJobSummaryItem {
  readonly id: string;
  readonly type: string;
  readonly status: AdminJobStatus;
  readonly queue: string;
  readonly priority: number;
  readonly resourceRef: string;
  readonly attempts: number;
  readonly availableAt: string;
  readonly cancelled: boolean;
  readonly lastError?: string;
  readonly capabilities: AdminJobCapabilities;
}

export interface AdminJobDetail {
  readonly id: string;
  readonly type: string;
  readonly status: AdminJobStatus;
  readonly queue: string;
  readonly priority: number;
  readonly resourceRef: string;
  readonly attempts: number;
  readonly availableAt: string;
  readonly deadline: string | null;
  readonly cancelled: boolean;
  readonly sanitizedError: string | null;
  readonly attemptsHistory: readonly AdminJobAttemptHistoryItem[];
  readonly capabilities: AdminJobCapabilities;
}

export interface AdminQueryJobsQuery {
  readonly actorContext: AdminActorContext;
  readonly resourceRef?: string;
  readonly status?: AdminJobStatus;
  readonly page?: number;
  readonly limit?: number;
}

export interface AdminQueryJobsResult {
  readonly items: readonly AdminJobSummaryItem[];
  readonly pagination: AdminSearchPagination;
}

export interface AdminGetJobDetailQuery {
  readonly actorContext: AdminActorContext;
  readonly jobId: string;
}

// ==========================================
// EL-TK-149: Acciones Administrativas sobre Jobs
// ==========================================

export type AdminJobAction = 'RETRY' | 'CANCEL' | 'MARK_DEAD';

export interface ExecuteJobActionCommand {
  readonly actorContext: AdminActorContext;
  readonly jobId: string;
  readonly action: AdminJobAction;
  readonly reason: string;
  readonly idempotencyKey: string;
}

export interface ExecuteJobActionResult {
  readonly outcome: 'EXECUTED' | 'IDEMPOTENT_REPLAY';
  readonly jobId: string;
  readonly action: AdminJobAction;
  readonly previousStatus: AdminJobStatus;
  readonly newStatus: AdminJobStatus;
  readonly executedAt: string;
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

// ==========================================
// EL-TK-150: Acceso Multimedia Administrativo Justificado
// ==========================================

export type AdminMediaPurpose =
  | 'INCIDENT_INVESTIGATION'
  | 'SUPPORT_REQUEST'
  | 'CORRUPTION_DIAGNOSIS'
  | 'LEGAL_OR_SAFETY';

export interface RequestMediaGrantCommand {
  readonly actorContext: AdminActorContext;
  readonly eventId: string;
  readonly mediaId: string;
  readonly purpose: AdminMediaPurpose;
  readonly reason: string;
  readonly preferredTarget?: 'PREVIEW' | 'DETAIL';
  readonly ttlSeconds?: number;
}

export interface AdministrativeSupportMediaGrant {
  readonly grantId: string;
  readonly eventId: string;
  readonly mediaId: string;
  readonly purpose: AdminMediaPurpose;
  readonly targetKind: 'PREVIEW' | 'DETAIL';
  readonly storageKey: string;
  readonly downloadUrl: string;
  readonly grantedAt: string;
  readonly expiresAt: string;
  readonly grantedTo: string;
}

export interface MediaGrantSigner {
  signDownloadUrl(key: string, ttlSeconds: number): Promise<string>;
}
