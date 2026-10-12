import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { MediaCardModel, RetryCycleResponse } from './media.types.js';
import { ProcessingFailedPanelComponent } from './processing-failed-panel.component.js';
import { QuarantinedMediaStateComponent } from './quarantined-media-state.component.js';
import { MediaModerationActionsComponent } from './media-moderation-actions.component.js';

@Component({
  selector: 'eventlens-organizer-media-card',
  standalone: true,
  imports: [
    ProcessingFailedPanelComponent,
    QuarantinedMediaStateComponent,
    MediaModerationActionsComponent,
  ],
  template: `
    <article
      class="media-card"
      [class.card-failed]="media.status === 'PROCESSING_FAILED'"
      [class.card-quarantined]="media.status === 'QUARANTINED'"
      [class.card-trashed]="media.status === 'TRASHED'"
      [class.card-hidden]="media.status === 'HIDDEN'"
      [attr.aria-label]="'Elemento multimedia ' + media.fileName"
    >
      <div class="card-preview-area">
        @if (media.previewUrl && (media.status === 'PUBLISHED' || media.status === 'PENDING_REVIEW' || media.status === 'HIDDEN')) {
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
              @else if (media.status === 'PENDING_REVIEW') { ⏳ }
              @else if (media.status === 'HIDDEN') { 👁️‍🗨️ }
              @else if (media.status === 'REJECTED') { ✕ }
              @else if (media.status === 'TRASHED') { 🗑️ }
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
        } @else {
          <eventlens-media-moderation-actions
            [media]="media"
            (approve)="approveRequested.emit($event)"
            (reject)="rejectRequested.emit($event)"
            (hide)="hideRequested.emit($event)"
            (republish)="republishRequested.emit($event)"
            (trash)="trashRequested.emit($event)"
            (restore)="restoreRequested.emit($event)"
          />
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
    .media-card.card-trashed {
      border-color: #fdba74;
      opacity: 0.85;
    }
    .media-card.card-hidden {
      border-color: #cbd5e1;
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
      font-size: 2rem;
    }
    .placeholder-text {
      font-size: 0.75rem;
      font-weight: 500;
      line-height: 1.25;
    }
    .progress-details {
      font-size: 0.6875rem;
      color: #3b82f6;
      font-weight: 600;
      background-color: #eff6ff;
      padding: 0.125rem 0.375rem;
      border-radius: 0.25rem;
    }
    .status-overlay {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      z-index: 10;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.25rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }
    .badge-uploaded {
      background-color: #e2e8f0;
      color: #475569;
    }
    .badge-processing {
      background-color: #dbeafe;
      color: #1d4ed8;
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
    .badge-pending_review {
      background-color: #fef9c3;
      color: #854d0e;
    }
    .badge-hidden {
      background-color: #f1f5f9;
      color: #475569;
    }
    .badge-rejected {
      background-color: #fee2e2;
      color: #991b1b;
    }
    .badge-trashed {
      background-color: #ffedd5;
      color: #9a3412;
    }
    .badge-deleted {
      background-color: #e2e8f0;
      color: #64748b;
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

  @Output() approveRequested = new EventEmitter<MediaCardModel>();
  @Output() rejectRequested = new EventEmitter<MediaCardModel>();
  @Output() hideRequested = new EventEmitter<MediaCardModel>();
  @Output() republishRequested = new EventEmitter<MediaCardModel>();
  @Output() trashRequested = new EventEmitter<MediaCardModel>();
  @Output() restoreRequested = new EventEmitter<MediaCardModel>();

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
      case 'PENDING_REVIEW':
        return 'Pendiente de aprobación del organizador';
      case 'HIDDEN':
        return 'Oculto para invitados';
      case 'REJECTED':
        return 'Rechazado';
      case 'TRASHED':
        return 'En papelera (retención 7 días)';
      case 'DELETED':
        return 'Eliminado';
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
      case 'PENDING_REVIEW':
        return 'Pendiente';
      case 'HIDDEN':
        return 'Oculto';
      case 'REJECTED':
        return 'Rechazado';
      case 'TRASHED':
        return 'En papelera';
      case 'DELETED':
        return 'Eliminado';
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
