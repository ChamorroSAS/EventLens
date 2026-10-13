import { Component, EventEmitter, InjectionToken, Input, Output, inject, signal } from '@angular/core';

export interface EventDeletionUiAdapter {
  getEventState(eventId: string): Promise<{
    eventId: string;
    eventName: string;
    eventTimezone: string;
    status: string;
    revision: number;
    canRequestDeletion: boolean;
    canCancelDeletion: boolean;
    isIrreversible: boolean;
    isUncertainAck: boolean;
    cancelUntilLocalIso: string;
    countdownSummary: string | null;
    mainPurgeSummary: string;
    residualRetentionNotice: string;
  } | {
    eventId: string;
    eventName: string;
    eventTimezone: string;
    status: string;
    revision: number;
    canRequestDeletion: boolean;
    canCancelDeletion: boolean;
    isIrreversible: boolean;
    isUncertainAck: boolean;
    cancelUntilLocalIso: string | null;
    countdownSummary: string | null;
    mainPurgeSummary: string;
    residualRetentionNotice: string;
  }>;
  requestEventDeletion(params: {
    eventId: string;
    confirmation: true;
    expectedRevision: number;
    idempotencyKey: string;
  }): Promise<{
    status: 'CONFIRMED' | 'UNKNOWN';
    cancelUntilLocalIso: string | null;
    countdownSummary: string | null;
    message: string;
  }>;
  cancelEventDeletion(params: {
    eventId: string;
    confirmation: true;
    expectedRevision: number;
    idempotencyKey: string;
  }): Promise<{
    eventStatus: string;
    status: 'CANCELLED' | 'UNKNOWN';
    message: string;
  }>;
}

export interface AccountDeletionUiAdapter {
  getAccountState(accountId: string): Promise<{
    accountId: string;
    accountStatus: 'ACTIVE' | 'PENDING_DELETION' | 'DELETED';
    sessionMode: 'ORDINARY' | 'DELETION_MANAGEMENT_ONLY';
    revision: number;
    affectedEventsCount: number;
    canRequestDeletion: boolean;
    canCancelDeletion: boolean;
    cancelUntilUtcIso: string | null;
    isUncertainAck: boolean;
    isIrreversible?: boolean;
  }>;
  beginReauthChallenge(params: {
    operation: 'REQUEST_ACCOUNT_DELETION' | 'CANCEL_ACCOUNT_DELETION';
    accountId: string;
    expectedRevision: number;
  }): Promise<{
    challengeId: string;
    expiresAtIso: string;
  }>;
  verifyReauthAndExecute(params: {
    challengeId: string;
    currentPassword: string;
    operation: 'REQUEST_ACCOUNT_DELETION' | 'CANCEL_ACCOUNT_DELETION';
    accountId: string;
    expectedRevision: number;
    idempotencyKey: string;
  }): Promise<{
    accountStatus: 'ACTIVE' | 'PENDING_DELETION' | 'DELETED';
    status: 'CONFIRMED' | 'CANCELLED' | 'UNKNOWN';
    cancelUntilUtcIso: string | null;
    message: string;
  }>;
}

export const EVENT_DELETION_UI_ADAPTER = new InjectionToken<EventDeletionUiAdapter>(
  'EVENT_DELETION_UI_ADAPTER'
);
export const ACCOUNT_DELETION_UI_ADAPTER = new InjectionToken<AccountDeletionUiAdapter>(
  'ACCOUNT_DELETION_UI_ADAPTER'
);

