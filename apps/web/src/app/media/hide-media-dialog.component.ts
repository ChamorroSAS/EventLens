import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import type { MediaCardModel } from './media.types.js';

@Component({
  selector: 'eventlens-hide-media-dialog',
  standalone: true,
  template: `
    @if (isOpen && media) {
      <div class="dialog-backdrop" (click)="onBackdropClick($event)">
        <div
          class="dialog-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hide-dialog-title"
          aria-describedby="hide-dialog-desc"
        >
          <header class="dialog-header">
            <h3 id="hide-dialog-title" class="dialog-title">Ocultar foto/video</h3>
          </header>

          <div id="hide-dialog-desc" class="dialog-body">
            <p>
              ¿Deseas ocultar <strong>«{{ media.fileName }}»</strong> de la galería pública?
            </p>
            <p class="consequence-note">
              ℹ️ Esta acción es reversible: el archivo dejará de ser visible para los invitados,
              pero se conserva su original íntegro y no reduce tu consumo ni cuota comercial.
            </p>
          </div>

          <footer class="dialog-footer">
            <button
              type="button"
              class="btn-cancel"
              (click)="onCancel()"
              [disabled]="isSubmitting"
            >
              Cancelar
            </button>
            <button
              type="button"
              class="btn-confirm-hide"
              (click)="onConfirm()"
              [disabled]="isSubmitting"
            >
              @if (isSubmitting) {
                Ocultando…
              } @else {
                Ocultar de la galería
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
      z-index: 50;
      padding: 1rem;
    }
    .dialog-card {
      background-color: #ffffff;
      border-radius: 0.75rem;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
      overflow: hidden;
      border: 1px solid #e2e8f0;
    }
    .dialog-header {
      padding: 1.25rem 1.5rem 0.75rem;
      border-bottom: 1px solid #f1f5f9;
    }
    .dialog-title {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 700;
      color: #0f172a;
    }
    .dialog-body {
      padding: 1.25rem 1.5rem;
      font-size: 0.875rem;
      color: #334155;
      line-height: 1.5;
    }
    .dialog-body p {
      margin: 0 0 0.75rem;
    }
    .consequence-note {
      background-color: #f8fafc;
      padding: 0.75rem;
      border-radius: 0.375rem;
      border-left: 3px solid #64748b;
      font-size: 0.8125rem;
      color: #475569;
    }
    .dialog-footer {
      padding: 0.875rem 1.5rem;
      background-color: #f8fafc;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
    }
    .btn-cancel {
      min-height: 40px;
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      border: 1px solid #cbd5e1;
      background-color: #ffffff;
      color: #334155;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
    }
    .btn-cancel:hover:not(:disabled) {
      background-color: #f1f5f9;
    }
    .btn-confirm-hide {
      min-height: 40px;
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      border: 1px solid #475569;
      background-color: #334155;
      color: #ffffff;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
    }
    .btn-confirm-hide:hover:not(:disabled) {
      background-color: #1e293b;
    }
    button:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }
  `,
})
export class HideMediaDialogComponent {
  @Input() media: MediaCardModel | null = null;
  @Input() isOpen = false;
  @Input() isSubmitting = false;

  @Output() confirm = new EventEmitter<MediaCardModel>();
  @Output() cancel = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen && !this.isSubmitting) {
      this.onCancel();
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && !this.isSubmitting) {
      this.onCancel();
    }
  }

  onCancel(): void {
    this.cancel.emit();
  }

  onConfirm(): void {
    if (this.media) {
      this.confirm.emit(this.media);
    }
  }
}
