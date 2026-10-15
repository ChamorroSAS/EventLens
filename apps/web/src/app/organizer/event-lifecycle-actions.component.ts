import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, inject, signal } from '@angular/core';
import { OrganizerService, type OrganizerLifecycleSnapshot } from './organizer.service.js';
import { EventStatusBadgeComponent } from '../lifecycle/event-status-badge.component.js';

type LifecycleIntent = {
  eventId: string;
  action: 'schedule' | 'activate';
  expectedRevision: string;
  idempotencyKey: string;
};

@Component({
  selector: 'eventlens-event-lifecycle-actions',
  standalone: true,
  imports: [EventStatusBadgeComponent],
  templateUrl: './event-lifecycle-actions.component.html',
  styleUrl: './event-lifecycle-actions.component.scss'
})
export class EventLifecycleActionsComponent implements OnChanges, OnDestroy {
  private readonly service = inject(OrganizerService);
  @Input({ required: true }) eventId!: string;
  @Input() revision?: string;
  @Output() updated = new EventEmitter<void>();
  readonly snapshot = signal<OrganizerLifecycleSnapshot | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly confirmation = signal<'schedule' | 'activate' | null>(null);
  readonly uncertain = signal(false);
  private intent: LifecycleIntent | null = null;
  private generation = 0;
  private alive = true;

  ngOnChanges(): void {
    this.intent = null;
    this.confirmation.set(null);
    this.uncertain.set(false);
    this.saving.set(false);
    this.success.set(null);
    void this.reload();
  }

  ngOnDestroy(): void { this.alive = false; this.generation++; }

  async reload(): Promise<void> {
    if (this.saving()) return;
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set(null);
    this.snapshot.set(null);
    try {
      const snapshot = await this.service.getEventLifecycle(this.eventId);
      if (this.alive && generation === this.generation) this.snapshot.set(snapshot);
    } catch {
      if (this.alive && generation === this.generation) this.error.set('No pudimos consultar el estado del evento. Reintenta la consulta.');
    } finally {
      if (this.alive && generation === this.generation) this.loading.set(false);
    }
  }

  begin(action: 'schedule' | 'activate'): void {
    const snapshot = this.snapshot();
    if (this.saving() || this.loading() || this.uncertain() || !snapshot) return;
    if (action === 'schedule' ? !snapshot.capabilities.canSchedule || !snapshot.scheduledAt : !snapshot.capabilities.canActivateEarly) return;
    this.confirmation.set(action);
    this.error.set(null);
    this.success.set(null);
  }

  cancel(): void { if (!this.saving()) this.confirmation.set(null); }

  async confirm(): Promise<void> {
    if (this.saving() || this.loading()) return;
    const snapshot = this.snapshot();
    const action = this.confirmation();
    if (!this.intent) {
      if (!snapshot || !action) return;
      this.intent = { eventId: this.eventId, action, expectedRevision: snapshot.revision, idempotencyKey: crypto.randomUUID() };
    }
    const intent = this.intent;
    const generation = this.generation;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.service.transitionEventLifecycle(intent);
      if (!this.alive || generation !== this.generation) return;
      this.intent = null;
      this.confirmation.set(null);
      this.uncertain.set(false);
      this.success.set('Operación confirmada.');
      this.saving.set(false);
      this.updated.emit();
      await this.reload();
    } catch (caught) {
      if (!this.alive || generation !== this.generation) return;
      const status = (caught as { status?: number }).status;
      if (status === undefined || status >= 500) {
        this.uncertain.set(true);
        this.error.set('No se pudo confirmar la operación. Reintenta la misma operación o consulta el estado antes de continuar.');
      } else {
        this.intent = null;
        this.confirmation.set(null);
        this.snapshot.set(null);
        this.error.set(status === 409
          ? 'El estado o la revisión del evento cambió. Consulta el estado antes de volver a intentarlo.'
          : status === 422
            ? 'Revisa la fecha de inicio y la vigencia del evento antes de continuar.'
            : status === 401 || status === 403
              ? 'No se autorizó la operación. Comprueba tu sesión.'
              : 'No se pudo realizar la operación. Consulta el estado del evento.');
      }
    } finally {
      if (this.alive && generation === this.generation) this.saving.set(false);
    }
  }

  async reconcile(): Promise<void> {
    if (this.saving()) return;
    this.intent = null;
    this.confirmation.set(null);
    this.uncertain.set(false);
    this.success.set(null);
    await this.reload();
    this.updated.emit();
  }

  formatDate(value: string | null): string {
    if (!value) return 'Sin programar';
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: this.snapshot()?.timezone }).format(new Date(value));
  }
}
