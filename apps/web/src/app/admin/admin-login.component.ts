import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { canonicalizeAdminReturnUrl } from '../navigation/return-url.canonicalizer';
import { AdminSessionService } from './admin-session.service.js';

@Component({
  selector: 'eventlens-admin-login',
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="el-admin-login-entry" aria-labelledby="admin-login-heading">
      <div class="el-admin-login-card">
        <div class="el-auth-logo">
          <img
            src="assets/branding/phoeve/logo-primary.png"
            alt="Phoeve"
            class="auth-brand-logo"
            width="120"
            height="40"
          />
        </div>

        <header class="el-admin-login-header">
          <div class="el-admin-badge-container">
            <span class="el-admin-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
              Consola Administrativa
            </span>
          </div>
          <h1 id="admin-login-heading" tabindex="-1">Acceso administrativo</h1>
          <p class="el-admin-login-subtitle">
            Ingreso seguro exclusivo para operadores y soporte de Phoeve.
          </p>
        </header>

        <form
          class="el-admin-login-form"
          (submit)="onSubmit($event)"
          novalidate
          aria-labelledby="admin-login-heading"
        >
          @if (errorMessage(); as errorText) {
            <div
              id="admin-login-error"
              role="alert"
              aria-live="assertive"
              class="el-inline-message el-inline-message--error"
            >
              {{ errorText }}
            </div>
          }
          @if (session.announcement(); as announcement) {
            <p class="el-inline-message" role="status">{{ announcement }}</p>
          }

          <div class="el-form-field">
            <label for="admin-login-identifier">Identificador administrativo</label>
            <input
              id="admin-login-identifier"
              name="identifier"
              type="text"
              autocomplete="username"
              placeholder="ej. operador-1"
              required
              [value]="identifier()"
              [disabled]="isSubmitting()"
              (input)="onIdentifierInput($event)"
            />
          </div>

          <div class="el-form-field">
            <label for="admin-login-secret">Credencial de acceso</label>
            <div class="el-password-wrap">
              <input
                id="admin-login-secret"
                name="secret"
                [type]="showSecret() ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="••••••••••••"
                required
                [value]="secret()"
                [disabled]="isSubmitting()"
                (input)="onSecretInput($event)"
              />
              <button
                type="button"
                class="el-btn-password-toggle"
                (click)="toggleShowSecret()"
                [attr.aria-label]="showSecret() ? 'Ocultar credencial' : 'Ver credencial'"
                tabindex="-1"
              >
                @if (showSecret()) {
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                } @else {
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                }
              </button>
            </div>
          </div>

          <div class="el-admin-login-actions">
            <button
              id="admin-login-submit-btn"
              type="submit"
              class="el-btn el-btn--primary"
              [disabled]="isSubmitting() || !identifier().trim() || !secret()"
            >
              {{ isSubmitting() ? 'Iniciando sesión…' : 'Iniciar sesión' }}
            </button>
          </div>
        </form>

        <footer class="el-auth-footer">
          <a href="/" class="el-link-secondary" (click)="onReturnHome($event)">
            Volver al inicio
          </a>
          @if (session.logoutUncertainty()) {
            <button
              type="button"
              class="el-link-secondary el-btn-link"
              (click)="retryLogout()"
              [disabled]="isSubmitting()"
            >
              Reintentar cierre de sesión
            </button>
          }
        </footer>
      </div>
    </main>
  `,
  styles: [
    `
      .el-admin-login-entry {
        min-height: 100vh;
        width: 100%;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem 1.25rem;
        font-family: 'Manrope', system-ui, sans-serif;
        color: #0f172a;
        background-color: #0b1120;
        background-image: url('/assets/branding/phoeve/admin-login-background.jpg');
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        background-attachment: fixed;
      }
      .el-admin-login-card {
        width: 100%;
        max-width: 440px;
        background: rgba(255, 255, 255, 0.94);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.85);
        border-radius: 1.25rem;
        padding: 2.25rem 2rem;
        box-shadow: 0 20px 40px -15px rgba(11, 17, 32, 0.35), 0 0 1px rgba(11, 17, 32, 0.15);
        box-sizing: border-box;
      }
      .el-auth-logo {
        display: flex;
        justify-content: center;
        align-items: center;
        margin-bottom: 1.25rem;
      }
      .auth-brand-logo {
        block-size: 36px;
        inline-size: auto;
        aspect-ratio: 2172 / 724;
        object-fit: contain;
      }
      .el-admin-badge-container {
        display: flex;
        justify-content: center;
        margin-bottom: 0.75rem;
      }
      .el-admin-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        color: #1d4ed8;
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.01em;
      }
      .el-admin-login-header {
        text-align: center;
        margin-bottom: 1.5rem;
      }
      .el-admin-login-header h1 {
        font-size: 1.625rem;
        font-weight: 700;
        margin: 0 0 0.5rem 0;
        color: #0f172a;
        line-height: 1.25;
      }
      .el-admin-login-subtitle {
        font-size: 0.875rem;
        color: #64748b;
        margin: 0;
        line-height: 1.45;
      }
      .el-inline-message--error {
        margin-bottom: 1rem;
        padding: 0.75rem 1rem;
        border-radius: 0.5rem;
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #991b1b;
        font-size: 0.875rem;
        line-height: 1.4;
      }
      .el-inline-message {
        margin-bottom: 1rem;
        padding: 0.75rem 1rem;
        border-radius: 0.5rem;
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        color: #1e40af;
        font-size: 0.875rem;
        line-height: 1.4;
      }
      .el-admin-login-form {
        display: flex;
        flex-direction: column;
        gap: 1.125rem;
      }
      .el-form-field {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
      }
      .el-form-field label {
        font-size: 0.875rem;
        font-weight: 600;
        color: #1e293b;
      }
      .el-form-field input {
        min-height: 2.75rem;
        padding: 0.625rem 0.875rem;
        border: 1px solid #e2e8f0;
        border-radius: 0.5rem;
        background-color: #f8fafc;
        font-family: inherit;
        font-size: 0.95rem;
        color: #0f172a;
        transition: all 0.15s ease;
        box-sizing: border-box;
      }
      .el-form-field input::placeholder {
        color: #94a3b8;
      }
      .el-form-field input:focus-visible {
        outline: none;
        border-color: #2563eb;
        background-color: #ffffff;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
      }
      .el-password-wrap {
        position: relative;
        display: flex;
        align-items: center;
      }
      .el-password-wrap input {
        width: 100%;
        padding-right: 2.75rem;
      }
      .el-btn-password-toggle {
        position: absolute;
        right: 0.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        border: none;
        background: transparent;
        color: #94a3b8;
        border-radius: 0.375rem;
        cursor: pointer;
        transition: color 0.15s ease;

        &:hover {
          color: #475569;
        }

        &:focus-visible {
          outline: 2px solid #2563eb;
          outline-offset: 1px;
        }
      }
      .el-admin-login-actions {
        margin-top: 0.5rem;
      }
      .el-btn--primary {
        width: 100%;
        min-height: 2.875rem;
        padding: 0.75rem 1.25rem;
        border: none;
        border-radius: 0.5rem;
        background: #2563eb;
        color: #ffffff;
        font-family: inherit;
        font-size: 0.95rem;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);
        transition: all 0.15s ease;

        &:hover:not(:disabled) {
          background: #1d4ed8;
          box-shadow: 0 4px 8px rgba(37, 99, 235, 0.25);
        }

        &:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        &:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.35);
        }
      }
      .el-auth-footer {
        margin-top: 1.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1.25rem;
      }
      .el-link-secondary {
        display: inline-flex;
        align-items: center;
        color: #1e293b;
        font-size: 0.8125rem;
        font-weight: 500;
        text-decoration: underline;
        text-underline-offset: 3px;
        transition: color 0.15s ease;

        &:hover {
          color: #2563eb;
        }
      }
      .el-btn-link {
        background: transparent;
        border: none;
        padding: 0;
        cursor: pointer;
        font-family: inherit;
      }
    `
  ]
})
export class AdminLoginComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router, { optional: true });
  private readonly route = inject(ActivatedRoute, { optional: true });
  readonly session = inject(AdminSessionService);

  readonly identifier = signal<string>('');
  readonly secret = signal<string>('');
  readonly showSecret = signal<boolean>(false);
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  private alive = true;
  private submissionGeneration = 0;

  toggleShowSecret(): void {
    this.showSecret.update(v => !v);
  }

  async ngOnInit(): Promise<void> {
    if (this.session.logoutUncertainty()) {
      this.errorMessage.set(this.session.logoutUncertainty());
      return;
    }
    const snapshot = await this.session.refreshSession();
    if (!this.alive || this.session.logoutUncertainty()) return;
    if (snapshot.state === 'ADMIN_ACTIVE') {
      await this.router?.navigateByUrl(this.returnDestination(), { replaceUrl: true });
    } else if (snapshot.state === 'UNAVAILABLE') {
      this.errorMessage.set('El acceso administrativo no está disponible. Reintenta más tarde.');
    }
  }

  private returnDestination(): string {
    return canonicalizeAdminReturnUrl(this.route?.snapshot.queryParamMap.get('returnUrl'));
  }

  onIdentifierInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.identifier.set(input.value);
    this.errorMessage.set(null);
  }

  onSecretInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.secret.set(input.value);
    this.errorMessage.set(null);
  }

  onReturnHome(event: Event): void {
    event.preventDefault();
    this.submissionGeneration++;
    this.secret.set('');
    this.errorMessage.set(null);
    if (this.router) {
      void this.router.navigateByUrl('/');
    }
  }

  async retryLogout(): Promise<void> {
    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    const submission = ++this.submissionGeneration;
    try {
      const outcome = await this.session.retryLogout();
      if (!this.alive || submission !== this.submissionGeneration) return;
      if (outcome.status === 'UNCERTAIN') this.errorMessage.set(outcome.message);
    } finally {
      if (this.alive && submission === this.submissionGeneration) this.isSubmitting.set(false);
    }
  }

  async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.isSubmitting()) return;

    const trimmedId = this.identifier().trim();
    const currentSecret = this.secret();
    if (!trimmedId || !currentSecret) {
      this.errorMessage.set('Completa tu identificador y credencial de acceso.');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    const submission = ++this.submissionGeneration;

    try {
      const outcome = await this.session.login(
        { identifier: trimmedId, secret: currentSecret },
        this.route?.snapshot.queryParamMap.get('returnUrl')
      );
      if (!this.alive || submission !== this.submissionGeneration) return;
      if (outcome.ok) {
        await this.router?.navigateByUrl(outcome.returnDestination, { replaceUrl: true });
        return;
      }
      this.errorMessage.set(outcome.message);
    } finally {
      if (this.alive && submission === this.submissionGeneration) {
        this.secret.set('');
        this.isSubmitting.set(false);
      }
    }
  }

  ngOnDestroy(): void {
    this.alive = false;
    this.submissionGeneration++;
    this.secret.set('');
  }
}
