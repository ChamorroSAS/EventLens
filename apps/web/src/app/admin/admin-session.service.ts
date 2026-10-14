import { Injectable, computed, signal } from '@angular/core';
import { createEventLensClient, type operations } from '@eventlens/api-client';
import { canonicalizeAdminReturnUrl } from '../navigation/return-url.canonicalizer.js';

export type AdminSessionProjection =
  operations['getAdminSession']['responses'][200]['content']['application/json'];

export type AdminSessionState = 'CHECKING' | 'ADMIN_ACTIVE' | 'ANONYMOUS' | 'UNAVAILABLE';

export interface AdminSessionSnapshot {
  readonly state: AdminSessionState;
  readonly principal: AdminSessionProjection['principal'];
  readonly authTime?: string;
}

export type AdminLoginOutcome =
  | { readonly ok: true; readonly returnDestination: string }
  | { readonly ok: false; readonly message: string };

export type AdminLogoutOutcome =
  | { readonly status: 'CONFIRMED' }
  | { readonly status: 'UNCERTAIN'; readonly message: string };

const EMPTY_SNAPSHOT: AdminSessionSnapshot = Object.freeze({
  state: 'CHECKING',
  principal: null
});

@Injectable({ providedIn: 'root' })
export class AdminSessionService {
  private readonly client = createEventLensClient();
  private transientCsrfToken: string | null = null;
  private readonly cacheClearers = new Set<() => void>();
  private readonly snapshotSignal = signal<AdminSessionSnapshot>(EMPTY_SNAPSHOT);
  private readonly logoutUncertaintySignal = signal<string | null>(null);
  private readonly announcementSignal = signal<string | null>(null);
  private readonly revalidatingSignal = signal(false);
  private requestGeneration = 0;

  readonly snapshot = this.snapshotSignal.asReadonly();
  readonly state = computed(() => this.snapshotSignal().state);
  readonly principal = computed(() => this.snapshotSignal().principal);
  readonly logoutUncertainty = this.logoutUncertaintySignal.asReadonly();
  readonly announcement = this.announcementSignal.asReadonly();
  readonly isRevalidating = this.revalidatingSignal.asReadonly();

  registerPrivateCacheClearer(clearer: () => void): () => void {
    this.cacheClearers.add(clearer);
    return () => this.cacheClearers.delete(clearer);
  }

  getCsrfToken(): string | null {
    return this.transientCsrfToken;
  }

  /** Called by private read models; status is the only data accepted from an HTTP failure. */
  invalidateProtectedRead(status: number): void {
    this.clearPrivatePresentation(status === 401 || status === 403 ? 'ANONYMOUS' : 'UNAVAILABLE');
  }

  private clearPrivatePresentation(
    nextState: 'ANONYMOUS' | 'UNAVAILABLE' | 'CHECKING',
    invalidatePending = true
  ): void {
    if (invalidatePending) this.requestGeneration++;
    if (nextState !== 'CHECKING') this.revalidatingSignal.set(false);
    this.transientCsrfToken = null;
    for (const clearer of this.cacheClearers) {
      try {
        clearer();
      } catch {
        // A cache listener cannot keep a private presentation alive.
      }
    }
    this.snapshotSignal.set({ state: nextState, principal: null });
  }

  private applyProjection(projection: AdminSessionProjection): AdminSessionSnapshot {
    if (projection.state === 'ADMIN_ACTIVE' && projection.principal) {
      const previous = this.snapshotSignal();
      if (
        previous.state !== 'ADMIN_ACTIVE' ||
        previous.principal?.id !== projection.principal.id
      ) {
        this.clearPrivatePresentation('CHECKING', false);
      }
      const next: AdminSessionSnapshot = {
        state: 'ADMIN_ACTIVE',
        principal: { ...projection.principal },
        authTime: projection.authTime
      };
      this.logoutUncertaintySignal.set(null);
      this.snapshotSignal.set(next);
      return next;
    }

    this.clearPrivatePresentation('ANONYMOUS');
    return this.snapshotSignal();
  }

  async refreshSession(): Promise<AdminSessionSnapshot> {
    // A failed explicit logout must be reconciled only by the explicit logout action.
    // Navigation, guards and background checks cannot revive its private presentation.
    if (this.logoutUncertaintySignal()) return this.snapshotSignal();
    const generation = ++this.requestGeneration;
    this.revalidatingSignal.set(true);
    if (this.snapshotSignal().state !== 'ADMIN_ACTIVE') {
      this.clearPrivatePresentation('CHECKING', false);
    }
    try {
      const { data, response } = await this.client.GET('/api/v1/admin/auth/session', {});
      if (generation !== this.requestGeneration) return this.snapshotSignal();
      if (response.ok && data) {
        return this.applyProjection(data);
      }
      this.clearPrivatePresentation(
        response.status === 401 || response.status === 403 ? 'ANONYMOUS' : 'UNAVAILABLE',
        false
      );
      return this.snapshotSignal();
    } catch {
      if (generation === this.requestGeneration) this.clearPrivatePresentation('UNAVAILABLE', false);
      return this.snapshotSignal();
    } finally {
      if (generation === this.requestGeneration) this.revalidatingSignal.set(false);
    }
  }

