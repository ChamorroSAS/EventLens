import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  computed,
  inject,
  signal
} from '@angular/core';
import type { EventConfigurationModel, OrganizerEventModel } from './organizer.types.js';
import { OrganizerService } from './organizer.service.js';

function generateClientUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

@Component({
  selector: 'eventlens-event-basic-info-form',
  standalone: true,
  templateUrl: './event-basic-info-form.component.html',
  styleUrl: './event-basic-info-form.component.scss'
})
export class EventBasicInfoFormComponent implements OnChanges, OnInit {
  private readonly organizerService = inject(OrganizerService);

  private readonly eventSignal = signal<OrganizerEventModel | null>(null);
  private readonly configSignal = signal<EventConfigurationModel | null>(null);

  @Input({ required: true }) set event(val: OrganizerEventModel) {
    this.eventSignal.set(val);
    if (val) {
      this.initialName.set(val.name || '');
      if (!this.isDirty()) {
        this.currentName.set(val.name || '');
      }
    }
  }
  get event(): OrganizerEventModel {
    return this.eventSignal()!;
  }

  @Input({ required: true }) set configuration(val: EventConfigurationModel) {
    this.configSignal.set(val);
  }
  get configuration(): EventConfigurationModel {
    return this.configSignal()!;
  }

  @Output() eventUpdated = new EventEmitter<{ id: string; name: string; revision: string }>();
  @Output() dirtyChange = new EventEmitter<boolean>();

  readonly currentName = signal('');
  readonly initialName = signal('');
  readonly isBusy = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly conflictWarning = signal<string | null>(null);

  readonly canEdit = computed(() => {
    return !!this.configSignal()?.capabilities?.canEditName;
  });

  readonly isDirty = computed(() => {
    return this.currentName().trim() !== this.initialName().trim();
  });

  ngOnInit(): void {
    if (this.eventSignal()) {
      const confirmedName = this.eventSignal()!.name || '';
      this.initialName.set(confirmedName);
      if (!this.currentName()) {
        this.currentName.set(confirmedName);
      }
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['event'] || changes['configuration']) {
      if (this.event) {
        const confirmedName = this.event.name || '';
        this.initialName.set(confirmedName);
        if (!this.isDirty()) {
          this.currentName.set(confirmedName);
        }
      }
    }
  }

  onNameInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.currentName.set(target.value);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.conflictWarning.set(null);
    this.dirtyChange.emit(this.isDirty());
  }

  onDiscard(): void {
    this.currentName.set(this.initialName());
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.conflictWarning.set(null);
    this.dirtyChange.emit(false);
  }

  async onSave(event?: Event): Promise<void> {
    if (event) {
      event.preventDefault();
    }

    if (!this.canEdit() || this.isBusy()) {
      return;
    }

    const trimmed = this.currentName().trim();
    if (!trimmed || trimmed.length > 120) {
      this.errorMessage.set('El nombre del evento debe tener entre 1 y 120 caracteres');
      return;
    }

    if (!this.isDirty()) {
      return;
    }

    this.isBusy.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.conflictWarning.set(null);

    const idempotencyKey = generateClientUuid();

    try {
      const res = await this.organizerService.updateEventName({
        eventId: this.event.id,
        name: trimmed,
        expectedRevision: this.configuration.revision,
        idempotencyKey
      });

      this.isBusy.set(false);
      this.initialName.set(res.name);
      this.currentName.set(res.name);
      this.dirtyChange.emit(false);
      this.successMessage.set('Nombre del evento guardado correctamente.');
      this.eventUpdated.emit({ id: res.id, name: res.name, revision: res.revision });
    } catch (err: any) {
      this.isBusy.set(false);

      if (err?.code === 'CONCURRENCY_CONFLICT' || err?.status === 409) {
        this.conflictWarning.set(
          'El evento fue modificado en otra sesión o ventana. Conservamos tu cambio sin sobrescribir. Consulta la versión actual antes de volver a guardar.'
        );
        return;
      }

      if (err?.code === 'INVALID_NAME' || err?.status === 422) {
        this.errorMessage.set(err.message || 'El nombre del evento debe tener entre 1 y 120 caracteres');
        return;
      }

      if (err?.code === 'UNAUTHORIZED' || err?.status === 401 || err?.status === 403) {
        this.errorMessage.set('No tienes permisos para modificar este evento.');
        return;
      }

      this.errorMessage.set(
        'No fue posible guardar los cambios debido a un problema de conexión. Por favor reintenta.'
      );
    }
  }
}
