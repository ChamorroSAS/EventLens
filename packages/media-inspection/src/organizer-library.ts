import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/job-queue';
import type { EventStatusAuthorizer, SafetyOutcome } from './media-status.js';

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

export class MediaLibraryError extends Error {
  constructor(
    readonly code: 'INVALID_ARGUMENT' | 'ACCESS_DENIED' | 'EVENT_NOT_FOUND',
    message?: string
  ) {
    super(message ?? code);
  }
}

export interface OrganizerMediaLibraryItem {
  readonly mediaRef: string;
  readonly eventRef: string;
  readonly guestRef: string;
  readonly status: string;
  readonly generation: bigint;
  readonly revision: bigint;
  readonly fileName: string;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
  readonly previewUrl?: string;
  readonly safety: {
    readonly outcome: SafetyOutcome;
  };
  readonly capabilities: {
    readonly canRetry: boolean;
    readonly canDownloadOriginal: boolean;
    readonly canView: boolean;
    readonly canDelete: boolean;
  };
  readonly observableProgress?: {
    readonly phase?: string;
    readonly attempt?: number;
  };
}

export interface OrganizerMediaLibrarySnapshot {
  readonly eventRef: string;
  readonly items: OrganizerMediaLibraryItem[];
  readonly totalCount: number;
  readonly filterCount: number;
  readonly limit: number;
  readonly offset: number;
  readonly emptyReason?: EmptyReason;
}

export interface QueryOrganizerMediaLibraryCommand {
  readonly organizerRef: string;
  readonly eventRef: string;
  readonly statusFilter?: MediaStatusFilter;
  readonly limit?: number;
  readonly offset?: number;
}

export interface OrganizerMediaLibraryRow {
  media_ref: string;
  event_ref: string;
  guest_ref: string;
  generation: bigint;
  revision: bigint;
  status: string;
  original: any;
  job_id: string;
  preview_url: string | null;
  safety_outcome: string | null;
  job_status: string | null;
  job_attempt: number | null;
}

export interface OrganizerMediaLibraryRepository {
  getTotalEventCount(tx: SqlTransaction, eventRef: string): Promise<number>;
  getFilteredEventCount(
    tx: SqlTransaction,
    eventRef: string,
    statusFilter: MediaStatusFilter
  ): Promise<number>;
  queryItems(
    tx: SqlTransaction,
    eventRef: string,
    statusFilter: MediaStatusFilter,
    limit: number,
    offset: number
  ): Promise<OrganizerMediaLibraryRow[]>;
}

export class PostgresOrganizerMediaLibraryRepository
  implements OrganizerMediaLibraryRepository
{
  async getTotalEventCount(tx: SqlTransaction, eventRef: string): Promise<number> {
    const rows = await tx.query<{ cnt: number | string }>(
      'SELECT count(*)::int as cnt FROM media_catalog WHERE event_ref = $1',
      eventRef
    );
    return Number(rows[0]?.cnt ?? 0);
  }

  async getFilteredEventCount(
    tx: SqlTransaction,
    eventRef: string,
    statusFilter: MediaStatusFilter
  ): Promise<number> {
    if (statusFilter === 'ALL') {
      return this.getTotalEventCount(tx, eventRef);
    }
    const rows = await tx.query<{ cnt: number | string }>(
      'SELECT count(*)::int as cnt FROM media_catalog WHERE event_ref = $1 AND status = $2',
      eventRef,
      statusFilter
    );
    return Number(rows[0]?.cnt ?? 0);
  }

  async queryItems(
    tx: SqlTransaction,
    eventRef: string,
    statusFilter: MediaStatusFilter,
    limit: number,
    offset: number
  ): Promise<OrganizerMediaLibraryRow[]> {
    const isAll = statusFilter === 'ALL';
    const sql = `
      SELECT mc.media_ref, mc.event_ref, mc.guest_ref, mc.generation, mc.revision,
             mc.status, mc.original, mc.job_id,
             d.reference->>'url' as preview_url,
             i.fact->>'outcome' as safety_outcome,
             jq.status as job_status, jq.attempt as job_attempt
      FROM media_catalog mc
      LEFT JOIN media_active_derivative d
        ON d.media_ref = mc.media_ref
       AND d.generation = mc.generation
       AND d.role IN ('PREVIEW', 'THUMBNAIL')
      LEFT JOIN media_inspection i
        ON i.media_ref = mc.media_ref
       AND i.generation = mc.generation
      LEFT JOIN job_queue jq
        ON jq.id = mc.job_id
      WHERE mc.event_ref = $1
        ${isAll ? '' : 'AND mc.status = $2'}
      ORDER BY mc.generation DESC, mc.media_ref ASC
      LIMIT ${isAll ? '$2' : '$3'} OFFSET ${isAll ? '$3' : '$4'}
    `;

    const params = isAll
      ? [eventRef, limit, offset]
      : [eventRef, statusFilter, limit, offset];

    return await tx.query<OrganizerMediaLibraryRow>(sql, ...params);
  }
}

