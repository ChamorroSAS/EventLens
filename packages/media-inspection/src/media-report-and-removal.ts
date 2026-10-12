import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/job-queue';
import type { AdminActorContext } from '@eventlens/identity';
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

export type MediaCaseGovernanceErrorCode =
  | 'UNAUTHORIZED_ACTOR'
  | 'INVALID_ARGUMENT'
  | 'CASE_NOT_FOUND'
  | 'CASE_ALREADY_CLOSED'
  | 'MISSING_JUSTIFICATION'
  | 'MEDIA_NOT_AVAILABLE'
  | 'CONCURRENCY_CONFLICT'
  | 'INTERNAL_ERROR';

export class MediaCaseGovernanceError extends Error {
  constructor(
    public readonly code: MediaCaseGovernanceErrorCode,
    message?: string
  ) {
    super(message ?? `Media case governance error: ${code}`);
    this.name = 'MediaCaseGovernanceError';
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
  resolvedAt?: Date | null;
  resolvedBy?: string | null;
  resolutionType?: string | null;
  resolutionNotes?: string | null;
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
  resolvedAt?: Date | null;
  resolvedBy?: string | null;
  resolutionType?: string | null;
  resolutionNotes?: string | null;
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

// ============================================================================
// CASE GOVERNANCE TYPES & INTERFACES (EL-TK-116 .. EL-TK-120)
// ============================================================================

export interface ClassifyCaseCommand {
  caseId: string;
  caseType: 'REPORT' | 'REMOVAL_REQUEST';
  severity: 'CRITICAL' | 'NORMAL';
  justification: string;
  actorContext: AdminActorContext;
}

export interface ClassifyCaseResult {
  caseId: string;
  caseType: 'REPORT' | 'REMOVAL_REQUEST';
  previousSeverity: ReportSeverity;
  newSeverity: 'CRITICAL' | 'NORMAL';
  priorityAlert: boolean;
  targetSlaHours: number;
  updatedAt: Date;
}

export interface GrantMediaAccessCommand {
  caseId: string;
  caseType: 'REPORT' | 'REMOVAL_REQUEST';
  justification: string;
  actorContext: AdminActorContext;
}

export interface MediaAccessGrantResult {
  grantId: string;
  caseId: string;
  adminId: string;
  mediaRef: string;
  token: string;
  expiresAt: Date;
  previewUrl: string;
  createdAt: Date;
}

export interface ApplyPreventiveHideCommand {
  caseId: string;
  caseType: 'REPORT' | 'REMOVAL_REQUEST';
  justification: string;
  actorContext: AdminActorContext;
}

export interface PreventiveHideResult {
  caseId: string;
  mediaRef: string;
  previousStatus: string;
  newStatus: string;
  idempotent: boolean;
  appliedAt: Date;
}

export interface ResolveCaseCommand {
  caseId: string;
  caseType: 'REPORT' | 'REMOVAL_REQUEST';
  resolutionType: 'DISMISSED' | 'REMOVED_PERMANENTLY' | 'HIDDEN_PERMANENTLY';
  justification: string;
  actorContext: AdminActorContext;
}

export interface ResolveCaseResult {
  caseId: string;
  caseType: 'REPORT' | 'REMOVAL_REQUEST';
  resolutionType: 'DISMISSED' | 'REMOVED_PERMANENTLY' | 'HIDDEN_PERMANENTLY';
  status: ReportCaseStatus | RemovalRequestStatus;
  mediaRef: string;
  mediaStatus: string;
  alreadyResolved: boolean;
  purgeDispatched: boolean;
  resolvedAt: Date;
  resolvedBy: string;
}

export interface GetCaseQueueQuery {
  severity?: 'UNCLASSIFIED' | 'CRITICAL' | 'NORMAL';
  status?: string;
  caseType?: 'ALL' | 'REPORT' | 'REMOVAL_REQUEST';
  limit?: number;
  offset?: number;
  actorContext: AdminActorContext;
}

export interface CaseQueueItem {
  caseId: string;
  caseType: 'REPORT' | 'REMOVAL_REQUEST';
  mediaRef: string;
  eventRef: string;
  reason: string;
  severity: ReportSeverity;
  status: string;
  createdAt: Date;
  resolvedAt?: Date | null;
  resolvedBy?: string | null;
  resolutionType?: string | null;
}

export interface CaseQueueResult {
  items: CaseQueueItem[];
  totalCount: number;
  emptyReason: 'NONE' | 'EMPTY_QUEUE' | 'EMPTY_FILTER_RESULTS';
}

export interface GetCaseDetailQuery {
  caseId: string;
  caseType: 'REPORT' | 'REMOVAL_REQUEST';
  actorContext: AdminActorContext;
}

export interface CaseHistoryEntry {
  id: string;
  actorId: string;
  action: string;
  previousState?: unknown;
  newState?: unknown;
  justification?: string | null;
  createdAt: Date;
}

export interface CaseDetailResult {
  caseId: string;
  caseType: 'REPORT' | 'REMOVAL_REQUEST';
  mediaRef: string;
  eventRef: string;
  reason: string;
  description?: string | null;
  reporterContact?: string | null;
  severity: ReportSeverity;
  status: string;
  createdAt: Date;
  resolvedAt?: Date | null;
  resolvedBy?: string | null;
  resolutionType?: string | null;
  resolutionNotes?: string | null;
  history: CaseHistoryEntry[];
  capabilities: {
    canClassify: boolean;
    canRequestAccess: boolean;
    canPreventiveHide: boolean;
    canResolve: boolean;
  };
  activeGrant?: {
    grantId: string;
    token: string;
    expiresAt: Date;
  } | null;
  mediaStatus?: string;
}

export interface MediaCaseGovernanceRepository {
  findCase(
    tx: SqlTransaction,
    caseId: string,
    caseType: 'REPORT' | 'REMOVAL_REQUEST'
  ): Promise<{
    id: string;
    mediaRef: string;
    eventRef: string;
    reason: string;
    description: string | null;
    reporterContact: string | null;
    severity: ReportSeverity;
    status: string;
    resolvedAt: Date | null;
    resolvedBy: string | null;
    resolutionType: string | null;
    resolutionNotes: string | null;
    createdAt: Date;
  } | null>;

  updateCaseClassification(
    tx: SqlTransaction,
    caseId: string,
    caseType: 'REPORT' | 'REMOVAL_REQUEST',
    severity: 'CRITICAL' | 'NORMAL'
  ): Promise<void>;

  findMediaCatalog(
    tx: SqlTransaction,
    mediaRef: string
  ): Promise<{
    mediaRef: string;
    eventRef: string;
    guestRef?: string;
    status: string;
    revision: bigint;
    generation: bigint;
  } | null>;

  updateMediaStatusToHidden(
    tx: SqlTransaction,
    mediaRef: string,
    expectedRevision: bigint
  ): Promise<bigint>;

  updateMediaStatusToDeleted(
    tx: SqlTransaction,
    mediaRef: string,
    expectedRevision: bigint
  ): Promise<bigint>;

  saveCaseHistory(
    tx: SqlTransaction,
    entry: {
      id: string;
      caseId: string;
      caseType: string;
      actorId: string;
      action: string;
      previousState: unknown;
      newState: unknown;
      justification?: string | null;
      createdAt: Date;
    }
  ): Promise<void>;

  saveAccessGrant(
    tx: SqlTransaction,
    grant: {
      id: string;
      caseId: string;
      adminId: string;
      mediaRef: string;
      token: string;
      justification: string;
      expiresAt: Date;
      createdAt: Date;
    }
  ): Promise<void>;

  findActiveAccessGrant(
    tx: SqlTransaction,
    caseId: string,
    adminId: string
  ): Promise<{
    id: string;
    token: string;
    expiresAt: Date;
  } | null>;

  updateCaseStatus(
    tx: SqlTransaction,
    caseId: string,
    caseType: 'REPORT' | 'REMOVAL_REQUEST',
    status: string
  ): Promise<void>;

  updateCaseResolution(
    tx: SqlTransaction,
    caseId: string,
    caseType: 'REPORT' | 'REMOVAL_REQUEST',
    resolution: {
      status: string;
      resolutionType: string;
      resolvedBy: string;
      resolutionNotes: string;
      resolvedAt: Date;
    }
  ): Promise<void>;

  findCaseHistory(
    tx: SqlTransaction,
    caseId: string
  ): Promise<CaseHistoryEntry[]>;

  queryQueue(
    tx: SqlTransaction,
    params: {
      severity?: 'UNCLASSIFIED' | 'CRITICAL' | 'NORMAL';
      status?: string;
      caseType?: 'ALL' | 'REPORT' | 'REMOVAL_REQUEST';
      limit: number;
      offset: number;
    }
  ): Promise<{
    items: CaseQueueItem[];
    filteredCount: number;
    totalCount: number;
  }>;

  recordAudit(
    tx: SqlTransaction,
    params: {
      action: string;
      operationId: string;
      mediaRef: string;
      eventRef: string;
      reason: string;
      actorId: string;
      metadata?: Record<string, unknown>;
      timestamp: Date;
    }
  ): Promise<void>;
}

// ============================================================================
// CASE GOVERNANCE SERVICE (EL-TK-116 .. EL-TK-120)
// ============================================================================

export class MediaCaseGovernanceService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly repository: MediaCaseGovernanceRepository,
    private readonly purgeDispatcher: PurgeDispatcherPort
  ) {}

