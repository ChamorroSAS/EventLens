import { Injectable, computed, signal } from '@angular/core';
import { createEventLensClient, type operations } from '@eventlens/api-client';
import { APPROVED_PUBLIC_ENTRY_PATHS } from './navigation/public-entry-routes.contract';
import { canonicalizeInternalReturnUrl } from './navigation/return-url.canonicalizer';

export type ServerOrganizerSessionProjection =
  operations['getOrganizerSessionProjection']['responses'][200]['content']['application/json'];

export type OrganizerSessionConsumerState =
  | 'CHECKING'
  | 'ANONYMOUS'
  | 'ORGANIZER_ACTIVE'
  | 'ORGANIZER_RESTRICTED_DELETION'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'UNAVAILABLE';

export type OrganizerEffectiveCapabilities = ServerOrganizerSessionProjection['capabilities'];
export type OrganizerProjectedAccount = ServerOrganizerSessionProjection['account'];

export interface OrganizerSessionSnapshot {
  state: OrganizerSessionConsumerState;
  capabilities: OrganizerEffectiveCapabilities;
  account: OrganizerProjectedAccount;
}

export type OrganizerLoginOutcome =
  | {
      readonly ok: true;
      readonly snapshot: OrganizerSessionSnapshot;
      readonly returnDestination: string;
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly code: 'UNAUTHENTICATED' | 'RATE_LIMITED' | 'DEPENDENCY_UNAVAILABLE';
      readonly message: string;
    };

export type OrganizerLogoutOutcome =
  | {
      readonly status: 'CONFIRMED';
      readonly outcome: 'LOGGED_OUT' | 'ALREADY_EXPIRED_OR_REVOKED';
      readonly announcement: string;
      readonly redirectPath: string;
    }
  | {
      readonly status: 'UNCERTAIN';
      readonly message: string;
    };

const ZERO_PRIVATE_CAPABILITIES: OrganizerEffectiveCapabilities = Object.freeze({
  canSignIn: false,
  canRequestBetaAccess: true,
  canAccessMyEvents: false,
  canAccessMyAccount: false,
  canManageSessions: false,
  canManageAccountDeletion: false,
  isDeletionRestricted: false,
  canSignOut: false
});

const ANONYMOUS_CAPABILITIES: OrganizerEffectiveCapabilities = Object.freeze({
  canSignIn: true,
  canRequestBetaAccess: true,
  canAccessMyEvents: false,
  canAccessMyAccount: false,
  canManageSessions: false,
  canManageAccountDeletion: false,
  isDeletionRestricted: false,
  canSignOut: false
});

@Injectable({ providedIn: 'root' })
export class OrganizerSessionService {
  private readonly client = createEventLensClient();
  private transientCsrfToken: string | null = null;
  private readonly clearCacheListeners = new Set<() => void>();

  private readonly snapshotSignal = signal<OrganizerSessionSnapshot>({
    state: 'CHECKING',
    capabilities: ZERO_PRIVATE_CAPABILITIES,
    account: null
  });
  private readonly isLoggingOutSignal = signal(false);
  private readonly lastLogoutAnnouncementSignal = signal<string | null>(null);
  private readonly logoutUncertaintyMessageSignal = signal<string | null>(null);

  readonly snapshot = this.snapshotSignal.asReadonly();
  readonly state = computed(() => this.snapshotSignal().state);
  readonly capabilities = computed(() => this.snapshotSignal().capabilities);
  readonly account = computed(() => this.snapshotSignal().account);
  readonly isLoggingOut = this.isLoggingOutSignal.asReadonly();
  readonly lastLogoutAnnouncement = this.lastLogoutAnnouncementSignal.asReadonly();
  readonly logoutUncertaintyMessage = this.logoutUncertaintyMessageSignal.asReadonly();

  registerOrganizerCacheClearer(listener: () => void): () => void {
    this.clearCacheListeners.add(listener);
    return () => this.clearCacheListeners.delete(listener);
  }

