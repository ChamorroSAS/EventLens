import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  EventManagementError,
  type EventAuditSink,
  type EventRecord,
  type EventStatus,
  type ModerationMode,
  type SuspendEventCommand,
  type SuspendEventResult
} from './contracts.js';

interface EventRow {
  id: string;
  organizer_id: string;
  name: string;
  status: string;
  previous_status?: string | null;
  suspension_reason?: string | null;
  suspended_at?: Date | string | null;
  scheduled_at?: Date | string | null;
  expires_at?: Date | string | null;
  grace_ends_at?: Date | string | null;
  revision?: bigint | number | string | null;
  timezone: string;
  uploads_enabled: boolean;
  guest_gallery_enabled: boolean;
  moderation_mode: string;
  pin_enabled: boolean;
  idempotency_key?: string | null;
  idempotency_payload_hash?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const EVENT_COLUMNS = `
  id, organizer_id, name, status, previous_status, suspension_reason,
  suspended_at, scheduled_at, expires_at, grace_ends_at, revision,
  timezone, uploads_enabled, guest_gallery_enabled, moderation_mode,
  pin_enabled, idempotency_key, idempotency_payload_hash, created_at, updated_at
`;

function mapRowToRecord(row: EventRow): EventRecord {
  return {
    id: row.id,
    organizerId: row.organizer_id,
    name: row.name,
    status: row.status as EventStatus,
    previousStatus: (row.previous_status as EventStatus) ?? null,
    suspensionReason: row.suspension_reason ?? null,
    suspendedAt: row.suspended_at ? new Date(row.suspended_at) : null,
    scheduledAt: row.scheduled_at ? new Date(row.scheduled_at) : null,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    graceEndsAt: row.grace_ends_at ? new Date(row.grace_ends_at) : null,
    revision: BigInt(row.revision ?? 1),
    timezone: row.timezone,
    uploadsEnabled: Boolean(row.uploads_enabled),
    guestGalleryEnabled: Boolean(row.guest_gallery_enabled),
    moderationMode: row.moderation_mode as ModerationMode,
    pinEnabled: Boolean(row.pin_enabled),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Service managing event lifecycle transitions, administrative suspensions, and state retention.
 * Enforces strict transactional concurrency, audit logging, and terminal state invariants (EL-TK-068).
 */
export class EventLifecycleService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly auditSink?: EventAuditSink
  ) {}

  /**
   * Administratively suspends an event preserving its previous status and reason.
   * Only authorized human administrators may perform this action (EL-TK-068).
   */
  public async suspendEvent(command: SuspendEventCommand): Promise<SuspendEventResult> {
    if (!command || typeof command !== 'object') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Suspend event command is required');
    }

    const { actorContext, eventId, reason, expectedRevision } = command;

    // 1. Validar autorización administrativa (Escenario 1 / Validaciones y permisos)
    if (
      !actorContext ||
      actorContext.actorType !== 'ADMIN_HUMAN' ||
      !actorContext.principalId ||
      typeof actorContext.principalId !== 'string'
    ) {
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_SUSPENDED',
        actorId: (actorContext as unknown as { principalId?: string })?.principalId ?? 'UNKNOWN',
        targetIdentifier: eventId || 'UNKNOWN',
        result: 'REJECTED_UNAUTHORIZED',
        details: 'Administrative suspension rejected: unauthorized actor context',
        timestamp: new Date()
      });
      throw new EventManagementError('UNAUTHORIZED', 'Authenticated administrative context is required');
    }

    // 2. Validar identificador del evento
    if (!eventId || typeof eventId !== 'string' || !UUID_REGEX.test(eventId.trim())) {
      throw new EventManagementError('INVALID_ARGUMENT', 'Valid event ID UUID is required');
    }

    const normalizedEventId = eventId.trim().toLowerCase();

    // 3. Validar motivo obligatorio (Regla de negocio: motivo no vacío)
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      throw new EventManagementError('INVALID_ARGUMENT', 'Suspension reason is required');
    }

    const trimmedReason = reason.trim();

    return this.runner.run(async (tx: SqlTransaction) => {
      // 4. Bloqueo de fila FOR UPDATE para prevenir carreras de concurrencia
      const rows = await tx.query<EventRow>(
        `SELECT ${EVENT_COLUMNS} FROM event WHERE id = $1 FOR UPDATE`,
        normalizedEventId
      );

      if (rows.length === 0) {
        throw new EventManagementError('EVENT_NOT_FOUND', `Event with ID ${normalizedEventId} not found`);
      }

      const currentRow = rows[0];
      const currentStatus = currentRow.status as EventStatus;
      const currentRevision = BigInt(currentRow.revision ?? 1);

      // 5. Validar estado terminal DELETED (Escenario 2: rechazar por ser terminal)
      if (currentStatus === 'DELETED') {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_SUSPENDED',
          actorId: actorContext.principalId,
          targetIdentifier: normalizedEventId,
          result: 'REJECTED_INVALID_STATE',
          details: 'Event suspension rejected: event is in terminal DELETED state',
          timestamp: new Date()
        });
        throw new EventManagementError(
          'TERMINAL_STATE_CANNOT_SUSPEND',
          `Cannot suspend event ${normalizedEventId}: terminal DELETED state cannot be suspended`
        );
      }

      // 6. Validar que no se encuentre ya suspendido
      if (currentStatus === 'SUSPENDED') {
        throw new EventManagementError(
          'INVALID_STATE',
          `Event ${normalizedEventId} is already suspended`
        );
      }

      // 7. Control de concurrencia optimista opcional
      if (expectedRevision !== undefined && expectedRevision !== null) {
        const expected = BigInt(expectedRevision);
        if (currentRevision !== expected) {
          await this.auditSink?.record({
            id: randomUUID(),
            procedure: 'EVENT_SUSPENDED',
            actorId: actorContext.principalId,
            targetIdentifier: normalizedEventId,
            result: 'CONCURRENCY_CONFLICT',
            details: `Concurrency conflict on suspension: expected revision ${expected}, found ${currentRevision}`,
            timestamp: new Date()
          });
          throw new EventManagementError(
            'CONCURRENCY_CONFLICT',
            `Revision conflict: expected ${expected}, actual ${currentRevision}`
          );
        }
      }

      // 8. Aplicar transición: status = 'SUSPENDED', previous_status = currentStatus, suspension_reason = trimmedReason
      const now = new Date();
      const newRevision = currentRevision + 1n;

      await tx.execute(
        `UPDATE event
         SET status = 'SUSPENDED',
             previous_status = $1,
             suspension_reason = $2,
             suspended_at = $3,
             revision = $4,
             updated_at = $3
         WHERE id = $5`,
        currentStatus,
        trimmedReason,
        now,
        newRevision,
        normalizedEventId
      );

      const updatedRow: EventRow = {
        ...currentRow,
        status: 'SUSPENDED',
        previous_status: currentStatus,
        suspension_reason: trimmedReason,
        suspended_at: now,
        revision: newRevision,
        updated_at: now
      };

      const updatedEvent = mapRowToRecord(updatedRow);

      // 9. Registrar auditoría conforme requerimientos (auditar administrador, motivo sanitizado, estado previo y revisión)
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_SUSPENDED',
        actorId: actorContext.principalId,
        targetIdentifier: normalizedEventId,
        result: 'SUCCESS',
        details: `Event suspended from previous status "${currentStatus}". Reason: "${trimmedReason}". Revision: ${newRevision.toString()}`,
        timestamp: now
      });

      return {
        event: updatedEvent,
        previousStatus: currentStatus,
        suspendedAt: now,
        suspensionReason: trimmedReason,
        revision: newRevision
      };
    });
  }

  /**
   * Retrieves an event by ID.
   */
  public async getEventById(eventId: string): Promise<EventRecord> {
    if (!eventId || typeof eventId !== 'string' || !UUID_REGEX.test(eventId.trim())) {
      throw new EventManagementError('INVALID_ARGUMENT', 'Valid event ID UUID is required');
    }

    const normalizedId = eventId.trim().toLowerCase();

    return this.runner.run(async (tx: SqlTransaction) => {
      const rows = await tx.query<EventRow>(
        `SELECT ${EVENT_COLUMNS} FROM event WHERE id = $1`,
        normalizedId
      );

      if (rows.length === 0) {
        throw new EventManagementError('EVENT_NOT_FOUND', `Event with ID ${normalizedId} not found`);
      }

      return mapRowToRecord(rows[0]);
    });
  }
}
