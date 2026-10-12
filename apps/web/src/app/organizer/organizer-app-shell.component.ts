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
                  src="assets/branding/logo-primary.svg"
                  alt="EventLens"
                  class="brand-logo"
                  width="160"
                  height="25"
                  (error)="onLogoError()"
                />
              } @else {
                <span class="brand-fallback-text">EventLens</span>
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
      background-color: var(--el-ui-color-surface, #ffffff);
      border-bottom: 1px solid var(--el-ui-color-border, #e7e7e3);
      z-index: 20;
    }
    @media (min-width: 769px) {
      .shell-header {
        position: sticky;
        top: 0;
      }
    }
    @media (max-width: 768px) {
      .shell-header {
        position: static;
      }
    }
    .shell-container {
      width: 100%;
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 1rem;
    }
    @media (min-width: 768px) {
      .shell-container {
        padding: 0 1.5rem;
      }
    }
    .header-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      min-height: 64px;
      padding: 0.75rem 0;
      flex-wrap: wrap;
    }
    .brand-area {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-shrink: 0;
    }
    .brand-title {
      margin: 0;
      display: inline-flex;
      align-items: center;
      font-family: var(--el-ui-font-family-base, 'Manrope', system-ui, sans-serif);
      font-size: 1.25rem;
      line-height: 1.75rem;
      font-weight: var(--el-ui-font-weight-semibold, 600);
      color: var(--el-ui-color-text-primary, #17202A);
    }
    .brand-logo {
      display: block;
      width: 160px;
      height: auto;
      aspect-ratio: 1970 / 310;
      max-width: 100%;
    }
    .brand-logo.is-hidden {
      display: none;
    }
    .brand-fallback-text {
      font-family: var(--el-ui-font-family-base, 'Manrope', system-ui, sans-serif);
      font-weight: var(--el-ui-font-weight-semibold, 600);
      font-size: 1.25rem;
      line-height: 1.75rem;
      color: var(--el-ui-color-text-primary, #17202A);
    }
    .brand-badge {
      display: inline-flex;
      align-items: center;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      background-color: var(--el-ui-color-accent-soft, #FFF1ED);
      color: var(--el-ui-color-primary, #17345C);
      font-family: var(--el-ui-font-family-base, 'Manrope', system-ui, sans-serif);
      font-size: 0.75rem;
      line-height: 1rem;
      font-weight: var(--el-ui-font-weight-medium, 500);
    }
    .event-context-area {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      font-size: 0.875rem;
      background-color: var(--el-ui-color-surface, #ffffff);
      padding: 0.375rem 0.75rem;
      border-radius: 0.5rem;
      border: 1px solid var(--el-ui-color-border, #E7E7E3);
      flex-wrap: wrap;
      max-width: 100%;
    }
    .context-label {
      color: var(--el-ui-color-text-secondary, #667085);
      font-family: var(--el-ui-font-family-base, 'Manrope', system-ui, sans-serif);
      font-size: 0.875rem;
      line-height: 1.25rem;
      font-weight: var(--el-ui-font-weight-medium, 500);
      white-space: nowrap;
    }
    .context-event-name {
      color: var(--el-ui-color-text-primary, #17202A);
      font-family: var(--el-ui-font-family-base, 'Manrope', system-ui, sans-serif);
      font-weight: var(--el-ui-font-weight-semibold, 600);
      font-size: 1rem;
      line-height: 1.5rem;
      word-break: break-word;
      overflow-wrap: anywhere;
      min-width: 0;
    }
    .btn-exit-context {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 44px;
      min-height: 44px;
      padding: 0.5rem 0.875rem;
      background-color: var(--el-ui-color-surface, #ffffff);
      border: 1px solid var(--el-ui-color-primary, #17345C);
      border-radius: 0.375rem;
      color: var(--el-ui-color-primary, #17345C);
      font-family: var(--el-ui-font-family-base, 'Manrope', system-ui, sans-serif);
      font-size: 0.875rem;
      line-height: 1.25rem;
      font-weight: var(--el-ui-font-weight-semibold, 600);
      cursor: pointer;
      text-decoration: none;
      transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }
    .btn-exit-context:hover,
    .btn-exit-context:active {
      background-color: var(--el-ui-color-accent-soft, #FFF1ED);
      border-color: var(--el-ui-color-primary-hover, #102A4D);
      color: var(--el-ui-color-primary-hover, #102A4D);
    }
    .btn-exit-context:focus-visible {
      outline: 2px solid var(--el-ui-focus-outline-color, #17345C);
      outline-offset: 2px;
    }
    @media (max-width: 480px) {
      .event-context-area {
        width: 100%;
      }
      .btn-exit-context {
        width: 100%;
        margin-top: 0.25rem;
      }
    }
    .shell-main {
      flex: 1;
      padding: 2rem 0;
    }
    .shell-footer {
      background-color: var(--el-ui-color-surface, #ffffff);
      border-top: 1px solid var(--el-ui-color-border, #E7E7E3);
      padding: 1.5rem 0;
      font-size: 0.875rem;
    }
    .footer-inner {
      display: flex;
      justify-content: center;
      text-align: center;
    }
    .footer-text {
      margin: 0;
      color: var(--el-ui-color-text-secondary, #667085);
      font-family: var(--el-ui-font-family-base, 'Manrope', system-ui, sans-serif);
      font-size: 0.875rem;
      line-height: 1.25rem;
      font-weight: var(--el-ui-font-weight-regular, 400);
    }
  `
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
