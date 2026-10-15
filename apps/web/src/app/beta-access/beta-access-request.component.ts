import { CommonModule } from '@angular/common';
import { Component, Injectable, inject, signal } from '@angular/core';
import { createEventLensClient } from '@eventlens/api-client';
import {
  APPROVED_PUBLIC_ENTRY_PATHS,
  CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA,
  type PublicEntryRouteDescriptor
} from '../navigation/public-entry-routes.contract';
import { PublicEntryRouterService } from '../navigation/public-entry-router.service';

export type BetaAccessSubmissionResult =
  | {
      readonly status: 'RECEIVED';
      readonly title: 'Solicitud recibida';
      readonly message: string;
    }
  | {
      readonly status: 'INVALID';
      readonly message: string;
    }
  | {
      readonly status: 'RATE_LIMITED';
      readonly retryAfterSeconds: number | null;
      readonly message: string;
    }
  | {
      readonly status: 'UNAVAILABLE';
      readonly message: string;
    };

@Injectable({ providedIn: 'root' })
export class PublicBetaAccessRequestService {
  private readonly client = createEventLensClient();

  async submitRequest(rawEmail: string): Promise<BetaAccessSubmissionResult> {
    try {
      const { data, error, response } = await this.client.POST(
        '/api/v1/public/beta-access-requests',
        {
          body: {
            email: rawEmail.trim()
          }
        }
      );

      if (response.ok && data) {
        return {
          status: 'RECEIVED',
          title: 'Solicitud recibida',
          message:
            'Recibimos tu solicitud para la Beta de Phoeve. Enviar esta solicitud no crea una cuenta ni garantiza una invitación.'
        };
      }

      if (response.status === 422 || response.status === 400) {
        return {
          status: 'INVALID',
          message: 'Ingresa un correo electrónico válido para enviar tu solicitud.'
        };
      }

      if (response.status === 429) {
        const headerRetryAfter = response.headers?.get?.('retry-after');
        const bodyRetryAfter =
          error &&
          typeof error === 'object' &&
          'details' in error &&
          error.details &&
          typeof (error.details as Record<string, unknown>)['retryAfterSeconds'] === 'number'
            ? ((error.details as Record<string, unknown>)['retryAfterSeconds'] as number)
            : null;
        const parsedHeader = headerRetryAfter ? Number.parseInt(headerRetryAfter, 10) : Number.NaN;
        const retryAfterSeconds =
          Number.isFinite(parsedHeader) && parsedHeader > 0
            ? parsedHeader
            : bodyRetryAfter && bodyRetryAfter > 0
              ? bodyRetryAfter
              : null;

        const waitDetail = retryAfterSeconds
          ? ` Espera ${retryAfterSeconds} segundos antes de volver a intentarlo.`
          : ' Espera unos minutos antes de volver a intentarlo.';

        return {
          status: 'RATE_LIMITED',
          retryAfterSeconds,
          message: `Se alcanzó el límite temporal de solicitudes.${waitDetail}`
        };
      }

      return {
        status: 'UNAVAILABLE',
        message:
          'No pudimos registrar tu solicitud en este momento. Tu correo se conserva en esta pantalla para que puedas reintentar.'
      };
    } catch {
      return {
        status: 'UNAVAILABLE',
        message:
          'No pudimos registrar tu solicitud en este momento. Tu correo se conserva en esta pantalla para que puedas reintentar.'
      };
    }
  }
}

export type BetaAccessFormState =
  | 'EDITABLE'
  | 'INVALID'
  | 'SUBMITTING'
  | 'RECEIVED'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE';