  private assertAdminActor(actorContext?: AdminActorContext): asserts actorContext is AdminActorContext {
    if (!actorContext || actorContext.actorType !== 'ADMIN_HUMAN') {
      throw new MediaCaseGovernanceError('UNAUTHORIZED_ACTOR', 'Se requiere AdminActorContext de tipo ADMIN_HUMAN');
    }
  }

  /**
   * EL-TK-116: Clasificar severidad y priorizar denuncias para revisión administrativa
   * DEC-088: La denuncia grave alerta y prioriza, pero NUNCA auto-oculta el contenido.
   */
  async classifyCase(command: ClassifyCaseCommand): Promise<ClassifyCaseResult> {
    this.assertAdminActor(command.actorContext);

    if (!command.justification || !command.justification.trim()) {
      throw new MediaCaseGovernanceError('MISSING_JUSTIFICATION', 'La justificación de la clasificación es obligatoria');
    }

    if (!['CRITICAL', 'NORMAL'].includes(command.severity)) {
      throw new MediaCaseGovernanceError('INVALID_ARGUMENT', 'Severidad inválida: debe ser CRITICAL o NORMAL');
    }

    return this.transactions.run(async (tx) => {
      const caseRecord = await this.repository.findCase(tx, command.caseId, command.caseType);
      if (!caseRecord) {
        throw new MediaCaseGovernanceError('CASE_NOT_FOUND', 'El caso especificado no existe');
      }

      if (caseRecord.resolvedAt !== null || ['ACTION_TAKEN', 'RESOLVED', 'DISMISSED'].includes(caseRecord.status)) {
        throw new MediaCaseGovernanceError('CASE_ALREADY_CLOSED', 'El caso ya se encuentra resuelto y cerrado');
      }

      const previousSeverity = caseRecord.severity;
      await this.repository.updateCaseClassification(tx, command.caseId, command.caseType, command.severity);

      const now = new Date();
      await this.repository.saveCaseHistory(tx, {
        id: randomUUID(),
        caseId: command.caseId,
        caseType: command.caseType,
        actorId: command.actorContext.principalId,
        action: 'CLASSIFY',
        previousState: { severity: previousSeverity },
        newState: { severity: command.severity },
        justification: command.justification.trim(),
        createdAt: now,
      });

      await this.repository.recordAudit(tx, {
        action: 'CLASSIFY_CASE',
        operationId: randomUUID(),
        mediaRef: caseRecord.mediaRef,
        eventRef: caseRecord.eventRef,
        reason: command.justification.trim(),
        actorId: command.actorContext.principalId,
        metadata: {
          caseId: command.caseId,
          previousSeverity,
          newSeverity: command.severity,
          priorityAlert: command.severity === 'CRITICAL',
        },
        timestamp: now,
      });

      return {
        caseId: command.caseId,
        caseType: command.caseType,
        previousSeverity,
        newSeverity: command.severity,
        priorityAlert: command.severity === 'CRITICAL',
        targetSlaHours: command.severity === 'CRITICAL' ? 24 : 72,
        updatedAt: now,
      };
    });
  }

