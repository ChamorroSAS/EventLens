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
      padding: var(--el-space-md);
      background-color: var(--el-color-danger-soft);
      border: 1px solid var(--el-color-danger);
      border-radius: var(--el-radius-md);
      display: flex;
      flex-direction: column;
      gap: var(--el-space-md);
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--el-space-sm);
      flex-wrap: wrap;
    }
    .panel-title {
      margin: 0;
      font-size: var(--el-font-size-button);
      font-weight: var(--el-font-weight-semibold);
      color: var(--el-color-text);
    }
    .status-badge {
      display: inline-block;
      padding: var(--el-space-xs) var(--el-space-sm);
      font-size: var(--el-font-size-caption);
      font-weight: var(--el-font-weight-semibold);
      color: var(--el-color-text);
      background-color: var(--el-color-danger-soft);
      border: 1px solid var(--el-color-danger);
      border-radius: var(--el-radius-pill);
    }
    .explanation {
      margin: 0;
      font-size: var(--el-font-size-body-small);
      line-height: var(--el-line-height-normal);
      color: var(--el-color-text);
    }
    .file-details {
      display: flex;
      align-items: center;
      gap: var(--el-space-xs);
      font-size: var(--el-font-size-body-small);
      color: var(--el-color-text);
    }
    .detail-label {
      font-weight: var(--el-font-weight-medium);
      color: var(--el-color-text-secondary);
    }
    .detail-value {
      font-weight: var(--el-font-weight-semibold);
      word-break: break-all;
    }
    .detail-format {
      color: var(--el-color-text-secondary);
    }
    .actions-row {
      display: flex;
      align-items: center;
      gap: var(--el-space-md);
      flex-wrap: wrap;
      margin-top: var(--el-space-xs);
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
