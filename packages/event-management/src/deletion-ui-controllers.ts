import { formatUtcToLocalIso } from './timeline.js';
import type {
  DeletionCause,
  DeletionRequestStatus,
} from './deletion-coordination.js';
import type {
  MainPurgeStatus,
  ResidualPurgeStatus,
} from './deletion-purge-execution.js';
import { computeCanonicalAccountDeletionIntentionHash } from './manual-deletion-workflows.js';

// ============================================================================
// MOD-008 — UI CONTROLLERS & VIEW MODELS FOR EVENT & ACCOUNT DELETION
// (EL-TK-200 & EL-TK-201 / EL-EP-015 / ui-deletion-flow.md)
// ============================================================================

export type ResponsiveViewportMode = 'MOBILE' | 'TABLET' | 'DESKTOP';
export type DialogSurfaceContainer = 'BOTTOM_SHEET' | 'MODAL';

export interface AccessibilityFocusState {
  readonly triggerElementId: string | null;
  readonly activeFocusElementId: string | null;
  readonly focusTrapped: boolean;
  readonly politeAnnouncement: string | null;
}

export interface UiTelemetryEvent {
  readonly eventName:
    | 'EVENT_DELETE_DIALOG_OPENED'
    | 'EVENT_DELETE_REQUEST_SUBMITTED'
    | 'EVENT_DELETE_CANCEL_SUBMITTED'
    | 'ACCOUNT_DELETE_CONFIRM_OPENED'
    | 'ACCOUNT_REAUTH_CHALLENGE_STARTED'
    | 'ACCOUNT_REAUTH_VERIFIED'
    | 'ACCOUNT_DELETE_COMMAND_SUBMITTED'
    | 'DELETION_UI_CONFLICT_OR_UNCERTAIN';
  readonly scopeType: 'EVENT' | 'ACCOUNT';
  readonly outcome: string;
  readonly timestamp: Date;
}

export interface UiTelemetrySink {
  recordUiEvent(event: UiTelemetryEvent): void;
}

// ----------------------------------------------------------------------------
// EL-TK-200: Event Deletion UI View Models & Port
// ----------------------------------------------------------------------------

export interface EventDeletionServerSnapshot {
  readonly eventId: string;
  readonly eventName: string;
  readonly eventTimezone: string;
  readonly eventStatus: string;
  readonly currentRevision: bigint;
  readonly generation: bigint;
  readonly deletionRequest: {
    readonly requestId: string;
    readonly cause: DeletionCause;
    readonly status: DeletionRequestStatus;
    readonly anchorTimestamp: Date;
    readonly cancelUntil: Date | null;
    readonly purgeStartedAt: Date;
    readonly mainPurgeDeadline: Date;
    readonly residualPurgeDeadline: Date;
    readonly mainPurgedAt: Date | null;
    readonly mainPurgeStatus: MainPurgeStatus;
    readonly residualPurgeStatus: ResidualPurgeStatus;
  } | null;
  readonly serverCapabilities: {
    readonly canRequestManualDeletion: boolean;
    readonly canCancelManualDeletion: boolean;
    readonly isReadOnlyView: boolean;
  };
}

export interface EventDeletionCountdownViewModel {
  readonly visible: boolean;
  readonly exactDeadlineLocalIso: string;
  readonly exactDeadlineUtcIso: string;
  readonly timezone: string;
  readonly remainingHours: number;
  readonly remainingMinutes: number;
  readonly summaryText: string;
  /** WCAG 2.2 AA: Countdown ticks NEVER emit live-region announcements */
  readonly announceInLiveRegion: false;
}

export interface EventDeleteRequestDialogViewModel {
  readonly open: boolean;
  readonly surfaceContainer: DialogSurfaceContainer;
  readonly eventId: string;
  readonly eventName: string;
  readonly consequencesSummary: readonly string[];
  readonly cancellationWindowHours: 72;
  readonly confirmationChecked: boolean;
  readonly submitDisabled: boolean;
  readonly cancelExitVisible: true;
  readonly statusMessage: string | null;
  readonly errorMessage: string | null;
}

export interface EventLifecycleDeletionPanelViewModel {
  readonly eventId: string;
  readonly eventStatus: string;
  readonly hasDeletionRequest: boolean;
  readonly causeLabel: string | null;
  readonly isCancelable: boolean;
  readonly isIrreversible: boolean;
  readonly isUncertainAck: boolean;
  readonly countdown: EventDeletionCountdownViewModel | null;
  readonly mainPurgeStatusLabel: string;
  readonly residualRetentionNotice: string;
  readonly availableActions: readonly ('REQUEST_EVENT_DELETION' | 'CANCEL_EVENT_DELETION' | 'REFRESH_STATUS')[];
  readonly bannerMessage: string | null;
  readonly retryAfterSeconds: number | null;
}

export interface EventDeletionApiPort {
  getEventDeletionSnapshot(params: {
    readonly eventId: string;
    readonly now: Date;
  }): Promise<EventDeletionServerSnapshot>;

  requestEventDeletion(params: {
    readonly eventId: string;
    readonly confirmation: true;
    readonly expectedRevision: bigint;
    readonly idempotencyKey: string;
    readonly now: Date;
  }): Promise<EventDeletionServerSnapshot>;

  cancelEventDeletion(params: {
    readonly eventId: string;
    readonly requestId: string;
    readonly confirmation: true;
    readonly expectedRevision: bigint;
    readonly idempotencyKey: string;
    readonly now: Date;
  }): Promise<EventDeletionServerSnapshot>;
}

export class UiApiError extends Error {
  constructor(
    public readonly statusCode: 400 | 401 | 403 | 404 | 409 | 429 | 503,
    public readonly code: string,
    message: string,
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'UiApiError';
  }
}