  /**
   * EL-TK-117: Autorizar acceso administrativo justificado a la media de un caso
   * Emite un token temporal (15 min) strictly scoped y audita la acción sin registrar la URL completa sensible.
   */
  async grantAdministrativeMediaAccess(command: GrantMediaAccessCommand): Promise<MediaAccessGrantResult> {
    this.assertAdminActor(command.actorContext);

    if (!command.justification || !command.justification.trim()) {
      throw new MediaCaseGovernanceError('MISSING_JUSTIFICATION', 'Se requiere motivo obligatorio para autorizar el acceso');
    }

    return this.transactions.run(async (tx) => {
      const caseRecord = await this.repository.findCase(tx, command.caseId, command.caseType);
      if (!caseRecord) {
        throw new MediaCaseGovernanceError('CASE_NOT_FOUND', 'El caso especificado no existe');
      }

      if (caseRecord.resolvedAt !== null || ['ACTION_TAKEN', 'RESOLVED', 'DISMISSED'].includes(caseRecord.status)) {
        throw new MediaCaseGovernanceError('CASE_ALREADY_CLOSED', 'El caso ya se encuentra resuelto y cerrado');
      }

      const media = await this.repository.findMediaCatalog(tx, caseRecord.mediaRef);
      if (!media || media.status === 'DELETED') {
        throw new MediaCaseGovernanceError('MEDIA_NOT_AVAILABLE', 'La media no está disponible o ha sido eliminada');
      }

      const now = new Date();
      const grantId = randomUUID();
      const token = randomUUID();
      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutos

      await this.repository.saveAccessGrant(tx, {
        id: grantId,
        caseId: caseRecord.id,
        adminId: command.actorContext.principalId,
        mediaRef: caseRecord.mediaRef,
        token,
        justification: command.justification.trim(),
        expiresAt,
        createdAt: now,
      });

      await this.repository.saveCaseHistory(tx, {
        id: randomUUID(),
        caseId: command.caseId,
        caseType: command.caseType,
        actorId: command.actorContext.principalId,
        action: 'GRANT_ACCESS',
        previousState: null,
        newState: { grantId, expiresAt: expiresAt.toISOString() },
        justification: command.justification.trim(),
        createdAt: now,
      });

      // Auditoría: Registrar quién, por qué, qué recurso y resultado; NUNCA loggear la URL completa.
      await this.repository.recordAudit(tx, {
        action: 'GRANT_MEDIA_ACCESS',
        operationId: randomUUID(),
        mediaRef: caseRecord.mediaRef,
        eventRef: caseRecord.eventRef,
        reason: command.justification.trim(),
        actorId: command.actorContext.principalId,
        metadata: {
          caseId: command.caseId,
          grantId,
        },
        timestamp: now,
      });

      const previewUrl = `/api/v1/admin/cases/${command.caseId}/media/${caseRecord.mediaRef}/preview?token=${token}`;

      return {
        grantId,
        caseId: command.caseId,
        adminId: command.actorContext.principalId,
        mediaRef: caseRecord.mediaRef,
        token,
        expiresAt,
        previewUrl,
        createdAt: now,
      };
    });
  }

