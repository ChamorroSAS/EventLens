import { Component, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminEventSearchComponent } from './admin-event-search.component.js';
import { AdminEventDetailComponent } from './admin-event-detail.component.js';
import { JobsViewerComponent } from '../jobs/jobs-viewer.component.js';
import { AuditLogViewerComponent } from '../audit/audit-log-viewer.component.js';

export type AdminConsoleTab = 'search' | 'detail' | 'jobs' | 'audit';

@Component({
  selector: 'eventlens-admin-app-shell',
  standalone: true,
  imports: [
    CommonModule,
    AdminEventSearchComponent,
    AdminEventDetailComponent,
    JobsViewerComponent,
    AuditLogViewerComponent,
  ],
  template: `
    <div class="admin-app-shell">
      <header class="admin-shell-header">
        <div class="header-brand">
          <h1 class="brand-title">EventLens Admin Console</h1>
          <span class="badge-role">Soporte e Intervenciones</span>
        </div>
        <nav class="shell-nav" aria-label="Navegación principal de consola administrativa">
          <button
            type="button"
            class="nav-tab"
            [class.active]="activeTab() === 'search'"
            (click)="selectTab('search')"
          >
            Búsqueda y Eventos
          </button>
          <button
            type="button"
            class="nav-tab"
            [class.active]="activeTab() === 'jobs'"
            (click)="selectTab('jobs')"
          >
            Cola de Trabajos (Jobs)
          </button>
          <button
            type="button"
            class="nav-tab"
            [class.active]="activeTab() === 'audit'"
            (click)="selectTab('audit')"
          >
            Bitácora de Auditoría
          </button>
        </nav>
      </header>

      <!-- Anunciador de estado global para tecnologías de asistencia -->
      <div
        class="header-status-announcer"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {{ announcerMessage() }}
      </div>

      <main class="shell-main-content">
        @if (activeTab() === 'search') {
          <eventlens-admin-event-search
            [callerActorId]="callerActorId"
            (eventSelected)="onEventSelected($event)"
          ></eventlens-admin-event-search>
        } @else if (activeTab() === 'detail' && selectedEventId()) {
          <eventlens-admin-event-detail
            [eventId]="selectedEventId()!"
            [callerActorId]="callerActorId"
            (back)="onBackToSearch()"
          ></eventlens-admin-event-detail>
        } @else if (activeTab() === 'jobs') {
          <eventlens-jobs-viewer
            [callerActorId]="callerActorId"
          ></eventlens-jobs-viewer>
        } @else if (activeTab() === 'audit') {
          <eventlens-audit-log-viewer
            [callerActorId]="callerActorId"
          ></eventlens-audit-log-viewer>
        }
      </main>
    </div>
  `,
  styles: [`
    .admin-app-shell {
      min-height: 100vh;
      background: #090d16;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .admin-shell-header {
      background: #0f172a;
      border-bottom: 1px solid #1e293b;
      padding: 1rem 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .header-brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .brand-title {
      font-size: 1.25rem;
      font-weight: 700;
      margin: 0;
      letter-spacing: -0.025em;
    }
    .badge-role {
      background: #334155;
      color: #cbd5e1;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .shell-nav {
      display: flex;
      gap: 0.5rem;
    }
    .nav-tab {
      background: transparent;
      border: 1px solid #334155;
      color: #94a3b8;
      padding: 0.5rem 0.875rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease-in-out;
    }
    .nav-tab:hover {
      background: #1e293b;
      color: #f8fafc;
    }
    .nav-tab.active {
      background: #0284c7;
      border-color: #0284c7;
      color: white;
    }
    .shell-main-content {
      padding: 1.5rem;
      max-width: 80rem;
      margin: 0 auto;
    }
    .header-status-announcer {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  `]
})
export class AdminAppShellComponent {
  @Input() callerActorId?: string;

  readonly activeTab = signal<AdminConsoleTab>('search');
  readonly selectedEventId = signal<string | null>(null);
  readonly announcerMessage = signal<string>('Consola administrativa inicializada.');

  selectTab(tab: AdminConsoleTab): void {
    this.activeTab.set(tab);
    if (tab === 'search') {
      this.announcerMessage.set('Sección de búsqueda de eventos cargada.');
    } else if (tab === 'jobs') {
      this.announcerMessage.set('Sección de diagnóstico de trabajos cargada.');
    } else if (tab === 'audit') {
      this.announcerMessage.set('Sección de auditoría inmutable cargada.');
    }
  }

  onEventSelected(payload: { eventId: string; element: HTMLElement }): void {
    this.selectedEventId.set(payload.eventId);
    this.activeTab.set('detail');
    this.announcerMessage.set(`Detalle del evento ${payload.eventId} abierto.`);
  }

  onBackToSearch(): void {
    this.selectedEventId.set(null);
    this.activeTab.set('search');
    this.announcerMessage.set('Regresando a búsqueda de eventos.');
  }
}
