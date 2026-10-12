import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import type { MediaCardModel } from './media.types.js';

@Component({
  selector: 'eventlens-reject-media-dialog',
  standalone: true,
  imports: [],
  template: `
    @if (isOpen && media) {
      <div class="dialog-backdrop" (click)="onBackdropClick($event)">
        <div
          class="dialog-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-dialog-title"
          aria-describedby="reject-dialog-desc"
        >
          <header class="dialog-header">
            <h3 id="reject-dialog-title" class="dialog-title">Rechazar foto/video</h3>
          </header>

          <div id="reject-dialog-desc" class="dialog-body">
            <p>
              ¿Estás seguro de que deseas rechazar <strong>«{{ media.fileName }}»</strong>?
            </p>
            <p class="consequence-note">
              ⚠️ El archivo permanecerá archivado como RECHAZADO y no será publicado en la galería de los invitados.
            </p>

            <div class="form-group">
              <label for="reject-reason" class="form-label">Motivo del rechazo (opcional):</label>
              <textarea
                id="reject-reason"
                class="form-textarea"
                rows="3"
                placeholder="Ejemplo: Fuera de foco, duplicado o inapropiado"
                [value]="reason"
                (input)="onReasonInput($event)"
                [disabled]="isSubmitting"
              ></textarea>
            </div>
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
              class="btn-confirm-reject"
              (click)="onConfirm()"
              [disabled]="isSubmitting"
            >
              @if (isSubmitting) {
                Rechazando…
              } @else {
                Confirmar rechazo
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
      color: #991b1b;
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
      background-color: #fef2f2;
      padding: 0.75rem;
      border-radius: 0.375rem;
      border-left: 3px solid #ef4444;
      font-size: 0.8125rem;
      color: #991b1b;
    }
    .form-group {
      margin-top: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }
    .form-label {
      font-weight: 600;
      font-size: 0.8125rem;
      color: #1e293b;
    }
    .form-textarea {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-family: inherit;
      resize: vertical;
      box-sizing: border-box;
    }
    .form-textarea:focus {
      outline: 2px solid #2563eb;
      outline-offset: 1px;
      border-color: transparent;
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
    .btn-confirm-reject {
      min-height: 40px;
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      border: 1px solid #dc2626;
      background-color: #dc2626;
      color: #ffffff;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
    }
    .btn-confirm-reject:hover:not(:disabled) {
      background-color: #b91c1c;
    }
    button:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }
  `,
})
export class RejectMediaDialogComponent {
  @Input() media: MediaCardModel | null = null;
  @Input() isOpen = false;
  @Input() isSubmitting = false;

  @Output() confirm = new EventEmitter<{ media: MediaCardModel; reason?: string }>();
  @Output() cancel = new EventEmitter<void>();

  reason = '';

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen && !this.isSubmitting) {
      this.onCancel();
    }
  }

  onReasonInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;
    this.reason = target ? target.value : '';
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && !this.isSubmitting) {
      this.onCancel();
    }
  }

  onCancel(): void {
    this.reason = '';
    this.cancel.emit();
  }

  onConfirm(): void {
    if (this.media) {
      this.confirm.emit({
        media: this.media,
        reason: this.reason.trim() || undefined,
      });
      this.reason = '';
    }
  }
}
