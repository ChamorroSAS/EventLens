import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/job-queue';
import { addUtcCalendarDays, type PurgeDispatcherPort, type PurgeRequestPayload } from './media-moderation.js';

// ============================================================================
// CONSTANTS & CATALOG ENUMS
// ============================================================================

export const VALID_REPORT_REASONS = [
  'INAPPROPRIATE_CONTENT',
  'PRIVACY_VIOLATION',
  'INTIMACY_VIOLATION',
  'COPYRIGHT_INFRINGEMENT',
  'OTHER',
] as const;

export type MediaReportReason = (typeof VALID_REPORT_REASONS)[number];

export const VALID_REMOVAL_REASONS = [
  'APPEAR_IN_MEDIA',
  'INTIMACY_VIOLATION',
  'PRIVACY_VIOLATION',
  'COPYRIGHT_INFRINGEMENT',
  'OTHER',
] as const;

export type RemovalRequestReason = (typeof VALID_REMOVAL_REASONS)[number];

export type ReportSeverity = 'UNCLASSIFIED' | 'CRITICAL' | 'NORMAL';
export type ReportCaseStatus = 'PENDING_REVIEW' | 'UNDER_INVESTIGATION' | 'ACTION_TAKEN' | 'DISMISSED';
export type RemovalRequestStatus = 'PENDING_REVIEW' | 'UNDER_INVESTIGATION' | 'RESOLVED' | 'DISMISSED';

// ============================================================================
// ERROR CLASSES
// ============================================================================

export type MediaReportErrorCode =
  | 'INVALID_ARGUMENT'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INTERNAL_ERROR';

export class MediaReportError extends Error {
  constructor(
    public readonly code: MediaReportErrorCode,
    message?: string
  ) {
    super(message ?? `Media report error: ${code}`);
    this.name = 'MediaReportError';
  }
}

export type OwnRemovalErrorCode =
  | 'INVALID_ARGUMENT'
  | 'SESSION_INVALID'
  | 'NOT_OWNER'
  | 'ACCESS_DENIED'
  | 'CONCURRENCY_CONFLICT'
  | 'ALREADY_PURGED'
  | 'INTERNAL_ERROR';

export class OwnRemovalError extends Error {
  constructor(
    public readonly code: OwnRemovalErrorCode,
    message?: string
  ) {
    super(message ?? `Own removal error: ${code}`);
    this.name = 'OwnRemovalError';
  }
}

export type RemovalRequestErrorCode =
  | 'INVALID_ARGUMENT'
  | 'VALIDATION_FAILED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INTERNAL_ERROR';

export class RemovalRequestError extends Error {
  constructor(
    public readonly code: RemovalRequestErrorCode,
    message?: string
  ) {
    super(message ?? `Removal request error: ${code}`);
    this.name = 'RemovalRequestError';
  }
}

// ============================================================================
// DATA MODELS & REPOSITORY INTERFACES
// ============================================================================

export interface MediaReportRecord {
  id: string;
  operationId: string;
  mediaRef: string;
  eventRef: string;
  reason: MediaReportReason;
  description?: string;
  reporterContact?: string;
  severity: ReportSeverity;
  status: ReportCaseStatus;
  dedupKey: string;
  createdAt: Date;
}

export interface MediaRemovalRequestRecord {
  id: string;
  operationId: string;
  mediaRef: string;
  eventRef: string;
  reason: RemovalRequestReason;
  description?: string;
  contactEmail: string;
  optionalName?: string;
  declarationAccepted: boolean;
  severity: ReportSeverity;
  status: RemovalRequestStatus;
  dedupKey: string;
  createdAt: Date;
}

export interface MediaOwnRemovalRecord {
  id: string;
  operationId: string;
  mediaRef: string;
  eventRef: string;
  guestRef: string;
  generation: bigint;
  previousRevision: bigint;
  newRevision: bigint;
  purgeStartedAt: Date;
  mainPurgeDeadline: Date;
  residualPurgeDeadline: Date;
  status: 'CONFIRMED' | 'PURGED';
  dedupKey: string;
  createdAt: Date;
}

export interface GuestSessionResolverPort {
  assertGuestSessionOwner(
    tx: SqlTransaction,
    guestSessionRef: string,
    eventRef: string
  ): Promise<{ guestRef: string; eventRef: string }>;
}

export interface MediaReportRepository {
  findVisibleMedia(
    tx: SqlTransaction,
    mediaRef: string,
    eventRef: string
  ): Promise<{ mediaRef: string; eventRef: string; status: string } | null>;

