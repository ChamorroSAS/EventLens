import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { MediaProcessingService } from './media-processing.service.js';
import type { RetryCycleResponse } from './media.types.js';

@Component({
  selector: 'eventlens-retry-processing-action',
  standalone: true,
  template: `
    <div class="retry-action-container">
      <button
        type="button"
        class="retry-btn"
        [disabled]="disabled || isSubmitting()"
        [attr.aria-label]="'Reintentar procesamiento para ' + fileName"
        (click)="onRetryClick()"
      >
        @if (isSubmitting()) {
          <span class="spinner" aria-hidden="true"></span>
          <span>Enviando solicitud…</span>
        } @else {
          <span>Reintentar procesamiento</span>
        }
      </button>

      @if (feedbackMessage()) {
        <p
          class="feedback-msg"
          [class.error]="feedbackType() === 'alert'"
          [attr.role]="feedbackType()"
          aria-live="polite"
          aria-atomic="true"
        >
          {{ feedbackMessage() }}
        </p>
      }
    </div>
  `,
  styles: `
    @use 'mixins' as m;

    .retry-action-container {
      display: flex;
      flex-direction: column;
      gap: var(--el-space-sm);
      align-items: flex-start;
    }
    .retry-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--el-space-sm);
      padding: var(--el-space-sm) var(--el-space-md);
      font-size: var(--el-font-size-body-small);
      font-weight: var(--el-font-weight-medium);
      color: var(--el-color-surface);
      background-color: var(--el-color-primary);
      border: 1px solid transparent;
      border-radius: var(--el-radius-sm);
      transition: background-color 0.15s ease-in-out;
    }
    .retry-btn:hover:not(:disabled) {
      background-color: var(--el-color-primary-hover);
    }
    .retry-btn:focus-visible {
      @include m.el-focus-ring;
    }
    .retry-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .feedback-msg {
      margin: 0;
      font-size: var(--el-font-size-body-small);
      color: var(--el-color-text);
    }
    .feedback-msg.error {
      color: var(--el-color-danger);
    }
    .spinner {
      display: inline-block;
      width: 0.875rem;
      height: 0.875rem;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: spin 0.75s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    @include m.el-reduced-motion {
      .spinner {
        animation-duration: 2s;
      }
    }
  `,
})
export class RetryProcessingActionComponent {
  private readonly processingService = inject(MediaProcessingService);

  @Input({ required: true }) mediaRef!: string;
  @Input({ required: true }) eventRef!: string;
  @Input({ required: true }) fileName!: string;
  @Input() disabled = false;

  @Output() cycleConfirmed = new EventEmitter<RetryCycleResponse>();
  @Output() capabilityRefreshRequired = new EventEmitter<void>();

  readonly isSubmitting = signal(false);
  readonly feedbackMessage = signal('');
  readonly feedbackType = signal<'status' | 'alert'>('status');

  async onRetryClick(): Promise<void> {
    if (this.disabled || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    this.feedbackMessage.set('Enviando solicitud de nuevo ciclo…');
    this.feedbackType.set('status');

    try {
      const response = await this.processingService.requestRetryCycle({
        mediaRef: this.mediaRef,
        eventRef: this.eventRef,
      });

      // Confirm cycle submission without falsely declaring PROCESSING prematurely or simulated preview success
      this.feedbackType.set('status');
      this.feedbackMessage.set(
        `Solicitud aceptada. Se programó el ciclo #${response.cycleNumber}. El procesamiento iniciará al reservar un ejecutor.`
      );
      this.cycleConfirmed.emit(response);
    } catch (err: unknown) {
      const errorMsg = (err instanceof Error) ? err.message : '';
      if (errorMsg === 'CYCLE_ALREADY_ACTIVE') {
        this.feedbackType.set('status');
        this.feedbackMessage.set(
          'Un ciclo de reintento ya se encuentra activo para este archivo. Verificando estado actualizado…'
        );
        this.capabilityRefreshRequired.emit();
      } else {
        this.feedbackType.set('alert');
        this.feedbackMessage.set(
          'No se pudo solicitar el reintento: permisos no válidos o evento restringido. Por favor intenta de nuevo.'
        );
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