  /**
   * EL-TK-118: Aplicar ocultamiento preventivo por decisión administrativa explícita
   * Retira la media de nuevas consultas preservando el caso y sin disparar purga.
   */
  async applyPreventiveHide(command: ApplyPreventiveHideCommand): Promise<PreventiveHideResult> {
    this.assertAdminActor(command.actorContext);

    if (!command.justification || !command.justification.trim()) {
      throw new MediaCaseGovernanceError('MISSING_JUSTIFICATION', 'Se requiere motivo obligatorio para el ocultamiento preventivo');
    }

    return this.transactions.run(async (tx) => {
      const caseRecord = await this.repository.findCase(tx, command.caseId, command.caseType);
      if (!caseRecord) {
        throw new MediaCaseGovernanceError('CASE_NOT_FOUND', 'El caso especificado no existe');
      }

      if (caseRecord.resolvedAt !== null || ['ACTION_TAKEN', 'RESOLVED', 'DISMISSED'].includes(caseRecord.status)) {
        throw new MediaCaseGovernanceError('CASE_ALREADY_CLOSED', 'El caso ya se encuentra resuelto y cerrado');
      }

      const media = await this.repository.findMediaCatalog(tx, caseRecord.mediaRef);
      if (!media) {
        throw new MediaCaseGovernanceError('MEDIA_NOT_AVAILABLE', 'La media no existe en el catálogo');
      }

      // Idempotencia: si ya está DELETED o TRASHED, responder consistente sin resucitarla
      if (media.status === 'DELETED' || media.status === 'TRASHED') {
        return {
          caseId: command.caseId,
          mediaRef: media.mediaRef,
          previousStatus: media.status,
          newStatus: media.status,
          idempotent: true,
          appliedAt: new Date(),
        };
      }

      // Idempotencia: si ya está HIDDEN, responder no-op
      if (media.status === 'HIDDEN') {
        return {
          caseId: command.caseId,
          mediaRef: media.mediaRef,
          previousStatus: 'HIDDEN',
          newStatus: 'HIDDEN',
          idempotent: true,
          appliedAt: new Date(),
        };
      }

      await this.repository.updateMediaStatusToHidden(tx, media.mediaRef, media.revision);

      if (caseRecord.status === 'PENDING_REVIEW') {
        await this.repository.updateCaseStatus(tx, command.caseId, command.caseType, 'UNDER_INVESTIGATION');
      }

      const now = new Date();
      await this.repository.saveCaseHistory(tx, {
        id: randomUUID(),
        caseId: command.caseId,
        caseType: command.caseType,
        actorId: command.actorContext.principalId,
        action: 'PREVENTIVE_HIDE',
        previousState: { mediaStatus: media.status },
        newState: { mediaStatus: 'HIDDEN' },
        justification: command.justification.trim(),
        createdAt: now,
      });

      await this.repository.recordAudit(tx, {
        action: 'PREVENTIVE_HIDE',
        operationId: randomUUID(),
        mediaRef: media.mediaRef,
        eventRef: media.eventRef,
        reason: command.justification.trim(),
        actorId: command.actorContext.principalId,
        metadata: {
          caseId: command.caseId,
          previousMediaStatus: media.status,
          newMediaStatus: 'HIDDEN',
        },
        timestamp: now,
      });

      return {
        caseId: command.caseId,
        mediaRef: media.mediaRef,
        previousStatus: media.status,
        newStatus: 'HIDDEN',
        idempotent: false,
        appliedAt: now,
      };
    });
  }

