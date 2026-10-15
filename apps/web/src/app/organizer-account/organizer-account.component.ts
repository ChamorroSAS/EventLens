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
  templateUrl: './organizer-account.component.html',
  styleUrl: './organizer-account.component.scss'
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
    if (!isoDate) return '';
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
