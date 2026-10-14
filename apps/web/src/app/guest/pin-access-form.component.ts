import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'el-pin-access-form',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="pin-form-container" aria-labelledby="pin-form-heading">
      <div class="lock-icon-badge" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#e11d74" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
      </div>

      <h2 id="pin-form-heading" class="pin-heading">Evento protegido con PIN</h2>
      <p class="pin-instruction">Ingresa el código numérico de 6 dígitos proporcionado por el organizador para acceder.</p>

      <form (submit)="onSubmit($event)" class="form-layout" novalidate>
        <div class="field-wrap">
          <label for="pinInput" class="pin-label">PIN de acceso (6 dígitos)</label>
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
            [class.has-error]="Boolean(errorMessage)"
            [attr.aria-invalid]="errorMessage ? 'true' : 'false'"
            [attr.aria-describedby]="errorMessage ? 'pinInput-error' : null"
            placeholder="••••••"
          />
          @if (errorMessage) {
            <p id="pinInput-error" class="pin-error-text" role="alert">
              {{ errorMessage }}
            </p>
          }
        </div>

        <button
          type="submit"
          class="pin-submit-btn"
          [disabled]="submitting || !isValidPin"
          aria-label="Acceder al evento con PIN"
        >
          {{ submitting ? 'Verificando...' : 'Ingresar al evento' }}
        </button>
      </form>
    </section>
  `,
  styles: [`
    .pin-form-container {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 24px;
      padding: 1.75rem 1.25rem;
      max-width: 420px;
      margin: 1rem auto;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.06);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      font-family: inherit;
    }
    .lock-icon-badge {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: #fdf2f8;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 1rem;
      border: 2px solid #fbcfe8;
    }
    .pin-heading {
      font-size: 1.25rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 0.5rem;
    }
    .pin-instruction {
      font-size: 0.875rem;
      color: #64748b;
      line-height: 1.5;
      margin: 0 0 1.5rem;
      max-width: 320px;
    }
    .form-layout {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .field-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
    }
    .pin-label {
      font-size: 0.8125rem;
      font-weight: 600;
      color: #475569;
    }
    .pin-input {
      width: 100%;
      max-width: 280px;
      height: 54px;
      font-size: 1.75rem;
      text-align: center;
      letter-spacing: 0.6rem;
      font-weight: 700;
      border: 2px solid #cbd5e1;
      border-radius: 14px;
      padding: 0 0.75rem;
      box-sizing: border-box;
      outline: none;
      background: #f8fafc;
      color: #0f172a;
      transition: all 0.2s ease;
    }
    .pin-input:focus {
      border-color: #e11d74;
      background: #ffffff;
      box-shadow: 0 0 0 4px rgba(225, 29, 116, 0.15);
    }
    .pin-input.has-error {
      border-color: #e11d48;
      background: #fff1f2;
    }
    .pin-error-text {
      font-size: 0.8125rem;
      color: #e11d48;
      margin: 0.25rem 0 0;
      font-weight: 600;
    }
    .pin-submit-btn {
      width: 100%;
      min-height: 50px;
      border-radius: 14px;
      background: linear-gradient(135deg, #e11d74 0%, #ec4899 100%);
      border: none;
      color: #ffffff;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 8px 18px rgba(225, 29, 116, 0.35);
      transition: all 0.2s ease;
    }
    .pin-submit-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 10px 22px rgba(225, 29, 116, 0.45);
    }
    .pin-submit-btn:disabled {
      background: #cbd5e1;
      box-shadow: none;
      cursor: not-allowed;
      color: #64748b;
    }
  `]
})
export class PinAccessFormComponent {
  @Input() submitting = false;
  @Input() errorMessage: string | null = null;
  @Output() pinSubmit = new EventEmitter<string>();

  pinValue = '';
  Boolean = Boolean;

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
