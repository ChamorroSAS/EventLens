import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { MediaCardModel, RetryCycleResponse } from './media.types.js';
import { RetryProcessingActionComponent } from './retry-processing-action.component.js';
import { DownloadOriginalActionComponent } from './download-original-action.component.js';
import { MediaModerationActionsComponent } from './media-moderation-actions.component.js';

@Component({
  selector: 'eventlens-organizer-media-table',
  standalone: true,
  imports: [
    RetryProcessingActionComponent,
    DownloadOriginalActionComponent,
    MediaModerationActionsComponent,
  ],
  template: `
    <div class="table-container" role="region" aria-label="Tabla de medios del evento" tabindex="0">
      <table class="media-table">
        <caption class="sr-only">Lista detallada de fotos y videos del evento con estado y acciones</caption>
        <thead>
          <tr>
            <th scope="col" class="th-preview">Vista previa</th>
            <th scope="col" class="th-file">Archivo</th>
            <th scope="col" class="th-status">Estado</th>
            <th scope="col" class="th-safety">Seguridad</th>
            <th scope="col" class="th-actions">Acciones</th>
          </tr>
        </thead>
        <tbody>
          @for (item of items; track item.mediaRef) {
            <tr
              class="table-row"
              [class.row-failed]="item.status === 'PROCESSING_FAILED'"
              [class.row-quarantined]="item.status === 'QUARANTINED'"
            >
              <td class="td-preview">
                @if (item.previewUrl && item.status === 'PUBLISHED') {
                  <img
                    [src]="item.previewUrl"
                    [alt]="'Vista previa de ' + item.fileName"
                    class="thumb-img"
                    loading="lazy"
                  />
                } @else {
                  <span class="preview-icon" aria-hidden="true">
                    @if (item.status === 'PROCESSING') { ⚙️ }
                    @else if (item.status === 'PROCESSING_FAILED') { ⚠️ }
                    @else if (item.status === 'QUARANTINED') { 🛡️ }
                    @else { 📄 }
                  </span>
                }
              </td>

              <td class="td-file">
                <span class="file-name" [title]="item.fileName">{{ item.fileName }}</span>
                <span class="file-meta">
                  @if (item.format) {
                    <span class="meta-tag">{{ item.format }}</span>
                  }
                  @if (item.sizeBytes) {
                    <span class="meta-tag">{{ formatBytes(item.sizeBytes) }}</span>
                  }
                </span>
              </td>

              <td class="td-status">
                <span class="badge" [class]="'badge-' + item.status.toLowerCase()" role="status">
                  {{ getStatusBadgeText(item) }}
                </span>
                @if (item.status === 'PROCESSING' && item.observableProgress) {
                  <span class="progress-info">
                    @if (item.observableProgress.attempt) {
                      Intento {{ item.observableProgress.attempt }}
                    }
                    @if (item.observableProgress.phase) {
                      ({{ item.observableProgress.phase }})
                    }
                  </span>
                }
              </td>

              <td class="td-safety">
                <span class="safety-text" [class]="'safety-' + item.safety.outcome.toLowerCase()">
                  {{ getSafetyText(item.safety.outcome) }}
                </span>
              </td>

              <td class="td-actions">
                <div class="actions-wrapper">
                  @if (item.status === 'PROCESSING_FAILED' && item.capabilities.canRetry) {
                    <eventlens-retry-processing-action
                      [mediaRef]="item.mediaRef"
                      [eventRef]="item.eventRef"
                      [fileName]="item.fileName"
                      (cycleConfirmed)="onRetrySubmitted($event)"
                      (capabilityRefreshRequired)="onRefreshRequired()"
                    />
                  }

                  @if (item.capabilities.canDownloadOriginal) {
                    <eventlens-download-original-action
                      [fileName]="item.fileName"
                      (downloadRequested)="onDownloadRequested(item)"
                    />
                  }

                  @if (item.status === 'QUARANTINED') {
                    <span class="quarantine-notice">Aislado por seguridad</span>
                  } @else if (item.status === 'PROCESSING') {
                    <span class="processing-notice">Procesamiento en curso…</span>
                  } @else {
                    <eventlens-media-moderation-actions
                      [media]="item"
                      (approve)="approveRequested.emit($event)"
                      (reject)="rejectRequested.emit($event)"
                      (hide)="hideRequested.emit($event)"
                      (republish)="republishRequested.emit($event)"
                      (trash)="trashRequested.emit($event)"
                      (restore)="restoreRequested.emit($event)"
                    />
                  }
                </div>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    .table-container {
      width: 100%;
      overflow-x: auto;
      border: 1px solid #e2e8f0;
      border-radius: 0.5rem;
      background-color: #ffffff;
    }
    .table-container:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .media-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.875rem;
    }
    .media-table th {
      background-color: #f8fafc;
      color: #475569;
      font-weight: 600;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #e2e8f0;
      white-space: nowrap;
    }
    .media-table td {
      padding: 0.875rem 1rem;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    .table-row:hover {
      background-color: #f8fafc;
    }
    .table-row.row-failed {
      background-color: #fffaf0;
    }
    .table-row.row-quarantined {
      background-color: #fff7ed;
    }
    .th-preview, .td-preview {
      width: 60px;
      text-align: center;
    }
    .thumb-img {
      width: 44px;
      height: 44px;
      object-fit: cover;
      border-radius: 0.25rem;
      border: 1px solid #e2e8f0;
    }
    .preview-icon {
      font-size: 1.5rem;
      display: inline-block;
      line-height: 44px;
      height: 44px;
    }
    .td-file {
      min-width: 180px;
      max-width: 260px;
    }
    .file-name {
      display: block;
      font-weight: 600;
      color: #1e293b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .file-meta {
      display: flex;
      gap: 0.375rem;
      margin-top: 0.25rem;
    }
    .meta-tag {
      font-size: 0.75rem;
      color: #64748b;
      background-color: #f1f5f9;
      padding: 0.125rem 0.375rem;
      border-radius: 0.25rem;
    }
    .td-status {
      min-width: 140px;
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
    .progress-info {
      display: block;
      font-size: 0.75rem;
      color: #0284c7;
      margin-top: 0.25rem;
    }
    .td-safety {
      min-width: 110px;
    }
    .safety-text {
      font-weight: 500;
      font-size: 0.8125rem;
    }
    .safety-approved {
      color: #15803d;
    }
    .safety-inconclusive {
      color: #b45309;
    }
    .safety-denied {
      color: #b91c1c;
    }
    .safety-pending {
      color: #64748b;
    }
    .td-actions {
      min-width: 220px;
    }
    .actions-wrapper {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      align-items: flex-start;
    }
    .quarantine-notice {
      font-size: 0.75rem;
      font-weight: 500;
      color: #c2410c;
    }
    .processing-notice {
      font-size: 0.75rem;
      font-weight: 500;
      color: #0369a1;
    }
  `,
})
export class OrganizerMediaTableComponent {
  @Input({ required: true }) items!: MediaCardModel[];

