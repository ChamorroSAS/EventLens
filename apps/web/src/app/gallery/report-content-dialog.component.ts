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
import { GalleryService } from './gallery.service.js';
import type { MediaReportReason } from './gallery.types.js';

export interface ReportReasonOption {
  readonly value: MediaReportReason;
  readonly label: string;
  readonly description: string;
}

export const REPORT_REASON_OPTIONS: readonly ReportReasonOption[] = [
  {
    value: 'INAPPROPRIATE_CONTENT',
    label: 'Contenido inapropiado',
    description: 'El contenido muestra material ofensivo o no apto para el evento.'
  },
  {
    value: 'PRIVACY_VIOLATION',
    label: 'Violación de privacidad',
    description: 'Aparezco en la imagen sin mi consentimiento o vulnera mi privacidad.'
  },
  {
    value: 'INTIMACY_VIOLATION',
    label: 'Contenido íntimo o sensible',
    description: 'Material que compromete la intimidad de las personas involucradas.'
  },
  {
    value: 'COPYRIGHT_INFRINGEMENT',
    label: 'Infracción de derechos de autor',
    description: 'Uso no autorizado de material con propiedad intelectual ajena.'
  },
  {
    value: 'OTHER',
    label: 'Otro motivo',
    description: 'Requiere detallar el motivo en la descripción adicional.'
  }
];

