import { Injectable, signal } from '@angular/core';
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

@Injectable({
  providedIn: 'root'
})
export class GuestService {
  readonly currentSession = signal<GuestSessionState | null>(null);
  readonly contributions = signal<GuestContributionView[]>([]);

  public getSession(): GuestSessionState | null {
    return this.currentSession();
  }

  public setSession(session: GuestSessionState | null): void {
    this.currentSession.set(session);
  }

  public clearSession(): void {
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

  public isReadyToUpload(): boolean {
    const sess = this.currentSession();
    if (!sess) return false;
    return sess.hasConsented && Boolean(sess.contributorNickname);
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
      if (res.status === 401) throw new Error('SESSION_INVALID');
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