  findExistingReportByDedupKey(
    tx: SqlTransaction,
    dedupKey: string
  ): Promise<MediaReportRecord | null>;

  createReportCase(
    tx: SqlTransaction,
    record: MediaReportRecord
  ): Promise<void>;

  recordAudit(
    tx: SqlTransaction,
    params: {
      action: string;
      operationId: string;
      mediaRef: string;
      eventRef: string;
      reason: string;
      timestamp: Date;
    }
  ): Promise<void>;
}

export interface OwnRemovalRepository {
  lockAndGetMediaForOwnRemoval(
    tx: SqlTransaction,
    mediaRef: string,
    eventRef: string
  ): Promise<{
    mediaRef: string;
    eventRef: string;
    guestRef: string;
    generation: bigint;
    revision: bigint;
    status: string;
  } | null>;

  findExistingOwnRemoval(
    tx: SqlTransaction,
    mediaRef: string
  ): Promise<MediaOwnRemovalRecord | null>;

  createOwnRemovalRecord(
    tx: SqlTransaction,
    record: MediaOwnRemovalRecord
  ): Promise<void>;

  updateMediaStatusToDeleted(
    tx: SqlTransaction,
    mediaRef: string,
    expectedRevision: bigint
  ): Promise<bigint>;

  recordAudit(
    tx: SqlTransaction,
    params: {
      action: string;
      operationId: string;
      mediaRef: string;
      eventRef: string;
      actorRef: string;
      previousStatus: string;
      newStatus: string;
      revision: bigint;
      timestamp: Date;
    }
  ): Promise<void>;
}

export interface RemovalRequestRepository {
  findExistingRemovalRequestByDedupKey(
    tx: SqlTransaction,
    dedupKey: string
  ): Promise<MediaRemovalRequestRecord | null>;

  createRemovalRequest(
    tx: SqlTransaction,
    record: MediaRemovalRequestRecord
  ): Promise<void>;

  recordAudit(
    tx: SqlTransaction,
    params: {
      action: string;
      operationId: string;
      mediaRef: string;
      eventRef: string;
      reason: string;
      timestamp: Date;
    }
  ): Promise<void>;
}


// ============================================================================
// SERVICE: EL-TK-113 — Registrar una denuncia sobre contenido visible
// ============================================================================

export interface RegisterMediaReportCommand {
  mediaRef: string;
  eventRef: string;
  reason: MediaReportReason;
  description?: string;
  reporterContact?: string;
  idempotencyKey?: string;
  now?: Date;
}

export interface RegisterMediaReportResult {
  caseId: string;
  status: 'RECEIVED';
  message: string;
  createdAt: Date;
}

export class MediaReportService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly repository: MediaReportRepository
  ) {}

  async registerReport(command: RegisterMediaReportCommand): Promise<RegisterMediaReportResult> {
    if (!command) {
      throw new MediaReportError('INVALID_ARGUMENT', 'Command is required');
    }
    const { mediaRef, eventRef, reason, description, reporterContact, idempotencyKey } = command;

    if (!mediaRef || typeof mediaRef !== 'string' || !mediaRef.trim()) {
      throw new MediaReportError('INVALID_ARGUMENT', 'mediaRef is required');
    }
    if (!eventRef || typeof eventRef !== 'string' || !eventRef.trim()) {
      throw new MediaReportError('INVALID_ARGUMENT', 'eventRef is required');
    }
    if (!reason || !VALID_REPORT_REASONS.includes(reason)) {
      throw new MediaReportError(
        'INVALID_ARGUMENT',
        `Invalid report reason. Allowed: ${VALID_REPORT_REASONS.join(', ')}`
      );
    }

    const cleanMedia = mediaRef.trim().replace(/^media:/, '');
    const cleanEvent = eventRef.trim();
    const now = command.now ?? new Date();
    const operationId = randomUUID();

    const dedupKey = idempotencyKey
      ? `idemp:${idempotencyKey.trim()}`
      : `report:${cleanEvent}:${cleanMedia}:${(reporterContact ?? 'anon').trim()}:${reason}`;

    return await this.transactions.run(async (tx) => {
      // 1. Idempotency check (Escenario 2)
      const existing = await this.repository.findExistingReportByDedupKey(tx, dedupKey);
      if (existing) {
        return {
          caseId: existing.id,
          status: 'RECEIVED',
          message: 'Reporte recibido para revisión',
          createdAt: existing.createdAt,
        };
      }

      // 2. Query visible media in event
      const media = await this.repository.findVisibleMedia(tx, cleanMedia, cleanEvent);

      // Escenario 3: Neutralidad pública. Si la media no existe o no es visible,
      // la respuesta permanece neutral para no revelar existencia privada.
      if (!media || media.status !== 'PUBLISHED') {
        return {
          caseId: randomUUID(),
          status: 'RECEIVED',
          message: 'Reporte recibido para revisión',
          createdAt: now,
        };
      }

      // 3. Crear caso en estado PENDING_REVIEW (DEC-088: no auto-oculta)
      const caseId = randomUUID();
      const record: MediaReportRecord = {
        id: caseId,
        operationId,
        mediaRef: media.mediaRef,
        eventRef: cleanEvent,
        reason,
        description: description?.trim(),
        reporterContact: reporterContact?.trim(),
        severity: 'UNCLASSIFIED',
        status: 'PENDING_REVIEW',
        dedupKey,
        createdAt: now,
      };

      await this.repository.createReportCase(tx, record);

      await this.repository.recordAudit(tx, {
        action: 'MEDIA_REPORT_REGISTERED',
        operationId,
        mediaRef: media.mediaRef,
        eventRef: cleanEvent,
        reason,
        timestamp: now,
      });

      return {
        caseId,
        status: 'RECEIVED',
        message: 'Reporte recibido para revisión',
        createdAt: now,
      };
    });
  }
}

