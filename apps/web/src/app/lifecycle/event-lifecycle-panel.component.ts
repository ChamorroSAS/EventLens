import { Component, EventEmitter, Input, Output } from '@angular/core';
import type {
  EventStatus,
  LifecycleSnapshotModel,
  ScheduleEventCommand
} from './lifecycle.types.js';
import { EventStatusBadgeComponent } from './event-status-badge.component.js';
import { EventGracePeriodBannerComponent } from './event-grace-period-banner.component.js';
import { EventCloseDialogComponent } from './event-close-dialog.component.js';
import { EventScheduleFormComponent } from './event-schedule-form.component.js';
import { SuspendEventDialogComponent } from './suspend-event-dialog.component.js';
import { ReactivateEventDialogComponent } from './reactivate-event-dialog.component.js';

@Component({
  selector: 'eventlens-event-lifecycle-panel',
  standalone: true,
  imports: [
    EventStatusBadgeComponent,
    EventGracePeriodBannerComponent,
    EventCloseDialogComponent,
    EventScheduleFormComponent,
    SuspendEventDialogComponent,
    ReactivateEventDialogComponent
  ],
  template: `
    <section
      class="lifecycle-panel"
      [attr.aria-label]="'Panel de ciclo de vida del evento ' + snapshot.name"
    >
      <!-- 1. Jerarquía: Nombre del evento y badge de estado -->
      <header class="panel-header">
        <div class="title-row">
          <h2 class="event-name">{{ snapshot.name }}</h2>
          <eventlens-event-status-badge [status]="snapshot.status" />
        </div>
        <p class="status-summary" role="status">
          {{ getStatusSummaryText() }}
        </p>
      </header>

      <!-- 2. Banner de periodo de gracia cuando aplique -->
      <eventlens-event-grace-period-banner [snapshot]="snapshot" />

      <!-- 3. Cronograma y fechas canónicas del evento -->
      <div class="timeline-grid" role="region" aria-label="Cronograma y vigencia">
        <div class="timeline-item">
          <span class="timeline-label">Apertura / Inicio:</span>
          <span class="timeline-value">
            @if (formattedScheduleStart) {
              <time [attr.datetime]="snapshot.scheduledAt || snapshot.startsAtLocal">
                {{ formattedScheduleStart }}
              </time>
            } @else {
              <span class="text-muted">Sin programar</span>
            }
          </span>
        </div>

        <div class="timeline-item">
          <span class="timeline-label">Zona horaria:</span>
          <span class="timeline-value">{{ snapshot.timezone }}</span>
        </div>

        <div class="timeline-item">
          <span class="timeline-label">Cierre de captura (vencimiento):</span>
          <span class="timeline-value">
            @if (formattedExpiresAt) {
              <time [attr.datetime]="snapshot.expiresAt">
                {{ formattedExpiresAt }}
              </time>
            } @else {
              <span class="text-muted">—</span>
            }
          </span>
        </div>

        <div class="timeline-item">
          <span class="timeline-label">Fin de gracia y retención:</span>
          <span class="timeline-value">
            @if (formattedGraceEndsAt) {
              <time [attr.datetime]="snapshot.graceEndsAt">
                {{ formattedGraceEndsAt }}
              </time>
            } @else {
              <span class="text-muted">—</span>
            }
          </span>
        </div>
      </div>

      <!-- 4. Acciones autorizadas según capabilities -->
      <footer class="panel-actions" role="toolbar" aria-label="Acciones autorizadas del evento">
        <h3 class="sr-only">Acciones autorizadas</h3>

        @if (snapshot.capabilities.canSchedule) {
          <button
            type="button"
            class="btn btn-primary"
            (click)="isScheduleDialogOpen = true"
          >
            Programar evento
          </button>
        }

        @if (snapshot.capabilities.canActivateEarly) {
          <button
            type="button"
            class="btn btn-success"
            (click)="onActivateEarly()"
            title="Activar antes de la fecha programada. El vencimiento se conserva intacto."
          >
            Activar ahora
          </button>
        }

        @if (snapshot.capabilities.canClose) {
          <button
            type="button"
            class="btn btn-warning"
            (click)="isCloseDialogOpen = true"
          >
            Cerrar evento
          </button>
        }

        @if (snapshot.capabilities.canReopen) {
          <button
            type="button"
            class="btn btn-primary"
            (click)="onReopen()"
          >
            Reabrir evento
          </button>
        }

        @if (snapshot.capabilities.canSuspend) {
          <button
            type="button"
            class="btn btn-danger"
            (click)="isSuspendDialogOpen = true"
          >
            Suspender
          </button>
        }

        @if (snapshot.capabilities.canReactivate) {
          <button
            type="button"
            class="btn btn-primary"
            (click)="isReactivateDialogOpen = true"
          >
            Reactivar
          </button>
        }

        <button
          type="button"
          class="btn btn-secondary btn-refresh"
          (click)="onRefresh()"
          aria-label="Actualizar estado del evento"
        >
          🔄 Refrescar
        </button>
      </footer>

      <!-- 5. Diálogos modales accesibles -->
      <eventlens-event-close-dialog
        [isOpen]="isCloseDialogOpen"
        [eventName]="snapshot.name"
        (confirm)="handleCloseConfirm()"
        (cancel)="isCloseDialogOpen = false"
      />

      <eventlens-event-schedule-form
        [isOpen]="isScheduleDialogOpen"
        [timezone]="snapshot.timezone"
        (scheduled)="handleScheduleSubmit($event)"
        (cancel)="isScheduleDialogOpen = false"
      />

      <eventlens-suspend-event-dialog
        [isOpen]="isSuspendDialogOpen"
        [eventName]="snapshot.name"
        (confirm)="handleSuspendConfirm($event)"
        (cancel)="isSuspendDialogOpen = false"
      />

      <eventlens-reactivate-event-dialog
        [isOpen]="isReactivateDialogOpen"
        [eventName]="snapshot.name"
        [previousStatus]="snapshot.previousStatus"
        (confirm)="handleReactivateConfirm()"
        (cancel)="isReactivateDialogOpen = false"
      />
    </section>
  `,
  styles: `
    .lifecycle-panel {
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 0.75rem;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    .panel-header {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }
    .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .event-name {
      margin: 0;
      font-size: 1.375rem;
      font-weight: 700;
      color: #0f172a;
    }
    .status-summary {
      margin: 0;
      font-size: 0.875rem;
      color: #475569;
    }
    .timeline-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      padding: 1rem;
      background-color: #f8fafc;
      border-radius: 0.5rem;
      border: 1px solid #f1f5f9;
    }
    .timeline-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .timeline-label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.025em;
      color: #64748b;
    }
    .timeline-value {
      font-size: 0.9375rem;
      font-weight: 600;
      color: #1e293b;
    }
    .text-muted {
      color: #94a3b8;
      font-weight: 400;
    }
    .panel-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      padding-top: 0.5rem;
      border-top: 1px solid #f1f5f9;
    }
    .btn {
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s ease-in-out;
    }
    .btn:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }
    .btn-primary {
      background-color: #2563eb;
      color: #ffffff;
    }
    .btn-primary:hover {
      background-color: #1d4ed8;
    }
    .btn-success {
      background-color: #16a34a;
      color: #ffffff;
    }
    .btn-success:hover {
      background-color: #15803d;
    }
    .btn-warning {
      background-color: #ea580c;
      color: #ffffff;
    }
    .btn-warning:hover {
      background-color: #c2410c;
    }
    .btn-danger {
      background-color: #dc2626;
      color: #ffffff;
    }
    .btn-danger:hover {
      background-color: #b91c1c;
    }
    .btn-secondary {
      background-color: #ffffff;
      border-color: #cbd5e1;
      color: #334155;
    }
    .btn-secondary:hover {
      background-color: #f1f5f9;
    }
    .btn-refresh {
      margin-left: auto;
    }
    .sr-only {
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
  `
})
export class EventLifecyclePanelComponent {
  @Input({ required: true }) snapshot!: LifecycleSnapshotModel;