export class EventDeletionUiController {
  private snapshot: EventDeletionServerSnapshot | null = null;
  private viewport: ResponsiveViewportMode = 'DESKTOP';
  private dialogOpen = false;
  private confirmationChecked = false;
  private inFlight = false;
  private pendingIdempotencyKey: string | null = null;
  private statusMessage: string | null = null;
  private errorMessage: string | null = null;
  private retryAfterSeconds: number | null = null;
  private focusState: AccessibilityFocusState = {
    triggerElementId: null,
    activeFocusElementId: null,
    focusTrapped: false,
    politeAnnouncement: null,
  };

  constructor(
    private readonly apiPort: EventDeletionApiPort,
    private readonly telemetrySink?: UiTelemetrySink
  ) {}

  setViewport(viewport: ResponsiveViewportMode): void {
    this.viewport = viewport;
  }

  getFocusState(): AccessibilityFocusState {
    return this.focusState;
  }

  async loadSnapshot(eventId: string, now = new Date()): Promise<EventLifecycleDeletionPanelViewModel> {
    this.snapshot = await this.apiPort.getEventDeletionSnapshot({ eventId, now });
    return this.buildLifecyclePanelViewModel(now);
  }

  openDeleteRequestDialog(triggerElementId: string, now = new Date()): EventDeleteRequestDialogViewModel {
    if (!this.snapshot || !this.snapshot.serverCapabilities.canRequestManualDeletion) {
      throw new Error('Server capabilities do not allow opening EventDeleteRequestDialog');
    }
    this.dialogOpen = true;
    this.confirmationChecked = false;
    this.errorMessage = null;
    this.statusMessage = null;
    this.focusState = {
      triggerElementId,
      activeFocusElementId: 'event-delete-dialog-title',
      focusTrapped: true,
      politeAnnouncement: `Diálogo de eliminación abierto para ${this.snapshot.eventName}`,
    };

    this.telemetrySink?.recordUiEvent({
      eventName: 'EVENT_DELETE_DIALOG_OPENED',
      scopeType: 'EVENT',
      outcome: 'OPENED',
      timestamp: now,
    });

    return this.buildDialogViewModel();
  }

  setDialogConfirmation(checked: boolean): EventDeleteRequestDialogViewModel {
    this.confirmationChecked = checked;
    return this.buildDialogViewModel();
  }

  closeDeleteRequestDialog(): AccessibilityFocusState {
    const returnFocusTo = this.focusState.triggerElementId;
    this.dialogOpen = false;
    this.confirmationChecked = false;
    this.errorMessage = null;
    this.focusState = {
      triggerElementId: null,
      activeFocusElementId: returnFocusTo,
      focusTrapped: false,
      politeAnnouncement: 'Diálogo de eliminación cerrado; sin cambios aplicados.',
    };
    return this.focusState;
  }

  async submitDeleteRequest(idempotencyKey: string, now = new Date()): Promise<{
    readonly dialog: EventDeleteRequestDialogViewModel;
    readonly panel: EventLifecycleDeletionPanelViewModel;
  }> {
    if (!this.snapshot) {
      throw new Error('Snapshot not loaded');
    }
    // Prevent double submit
    if (this.inFlight) {
      return {
        dialog: this.buildDialogViewModel(),
        panel: this.buildLifecyclePanelViewModel(now),
      };
    }
    if (!this.confirmationChecked) {
      this.errorMessage = 'Debes confirmar que comprendes las consecuencias antes de solicitar la eliminación.';
      return {
        dialog: this.buildDialogViewModel(),
        panel: this.buildLifecyclePanelViewModel(now),
      };
    }

    const effectiveKey = this.pendingIdempotencyKey ?? idempotencyKey;
    this.pendingIdempotencyKey = effectiveKey;
    this.inFlight = true;
    this.errorMessage = null;
    this.retryAfterSeconds = null;
    this.statusMessage = 'Registrando solicitud de eliminación…';

    try {
      this.snapshot = await this.apiPort.requestEventDeletion({
        eventId: this.snapshot.eventId,
        confirmation: true,
        expectedRevision: this.snapshot.currentRevision,
        idempotencyKey: effectiveKey,
        now,
      });
      this.pendingIdempotencyKey = null;
      this.dialogOpen = false;
      this.confirmationChecked = false;
      this.statusMessage =
        this.snapshot.deletionRequest?.status === 'UNKNOWN' ||
        this.snapshot.deletionRequest?.status === 'PREPARED'
          ? 'Verificando resultado: la solicitud está pendiente de confirmación de autoridad.'
          : 'Solicitud de eliminación registrada. El acceso público se bloqueó de inmediato; aún no se ha completado la purga física.';

      this.focusState = {
        triggerElementId: null,
        activeFocusElementId: this.focusState.triggerElementId,
        focusTrapped: false,
        politeAnnouncement: this.statusMessage,
      };

      this.telemetrySink?.recordUiEvent({
        eventName: 'EVENT_DELETE_REQUEST_SUBMITTED',
        scopeType: 'EVENT',
        outcome: this.snapshot.deletionRequest?.status ?? 'SUBMITTED',
        timestamp: now,
      });
    } catch (err) {
      await this.handleMutationError(err, now);
    } finally {
      this.inFlight = false;
    }

    return {
      dialog: this.buildDialogViewModel(),
      panel: this.buildLifecyclePanelViewModel(now),
    };
  }

