import { CommonModule } from '@angular/common';
import {
  Component,
  Injectable,
  OnInit,
  ViewChild,
   computed,
  inject,
  signal
} from '@angular/core';
import { createEventLensClient } from '@eventlens/api-client';
import {
  ACCOUNT_DELETION_UI_ADAPTER,
  type AccountDeletionUiAdapter,
  DeletionManagementComponent
} from '../deletion-management.component';
import {
  APPROVED_PUBLIC_ENTRY_PATHS,
  CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA,
  type PublicEntryRouteActivationContext,
  type PublicEntryRouteDescriptor
} from '../navigation/public-entry-routes.contract';
import { PublicEntryRouterService } from '../navigation/public-entry-router.service';
import { OrganizerSessionService } from '../organizer-session.service';

export interface OrganizerSessionViewModel {
  readonly id: string;
  readonly authTime: string;
  readonly createdAt: string;
  readonly lastActiveAt: string;
  readonly expiresAt: string;
  readonly idleExpiresAt: string;
  readonly isCurrent: boolean;
}

export interface OrganizerAccountDeletionSnapshot {
  readonly accountId: string;
  readonly accountStatus: 'ACTIVE' | 'PENDING_DELETION' | 'DELETED';
  readonly sessionMode: 'ORDINARY' | 'DELETION_MANAGEMENT_ONLY';
  readonly revision: number;
  readonly affectedEventsCount: number;
  readonly canRequestDeletion: boolean;
  readonly canCancelDeletion: boolean;
  readonly cancelUntilUtcIso: string | null;
  readonly isUncertainAck: boolean;
  readonly isIrreversible: boolean;
  readonly requestId?: string | null;
}

export class AccountAuthorizationLostError extends Error {
  constructor(public readonly httpStatus: number) {
    super(`ACCOUNT_AUTHORIZATION_LOST_${httpStatus}`);
  }
}

@Injectable({ providedIn: 'root' })
export class OrganizerAccountGatewayService implements AccountDeletionUiAdapter {
  private readonly client = createEventLensClient();
  private readonly sessionService = inject(OrganizerSessionService);

  async listSessions(): Promise<{
    sessions: OrganizerSessionViewModel[];
    total: number;
  }> {
    const { data, response } = await this.client.GET('/api/v1/organizer/account/sessions');
    if (response.status === 401 || response.status === 403) {
      throw new AccountAuthorizationLostError(response.status);
    }
    if (!response.ok || !data) {
      throw new Error('SESSIONS_UNAVAILABLE');
    }
    return data;
  }

  async revokeSession(targetSessionId: string): Promise<{
    outcome: 'REVOKED' | 'ALREADY_REVOKED';
    targetSessionId: string;
    isCurrentSession: boolean;
  }> {
    const csrfToken = this.sessionService.getCsrfToken() ?? '';
    const { data, response } = await this.client.POST(
      '/api/v1/organizer/account/sessions/revoke',
      {
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
        body: { targetSessionId }
      }
    );
    if (response.status === 401 || response.status === 403) {
      throw new AccountAuthorizationLostError(response.status);
    }
    if (!response.ok || !data) {
      throw new Error('REVOKE_SESSION_FAILED');
    }
    return data;
  }

  async revokeOtherSessions(): Promise<{
    outcome: 'REVOKED_OTHERS';
    revokedCount: number;
    preservedCurrentSessionId: string;
  }> {
    const csrfToken = this.sessionService.getCsrfToken() ?? '';
    const { data, response } = await this.client.POST(
      '/api/v1/organizer/account/sessions/revoke-others',
      {
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined
      }
    );
    if (response.status === 401 || response.status === 403) {
      throw new AccountAuthorizationLostError(response.status);
    }
    if (!response.ok || !data) {
      throw new Error('REVOKE_OTHER_SESSIONS_FAILED');
    }
    return data;
  }

