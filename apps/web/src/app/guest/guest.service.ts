import { Injectable, signal } from '@angular/core';
import {
  PublicAccessView,
  GuestSessionState,
  GuestContributionView,
  RemovalIntakeView
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
}