@Component({
  selector: 'el-report-content-dialog',
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
          aria-labelledby="report-dialog-title"
          tabindex="-1"
          (click)="$event.stopPropagation()"
        >
          <!-- Header -->
          <div class="dialog-header">
            <h3 id="report-dialog-title" class="dialog-title">
              {{ isSubmitted() ? 'Reporte registrado' : 'Reportar contenido' }}
            </h3>
            <button
              #closeButton
              type="button"
              class="btn-close"
              (click)="onCancel()"
              [disabled]="isSubmitting()"
              aria-label="Cerrar ventana de reporte"
            >
              ✕
            </button>
          </div>

          <!-- Body: Submitted Confirmation (DEC-088: Reporte recibido, nunca 'Contenido eliminado') -->
          @if (isSubmitted()) {
            <div class="dialog-body confirmation-body" role="status" aria-live="polite">
              <div class="success-icon" aria-hidden="true">✓</div>
              <h4 class="feedback-title">Reporte recibido para revisión</h4>
              <p class="feedback-desc">
                Tu reporte ha sido registrado para evaluación por el equipo de moderación.
                El contenido será revisado según las políticas del evento y no se elimina automáticamente.
              </p>
              <div class="dialog-actions">
                <button
                  type="button"
                  class="btn btn-primary"
                  (click)="onCancel()"
                  aria-label="Entendido, cerrar diálogo"
                >
                  Entendido
                </button>
              </div>
            </div>
          } @else {
            <!-- Body: Form -->
            <form (submit)="onSubmitForm($event)" class="dialog-form" novalidate>
              <div class="dialog-body">
                <p class="dialog-instruction">
                  Selecciona el motivo por el cual deseas reportar este contenido.
                  Nuestros moderadores revisarán el caso.
                </p>

                @if (errorMessage()) {
                  <div class="alert-error" role="alert">
                    {{ errorMessage() }}
                  </div>
                }

                <fieldset class="reason-fieldset">
                  <legend class="fieldset-legend">Motivo del reporte (obligatorio)</legend>
                  <div class="reason-options">
                    @for (option of reasons; track option.value) {
                      <label
                        class="reason-option"
                        [class.selected]="selectedReason === option.value"
                      >
                        <input
                          type="radio"
                          name="reportReason"
                          [value]="option.value"
                          [checked]="selectedReason === option.value"
                          (change)="onSelectReason(option.value)"
                          [disabled]="isSubmitting()"
                          required
                        />
                        <div class="reason-text">
                          <span class="reason-label">{{ option.label }}</span>
                          <span class="reason-subtext">{{ option.description }}</span>
                        </div>
                      </label>
                    }
                  </div>
                </fieldset>

                <div class="form-group">
                  <label for="report-description" class="form-label">
                    Descripción adicional
                    @if (selectedReason === 'OTHER') {
                      <span class="required-indicator">(obligatorio)</span>
                    } @else {
                      <span class="optional-indicator">(opcional)</span>
                    }
                  </label>
                  <textarea
                    id="report-description"
                    class="form-textarea"
                    name="description"
                    [value]="description"
                    (input)="onDescriptionInput($event)"
                    [disabled]="isSubmitting()"
                    rows="3"
                    placeholder="Describe los detalles relevantes de tu solicitud..."
                    [attr.aria-required]="selectedReason === 'OTHER'"
                  ></textarea>
                </div>
              </div>

              <div class="dialog-actions">
                <button
                  type="button"
                  class="btn btn-secondary"
                  (click)="onCancel()"
                  [disabled]="isSubmitting()"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  class="btn btn-primary"
                  [disabled]="isSubmitting() || !isValid()"
                >
                  @if (isSubmitting()) {
                    <span>Enviando reporte...</span>
                  } @else {
                    <span>Enviar reporte</span>
                  }
                </button>
              </div>
            </form>
          }
        </div>
      </div>
    }
  `,
  styles: `
    .dialog-backdrop {
      position: fixed;
      inset: 0;
      background-color: rgba(15, 23, 42, 0.7);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1100;
      padding: 1rem;
    }
    .dialog-card {
      background-color: #ffffff;
      border-radius: 0.75rem;
      max-width: 32rem;
      width: 100%;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      outline: none;
    }
    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.25rem 1.5rem 0.75rem;
      border-bottom: 1px solid #f1f5f9;
    }
    .dialog-title {
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
      padding: 0.25rem 0.5rem;
      border-radius: 0.375rem;
      line-height: 1;
    }
    .btn-close:hover:not(:disabled) {
      color: #0f172a;
      background-color: #f1f5f9;
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
      max-height: calc(85vh - 140px);
      overflow-y: auto;
    }
    .dialog-instruction {
      margin: 0;
      font-size: 0.875rem;
      line-height: 1.4;
      color: #475569;
    }
    .alert-error {
      padding: 0.75rem 1rem;
      background-color: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 0.375rem;
      color: #991b1b;
      font-size: 0.875rem;
    }
    .reason-fieldset {
      border: none;
      padding: 0;
      margin: 0;
    }
    .fieldset-legend {
      font-size: 0.875rem;
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 0.5rem;
    }
    .reason-options {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .reason-option {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 0.5rem;
      cursor: pointer;
      transition: background-color 0.15s, border-color 0.15s;
    }
    .reason-option:hover {
      background-color: #f8fafc;
    }
    .reason-option.selected {
      background-color: #f0fdf4;
      border-color: #22c55e;
    }
    .reason-text {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }
    .reason-label {
      font-size: 0.875rem;
      font-weight: 600;
      color: #0f172a;
    }
    .reason-subtext {
      font-size: 0.75rem;
      color: #64748b;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }
    .form-label {
      font-size: 0.875rem;
      font-weight: 600;
      color: #1e293b;
    }
    .required-indicator {
      color: #dc2626;
      font-weight: 500;
      font-size: 0.75rem;
    }
    .optional-indicator {
      color: #64748b;
      font-weight: 400;
      font-size: 0.75rem;
    }
    .form-textarea {
      width: 100%;
      padding: 0.625rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-family: inherit;
      resize: vertical;
      box-sizing: border-box;
    }
    .form-textarea:focus {
      outline: 2px solid #0284c7;
      outline-offset: 1px;
    }
    .confirmation-body {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 2rem 1.5rem;
      gap: 0.75rem;
    }
    .success-icon {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background-color: #dcfce7;
      color: #16a34a;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      font-weight: 700;
    }
    .feedback-title {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 700;
      color: #0f172a;
    }
    .feedback-desc {
      margin: 0;
      font-size: 0.875rem;
      line-height: 1.5;
      color: #475569;
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
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.15s ease-in-out;
    }
    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .btn-secondary {
      background-color: #ffffff;
      border-color: #cbd5e1;
      color: #334155;
    }
    .btn-secondary:hover:not(:disabled) {
      background-color: #f1f5f9;
    }
    .btn-primary {
      background-color: #dc2626;
      color: #ffffff;
    }
    .btn-primary:hover:not(:disabled) {
      background-color: #b91c1c;
    }
  `
})
export class ReportContentDialogComponent {
  @Input() isOpen = false;
  @Input({ required: true }) mediaId!: string;
  @Input({ required: true }) eventId!: string;

  @Output() close = new EventEmitter<void>();
  @Output() reported = new EventEmitter<{ reportId: string; reason: string }>();

  @ViewChild('closeButton') closeButtonRef?: ElementRef<HTMLButtonElement>;

  readonly reasons = REPORT_REASON_OPTIONS;

  selectedReason: MediaReportReason | null = null;
  description = '';

  readonly isSubmitting = signal(false);
  readonly isSubmitted = signal(false);
  readonly errorMessage = signal<string | null>(null);

  constructor(private readonly galleryService: GalleryService) {}

  @HostListener('keydown.escape', ['$event'])
  handleEscape(event?: Event): void {
    if (this.isOpen && !this.isSubmitting()) {
      event?.preventDefault();
      this.onCancel();
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if (!this.isSubmitting()) {
      this.onCancel();
    }
  }

  onSelectReason(value: MediaReportReason): void {
    this.selectedReason = value;
    this.errorMessage.set(null);
  }

  onDescriptionInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.description = target?.value ?? '';
  }

  isValid(): boolean {
    if (!this.selectedReason) return false;
    if (this.selectedReason === 'OTHER' && !this.description.trim()) {
      return false;
    }
    return true;
  }

  onSubmitForm(event: Event): void {
    event.preventDefault();
    this.onSubmit();
  }

  async onSubmit(): Promise<void> {
    if (!this.isValid() || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    try {
      const result = await this.galleryService.submitReport({
        eventId: this.eventId,
        mediaId: this.mediaId,
        reason: this.selectedReason!,
        description: this.description.trim() || undefined
      });

      this.isSubmitted.set(true);
      this.reported.emit({
        reportId: result.reportId,
        reason: this.selectedReason!
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      if (msg === 'RATE_LIMIT_EXCEEDED') {
        this.errorMessage.set('Has alcanzado el límite de reportes permitidos. Intenta más tarde.');
      } else {
        this.errorMessage.set('No fue posible enviar el reporte. Por favor reintenta.');
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  onCancel(): void {
    if (this.isSubmitting()) return;
    this.resetState();
    this.close.emit();
  }

  private resetState(): void {
    this.selectedReason = null;
    this.description = '';
    this.isSubmitting.set(false);
    this.isSubmitted.set(false);
    this.errorMessage.set(null);
  }
}
