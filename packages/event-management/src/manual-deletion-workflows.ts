import { createHash, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import type {
  AdminActorContext,
  OrganizerActorContext,
  AccountReauthenticationPort,
} from '@eventlens/identity';
import type { EventStatus, EventAuditSink, GuestActorContext } from './contracts.js';
import {
  DeletionCoordinationError,
  type DeletionRequestRecord,
  type DeletionCoordinationRepository,
  PostgresDeletionCoordinationRepository,
  computeDeletionDeadlines,
} from './deletion-coordination.js';

// ============================================================================
// 1. Contratos y Puertos para Ruta 2 (EL-TK-189, 190, 191, 192, 193)
// ============================================================================

export type DeletionBarrierState = 'PREPARED' | 'ACTIVE' | 'UNKNOWN' | 'RELEASED';
export type DeletionBarrierTargetScopeType = 'EVENT' | 'ACCOUNT' | 'MEDIA' | 'EXPORT';

export interface DeletionAccessBarrierRecord {
  readonly id: string;
  readonly requestId: string;
  readonly cause: string;
  readonly scopeType: string;
  readonly scopeRef: string;
  readonly targetScopeType: DeletionBarrierTargetScopeType;
  readonly targetScopeRef: string;
  readonly barrierState: DeletionBarrierState;
  readonly eventSnapshotStatus: EventStatus | null;
  readonly eventSnapshotPreviousStatus: EventStatus | null;
  readonly inFlightWritersCount: number;
  readonly revokedGrantsCount: number;
  readonly invalidatedExportsCount: number;
  readonly deniedAccessCount: number;
  readonly exportPartsInventory: readonly ExportPartInventoryItem[];
  readonly preparedAt: Date;
  readonly confirmedAt: Date | null;
  readonly releasedAt: Date | null;
  readonly releasedBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ExportPartInventoryItem {
  readonly exportId: string;
  readonly objectKey: string;
  readonly versionId?: string | null;
  readonly partKind: 'ZIP_PART' | 'MANIFEST' | 'OUTPUT_ARCHIVE' | 'STAGING';
}

export interface ExportInvalidationResult {
  readonly invalidatedExportsCount: number;
  readonly partsInventory: readonly ExportPartInventoryItem[];
}

/**
 * Puerto hacia MOD-005 (EL-TK-128 / EL-TK-193) para invalidar exportaciones afectadas
 * y recuperar el inventario exacto de partes sin exponer URLs firmadas.
 */
export interface ExportDeletionBarrierPort {
  invalidateExportsForScope(params: {
    readonly scopeType: 'EVENT' | 'ACCOUNT';
    readonly scopeRef: string;
    readonly targetEventIds: readonly string[];
    readonly requestId: string;
    readonly reason: string;
  }): Promise<ExportInvalidationResult>;
}

/**
 * Puerto hacia RecoveryAuthority (MOD-009 / EL-TK-046 / EL-TK-197) para protocolo
 * PREPARE -> SQL -> ACK de barreras de eliminación y cancelación causal.
 */
export interface DeletionRecoveryBarrierPort {
  getRecoveryEpoch(): Promise<bigint>;
  prepareDeletionBarrier(params: {
    readonly operationId: string;
    readonly scopeType: 'EVENT' | 'ACCOUNT' | 'MEDIA';
    readonly scopeRef: string;
    readonly cause: string;
    readonly expectedRevision: bigint;
    readonly recoveryEpoch: bigint;
  }): Promise<{ readonly preparedReceipt: string; readonly sequence: bigint }>;
  ackDeletionBarrier(params: {
    readonly preparedReceipt: string;
    readonly requestId: string;
    readonly revision: bigint;
    readonly recoveryEpoch: bigint;
  }): Promise<void>;
  prepareCancellationBarrierRelease(params: {
    readonly operationId: string;
    readonly requestId: string;
    readonly scopeType: 'EVENT' | 'ACCOUNT';
    readonly scopeRef: string;
    readonly expectedRevision: bigint;
    readonly recoveryEpoch: bigint;
  }): Promise<{ readonly preparedReceipt: string; readonly sequence: bigint }>;
  ackCancellationBarrierRelease(params: {
    readonly preparedReceipt: string;
    readonly requestId: string;
    readonly revision: bigint;
    readonly recoveryEpoch: bigint;
  }): Promise<void>;
}

/**
 * Puerto hacia MOD-007 (ARCH-013 / EL-TK-190 / EL-TK-192) para verificar grants
 * administrativos de cancelación de solicitudes de eliminación.
 */
export interface AdminCancellationGrantRecord {
  readonly grantId: string;
  readonly granteePrincipalId: string;
  readonly operation: 'CANCEL_EVENT_DELETION' | 'CANCEL_ACCOUNT_DELETION';
  readonly resourceType: 'EVENT' | 'ACCOUNT';
  readonly resourceRef: string;
  readonly requestId: string;
  readonly status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  readonly expiresAt: Date;
}

export interface AdminCancellationGrantPort {
  verifyActiveGrant(params: {
    readonly principalId: string;
    readonly operation: 'CANCEL_EVENT_DELETION' | 'CANCEL_ACCOUNT_DELETION';
    readonly resourceType: 'EVENT' | 'ACCOUNT';
    readonly resourceRef: string;
    readonly requestId: string;
    readonly now: Date;
  }): Promise<AdminCancellationGrantRecord | null>;
}

/**
 * Puerto hacia MOD-009 (EL-TK-159 / DEC-091) para emitir notificaciones de solicitud/cancelación
 * de cuenta o evento. Un fallo en notificación jamás revierte la operación confirmada.
 */
export interface DeletionNotificationPort {
  notifyAccountDeletionRequested?(params: {
    readonly accountId: string;
    readonly requestId: string;
    readonly cancelUntil: Date;
  }): Promise<void>;
  notifyAccountDeletionCancelled?(params: {
    readonly accountId: string;
    readonly requestId: string;
    readonly cancelledAt: Date;
  }): Promise<void>;
}

export interface BarrierObservabilityMetric {
  readonly metric:
    | 'BARRIER_PREPARED'
    | 'BARRIER_CONFIRMED'
    | 'BARRIER_UNKNOWN'
    | 'BARRIER_RELEASED'
    | 'GRANTS_REVOKED'
    | 'EXPORTS_INVALIDATED'
    | 'ACCESS_DENIED_BY_BARRIER'
    | 'NOTIFICATION_EMISSION_FAILED';
  readonly scopeType: string;
  readonly cause?: string;
  readonly count: number;
  readonly timestamp: Date;
}

export interface BarrierObservabilitySink {
  recordBarrierMetric(metric: BarrierObservabilityMetric): void;
}

// ============================================================================
// 2. Comandos y Resultados de EL-TK-189, 190, 191, 192, 193
// ============================================================================

export interface RequestManualEventDeletionCommand {
  readonly actorContext: OrganizerActorContext;
  readonly eventId: string;
  readonly confirmation: boolean;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
  readonly now?: Date;
}

export interface RequestManualEventDeletionResult {
  readonly outcome: 'REQUESTED' | 'IDEMPOTENT_REPLAY' | 'OUTCOME_UNKNOWN';
  readonly request: DeletionRequestRecord;
  readonly barrier: DeletionAccessBarrierRecord;
  readonly eventStatus: EventStatus;
  readonly cancelUntil: Date;
  readonly purgeStartedAt: Date;
}

export interface CancelManualEventDeletionCommand {
  readonly actorContext: OrganizerActorContext | AdminActorContext;
  readonly eventId: string;
  readonly requestId: string;
  readonly confirmation: boolean;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
  /** Obligatorio para ADMIN_HUMAN (EL-TK-190 Escenario 4) */
  readonly reason?: string;
  /** Prohibido para ADMIN_HUMAN: prueba de organizador nunca sustituye identidad admin */
  readonly organizerProofAttempt?: string;
  readonly now?: Date;
}

export interface CancelManualEventDeletionResult {
  readonly outcome: 'CANCELLED' | 'IDEMPOTENT_REPLAY' | 'OUTCOME_UNKNOWN';
  readonly request: DeletionRequestRecord;
  readonly recalculatedEventStatus: EventStatus;
  readonly remainingActiveBarriersCount: number;
}

export interface RequestManualAccountDeletionCommand {
  readonly actorContext: OrganizerActorContext;
  readonly accountId: string;
  readonly confirmation: boolean;
  readonly expectedRevision: bigint;
  readonly reauthenticationEvidence: string;
  readonly idempotencyKey: string;
  readonly now?: Date;
}

export interface RequestManualAccountDeletionResult {
  readonly outcome: 'REQUESTED' | 'IDEMPOTENT_REPLAY' | 'OUTCOME_UNKNOWN';
  readonly request: DeletionRequestRecord;
  readonly accountStatus: 'PENDING_DELETION';
  readonly restrictedSessionContext: 'DELETION_MANAGEMENT_ONLY';
  readonly cancelUntil: Date;
  readonly purgeStartedAt: Date;
  readonly affectedEventIds: readonly string[];
  readonly notificationWarning?: string;
}

export interface RecalculatedChildEventSummary {
  readonly eventId: string;
  readonly statusAfterCancellation: EventStatus;
  readonly hasIndependentBarrier: boolean;
}

export interface CancelManualAccountDeletionCommand {
  readonly actorContext: OrganizerActorContext | AdminActorContext;
  readonly accountId: string;
  readonly requestId: string;
  readonly confirmation: boolean;
  readonly expectedRevision: bigint;
  /** Obligatorio para ORGANIZER_HUMAN; prohibido como sustituto para ADMIN_HUMAN */
  readonly reauthenticationEvidence?: string;
  /** Obligatorio para ADMIN_HUMAN (EL-TK-192 Escenario 4) */
  readonly reason?: string;
  readonly idempotencyKey: string;
  readonly now?: Date;
}

export interface CancelManualAccountDeletionResult {
  readonly outcome: 'CANCELLED' | 'IDEMPOTENT_REPLAY' | 'OUTCOME_UNKNOWN';
  readonly request: DeletionRequestRecord;
  readonly accountStatus: 'ACTIVE' | 'PENDING_DELETION';
  readonly recalculatedEvents: readonly RecalculatedChildEventSummary[];
}

export interface EvaluateDeletionBarrierAccessCommand {
  readonly eventId?: string;
  readonly accountId?: string;
  readonly mediaRef?: string;
  readonly scopeType?: 'EVENT' | 'ACCOUNT' | 'MEDIA';
  readonly scopeRef?: string;
  readonly capability?: string;
  readonly action?:
    | 'GUEST_VIEW_LANDING'
    | 'GUEST_VIEW_GALLERY'
    | 'GUEST_UPLOAD'
    | 'ISSUE_UPLOAD_GRANT'
    | 'RENEW_UPLOAD_GRANT'
    | 'ISSUE_MEDIA_DOWNLOAD_GRANT'
    | 'ISSUE_EXPORT_GRANT'
    | 'ORGANIZER_CREATE_EVENT'
    | 'ORGANIZER_MUTATE_EVENT'
    | 'ORGANIZER_VIEW_DELETION_STATUS'
    | 'ORGANIZER_CANCEL_DELETION';
  readonly actorContext?: OrganizerActorContext | AdminActorContext | GuestActorContext | null;
}

export interface DeletionBarrierAccessDecision {
  readonly allowed: boolean;
  readonly code:
    | 'ALLOWED'
    | 'BLOCKED_BY_EVENT_DELETION_BARRIER'
    | 'BLOCKED_BY_ACCOUNT_DELETION_BARRIER'
    | 'BLOCKED_BY_MEDIA_DELETION_BARRIER'
    | 'BLOCKED_BY_UNCERTAIN_BARRIER';
  readonly blockingRequestIds: readonly string[];
  readonly reason: string;
}

// ============================================================================
// 3. Helpers Canónicos de Intención y Recálculo
// ============================================================================

export function computeCanonicalAccountDeletionIntentionHash(params: {
  readonly operation: 'REQUEST_ACCOUNT_DELETION' | 'CANCEL_ACCOUNT_DELETION';
  readonly accountId: string;
  readonly expectedRevision: bigint;
  readonly confirmation: boolean;
  readonly requestId?: string;
}): string {
  const canonical = {
    operation: params.operation,
    resourceType: 'ACCOUNT',
    resourceId: params.accountId,
    expectedRevision: params.expectedRevision.toString(),
    confirmation: Boolean(params.confirmation),
    requestId: params.operation === 'CANCEL_ACCOUNT_DELETION' ? (params.requestId ?? null) : null,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

interface EventBarrierTargetRow {
  id: string;
  organizer_id: string;
  status: string;
  previous_status: string | null;
  scheduled_at: Date | string | null;
  activated_at: Date | string | null;
  closed_at: Date | string | null;
  expires_at: Date | string | null;
  grace_ends_at: Date | string | null;
  purge_started_at: Date | string | null;
  suspended_at: Date | string | null;
  suspension_reason: string | null;
}

interface BarrierRow {
  id: string;
  request_id: string;
  cause: string;
  scope_type: string;
  scope_ref: string;
  target_scope_type: string;
  target_scope_ref: string;
  barrier_state: string;
  event_snapshot_status: string | null;
  event_snapshot_previous_status: string | null;
  in_flight_writers_count: number;
  revoked_grants_count: number;
  invalidated_exports_count: number;
  denied_access_count: number;
  export_parts_inventory_json: string;
  prepared_at: Date | string;
  confirmed_at: Date | string | null;
  released_at: Date | string | null;
  released_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapBarrierRow(row: BarrierRow): DeletionAccessBarrierRecord {
  let parsedInventory: ExportPartInventoryItem[] = [];
  try {
    parsedInventory = JSON.parse(row.export_parts_inventory_json || '[]');
  } catch {
    parsedInventory = [];
  }
  return {
    id: row.id,
    requestId: row.request_id,
    cause: row.cause,
    scopeType: row.scope_type,
    scopeRef: row.scope_ref,
    targetScopeType: row.target_scope_type as DeletionBarrierTargetScopeType,
    targetScopeRef: row.target_scope_ref,
    barrierState: row.barrier_state as DeletionBarrierState,
    eventSnapshotStatus: (row.event_snapshot_status as EventStatus) ?? null,
    eventSnapshotPreviousStatus: (row.event_snapshot_previous_status as EventStatus) ?? null,
    inFlightWritersCount: Number(row.in_flight_writers_count),
    revokedGrantsCount: Number(row.revoked_grants_count),
    invalidatedExportsCount: Number(row.invalidated_exports_count),
    deniedAccessCount: Number(row.denied_access_count),
    exportPartsInventory: parsedInventory,
    preparedAt: new Date(row.prepared_at),
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at) : null,
    releasedAt: row.released_at ? new Date(row.released_at) : null,
    releasedBy: row.released_by ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Recalcula fielmente el estado de un evento cuando se levanta una barrera de eliminación,
 * respetando cierres voluntarios, suspensiones administrativas y vencimientos de vigencia/gracia
 * (DEC-043, DEC-044, DEC-078, DEC-081, EL-TK-190, EL-TK-192).
 * Nunca restaura DELETED/ARCHIVED ni impone ACTIVE ciego.
 */
export function calculateFaithfulEventStatusAfterBarrierRelease(params: {
  readonly event: EventBarrierTargetRow;
  readonly snapshotStatus: EventStatus | null;
  readonly snapshotPreviousStatus: EventStatus | null;
  readonly remainingActiveBarriersCount: number;
  readonly now: Date;
}): {
  readonly targetStatus: EventStatus;
  readonly previousStatusToPersist: EventStatus | null;
  readonly purgeStartedAtToPersist: Date | null;
  readonly graceExpiredDuringWindow: boolean;
} {
  const { event, snapshotStatus, snapshotPreviousStatus, remainingActiveBarriersCount, now } = params;
  const currentStatus = event.status as EventStatus;

  // 1. Estados terminales definitivos nunca se restauran
  if ((currentStatus as string) === 'DELETED' || currentStatus === 'ARCHIVED') {
    return {
      targetStatus: currentStatus,
      previousStatusToPersist: (event.previous_status as EventStatus) ?? null,
      purgeStartedAtToPersist: event.purge_started_at ? new Date(event.purge_started_at) : null,
      graceExpiredDuringWindow: false,
    };
  }

  // 2. Si persisten otras barreras de eliminación activas sobre este evento, sigue en PENDING_DELETION
  if (remainingActiveBarriersCount > 0) {
    return {
      targetStatus: 'PENDING_DELETION',
      previousStatusToPersist: snapshotStatus ?? (event.previous_status as EventStatus) ?? null,
      purgeStartedAtToPersist: event.purge_started_at ? new Date(event.purge_started_at) : null,
      graceExpiredDuringWindow: false,
    };
  }

  // 3. Si el plazo de gracia ya venció por reloj servidor, pasa a PENDING_DELETION por GRACE_PERIOD_EXPIRED
  //    con ancla fija en graceEndsAt (sin nueva ventana de 72h)
  const graceEndsAt = event.grace_ends_at ? new Date(event.grace_ends_at) : null;
  if (graceEndsAt && now.getTime() >= graceEndsAt.getTime()) {
    return {
      targetStatus: 'PENDING_DELETION',
      previousStatusToPersist: null,
      purgeStartedAtToPersist: graceEndsAt,
      graceExpiredDuringWindow: true,
    };
  }

  // 4. Si tenía suspensión administrativa vigente (suspended_at / suspension_reason), preserva SUSPENDED
  if (event.suspended_at !== null || snapshotStatus === 'SUSPENDED') {
    const preSuspension =
      snapshotStatus === 'SUSPENDED'
        ? snapshotPreviousStatus
        : snapshotStatus ?? (event.previous_status as EventStatus) ?? 'ACTIVE';
    return {
      targetStatus: 'SUSPENDED',
      previousStatusToPersist: preSuspension,
      purgeStartedAtToPersist: null,
      graceExpiredDuringWindow: false,
    };
  }

  // 5. Si la vigencia ordinaria ya venció pero aún está dentro de gracia -> GRACE_PERIOD
  const expiresAt = event.expires_at ? new Date(event.expires_at) : null;
  if (expiresAt && now.getTime() >= expiresAt.getTime()) {
    return {
      targetStatus: 'GRACE_PERIOD',
      previousStatusToPersist: null,
      purgeStartedAtToPersist: null,
      graceExpiredDuringWindow: false,
    };
  }

  // 6. Si tenía cierre voluntario registrado o su snapshot era CLOSED -> CLOSED (nunca ACTIVE ciego)
  const baseStatus = snapshotStatus ?? (event.previous_status as EventStatus) ?? 'ACTIVE';
  if (event.closed_at !== null || baseStatus === 'CLOSED') {
    return {
      targetStatus: 'CLOSED',
      previousStatusToPersist: null,
      purgeStartedAtToPersist: null,
      graceExpiredDuringWindow: false,
    };
  }

  // 7. Si era DRAFT -> DRAFT
  if (baseStatus === 'DRAFT') {
    return {
      targetStatus: 'DRAFT',
      previousStatusToPersist: null,
      purgeStartedAtToPersist: null,
      graceExpiredDuringWindow: false,
    };
  }

  // 8. Si era SCHEDULED -> ACTIVE si scheduledAt <= now, de lo contrario SCHEDULED
  if (baseStatus === 'SCHEDULED') {
    const scheduledAt = event.scheduled_at ? new Date(event.scheduled_at) : null;
    if (scheduledAt && now.getTime() >= scheduledAt.getTime()) {
      return {
        targetStatus: 'ACTIVE',
        previousStatusToPersist: null,
        purgeStartedAtToPersist: null,
        graceExpiredDuringWindow: false,
      };
    }
    return {
      targetStatus: 'SCHEDULED',
      previousStatusToPersist: null,
      purgeStartedAtToPersist: null,
      graceExpiredDuringWindow: false,
    };
  }

  return {
    targetStatus: 'ACTIVE',
    previousStatusToPersist: null,
    purgeStartedAtToPersist: null,
    graceExpiredDuringWindow: false,
  };
}

// ============================================================================
// 4. Servicio Coordinador de Solicitudes Manuales, Cancelaciones y Barreras
//    (EL-TK-189, EL-TK-190, EL-TK-191, EL-TK-192, EL-TK-193)
// ============================================================================

export interface ManualDeletionWorkflowOptions {
  readonly repository?: DeletionCoordinationRepository;
  readonly recoveryBarrierPort: DeletionRecoveryBarrierPort;
  readonly reauthenticationPort?: AccountReauthenticationPort;
  readonly adminGrantPort?: AdminCancellationGrantPort;
  readonly exportBarrierPort?: ExportDeletionBarrierPort;
  readonly notificationPort?: DeletionNotificationPort;
  readonly auditSink?: EventAuditSink;
  readonly observabilitySink?: BarrierObservabilitySink;
  /** Máxima antigüedad permitida de autenticación para ADMIN_HUMAN (default 15 min) */
  readonly maxAdminFreshnessMs?: number;
}

export class ManualDeletionWorkflowService {
  private readonly repository: DeletionCoordinationRepository;
  private readonly recoveryBarrierPort: DeletionRecoveryBarrierPort;
  private readonly reauthenticationPort?: AccountReauthenticationPort;
  private readonly adminGrantPort?: AdminCancellationGrantPort;
  private readonly exportBarrierPort?: ExportDeletionBarrierPort;
  private readonly notificationPort?: DeletionNotificationPort;
  private readonly auditSink?: EventAuditSink;
  private readonly observabilitySink?: BarrierObservabilitySink;
  private readonly maxAdminFreshnessMs: number;

  constructor(
    private readonly runner: TransactionRunner,
    options: ManualDeletionWorkflowOptions
  ) {
    this.repository = options.repository ?? new PostgresDeletionCoordinationRepository();
    this.recoveryBarrierPort = options.recoveryBarrierPort;
    this.reauthenticationPort = options.reauthenticationPort;
    this.adminGrantPort = options.adminGrantPort;
    this.exportBarrierPort = options.exportBarrierPort;
    this.notificationPort = options.notificationPort;
    this.auditSink = options.auditSink;
    this.observabilitySink = options.observabilitySink;
    this.maxAdminFreshnessMs = options.maxAdminFreshnessMs ?? 15 * 60 * 1000;
  }

  private emitMetric(metric: BarrierObservabilityMetric): void {
    this.observabilitySink?.recordBarrierMetric(metric);
  }

  // --------------------------------------------------------------------------
  // EL-TK-189: Solicitar eliminación manual de evento con bloqueo inmediato (72h)
  // --------------------------------------------------------------------------
  async requestManualEventDeletion(
    command: RequestManualEventDeletionCommand
  ): Promise<RequestManualEventDeletionResult> {
    const { actorContext, eventId, confirmation, expectedRevision, idempotencyKey } = command;
    const now = command.now ?? new Date();

    if (!actorContext || actorContext.actorType !== 'ORGANIZER_HUMAN' || !actorContext.accountId) {
      throw new DeletionCoordinationError('UNAUTHORIZED_ACTOR', 'Authenticated organizer context is required');
    }

    if (actorContext.restrictedContext === 'DELETION_MANAGEMENT_ONLY') {
      throw new DeletionCoordinationError(
        'UNAUTHORIZED_ACTOR',
        'Account is pending deletion and restricted to account deletion management only'
      );
    }

    if (!eventId || typeof eventId !== 'string') {
      throw new DeletionCoordinationError('INVALID_DELETION_INTENT', 'Event ID is required');
    }

    if (confirmation !== true) {
      throw new DeletionCoordinationError(
        'INVALID_DELETION_INTENT',
        'Explicit confirmation is required to request event deletion'
      );
    }

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      throw new DeletionCoordinationError('INVALID_DELETION_INTENT', 'Idempotency key is required');
    }

    let currentEpoch: bigint;
    try {
      currentEpoch = await this.recoveryBarrierPort.getRecoveryEpoch();
    } catch {
      throw new DeletionCoordinationError(
        'INVALID_STATUS_TRANSITION',
        'Recovery authority unavailable; failing closed'
      );
    }

    if (BigInt(actorContext.recoveryEpoch) !== currentEpoch) {
      throw new DeletionCoordinationError(
        'UNAUTHORIZED_EPOCH',
        `Actor recovery epoch ${actorContext.recoveryEpoch} does not match authority epoch ${currentEpoch}`
      );
    }

    // Paso 1: PREPARE externo antes de mutar SQL (AQR-001, EL-TK-189, EL-TK-193)
    let preparedReceipt: { readonly preparedReceipt: string; readonly sequence: bigint };
    try {
      preparedReceipt = await this.recoveryBarrierPort.prepareDeletionBarrier({
        operationId: idempotencyKey,
        scopeType: 'EVENT',
        scopeRef: eventId,
        cause: 'MANUAL_EVENT_DELETION',
        expectedRevision,
        recoveryEpoch: currentEpoch,
      });
    } catch (err) {
      throw new DeletionCoordinationError(
        'INVALID_STATUS_TRANSITION',
        `RecoveryAuthority PREPARE failed before SQL: ${(err as Error).message}`
      );
    }

    // Paso 2: Transacción SQL corta con FOR UPDATE, creación de request PREPARED, barrera y revocación inmediata
    const sqlPhaseResult = await this.runner.run(async (tx: SqlTransaction) => {
      const eventRows = await tx.query<EventBarrierTargetRow>(
        `SELECT id, organizer_id, status, previous_status, scheduled_at, activated_at,
                closed_at, expires_at, grace_ends_at, purge_started_at,
                suspended_at, suspension_reason
         FROM event
         WHERE id = $1
         FOR UPDATE`,
        eventId
      );

      if (eventRows.length === 0) {
        throw new DeletionCoordinationError('REQUEST_NOT_FOUND', `Event '${eventId}' not found`);
      }

      const event = eventRows[0];

      // Aislamiento de propietario sin enumeración (Escenario 3: evento ajeno)
      if (event.organizer_id !== actorContext.accountId) {
        throw new DeletionCoordinationError('REQUEST_NOT_FOUND', `Event '${eventId}' not found`);
      }

      // Verificar replay idempotente antes de rechazar por estado PENDING_DELETION
      const existingRequests = await this.repository.findActiveByScopeForUpdate(tx, 'EVENT', eventId);
      const activeManualReq = existingRequests.find((r) => r.cause === 'MANUAL_EVENT_DELETION');

      if (activeManualReq) {
        if (activeManualReq.sourceOperationId === idempotencyKey) {
          if (activeManualReq.expectedRevision !== BigInt(expectedRevision)) {
            throw new DeletionCoordinationError(
              'DELETION_INTENT_PAYLOAD_CONFLICT',
              'Idempotency key reused with different expectedRevision'
            );
          }
          const barrierRows = await tx.query<BarrierRow>(
            `SELECT * FROM deletion_access_barrier
             WHERE request_id = $1::uuid AND target_scope_type = 'EVENT' AND target_scope_ref = $2`,
            activeManualReq.id,
            eventId
          );
          return {
            isReplay: true as const,
            request: activeManualReq,
            barrier: mapBarrierRow(barrierRows[0]),
          };
        }

        throw new DeletionCoordinationError(
          'REVISION_CONFLICT',
          `Event '${eventId}' already has an active manual deletion request`
        );
      }

      // Escenario 3: Eventos DELETED, ARCHIVED o con otra eliminación irreversible activa no admiten ventana de 72h
      if (
        (event.status as string) === 'DELETED' ||
        event.status === 'ARCHIVED' ||
        event.status === 'PENDING_DELETION'
      ) {
        throw new DeletionCoordinationError(
          'INVALID_STATUS_TRANSITION',
          `Event '${eventId}' in status '${event.status}' is not eligible for manual deletion`
        );
      }

      // Regla de negocio: No dar ventana nueva después de vencida la gracia
      if (event.grace_ends_at && now.getTime() >= new Date(event.grace_ends_at).getTime()) {
        throw new DeletionCoordinationError(
          'OBLIGATION_EXTENSION_FORBIDDEN',
          `Event '${eventId}' grace period has already expired; cannot open a new 72h window`
        );
      }

      // Calcular revisión esperada en función del historial de solicitudes sobre este evento
      const latestAny = await this.repository.findLatestByScope(tx, 'EVENT', eventId);
      const currentScopeRevision = latestAny ? latestAny.currentRevision : 1n;
      if (BigInt(expectedRevision) !== currentScopeRevision) {
        throw new DeletionCoordinationError(
          'REVISION_CONFLICT',
          `Expected revision ${expectedRevision} does not match current scope revision ${currentScopeRevision}`
        );
      }

      const deadlines = computeDeletionDeadlines({
        cause: 'MANUAL_EVENT_DELETION',
        anchorTimestamp: now,
      });

      const payloadHash = createHash('sha256')
        .update(
          JSON.stringify({
            sourceOperationId: idempotencyKey,
            cause: 'MANUAL_EVENT_DELETION',
            scopeType: 'EVENT',
            scopeRef: eventId,
            expectedRevision: expectedRevision.toString(),
          })
        )
        .digest('hex');

      const requestId = randomUUID();
      const dedupKey = `${idempotencyKey}:EVENT:${eventId}:MANUAL_EVENT_DELETION`;

      const createdRequest: DeletionRequestRecord = {
        id: requestId,
        sourceOperationId: idempotencyKey,
        cause: 'MANUAL_EVENT_DELETION',
        scopeType: 'EVENT',
        scopeRef: eventId,
        parentRequestId: null,
        ownerModule: 'MOD-002',
        expectedGeneration: 1n,
        expectedRevision: BigInt(expectedRevision),
        currentRevision: BigInt(expectedRevision),
        policyRef: 'MOD-008-MANUAL-EVENT-72H-V1',
        policyVersion: '1.0',
        anchorTimestamp: deadlines.anchorTimestamp,
        cancelUntil: deadlines.cancelUntil,
        purgeStartedAt: deadlines.purgeStartedAt,
        mainPurgeDeadline: deadlines.mainPurgeDeadline,
        residualPurgeDeadline: deadlines.residualPurgeDeadline,
        status: 'PREPARED',
        recoveryEpoch: currentEpoch,
        dedupKey,
        payloadHash,
        relatedResources: [{ resourceType: 'EVENT', resourceRef: eventId }],
        cancelledAt: null,
        cancelledBy: null,
        cancelReason: null,
        claimedAt: null,
        claimedByWorker: null,
        mainPurgedAt: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await this.repository.insertRequest(tx, createdRequest);

      await this.repository.insertReceipt(tx, {
        id: randomUUID(),
        requestId,
        operationType: 'PREPARE',
        sourceOperationId: idempotencyKey,
        cause: 'MANUAL_EVENT_DELETION',
        scopeType: 'EVENT',
        scopeRef: eventId,
        actorId: actorContext.accountId,
        previousStatus: null,
        newStatus: 'PREPARED',
        revision: BigInt(expectedRevision),
        recoveryEpoch: currentEpoch,
        anchorTimestamp: deadlines.anchorTimestamp,
        purgeStartedAt: deadlines.purgeStartedAt,
        mainPurgeDeadline: deadlines.mainPurgeDeadline,
        residualPurgeDeadline: deadlines.residualPurgeDeadline,
        details: { preparedReceipt: preparedReceipt.preparedReceipt },
        createdAt: now,
      });

      // EL-TK-193: Revocar sesiones guest activas y credenciales públicas, y contar writers en vuelo
      const revokedGuestSessions = await tx.execute(
        `UPDATE guest_session
         SET revoked_at = $1
         WHERE event_id = $2 AND revoked_at IS NULL`,
        now,
        eventId
      );

      const revokedPublicCredentials = await tx.execute(
        `UPDATE public_access_credential
         SET revoked_at = $1
         WHERE event_id = $2 AND revoked_at IS NULL`,
        now,
        eventId
      );

      const inFlightUploads = await tx.query<{ cnt: number | string | bigint }>(
        `SELECT COUNT(*)::int AS cnt
         FROM upload_attempt
         WHERE event_id = $1 AND status = 'AUTHORIZED'`,
        eventId
      );
      const inFlightWritersCount = Number(inFlightUploads[0]?.cnt ?? 0);
      const revokedGrantsCount = revokedGuestSessions + revokedPublicCredentials;

      // Crear barrera de acceso desde PREPARED (EL-TK-193)
      const barrierId = randomUUID();
      await tx.execute(
        `INSERT INTO deletion_access_barrier (
           id, request_id, cause, scope_type, scope_ref,
           target_scope_type, target_scope_ref, barrier_state,
           event_snapshot_status, event_snapshot_previous_status,
           in_flight_writers_count, revoked_grants_count,
           invalidated_exports_count, denied_access_count,
           export_parts_inventory_json, prepared_at, created_at, updated_at
         ) VALUES (
           $1::uuid, $2::uuid, $3, $4, $5,
           $6, $7, 'PREPARED',
           $8, $9,
           $10, $11,
           0, 0,
           '[]', $12, $12, $12
         )`,
        barrierId,
        requestId,
        'MANUAL_EVENT_DELETION',
        'EVENT',
        eventId,
        'EVENT',
        eventId,
        event.status,
        event.previous_status,
        inFlightWritersCount,
        revokedGrantsCount,
        now
      );

      // Mutar evento a PENDING_DELETION con cancelUntil/purgeStartedAt = +72h
      await tx.execute(
        `UPDATE event
         SET status = 'PENDING_DELETION',
             previous_status = $1,
             purge_started_at = $2,
             updated_at = $3
         WHERE id = $4`,
        event.status,
        deadlines.purgeStartedAt,
        now,
        eventId
      );

      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_MANUAL_DELETION_REQUESTED',
        actorId: actorContext.accountId,
        targetIdentifier: eventId,
        result: 'SUCCESS',
        details: `Manual event deletion requested (requestId=${requestId}, cancelUntil=${deadlines.cancelUntil!.toISOString()})`,
        timestamp: now,
      });

      const barrierRows = await tx.query<BarrierRow>(
        `SELECT * FROM deletion_access_barrier WHERE id = $1::uuid`,
        barrierId
      );

      return {
        isReplay: false as const,
        request: createdRequest,
        barrier: mapBarrierRow(barrierRows[0]),
        revokedGrantsCount,
      };
    });

    if (!sqlPhaseResult.isReplay) {
      this.emitMetric({
        metric: 'BARRIER_PREPARED',
        scopeType: 'EVENT',
        cause: 'MANUAL_EVENT_DELETION',
        count: 1,
        timestamp: now,
      });
      if (sqlPhaseResult.revokedGrantsCount > 0) {
        this.emitMetric({
          metric: 'GRANTS_REVOKED',
          scopeType: 'EVENT',
          cause: 'MANUAL_EVENT_DELETION',
          count: sqlPhaseResult.revokedGrantsCount,
          timestamp: now,
        });
      }
    }

    // Paso 3: Invalidación de exportaciones afectadas (EL-TK-193 / MOD-005)
    let exportInv: ExportInvalidationResult = { invalidatedExportsCount: 0, partsInventory: [] };
    if (this.exportBarrierPort && !sqlPhaseResult.isReplay) {
      exportInv = await this.exportBarrierPort.invalidateExportsForScope({
        scopeType: 'EVENT',
        scopeRef: eventId,
        targetEventIds: [eventId],
        requestId: sqlPhaseResult.request.id,
        reason: 'MANUAL_EVENT_DELETION',
      });
      if (exportInv.invalidatedExportsCount > 0) {
        this.emitMetric({
          metric: 'EXPORTS_INVALIDATED',
          scopeType: 'EVENT',
          cause: 'MANUAL_EVENT_DELETION',
          count: exportInv.invalidatedExportsCount,
          timestamp: now,
        });
      }
    }

    // Paso 4: ACK en RecoveryAuthority (o reconciliación si era replay en estado PREPARED/UNKNOWN)
    try {
      await this.recoveryBarrierPort.ackDeletionBarrier({
        preparedReceipt: preparedReceipt.preparedReceipt,
        requestId: sqlPhaseResult.request.id,
        revision: sqlPhaseResult.request.currentRevision,
        recoveryEpoch: currentEpoch,
      });

      const confirmed = await this.runner.run(async (tx: SqlTransaction) => {
        const nextRev =
          sqlPhaseResult.request.status === 'CONFIRMED'
            ? sqlPhaseResult.request.currentRevision
            : sqlPhaseResult.request.currentRevision + 1n;

        let updatedReq = sqlPhaseResult.request;
        if (sqlPhaseResult.request.status !== 'CONFIRMED') {
          await this.repository.updateRequestStatus(tx, {
            requestId: sqlPhaseResult.request.id,
            expectedRevision: sqlPhaseResult.request.currentRevision,
            newRevision: nextRev,
            newStatus: 'CONFIRMED',
            updatedAt: now,
          });
          updatedReq = (await this.repository.findById(tx, sqlPhaseResult.request.id))!;

          await this.repository.insertReceipt(tx, {
            id: randomUUID(),
            requestId: updatedReq.id,
            operationType: 'CONFIRM',
            sourceOperationId: idempotencyKey,
            cause: 'MANUAL_EVENT_DELETION',
            scopeType: 'EVENT',
            scopeRef: eventId,
            actorId: actorContext.accountId,
            previousStatus: sqlPhaseResult.request.status,
            newStatus: 'CONFIRMED',
            revision: nextRev,
            recoveryEpoch: currentEpoch,
            anchorTimestamp: updatedReq.anchorTimestamp,
            purgeStartedAt: updatedReq.purgeStartedAt,
            mainPurgeDeadline: updatedReq.mainPurgeDeadline,
            residualPurgeDeadline: updatedReq.residualPurgeDeadline,
            details: { ackConfirmed: true },
            createdAt: now,
          });
        }

        await tx.execute(
          `UPDATE deletion_access_barrier
           SET barrier_state = 'ACTIVE',
               confirmed_at = COALESCE(confirmed_at, $1),
               invalidated_exports_count = CASE WHEN $2 > 0 THEN $2 ELSE invalidated_exports_count END,
               export_parts_inventory_json = CASE WHEN $3 <> '[]' THEN $3 ELSE export_parts_inventory_json END,
               updated_at = $1
           WHERE request_id = $4::uuid`,
          now,
          exportInv.invalidatedExportsCount,
          JSON.stringify(exportInv.partsInventory),
          updatedReq.id
        );

        const barrierRows = await tx.query<BarrierRow>(
          `SELECT * FROM deletion_access_barrier
           WHERE request_id = $1::uuid AND target_scope_type = 'EVENT' AND target_scope_ref = $2`,
          updatedReq.id,
          eventId
        );

        return {
          request: updatedReq,
          barrier: mapBarrierRow(barrierRows[0]),
        };
      });

      this.emitMetric({
        metric: 'BARRIER_CONFIRMED',
        scopeType: 'EVENT',
        cause: 'MANUAL_EVENT_DELETION',
        count: 1,
        timestamp: now,
      });

      return {
        outcome: sqlPhaseResult.isReplay ? 'IDEMPOTENT_REPLAY' : 'REQUESTED',
        request: confirmed.request,
        barrier: confirmed.barrier,
        eventStatus: 'PENDING_DELETION',
        cancelUntil: confirmed.request.cancelUntil!,
        purgeStartedAt: confirmed.request.purgeStartedAt,
      };
    } catch {
      // Escenario 2: Si el ACK falla o da timeout, se marca UNKNOWN conservando barrera activa y mismo ancla
      const unknownResult = await this.runner.run(async (tx: SqlTransaction) => {
        let updatedReq = sqlPhaseResult.request;
        if (sqlPhaseResult.request.status !== 'UNKNOWN') {
          const nextRev = sqlPhaseResult.request.currentRevision + 1n;
          await this.repository.updateRequestStatus(tx, {
            requestId: sqlPhaseResult.request.id,
            expectedRevision: sqlPhaseResult.request.currentRevision,
            newRevision: nextRev,
            newStatus: 'UNKNOWN',
            updatedAt: now,
          });
          updatedReq = (await this.repository.findById(tx, sqlPhaseResult.request.id))!;
          await this.repository.insertReceipt(tx, {
            id: randomUUID(),
            requestId: updatedReq.id,
            operationType: 'MARK_UNKNOWN',
            sourceOperationId: idempotencyKey,
            cause: 'MANUAL_EVENT_DELETION',
            scopeType: 'EVENT',
            scopeRef: eventId,
            actorId: actorContext.accountId,
            previousStatus: sqlPhaseResult.request.status,
            newStatus: 'UNKNOWN',
            revision: nextRev,
            recoveryEpoch: currentEpoch,
            anchorTimestamp: updatedReq.anchorTimestamp,
            purgeStartedAt: updatedReq.purgeStartedAt,
            mainPurgeDeadline: updatedReq.mainPurgeDeadline,
            residualPurgeDeadline: updatedReq.residualPurgeDeadline,
            details: { reason: 'ACK uncertain; barrier remains fail-closed' },
            createdAt: now,
          });
        }

        await tx.execute(
          `UPDATE deletion_access_barrier
           SET barrier_state = 'UNKNOWN',
               updated_at = $1
           WHERE request_id = $2::uuid`,
          now,
          updatedReq.id
        );

        const barrierRows = await tx.query<BarrierRow>(
          `SELECT * FROM deletion_access_barrier
           WHERE request_id = $1::uuid AND target_scope_type = 'EVENT' AND target_scope_ref = $2`,
          updatedReq.id,
          eventId
        );

        return {
          request: updatedReq,
          barrier: mapBarrierRow(barrierRows[0]),
        };
      });

      this.emitMetric({
        metric: 'BARRIER_UNKNOWN',
        scopeType: 'EVENT',
        cause: 'MANUAL_EVENT_DELETION',
        count: 1,
        timestamp: now,
      });

      return {
        outcome: 'OUTCOME_UNKNOWN',
        request: unknownResult.request,
        barrier: unknownResult.barrier,
        eventStatus: 'PENDING_DELETION',
        cancelUntil: unknownResult.request.cancelUntil!,
        purgeStartedAt: unknownResult.request.purgeStartedAt,
      };
    }
  }

  // --------------------------------------------------------------------------
  // EL-TK-190: Cancelar eliminación manual de evento antes del claim irreversible
  // --------------------------------------------------------------------------
  async cancelManualEventDeletion(
    command: CancelManualEventDeletionCommand
  ): Promise<CancelManualEventDeletionResult> {
    const {
      actorContext,
      eventId,
      requestId,
      confirmation,
      expectedRevision,
      idempotencyKey,
      reason,
      organizerProofAttempt,
    } = command;
    const now = command.now ?? new Date();

    if (!actorContext) {
      throw new DeletionCoordinationError('UNAUTHORIZED_ACTOR', 'Actor context is required');
    }

    if (confirmation !== true) {
      throw new DeletionCoordinationError(
        'INVALID_DELETION_INTENT',
        'Explicit confirmation is required to cancel event deletion'
      );
    }

    if (!eventId || !requestId || !idempotencyKey) {
      throw new DeletionCoordinationError(
        'INVALID_DELETION_INTENT',
        'eventId, requestId, and idempotencyKey are required'
      );
    }

    let currentEpoch: bigint;
    try {
      currentEpoch = await this.recoveryBarrierPort.getRecoveryEpoch();
    } catch {
      throw new DeletionCoordinationError(
        'INVALID_STATUS_TRANSITION',
        'Recovery authority unavailable; failing closed'
      );
    }

    if (BigInt(actorContext.recoveryEpoch) !== currentEpoch) {
      throw new DeletionCoordinationError(
        'UNAUTHORIZED_EPOCH',
        `Actor recovery epoch ${actorContext.recoveryEpoch} does not match authority epoch ${currentEpoch}`
      );
    }

    const isAdmin = actorContext.actorType === 'ADMIN_HUMAN';
    const isOrganizer = actorContext.actorType === 'ORGANIZER_HUMAN';

    if (!isAdmin && !isOrganizer) {
      throw new DeletionCoordinationError('UNAUTHORIZED_ACTOR', 'Unsupported actor type');
    }

    // Validaciones específicas de ADMIN_HUMAN (EL-TK-190 Escenario 4)
    let trimmedAdminReason: string | null = null;
    if (isAdmin) {
      if (organizerProofAttempt !== undefined) {
        throw new DeletionCoordinationError(
          'UNAUTHORIZED_ACTOR',
          'Organizer password/proof cannot be used as a substitute for administrative identity'
        );
      }

      const authAgeMs = now.getTime() - new Date(actorContext.authTime).getTime();
      if (authAgeMs < 0 || authAgeMs > this.maxAdminFreshnessMs) {
        throw new DeletionCoordinationError(
          'UNAUTHORIZED_ACTOR',
          'Administrative session freshness expired for sensitive cancellation'
        );
      }

      trimmedAdminReason = typeof reason === 'string' ? reason.trim() : '';
      if (!trimmedAdminReason) {
        throw new DeletionCoordinationError(
          'INVALID_DELETION_INTENT',
          'Audited administrative reason is mandatory for admin cancellation'
        );
      }

      if (!this.adminGrantPort) {
        throw new DeletionCoordinationError(
          'UNAUTHORIZED_ACTOR',
          'Admin cancellation grant authority is not configured'
        );
      }

      const validGrant = await this.adminGrantPort.verifyActiveGrant({
        principalId: actorContext.principalId,
        operation: 'CANCEL_EVENT_DELETION',
        resourceType: 'EVENT',
        resourceRef: eventId,
        requestId,
        now,
      });

      if (!validGrant || validGrant.status !== 'ACTIVE' || now.getTime() >= validGrant.expiresAt.getTime()) {
        throw new DeletionCoordinationError(
          'UNAUTHORIZED_ACTOR',
          'Missing, mismatched, or revoked MOD-007 grant for event deletion cancellation'
        );
      }
    }

    const actorId = isAdmin ? actorContext.principalId : actorContext.accountId;

    // Paso 1: PREPARE de liberación de barrera en RecoveryAuthority
    let preparedAck: { readonly preparedReceipt: string; readonly sequence: bigint };
    try {
      preparedAck = await this.recoveryBarrierPort.prepareCancellationBarrierRelease({
        operationId: idempotencyKey,
        requestId,
        scopeType: 'EVENT',
        scopeRef: eventId,
        expectedRevision: BigInt(expectedRevision),
        recoveryEpoch: currentEpoch,
      });
    } catch (err) {
      throw new DeletionCoordinationError(
        'INVALID_STATUS_TRANSITION',
        `RecoveryAuthority PREPARE failed for cancellation: ${(err as Error).message}`
      );
    }

    // Paso 2: Validar estado, ownership, ventana estricta now < cancelUntil y ausencia de claim bajo FOR UPDATE
    const preAckCheck = await this.runner.run(async (tx: SqlTransaction) => {
      const eventRows = await tx.query<EventBarrierTargetRow>(
        `SELECT id, organizer_id, status, previous_status, scheduled_at, activated_at,
                closed_at, expires_at, grace_ends_at, purge_started_at,
                suspended_at, suspension_reason
         FROM event
         WHERE id = $1
         FOR UPDATE`,
        eventId
      );

      if (eventRows.length === 0) {
        throw new DeletionCoordinationError('REQUEST_NOT_FOUND', `Event '${eventId}' not found`);
      }

      const event = eventRows[0];

      if (isOrganizer && event.organizer_id !== actorContext.accountId) {
        throw new DeletionCoordinationError('REQUEST_NOT_FOUND', `Event '${eventId}' not found`);
      }

      const req = await this.repository.findByIdForUpdate(tx, requestId);
      if (!req || req.scopeType !== 'EVENT' || req.scopeRef !== eventId) {
        throw new DeletionCoordinationError(
          'REQUEST_NOT_FOUND',
          `Deletion request '${requestId}' not found for event '${eventId}'`
        );
      }

      if (req.cause !== 'MANUAL_EVENT_DELETION') {
        throw new DeletionCoordinationError(
          'IRREVERSIBLE_CAUSE_CANNOT_CANCEL',
          `Deletion cause '${req.cause}' is irreversible and cannot be cancelled`
        );
      }

      // Replay idempotente si ya fue cancelada
      if (req.status === 'CANCELLED') {
        const remainingBarriers = await tx.query<{ cnt: number | string }>(
          `SELECT COUNT(*)::int AS cnt
           FROM deletion_access_barrier
           WHERE target_scope_type = 'EVENT' AND target_scope_ref = $1
             AND barrier_state IN ('PREPARED', 'ACTIVE', 'UNKNOWN')`,
          eventId
        );
        return {
          alreadyCancelled: true as const,
          request: req,
          eventStatus: event.status as EventStatus,
          remainingCount: Number(remainingBarriers[0]?.cnt ?? 0),
        };
      }

      // Escenario 2: Prohibido cancelar si ya hubo claim irreversible o purga
      if (
        req.claimedAt !== null ||
        req.status === 'CLAIMED' ||
        req.status === 'MAIN_PURGED' ||
        req.status === 'COMPLETED'
      ) {
        throw new DeletionCoordinationError(
          'INVALID_STATUS_TRANSITION',
          `Request '${requestId}' has already been claimed for irreversible purge`
        );
      }

      // Escenario 2: Comparación estricta now < cancelUntil
      if (!req.cancelUntil || now.getTime() >= req.cancelUntil.getTime()) {
        throw new DeletionCoordinationError(
          'INVALID_STATUS_TRANSITION',
          `Cancellation window expired at ${req.cancelUntil?.toISOString() ?? 'N/A'} (now=${now.toISOString()})`
        );
      }

      // CAS check
      if (req.currentRevision !== BigInt(expectedRevision)) {
        throw new DeletionCoordinationError(
          'REVISION_CONFLICT',
          `Expected revision ${expectedRevision} does not match request revision ${req.currentRevision}`
        );
      }

      return {
        alreadyCancelled: false as const,
        request: req,
      };
    });

    if (preAckCheck.alreadyCancelled) {
      return {
        outcome: 'IDEMPOTENT_REPLAY',
        request: preAckCheck.request,
        recalculatedEventStatus: preAckCheck.eventStatus,
        remainingActiveBarriersCount: preAckCheck.remainingCount,
      };
    }

    // Paso 3: ACK causal ANTES de levantar la barrera y recalcular el estado del evento (DEC-098, EL-TK-190 Escenario 3)
    try {
      await this.recoveryBarrierPort.ackCancellationBarrierRelease({
        preparedReceipt: preparedAck.preparedReceipt,
        requestId,
        revision: preAckCheck.request.currentRevision + 1n,
        recoveryEpoch: currentEpoch,
      });
    } catch {
      // Si el ACK falla, la solicitud y la barrera pasan a UNKNOWN y NO se levanta la restricción sobre el evento
      const unknownReq = await this.runner.run(async (tx: SqlTransaction) => {
        const current = await this.repository.findByIdForUpdate(tx, requestId);
        if (!current) {
          throw new DeletionCoordinationError('REQUEST_NOT_FOUND', 'Request disappeared');
        }
        const nextRev = current.currentRevision + 1n;
        await this.repository.updateRequestStatus(tx, {
          requestId,
          expectedRevision: current.currentRevision,
          newRevision: nextRev,
          newStatus: 'UNKNOWN',
          updatedAt: now,
        });
        const updated = (await this.repository.findById(tx, requestId))!;

        await this.repository.insertReceipt(tx, {
          id: randomUUID(),
          requestId,
          operationType: 'MARK_UNKNOWN',
          sourceOperationId: idempotencyKey,
          cause: current.cause,
          scopeType: 'EVENT',
          scopeRef: eventId,
          actorId,
          previousStatus: current.status,
          newStatus: 'UNKNOWN',
          revision: nextRev,
          recoveryEpoch: currentEpoch,
          anchorTimestamp: current.anchorTimestamp,
          purgeStartedAt: current.purgeStartedAt,
          mainPurgeDeadline: current.mainPurgeDeadline,
          residualPurgeDeadline: current.residualPurgeDeadline,
          details: { reason: 'Cancellation ACK failed; barrier kept fail-closed' },
          createdAt: now,
        });

        await tx.execute(
          `UPDATE deletion_access_barrier
           SET barrier_state = 'UNKNOWN', updated_at = $1
           WHERE request_id = $2::uuid`,
          now,
          requestId
        );

        return updated;
      });

      this.emitMetric({
        metric: 'BARRIER_UNKNOWN',
        scopeType: 'EVENT',
        cause: 'MANUAL_EVENT_DELETION',
        count: 1,
        timestamp: now,
      });

      return {
        outcome: 'OUTCOME_UNKNOWN',
        request: unknownReq,
        recalculatedEventStatus: 'PENDING_DELETION',
        remainingActiveBarriersCount: 1,
      };
    }

    // Paso 4: Con ACK confirmado, cancelar la solicitud bajo CAS, liberar EXCLUSIVAMENTE esta barrera y recalcular el evento
    const cancelledResult = await this.runner.run(async (tx: SqlTransaction) => {
      const eventRows = await tx.query<EventBarrierTargetRow>(
        `SELECT id, organizer_id, status, previous_status, scheduled_at, activated_at,
                closed_at, expires_at, grace_ends_at, purge_started_at,
                suspended_at, suspension_reason
         FROM event
         WHERE id = $1
         FOR UPDATE`,
        eventId
      );
      const event = eventRows[0];

      const req = await this.repository.findByIdForUpdate(tx, requestId);
      if (!req) {
        throw new DeletionCoordinationError('REQUEST_NOT_FOUND', 'Request not found');
      }

      if (
        req.claimedAt !== null ||
        req.status === 'CLAIMED' ||
        req.status === 'MAIN_PURGED' ||
        req.status === 'COMPLETED'
      ) {
        throw new DeletionCoordinationError(
          'INVALID_STATUS_TRANSITION',
          'Concurrent claim won before cancellation commit'
        );
      }

      if (!req.cancelUntil || now.getTime() >= req.cancelUntil.getTime()) {
        throw new DeletionCoordinationError(
          'INVALID_STATUS_TRANSITION',
          'Cancellation window expired before commit'
        );
      }

      if (req.currentRevision !== BigInt(expectedRevision)) {
        throw new DeletionCoordinationError('REVISION_CONFLICT', 'Concurrent revision conflict');
      }

      const nextRev = req.currentRevision + 1n;
      const effectiveCancelReason = isAdmin
        ? `ADMIN_CANCELLED: ${trimmedAdminReason}`
        : 'ORGANIZER_CANCELLED_WITHIN_72H_WINDOW';

      await this.repository.updateRequestStatus(tx, {
        requestId,
        expectedRevision: req.currentRevision,
        newStatus: 'CANCELLED',
        newRevision: nextRev,
        cancelledAt: now,
        cancelledBy: actorId,
        cancelReason: effectiveCancelReason,
        updatedAt: now,
      });

      const updatedReq = (await this.repository.findById(tx, requestId))!;

      await this.repository.insertReceipt(tx, {
        id: randomUUID(),
        requestId,
        operationType: 'CANCEL',
        sourceOperationId: idempotencyKey,
        cause: req.cause,
        scopeType: 'EVENT',
        scopeRef: eventId,
        actorId,
        previousStatus: req.status,
        newStatus: 'CANCELLED',
        revision: nextRev,
        recoveryEpoch: currentEpoch,
        anchorTimestamp: req.anchorTimestamp,
        purgeStartedAt: req.purgeStartedAt,
        mainPurgeDeadline: req.mainPurgeDeadline,
        residualPurgeDeadline: req.residualPurgeDeadline,
        details: {
          cancelledByRole: actorContext.actorType,
          reason: effectiveCancelReason,
        },
        createdAt: now,
      });

      // Obtener snapshot de la barrera antes de liberarla
      const barrierRows = await tx.query<BarrierRow>(
        `SELECT * FROM deletion_access_barrier
         WHERE request_id = $1::uuid AND target_scope_type = 'EVENT' AND target_scope_ref = $2
         FOR UPDATE`,
        requestId,
        eventId
      );
      const releasedBarrier = barrierRows[0] ? mapBarrierRow(barrierRows[0]) : null;

      // Liberar EXCLUSIVAMENTE la barrera de este requestId
      await tx.execute(
        `UPDATE deletion_access_barrier
         SET barrier_state = 'RELEASED',
             released_at = $1,
             released_by = $2,
             updated_at = $1
         WHERE request_id = $3::uuid`,
        now,
        actorId,
        requestId
      );

      // Consultar si existen otras barreras activas sobre el evento (p.ej. cuenta en PENDING_DELETION)
      const otherBarriers = await tx.query<{ cnt: number | string }>(
        `SELECT COUNT(*)::int AS cnt
         FROM deletion_access_barrier
         WHERE target_scope_type = 'EVENT' AND target_scope_ref = $1
           AND barrier_state IN ('PREPARED', 'ACTIVE', 'UNKNOWN')`,
        eventId
      );
      const remainingActiveBarriersCount = Number(otherBarriers[0]?.cnt ?? 0);

      // Recalcular estado del evento (MOD-002)
      const recalc = calculateFaithfulEventStatusAfterBarrierRelease({
        event,
        snapshotStatus: releasedBarrier?.eventSnapshotStatus ?? null,
        snapshotPreviousStatus: releasedBarrier?.eventSnapshotPreviousStatus ?? null,
        remainingActiveBarriersCount,
        now,
      });

      await tx.execute(
        `UPDATE event
         SET status = $1,
             previous_status = $2,
             purge_started_at = $3,
             updated_at = $4
         WHERE id = $5`,
        recalc.targetStatus,
        recalc.previousStatusToPersist,
        recalc.purgeStartedAtToPersist,
        now,
        eventId
      );

      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_MANUAL_DELETION_CANCELLED',
        actorId,
        targetIdentifier: eventId,
        result: 'SUCCESS',
        details: `Cancelled manual event deletion request '${requestId}'. Recalculated status='${recalc.targetStatus}', remainingBarriers=${remainingActiveBarriersCount}. Reason: ${effectiveCancelReason}`,
        timestamp: now,
      });

      return {
        request: updatedReq,
        recalculatedEventStatus: recalc.targetStatus,
        remainingActiveBarriersCount,
      };
    });

    this.emitMetric({
      metric: 'BARRIER_RELEASED',
      scopeType: 'EVENT',
      cause: 'MANUAL_EVENT_DELETION',
      count: 1,
      timestamp: now,
    });

    return {
      outcome: 'CANCELLED',
      request: cancelledResult.request,
      recalculatedEventStatus: cancelledResult.recalculatedEventStatus,
      remainingActiveBarriersCount: cancelledResult.remainingActiveBarriersCount,
    };
  }

  // --------------------------------------------------------------------------
  // EL-TK-191: Solicitar eliminación de cuenta con reautenticación y suspensión global (7d)
  // --------------------------------------------------------------------------
  async requestManualAccountDeletion(
    command: RequestManualAccountDeletionCommand
  ): Promise<RequestManualAccountDeletionResult> {
    const {
      actorContext,
      accountId,
      confirmation,
      expectedRevision,
      reauthenticationEvidence,
      idempotencyKey,
    } = command;
    const now = command.now ?? new Date();

    if (!actorContext || actorContext.actorType !== 'ORGANIZER_HUMAN' || !actorContext.accountId) {
      throw new DeletionCoordinationError('UNAUTHORIZED_ACTOR', 'Authenticated organizer context is required');
    }

    if (!accountId || accountId !== actorContext.accountId) {
      throw new DeletionCoordinationError('UNAUTHORIZED_ACTOR', 'Account ID must match authenticated organizer');
    }

    if (confirmation !== true) {
      throw new DeletionCoordinationError(
        'INVALID_DELETION_INTENT',
        'Explicit confirmation is required to request account deletion'
      );
    }

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      throw new DeletionCoordinationError('INVALID_DELETION_INTENT', 'Idempotency key is required');
    }

    if (!this.reauthenticationPort) {
      throw new DeletionCoordinationError(
        'INVALID_STATUS_TRANSITION',
        'MOD-001 AccountReauthenticationPort is required for account deletion'
      );
    }

    let currentEpoch: bigint;
    try {
      currentEpoch = await this.recoveryBarrierPort.getRecoveryEpoch();
    } catch {
      throw new DeletionCoordinationError(
        'INVALID_STATUS_TRANSITION',
        'Recovery authority unavailable; failing closed'
      );
    }

    if (BigInt(actorContext.recoveryEpoch) !== currentEpoch) {
      throw new DeletionCoordinationError(
        'UNAUTHORIZED_EPOCH',
        `Actor recovery epoch ${actorContext.recoveryEpoch} does not match authority epoch ${currentEpoch}`
      );
    }

    const intentionHash = computeCanonicalAccountDeletionIntentionHash({
      operation: 'REQUEST_ACCOUNT_DELETION',
      accountId,
      expectedRevision: BigInt(expectedRevision),
      confirmation: true,
    });

    const dedupKey = `${idempotencyKey}:ACCOUNT:${accountId}:MANUAL_ACCOUNT_DELETION`;

    // EL-TK-191 Escenario 2: Para el replay exacto de la misma operación/payload/Idempotency-Key,
    // tras autenticación y ownership actuales se consulta primero el receipt compatible,
    // incluso si la prueba ya fue consumida o venció; no se repite el efecto ni el consumo.
    const existingReplay = await this.runner.run(async (tx: SqlTransaction) => {
      const existing = await this.repository.findByDedupKeyForUpdate(tx, dedupKey);
      if (!existing) {
        return null;
      }

      if (existing.payloadHash !== intentionHash) {
        throw new DeletionCoordinationError(
          'DELETION_INTENT_PAYLOAD_CONFLICT',
          'Idempotency key reused with incompatible account deletion payload'
        );
      }

      const childBarriers = await tx.query<{ target_scope_ref: string }>(
        `SELECT target_scope_ref FROM deletion_access_barrier
         WHERE request_id = $1::uuid AND target_scope_type = 'EVENT'`,
        existing.id
      );

      return {
        request: existing,
        affectedEventIds: childBarriers.map((b) => b.target_scope_ref),
      };
    });

    if (existingReplay) {
      if (existingReplay.request.status === 'UNKNOWN' || existingReplay.request.status === 'PREPARED') {
        return {
          outcome: 'OUTCOME_UNKNOWN',
          request: existingReplay.request,
          accountStatus: 'PENDING_DELETION',
          restrictedSessionContext: 'DELETION_MANAGEMENT_ONLY',
          cancelUntil: existingReplay.request.cancelUntil!,
          purgeStartedAt: existingReplay.request.purgeStartedAt,
          affectedEventIds: existingReplay.affectedEventIds,
        };
      }

      return {
        outcome: 'IDEMPOTENT_REPLAY',
        request: existingReplay.request,
        accountStatus: 'PENDING_DELETION',
        restrictedSessionContext: 'DELETION_MANAGEMENT_ONLY',
        cancelUntil: existingReplay.request.cancelUntil!,
        purgeStartedAt: existingReplay.request.purgeStartedAt,
        affectedEventIds: existingReplay.affectedEventIds,
      };
    }

    // Paso 1: PREPARE externo antes del consumo SQL (account-reauthentication-contract.md: PREPARE precede al consumo SQL)
    let preparedReceipt: { readonly preparedReceipt: string; readonly sequence: bigint };
    try {
      preparedReceipt = await this.recoveryBarrierPort.prepareDeletionBarrier({
        operationId: idempotencyKey,
        scopeType: 'ACCOUNT',
        scopeRef: accountId,
        cause: 'MANUAL_ACCOUNT_DELETION',
        expectedRevision: BigInt(expectedRevision),
        recoveryEpoch: currentEpoch,
      });
    } catch (err) {
      throw new DeletionCoordinationError(
        'INVALID_STATUS_TRANSITION',
        `RecoveryAuthority PREPARE failed before SQL: ${(err as Error).message}`
      );
    }

    // Paso 2: En la misma UnitOfWork SQL, consumir evidencia MOD-001, mutar cuenta a PENDING_DELETION,
    // registrar DeletionRequest (7d) y propagar barreras a todos los eventos hijos sin mover sus plazos previos
    const sqlPhase = await this.runner.run(async (tx: SqlTransaction) => {
      const accountRows = await tx.query<{ id: string; status: string }>(
        `SELECT id, status FROM organizer_account WHERE id = $1 FOR UPDATE`,
        accountId
      );

      if (accountRows.length === 0) {
        throw new DeletionCoordinationError('REQUEST_NOT_FOUND', 'Organizer account not found');
      }

      const account = accountRows[0];
      if (account.status !== 'ACTIVE') {
        throw new DeletionCoordinationError(
          'INVALID_STATUS_TRANSITION',
          `Organizer account in status '${account.status}' cannot initiate a new deletion request`
        );
      }

      // Consumir evidencia de un solo uso mediante el puerto propietario MOD-001
      await this.reauthenticationPort!.assertAndConsumeEvidence(tx, {
        evidence: reauthenticationEvidence,
        accountId,
        sessionId: actorContext.sessionId,
        operation: 'REQUEST_ACCOUNT_DELETION',
        resourceType: 'ACCOUNT',
        resourceId: accountId,
        expectedRevision: BigInt(expectedRevision),
        intentionHash,
        idempotencyKey,
      });

      const deadlines = computeDeletionDeadlines({
        cause: 'MANUAL_ACCOUNT_DELETION',
        anchorTimestamp: now,
      });

      const childEvents = await tx.query<EventBarrierTargetRow>(
        `SELECT id, organizer_id, status, previous_status, scheduled_at, activated_at,
                closed_at, expires_at, grace_ends_at, purge_started_at,
                suspended_at, suspension_reason
         FROM event
         WHERE organizer_id = $1
         ORDER BY created_at ASC
         FOR UPDATE`,
        accountId
      );

      const relatedResources = [
        { resourceType: 'ACCOUNT' as const, resourceRef: accountId },
        ...childEvents.map((ev) => ({ resourceType: 'EVENT' as const, resourceRef: ev.id })),
      ];

      const requestId = randomUUID();
      const createdRequest: DeletionRequestRecord = {
        id: requestId,
        sourceOperationId: idempotencyKey,
        cause: 'MANUAL_ACCOUNT_DELETION',
        scopeType: 'ACCOUNT',
        scopeRef: accountId,
        parentRequestId: null,
        ownerModule: 'MOD-001',
        expectedGeneration: 1n,
        expectedRevision: BigInt(expectedRevision),
        currentRevision: BigInt(expectedRevision),
        policyRef: 'MOD-008-MANUAL-ACCOUNT-7D-V1',
        policyVersion: '1.0',
        anchorTimestamp: deadlines.anchorTimestamp,
        cancelUntil: deadlines.cancelUntil,
        purgeStartedAt: deadlines.purgeStartedAt,
        mainPurgeDeadline: deadlines.mainPurgeDeadline,
        residualPurgeDeadline: deadlines.residualPurgeDeadline,
        status: 'PREPARED',
        recoveryEpoch: currentEpoch,
        dedupKey,
        payloadHash: intentionHash,
        relatedResources,
        cancelledAt: null,
        cancelledBy: null,
        cancelReason: null,
        claimedAt: null,
        claimedByWorker: null,
        mainPurgedAt: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await this.repository.insertRequest(tx, createdRequest);

      await this.repository.insertReceipt(tx, {
        id: randomUUID(),
        requestId,
        operationType: 'PREPARE',
        sourceOperationId: idempotencyKey,
        cause: 'MANUAL_ACCOUNT_DELETION',
        scopeType: 'ACCOUNT',
        scopeRef: accountId,
        actorId: accountId,
        previousStatus: null,
        newStatus: 'PREPARED',
        revision: BigInt(expectedRevision),
        recoveryEpoch: currentEpoch,
        anchorTimestamp: deadlines.anchorTimestamp,
        purgeStartedAt: deadlines.purgeStartedAt,
        mainPurgeDeadline: deadlines.mainPurgeDeadline,
        residualPurgeDeadline: deadlines.residualPurgeDeadline,
        details: {
          preparedReceipt: preparedReceipt.preparedReceipt,
          childEventsCount: childEvents.length,
        },
        createdAt: now,
      });

      // Cambiar estado de cuenta a PENDING_DELETION
      await tx.execute(
        `UPDATE organizer_account
         SET status = 'PENDING_DELETION', updated_at = $1
         WHERE id = $2`,
        now,
        accountId
      );

      // Crear barrera para la cuenta
      await tx.execute(
        `INSERT INTO deletion_access_barrier (
           id, request_id, cause, scope_type, scope_ref,
           target_scope_type, target_scope_ref, barrier_state,
           prepared_at, created_at, updated_at
         ) VALUES (
           $1::uuid, $2::uuid, 'MANUAL_ACCOUNT_DELETION', 'ACCOUNT', $3,
           'ACCOUNT', $3, 'PREPARED',
           $4, $4, $4
         )`,
        randomUUID(),
        requestId,
        accountId,
        now
      );

      // Propagar barrera y bloqueo inmediato a todos los eventos hijos (EL-TK-191 Escenarios 1 y 3, EL-TK-193)
      let totalRevokedGrants = 0;
      const affectedEventIds: string[] = [];

      for (const child of childEvents) {
        if ((child.status as string) === 'DELETED' || child.status === 'ARCHIVED') {
          continue;
        }

        affectedEventIds.push(child.id);

        const revokedSessions = await tx.execute(
          `UPDATE guest_session SET revoked_at = $1 WHERE event_id = $2 AND revoked_at IS NULL`,
          now,
          child.id
        );
        const revokedCreds = await tx.execute(
          `UPDATE public_access_credential SET revoked_at = $1 WHERE event_id = $2 AND revoked_at IS NULL`,
          now,
          child.id
        );
        const inFlightRows = await tx.query<{ cnt: number | string }>(
          `SELECT COUNT(*)::int AS cnt FROM upload_attempt WHERE event_id = $1 AND status = 'AUTHORIZED'`,
          child.id
        );

        const childRevokedGrants = revokedSessions + revokedCreds;
        totalRevokedGrants += childRevokedGrants;

        await tx.execute(
          `INSERT INTO deletion_access_barrier (
             id, request_id, cause, scope_type, scope_ref,
             target_scope_type, target_scope_ref, barrier_state,
             event_snapshot_status, event_snapshot_previous_status,
             in_flight_writers_count, revoked_grants_count,
             prepared_at, created_at, updated_at
           ) VALUES (
             $1::uuid, $2::uuid, 'MANUAL_ACCOUNT_DELETION', 'ACCOUNT', $3,
             'EVENT', $4, 'PREPARED',
             $5, $6,
             $7, $8,
             $9, $9, $9
           )`,
          randomUUID(),
          requestId,
          accountId,
          child.id,
          child.status,
          child.previous_status,
          Number(inFlightRows[0]?.cnt ?? 0),
          childRevokedGrants,
          now
        );

        // Regla EL-TK-191 Escenario 3:
        // Si el hijo ya tenía un purge_started_at anterior (por gracia vencida o solicitud previa de 72h),
        // se conserva el plazo más temprano sin extender obligaciones; y no se agrega una ventana extra de 72h.
        const existingPurgeStart = child.purge_started_at ? new Date(child.purge_started_at) : null;
        const effectivePurgeStart =
          existingPurgeStart && existingPurgeStart.getTime() < deadlines.purgeStartedAt.getTime()
            ? existingPurgeStart
            : deadlines.purgeStartedAt;

        const preservedPreviousStatus =
          child.status === 'PENDING_DELETION' ? child.previous_status : child.status;

        await tx.execute(
          `UPDATE event
           SET status = 'PENDING_DELETION',
               previous_status = $1,
               purge_started_at = $2,
               updated_at = $3
           WHERE id = $4`,
          preservedPreviousStatus,
          effectivePurgeStart,
          now,
          child.id
        );
      }

      return {
        request: createdRequest,
        affectedEventIds,
        totalRevokedGrants,
      };
    });

    this.emitMetric({
      metric: 'BARRIER_PREPARED',
      scopeType: 'ACCOUNT',
      cause: 'MANUAL_ACCOUNT_DELETION',
      count: 1 + sqlPhase.affectedEventIds.length,
      timestamp: now,
    });
    if (sqlPhase.totalRevokedGrants > 0) {
      this.emitMetric({
        metric: 'GRANTS_REVOKED',
        scopeType: 'ACCOUNT',
        cause: 'MANUAL_ACCOUNT_DELETION',
        count: sqlPhase.totalRevokedGrants,
        timestamp: now,
      });
    }

    // Paso 3: Invalidar exportaciones afectadas de la cuenta y sus eventos hijos (EL-TK-193 / MOD-005)
    let exportInv: ExportInvalidationResult = { invalidatedExportsCount: 0, partsInventory: [] };
    if (this.exportBarrierPort) {
      exportInv = await this.exportBarrierPort.invalidateExportsForScope({
        scopeType: 'ACCOUNT',
        scopeRef: accountId,
        targetEventIds: sqlPhase.affectedEventIds,
        requestId: sqlPhase.request.id,
        reason: 'MANUAL_ACCOUNT_DELETION',
      });
      if (exportInv.invalidatedExportsCount > 0) {
        this.emitMetric({
          metric: 'EXPORTS_INVALIDATED',
          scopeType: 'ACCOUNT',
          cause: 'MANUAL_ACCOUNT_DELETION',
          count: exportInv.invalidatedExportsCount,
          timestamp: now,
        });
      }
    }

    // Paso 4: ACK en RecoveryAuthority
    let finalRequest: DeletionRequestRecord;
    let outcome: 'REQUESTED' | 'OUTCOME_UNKNOWN' = 'REQUESTED';

    try {
      await this.recoveryBarrierPort.ackDeletionBarrier({
        preparedReceipt: preparedReceipt.preparedReceipt,
        requestId: sqlPhase.request.id,
        revision: sqlPhase.request.currentRevision,
        recoveryEpoch: currentEpoch,
      });

      finalRequest = await this.runner.run(async (tx: SqlTransaction) => {
        const nextRev = sqlPhase.request.currentRevision + 1n;
        await this.repository.updateRequestStatus(tx, {
          requestId: sqlPhase.request.id,
          expectedRevision: sqlPhase.request.currentRevision,
          newRevision: nextRev,
          newStatus: 'CONFIRMED',
          updatedAt: now,
        });
        const updated = (await this.repository.findById(tx, sqlPhase.request.id))!;

        await this.repository.insertReceipt(tx, {
          id: randomUUID(),
          requestId: updated.id,
          operationType: 'CONFIRM',
          sourceOperationId: idempotencyKey,
          cause: 'MANUAL_ACCOUNT_DELETION',
          scopeType: 'ACCOUNT',
          scopeRef: accountId,
          actorId: accountId,
          previousStatus: 'PREPARED',
          newStatus: 'CONFIRMED',
          revision: nextRev,
          recoveryEpoch: currentEpoch,
          anchorTimestamp: updated.anchorTimestamp,
          purgeStartedAt: updated.purgeStartedAt,
          mainPurgeDeadline: updated.mainPurgeDeadline,
          residualPurgeDeadline: updated.residualPurgeDeadline,
          details: { ackConfirmed: true },
          createdAt: now,
        });

        await tx.execute(
          `UPDATE deletion_access_barrier
           SET barrier_state = 'ACTIVE',
               confirmed_at = $1,
               invalidated_exports_count = CASE WHEN target_scope_type = 'ACCOUNT' THEN $2 ELSE invalidated_exports_count END,
               export_parts_inventory_json = CASE WHEN target_scope_type = 'ACCOUNT' THEN $3 ELSE export_parts_inventory_json END,
               updated_at = $1
           WHERE request_id = $4::uuid`,
          now,
          exportInv.invalidatedExportsCount,
          JSON.stringify(exportInv.partsInventory),
          updated.id
        );

        return updated;
      });

      this.emitMetric({
        metric: 'BARRIER_CONFIRMED',
        scopeType: 'ACCOUNT',
        cause: 'MANUAL_ACCOUNT_DELETION',
        count: 1 + sqlPhase.affectedEventIds.length,
        timestamp: now,
      });
    } catch {
      outcome = 'OUTCOME_UNKNOWN';
      finalRequest = await this.runner.run(async (tx: SqlTransaction) => {
        const nextRev = sqlPhase.request.currentRevision + 1n;
        await this.repository.updateRequestStatus(tx, {
          requestId: sqlPhase.request.id,
          expectedRevision: sqlPhase.request.currentRevision,
          newRevision: nextRev,
          newStatus: 'UNKNOWN',
          updatedAt: now,
        });
        const updated = (await this.repository.findById(tx, sqlPhase.request.id))!;

        await this.repository.insertReceipt(tx, {
          id: randomUUID(),
          requestId: updated.id,
          operationType: 'MARK_UNKNOWN',
          sourceOperationId: idempotencyKey,
          cause: 'MANUAL_ACCOUNT_DELETION',
          scopeType: 'ACCOUNT',
          scopeRef: accountId,
          actorId: accountId,
          previousStatus: 'PREPARED',
          newStatus: 'UNKNOWN',
          revision: nextRev,
          recoveryEpoch: currentEpoch,
          anchorTimestamp: updated.anchorTimestamp,
          purgeStartedAt: updated.purgeStartedAt,
          mainPurgeDeadline: updated.mainPurgeDeadline,
          residualPurgeDeadline: updated.residualPurgeDeadline,
          details: { reason: 'Account deletion ACK uncertain; barrier kept fail-closed' },
          createdAt: now,
        });

        await tx.execute(
          `UPDATE deletion_access_barrier
           SET barrier_state = 'UNKNOWN', updated_at = $1
           WHERE request_id = $2::uuid`,
          now,
          updated.id
        );

        return updated;
      });

      this.emitMetric({
        metric: 'BARRIER_UNKNOWN',
        scopeType: 'ACCOUNT',
        cause: 'MANUAL_ACCOUNT_DELETION',
        count: 1 + sqlPhase.affectedEventIds.length,
        timestamp: now,
      });
    }

    // Paso 5: Notificación asíncrona aislada (DEC-091, EL-TK-191: fallo email no revierte solicitud)
    let notificationWarning: string | undefined;
    if (this.notificationPort?.notifyAccountDeletionRequested) {
      try {
        await this.notificationPort.notifyAccountDeletionRequested({
          accountId,
          requestId: finalRequest.id,
          cancelUntil: finalRequest.cancelUntil!,
        });
      } catch (notifErr) {
        notificationWarning = `Notification delivery failed without reverting deletion request: ${(notifErr as Error).message}`;
        this.emitMetric({
          metric: 'NOTIFICATION_EMISSION_FAILED',
          scopeType: 'ACCOUNT',
          cause: 'MANUAL_ACCOUNT_DELETION',
          count: 1,
          timestamp: now,
        });
      }
    }

    return {
      outcome,
      request: finalRequest,
      accountStatus: 'PENDING_DELETION',
      restrictedSessionContext: 'DELETION_MANAGEMENT_ONLY',
      cancelUntil: finalRequest.cancelUntil!,
      purgeStartedAt: finalRequest.purgeStartedAt,
      affectedEventIds: sqlPhase.affectedEventIds,
      ...(notificationWarning ? { notificationWarning } : {}),
    };
  }

  // --------------------------------------------------------------------------
  // EL-TK-192: Cancelar eliminación de cuenta con prueba nueva y recálculo de eventos
  // --------------------------------------------------------------------------
  async cancelManualAccountDeletion(
    command: CancelManualAccountDeletionCommand
  ): Promise<CancelManualAccountDeletionResult> {
    const {
      actorContext,
      accountId,
      requestId,
      confirmation,
      expectedRevision,
      reauthenticationEvidence,
      reason,
      idempotencyKey,
    } = command;
    const now = command.now ?? new Date();

    if (!actorContext) {
      throw new DeletionCoordinationError('UNAUTHORIZED_ACTOR', 'Actor context is required');
    }

    if (confirmation !== true) {
      throw new DeletionCoordinationError(
        'INVALID_DELETION_INTENT',
        'Explicit confirmation is required to cancel account deletion'
      );
    }

    if (!accountId || !requestId || !idempotencyKey) {
      throw new DeletionCoordinationError(
        'INVALID_DELETION_INTENT',
        'accountId, requestId, and idempotencyKey are required'
      );
    }

    let currentEpoch: bigint;
    try {
      currentEpoch = await this.recoveryBarrierPort.getRecoveryEpoch();
    } catch {
      throw new DeletionCoordinationError(
        'INVALID_STATUS_TRANSITION',
        'Recovery authority unavailable; failing closed'
      );
    }

    if (BigInt(actorContext.recoveryEpoch) !== currentEpoch) {
      throw new DeletionCoordinationError(
        'UNAUTHORIZED_EPOCH',
        `Actor recovery epoch ${actorContext.recoveryEpoch} does not match authority epoch ${currentEpoch}`
      );
    }

    const isAdmin = actorContext.actorType === 'ADMIN_HUMAN';
    const isOrganizer = actorContext.actorType === 'ORGANIZER_HUMAN';

    if (!isAdmin && !isOrganizer) {
      throw new DeletionCoordinationError('UNAUTHORIZED_ACTOR', 'Unsupported actor type');
    }

    let trimmedAdminReason: string | null = null;
    if (isAdmin) {
      // EL-TK-192 Escenario 4: sin proof de organizador como sustituto
      if (reauthenticationEvidence !== undefined) {
        throw new DeletionCoordinationError(
          'UNAUTHORIZED_ACTOR',
          'Organizer password/proof cannot be used as a substitute for administrative identity'
        );
      }

      const authAgeMs = now.getTime() - new Date(actorContext.authTime).getTime();
      if (authAgeMs < 0 || authAgeMs > this.maxAdminFreshnessMs) {
        throw new DeletionCoordinationError(
          'UNAUTHORIZED_ACTOR',
          'Administrative session freshness expired for sensitive account cancellation'
        );
      }

      trimmedAdminReason = typeof reason === 'string' ? reason.trim() : '';
      if (!trimmedAdminReason) {
        throw new DeletionCoordinationError(
          'INVALID_DELETION_INTENT',
          'Audited administrative reason is mandatory for admin account cancellation'
        );
      }

      if (!this.adminGrantPort) {
        throw new DeletionCoordinationError(
          'UNAUTHORIZED_ACTOR',
          'Admin cancellation grant authority is not configured'
        );
      }

      const validGrant = await this.adminGrantPort.verifyActiveGrant({
        principalId: actorContext.principalId,
        operation: 'CANCEL_ACCOUNT_DELETION',
        resourceType: 'ACCOUNT',
        resourceRef: accountId,
        requestId,
        now,
      });

      if (!validGrant || validGrant.status !== 'ACTIVE' || now.getTime() >= validGrant.expiresAt.getTime()) {
        throw new DeletionCoordinationError(
          'UNAUTHORIZED_ACTOR',
          'Missing, mismatched, or revoked MOD-007 grant for account deletion cancellation'
        );
      }
    } else {
      // Owner path
      if (actorContext.accountId !== accountId) {
        throw new DeletionCoordinationError('UNAUTHORIZED_ACTOR', 'Account ID must match authenticated organizer');
      }
      if (!this.reauthenticationPort) {
        throw new DeletionCoordinationError(
          'INVALID_STATUS_TRANSITION',
          'MOD-001 AccountReauthenticationPort is required for owner cancellation'
        );
      }
    }

    const intentionHash = computeCanonicalAccountDeletionIntentionHash({
      operation: 'CANCEL_ACCOUNT_DELETION',
      accountId,
      expectedRevision: BigInt(expectedRevision),
      confirmation: true,
      requestId,
    });

    // Verificar primero replay exacto cuando la solicitud ya está CANCELLED
    const replayCheck = await this.runner.run(async (tx: SqlTransaction) => {
      const req = await this.repository.findById(tx, requestId);
      if (!req || req.scopeType !== 'ACCOUNT' || req.scopeRef !== accountId) {
        return null;
      }
      if (req.status !== 'CANCELLED') {
        return null;
      }

      // Verificar que existe un recibo CANCELLED con el mismo sourceOperationId (idempotencyKey)
      const receipts = await this.repository.findReceiptsByRequestId(tx, requestId);
      const cancelReceipt = receipts.find(
        (r) => r.operationType === 'CANCEL' && r.sourceOperationId === idempotencyKey
      );
      if (!cancelReceipt) {
        return null;
      }

      const childEvents = await tx.query<{ id: string; status: string }>(
        `SELECT id, status FROM event WHERE organizer_id = $1 ORDER BY created_at ASC`,
        accountId
      );

      const summaries: RecalculatedChildEventSummary[] = [];
      for (const ev of childEvents) {
        const activeBarriers = await tx.query<{ cnt: number | string }>(
          `SELECT COUNT(*)::int AS cnt FROM deletion_access_barrier
           WHERE target_scope_type = 'EVENT' AND target_scope_ref = $1
             AND barrier_state IN ('PREPARED', 'ACTIVE', 'UNKNOWN')`,
          ev.id
        );
        summaries.push({
          eventId: ev.id,
          statusAfterCancellation: ev.status as EventStatus,
          hasIndependentBarrier: Number(activeBarriers[0]?.cnt ?? 0) > 0,
        });
      }

      return {
        request: req,
        recalculatedEvents: summaries,
      };
    });

    if (replayCheck) {
      return {
        outcome: 'IDEMPOTENT_REPLAY',
        request: replayCheck.request,
        accountStatus: 'ACTIVE',
        recalculatedEvents: replayCheck.recalculatedEvents,
      };
    }

    // Paso 1: PREPARE externo antes de SQL (account-reauthentication-contract.md)
    let preparedAck: { readonly preparedReceipt: string; readonly sequence: bigint };
    try {
      preparedAck = await this.recoveryBarrierPort.prepareCancellationBarrierRelease({
        operationId: idempotencyKey,
        requestId,
        scopeType: 'ACCOUNT',
        scopeRef: accountId,
        expectedRevision: BigInt(expectedRevision),
        recoveryEpoch: currentEpoch,
      });
    } catch (err) {
      throw new DeletionCoordinationError(
        'INVALID_STATUS_TRANSITION',
        `RecoveryAuthority PREPARE failed for account cancellation: ${(err as Error).message}`
      );
    }

    const actorId = isAdmin ? actorContext.principalId : actorContext.accountId;

    // Paso 2: En transacción SQL bajo FOR UPDATE, validar ventana < cancelUntil, ausencia de claim,
    // y si es el owner, consumir la nueva evidencia de CANCEL_ACCOUNT_DELETION
    const preAckValidation = await this.runner.run(async (tx: SqlTransaction) => {
      const req = await this.repository.findByIdForUpdate(tx, requestId);
      if (!req || req.scopeType !== 'ACCOUNT' || req.scopeRef !== accountId) {
        throw new DeletionCoordinationError(
          'REQUEST_NOT_FOUND',
          `Account deletion request '${requestId}' not found`
        );
      }

      if (req.cause !== 'MANUAL_ACCOUNT_DELETION') {
        throw new DeletionCoordinationError(
          'IRREVERSIBLE_CAUSE_CANNOT_CANCEL',
          `Cause '${req.cause}' cannot be cancelled`
        );
      }

      if (
        req.claimedAt !== null ||
        req.status === 'CLAIMED' ||
        req.status === 'MAIN_PURGED' ||
        req.status === 'COMPLETED'
      ) {
        throw new DeletionCoordinationError(
          'INVALID_STATUS_TRANSITION',
          `Account deletion request '${requestId}' has already been claimed for irreversible purge`
        );
      }

      if (!req.cancelUntil || now.getTime() >= req.cancelUntil.getTime()) {
        throw new DeletionCoordinationError(
          'INVALID_STATUS_TRANSITION',
          `Account cancellation window expired at ${req.cancelUntil?.toISOString() ?? 'N/A'}`
        );
      }

      if (req.currentRevision !== BigInt(expectedRevision)) {
        throw new DeletionCoordinationError(
          'REVISION_CONFLICT',
          `Expected revision ${expectedRevision} does not match request revision ${req.currentRevision}`
        );
      }

      // Si es el propietario, consumir la nueva evidencia de un solo uso ligada a CANCEL_ACCOUNT_DELETION y requestId
      if (isOrganizer) {
        if (!reauthenticationEvidence || typeof reauthenticationEvidence !== 'string') {
          throw new DeletionCoordinationError(
            'UNAUTHORIZED_ACTOR',
            'Fresh reauthentication evidence is required to cancel account deletion'
          );
        }

        await this.reauthenticationPort!.assertAndConsumeEvidence(tx, {
          evidence: reauthenticationEvidence,
          accountId,
          sessionId: actorContext.sessionId,
          operation: 'CANCEL_ACCOUNT_DELETION',
          resourceType: 'ACCOUNT',
          resourceId: accountId,
          expectedRevision: actorContext.credentialRevision,
          intentionHash,
          requestId,
          idempotencyKey,
        });
      }

      return req;
    });

    // Paso 3: ACK causal en RecoveryAuthority ANTES de levantar barreras o reactivar la cuenta (EL-TK-192 Escenario 3)
    try {
      await this.recoveryBarrierPort.ackCancellationBarrierRelease({
        preparedReceipt: preparedAck.preparedReceipt,
        requestId,
        revision: preAckValidation.currentRevision + 1n,
        recoveryEpoch: currentEpoch,
      });
    } catch {
      // Si el ACK falla, permanece acceso restringido (PENDING_DELETION y barreras en UNKNOWN) hasta reconciliar
      const unknownResult = await this.runner.run(async (tx: SqlTransaction) => {
        const req = await this.repository.findByIdForUpdate(tx, requestId);
        if (!req) {
          throw new DeletionCoordinationError('REQUEST_NOT_FOUND', 'Request not found');
        }
        const nextRev = req.currentRevision + 1n;
        await this.repository.updateRequestStatus(tx, {
          requestId,
          expectedRevision: req.currentRevision,
          newRevision: nextRev,
          newStatus: 'UNKNOWN',
          updatedAt: now,
        });
        const updated = (await this.repository.findById(tx, requestId))!;

        await this.repository.insertReceipt(tx, {
          id: randomUUID(),
          requestId,
          operationType: 'MARK_UNKNOWN',
          sourceOperationId: idempotencyKey,
          cause: req.cause,
          scopeType: 'ACCOUNT',
          scopeRef: accountId,
          actorId,
          previousStatus: req.status,
          newStatus: 'UNKNOWN',
          revision: nextRev,
          recoveryEpoch: currentEpoch,
          anchorTimestamp: req.anchorTimestamp,
          purgeStartedAt: req.purgeStartedAt,
          mainPurgeDeadline: req.mainPurgeDeadline,
          residualPurgeDeadline: req.residualPurgeDeadline,
          details: { reason: 'Account cancellation ACK uncertain; account remains restricted' },
          createdAt: now,
        });

        await tx.execute(
          `UPDATE deletion_access_barrier
           SET barrier_state = 'UNKNOWN', updated_at = $1
           WHERE request_id = $2::uuid`,
          now,
          requestId
        );

        const childEvents = await tx.query<{ id: string; status: string }>(
          `SELECT id, status FROM event WHERE organizer_id = $1 ORDER BY created_at ASC`,
          accountId
        );

        return {
          request: updated,
          recalculatedEvents: childEvents.map((ev) => ({
            eventId: ev.id,
            statusAfterCancellation: ev.status as EventStatus,
            hasIndependentBarrier: true,
          })),
        };
      });

      this.emitMetric({
        metric: 'BARRIER_UNKNOWN',
        scopeType: 'ACCOUNT',
        cause: 'MANUAL_ACCOUNT_DELETION',
        count: 1,
        timestamp: now,
      });

      return {
        outcome: 'OUTCOME_UNKNOWN',
        request: unknownResult.request,
        accountStatus: 'PENDING_DELETION',
        recalculatedEvents: unknownResult.recalculatedEvents,
      };
    }

    // Paso 4: Con ACK confirmado, cancelar la solicitud, restaurar cuenta a ACTIVE,
    // liberar exclusivamente las barreras de esta solicitud y recalcular cada evento hijo
    const cancelledAccountResult = await this.runner.run(async (tx: SqlTransaction) => {
      const req = await this.repository.findByIdForUpdate(tx, requestId);
      if (!req) {
        throw new DeletionCoordinationError('REQUEST_NOT_FOUND', 'Request not found');
      }

      if (
        req.claimedAt !== null ||
        req.status === 'CLAIMED' ||
        req.status === 'MAIN_PURGED' ||
        req.status === 'COMPLETED'
      ) {
        throw new DeletionCoordinationError(
          'INVALID_STATUS_TRANSITION',
          'Concurrent claim won before account cancellation commit'
        );
      }

      if (!req.cancelUntil || now.getTime() >= req.cancelUntil.getTime()) {
        throw new DeletionCoordinationError(
          'INVALID_STATUS_TRANSITION',
          'Cancellation window expired before commit'
        );
      }

      const nextRev = req.currentRevision + 1n;
      const effectiveCancelReason = isAdmin
        ? `ADMIN_CANCELLED: ${trimmedAdminReason}`
        : 'ORGANIZER_CANCELLED_WITHIN_7D_WINDOW';

      await this.repository.updateRequestStatus(tx, {
        requestId,
        expectedRevision: req.currentRevision,
        newStatus: 'CANCELLED',
        newRevision: nextRev,
        cancelledAt: now,
        cancelledBy: actorId,
        cancelReason: effectiveCancelReason,
        updatedAt: now,
      });

      const updatedReq = (await this.repository.findById(tx, requestId))!;

      await this.repository.insertReceipt(tx, {
        id: randomUUID(),
        requestId,
        operationType: 'CANCEL',
        sourceOperationId: idempotencyKey,
        cause: req.cause,
        scopeType: 'ACCOUNT',
        scopeRef: accountId,
        actorId,
        previousStatus: req.status,
        newStatus: 'CANCELLED',
        revision: nextRev,
        recoveryEpoch: currentEpoch,
        anchorTimestamp: req.anchorTimestamp,
        purgeStartedAt: req.purgeStartedAt,
        mainPurgeDeadline: req.mainPurgeDeadline,
        residualPurgeDeadline: req.residualPurgeDeadline,
        details: {
          cancelledByRole: actorContext.actorType,
          reason: effectiveCancelReason,
        },
        createdAt: now,
      });

      // Restaurar cuenta a ACTIVE
      await tx.execute(
        `UPDATE organizer_account
         SET status = 'ACTIVE', updated_at = $1
         WHERE id = $2`,
        now,
        accountId
      );

      // Obtener las barreras de eventos hijos antes de liberarlas
      const barrierRows = await tx.query<BarrierRow>(
        `SELECT * FROM deletion_access_barrier
         WHERE request_id = $1::uuid
         FOR UPDATE`,
        requestId
      );
      const eventBarrierByEventId = new Map<string, DeletionAccessBarrierRecord>();
      for (const bRow of barrierRows) {
        if (bRow.target_scope_type === 'EVENT') {
          eventBarrierByEventId.set(bRow.target_scope_ref, mapBarrierRow(bRow));
        }
      }

      // Liberar EXCLUSIVAMENTE las barreras de este requestId
      await tx.execute(
        `UPDATE deletion_access_barrier
         SET barrier_state = 'RELEASED',
             released_at = $1,
             released_by = $2,
             updated_at = $1
         WHERE request_id = $3::uuid`,
        now,
        actorId,
        requestId
      );

      // Recalcular cada evento hijo según su propio lifecycle, cierres y otras barreras (EL-TK-192 Escenario 1)
      const childEvents = await tx.query<EventBarrierTargetRow>(
        `SELECT id, organizer_id, status, previous_status, scheduled_at, activated_at,
                closed_at, expires_at, grace_ends_at, purge_started_at,
                suspended_at, suspension_reason
         FROM event
         WHERE organizer_id = $1
         ORDER BY created_at ASC
         FOR UPDATE`,
        accountId
      );

      const recalculatedSummaries: RecalculatedChildEventSummary[] = [];

      for (const child of childEvents) {
        if ((child.status as string) === 'DELETED' || child.status === 'ARCHIVED') {
          recalculatedSummaries.push({
            eventId: child.id,
            statusAfterCancellation: child.status as EventStatus,
            hasIndependentBarrier: false,
          });
          continue;
        }

        const otherBarriers = await tx.query<{ cnt: number | string }>(
          `SELECT COUNT(*)::int AS cnt
           FROM deletion_access_barrier
           WHERE target_scope_type = 'EVENT' AND target_scope_ref = $1
             AND barrier_state IN ('PREPARED', 'ACTIVE', 'UNKNOWN')`,
          child.id
        );
        const remainingCount = Number(otherBarriers[0]?.cnt ?? 0);

        const releasedChildBarrier = eventBarrierByEventId.get(child.id);
        const recalc = calculateFaithfulEventStatusAfterBarrierRelease({
          event: child,
          snapshotStatus: releasedChildBarrier?.eventSnapshotStatus ?? null,
          snapshotPreviousStatus: releasedChildBarrier?.eventSnapshotPreviousStatus ?? null,
          remainingActiveBarriersCount: remainingCount,
          now,
        });

        await tx.execute(
          `UPDATE event
           SET status = $1,
               previous_status = $2,
               purge_started_at = $3,
               updated_at = $4
           WHERE id = $5`,
          recalc.targetStatus,
          recalc.previousStatusToPersist,
          recalc.purgeStartedAtToPersist,
          now,
          child.id
        );

        recalculatedSummaries.push({
          eventId: child.id,
          statusAfterCancellation: recalc.targetStatus,
          hasIndependentBarrier: remainingCount > 0 || recalc.graceExpiredDuringWindow,
        });
      }

      return {
        request: updatedReq,
        recalculatedEvents: recalculatedSummaries,
        releasedCount: barrierRows.length,
      };
    });

    this.emitMetric({
      metric: 'BARRIER_RELEASED',
      scopeType: 'ACCOUNT',
      cause: 'MANUAL_ACCOUNT_DELETION',
      count: cancelledAccountResult.releasedCount,
      timestamp: now,
    });

    if (this.notificationPort?.notifyAccountDeletionCancelled) {
      try {
        await this.notificationPort.notifyAccountDeletionCancelled({
          accountId,
          requestId,
          cancelledAt: now,
        });
      } catch {
        this.emitMetric({
          metric: 'NOTIFICATION_EMISSION_FAILED',
          scopeType: 'ACCOUNT',
          cause: 'MANUAL_ACCOUNT_DELETION',
          count: 1,
          timestamp: now,
        });
      }
    }

    return {
      outcome: 'CANCELLED',
      request: cancelledAccountResult.request,
      accountStatus: 'ACTIVE',
      recalculatedEvents: cancelledAccountResult.recalculatedEvents,
    };
  }

  // --------------------------------------------------------------------------
  // EL-TK-193: Evaluación y propagación de barreras sobre accesos, grants y exportaciones
  // --------------------------------------------------------------------------
  async evaluateBarrierAccess(
    command: EvaluateDeletionBarrierAccessCommand
  ): Promise<DeletionBarrierAccessDecision> {
    const eventId =
      command.eventId ?? (command.scopeType === 'EVENT' ? command.scopeRef : undefined);
    const accountId =
      command.accountId ?? (command.scopeType === 'ACCOUNT' ? command.scopeRef : undefined);
    const mediaRef =
      command.mediaRef ?? (command.scopeType === 'MEDIA' ? command.scopeRef : undefined);
    const action = command.action ?? command.capability ?? 'UNKNOWN_ACTION';
    const { actorContext } = command;
    const now = new Date();

    return this.runner.run(async (tx: SqlTransaction) => {
      const activeBarriers: DeletionAccessBarrierRecord[] = [];

      if (eventId) {
        const eventBarrierRows = await tx.query<BarrierRow>(
          `SELECT * FROM deletion_access_barrier
           WHERE target_scope_type = 'EVENT' AND target_scope_ref = $1
             AND barrier_state IN ('PREPARED', 'ACTIVE', 'UNKNOWN')`,
          eventId
        );
        for (const r of eventBarrierRows) {
          activeBarriers.push(mapBarrierRow(r));
        }
      }

      if (accountId) {
        const accountBarrierRows = await tx.query<BarrierRow>(
          `SELECT * FROM deletion_access_barrier
           WHERE target_scope_type = 'ACCOUNT' AND target_scope_ref = $1
             AND barrier_state IN ('PREPARED', 'ACTIVE', 'UNKNOWN')`,
          accountId
        );
        for (const r of accountBarrierRows) {
          activeBarriers.push(mapBarrierRow(r));
        }
      }

      if (mediaRef) {
        const mediaBarrierRows = await tx.query<BarrierRow>(
          `SELECT * FROM deletion_access_barrier
           WHERE target_scope_type = 'MEDIA' AND target_scope_ref = $1
             AND barrier_state IN ('PREPARED', 'ACTIVE', 'UNKNOWN')`,
          mediaRef
        );
        for (const r of mediaBarrierRows) {
          activeBarriers.push(mapBarrierRow(r));
        }
      }

      if (activeBarriers.length === 0) {
        return {
          allowed: true,
          code: 'ALLOWED',
          blockingRequestIds: [],
          reason: 'No active deletion barrier on target scope',
        };
      }

      // Única excepción permitida durante la ventana: el organizador dueño o ADMIN_HUMAN
      // consultando el estado de eliminación o solicitando su cancelación
      if (
        action === 'ORGANIZER_VIEW_DELETION_STATUS' ||
        action === 'ORGANIZER_CANCEL_DELETION'
      ) {
        if (
          actorContext?.actorType === 'ORGANIZER_HUMAN' ||
          actorContext?.actorType === 'ADMIN_HUMAN'
        ) {
          return {
            allowed: true,
            code: 'ALLOWED',
            blockingRequestIds: activeBarriers.map((b) => b.requestId),
            reason: 'Deletion status consultation and cancellation permitted under active barrier',
          };
        }
      }

      // Cualquier otra operación se deniega desde PREPARED (fail-closed)
      const blockingIds = [...new Set(activeBarriers.map((b) => b.requestId))];

      await tx.execute(
        `UPDATE deletion_access_barrier
         SET denied_access_count = denied_access_count + 1,
             updated_at = $1
         WHERE id = ANY($2::uuid[])`,
        now,
        activeBarriers.map((b) => b.id)
      );

      this.emitMetric({
        metric: 'ACCESS_DENIED_BY_BARRIER',
        scopeType: eventId ? 'EVENT' : accountId ? 'ACCOUNT' : 'MEDIA',
        count: 1,
        timestamp: now,
      });

      const hasUnknown = activeBarriers.some((b) => b.barrierState === 'UNKNOWN');
      const hasAccountBarrier = activeBarriers.some((b) => b.scopeType === 'ACCOUNT');
      const hasMediaBarrier = activeBarriers.some((b) => b.scopeType === 'MEDIA');

      return {
        allowed: false,
        code: hasUnknown
          ? 'BLOCKED_BY_UNCERTAIN_BARRIER'
          : hasAccountBarrier
            ? 'BLOCKED_BY_ACCOUNT_DELETION_BARRIER'
            : hasMediaBarrier
              ? 'BLOCKED_BY_MEDIA_DELETION_BARRIER'
              : 'BLOCKED_BY_EVENT_DELETION_BARRIER',
        blockingRequestIds: blockingIds,
        reason: `Operation '${action}' denied by active deletion barrier(s): ${blockingIds.join(', ')}`,
      };
    });
  }

  /**
   * Consulta el estado consolidado de barreras para un recurso (EVENT o ACCOUNT),
   * incluyendo writers en vuelo vigilados e inventario de partes de exportación.
   */
  async getResourceBarrierSnapshot(params: {
    readonly targetScopeType: 'EVENT' | 'ACCOUNT';
    readonly targetScopeRef: string;
  }): Promise<{
    readonly isBlocked: boolean;
    readonly activeBarriers: readonly DeletionAccessBarrierRecord[];
    readonly releasedBarriers: readonly DeletionAccessBarrierRecord[];
    readonly totalInFlightWritersWatched: number;
    readonly totalRevokedGrants: number;
    readonly totalInvalidatedExports: number;
    readonly totalDeniedAccesses: number;
    readonly consolidatedExportPartsInventory: readonly ExportPartInventoryItem[];
  }> {
    return this.runner.run(async (tx: SqlTransaction) => {
      const rows = await tx.query<BarrierRow>(
        `SELECT * FROM deletion_access_barrier
         WHERE target_scope_type = $1 AND target_scope_ref = $2
         ORDER BY created_at ASC`,
        params.targetScopeType,
        params.targetScopeRef
      );

      const all = rows.map(mapBarrierRow);
      const activeBarriers = all.filter(
        (b) => b.barrierState === 'PREPARED' || b.barrierState === 'ACTIVE' || b.barrierState === 'UNKNOWN'
      );
      const releasedBarriers = all.filter((b) => b.barrierState === 'RELEASED');

      let totalInFlightWritersWatched = 0;
      let totalRevokedGrants = 0;
      let totalInvalidatedExports = 0;
      let totalDeniedAccesses = 0;
      const inventoryMap = new Map<string, ExportPartInventoryItem>();

      for (const b of all) {
        if (b.barrierState !== 'RELEASED') {
          totalInFlightWritersWatched += b.inFlightWritersCount;
        }
        totalRevokedGrants += b.revokedGrantsCount;
        totalInvalidatedExports += b.invalidatedExportsCount;
        totalDeniedAccesses += b.deniedAccessCount;
        for (const item of b.exportPartsInventory) {
          inventoryMap.set(`${item.exportId}:${item.objectKey}:${item.versionId ?? ''}`, item);
        }
      }

      return {
        isBlocked: activeBarriers.length > 0,
        activeBarriers,
        releasedBarriers,
        totalInFlightWritersWatched,
        totalRevokedGrants,
        totalInvalidatedExports,
        totalDeniedAccesses,
        consolidatedExportPartsInventory: [...inventoryMap.values()],
      };
    });
  }
}