  @Output() retryCycleSubmitted = new EventEmitter<RetryCycleResponse>();
  @Output() refreshRequested = new EventEmitter<void>();
  @Output() downloadTriggered = new EventEmitter<MediaCardModel>();

  @Output() approveRequested = new EventEmitter<MediaCardModel>();
  @Output() rejectRequested = new EventEmitter<MediaCardModel>();
  @Output() hideRequested = new EventEmitter<MediaCardModel>();
  @Output() republishRequested = new EventEmitter<MediaCardModel>();
  @Output() trashRequested = new EventEmitter<MediaCardModel>();
  @Output() restoreRequested = new EventEmitter<MediaCardModel>();

  getStatusBadgeText(item: MediaCardModel): string {
    switch (item.status) {
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
        return item.status;
    }
  }

  getSafetyText(outcome: string): string {
    switch (outcome) {
      case 'APPROVED':
        return 'Aprobada';
      case 'INCONCLUSIVE':
        return 'Inconclusa';
      case 'DENIED':
        return 'Denegada';
      case 'PENDING':
        return 'Pendiente';
      default:
        return outcome;
    }
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  onRetrySubmitted(response: RetryCycleResponse): void {
    this.retryCycleSubmitted.emit(response);
  }

  onRefreshRequired(): void {
    this.refreshRequested.emit();
  }

  onDownloadRequested(item: MediaCardModel): void {
    this.downloadTriggered.emit(item);
  }
}