@Component({
  selector: 'eventlens-deletion-management',
  standalone: true,
  template: `
    @if (mode !== 'ACCOUNT_ONLY') {
    <section aria-labelledby="event-lifecycle-heading" data-testid="event-lifecycle-panel">
      <h2 id="event-lifecycle-heading">Ciclo de vida y retención del evento</h2>
      <p data-testid="event-status-badge">Estado: {{ eventStatus() }}</p>
      <p data-testid="main-purge-summary">{{ mainPurgeSummary() }}</p>
      <p data-testid="retention-notice">{{ residualRetentionNotice() }}</p>

      @if (countdownSummary() && !isIrreversible()) {
        <div data-testid="event-deletion-countdown">
          <span>{{ countdownSummary() }}</span>
          <time [attr.datetime]="cancelUntilLocalIso()">{{ cancelUntilLocalIso() }}</time>
        </div>
      }

      @if (canRequestEventDeletion()) {
        <button
          id="open-event-delete-btn"
          type="button"
          data-testid="open-event-delete-dialog-btn"
          (click)="openEventDeleteDialog()"
        >
          Eliminar evento
        </button>
      }

      @if (canCancelEventDeletion() && !isIrreversible() && !isUncertainAck()) {
        <button
          type="button"
          data-testid="cancel-event-deletion-btn"
          [disabled]="inFlight()"
          (click)="submitCancelEventDeletion()"
        >
          Cancelar eliminación de evento
        </button>
      }

      @if (eventDeleteDialogOpen()) {
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="event-delete-dialog-title"
          aria-describedby="event-delete-dialog-desc"
          data-testid="event-delete-request-dialog"
          (keydown.escape)="closeEventDeleteDialog()"
        >
          <h3 id="event-delete-dialog-title" tabindex="-1">
            Solicitar eliminación del evento «{{ eventName() }}»
          </h3>
          <div id="event-delete-dialog-desc">
            <p>Recurso: {{ eventName() }} ({{ eventId() }})</p>
            <p>Consecuencias: bloqueo inmediato del acceso público, subidas y exportaciones.</p>
            <p>Ventana cancelable de 72 horas antes del inicio de la purga física (+7 días UTC principal / +30 días UTC residual).</p>
          </div>
          <label>
            <input
              type="checkbox"
              data-testid="event-delete-confirm-checkbox"
              [checked]="eventConfirmChecked()"
              (change)="toggleEventConfirm($event)"
            />
            Comprendo que el acceso se bloqueará de inmediato y deseo programar la eliminación.
          </label>
          <div>
            <button
              type="button"
              data-testid="confirm-event-delete-btn"
              [disabled]="!eventConfirmChecked() || inFlight()"
              (click)="submitRequestEventDeletion()"
            >
              Confirmar solicitud de eliminación
            </button>
            <button
              type="button"
              data-testid="close-event-delete-dialog-btn"
              (click)="closeEventDeleteDialog()"
            >
              Salir sin eliminar
            </button>
          </div>
        </div>
      }
    </section>
    }

    <section aria-labelledby="account-security-heading" data-testid="account-security-section">
      <h2 id="account-security-heading">Seguridad y eliminación de cuenta</h2>

      @if (ordinaryFeaturesVisible()) {
        @if (mode !== 'ACCOUNT_ONLY') {
          <nav aria-label="Funciones ordinarias de organizador" data-testid="ordinary-organizer-nav">
            <span>Mis eventos y galería activa</span>
          </nav>
        }
      } @else {
        <p data-testid="restricted-session-notice">
          Sesión restringida: sólo puedes consultar o cancelar la eliminación pendiente de tu cuenta.
        </p>
      }

      <div data-testid="security-notice">
        <p>Estado de cuenta: {{ accountStatus() }}</p>
        @if (accountCancelUntilUtcIso()) {
          <p data-testid="account-cancel-until">Cancelable hasta: {{ accountCancelUntilUtcIso() }}</p>
        }
      </div>

      @if (canRequestAccountDeletion()) {
        <button
          type="button"
          data-testid="start-account-delete-btn"
          (click)="openAccountConfirm('REQUEST_ACCOUNT_DELETION')"
        >
          Solicitar eliminación de cuenta
        </button>
      }

      @if (canCancelAccountDeletion()) {
        <button
          type="button"
          data-testid="start-account-cancel-btn"
          (click)="openAccountConfirm('CANCEL_ACCOUNT_DELETION')"
        >
          Cancelar eliminación de cuenta
        </button>
      }

      @if (accountConfirmDialogOpen()) {
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-confirm-title"
          data-testid="account-confirm-dialog"
        >
          <h3 id="account-confirm-title">
            {{ accountOperation() === 'CANCEL_ACCOUNT_DELETION' ? 'Confirmar cancelación de cuenta' : 'Confirmar eliminación de cuenta' }}
          </h3>
          <p>
            {{ accountOperation() === 'CANCEL_ACCOUNT_DELETION'
              ? 'Se levantará la barrera de cuenta tras confirmación del servidor y cada evento recalculará su estado según su calendario.'
              : 'Se bloquearán todos tus eventos de inmediato y tendrás 7 días calendario UTC para cancelar en sesión restringida.' }}
          </p>
          <button
            type="button"
            data-testid="proceed-to-reauth-btn"
            [disabled]="inFlight()"
            (click)="proceedToReauthChallenge()"
          >
            Continuar a verificación de contraseña
          </button>
          <button
            type="button"
            data-testid="cancel-account-flow-btn"
            (click)="closeAccountFlow()"
          >
            Salir
          </button>
        </div>
      }

      @if (reauthFormVisible()) {
        <form
          data-testid="login-form-reauth-account"
          (submit)="$event.preventDefault(); submitReauthPassword()"
        >
          <p data-testid="reauth-purpose">
            Verifica tu identidad con tu contraseña vigente para confirmar la operación sensible de cuenta.
          </p>
          <label for="reauth-current-password">Contraseña actual</label>
          <input
            id="reauth-current-password"
            type="password"
            autocomplete="current-password"
            data-testid="reauth-password-input"
            [value]="transientPasswordInput()"
            (input)="updatePasswordInput($event)"
            [attr.aria-invalid]="reauthError() ? 'true' : 'false'"
            aria-describedby="reauth-field-error"
          />
          @if (reauthError()) {
            <p id="reauth-field-error" role="alert" data-testid="reauth-field-error">
              {{ reauthError() }}
            </p>
          }
          <button
            type="submit"
            data-testid="reauth-submit-cta"
            [disabled]="inFlight()"
          >
            {{ accountOperation() === 'CANCEL_ACCOUNT_DELETION' ? 'Cancelar eliminación de cuenta' : 'Solicitar eliminación de cuenta' }}
          </button>
          <button
            type="button"
            data-testid="reauth-exit-btn"
            (click)="closeAccountFlow()"
          >
            Salir
          </button>
        </form>
      }
    </section>

    <p role="status" aria-live="polite" aria-atomic="true" data-testid="polite-status-region">
      {{ statusAnnouncement() }}
    </p>
  `,
})
export class DeletionManagementComponent {
  @Input() mode: 'FULL' | 'ACCOUNT_ONLY' = 'FULL';
  @Input() set accountSnapshot(
    snap:
      | {
          accountId: string;
          accountStatus: 'ACTIVE' | 'PENDING_DELETION' | 'DELETED';
          sessionMode: 'ORDINARY' | 'DELETION_MANAGEMENT_ONLY';
          revision: number;
          affectedEventsCount: number;
          canRequestDeletion: boolean;
          canCancelDeletion: boolean;
          cancelUntilUtcIso: string | null;
          isUncertainAck: boolean;
          isIrreversible?: boolean;
        }
      | null
      | undefined
  ) {
    if (snap) {
      this.applyAccountSnapshot(snap);
    }
  }
  @Output() accountStateChanged = new EventEmitter<'ACTIVE' | 'PENDING_DELETION' | 'DELETED'>();

