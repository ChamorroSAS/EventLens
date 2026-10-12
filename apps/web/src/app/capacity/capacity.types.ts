export interface CapacityResourceQuantityModel {
  bytes: string;
  megabytes: number;
  gigabytes: number;
  files: number;
}

export interface CapacityUsagePercentagesModel {
  storagePercent: number;
  filesPercent: number;
}

export interface CapacityUsageFlagsModel {
  isZeroUsage: boolean;
  isOverStorageQuota: boolean;
  isOverFilesQuota: boolean;
  isNearStorageLimit: boolean;
  isNearFilesLimit: boolean;
}

export interface CapacityEffectiveLimitsModel {
  planCode: string;
  planName: string;
  storageBytes: string;
  maxFiles: number;
  retentionDays: number;
  isOverrideActive: boolean;
}

export interface CapacityUsageSummaryModel {
  eventId: string;
  effectiveLimits: CapacityEffectiveLimitsModel;
  consumedStorage: CapacityResourceQuantityModel;
  activeReservations: CapacityResourceQuantityModel;
  available: CapacityResourceQuantityModel;
  usagePercentage: CapacityUsagePercentagesModel;
  flags: CapacityUsageFlagsModel;
  snapshotAt: string;
}

export type ExtensionRequestTypeModel = 'STORAGE' | 'DURATION' | 'BOTH';
export type ExtensionRequestStatusModel =
  | 'PENDING_REVIEW'
  | 'INFORMATION_REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export interface ExtensionRequestMessageModel {
  id: string;
  requestId: string;
  authorRole: 'ORGANIZER' | 'ADMIN';
  authorId: string;
  messageType: string;
  content: string;
  createdAt: string;
}

export interface ExtensionRequestModel {
  id: string;
  eventId: string;
  requestedBy: string;
  requestType: ExtensionRequestTypeModel;
  additionalGb: number | null;
  additionalDays: number | null;
  reason: string;
  status: ExtensionRequestStatusModel;
  resolvedAt: string | null;
  resolvedBy: string | null;
  decisionReason: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: ExtensionRequestMessageModel[];
}

export interface CreateExtensionRequestCommandModel {
  eventId: string;
  requestType: ExtensionRequestTypeModel;
  additionalGb?: number;
  additionalDays?: number;
  reason: string;
}

export interface RespondExtensionInfoCommandModel {
  requestId: string;
  response: string;
}