  async login(
    credentials: { identifier: string; secret: string },
    rawReturnUrl?: unknown
  ): Promise<AdminLoginOutcome> {
    const generation = ++this.requestGeneration;
    this.logoutUncertaintySignal.set(null);
    this.announcementSignal.set(null);
    // A login always begins a new browser session context. Cached private data from a
    // prior principal (or a prior session for the same principal) must not survive it.
    this.clearPrivatePresentation('CHECKING', false);
    try {
      const { data, response } = await this.client.POST('/api/v1/admin/auth/login', {
        body: { identifier: credentials.identifier.trim(), secret: credentials.secret },
        headers: { 'X-EventLens-Admin-Client': '1' }
      });
      if (generation !== this.requestGeneration) {
        return { ok: false, message: 'El acceso administrativo no está disponible. Reintenta más tarde.' };
      }
      if (response.ok && data) {
        this.transientCsrfToken = data.csrfToken;
        this.snapshotSignal.set({
          state: 'ADMIN_ACTIVE',
          principal: { ...data.principal }
        });
        return { ok: true, returnDestination: canonicalizeAdminReturnUrl(rawReturnUrl) };
      }

      this.clearPrivatePresentation(response.status === 503 ? 'UNAVAILABLE' : 'ANONYMOUS');
      return {
        ok: false,
        message:
          response.status === 503
            ? 'El acceso administrativo no está disponible. Reintenta más tarde.'
            : 'No se pudo iniciar sesión con los datos proporcionados.'
      };
    } catch {
      if (generation === this.requestGeneration) this.clearPrivatePresentation('UNAVAILABLE', false);
      return {
        ok: false,
        message: 'El acceso administrativo no está disponible. Reintenta más tarde.'
      };
    }
  }

  async renewSessionContext(): Promise<boolean> {
    const generation = ++this.requestGeneration;
    try {
      const { data, response } = await this.client.POST('/api/v1/admin/auth/session-context', {
        headers: { 'X-EventLens-Admin-Client': '1' }
      });
      if (generation !== this.requestGeneration) return false;
      if (response.ok && data) {
        this.transientCsrfToken = data.csrfToken;
        return true;
      }
      this.clearPrivatePresentation(response.status === 401 || response.status === 403 ? 'ANONYMOUS' : 'UNAVAILABLE');
      return false;
    } catch {
      if (generation === this.requestGeneration) this.clearPrivatePresentation('UNAVAILABLE', false);
      return false;
    }
  }

  async logout(): Promise<AdminLogoutOutcome> {
    const generation = ++this.requestGeneration;
    this.revalidatingSignal.set(false);
    let csrfToken = this.transientCsrfToken;
    this.clearPrivatePresentation('CHECKING', false);
    try {
      if (!csrfToken) {
        const context = await this.client.POST('/api/v1/admin/auth/session-context', {
          headers: { 'X-EventLens-Admin-Client': '1' }
        });
        if (generation !== this.requestGeneration) {
          return { status: 'UNCERTAIN', message: 'No se pudo confirmar el cierre de sesión.' };
        }
        if (!context.response.ok || !context.data) {
          this.clearPrivatePresentation(
            context.response.status === 401 || context.response.status === 403 ? 'ANONYMOUS' : 'UNAVAILABLE',
            false
          );
          const message = 'No se pudo confirmar el cierre de sesión. Tu vista privada se ha retirado; puedes reintentar la confirmación.';
          this.logoutUncertaintySignal.set(message);
          return { status: 'UNCERTAIN', message };
        }
        // This token exists only in the local stack frame and is never saved to UI state.
        csrfToken = context.data.csrfToken;
      }
      const { data, response } = await this.client.POST('/api/v1/admin/auth/logout', {
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined
      });
      if (generation !== this.requestGeneration) {
        return { status: 'UNCERTAIN', message: 'No se pudo confirmar el cierre de sesión.' };
      }
      if (response.ok && data?.outcome === 'LOGGED_OUT') {
        this.clearPrivatePresentation('ANONYMOUS');
        this.logoutUncertaintySignal.set(null);
        this.announcementSignal.set('La sesión administrativa se cerró correctamente.');
        return { status: 'CONFIRMED' };
      }
    } catch {
      // The same fail-closed presentation applies to transport failure.
    }

    if (generation !== this.requestGeneration) {
      return { status: 'UNCERTAIN', message: 'No se pudo confirmar el cierre de sesión.' };
    }
    this.clearPrivatePresentation('UNAVAILABLE', false);
    const message =
      'No se pudo confirmar el cierre de sesión. Tu vista privada se ha retirado; puedes reintentar la confirmación.';
    this.logoutUncertaintySignal.set(message);
    return { status: 'UNCERTAIN', message };
  }

  /** Explicit user reconciliation after an uncertain logout; never invoked automatically. */
  retryLogout(): Promise<AdminLogoutOutcome> {
    return this.logout();
  }
}