// ============================================================================
// SERVICE: EL-TK-114 — Retirar irreversiblemente un aporte propio con sesión guest válida
// ============================================================================

export interface OwnMediaRemovalCommand {
  guestSessionRef: string;
  mediaRef: string;
  eventRef: string;
  reason?: string;
  operationId?: string;
  now?: Date;
}

export interface OwnMediaRemovalResult {
  mediaRef: string;
  eventRef: string;
  status: 'DELETED';
  previousStatus: string;
  purgeStartedAt: Date;
  mainPurgeDeadline: Date;
  residualPurgeDeadline: Date;
  outcome: 'CONFIRMED' | 'ALREADY_REMOVED';
  operationId: string;
}

export class OwnMediaRemovalService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly repository: OwnRemovalRepository,
    private readonly sessionResolver: GuestSessionResolverPort,
    private readonly purgeDispatcher: PurgeDispatcherPort
  ) {}

  async removeOwnMedia(command: OwnMediaRemovalCommand): Promise<OwnMediaRemovalResult> {
    if (!command) {
      throw new OwnRemovalError('INVALID_ARGUMENT', 'Command is required');
    }
    const { guestSessionRef, mediaRef, eventRef } = command;

    if (!guestSessionRef || typeof guestSessionRef !== 'string' || !guestSessionRef.trim()) {
      throw new OwnRemovalError('INVALID_ARGUMENT', 'guestSessionRef is required');
    }
    if (!mediaRef || typeof mediaRef !== 'string' || !mediaRef.trim()) {
      throw new OwnRemovalError('INVALID_ARGUMENT', 'mediaRef is required');
    }
    if (!eventRef || typeof eventRef !== 'string' || !eventRef.trim()) {
      throw new OwnRemovalError('INVALID_ARGUMENT', 'eventRef is required');
    }

    const cleanMedia = mediaRef.trim().replace(/^media:/, '');
    const cleanEvent = eventRef.trim();
    const operationId = command.operationId ?? randomUUID();
    const now = command.now ?? new Date();

    return await this.transactions.run(async (tx) => {
      // 1. Validar sesión guest
      let session: { guestRef: string; eventRef: string };
      try {
        session = await this.sessionResolver.assertGuestSessionOwner(tx, guestSessionRef.trim(), cleanEvent);
      } catch (err: any) {
        if (err instanceof OwnRemovalError) throw err;
        throw new OwnRemovalError('SESSION_INVALID', 'Sesión de invitado inválida o revocada');
      }

      // 2. Idempotencia: Verificar si ya existe retiro propio previo para esta media (Escenario 3)
      const existingRemoval = await this.repository.findExistingOwnRemoval(tx, cleanMedia);
      if (existingRemoval) {
        return {
          mediaRef: existingRemoval.mediaRef,
          eventRef: existingRemoval.eventRef,
          status: 'DELETED',
          previousStatus: 'DELETED',
          purgeStartedAt: existingRemoval.purgeStartedAt,
          mainPurgeDeadline: existingRemoval.mainPurgeDeadline,
          residualPurgeDeadline: existingRemoval.residualPurgeDeadline,
          outcome: 'ALREADY_REMOVED',
          operationId,
        };
      }

      // 3. Lock y lectura de la media en el catálogo
      const media = await this.repository.lockAndGetMediaForOwnRemoval(tx, cleanMedia, cleanEvent);
      if (!media) {
        // Neutralidad / Acceso denegado
        throw new OwnRemovalError('ACCESS_DENIED', 'Media no encontrada o no accesible en el evento');
      }

      // 4. Verificación de ownership (Escenario 2)
      const cleanMediaGuest = media.guestRef.replace(/^guest:/, '');
      const cleanSessionGuest = session.guestRef.replace(/^guest:/, '');
      if (cleanMediaGuest !== cleanSessionGuest) {
        throw new OwnRemovalError('NOT_OWNER', 'El contenido no pertenece a la sesión activa');
      }

      // Si ya está en DELETED
      if (media.status === 'DELETED') {
        const purgeStartedAt = now;
        return {
          mediaRef: media.mediaRef,
          eventRef: media.eventRef,
          status: 'DELETED',
          previousStatus: media.status,
          purgeStartedAt,
          mainPurgeDeadline: addUtcCalendarDays(purgeStartedAt, 7),
          residualPurgeDeadline: addUtcCalendarDays(purgeStartedAt, 30),
          outcome: 'ALREADY_REMOVED',
          operationId,
        };
      }

      // 5. Retiro inmediato e irreversible (DEC-089, DEC-097)
      // Anclaje inmutable: purge_started_at = now
      const purgeStartedAt = now;
      const mainPurgeDeadline = addUtcCalendarDays(purgeStartedAt, 7);
      const residualPurgeDeadline = addUtcCalendarDays(purgeStartedAt, 30);

      // Transicionar a DELETED incrementando revisión
      const newRevision = await this.repository.updateMediaStatusToDeleted(tx, media.mediaRef, media.revision);

      const removalRecord: MediaOwnRemovalRecord = {
        id: randomUUID(),
        operationId,
        mediaRef: media.mediaRef,
        eventRef: cleanEvent,
        guestRef: session.guestRef,
        generation: media.generation,
        previousRevision: media.revision,
        newRevision,
        purgeStartedAt,
        mainPurgeDeadline,
        residualPurgeDeadline,
        status: 'CONFIRMED',
        dedupKey: `own-removal:${cleanMedia}`,
        createdAt: now,
      };

      await this.repository.createOwnRemovalRecord(tx, removalRecord);

      // 6. Despacho idempotente a purga (DEC-097 / DEC-098 / ARCH-019)
      const purgePayload: PurgeRequestPayload = {
        purgeIntentId: removalRecord.id,
        operationId,
        mediaRef: media.mediaRef,
        eventRef: cleanEvent,
        organizerRef: 'SYSTEM',
        generation: media.generation,
        revision: newRevision,
        purgeStartedAt,
        mainPurgeDeadline,
        residualPurgeDeadline,
        policyRef: 'PRIVACY_OWN_REMOVAL',
        policyVersion: '1.0',
      };

      await this.purgeDispatcher.dispatchPurgeRequest(purgePayload);

      // 7. Auditoría inmutable sin almacenar binarios
      await this.repository.recordAudit(tx, {
        action: 'MEDIA_OWN_REMOVAL_CONFIRMED',
        operationId,
        mediaRef: media.mediaRef,
        eventRef: cleanEvent,
        actorRef: session.guestRef,
        previousStatus: media.status,
        newStatus: 'DELETED',
        revision: newRevision,
        timestamp: now,
      });

      return {
        mediaRef: media.mediaRef,
        eventRef: cleanEvent,
        status: 'DELETED',
        previousStatus: media.status,
        purgeStartedAt,
        mainPurgeDeadline,
        residualPurgeDeadline,
        outcome: 'CONFIRMED',
        operationId,
      };
    });
  }
}

