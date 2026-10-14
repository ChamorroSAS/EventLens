import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import {
  APPROVED_PUBLIC_ENTRY_PATHS,
  CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA,
  type PublicEntryRouteDescriptor
} from '../navigation/public-entry-routes.contract';
import { PublicEntryRouterService } from '../navigation/public-entry-router.service';
import { OrganizerSessionService } from '../organizer-session.service';

@Component({
  selector: 'eventlens-organizer-login',
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="el-auth-entry" aria-labelledby="organizer-login-heading">
      <div class="el-auth-card">
        <div class="el-auth-logo">
          <img
            src="assets/branding/phoeve/logo-primary.png"
            alt="Phoeve"
            class="auth-brand-logo"
            width="120"
            height="40"
          />
        </div>

        <header class="el-auth-header">
          <p class="el-auth-eyebrow">Acceso de organizadores</p>
          <h1 id="organizer-login-heading" tabindex="-1">Iniciar sesión</h1>
          <p class="el-auth-subtitle">
            Ingresa con tu cuenta de organizador para acceder a tus eventos o administrar tu cuenta.
          </p>
        </header>

        <form
          class="el-login-form"
          (submit)="onSubmit($event)"
          novalidate
          aria-labelledby="organizer-login-heading"
        >
          @if (errorMessage(); as errorText) {
            <div
              id="organizer-login-error"
              role="alert"
              aria-live="assertive"
              class="el-inline-message el-inline-message--error"
            >
              {{ errorText }}
            </div>
          }

          <div class="el-form-field">
            <label for="organizer-login-email">Correo electrónico</label>
            <input
              id="organizer-login-email"
              name="email"
              type="email"
              autocomplete="email"
              placeholder="ejemplo@correo.com"
              required
              [value]="email()"
              [disabled]="isSubmitting()"
              [attr.aria-invalid]="hasFieldValidationError() ? 'true' : null"
              [attr.aria-describedby]="errorMessage() ? 'organizer-login-error' : null"
              (input)="onEmailInput($event)"
            />
          </div>

          <div class="el-form-field">
            <label for="organizer-login-password">Contraseña</label>
            <div class="el-password-wrap">
              <input
                id="organizer-login-password"
                name="password"
                [type]="showPassword() ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="••••••••••••"
                required
                [value]="password()"
                [disabled]="isSubmitting()"
                [attr.aria-invalid]="hasFieldValidationError() ? 'true' : null"
                [attr.aria-describedby]="errorMessage() ? 'organizer-login-error' : null"
                (input)="onPasswordInput($event)"
              />
              <button
                type="button"
                class="el-btn-password-toggle"
                (click)="toggleShowPassword()"
                [attr.aria-label]="showPassword() ? 'Ocultar contraseña' : 'Ver contraseña'"
                tabindex="-1"
              >
                @if (showPassword()) {
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

          <div class="el-form-actions">
            <button
              type="submit"
              class="el-btn el-btn--primary"
              [disabled]="isSubmitting()"
              [attr.aria-busy]="isSubmitting() ? 'true' : null"
            >
              {{ isSubmitting() ? 'Iniciando sesión…' : 'Iniciar sesión' }}
            </button>
          </div>
        </form>

        <footer class="el-auth-footer">
          <a
            class="el-link-secondary"
            [href]="homePath"
            (click)="onReturnHome($event)"
          >
            Volver al inicio
          </a>
          <a
            class="el-link-secondary"
            [href]="betaAccessPath"
            (click)="onNavigateBetaAccess($event)"
          >
            Solicitar acceso a la Beta
          </a>
        </footer>
      </div>
    </main>
  `,
  styles: [
    `
      .el-auth-entry {
        min-height: 100vh;
        width: 100%;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem 1.25rem;
        font-family: 'Manrope', system-ui, sans-serif;
        color: #0f172a;
        background-color: #f8fafc;
        background-image: url('/assets/branding/phoeve/login-background.jpg');
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        background-attachment: fixed;
      }
      .el-auth-card {
        width: 100%;
        max-width: 440px;
        background: rgba(255, 255, 255, 0.94);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.85);
        border-radius: 1.25rem;
        padding: 2.25rem 2rem;
        box-shadow: 0 20px 40px -15px rgba(15, 23, 42, 0.1), 0 0 1px rgba(15, 23, 42, 0.08);
        box-sizing: border-box;
      }
      .el-auth-logo {
        display: flex;
        justify-content: center;
        align-items: center;
        margin-bottom: 1.5rem;
      }
      .auth-brand-logo {
        block-size: 36px;
        inline-size: auto;
        aspect-ratio: 2172 / 724;
        object-fit: contain;
      }
      .el-auth-eyebrow {
        margin: 0 0 0.375rem;
        font-size: 0.875rem;
        font-weight: 500;
        color: #2563eb;
      }
      .el-auth-header h1 {
        margin: 0 0 0.5rem;
        font-size: 1.625rem;
        font-weight: 700;
        color: #0f172a;
        line-height: 1.25;
      }
      .el-auth-subtitle {
        margin: 0 0 1.5rem;
        font-size: 0.875rem;
        line-height: 1.45;
        color: #64748b;
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
      .el-form-field {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
        margin-bottom: 1.125rem;
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
      .el-form-actions {
        margin-top: 1.5rem;
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
        justify-content: space-between;
        gap: 0.75rem;
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
    `
  ]
})
export class OrganizerLoginComponent implements OnInit {
  private readonly sessionService = inject(OrganizerSessionService);
  private readonly router = inject(PublicEntryRouterService);

  readonly homePath = APPROVED_PUBLIC_ENTRY_PATHS.HOME;
  readonly betaAccessPath = APPROVED_PUBLIC_ENTRY_PATHS.BETA_ACCESS;

  readonly email = signal('');
  readonly password = signal('');
  readonly showPassword = signal(false);
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly hasFieldValidationError = signal(false);

  toggleShowPassword(): void {
    this.showPassword.update(v => !v);
  }

  async ngOnInit(): Promise<void> {
    const currentState = this.sessionService.state();
    if (currentState === 'ORGANIZER_ACTIVE') {
      const rawReturnUrl = this.router.queryParams()['returnUrl'];
      const target = this.sessionService.resolveAuthorizedReturnDestination(rawReturnUrl);
      void this.router.navigateByUrl(target, { replaceUrl: true });
      return;
    }
    if (currentState === 'ORGANIZER_RESTRICTED_DELETION') {
      void this.router.navigateByUrl(APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_ACCOUNT, { replaceUrl: true });
      return;
    }
    if (currentState === 'CHECKING') {
      try {
        const snap = await this.sessionService.refreshSessionProjection();
        if (snap.state === 'ORGANIZER_ACTIVE') {
          const rawReturnUrl = this.router.queryParams()['returnUrl'];
          const target = this.sessionService.resolveAuthorizedReturnDestination(rawReturnUrl);
          void this.router.navigateByUrl(target, { replaceUrl: true });
        } else if (snap.state === 'ORGANIZER_RESTRICTED_DELETION') {
          void this.router.navigateByUrl(APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_ACCOUNT, { replaceUrl: true });
        }
      } catch {
        // Ignora error transitorio de red al inicializar
      }
    }
  }

  onEmailInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.email.set(target?.value ?? '');
    if (this.hasFieldValidationError()) {
      this.hasFieldValidationError.set(false);
    }
  }

  onPasswordInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.password.set(target?.value ?? '');
    if (this.hasFieldValidationError()) {
      this.hasFieldValidationError.set(false);
    }
  }

  async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.isSubmitting()) {
      return;
    }

    const trimmedEmail = this.email().trim();
    const rawPassword = this.password();
    if (!trimmedEmail || !rawPassword) {
      this.hasFieldValidationError.set(true);
      this.errorMessage.set('Ingresa tu correo electrónico y tu contraseña para continuar.');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.hasFieldValidationError.set(false);

    try {
      const rawReturnUrl = this.router.queryParams()['returnUrl'];
      const outcome = await this.sessionService.login(
        {
          email: trimmedEmail,
          password: rawPassword
        },
        rawReturnUrl
      );

      if (outcome.ok) {
        this.password.set('');
        await this.router.navigateByUrl(outcome.returnDestination, { replaceUrl: true });
        return;
      }

      this.errorMessage.set(outcome.message);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  onReturnHome(event: Event): void {
    event.preventDefault();
    this.password.set('');
    this.errorMessage.set(null);
    void this.router.navigateByUrl(this.homePath);
  }

  onNavigateBetaAccess(event: Event): void {
    event.preventDefault();
    this.password.set('');
    this.errorMessage.set(null);
    void this.router.navigateByUrl(this.betaAccessPath);
  }
}

export const ORGANIZER_LOGIN_ROUTE_DESCRIPTOR: PublicEntryRouteDescriptor = Object.freeze({
  ...CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA.ORGANIZER_LOGIN,
  component: OrganizerLoginComponent
});
