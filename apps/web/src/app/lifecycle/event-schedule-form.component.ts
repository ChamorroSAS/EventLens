import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { ScheduleEventCommand } from './lifecycle.types.js';

@Component({
  selector: 'eventlens-event-schedule-form',
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
          aria-labelledby="schedule-dialog-title"
          (click)="$event.stopPropagation()"
        >
          <div class="dialog-header">
            <h3 id="schedule-dialog-title" class="dialog-title">Programar apertura del evento</h3>
          </div>

          <form (submit)="onSubmit($event)" class="dialog-form">
            <div class="dialog-body">
              <div class="form-group">
                <label for="starts-at-input" class="form-label">
                  Fecha y hora de inicio ({{ timezone }}):
                </label>
                <input
                  id="starts-at-input"
                  type="datetime-local"
                  class="form-control"
                  [value]="startsAtLocal"
                  (input)="onStartsAtInput($event)"
                  required
                />
              </div>

              <div class="form-group">
                <label for="duration-input" class="form-label">
                  Duración de vigencia (días):
                </label>
                <input
                  id="duration-input"
                  type="number"
                  class="form-control"
                  [value]="durationDays"
                  (input)="onDurationInput($event)"
                  min="1"
                  max="30"
                  required
                />
                <span class="form-hint">
                  El cálculo de vencimiento y el periodo de gracia posterior se computarán automáticamente.
                </span>
              </div>
            </div>

            <div class="dialog-actions">
              <button type="button" class="btn btn-secondary" (click)="onCancel()">
                Cancelar
              </button>
              <button
                type="submit"
                class="btn btn-primary"
                [disabled]="!startsAtLocal || durationDays < 1"
              >
                Guardar programación
              </button>
            </div>
          </form>
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
    .dialog-form {
      display: flex;
      flex-direction: column;
    }
    .dialog-body {
      padding: 0 1.5rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }
    .form-label {
      font-size: 0.875rem;
      font-weight: 600;
      color: #334155;
    }
    .form-control {
      padding: 0.5rem 0.75rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      color: #0f172a;
    }
    .form-control:focus {
      outline: 2px solid #2563eb;
      outline-offset: 1px;
    }
    .form-hint {
      font-size: 0.75rem;
      color: #64748b;
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
    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `
})
export class EventScheduleFormComponent {
  @Input() isOpen = false;
  @Input() timezone = 'America/Bogota';

  @Output() scheduled = new EventEmitter<ScheduleEventCommand>();
  @Output() cancel = new EventEmitter<void>();

  startsAtLocal = '';
  durationDays = 7;

  onStartsAtInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.startsAtLocal = target?.value ?? '';
  }

  onDurationInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const val = parseInt(target?.value ?? '7', 10);
    this.durationDays = isNaN(val) ? 1 : val;
  }

  onSubmit(event?: Event): void {
    if (event) event.preventDefault();
    if (this.startsAtLocal && this.durationDays >= 1) {
      this.scheduled.emit({
        startsAtLocal: this.startsAtLocal,
        durationDays: this.durationDays
      });
    }
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