  /**
   * EL-TK-119: Resolver un caso de reporte o retiro registrando la intervención
   * Soporta DISMISSED, REMOVED_PERMANENTLY (con purga inmediata sin papelera DEC-089/DEC-097)
   * o HIDDEN_PERMANENTLY con idempotencia ante resoluciones previas.
   */
  async resolveCase(command: ResolveCaseCommand): Promise<ResolveCaseResult> {
    this.assertAdminActor(command.actorContext);

    if (!command.justification || !command.justification.trim()) {
      throw new MediaCaseGovernanceError('MISSING_JUSTIFICATION', 'Se requiere motivo obligatorio para resolver el caso');
    }

    if (!['DISMISSED', 'REMOVED_PERMANENTLY', 'HIDDEN_PERMANENTLY'].includes(command.resolutionType)) {
      throw new MediaCaseGovernanceError('INVALID_ARGUMENT', 'Tipo de resolución inválido');
    }

    return this.transactions.run(async (tx) => {
      const caseRecord = await this.repository.findCase(tx, command.caseId, command.caseType);
      if (!caseRecord) {
        throw new MediaCaseGovernanceError('CASE_NOT_FOUND', 'El caso especificado no existe');
      }

      // Idempotencia: si ya está resuelto, no duplicar acciones destructivas
      if (caseRecord.resolvedAt !== null || ['ACTION_TAKEN', 'RESOLVED', 'DISMISSED'].includes(caseRecord.status)) {
        return {
          caseId: command.caseId,
          caseType: command.caseType,
          resolutionType: (caseRecord.resolutionType as any) ?? command.resolutionType,
          status: caseRecord.status as any,
          mediaRef: caseRecord.mediaRef,
          mediaStatus: 'UNCHANGED',
          alreadyResolved: true,
          purgeDispatched: false,
          resolvedAt: caseRecord.resolvedAt ?? caseRecord.createdAt,
          resolvedBy: caseRecord.resolvedBy ?? 'UNKNOWN',
        };
      }

      const media = await this.repository.findMediaCatalog(tx, caseRecord.mediaRef);
      if (!media) {
        throw new MediaCaseGovernanceError('MEDIA_NOT_AVAILABLE', 'La media no existe en el catálogo');
      }

      const now = new Date();
      let targetCaseStatus: string;
      let targetMediaStatus: string = media.status;
      let purgeDispatched = false;

      if (command.resolutionType === 'DISMISSED') {
        targetCaseStatus = 'DISMISSED';
      } else if (command.resolutionType === 'REMOVED_PERMANENTLY') {
        targetCaseStatus = command.caseType === 'REPORT' ? 'ACTION_TAKEN' : 'RESOLVED';
        if (media.status !== 'DELETED') {
          await this.repository.updateMediaStatusToDeleted(tx, media.mediaRef, media.revision);
          targetMediaStatus = 'DELETED';
        }
        // Purga inmediata sin papelera de owner per DEC-089 y DEC-097
        const purgeStartedAt = now;
        const mainPurgeDeadline = addUtcCalendarDays(now, 7);
        const residualPurgeDeadline = addUtcCalendarDays(now, 30);
        const purgeIntentId = randomUUID();
        const operationId = randomUUID();
        await this.purgeDispatcher.dispatchPurgeRequest({
          purgeIntentId,
          operationId,
          mediaRef: media.mediaRef,
          eventRef: media.eventRef,
          organizerRef: 'ADMIN_REMOVAL',
          generation: media.generation,
          revision: media.revision,
          purgeStartedAt,
          mainPurgeDeadline,
          residualPurgeDeadline,
          policyRef: 'ADMIN_REMOVAL_CASE',
          policyVersion: '1.0',
        });
        purgeDispatched = true;
      } else if (command.resolutionType === 'HIDDEN_PERMANENTLY') {
        targetCaseStatus = command.caseType === 'REPORT' ? 'ACTION_TAKEN' : 'RESOLVED';
        if (media.status !== 'HIDDEN' && media.status !== 'DELETED') {
          await this.repository.updateMediaStatusToHidden(tx, media.mediaRef, media.revision);
          targetMediaStatus = 'HIDDEN';
        }
      } else {
        throw new MediaCaseGovernanceError('INVALID_ARGUMENT', 'Tipo de resolución desconocido');
      }

      await this.repository.updateCaseResolution(tx, command.caseId, command.caseType, {
        status: targetCaseStatus,
        resolutionType: command.resolutionType,
        resolvedBy: command.actorContext.principalId,
        resolutionNotes: command.justification.trim(),
        resolvedAt: now,
      });

      await this.repository.saveCaseHistory(tx, {
        id: randomUUID(),
        caseId: command.caseId,
        caseType: command.caseType,
        actorId: command.actorContext.principalId,
        action: 'RESOLVE',
        previousState: { status: caseRecord.status, severity: caseRecord.severity },
        newState: { status: targetCaseStatus, resolutionType: command.resolutionType, mediaStatus: targetMediaStatus },
        justification: command.justification.trim(),
        createdAt: now,
      });

      await this.repository.recordAudit(tx, {
        action: 'RESOLVE_CASE',
        operationId: randomUUID(),
        mediaRef: media.mediaRef,
        eventRef: media.eventRef,
        reason: command.justification.trim(),
        actorId: command.actorContext.principalId,
        metadata: {
          caseId: command.caseId,
          resolutionType: command.resolutionType,
          purgeDispatched,
        },
        timestamp: now,
      });

      return {
        caseId: command.caseId,
        caseType: command.caseType,
        resolutionType: command.resolutionType,
        status: targetCaseStatus as any,
        mediaRef: media.mediaRef,
        mediaStatus: targetMediaStatus,
        alreadyResolved: false,
        purgeDispatched,
        resolvedAt: now,
        resolvedBy: command.actorContext.principalId,
      };
    });
  }

  /**
   * EL-TK-120: Consultar la cola de casos para revisión administrativa
   * Devuelve items sanitizados ordenados por severidad y fecha, sin previews de media.
   * Distingue EMPTY_QUEUE de EMPTY_FILTER_RESULTS.
   */
  async getCaseQueue(query: GetCaseQueueQuery): Promise<CaseQueueResult> {
    this.assertAdminActor(query.actorContext);

    return this.transactions.run(async (tx) => {
      const result = await this.repository.queryQueue(tx, {
        severity: query.severity,
        status: query.status,
        caseType: query.caseType ?? 'ALL',
        limit: query.limit ?? 50,
        offset: query.offset ?? 0,
      });

      let emptyReason: 'NONE' | 'EMPTY_QUEUE' | 'EMPTY_FILTER_RESULTS' = 'NONE';
      if (result.totalCount === 0) {
        emptyReason = 'EMPTY_QUEUE';
      } else if (result.items.length === 0) {
        emptyReason = 'EMPTY_FILTER_RESULTS';
      }

      return {
        items: result.items,
        totalCount: result.filteredCount,
        emptyReason,
      };
    });
  }

