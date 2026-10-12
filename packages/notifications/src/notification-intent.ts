import { createHash, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  NotificationError,
  type NotificationIntentRecord,
  type NotificationIntentStatus,
  type RecordDomainFactCommand,
  type RecordDomainFactResult,
  type SupersedeIntentCommand,
  type NotificationAuditSink
} from './contracts.js';

interface NotificationIntentRow {
  id: string;
  dedup_key: string;
  recipient_ref: string;
  recipient_email?: string | null;
  notification_type: string;
  resource_ref: string;
  status: string;
  payload: string | Record<string, unknown>;
  effective_at: Date | string;
  expires_at?: Date | string | null;
  superseded_at?: Date | string | null;
  superseded_by?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function parsePayload(payload: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      return {};
    }
  }
  return payload && typeof payload === 'object' ? payload : {};
}

function mapRowToRecord(row: NotificationIntentRow): NotificationIntentRecord {
  return {
    id: row.id,
    dedupKey: row.dedup_key,
    recipientRef: row.recipient_ref,
    recipientEmail: row.recipient_email ?? null,
    notificationType: row.notification_type,
    resourceRef: row.resource_ref,
    status: row.status as NotificationIntentStatus,
    payload: parsePayload(row.payload),
    effectiveAt: new Date(row.effective_at),
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    supersededAt: row.superseded_at ? new Date(row.superseded_at) : null,
    supersededBy: row.superseded_by ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

function canonicalize(val: unknown): unknown {
  if (val === null || typeof val !== 'object') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(canonicalize);
  }
  const sortedObj: Record<string, unknown> = {};
  for (const key of Object.keys(val as Record<string, unknown>).sort()) {
    sortedObj[key] = canonicalize((val as Record<string, unknown>)[key]);
  }
  return sortedObj;
}

function computePayloadHash(
  recipientRef: string,
  notificationType: string,
  resourceRef: string,
  payload: Record<string, unknown>
): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        canonicalize({ recipientRef, notificationType, resourceRef, payload })
      )
    )
    .digest('hex');
}

/**
 * Service managing idempotent notification intents derived from confirmed domain facts (EL-TK-156).
 * Separates core domain events from notification dispatching channels.
 */
