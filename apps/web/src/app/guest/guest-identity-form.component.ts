import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'el-guest-identity-form',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="identity-screen-container" aria-labelledby="identity-heading">
      <!-- Top header bar with Back and Phoeve Logo -->
      <header class="top-nav-bar">
        <button
          type="button"
          class="nav-icon-btn"
          (click)="onBack()"
          aria-label="Volver"
          [disabled]="submitting"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>

        <div class="nav-logo-box">
          <img
            src="assets/branding/phoeve/logo-primary.png"
            alt="Phoeve"
            class="brand-logo"
          />
        </div>

        <div class="nav-spacer" aria-hidden="true"></div>
      </header>

      <!-- Avatar hero illustration with sparkles -->
      <div class="avatar-hero">
        <div class="sparkles-decorations" aria-hidden="true">
          <span class="sparkle sp-1">✦</span>
          <span class="sparkle sp-2">★</span>
          <span class="sparkle sp-3">✦</span>
        </div>
        <div class="avatar-circle">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
      </div>

      <h2 id="identity-heading" tabindex="-1" class="identity-title">¿Cómo quieres aparecer en este evento?</h2>
      <p class="identity-subtitle">Usaremos este nombre para identificar tus aportes.</p>

      <form (submit)="onFormSubmit($event)" class="identity-fields-form" novalidate>
        <!-- Field 1: Nombre * -->
        <div class="field-item">
          <label for="nicknameInput" class="field-label">
            Nombre o apodo <span class="required-star">*</span>
          </label>
          <div class="input-wrapper">
            <input
              id="nicknameInput"
              name="nickname"
              type="text"
              [value]="nicknameValue"
              (input)="onNicknameInput($event)"
              [disabled]="submitting"
              required
              maxlength="60"
              class="styled-text-input"
              [class.has-error]="Boolean(errorMessage)"
              [attr.aria-invalid]="errorMessage ? 'true' : 'false'"
              [attr.aria-describedby]="errorMessage ? 'nickname-error' : null"
              placeholder="Ej: Néstor, Camila, Tío Pedro"
            />
          </div>
          @if (errorMessage) {
            <p id="nickname-error" class="field-error-msg" role="alert">
              {{ errorMessage }}
            </p>
          }
        </div>

        <!-- Info pill callout -->
        <div class="info-pill-box" role="note">
          <div class="info-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </div>
          <span class="info-text">Este nombre será visible en la galería del evento.</span>
        </div>

        <!-- Primary Continue Button -->
        <button
          type="submit"
          class="submit-continue-btn"
          [disabled]="!isValid || submitting"
        >
          @if (!submitting) {
            <span>Continuar</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          } @else {
            <span aria-live="assertive">Guardando...</span>
          }
        </button>
      </form>
    </section>
  `,
  styles: [`
    .identity-screen-container {
      background: #ffffff;
      width: 100%;
      max-width: 440px;
      margin: 0 auto;
      border-radius: 28px;
      padding: 1.5rem 1.25rem 2rem;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.08);
      border: 1px solid #e2e8f0;
      display: flex;
      flex-direction: column;
      align-items: center;
      font-family: inherit;
    }
    @media (max-width: 480px) {
      .identity-screen-container {
        border-radius: 24px;
        padding: 1.25rem 1rem 1.75rem;
        box-shadow: none;
        border: none;
        background: transparent;
      }
    }
    .top-nav-bar {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.5rem;
    }
    .nav-icon-btn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #f1f5f9;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #475569;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .nav-icon-btn:hover {
      background: #e2e8f0;
      color: #0f172a;
    }
    .nav-logo-box {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .brand-logo {
      height: 28px;
      width: auto;
      object-fit: contain;
    }
    .nav-spacer {
      width: 40px;
    }

    /* Avatar Illustration */
    .avatar-hero {
      position: relative;
      width: 88px;
      height: 88px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 1rem;
    }
    .avatar-circle {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 22px rgba(168, 85, 247, 0.35);
      border: 3px solid #ffffff;
    }
    .sparkles-decorations {
      position: absolute;
      inset: -4px;
      pointer-events: none;
    }
    .sparkle {
      position: absolute;
      font-size: 15px;
      color: #f59e0b;
      font-weight: 800;
      animation: sparkleAnim 2.5s infinite alternate ease-in-out;
    }
    .sp-1 { top: -2px; right: 4px; color: #ec4899; font-size: 16px; }
    .sp-2 { bottom: 4px; left: -2px; color: #f59e0b; }
    .sp-3 { top: 22px; left: -8px; color: #8b5cf6; font-size: 12px; }
    @keyframes sparkleAnim {
      0% { transform: scale(0.85); opacity: 0.7; }
      100% { transform: scale(1.2); opacity: 1; }
    }

    /* Headings */
    .identity-title {
      font-size: 1.35rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 0.5rem;
      text-align: center;
      letter-spacing: -0.02em;
    }
    .identity-subtitle {
      font-size: 0.875rem;
      color: #64748b;
      margin: 0 0 1.75rem;
      text-align: center;
    }

    /* Form & Inputs */
    .identity-fields-form {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .field-item {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }
    .field-label {
      font-size: 0.875rem;
      font-weight: 700;
      color: #1e293b;
    }
    .required-star {
      color: #e11d48;
    }
    .optional-tag {
      font-weight: 400;
      color: #64748b;
      font-size: 0.8125rem;
    }
    .input-wrapper {
      position: relative;
    }
    .styled-text-input {
      width: 100%;
      height: 48px;
      font-size: 0.95rem;
      border: 1.5px solid #cbd5e1;
      border-radius: 12px;
      padding: 0 1rem;
      box-sizing: border-box;
      outline: none;
      background: #ffffff;
      color: #0f172a;
      transition: all 0.15s ease;
    }
    .styled-text-input:focus {
      border-color: #e11d74;
      box-shadow: 0 0 0 3px rgba(225, 29, 116, 0.2);
    }
    .styled-text-input.has-error {
      border-color: #e11d48;
      background: #fff1f2;
    }
    .field-error-msg {
      font-size: 0.8125rem;
      color: #e11d48;
      margin: 0.25rem 0 0;
      font-weight: 500;
    }

    /* Info Pill */
    .info-pill-box {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 12px;
      padding: 0.75rem 1rem;
      display: flex;
      align-items: center;
      gap: 0.625rem;
    }
    .info-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
    }
    .info-text {
      font-size: 0.8125rem;
      color: #1e40af;
      font-weight: 500;
      line-height: 1.4;
    }

    /* Submit CTA */
    .submit-continue-btn {
      width: 100%;
      min-height: 52px;
      border-radius: 14px;
      background: linear-gradient(135deg, #e11d74 0%, #ec4899 100%);
      border: none;
      color: #ffffff;
      font-size: 1rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      cursor: pointer;
      box-shadow: 0 8px 20px rgba(225, 29, 116, 0.35);
      transition: all 0.2s ease;
      margin-top: 0.5rem;
    }
    .submit-continue-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 10px 24px rgba(225, 29, 116, 0.45);
    }
    .submit-continue-btn:active:not(:disabled) {
      transform: translateY(0);
    }
    .submit-continue-btn:disabled {
      background: #cbd5e1;
      box-shadow: none;
      cursor: not-allowed;
      color: #64748b;
    }
  `]
})
export class GuestIdentityFormComponent implements OnInit {
  @Input() initialNickname = '';
  @Input() submitting = false;
  @Input() errorMessage: string | null = null;
  @Output() nicknameSaved = new EventEmitter<string>();
  @Output() back = new EventEmitter<void>();

  nicknameValue = '';

  Boolean = Boolean;

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

  onBack(): void {
    this.back.emit();
  }
}