  @Output() scheduleSubmitted = new EventEmitter<ScheduleEventCommand>();
  @Output() activateEarlyRequested = new EventEmitter<void>();
  @Output() closeRequested = new EventEmitter<void>();
  @Output() reopenRequested = new EventEmitter<void>();
  @Output() suspendSubmitted = new EventEmitter<string>();
  @Output() reactivateRequested = new EventEmitter<void>();
  @Output() refreshRequested = new EventEmitter<void>();

  isCloseDialogOpen = false;
  isScheduleDialogOpen = false;
  isSuspendDialogOpen = false;
  isReactivateDialogOpen = false;

  getStatusSummaryText(): string {
    switch (this.snapshot.status) {
      case 'DRAFT':
        return 'El evento está en borrador y no es visible para invitados ni admite cargas.';
      case 'SCHEDULED':
        return 'El evento está programado para abrir automáticamente en la fecha de inicio.';
      case 'ACTIVE':
        return 'El evento está activo y recibiendo cargas de participantes autorizados.';
      case 'CLOSED':
        return 'El evento fue cerrado anticipadamente por el organizador. Las cargas están bloqueadas.';
      case 'GRACE_PERIOD':
        return 'La vigencia ha concluido. La galería y descargas continúan activas en periodo de gracia.';
      case 'PENDING_DELETION':
        return 'El periodo de gracia ha concluido. Los recursos están programados para purga física.';
      case 'SUSPENDED':
        return `Evento en suspensión administrativa temporal. Motivo: ${this.snapshot.suspensionReason || 'En revisión'}.`;
      case 'DELETED':
        return 'El evento ha sido eliminado definitivamente del sistema.';
      default:
        return 'Estado de ciclo de vida del evento.';
    }
  }

