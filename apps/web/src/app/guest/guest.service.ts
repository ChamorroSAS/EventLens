import { Injectable, signal, computed } from '@angular/core';
import { createEventLensClient } from '@eventlens/api-client';
import {
  PublicAccessView,
  GuestSessionState,
  GuestContributionView,
  RemovalIntakeView,
  OwnRemovalCommandPayload,
  OwnRemovalResult,
  GuestIntakeCommandPayload,
  GuestIntakeResult
} from './guest.types.js';

export type GuestEntryResolutionOutcome =
  | {
      readonly ok: true;
      readonly access: PublicAccessView;
      readonly session: GuestSessionState | null;
      readonly contributions: GuestContributionView[];
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly code: string;
      readonly message: string;
    };

export type GuestSessionActionOutcome =
  | {
      readonly ok: true;
      readonly session: GuestSessionState;
      readonly contributions?: GuestContributionView[];
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly code: string;
      readonly message: string;
    };

export type GuestRemovalIntakeOutcome =
  | {
      readonly ok: true;
      readonly intake: RemovalIntakeView;
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly message: string;
    };

@Injectable({
  providedIn: 'root'
})
export class GuestService {
  private readonly client = createEventLensClient();
  private contextVersion = 0;
  private activeLookupKey: string | null = null;
  private readonly pendingRequests = new Set<AbortController>();

  /** Cancels requests for the previous route/session before they can publish receipts. */
  public getContextVersion(): number { return this.contextVersion; }

  public invalidatePendingRequests(expectedVersion?: number): number | null {
    if (expectedVersion !== undefined && expectedVersion !== this.contextVersion) return null;
    this.contextVersion++;
    for (const controller of this.pendingRequests) controller.abort();
    this.pendingRequests.clear();
    return this.contextVersion;
  }

  private captureRequest() {
    const controller = new AbortController();
    this.pendingRequests.add(controller);
    return { version: this.contextVersion, controller, session: this.currentSession(), access: this.currentAccessView() };
  }

  private isCurrentRequest(request: ReturnType<GuestService['captureRequest']>): boolean {
    const current = this.currentSession();
    return request.version === this.contextVersion &&
      (!request.session || (current?.id === request.session.id && current.eventId === request.session.eventId && current.credentialGeneration === request.session.credentialGeneration));
  }

  private receiptMatches(request: ReturnType<GuestService['captureRequest']>, receipt: GuestSessionState): boolean {
    return (!request.session || (request.session.id === receipt.id && request.session.eventId === receipt.eventId && request.session.credentialGeneration === receipt.credentialGeneration)) &&
      (!request.access || (request.access.eventId === receipt.eventId && request.access.generation === receipt.credentialGeneration));
  }

  private obsoleteOutcome() {
    return { ok: false as const, status: 409, code: 'OBSOLETE_GUEST_CONTEXT', message: 'La solicitud pertenece a un acceso anterior. Vuelve a intentarlo desde el evento actual.' };
  }

  readonly currentSession = signal<GuestSessionState | null>(null);
  readonly contributions = signal<GuestContributionView[]>([]);
  readonly currentAccessView = signal<PublicAccessView | null>(null);

  public getSession(): GuestSessionState | null {
    return this.currentSession();
  }

  public setSession(session: GuestSessionState | null): void {
    this.invalidatePendingRequests();
    this.currentSession.set(session);
  }

  public clearSession(): void {
    this.invalidatePendingRequests();
    this.currentSession.set(null);
    this.contributions.set([]);
  }

  public recordConsent(version: string): void {
    const sess = this.currentSession();
    if (sess) {
      this.currentSession.set({
        ...sess,
        hasConsented: true,
        consentVersion: version
      });
    }
  }

  public setContributorNickname(nickname: string): void {
    const sess = this.currentSession();
    if (sess) {
      this.currentSession.set({
        ...sess,
        contributorNickname: nickname.trim()
      });
    }
  }

