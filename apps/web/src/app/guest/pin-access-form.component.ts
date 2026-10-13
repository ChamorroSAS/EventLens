import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonComponent, FormActionsComponent, FormFieldComponent } from '../shared/ui/index.js';

@Component({
  selector: 'el-pin-access-form',
  standalone: true,
  imports: [ButtonComponent, FormActionsComponent, FormFieldComponent],
  template: `
    <section class="pin-form-container" aria-labelledby="pin-form-heading">
      <h2 id="pin-form-heading" class="pin-heading">Evento protegido con PIN</h2>
      <p class="pin-instruction">Ingresa el código numérico de 6 dígitos proporcionado por el organizador para acceder.</p>

      <form (submit)="onSubmit($event)" class="form-layout" novalidate>
        <eventlens-form-field
          label="PIN de acceso (6 dígitos)"
          inputId="pinInput"
          [required]="true"
          [errorText]="errorMessage ?? ''"
        >
          <input
            id="pinInput"
            name="pin"
            type="password"
            inputmode="numeric"
            pattern="[0-9]*"
            maxlength="6"
            [value]="pinValue"
            (input)="onPinInput($event)"
            [disabled]="submitting"
            required
            autocomplete="one-time-code"
            class="pin-input"
            [attr.aria-invalid]="errorMessage ? 'true' : 'false'"
            [attr.aria-describedby]="errorMessage ? 'pinInput-error' : null"
            placeholder="••••••"
          />
        </eventlens-form-field>

        <eventlens-form-actions>
          <eventlens-button
            type="submit"
            variant="primary"
            size="large"
            [block]="true"
            [disabled]="submitting || !isValidPin"
            [loading]="submitting"
            ariaLabel="Acceder al evento con PIN"
          >
            {{ submitting ? 'Verificando...' : 'Ingresar al evento' }}
          </eventlens-button>
        </eventlens-form-actions>
      </form>
    </section>
  `,
  styles: [`
    .pin-form-container {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 1.5rem;
      max-width: 400px;
      margin: 0 auto;
    }
    .pin-heading {
      font-size: 1.25rem;
      font-weight: 700;
      color: #1a202c;
      margin-bottom: 0.5rem;
    }
    .pin-instruction {
      font-size: 0.875rem;
      color: #4a5568;
      margin-bottom: 1.25rem;
    }
    .form-layout {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    eventlens-button {
      flex: 1;
    }
    .pin-input {
      width: 100%;
      height: 48px;
      font-size: 1.5rem;
      text-align: center;
      letter-spacing: 0.5rem;
      border: 2px solid #cbd5e0;
      border-radius: 8px;
      padding: 0 0.75rem;
      box-sizing: border-box;
      outline: none;
    }
    .pin-input:focus {
      border-color: #3182ce;
      box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.3);
    }
  `]
})
export class PinAccessFormComponent {
  @Input() submitting = false;
  @Input() errorMessage: string | null = null;
  @Output() pinSubmit = new EventEmitter<string>();

  pinValue = '';

  get isValidPin(): boolean {
    return /^\d{6}$/.test(this.pinValue.trim());
  }

  onPinInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.pinValue = input.value;
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    if (this.isValidPin && !this.submitting) {
      this.pinSubmit.emit(this.pinValue.trim());
    }
  }
}
