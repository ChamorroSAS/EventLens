import { Component, EventEmitter, Input, Output, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { FilePickerComponent } from './file-picker.component.js';
import { UploadFileItemComponent } from './upload-file-item.component.js';
import { UploadProgressSummaryComponent } from './upload-progress-summary.component.js';
import { UsageLimitAlertComponent } from './usage-limit-alert.component.js';
import { UploadService } from './upload.service.js';
import { UploadOrchestratorService, createUploadKey } from './upload-orchestrator.service.js';
import type { UploadLocalFile, UploadBatchSummary } from './upload.types.js';

@Component({
  selector: 'eventlens-upload-container',
  standalone: true,
  imports: [
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
      @if (showPicker) { <eventlens-file-picker
        [disabled]="isPolicyBlocked"
        label="Elegir fotos y videos"
        (filesSelected)="onFilesSelected($event)"
      /> }

      <!-- Batch Progress Summary (when files exist) -->
      @if (files.length > 0) {
        <div class="batch-section">
          <eventlens-upload-progress-summary [summary]="batchSummary" />
          @if (showStartButton) { <button type="button" class="start-button" [disabled]="isPolicyBlocked || !hasQueuedFiles" (click)="startQueuedUploads()">Cargar archivos</button> }

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
    .start-button { min-height: 44px; padding: 0.75rem; }
    .start-button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
  `
})
export class UploadContainerComponent implements OnChanges, OnDestroy {
  @Input() isPolicyBlocked = false;
  @Input() contextKey = '';
  @Input() showPicker = true;
  @Input() showStartButton = true;
  @Output() received = new EventEmitter<string>();
  private generation = 0;
  private running = 0;
  private pending: UploadLocalFile[] = [];
  get hasQueuedFiles(): boolean { return this.files.some(file => file.status === 'QUEUED'); }
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['contextKey'] && !changes['contextKey'].firstChange) { this.cancelOwned(); this.files = []; this.refreshSummary(); }
    if (changes['isPolicyBlocked']?.currentValue === true) this.handlePolicyCancellation('UPLOADS_UNAVAILABLE');
  }
  ngOnDestroy(): void { this.cancelOwned(); }
  cancelPendingTransfers(): void { this.cancelOwned(); }
  private cancelOwned(): void { this.generation++; this.orchestrator.abort(this.files.map(file => file.id)); this.pending = []; this.running = 0; }
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

  constructor(
    private readonly uploadService: UploadService,
    private readonly orchestrator: UploadOrchestratorService
  ) {}

  private refreshSummary(): void {
    this.batchSummary = this.uploadService.calculateBatchSummary(this.files);
  }

  /**
   * Criterio 1: Dado una selección múltiple, cuando hay archivos inválidos
   * conocidos localmente, entonces se señalan individualmente sin bloquear los elegibles.
   */
  onFilesSelected(selectedFiles: File[]): void {
    if (this.isPolicyBlocked) return;
    for (const rawFile of selectedFiles) {
      const validation = this.uploadService.validateLocalFile(rawFile);
      const fileId = createUploadKey();

      const localFile: UploadLocalFile = {
        id: fileId,
        file: rawFile,
        name: rawFile.name,
        size: rawFile.size,
        type: this.uploadService.resolveContentType(rawFile),
        idempotencyKey: createUploadKey(),
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
    if (!item || !item.canRetry || this.isPolicyBlocked) return;

    item.status = 'QUEUED';
    item.error = undefined;
    item.canRetry = false;

    this.refreshSummary();
    this.fileRetried.emit(fileId);

    this.pending.push(item);
    this.drain();
  }

  startQueuedUploads(): void {
    if (this.isPolicyBlocked) return;
    for (const file of this.files.filter(item => item.status === 'QUEUED')) {
      if (!this.pending.includes(file)) this.pending.push(file);
    }
    this.drain();
  }
  private drain(): void {
    while (!this.isPolicyBlocked && this.running < 2 && this.pending.length) {
      const file = this.pending.shift()!;
      const generation = this.generation;
      this.running++;
      void this.orchestrator.startUpload(file, {
        onProgress: (id, progress) => { if (generation === this.generation) this.updateFileProgress(id, progress); },
        onStatusChange: (id, status, options) => { if (generation === this.generation) this.updateFileStatus(id, status, options); }
      }).finally(() => { if (generation === this.generation) { this.running--; this.drain(); } });
    }
  }
  removeQueuedFile(rawFile: File): void {
    this.files = this.files.filter(file => file.file !== rawFile || (file.status !== 'QUEUED' && !file.isInvalidLocal));
    this.refreshSummary();
  }
  reconcileContributions(items: readonly { attemptId: string; status: string }[]): void {
    for (const item of items) {
      const file = this.files.find(file => file.attemptId === item.attemptId);
      if (file && item.status === 'CANCELLED') { file.status = 'CANCELLED_POLICY'; file.canRetry = false; }
    }
    this.refreshSummary();
  }

  /**
   * Criterio 4: Dado cierre/revocación/cancelación por policy,
   * los intentos no confirmados se muestran cancelados y los confirmados permanecen recibidos.
   */
  handlePolicyCancellation(reason: string): void {
    this.cancelOwned();
    this.files = this.uploadService.applyPolicyCancellation(this.files, reason);
    this.isPolicyBlocked = true;
    this.showAlert = true;
    this.alertTitle = 'Cargas suspendidas por política';
    this.alertMessage = 'El evento no admite nuevas cargas. Consulta Mis aportes para conocer el estado actual de los archivos transferidos.';
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
    if (item && item.status !== 'CANCELLED_POLICY') {
      item.status = status;
      if (options?.error) item.error = options.error;
      if (options?.canRetry !== undefined) item.canRetry = options.canRetry;
      if (options?.attemptId) item.attemptId = options.attemptId;
      if (status === 'RECEIVED') {
        item.progress = 100;
        this.received.emit(item.attemptId!);
      }
      this.refreshSummary();
    }
  }
}