  async getAccountState(_accountId: string): Promise<OrganizerAccountDeletionSnapshot> {
    const { data, response } = await this.client.GET('/api/v1/organizer/account/deletion');
    if (response.status === 401 || response.status === 403) {
      throw new AccountAuthorizationLostError(response.status);
    }
    if (!response.ok || !data) {
      throw new Error('ACCOUNT_DELETION_STATE_UNAVAILABLE');
    }
    return data;
  }

  async beginReauthChallenge(params: {
    operation: 'REQUEST_ACCOUNT_DELETION' | 'CANCEL_ACCOUNT_DELETION';
    accountId: string;
    expectedRevision: number;
  }): Promise<{
    challengeId: string;
    expiresAtIso: string;
  }> {
    const csrfToken = this.sessionService.getCsrfToken() ?? '';
    const { data, response } = await this.client.POST(
      '/api/v1/organizer/account/reauthentication/challenges',
      {
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
        body: params
      }
    );
    if (response.status === 401 || response.status === 403) {
      throw new AccountAuthorizationLostError(response.status);
    }
    if (!response.ok || !data) {
      throw new Error('REAUTH_CHALLENGE_FAILED');
    }
    return data;
  }

  async verifyReauthAndExecute(params: {
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
  }> {
    const csrfToken = this.sessionService.getCsrfToken() ?? '';
    const { data, response } = await this.client.POST(
      '/api/v1/organizer/account/deletion',
      {
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
        body: params
      }
    );
    if (response.status === 401 || response.status === 403) {
      throw new AccountAuthorizationLostError(response.status);
    }
    if (!response.ok || !data) {
      throw new Error('ACCOUNT_DELETION_TRANSITION_FAILED');
    }
    return data;
  }
}

@Component({
  selector: 'eventlens-organizer-account',
  standalone: true,
  imports: [CommonModule, DeletionManagementComponent],
  providers: [
    {
      provide: ACCOUNT_DELETION_UI_ADAPTER,
      useFactory: () => {
        const customAdapter = inject(ACCOUNT_DELETION_UI_ADAPTER, {
          optional: true,
          skipSelf: true
        });
        return customAdapter ?? inject(OrganizerAccountGatewayService);
      }
    }
  ],
  template: `
    <main class="el-account-page" aria-labelledby="organizer-account-heading">
      <header class="el-account-header">
        <div>
          <p class="el-account-eyebrow">Espacio de organizador</p>
          <h1 id="organizer-account-heading" tabindex="-1">Mi cuenta</h1>
        </div>
        <nav class="el-account-nav" aria-label="Navegación desde Mi cuenta">
          <a
            class="el-link-secondary"
            [href]="homePath"
            (click)="onNavigate($event, homePath)"
          >
            Inicio
          </a>
          @if (isOrdinaryActiveSession()) {
            <a
              class="el-link-secondary"
              data-testid="account-link-my-events"
              [href]="myEventsPath"
              (click)="onNavigate($event, myEventsPath)"
            >
              Mis eventos
            </a>
          }
        </nav>
      </header>

      @if (isLoadingAccount()) {
        <section
          class="el-account-card"
          role="status"
          aria-busy="true"
          data-testid="account-loading-state"
        >
          <p>Comprobando estado y permisos de tu cuenta…</p>
        </section>
      } @else if (loadError()) {
        <section
          class="el-account-card el-account-card--error"
          role="alert"
          data-testid="account-error-state"
        >
          <p>{{ loadError() }}</p>
          <button
            type="button"
            class="el-btn-secondary"
            (click)="reloadAccountSurface()"
          >
            Reintentar
          </button>
        </section>
      } @else if (projectedAccount(); as accountData) {
        <!-- 1. Datos básicos read-only desde el contrato de identidad -->
        <section
          class="el-account-card"
          aria-labelledby="account-basics-heading"
          data-testid="account-readonly-summary"
        >
          <h2 id="account-basics-heading">Datos básicos de la cuenta</h2>
          <dl class="el-account-dl">
            <div class="el-account-dl-row">
              <dt>Correo electrónico</dt>
              <dd data-testid="account-email-value">{{ accountData.email }}</dd>
            </div>
            <div class="el-account-dl-row">
              <dt>Verificación de correo</dt>
              <dd data-testid="account-verified-value">
                {{ accountData.emailVerified ? 'Verificado' : 'Pendiente de verificación' }}
              </dd>
            </div>
            <div class="el-account-dl-row">
              <dt>Estado efectivo</dt>
              <dd data-testid="account-status-value">
                {{
                  accountData.accountStatus === 'PENDING_DELETION'
                    ? 'Eliminación pendiente (gestión restringida)'
                    : 'Activa'
                }}
              </dd>
            </div>
          </dl>
        </section>

        <!-- 2. Superficie ordinaria: SecurityNotice + SessionList + SignOutOtherSessionsAction -->
        @if (isOrdinaryActiveSession()) {
          <section
            class="el-account-card"
            aria-labelledby="account-sessions-heading"
            data-testid="account-sessions-section"
          >
            <h2 id="account-sessions-heading">Seguridad y sesiones activas</h2>
            <div class="el-security-notice" data-testid="organizer-security-notice">
              <p>
                Revisa los dispositivos con sesión activa en tu cuenta de organizador. Cerrar otras
                sesiones no afecta tus sesiones como invitado en eventos ni sesiones administrativas.
              </p>
            </div>

            @if (sessionsActionAnnouncement(); as sessionNotice) {
              <p
                role="status"
                aria-live="polite"
                class="el-session-announcement"
                data-testid="sessions-status-announcement"
              >
                {{ sessionNotice }}
              </p>
            }

            @if (sessionsError(); as sessErr) {
              <div role="alert" class="el-inline-error" data-testid="sessions-error-banner">
                <p>{{ sessErr }}</p>
                <button type="button" class="el-btn-secondary" (click)="loadSessions()">
                  Reintentar carga de sesiones
                </button>
              </div>
            } @else if (isLoadingSessions()) {
              <p role="status" aria-busy="true">Cargando sesiones activas…</p>
            } @else if (sessions().length === 0) {
              <p data-testid="sessions-empty-state">No se encontraron sesiones adicionales.</p>
            } @else {
              <ul class="el-session-list" data-testid="organizer-session-list">
                @for (sess of sessions(); track sess.id) {
                  <li class="el-session-item" data-testid="organizer-session-item">
                    <div class="el-session-meta">
                      <span class="el-session-badge">
                        {{ sess.isCurrent ? 'Sesión actual' : 'Sesión activa' }}
                      </span>
                      <span class="el-session-time">
                        Última actividad: {{ sess.lastActiveAt }}
                      </span>
                    </div>
                    @if (!sess.isCurrent) {
                      <button
                        type="button"
                        class="el-btn-secondary"
                        data-testid="revoke-specific-session-btn"
                        [disabled]="sessionMutationInFlight()"
                        (click)="onRevokeSpecificSession(sess.id)"
                      >
                        Cerrar esta sesión
                      </button>
                    }
                  </li>
                }
              </ul>

              @if (hasOtherActiveSessions()) {
                <div class="el-session-bulk-actions">
                  <button
                    type="button"
                    class="el-btn-secondary"
                    data-testid="sign-out-other-sessions-btn"
                    [disabled]="sessionMutationInFlight()"
                    (click)="onRevokeOtherSessions()"
                  >
                    Cerrar las demás sesiones
                  </button>
                </div>
              }
            }
          </section>
        }

        <!-- 3. Zona de eliminación y reautenticación del propietario EL-TK-201 -->
        <section class="el-account-card" data-testid="account-deletion-zone">
          @if (deletionSnapshot()?.isIrreversible) {
            <div
              role="status"
              class="el-irreversible-banner"
              data-testid="account-deletion-irreversible-banner"
            >
              Eliminación irreversible en curso: la ventana de cancelación expiró o la purga ya fue
              reclamada por el coordinador.
            </div>
          }
          @if (deletionSnapshot()?.isUncertainAck) {
            <div
              role="status"
              class="el-uncertain-banner"
              data-testid="account-deletion-uncertain-banner"
            >
              Resultado pendiente de confirmación: no se asume eliminación ni cancelación hasta
              reconciliar con el servidor.
            </div>
          }
          <eventlens-deletion-management
            [mode]="'ACCOUNT_ONLY'"
            [accountSnapshot]="deletionSnapshot()"
            (accountStateChanged)="onAccountDeletionStateChanged($event)"
          />
        </section>
      }
    </main>
  `,
  styles: [
    `
      .el-account-page {
        max-width: 52rem;
        margin: 2rem auto;
        padding: 0 1.25rem;
        font-family: 'Manrope', system-ui, sans-serif;
        color: #0f172a;
      }
      .el-account-header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 1.5rem;
      }
      .el-account-eyebrow {
        margin: 0 0 0.25rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: #1d4ed8;
      }
      .el-account-header h1 {
        margin: 0;
        font-size: 1.875rem;
        font-weight: 700;
      }
      .el-account-nav {
        display: flex;
        gap: 1rem;
      }
      .el-account-card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 0.875rem;
        padding: 1.5rem;
        margin-bottom: 1.25rem;
      }
      .el-account-card h2 {
        margin: 0 0 1rem;
        font-size: 1.25rem;
        font-weight: 700;
      }
      .el-account-dl {
        margin: 0;
        display: grid;
        gap: 0.75rem;
      }
      .el-account-dl-row {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 0.5rem;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid #f1f5f9;
      }
      .el-account-dl-row dt {
        font-weight: 500;
        color: #475569;
      }
      .el-account-dl-row dd {
        margin: 0;
        font-weight: 600;
        color: #0f172a;
      }
      .el-security-notice {
        padding: 0.75rem 1rem;
        background: #f8fafc;
        border-left: 4px solid #2563eb;
        border-radius: 0.375rem;
        margin-bottom: 1rem;
        font-size: 0.925rem;
        color: #334155;
      }
      .el-security-notice p {
        margin: 0;
      }
      .el-session-list {
        list-style: none;
        padding: 0;
        margin: 0 0 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .el-session-item {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        border: 1px solid #cbd5e1;
        border-radius: 0.5rem;
      }
      .el-session-meta {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .el-session-badge {
        font-weight: 600;
        font-size: 0.9rem;
      }
      .el-session-time {
        font-size: 0.85rem;
        color: #64748b;
      }
      .el-btn-secondary {
        min-height: 2.75rem;
        padding: 0.5rem 1rem;
        border: 1px solid #1d4ed8;
        border-radius: 0.5rem;
        background: #ffffff;
        color: #1d4ed8;
        font-family: inherit;
        font-size: 0.9rem;
        font-weight: 600;
        cursor: pointer;
      }
      .el-link-secondary {
        display: inline-flex;
        align-items: center;
        min-height: 2.75rem;
        color: #1d4ed8;
        font-weight: 600;
        text-decoration: underline;
      }
      .el-irreversible-banner,
      .el-uncertain-banner {
        margin-bottom: 1rem;
        padding: 0.75rem 1rem;
        border-radius: 0.5rem;
        background: #fffbeb;
        border: 1px solid #fde68a;
        color: #92400e;
        font-size: 0.9rem;
      }
    `
  ]
})
export class OrganizerAccountComponent implements OnInit {
  private readonly sessionService = inject(OrganizerSessionService);
  private readonly gateway = inject(OrganizerAccountGatewayService);
  private readonly accountDeletionAdapter = inject(ACCOUNT_DELETION_UI_ADAPTER);
  private readonly router = inject(PublicEntryRouterService);

