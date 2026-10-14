import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrganizerService } from './organizer.service.js';
import type { OrganizerEventModel } from './organizer.types.js';

function getSupportedIanaTimezones(): string[] {
  if (typeof Intl !== 'undefined' && typeof (Intl as any).supportedValuesOf === 'function') {
    try {
      const zones = (Intl as any).supportedValuesOf('timeZone') as string[];
      if (Array.isArray(zones) && zones.length > 0) {
        return zones;
      }
    } catch {
      // Fallback below
    }
  }

  return [
    'Africa/Cairo',
    'Africa/Johannesburg',
    'Africa/Lagos',
    'Africa/Nairobi',
    'America/Anchorage',
    'America/Argentina/Buenos_Aires',
    'America/Asuncion',
    'America/Bogota',
    'America/Buenos_Aires',
    'America/Caracas',
    'America/Chicago',
    'America/Denver',
    'America/Guayaquil',
    'America/Halifax',
    'America/Havana',
    'America/La_Paz',
    'America/Lima',
    'America/Los_Angeles',
    'America/Madrid',
    'America/Mexico_City',
    'America/Montevideo',
    'America/New_York',
    'America/Panama',
    'America/Phoenix',
    'America/Santiago',
    'America/Santo_Domingo',
    'America/Sao_Paulo',
    'America/Tijuana',
    'America/Toronto',
    'America/Vancouver',
    'Asia/Bangkok',
    'Asia/Dubai',
    'Asia/Hong_Kong',
    'Asia/Jakarta',
    'Asia/Jerusalem',
    'Asia/Kolkata',
    'Asia/Seoul',
    'Asia/Shanghai',
    'Asia/Singapore',
    'Asia/Taipei',
    'Asia/Tokyo',
    'Atlantic/Reykjavik',
    'Australia/Melbourne',
    'Australia/Perth',
    'Australia/Sydney',
    'Europe/Amsterdam',
    'Europe/Berlin',
    'Europe/Brussels',
    'Europe/Dublin',
    'Europe/Lisbon',
    'Europe/London',
    'Europe/Madrid',
    'Europe/Paris',
    'Europe/Rome',
    'Europe/Vienna',
    'Europe/Warsaw',
    'Europe/Zurich',
    'Pacific/Auckland',
    'Pacific/Honolulu',
    'UTC'
  ];
}

