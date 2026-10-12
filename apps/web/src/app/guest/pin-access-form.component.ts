import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'el-pin-access-form',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="pin-form-container" aria-labelledby="pin-form-heading">
      <h2 id="pin-form-heading" class="pin-heading">Evento protegido con PIN</h2>
      <p class="pin-instruction">Ingresa el código numérico de 6 dígitos proporcionado por el organizador para acceder.</p>

      <form (submit)="onSubmit($event)" class="form-layout" novalidate>
        <div class="field-group">
          <label for="pinInput" class="field-label">PIN de acceso (6 dígitos)</label>
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
            [attr.aria-describedby]="errorMessage ? 'pin-error' : null"
            placeholder="••••••"
          />
        </div>

        <div *ngIf="errorMessage" id="pin-error" class="error-message" role="alert" aria-live="polite">
          {{ errorMessage }}
        </div>

        <button
          type="submit"
          class="submit-button"
          [disabled]="submitting || !isValidPin"
          aria-label="Acceder al evento con PIN"
        >
          <span *ngIf="!submitting">Ingresar al evento</span>
          <span *ngIf="submitting" aria-live="assertive">Verificando...</span>
        </button>
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
    .field-group {
      margin-bottom: 1rem;
    }
    .field-label {
      display: block;
      font-size: 0.875rem;
      font-weight: 600;
      color: #2d3748;
      margin-bottom: 0.5rem;
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
    .error-message {
      background: #fff5f5;
      color: #c53030;
      border: 1px solid #feb2b2;
      border-radius: 6px;
      padding: 0.5rem 0.75rem;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }
    .submit-button {
      width: 100%;
      min-height: 48px;
      background: #3182ce;
      color: #ffffff;
      font-size: 1rem;
      font-weight: 600;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .submit-button:hover:not(:disabled) {
      background: #2b6cb0;
    }
    .submit-button:disabled {
      background: #a0aec0;
      cursor: not-allowed;
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