  public setContributions(items: GuestContributionView[]): void {
    this.contributions.set(items);
  }

  public getContributions(): GuestContributionView[] {
    return this.contributions();
  }

  public readonly isReadyToUpload = computed(() => {
    const sess = this.currentSession();
    if (!sess) return false;
    return sess.hasConsented && Boolean(sess.contributorNickname);
  });

  /**
   * Resolves public access and authoritative session receipt via generated API client (EL-TK-211 / EL-TK-074 / EL-TK-075).
   * Never stores raw session tokens in JavaScript; session lives in HttpOnly cookie.
   */
  public async resolvePublicEntry(lookupKey: string): Promise<GuestEntryResolutionOutcome> {
    this.invalidatePendingRequests();
    this.currentSession.set(null);
    this.contributions.set([]);
    this.currentAccessView.set(null);
    const trimmedKey = lookupKey.trim();
    this.activeLookupKey = trimmedKey || null;
    if (!trimmedKey) {
      this.clearSession();
      this.currentAccessView.set(null);
      return {
        ok: false,
        status: 404,
        code: 'GUEST_ENTRY_NOT_FOUND',
        message: 'El enlace de acceso no es válido o ha sido revocado.'
      };
    }

    const request = this.captureRequest();
    try {
      const { data, error, response } = await this.client.GET(
        '/api/v1/public/guest-entry/{lookupKey}',
        {
          signal: request.controller.signal,
          params: { path: { lookupKey: trimmedKey } }
        }
      );

      if (!this.isCurrentRequest(request)) return this.obsoleteOutcome();

      if (!response.ok || !data) {
        this.clearSession();
        this.currentAccessView.set(null);
        const errObj = error as { code?: string; message?: string } | undefined;
        return {
          ok: false,
          status: response.status,
          code: errObj?.code ?? 'GUEST_ENTRY_NOT_FOUND',
          message:
            errObj?.message ??
            (response.status === 404
              ? 'El enlace de acceso no es válido o ha sido revocado.'
              : 'No se pudo verificar el enlace del evento temporalmente.')
        };
      }

      const accessView: PublicAccessView = {
        accessState: data.access.accessState,
        eventId: data.access.eventId,
        name: data.access.name,
        status: data.access.status,
        timezone: data.access.timezone,
        scheduledAt: data.access.scheduledAt ?? null,
        welcomeMessage: data.access.welcomeMessage ?? null,
        generation: data.access.generation,
        pinRequired: data.access.pinRequired,
        canViewLanding: data.access.canViewLanding,
        canUpload: data.access.canUpload,
        canViewGallery: data.access.canViewGallery,
        ...(data.access.restrictionReason
          ? { restrictionReason: data.access.restrictionReason }
          : {})
      };

      if (data.session && (data.session.eventId !== accessView.eventId || data.session.credentialGeneration !== accessView.generation)) return this.obsoleteOutcome();
      this.currentAccessView.set(accessView);

      if (data.session && data.access.accessState !== 'UNAVAILABLE') {
        const sessionReceipt: GuestSessionState = {
          id: data.session.id,
          eventId: data.session.eventId,
          credentialGeneration: data.session.credentialGeneration,
          contributorNickname: data.session.contributorNickname,
          hasConsented: data.session.hasConsented,
          consentVersion: data.session.consentVersion
        };
        const items: GuestContributionView[] = (data.contributions ?? []).map((item) => ({
          attemptId: item.attemptId,
          mediaType: item.mediaType,
          status: item.status,
          declaredSize: item.declaredSize,
          actualSize: item.actualSize,
          detectedType: item.detectedType,
          durationSeconds: item.durationSeconds,
          createdAt: item.createdAt,
          rejectionReason: item.rejectionReason
        }));
        this.currentSession.set(sessionReceipt);
        this.contributions.set(items);
        return {
          ok: true,
          access: accessView,
          session: sessionReceipt,
          contributions: items
        };
      }

      this.currentSession.set(null);
      this.contributions.set([]);
      return {
        ok: true,
        access: accessView,
        session: null,
        contributions: []
      };
    } catch {
      if (!this.isCurrentRequest(request)) return this.obsoleteOutcome();
      return {
        ok: false,
        status: 503,
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'No se pudo conectar con el evento temporalmente. Intenta de nuevo.'
      };
    } finally {
      this.pendingRequests.delete(request.controller);
    }
  }

