import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { MediaCardModel, RetryCycleResponse } from './media.types.js';
import { RetryProcessingActionComponent } from './retry-processing-action.component.js';
import { DownloadOriginalActionComponent } from './download-original-action.component.js';

@Component({
  selector: 'eventlens-processing-failed-panel',
  standalone: true,
  imports: [RetryProcessingActionComponent, DownloadOriginalActionComponent],
  template: `
    <section class="failed-panel" aria-labelledby="failed-panel-title">
      <header class="panel-header">
        <h3 id="failed-panel-title" class="panel-title">El procesamiento técnico de este archivo no se completó</h3>
        <span class="status-badge" role="status">Fallo técnico</span>
      </header>

      <p class="explanation">
        @if (media.safety.outcome === 'INCONCLUSIVE') {
          <span>
            La inspección de seguridad inicial fue no concluyente. Puedes solicitar un nuevo ciclo técnico para reexaminar el archivo;
            la descarga del archivo original permanece deshabilitada por seguridad hasta contar con inspección aprobada.
          </span>
        } @else if (media.safety.outcome === 'APPROVED') {
          <span>
            El archivo original fue aprobado por seguridad, pero ocurrió un error técnico al generar las versiones web optimizadas.
            El archivo original se conserva intacto y está disponible para descarga si tu rol lo permite.
          </span>
        } @else {
          <span>
            Ocurrió un error en el pipeline de procesamiento. El archivo original se conserva sin alteraciones.
          </span>
        }
      </p>

      <div class="file-details">
        <span class="detail-label">Archivo:</span>
        <span class="detail-value">{{ media.fileName }}</span>
        @if (media.format) {
          <span class="detail-format">({{ media.format }})</span>
        }
      </div>

      <div class="actions-row">
        @if (media.capabilities.canRetry) {
          <eventlens-retry-processing-action
            [mediaRef]="media.mediaRef"
            [eventRef]="media.eventRef"
            [fileName]="media.fileName"
            (cycleConfirmed)="onCycleConfirmed($event)"
            (capabilityRefreshRequired)="onRefreshRequired()"
          />
        }

        @if (media.capabilities.canDownloadOriginal) {
          <eventlens-download-original-action
            [fileName]="media.fileName"
            (downloadRequested)="onDownloadRequested()"
          />
        }
      </div>
    </section>
  `,
  styles: `
    .failed-panel {
      padding: 1rem;
      background-color: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .panel-title {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 600;
      color: #991b1b;
    }
    .status-badge {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #7f1d1d;
      background-color: #fee2e2;
      border: 1px solid #fca5a5;
      border-radius: 9999px;
    }
    .explanation {
      margin: 0;
      font-size: 0.875rem;
      line-height: 1.4;
      color: #7f1d1d;
    }
    .file-details {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      font-size: 0.8125rem;
      color: #374151;
    }
    .detail-label {
      font-weight: 500;
      color: #4b5563;
    }
    .detail-value {
      font-weight: 600;
      word-break: break-all;
    }
    .detail-format {
      color: #6b7280;
    }
    .actions-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
      margin-top: 0.25rem;
    }
  `,
})
export class ProcessingFailedPanelComponent {
  @Input({ required: true }) media!: MediaCardModel;

  @Output() retryCycleSubmitted = new EventEmitter<RetryCycleResponse>();
  @Output() refreshRequested = new EventEmitter<void>();
  @Output() downloadTriggered = new EventEmitter<void>();

  onCycleConfirmed(response: RetryCycleResponse): void {
    this.retryCycleSubmitted.emit(response);
  }

  onRefreshRequired(): void {
    this.refreshRequested.emit();
  }

  onDownloadRequested(): void {
    this.downloadTriggered.emit();
  }
}
