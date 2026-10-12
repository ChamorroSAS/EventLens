export type AdminSearchEntityType = 'ALL' | 'EVENT' | 'ORGANIZER';

export interface AdminSearchFilter {
  query?: string;
  entityType?: AdminSearchEntityType;
  status?: string;
  page?: number;
  limit?: number;
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

export type SectionAvailability = 'AVAILABLE' | 'UNAVAILABLE' | 'DEGRADED';

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
  readonly isOverrideActive?: boolean;
  readonly storageLimitBytes?: string;
  readonly storageUsedBytes?: string;
  readonly reservedStorageBytes?: string;
  readonly fileLimit?: number;
  readonly filesCount?: number;
  readonly reservedFiles?: number;
  readonly retentionDays?: number;
  readonly baseStorageLimitBytes?: string;
  readonly baseMaxFiles?: number;
  readonly baseRetentionDays?: number;
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

export interface AdminEventInvitationsSection {
  readonly availability: SectionAvailability;
  readonly invitationCode?: string;
  readonly status?: 'USED' | 'PENDING' | 'REVOKED' | 'EXPIRED';
  readonly issuedAt?: string;
  readonly usedAt?: string | null;
  readonly unavailableReason?: string;
}

export interface AdminCapacityRequestMessageItem {
  readonly id: string;
  readonly authorRole: 'ORGANIZER' | 'ADMIN';
  readonly content: string;
  readonly createdAt: string;
}

export interface AdminCapacityRequestItem {
  readonly requestId: string;
  readonly requestType?: 'STORAGE' | 'DURATION' | 'BOTH';
  readonly requestedPlan?: string;
  readonly additionalGb?: number | null;
  readonly additionalDays?: number | null;
  readonly status: 'PENDING' | 'PENDING_REVIEW' | 'INFORMATION_REQUESTED' | 'APPROVED' | 'REJECTED';
  readonly requestedAt: string;
  readonly justification: string;
  readonly messages?: readonly AdminCapacityRequestMessageItem[];
}

export interface AdminEventCapacityRequestsSection {
  readonly availability: SectionAvailability;
  readonly requests?: readonly AdminCapacityRequestItem[];
  readonly unavailableReason?: string;
}

export interface AdminApplyOverrideCommand {
  readonly storageBytes?: string;
  readonly maxFiles?: number;
  readonly retentionDays?: number;
  readonly reason: string;
}

export interface AdminRemoveOverrideCommand {
  readonly reason: string;
}

export interface AdminReviewRequestCommand {
  readonly requestId: string;
  readonly decision: 'APPROVE' | 'REQUEST_INFO' | 'REJECT';
  readonly reason: string;
  readonly overrideLimits?: {
    readonly storageBytes?: string;
    readonly maxFiles?: number;
    readonly retentionDays?: number;
  };
}

export interface AdminReportSummaryItem {
  readonly reportId: string;
  readonly reasonCategory: string;
  readonly status: 'PENDING' | 'RESOLVED' | 'DISMISSED';
  readonly createdAt: string;
  readonly mediaRef?: string;
}

export interface AdminEventReportsSection {
  readonly availability: SectionAvailability;
  readonly totalReports?: number;
  readonly pendingReports?: number;
  readonly reports?: readonly AdminReportSummaryItem[];
  readonly unavailableReason?: string;
}

export interface AdminEventDetailSnapshot {
  readonly eventId: string;
  readonly name: string;
  readonly overallAvailability: 'COMPLETE' | 'PARTIAL';
  readonly owner: AdminEventOwnerSection;
  readonly lifecycle: AdminEventLifecycleSection;
  readonly capacity: AdminEventCapacitySection;
  readonly jobs: AdminEventJobsSection;
  readonly invitations?: AdminEventInvitationsSection;
  readonly capacityRequests?: AdminEventCapacityRequestsSection;
  readonly reports?: AdminEventReportsSection;
  readonly capabilities: AdminEventCapabilities;
  readonly fetchedAt: string;
}

export type AdminMediaPurpose =
  | 'INCIDENT_INVESTIGATION'
  | 'SUPPORT_REQUEST'
  | 'CORRUPTION_DIAGNOSIS'
  | 'LEGAL_OR_SAFETY';

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

export type AdminInterventionType =
  | 'SUSPEND_EVENT'
  | 'REACTIVATE_EVENT'
  | 'EXTEND_EVENT_VALIDITY'
  | 'CLOSE_EVENT'
  | 'REVOKE_GUEST_ACCESS';

export interface ExecuteInterventionPayload {
  readonly interventionType: AdminInterventionType;
  readonly reason: string;
  readonly idempotencyKey: string;
  readonly extendHours?: number;
}

export interface ExecuteInterventionResult {
  readonly outcome: 'EXECUTED' | 'IDEMPOTENT_REPLAY';
  readonly eventId: string;
  readonly interventionType: AdminInterventionType;
  readonly previousStatus: string;
  readonly newStatus: string;
  readonly executedAt: string;
}
