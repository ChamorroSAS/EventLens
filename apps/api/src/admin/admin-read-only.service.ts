import { BadRequestException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AdminEventDetailService, AdminSearchService, AdminSupportError, type AdminEventDetailSnapshot, type AdminSearchResult, type AdminSupportAuditSink, type AdminActorContext } from '@eventlens/admin-support';
import { AuthenticationError, extractHostAdminSessionCookie } from '@eventlens/identity';
import { DatabaseService } from '../platform/database/database.service.js';
import { AdminSessionService } from '../identity/admin-session.service.js';

export interface AdminReadOnlyEventDetail {
  eventId: string;
  name: string;
  overallAvailability: 'COMPLETE' | 'PARTIAL';
  owner: { id: string; email: string; status: string; declaredAdult: boolean; createdAt: string };
  lifecycle: {
    status: string; timezone: string; startsAtLocal: string | null; scheduledAt: string | null;
    expiresAt: string | null; graceEndsAt: string | null; activatedAt: string | null; closedAt: string | null;
    suspendedAt: string | null; previousStatus: string | null; uploadsEnabled: boolean; guestGalleryEnabled: boolean;
  };
  capacity: { availability: 'AVAILABLE' | 'UNAVAILABLE' | 'DEGRADED'; planCode?: string; storageLimitBytes?: string; storageUsedBytes?: string; fileLimit?: number; filesCount?: number };
  fetchedAt: string;
}

function singleQueryString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new BadRequestException({ code: 'INVALID_ARGUMENT', message: 'Invalid administrative query' });
  return value;
}

function pageNumber(value: unknown): number | undefined {
  const text = singleQueryString(value);
  if (text === undefined) return undefined;
  if (!/^[1-9][0-9]*$/.test(text) || !Number.isSafeInteger(Number(text))) {
    throw new BadRequestException({ code: 'INVALID_ARGUMENT', message: 'Invalid pagination' });
  }
  return Number(text);
}

@Injectable()
export class AdminReadOnlyService {
  private readonly searchOwner: AdminSearchService;
  private readonly detailOwner: AdminEventDetailService;

