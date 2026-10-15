import { Component, Input } from '@angular/core';
import type { UploadBatchSummary } from './upload.types.js';

@Component({
  selector: 'eventlens-upload-progress-summary',
  standalone: true,
  template: `
    <div
      class="progress-summary-card"
      role="region"
      aria-label="Resumen del lote de carga"
    >
      <div class="summary-header">
        <h3 class="summary-title">Progreso del lote</h3>
        <span class="summary-pct">{{ summary.overallProgress }}%</span>
      </div>

      <div
        class="batch-progress-bar"
        role="progressbar"
        [attr.aria-valuenow]="summary.overallProgress"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label="Progreso general de los archivos seleccionados"
      >
        <div class="batch-progress-fill" [style.width.%]="summary.overallProgress"></div>
      </div>

      <div class="summary-status-text" role="status" aria-live="polite">
        <p class="status-headline">
          {{ getStatusHeadline() }}
        </p>

        @if (!summary.allCompleted && summary.overallProgress === 100) {
          <p class="acceptance-disclaimer">
            El envío terminó. Falta confirmar la recepción del servidor; esto no implica validación ni publicación.
          </p>
        }
      </div>
    </div>
  `,
  styles: `
    .progress-summary-card {
      padding: 1rem 1.25rem;
      border-radius: 0.5rem;
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      margin-bottom: 1rem;
    }
    .summary-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 0.5rem;
    }
    .summary-title {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 600;
      color: #1e293b;
    }
    .summary-pct {
      font-size: 1rem;
      font-weight: 700;
      color: #2563eb;
    }
    .batch-progress-bar {
      width: 100%;
      height: 8px;
      background-color: #e2e8f0;
      border-radius: 9999px;
      overflow: hidden;
      margin-bottom: 0.75rem;
    }
    .batch-progress-fill {
      height: 100%;
      background-color: #2563eb;
      border-radius: 9999px;
      transition: width 0.25s ease;
    }
    .status-headline {
      margin: 0;
      font-size: 0.875rem;
      color: #334155;
      font-weight: 500;
    }
    .acceptance-disclaimer {
      margin: 0.375rem 0 0;
      font-size: 0.75rem;
      color: #64748b;
      line-height: 1.4;
    }
  `
})
export class UploadProgressSummaryComponent {
  @Input({ required: true }) summary!: UploadBatchSummary;

  getStatusHeadline(): string {
    if (this.summary.totalFiles === 0) {
      return 'No hay archivos en proceso.';
    }

    if (this.summary.allCompleted) {
      if (this.summary.actionRequiredCount > 0 || this.summary.rejectedCount > 0) {
        return `${this.summary.receivedCount} archivos transferidos; ${this.summary.rejectedCount} requieren atención.`;
      }
      return `${this.summary.receivedCount} de ${this.summary.totalFiles} archivos transferidos; validación pendiente.`;
    }

    if (this.summary.actionRequiredCount > 0) {
      return `${this.summary.receivedCount} recibidos, ${this.summary.inProgressCount} en curso; ${this.summary.actionRequiredCount} requieren reintento.`;
    }

    return `${this.summary.receivedCount} recibidos, ${this.summary.inProgressCount} en curso de un total de ${this.summary.totalFiles}.`;
  }
}