  /**
   * Verifies optional PIN and establishes an anonymous guest session via HttpOnly cookie (EL-TK-211 / EL-TK-075).
   */
  public async submitPin(
    lookupKey: string,
    pin: string
  ): Promise<GuestSessionActionOutcome> {
    if (this.activeLookupKey && this.activeLookupKey !== lookupKey.trim()) return this.obsoleteOutcome();
    const request = this.captureRequest();
    try {
      const { data, error, response } = await this.client.POST(
        '/api/v1/public/guest-entry/{lookupKey}/session',
        {
          signal: request.controller.signal,
          params: { path: { lookupKey: lookupKey.trim() } },
          body: { pin }
        }
      );

      if (!this.isCurrentRequest(request)) return this.obsoleteOutcome();

      if (!response.ok || !data) {
        if (response.status === 404 || response.status === 403) {
          this.clearSession();
        }
        const errObj = error as { code?: string; message?: string } | undefined;
        return {
          ok: false,
          status: response.status,
          code: errObj?.code ?? 'INVALID_PIN',
          message:
            errObj?.message ??
            (response.status === 429
              ? 'Demasiados intentos fallidos de PIN. Espera unos minutos antes de volver a intentarlo.'
              : 'El código PIN ingresado es incorrecto.')
        };
      }

      const sessionReceipt: GuestSessionState = {
        id: data.session.id,
        eventId: data.session.eventId,
        credentialGeneration: data.session.credentialGeneration,
        contributorNickname: data.session.contributorNickname,
        hasConsented: data.session.hasConsented,
        consentVersion: data.session.consentVersion
      };
      const items: GuestContributionView[] = (data.contributions ?? []).map((item) => ({
        attemptId: item.attemptId,
        mediaType: item.mediaType,
        status: item.status,
        declaredSize: item.declaredSize,
        actualSize: item.actualSize,
        detectedType: item.detectedType,
        durationSeconds: item.durationSeconds,
        createdAt: item.createdAt,
        rejectionReason: item.rejectionReason
      }));

      if (!this.receiptMatches(request, sessionReceipt)) return this.obsoleteOutcome();
      this.currentSession.set(sessionReceipt);
      this.contributions.set(items);

      return {
        ok: true,
        session: sessionReceipt,
        contributions: items
      };
    } catch {
      if (!this.isCurrentRequest(request)) return this.obsoleteOutcome();
      return {
        ok: false,
        status: 503,
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'No se pudo verificar el PIN temporalmente. Intenta de nuevo.'
      };
    } finally {
      this.pendingRequests.delete(request.controller);
    }
  }

