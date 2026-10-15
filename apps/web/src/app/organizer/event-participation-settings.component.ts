import { Component, EventEmitter, Input, Output, OnChanges, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OrganizerService } from './organizer.service.js';
import type { EventConfigurationModel } from './organizer.types.js';

type Intent = { eventId: string; uploadsEnabled: boolean; guestGalleryEnabled: boolean; expectedRevision: string; idempotencyKey: string };

@Component({
  selector: 'eventlens-event-participation-settings', standalone: true, imports: [FormsModule],
  templateUrl: './event-participation-settings.component.html', styleUrl: './event-participation-settings.component.scss'
})
export class EventParticipationSettingsComponent implements OnChanges, OnDestroy {
  private readonly service = inject(OrganizerService);
  @Input() configuration?: EventConfigurationModel;
  @Output() saved = new EventEmitter<void>();
  @Output() reconcile = new EventEmitter<void>();
  readonly snapshot = signal<EventConfigurationModel | undefined>(undefined);
  readonly busy = signal(false);
  readonly uncertain = signal(false);
  readonly needsReload = signal(false);
  readonly denied = signal(false);
  readonly error = signal<string | null>(null);
  readonly announcement = signal<string | null>(null);
  uploadsEnabled = false;
  guestGalleryEnabled = false;
  private intent: Intent | null = null;
  private generation = 0;
  private alive = true;
  private acknowledged = false;

  ngOnChanges(): void {
    const previous = this.snapshot();
    const next = this.configuration;
    const changedEvent = previous?.event.id !== next?.event.id;
    const dirty = this.isDirty();
    if (changedEvent || (previous?.capabilities.canEditSettings === true && next?.capabilities.canEditSettings !== true)) {
      this.generation++;
      this.busy.set(false);
      this.intent = null;
      this.uncertain.set(false);
      this.needsReload.set(false);
      this.acknowledged = false;
      this.denied.set(false);
      this.error.set(null);
      this.announcement.set(null);
    }
    this.snapshot.set(next);
    if (changedEvent || !dirty) this.resetProposal();
  }

  ngOnDestroy(): void { this.alive = false; this.generation++; }
  canEdit(): boolean {
    const config = this.snapshot();
    return !this.denied() && config?.capabilities.canEditSettings === true && ['DRAFT', 'SCHEDULED', 'ACTIVE'].includes(config.event.status);
  }
  isDirty(): boolean {
    const event = this.snapshot()?.event;
    return !!event && (event.uploadsEnabled !== this.uploadsEnabled || event.guestGalleryEnabled !== this.guestGalleryEnabled);
  }
  controlsLocked(): boolean { return !this.canEdit() || this.busy() || this.uncertain() || this.needsReload(); }
  onProposalChange(): void { this.intent = null; this.error.set(null); this.announcement.set(null); }
  private resetProposal(): void {
    this.uploadsEnabled = this.snapshot()?.event.uploadsEnabled ?? false;
    this.guestGalleryEnabled = this.snapshot()?.event.guestGalleryEnabled ?? false;
  }
  private current(generation: number): boolean { return this.alive && generation === this.generation; }

  async save(): Promise<void> {
    const config = this.snapshot();
    if (this.busy() || this.needsReload() || !this.canEdit() || !config?.revision || (!this.intent && !this.isDirty())) return;
    this.intent ??= { eventId: config.event.id, uploadsEnabled: this.uploadsEnabled, guestGalleryEnabled: this.guestGalleryEnabled,
      expectedRevision: config.revision, idempotencyKey: crypto.randomUUID() };
    const generation = this.generation;
    this.busy.set(true);
    this.error.set(null);
    this.announcement.set(null);
    try {
      await this.service.setEventParticipation(this.intent);
      if (!this.current(generation)) return;
      this.intent = null;
      this.uncertain.set(false);
      this.acknowledged = true;
      this.needsReload.set(true);
      await this.fetchCurrent(generation, true);
    } catch (err) {
      if (!this.current(generation)) return;
      const code = err instanceof Error ? err.message : 'COMMUNICATION_ERROR';
      this.uncertain.set(code === 'COMMUNICATION_ERROR');
      if (!this.uncertain()) this.intent = null;
      if (code === 'ACCESS_DENIED' || code === 'EVENT_NOT_FOUND') {
        this.denied.set(true);
        this.error.set('Tu sesión o permisos no permiten guardar este evento. Vuelve a ingresar o consulta tus eventos.');
      } else if (code === 'CONCURRENCY_CONFLICT') {
        this.needsReload.set(true);
        this.error.set('El evento cambió desde que lo abriste (conflicto de revisión). Recarga los datos; conservaremos tu propuesta.');
      } else if (code === 'INVALID_STATE') {
        this.needsReload.set(true);
        this.error.set('El estado actual del evento no permite modificar estos permisos. Recarga los datos.');
      } else if (code === 'IDEMPOTENCY_CONFLICT' || code === 'PARTICIPATION_CONFLICT') {
        this.needsReload.set(true);
        this.error.set('Este intento entra en conflicto con otro guardado. Recarga los datos antes de crear un nuevo intento.');
      } else {
        this.error.set(this.uncertain() ? 'No pudimos confirmar el guardado. Reintenta exactamente el mismo intento.' : 'No fue posible guardar los permisos. Revisa los datos e intenta nuevamente.');
      }
    } finally { if (this.current(generation)) this.busy.set(false); }
  }

  async reload(): Promise<void> {
    if (this.busy() || this.denied() || !this.snapshot()) return;
    const generation = this.generation;
    this.busy.set(true);
    await this.fetchCurrent(generation, this.acknowledged);
    if (this.current(generation)) this.busy.set(false);
  }

  private async fetchCurrent(generation: number, afterSave: boolean): Promise<void> {
    const id = this.snapshot()?.event.id;
    const consultingUncertainIntent = this.uncertain() && !afterSave;
    if (!id) return;
    try {
      const config = await this.service.getEventConfiguration(id);
      if (!this.current(generation) || config.event.id !== id) return;
      this.snapshot.set(config);
      if (consultingUncertainIntent) {
        // Reading equal flags cannot prove which command wrote them. Keep the exact intent,
        // revision and key until an authorized receipt confirms the original attempt.
        this.error.set(null);
        this.announcement.set('Permisos actuales consultados. El resultado del intento sigue sin confirmar; reintenta el mismo guardado. La propuesta permanece bloqueada.');
        this.reconcile.emit();
        return;
      }
      this.intent = null;
      this.needsReload.set(false);
      this.error.set(null);
      if (afterSave) {
        this.resetProposal();
        this.acknowledged = false;
        this.announcement.set('Guardado confirmado. Se muestran los permisos actuales del evento.');
        this.saved.emit();
      } else {
        this.announcement.set('Datos actuales recargados. Tu propuesta se conserva; revisa ambos valores antes de guardar.');
        this.reconcile.emit();
      }
    } catch (err) {
      if (!this.current(generation)) return;
      const code = err instanceof Error ? err.message : 'COMMUNICATION_ERROR';
      if (!consultingUncertainIntent) this.needsReload.set(true);
      if (code === 'ACCESS_DENIED' || code === 'EVENT_NOT_FOUND') this.denied.set(true);
      this.error.set(this.denied() ? 'Ya no tienes acceso a este evento. Vuelve a ingresar o consulta tus eventos.' : consultingUncertainIntent ? 'No se pudieron consultar los permisos actuales. El intento sigue sin confirmar; puedes reintentar exactamente el mismo guardado.' : 'No se pudieron consultar los permisos actuales. Recarga los datos para confirmar el resultado.');
    }
  }
}
