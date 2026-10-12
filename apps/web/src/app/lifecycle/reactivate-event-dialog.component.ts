import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { EventStatus } from './lifecycle.types.js';

@Component({
  selector: 'eventlens-reactivate-event-dialog',
  standalone: true,
  template: `
    @if (isOpen) {
      <div
        class="dialog-backdrop"
        role="presentation"
        (click)="onCancel()"
        (keydown.escape)="onCancel()"
      >
        <div
          class="dialog-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reactivate-dialog-title"
          (click)="$event.stopPropagation()"
        >
          <div class="dialog-header">
            <h3 id="reactivate-dialog-title" class="dialog-title">Levantar suspensión del evento</h3>
          </div>

          <div class="dialog-body">
            <p class="dialog-desc">
              ¿Deseas reactivar el evento «{{ eventName }}»?
            </p>
            <div class="dialog-info" role="note">
              <strong>Regla de negocio:</strong> La reactivación no restaura ciegamente el estado previo
              (<code>{{ previousStatus || 'Desconocido' }}</code>); recalcula el estado temporal
              efectivo actual evaluando la fecha de inicio, la vigencia y el periodo de gracia transcurrido.
            </div>
          </div>

          <div class="dialog-actions">
            <button type="button" class="btn btn-secondary" (click)="onCancel()">
              Cancelar
            </button>
            <button type="button" class="btn btn-primary" (click)="onConfirm()">
              Confirmar reactivación
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .dialog-backdrop {
      position: fixed;
      inset: 0;
      background-color: rgba(15, 23, 42, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
    }
    .dialog-card {
      background-color: #ffffff;
      border-radius: 0.75rem;
      max-width: 28rem;
      width: 100%;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .dialog-header {
      padding: 1.25rem 1.5rem 0.75rem;
    }
    .dialog-title {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 700;
      color: #0f172a;
    }
    .dialog-body {
      padding: 0 1.5rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .dialog-desc {
      margin: 0;
      font-size: 0.875rem;
      color: #475569;
    }
    .dialog-info {
      padding: 0.75rem;
      background-color: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 0.375rem;
      font-size: 0.8125rem;
      line-height: 1.4;
      color: #1e40af;
    }
    .dialog-actions {
      padding: 1rem 1.5rem;
      background-color: #f8fafc;
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      border-top: 1px solid #e2e8f0;
    }
    .btn {
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .btn-secondary {
      background-color: #ffffff;
      border-color: #cbd5e1;
      color: #334155;
    }
    .btn-primary {
      background-color: #2563eb;
      color: #ffffff;
    }
  `
})
export class ReactivateEventDialogComponent {
  @Input() isOpen = false;
  @Input() eventName = '';
  @Input() previousStatus?: EventStatus | null = null;

  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  onConfirm(): void {
    this.confirm.emit();
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
