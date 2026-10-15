import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChild,
  AfterViewInit,
  inject,
  signal
} from '@angular/core';
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
  selector: 'eventlens-create-event-form',
  standalone: true,
  templateUrl: './create-event-form.component.html',
  styleUrl: './create-event-form.component.scss'
})
export class CreateEventFormComponent implements AfterViewInit {
  private readonly organizerService = inject(OrganizerService);

  @Input() triggerElement?: HTMLElement | null = null;
  @Output() eventCreated = new EventEmitter<{ id: string; outcome?: string }>();
  @Output() cancel = new EventEmitter<void>();

  @ViewChild('nameInput') nameInputRef?: ElementRef<HTMLInputElement>;

  readonly name = signal('');
  readonly isBusy = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly isUncertain = signal(false);

  // In-memory idempotency key: persists across uncertainty/retries for the same intention
  inMemoryIdempotencyKey: string | null = null;

  ngAfterViewInit(): void {
    this.inMemoryIdempotencyKey = generateClientUuid();
    setTimeout(() => {
      this.nameInputRef?.nativeElement?.focus();
    }, 50);
  }

  onNameInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.name.set(target.value);
    if (this.errorMessage()) {
      this.errorMessage.set(null);
    }
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    if (!this.isBusy()) {
      this.onCancel();
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && !this.isBusy()) {
      this.onCancel();
    }
  }

  onCancel(): void {
    if (this.isBusy()) {
      // Bloquear descarte hasta resultado durante envío
      return;
    }
    this.inMemoryIdempotencyKey = null;
    this.cancel.emit();
    this.triggerElement?.focus();
  }

  async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.isBusy()) {
      return;
    }

    const trimmed = this.name().trim();
    if (!trimmed || trimmed.length > 120) {
      this.errorMessage.set('El nombre del evento debe tener entre 1 y 120 caracteres');
      this.nameInputRef?.nativeElement?.focus();
      return;
    }

    this.isBusy.set(true);
    this.errorMessage.set(null);
    this.isUncertain.set(false);

    if (!this.inMemoryIdempotencyKey) {
      this.inMemoryIdempotencyKey = generateClientUuid();
    }

    try {
      const result = await this.organizerService.createEvent(trimmed, this.inMemoryIdempotencyKey);
      this.inMemoryIdempotencyKey = null;
      this.isBusy.set(false);
      this.eventCreated.emit({ id: result.id, outcome: result.outcome });
    } catch (err: any) {
      this.isBusy.set(false);

      if (err?.code === 'INVALID_NAME' || err?.status === 422) {
        this.errorMessage.set(err.message || 'El nombre del evento debe tener entre 1 y 120 caracteres');
        this.nameInputRef?.nativeElement?.focus();
        return;
      }

      if (err?.code === 'IDEMPOTENCY_CONFLICT' || err?.status === 409) {
        this.errorMessage.set('Conflicto de idempotencia con una operación previa. Por favor verifica tus eventos.');
        return;
      }

      // Resultado incierto (timeout, error de red o servidor no confirmado)
      this.isUncertain.set(true);
      this.errorMessage.set(
        'No fue posible confirmar la creación debido a un problema de conexión. Puedes reintentar para reconciliar la solicitud sin duplicar el evento.'
      );
    }
  }
}
