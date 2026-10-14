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
    <eventlens-organizer-app-shell activeNav="account">
      <main class="el-account-page" aria-labelledby="organizer-account-heading">
      <header class="el-account-header">
        <div class="el-account-title-group">
          <span class="el-account-context-tag">Espacio de organizador</span>
          <h1 id="organizer-account-heading" tabindex="-1">Mi cuenta</h1>
        </div>
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
          <div class="el-card-header">
            <h2 id="account-basics-heading">Datos básicos de la cuenta</h2>
            <p class="el-card-subtitle">Información verificada asociada a tu perfil de organizador en Phoeve.</p>
          </div>

          <div class="el-account-table-wrap">
            <table class="el-account-table" role="presentation">
              <tbody>
                <tr class="el-table-row">
                  <th scope="row" class="el-table-label">
                    <span class="el-label-content">
                      <svg class="el-label-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
                      </svg>
                      <span>Correo electrónico</span>
                    </span>
                  </th>
                  <td class="el-table-value" data-testid="account-email-value">{{ accountData.email }}</td>
                </tr>

                <tr class="el-table-row">
                  <th scope="row" class="el-table-label">
                    <span class="el-label-content">
                      <svg class="el-label-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                      </svg>
                      <span>Verificación de correo</span>
                    </span>
                  </th>
                  <td class="el-table-value">
                    <span data-testid="account-verified-value">
                      @if (accountData.emailVerified) {
                        <span class="el-status-pill el-status-pill--verified">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                          Verificado
                        </span>
                      } @else {
                        <span class="el-status-pill el-status-pill--warning">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                          </svg>
                          Pendiente de verificación
                        </span>
                      }
                    </span>
                  </td>
                </tr>

                <tr class="el-table-row">
                  <th scope="row" class="el-table-label">
                    <span class="el-label-content">
                      <svg class="el-label-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                      </svg>
                      <span>Estado efectivo</span>
                    </span>
                  </th>
                  <td class="el-table-value">
                    <span data-testid="account-status-value">
                      @if (accountData.accountStatus === 'PENDING_DELETION') {
                        <span class="el-status-pill el-status-pill--danger">
                          <span class="el-dot el-dot--danger" aria-hidden="true"></span>
                          Eliminación pendiente (gestión restringida)
                        </span>
                      } @else {
                        <span class="el-status-pill el-status-pill--active">
                          <span class="el-dot el-dot--active" aria-hidden="true"></span>
                          Activa
                        </span>
                      }
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- 2. Superficie ordinaria: SecurityNotice + SessionList + SignOutOtherSessionsAction -->
        @if (isOrdinaryActiveSession()) {
          <section
            class="el-account-card"
            aria-labelledby="account-sessions-heading"
            data-testid="account-sessions-section"
          >
            <div class="el-card-header">
              <h2 id="account-sessions-heading">Seguridad y sesiones activas</h2>
              <p class="el-card-subtitle">Administra los dispositivos que tienen acceso a tu panel de organizador.</p>
            </div>

            <div class="el-security-notice" data-testid="organizer-security-notice">
              <div class="el-security-notice-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              </div>
              <p class="el-security-notice-text">
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
              <p role="status" aria-busy="true" class="el-sessions-muted">Cargando sesiones activas…</p>
            } @else if (sessions().length === 0) {
              <p data-testid="sessions-empty-state" class="el-sessions-muted">No se encontraron sesiones adicionales.</p>
            } @else {
              <ul class="el-session-list" data-testid="organizer-session-list">
                @for (sess of sessions(); track sess.id) {
                  <li
                    class="el-session-item"
                    [class.el-session-item--current]="sess.isCurrent"
                    data-testid="organizer-session-item"
                  >
                    <div class="el-session-left">
                      <div class="el-session-icon" [class.el-session-icon--current]="sess.isCurrent" aria-hidden="true">
                        @if (sess.isCurrent) {
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                            <line x1="8" y1="21" x2="16" y2="21"></line>
                            <line x1="12" y1="17" x2="12" y2="21"></line>
                          </svg>
                        } @else {
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                            <line x1="12" y1="18" x2="12.01" y2="18"></line>
                          </svg>
                        }
                      </div>
                      <div class="el-session-meta">
                        <div class="el-session-title-row">
                          <span class="el-session-badge">
                            {{ sess.isCurrent ? 'Sesión actual' : 'Sesión activa' }}
                          </span>
                          @if (sess.isCurrent) {
                            <span class="el-active-pill" title="Sesión activa en este navegador">
                              <span class="el-pulse-dot" aria-hidden="true"></span>
                              Activo
                            </span>
                          }
                        </div>
                        <span class="el-session-time">
                          Última actividad: {{ formatSessionDate(sess.lastActiveAt) }}
                        </span>
                      </div>
                    </div>
                    @if (!sess.isCurrent) {
                      <button
                        type="button"
                        class="el-btn-secondary el-btn-revoke"
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
                    class="el-btn-secondary el-btn-bulk-revoke"
                    data-testid="sign-out-other-sessions-btn"
                    [disabled]="sessionMutationInFlight()"
                    (click)="onRevokeOtherSessions()"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
                      <line x1="12" y1="2" x2="12" y2="12"></line>
                    </svg>
                    <span>Cerrar las demás sesiones</span>
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
    </eventlens-organizer-app-shell>
  `,
  styles: [
    `
      .el-account-page {
        width: 100%;
        margin: 0;
        padding: 0;
        font-family: var(--el-font-family, 'Manrope', system-ui, sans-serif);
        color: var(--el-color-text, #0f172a);
      }
      .el-account-header {
        margin-bottom: 1.75rem;
      }
      .el-account-title-group {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
      }
      .el-account-context-tag {
        display: inline-flex;
        align-self: flex-start;
        align-items: center;
        padding: 0.2rem 0.625rem;
        border-radius: 9999px;
        background: #eff6ff;
        color: #2563eb;
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }
      .el-account-header h1 {
        margin: 0;
        font-size: var(--el-font-size-h1, 1.875rem);
        font-weight: 700;
        color: var(--el-color-text, #0f172a);
        letter-spacing: -0.02em;
      }
      .el-account-card {
        background: var(--el-color-surface, #ffffff);
        border: 1px solid var(--el-color-border, #e2e8f0);
        border-radius: var(--el-radius-lg, 0.75rem);
        padding: 1.75rem;
        margin-bottom: 1.5rem;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
      }
      .el-card-header {
        margin-bottom: 1.25rem;
      }
      .el-card-header h2 {
        margin: 0 0 0.25rem;
        font-size: 1.25rem;
        font-weight: 700;
        color: #0f172a;
      }
      .el-card-subtitle {
        margin: 0;
        font-size: 0.875rem;
        color: #64748b;
      }
      .el-account-table-wrap {
        border: 1px solid #e2e8f0;
        border-radius: 0.625rem;
        overflow: hidden;
        background: #ffffff;
      }
      .el-account-table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
      }
      .el-table-row {
        border-bottom: 1px solid #f1f5f9;
        transition: background-color 0.15s ease;

        &:last-child {
          border-bottom: none;
        }

        &:hover {
          background-color: #f8fafc;
        }
      }
      .el-table-label {
        padding: 1rem 1.25rem;
        font-weight: 500;
        color: #475569;
        font-size: 0.9rem;
        width: 35%;
        vertical-align: middle;
      }
      .el-label-content {
        display: inline-flex;
        align-items: center;
        gap: 0.625rem;
      }
      .el-label-icon {
        color: #64748b;
        flex-shrink: 0;
      }
      .el-table-value {
        padding: 1rem 1.25rem;
        font-weight: 600;
        color: #0f172a;
        font-size: 0.95rem;
        vertical-align: middle;
      }
      .el-status-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        font-size: 0.8125rem;
        font-weight: 600;
      }
      .el-status-pill--verified {
        background: #ecfdf5;
        color: #065f46;
        border: 1px solid #a7f3d0;
      }
      .el-status-pill--active {
        background: #f0fdfa;
        color: #0f766e;
        border: 1px solid #99f6e4;
      }
      .el-status-pill--warning {
        background: #fffbeb;
        color: #92400e;
        border: 1px solid #fde68a;
      }
      .el-status-pill--danger {
        background: #fef2f2;
        color: #991b1b;
        border: 1px solid #fecaca;
      }
      .el-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
      }
      .el-dot--active {
        background: #0d9488;
      }
      .el-dot--danger {
        background: #ef4444;
      }
      .el-security-notice {
        display: flex;
        gap: 0.875rem;
        align-items: flex-start;
        padding: 1rem 1.25rem;
        background: #f0f7ff;
        border: 1px solid #bfdbfe;
        border-radius: 0.75rem;
        margin-bottom: 1.5rem;
      }
      .el-security-notice-icon {
        color: #2563eb;
        flex-shrink: 0;
        margin-top: 0.125rem;
      }
      .el-security-notice-text {
        margin: 0;
        font-size: 0.875rem;
        line-height: 1.5;
        color: #1e3a8a;
      }
      .el-session-list {
        list-style: none;
        padding: 0;
        margin: 0 0 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.875rem;
      }
      .el-session-item {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 1rem 1.25rem;
        border: 1px solid #e2e8f0;
        border-radius: 0.75rem;
        background: #ffffff;
        transition: all 0.15s ease;
      }
      .el-session-item--current {
        border-color: #bfdbfe;
        background: linear-gradient(to right, #f8fafc, #ffffff);
        box-shadow: 0 1px 3px rgba(37, 99, 235, 0.06);
      }
      .el-session-left {
        display: flex;
        align-items: center;
        gap: 1rem;
      }
      .el-session-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border-radius: 0.625rem;
        background: #f1f5f9;
        color: #64748b;
        flex-shrink: 0;
      }
      .el-session-icon--current {
        background: #eff6ff;
        color: #2563eb;
      }
      .el-session-meta {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .el-session-title-row {
        display: flex;
        align-items: center;
        gap: 0.625rem;
      }
      .el-session-badge {
        font-weight: 700;
        font-size: 0.95rem;
        color: #0f172a;
      }
      .el-active-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.125rem 0.5rem;
        background: #ecfdf5;
        border: 1px solid #a7f3d0;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 600;
        color: #065f46;
      }
      .el-pulse-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #10b981;
      }
      .el-session-time {
        font-size: 0.85rem;
        color: #64748b;
      }
      .el-sessions-muted {
        color: #64748b;
        font-size: 0.9rem;
        margin: 0 0 1rem;
      }
      .el-btn-secondary {
        min-height: 2.5rem;
        padding: 0.5rem 1rem;
        border: 1px solid #e2e8f0;
        border-radius: 0.5rem;
        background: #ffffff;
        color: #334155;
        font-family: inherit;
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover {
          background-color: #f8fafc;
          border-color: #cbd5e1;
          color: #0f172a;
        }

        &:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      }
      .el-btn-revoke {
        color: #dc2626;
        border-color: #fee2e2;
        background-color: #fef2f2;

        &:hover {
          background-color: #fee2e2;
          border-color: #fca5a5;
          color: #b91c1c;
        }
      }
      .el-btn-bulk-revoke {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
      }
      .el-session-bulk-actions {
        display: flex;
        justify-content: flex-end;
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

  formatSessionDate(isoDate: string): string {
    if (!isoDate) return '';
    try {
      const date = new Date(isoDate);
      if (isNaN(date.getTime())) return isoDate;
      return new Intl.DateTimeFormat('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch {
      return isoDate;
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