  async submitCancelDeletion(idempotencyKey: string, now = new Date()): Promise<EventLifecycleDeletionPanelViewModel> {
    if (!this.snapshot || !this.snapshot.deletionRequest) {
      throw new Error('No active deletion request to cancel');
    }
    if (this.inFlight) {
      return this.buildLifecyclePanelViewModel(now);
    }
    if (!this.snapshot.serverCapabilities.canCancelManualDeletion) {
      this.errorMessage = 'La solicitud ya no admite cancelación según el estado del servidor.';
      return this.buildLifecyclePanelViewModel(now);
    }

    const effectiveKey = this.pendingIdempotencyKey ?? idempotencyKey;
    this.pendingIdempotencyKey = effectiveKey;
    this.inFlight = true;
    this.errorMessage = null;
    this.retryAfterSeconds = null;
    this.statusMessage = 'Verificando resultado de cancelación…';

    try {
      this.snapshot = await this.apiPort.cancelEventDeletion({
        eventId: this.snapshot.eventId,
        requestId: this.snapshot.deletionRequest.requestId,
        confirmation: true,
        expectedRevision: this.snapshot.currentRevision,
        idempotencyKey: effectiveKey,
        now,
      });
      this.pendingIdempotencyKey = null;

      if (
        this.snapshot.deletionRequest?.status === 'UNKNOWN' ||
        this.snapshot.deletionRequest?.status === 'PREPARED'
      ) {
        this.statusMessage =
          'Verificando resultado: la cancelación aún no tiene confirmación definitiva del servidor.';
      } else {
        this.statusMessage = `Cancelación confirmada por el servidor. Estado vigente del evento: ${this.snapshot.eventStatus}.`;
      }

      this.focusState = {
        ...this.focusState,
        politeAnnouncement: this.statusMessage,
      };

      this.telemetrySink?.recordUiEvent({
        eventName: 'EVENT_DELETE_CANCEL_SUBMITTED',
        scopeType: 'EVENT',
        outcome: this.snapshot.eventStatus,
        timestamp: now,
      });
    } catch (err) {
      await this.handleMutationError(err, now);
    } finally {
      this.inFlight = false;
    }

    return this.buildLifecyclePanelViewModel(now);
  }

  buildDialogViewModel(): EventDeleteRequestDialogViewModel {
    const surfaceContainer: DialogSurfaceContainer =
      this.viewport === 'MOBILE' ? 'BOTTOM_SHEET' : 'MODAL';
    const eventId = this.snapshot?.eventId ?? '';
    const eventName = this.snapshot?.eventName ?? '';

    return {
      open: this.dialogOpen,
      surfaceContainer,
      eventId,
      eventName,
      consequencesSummary: [
        `Recurso afectado: evento «${eventName}» (${eventId}).`,
        'Bloqueo inmediato del acceso de invitados, galería pública, nuevas subidas y exportaciones.',
        'Ventana de cancelación de 72 horas exactas antes del inicio de la purga física.',
        'Tras las 72 horas, la purga principal se ejecuta en hasta +7 días UTC y las copias ordinarias rotan en hasta +30 días UTC sin posibilidad de recuperar contenido purgado.',
      ],
      cancellationWindowHours: 72,
      confirmationChecked: this.confirmationChecked,
      submitDisabled: !this.confirmationChecked || this.inFlight,
      cancelExitVisible: true,
      statusMessage: this.statusMessage,
      errorMessage: this.errorMessage,
    };
  }

  buildLifecyclePanelViewModel(now = new Date()): EventLifecycleDeletionPanelViewModel {
    if (!this.snapshot) {
      throw new Error('Snapshot not loaded');
    }

    const req = this.snapshot.deletionRequest;
    const tz = this.snapshot.eventTimezone || 'UTC';

    if (!req || req.status === 'CANCELLED') {
      const actions: ('REQUEST_EVENT_DELETION' | 'CANCEL_EVENT_DELETION' | 'REFRESH_STATUS')[] = [];
      if (
        this.snapshot.serverCapabilities.canRequestManualDeletion &&
        !this.snapshot.serverCapabilities.isReadOnlyView
      ) {
        actions.push('REQUEST_EVENT_DELETION');
      }
      return {
        eventId: this.snapshot.eventId,
        eventStatus: this.snapshot.eventStatus,
        hasDeletionRequest: false,
        causeLabel: null,
        isCancelable: false,
        isIrreversible: false,
        isUncertainAck: false,
        countdown: null,
        mainPurgeStatusLabel: 'Sin purga activa',
        residualRetentionNotice:
          'Los eventos eliminados cumplen purga principal verificada en hasta +7 días UTC y rotación de copias ordinarias en hasta +30 días UTC.',
        availableActions: actions,
        bannerMessage: this.errorMessage ?? this.statusMessage,
        retryAfterSeconds: this.retryAfterSeconds,
      };
    }

    const isUncertainAck = req.status === 'UNKNOWN' || req.status === 'PREPARED';
    const isManualCause =
      req.cause === 'MANUAL_EVENT_DELETION' || req.cause === 'MANUAL_ACCOUNT_DELETION';
    const windowStillOpen =
      isManualCause &&
      req.cancelUntil !== null &&
      now.getTime() < req.cancelUntil.getTime() &&
      req.status === 'CONFIRMED';

    // Only server-authorized cancel capability + open window enables cancellation
    const isCancelable =
      windowStillOpen &&
      this.snapshot.serverCapabilities.canCancelManualDeletion &&
      !this.snapshot.serverCapabilities.isReadOnlyView &&
      !isUncertainAck;

    const isIrreversible = !isManualCause || !windowStillOpen;

    let countdown: EventDeletionCountdownViewModel | null = null;
    if (isCancelable && req.cancelUntil) {
      const diffMs = Math.max(0, req.cancelUntil.getTime() - now.getTime());
      const totalMinutes = Math.floor(diffMs / 60_000);
      const remainingHours = Math.floor(totalMinutes / 60);
      const remainingMinutes = totalMinutes % 60;
      const localIso = formatUtcToLocalIso(req.cancelUntil, tz);
      countdown = {
        visible: true,
        exactDeadlineLocalIso: localIso,
        exactDeadlineUtcIso: req.cancelUntil.toISOString(),
        timezone: tz,
        remainingHours,
        remainingMinutes,
        summaryText: `Cancelable hasta ${localIso} (${tz}) — restan ${remainingHours}h ${remainingMinutes}m`,
        announceInLiveRegion: false,
      };
    }

    const mainPurgeLocal = formatUtcToLocalIso(req.mainPurgeDeadline, tz);
    const residualLocal = formatUtcToLocalIso(req.residualPurgeDeadline, tz);

    let mainPurgeStatusLabel: string;
    if (isUncertainAck) {
      mainPurgeStatusLabel = 'Verificando resultado (ACK pendiente en autoridad de recuperación)';
    } else if (req.mainPurgeStatus === 'MAIN_PURGED_VERIFIED' && req.mainPurgedAt) {
      const purgedLocal = formatUtcToLocalIso(req.mainPurgedAt, tz);
      mainPurgeStatusLabel = `Purga principal verificada el ${purgedLocal} (${tz})`;
    } else if (req.mainPurgeStatus === 'PARTIAL_OR_UNKNOWN' || req.mainPurgeStatus === 'DEAD_LETTER') {
      mainPurgeStatusLabel = `Purga principal en reintento/verificación pendiente (límite ${mainPurgeLocal} ${tz})`;
    } else {
      mainPurgeStatusLabel = `Purga principal programada (límite ${mainPurgeLocal} ${tz})`;
    }

    const residualRetentionNotice =
      req.residualPurgeStatus === 'RESIDUAL_VERIFIED'
        ? `Obligación residual en copias ordinarias verificada (límite +30 días UTC: ${residualLocal} ${tz}).`
        : `Retención residual pendiente de rotación ordinaria hasta ${residualLocal} (${tz}); los respaldos ordinarios no permiten reactivar contenido purgado.`;

    const availableActions: ('REQUEST_EVENT_DELETION' | 'CANCEL_EVENT_DELETION' | 'REFRESH_STATUS')[] = [
      'REFRESH_STATUS',
    ];
    if (isCancelable) {
      availableActions.unshift('CANCEL_EVENT_DELETION');
    }

    return {
      eventId: this.snapshot.eventId,
      eventStatus: this.snapshot.eventStatus,
      hasDeletionRequest: true,
      causeLabel: req.cause,
      isCancelable,
      isIrreversible,
      isUncertainAck,
      countdown,
      mainPurgeStatusLabel,
      residualRetentionNotice,
      availableActions,
      bannerMessage: this.errorMessage ?? this.statusMessage,
      retryAfterSeconds: this.retryAfterSeconds,
    };
  }