  /**
   * EL-TK-120: Consultar el detalle de un caso para revisión administrativa
   * Devuelve historial y capacidades sin preview automático de media.
   */
  async getCaseDetail(query: GetCaseDetailQuery): Promise<CaseDetailResult> {
    this.assertAdminActor(query.actorContext);

    return this.transactions.run(async (tx) => {
      const caseRecord = await this.repository.findCase(tx, query.caseId, query.caseType);
      if (!caseRecord) {
        throw new MediaCaseGovernanceError('CASE_NOT_FOUND', 'El caso especificado no existe');
      }

      const history = await this.repository.findCaseHistory(tx, query.caseId);
      const media = await this.repository.findMediaCatalog(tx, caseRecord.mediaRef);
      const activeGrant = await this.repository.findActiveAccessGrant(tx, query.caseId, query.actorContext.principalId);

      const isResolved = caseRecord.resolvedAt !== null || ['ACTION_TAKEN', 'RESOLVED', 'DISMISSED'].includes(caseRecord.status);
      const mediaStatus = media?.status;

      const capabilities = {
        canClassify: !isResolved,
        canRequestAccess: !isResolved && mediaStatus !== 'DELETED',
        canPreventiveHide: !isResolved && mediaStatus !== 'HIDDEN' && mediaStatus !== 'DELETED',
        canResolve: !isResolved,
      };

      return {
        caseId: caseRecord.id,
        caseType: query.caseType,
        mediaRef: caseRecord.mediaRef,
        eventRef: caseRecord.eventRef,
        reason: caseRecord.reason,
        description: caseRecord.description,
        reporterContact: caseRecord.reporterContact,
        severity: caseRecord.severity,
        status: caseRecord.status,
        createdAt: caseRecord.createdAt,
        resolvedAt: caseRecord.resolvedAt,
        resolvedBy: caseRecord.resolvedBy,
        resolutionType: caseRecord.resolutionType,
        resolutionNotes: caseRecord.resolutionNotes,
        history,
        capabilities,
        mediaStatus,
        activeGrant: activeGrant
          ? {
              grantId: activeGrant.id,
              token: activeGrant.token,
              expiresAt: activeGrant.expiresAt,
            }
          : null,
      };
    });
  }
}

// ============================================================================
// POSTGRES IMPLEMENTATION OF CASE GOVERNANCE REPOSITORY
// ============================================================================

export class PostgresMediaCaseGovernanceRepository implements MediaCaseGovernanceRepository {
  async findCase(
    tx: SqlTransaction,
    caseId: string,
    caseType: 'REPORT' | 'REMOVAL_REQUEST'
  ): Promise<{
    id: string;
    mediaRef: string;
    eventRef: string;
    reason: string;
    description: string | null;
    reporterContact: string | null;
    severity: ReportSeverity;
    status: string;
    resolvedAt: Date | null;
    resolvedBy: string | null;
    resolutionType: string | null;
    resolutionNotes: string | null;
    createdAt: Date;
  } | null> {
    if (caseType === 'REPORT') {
      const rows = await tx.query<{
        id: string;
        media_ref: string;
        event_ref: string;
        reason: string;
        description: string | null;
        reporter_contact: string | null;
        severity: string;
        status: string;
        resolved_at: Date | null;
        resolved_by: string | null;
        resolution_type: string | null;
        resolution_notes: string | null;
        created_at: Date;
      }>(
        `SELECT id, media_ref, event_ref, reason, description, reporter_contact, severity, status, resolved_at, resolved_by, resolution_type, resolution_notes, created_at
         FROM media_report_case
         WHERE id = $1::uuid`,
        caseId
      );
      if (!rows.length) return null;
      const r = rows[0];
      return {
        id: r.id,
        mediaRef: r.media_ref,
        eventRef: r.event_ref,
        reason: r.reason,
        description: r.description,
        reporterContact: r.reporter_contact,
        severity: r.severity as ReportSeverity,
        status: r.status,
        resolvedAt: r.resolved_at ? new Date(r.resolved_at) : null,
        resolvedBy: r.resolved_by,
        resolutionType: r.resolution_type,
        resolutionNotes: r.resolution_notes,
        createdAt: new Date(r.created_at),
      };
    } else {
      const rows = await tx.query<{
        id: string;
        media_ref: string;
        event_ref: string;
        reason: string;
        description: string | null;
        contact_email: string;
        severity: string;
        status: string;
        resolved_at: Date | null;
        resolved_by: string | null;
        resolution_type: string | null;
        resolution_notes: string | null;
        created_at: Date;
      }>(
        `SELECT id, media_ref, event_ref, reason, description, contact_email, severity, status, resolved_at, resolved_by, resolution_type, resolution_notes, created_at
         FROM media_removal_request
         WHERE id = $1::uuid`,
        caseId
      );
      if (!rows.length) return null;
      const r = rows[0];
      return {
        id: r.id,
        mediaRef: r.media_ref,
        eventRef: r.event_ref,
        reason: r.reason,
        description: r.description,
        reporterContact: r.contact_email,
        severity: r.severity as ReportSeverity,
        status: r.status,
        resolvedAt: r.resolved_at ? new Date(r.resolved_at) : null,
        resolvedBy: r.resolved_by,
        resolutionType: r.resolution_type,
        resolutionNotes: r.resolution_notes,
        createdAt: new Date(r.created_at),
      };
    }
  }

  async updateCaseClassification(
    tx: SqlTransaction,
    caseId: string,
    caseType: 'REPORT' | 'REMOVAL_REQUEST',
    severity: 'CRITICAL' | 'NORMAL'
  ): Promise<void> {
    const table = caseType === 'REPORT' ? 'media_report_case' : 'media_removal_request';
    await tx.execute(
      `UPDATE ${table} SET severity = $1 WHERE id = $2::uuid`,
      severity,
      caseId
    );
  }

