import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  AuditActor,
  AuditEventRecord,
  AuditError,
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