  private readonly eventAdapter = inject(EVENT_DELETION_UI_ADAPTER, { optional: true });
  private readonly accountAdapter = inject(ACCOUNT_DELETION_UI_ADAPTER, { optional: true });

  readonly eventId = signal('evt-1');
  readonly eventName = signal('Evento Demo');
  readonly eventStatus = signal('CLOSED');
  readonly eventRevision = signal(1);
  readonly canRequestEventDeletion = signal(true);
  readonly canCancelEventDeletion = signal(false);
  readonly isIrreversible = signal(false);
  readonly isUncertainAck = signal(false);
  readonly cancelUntilLocalIso = signal<string | null>(null);
  readonly countdownSummary = signal<string | null>(null);
  readonly mainPurgeSummary = signal('Sin purga activa');
  readonly residualRetentionNotice = signal(
    'Purga principal en hasta +7 días UTC y rotación de copias ordinarias en hasta +30 días UTC.'
  );

  readonly eventDeleteDialogOpen = signal(false);
  readonly eventConfirmChecked = signal(false);
  readonly inFlight = signal(false);

  readonly accountId = signal('acc-1');
  readonly accountStatus = signal<'ACTIVE' | 'PENDING_DELETION' | 'DELETED'>('ACTIVE');
  readonly sessionMode = signal<'ORDINARY' | 'DELETION_MANAGEMENT_ONLY'>('ORDINARY');
  readonly accountRevision = signal(1);
  readonly canRequestAccountDeletion = signal(true);
  readonly canCancelAccountDeletion = signal(false);
  readonly accountCancelUntilUtcIso = signal<string | null>(null);

  readonly accountConfirmDialogOpen = signal(false);
  readonly reauthFormVisible = signal(false);
  readonly accountOperation = signal<'REQUEST_ACCOUNT_DELETION' | 'CANCEL_ACCOUNT_DELETION' | null>(null);
  readonly transientPasswordInput = signal('');
  readonly reauthError = signal<string | null>(null);
  readonly statusAnnouncement = signal('');

  private activeChallengeId: string | null = null;
  private activeChallengeExpiresAtMs = 0;

  ordinaryFeaturesVisible(): boolean {
    return this.sessionMode() === 'ORDINARY' && this.accountStatus() === 'ACTIVE';
  }

