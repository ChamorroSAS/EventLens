import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import type { AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonComponent } from '../shared/ui/button.component.js';
import { FormActionsComponent } from '../shared/ui/form-actions.component.js';
import { FormFieldComponent } from '../shared/ui/form-field.component.js';
import { TextInputComponent } from '../shared/ui/text-input.component.js';
import { EventsService } from './events.service.js';
import { CreateEventError, newIdempotencyKey } from './events.types.js';

const EVENT_NAME_MAX_LENGTH = 120;

function eventNameValidator(control: AbstractControl): ValidationErrors | null {
  const value = typeof control.value === 'string' ? control.value.trim() : '';
  if (value.length === 0) return { required: true };
  if (value.length > EVENT_NAME_MAX_LENGTH) return { maxlength: true };
  return null;
}

@Component({
  selector: 'eventlens-create-event-form',
  standalone: true,
  imports: [ReactiveFormsModule, ButtonComponent, FormActionsComponent, FormFieldComponent, TextInputComponent],
  template: `
    <section class="create-event">
      <header class="create-event__header">
        <h1 class="create-event__title">Crear borrador de evento</h1>
        <p class="create-event__subtitle">
          Da un nombre provisional. Podrás configurar fechas, portada y acceso más adelante sin exponerlo a invitados.
        </p>
      </header>

      <form class="create-event__form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <eventlens-form-field
          label="Nombre del evento"
          inputId="event-name"
          [required]="true"
          helperText="Así verán el evento tus invitados."
          [errorText]="nameError()"
        >
          <eventlens-text-input
            inputId="event-name"
            formControlName="name"
            [invalid]="nameError().length > 0"
            [describedBy]="nameDescribedBy()"
          />
        </eventlens-form-field>

        @if (submitError()) {
          <p class="create-event__error" role="alert">{{ submitError() }}</p>
        }

        <eventlens-form-actions [sticky]="true">
          <eventlens-button variant="secondary" type="button" (click)="cancel()">Cancelar</eventlens-button>
          <eventlens-button variant="primary" type="submit" [loading]="submitting()">Crear borrador</eventlens-button>
        </eventlens-form-actions>
      </form>

      <p class="create-event__status" role="status" aria-live="polite">{{ statusMessage() }}</p>
    </section>
  `,
  styles: `
    .create-event {
      display: flex;
      flex-direction: column;
      gap: var(--el-space-lg);
      max-inline-size: 32rem;
      margin-inline: auto;
      padding: var(--el-space-lg) var(--el-space-md);
      font-family: var(--el-font-family);
      color: var(--el-color-text);
    }
    .create-event__header {
      display: flex;
      flex-direction: column;
      gap: var(--el-space-xs);
    }
    .create-event__title {
      margin: 0;
      font-size: var(--el-font-size-h1);
      font-weight: var(--el-font-weight-bold);
      line-height: var(--el-line-height-tight);
    }
    .create-event__subtitle {
      margin: 0;
      font-size: var(--el-font-size-body);
      line-height: var(--el-line-height-normal);
      color: var(--el-color-text-secondary);
    }
    .create-event__form {
      display: flex;
      flex-direction: column;
      gap: var(--el-space-lg);
      background-color: var(--el-color-surface);
      border: 1px solid var(--el-color-border);
      border-radius: var(--el-radius-lg);
      box-shadow: var(--el-elevation-subtle);
      padding: var(--el-space-lg);
    }
    .create-event__error {
      margin: 0;
      font-size: var(--el-font-size-body-small);
      font-weight: var(--el-font-weight-medium);
      color: var(--el-color-danger);
    }
    .create-event__status:empty {
      display: none;
    }
    .create-event__status {
      margin: 0;
      font-size: var(--el-font-size-body-small);
      color: var(--el-color-text-secondary);
    }
  `,
})
export class CreateEventFormComponent {
  private readonly events = inject(EventsService);
  private readonly router = inject(Router);

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, eventNameValidator] }),
  });

  readonly submitting = signal(false);
  readonly submitError = signal('');
  readonly statusMessage = signal('');
  private readonly serverNameInvalid = signal(false);
  private submitAttempted = false;

  private idempotencyKey: string | null = null;
  private idempotencyForName: string | null = null;

  constructor() {
    this.form.controls.name.valueChanges.subscribe(() => {
      if (this.serverNameInvalid()) this.serverNameInvalid.set(false);
    });
  }

  nameError(): string {
    const control = this.form.controls.name;
    if (!control.valid && (control.touched || this.submitAttempted)) {
      if (control.hasError('required')) return 'Escribe un nombre para el evento.';
      if (control.hasError('maxlength')) return 'El nombre no puede superar 120 caracteres.';
      return 'Revisa el nombre del evento.';
    }
    if (this.serverNameInvalid()) return 'El nombre del evento no es válido.';
    return '';
  }

  nameDescribedBy(): string {
    return this.nameError() ? 'event-name-helper event-name-error' : 'event-name-helper';
  }

  async submit(): Promise<void> {
    if (this.submitting()) return;
    this.submitAttempted = true;
    this.form.markAllAsTouched();
    this.submitError.set('');
    if (this.form.invalid) return;

    const name = this.form.controls.name.value.trim();
    this.submitting.set(true);
    try {
      const outcome = await this.events.createDraft({ name, idempotencyKey: this.keyFor(name) });
      this.idempotencyKey = null;
      this.idempotencyForName = null;
      this.statusMessage.set(
        outcome.kind === 'replayed'
          ? `El borrador «${outcome.event.name}» ya estaba creado.`
          : `Borrador creado: ${outcome.event.name}.`,
      );
    } catch (error) {
      this.submitError.set(this.messageFor(error));
    } finally {
      this.submitting.set(false);
    }
  }

  cancel(): void {
    void this.router.navigate(['/']);
  }

  private keyFor(name: string): string {
    if (!this.idempotencyKey || this.idempotencyForName !== name) {
      this.idempotencyKey = newIdempotencyKey();
      this.idempotencyForName = name;
    }
    return this.idempotencyKey;
  }

  private messageFor(error: unknown): string {
    if (error instanceof CreateEventError) {
      switch (error.status) {
        case 401:
          return 'Tu sesión expiró. Inicia sesión de nuevo para continuar.';
        case 403:
          return 'No pudimos validar tu solicitud de seguridad. Vuelve a intentarlo.';
        case 409:
          return 'Ya usaste este intento con otro contenido. Cambia el nombre e inténtalo de nuevo.';
        case 422:
          this.serverNameInvalid.set(true);
          return '';
        default:
          return 'No pudimos crear el borrador. Inténtalo de nuevo.';
      }
    }
    return 'No pudimos crear el borrador. Revisa tu conexión e inténtalo de nuevo.';
  }
}
