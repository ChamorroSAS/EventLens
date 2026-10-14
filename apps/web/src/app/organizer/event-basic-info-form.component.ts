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
  template: `
    <div class="basic-info-card">
      <header class="card-header">
        <div class="header-titles">
          <h3 class="card-title">Información general</h3>
          <p class="card-description">
            Modifica los datos principales de tu evento mientras se encuentre en estado de borrador.
          </p>
        </div>
        @if (canEdit()) {
          <span class="capability-tag editable" aria-label="Edición permitida">
            ✓ Modo edición
          </span>
        } @else {
          <span class="capability-tag readonly" aria-label="Modo solo lectura">
            🔒 Solo lectura
          </span>
        }
      </header>

      <form (submit)="onSave($event)" class="info-form" novalidate>
        <div class="form-group" [class.has-error]="errorMessage()">
          <label for="event-name-field" class="form-label">
            Nombre del evento
            @if (canEdit()) {
              <span class="required" aria-hidden="true">*</span>
            }
          </label>

          @if (canEdit()) {
            <input
              id="event-name-field"
              type="text"
              class="form-input"
              [value]="currentName()"
              (input)="onNameInput($event)"
              [disabled]="isBusy()"
              maxlength="120"
              aria-describedby="name-helper"
              [attr.aria-invalid]="!!errorMessage()"
              autocomplete="off"
              required
            />
          } @else {
            <input
              id="event-name-field"
              type="text"
              class="form-input disabled"
              [value]="event.name"
              disabled
              readonly
              aria-describedby="name-helper"
            />
          }

          <p id="name-helper" class="form-helper">
            @if (canEdit()) {
              El nombre puede tener hasta 120 caracteres y se actualiza de forma segura mediante control de versiones.
            } @else {
              El nombre solo se puede modificar mientras el evento está en borrador (DRAFT).
            }
          </p>

          @if (errorMessage()) {
            <div class="alert-banner error" role="alert" aria-live="polite">
              <span class="alert-icon" aria-hidden="true">⚠️</span>
              <span class="alert-text">{{ errorMessage() }}</span>
            </div>
          }

          @if (conflictWarning()) {
            <div class="alert-banner warning" role="alert" aria-live="polite">
              <span class="alert-icon" aria-hidden="true">⚡</span>
              <div class="alert-content">
                <strong>Conflicto de concurrencia:</strong>
                <span>{{ conflictWarning() }}</span>
              </div>
            </div>
          }

          @if (successMessage()) {
            <div class="alert-banner success" role="status" aria-live="polite">
              <span class="alert-icon" aria-hidden="true">✓</span>
              <span class="alert-text">{{ successMessage() }}</span>
            </div>
          }
        </div>

        <!-- Metadatos de solo lectura confirmados del evento -->
        <dl class="metadata-grid">
          <div class="meta-item">
            <dt>Zona horaria</dt>
            <dd>{{ event.timezone }}</dd>
          </div>
          <div class="meta-item">
            <dt>Estado de ciclo de vida</dt>
            <dd>{{ event.status }}</dd>
          </div>
          <div class="meta-item">
            <dt>Revisión actual</dt>
            <dd class="revision-code">{{ configuration.revision }}</dd>
          </div>
          <div class="meta-item">
            <dt>Identificador único</dt>
            <dd class="id-code">{{ event.id }}</dd>
          </div>
        </dl>

        @if (canEdit()) {
          <footer class="form-actions">
            <button
              type="button"
              class="btn-discard"
              (click)="onDiscard()"
              [disabled]="!isDirty() || isBusy()"
            >
              Descartar cambios
            </button>

            <button
              type="submit"
              class="btn-save"
              [disabled]="!isDirty() || isBusy() || !currentName().trim()"
            >
              @if (isBusy()) {
                <span class="spinner" aria-hidden="true">⏳</span>
                <span aria-live="assertive">Guardando...</span>
              } @else {
                <span>Guardar cambios</span>
              }
            </button>
          </footer>
        }
      </form>
    </div>
  `,
  styles: [`
    @use 'mixins' as m;

    .basic-info-card {
      background: var(--el-color-surface, #ffffff);
      border: 1px solid var(--el-color-border, #e5e7eb);
      border-radius: var(--el-radius-lg, 12px);
      padding: var(--el-space-lg, 1.5rem);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    .card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--el-color-border, #f3f4f6);
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }

    .card-title {
      margin: 0 0 0.25rem 0;
      font-size: var(--el-font-size-h3, 1.2rem);
      font-weight: var(--el-font-weight-bold, 700);
      color: var(--el-color-text, #111827);
    }

    .card-description {
      margin: 0;
      font-size: var(--el-font-size-caption, 0.875rem);
      color: var(--el-color-text-secondary, #6b7280);
    }

    .capability-tag {
      display: inline-flex;
      align-items: center;
      padding: 0.25rem 0.625rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;

      &.editable {
        background-color: #ecfdf5;
        color: #059669;
        border: 1px solid #a7f3d0;
      }

      &.readonly {
        background-color: #f3f4f6;
        color: #6b7280;
        border: 1px solid #e5e7eb;
      }
    }

    .form-group {
      margin-bottom: 1.5rem;
    }

    .form-label {
      display: block;
      margin-bottom: 0.375rem;
      font-size: var(--el-font-size-label, 0.9rem);
      font-weight: var(--el-font-weight-semibold, 600);
      color: var(--el-color-text, #374151);
    }

    .required {
      color: var(--el-color-error, #dc2626);
    }

    .form-input {
      width: 100%;
      box-sizing: border-box;
      min-height: var(--el-touch-target-min, 44px);
      padding: 0.625rem 0.875rem;
      border: 1px solid var(--el-color-border, #d1d5db);
      border-radius: var(--el-radius-md, 8px);
      font-size: 1rem;
      color: var(--el-color-text, #111827);
      background-color: var(--el-color-surface, #ffffff);
      transition: border-color 0.15s ease, box-shadow 0.15s ease;

      &:focus-visible {
        outline: none;
        border-color: var(--el-color-primary, #6366f1);
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
      }

      &.disabled {
        background-color: #f9fafb;
        color: #6b7280;
        cursor: not-allowed;
      }
    }

    .has-error .form-input {
      border-color: var(--el-color-error, #dc2626);
      &:focus-visible {
        box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.2);
      }
    }

    .form-helper {
      margin: 0.375rem 0 0 0;
      font-size: 0.825rem;
      color: var(--el-color-text-secondary, #6b7280);
    }

    .alert-banner {
      display: flex;
      align-items: flex-start;
      gap: 0.625rem;
      padding: 0.75rem 1rem;
      border-radius: var(--el-radius-md, 8px);
      font-size: 0.875rem;
      margin-top: 0.75rem;

      &.error {
        background-color: rgba(220, 38, 38, 0.08);
        border: 1px solid rgba(220, 38, 38, 0.2);
        color: var(--el-color-error, #dc2626);
      }

      &.warning {
        background-color: #fffbeb;
        border: 1px solid #fef3c7;
        color: #92400e;
      }

      &.success {
        background-color: #ecfdf5;
        border: 1px solid #a7f3d0;
        color: #065f46;
      }
    }

    .metadata-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      padding: 1.25rem;
      background-color: #f9fafb;
      border-radius: var(--el-radius-md, 8px);
      margin: 1.5rem 0;
    }

    .meta-item {
      dt {
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #6b7280;
        margin-bottom: 0.25rem;
        font-weight: 600;
      }
      dd {
        margin: 0;
        font-size: 0.95rem;
        font-weight: 500;
        color: #111827;
      }
      .revision-code,
      .id-code {
        font-family: monospace;
        font-size: 0.85rem;
        color: #4b5563;
      }
    }

    .form-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 1rem;
      padding-top: 1rem;
      border-top: 1px solid var(--el-color-border, #f3f4f6);
    }

    .btn-discard,
    .btn-save {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      min-height: var(--el-touch-target-min, 44px);
      padding: 0.625rem 1.25rem;
      border-radius: var(--el-radius-md, 8px);
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.15s ease, opacity 0.15s ease;

      &:focus-visible {
        outline: none;
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.3);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    .btn-discard {
      background: transparent;
      border: 1px solid var(--el-color-border, #d1d5db);
      color: #374151;

      &:hover:not(:disabled) {
        background-color: #f3f4f6;
      }
    }

    .btn-save {
      background-color: var(--el-color-primary, #6366f1);
      border: 1px solid transparent;
      color: #ffffff;

      &:hover:not(:disabled) {
        background-color: var(--el-color-primary-hover, #4f46e5);
      }
    }
  `]
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
