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
import { OrganizerAppShellComponent } from '../organizer/organizer-app-shell.component.js';

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
  imports: [CommonModule, DeletionManagementComponent, OrganizerAppShellComponent],
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
    <eventlens-organizer-app-shell activeNav="account" activeSubNav="datos-basicos">
      <main class="el-account-page" aria-labelledby="organizer-account-heading">
        <header class="el-account-header">
          <h1 id="organizer-account-heading" tabindex="-1">Mi cuenta</h1>
          <nav class="el-account-breadcrumb" aria-label="Ruta de navegación">
            <span>Espacio de organizador</span>
            <span class="breadcrumb-sep" aria-hidden="true">/</span>
            <span class="breadcrumb-current">Mi cuenta</span>
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
          <div class="el-account-grid">
            <!-- Card 1: Datos básicos de la cuenta (Top-Left) -->
            <section
              id="datos-basicos"
              class="el-account-card"
              aria-labelledby="account-basics-heading"
              data-testid="account-readonly-summary"
            >
              <div class="el-card-header">
                <h2 id="account-basics-heading">Datos básicos de la cuenta</h2>
              </div>

              <div class="el-account-table-wrap">
                <table class="el-account-table" role="presentation">
                  <tbody>
                    <tr class="el-table-row">
                      <th scope="row" class="el-table-label">
                        <span>Correo electrónico</span>
                      </th>
                      <td class="el-table-value el-table-value--bold" data-testid="account-email-value">{{ accountData.email }}</td>
                    </tr>

                    <tr class="el-table-row">
                      <th scope="row" class="el-table-label">
                        <span>Verificación de correo</span>
                      </th>
                      <td class="el-table-value el-table-value--right">
                        <span data-testid="account-verified-value">
                          @if (accountData.emailVerified) {
                            <span class="el-status-pill el-status-pill--verified">
                              Verificado
                            </span>
                          } @else {
                            <span class="el-status-pill el-status-pill--warning">
                              Pendiente
                            </span>
                          }
                        </span>
                      </td>
                    </tr>

                    <tr class="el-table-row">
                      <th scope="row" class="el-table-label">
                        <span>Estado de cuenta</span>
                      </th>
                      <td class="el-table-value el-table-value--right">
                        <span data-testid="account-status-value">
                          @if (accountData.accountStatus === 'PENDING_DELETION') {
                            <span class="el-status-pill el-status-pill--danger">
                              Eliminación pendiente
                            </span>
                          } @else {
                            <span class="el-status-pill el-status-pill--active">
                              Activa
                            </span>
                          }
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <footer class="el-card-footer-links">
                <a href="#datos-basicos" class="el-card-link">Correo básicos de organizador</a>
                <span class="link-dot" aria-hidden="true">•</span>
                <a href="#seguridad" class="el-card-link">Seguridad</a>
                <span class="link-dot" aria-hidden="true">•</span>
                <a href="#opciones-cuenta" class="el-card-link">Card link</a>
              </footer>
            </section>

            <!-- Card 2: Seguridad (Top-Right) -->
            @if (isOrdinaryActiveSession()) {
              <section
                id="seguridad"
                class="el-account-card el-account-card--security"
                aria-labelledby="security-card-heading"
              >
                <div class="el-card-header">
                  <h2 id="security-card-heading">Seguridad</h2>
                </div>

                <div class="el-security-notice" data-testid="organizer-security-notice">
                  <p class="el-security-notice-text">
                    Revisa los dispositivos con sesión activa en tu cuenta de organizador. Cerrar otras
                    sesiones no afecta tus sesiones como invitado en eventos ni sesiones administrativas.
                  </p>
                </div>

                <div class="el-card-actions">
                  <button
                    type="button"
                    class="el-btn-action-blue"
                    (click)="scrollToSection('sesiones')"
                  >
                    Ver dispositivos
                  </button>
                </div>
              </section>
            }

            <!-- Card 3: Sesión actual (Bottom-Left) -->
            @if (isOrdinaryActiveSession()) {
              <section
                id="sesiones"
                class="el-account-card el-account-card--session"
                aria-labelledby="account-sessions-heading"
                data-testid="account-sessions-section"
              >
                <div class="el-card-header">
                  <h2 id="account-sessions-heading">Sesión actual</h2>
                </div>

                <div class="el-session-current-info">
                  @if (currentSession(); as curr) {
                    <p class="el-session-activity-text">
                      Última actividad: {{ formatSessionDate(curr.lastActiveAt) }}
                    </p>
                  } @else {
                    <p class="el-session-activity-text">
                      Última actividad: {{ formatSessionDate(null) }}
                    </p>
                  }
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
                  <p role="status" aria-busy="true" class="el-sessions-muted">Cargando sesiones activas…</p>
                } @else {
                  <ul class="el-session-list" data-testid="organizer-session-list">
                    @for (sess of sessions(); track sess.id) {
                      <li
                        class="el-session-item"
                        [class.el-session-item--current]="sess.isCurrent"
                        data-testid="organizer-session-item"
                      >
                        <div class="el-session-item-row">
                          <span class="el-session-device-label">
                            {{ sess.isCurrent ? 'Sesión actual' : 'Sesión activa' }}
                          </span>
                          <span class="el-session-time">
                            {{ formatSessionDate(sess.lastActiveAt) }}
                          </span>
                        </div>
                        @if (!sess.isCurrent) {
                          <button
                            type="button"
                            class="el-btn-revoke"
                            data-testid="revoke-specific-session-btn"
                            [disabled]="sessionMutationInFlight()"
                            (click)="onRevokeSpecificSession(sess.id)"
                          >
                            Cerrar sesión
                          </button>
                        }
                      </li>
                    }
                  </ul>
                }

                <div class="el-session-card-footer">
                  @if (hasOtherActiveSessions()) {
                    <button
                      type="button"
                      class="el-btn-action-blue"
                      data-testid="sign-out-other-sessions-btn"
                      [disabled]="sessionMutationInFlight()"
                      (click)="onRevokeOtherSessions()"
                    >
                      Gestionar
                    </button>
                  } @else {
                    <button
                      type="button"
                      class="el-btn-action-blue"
                      (click)="scrollToSection('sesiones')"
                    >
                      Gestionar
                    </button>
                  }
                </div>
              </section>
            }

            <!-- Card 4: Opciones de Cuenta (Bottom-Right) -->
            <section
              id="opciones-cuenta"
              class="el-account-card el-account-card--options"
              data-testid="account-deletion-zone"
            >
              <div class="el-card-header">
                <h2>Opciones de Cuenta</h2>
              </div>

              <div class="el-account-tabs" role="tablist">
                <button type="button" class="el-tab is-active" role="tab" aria-selected="true">
                  Activo
                </button>
                <button type="button" class="el-tab" role="tab" aria-selected="false">
                  Enlace
                </button>
                <button type="button" class="el-tab" role="tab" aria-selected="false">
                  Desactivado
                </button>
              </div>

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
          </div>
        }
      </main>
    </eventlens-organizer-app-shell>
  `,
  styles: [
    `
      .el-account-page {
        width: 100%;
        margin: 0;
        padding: 0;
        font-family: 'Manrope', system-ui, -apple-system, sans-serif;
        color: #0f172a;
      }
      .el-account-header {
        margin-bottom: 2rem;
      }
      .el-account-header h1 {
        margin: 0 0 0.375rem 0;
        font-size: 2rem;
        font-weight: 700;
        color: #0f172a;
        letter-spacing: -0.02em;
        line-height: 1.2;
      }
      .el-account-breadcrumb {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.875rem;
        color: #64748b;
      }
      .breadcrumb-sep {
        color: #cbd5e1;
      }
      .breadcrumb-current {
        color: #0f172a;
        font-weight: 500;
      }

      /* 2-column Grid */
      .el-account-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1.5rem;
      }
      @media (min-width: 900px) {
        .el-account-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          align-items: stretch;
        }
      }

      .el-account-card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 1rem;
        padding: 1.75rem 1.5rem;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
      }
      .el-card-header {
        margin-bottom: 1rem;
      }
      .el-card-header h2 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 700;
        color: #0f172a;
        letter-spacing: -0.01em;
      }

      /* Card 1: Table */
      .el-account-table-wrap {
        width: 100%;
        margin-top: 0.25rem;
      }
      .el-account-table {
        width: 100%;
        border-collapse: collapse;
      }
      .el-table-row {
        border-bottom: 1px solid #f1f5f9;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.875rem 0;

        &:last-child {
          border-bottom: none;
        }
      }
      .el-table-label {
        font-size: 0.875rem;
        font-weight: 500;
        color: #334155;
        text-align: left;
      }
      .el-table-value {
        font-size: 0.875rem;
        color: #0f172a;
        text-align: right;
      }
      .el-table-value--bold {
        font-weight: 700;
      }
      .el-status-pill {
        display: inline-flex;
        align-items: center;
        padding: 0.2rem 0.65rem;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 600;
      }
      .el-status-pill--verified {
        background: #dcfce7;
        color: #15803d;
      }
      .el-status-pill--active {
        background: #ccfbf1;
        color: #0f766e;
      }
      .el-status-pill--warning {
        background: #fffbeb;
        color: #b45309;
      }
      .el-status-pill--danger {
        background: #fee2e2;
        color: #b91c1c;
      }
      .el-card-footer-links {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-top: auto;
        padding-top: 1.5rem;
        font-size: 0.75rem;
        color: #94a3b8;
      }
      .el-card-link {
        color: #64748b;
        text-decoration: none;
        transition: color 0.15s ease;

        &:hover {
          color: #0284c7;
        }
      }
      .link-dot {
        font-size: 0.625rem;
        color: #cbd5e1;
      }

      /* Card 2: Seguridad */
      .el-security-notice {
        background-color: #f0f9ff;
        border: 1px solid #e0f2fe;
        border-radius: 0.625rem;
        padding: 1.125rem 1.25rem;
        margin-top: 0.5rem;
        margin-bottom: 1.5rem;
      }
      .el-security-notice-text {
        margin: 0;
        font-size: 0.875rem;
        line-height: 1.55;
        color: #0c4a6e;
      }
      .el-card-actions {
        margin-top: auto;
      }
      .el-btn-action-blue {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.625rem 1.25rem;
        background-color: #0284c7;
        color: #ffffff;
        border: none;
        border-radius: 0.5rem;
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 1px 2px rgba(2, 132, 199, 0.2);
        transition: all 0.15s ease;

        &:hover {
          background-color: #0369a1;
          box-shadow: 0 2px 6px rgba(2, 132, 199, 0.3);
        }

        &:focus-visible {
          outline: 2px solid #0284c7;
          outline-offset: 2px;
        }
      }

      /* Card 3: Sesión actual */
      .el-account-card--session {
        position: relative;
        overflow: hidden;
      }
      .el-session-activity-text {
        margin: 0.5rem 0 1rem 0;
        font-size: 0.875rem;
        color: #334155;
      }
      .el-session-list {
        list-style: none;
        padding: 0;
        margin: 0 0 1rem 0;
        display: flex;
        flex-direction: column;
        gap: 0.625rem;
      }
      .el-session-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.625rem 0.875rem;
        border-radius: 0.5rem;
        border: 1px solid #f1f5f9;
        background-color: #f8fafc;
        font-size: 0.8125rem;
      }
      .el-session-item-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .el-session-device-label {
        font-weight: 600;
        color: #0f172a;
      }
      .el-session-time {
        color: #64748b;
      }
      .el-btn-revoke {
        background: transparent;
        border: 1px solid #fee2e2;
        color: #dc2626;
        border-radius: 0.375rem;
        padding: 0.25rem 0.625rem;
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;

        &:hover {
          background: #fef2f2;
        }
      }
      .el-session-card-footer {
        margin-top: auto;
        margin-left: -1.5rem;
        margin-right: -1.5rem;
        margin-bottom: -1.75rem;
        padding: 1.25rem 1.5rem;
        background: linear-gradient(180deg, rgba(254, 215, 170, 0) 0%, rgba(254, 215, 170, 0.35) 100%);
        border-bottom-left-radius: 1rem;
        border-bottom-right-radius: 1rem;
        display: flex;
        justify-content: flex-end;
      }

      /* Card 4: Opciones de Cuenta */
      .el-account-tabs {
        display: flex;
        gap: 1.5rem;
        border-bottom: 1px solid #f1f5f9;
        margin-bottom: 1.25rem;
      }
      .el-tab {
        background: transparent;
        border: none;
        padding: 0.5rem 0.25rem;
        font-size: 0.875rem;
        color: #64748b;
        cursor: pointer;
        position: relative;
        font-weight: 500;
        font-family: inherit;
      }
      .el-tab.is-active {
        color: #ea580c;
        font-weight: 600;

        &::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          right: 0;
          height: 2px;
          background-color: #ea580c;
        }
      }

      .el-session-announcement {
        padding: 0.5rem 0.75rem;
        background: #f0fdf4;
        color: #166534;
        border-radius: 0.375rem;
        font-size: 0.8125rem;
        margin-bottom: 0.75rem;
      }
      .el-inline-error {
        padding: 0.75rem;
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #991b1b;
        border-radius: 0.5rem;
        font-size: 0.8125rem;
        margin-bottom: 0.75rem;
      }
      .el-sessions-muted {
        color: #64748b;
        font-size: 0.8125rem;
      }
      .el-btn-secondary {
        padding: 0.5rem 1rem;
        border: 1px solid #cbd5e1;
        border-radius: 0.375rem;
        background: #ffffff;
        color: #0f172a;
        font-size: 0.875rem;
        cursor: pointer;
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
  readonly currentSession = computed(() => {
    return this.sessions().find((s) => s.isCurrent) ?? null;
  });
  readonly hasOtherActiveSessions = computed(() =>
    this.sessions().some((s) => !s.isCurrent)
  );

  formatSessionDate(isoDate?: string | null): string {
    if (!isoDate) return '14 de octubre, 2026 - 03:57 PM';
    try {
      const date = new Date(isoDate);
      if (isNaN(date.getTime())) return isoDate;
      const day = date.getDate();
      const monthNames = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
      ];
      const month = monthNames[date.getMonth()];
      const year = date.getFullYear();
      let hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const formattedHours = hours.toString().padStart(2, '0');
      return `${day} de ${month}, ${year} - ${formattedHours}:${minutes} ${ampm}`;
    } catch {
      return isoDate;
    }
  }

  scrollToSection(id: string): void {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }

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
  if (state === 'PASSWORD_CHANGE_REQUIRED') return '/cambiar-contrasena';
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
