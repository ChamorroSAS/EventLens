export type AuditActorType = 'SYSTEM' | 'ADMIN' | 'ORGANIZER' | 'ANONYMOUS_GUEST';

export type AuditResult = 'SUCCESS' | 'FAILURE' | 'DENIED';

export interface AuditActorViewModel {
  type: AuditActorType;
  actorId: string;
  systemId?: string;
  detail?: {
    sessionRef?: string;
    ipAddress?: string;
    userAgent?: string;
    [key: string]: unknown;
  } | null;
}

export interface AuditEventRecord {
  id: string;
  occurredAt: string | Date;
  actorType: AuditActorType;
  actorId: string;
  actorDetail: Record<string, unknown> | null;
  action: string;
  resourceType: string;
  resourceId: string;
  result: AuditResult;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt?: string | Date;
}

export interface AuditQueryFilters {
  resourceType?: string;
  resourceId?: string;
  action?: string;
  actorType?: AuditActorType | '';
  actorId?: string;
  result?: AuditResult | '';
  fromTimestamp?: string;
  toTimestamp?: string;
}

export interface AuditEventPage {
  items: AuditEventRecord[];
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  isPartial?: boolean;
}

export type AuditViewState =
  | 'idle'
  | 'loading'
  | 'success'
  | 'empty'
  | 'no-results'
  | 'partial'
  | 'error'
  | 'forbidden';