  private async handleMutationError(err: unknown, now: Date): Promise<void> {
    if (!this.snapshot) return;

    if (err instanceof UiApiError) {
      if (err.statusCode === 429) {
        this.retryAfterSeconds = err.retryAfterSeconds ?? 60;
        this.errorMessage = `Demasiados intentos. Espera ${this.retryAfterSeconds} segundos antes de volver a intentarlo.`;
        return;
      }

      if (err.statusCode === 401 || err.statusCode === 403) {
        this.errorMessage = 'Tu sesión o permisos cambiaron. Vuelve a autenticarte para consultar el estado.';
        return;
      }

      if (err.statusCode === 409 || err.statusCode === 503) {
        // Re-query server state before claiming cancellation or purge failed/succeeded
        this.statusMessage =
          'Verificando resultado: comprobando el estado actual en el servidor antes de reintentar.';
        try {
          this.snapshot = await this.apiPort.getEventDeletionSnapshot({
            eventId: this.snapshot.eventId,
            now,
          });
        } catch {
          // Keep existing snapshot if refresh also fails
        }
        this.errorMessage =
          err.statusCode === 409
            ? 'El estado o revisión del evento cambió en el servidor. Revisa las acciones vigentes.'
            : 'Verificando resultado: el servidor devolvió un estado incierto o temporalmente no disponible. No se asume cancelación ni purga completada.';

        this.telemetrySink?.recordUiEvent({
          eventName: 'DELETION_UI_CONFLICT_OR_UNCERTAIN',
          scopeType: 'EVENT',
          outcome: `${err.statusCode}:${err.code}`,
          timestamp: now,
        });
        return;
      }
    }

    // Network timeout or unknown error -> re-query and never assume optimistic completion
    this.statusMessage = 'Verificando resultado tras error de red…';
    try {
      this.snapshot = await this.apiPort.getEventDeletionSnapshot({
        eventId: this.snapshot.eventId,
        now,
      });
    } catch {
      // Ignore refresh error
    }
    this.errorMessage =
      'Verificando resultado: no se recibió confirmación definitiva. Comprueba el estado actual antes de repetir la operación.';
  }
}

// ----------------------------------------------------------------------------
// EL-TK-201: Account Deletion & Reauthentication UI Controller
// (ConfirmDialog + LoginForm.REAUTH_ACCOUNT + SecurityNotice + Restricted Session)
// ----------------------------------------------------------------------------

export type AccountReauthUiOperation = 'REQUEST_ACCOUNT_DELETION' | 'CANCEL_ACCOUNT_DELETION';

export type AccountDeletionFlowStage =
  | 'IDLE'
  | 'CONFIRM_CONSEQUENCES_DIALOG'
  | 'PREPARING_CHALLENGE'
  | 'AWAITING_PASSWORD_REAUTH'
  | 'VERIFYING_PASSWORD'
  | 'SUBMITTING_COMMAND'
  | 'VERIFYING_UNCERTAIN_RESULT'
  | 'RATE_LIMITED'
  | 'REVISION_CONFLICT_RECONFIRM_REQUIRED'
  | 'SESSION_LOST';

export interface AccountDeletionServerSnapshot {
  readonly accountId: string;
  readonly accountStatus: 'ACTIVE' | 'PENDING_DELETION' | 'DELETED';
  readonly currentRevision: bigint;
  readonly sessionMode: 'ORDINARY' | 'DELETION_MANAGEMENT_ONLY';
  readonly affectedEventsCount: number;
  readonly activeDeletionRequest: {
    readonly requestId: string;
    readonly status: DeletionRequestStatus;
    readonly anchorTimestamp: Date;
    readonly cancelUntil: Date;
    readonly purgeStartedAt: Date;
    readonly mainPurgeDeadline: Date;
    readonly residualPurgeDeadline: Date;
    readonly mainPurgeStatus: MainPurgeStatus;
    readonly residualPurgeStatus: ResidualPurgeStatus;
  } | null;
  readonly serverCapabilities: {
    readonly canRequestAccountDeletion: boolean;
    readonly canCancelAccountDeletion: boolean;
    readonly canAccessOrdinaryFeatures: boolean;
  };
}

