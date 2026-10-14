import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject, computed } from '@angular/core';
import type { OrganizerEventModel } from './organizer.types.js';
import { EventStatusBadgeComponent } from '../lifecycle/event-status-badge.component.js';
import { APPROVED_PUBLIC_ENTRY_PATHS } from '../navigation/public-entry-routes.contract.js';
import { PublicEntryRouterService } from '../navigation/public-entry-router.service.js';
import { OrganizerSessionService } from '../organizer-session.service.js';

@Component({
  selector: 'eventlens-organizer-app-shell',
  standalone: true,
  imports: [CommonModule, EventStatusBadgeComponent],
  template: `
    <div class="organizer-shell">
      <header class="shell-header" role="banner">
        <div class="shell-container header-inner">
          <div class="brand-area">
            <a
              [href]="myEventsPath"
              (click)="onNavigate($event, myEventsPath)"
              class="brand-link"
              aria-label="Ir a Mis eventos"
            >
              <div class="brand-title">
                @if (!logoFailed) {
                  <img
                    src="assets/branding/phoeve/logo-primary.png"
                    alt="Phoeve"
                    class="brand-logo"
                    width="105"
                    height="35"
                    (error)="onLogoError()"
                  />
                } @else {
                  <span class="brand-fallback-text">Phoeve</span>
                }
              </div>
            </a>
            <span class="brand-badge">Organizador</span>
          </div>

          <div class="header-right">
            @if (selectedEvent) {
              <div class="event-context-area" role="region" aria-label="Contexto del evento activo">
                <span class="context-label">Evento activo:</span>
                <span class="context-event-name">{{ selectedEvent.name }}</span>
                <eventlens-event-status-badge [status]="selectedEvent.status" />
                <button
                  type="button"
                  class="btn-exit-context"
                  aria-label="Salir de la configuración del evento"
                  (click)="onExitContext()"
                >
                  Mis eventos
                </button>
              </div>
            }
          </div>
        </div>
      </header>

      <div class="shell-container shell-layout">
        <aside class="shell-sidebar" aria-label="Menú principal del organizador">
          <nav class="sidebar-nav">
            @if (canAccessEvents()) {
              <a
                [href]="myEventsPath"
                class="sidebar-nav-item"
                [class.is-active]="activeNav === 'events'"
                (click)="onNavigate($event, myEventsPath)"
                aria-label="Ir a Mis eventos"
                data-testid="sidebar-nav-events"
              >
                <span class="nav-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                </span>
                <span class="nav-label">Mis eventos</span>
              </a>
            }

            @if (canAccessAccount()) {
              <a
                [href]="myAccountPath"
                class="sidebar-nav-item"
                [class.is-active]="activeNav === 'account'"
                (click)="onNavigate($event, myAccountPath)"
                aria-label="Ir a Mi cuenta"
                data-testid="sidebar-nav-account"
              >
                <span class="nav-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                </span>
                <span class="nav-label">Mi cuenta</span>
              </a>
            }
          </nav>

          <div class="sidebar-footer">
            @if (userEmail()) {
              <div class="sidebar-user-pill" [title]="userEmail()">
                <span class="sidebar-user-avatar" aria-hidden="true">{{ userInitial() }}</span>
                <span class="sidebar-user-email">{{ userEmail() }}</span>
              </div>
            }
            <button
              type="button"
              class="sidebar-logout-btn"
              (click)="onLogout()"
              aria-label="Cerrar sesión"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              <span>Cerrar sesión</span>
            </button>
          </div>
        </aside>

        <main id="main-content" class="shell-main" role="main">
          <ng-content></ng-content>
        </main>
      </div>

      <footer class="shell-footer" role="contentinfo">
        <div class="shell-container footer-inner">
          <p class="footer-text">Phoeve BETA — Plataforma segura de recuerdos colaborativos.</p>
        </div>
      </footer>
    </div>
  `,
  styleUrl: './organizer-app-shell.component.scss',
})
export class OrganizerAppShellComponent {
  private readonly sessionService = inject(OrganizerSessionService, { optional: true });
  private readonly router = inject(PublicEntryRouterService, { optional: true });

  @Input() selectedEvent?: OrganizerEventModel | null = null;
  @Input() activeNav: 'events' | 'account' | string = 'events';
  @Output() exitContext = new EventEmitter<void>();

  readonly myEventsPath = APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_DASHBOARD;
  readonly myAccountPath = APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_ACCOUNT;

  logoFailed = false;

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

  onLogoError(): void {
    this.logoFailed = true;
  }

  onExitContext(): void {
    this.exitContext.emit();
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
