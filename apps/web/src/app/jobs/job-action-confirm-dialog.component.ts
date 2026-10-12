import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { AdminJobAction } from './jobs.types.js';

@Component({
  selector: 'eventlens-job-action-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="dialog-backdrop"
      (click)="onBackdropClick($event)"
      (keydown.escape)="onCancel()"
      tabindex="-1"
    >
      <div
        #dialogContainer
        class="dialog-card"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="'dialog-title-' + action"
        tabindex="-1"
      >
        <header class="dialog-header">
          <h3 [id]="'dialog-title-' + action" class="dialog-title">
            Confirmar acción: <span class="action-highlight">{{ actionLabel() }}</span>
          </h3>
          <p class="dialog-subtitle">
            Job ID: <span class="mono">{{ jobId }}</span>
          </p>
        </header>

        <form class="dialog-form" (submit)="onSubmit($event)">
          <div class="form-group">
            <label for="action-reason" class="form-label">
              Motivo operativo justificado <span class="required" aria-hidden="true">*</span>
            </label>
            <textarea
              #reasonInput
              id="action-reason"
              class="form-textarea"
              rows="3"
              placeholder="Explique detalladamente la causa operativa de esta intervención..."
              [value]="reason()"
              (input)="onReasonInput($any($event.target).value)"
              [attr.aria-invalid]="!isValid()"
              aria-describedby="reason-help reason-error"
            ></textarea>
            <div id="reason-help" class="form-help">
              Mínimo 5 caracteres, máximo 500. Restante: {{ 500 - reason().length }}
            </div>
            @if (showError() && !isValid()) {
              <div id="reason-error" class="form-error" role="alert">
                {{ errorMessage() }}
              </div>
            }
          </div>

          <div class="dialog-actions">
            <button
              type="button"
              class="btn btn-secondary"
              (click)="onCancel()"
              [disabled]="submitting"
            >
              Cancelar
            </button>
            <button
              type="submit"
              class="btn"
              [ngClass]="actionButtonClass()"
              [disabled]="!isValid() || submitting"
            >
              @if (submitting) {
                <span class="spinner" aria-hidden="true"></span> Procesando...
              } @else {
                Confirmar {{ actionLabel() }}
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .dialog-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
    }
    .dialog-card {
      background: #1e293b;
      color: #f8fafc;
      border: 1px solid #334155;
      border-radius: 0.75rem;
      max-width: 32rem;
      width: 100%;
      padding: 1.5rem;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .dialog-header {
      margin-bottom: 1rem;
      border-bottom: 1px solid #334155;
      padding-bottom: 0.75rem;
    }
    .dialog-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0;
    }
    .action-highlight {
      color: #38bdf8;
    }
    .dialog-subtitle {
      color: #94a3b8;
      font-size: 0.875rem;
      margin: 0.25rem 0 0 0;
    }
    .mono {
      font-family: monospace;
    }
    .form-group {
      margin-bottom: 1.25rem;
    }
    .form-label {
      display: block;
      font-weight: 500;
      font-size: 0.875rem;
      margin-bottom: 0.5rem;
      color: #e2e8f0;
    }
    .required {
      color: #f87171;
    }
    .form-textarea {
      width: 100%;
      background: #0f172a;
      border: 1px solid #475569;
      border-radius: 0.375rem;
      color: #f8fafc;
      padding: 0.5rem 0.75rem;
      font-family: inherit;
      font-size: 0.875rem;
      box-sizing: border-box;
    }
    .form-textarea:focus {
      outline: 2px solid #38bdf8;
      border-color: transparent;
    }
    .form-help {
      font-size: 0.75rem;
      color: #94a3b8;
      margin-top: 0.25rem;
    }
    .form-error {
      font-size: 0.75rem;
      color: #f87171;
      margin-top: 0.25rem;
    }
    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
    }
    .btn {
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-weight: 500;
      font-size: 0.875rem;
      cursor: pointer;
      border: 1px solid transparent;
      transition: background-color 0.2s;
    }
    .btn-secondary {
      background: #334155;
      color: #f8fafc;
    }
    .btn-secondary:hover {
      background: #475569;
    }
    .btn-retry {
      background: #0284c7;
      color: white;
    }
    .btn-retry:hover {
      background: #0369a1;
    }
    .btn-danger {
      background: #dc2626;
      color: white;
    }
    .btn-danger:hover {
      background: #b91c1c;
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `]
})
export class JobActionConfirmDialogComponent implements OnInit, OnDestroy {
  @Input({ required: true }) jobId!: string;
  @Input({ required: true }) action!: AdminJobAction;
  @Input() submitting: boolean = false;
  @Input() invokingElement: HTMLElement | null = null;

  @Output() confirmed = new EventEmitter<{ jobId: string; action: AdminJobAction; reason: string }>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild('reasonInput') reasonInputRef!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('dialogContainer') dialogContainerRef!: ElementRef<HTMLDivElement>;

  readonly reason = signal<string>('');
  readonly showError = signal<boolean>(false);

  ngOnInit(): void {
    setTimeout(() => {
      this.reasonInputRef?.nativeElement?.focus();
    }, 50);
  }

  ngOnDestroy(): void {
    if (this.invokingElement && typeof this.invokingElement.focus === 'function') {
      this.invokingElement.focus();
    }
  }

  onReasonInput(value: string): void {
    this.reason.set(value);
    this.showError.set(true);
  }

  isValid(): boolean {
    const trimmed = this.reason().trim();
    return trimmed.length >= 5 && trimmed.length <= 500;
  }

  errorMessage(): string {
    const trimmed = this.reason().trim();
    if (trimmed.length < 5) return 'El motivo debe tener al menos 5 caracteres.';
    if (trimmed.length > 500) return 'El motivo no debe exceder 500 caracteres.';
    return '';
  }

  actionLabel(): string {
    switch (this.action) {
      case 'RETRY':
        return 'Reintentar (Retry)';
      case 'CANCEL':
        return 'Cancelar Job';
      case 'MARK_DEAD':
        return 'Marcar como Dead';
    }
  }

  actionButtonClass(): string {
    return this.action === 'RETRY' ? 'btn-retry' : 'btn-danger';
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onCancel();
    }
  }

  onCancel(): void {
    if (!this.submitting) {
      this.cancelled.emit();
    }
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    if (this.isValid() && !this.submitting) {
      this.confirmed.emit({
        jobId: this.jobId,
        action: this.action,
        reason: this.reason().trim()
      });
    } else {
      this.showError.set(true);
    }
  }
}
