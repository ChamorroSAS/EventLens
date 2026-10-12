import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { LifecycleSnapshotModel } from './lifecycle.types.js';

@Component({
  selector: 'eventlens-event-access-status',
  standalone: true,
  template: `
    @if (shouldShowStatus) {
      <div
        class="access-status-card"
        [class]="'status-' + statusTheme"
        role="status"
        aria-live="polite"
        [attr.aria-label]="headline"
      >
        <div class="status-icon" aria-hidden="true">{{ icon }}</div>

        <div class="status-content">
          <h3 class="status-headline">{{ headline }}</h3>
          <p class="status-detail">{{ detailMessage }}</p>

          @if (hasGuestSession && showOwnContributionsLink) {
            <div class="contributions-exception-box" role="region" aria-label="Aportes personales">
              <span class="exception-text">
                Aunque la participación general esté restringida, conservas acceso a tus aportes realizados:
              </span>
              <button
                type="button"
                class="btn-contributions"
                (click)="onNavigateToMyContributions()"
              >
                Ver mis aportes y solicitudes
              </button>
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: `
    .access-status-card {
      display: flex;
      gap: 1rem;
      padding: 1.25rem 1.5rem;
      border-radius: 0.75rem;
      border: 1px solid currentColor;
      margin: 1rem 0;
      align-items: flex-start;
    }
    .status-icon {
      font-size: 1.75rem;
      line-height: 1;
    }
    .status-content {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      flex: 1;
    }
    .status-headline {
      margin: 0;
      font-size: 1.0625rem;
      font-weight: 700;
      line-height: 1.3;
    }
    .status-detail {
      margin: 0;
      font-size: 0.875rem;
      line-height: 1.45;
    }
    .contributions-exception-box {
      margin-top: 0.75rem;
      padding: 0.75rem;
      background-color: rgba(255, 255, 255, 0.7);
      border-radius: 0.375rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .exception-text {
      font-size: 0.8125rem;
      font-weight: 500;
    }
    .btn-contributions {
      align-self: flex-start;
      padding: 0.375rem 0.75rem;
      background-color: #ffffff;
      border: 1px solid currentColor;
      border-radius: 0.25rem;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
      color: inherit;
    }
    .btn-contributions:hover {
      background-color: rgba(0, 0, 0, 0.05);
    }
    .status-warning {
      background-color: #fefce8;
      border-color: #fef08a;
      color: #854d0e;
    }
    .status-info {
      background-color: #eff6ff;
      border-color: #bfdbfe;
      color: #1e40af;
    }
    .status-neutral {
      background-color: #f8fafc;
      border-color: #e2e8f0;
      color: #334155;
    }
    .status-danger {
      background-color: #fef2f2;
      border-color: #fecaca;
      color: #991b1b;
    }
  `
})
export class EventAccessStatusComponent {
  @Input({ required: true }) snapshot!: LifecycleSnapshotModel;
  @Input() hasGuestSession = false;

  @Output() viewOwnContributions = new EventEmitter<void>();

  get shouldShowStatus(): boolean {
    if (!this.snapshot) return false;
    // Show banner when event is not ACTIVE or uploads/participation are closed
    return (
      this.snapshot.status !== 'ACTIVE' ||
      !this.snapshot.capabilities?.canUpload ||
      this.snapshot.capabilities?.isClosed ||
      this.snapshot.capabilities?.isInGracePeriod ||
      this.snapshot.capabilities?.isSuspended
    );
  }

  get showOwnContributionsLink(): boolean {
    return ['CLOSED', 'GRACE_PERIOD', 'SUSPENDED'].includes(this.snapshot?.status);
  }

  get statusTheme(): 'warning' | 'info' | 'neutral' | 'danger' {
    switch (this.snapshot?.status) {
      case 'SCHEDULED':
        return 'info';
      case 'CLOSED':
      case 'GRACE_PERIOD':
        return 'warning';
      case 'SUSPENDED':
      case 'PENDING_DELETION':
      case 'DELETED':
        return 'danger';
      default:
        return 'neutral';
    }
  }

  get icon(): string {
    switch (this.snapshot?.status) {
      case 'SCHEDULED':
        return '🗓️';
      case 'CLOSED':
        return '🔒';
      case 'GRACE_PERIOD':
        return '⏳';
      case 'SUSPENDED':
        return '🛡️';
      case 'PENDING_DELETION':
      case 'DELETED':
        return '🛑';
      default:
        return 'ℹ️';
    }
  }

  get headline(): string {
    switch (this.snapshot?.status) {
      case 'SCHEDULED':
        return 'El evento aún no inicia';
      case 'CLOSED':
        return 'Las cargas están cerradas';
      case 'GRACE_PERIOD':
        return 'La vigencia del evento terminó';
      case 'SUSPENDED':
        return 'Evento no disponible temporalmente';
      case 'DRAFT':
        return 'El evento aún no está disponible';
      case 'PENDING_DELETION':
      case 'DELETED':
        return 'El evento ha finalizado y ya no está disponible';
      default:
        return 'Participación no disponible';
    }
  }

  get detailMessage(): string {
    switch (this.snapshot?.status) {
      case 'SCHEDULED':
        return this.formattedScheduledStart
          ? `La apertura está programada para el ${this.formattedScheduledStart} (${this.snapshot.timezone}). Las cargas se habilitarán automáticamente al iniciar.`
          : 'El evento abrirá próximamente según la programación de los organizadores.';
      case 'CLOSED':
        return 'El organizador ha cerrado la recepción de nuevo contenido. La galería publicada permanece accesible para consulta.';
      case 'GRACE_PERIOD':
        return 'El periodo de participación activa ha concluido. El contenido existente permanece disponible para visualización y descarga.';
      case 'SUSPENDED':
        // PRIVACY GUARANTEE: Never reveal internal administrative investigation reasons to guests
        return 'El acceso y las operaciones del evento se encuentran en pausa administrativa por revisión.';
      case 'DRAFT':
        return 'Este evento se encuentra en fase de preparación.';
      case 'PENDING_DELETION':
      case 'DELETED':
        return 'Este evento ha agotado su periodo de conservación y sus recursos han sido retirados.';
      default:
        return 'Las cargas no se encuentran habilitadas en este momento.';
    }
  }

  get formattedScheduledStart(): string | null {
    if (this.snapshot?.startsAtLocal) {
      return this.snapshot.startsAtLocal;
    }
    if (this.snapshot?.scheduledAt) {
      const date = new Date(this.snapshot.scheduledAt);
      return date.toLocaleString('es-CO', {
        timeZone: this.snapshot.timezone || 'America/Bogota',
        dateStyle: 'medium',
        timeStyle: 'short'
      });
    }
    return null;
  }

  onNavigateToMyContributions(): void {
    this.viewOwnContributions.emit();
  }
}
