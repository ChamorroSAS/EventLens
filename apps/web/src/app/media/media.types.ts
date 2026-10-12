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
  previewUrl?: string;
  capabilities: MediaCapabilitiesModel;
  safety: {
    outcome: SafetyOutcome;
  };
  observableProgress?: MediaObservableProgressModel;
  createdAt?: string;
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
