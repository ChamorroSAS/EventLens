import { Component, EventEmitter, Input, Output, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { OrganizerEventModel } from './organizer.types.js';
import { OrganizerService } from './organizer.service.js';

@Component({
  selector: 'eventlens-event-schedule-section',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './event-schedule-section.component.html',
  styleUrl: './event-schedule-section.component.scss'
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
