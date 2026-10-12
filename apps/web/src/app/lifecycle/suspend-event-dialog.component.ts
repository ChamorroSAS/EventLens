import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'eventlens-suspend-event-dialog',
  standalone: true,
  template: `
    @if (isOpen) {
      <div
        class="dialog-backdrop"
        role="presentation"
        (click)="onCancel()"
        (keydown.escape)="onCancel()"
      >
        <div
          class="dialog-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="suspend-dialog-title"
          (click)="$event.stopPropagation()"
        >
          <div class="dialog-header">
            <h3 id="suspend-dialog-title" class="dialog-title">Suspender evento administrativamente</h3>
          </div>

          <form (submit)="onSubmit($event)" class="dialog-form">
            <div class="dialog-body">
              <p class="dialog-desc">
                Suspender el evento «{{ eventName }}» bloqueará de inmediato toda operación y acceso
                general, conservando el estado previo para revisiones futuras.
              </p>

              <div class="form-group">
                <label for="suspension-reason-input" class="form-label">
                  Motivo administrativo de suspensión (obligatorio):
                </label>
                <textarea
                  id="suspension-reason-input"
                  class="form-control"
                  rows="3"
                  [value]="reason"
                  (input)="onReasonInput($event)"
                  placeholder="Detalla el motivo o justificación de la suspensión…"
                  required
                ></textarea>
                @if (submitted && !reason.trim()) {
                  <span class="form-error" role="alert">El motivo es obligatorio para suspender.</span>
                }
              </div>
            </div>

            <div class="dialog-actions">
              <button type="button" class="btn btn-secondary" (click)="onCancel()">
                Cancelar
              </button>
              <button
                type="submit"
                class="btn btn-danger"
                [disabled]="!reason.trim()"
              >
                Suspender evento
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
      background-color: rgba(15, 23, 42, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
    }
    .dialog-card {
      background-color: #ffffff;
      border-radius: 0.75rem;
      max-width: 28rem;
      width: 100%;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .dialog-header {
      padding: 1.25rem 1.5rem 0.75rem;
    }
    .dialog-title {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 700;
      color: #991b1b;
    }
    .dialog-form {
      display: flex;
      flex-direction: column;
    }
    .dialog-body {
      padding: 0 1.5rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .dialog-desc {
      margin: 0;
      font-size: 0.875rem;
      color: #475569;
      line-height: 1.4;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }
    .form-label {
      font-size: 0.875rem;
      font-weight: 600;
      color: #334155;
    }
    .form-control {
      padding: 0.5rem 0.75rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-family: inherit;
    }
    .form-control:focus {
      outline: 2px solid #dc2626;
      outline-offset: 1px;
    }
    .form-error {
      font-size: 0.75rem;
      color: #dc2626;
      font-weight: 600;
    }
    .dialog-actions {
      padding: 1rem 1.5rem;
      background-color: #f8fafc;
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      border-top: 1px solid #e2e8f0;
    }
    .btn {
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .btn-secondary {
      background-color: #ffffff;
      border-color: #cbd5e1;
      color: #334155;
    }
    .btn-danger {
      background-color: #dc2626;
      color: #ffffff;
    }
    .btn-danger:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `
})
export class SuspendEventDialogComponent {
  @Input() isOpen = false;
  @Input() eventName = '';

  @Output() confirm = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();

  reason = '';
  submitted = false;

  onReasonInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;
    this.reason = target?.value ?? '';
  }

  onSubmit(event?: Event): void {
    if (event) event.preventDefault();
    this.submitted = true;
    if (this.reason.trim()) {
      this.confirm.emit(this.reason.trim());
      this.reason = '';
      this.submitted = false;
    }
  }

  onCancel(): void {
    this.reason = '';
    this.submitted = false;
    this.cancel.emit();
  }
}
