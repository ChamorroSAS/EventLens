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
  templateUrl: './event-timezone-section.component.html',
  styleUrl: './event-timezone-section.component.scss'
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
