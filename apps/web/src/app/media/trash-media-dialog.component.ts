import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import type { MediaCardModel } from './media.types.js';

@Component({
  selector: 'eventlens-trash-media-dialog',
  standalone: true,
  imports: [],
  template: `
    @if (isOpen && media) {
      <div class="dialog-backdrop" (click)="onBackdropClick($event)">
        <div
          class="dialog-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="trash-dialog-title"
          aria-describedby="trash-dialog-desc"
        >
          <header class="dialog-header">
            <h3 id="trash-dialog-title" class="dialog-title">Mover a papelera</h3>
          </header>

          <div id="trash-dialog-desc" class="dialog-body">
            <p>
              ¿Deseas enviar <strong>«{{ media.fileName }}»</strong> a la papelera de reciclaje?
            </p>
            <p class="consequence-note">
              🗑️ <strong>Período de retención de 7 días:</strong> El archivo dejará de ser visible de inmediato.
              Permanecerá en papelera durante 7 días calendario, tiempo durante el cual podrás restaurarlo.
              Trascurrido ese plazo, será purgado definitivamente.
            </p>

            <div class="form-group">
              <label for="trash-reason" class="form-label">Motivo (opcional):</label>
              <input
                type="text"
                id="trash-reason"
                class="form-input"
                placeholder="Ejemplo: Descarte por calidad, solicitud de invitado"
                [value]="reason"
                (input)="onReasonInput($event)"
                [disabled]="isSubmitting"
              />
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
              class="btn-confirm-trash"
              (click)="onConfirm()"
              [disabled]="isSubmitting"
            >
              @if (isSubmitting) {
                Enviando a papelera…
              } @else {
                Mover a papelera
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
      color: #b91c1c;
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
      background-color: #fff7ed;
      padding: 0.75rem;
      border-radius: 0.375rem;
      border-left: 3px solid #ea580c;
      font-size: 0.8125rem;
      color: #9a3412;
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
    .form-input {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-family: inherit;
      box-sizing: border-box;
    }
    .form-input:focus {
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
    .btn-confirm-trash {
      min-height: 40px;
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      border: 1px solid #b91c1c;
      background-color: #b91c1c;
      color: #ffffff;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
    }
    .btn-confirm-trash:hover:not(:disabled) {
      background-color: #991b1b;
    }
    button:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }
  `,
})
export class TrashMediaDialogComponent {
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
    const target = event.target as HTMLInputElement | null;
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