// ============================================================================
// SERVICE: EL-TK-115 — Registrar una solicitud de retiro sin sesión válida
// ============================================================================

export interface RegisterRemovalRequestCommand {
  eventRef: string;
  mediaRef: string;
  reason: RemovalRequestReason;
  description?: string;
  contactEmail: string;
  declarationAccepted: boolean;
  optionalName?: string;
  idempotencyKey?: string;
  now?: Date;
}

export interface RegisterRemovalRequestResult {
  requestId: string;
  status: 'RECEIVED';
  message: string;
  createdAt: Date;
}

export class RemovalRequestService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly repository: RemovalRequestRepository
  ) {}

  async registerRequest(command: RegisterRemovalRequestCommand): Promise<RegisterRemovalRequestResult> {
    if (!command) {
      throw new RemovalRequestError('INVALID_ARGUMENT', 'Command is required');
    }
    const {
      eventRef,
      mediaRef,
      reason,
      description,
      contactEmail,
      declarationAccepted,
      optionalName,
      idempotencyKey,
    } = command;

    if (!eventRef || typeof eventRef !== 'string' || !eventRef.trim()) {
      throw new RemovalRequestError('INVALID_ARGUMENT', 'eventRef is required');
    }
    if (!mediaRef || typeof mediaRef !== 'string' || !mediaRef.trim()) {
      throw new RemovalRequestError('INVALID_ARGUMENT', 'mediaRef is required');
    }
    if (!reason || !VALID_REMOVAL_REASONS.includes(reason)) {
      throw new RemovalRequestError(
        'INVALID_ARGUMENT',
        `Invalid removal reason. Allowed: ${VALID_REMOVAL_REASONS.join(', ')}`
      );
    }

    // Regla DEC-103: Declaración obligatoria
    if (!declarationAccepted) {
      throw new RemovalRequestError(
        'VALIDATION_FAILED',
        'La declaración de buena fe es obligatoria para procesar la solicitud'
      );
    }

    // Regla DEC-104: Si reason === 'OTHER', description es obligatoria (Escenario 2)
    if (reason === 'OTHER' && (!description || !description.trim())) {
      throw new RemovalRequestError(
        'VALIDATION_FAILED',
        'La descripción es obligatoria cuando el motivo seleccionado es Otro'
      );
    }

    // Regla DEC-103: Validación sintáctica de correo de contacto
    if (!contactEmail || typeof contactEmail !== 'string') {
      throw new RemovalRequestError('VALIDATION_FAILED', 'Correo de contacto es obligatorio');
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contactEmail.trim())) {
      throw new RemovalRequestError('VALIDATION_FAILED', 'El formato del correo de contacto es inválido');
    }

    const cleanMedia = mediaRef.trim().replace(/^media:/, '');
    const cleanEvent = eventRef.trim();
    const cleanEmail = contactEmail.trim().toLowerCase();
    const now = command.now ?? new Date();
    const operationId = randomUUID();

    const dedupKey = idempotencyKey
      ? `idemp:${idempotencyKey.trim()}`
      : `removal-req:${cleanEvent}:${cleanMedia}:${cleanEmail}:${reason}`;

    return await this.transactions.run(async (tx) => {
      // 1. Idempotencia / Reintento seguro (Escenario 2)
      const existing = await this.repository.findExistingRemovalRequestByDedupKey(tx, dedupKey);
      if (existing) {
        return {
          requestId: existing.id,
          status: 'RECEIVED',
          message: 'Solicitud recibida para revisión',
          createdAt: existing.createdAt,
        };
      }

      // 2. Registro formal del caso para revisión administrativa
      // Neutralidad (Escenario 1 & 3): siempre responde con el mismo mensaje neutral
      const requestId = randomUUID();
      const record: MediaRemovalRequestRecord = {
        id: requestId,
        operationId,
        mediaRef: cleanMedia,
        eventRef: cleanEvent,
        reason,
        description: description?.trim(),
        contactEmail: cleanEmail,
        optionalName: optionalName?.trim(),
        declarationAccepted: true,
        severity: 'UNCLASSIFIED',
        status: 'PENDING_REVIEW',
        dedupKey,
        createdAt: now,
      };

      await this.repository.createRemovalRequest(tx, record);

      await this.repository.recordAudit(tx, {
        action: 'MEDIA_REMOVAL_REQUEST_REGISTERED',
        operationId,
        mediaRef: cleanMedia,
        eventRef: cleanEvent,
        reason,
        timestamp: now,
      });

      return {
        requestId,
        status: 'RECEIVED',
        message: 'Solicitud recibida para revisión',
        createdAt: now,
      };
    });
  }
}