  private notifyOrganizerCachesCleared(): void {
    for (const listener of this.clearCacheListeners) {
      try {
        listener();
      } catch {
        // Ignore individual cache clearer errors
      }
    }
  }

  getCsrfToken(): string | null {
    return this.transientCsrfToken;
  }

  setCsrfToken(token: string | null): void {
    this.transientCsrfToken = token && token.trim() !== '' ? token.trim() : null;
  }

  dismissLogoutAnnouncement(): void {
    this.lastLogoutAnnouncementSignal.set(null);
  }

  applyServerProjection(
    projection: ServerOrganizerSessionProjection,
    csrfTokenHeader?: string | null
  ): OrganizerSessionSnapshot {
    if (
      projection.state === 'ORGANIZER_ACTIVE' ||
      projection.state === 'PASSWORD_CHANGE_REQUIRED' ||
      projection.state === 'ORGANIZER_RESTRICTED_DELETION'
    ) {
      if (csrfTokenHeader !== undefined) {
        this.setCsrfToken(csrfTokenHeader);
      }
      this.logoutUncertaintyMessageSignal.set(null);
      const next: OrganizerSessionSnapshot = {
        state: projection.state,
        capabilities: { ...projection.capabilities },
        account: projection.account ? { ...projection.account } : null
      };
      this.snapshotSignal.set(next);
      return next;
    }

    this.transientCsrfToken = null;
    this.notifyOrganizerCachesCleared();
    const anonymousSnapshot: OrganizerSessionSnapshot = {
      state: 'ANONYMOUS',
      capabilities: { ...(projection.capabilities ?? ANONYMOUS_CAPABILITIES) },
      account: null
    };
    this.snapshotSignal.set(anonymousSnapshot);
    return anonymousSnapshot;
  }

  clearLocalSessionProjection(targetState: 'ANONYMOUS' | 'UNAVAILABLE' = 'ANONYMOUS'): void {
    if (targetState === 'ANONYMOUS') {
      this.transientCsrfToken = null;
    }
    this.notifyOrganizerCachesCleared();
    this.snapshotSignal.set({
      state: targetState,
      capabilities:
        targetState === 'ANONYMOUS' ? ANONYMOUS_CAPABILITIES : ZERO_PRIVATE_CAPABILITIES,
      account: null
    });
  }

  resolveAuthorizedReturnDestination(rawReturnUrl?: unknown): string {
    if (this.snapshotSignal().state === 'PASSWORD_CHANGE_REQUIRED') return '/cambiar-contrasena';
    const canonical = canonicalizeInternalReturnUrl(rawReturnUrl);
    const snap = this.snapshotSignal();

    if (canonical === APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_DASHBOARD) {
      return snap.state === 'ORGANIZER_ACTIVE' && snap.capabilities.canAccessMyEvents
        ? APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_DASHBOARD
        : APPROVED_PUBLIC_ENTRY_PATHS.HOME;
    }

    if (canonical === APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_ACCOUNT) {
      return (snap.state === 'ORGANIZER_ACTIVE' ||
        snap.state === 'ORGANIZER_RESTRICTED_DELETION') &&
        snap.capabilities.canAccessMyAccount
        ? APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_ACCOUNT
        : APPROVED_PUBLIC_ENTRY_PATHS.HOME;
    }

    if (!canonical) {
      if (snap.state === 'ORGANIZER_ACTIVE' && snap.capabilities.canAccessMyEvents) {
        return APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_DASHBOARD;
      }
      if (
        snap.state === 'ORGANIZER_RESTRICTED_DELETION' &&
        snap.capabilities.canAccessMyAccount
      ) {
        return APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_ACCOUNT;
      }
    }

    return APPROVED_PUBLIC_ENTRY_PATHS.HOME;
  }

