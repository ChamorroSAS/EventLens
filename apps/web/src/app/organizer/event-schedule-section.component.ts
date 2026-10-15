import { Component, EventEmitter, Input, Output, OnDestroy, signal, inject } from '@angular/core';
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
export class EventScheduleSectionComponent implements OnDestroy {
  private readonly organizerService = inject(OrganizerService);

  @Input() event?: OrganizerEventModel;
  @Input() revision?: string;
  @Input() canEdit = false;

  @Output() saved = new EventEmitter<void>();
  @Output() reconcile = new EventEmitter<void>();

  startsAtLocal = '';
  selectedOffset: number | null = null;
  availableOffsets = signal<number[]>([]);
  isSaving = signal(false);
  successMessage = signal<string | null>(null);
  errorMessage = signal<string | null>(null);
  hasConflict = signal(false);
  needsReload = signal(false);
  uncertain = signal(false);
  confirmedStartsAt = signal<string | null>(null);
  private previousEventId?: string;
  private previousRevision?: string;
  private generation = 0;
  private alive = true;
  private awaitingReconciliation = false;
  private intent: { eventId: string; startsAtLocal: string; utcOffsetMinutes?: number; expectedRevision: string; idempotencyKey: string } | null = null;

  ngOnChanges(): void {
    const changedEvent = this.previousEventId !== this.event?.id;
    const changedRevision = this.previousRevision !== this.revision;
    if (changedEvent) {
      this.generation++;
      this.intent = null;
      this.uncertain.set(false);
      this.isSaving.set(false);
      this.hasConflict.set(false);
      this.needsReload.set(false);
      this.awaitingReconciliation = false;
      this.errorMessage.set(null);
      this.successMessage.set(null);
      this.availableOffsets.set([]);
      this.selectedOffset = null;
      this.startsAtLocal = this.event?.startsAtLocal?.slice(0, 16) ?? '';
    } else if ((changedRevision || this.awaitingReconciliation) && !this.uncertain()) {
      const preserveProposal = this.hasConflict() || this.needsReload();
      if (!preserveProposal) this.startsAtLocal = this.event?.startsAtLocal?.slice(0, 16) ?? '';
      this.intent = null;
      this.hasConflict.set(false);
      this.needsReload.set(false);
      this.errorMessage.set(null);
      this.availableOffsets.set([]);
      this.selectedOffset = null;
      this.awaitingReconciliation = false;
    }
    this.confirmedStartsAt.set(this.event?.startsAtLocal ?? null);
    this.previousEventId = this.event?.id;
    this.previousRevision = this.revision;
  }

  ngOnDestroy(): void { this.alive = false; this.generation++; }

  onDateChange(): void {
    if (this.isSaving() || this.uncertain()) return;
    this.intent = null;
    this.selectedOffset = null;
    this.availableOffsets.set([]);
    if (!this.hasConflict() && !this.needsReload()) this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  formatOffset(minutes: number): string {
    const sign = minutes >= 0 ? '+' : '-';
    const abs = Math.abs(minutes);
    const hrs = String(Math.floor(abs / 60)).padStart(2, '0');
    const mins = String(abs % 60).padStart(2, '0');
    return `UTC${sign}${hrs}:${mins}`;
  }

  async onSave(): Promise<void> {
    if (this.isSaving() || this.hasConflict() || this.needsReload() || !this.event?.id || !this.startsAtLocal || !this.revision || (!this.intent && !this.canEdit)) return;
    this.intent ??= {
      eventId: this.event.id,
      startsAtLocal: this.startsAtLocal,
      utcOffsetMinutes: this.selectedOffset ?? undefined,
      expectedRevision: this.revision,
      idempotencyKey: crypto.randomUUID()
    };
    const generation = this.generation;

    this.isSaving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.hasConflict.set(false);

    try {
      const result = await this.organizerService.setEventSchedule(this.intent);
      if (!this.alive || generation !== this.generation) return;
      this.intent = null;
      this.uncertain.set(false);

      this.successMessage.set(result.outcome === 'IDEMPOTENT_REPLAY' ? 'Guardado confirmado. Se consultan los datos actuales del evento.' : `Fecha y hora guardadas: ${result.event.startsAtLocal}`);
      this.availableOffsets.set([]);
      this.saved.emit();
    } catch (err: any) {
      if (!this.alive || generation !== this.generation) return;
      const code = err?.message || 'UNKNOWN_ERROR';
      this.uncertain.set(code === 'COMMUNICATION_ERROR' || code === 'UNKNOWN_ERROR');
      if (!this.uncertain()) this.intent = null;
      if (code === 'CONCURRENCY_CONFLICT') {
        this.hasConflict.set(true);
        this.errorMessage.set(
          'El evento cambió desde que lo abriste (conflicto CAS). Revisa los datos actuales antes de guardar.'
        );
      } else if (code === 'EVENT_NOT_IN_DRAFT' || code === 'INVALID_STATE') {
        this.needsReload.set(true);
        this.errorMessage.set('No se puede modificar la programación en el estado actual del evento. Actualiza los datos.');
      } else if (code === 'IDEMPOTENCY_CONFLICT' || code === 'SCHEDULE_CONFLICT') {
        this.needsReload.set(true);
        this.errorMessage.set('Este intento de guardado entra en conflicto con otro intento. Recarga los datos antes de volver a guardar.');
      } else if (code === 'DST_GAP_TIME') {
        this.errorMessage.set(
          'La hora local seleccionada no existe en esta zona horaria debido al adelanto de reloj de horario de verano.'
        );
      } else if (code === 'AMBIGUOUS_LOCAL_TIME') {
        this.availableOffsets.set(Array.isArray(err?.availableOffsets) ? err.availableOffsets : []);
        this.errorMessage.set(
          'La hora local seleccionada es ambigua (ocurre dos veces por el cambio de horario). Selecciona una opción abajo.'
        );
      } else if (code === 'ACCESS_DENIED') {
        this.errorMessage.set('No tienes permisos suficientes para programar este evento.');
      } else {
        this.errorMessage.set(this.uncertain() ? 'No pudimos confirmar si se guardó. Reintenta el mismo guardado o consulta los datos actuales.' : 'Ocurrió un error al guardar la programación.');
      }
    } finally {
      if (this.alive && generation === this.generation) this.isSaving.set(false);
    }
  }

  onReconcile(): void {
    if (this.isSaving()) return;
    this.awaitingReconciliation = true;
    this.reconcile.emit();
  }
}