// ============================================================================
// POSTGRES REPOSITORY IMPLEMENTATIONS
// ============================================================================

export class PostgresMediaReportRepository implements MediaReportRepository {
  async findVisibleMedia(
    tx: SqlTransaction,
    mediaRef: string,
    eventRef: string
  ): Promise<{ mediaRef: string; eventRef: string; status: string } | null> {
    const cleanMedia = mediaRef.replace(/^media:/, '');
    const rows = await tx.query<{ media_ref: string; event_ref: string; status: string }>(
      `SELECT media_ref, event_ref, status
       FROM media_catalog
       WHERE (media_ref = $1 OR media_ref = $2) AND event_ref = $3`,
      cleanMedia,
      `media:${cleanMedia}`,
      eventRef
    );
    if (!rows.length) return null;
    return {
      mediaRef: rows[0].media_ref,
      eventRef: rows[0].event_ref,
      status: rows[0].status,
    };
  }

  async findExistingReportByDedupKey(
    tx: SqlTransaction,
    dedupKey: string
  ): Promise<MediaReportRecord | null> {
    const rows = await tx.query<{
      id: string;
      operation_id: string;
      media_ref: string;
      event_ref: string;
      reason: string;
      description: string | null;
      reporter_contact: string | null;
      severity: string;
      status: string;
      dedup_key: string;
      created_at: Date;
    }>(
      `SELECT id, operation_id, media_ref, event_ref, reason, description, reporter_contact,
              severity, status, dedup_key, created_at
       FROM media_report_case
       WHERE dedup_key = $1`,
      dedupKey
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      operationId: r.operation_id,
      mediaRef: r.media_ref,
      eventRef: r.event_ref,
      reason: r.reason as MediaReportReason,
      description: r.description ?? undefined,
      reporterContact: r.reporter_contact ?? undefined,
      severity: r.severity as ReportSeverity,
      status: r.status as ReportCaseStatus,
      dedupKey: r.dedup_key,
      createdAt: new Date(r.created_at),
    };
  }

