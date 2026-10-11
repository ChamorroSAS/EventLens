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
    .media-card {
      display: flex;
      flex-direction: column;
      border: 1px solid #e2e8f0;
      border-radius: 0.5rem;
      background-color: #ffffff;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      transition: box-shadow 0.15s ease-in-out;
    }
    .media-card:hover {
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .media-card.card-failed {
      border-color: #fca5a5;
    }
    .media-card.card-quarantined {
      border-color: #fed7aa;
    }
    .card-preview-area {
      position: relative;
      width: 100%;
      height: 180px;
      background-color: #f8fafc;
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
      gap: 0.375rem;
      padding: 1rem;
      text-align: center;
      color: #64748b;
    }
    .placeholder-icon {
      font-size: 1.75rem;
    }
    .placeholder-text {
      font-size: 0.8125rem;
      font-weight: 500;
    }
    .progress-details {
      font-size: 0.75rem;
      color: #0284c7;
    }
    .status-overlay {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
    }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      border-radius: 0.25rem;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }
    .badge-uploaded {
      background-color: #f1f5f9;
      color: #475569;
    }
    .badge-processing {
      background-color: #e0f2fe;
      color: #0369a1;
    }
    .badge-processing_failed {
      background-color: #fee2e2;
      color: #b91c1c;
    }
    .badge-quarantined {
      background-color: #ffedd5;
      color: #c2410c;
    }
    .badge-published {
      background-color: #dcfce7;
      color: #15803d;
    }
    .card-body {
      padding: 0.875rem;
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
    }
    .media-title {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 600;
      color: #1e293b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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