export interface LoginFormReauthAccountViewModel {
  readonly variant: 'REAUTH_ACCOUNT';
  readonly visible: boolean;
  readonly operation: AccountReauthUiOperation;
  readonly passwordFieldLabel: 'Contraseña actual';
  readonly showEmailOrIdentityField: false;
  readonly purposeExplanation: string;
  readonly primaryCtaLabel: 'Solicitar eliminación de cuenta' | 'Cancelar eliminación de cuenta';
  readonly exitActionVisible: true;
  readonly submitDisabled: boolean;
  readonly fieldErrorMessage: string | null;
}

export interface AccountDeletionUiViewModel {
  readonly accountId: string;
  readonly accountStatus: 'ACTIVE' | 'PENDING_DELETION' | 'DELETED';
  readonly sessionMode: 'ORDINARY' | 'DELETION_MANAGEMENT_ONLY';
  readonly ordinaryNavigationVisible: boolean;
  readonly stage: AccountDeletionFlowStage;
  readonly surfaceContainer: DialogSurfaceContainer;
  readonly confirmDialog: {
    readonly open: boolean;
    readonly title: string;
    readonly consequences: readonly string[];
    readonly confirmed: boolean;
  };
  readonly reauthForm: LoginFormReauthAccountViewModel | null;
  readonly securityNotice: {
    readonly visible: boolean;
    readonly statusText: string;
    readonly cancelUntilUtcIso: string | null;
    readonly mainPurgeDeadlineUtcIso: string | null;
    readonly residualPurgeDeadlineUtcIso: string | null;
    readonly isUncertainAck: boolean;
    readonly availableActions: readonly ('REQUEST_ACCOUNT_DELETION' | 'CANCEL_ACCOUNT_DELETION' | 'REFRESH_ACCOUNT_STATUS')[];
  };
  readonly retryAfterSeconds: number | null;
  readonly bannerMessage: string | null;
  /** Security invariant: neither password nor reauthenticationEvidence ever appear in public view state */
  readonly hasTransientInMemoryProof: boolean;
}

export interface AccountDeletionReauthApiPort {
  getAccountDeletionSnapshot(params: {
    readonly accountId: string;
    readonly now: Date;
  }): Promise<AccountDeletionServerSnapshot>;

  beginAccountReauthentication(params: {
    readonly operation: AccountReauthUiOperation;
    readonly resourceType: 'ACCOUNT';
    readonly resourceId: string;
    readonly expectedRevision: bigint;
    readonly intentionHash: string;
    readonly requestId?: string;
    readonly now: Date;
  }): Promise<{
    readonly challengeId: string;
    readonly expiresAt: Date;
    readonly operation: AccountReauthUiOperation;
    readonly resourceId: string;
  }>;

  verifyAccountReauthentication(params: {
    readonly challengeId: string;
    readonly credential: string;
    readonly now: Date;
  }): Promise<{
    readonly evidence: string;
    readonly expiresAt: Date;
  }>;

  requestAccountDeletion(params: {
    readonly accountId: string;
    readonly confirmation: true;
    readonly expectedRevision: bigint;
    readonly reauthenticationEvidence: string;
    readonly idempotencyKey: string;
    readonly now: Date;
  }): Promise<AccountDeletionServerSnapshot>;

  cancelAccountDeletion(params: {
    readonly accountId: string;
    readonly requestId: string;
    readonly confirmation: true;
    readonly expectedRevision: bigint;
    readonly reauthenticationEvidence: string;
    readonly idempotencyKey: string;
    readonly now: Date;
  }): Promise<AccountDeletionServerSnapshot>;
}

interface TransientInMemoryChallenge {
  readonly challengeId: string;
  readonly operation: AccountReauthUiOperation;
  readonly resourceId: string;
  readonly expectedRevision: bigint;
  readonly requestId?: string;
  readonly intentionHash: string;
  readonly expiresAt: Date;
}

interface TransientInMemoryEvidence {
  readonly evidence: string;
  readonly operation: AccountReauthUiOperation;
  readonly resourceId: string;
  readonly expectedRevision: bigint;
  readonly requestId?: string;
  readonly intentionHash: string;
  readonly expiresAt: Date;
}

export class AccountDeletionUiController {
  private snapshot: AccountDeletionServerSnapshot | null = null;
  private viewport: ResponsiveViewportMode = 'DESKTOP';
  private stage: AccountDeletionFlowStage = 'IDLE';
  private activeOperation: AccountReauthUiOperation | null = null;
  private consequencesConfirmed = false;
  private inFlight = false;
  private pendingIdempotencyKey: string | null = null;
  private fieldErrorMessage: string | null = null;
  private bannerMessage: string | null = null;
  private retryAfterSeconds: number | null = null;

  // Strictly volatile in-memory state (never persisted to localStorage/sessionStorage or exposed)
  private transientChallenge: TransientInMemoryChallenge | null = null;
  private transientEvidence: TransientInMemoryEvidence | null = null;
  private transientCredentialBuffer: string | null = null;

  constructor(
    private readonly apiPort: AccountDeletionReauthApiPort,
    private readonly telemetrySink?: UiTelemetrySink
  ) {}

  setViewport(viewport: ResponsiveViewportMode): void {
    this.viewport = viewport;
  }

  async loadAccountSnapshot(accountId: string, now = new Date()): Promise<AccountDeletionUiViewModel> {
    this.snapshot = await this.apiPort.getAccountDeletionSnapshot({ accountId, now });
    return this.buildViewModel();
  }