@Component({
  selector: 'eventlens-event-timezone-section',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="timezone-section-card" role="region" aria-labelledby="tz-section-title">
      <div class="card-header">
        <div>
          <h3 id="tz-section-title" class="card-title">Zona horaria del evento</h3>
          <p class="card-description">
            Define la zona horaria IANA bajo la cual se interpretan todas las fechas y horas del evento.
          </p>
        </div>
        <span class="timezone-badge" aria-label="Zona horaria confirmada del evento">
          Zona horaria confirmada: <strong>{{ event?.timezone }}</strong>
        </span>
      </div>

      @if (successMessage()) {
        <div class="alert alert-success" role="status" aria-live="polite">
          <span class="alert-icon" aria-hidden="true">✓</span>
          <div class="alert-content">
            <p class="alert-message">{{ successMessage() }}</p>
          </div>
        </div>
      }

      @if (errorMessage()) {
        <div class="alert alert-danger" role="alert" aria-live="assertive">
          <span class="alert-icon" aria-hidden="true">⚠️</span>
          <div class="alert-content">
            <p class="alert-message">{{ errorMessage() }}</p>
            @if (isConflictError()) {
              <button
                type="button"
                class="btn-reconcile"
                (click)="onReconcileClick()"
                aria-label="Reconciliar cambios con la versión más reciente del servidor"
              >
                Reconciliar datos del evento
              </button>
            }
          </div>
        </div>
      }

      @if (event?.status === 'SCHEDULED' && hasSelectedDifferentTimezone()) {
        <div class="alert alert-warning" role="alert">
          <span class="alert-icon" aria-hidden="true">⚠️</span>
          <div class="alert-content">
            <p class="alert-message">
              <strong>Aviso de recálculo:</strong> Este evento ya se encuentra programado. Al cambiar la zona horaria,
              la hora UTC del evento será recalculada automáticamente por el servidor para coincidir con la nueva zona horaria.
            </p>
          </div>
        </div>
      }

      @if (event?.status === 'ACTIVE') {
        <div class="alert alert-info" role="status">
          <span class="alert-icon" aria-hidden="true">ℹ️</span>
          <div class="alert-content">
            <p class="alert-message">
              El evento está <strong>ACTIVO</strong>. Por integridad y trazabilidad, no se permite cambiar la zona horaria de un evento activo.
            </p>
          </div>
        </div>
      }

      <form (submit)="onSubmit($event)" class="timezone-form">
        <div class="form-group">
          <label for="tz-search-input" class="form-label">
            Buscar zona horaria IANA:
          </label>
          <input
            id="tz-search-input"
            type="search"
            class="form-control"
            placeholder="Filtrar por nombre o región (ej. Bogota, Madrid, Mexico)..."
            [value]="searchQuery()"
            (input)="onSearchInput($event)"
            [disabled]="isControlsDisabled()"
            aria-label="Filtrar zonas horarias IANA"
          />
        </div>

        <div class="form-group">
          <label for="tz-select-input" class="form-label">
            Seleccionar zona horaria:
          </label>
          <select
            id="tz-select-input"
            class="form-control select-control"
            [value]="selectedTimezone()"
            (change)="onTimezoneChange($event)"
            [disabled]="isControlsDisabled()"
            aria-label="Zona horaria IANA seleccionada"
            required
          >
            @for (tz of filteredTimezones(); track tz) {
              <option [value]="tz">{{ tz }}</option>
            }
          </select>
          <span class="form-hint">
            Zona seleccionada actualmente: <strong>{{ selectedTimezone() }}</strong>
          </span>
        </div>

        <div class="form-actions">
          <button
            type="submit"
            class="btn-save"
            [disabled]="isControlsDisabled() || !hasSelectedDifferentTimezone()"
            aria-label="Guardar zona horaria"
          >
            @if (isSaving()) {
              <span>Guardando zona horaria...</span>
            } @else {
              <span>Guardar zona horaria</span>
            }
          </button>
        </div>
      </form>
    </div>
  `,
  styles: `
    .timezone-section-card {
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
    .alert-warning {
      background-color: #fffbeb;
      border: 1px solid #fde68a;
      color: #92400e;
    }
    .alert-info {
      background-color: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1e40af;
    }
    .alert-content {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .alert-message {
      margin: 0;
      line-height: 1.4;
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
    .btn-reconcile:hover {
      background-color: #fef2f2;
    }
    .timezone-form {
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
      max-width: 24rem;
      min-height: 44px;
      padding: 0.625rem 0.75rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      color: #0f172a;
      background-color: #ffffff;
      box-sizing: border-box;
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
    .select-control {
      cursor: pointer;
    }
    .form-hint {
      font-size: 0.75rem;
      color: #64748b;
    }
    .form-actions {
      display: flex;
      justify-content: flex-start;
      padding-top: 0.5rem;
    }
    .btn-save {
      min-height: 44px;
      padding: 0.625rem 1.25rem;
      background-color: #2563eb;
      color: #ffffff;
      font-size: 0.875rem;
      font-weight: 600;
      border: none;
      border-radius: 0.375rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.15s ease;
    }
    .btn-save:hover:not(:disabled) {
      background-color: #1d4ed8;
    }
    .btn-save:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }
    .btn-save:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      background-color: #94a3b8;
    }
  `
})
export class EventTimezoneSectionComponent implements OnChanges {
  private readonly organizerService = inject(OrganizerService);

  @Input() event?: OrganizerEventModel;
  @Input() revision?: string;
  @Input() canEdit = true;

  @Output() saved = new EventEmitter<void>();
  @Output() reconcile = new EventEmitter<void>();

  readonly allTimezones = signal<string[]>(getSupportedIanaTimezones());
  readonly searchQuery = signal<string>('');
  readonly selectedTimezone = signal<string>('America/Bogota');
  readonly isSaving = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly isConflictError = signal<boolean>(false);

  readonly hasSelectedDifferentTimezone = computed(() => {
    const sel = this.selectedTimezone();
    const cur = this.event?.timezone;
    return !!sel && sel !== cur;
  });

  readonly isControlsDisabled = computed(() => {
    return !this.canEdit || this.event?.status === 'ACTIVE' || this.isSaving();
  });

  readonly filteredTimezones = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const all = this.allTimezones();
    const sel = this.selectedTimezone();
    if (!q) {
      return all;
    }
    const filtered = all.filter((tz) => tz.toLowerCase().includes(q));
    if (sel && !filtered.includes(sel)) {
      return [sel, ...filtered];
    }
    return filtered;
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['event'] && this.event) {
      if (this.event.timezone) {
        this.selectedTimezone.set(this.event.timezone);
        const all = this.allTimezones();
        if (!all.includes(this.event.timezone)) {
          this.allTimezones.set([this.event.timezone, ...all]);
        }
      }
      this.errorMessage.set(null);
      this.successMessage.set(null);
      this.isConflictError.set(false);
    }
  }

  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.searchQuery.set(target?.value ?? '');
  }

  onTimezoneChange(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    if (target?.value) {
      this.selectedTimezone.set(target.value);
    }
  }

  onReconcileClick(): void {
    this.errorMessage.set(null);
    this.isConflictError.set(false);
    this.reconcile.emit();
  }

  async onSubmit(event?: Event): Promise<void> {
    if (event) {
      event.preventDefault();
    }

    if (!this.event || !this.canEdit || this.event.status === 'ACTIVE' || !this.hasSelectedDifferentTimezone()) {
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.isConflictError.set(false);

    try {
      const result = await this.organizerService.changeEventTimezone({
        eventId: this.event.id,
        timezone: this.selectedTimezone(),
        expectedRevision: this.revision ?? '0'
      });

      let msg = 'Zona horaria guardada con éxito.';
      if (result?.warning === 'RECALCULATED_SCHEDULE') {
        msg += ' La hora de inicio fue recalculada para ajustarse a la nueva zona horaria.';
      }

      this.successMessage.set(msg);
      this.saved.emit();
    } catch (err: unknown) {
      const errorStr = (err as Error)?.message || '';
      if (errorStr === 'CONCURRENCY_CONFLICT') {
        this.isConflictError.set(true);
        this.errorMessage.set(
          'Conflicto de concurrencia: el evento fue actualizado por otra sesión o pestaña. Reconcilia los datos antes de continuar.'
        );
      } else if (errorStr === 'ACCESS_DENIED') {
        this.errorMessage.set('No tienes permisos suficientes para modificar la zona horaria de este evento.');
      } else if (errorStr === 'UNPROCESSABLE_ENTITY' || errorStr === 'INVALID_ARGUMENT') {
        this.errorMessage.set('La zona horaria seleccionada no es válida o fue rechazada por el servidor.');
      } else {
        this.errorMessage.set('No fue posible guardar la zona horaria debido a un error de comunicación.');
      }
    } finally {
      this.isSaving.set(false);
    }
  }
}
