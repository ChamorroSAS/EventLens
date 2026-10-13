import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { AdminApplyOverrideCommand, AdminRemoveOverrideCommand } from './admin.types.js';

export interface CapacityLimitsModel {
  storageGigabytes: number;
  maxFiles: number;
  retentionDays: number;
}

@Component({
  selector: 'eventlens-admin-capacity-override-dialog',
  standalone: true,
  template: `
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
        aria-labelledby="override-dialog-title"
        (click)="$event.stopPropagation()"
      >
        <div class="dialog-header">
          <h3 id="override-dialog-title" class="dialog-title">
            Ajustar Capacidad y Overrides del Evento
          </h3>
          <p class="dialog-subtitle">
            Aplica límites comerciales personalizados o retorna al plan base con salvaguardas.
          </p>
        </div>

        <div class="dialog-body">
          <!-- Tabla Comparativa: Base vs Actual vs Propuesto -->
          <div class="comparison-section">
            <h4 class="section-title">Comparativa de Límites</h4>
            <table class="comparison-table" aria-label="Comparativa de límites">
              <thead>
                <tr>
                  <th>Métrica</th>
                  <th>Plan Base</th>
                  <th>Límite Actual</th>
                  <th>Propuesto</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Almacenamiento (GB)</td>
                  <td>{{ baseLimits.storageGigabytes.toFixed(1) }} GB</td>
                  <td>
                    <span [class.text-override]="isOverrideActive">
                      {{ currentLimits.storageGigabytes.toFixed(1) }} GB
                      {{ isOverrideActive ? '(Override)' : '' }}
                    </span>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      class="table-input"
                      [value]="proposedStorageGb"
                      (input)="onStorageInput($event)"
                      aria-label="Almacenamiento propuesto en GB"
                    />
                  </td>
                </tr>
                <tr>
                  <td>Archivos Máximos</td>
                  <td>{{ baseLimits.maxFiles }}</td>
                  <td>
                    <span [class.text-override]="isOverrideActive">
                      {{ currentLimits.maxFiles }}
                    </span>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="100"
                      min="1"
                      class="table-input"
                      [value]="proposedMaxFiles"
                      (input)="onFilesInput($event)"
                      aria-label="Máximo de archivos propuesto"
                    />
                  </td>
                </tr>
                <tr>
                  <td>Vigencia / Retención (Días)</td>
                  <td>{{ baseLimits.retentionDays }} d</td>
                  <td>
                    <span [class.text-override]="isOverrideActive">
                      {{ currentLimits.retentionDays }} d
                    </span>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      class="table-input"
                      [value]="proposedRetentionDays"
                      (input)="onRetentionInput($event)"
                      aria-label="Días de retención propuestos"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Motivo Administrativo Obligatorio -->
          <div class="form-group">
            <label for="override-reason" class="form-label">
              Motivo Administrativo Obligatorio (Auditoría) *
            </label>
            <textarea
              id="override-reason"
              class="form-control"
              rows="3"
              [value]="reason"
              (input)="onReasonInput($event)"
              placeholder="Justifica el ajuste comercial o el retorno al plan base..."
              required
            ></textarea>
          </div>

          <!-- Mensaje de Error (si el backend deniega, ej. CANNOT_REDUCE_BELOW_PAST_EXPIRATION) -->
          @if (errorMessage) {
            <div class="alert alert-danger" role="alert">
              <strong>Operación Denegada:</strong> {{ errorMessage }}
            </div>
          }
        </div>

        <div class="dialog-actions">
          @if (isOverrideActive) {
            <button
              type="button"
              class="btn btn-warning"
              (click)="onRevertToBase()"
              [disabled]="submitting || !reason.trim()"
              title="Restaura los límites originales del plan base"
            >
              {{ submitting ? 'Procesando...' : 'Retornar al Plan Base' }}
            </button>
          }
          <div class="action-spacer"></div>
          <button
            type="button"
            class="btn btn-secondary"
            (click)="onCancel()"
            [disabled]="submitting"
          >
            Cancelar
          </button>
          <button
            type="button"
            class="btn btn-primary"
            (click)="onApply()"
            [disabled]="submitting || !isFormValid()"
          >
            {{ submitting ? 'Guardando...' : 'Aplicar Override' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dialog-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.75);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
    }
    .dialog-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 0.75rem;
      max-width: 36rem;
      width: 100%;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
      color: #f8fafc;
      overflow: hidden;
    }
    .dialog-header {
      padding: 1.25rem 1.5rem 0.75rem;
      border-bottom: 1px solid #334155;
    }
    .dialog-title {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: #f8fafc;
    }
    .dialog-subtitle {
      margin: 0.25rem 0 0;
      font-size: 0.8125rem;
      color: #94a3b8;
    }
    .dialog-body {
      padding: 1.25rem 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .comparison-section {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .section-title {
      margin: 0;
      font-size: 0.875rem;
      font-weight: 600;
      color: #cbd5e1;
    }
    .comparison-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8125rem;
      background: #0f172a;
      border-radius: 0.375rem;
      overflow: hidden;
    }
    .comparison-table th, .comparison-table td {
      padding: 0.625rem 0.75rem;
      text-align: left;
      border-bottom: 1px solid #1e293b;
    }
    .comparison-table th {
      background: #1e293b;
      color: #94a3b8;
      font-weight: 600;
    }
    .text-override {
      color: #38bdf8;
      font-weight: 600;
    }
    .table-input {
      width: 5.5rem;
      padding: 0.25rem 0.5rem;
      background: #1e293b;
      border: 1px solid #475569;
      border-radius: 0.25rem;
      color: #f8fafc;
      font-size: 0.8125rem;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }
    .form-label {
      font-size: 0.8125rem;
      font-weight: 600;
      color: #cbd5e1;
    }
    .form-control {
      background: #0f172a;
      border: 1px solid #475569;
      border-radius: 0.375rem;
      padding: 0.5rem 0.75rem;
      color: #f8fafc;
      font-size: 0.875rem;
      box-sizing: border-box;
      width: 100%;
    }
    .form-control:focus {
      outline: 2px solid #38bdf8;
    }
    .alert {
      padding: 0.75rem 1rem;
      border-radius: 0.375rem;
      font-size: 0.8125rem;
    }
    .alert-danger {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid #ef4444;
      color: #fca5a5;
    }
    .dialog-actions {
      padding: 1rem 1.5rem;
      background: #0f172a;
      border-top: 1px solid #334155;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .action-spacer {
      flex: 1;
    }
    .btn {
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-secondary {
      background: #334155;
      color: #f8fafc;
    }
    .btn-secondary:hover:not(:disabled) {
      background: #475569;
    }
    .btn-primary {
      background: #0284c7;
      color: #ffffff;
    }
    .btn-primary:hover:not(:disabled) {
      background: #0369a1;
    }
    .btn-warning {
      background: rgba(234, 179, 8, 0.2);
      border-color: #eab308;
      color: #fef08a;
    }
    .btn-warning:hover:not(:disabled) {
      background: rgba(234, 179, 8, 0.3);
    }
  `],
})
export class AdminCapacityOverrideDialogComponent {
  @Input({ required: true }) eventId!: string;
  @Input({ required: true }) baseLimits!: CapacityLimitsModel;
  @Input({ required: true }) currentLimits!: CapacityLimitsModel;
  @Input() isOverrideActive = false;
  @Input() submitting = false;
  @Input() errorMessage: string | null = null;

