import {
  Component,
  HostListener,
  inject,
  signal
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { APPROVED_PUBLIC_ENTRY_PATHS } from '../navigation/public-entry-routes.contract';
import { PublicEntryRouterService } from '../navigation/public-entry-router.service';
import { OrganizerSessionService } from '../organizer-session.service';

@Component({
  selector: 'eventlens-app-header',
  standalone: true,
  templateUrl: './app-header.component.html',
  styleUrl: './app-header.component.scss'
})
export class AppHeaderComponent {
  readonly router = inject(PublicEntryRouterService, { optional: true });
  readonly sessionService = inject(OrganizerSessionService);
  private readonly doc = inject(DOCUMENT);

  readonly mobileMenuOpen = signal(false);

  readonly homePath = APPROVED_PUBLIC_ENTRY_PATHS.HOME;
  readonly loginPath = APPROVED_PUBLIC_ENTRY_PATHS.LOGIN;
  readonly betaPath = APPROVED_PUBLIC_ENTRY_PATHS.BETA_ACCESS;
  readonly accountPath = APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_ACCOUNT;
  readonly eventsPath = APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_DASHBOARD;

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.mobileMenuOpen()) {
      this.mobileMenuOpen.set(false);
    }
  }

  onNavigateHome(event: MouseEvent): void {
    if (!this.router) return;
    event.preventDefault();
    this.mobileMenuOpen.set(false);
    void this.router.navigateByUrl(APPROVED_PUBLIC_ENTRY_PATHS.HOME);
  }

  onNavigate(event: MouseEvent, path: string): void {
    if (!this.router) return;
    event.preventDefault();
    this.mobileMenuOpen.set(false);
    void this.router.navigateByUrl(path);
  }

  onAnchorClick(event: MouseEvent, anchorId: string): void {
    this.mobileMenuOpen.set(false);
    const currentSafePath = this.router?.currentSafePath() ?? '/';

    if (currentSafePath === APPROVED_PUBLIC_ENTRY_PATHS.HOME) {
      event.preventDefault();
      const targetElement = this.doc.getElementById(anchorId);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth' });
        const focusTarget =
          targetElement.querySelector('h2, [tabindex="-1"]') || targetElement;
        (focusTarget as HTMLElement).focus?.();
      }
    } else {
      if (this.router) {
        event.preventDefault();
        void this.router.navigateByUrl(`/#${anchorId}`);
      }
    }
  }

  async onLogout(): Promise<void> {
    this.mobileMenuOpen.set(false);
    await this.sessionService.logout();
    if (this.router) {
      void this.router.navigateByUrl(APPROVED_PUBLIC_ENTRY_PATHS.HOME);
    }
  }
}
