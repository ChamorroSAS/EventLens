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
  templateUrl: './beta-access-request.component.html',
  styleUrl: './beta-access-request.component.scss'
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
