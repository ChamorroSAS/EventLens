import {
  AdminSupportError,
  type AdminSearchEventItem,
  type AdminSearchOrganizerItem,
  type AdminSearchQuery,
  type AdminSearchResult,
  type AdminSearchResultItem,
  type AdminSupportAuditSink,
  type AdminReadAuditOptions,
  type SqlTransaction,
  type TransactionRunner
} from './contracts.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RawSearchRow {
  row_type: 'EVENT' | 'ORGANIZER';
  id: string;
  name_or_email: string;
  status: string;
  organizer_id: string | null;
  timezone: string | null;
  scheduled_at: Date | string | null;
  created_at: Date | string;
  declared_adult: boolean | null;
}

interface RawCountRow {
  total: string | number;
}

export class AdminSearchService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly auditSink?: AdminSupportAuditSink,
    private readonly auditOptions: AdminReadAuditOptions = {}
  ) {
    if (!runner) {
      throw new AdminSupportError('INVALID_ARGUMENT', 'TransactionRunner is required');
    }
  }

  public async search(query: AdminSearchQuery): Promise<AdminSearchResult> {
    if (!query || typeof query !== 'object') {
      throw new AdminSupportError('INVALID_ARGUMENT', 'Query is required');
    }

    const { actorContext } = query;

    // Fail closed: Solo principales administrativos autenticados pueden buscar (EL-TK-044)
    if (!actorContext || actorContext.actorType !== 'ADMIN_HUMAN' || !actorContext.principalId) {
      throw new AdminSupportError('UNAUTHORIZED', 'Authorized administrative principal required');
    }
    if (this.auditOptions.requireDurableAudit && !this.auditSink) {
      throw new AdminSupportError('INTERNAL_ERROR', 'Administrative audit is unavailable');
    }

    // Sanitización y validación de tipo de entidad
    const entityType = query.entityType ?? 'ALL';
    if (!['ALL', 'EVENT', 'ORGANIZER'].includes(entityType)) {
      throw new AdminSupportError(
        'INVALID_ARGUMENT',
        `Invalid entityType: expected 'ALL', 'EVENT', or 'ORGANIZER'`
      );
    }

    // Sanitización y validación de paginación
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) {
      throw new AdminSupportError('INVALID_ARGUMENT', 'Page must be an integer >= 1');
    }

    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new AdminSupportError('INVALID_ARGUMENT', 'Limit must be an integer between 1 and 100');
    }

    // Sanitización del término de búsqueda
    let cleanedTerm: string | null = null;
    if (query.query !== undefined && query.query !== null) {
      if (typeof query.query !== 'string') {
        throw new AdminSupportError('INVALID_ARGUMENT', 'Search query must be a string');
      }
      const sanitized = query.query.replace(/[\x00-\x1F\x7F]/g, '').trim();
      if (sanitized.length > 100) {
        throw new AdminSupportError(
          'INVALID_ARGUMENT',
          'Search query exceeds maximum length of 100 characters'
        );
      }
      if (sanitized.length > 0) {
        cleanedTerm = sanitized;
      }
    }

    // Sanitización del filtro de estado
    let cleanedStatus: string | null = null;
    if (query.status !== undefined && query.status !== null) {
      if (typeof query.status !== 'string') {
        throw new AdminSupportError('INVALID_ARGUMENT', 'Status filter must be a string');
      }
      const sanitized = query.status.replace(/[\x00-\x1F\x7F]/g, '').trim();
      if (sanitized.length > 0) {
        cleanedStatus = sanitized.toUpperCase();
      }
    }

    const offset = (page - 1) * limit;
    if (!Number.isSafeInteger(offset)) {
      throw new AdminSupportError('INVALID_ARGUMENT', 'Pagination offset exceeds supported range');
    }

    const result = await this.runner.run(async (tx: SqlTransaction) => {
      return this.executeSearch(tx, {
        entityType,
        searchTerm: cleanedTerm,
        statusFilter: cleanedStatus,
        limit,
        offset,
        page
      });
    });

    // Observabilidad segura sin secretos ni datos no necesarios
    if (this.auditSink) {
      try {
        await this.auditSink.record({
          procedure: 'ADMIN_SEARCH_PERFORMED',
          principalId: actorContext.principalId,
          details: JSON.stringify({
            entityType,
            hasTerm: cleanedTerm !== null,
            hasStatusFilter: cleanedStatus !== null,
            page,
            limit,
            resultsCount: result.items.length,
            total: result.pagination.total
          }),
          timestamp: new Date()
        });
      } catch {
        if (this.auditOptions.requireDurableAudit) {
          throw new AdminSupportError('INTERNAL_ERROR', 'Administrative audit is unavailable');
        }
        // La falla en auditoría asíncrona no debe bloquear la respuesta si se define no-bloqueante
      }
    }

    return result;
  }

  private async executeSearch(
    tx: SqlTransaction,
    params: {
      entityType: 'ALL' | 'EVENT' | 'ORGANIZER';
      searchTerm: string | null;
      statusFilter: string | null;
      limit: number;
      offset: number;
      page: number;
    }
  ): Promise<AdminSearchResult> {
    const { entityType, searchTerm, statusFilter, limit, offset, page } = params;

    const isUuid = searchTerm ? UUID_REGEX.test(searchTerm) : false;
    const likePattern = searchTerm ? `%${searchTerm}%` : null;

    // Construcción de consultas unificadas
    const queries: string[] = [];
    const countQueries: string[] = [];
    const sqlParams: unknown[] = [];

    let paramIdx = 1;

    // Rama EVENT
    if (entityType === 'ALL' || entityType === 'EVENT') {
      let eventWhere = 'WHERE 1=1';
      const eventParams: unknown[] = [];

      if (searchTerm) {
        if (isUuid) {
          eventWhere += ` AND (e.id = $${paramIdx} OR e.organizer_id = $${paramIdx})`;
          sqlParams.push(searchTerm);
          paramIdx++;
        } else {
          eventWhere += ` AND (e.name ILIKE $${paramIdx})`;
          sqlParams.push(likePattern);
          paramIdx++;
        }
      }

      if (statusFilter) {
        eventWhere += ` AND e.status = $${paramIdx}`;
        sqlParams.push(statusFilter);
        paramIdx++;
      }

      queries.push(`
        SELECT 
          'EVENT'::text AS row_type,
          e.id::text AS id,
          e.name AS name_or_email,
          e.status::text AS status,
          e.organizer_id::text AS organizer_id,
          e.timezone::text AS timezone,
          e.scheduled_at AS scheduled_at,
          e.created_at AS created_at,
          NULL::boolean AS declared_adult
        FROM event e
        ${eventWhere}
      `);

      countQueries.push(`
        SELECT COUNT(*)::bigint AS cnt
        FROM event e
        ${eventWhere}
      `);
    }

    // Rama ORGANIZER
    if (entityType === 'ALL' || entityType === 'ORGANIZER') {
      let orgWhere = 'WHERE 1=1';

      if (searchTerm) {
        if (isUuid) {
          orgWhere += ` AND (o.id = $${paramIdx})`;
          sqlParams.push(searchTerm);
          paramIdx++;
        } else {
          orgWhere += ` AND (o.email ILIKE $${paramIdx} OR o.email_normalized ILIKE $${paramIdx})`;
          sqlParams.push(likePattern);
          paramIdx++;
        }
      }

      if (statusFilter) {
        orgWhere += ` AND o.status = $${paramIdx}`;
        sqlParams.push(statusFilter);
        paramIdx++;
      }

      queries.push(`
        SELECT 
          'ORGANIZER'::text AS row_type,
          o.id::text AS id,
          o.email AS name_or_email,
          o.status::text AS status,
          NULL::text AS organizer_id,
          NULL::text AS timezone,
          NULL::timestamptz AS scheduled_at,
          o.created_at AS created_at,
          o.declared_adult AS declared_adult
        FROM organizer_account o
        ${orgWhere}
      `);

      countQueries.push(`
        SELECT COUNT(*)::bigint AS cnt
        FROM organizer_account o
        ${orgWhere}
      `);
    }

    const unifiedSql = queries.join(' UNION ALL ');
    const countSql = `SELECT SUM(cnt)::bigint AS total FROM (${countQueries.join(' UNION ALL ')}) AS counts`;

    // 1. Obtener conteo total
    const countRows = await tx.query<RawCountRow>(countSql, ...sqlParams);
    const total = countRows[0] ? Number(countRows[0].total) : 0;
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    // Si no hay resultados, retornar estado vacío
    if (total === 0) {
      return {
        items: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0
        }
      };
    }

    // 2. Obtener resultados paginados
    const pagedSql = `
      ${unifiedSql}
      ORDER BY created_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;
    const finalParams = [...sqlParams, limit, offset];

    const rows = await tx.query<RawSearchRow>(pagedSql, ...finalParams);

    const items: AdminSearchResultItem[] = rows.map((row) => {
      if (row.row_type === 'EVENT') {
        const eventItem: AdminSearchEventItem = {
          type: 'EVENT',
          id: row.id,
          name: row.name_or_email,
          status: row.status,
          organizerId: row.organizer_id ?? '',
          timezone: row.timezone ?? 'America/Bogota',
          scheduledAt: row.scheduled_at ? new Date(row.scheduled_at).toISOString() : null,
          createdAt: new Date(row.created_at).toISOString()
        };
        return eventItem;
      } else {
        const organizerItem: AdminSearchOrganizerItem = {
          type: 'ORGANIZER',
          id: row.id,
          email: row.name_or_email,
          status: row.status,
          declaredAdult: Boolean(row.declared_adult),
          createdAt: new Date(row.created_at).toISOString()
        };
        return organizerItem;
      }
    });

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    };
  }
}