  async createReportCase(tx: SqlTransaction, record: MediaReportRecord): Promise<void> {
    await tx.execute(
      `INSERT INTO media_report_case (
         id, operation_id, media_ref, event_ref, reason, description,
         reporter_contact, severity, status, dedup_key, created_at
       ) VALUES (
         $1::uuid, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11
       )`,
      record.id,
      record.operationId,
      record.mediaRef,
      record.eventRef,
      record.reason,
      record.description ?? null,
      record.reporterContact ?? null,
      record.severity,
      record.status,
      record.dedupKey,
      record.createdAt
    );
  }

  async recordAudit(
    tx: SqlTransaction,
    params: {
      action: string;
      operationId: string;
      mediaRef: string;
      eventRef: string;
      reason: string;
      timestamp: Date;
    }
  ): Promise<void> {
    try {
      await tx.execute(
        `INSERT INTO audit_event (
           id, occurred_at, actor_type, actor_id, action, resource_type,
           resource_id, result, reason, metadata, idempotency_key, created_at
         ) VALUES (
           $1::uuid, $2, 'GUEST_ANONYMOUS', 'ANONYMOUS', $3, 'MEDIA',
           $4, 'SUCCESS', $5, $6::jsonb, $7, $2
         )`,
        randomUUID(),
        params.timestamp,
        params.action,
        params.mediaRef,
        params.reason,
        JSON.stringify({ eventRef: params.eventRef, operationId: params.operationId }),
        params.operationId
      );
    } catch {
      // Ignorar si audit_event no está disponible en el entorno
    }
  }
}

export class PostgresOwnRemovalRepository implements OwnRemovalRepository {
  async lockAndGetMediaForOwnRemoval(
    tx: SqlTransaction,
    mediaRef: string,
    eventRef: string
  ): Promise<{
    mediaRef: string;
    eventRef: string;
    guestRef: string;
    generation: bigint;
    revision: bigint;
    status: string;
  } | null> {
    const cleanMedia = mediaRef.replace(/^media:/, '');
    const rows = await tx.query<{
      media_ref: string;
      event_ref: string;
      guest_ref: string;
      generation: bigint | string | number;
      revision: bigint | string | number;
      status: string;
    }>(
      `SELECT media_ref, event_ref, guest_ref, generation, revision, status
       FROM media_catalog
       WHERE (media_ref = $1 OR media_ref = $2) AND event_ref = $3
       FOR UPDATE`,
      cleanMedia,
      `media:${cleanMedia}`,
      eventRef
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      mediaRef: r.media_ref,
      eventRef: r.event_ref,
      guestRef: r.guest_ref,
      generation: BigInt(r.generation),
      revision: BigInt(r.revision),
      status: r.status,
    };
  }