  get formattedScheduleStart(): string | null {
    if (this.snapshot.startsAtLocal) {
      return this.snapshot.startsAtLocal;
    }
    if (this.snapshot.scheduledAt) {
      const d = new Date(this.snapshot.scheduledAt);
      return d.toLocaleString('es-CO', {
        timeZone: this.snapshot.timezone || 'America/Bogota',
        dateStyle: 'medium',
        timeStyle: 'short'
      });
    }
    return null;
  }

  get formattedExpiresAt(): string | null {
    if (!this.snapshot.expiresAt) return null;
    const d = new Date(this.snapshot.expiresAt);
    return d.toLocaleString('es-CO', {
      timeZone: this.snapshot.timezone || 'America/Bogota',
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  }

  get formattedGraceEndsAt(): string | null {
    if (!this.snapshot.graceEndsAt) return null;
    const d = new Date(this.snapshot.graceEndsAt);
    return d.toLocaleString('es-CO', {
      timeZone: this.snapshot.timezone || 'America/Bogota',
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  }

  onActivateEarly(): void {
    this.activateEarlyRequested.emit();
  }

  onReopen(): void {
    this.reopenRequested.emit();
  }

  onRefresh(): void {
    this.refreshRequested.emit();
  }

  handleCloseConfirm(): void {
    this.isCloseDialogOpen = false;
    this.closeRequested.emit();
  }

  handleScheduleSubmit(cmd: ScheduleEventCommand): void {
    this.isScheduleDialogOpen = false;
    this.scheduleSubmitted.emit(cmd);
  }

  handleSuspendConfirm(reason: string): void {
    this.isSuspendDialogOpen = false;
    this.suspendSubmitted.emit(reason);
  }

  handleReactivateConfirm(): void {
    this.isReactivateDialogOpen = false;
    this.reactivateRequested.emit();
  }
}