  @ViewChild(DeletionManagementComponent)
  private deletionComponent?: DeletionManagementComponent;

  readonly homePath = APPROVED_PUBLIC_ENTRY_PATHS.HOME;
  readonly myEventsPath = APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_DASHBOARD;

  readonly isLoadingAccount = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly sessions = signal<OrganizerSessionViewModel[]>([]);
  readonly isLoadingSessions = signal(false);
  readonly sessionsError = signal<string | null>(null);
  readonly sessionMutationInFlight = signal(false);
  readonly sessionsActionAnnouncement = signal<string | null>(null);
  readonly deletionSnapshot = signal<OrganizerAccountDeletionSnapshot | null>(null);

  readonly projectedAccount = computed(() => this.sessionService.account());
  readonly isOrdinaryActiveSession = computed(
    () =>
      this.sessionService.state() === 'ORGANIZER_ACTIVE' &&
      !this.sessionService.capabilities().isDeletionRestricted &&
      this.sessionService.capabilities().canManageSessions
  );
  readonly hasOtherActiveSessions = computed(() =>
    this.sessions().some((s) => !s.isCurrent)
  );

  constructor() {
    this.sessionService.registerOrganizerCacheClearer(() => {
      this.sessions.set([]);
      this.deletionSnapshot.set(null);
      this.sessionsActionAnnouncement.set(null);
    });
  }

