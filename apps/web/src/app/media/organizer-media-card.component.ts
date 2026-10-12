import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { MediaCardModel, RetryCycleResponse } from './media.types.js';
import { ProcessingFailedPanelComponent } from './processing-failed-panel.component.js';
import { QuarantinedMediaStateComponent } from './quarantined-media-state.component.js';

@Component({
  selector: 'eventlens-organizer-media-card',
  standalone: true,
  imports: [ProcessingFailedPanelComponent, QuarantinedMediaStateComponent],
  template: `
    <article
      class="media-card"
      [class.card-failed]="media.status === 'PROCESSING_FAILED'"
      [class.card-quarantined]="media.status === 'QUARANTINED'"
      [attr.aria-label]="'Elemento multimedia ' + media.fileName"
    >
      <div class="card-preview-area">
        @if (media.previewUrl && media.status === 'PUBLISHED') {
          <img
            [src]="media.previewUrl"
            [alt]="'Vista previa de ' + media.fileName"
            class="media-thumbnail"
            loading="lazy"
          />
        } @else {
          <div class="preview-placeholder" [attr.aria-label]="getStatusAriaLabel()">
            <span class="placeholder-icon" aria-hidden="true">
              @if (media.status === 'PROCESSING') { ⚙️ }
              @else if (media.status === 'PROCESSING_FAILED') { ⚠️ }
              @else if (media.status === 'QUARANTINED') { 🛡️ }
              @else { 📄 }
            </span>
            <span class="placeholder-text">{{ getPlaceholderText() }}</span>

            @if (media.status === 'PROCESSING' && media.observableProgress) {
              <span class="progress-details" role="status">
                @if (media.observableProgress.attempt) {
                  Intento {{ media.observableProgress.attempt }}
                }
                @if (media.observableProgress.phase) {
                  ({{ media.observableProgress.phase }})
                }
              </span>
            }
          </div>
        }

        <div class="status-overlay">
          <span class="badge" [class]="'badge-' + media.status.toLowerCase()" role="status">
            {{ getStatusBadgeText() }}
          </span>
        </div>
      </div>

      <div class="card-body">
        <h4 class="media-title" [title]="media.fileName">{{ media.fileName }}</h4>

        @if (media.status === 'PROCESSING_FAILED') {
          <eventlens-processing-failed-panel
            [media]="media"
            (retryCycleSubmitted)="onRetryCycleSubmitted($event)"
            (refreshRequested)="onRefreshRequested()"
            (downloadTriggered)="onDownloadTriggered()"
          />
        } @else if (media.status === 'QUARANTINED') {
          <eventlens-quarantined-media-state [media]="media" />
        }
      </div>
    </article>
  `,
  styles: `
    @use 'mixins' as m;

    .media-card {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--el-color-border);
      border-radius: var(--el-radius-md);
      background-color: var(--el-color-surface);
      overflow: hidden;
      box-shadow: var(--el-elevation-subtle);
      transition: box-shadow 0.15s ease-in-out;
    }
    .media-card:hover {
      box-shadow: var(--el-elevation-overlay);
    }
    .media-card.card-failed {
      border-color: var(--el-color-danger);
    }
    .media-card.card-quarantined {
      border-color: var(--el-color-warning);
    }
    .card-preview-area {
      position: relative;
      width: 100%;
      height: 180px;
      background-color: var(--el-color-surface-muted);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .media-thumbnail {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .preview-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--el-space-xs);
      padding: var(--el-space-md);
      text-align: center;
      color: var(--el-color-text-secondary);
    }
    .placeholder-icon {
      font-size: 1.75rem;
    }
    .placeholder-text {
      font-size: var(--el-font-size-body-small);
      font-weight: var(--el-font-weight-medium);
    }
    .progress-details {
      font-size: var(--el-font-size-caption);
      color: var(--el-color-text-secondary);
    }
    .status-overlay {
      position: absolute;
      top: var(--el-space-sm);
      right: var(--el-space-sm);
    }
    .badge {
      display: inline-block;
      padding: var(--el-space-xs) var(--el-space-sm);
      font-size: var(--el-font-size-caption);
      font-weight: var(--el-font-weight-semibold);
      border-radius: var(--el-radius-sm);
      text-transform: uppercase;
      letter-spacing: 0.025em;
      color: var(--el-color-text);
    }
    .badge-uploaded {
      background-color: var(--el-color-surface-muted);
    }
    .badge-processing {
      background-color: var(--el-color-info-soft);
    }
    .badge-processing_failed {
      background-color: var(--el-color-danger-soft);
    }
    .badge-quarantined {
      background-color: var(--el-color-warning-soft);
    }
    .badge-published {
      background-color: var(--el-color-success-soft);
    }
    .card-body {
      padding: var(--el-space-md);
      display: flex;
      flex-direction: column;
      gap: var(--el-space-sm);
    }
    .media-title {
      margin: 0;
      font-size: var(--el-font-size-button);
      font-weight: var(--el-font-weight-semibold);
      color: var(--el-color-text);
      @include m.el-truncate;
    }
  `,
})
export class OrganizerMediaCardComponent {
  @Input({ required: true }) media!: MediaCardModel;

  @Output() retryCycleSubmitted = new EventEmitter<RetryCycleResponse>();
  @Output() refreshRequested = new EventEmitter<void>();
  @Output() downloadTriggered = new EventEmitter<void>();

  getPlaceholderText(): string {
    switch (this.media.status) {
      case 'UPLOADED':
        return 'Archivo recibido, en cola de inspección';
      case 'PROCESSING':
        return 'Procesando archivo multimedia…';
      case 'PROCESSING_FAILED':
        return 'Sin vista previa (procesamiento fallido)';
      case 'QUARANTINED':
        return 'Vista previa no disponible (en cuarentena)';
      default:
        return 'Sin vista previa';
    }
  }

  getStatusBadgeText(): string {
    switch (this.media.status) {
      case 'UPLOADED':
        return 'Subido';
      case 'PROCESSING':
        return 'Procesando';
      case 'PROCESSING_FAILED':
        return 'Fallido';
      case 'QUARANTINED':
        return 'Cuarentena';
      case 'PUBLISHED':
        return 'Publicado';
      default:
        return this.media.status;
    }
  }

  getStatusAriaLabel(): string {
    return `Estado: ${this.getStatusBadgeText()}. ${this.getPlaceholderText()}`;
  }

  onRetryCycleSubmitted(res: RetryCycleResponse): void {
    this.retryCycleSubmitted.emit(res);
  }

  onRefreshRequested(): void {
    this.refreshRequested.emit();
  }

  onDownloadTriggered(): void {
    this.downloadTriggered.emit();
  }
}
