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
  status: MediaCatalogStatus;
  previewUrl?: string;
  capabilities: MediaCapabilitiesModel;
  safety: {
    outcome: SafetyOutcome;
  };
  observableProgress?: MediaObservableProgressModel;
}

export interface RetryCycleResponse {
  cycleId: string;
  cycleNumber: number;
  status: 'ACTIVE' | 'TERMINATED' | 'COMPLETED';
  operationId: string;
}