const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'eventlens-beta-access-request',
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="el-beta-access-page" aria-labelledby="beta-access-heading">
      <div class="el-beta-card">
        <header class="el-beta-header">
          <p class="el-beta-eyebrow">Acceso disponible mediante invitación.</p>
          <h1 id="beta-access-heading" tabindex="-1">Solicitar acceso a la Beta</h1>
          <p id="beta-access-helper" class="el-beta-helper">
            Enviar esta solicitud no crea una cuenta ni garantiza una invitación.
          </p>
        </header>

        @if (formState() === 'RECEIVED') {
          <section
            class="el-beta-received"
            role="status"
            aria-live="polite"
            aria-labelledby="beta-received-heading"
          >
            <h2 id="beta-received-heading">Solicitud recibida</h2>
            <p>{{ feedbackMessage() }}</p>
            <div class="el-beta-actions">
              <a
                class="el-link-secondary"
                [href]="homePath"
                (click)="onReturnHome($event)"
              >
                Volver al inicio
              </a>
            </div>
          </section>
        } @else {
          <form
            class="el-beta-form"
            (submit)="onSubmit($event)"
            novalidate
            aria-labelledby="beta-access-heading"
            aria-describedby="beta-access-helper"
          >
            @if (feedbackMessage(); as messageText) {
              <div
                id="beta-access-feedback"
                role="alert"
                aria-live="assertive"
                class="el-inline-message"
                [class.el-inline-message--warning]="formState() === 'RATE_LIMITED'"
                [class.el-inline-message--error]="formState() !== 'RATE_LIMITED'"
              >
                <p>{{ messageText }}</p>
                @if (formState() === 'RATE_LIMITED' || formState() === 'UNAVAILABLE') {
                  <button
                    type="button"
                    class="el-btn-retry"
                    [disabled]="formState() === 'SUBMITTING'"
                    (click)="retrySubmission()"
                  >
                    Reintentar envío
                  </button>
                }
              </div>
            }

            <div class="el-form-field">
              <label for="beta-access-email">Correo electrónico</label>
              <input
                id="beta-access-email"
                name="email"
                type="email"
                autocomplete="email"
                required
                [value]="email()"
                [disabled]="formState() === 'SUBMITTING'"
                [attr.aria-invalid]="formState() === 'INVALID' ? 'true' : null"
                [attr.aria-describedby]="
                  feedbackMessage()
                    ? 'beta-access-helper beta-access-feedback'
                    : 'beta-access-helper'
                "
                (input)="onEmailInput($event)"
              />
            </div>

            <div class="el-form-actions">
              <button
                type="submit"
                class="el-btn el-btn--primary"
                [disabled]="formState() === 'SUBMITTING'"
                [attr.aria-busy]="formState() === 'SUBMITTING' ? 'true' : null"
              >
                {{
                  formState() === 'SUBMITTING'
                    ? 'Enviando solicitud…'
                    : 'Solicitar acceso a la Beta'
                }}
              </button>
            </div>
          </form>

          <footer class="el-beta-footer">
            <a
              class="el-link-secondary"
              [href]="homePath"
              (click)="onReturnHome($event)"
            >
              Volver al inicio
            </a>
          </footer>
        }
      </div>
    </main>
  `,
  styles: [
    `
      .el-beta-access-page {
        max-width: 30rem;
        margin: 2.5rem auto;
        padding: 0 1.25rem;
        font-family: 'Manrope', system-ui, sans-serif;
        color: #0f172a;
      }
      .el-beta-card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 1rem;
        padding: 2rem 1.5rem;
        box-shadow: 0 4px 16px rgba(15, 23, 42, 0.05);
      }
      .el-beta-eyebrow {
        margin: 0 0 0.5rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: #1d4ed8;
      }
      .el-beta-header h1 {
        margin: 0 0 0.5rem;
        font-size: 1.75rem;
        font-weight: 700;
        line-height: 1.25;
      }
      .el-beta-helper {
        margin: 0 0 1.5rem;
        font-size: 0.95rem;
        line-height: 1.5;
        color: #475569;
      }
      .el-beta-received {
        padding: 1.25rem;
        border-radius: 0.75rem;
        background: #f8fafc;
        border: 1px solid #cbd5e1;
      }
      .el-beta-received h2 {
        margin: 0 0 0.5rem;
        font-size: 1.25rem;
        font-weight: 700;
        color: #0f172a;
      }
      .el-beta-received p {
        margin: 0 0 1rem;
        font-size: 0.95rem;
        line-height: 1.5;
        color: #334155;
      }
      .el-inline-message {
        margin-bottom: 1rem;
        padding: 0.75rem 1rem;
        border-radius: 0.5rem;
        font-size: 0.9rem;
        line-height: 1.4;
      }
      .el-inline-message p {
        margin: 0;
      }
      .el-inline-message--error {
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #991b1b;
      }
      .el-inline-message--warning {
        background: #fffbeb;
        border: 1px solid #fde68a;
        color: #92400e;
      }
      .el-btn-retry {
        margin-top: 0.5rem;
        min-height: 2.75rem;
        padding: 0.375rem 0.75rem;
        border: 1px solid currentColor;
        border-radius: 0.375rem;
        background: transparent;
        color: inherit;
        font-family: inherit;
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
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
      .el-beta-footer {
        margin-top: 1.5rem;
        padding-top: 1rem;
        border-top: 1px solid #e2e8f0;
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
export class BetaAccessRequestComponent {
  private readonly betaAccessService = inject(PublicBetaAccessRequestService);
  private readonly router = inject(PublicEntryRouterService);

  readonly homePath = APPROVED_PUBLIC_ENTRY_PATHS.HOME;
  readonly email = signal('');
  readonly formState = signal<BetaAccessFormState>('EDITABLE');
  readonly feedbackMessage = signal<string | null>(null);
  readonly retryAfterSeconds = signal<number | null>(null);

  onEmailInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.email.set(target?.value ?? '');
    if (this.formState() === 'INVALID') {
      this.formState.set('EDITABLE');
      this.feedbackMessage.set(null);
    }
  }

  async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    await this.submitCurrentEmail();
  }

  async retrySubmission(): Promise<void> {
    await this.submitCurrentEmail();
  }

  private async submitCurrentEmail(): Promise<void> {
    if (this.formState() === 'SUBMITTING') {
      return;
    }

    const candidate = this.email().trim();
    if (!candidate || !SIMPLE_EMAIL_PATTERN.test(candidate)) {
      this.formState.set('INVALID');
      this.feedbackMessage.set('Ingresa un correo electrónico válido para enviar tu solicitud.');
      return;
    }

    this.formState.set('SUBMITTING');
    this.feedbackMessage.set(null);
    this.retryAfterSeconds.set(null);

    const outcome = await this.betaAccessService.submitRequest(candidate);

    if (outcome.status === 'RECEIVED') {
      this.email.set('');
      this.formState.set('RECEIVED');
      this.feedbackMessage.set(outcome.message);
      return;
    }

    if (outcome.status === 'INVALID') {
      this.formState.set('INVALID');
      this.feedbackMessage.set(outcome.message);
      return;
    }

    if (outcome.status === 'RATE_LIMITED') {
      this.formState.set('RATE_LIMITED');
      this.retryAfterSeconds.set(outcome.retryAfterSeconds);
      this.feedbackMessage.set(outcome.message);
      return;
    }

    this.formState.set('UNAVAILABLE');
    this.feedbackMessage.set(outcome.message);
  }

  onReturnHome(event: Event): void {
    event.preventDefault();
    void this.router.navigateByUrl(this.homePath);
  }
}

export const BETA_ACCESS_REQUEST_ROUTE_DESCRIPTOR: PublicEntryRouteDescriptor = Object.freeze({
  ...CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA.BETA_ACCESS_REQUEST,
  component: BetaAccessRequestComponent
});