  async refreshSessionProjection(): Promise<OrganizerSessionSnapshot> {
    this.snapshotSignal.set({
      state: 'CHECKING',
      capabilities: ZERO_PRIVATE_CAPABILITIES,
      account: null
    });

    try {
      const { data, error, response } = await this.client.GET('/api/v1/organizer/session');
      if (!response.ok || error || !data) {
        this.clearLocalSessionProjection('UNAVAILABLE');
        return this.snapshotSignal();
      }
      const csrfHeader = response.headers?.get?.('x-csrf-token') ?? null;
      return this.applyServerProjection(data, csrfHeader);
    } catch {
      this.clearLocalSessionProjection('UNAVAILABLE');
      return this.snapshotSignal();
    }
  }

  async login(
    credentials: { email: string; password: string },
    rawReturnUrl?: unknown
  ): Promise<OrganizerLoginOutcome> {
    this.lastLogoutAnnouncementSignal.set(null);
    this.logoutUncertaintyMessageSignal.set(null);

    try {
      const { data, error, response } = await this.client.POST('/api/v1/organizer/session/login', {
        body: {
          email: credentials.email.trim(),
          password: credentials.password
        }
      });

      if (response.ok && data) {
        const csrfHeader = response.headers?.get?.('x-csrf-token') ?? null;
        const snapshot = this.applyServerProjection(data, csrfHeader);
        const returnDestination = this.resolveAuthorizedReturnDestination(rawReturnUrl);
        return {
          ok: true,
          snapshot,
          returnDestination
        };
      }

      if (response.status === 429) {
        return {
          ok: false,
          status: 429,
          code: 'RATE_LIMITED',
          message:
            'Has realizado demasiados intentos de inicio de sesión. Espera unos minutos antes de volver a intentarlo.'
        };
      }

      if (response.status === 401 || response.status === 400 || response.status === 422) {
        return {
          ok: false,
          status: 401,
          code: 'UNAUTHENTICATED',
          message: 'Correo electrónico o contraseña incorrectos. Verifica tus datos e inténtalo de nuevo.'
        };
      }

      void error;
      return {
        ok: false,
        status: response.status || 503,
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'No pudimos verificar tus credenciales en este momento. Inténtalo nuevamente.'
      };
    } catch {
      return {
        ok: false,
        status: 503,
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'No pudimos verificar tus credenciales en este momento. Inténtalo nuevamente.'
      };
    }
  }

  async logout(): Promise<OrganizerLogoutOutcome> {
    if (this.isLoggingOutSignal()) {
      return {
        status: 'UNCERTAIN',
        message: 'Cerrando sesión…'
      };
    }

    this.isLoggingOutSignal.set(true);
    this.lastLogoutAnnouncementSignal.set(null);

    try {
      const csrfHeaderValue = this.transientCsrfToken ?? '';
      const { data, error, response } = await this.client.POST(
        '/api/v1/organizer/session/logout',
        {
          headers: csrfHeaderValue ? { 'X-CSRF-Token': csrfHeaderValue } : undefined
        }
      );

      if (response.ok && data) {
        this.applyServerProjection(data.projection, null);
        this.logoutUncertaintyMessageSignal.set(null);
        const announcement = 'Sesión cerrada.';
        this.lastLogoutAnnouncementSignal.set(announcement);
        return {
          status: 'CONFIRMED',
          outcome: data.outcome,
          announcement,
          redirectPath: APPROVED_PUBLIC_ENTRY_PATHS.HOME
        };
      }

      void error;
      this.clearLocalSessionProjection('UNAVAILABLE');
      const uncertainMsg =
        'No se pudo confirmar el cierre de sesión. Tu vista privada se ha retirado; puedes reintentar la confirmación.';
      this.logoutUncertaintyMessageSignal.set(uncertainMsg);
      return {
        status: 'UNCERTAIN',
        message: uncertainMsg
      };
    } catch {
      this.clearLocalSessionProjection('UNAVAILABLE');
      const uncertainMsg =
        'No se pudo confirmar el cierre de sesión. Tu vista privada se ha retirado; puedes reintentar la confirmación.';
      this.logoutUncertaintyMessageSignal.set(uncertainMsg);
      return {
        status: 'UNCERTAIN',
        message: uncertainMsg
      };
    } finally {
      this.isLoggingOutSignal.set(false);
    }
  }
}
