import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EventAccessSettings, UpdatePinCommandPayload } from './access.types.js';

@Component({
  selector: 'el-event-access-settings',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="settings-card" aria-labelledby="access-settings-title">
      <header class="card-header">
        <h2 id="access-settings-title" class="card-title">Protección de entrada y PIN</h2>
        <span class="status-indicator" [ngClass]="settings?.pinEnabled ? 'pin-active' : 'pin-inactive'">
          {{ settings?.pinEnabled ? 'PIN Activado' : 'Sin PIN' }}
        </span>
      </header>

      <div class="revocation-warning" role="note">
        <strong>Aviso de seguridad (DEC-083):</strong>
        Modificar o desactivar el código PIN revoca de inmediato todas las sesiones activas de invitados. Los invitados deberán volver a ingresar con las nuevas credenciales.
      </div>

      <div class="settings-body">
        <div class="mode-selection" role="radiogroup" aria-label="Modo de protección con PIN">
          <label class="radio-option" [class.selected]="selectedMode === 'ENABLED'">
            <input
              type="radio"
              name="pinMode"
              value="ENABLED"
              [checked]="selectedMode === 'ENABLED'"
              (change)="onModeChange('ENABLED')"
              [disabled]="submitting"
            />
            <div class="radio-text">
              <span class="radio-label">Requerir PIN de 6 dígitos</span>
              <span class="radio-desc">Solo los invitados con el código numérico podrán ingresar.</span>
            </div>
          </label>

          <label class="radio-option" [class.selected]="selectedMode === 'DISABLED'">
            <input
              type="radio"
              name="pinMode"
              value="DISABLED"
              [checked]="selectedMode === 'DISABLED'"
              (change)="onModeChange('DISABLED')"
              [disabled]="submitting"
            />
            <div class="radio-text">
              <span class="radio-label">Acceso directo sin PIN</span>
              <span class="radio-desc">Cualquiera con el enlace o QR podrá acceder inmediatamente.</span>
            </div>
          </label>
        </div>

        <div *ngIf="selectedMode === 'ENABLED'" class="pin-input-group">
          <label for="newPinField" class="field-label">Nuevo PIN (6 dígitos numéricos)</label>
          <input
            id="newPinField"
            name="newPin"
            type="password"
            inputmode="numeric"
            pattern="[0-9]*"
            maxlength="6"
            [value]="newPinValue"
            (input)="onPinInput($event)"
            [disabled]="submitting"
            placeholder="••••••"
            class="pin-field"
            [attr.aria-describedby]="errorMessage ? 'pin-error' : null"
          />
        </div>

        <div *ngIf="errorMessage" id="pin-error" class="error-banner" role="alert" aria-live="polite">
          {{ errorMessage }}
        </div>

        <div *ngIf="successMessage" class="success-banner" role="status" aria-live="polite">
          {{ successMessage }}
        </div>

        <button
          type="button"
          class="apply-btn"
          (click)="applyChanges()"
          [disabled]="isApplyDisabled"
        >
          <span *ngIf="!submitting">Guardar configuración de PIN</span>
          <span *ngIf="submitting" aria-live="assertive">Aplicando cambios...</span>
        </button>
      </div>
    </section>
  `,
  styles: [`
    .settings-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    .card-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: #1a202c;
      margin: 0;
    }
    .status-indicator {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.25rem 0.625rem;
      border-radius: 9999px;
    }
    .pin-active {
      background: #c6f6d5;
      color: #22543d;
    }
    .pin-inactive {
      background: #edf2f7;
      color: #4a5568;
    }
    .revocation-warning {
      background: #fffaf0;
      border: 1px solid #fbd38d;
      color: #744210;
      border-radius: 8px;
      padding: 0.75rem 1rem;
      font-size: 0.875rem;
      line-height: 1.4;
      margin-bottom: 1.25rem;
    }
    .mode-selection {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-bottom: 1.25rem;
    }
    .radio-option {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .radio-option.selected {
      border-color: #3182ce;
      background: #ebf8ff;
    }
    .radio-option input {
      margin-top: 3px;
      accent-color: #3182ce;
    }
    .radio-text {
      display: flex;
      flex-direction: column;
    }
    .radio-label {
      font-weight: 600;
      color: #2d3748;
      font-size: 0.9375rem;
    }
    .radio-desc {
      font-size: 0.8125rem;
      color: #718096;
    }
    .pin-input-group {
      margin-bottom: 1.25rem;
    }
    .field-label {
      display: block;
      font-size: 0.875rem;
      font-weight: 600;
      color: #2d3748;
      margin-bottom: 0.5rem;
    }
    .pin-field {
      width: 100%;
      height: 44px;
      font-size: 1.25rem;
      letter-spacing: 0.25rem;
      border: 2px solid #cbd5e0;
      border-radius: 8px;
      padding: 0 0.75rem;
      box-sizing: border-box;
      outline: none;
    }
    .pin-field:focus {
      border-color: #3182ce;
      box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.3);
    }
    .error-banner {
      background: #fff5f5;
      color: #c53030;
      border: 1px solid #feb2b2;
      border-radius: 6px;
      padding: 0.5rem 0.75rem;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }
    .success-banner {
      background: #f0fff4;
      color: #276749;
      border: 1px solid #9ae6b4;
      border-radius: 6px;
      padding: 0.5rem 0.75rem;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }
    .apply-btn {
      min-height: 44px;
      padding: 0 1.25rem;
      background: #3182ce;
      color: #ffffff;
      font-weight: 600;
      border: none;
      border-radius: 8px;
      cursor: pointer;
    }
    .apply-btn:disabled {
      background: #a0aec0;
      cursor: not-allowed;
    }
  `]
})
export class EventAccessSettingsComponent {
  @Input() settings: EventAccessSettings | null = null;
  @Input() submitting = false;
  @Input() errorMessage: string | null = null;
  @Input() successMessage: string | null = null;
  @Output() updatePin = new EventEmitter<UpdatePinCommandPayload>();

  selectedMode: 'ENABLED' | 'DISABLED' = 'DISABLED';
  newPinValue = '';

  ngOnInit(): void {
    if (this.settings?.pinEnabled) {
      this.selectedMode = 'ENABLED';
    }
  }

  onModeChange(mode: 'ENABLED' | 'DISABLED'): void {
    this.selectedMode = mode;
  }

  onPinInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.newPinValue = target?.value ?? '';
  }

  get isApplyDisabled(): boolean {
    if (this.submitting) return true;
    if (this.selectedMode === 'ENABLED') {
      return !/^\d{6}$/.test(this.newPinValue.trim());
    }
    return false;
  }

  applyChanges(): void {
    if (this.isApplyDisabled) return;

    if (this.selectedMode === 'ENABLED') {
      this.updatePin.emit({
        action: 'CHANGE_PIN',
        newPin: this.newPinValue.trim()
      });
    } else {
      this.updatePin.emit({
        action: 'DISABLE_PIN'
      });
    }
  }
}