  constructor(@Inject(DatabaseService) database: DatabaseService, @Inject(AdminSessionService) private readonly sessions: AdminSessionService) {
    const audit: AdminSupportAuditSink = {
      record: async event => {
        await database.transactions.run(async tx => {
          const written = await tx.execute(
            `INSERT INTO admin_audit_event (id, procedure, actor_id, target_identifier, target_principal_id, result, details, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            randomUUID(), event.procedure, event.principalId, event.principalId, event.principalId, 'SUCCESS', event.details, event.timestamp
          );
          if (written !== 1) throw new Error('Audit acknowledgement missing');
        });
      }
    };
    this.searchOwner = new AdminSearchService(database.transactions, audit, { requireDurableAudit: true });
    this.detailOwner = new AdminEventDetailService(database.transactions, undefined, undefined, audit, undefined, undefined, undefined, { requireDurableAudit: true });
  }

  async search(cookieHeader: string | undefined, raw: Record<string, unknown>): Promise<AdminSearchResult> {
    try {
      const actorContext = await this.actor(cookieHeader);
      const entityType = singleQueryString(raw.entityType);
      if (entityType !== undefined && !['ALL', 'EVENT', 'ORGANIZER'].includes(entityType)) {
        throw new BadRequestException({ code: 'INVALID_ARGUMENT', message: 'Invalid entity type' });
      }
      const result = await this.searchOwner.search({
        actorContext, query: singleQueryString(raw.query), entityType: entityType as 'ALL' | 'EVENT' | 'ORGANIZER' | undefined,
        status: singleQueryString(raw.status), page: pageNumber(raw.page), limit: pageNumber(raw.limit)
      });
      return {
        items: result.items.map(item => item.type === 'EVENT' ? {
          type: 'EVENT', id: item.id, name: item.name, status: item.status, organizerId: item.organizerId,
          timezone: item.timezone, scheduledAt: item.scheduledAt, createdAt: item.createdAt
        } : {
          type: 'ORGANIZER', id: item.id, email: item.email, status: item.status, declaredAdult: item.declaredAdult, createdAt: item.createdAt
        }),
        pagination: { page: result.pagination.page, limit: result.pagination.limit, total: result.pagination.total, totalPages: result.pagination.totalPages }
      };
    } catch (error) { this.mapError(error); }
  }

  async detail(cookieHeader: string | undefined, eventId: string): Promise<AdminReadOnlyEventDetail> {
    try {
      const actorContext = await this.actor(cookieHeader);
      return this.projectDetail(await this.detailOwner.getEventDetail({ actorContext, eventId }));
    } catch (error) { this.mapError(error); }
  }

  private async actor(cookieHeader: string | undefined): Promise<AdminActorContext> {
    // HTTP administrative reads accept only the secure host cookie, never the legacy cookie or actor headers.
    const sessionToken = extractHostAdminSessionCookie(cookieHeader);
    if (!sessionToken) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Administrative session required' });
    // A missing DI authority denies before any database access; validateSession then rechecks epoch/barriers/revisions.
    await this.sessions.getRecoveryAuthority().getRecoveryEpoch();
    return this.sessions.getAuthService().validateSession({ sessionToken });
  }

  private projectDetail(snapshot: AdminEventDetailSnapshot): AdminReadOnlyEventDetail {
    const { owner, lifecycle, capacity } = snapshot;
    const capacityProjection: AdminReadOnlyEventDetail['capacity'] = { availability: capacity.availability };
    if (capacity.availability !== 'UNAVAILABLE') {
      if (capacity.planCode !== undefined) capacityProjection.planCode = capacity.planCode;
      if (capacity.storageLimitBytes !== undefined) capacityProjection.storageLimitBytes = capacity.storageLimitBytes;
      if (capacity.storageUsedBytes !== undefined) capacityProjection.storageUsedBytes = capacity.storageUsedBytes;
      if (capacity.fileLimit !== undefined) capacityProjection.fileLimit = capacity.fileLimit;
      if (capacity.filesCount !== undefined) capacityProjection.filesCount = capacity.filesCount;
    }
    return {
      eventId: snapshot.eventId, name: snapshot.name, overallAvailability: snapshot.overallAvailability,
      owner: { id: owner.id, email: owner.email, status: owner.status, declaredAdult: owner.declaredAdult, createdAt: owner.createdAt },
      lifecycle: {
        status: lifecycle.status, timezone: lifecycle.timezone, startsAtLocal: lifecycle.startsAtLocal, scheduledAt: lifecycle.scheduledAt,
        expiresAt: lifecycle.expiresAt, graceEndsAt: lifecycle.graceEndsAt, activatedAt: lifecycle.activatedAt, closedAt: lifecycle.closedAt,
        suspendedAt: lifecycle.suspendedAt, previousStatus: lifecycle.previousStatus,
        uploadsEnabled: lifecycle.uploadsEnabled, guestGalleryEnabled: lifecycle.guestGalleryEnabled
      },
      capacity: capacityProjection, fetchedAt: snapshot.fetchedAt
    };
  }

  private mapError(error: unknown): never {
    if (error instanceof HttpException) throw error;
    if (error instanceof AuthenticationError) {
      if (['AUTHORITY_UNAVAILABLE', 'TEMPORARY_FAILURE', 'RATE_LIMITED'].includes(error.code)) {
        throw new ServiceUnavailableException({ code: 'TEMPORARY_FAILURE', message: 'Administrative service unavailable' });
      }
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Administrative session required' });
    }
    if (error instanceof AdminSupportError) {
      if (error.code === 'UNAUTHORIZED') throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Administrative access denied' });
      if (error.code === 'INVALID_ARGUMENT') throw new BadRequestException({ code: 'INVALID_ARGUMENT', message: 'Invalid administrative query' });
      if (error.code === 'NOT_FOUND') throw new NotFoundException({ code: 'NOT_FOUND', message: 'Event not found' });
    }
    throw new ServiceUnavailableException({ code: 'TEMPORARY_FAILURE', message: 'Administrative service unavailable' });
  }
}
