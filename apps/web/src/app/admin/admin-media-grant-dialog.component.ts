import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';
import type { AdminMediaPurpose, AdministrativeSupportMediaGrant } from './admin.types.js';

@Component({
  selector: 'eventlens-admin-media-grant-dialog',
  standalone: true,
  template: `
    <div
      class="dialog-backdrop"
      role="presentation"
      (click)="onBackdropClick($event)"
      (keydown.escape)="onCancel()"
    >
      <div
        #dialogContainer
        class="dialog-card"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="'media-grant-title-' + mediaId"
        [attr.aria-describedby]="'media-grant-desc-' + mediaId"
        tabindex="-1"
      >
        <header class="dialog-header">
          <h3 [id]="'media-grant-title-' + mediaId" class="dialog-title">
            Acceso Justificado a Multimedia
          </h3>
          <p [id]="'media-grant-desc-' + mediaId" class="dialog-subtitle">
            El acceso a medios de soporte requiere justificación auditable y propósito legítimo. No hay vista previa sin autorización previa.
          </p>
        </header>

        @if (!activeGrant()) {
          <form (submit)="onSubmit($event)" class="grant-form">
            <div class="form-group">
              <label for="media-purpose-select" class="form-label">Propósito de Acceso *</label>
              <select
                id="media-purpose-select"
                class="form-select"
                [value]="purpose()"
                (change)="onPurposeChange($any($event.target).value)"
                [disabled]="submitting()"
                required
              >
                <option value="INCIDENT_INVESTIGATION">Investigación de Incidente Operativo</option>
                <option value="SUPPORT_REQUEST">Solicitud Expresa de Soporte del Organizador</option>
                <option value="CORRUPTION_DIAGNOSIS">Diagnóstico de Corrupción o Fallo de Procesamiento</option>
                <option value="LEGAL_OR_SAFETY">Requerimiento Legal o Seguridad</option>
              </select>
            </div>

            <div class="form-group">
              <label for="media-reason-input" class="form-label">
                Motivo / Justificación (mínimo 5 caracteres) *
              </label>
              <textarea
                #reasonInput
                id="media-reason-input"
                class="form-textarea"
                [value]="reason()"
                (input)="onReasonInput($any($event.target).value)"
                rows="3"
                maxlength="500"
                placeholder="Indica el motivo detallado para consultar esta imagen/video..."
                [disabled]="submitting()"
                required
              ></textarea>
              <div class="field-meta">
                <span class="char-count" [class.text-danger]="reason().length < 5">
                  {{ reason().length }} / 500 caracteres
                </span>
                @if (validationError()) {
                  <span class="field-error" role="alert">{{ validationError() }}</span>
                }
              </div>
            </div>

            <div class="privacy-notice">
              <p>
                <strong>Aviso de Auditoría:</strong> Esta consulta quedará registrada permanentemente en la bitácora inmutable de auditoría con tu identidad de operador.
              </p>
            </div>

            <footer class="dialog-footer">
              <button
                type="button"
                class="btn btn-secondary"
                (click)="onCancel()"
                [disabled]="submitting()"
              >
                Cancelar
              </button>
              <button
                type="submit"
                class="btn btn-primary"
                [disabled]="submitting() || !isFormValid()"
              >
                {{ submitting() ? 'Autorizando...' : 'Autorizar y Ver Preview' }}
              </button>
            </footer>
          </form>
        } @else {
          <!-- Concesión Activa: Vista Previa Autorizada -->
          <div class="grant-view">
            <div class="alert alert-success" role="status">
              <strong>Acceso Autorizado:</strong> Válido hasta {{ activeGrant()!.expiresAt }}
            </div>

            <div class="media-preview-container">
              <div class="media-meta">
                <span class="meta-label">ID Media:</span> <code class="mono">{{ activeGrant()!.mediaId }}</code>
                <br />
                <span class="meta-label">Propósito:</span> {{ activeGrant()!.purpose }}
              </div>

              <!-- Preview del recurso -->
              <div class="preview-box">
                <img
                  [src]="activeGrant()!.downloadUrl"
                  [alt]="'Vista previa autorizada de media ' + activeGrant()!.mediaId"
                  class="preview-image"
                />
              </div>
            </div>

            <footer class="dialog-footer">
              <button
                type="button"
                class="btn btn-primary"
                (click)="onCloseAfterView()"
              >
                Cerrar Visor
              </button>
            </footer>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .dialog-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
    }
    .dialog-card {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 0.75rem;
      width: 100%;
      max-width: 32rem;
      color: #f8fafc;
      padding: 1.5rem;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    .dialog-header { margin-bottom: 1.25rem; }
    .dialog-title { font-size: 1.125rem; font-weight: 600; margin: 0 0 0.25rem 0; }
    .dialog-subtitle { font-size: 0.8125rem; color: #94a3b8; margin: 0; }
    .grant-form { display: flex; flex-direction: column; gap: 1rem; }
    .form-group { display: flex; flex-direction: column; gap: 0.375rem; }
    .form-label { font-size: 0.8125rem; font-weight: 500; color: #cbd5e1; }
    .form-select, .form-textarea {
      background: #1e293b;
      border: 1px solid #475569;
      color: #f8fafc;
      padding: 0.5rem 0.75rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
    }
    .form-select:focus, .form-textarea:focus {
      outline: 2px solid #38bdf8;
      border-color: #38bdf8;
    }
    .field-meta {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: #94a3b8;
    }
    .field-error { color: #f87171; font-weight: 500; }
    .privacy-notice {
      background: rgba(30, 41, 59, 0.6);
      border-left: 3px solid #38bdf8;
      padding: 0.75rem;
      font-size: 0.75rem;
      color: #94a3b8;
    }
    .privacy-notice p { margin: 0; }
    .dialog-footer {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      margin-top: 1.25rem;
    }
    .btn {
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .btn-secondary { background: #334155; color: #f8fafc; }
    .btn-secondary:hover:not(:disabled) { background: #475569; }
    .btn-primary { background: #0284c7; color: white; }
    .btn-primary:hover:not(:disabled) { background: #0369a1; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .preview-box {
      margin-top: 1rem;
      text-align: center;
      background: #000;
      border-radius: 0.375rem;
      padding: 0.5rem;
      max-height: 18rem;
      overflow: hidden;
    }
    .preview-image {
      max-width: 100%;
      max-height: 16rem;
      object-fit: contain;
    }
    .alert-success {
      background: rgba(4, 120, 87, 0.2);
      border: 1px solid #059669;
      color: #6ee7b7;
      padding: 0.5rem 0.75rem;
      border-radius: 0.375rem;
      font-size: 0.8125rem;
    }
    .mono { font-family: monospace; }
    .text-danger { color: #f87171; }
  `]
})
export class AdminMediaGrantDialogComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) eventId!: string;
  @Input({ required: true }) mediaId!: string;
  @Input() invokingElement: HTMLElement | null = null;
  @Input() activeGrantInput: AdministrativeSupportMediaGrant | null = null;

  @Output() requestGrant = new EventEmitter<{
    eventId: string;
    mediaId: string;
    purpose: AdminMediaPurpose;
    reason: string;
  }>();
  @Output() close = new EventEmitter<void>();

  @ViewChild('dialogContainer') dialogContainer?: ElementRef<HTMLElement>;
  @ViewChild('reasonInput') reasonInputElement?: ElementRef<HTMLTextAreaElement>;

  readonly purpose = signal<AdminMediaPurpose>('INCIDENT_INVESTIGATION');
  readonly reason = signal<string>('');
  readonly validationError = signal<string | null>(null);
  readonly submitting = signal<boolean>(false);
  readonly activeGrant = signal<AdministrativeSupportMediaGrant | null>(null);

  ngAfterViewInit(): void {
    if (this.activeGrantInput) {
      this.activeGrant.set(this.activeGrantInput);
    }
    setTimeout(() => {
      if (this.reasonInputElement) {
        this.reasonInputElement.nativeElement.focus();
      } else if (this.dialogContainer) {
        this.dialogContainer.nativeElement.focus();
      }
    }, 50);
  }

  ngOnDestroy(): void {
    if (this.invokingElement && typeof this.invokingElement.focus === 'function') {
      this.invokingElement.focus();
    }
  }

  onPurposeChange(val: string): void {
    this.purpose.set(val as AdminMediaPurpose);
  }

  onReasonInput(val: string): void {
    this.reason.set(val);
    const trimmed = val.trim();
    if (trimmed.length > 0 && trimmed.length < 5) {
      this.validationError.set('La justificación debe tener al menos 5 caracteres.');
    } else {
      this.validationError.set(null);
    }
  }

  isFormValid(): boolean {
    const trimmed = this.reason().trim();
    return trimmed.length >= 5 && trimmed.length <= 500;
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    if (!this.isFormValid()) {
      this.onReasonInput(this.reason());
      return;
    }
    this.requestGrant.emit({
      eventId: this.eventId,
      mediaId: this.mediaId,
      purpose: this.purpose(),
      reason: this.reason().trim(),
    });
  }

  setGrant(grant: AdministrativeSupportMediaGrant): void {
    this.activeGrant.set(grant);
  }

  onCloseAfterView(): void {
    this.close.emit();
  }

  onCancel(): void {
    this.close.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onCancel();
    }
  }
}