  async loadEvent(eventId: string): Promise<void> {
    if (!this.eventAdapter) return;
    const snap = await this.eventAdapter.getEventState(eventId);
    this.eventId.set(snap.eventId);
    this.eventName.set(snap.eventName);
    this.eventStatus.set(snap.status);
    this.eventRevision.set(snap.revision);
    this.canRequestEventDeletion.set(snap.canRequestDeletion);
    this.canCancelEventDeletion.set(snap.canCancelDeletion);
    this.isIrreversible.set(snap.isIrreversible);
    this.isUncertainAck.set(snap.isUncertainAck);
    this.cancelUntilLocalIso.set(snap.cancelUntilLocalIso);
    this.countdownSummary.set(snap.countdownSummary);
    this.mainPurgeSummary.set(snap.mainPurgeSummary);
    this.residualRetentionNotice.set(snap.residualRetentionNotice);
  }

  async loadAccount(accountId: string): Promise<void> {
    if (!this.accountAdapter) return;
    const snap = await this.accountAdapter.getAccountState(accountId);
    this.applyAccountSnapshot(snap);
  }

  applyAccountSnapshot(snap: {
    accountId: string;
    accountStatus: 'ACTIVE' | 'PENDING_DELETION' | 'DELETED';
    sessionMode: 'ORDINARY' | 'DELETION_MANAGEMENT_ONLY';
    revision: number;
    affectedEventsCount: number;
    canRequestDeletion: boolean;
    canCancelDeletion: boolean;
    cancelUntilUtcIso: string | null;
    isUncertainAck: boolean;
    isIrreversible?: boolean;
  }): void {
    this.accountId.set(snap.accountId);
    this.accountStatus.set(snap.accountStatus);
    this.sessionMode.set(snap.sessionMode);
    this.accountRevision.set(snap.revision);
    this.canRequestAccountDeletion.set(snap.canRequestDeletion);
    this.canCancelAccountDeletion.set(snap.canCancelDeletion);
    this.accountCancelUntilUtcIso.set(snap.cancelUntilUtcIso);
  }

  openEventDeleteDialog(): void {
    this.eventDeleteDialogOpen.set(true);
    this.eventConfirmChecked.set(false);
    this.statusAnnouncement.set(`Diálogo de eliminación abierto para ${this.eventName()}`);
  }

  closeEventDeleteDialog(): void {
    this.eventDeleteDialogOpen.set(false);
    this.eventConfirmChecked.set(false);
    this.statusAnnouncement.set('Diálogo de eliminación cerrado.');
  }

  toggleEventConfirm(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.eventConfirmChecked.set(Boolean(target?.checked));
  }

  async submitRequestEventDeletion(): Promise<void> {
    if (!this.eventAdapter || !this.eventConfirmChecked() || this.inFlight()) return;
    this.inFlight.set(true);
    try {
      const res = await this.eventAdapter.requestEventDeletion({
        eventId: this.eventId(),
        confirmation: true,
        expectedRevision: this.eventRevision(),
        idempotencyKey: `ui-evt-del-${this.eventId()}-${this.eventRevision()}`,
      });
      this.eventDeleteDialogOpen.set(false);
      this.eventConfirmChecked.set(false);
      if (res.status === 'UNKNOWN') {
        this.isUncertainAck.set(true);
        this.statusAnnouncement.set('Verificando resultado: estado pendiente de confirmación.');
      } else {
        this.eventStatus.set('PENDING_DELETION');
        this.canRequestEventDeletion.set(false);
        this.canCancelEventDeletion.set(true);
        this.cancelUntilLocalIso.set(res.cancelUntilLocalIso);
        this.countdownSummary.set(res.countdownSummary);
        this.statusAnnouncement.set(res.message);
      }
    } catch {
      this.statusAnnouncement.set(
        'Verificando resultado: no se asume eliminación ni cancelación sin confirmación del servidor.'
      );
      await this.loadEvent(this.eventId());
    } finally {
      this.inFlight.set(false);
    }
  }

  async submitCancelEventDeletion(): Promise<void> {
    if (!this.eventAdapter || this.inFlight()) return;
    this.inFlight.set(true);
    try {
      const res = await this.eventAdapter.cancelEventDeletion({
        eventId: this.eventId(),
        confirmation: true,
        expectedRevision: this.eventRevision(),
        idempotencyKey: `ui-evt-cancel-${this.eventId()}-${this.eventRevision()}`,
      });
      if (res.status === 'UNKNOWN') {
        this.isUncertainAck.set(true);
        this.statusAnnouncement.set('Verificando resultado: la cancelación aún no fue confirmada.');
      } else {
        this.eventStatus.set(res.eventStatus);
        this.canCancelEventDeletion.set(false);
        this.canRequestEventDeletion.set(true);
        this.countdownSummary.set(null);
        this.cancelUntilLocalIso.set(null);
        this.statusAnnouncement.set(res.message);
      }
    } catch {
      this.statusAnnouncement.set(
        'Verificando resultado: consultando el estado vigente del servidor antes de reintentar.'
      );
      await this.loadEvent(this.eventId());
    } finally {
      this.inFlight.set(false);
    }
  }

