import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { canonicalizeAdminReturnUrl } from '../navigation/return-url.canonicalizer';

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
      background: #090d16;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .el-admin-login-card {
      width: 100%;
      max-width: 28rem;
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 0.75rem;
      padding: 2rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .el-admin-badge {
      display: inline-block;
      background: #334155;
      color: #cbd5e1;
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
      color: #f8fafc;
      letter-spacing: -0.025em;
    }
    .el-admin-login-subtitle {
      font-size: 0.875rem;
      color: #94a3b8;
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
      color: #cbd5e1;
    }
    .el-form-field input {
      padding: 0.625rem 0.75rem;
      border-radius: 0.375rem;
      border: 1px solid #334155;
      background: #090d16;
      color: #f8fafc;
      font-size: 0.875rem;
    }
    .el-form-field input:focus {
      outline: 2px solid #3b82f6;
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
      background: #2563eb;
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
      color: #94a3b8;
      border: 1px solid #334155;
      border-radius: 0.375rem;
      font-weight: 500;
      font-size: 0.875rem;
      text-align: center;
      text-decoration: none;
      cursor: pointer;
    }
    .el-inline-message--error {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
      padding: 0.75rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
    }
  `]
})
export class AdminLoginComponent {
  private readonly router = inject(Router, { optional: true });

  readonly identifier = signal<string>('');
  readonly secret = signal<string>('');
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

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
    if (this.router) {
      void this.router.navigateByUrl('/');
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

    try {
      // In EL-TK-223, administration backend activation is BLOCKED by EL-TK-222
      // Fail closed gracefully without exposing internal infrastructure details
      this.errorMessage.set('El acceso administrativo no está disponible. Reintenta más tarde.');
    } finally {
      this.secret.set('');
      this.isSubmitting.set(false);
    }
  }
}
