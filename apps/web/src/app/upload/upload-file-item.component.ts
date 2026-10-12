import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { UploadLocalFile } from './upload.types.js';

@Component({
  selector: 'eventlens-upload-file-item',
  standalone: true,
  template: `
    <li
      class="file-item-row"
      [class.item-received]="file.status === 'RECEIVED'"
      [class.item-error]="file.status === 'REJECTED' || file.isInvalidLocal"
      [class.item-cancelled]="file.status === 'CANCELLED_POLICY'"
      [attr.aria-label]="'Archivo ' + file.name + ': ' + getStatusLabel()"
    >
      <div class="item-icon-area" aria-hidden="true">
        <span class="type-icon">{{ isVideo() ? '🎬' : '📷' }}</span>
      </div>

      <div class="item-content-area">
        <div class="item-header">
          <span class="file-name" [title]="file.name">{{ file.name }}</span>
          <span class="file-size">{{ formatSize(file.size) }}</span>
        </div>

        <!-- Measurable progress bar during transfer -->
        @if (file.status === 'UPLOADING') {
          <div
            class="progress-bar-container"
            role="progressbar"
            [attr.aria-valuenow]="file.progress"
            aria-valuemin="0"
            aria-valuemax="100"
            [attr.aria-label]="'Progreso de carga de ' + file.name + ': ' + file.progress + '%'"
          >
            <div class="progress-bar-fill" [style.width.%]="file.progress"></div>
          </div>
        }

        <div class="status-meta">
          <span
            class="status-text"
            [class.text-success]="file.status === 'RECEIVED'"
            [class.text-error]="file.status === 'REJECTED' || file.isInvalidLocal"
            [class.text-warning]="file.status === 'CANCELLED_POLICY'"
          >
            {{ getStatusLabel() }}
          </span>

          @if (file.status === 'CONFIRMING' || file.status === 'VALIDATING') {
            <span class="indeterminate-spinner" aria-hidden="true">⏳</span>
          }
        </div>

        @if (file.error || file.localValidationError) {
          <p class="error-detail" role="alert">
            {{ file.localValidationError || file.error }}
          </p>
        }
      </div>

      <!-- Retry action (accessible tap target >= 44x44px) -->
      @if (file.canRetry) {
        <div class="item-actions">
          <button
            type="button"
            class="retry-btn"
            [attr.aria-label]="'Reintentar carga de ' + file.name"
            (click)="onRetryClick()"
          >
            <span class="retry-icon" aria-hidden="true">🔄</span>
            <span class="retry-text">Reintentar</span>
          </button>
        </div>
      }
    </li>
  `,
  styles: `
    .file-item-row {
      display: flex;
      align-items: center;
      gap: 0.875rem;
      padding: 0.875rem 1rem;
      border-radius: 0.5rem;
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      margin-bottom: 0.5rem;
      list-style: none;
      transition: background-color 0.15s ease, border-color 0.15s ease;
    }
    .file-item-row.item-received {
      border-color: #86efac;
      background-color: #f0fdf4;
    }
    .file-item-row.item-error {
      border-color: #fca5a5;
      background-color: #fef2f2;
    }
    .file-item-row.item-cancelled {
      border-color: #cbd5e1;
      background-color: #f8fafc;
      opacity: 0.85;
    }
    .item-icon-area {
      flex-shrink: 0;
      font-size: 1.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 0.375rem;
      background-color: #f1f5f9;
    }
    .item-content-area {
      flex: 1;
      min-width: 0; /* truncate text safely */
    }
    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 0.5rem;
      margin-bottom: 0.25rem;
    }
    .file-name {
      font-size: 0.875rem;
      font-weight: 600;
      color: #1e293b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .file-size {
      font-size: 0.75rem;
      color: #64748b;
      flex-shrink: 0;
    }
    .progress-bar-container {
      width: 100%;
      height: 6px;
      background-color: #e2e8f0;
      border-radius: 9999px;
      overflow: hidden;
      margin: 0.375rem 0;
    }
    .progress-bar-fill {
      height: 100%;
      background-color: #2563eb;
      border-radius: 9999px;
      transition: width 0.2s ease;
    }
    .status-meta {
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }
    .status-text {
      font-size: 0.8125rem;
      color: #475569;
    }
    .text-success {
      color: #15803d;
      font-weight: 600;
    }
    .text-error {
      color: #b91c1c;
      font-weight: 600;
    }
    .text-warning {
      color: #b45309;
    }
    .indeterminate-spinner {
      font-size: 0.8125rem;
      animation: pulse 1s infinite alternate;
    }
    @keyframes pulse {
      from { opacity: 0.5; }
      to { opacity: 1; }
    }
    .error-detail {
      margin: 0.25rem 0 0;
      font-size: 0.75rem;
      color: #b91c1c;
    }
    .item-actions {
      flex-shrink: 0;
    }
    .retry-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      min-width: 44px;
      min-height: 44px; /* WCAG 2.2 AA target size */
      padding: 0.375rem 0.75rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.375rem;
      background-color: #ffffff;
      color: #2563eb;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
      outline: none;
      transition: background-color 0.15s ease, border-color 0.15s ease;
    }
    .retry-btn:hover {
      background-color: #eff6ff;
      border-color: #93c5fd;
    }
    .retry-btn:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }
  `
})
export class UploadFileItemComponent {
  @Input({ required: true }) file!: UploadLocalFile;

  @Output() retry = new EventEmitter<string>();

  isVideo(): boolean {
    const type = this.file.type?.toLowerCase() || '';
    const name = this.file.name?.toLowerCase() || '';
    return type.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.mov') || name.endsWith('.webm');
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  getStatusLabel(): string {
    if (this.file.isInvalidLocal) {
      return 'Archivo no admitido localmente';
    }

    switch (this.file.status) {
      case 'QUEUED':
        return 'En espera';
      case 'AUTHORIZING':
        return 'Solicitando autorización…';
      case 'UPLOADING':
        return `Subiendo… ${this.file.progress}%`;
      case 'CONFIRMING':
        return 'Confirmando carga…';
      case 'VALIDATING':
        return 'Validando formato…';
      case 'RECEIVED':
        return 'Recibido ✓';
      case 'REJECTED':
        return 'Error en la transferencia';
      case 'CANCELLED_POLICY':
        return 'Cancelado por cierre del evento';
      default:
        return 'Pendiente';
    }
  }

  onRetryClick(): void {
    this.retry.emit(this.file.id);
  }
}