export class OrganizerMediaLibraryService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly repository: OrganizerMediaLibraryRepository,
    private readonly authorizer: EventStatusAuthorizer
  ) {}

  async execute(
    command: QueryOrganizerMediaLibraryCommand
  ): Promise<OrganizerMediaLibrarySnapshot> {
    if (!command.organizerRef || !command.eventRef) {
      throw new MediaLibraryError('INVALID_ARGUMENT', 'organizerRef and eventRef are required');
    }

    const limit = Math.max(1, Math.min(100, command.limit ?? 20));
    const offset = Math.max(0, command.offset ?? 0);
    const filter = command.statusFilter ?? 'ALL';

    return await this.transactions.run(async tx => {
      // 1. Authorize organizer on event
      try {
        await this.authorizer.assertAuthorized(tx, {
          eventRef: command.eventRef,
          actor: { role: 'ORGANIZER', organizerRef: command.organizerRef }
        });
      } catch (err: any) {
        if (err.code === 'ACCESS_DENIED' || err.code === 'BARRED_EVENT') {
          throw new MediaLibraryError('ACCESS_DENIED', 'Access denied to event media library');
        }
        throw err;
      }

      // 2. Total count check for discriminating empty library vs filter empty
      const totalCount = await this.repository.getTotalEventCount(tx, command.eventRef);
      if (totalCount === 0) {
        return {
          eventRef: command.eventRef,
          items: [],
          totalCount: 0,
          filterCount: 0,
          limit,
          offset,
          emptyReason: 'EMPTY_LIBRARY'
        };
      }

      // 3. Filtered count check
      const filterCount = await this.repository.getFilteredEventCount(
        tx,
        command.eventRef,
        filter
      );
      if (filterCount === 0) {
        return {
          eventRef: command.eventRef,
          items: [],
          totalCount,
          filterCount: 0,
          limit,
          offset,
          emptyReason: 'EMPTY_FILTER_RESULTS'
        };
      }

      // 4. Query page items
      const rows = await this.repository.queryItems(
        tx,
        command.eventRef,
        filter,
        limit,
        offset
      );

      // 5. Map items and calculate capabilities
      const items: OrganizerMediaLibraryItem[] = rows.map(r => {
        const safetyOutcome: SafetyOutcome = (r.safety_outcome as SafetyOutcome) ?? 'PENDING';
        const original = typeof r.original === 'string' ? JSON.parse(r.original) : (r.original ?? {});

        const fileName =
          original.fileName ?? original.name ?? original.filename ?? `media-${r.media_ref}`;
        const mimeType = original.mimeType ?? original.type;
        const sizeBytes = original.bytes ? Number(original.bytes) : undefined;

        // canRetry: true only if PROCESSING_FAILED and safety outcome not DENIED
        const canRetry = r.status === 'PROCESSING_FAILED' && safetyOutcome !== 'DENIED';

        // canDownloadOriginal (DEC-075): safety APPROVED and not quarantined/deleted/trashed/rejected
        const nonDownloadableStatuses = ['QUARANTINED', 'DELETED', 'TRASHED', 'REJECTED'];
        const canDownloadOriginal =
          safetyOutcome === 'APPROVED' && !nonDownloadableStatuses.includes(r.status);

        // canView: not in quarantined, deleted or rejected
        const canView = !['QUARANTINED', 'DELETED', 'REJECTED'].includes(r.status);

        // canDelete: not already DELETED
        const canDelete = r.status !== 'DELETED';

        return {
          mediaRef: r.media_ref,
          eventRef: r.event_ref,
          guestRef: r.guest_ref,
          status: r.status,
          generation: r.generation,
          revision: r.revision,
          fileName,
          mimeType,
          sizeBytes,
          previewUrl: r.preview_url ?? undefined,
          safety: {
            outcome: safetyOutcome
          },
          capabilities: {
            canRetry,
            canDownloadOriginal,
            canView,
            canDelete
          },
          observableProgress:
            r.status === 'PROCESSING' && r.job_status
              ? {
                  phase: r.job_status,
                  attempt: r.job_attempt ?? 1
                }
              : undefined
        };
      });

      return {
        eventRef: command.eventRef,
        items,
        totalCount,
        filterCount,
        limit,
        offset
      };
    });
  }
}
