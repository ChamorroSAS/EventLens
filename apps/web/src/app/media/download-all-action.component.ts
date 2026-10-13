import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'eventlens-download-all-action',
  standalone: true,
  template: `
    <div class="download-all-container">
      @if (exportStatus === 'PREPARING' || exportStatus === 'REQUESTED') {
        <button
          type="button"
          class="btn-export-status btn-preparing"
          aria-label="Ver progreso de preparación de la exportación"
          (click)="statusRequested.emit()"
        >
          <span class="spinner" aria-hidden="true">⏳</span>
          <span>Preparando descarga…</span>
        </button>
      } @else if (exportStatus === 'AVAILABLE') {
        <button
          type="button"
          class="btn-export-status btn-available"
          aria-label="Descargas listas. Ver paquetes disponibles"
          (click)="statusRequested.emit()"
        >
          <span aria-hidden="true">📦</span>
          <span>Exportación lista</span>
        </button>
      } @else if (exportStatus === 'FAILED' || exportStatus === 'EXPIRED' || exportStatus === 'INVALIDATED') {
        <button
          type="button"
          class="btn-export-status btn-attention"
          [attr.aria-label]="'Exportación ' + (exportStatus ? exportStatus.toLowerCase() : '') + '. Ver detalles'"
          (click)="statusRequested.emit()"
        >
          <span aria-hidden="true">⚠️</span>
          <span>{{ exportStatus === 'FAILED' ? 'Exportación fallida' : exportStatus === 'EXPIRED' ? 'Exportación expirada' : 'Exportación invalidada' }}</span>
        </button>
      } @else {
        <button
          type="button"
          class="btn-download-all"
          [disabled]="disabled"
          aria-label="Descargar todo el contenido en paquetes ZIP"
          (click)="openDialogRequested.emit()"
        >
          <span aria-hidden="true">📥</span>
          <span>Descargar todo (ZIP)</span>
        </button>
      }
    </div>
  `,
  styles: `
    .download-all-container {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }
    .btn-download-all, .btn-export-status {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      min-height: 38px;
      padding: 0.375rem 0.875rem;
      border-radius: 0.375rem;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.15s ease, border-color 0.15s ease;
    }
    .btn-download-all {
      border: 1px solid #0f172a;
      background-color: #0f172a;
      color: #ffffff;
    }
    .btn-download-all:hover:not(:disabled) {
      background-color: #1e293b;
    }
    .btn-download-all:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-preparing {
      border: 1px solid #cbd5e1;
      background-color: #f1f5f9;
      color: #334155;
    }
    .btn-available {
      border: 1px solid #16a34a;
      background-color: #f0fdf4;
      color: #166534;
    }
    .btn-attention {
      border: 1px solid #ea580c;
      background-color: #fff7ed;
      color: #c2410c;
    }
    .spinner {
      display: inline-block;
      animation: spin 1.5s linear infinite;
    }
    @keyframes spin {
      100% { transform: rotate(360deg); }
    }
  `
})
export class DownloadAllActionComponent {
  @Input() disabled = false;
  @Input() exportStatus: string | null = null;
  @Output() openDialogRequested = new EventEmitter<void>();
  @Output() statusRequested = new EventEmitter<void>();
}
