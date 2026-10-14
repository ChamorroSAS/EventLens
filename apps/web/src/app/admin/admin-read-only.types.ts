import type { operations } from '@eventlens/api-client';

export type AdminReadOnlySearchResponse =
  operations['searchAdminEntities']['responses'][200]['content']['application/json'];

export type AdminReadOnlySearchItem = AdminReadOnlySearchResponse['items'][number];

export type AdminReadOnlyEventDetail =
  operations['getAdminAggregatedEventDetail']['responses'][200]['content']['application/json'];

export type AdminReadOnlyEntityType = 'ALL' | 'EVENT' | 'ORGANIZER';

export interface AdminReadOnlySearchFilter {
  readonly query?: string;
  readonly entityType: AdminReadOnlyEntityType;
  readonly status?: string;
  readonly page: number;
  readonly limit: number;
}

export type AdminReadOnlyFailureKind =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'UNAVAILABLE'
  | 'CANCELLED'
  | 'INVALID';

export type AdminReadOnlyResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly status: number; readonly kind: AdminReadOnlyFailureKind };