  openConfirmDialog(operation: AccountReauthUiOperation, now = new Date()): AccountDeletionUiViewModel {
    if (!this.snapshot) {
      throw new Error('Account snapshot not loaded');
    }
    if (
      operation === 'REQUEST_ACCOUNT_DELETION' &&
      !this.snapshot.serverCapabilities.canRequestAccountDeletion
    ) {
      throw new Error('Server capabilities do not permit REQUEST_ACCOUNT_DELETION');
    }
    if (
      operation === 'CANCEL_ACCOUNT_DELETION' &&
      !this.snapshot.serverCapabilities.canCancelAccountDeletion
    ) {
      throw new Error('Server capabilities do not permit CANCEL_ACCOUNT_DELETION');
    }

    this.wipeTransientSecrets();
    this.activeOperation = operation;
    this.consequencesConfirmed = false;
    this.fieldErrorMessage = null;
    this.bannerMessage = null;
    this.retryAfterSeconds = null;
    this.stage = 'CONFIRM_CONSEQUENCES_DIALOG';

    this.telemetrySink?.recordUiEvent({
      eventName: 'ACCOUNT_DELETE_CONFIRM_OPENED',
      scopeType: 'ACCOUNT',
      outcome: operation,
      timestamp: now,
    });

    return this.buildViewModel();
  }

  async confirmConsequencesAndBeginChallenge(now = new Date()): Promise<AccountDeletionUiViewModel> {
    if (!this.snapshot || !this.activeOperation) {
      throw new Error('No active account deletion operation');
    }
    if (this.inFlight) {
      return this.buildViewModel();
    }

    this.consequencesConfirmed = true;
    this.inFlight = true;
    this.stage = 'PREPARING_CHALLENGE';
    this.fieldErrorMessage = null;
    this.bannerMessage = null;

    const requestId =
      this.activeOperation === 'CANCEL_ACCOUNT_DELETION'
        ? this.snapshot.activeDeletionRequest?.requestId
        : undefined;

    const intentionHash = computeCanonicalAccountDeletionIntentionHash({
      operation: this.activeOperation,
      accountId: this.snapshot.accountId,
      requestId,
      expectedRevision: this.snapshot.currentRevision,
      confirmation: true,
    });

    try {
      const challengeRes = await this.apiPort.beginAccountReauthentication({
        operation: this.activeOperation,
        resourceType: 'ACCOUNT',
        resourceId: this.snapshot.accountId,
        expectedRevision: this.snapshot.currentRevision,
        intentionHash,
        requestId,
        now,
      });

      this.transientChallenge = {
        challengeId: challengeRes.challengeId,
        operation: this.activeOperation,
        resourceId: this.snapshot.accountId,
        expectedRevision: this.snapshot.currentRevision,
        requestId,
        intentionHash,
        expiresAt: new Date(challengeRes.expiresAt),
      };
      this.stage = 'AWAITING_PASSWORD_REAUTH';

      this.telemetrySink?.recordUiEvent({
        eventName: 'ACCOUNT_REAUTH_CHALLENGE_STARTED',
        scopeType: 'ACCOUNT',
        outcome: this.activeOperation,
        timestamp: now,
      });
    } catch (err) {
      await this.handleAccountError(err, now);
    } finally {
      this.inFlight = false;
    }

    return this.buildViewModel();
  }

  /**
   * Verifies current password via LoginForm.REAUTH_ACCOUNT and immediately executes
   * the confirmed command (requestAccountDeletion or cancelAccountDeletion), wiping
   * the password buffer in all paths.
   */
  async verifyPasswordAndSubmitCommand(params: {
    readonly currentPassword: string;
    readonly idempotencyKey: string;
    readonly now?: Date;
  }): Promise<AccountDeletionUiViewModel> {
    const now = params.now ?? new Date();
    if (!this.snapshot || !this.activeOperation) {
      throw new Error('No active account operation');
    }
    if (this.inFlight) {
      return this.buildViewModel();
    }

    // Store transiently and guarantee wipe in finally
    this.transientCredentialBuffer = params.currentPassword;
    const effectiveKey = this.pendingIdempotencyKey ?? params.idempotencyKey;
    this.pendingIdempotencyKey = effectiveKey;

    try {
      if (!this.transientCredentialBuffer || !this.transientCredentialBuffer.trim()) {
        this.fieldErrorMessage = 'Introduce tu contraseña actual para continuar.';
        return this.buildViewModel();
      }

      if (
        !this.transientChallenge ||
        now.getTime() >= this.transientChallenge.expiresAt.getTime() ||
        this.transientChallenge.operation !== this.activeOperation ||
        this.transientChallenge.expectedRevision !== this.snapshot.currentRevision
      ) {
        this.wipeTransientSecrets();
        this.stage = 'CONFIRM_CONSEQUENCES_DIALOG';
        this.bannerMessage =
          'La verificación temporal expiró o el estado cambió. Solicita un nuevo desafío de reautenticación.';
        return this.buildViewModel();
      }

      this.inFlight = true;
      this.stage = 'VERIFYING_PASSWORD';
      this.fieldErrorMessage = null;

      const verifyRes = await this.apiPort.verifyAccountReauthentication({
        challengeId: this.transientChallenge.challengeId,
        credential: this.transientCredentialBuffer,
        now,
      });

      // Immediately wipe raw password buffer as soon as verification completes!
      this.transientCredentialBuffer = null;

      this.transientEvidence = {
        evidence: verifyRes.evidence,
        operation: this.transientChallenge.operation,
        resourceId: this.transientChallenge.resourceId,
        expectedRevision: this.transientChallenge.expectedRevision,
        requestId: this.transientChallenge.requestId,
        intentionHash: this.transientChallenge.intentionHash,
        expiresAt: new Date(verifyRes.expiresAt),
      };
      // Challenge is single-use
      this.transientChallenge = null;

      this.telemetrySink?.recordUiEvent({
        eventName: 'ACCOUNT_REAUTH_VERIFIED',
        scopeType: 'ACCOUNT',
        outcome: this.activeOperation,
        timestamp: now,
      });

      // Check evidence expiry before submitting command (<= 5 min)
      if (now.getTime() >= this.transientEvidence.expiresAt.getTime()) {
        this.wipeTransientSecrets();
        this.stage = 'CONFIRM_CONSEQUENCES_DIALOG';
        this.bannerMessage = 'La prueba de reautenticación venció antes de enviar el comando. Inicia un nuevo desafío.';
        return this.buildViewModel();
      }

      this.stage = 'SUBMITTING_COMMAND';
      const evidenceToConsume = this.transientEvidence.evidence;
      const expectedRev = this.transientEvidence.expectedRevision;
      const reqId = this.transientEvidence.requestId;

      // Consume one-use evidence in the command
      this.transientEvidence = null;

      if (this.activeOperation === 'REQUEST_ACCOUNT_DELETION') {
        this.snapshot = await this.apiPort.requestAccountDeletion({
          accountId: this.snapshot.accountId,
          confirmation: true,
          expectedRevision: expectedRev,
          reauthenticationEvidence: evidenceToConsume,
          idempotencyKey: effectiveKey,
          now,
        });
      } else {
        if (!reqId) {
          throw new Error('requestId is required for CANCEL_ACCOUNT_DELETION');
        }
        this.snapshot = await this.apiPort.cancelAccountDeletion({
          accountId: this.snapshot.accountId,
          requestId: reqId,
          confirmation: true,
          expectedRevision: expectedRev,
          reauthenticationEvidence: evidenceToConsume,
          idempotencyKey: effectiveKey,
          now,
        });
      }

      this.pendingIdempotencyKey = null;
      const reqStatus = this.snapshot.activeDeletionRequest?.status;
      if (reqStatus === 'UNKNOWN' || reqStatus === 'PREPARED') {
        this.stage = 'VERIFYING_UNCERTAIN_RESULT';
        this.bannerMessage =
          'Verificando resultado: la operación está pendiente de confirmación definitiva del servidor.';
      } else {
        this.stage = 'IDLE';
        this.activeOperation = null;
        this.consequencesConfirmed = false;
        this.bannerMessage =
          this.snapshot.accountStatus === 'PENDING_DELETION'
            ? 'Solicitud de eliminación de cuenta confirmada. Tus eventos quedaron bloqueados y dispones de 7 días calendario UTC para cancelar.'
            : 'Cancelación de eliminación de cuenta confirmada por el servidor.';
      }

      this.telemetrySink?.recordUiEvent({
        eventName: 'ACCOUNT_DELETE_COMMAND_SUBMITTED',
        scopeType: 'ACCOUNT',
        outcome: this.snapshot.accountStatus,
        timestamp: now,
      });
    } catch (err) {
      await this.handleAccountError(err, now);
    } finally {
      this.transientCredentialBuffer = null;
      this.inFlight = false;
    }

    return this.buildViewModel();
  }

