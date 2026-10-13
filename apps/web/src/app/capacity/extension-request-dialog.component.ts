import { Component, EventEmitter, Input, Output } from '@angular/core';
import type {
  CreateExtensionRequestCommandModel,
  ExtensionRequestTypeModel,
} from './capacity.types.js';

@Component({
  selector: 'app-extension-request-dialog',
  standalone: true,
  template: `
    <div
      class="dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      tabindex="-1"
    >
      <div class="dialog-content">
        <h2 id="dialog-title" class="dialog-title">Solicitar ampliación de capacidad</h2>
        <p class="dialog-description">
          Solicita almacenamiento o vigencia adicional para tu evento. Esta solicitud será revisada por el equipo administrativo.
        </p>

        <form (submit)="onSubmit($event)" class="dialog-form">
          <div class="form-group">
            <label for="request-type">Tipo de ampliación</label>
            <select
              id="request-type"
              name="requestType"
              [value]="requestType"
              (change)="onRequestTypeChange($event)"
              class="form-control"
              required
            >
              <option value="STORAGE">Almacenamiento (GB adicionales)</option>
              <option value="DURATION">Vigencia (Días adicionales)</option>
              <option value="BOTH">Almacenamiento y Vigencia</option>
            </select>
          </div>

          @if (requestType === 'STORAGE' || requestType === 'BOTH') {
            <div class="form-group">
              <label for="additional-gb">GB adicionales requeridos (ej. 5.5)</label>
              <input
                id="additional-gb"
                name="additionalGb"
                type="number"
                step="0.1"
                min="0.1"
                [value]="additionalGb ?? ''"
                (input)="onAdditionalGbInput($event)"
                class="form-control"
                required
              />
            </div>
          }

          @if (requestType === 'DURATION' || requestType === 'BOTH') {
            <div class="form-group">
              <label for="additional-days">Días adicionales requeridos (ej. 30)</label>
              <input
                id="additional-days"
                name="additionalDays"
                type="number"
                step="1"
                min="1"
                [value]="additionalDays ?? ''"
                (input)="onAdditionalDaysInput($event)"
                class="form-control"
                required
              />
            </div>
          }

          <div class="form-group">
            <label for="request-reason">Motivo de la solicitud *</label>
            <textarea
              id="request-reason"
              name="reason"
              [value]="reason"
              (input)="onReasonInput($event)"
              rows="3"
              class="form-control"
              placeholder="Explica detalladamente por qué requieres capacidad adicional..."
              required
            ></textarea>
          </div>

          @if (errorMessage) {
            <div class="error-banner" role="alert">
              {{ errorMessage }}
            </div>
          }

          <div class="dialog-actions">
            <button
              type="button"
              class="btn btn-secondary"
              (click)="onCancel()"
              [disabled]="isSubmitting"
            >
              Cancelar
            </button>
            <button
              type="submit"
              class="btn btn-primary"
              [disabled]="isSubmitting || !isFormValid()"
            >
              {{ isSubmitting ? 'Enviando...' : 'Enviar solicitud' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [
    `
      .dialog-overlay {
        position: fixed;
        inset: 0;
        background-color: rgba(15, 23, 42, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 1rem;
      }
      .dialog-content {
        background: #ffffff;
        border-radius: 12px;
        max-width: 500px;
        width: 100%;
        padding: 1.5rem;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
      }
      .dialog-title {
        font-size: 1.25rem;
        font-weight: 600;
        color: #0f172a;
        margin-bottom: 0.5rem;
      }
      .dialog-description {
        font-size: 0.875rem;
        color: #64748b;
        margin-bottom: 1.25rem;
      }
      .form-group {
        margin-bottom: 1rem;
      }
      .form-group label {
        display: block;
        font-size: 0.875rem;
        font-weight: 500;
        color: #334155;
        margin-bottom: 0.25rem;
      }
      .form-control {
        width: 100%;
        padding: 0.5rem 0.75rem;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        font-size: 0.875rem;
        box-sizing: border-box;
      }
      .error-banner {
        padding: 0.75rem;
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #b91c1c;
        border-radius: 6px;
        font-size: 0.875rem;
        margin-bottom: 1rem;
      }
      .dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.75rem;
        margin-top: 1.5rem;
      }
      .btn {
        padding: 0.5rem 1rem;
        border-radius: 6px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        border: none;
      }
      .btn-primary {
        background: #2563eb;
        color: #ffffff;
      }
      .btn-primary:hover:not(:disabled) {
        background: #1d4ed8;
      }
      .btn-secondary {
        background: #f1f5f9;
        color: #475569;
      }
      .btn-secondary:hover:not(:disabled) {
        background: #e2e8f0;
      }
      .btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    `,
  ],
})
export class ExtensionRequestDialogComponent {
  @Input({ required: true }) eventId!: string;
  @Output() submitted = new EventEmitter<CreateExtensionRequestCommandModel>();
  @Output() cancelled = new EventEmitter<void>();

  requestType: ExtensionRequestTypeModel = 'STORAGE';
  additionalGb: number | null = 5.0;
  additionalDays: number | null = null;
  reason = '';
  isSubmitting = false;
  errorMessage: string | null = null;

  onRequestTypeChange(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.requestType = (target?.value as ExtensionRequestTypeModel) ?? 'STORAGE';
  }

  onAdditionalGbInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const val = parseFloat(target?.value ?? '');
    this.additionalGb = isNaN(val) ? null : val;
  }

  onAdditionalDaysInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const val = parseInt(target?.value ?? '', 10);
    this.additionalDays = isNaN(val) ? null : val;
  }

  onReasonInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;
    this.reason = target?.value ?? '';
  }

  isFormValid(): boolean {
    if (!this.reason || !this.reason.trim()) return false;
    if (this.requestType === 'STORAGE' || this.requestType === 'BOTH') {
      if (!this.additionalGb || this.additionalGb <= 0) return false;
    }
    if (this.requestType === 'DURATION' || this.requestType === 'BOTH') {
      if (!this.additionalDays || this.additionalDays <= 0) return false;
    }
    return true;
  }

  onSubmit(event?: Event): void {
    if (event) event.preventDefault();
    if (!this.isFormValid()) return;

    const command: CreateExtensionRequestCommandModel = {
      eventId: this.eventId,
      requestType: this.requestType,
      reason: this.reason.trim(),
      additionalGb:
        this.requestType === 'STORAGE' || this.requestType === 'BOTH'
          ? Number(this.additionalGb)
          : undefined,
      additionalDays:
        this.requestType === 'DURATION' || this.requestType === 'BOTH'
          ? Math.round(Number(this.additionalDays))
          : undefined,
    };

    this.submitted.emit(command);
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