  @Output() applyOverride = new EventEmitter<AdminApplyOverrideCommand>();
  @Output() revertToBase = new EventEmitter<AdminRemoveOverrideCommand>();
  @Output() cancel = new EventEmitter<void>();

  proposedStorageGb = 10.0;
  proposedMaxFiles = 1000;
  proposedRetentionDays = 30;
  reason = '';

  ngOnInit(): void {
    this.proposedStorageGb = this.currentLimits.storageGigabytes;
    this.proposedMaxFiles = this.currentLimits.maxFiles;
    this.proposedRetentionDays = this.currentLimits.retentionDays;
  }

  onStorageInput(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    if (!isNaN(val)) this.proposedStorageGb = val;
  }

  onFilesInput(event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(val)) this.proposedMaxFiles = val;
  }

  onRetentionInput(event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(val)) this.proposedRetentionDays = val;
  }

  onReasonInput(event: Event): void {
    this.reason = (event.target as HTMLTextAreaElement).value ?? '';
  }

  isFormValid(): boolean {
    return (
      this.reason.trim().length > 0 &&
      this.proposedStorageGb > 0 &&
      this.proposedMaxFiles > 0 &&
      this.proposedRetentionDays > 0
    );
  }

  onApply(): void {
    if (!this.isFormValid()) return;

    const bytes = BigInt(Math.round(this.proposedStorageGb * 1024 * 1024 * 1024));
    this.applyOverride.emit({
      storageBytes: bytes.toString(),
      maxFiles: this.proposedMaxFiles,
      retentionDays: this.proposedRetentionDays,
      reason: this.reason.trim(),
    });
  }

  onRevertToBase(): void {
    if (!this.reason.trim()) return;

    this.revertToBase.emit({
      reason: this.reason.trim(),
    });
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