  /**
   * Confirms explicit versioned consent against the authoritative backend session (EL-TK-211 / EL-TK-076).
   * If the session was revoked or expired (401), clears local receipt and contributions immediately.
   */
  public async confirmConsent(
    documentVersion: string,
    accepted = true
  ): Promise<GuestSessionActionOutcome> {
    const request = this.captureRequest();
    try {
      const { data, error, response } = await this.client.POST(
        '/api/v1/public/guest-session/consent',
        {
          signal: request.controller.signal,
          body: { documentVersion, accepted }
        }
      );

      if (!this.isCurrentRequest(request)) return this.obsoleteOutcome();

      if (!response.ok || !data) {
        if (response.status === 401) {
          this.clearSession();
        }
        const errObj = error as { code?: string; message?: string } | undefined;
        return {
          ok: false,
          status: response.status,
          code: errObj?.code ?? 'CONSENT_REJECTED',
          message:
            errObj?.message ??
            (response.status === 401
              ? 'Tu sesión de invitado ha expirado o fue revocada.'
              : 'No se pudo registrar el consentimiento.')
        };
      }

      const sessionReceipt: GuestSessionState = {
        id: data.session.id,
        eventId: data.session.eventId,
        credentialGeneration: data.session.credentialGeneration,
        contributorNickname: data.session.contributorNickname,
        hasConsented: data.session.hasConsented,
        consentVersion: data.session.consentVersion
      };
      if (!this.receiptMatches(request, sessionReceipt)) return this.obsoleteOutcome();
      this.currentSession.set(sessionReceipt);
      return {
        ok: true,
        session: sessionReceipt
      };
    } catch {
      if (!this.isCurrentRequest(request)) return this.obsoleteOutcome();
      return {
        ok: false,
        status: 503,
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'No se pudo registrar el consentimiento temporalmente.'
      };
    } finally {
      this.pendingRequests.delete(request.controller);
    }
  }

  /**
   * Saves contributor nickname against the authoritative backend session (EL-TK-211 / EL-TK-077).
   * If the session was revoked or expired (401), clears local receipt and contributions immediately.
   */
  public async saveContributorNickname(
    nickname: string
  ): Promise<GuestSessionActionOutcome> {
    const request = this.captureRequest();
    try {
      const { data, error, response } = await this.client.POST(
        '/api/v1/public/guest-session/nickname',
        {
          signal: request.controller.signal,
          body: { nickname }
        }
      );

      if (!this.isCurrentRequest(request)) return this.obsoleteOutcome();

      if (!response.ok || !data) {
        if (response.status === 401) {
          this.clearSession();
        }
        const errObj = error as { code?: string; message?: string } | undefined;
        return {
          ok: false,
          status: response.status,
          code: errObj?.code ?? 'INVALID_CONTRIBUTOR_NICKNAME',
          message:
            errObj?.message ??
            (response.status === 401
              ? 'Tu sesión de invitado ha expirado o fue revocada.'
              : 'El nombre o apodo debe tener entre 1 y 60 caracteres válidos.')
        };
      }

      const sessionReceipt: GuestSessionState = {
        id: data.session.id,
        eventId: data.session.eventId,
        credentialGeneration: data.session.credentialGeneration,
        contributorNickname: data.session.contributorNickname,
        hasConsented: data.session.hasConsented,
        consentVersion: data.session.consentVersion
      };
      if (!this.receiptMatches(request, sessionReceipt)) return this.obsoleteOutcome();
      this.currentSession.set(sessionReceipt);
      return {
        ok: true,
        session: sessionReceipt
      };
    } catch {
      if (!this.isCurrentRequest(request)) return this.obsoleteOutcome();
      return {
        ok: false,
        status: 503,
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'No se pudo guardar tu nombre temporalmente.'
      };
    } finally {
      this.pendingRequests.delete(request.controller);
    }
  }

