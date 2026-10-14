import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChild,
  AfterViewInit,
  inject,
  signal
} from '@angular/core';
import { OrganizerService } from './organizer.service.js';

function generateClientUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

@Component({
  selector: 'eventlens-create-event-form',
  standalone: true,
  template: `
    <div
      class="backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-event-title"
      aria-describedby="create-event-desc"
      (click)="onBackdropClick($event)"
    >
      <div class="sheet-card" (click)="$event.stopPropagation()">
        <header class="sheet-header">
          <div class="header-icon-container" aria-hidden="true">
            <span class="header-icon">✨</span>
          </div>
          <div>
            <h2 id="create-event-title" class="sheet-title">Crear borrador de evento</h2>
            <p id="create-event-desc" class="sheet-subtitle">
              Comienza dándole un nombre a tu celebración.
            </p>
          </div>
        </header>

        <form (submit)="onSubmit($event)" class="create-event-form" novalidate>
          <div class="form-group" [class.has-error]="errorMessage()">
            <label for="event-name-input" class="form-label">
              Nombre del evento <span class="required" aria-hidden="true">*</span>
            </label>
            <input
              #nameInput
              id="event-name-input"
              type="text"
              class="form-input"
              [value]="name()"
              (input)="onNameInput($event)"
              [disabled]="isBusy()"
              maxlength="120"
              placeholder="Ej. Boda de Sofía y Mateo"
              aria-describedby="event-name-helper"
              [attr.aria-invalid]="!!errorMessage()"
              autocomplete="off"
              required
            />
            <p id="event-name-helper" class="form-helper">
              Podrás configurar la fecha y el horario después.
            </p>

            @if (errorMessage()) {
              <div class="error-banner" role="alert" aria-live="polite">
                <span class="error-icon" aria-hidden="true">⚠️</span>
                <span class="error-text">{{ errorMessage() }}</span>
              </div>
            }
          </div>

          <div class="actions">
            <button
              type="button"
              class="btn-cancel"
              (click)="onCancel()"
              [disabled]="isBusy()"
            >
              Cancelar
            </button>

            @if (isUncertain()) {
              <button
                type="submit"
                class="btn-submit btn-retry"
                [disabled]="isBusy()"
              >
                @if (isBusy()) {
                  <span class="spinner" aria-hidden="true">⏳</span>
                  <span aria-live="assertive">Reconciliando...</span>
                } @else {
                  <span>Reintentar reconciliación</span>
                }
              </button>
            } @else {
              <button
                type="submit"
                class="btn-submit"
                [disabled]="isBusy() || !name().trim()"
              >
                @if (isBusy()) {
                  <span class="spinner" aria-hidden="true">⏳</span>
                  <span aria-live="assertive">Creando borrador...</span>
                } @else {
                  <span>Crear borrador</span>
                }
              </button>
            }
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [`
    @use 'mixins' as m;

    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(2px);
      z-index: 1000;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding: 0;
      animation: fadeIn 0.15s ease-out;
    }

    @media (min-width: 768px) {
      .backdrop {
        align-items: center;
        padding: var(--el-space-md, 1rem);
      }
    }

    .sheet-card {
      background: var(--el-color-surface, #ffffff);
      width: 100%;
      max-width: 520px;
      border-radius: var(--el-radius-lg, 16px) var(--el-radius-lg, 16px) 0 0;
      padding: var(--el-space-lg, 1.5rem);
      box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.12);
      max-height: 90vh;
      overflow-y: auto;
      box-sizing: border-box;
      animation: slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @media (min-width: 768px) {
      .sheet-card {
        border-radius: var(--el-radius-lg, 16px);
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.18);
        animation: scaleUp 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      }
    }

    .sheet-header {
      display: flex;
      align-items: flex-start;
      gap: var(--el-space-md, 1rem);
      margin-bottom: var(--el-space-lg, 1.5rem);
    }

    .header-icon-container {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: var(--el-color-primary-subtle, #f0ebf8);
      font-size: 1.25rem;
      flex-shrink: 0;
    }

    .sheet-title {
      margin: 0 0 0.25rem 0;
      font-size: var(--el-font-size-h2, 1.35rem);
      font-weight: var(--el-font-weight-bold, 700);
      color: var(--el-color-text, #1e1e24);
    }

    .sheet-subtitle {
      margin: 0;
      font-size: var(--el-font-size-body, 0.95rem);
      color: var(--el-color-text-secondary, #6b7280);
      line-height: 1.4;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      margin-bottom: var(--el-space-lg, 1.5rem);
    }

    .form-label {
      font-size: var(--el-font-size-label, 0.9rem);
      font-weight: var(--el-font-weight-semibold, 600);
      color: var(--el-color-text, #1e1e24);
    }

    .required {
      color: var(--el-color-error, #dc2626);
    }

    .form-input {
      width: 100%;
      box-sizing: border-box;
      min-height: var(--el-touch-target-min, 44px);
      padding: 0.625rem 0.875rem;
      border: 1px solid var(--el-color-border, #d1d5db);
      border-radius: var(--el-radius-md, 8px);
      font-size: var(--el-font-size-body, 1rem);
      color: var(--el-color-text, #1e1e24);
      background-color: var(--el-color-surface, #ffffff);
      transition: border-color 0.15s ease, box-shadow 0.15s ease;

      &:focus-visible {
        outline: none;
        border-color: var(--el-color-primary, #6366f1);
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
      }

      &:disabled {
        background-color: var(--el-color-surface-disabled, #f3f4f6);
        color: var(--el-color-text-disabled, #9ca3af);
        cursor: not-allowed;
      }
    }

    .has-error .form-input {
      border-color: var(--el-color-error, #dc2626);
      &:focus-visible {
        box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.2);
      }
    }

    .form-helper {
      margin: 0.25rem 0 0 0;
      font-size: var(--el-font-size-caption, 0.825rem);
      color: var(--el-color-text-secondary, #6b7280);
    }

    .error-banner {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.625rem 0.875rem;
      background-color: rgba(220, 38, 38, 0.08);
      border-radius: var(--el-radius-sm, 6px);
      color: var(--el-color-error, #dc2626);
      font-size: 0.875rem;
      margin-top: 0.5rem;
    }

    .actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--el-space-md, 0.875rem);
      margin-top: var(--el-space-md, 1rem);
    }

    .btn-cancel,
    .btn-submit {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      min-height: var(--el-touch-target-min, 44px);
      padding: 0.625rem 1.25rem;
      border-radius: var(--el-radius-md, 8px);
      font-size: var(--el-font-size-button, 0.95rem);
      font-weight: var(--el-font-weight-semibold, 600);
      cursor: pointer;
      transition: background-color 0.15s ease, opacity 0.15s ease;

      &:focus-visible {
        outline: none;
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.3);
      }

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    }

    .btn-cancel {
      background: transparent;
      border: 1px solid var(--el-color-border, #d1d5db);
      color: var(--el-color-text, #374151);

      &:hover:not(:disabled) {
        background-color: var(--el-color-surface-hover, #f3f4f6);
      }
    }

    .btn-submit {
      background-color: var(--el-color-primary, #6366f1);
      border: 1px solid transparent;
      color: #ffffff;

      &:hover:not(:disabled) {
        background-color: var(--el-color-primary-hover, #4f46e5);
      }
    }

    .btn-retry {
      background-color: var(--el-color-warning-dark, #b45309);
      &:hover:not(:disabled) {
        background-color: #92400e;
      }
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }

    @keyframes scaleUp {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
  `]
})
export class CreateEventFormComponent implements AfterViewInit {
  private readonly organizerService = inject(OrganizerService);

  @Input() triggerElement?: HTMLElement | null = null;
  @Output() eventCreated = new EventEmitter<{ id: string; outcome?: string }>();
  @Output() cancel = new EventEmitter<void>();

  @ViewChild('nameInput') nameInputRef?: ElementRef<HTMLInputElement>;

  readonly name = signal('');
  readonly isBusy = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly isUncertain = signal(false);

  // In-memory idempotency key: persists across uncertainty/retries for the same intention
  inMemoryIdempotencyKey: string | null = null;

  ngAfterViewInit(): void {
    this.inMemoryIdempotencyKey = generateClientUuid();
    setTimeout(() => {
      this.nameInputRef?.nativeElement?.focus();
    }, 50);
  }

  onNameInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.name.set(target.value);
    if (this.errorMessage()) {
      this.errorMessage.set(null);
    }
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    if (!this.isBusy()) {
      this.onCancel();
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && !this.isBusy()) {
      this.onCancel();
    }
  }

  onCancel(): void {
    if (this.isBusy()) {
      // Bloquear descarte hasta resultado durante envío
      return;
    }
    this.inMemoryIdempotencyKey = null;
    this.cancel.emit();
    this.triggerElement?.focus();
  }

  async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.isBusy()) {
      return;
    }

    const trimmed = this.name().trim();
    if (!trimmed || trimmed.length > 120) {
      this.errorMessage.set('El nombre del evento debe tener entre 1 y 120 caracteres');
      this.nameInputRef?.nativeElement?.focus();
      return;
    }

    this.isBusy.set(true);
    this.errorMessage.set(null);
    this.isUncertain.set(false);

    if (!this.inMemoryIdempotencyKey) {
      this.inMemoryIdempotencyKey = generateClientUuid();
    }

    try {
      const result = await this.organizerService.createEvent(trimmed, this.inMemoryIdempotencyKey);
      this.inMemoryIdempotencyKey = null;
      this.isBusy.set(false);
      this.eventCreated.emit({ id: result.id, outcome: result.outcome });
    } catch (err: any) {
      this.isBusy.set(false);

      if (err?.code === 'INVALID_NAME' || err?.status === 422) {
        this.errorMessage.set(err.message || 'El nombre del evento debe tener entre 1 y 120 caracteres');
        this.nameInputRef?.nativeElement?.focus();
        return;
      }

      if (err?.code === 'IDEMPOTENCY_CONFLICT' || err?.status === 409) {
        this.errorMessage.set('Conflicto de idempotencia con una operación previa. Por favor verifica tus eventos.');
        return;
      }

      // Resultado incierto (timeout, error de red o servidor no confirmado)
      this.isUncertain.set(true);
      this.errorMessage.set(
        'No fue posible confirmar la creación debido a un problema de conexión. Puedes reintentar para reconciliar la solicitud sin duplicar el evento.'
      );
    }
  }
}