  openAccountConfirm(op: 'REQUEST_ACCOUNT_DELETION' | 'CANCEL_ACCOUNT_DELETION'): void {
    this.wipeSecrets();
    this.accountOperation.set(op);
    this.accountConfirmDialogOpen.set(true);
    this.reauthFormVisible.set(false);
  }

  async proceedToReauthChallenge(): Promise<void> {
    const op = this.accountOperation();
    if (!this.accountAdapter || !op || this.inFlight()) return;
    this.inFlight.set(true);
    try {
      const ch = await this.accountAdapter.beginReauthChallenge({
        operation: op,
        accountId: this.accountId(),
        expectedRevision: this.accountRevision(),
      });
      this.activeChallengeId = ch.challengeId;
      this.activeChallengeExpiresAtMs = new Date(ch.expiresAtIso).getTime();
      this.accountConfirmDialogOpen.set(false);
      this.reauthFormVisible.set(true);
      this.reauthError.set(null);
    } catch {
      this.statusAnnouncement.set('No se pudo iniciar el desafío de verificación.');
    } finally {
      this.inFlight.set(false);
    }
  }

  updatePasswordInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.transientPasswordInput.set(target?.value ?? '');
  }

  async submitReauthPassword(): Promise<void> {
    const op = this.accountOperation();
    if (!this.accountAdapter || !op || this.inFlight()) return;

    const pwd = this.transientPasswordInput();
    // Wipe input signal immediately so password never lingers
    this.transientPasswordInput.set('');

    if (!pwd.trim()) {
      this.reauthError.set('Introduce tu contraseña actual.');
      return;
    }

    if (!this.activeChallengeId || Date.now() >= this.activeChallengeExpiresAtMs) {
      this.wipeSecrets();
      this.reauthFormVisible.set(false);
      this.accountConfirmDialogOpen.set(true);
      this.statusAnnouncement.set(
        'La prueba temporal expiró. Confirma nuevamente para iniciar un nuevo desafío.'
      );
      return;
    }

    this.inFlight.set(true);
    const challengeToUse = this.activeChallengeId;
    this.activeChallengeId = null;

    try {
      const res = await this.accountAdapter.verifyReauthAndExecute({
        challengeId: challengeToUse,
        currentPassword: pwd,
        operation: op,
        accountId: this.accountId(),
        expectedRevision: this.accountRevision(),
        idempotencyKey: `ui-acc-${op}-${this.accountId()}-${this.accountRevision()}`,
      });
      this.reauthFormVisible.set(false);
      this.accountOperation.set(null);

      if (res.status === 'UNKNOWN') {
        this.statusAnnouncement.set('Verificando resultado: estado pendiente de confirmación.');
      } else {
        this.accountStatus.set(res.accountStatus);
        this.accountCancelUntilUtcIso.set(res.cancelUntilUtcIso);
        if (res.accountStatus === 'PENDING_DELETION') {
          this.sessionMode.set('DELETION_MANAGEMENT_ONLY');
          this.canRequestAccountDeletion.set(false);
          this.canCancelAccountDeletion.set(true);
        } else {
          this.sessionMode.set('ORDINARY');
          this.canRequestAccountDeletion.set(true);
          this.canCancelAccountDeletion.set(false);
        }
        this.statusAnnouncement.set(res.message);
        this.accountStateChanged.emit(res.accountStatus);
      }
    } catch {
      this.wipeSecrets();
      await this.loadAccount(this.accountId());
      this.statusAnnouncement.set(
        'Verificando resultado: se limpió el secreto temporal y se consultó el estado del servidor.'
      );
    } finally {
      this.inFlight.set(false);
    }
  }

  closeAccountFlow(): void {
    this.wipeSecrets();
    this.accountConfirmDialogOpen.set(false);
    this.reauthFormVisible.set(false);
    this.accountOperation.set(null);
    this.reauthError.set(null);
  }

  private wipeSecrets(): void {
    this.transientPasswordInput.set('');
    this.activeChallengeId = null;
    this.activeChallengeExpiresAtMs = 0;
  }
}
