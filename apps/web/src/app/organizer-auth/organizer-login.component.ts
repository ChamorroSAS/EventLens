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
  templateUrl: './organizer-login.component.html',
  styleUrl: './organizer-login.component.scss'
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

  logoFailed = false;

  onLogoError(): void {
    this.logoFailed = true;
  }

  toggleShowPassword(): void {
    this.showPassword.update(v => !v);
  }
  get passwordChanged(): boolean { return this.router.queryParams()['passwordChanged'] === '1'; }

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
    if (currentState === 'PASSWORD_CHANGE_REQUIRED') {
      void this.router.navigateByUrl('/cambiar-contrasena', { replaceUrl: true });
      return;
    }
    if (currentState === 'CHECKING') {
      try {
        const snap = await this.sessionService.refreshSessionProjection();
        if (snap.state === 'ORGANIZER_ACTIVE') {
          const rawReturnUrl = this.router.queryParams()['returnUrl'];
          const target = this.sessionService.resolveAuthorizedReturnDestination(rawReturnUrl);
          void this.router.navigateByUrl(target, { replaceUrl: true });
        } else if (snap.state === 'PASSWORD_CHANGE_REQUIRED') {
          void this.router.navigateByUrl('/cambiar-contrasena', { replaceUrl: true });
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
