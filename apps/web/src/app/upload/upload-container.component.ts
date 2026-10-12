import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FilePickerComponent } from './file-picker.component.js';
import { UploadFileItemComponent } from './upload-file-item.component.js';
import { UploadProgressSummaryComponent } from './upload-progress-summary.component.js';
import { UsageLimitAlertComponent } from './usage-limit-alert.component.js';
import { UploadService } from './upload.service.js';
import type { UploadLocalFile, UploadBatchSummary } from './upload.types.js';

@Component({
  selector: 'eventlens-upload-container',
  standalone: true,
  imports: [
    CommonModule,
    FilePickerComponent,
    UploadFileItemComponent,
    UploadProgressSummaryComponent,
    UsageLimitAlertComponent
  ],
  template: `
    <section class="upload-container" aria-labelledby="upload-section-title">
      <header class="upload-header">
        <h2 id="upload-section-title" class="section-title">Compartir recuerdos</h2>
        <p class="section-subtitle">
          Sube tus fotos y videos del evento de manera directa y segura.
        </p>
      </header>

      <!-- Usage Limit / Policy Alert -->
      <eventlens-usage-limit-alert
        [visible]="showAlert"
        [title]="alertTitle"
        [message]="alertMessage"
        [type]="alertType"
      />

      <!-- File Picker (disabled if policy blocks uploads) -->
      <eventlens-file-picker
        [disabled]="isPolicyBlocked"
        label="Elegir fotos y videos"
        (filesSelected)="onFilesSelected($event)"
      />

      <!-- Batch Progress Summary (when files exist) -->
      @if (files.length > 0) {
        <div class="batch-section">
          <eventlens-upload-progress-summary [summary]="batchSummary" />

          <!-- Queue / List of files (vertical rows for mobile accessibility) -->
          <ul
            class="upload-queue-list"
            role="list"
            aria-label="Lista de archivos seleccionados"
          >
            @for (item of files; track item.id) {
              <eventlens-upload-file-item
                [file]="item"
                (retry)="onFileRetry($event)"
              />
            }
          </ul>
        </div>
      }
    </section>
  `,
  styles: `
    .upload-container {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      max-width: 640px;
      margin: 0 auto;
      padding: 1rem;
    }
    .upload-header {
      text-align: left;
    }
    .section-title {
      margin: 0 0 0.25rem;
      font-size: 1.25rem;
      font-weight: 700;
      color: #0f172a;
    }
    .section-subtitle {
      margin: 0;
      font-size: 0.875rem;
      color: #475569;
    }
    .batch-section {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .upload-queue-list {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
  `
})
export class UploadContainerComponent {
  @Input() isPolicyBlocked = false;
  showAlert = false;
  alertTitle?: string;
  alertMessage = '';
  alertType: 'warning' | 'error' | 'info' = 'warning';

  @Output() fileQueued = new EventEmitter<UploadLocalFile>();
  @Output() fileRetried = new EventEmitter<string>();

  files: UploadLocalFile[] = [];
  batchSummary: UploadBatchSummary = {
    totalFiles: 0,
    receivedCount: 0,
    inProgressCount: 0,
    actionRequiredCount: 0,
    rejectedCount: 0,
    cancelledCount: 0,
    overallProgress: 0,
    allCompleted: false
  };

  constructor(private readonly uploadService: UploadService) {}

  private refreshSummary(): void {
    this.batchSummary = this.uploadService.calculateBatchSummary(this.files);
  }

  /**
   * Criterio 1: Dado una selección múltiple, cuando hay archivos inválidos
   * conocidos localmente, entonces se señalan individualmente sin bloquear los elegibles.
   */
  onFilesSelected(selectedFiles: File[]): void {
    for (const rawFile of selectedFiles) {
      const validation = this.uploadService.validateLocalFile(rawFile);
      const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const localFile: UploadLocalFile = {
        id: fileId,
        file: rawFile,
        name: rawFile.name,
        size: rawFile.size,
        type: rawFile.type,
        status: validation.valid ? 'QUEUED' : 'REJECTED',
        progress: 0,
        canRetry: false,
        isInvalidLocal: !validation.valid,
        localValidationError: validation.reason
      };

      this.files.push(localFile);
      this.fileQueued.emit(localFile);
    }
    this.refreshSummary();
  }

  /**
   * Criterio 3: Dado un fallo retryable, cuando el usuario reintenta ese archivo,
   * entonces los demás mantienen su estado.
   */
  onFileRetry(fileId: string): void {
    const item = this.files.find((f) => f.id === fileId);
    if (!item || !item.canRetry) return;

    item.status = 'QUEUED';
    item.progress = 0;
    item.error = undefined;
    item.canRetry = false;

    this.refreshSummary();
    this.fileRetried.emit(fileId);
  }

  /**
   * Criterio 4: Dado cierre/revocación/cancelación por policy,
   * los intentos no confirmados se muestran cancelados y los confirmados permanecen recibidos.
   */
  handlePolicyCancellation(reason: string): void {
    this.files = this.uploadService.applyPolicyCancellation(this.files, reason);
    this.isPolicyBlocked = true;
    this.showAlert = true;
    this.alertTitle = 'Cargas suspendidas por política';
    this.alertMessage = `El evento no admite nuevas cargas (${reason}). Los archivos confirmados se preservaron.`;
    this.alertType = 'warning';
    this.refreshSummary();
  }

  /**
   * Actualiza el progreso de un archivo específico durante la transferencia.
   */
  updateFileProgress(fileId: string, progress: number): void {
    const item = this.files.find((f) => f.id === fileId);
    if (item && item.status === 'UPLOADING') {
      item.progress = Math.min(100, Math.max(0, progress));
      this.refreshSummary();
    }
  }

  /**
   * Actualiza el estado de un archivo específico.
   */
  updateFileStatus(
    fileId: string,
    status: UploadLocalFile['status'],
    options?: { error?: string; canRetry?: boolean; attemptId?: string }
  ): void {
    const item = this.files.find((f) => f.id === fileId);
    if (item) {
      item.status = status;
      if (options?.error) item.error = options.error;
      if (options?.canRetry !== undefined) item.canRetry = options.canRetry;
      if (options?.attemptId) item.attemptId = options.attemptId;
      if (status === 'RECEIVED') {
        item.progress = 100;
      }
      this.refreshSummary();
    }
  }
}