  async findExistingOwnRemoval(
    tx: SqlTransaction,
    mediaRef: string
  ): Promise<MediaOwnRemovalRecord | null> {
    const cleanMedia = mediaRef.replace(/^media:/, '');
    const rows = await tx.query<{
      id: string;
      operation_id: string;
      media_ref: string;
      event_ref: string;
      guest_ref: string;
      generation: bigint | string | number;
      previous_revision: bigint | string | number;
      new_revision: bigint | string | number;
      purge_started_at: Date;
      main_purge_deadline: Date;
      residual_purge_deadline: Date;
      status: string;
      dedup_key: string;
      created_at: Date;
    }>(
      `SELECT id, operation_id, media_ref, event_ref, guest_ref, generation, previous_revision,
              new_revision, purge_started_at, main_purge_deadline, residual_purge_deadline,
              status, dedup_key, created_at
       FROM media_own_removal_record
       WHERE media_ref = $1 OR media_ref = $2`,
      cleanMedia,
      `media:${cleanMedia}`
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      operationId: r.operation_id,
      mediaRef: r.media_ref,
      eventRef: r.event_ref,
      guestRef: r.guest_ref,
      generation: BigInt(r.generation),
      previousRevision: BigInt(r.previous_revision),
      newRevision: BigInt(r.new_revision),
      purgeStartedAt: new Date(r.purge_started_at),
      mainPurgeDeadline: new Date(r.main_purge_deadline),
      residualPurgeDeadline: new Date(r.residual_purge_deadline),
      status: r.status as 'CONFIRMED' | 'PURGED',
      dedupKey: r.dedup_key,
      createdAt: new Date(r.created_at),
    };
  }

  async createOwnRemovalRecord(
    tx: SqlTransaction,
    record: MediaOwnRemovalRecord
  ): Promise<void> {
    await tx.execute(
      `INSERT INTO media_own_removal_record (
         id, operation_id, media_ref, event_ref, guest_ref, generation,
         previous_revision, new_revision, purge_started_at, main_purge_deadline,
         residual_purge_deadline, status, dedup_key, created_at
       ) VALUES (
         $1::uuid, $2, $3, $4, $5, $6::bigint,
         $7::bigint, $8::bigint, $9, $10,
         $11, $12, $13, $14
       )`,
      record.id,
      record.operationId,
      record.mediaRef,
      record.eventRef,
      record.guestRef,
      record.generation,
      record.previousRevision,
      record.newRevision,
      record.purgeStartedAt,
      record.mainPurgeDeadline,
      record.residualPurgeDeadline,
      record.status,
      record.dedupKey,
      record.createdAt
    );
  }

  async updateMediaStatusToDeleted(
    tx: SqlTransaction,
    mediaRef: string,
    expectedRevision: bigint
  ): Promise<bigint> {
    const cleanMedia = mediaRef.replace(/^media:/, '');
    const rows = await tx.query<{ revision: bigint | string | number }>(
      `UPDATE media_catalog
       SET status = 'DELETED', revision = revision + 1
       WHERE (media_ref = $1 OR media_ref = $2) AND revision = $3::bigint
       RETURNING revision`,
      cleanMedia,
      `media:${cleanMedia}`,
      expectedRevision
    );
    if (!rows.length) {
      throw new OwnRemovalError('CONCURRENCY_CONFLICT', 'Conflicto de concurrencia al actualizar media');
    }
    return BigInt(rows[0].revision);
  }

  async recordAudit(
    tx: SqlTransaction,
    params: {
      action: string;
      operationId: string;
      mediaRef: string;
      eventRef: string;
      actorRef: string;
      previousStatus: string;
      newStatus: string;
      revision: bigint;
      timestamp: Date;
    }
  ): Promise<void> {
    try {
      await tx.execute(
        `INSERT INTO audit_event (
           id, occurred_at, actor_type, actor_id, action, resource_type,
           resource_id, result, reason, metadata, idempotency_key, created_at
         ) VALUES (
           $1::uuid, $2, 'GUEST', $3, $4, 'MEDIA',
           $5, 'SUCCESS', 'OWN_REMOVAL', $6::jsonb, $7, $2
         )`,
        randomUUID(),
        params.timestamp,
        params.actorRef,
        params.action,
        params.mediaRef,
        JSON.stringify({
          eventRef: params.eventRef,
          previousStatus: params.previousStatus,
          newStatus: params.newStatus,
          revision: String(params.revision),
        }),
        params.operationId
      );
    } catch {
      // Ignorar si audit_event no está disponible
    }
  }
}