  ngOnInit(): void {
    if (!this.isLoadingAccount() && !this.deletionSnapshot() && !this.loadError()) {
      void this.reloadAccountSurface();
    }
  }

  async reloadAccountSurface(): Promise<void> {
    this.isLoadingAccount.set(true);
    this.loadError.set(null);

    try {
      const currentState = this.sessionService.state();
      if (currentState === 'CHECKING' || currentState === 'UNAVAILABLE') {
        await this.sessionService.refreshSessionProjection();
      }

      const afterRefreshState = this.sessionService.state();
      if (afterRefreshState === 'ANONYMOUS') {
        this.handleLostAuthorization(401);
        return;
      }
      if (afterRefreshState === 'UNAVAILABLE') {
        this.loadError.set(
          'No pudimos comprobar el estado de tu cuenta temporalmente. Puedes volver a intentarlo.'
        );
        return;
      }

      const delSnap = await this.accountDeletionAdapter.getAccountState('current');
      const fullSnap: OrganizerAccountDeletionSnapshot = {
        ...delSnap,
        isIrreversible: Boolean(delSnap.isIrreversible)
      };
      this.deletionSnapshot.set(fullSnap);

      if (this.isOrdinaryActiveSession()) {
        await this.loadSessions();
      } else {
        this.sessions.set([]);
      }

      if (this.deletionComponent) {
        this.deletionComponent.applyAccountSnapshot(fullSnap);
      }
    } catch (error) {
      if (error instanceof AccountAuthorizationLostError) {
        this.handleLostAuthorization(error.httpStatus);
        return;
      }
      this.loadError.set(
        'No se pudo cargar la información de tu cuenta en este momento. Inténtalo de nuevo.'
      );
    } finally {
      this.isLoadingAccount.set(false);
    }
  }

