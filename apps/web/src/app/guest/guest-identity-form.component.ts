import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'el-guest-identity-form',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="identity-card" aria-labelledby="identity-heading">
      <h3 id="identity-heading" class="identity-title">¿Cómo te gustaría identificarte?</h3>
      <p class="identity-desc">Tu nombre o apodo acompañará tus recuerdos para que el organizador sepa quién los compartió.</p>

      <form (submit)="onFormSubmit($event)" class="identity-form" novalidate>
        <div class="field-group">
          <label for="nicknameInput" class="field-label">Nombre o apodo</label>
          <input
            id="nicknameInput"
            name="nickname"
            type="text"
            [value]="nicknameValue"
            (input)="onNicknameInput($event)"
            [disabled]="submitting"
            required
            maxlength="60"
            class="nickname-input"
            [attr.aria-invalid]="errorMessage ? 'true' : 'false'"
            [attr.aria-describedby]="errorMessage ? 'nickname-error' : null"
            placeholder="Ej: Camila, Tío Pedro"
          />
          <span class="char-counter">{{ trimmedLength }}/60</span>
        </div>

        <div *ngIf="errorMessage" id="nickname-error" class="error-banner" role="alert" aria-live="polite">
          {{ errorMessage }}
        </div>

        <button
          type="submit"
          class="submit-button"
          [disabled]="!isValid || submitting"
        >
          <span *ngIf="!submitting">Guardar nombre y continuar</span>
          <span *ngIf="submitting" aria-live="assertive">Guardando...</span>
        </button>
      </form>
    </section>
  `,
  styles: [`
    .identity-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 1.5rem;
      max-width: 440px;
      margin: 0 auto;
    }
    .identity-title {
      font-size: 1.125rem;
      font-weight: 700;
      color: #1a202c;
      margin-bottom: 0.5rem;
    }
    .identity-desc {
      font-size: 0.875rem;
      color: #4a5568;
      margin-bottom: 1.25rem;
    }
    .field-group {
      position: relative;
      margin-bottom: 1rem;
    }
    .field-label {
      display: block;
      font-size: 0.875rem;
      font-weight: 600;
      color: #2d3748;
      margin-bottom: 0.5rem;
    }
    .nickname-input {
      width: 100%;
      height: 48px;
      font-size: 1rem;
      border: 2px solid #cbd5e0;
      border-radius: 8px;
      padding: 0 3.5rem 0 0.75rem;
      box-sizing: border-box;
      outline: none;
    }
    .nickname-input:focus {
      border-color: #3182ce;
      box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.3);
    }
    .char-counter {
      position: absolute;
      right: 0.75rem;
      top: 2.25rem;
      font-size: 0.75rem;
      color: #718096;
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
    }
    .submit-button:disabled {
      background: #a0aec0;
      cursor: not-allowed;
    }
  `]
})
export class GuestIdentityFormComponent {
  @Input() initialNickname = '';
  @Input() submitting = false;
  @Input() errorMessage: string | null = null;
  @Output() nicknameSaved = new EventEmitter<string>();

  nicknameValue = '';

  ngOnInit(): void {
    if (this.initialNickname) {
      this.nicknameValue = this.initialNickname;
    }
  }

  get trimmedLength(): number {
    return this.nicknameValue.trim().length;
  }

  get isValid(): boolean {
    const len = this.trimmedLength;
    return len >= 1 && len <= 60;
  }

  onNicknameInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.nicknameValue = target?.value ?? '';
  }

  onFormSubmit(event: Event): void {
    event.preventDefault();
    this.submitNickname();
  }

  submitNickname(): void {
    if (this.isValid && !this.submitting) {
      this.nicknameSaved.emit(this.nicknameValue.trim());
    }
  }
}