export class NotificationIntentService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly auditSink?: NotificationAuditSink
  ) {}

  /**
   * Records a notification intent derived from a confirmed domain fact (Escenario 1 & 2).
   */
  public async recordDomainFact(
    command: RecordDomainFactCommand,
    tx?: SqlTransaction
  ): Promise<RecordDomainFactResult> {
    if (!command || typeof command !== 'object') {
      throw new NotificationError('INVALID_ARGUMENT', 'Record domain fact command is required');
    }

    const {
      actorContext,
      dedupKey,
      recipientRef,
      recipientEmail,
      notificationType,
      resourceRef,
      payload,
      effectiveAt,
      expiresAt,
      supersedesDedupKeys
    } = command;

    // 1. Validar actor de sistema / contexto
    if (!actorContext || !actorContext.actorId || !actorContext.actorType) {
      throw new NotificationError('UNAUTHORIZED', 'Authorized actor context is required');
    }

    // 2. Validar destinatario
    if (!recipientRef || typeof recipientRef !== 'string' || recipientRef.trim().length === 0) {
      await this.auditSink?.record({
        id: randomUUID(),
        intentId: null,
        dedupKey: dedupKey ?? 'UNKNOWN',
        action: 'RECORD_INTENT_REJECTED',
        recipientRef: 'UNKNOWN',
        notificationType: notificationType ?? 'UNKNOWN',
        result: 'REJECTED_INVALID_RECIPIENT',
        details: 'Missing or empty recipientRef',
        timestamp: new Date()
      });
      throw new NotificationError('INVALID_RECIPIENT', 'Recipient reference is required and cannot be empty');
    }

    // 3. Validar tipo de notificación
    if (!notificationType || typeof notificationType !== 'string' || notificationType.trim().length === 0) {
      throw new NotificationError('INVALID_NOTIFICATION_TYPE', 'Notification type is required and cannot be empty');
    }

    // 4. Validar referencia de recurso
    if (!resourceRef || typeof resourceRef !== 'string' || resourceRef.trim().length === 0) {
      throw new NotificationError('INVALID_RESOURCE', 'Resource reference is required and cannot be empty');
    }

    // 5. Validar clave de deduplicación
    if (!dedupKey || typeof dedupKey !== 'string' || dedupKey.trim().length === 0) {
      throw new NotificationError('INVALID_DEDUP_KEY', 'Dedup key is required and cannot be empty');
    }

    // 6. Validar payload sanitizado
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new NotificationError('INVALID_ARGUMENT', 'Payload must be a non-null object');
    }

    const trimmedDedupKey = dedupKey.trim();
    const trimmedRecipientRef = recipientRef.trim();
    const trimmedNotificationType = notificationType.trim();
    const trimmedResourceRef = resourceRef.trim();
    const payloadHash = computePayloadHash(
      trimmedRecipientRef,
      trimmedNotificationType,
      trimmedResourceRef,
      payload
    );

    const executeWork = async (activeTx: SqlTransaction): Promise<RecordDomainFactResult> => {
      const now = new Date();
      let supersededCount = 0;

      // Obsolescencia atómica de hechos previos si se especificaron
      if (Array.isArray(supersedesDedupKeys) && supersedesDedupKeys.length > 0) {
        for (const oldDedupKey of supersedesDedupKeys) {
          if (!oldDedupKey || typeof oldDedupKey !== 'string') continue;
          const rowsToSupersede = await activeTx.query<NotificationIntentRow>(
            `SELECT id, dedup_key, recipient_ref, notification_type, status
             FROM notification_intent
             WHERE dedup_key = $1 AND status = 'PENDING'
             FOR UPDATE`,
            oldDedupKey.trim()
          );

          if (rowsToSupersede.length > 0) {
            await activeTx.execute(
              `UPDATE notification_intent
               SET status = 'SUPERSEDED',
                   superseded_at = $1,
                   superseded_by = $2,
                   updated_at = $1
               WHERE dedup_key = $3 AND status = 'PENDING'`,
              now,
              `SUPERSEDED_BY_${trimmedDedupKey}`,
              oldDedupKey.trim()
            );
            supersededCount++;

            await this.auditSink?.record({
              id: randomUUID(),
              intentId: rowsToSupersede[0].id,
              dedupKey: oldDedupKey.trim(),
              action: 'INTENT_SUPERSEDED',
              recipientRef: rowsToSupersede[0].recipient_ref,
              notificationType: rowsToSupersede[0].notification_type,
              result: 'SUCCESS',
              details: `Superseded by new domain fact intent ${trimmedDedupKey}`,
              timestamp: now
            });
          }
        }
      }

      // Comprobar si ya existe la intención con esta dedupKey (Escenario 2: Deduplicación / Replay)
      const existingRows = await activeTx.query<NotificationIntentRow>(
        `SELECT id, dedup_key, recipient_ref, recipient_email, notification_type,
                resource_ref, status, payload, effective_at, expires_at,
                superseded_at, superseded_by, created_at, updated_at
         FROM notification_intent
         WHERE dedup_key = $1
         FOR UPDATE`,
        trimmedDedupKey
      );

      if (existingRows.length > 0) {
        const existing = existingRows[0];
        const existingRecord = mapRowToRecord(existing);
        const existingHash = computePayloadHash(
          existingRecord.recipientRef,
          existingRecord.notificationType,
          existingRecord.resourceRef,
          existingRecord.payload
        );

        if (existingHash === payloadHash) {
          await this.auditSink?.record({
            id: randomUUID(),
            intentId: existing.id,
            dedupKey: trimmedDedupKey,
            action: 'IDEMPOTENT_REPLAY',
            recipientRef: trimmedRecipientRef,
            notificationType: trimmedNotificationType,
            result: 'IDEMPOTENT_REPLAY',
            details: `Idempotent replay for notification intent ${trimmedDedupKey}`,
            timestamp: now
          });

          return {
            outcome: 'IDEMPOTENT_REPLAY',
            intent: existingRecord,
            supersededCount
          };
        }

        await this.auditSink?.record({
          id: randomUUID(),
          intentId: existing.id,
          dedupKey: trimmedDedupKey,
          action: 'IDEMPOTENCY_CONFLICT',
          recipientRef: trimmedRecipientRef,
          notificationType: trimmedNotificationType,
          result: 'CONFLICT',
          details: `Dedup key ${trimmedDedupKey} already used with different payload`,
          timestamp: now
        });

        throw new NotificationError(
          'IDEMPOTENCY_CONFLICT',
          `Dedup key ${trimmedDedupKey} has already been registered with conflicting parameters`
        );
      }

      // Insertar nueva intención única (Escenario 1)
      const intentId = randomUUID();
      const effAt = effectiveAt ?? now;
      const expAt = expiresAt ?? null;
      const serializedPayload = JSON.stringify(payload);

      const inserted = await activeTx.execute(
        `INSERT INTO notification_intent (
           id, dedup_key, recipient_ref, recipient_email, notification_type,
           resource_ref, status, payload, effective_at, expires_at,
           superseded_at, superseded_by, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7::jsonb, $8, $9, null, null, $10, $10)
         ON CONFLICT (dedup_key) DO NOTHING`,
        intentId,
        trimmedDedupKey,
        trimmedRecipientRef,
        recipientEmail ? recipientEmail.trim() : null,
        trimmedNotificationType,
        trimmedResourceRef,
        serializedPayload,
        effAt,
        expAt,
        now
      );

      // En caso de carrera concurrente entre transacciones
      if (inserted === 0) {
        const raceWinnerRows = await activeTx.query<NotificationIntentRow>(
          `SELECT id, dedup_key, recipient_ref, recipient_email, notification_type,
                  resource_ref, status, payload, effective_at, expires_at,
                  superseded_at, superseded_by, created_at, updated_at
           FROM notification_intent
           WHERE dedup_key = $1`,
          trimmedDedupKey
        );

        if (raceWinnerRows.length > 0) {
          const raceWinner = mapRowToRecord(raceWinnerRows[0]);
          const raceWinnerHash = computePayloadHash(
            raceWinner.recipientRef,
            raceWinner.notificationType,
            raceWinner.resourceRef,
            raceWinner.payload
          );

          if (raceWinnerHash === payloadHash) {
            return {
              outcome: 'IDEMPOTENT_REPLAY',
              intent: raceWinner,
              supersededCount
            };
          }
        }

        throw new NotificationError(
          'IDEMPOTENCY_CONFLICT',
          `Dedup key ${trimmedDedupKey} has already been registered with conflicting parameters`
        );
      }

      const createdRecord: NotificationIntentRecord = {
        id: intentId,
        dedupKey: trimmedDedupKey,
        recipientRef: trimmedRecipientRef,
        recipientEmail: recipientEmail ? recipientEmail.trim() : null,
        notificationType: trimmedNotificationType,
        resourceRef: trimmedResourceRef,
        status: 'PENDING',
        payload,
        effectiveAt: effAt,
        expiresAt: expAt,
        supersededAt: null,
        supersededBy: null,
        createdAt: now,
        updatedAt: now
      };

      await this.auditSink?.record({
        id: randomUUID(),
        intentId,
        dedupKey: trimmedDedupKey,
        action: 'INTENT_RECORDED',
        recipientRef: trimmedRecipientRef,
        notificationType: trimmedNotificationType,
        result: 'SUCCESS',
        details: `Notification intent created with ID ${intentId}`,
        timestamp: now
      });

      return {
        outcome: 'CREATED',
        intent: createdRecord,
        supersededCount
      };
    };

    if (tx) {
      return executeWork(tx);
    }
    return this.runner.run(executeWork);
  }

  /**
   * Marks a notification intent as superseded when the underlying domain fact became obsolete (Escenario 3).
   */
  public async supersedeIntent(
    command: SupersedeIntentCommand
  ): Promise<NotificationIntentRecord> {
    if (!command || typeof command !== 'object') {
      throw new NotificationError('INVALID_ARGUMENT', 'Supersede command is required');
    }

    const { actorContext, intentId, dedupKey, reason } = command;
    if (!actorContext || !actorContext.actorId) {
      throw new NotificationError('UNAUTHORIZED', 'Authorized actor context is required');
    }
    if (!intentId && !dedupKey) {
      throw new NotificationError('INVALID_ARGUMENT', 'Either intentId or dedupKey must be provided');
    }
    if (!reason || typeof reason !== 'string') {
      throw new NotificationError('INVALID_ARGUMENT', 'Supersede reason is required');
    }

    return this.runner.run(async (tx: SqlTransaction) => {
      const now = new Date();
      const whereClause = intentId ? 'id = $1' : 'dedup_key = $1';
      const param = intentId ? intentId : dedupKey!;

      const rows = await tx.query<NotificationIntentRow>(
        `SELECT id, dedup_key, recipient_ref, recipient_email, notification_type,
                resource_ref, status, payload, effective_at, expires_at,
                superseded_at, superseded_by, created_at, updated_at
         FROM notification_intent
         WHERE ${whereClause}
         FOR UPDATE`,
        param
      );

      if (rows.length === 0) {
        throw new NotificationError('INTENT_NOT_FOUND', `Notification intent not found for ${param}`);
      }

      const existing = rows[0];

      if (existing.status === 'SUPERSEDED') {
        return mapRowToRecord(existing);
      }

      if (existing.status === 'PROCESSED') {
        throw new NotificationError(
          'INVALID_STATE_TRANSITION',
          'Cannot supersede an intent that has already been processed'
        );
      }

      await tx.execute(
        `UPDATE notification_intent
         SET status = 'SUPERSEDED',
             superseded_at = $1,
             superseded_by = $2,
             updated_at = $1
         WHERE id = $3`,
        now,
        reason,
        existing.id
      );

      await this.auditSink?.record({
        id: randomUUID(),
        intentId: existing.id,
        dedupKey: existing.dedup_key,
        action: 'INTENT_SUPERSEDED',
        recipientRef: existing.recipient_ref,
        notificationType: existing.notification_type,
        result: 'SUCCESS',
        details: `Superseded due to: ${reason}`,
        timestamp: now
      });

      return {
        ...mapRowToRecord(existing),
        status: 'SUPERSEDED',
        supersededAt: now,
        supersededBy: reason,
        updatedAt: now
      };
    });
  }

  /**
   * Revalidates an intent before delivery. If it is no longer valid, marks it superseded (Escenario 3).
   */
  public async revalidateIntent(
    intentId: string,
    isStillValid: (intent: NotificationIntentRecord) => boolean | Promise<boolean>,
    obsolescenceReason: string
  ): Promise<NotificationIntentRecord> {
    if (!intentId) {
      throw new NotificationError('INVALID_ARGUMENT', 'Intent ID is required');
    }

    return this.runner.run(async (tx: SqlTransaction) => {
      const rows = await tx.query<NotificationIntentRow>(
        `SELECT id, dedup_key, recipient_ref, recipient_email, notification_type,
                resource_ref, status, payload, effective_at, expires_at,
                superseded_at, superseded_by, created_at, updated_at
         FROM notification_intent
         WHERE id = $1
         FOR UPDATE`,
        intentId
      );

      if (rows.length === 0) {
        throw new NotificationError('INTENT_NOT_FOUND', `Intent ${intentId} not found`);
      }

      const record = mapRowToRecord(rows[0]);
      if (record.status !== 'PENDING') {
        return record;
      }

      const valid = await isStillValid(record);
      if (valid) {
        return record;
      }

      const now = new Date();
      await tx.execute(
        `UPDATE notification_intent
         SET status = 'SUPERSEDED',
             superseded_at = $1,
             superseded_by = $2,
             updated_at = $1
         WHERE id = $3`,
        now,
        obsolescenceReason,
        intentId
      );

      await this.auditSink?.record({
        id: randomUUID(),
        intentId,
        dedupKey: record.dedupKey,
        action: 'INTENT_REVALIDATED_OBSOLETE',
        recipientRef: record.recipientRef,
        notificationType: record.notificationType,
        result: 'SUPERSEDED',
        details: obsolescenceReason,
        timestamp: now
      });

      return {
        ...record,
        status: 'SUPERSEDED',
        supersededAt: now,
        supersededBy: obsolescenceReason,
        updatedAt: now
      };
    });
  }

  /**
   * Retrieves a notification intent by unique ID.
   */
  public async getIntentById(id: string): Promise<NotificationIntentRecord | null> {
    if (!id) return null;
    return this.runner.run(async (tx: SqlTransaction) => {
      const rows = await tx.query<NotificationIntentRow>(
        `SELECT id, dedup_key, recipient_ref, recipient_email, notification_type,
                resource_ref, status, payload, effective_at, expires_at,
                superseded_at, superseded_by, created_at, updated_at
         FROM notification_intent
         WHERE id = $1`,
        id
      );
      return rows.length > 0 ? mapRowToRecord(rows[0]) : null;
    });
  }

  /**
   * Retrieves a notification intent by dedupKey.
   */
  public async getIntentByDedupKey(dedupKey: string): Promise<NotificationIntentRecord | null> {
    if (!dedupKey) return null;
    return this.runner.run(async (tx: SqlTransaction) => {
      const rows = await tx.query<NotificationIntentRow>(
        `SELECT id, dedup_key, recipient_ref, recipient_email, notification_type,
                resource_ref, status, payload, effective_at, expires_at,
                superseded_at, superseded_by, created_at, updated_at
         FROM notification_intent
         WHERE dedup_key = $1`,
        dedupKey.trim()
      );
      return rows.length > 0 ? mapRowToRecord(rows[0]) : null;
    });
  }

  /**
   * Lists active, non-superseded, non-expired intents for a given recipient.
   */
  public async findActiveIntentsByRecipient(
    recipientRef: string
  ): Promise<NotificationIntentRecord[]> {
    if (!recipientRef) return [];
    return this.runner.run(async (tx: SqlTransaction) => {
      const rows = await tx.query<NotificationIntentRow>(
        `SELECT id, dedup_key, recipient_ref, recipient_email, notification_type,
                resource_ref, status, payload, effective_at, expires_at,
                superseded_at, superseded_by, created_at, updated_at
         FROM notification_intent
         WHERE recipient_ref = $1
           AND status = 'PENDING'
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY effective_at DESC`,
        recipientRef.trim()
      );
      return rows.map(mapRowToRecord);
    });
  }
}
