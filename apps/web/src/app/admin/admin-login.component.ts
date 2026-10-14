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
        <header class="el-admin-login-header">
          <span class="el-admin-badge">Consola Administrativa</span>
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
              required
              [value]="identifier()"
              [disabled]="isSubmitting()"
              (input)="onIdentifierInput($event)"
            />
          </div>

          <div class="el-form-field">
            <label for="admin-login-secret">Credencial de acceso</label>
            <input
              id="admin-login-secret"
              name="secret"
              type="password"
              autocomplete="current-password"
              required
              [value]="secret()"
              [disabled]="isSubmitting()"
              (input)="onSecretInput($event)"
            />
          </div>

          <div class="el-admin-login-actions">
            <button
              id="admin-login-submit-btn"
              type="submit"
              class="btn-primary"
              [disabled]="isSubmitting() || !identifier().trim() || !secret()"
            >
              {{ isSubmitting() ? 'Iniciando sesión…' : 'Iniciar sesión' }}
            </button>

            <a href="/" class="btn-secondary" (click)="onReturnHome($event)">
              Volver al inicio
            </a>
            @if (session.logoutUncertainty()) {
              <button type="button" class="btn-secondary" (click)="retryLogout()" [disabled]="isSubmitting()">
                Reintentar cierre de sesión
              </button>
            }
          </div>
        </form>
      </div>
    </main>
  `,
  styles: [`
    .el-admin-login-entry {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      background: var(--el-color-background);
      color: var(--el-color-text);
      font-family: var(--el-font-family);
    }
    .el-admin-login-card {
      width: 100%;
      max-width: 28rem;
      background: var(--el-color-surface);
      border: 1px solid var(--el-color-border);
      border-radius: 0.75rem;
      padding: 2rem;
      box-shadow: var(--el-elevation-subtle);
    }
    .el-admin-badge {
      display: inline-block;
      background: var(--el-color-accent-soft);
      color: var(--el-color-text);
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
    }
    .el-admin-login-header h1 {
      font-size: 1.5rem;
      font-weight: 700;
      margin: 0 0 0.5rem 0;
      color: var(--el-color-text);
      letter-spacing: -0.025em;
    }
    .el-admin-login-subtitle {
      font-size: 0.875rem;
      color: var(--el-color-text-secondary);
      margin: 0 0 1.5rem 0;
      line-height: 1.4;
    }
    .el-admin-login-form {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .el-form-field {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }
    .el-form-field label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--el-color-text);
    }
    .el-form-field input {
      padding: 0.625rem 0.75rem;
      border-radius: 0.375rem;
      border: 1px solid var(--el-color-border-strong);
      background: var(--el-color-surface);
      color: var(--el-color-text);
      font-size: 0.875rem;
    }
    .el-form-field input:focus {
      outline: 2px solid var(--el-color-focus);
      outline-offset: 1px;
    }
    .el-admin-login-actions {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 0.5rem;
    }
    .btn-primary {
      padding: 0.625rem 1rem;
      background: var(--el-color-primary);
      color: #ffffff;
      border: none;
      border-radius: 0.375rem;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      text-align: center;
    }
    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-secondary {
      padding: 0.625rem 1rem;
      background: transparent;
      color: var(--el-color-text);
      border: 1px solid var(--el-color-border-strong);
      border-radius: 0.375rem;
      font-weight: 500;
      font-size: 0.875rem;
      text-align: center;
      text-decoration: none;
      cursor: pointer;
    }
    .el-inline-message--error {
      background: var(--el-color-danger-soft);
      border: 1px solid var(--el-color-danger);
      color: var(--el-color-text);
      padding: 0.75rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
    }
  `]
})
export class AdminLoginComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router, { optional: true });
  private readonly route = inject(ActivatedRoute, { optional: true });
  readonly session = inject(AdminSessionService);

  readonly identifier = signal<string>('');
  readonly secret = signal<string>('');
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  private alive = true;
  private submissionGeneration = 0;

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
