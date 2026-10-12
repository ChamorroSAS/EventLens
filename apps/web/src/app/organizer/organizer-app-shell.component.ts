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
            <h1 class="brand-title">EventLens</h1>
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
          <p class="footer-text">EventLens BETA — Plataforma segura de recuerdos colaborativos.</p>
        </div>
      </footer>
    </div>
  `,
  styles: `
    .organizer-shell {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background-color: #f8fafc;
      color: #0f172a;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .shell-header {
      background-color: #ffffff;
      border-bottom: 1px solid #e2e8f0;
      position: sticky;
      top: 0;
      z-index: 20;
    }
    .shell-container {
      width: 100%;
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 1rem;
    }
    .header-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      min-height: 64px;
      flex-wrap: wrap;
    }
    .brand-area {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .brand-title {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.025em;
    }
    .brand-badge {
      display: inline-flex;
      align-items: center;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      background-color: #e0e7ff;
      color: #3730a3;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .event-context-area {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      font-size: 0.875rem;
      background-color: #f1f5f9;
      padding: 0.375rem 0.75rem;
      border-radius: 0.5rem;
      border: 1px solid #cbd5e1;
    }
    .context-label {
      color: #64748b;
      font-weight: 500;
    }
    .context-event-name {
      font-weight: 600;
      color: #0f172a;
      max-width: 200px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .btn-exit-context {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 36px;
      padding: 0.25rem 0.625rem;
      background: none;
      border: 1px solid #cbd5e1;
      border-radius: 0.375rem;
      color: #334155;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-exit-context:hover {
      background-color: #e2e8f0;
      color: #0f172a;
    }
    .btn-exit-context:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }
    .shell-main {
      flex: 1;
      padding: 2rem 0;
    }
    .shell-footer {
      background-color: #ffffff;
      border-top: 1px solid #e2e8f0;
      padding: 1.5rem 0;
      font-size: 0.875rem;
      color: #64748b;
    }
    .footer-inner {
      display: flex;
      justify-content: center;
      text-align: center;
    }
    .footer-text {
      margin: 0;
    }
  `
})
export class OrganizerAppShellComponent {
  @Input() selectedEvent?: OrganizerEventModel | null = null;
  @Output() exitContext = new EventEmitter<void>();

  onExitContext(): void {
    this.exitContext.emit();
  }
}