  async loadSessions(): Promise<void> {
    if (!this.isOrdinaryActiveSession()) {
      this.sessions.set([]);
      return;
    }

    this.isLoadingSessions.set(true);
    this.sessionsError.set(null);

    try {
      const res = await this.gateway.listSessions();
      this.sessions.set(res.sessions);
    } catch (error) {
      if (error instanceof AccountAuthorizationLostError) {
        this.handleLostAuthorization(error.httpStatus);
        return;
      }
      this.sessionsError.set('No se pudieron cargar las sesiones activas.');
    } finally {
      this.isLoadingSessions.set(false);
    }
  }

  async onRevokeSpecificSession(targetSessionId: string): Promise<void> {
    if (this.sessionMutationInFlight()) {
      return;
    }
    this.sessionMutationInFlight.set(true);
    this.sessionsActionAnnouncement.set(null);

    try {
      await this.gateway.revokeSession(targetSessionId);
      this.sessions.update((list) => list.filter((item) => item.id !== targetSessionId));
      this.sessionsActionAnnouncement.set('Sesión cerrada correctamente.');
    } catch (error) {
      if (error instanceof AccountAuthorizationLostError) {
        this.handleLostAuthorization(error.httpStatus);
        return;
      }
      this.sessionsActionAnnouncement.set(
        'No se pudo cerrar la sesión seleccionada. Inténtalo de nuevo.'
      );
    } finally {
      this.sessionMutationInFlight.set(false);
    }
  }

