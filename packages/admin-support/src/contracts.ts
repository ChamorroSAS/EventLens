import type { AdminActorContext } from '@eventlens/identity';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';

export type { SqlTransaction, TransactionRunner };

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
  readonly procedure: 'ADMIN_SEARCH_PERFORMED';
  readonly principalId: string;
  readonly details: string;
  readonly timestamp: Date;
}

export interface AdminSupportAuditSink {
  record(event: AdminSupportAuditEvent): Promise<void>;
}