  async findMediaCatalog(
    tx: SqlTransaction,
    mediaRef: string
  ): Promise<{
    mediaRef: string;
    eventRef: string;
    guestRef?: string;
    status: string;
    revision: bigint;
    generation: bigint;
  } | null> {
    const cleanMedia = mediaRef.replace(/^media:/, '');
    const rows = await tx.query<{
      media_ref: string;
      event_ref: string;
      guest_ref: string;
      status: string;
      revision: bigint | string | number;
      generation: bigint | string | number;
    }>(
      `SELECT media_ref, event_ref, guest_ref, status, revision, generation
       FROM media_catalog
       WHERE media_ref = $1 OR media_ref = $2`,
      cleanMedia,
      `media:${cleanMedia}`
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      mediaRef: r.media_ref,
      eventRef: r.event_ref,
      guestRef: r.guest_ref,
      status: r.status,
      revision: BigInt(r.revision),
      generation: BigInt(r.generation),
    };
  }

  async updateMediaStatusToHidden(
    tx: SqlTransaction,
    mediaRef: string,
    expectedRevision: bigint
  ): Promise<bigint> {
    const cleanMedia = mediaRef.replace(/^media:/, '');
    const rows = await tx.query<{ revision: bigint | string | number }>(
      `UPDATE media_catalog
       SET status = 'HIDDEN', revision = revision + 1
       WHERE (media_ref = $1 OR media_ref = $2) AND revision = $3::bigint
       RETURNING revision`,
      cleanMedia,
      `media:${cleanMedia}`,
      expectedRevision
    );
    if (!rows.length) {
      throw new MediaCaseGovernanceError('CONCURRENCY_CONFLICT', 'Conflicto de concurrencia al ocultar media');
    }
    return BigInt(rows[0].revision);
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
      throw new MediaCaseGovernanceError('CONCURRENCY_CONFLICT', 'Conflicto de concurrencia al eliminar media');
    }
    return BigInt(rows[0].revision);
  }

  async saveCaseHistory(
    tx: SqlTransaction,
    entry: {
      id: string;
      caseId: string;
      caseType: string;
      actorId: string;
      action: string;
      previousState: unknown;
      newState: unknown;
      justification?: string | null;
      createdAt: Date;
    }
  ): Promise<void> {
    await tx.execute(
      `INSERT INTO media_case_history (
         id, case_id, case_type, actor_id, action,
         previous_state, new_state, justification, created_at
       ) VALUES (
         $1::uuid, $2::uuid, $3, $4, $5,
         $6::jsonb, $7::jsonb, $8, $9
       )`,
      entry.id,
      entry.caseId,
      entry.caseType,
      entry.actorId,
      entry.action,
      entry.previousState ? JSON.stringify(entry.previousState) : null,
      entry.newState ? JSON.stringify(entry.newState) : null,
      entry.justification ?? null,
      entry.createdAt
    );
  }

  async saveAccessGrant(
    tx: SqlTransaction,
    grant: {
      id: string;
      caseId: string;
      adminId: string;
      mediaRef: string;
      token: string;
      justification: string;
      expiresAt: Date;
      createdAt: Date;
    }
  ): Promise<void> {
    await tx.execute(
      `INSERT INTO media_case_access_grant (
         id, case_id, admin_id, media_ref, token,
         justification, expires_at, created_at
       ) VALUES (
         $1::uuid, $2::uuid, $3, $4, $5,
         $6, $7, $8
       )`,
      grant.id,
      grant.caseId,
      grant.adminId,
      grant.mediaRef,
      grant.token,
      grant.justification,
      grant.expiresAt,
      grant.createdAt
    );
  }

  async findActiveAccessGrant(
    tx: SqlTransaction,
    caseId: string,
    adminId: string
  ): Promise<{ id: string; token: string; expiresAt: Date } | null> {
    const rows = await tx.query<{ id: string; token: string; expires_at: Date }>(
      `SELECT id, token, expires_at
       FROM media_case_access_grant
       WHERE case_id = $1::uuid AND admin_id = $2 AND expires_at > NOW()
       ORDER BY expires_at DESC
       LIMIT 1`,
      caseId,
      adminId
    );
    if (!rows.length) return null;
    return {
      id: rows[0].id,
      token: rows[0].token,
      expiresAt: new Date(rows[0].expires_at),
    };
  }

  async updateCaseStatus(
    tx: SqlTransaction,
    caseId: string,
    caseType: 'REPORT' | 'REMOVAL_REQUEST',
    status: string
  ): Promise<void> {
    const table = caseType === 'REPORT' ? 'media_report_case' : 'media_removal_request';
    await tx.execute(
      `UPDATE ${table} SET status = $1 WHERE id = $2::uuid`,
      status,
      caseId
    );
  }

  async updateCaseResolution(
    tx: SqlTransaction,
    caseId: string,
    caseType: 'REPORT' | 'REMOVAL_REQUEST',
    resolution: {
      status: string;
      resolutionType: string;
      resolvedBy: string;
      resolutionNotes: string;
      resolvedAt: Date;
    }
  ): Promise<void> {
    const table = caseType === 'REPORT' ? 'media_report_case' : 'media_removal_request';
    await tx.execute(
      `UPDATE ${table}
       SET status = $1, resolution_type = $2, resolved_by = $3, resolution_notes = $4, resolved_at = $5
       WHERE id = $6::uuid`,
      resolution.status,
      resolution.resolutionType,
      resolution.resolvedBy,
      resolution.resolutionNotes,
      resolution.resolvedAt,
      caseId
    );
  }

  async findCaseHistory(tx: SqlTransaction, caseId: string): Promise<CaseHistoryEntry[]> {
    const rows = await tx.query<{
      id: string;
      actor_id: string;
      action: string;
      previous_state: unknown;
      new_state: unknown;
      justification: string | null;
      created_at: Date;
    }>(
      `SELECT id, actor_id, action, previous_state, new_state, justification, created_at
       FROM media_case_history
       WHERE case_id = $1::uuid
       ORDER BY created_at ASC`,
      caseId
    );
    return rows.map((r) => ({
      id: r.id,
      actorId: r.actor_id,
      action: r.action,
      previousState: r.previous_state,
      newState: r.new_state,
      justification: r.justification,
      createdAt: new Date(r.created_at),
    }));
  }

  async queryQueue(
    tx: SqlTransaction,
    params: {
      severity?: 'UNCLASSIFIED' | 'CRITICAL' | 'NORMAL';
      status?: string;
      caseType?: 'ALL' | 'REPORT' | 'REMOVAL_REQUEST';
      limit: number;
      offset: number;
    }
  ): Promise<{
    items: CaseQueueItem[];
    filteredCount: number;
    totalCount: number;
  }> {
    const totalCountRows = await tx.query<{ count: string | number }>(
      `SELECT (
         (SELECT COUNT(*) FROM media_report_case) +
         (SELECT COUNT(*) FROM media_removal_request)
       ) AS count`
    );
    const totalCount = Number(totalCountRows[0]?.count ?? 0);

    const conditions: string[] = [];
    const queryParams: unknown[] = [];
    let paramIdx = 1;

    if (params.severity) {
      conditions.push(`severity = $${paramIdx++}`);
      queryParams.push(params.severity);
    }
    if (params.status) {
      conditions.push(`status = $${paramIdx++}`);
      queryParams.push(params.status);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    let baseUnion: string;
    if (params.caseType === 'REPORT') {
      baseUnion = `
        SELECT id, 'REPORT' AS case_type, media_ref, event_ref, reason, severity, status, created_at, resolved_at, resolved_by, resolution_type
        FROM media_report_case
      `;
    } else if (params.caseType === 'REMOVAL_REQUEST') {
      baseUnion = `
        SELECT id, 'REMOVAL_REQUEST' AS case_type, media_ref, event_ref, reason, severity, status, created_at, resolved_at, resolved_by, resolution_type
        FROM media_removal_request
      `;
    } else {
      baseUnion = `
        SELECT id, 'REPORT' AS case_type, media_ref, event_ref, reason, severity, status, created_at, resolved_at, resolved_by, resolution_type
        FROM media_report_case
        UNION ALL
        SELECT id, 'REMOVAL_REQUEST' AS case_type, media_ref, event_ref, reason, severity, status, created_at, resolved_at, resolved_by, resolution_type
        FROM media_removal_request
      `;
    }

    const countQuery = `SELECT COUNT(*) AS count FROM (${baseUnion}) q ${whereClause}`;
    const filteredCountRows = await tx.query<{ count: string | number }>(countQuery, ...queryParams);
    const filteredCount = Number(filteredCountRows[0]?.count ?? 0);

    const dataQuery = `
      SELECT id, case_type, media_ref, event_ref, reason, severity, status, created_at, resolved_at, resolved_by, resolution_type
      FROM (${baseUnion}) q
      ${whereClause}
      ORDER BY
        CASE severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'NORMAL' THEN 2
          ELSE 3
        END ASC,
        created_at ASC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;
    queryParams.push(params.limit, params.offset);

    const rows = await tx.query<{
      id: string;
      case_type: 'REPORT' | 'REMOVAL_REQUEST';
      media_ref: string;
      event_ref: string;
      reason: string;
      severity: ReportSeverity;
      status: string;
      created_at: Date;
      resolved_at: Date | null;
      resolved_by: string | null;
      resolution_type: string | null;
    }>(dataQuery, ...queryParams);

    const items: CaseQueueItem[] = rows.map((r) => ({
      caseId: r.id,
      caseType: r.case_type,
      mediaRef: r.media_ref,
      eventRef: r.event_ref,
      reason: r.reason,
      severity: r.severity,
      status: r.status,
      createdAt: new Date(r.created_at),
      resolvedAt: r.resolved_at ? new Date(r.resolved_at) : null,
      resolvedBy: r.resolved_by,
      resolutionType: r.resolution_type,
    }));

    return { items, filteredCount, totalCount };
  }

  async recordAudit(
    tx: SqlTransaction,
    params: {
      action: string;
      operationId: string;
      mediaRef: string;
      eventRef: string;
      reason: string;
      actorId: string;
      metadata?: Record<string, unknown>;
      timestamp: Date;
    }
  ): Promise<void> {
    try {
      await tx.execute(
        `INSERT INTO audit_event (
           id, occurred_at, actor_type, actor_id, action, resource_type,
           resource_id, result, reason, metadata, idempotency_key, created_at
         ) VALUES (
           $1::uuid, $2, 'ADMIN_HUMAN', $3, $4, 'MEDIA_CASE',
           $5, 'SUCCESS', $6, $7::jsonb, $8, $2
         )`,
        randomUUID(),
        params.timestamp,
        params.actorId,
        params.action,
        params.mediaRef,
        params.reason,
        JSON.stringify({
          eventRef: params.eventRef,
          operationId: params.operationId,
          ...(params.metadata ?? {}),
        }),
        params.operationId
      );
    } catch {
      // Ignorar si audit_event no está disponible
    }
  }
}