export class PostgresRemovalRequestRepository implements RemovalRequestRepository {
  async findExistingRemovalRequestByDedupKey(
    tx: SqlTransaction,
    dedupKey: string
  ): Promise<MediaRemovalRequestRecord | null> {
    const rows = await tx.query<{
      id: string;
      operation_id: string;
      media_ref: string;
      event_ref: string;
      reason: string;
      description: string | null;
      contact_email: string;
      optional_name: string | null;
      declaration_accepted: boolean;
      severity: string;
      status: string;
      dedup_key: string;
      created_at: Date;
    }>(
      `SELECT id, operation_id, media_ref, event_ref, reason, description, contact_email,
              optional_name, declaration_accepted, severity, status, dedup_key, created_at
       FROM media_removal_request
       WHERE dedup_key = $1`,
      dedupKey
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      operationId: r.operation_id,
      mediaRef: r.media_ref,
      eventRef: r.event_ref,
      reason: r.reason as RemovalRequestReason,
      description: r.description ?? undefined,
      contactEmail: r.contact_email,
      optionalName: r.optional_name ?? undefined,
      declarationAccepted: Boolean(r.declaration_accepted),
      severity: r.severity as ReportSeverity,
      status: r.status as RemovalRequestStatus,
      dedupKey: r.dedup_key,
      createdAt: new Date(r.created_at),
    };
  }

  async createRemovalRequest(
    tx: SqlTransaction,
    record: MediaRemovalRequestRecord
  ): Promise<void> {
    await tx.execute(
      `INSERT INTO media_removal_request (
         id, operation_id, media_ref, event_ref, reason, description,
         contact_email, optional_name, declaration_accepted, severity,
         status, dedup_key, created_at
       ) VALUES (
         $1::uuid, $2, $3, $4, $5, $6,
         $7, $8, $9, $10,
         $11, $12, $13
       )`,
      record.id,
      record.operationId,
      record.mediaRef,
      record.eventRef,
      record.reason,
      record.description ?? null,
      record.contactEmail,
      record.optionalName ?? null,
      record.declarationAccepted,
      record.severity,
      record.status,
      record.dedupKey,
      record.createdAt
    );
  }

  async recordAudit(
    tx: SqlTransaction,
    params: {
      action: string;
      operationId: string;
      mediaRef: string;
      eventRef: string;
      reason: string;
      timestamp: Date;
    }
  ): Promise<void> {
    try {
      await tx.execute(
        `INSERT INTO audit_event (
           id, occurred_at, actor_type, actor_id, action, resource_type,
           resource_id, result, reason, metadata, idempotency_key, created_at
         ) VALUES (
           $1::uuid, $2, 'PUBLIC_REQUESTER', 'ANONYMOUS', $3, 'MEDIA',
           $4, 'SUCCESS', $5, $6::jsonb, $7, $2
         )`,
        randomUUID(),
        params.timestamp,
        params.action,
        params.mediaRef,
        params.reason,
        JSON.stringify({ eventRef: params.eventRef, operationId: params.operationId }),
        params.operationId
      );
    } catch {
      // Ignorar si audit_event no está disponible
    }
  }
}

export class PostgresGuestSessionResolver implements GuestSessionResolverPort {
  async assertGuestSessionOwner(
    tx: SqlTransaction,
    guestSessionRef: string,
    eventRef: string
  ): Promise<{ guestRef: string; eventRef: string }> {
    const cleanSessionId = guestSessionRef.replace(/^guest:/, '');

    // Verifica la sesión en PostgreSQL si existe la tabla guest_session
    const rows = await tx.query<{ id: string; event_id: string; revoked_at: Date | null; expires_at: Date }>(
      `SELECT id, event_id, revoked_at, expires_at
       FROM guest_session
       WHERE id = $1::uuid`,
      cleanSessionId
    );

    if (!rows.length) {
      throw new OwnRemovalError('SESSION_INVALID', 'Sesión de invitado no encontrada');
    }

    const s = rows[0];
    if (s.event_id !== eventRef) {
      throw new OwnRemovalError('SESSION_INVALID', 'La sesión no corresponde al evento');
    }
    if (s.revoked_at !== null) {
      throw new OwnRemovalError('SESSION_INVALID', 'La sesión de invitado fue revocada');
    }
    if (new Date(s.expires_at).getTime() <= Date.now()) {
      throw new OwnRemovalError('SESSION_INVALID', 'La sesión de invitado ha expirado');
    }

    return {
      guestRef: s.id,
      eventRef: s.event_id,
    };
  }
}
