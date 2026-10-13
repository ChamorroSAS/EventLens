import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'eventlens-export-request-dialog',
  standalone: true,
  template: `
    @if (isOpen) {
      <div class="dialog-backdrop" (click)="onBackdropClick($event)">
        <div
          class="dialog-card export-dialog-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-dialog-title"
          aria-describedby="export-dialog-desc"
        >
          <header class="dialog-header">
            <h3 id="export-dialog-title">Preparar exportación completa</h3>
            <button
              type="button"
              class="btn-close"
              aria-label="Cerrar ventana"
              [disabled]="isSubmitting"
              (click)="cancel.emit()"
            >
              ✕
            </button>
          </header>

          <div class="dialog-body" id="export-dialog-desc">
            <p class="dialog-lead">
              Se generará una descarga con los archivos originales en su calidad máxima.
            </p>

            <div class="info-box">
              <h4 class="info-title">Contenido incluido y reglas (DEC-046, DEC-048)</h4>
              <ul class="info-list">
                <li><strong>Archivos incluidos:</strong> Fotos y videos publicados y ocultos del evento.</li>
                <li><strong>Exclusiones:</strong> Archivos en papelera, rechazados o aún en procesamiento se excluyen automáticamente.</li>
                <li><strong>Formato y tamaño:</strong> Paquetes ZIP multipartes (~5 GB por parte) para facilitar la descarga en conexiones móviles y de escritorio.</li>
                <li><strong>Disponibilidad:</strong> Los paquetes permanecerán disponibles durante <strong>48 horas</strong> a partir de su preparación.</li>
              </ul>
            </div>

            <p class="notice-text">
              La selección queda fijada al solicitar. No se descuenta cuota comercial para almacenamiento operacional de exportación (DEC-079).
            </p>
          </div>

          <footer class="dialog-footer">
            <button
              type="button"
              class="btn-secondary"
              [disabled]="isSubmitting"
              (click)="cancel.emit()"
            >
              Cancelar
            </button>
            <button
              type="button"
              class="btn-primary btn-confirm-export"
              [disabled]="isSubmitting"
              (click)="confirm.emit()"
            >
              @if (isSubmitting) {
                <span class="spinner" aria-hidden="true">⏳</span>
                <span>Iniciando preparación…</span>
              } @else {
                <span>Confirmar y preparar descarga</span>
              }
            </button>
          </footer>
        </div>
      </div>
    }
  `,
  styles: `
    .dialog-backdrop {
      position: fixed;
      inset: 0;
      background-color: rgba(15, 23, 42, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
    }
    .dialog-card {
      background: #ffffff;
      border-radius: 0.75rem;
      max-width: 540px;
      width: 100%;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid #e2e8f0;
    }
    .dialog-header h3 {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 700;
      color: #0f172a;
    }
    .btn-close {
      background: none;
      border: none;
      font-size: 1.25rem;
      color: #64748b;
      cursor: pointer;
      padding: 0.25rem;
      border-radius: 0.25rem;
    }
    .btn-close:hover:not(:disabled) {
      color: #0f172a;
    }
    .dialog-body {
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      color: #334155;
      font-size: 0.875rem;
      line-height: 1.5;
    }
    .dialog-lead {
      margin: 0;
      font-weight: 500;
      color: #0f172a;
    }
    .info-box {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 0.5rem;
      padding: 1rem;
    }
    .info-title {
      margin: 0 0 0.5rem 0;
      font-size: 0.875rem;
      font-weight: 600;
      color: #1e293b;
    }
    .info-list {
      margin: 0;
      padding-left: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }
    .notice-text {
      margin: 0;
      font-size: 0.75rem;
      color: #64748b;
    }
    .dialog-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.75rem;
      padding: 1rem 1.5rem;
      border-top: 1px solid #e2e8f0;
      background-color: #f8fafc;
    }
    .btn-secondary {
      padding: 0.5rem 1rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.375rem;
      background: #ffffff;
      color: #334155;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
    }
    .btn-secondary:hover:not(:disabled) {
      background: #f1f5f9;
    }
    .btn-primary {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      border: 1px solid #0f172a;
      border-radius: 0.375rem;
      background: #0f172a;
      color: #ffffff;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-primary:hover:not(:disabled) {
      background: #1e293b;
    }
    .btn-primary:disabled, .btn-secondary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
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
export class ExportRequestDialogComponent {
  @Input() isOpen = false;
  @Input() isSubmitting = false;
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && !this.isSubmitting) {
      this.cancel.emit();
    }
  }
}
