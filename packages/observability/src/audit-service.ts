import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  AuditActor,
  AuditEventPage,
  AuditEventRecord,
  AuditError,
  AuditQuery,
  AuditResult,
  AuditTelemetrySink,
  RegisterAuditEventCommand
} from './contracts.js';
import { AuditSanitizer } from './audit-sanitizer.js';

interface RawAuditEventRow {
  id: string;
  occurred_at: Date;
  actor_type: string;
  actor_id: string;
  actor_detail: Record<string, unknown> | null;
  action: string;
  resource_type: string;
  resource_id: string;
  result: string;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  idempotency_key: string | null;
  created_at: Date;
}

export class AuditService {
  private readonly sanitizer: AuditSanitizer;
  private readonly telemetrySink?: AuditTelemetrySink;
  private readonly inFlightOperations = new Set<string>();

  constructor(
    private readonly transactions: TransactionRunner,
    sanitizer?: AuditSanitizer,
    telemetrySink?: AuditTelemetrySink
  ) {
    if (!transactions) {
      throw new AuditError('PERSISTENCE_FAILED', 'TransactionRunner is required');
    }
    this.sanitizer = sanitizer ?? new AuditSanitizer();
    this.telemetrySink = telemetrySink;
  }

  public async registerEvent(command: RegisterAuditEventCommand): Promise<AuditEventRecord> {
    const operationKey = this.deriveOperationKey(command);

    // Anti-recursion guard: prevent infinite recursion within the audit pipeline
    if (this.inFlightOperations.has(operationKey)) {
      throw new AuditError('RECURSION_DETECTED', 'Recursive audit recording call detected and prevented');
    }

    this.inFlightOperations.add(operationKey);
    try {
      this.validateCommand(command);

      const actorType = command.actor.type;
      const actorId = command.actor.type === 'SYSTEM' ? command.actor.systemId : command.actor.actorId;
      const actorDetail = command.actor.detail ? this.sanitizer.sanitizeMetadata(command.actor.detail) : null;
      const sanitizedMetadata = this.sanitizer.sanitizeMetadata(command.metadata);
      const sanitizedReason = this.sanitizer.sanitizeReason(command.reason);
      const eventId = command.id ?? randomUUID();
      const occurredAt = command.occurredAt ?? new Date();

      const record = await this.transactions.run(async (tx) => {
        // Idempotent deduplication check
        if (command.idempotencyKey) {
          const existing = await tx.query<RawAuditEventRow>(
            `SELECT id, occurred_at, actor_type, actor_id, actor_detail, action,
                    resource_type, resource_id, result, reason, metadata, idempotency_key, created_at
             FROM audit_event
             WHERE idempotency_key = $1
             LIMIT 1`,
            command.idempotencyKey
          );

          if (existing.length > 0 && existing[0]) {
            return this.mapRowToRecord(existing[0]);
          }
        }

        const inserted = await tx.query<RawAuditEventRow>(
          `INSERT INTO audit_event (
            id, occurred_at, actor_type, actor_id, actor_detail,
            action, resource_type, resource_id, result, reason,
            metadata, idempotency_key, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
          RETURNING id, occurred_at, actor_type, actor_id, actor_detail, action,
                    resource_type, resource_id, result, reason, metadata, idempotency_key, created_at`,
          eventId,
          occurredAt,
          actorType,
          actorId,
          actorDetail ? JSON.stringify(actorDetail) : null,
          command.action,
          command.resourceType,
          command.resourceId,
          command.result,
          sanitizedReason,
          JSON.stringify(sanitizedMetadata),
          command.idempotencyKey ?? null
        );

        const row = inserted[0];
        if (!row) {
          throw new AuditError('PERSISTENCE_FAILED', 'Failed to persist audit event record');
        }

        return this.mapRowToRecord(row);
      });

      // Emit technical telemetry without recursive audit trigger
      this.emitTelemetry(command);

      return record;
    } finally {
      this.inFlightOperations.delete(operationKey);
    }
  }

