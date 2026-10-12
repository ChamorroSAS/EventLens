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
import { CommonModule } from '@angular/common';
import type { AdminInterventionType, ExecuteInterventionPayload } from './admin.types.js';

@Component({
  selector: 'eventlens-admin-intervention-dialog',
  standalone: true,
  imports: [CommonModule],
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
        [attr.aria-labelledby]="'intervention-title-' + interventionType"
        [attr.aria-describedby]="'intervention-desc-' + interventionType"
        tabindex="-1"
      >
        <header class="dialog-header">
          <h3 [id]="'intervention-title-' + interventionType" class="dialog-title">
            Confirmar Intervención: {{ getActionLabel(interventionType) }}
          </h3>
          <p [id]="'intervention-desc-' + interventionType" class="dialog-subtitle">
            Evento: <code class="mono">{{ eventId }}</code>. Esta acción administrativa modificará directamente el estado o ciclo de vida del recurso.
          </p>
        </header>

        <form (submit)="onSubmit($event)" class="intervention-form">
          <div class="intervention-impact alert" [ngClass]="getImpactAlertClass(interventionType)">
            <strong>Impacto Operativo:</strong> {{ getActionImpactDescription(interventionType) }}
          </div>

          @if (interventionType === 'EXTEND_EVENT_VALIDITY') {
            <div class="form-group">
              <label for="extend-hours-input" class="form-label">
                Horas adicionales de extensión (1 a 168) *
              </label>
              <input
                id="extend-hours-input"
                type="number"
                class="form-input"
                [value]="extendHours()"
                (input)="onHoursInput($any($event.target).value)"
                min="1"
                max="168"
                [disabled]="submitting"
                required
              />
            </div>
          }

          <div class="form-group">
            <label for="intervention-reason-input" class="form-label">
              Motivo Administrativo Obligatorio (5 a 500 caracteres) *
            </label>
            <textarea
              #reasonInput
              id="intervention-reason-input"
              class="form-textarea"
              [value]="reason()"
              (input)="onReasonInput($any($event.target).value)"
              rows="3"
              maxlength="500"
              placeholder="Indica la justificación operativa o de soporte para esta intervención..."
              [disabled]="submitting"
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

          <footer class="dialog-footer">
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
              [ngClass]="getSubmitButtonClass(interventionType)"
              [disabled]="submitting || !isFormValid()"
            >
              {{ submitting ? 'Ejecutando...' : 'Confirmar e Intervenir' }}
            </button>
          </footer>
        </form>
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
    .intervention-form { display: flex; flex-direction: column; gap: 1rem; }
    .form-group { display: flex; flex-direction: column; gap: 0.375rem; }
    .form-label { font-size: 0.8125rem; font-weight: 500; color: #cbd5e1; }
    .form-input, .form-textarea {
      background: #1e293b;
      border: 1px solid #475569;
      color: #f8fafc;
      padding: 0.5rem 0.75rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
    }
    .form-input:focus, .form-textarea:focus {
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
    .alert {
      padding: 0.75rem 1rem;
      border-radius: 0.375rem;
      font-size: 0.8125rem;
    }
    .alert-danger {
      background: rgba(225, 29, 72, 0.2);
      border: 1px solid #e11d48;
      color: #fda4af;
    }
    .alert-warning {
      background: rgba(217, 119, 6, 0.2);
      border: 1px solid #d97706;
      color: #fde68a;
    }
    .alert-info {
      background: rgba(2, 132, 199, 0.2);
      border: 1px solid #0284c7;
      color: #bae6fd;
    }
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
    .btn-danger { background: #dc2626; color: white; }
    .btn-danger:hover:not(:disabled) { background: #b91c1c; }
    .btn-warning { background: #d97706; color: white; }
    .btn-warning:hover:not(:disabled) { background: #b45309; }
    .btn-primary { background: #0284c7; color: white; }
    .btn-primary:hover:not(:disabled) { background: #0369a1; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .mono { font-family: monospace; }
    .text-danger { color: #f87171; }
  `]
})
export class AdminInterventionDialogComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) eventId!: string;
  @Input({ required: true }) interventionType!: AdminInterventionType;
  @Input() submitting = false;
  @Input() invokingElement: HTMLElement | null = null;

  @Output() confirmed = new EventEmitter<ExecuteInterventionPayload>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild('dialogContainer') dialogContainer?: ElementRef<HTMLElement>;
  @ViewChild('reasonInput') reasonInputElement?: ElementRef<HTMLTextAreaElement>;

  readonly reason = signal<string>('');
  readonly extendHours = signal<number>(24);
  readonly validationError = signal<string | null>(null);

  ngAfterViewInit(): void {
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

  onHoursInput(val: string): void {
    const num = Number.parseInt(val, 10);
    this.extendHours.set(Number.isNaN(num) ? 24 : num);
  }

  onReasonInput(val: string): void {
    this.reason.set(val);
    const trimmed = val.trim();
    if (trimmed.length > 0 && trimmed.length < 5) {
      this.validationError.set('El motivo debe contener al menos 5 caracteres.');
    } else {
      this.validationError.set(null);
    }
  }

  isFormValid(): boolean {
    const validReason = this.reason().trim().length >= 5 && this.reason().trim().length <= 500;
    if (this.interventionType === 'EXTEND_EVENT_VALIDITY') {
      return validReason && this.extendHours() >= 1 && this.extendHours() <= 168;
    }
    return validReason;
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    if (!this.isFormValid()) {
      this.onReasonInput(this.reason());
      return;
    }
    const idempotencyKey = `interv-${this.interventionType.toLowerCase()}-${Date.now()}`;
    const payload: ExecuteInterventionPayload = {
      interventionType: this.interventionType,
      reason: this.reason().trim(),
      idempotencyKey,
      extendHours: this.interventionType === 'EXTEND_EVENT_VALIDITY' ? this.extendHours() : undefined,
    };
    this.confirmed.emit(payload);
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onCancel();
    }
  }

  getActionLabel(type: AdminInterventionType): string {
    switch (type) {
      case 'SUSPEND_EVENT': return 'Suspender Evento';
      case 'REACTIVATE_EVENT': return 'Reactivar Evento';
      case 'CLOSE_EVENT': return 'Cerrar Evento';
      case 'EXTEND_EVENT_VALIDITY': return 'Extender Vigencia';
      case 'REVOKE_GUEST_ACCESS': return 'Revocar Acceso a Invitados';
      default: return type;
    }
  }

  getActionImpactDescription(type: AdminInterventionType): string {
    switch (type) {
      case 'SUSPEND_EVENT':
        return 'Detiene temporalmente cargas y acceso de invitados hasta reactivación justificada.';
      case 'REACTIVATE_EVENT':
        return 'Restaura el estado operativo previo a la suspensión.';
      case 'CLOSE_EVENT':
        return 'Marca el evento como cerrado de forma definitiva.';
      case 'EXTEND_EVENT_VALIDITY':
        return 'Añade horas a la fecha límite de vigencia de carga o visualización.';
      case 'REVOKE_GUEST_ACCESS':
        return 'Invalida tokens de acceso público para invitados a la galería.';
      default:
        return 'Modificación administrativa del recurso.';
    }
  }

  getImpactAlertClass(type: AdminInterventionType): string {
    if (type === 'SUSPEND_EVENT' || type === 'CLOSE_EVENT') return 'alert-danger';
    if (type === 'REVOKE_GUEST_ACCESS') return 'alert-warning';
    return 'alert-info';
  }

  getSubmitButtonClass(type: AdminInterventionType): string {
    if (type === 'SUSPEND_EVENT' || type === 'CLOSE_EVENT') return 'btn-danger';
    if (type === 'REVOKE_GUEST_ACCESS') return 'btn-warning';
    return 'btn-primary';
  }
}
