import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { OrganizerEventModel } from './organizer.types.js';
import { EventStatusBadgeComponent } from '../lifecycle/event-status-badge.component.js';

@Component({
  selector: 'eventlens-organizer-app-shell',
  standalone: true,
  imports: [EventStatusBadgeComponent],
  template: `
    <div class="organizer-shell">
      <header class="shell-header" role="banner">
        <div class="shell-container header-inner">
          <div class="brand-area">
            <h1 class="brand-title">
              @if (!logoFailed) {
                <img
                  src="assets/branding/phoeve/logo-primary.svg"
                  alt="Phoeve"
                  class="brand-logo"
                  width="160"
                  height="29"
                  (error)="onLogoError()"
                />
              } @else {
                <span class="brand-fallback-text">Phoeve</span>
              }
            </h1>
            <span class="brand-badge">Organizador</span>
          </div>

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
      </header>

      <main id="main-content" class="shell-main" role="main">
        <div class="shell-container">
          <ng-content></ng-content>
        </div>
      </main>

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
  @Input() selectedEvent?: OrganizerEventModel | null = null;
  @Output() exitContext = new EventEmitter<void>();

  logoFailed = false;

  onLogoError(): void {
    this.logoFailed = true;
  }

  onExitContext(): void {
    this.exitContext.emit();
  }
}
