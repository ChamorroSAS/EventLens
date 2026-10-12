import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChild,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'eventlens-administrative-action-reason-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isOpen) {
      <div
        class="dialog-backdrop"
        role="presentation"
        (click)="onBackdropClick($event)"
      >
        <div
          #dialogContainer
          class="dialog-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reason-dialog-title"
          tabindex="-1"
          (click)="$event.stopPropagation()"
        >
          <div class="dialog-header">
            <h3 id="reason-dialog-title" class="dialog-title">{{ title }}</h3>
            <button
              type="button"
              class="btn-close"
              (click)="onCancel()"
              [disabled]="isSubmitting"
              aria-label="Cerrar ventana"
            >
              ✕
            </button>
          </div>

          <form (submit)="onSubmitForm($event)" class="dialog-form" novalidate>
            <div class="dialog-body">
              <p class="dialog-prompt">{{ prompt }}</p>

              @if (validationError()) {
                <div class="alert-error" role="alert">
                  {{ validationError() }}
                </div>
              }

              <div class="form-group">
                <label for="admin-reason-input" class="form-label">
                  Motivo o justificación <span class="required-indicator">*</span>
                </label>
                <textarea
                  #reasonInput
                  id="admin-reason-input"
                  class="form-textarea"
                  name="reason"
                  [value]="reasonText"
                  (input)="onReasonInput($event)"
                  [disabled]="isSubmitting"
                  rows="3"
                  placeholder="Escribe la justificación obligatoria para auditoría..."
                  required
                ></textarea>
                <span class="field-hint">
                  Esta acción quedará registrada en la bitácora inmutable de auditoría administrativa.
                </span>
              </div>
            </div>

            <div class="dialog-actions">
              <button
                type="button"
                class="btn btn-secondary"
                (click)="onCancel()"
                [disabled]="isSubmitting"
              >
                Cancelar
              </button>
              <button
                type="submit"
                class="btn"
                [ngClass]="isDanger ? 'btn-danger' : 'btn-primary'"
                [disabled]="isSubmitting || !reasonText.trim()"
              >
                @if (isSubmitting) {
                  <span>Procesando...</span>
                } @else {
                  <span>{{ confirmLabel }}</span>
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
  styles: `
    .dialog-backdrop {
      position: fixed;
      inset: 0;
      background-color: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1200;
      padding: 1rem;
    }
    .dialog-card {
      background-color: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 0.75rem;
      max-width: 32rem;
      width: 100%;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      color: #f8fafc;
      outline: none;
    }
    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.25rem 1.5rem 0.75rem;
      border-bottom: 1px solid #1e293b;
    }
    .dialog-title {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 700;
      color: #f8fafc;
    }
    .btn-close {
      background: none;
      border: none;
      font-size: 1.25rem;
      color: #94a3b8;
      cursor: pointer;
      padding: 0.25rem 0.5rem;
      border-radius: 0.375rem;
    }
    .btn-close:hover:not(:disabled) {
      color: #ffffff;
      background-color: #1e293b;
    }
    .dialog-form {
      display: flex;
      flex-direction: column;
    }
    .dialog-body {
      padding: 1.25rem 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .dialog-prompt {
      margin: 0;
      font-size: 0.875rem;
      color: #cbd5e1;
      line-height: 1.4;
    }
    .alert-error {
      padding: 0.625rem 0.875rem;
      background-color: #450a0a;
      border: 1px solid #991b1b;
      border-radius: 0.375rem;
      color: #fca5a5;
      font-size: 0.8125rem;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }
    .form-label {
      font-size: 0.875rem;
      font-weight: 600;
      color: #f1f5f9;
    }
    .required-indicator {
      color: #ef4444;
      font-weight: 600;
    }
    .form-textarea {
      width: 100%;
      padding: 0.625rem;
      background-color: #090d16;
      border: 1px solid #334155;
      border-radius: 0.375rem;
      color: #ffffff;
      font-size: 0.875rem;
      font-family: inherit;
      resize: vertical;
      box-sizing: border-box;
    }
    .form-textarea:focus {
      outline: 2px solid #38bdf8;
      border-color: #38bdf8;
    }
    .field-hint {
      font-size: 0.75rem;
      color: #64748b;
    }
    .dialog-actions {
      padding: 1rem 1.5rem;
      background-color: #090d16;
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      border-top: 1px solid #1e293b;
    }
    .btn {
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      min-height: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.15s;
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-secondary {
      background-color: #1e293b;
      border-color: #334155;
      color: #cbd5e1;
    }
    .btn-secondary:hover:not(:disabled) {
      background-color: #334155;
    }
    .btn-primary {
      background-color: #0284c7;
      color: #ffffff;
    }
    .btn-primary:hover:not(:disabled) {
      background-color: #0369a1;
    }
    .btn-danger {
      background-color: #dc2626;
      color: #ffffff;
    }
    .btn-danger:hover:not(:disabled) {
      background-color: #b91c1c;
    }
  `
})
export class AdministrativeActionReasonDialogComponent {
  @Input() isOpen = false;
  @Input() title = 'Justificación de acción administrativa';
  @Input() prompt = 'Indica el motivo justificado antes de proceder:';
  @Input() confirmLabel = 'Confirmar';
  @Input() isDanger = false;
  @Input() isSubmitting = false;

  @Output() confirm = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();

  reasonText = '';
  readonly validationError = signal<string | null>(null);

  @HostListener('keydown.escape', ['$event'])
  handleEscape(event?: Event): void {
    if (this.isOpen && !this.isSubmitting) {
      event?.preventDefault();
      this.onCancel();
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if (!this.isSubmitting) {
      this.onCancel();
    }
  }

  onReasonInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.reasonText = target?.value ?? '';
    if (this.reasonText.trim()) {
      this.validationError.set(null);
    }
  }

  onSubmitForm(event: Event): void {
    event.preventDefault();
    if (!this.reasonText.trim()) {
      this.validationError.set('Debes ingresar un motivo o justificación válido.');
      return;
    }
    this.confirm.emit(this.reasonText.trim());
  }

  onCancel(): void {
    if (this.isSubmitting) return;
    this.reasonText = '';
    this.validationError.set(null);
    this.cancel.emit();
  }
}