  closeModalOrLogout(): AccountDeletionUiViewModel {
    this.wipeTransientSecrets();
    this.stage = 'IDLE';
    this.activeOperation = null;
    this.consequencesConfirmed = false;
    this.fieldErrorMessage = null;
    return this.buildViewModel();
  }

  getDebugSecretLeakCheck(): {
    readonly hasRawPasswordInMemory: boolean;
    readonly hasEvidenceInMemory: boolean;
    readonly hasChallengeInMemory: boolean;
  } {
    return {
      hasRawPasswordInMemory: this.transientCredentialBuffer !== null,
      hasEvidenceInMemory: this.transientEvidence !== null,
      hasChallengeInMemory: this.transientChallenge !== null,
    };
  }

  buildViewModel(): AccountDeletionUiViewModel {
    if (!this.snapshot) {
      throw new Error('Account snapshot not loaded');
    }

    const surfaceContainer: DialogSurfaceContainer =
      this.viewport === 'MOBILE' ? 'BOTTOM_SHEET' : 'MODAL';
    const req = this.snapshot.activeDeletionRequest;
    const isUncertainAck = req?.status === 'UNKNOWN' || req?.status === 'PREPARED';

    // Escenario 2: In restricted session (DELETION_MANAGEMENT_ONLY), ordinary features are NEVER visible
    const ordinaryNavigationVisible =
      this.snapshot.sessionMode === 'ORDINARY' &&
      this.snapshot.accountStatus === 'ACTIVE' &&
      this.snapshot.serverCapabilities.canAccessOrdinaryFeatures;

    const availableActions: ('REQUEST_ACCOUNT_DELETION' | 'CANCEL_ACCOUNT_DELETION' | 'REFRESH_ACCOUNT_STATUS')[] = [
      'REFRESH_ACCOUNT_STATUS',
    ];
    if (this.snapshot.serverCapabilities.canRequestAccountDeletion && !isUncertainAck) {
      availableActions.unshift('REQUEST_ACCOUNT_DELETION');
    }
    if (this.snapshot.serverCapabilities.canCancelAccountDeletion && !isUncertainAck) {
      availableActions.unshift('CANCEL_ACCOUNT_DELETION');
    }

    const showReauthForm =
      this.stage === 'AWAITING_PASSWORD_REAUTH' || this.stage === 'VERIFYING_PASSWORD';

    const reauthForm: LoginFormReauthAccountViewModel | null =
      showReauthForm && this.activeOperation
        ? {
            variant: 'REAUTH_ACCOUNT',
            visible: true,
            operation: this.activeOperation,
            passwordFieldLabel: 'Contraseña actual',
            showEmailOrIdentityField: false,
            purposeExplanation:
              this.activeOperation === 'REQUEST_ACCOUNT_DELETION'
                ? 'Confirma tu contraseña actual para autorizar la solicitud de eliminación de tu cuenta y el bloqueo inmediato de todos tus eventos.'
                : 'Confirma tu contraseña actual para autorizar la cancelación de la eliminación pendiente de tu cuenta.',
            primaryCtaLabel:
              this.activeOperation === 'REQUEST_ACCOUNT_DELETION'
                ? 'Solicitar eliminación de cuenta'
                : 'Cancelar eliminación de cuenta',
            exitActionVisible: true,
            submitDisabled: this.inFlight,
            fieldErrorMessage: this.fieldErrorMessage,
          }
        : null;

    return {
      accountId: this.snapshot.accountId,
      accountStatus: this.snapshot.accountStatus,
      sessionMode: this.snapshot.sessionMode,
      ordinaryNavigationVisible,
      stage: this.stage,
      surfaceContainer,
      confirmDialog: {
        open:
          this.stage === 'CONFIRM_CONSEQUENCES_DIALOG' ||
          this.stage === 'REVISION_CONFLICT_RECONFIRM_REQUIRED',
        title:
          this.activeOperation === 'CANCEL_ACCOUNT_DELETION'
            ? 'Cancelar eliminación de cuenta'
            : 'Eliminar cuenta de organizador',
        consequences:
          this.activeOperation === 'CANCEL_ACCOUNT_DELETION'
            ? [
                `Cuenta: ${this.snapshot.accountId} (revisión ${this.snapshot.currentRevision.toString()}).`,
                'Al cancelar dentro de la ventana de 7 días UTC, se levantará la barrera de cuenta tras confirmación de la autoridad y cada evento recalculará su estado fiel según su calendario.',
              ]
            : [
                `Se bloquearán inmediatamente todos tus eventos (${this.snapshot.affectedEventsCount} eventos asociados).`,
                'Dispondrás de una ventana cancelable de 7 días calendario UTC antes del inicio de la purga física.',
                'Durante los 7 días sólo podrás iniciar sesión en modo restringido para consultar o cancelar la eliminación.',
              ],
        confirmed: this.consequencesConfirmed,
      },
      reauthForm,
      securityNotice: {
        visible: true,
        statusText: isUncertainAck
          ? 'Verificando resultado: estado pendiente de confirmación de autoridad.'
          : this.snapshot.accountStatus === 'PENDING_DELETION'
            ? 'Cuenta pendiente de eliminación (acceso restringido exclusivamente a gestión de eliminación).'
            : 'Cuenta activa.',
        cancelUntilUtcIso: req?.cancelUntil ? req.cancelUntil.toISOString() : null,
        mainPurgeDeadlineUtcIso: req?.mainPurgeDeadline ? req.mainPurgeDeadline.toISOString() : null,
        residualPurgeDeadlineUtcIso: req?.residualPurgeDeadline
          ? req.residualPurgeDeadline.toISOString()
          : null,
        isUncertainAck: Boolean(isUncertainAck),
        availableActions,
      },
      retryAfterSeconds: this.retryAfterSeconds,
      bannerMessage: this.bannerMessage,
      hasTransientInMemoryProof: this.transientEvidence !== null,
    };
  }

