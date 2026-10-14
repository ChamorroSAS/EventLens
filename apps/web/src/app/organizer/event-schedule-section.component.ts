import { Component, EventEmitter, Input, Output, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { OrganizerEventModel } from './organizer.types.js';
import { OrganizerService } from './organizer.service.js';

@Component({
  selector: 'eventlens-event-schedule-section',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="schedule-section-card">
      <div class="card-header">
        <h3 class="card-title">Programación de inicio</h3>
        <span class="timezone-badge" aria-label="Zona horaria confirmada del evento">
          Zona horaria: <strong>{{ event?.timezone }}</strong>
        </span>
      </div>

      <p class="card-description">
        Define la fecha y hora local de inicio de tu evento. El sistema convertirá automáticamente el instante a UTC respetando la zona horaria confirmada.
      </p>

      @if (successMessage()) {
        <div class="alert alert-success" role="status" aria-live="polite">
          <span class="alert-icon" aria-hidden="true">✓</span>
          <span>{{ successMessage() }}</span>
        </div>
      }

      @if (errorMessage()) {
        <div class="alert alert-danger" role="alert" aria-live="assertive">
          <span class="alert-icon" aria-hidden="true">⚠️</span>
          <div class="alert-content">
            <p class="alert-message">{{ errorMessage() }}</p>
            @if (hasConflict()) {
              <button type="button" class="btn-reconcile" (click)="onReconcile()">
                Recargar última revisión
              </button>
            }
          </div>
        </div>
      }

      <form (ngSubmit)="onSave()" class="schedule-form" #form="ngForm">
        <div class="form-group">
          <label for="startsAtInput" class="form-label">
            Fecha y hora local de inicio:
          </label>
          <input
            id="startsAtInput"
            name="startsAtInput"
            type="datetime-local"
            class="form-control"
            [(ngModel)]="startsAtLocal"
            (ngModelChange)="onDateChange()"
            [disabled]="!canEdit || isSaving()"
            required
            aria-describedby="startsAtHint"
          />
          <small id="startsAtHint" class="form-hint">
            Hora local exacta en {{ event?.timezone }}. Formato AAAA-MM-DD HH:mm.
          </small>
        </div>

        @if (availableOffsets().length > 0) {
          <fieldset class="form-group overlap-fieldset" role="radiogroup" aria-labelledby="overlapLegend">
            <legend id="overlapLegend" class="form-label">
              Desambiguación de horario de verano (cambio de hora / overlap):
            </legend>
            <p class="overlap-description">
              La hora seleccionada ocurre dos veces durante el retroceso de reloj de otoño. Selecciona el horario exacto:
            </p>
            <div class="radio-options">
              @for (offset of availableOffsets(); track offset) {
                <label class="radio-label">
                  <input
                    type="radio"
                    name="dstOffset"
                    [value]="offset"
                    [(ngModel)]="selectedOffset"
                    [disabled]="!canEdit || isSaving()"
                  />
                  <span>{{ formatOffset(offset) }} (UTC {{ offset >= 0 ? '+' : '' }}{{ offset / 60 }}h)</span>
                </label>
              }
            </div>
          </fieldset>
        }

        <div class="form-actions">
          <button
            type="submit"
            class="btn-save"
            [disabled]="!canEdit || isSaving() || !startsAtLocal"
            aria-label="Guardar fecha y hora local de inicio"
          >
            @if (isSaving()) {
              <span>Guardando...</span>
            } @else {
              <span>Guardar fecha y hora</span>
            }
          </button>
        </div>
      </form>
    </div>
  `,
  styles: `
    .schedule-section-card {
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 0.75rem;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .card-title {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 700;
      color: #0f172a;
    }
    .timezone-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.25rem 0.625rem;
      background-color: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 0.375rem;
      font-size: 0.8125rem;
      color: #334155;
    }
    .card-description {
      margin: 0;
      color: #64748b;
      font-size: 0.875rem;
      line-height: 1.5;
    }
    .alert {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.875rem 1rem;
      border-radius: 0.5rem;
      font-size: 0.875rem;
    }
    .alert-success {
      background-color: #f0fdf4;
      border: 1px solid #bbf7d0;
      color: #166534;
    }
    .alert-danger {
      background-color: #fef2f2;
      border: 1px solid #fecaca;
      color: #991b1b;
    }
    .alert-content {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .alert-message {
      margin: 0;
    }
    .btn-reconcile {
      display: inline-flex;
      align-self: flex-start;
      padding: 0.375rem 0.75rem;
      border-radius: 0.375rem;
      background-color: #ffffff;
      border: 1px solid #dc2626;
      color: #dc2626;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
    }
    .schedule-form {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
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
    .form-control {
      max-width: 22rem;
      padding: 0.625rem 0.75rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      color: #0f172a;
      background-color: #ffffff;
    }
    .form-control:focus {
      outline: 2px solid #2563eb;
      outline-offset: 1px;
    }
    .form-control:disabled {
      background-color: #f8fafc;
      cursor: not-allowed;
      opacity: 0.7;
    }
    .form-hint {
      font-size: 0.75rem;
      color: #64748b;
    }
    .overlap-fieldset {
      border: 1px dashed #cbd5e1;
      border-radius: 0.5rem;
      padding: 1rem;
      background-color: #f8fafc;
    }
    .overlap-description {
      margin: 0 0 0.75rem 0;
      font-size: 0.8125rem;
      color: #475569;
    }
    .radio-options {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .radio-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: #1e293b;
      cursor: pointer;
    }
    .form-actions {
      display: flex;
      justify-content: flex-start;
      margin-top: 0.5rem;
    }
    .btn-save {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.625rem 1.25rem;
      border-radius: 0.375rem;
      background-color: #2563eb;
      color: #ffffff;
      font-size: 0.875rem;
      font-weight: 600;
      border: none;
      cursor: pointer;
      transition: background-color 0.15s ease;
    }
    .btn-save:hover:not(:disabled) {
      background-color: #1d4ed8;
    }
    .btn-save:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `
})
export class EventScheduleSectionComponent {
  private readonly organizerService = inject(OrganizerService);

  @Input() event?: OrganizerEventModel;
  @Input() revision?: string;
  @Input() canEdit = true;

  @Output() saved = new EventEmitter<void>();
  @Output() reconcile = new EventEmitter<void>();

  startsAtLocal = '';
  selectedOffset: number | null = null;
  availableOffsets = signal<number[]>([]);
  isSaving = signal(false);
  successMessage = signal<string | null>(null);
  errorMessage = signal<string | null>(null);
  hasConflict = signal(false);

  ngOnChanges(): void {
    if (this.event?.startsAtLocal) {
      // Normalize to YYYY-MM-DDTHH:mm for datetime-local input
      this.startsAtLocal = this.event.startsAtLocal.slice(0, 16);
    }
  }

  onDateChange(): void {
    this.selectedOffset = null;
    this.availableOffsets.set([]);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.hasConflict.set(false);
  }

  formatOffset(minutes: number): string {
    const sign = minutes >= 0 ? '+' : '-';
    const abs = Math.abs(minutes);
    const hrs = String(Math.floor(abs / 60)).padStart(2, '0');
    const mins = String(abs % 60).padStart(2, '0');
    return `UTC${sign}${hrs}:${mins}`;
  }

  async onSave(): Promise<void> {
    if (!this.event?.id || !this.startsAtLocal) return;

    this.isSaving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.hasConflict.set(false);

    try {
      const result = await this.organizerService.setEventSchedule({
        eventId: this.event.id,
        startsAtLocal: this.startsAtLocal,
        utcOffsetMinutes: this.selectedOffset ?? undefined,
        expectedRevision: this.revision,
        idempotencyKey: `schedule-${this.event.id}-${this.revision}-${Date.now()}`
      });

      this.successMessage.set(`Fecha y hora guardadas: ${result.event.startsAtLocal}`);
      this.availableOffsets.set([]);
      this.saved.emit();
    } catch (err: any) {
      const code = err?.message || 'UNKNOWN_ERROR';
      if (code === 'CONCURRENCY_CONFLICT') {
        this.hasConflict.set(true);
        this.errorMessage.set(
          'El evento fue modificado por otra sesión o proceso (conflicto CAS). Por favor recarga los datos para continuar.'
        );
      } else if (code === 'DST_GAP_TIME') {
        this.errorMessage.set(
          'La hora local seleccionada no existe en esta zona horaria debido al adelanto de reloj de horario de verano.'
        );
      } else if (code === 'AMBIGUOUS_LOCAL_TIME') {
        this.availableOffsets.set([-300, -240]); // Offsets típicos de ambigüedad
        this.errorMessage.set(
          'La hora local seleccionada es ambigua (ocurre dos veces por el cambio de horario). Selecciona una opción abajo.'
        );
      } else if (code === 'ACCESS_DENIED') {
        this.errorMessage.set('No tienes permisos suficientes para programar este evento.');
      } else {
        this.errorMessage.set('Ocurrió un error al guardar la programación.');
      }
    } finally {
      this.isSaving.set(false);
    }
  }

  onReconcile(): void {
    this.reconcile.emit();
  }
}
