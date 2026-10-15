import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject, computed, signal } from '@angular/core';
import type { OrganizerEventModel } from './organizer.types.js';
import { EventStatusBadgeComponent } from '../lifecycle/event-status-badge.component.js';
import { APPROVED_PUBLIC_ENTRY_PATHS } from '../navigation/public-entry-routes.contract.js';
import { PublicEntryRouterService } from '../navigation/public-entry-router.service.js';
import { OrganizerSessionService } from '../organizer-session.service.js';

@Component({
  selector: 'eventlens-organizer-app-shell',
  standalone: true,
  imports: [CommonModule, EventStatusBadgeComponent],
  templateUrl: './organizer-app-shell.component.html',
  styleUrl: './organizer-app-shell.component.scss',
})
export class OrganizerAppShellComponent {
  private readonly sessionService = inject(OrganizerSessionService, { optional: true });
  private readonly router = inject(PublicEntryRouterService, { optional: true });

  @Input() selectedEvent?: OrganizerEventModel | null = null;
  @Input() activeNav: 'events' | 'account' | string = 'events';
  @Input() activeSubNav: 'datos-basicos' | 'seguridad' | 'sesiones' | string = 'datos-basicos';
  @Output() exitContext = new EventEmitter<void>();

  readonly myEventsPath = APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_DASHBOARD;
  readonly myAccountPath = APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_ACCOUNT;
  readonly homePath = APPROVED_PUBLIC_ENTRY_PATHS.HOME;

  logoFailed = false;
  avatarFailed = false;
  readonly isSidebarCollapsed = signal(false);

  readonly userEmail = computed(() => this.sessionService?.account()?.email ?? '');
  readonly userInitial = computed(() => {
    const email = this.userEmail();
    return email ? email.charAt(0).toUpperCase() : 'O';
  });
  readonly canAccessEvents = computed(
    () => this.sessionService?.capabilities()?.canAccessMyEvents ?? true
  );
  readonly canAccessAccount = computed(
    () => this.sessionService?.capabilities()?.canAccessMyAccount ?? true
  );

  toggleSidebar(): void {
    this.isSidebarCollapsed.update(v => !v);
  }

  onLogoError(): void {
    this.logoFailed = true;
  }

  onAvatarError(): void {
    this.avatarFailed = true;
  }

  onExitContext(): void {
    this.exitContext.emit();
  }

  onSubNavClick(event: Event, targetId: string): void {
    event.preventDefault();
    this.activeSubNav = targetId;
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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
    if (this.sessionService) {
      await this.sessionService.logout();
    }
    if (this.router) {
      void this.router.navigateByUrl(APPROVED_PUBLIC_ENTRY_PATHS.LOGIN);
    } else {
      window.location.href = APPROVED_PUBLIC_ENTRY_PATHS.LOGIN;
    }
  }
}