  private wipeTransientSecrets(): void {
    this.transientCredentialBuffer = null;
    this.transientChallenge = null;
    this.transientEvidence = null;
  }

  private async handleAccountError(err: unknown, now: Date): Promise<void> {
    // Always wipe raw password and any single-use proof on error
    this.transientCredentialBuffer = null;
    this.transientEvidence = null;

    if (!this.snapshot) return;

    if (err instanceof UiApiError) {
      if (err.statusCode === 400 || err.code === 'INVALID_CREDENTIALS') {
        this.stage = 'AWAITING_PASSWORD_REAUTH';
        this.fieldErrorMessage =
          'No se pudo verificar la contraseña actual. Comprueba el dato e inténtalo de nuevo.';
        return;
      }

      if (err.statusCode === 429) {
        this.wipeTransientSecrets();
        this.stage = 'RATE_LIMITED';
        this.retryAfterSeconds = err.retryAfterSeconds ?? 60;
        this.bannerMessage = `Límite de intentos alcanzado. Espera ${this.retryAfterSeconds} segundos antes de solicitar una nueva verificación.`;
        return;
      }

      if (err.statusCode === 401) {
        this.wipeTransientSecrets();
        this.stage = 'SESSION_LOST';
        this.bannerMessage = 'Tu sesión expiró o fue revocada. Inicia sesión nuevamente.';
        return;
      }

      if (err.statusCode === 409) {
        // Revision changed or proof expired/incompatible -> refresh snapshot before issuing a new challenge
        this.wipeTransientSecrets();
        try {
          this.snapshot = await this.apiPort.getAccountDeletionSnapshot({
            accountId: this.snapshot.accountId,
            now,
          });
        } catch {
          // ignore
        }
        this.consequencesConfirmed = false;
        this.stage = 'REVISION_CONFLICT_RECONFIRM_REQUIRED';
        this.bannerMessage =
          'El estado o la revisión de la cuenta cambió. Revisa el resumen actualizado y vuelve a confirmar para iniciar un nuevo desafío.';
        this.telemetrySink?.recordUiEvent({
          eventName: 'DELETION_UI_CONFLICT_OR_UNCERTAIN',
          scopeType: 'ACCOUNT',
          outcome: `409:${err.code}`,
          timestamp: now,
        });
        return;
      }

      if (err.statusCode === 503) {
        // Uncertain ACK / dependency unavailable -> query result first, never claim optimistic success/failure
        this.wipeTransientSecrets();
        this.stage = 'VERIFYING_UNCERTAIN_RESULT';
        try {
          this.snapshot = await this.apiPort.getAccountDeletionSnapshot({
            accountId: this.snapshot.accountId,
            now,
          });
        } catch {
          // ignore
        }
        this.bannerMessage =
          'Verificando resultado: no se recibió confirmación definitiva del servidor. Se consultó el estado actual antes de permitir un nuevo desafío.';
        this.telemetrySink?.recordUiEvent({
          eventName: 'DELETION_UI_CONFLICT_OR_UNCERTAIN',
          scopeType: 'ACCOUNT',
          outcome: `503:${err.code}`,
          timestamp: now,
        });
        return;
      }
    }

    // Timeout / unknown network error -> query current state before allowing a new challenge
    this.wipeTransientSecrets();
    this.stage = 'VERIFYING_UNCERTAIN_RESULT';
    try {
      this.snapshot = await this.apiPort.getAccountDeletionSnapshot({
        accountId: this.snapshot.accountId,
        now,
      });
    } catch {
      // ignore
    }
    this.bannerMessage =
      'Verificando resultado tras fallo de comunicación: comprueba el estado actual antes de iniciar un nuevo desafío.';
  }
}