  /**
   * Queries guest's own contributions ("Mis aportes") from the authoritative backend session (EL-TK-211 / EL-TK-078).
   * If the session was revoked or expired (401), clears local receipt and contributions immediately.
   */
  public async refreshOwnContributions(): Promise<GuestSessionActionOutcome> {
    const request = this.captureRequest();
    try {
      const { data, error, response } = await this.client.GET(
        '/api/v1/public/guest-session/contributions',
        { signal: request.controller.signal }
      );

      if (!this.isCurrentRequest(request)) return this.obsoleteOutcome();

      if (!response.ok || !data) {
        if (response.status === 401) {
          this.clearSession();
        }
        const errObj = error as { code?: string; message?: string } | undefined;
        return {
          ok: false,
          status: response.status,
          code: errObj?.code ?? 'GUEST_SESSION_INVALID',
          message:
            errObj?.message ??
            'Tu sesión de invitado ha expirado o fue revocada.'
        };
      }

      const sessionReceipt: GuestSessionState = {
        id: data.session.id,
        eventId: data.session.eventId,
        credentialGeneration: data.session.credentialGeneration,
        contributorNickname: data.session.contributorNickname,
        hasConsented: data.session.hasConsented,
        consentVersion: data.session.consentVersion
      };
      const items: GuestContributionView[] = (data.contributions ?? []).map((item) => ({
        attemptId: item.attemptId,
        mediaType: item.mediaType,
        status: item.status,
        declaredSize: item.declaredSize,
        actualSize: item.actualSize,
        detectedType: item.detectedType,
        durationSeconds: item.durationSeconds,
        createdAt: item.createdAt,
        rejectionReason: item.rejectionReason
      }));

      if (!this.receiptMatches(request, sessionReceipt)) return this.obsoleteOutcome();
      this.currentSession.set(sessionReceipt);
      this.contributions.set(items);

      return {
        ok: true,
        session: sessionReceipt,
        contributions: items
      };
    } catch {
      if (!this.isCurrentRequest(request)) return this.obsoleteOutcome();
      return {
        ok: false,
        status: 503,
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'No se pudieron consultar tus aportes temporalmente.'
      };
    } finally {
      this.pendingRequests.delete(request.controller);
    }
  }

  /**
   * Queries the removal intake route and official disclaimer without requiring or recovering a session (EL-TK-211 / EL-TK-082).
   */
  public async resolveRemovalIntake(
    lookupKey: string
  ): Promise<GuestRemovalIntakeOutcome> {
    try {
      const { data, error, response } = await this.client.GET(
        '/api/v1/public/guest-entry/{lookupKey}/removal-intake',
        {
          params: { path: { lookupKey: lookupKey.trim() } }
        }
      );

      if (!response.ok || !data) {
        const errObj = error as { message?: string } | undefined;
        return {
          ok: false,
          status: response.status,
          message:
            errObj?.message ??
            'No se pudo abrir la información de solicitud de retiro.'
        };
      }

      return {
        ok: true,
        intake: {
          eventId: data.eventId,
          eventName: data.eventName,
          intakePath: data.intakePath,
          disclaimer: data.disclaimer,
          requiresSession: false
        }
      };
    } catch {
      return {
        ok: false,
        status: 503,
        message: 'No se pudo consultar la derivación de retiro temporalmente.'
      };
    }
  }

  /**
   * Performs irreversible own contribution removal (EL-TK-114 / EL-TK-121 / DEC-089 / DEC-097).
   */
  public async removeOwnContribution(payload: OwnRemovalCommandPayload): Promise<OwnRemovalResult> {
    const res = await fetch(`/api/v1/guest/contributions/remove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Guest-Session': payload.sessionToken
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      if (res.status === 401) {
        this.clearSession();
        throw new Error('SESSION_INVALID');
      }
      if (res.status === 403) throw new Error('NOT_OWNER');
      if (res.status === 409) throw new Error('CONCURRENCY_CONFLICT');
      if (res.status === 410) throw new Error('ALREADY_PURGED');
      throw new Error('COMMUNICATION_ERROR');
    }

    // Remove from local contributions signal
    const updated = this.contributions().filter(c => c.attemptId !== payload.mediaId);
    this.contributions.set(updated);

    return (await res.json()) as OwnRemovalResult;
  }

  /**
   * Submits a removal intake request without requiring a guest session (EL-TK-115 / EL-TK-121 / DEC-103..105).
   */
  public async submitRemovalIntake(payload: GuestIntakeCommandPayload): Promise<GuestIntakeResult> {
    const res = await fetch(`/api/v1/guest/removal-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      if (res.status === 429) throw new Error('RATE_LIMIT_EXCEEDED');
      if (res.status === 400) throw new Error('VALIDATION_FAILED');
      throw new Error('COMMUNICATION_ERROR');
    }

    return (await res.json()) as GuestIntakeResult;
  }
}
