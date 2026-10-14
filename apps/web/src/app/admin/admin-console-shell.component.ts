import { Component, Input, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AdminSessionService } from './admin-session.service.js';

/**
 * Shared chrome for the authenticated administrative surfaces.
 *
 * It mirrors the organizer panel (brand header, collapsible sidebar with a
 * profile card and navigation, main area and footer) so both panels share one
 * visual language. It is presentational: the routed screens project their
 * content, and session/guards/contracts stay untouched.
 */
@Component({
  selector: 'eventlens-admin-console-shell',
  standalone: true,
  imports: [],
  templateUrl: './admin-console-shell.component.html',
  styleUrl: './admin-console-shell.component.scss',
})
export class AdminConsoleShellComponent {
  private readonly sessionService = inject(AdminSessionService, { optional: true });
  private readonly router = inject(Router, { optional: true });

  /** Marks the active sidebar entry, passed by the routed screen. */
  @Input() activeNav: 'organizadores' | 'eventos' | string = 'eventos';

  readonly organizersPath = '/admin/organizadores';
  readonly eventsPath = '/admin/eventos';
  readonly loginPath = '/admin/ingresar';

  logoFailed = false;
  readonly isSidebarCollapsed = signal(false);

  readonly userIdentifier = computed(() => this.sessionService?.principal?.()?.identifier ?? '');
  readonly userInitial = computed(() => {
    const identifier = this.userIdentifier();
    return identifier ? identifier.charAt(0).toUpperCase() : 'A';
  });

  toggleSidebar(): void {
    this.isSidebarCollapsed.update((value) => !value);
  }

  onLogoError(): void {
    this.logoFailed = true;
  }

  onNavigate(event: Event, path: string): void {
    event.preventDefault();
    if (this.router) {
      void this.router.navigateByUrl(path);
    } else {
      window.location.href = path;
    }
  }

  async onLogout(): Promise<void> {
    await this.sessionService?.logout?.();
    if (this.router) {
      void this.router.navigateByUrl(this.loginPath);
    } else {
      window.location.href = this.loginPath;
    }
  }
}
