export type UploadItemStatus =
  | 'QUEUED'
  | 'HASHING'
  | 'AUTHORIZING'
  | 'UPLOADING'
  | 'CONFIRMING'
  | 'VALIDATING'
  | 'RECEIVED'
  | 'REJECTED'
  | 'CANCELLED_POLICY';

export interface UploadLocalFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  status: UploadItemStatus;
  progress: number; // 0 to 100
  canRetry: boolean;
  attemptId?: string;
  error?: string;
  isInvalidLocal?: boolean;
  localValidationError?: string;
  rejectionReason?: string;
  objectKey?: string;
  sha256?: string;
  mediaRef?: string;
}

export interface UploadBatchSummary {
  totalFiles: number;
  receivedCount: number;
  inProgressCount: number;
  actionRequiredCount: number;
  rejectedCount: number;
  cancelledCount: number;
  overallProgress: number; // 0 to 100
  allCompleted: boolean;
}

export interface UploadPolicyStatus {
  blocked: boolean;
  reason?: string;
}
