export type MediaCatalogStatus =
  | 'UPLOADED'
  | 'PROCESSING'
  | 'PROCESSING_FAILED'
  | 'QUARANTINED'
  | 'PENDING_REVIEW'
  | 'PUBLISHED'
  | 'HIDDEN'
  | 'REJECTED'
  | 'TRASHED'
  | 'DELETED';

export type SafetyOutcome = 'APPROVED' | 'INCONCLUSIVE' | 'DENIED' | 'PENDING';

export interface MediaCapabilitiesModel {
  canRetry: boolean;
  canDownloadOriginal: boolean;
  canView: boolean;
  canDelete: boolean;
  canApprove?: boolean;
  canReject?: boolean;
  canHide?: boolean;
  canRepublish?: boolean;
  canTrash?: boolean;
  canRestore?: boolean;
}

export interface MediaObservableProgressModel {
  phase?: string;
  attempt?: number;
}

export interface MediaCardModel {
  mediaRef: string;
  eventRef: string;
  fileName: string;
  format?: string;
  mimeType?: string;
  sizeBytes?: number;
  status: MediaCatalogStatus;
  previousStatus?: string;
  trashedAt?: string;
  restoreDeadline?: string;
  previewUrl?: string;
  capabilities: MediaCapabilitiesModel;
  safety: {
    outcome: SafetyOutcome;
  };
  observableProgress?: MediaObservableProgressModel;
  createdAt?: string;
}

export type EventModerationMode = 'AUTO_PUBLISH' | 'ORGANIZER_REVIEW';

export interface EventModerationSettingsModel {
  eventRef: string;
  moderationMode: EventModerationMode;
  canChangeModerationMode: boolean;
}

export type MediaStatusFilter =
  | 'ALL'
  | 'PUBLISHED'
  | 'PROCESSING'
  | 'PROCESSING_FAILED'
  | 'QUARANTINED'
  | 'PENDING_REVIEW'
  | 'HIDDEN'
  | 'REJECTED'
  | 'TRASHED';

export type EmptyReason = 'EMPTY_LIBRARY' | 'EMPTY_FILTER_RESULTS';

export interface OrganizerMediaLibrarySnapshotModel {
  eventRef: string;
  items: MediaCardModel[];
  totalCount: number;
  filterCount: number;
  limit: number;
  offset: number;
  emptyReason?: EmptyReason;
}

export interface RetryCycleResponse {
  cycleId: string;
  cycleNumber: number;
  status: 'ACTIVE' | 'TERMINATED' | 'COMPLETED';
  operationId: string;
}

export interface ExportStatusSnapshotUI {
  exportId: string;
  eventId: string;
  status: 'REQUESTED' | 'PREPARING' | 'AVAILABLE' | 'FAILED' | 'EXPIRED' | 'INVALIDATED';
  generation: bigint | number | string;
  selectedCount: number;
  selectedBytes: bigint | number | string;
  requestedAt: string;
  preparedAt?: string | null;
  availableAt?: string | null;
  expiresAt?: string | null;
  expiredAt?: string | null;
  invalidatedAt?: string | null;
  failureCode?: string | null;
  statusReason?: string | null;
  progress?: { partsReady: number; partsTotal: number; percent?: number | null } | null;
  parts: Array<{
    partNumber: number;
    status: 'PENDING' | 'READY' | 'FAILED' | 'EXPIRED' | 'INVALIDATED';
    sizeBytes: number;
    entryCount: number;
    sha256?: string | null;
    fileName: string;
  }>;
  capabilities: {
    canDownload: boolean;
    canRetry: boolean;
    canRegenerate: boolean;
    canRequestNew: boolean;
  };
}