  public async queryEvents(query: AuditQuery): Promise<AuditEventPage> {
    if (!query || !query.callerActor) {
      throw new AuditError('UNAUTHORIZED_ACCESS', 'Caller actor is required to query audit events');
    }

    this.authorizeQuery(query);

    const page = query.pagination?.page ?? 1;
    const limit = query.pagination?.limit ?? 20;

    if (!Number.isSafeInteger(page) || page < 1) {
      throw new AuditError('INVALID_RESOURCE', 'Page must be an integer >= 1');
    }

    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new AuditError('INVALID_RESOURCE', 'Limit must be an integer between 1 and 100');
    }

    const filter = query.filter ?? {};
    if (filter.fromTimestamp && filter.toTimestamp && filter.fromTimestamp > filter.toTimestamp) {
      throw new AuditError('INVALID_RESOURCE', 'fromTimestamp cannot be after toTimestamp');
    }

    return this.transactions.run(async (tx) => {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (filter.resourceType) {
        params.push(filter.resourceType);
        conditions.push(`resource_type = $${params.length}`);
      }

      if (filter.resourceId) {
        params.push(filter.resourceId);
        conditions.push(`resource_id = $${params.length}`);
      }

      if (filter.action) {
        params.push(filter.action);
        conditions.push(`action = $${params.length}`);
      }

      if (filter.actorType) {
        params.push(filter.actorType);
        conditions.push(`actor_type = $${params.length}`);
      }

      if (filter.actorId) {
        params.push(filter.actorId);
        conditions.push(`actor_id = $${params.length}`);
      }

      if (filter.result) {
        params.push(filter.result);
        conditions.push(`result = $${params.length}`);
      }

      if (filter.fromTimestamp) {
        params.push(filter.fromTimestamp);
        conditions.push(`occurred_at >= $${params.length}`);
      }

      if (filter.toTimestamp) {
        params.push(filter.toTimestamp);
        conditions.push(`occurred_at <= $${params.length}`);
      }

      if (query.allowedScope?.resourceType) {
        params.push(query.allowedScope.resourceType);
        conditions.push(`resource_type = $${params.length}`);
      }
      if (query.allowedScope?.resourceIds && query.allowedScope.resourceIds.length > 0) {
        const idPlaceholders = query.allowedScope.resourceIds.map((id) => {
          params.push(id);
          return `$${params.length}`;
        });
        conditions.push(`resource_id IN (${idPlaceholders.join(', ')})`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await tx.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM audit_event ${whereClause}`,
        ...params
      );

      const totalCount = parseInt(countResult[0]?.count ?? '0', 10);
      const totalPages = totalCount > 0 ? Math.ceil(totalCount / limit) : 0;

      if (totalCount === 0 || page > (totalPages || 1)) {
        return {
          items: [],
          page,
          limit,
          totalCount,
          totalPages,
          hasNextPage: false,
          hasPreviousPage: page > 1
        };
      }

      const offset = (page - 1) * limit;
      const queryParams = [...params];
      queryParams.push(limit);
      const limitParamIdx = queryParams.length;
      queryParams.push(offset);
      const offsetParamIdx = queryParams.length;

      const rows = await tx.query<RawAuditEventRow>(
        `SELECT id, occurred_at, actor_type, actor_id, actor_detail, action,
                resource_type, resource_id, result, reason, metadata, idempotency_key, created_at
         FROM audit_event
         ${whereClause}
         ORDER BY occurred_at DESC, id DESC
         LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}`,
        ...queryParams
      );

      const items = rows.map((r) => this.mapRowToRecord(r));

      return {
        items,
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      };
    });
  }

  private authorizeQuery(query: AuditQuery): void {
    const caller = query.callerActor;

    if (caller.type === 'ADMIN') {
      return;
    }

    if (caller.type === 'ORGANIZER') {
      const filter = query.filter;
      const isScopedToSelf = filter?.actorId === caller.actorId;
      const hasAllowedScope =
        query.allowedScope?.resourceIds && query.allowedScope.resourceIds.length > 0;

      if (!isScopedToSelf && !hasAllowedScope) {
        throw new AuditError(
          'UNAUTHORIZED_ACCESS',
          'Organizer not authorized to query global audit logs without scoped resource permissions'
        );
      }
      return;
    }

    throw new AuditError(
      'UNAUTHORIZED_ACCESS',
      `Actor type '${caller.type}' is not authorized to inspect audit logs`
    );
  }

  private validateCommand(command: RegisterAuditEventCommand): void {
    if (!command) {
      throw new AuditError('INVALID_ACTION', 'Command is required');
    }

    if (!command.actor || typeof command.actor !== 'object') {
      throw new AuditError('INVALID_ACTOR', 'Actor is required');
    }

    if (command.actor.type === 'SYSTEM') {
      if (!command.actor.systemId || typeof command.actor.systemId !== 'string' || command.actor.systemId.trim() === '') {
        throw new AuditError('INVALID_ACTOR', 'System actor must have a non-empty systemId');
      }
    } else if (
      command.actor.type === 'ADMIN' ||
      command.actor.type === 'ORGANIZER' ||
      command.actor.type === 'ANONYMOUS_GUEST'
    ) {
      if (!command.actor.actorId || typeof command.actor.actorId !== 'string' || command.actor.actorId.trim() === '') {
        throw new AuditError('INVALID_ACTOR', 'Human actor must have a non-empty actorId');
      }
    } else {
      throw new AuditError('INVALID_ACTOR', `Unknown actor type: ${(command.actor as { type?: unknown }).type}`);
    }

    if (!command.action || typeof command.action !== 'string' || command.action.trim() === '') {
      throw new AuditError('INVALID_ACTION', 'Action must be a non-empty string');
    }

    if (!command.resourceType || typeof command.resourceType !== 'string' || command.resourceType.trim() === '') {
      throw new AuditError('INVALID_RESOURCE', 'ResourceType must be a non-empty string');
    }

    if (!command.resourceId || typeof command.resourceId !== 'string' || command.resourceId.trim() === '') {
      throw new AuditError('INVALID_RESOURCE', 'ResourceId must be a non-empty string');
    }

    const validResults: AuditResult[] = ['SUCCESS', 'FAILURE', 'DENIED'];
    if (!validResults.includes(command.result)) {
      throw new AuditError('INVALID_RESULT', `Invalid audit result: ${command.result}`);
    }
  }

  private deriveOperationKey(command: RegisterAuditEventCommand): string {
    const actorPart = command.actor?.type === 'SYSTEM' ? command.actor.systemId : (command.actor?.actorId ?? 'unknown');
    return `${actorPart}:${command.action}:${command.resourceType}:${command.resourceId}`;
  }

  private emitTelemetry(command: RegisterAuditEventCommand): void {
    if (!this.telemetrySink) {
      return;
    }

    try {
      this.telemetrySink.recordMetric({
        metricName: 'audit.event.recorded',
        dimensions: {
          action: command.action,
          result: command.result,
          actorType: command.actor.type,
          resourceType: command.resourceType
        },
        value: 1,
        timestamp: new Date()
      });
    } catch {
      // Telemetry failures must NEVER interrupt or fail audit logging
    }
  }

  private mapRowToRecord(row: RawAuditEventRow): AuditEventRecord {
    let metadata: Record<string, unknown> = {};
    if (typeof row.metadata === 'string') {
      try {
        metadata = JSON.parse(row.metadata) as Record<string, unknown>;
      } catch {
        metadata = {};
      }
    } else if (row.metadata && typeof row.metadata === 'object') {
      metadata = row.metadata;
    }

    let actorDetail: Record<string, unknown> | null = null;
    if (typeof row.actor_detail === 'string') {
      try {
        actorDetail = JSON.parse(row.actor_detail) as Record<string, unknown>;
      } catch {
        actorDetail = null;
      }
    } else if (row.actor_detail && typeof row.actor_detail === 'object') {
      actorDetail = row.actor_detail;
    }

    return {
      id: row.id,
      occurredAt: row.occurred_at instanceof Date ? row.occurred_at : new Date(row.occurred_at),
      actorType: row.actor_type as AuditEventRecord['actorType'],
      actorId: row.actor_id,
      actorDetail,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      result: row.result as AuditResult,
      reason: row.reason,
      metadata,
      idempotencyKey: row.idempotency_key,
      createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at)
    };
  }
}
