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
            <input
              id="organizer-login-password"
              name="password"
              type="password"
              autocomplete="current-password"
              required
              [value]="password()"
              [disabled]="isSubmitting()"
              [attr.aria-invalid]="hasFieldValidationError() ? 'true' : null"
              [attr.aria-describedby]="errorMessage() ? 'organizer-login-error' : null"
              (input)="onPasswordInput($event)"
            />
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
        max-width: 28rem;
        margin: 2.5rem auto;
        padding: 0 1.25rem;
        font-family: 'Manrope', system-ui, sans-serif;
        color: #0f172a;
      }
      .el-auth-card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 1rem;
        padding: 2rem 1.5rem;
        box-shadow: 0 4px 16px rgba(15, 23, 42, 0.05);
      }
      .el-auth-eyebrow {
        margin: 0 0 0.5rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: #1d4ed8;
      }
      .el-auth-header h1 {
        margin: 0 0 0.5rem;
        font-size: 1.75rem;
        font-weight: 700;
        line-height: 1.25;
      }
      .el-auth-subtitle {
        margin: 0 0 1.5rem;
        font-size: 0.95rem;
        line-height: 1.5;
        color: #475569;
      }
      .el-inline-message--error {
        margin-bottom: 1rem;
        padding: 0.75rem 1rem;
        border-radius: 0.5rem;
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #991b1b;
        font-size: 0.9rem;
        line-height: 1.4;
      }
      .el-form-field {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
        margin-bottom: 1rem;
      }
      .el-form-field label {
        font-size: 0.9rem;
        font-weight: 500;
        color: #1e293b;
      }
      .el-form-field input {
        min-height: 2.75rem;
        padding: 0.625rem 0.75rem;
        border: 1px solid #cbd5e1;
        border-radius: 0.5rem;
        font-family: inherit;
        font-size: 1rem;
        color: #0f172a;
      }
      .el-form-field input:focus-visible {
        outline: 2px solid #2563eb;
        outline-offset: 2px;
      }
      .el-form-actions {
        margin-top: 1.25rem;
      }
      .el-btn--primary {
        width: 100%;
        min-height: 2.75rem;
        padding: 0.75rem 1.25rem;
        border: none;
        border-radius: 0.5rem;
        background: #2563eb;
        color: #ffffff;
        font-family: inherit;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
      }
      .el-btn--primary:disabled {
        opacity: 0.7;
        cursor: not-allowed;
      }
      .el-auth-footer {
        margin-top: 1.5rem;
        padding-top: 1rem;
        border-top: 1px solid #e2e8f0;
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 0.75rem;
      }
      .el-link-secondary {
        display: inline-flex;
        align-items: center;
        min-height: 2.75rem;
        color: #1d4ed8;
        font-size: 0.9rem;
        font-weight: 600;
        text-decoration: underline;
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
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly hasFieldValidationError = signal(false);

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