  async onRevokeOtherSessions(): Promise<void> {
    if (this.sessionMutationInFlight()) {
      return;
    }
    this.sessionMutationInFlight.set(true);
    this.sessionsActionAnnouncement.set(null);

    try {
      const res = await this.gateway.revokeOtherSessions();
      this.sessions.update((list) => list.filter((item) => item.isCurrent));
      this.sessionsActionAnnouncement.set(
        res.revokedCount > 0
          ? 'Se cerraron las demás sesiones activas.'
          : 'No había otras sesiones activas para cerrar.'
      );
    } catch (error) {
      if (error instanceof AccountAuthorizationLostError) {
        this.handleLostAuthorization(error.httpStatus);
        return;
      }
      this.sessionsActionAnnouncement.set(
        'No se pudieron cerrar las demás sesiones. Inténtalo de nuevo.'
      );
    } finally {
      this.sessionMutationInFlight.set(false);
    }
  }

  onAccountDeletionStateChanged(newStatus: 'ACTIVE' | 'PENDING_DELETION' | 'DELETED'): void {
    const currentAcc = this.sessionService.account();
    if (!currentAcc) {
      return;
    }

    if (newStatus === 'PENDING_DELETION') {
      this.sessions.set([]);
      this.sessionService.applyServerProjection({
        state: 'ORGANIZER_RESTRICTED_DELETION',
        capabilities: {
          canSignIn: false,
          canRequestBetaAccess: true,
          canAccessMyEvents: false,
          canAccessMyAccount: true,
          canManageSessions: false,
          canManageAccountDeletion: true,
          isDeletionRestricted: true,
          canSignOut: true
        },
        account: {
          ...currentAcc,
          accountStatus: 'PENDING_DELETION'
        }
      });
    } else if (newStatus === 'ACTIVE') {
      this.sessionService.applyServerProjection({
        state: 'ORGANIZER_ACTIVE',
        capabilities: {
          canSignIn: false,
          canRequestBetaAccess: true,
          canAccessMyEvents: true,
          canAccessMyAccount: true,
          canManageSessions: true,
          canManageAccountDeletion: true,
          isDeletionRestricted: false,
          canSignOut: true
        },
        account: {
          ...currentAcc,
          accountStatus: 'ACTIVE'
        }
      });
      void this.loadSessions();
    }
  }

  onNavigate(event: Event, path: string): void {
    event.preventDefault();
    void this.router.navigateByUrl(path);
  }

  private handleLostAuthorization(httpStatus: number): void {
    this.sessions.set([]);
    this.deletionSnapshot.set(null);

    if (httpStatus === 401) {
      this.sessionService.clearLocalSessionProjection('ANONYMOUS');
      void this.router.navigateByUrl('/ingresar?returnUrl=%2Fmi-cuenta', { replaceUrl: true });
      return;
    }

    // 403 loss of ordinary permission (e.g. account transitioned to restricted deletion)
    void this.sessionService.refreshSessionProjection();
  }
}

export async function organizerAccountRouteGuard(
  _context: PublicEntryRouteActivationContext
): Promise<boolean | string> {
  const sessionService = inject(OrganizerSessionService);
  if (sessionService.state() === 'CHECKING') {
    await sessionService.refreshSessionProjection();
  }

  const state = sessionService.state();
  const capabilities = sessionService.capabilities();
  if (
    (state === 'ORGANIZER_ACTIVE' || state === 'ORGANIZER_RESTRICTED_DELETION') &&
    capabilities.canAccessMyAccount
  ) {
    return true;
  }

  if (state === 'UNAVAILABLE') {
    return true;
  }

  return '/ingresar?returnUrl=%2Fmi-cuenta';
}

export const ORGANIZER_ACCOUNT_ROUTE_DESCRIPTOR: PublicEntryRouteDescriptor = Object.freeze({
  ...CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA.ORGANIZER_ACCOUNT,
  component: OrganizerAccountComponent,
  canActivate: [organizerAccountRouteGuard]
});
