import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  APPROVED_PUBLIC_ENTRY_PATHS,
  CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA,
  type PublicEntryRouteDescriptor
} from '../navigation/public-entry-routes.contract';
import {
  PublicEntryRouterOutletComponent,
  PublicEntryRouterService,
  providePublicEntryRouter
} from '../navigation/public-entry-router.service';
import { OrganizerSessionService } from '../organizer-session.service';
import {
  ORGANIZER_LOGIN_ROUTE_DESCRIPTOR,
  OrganizerLoginComponent
} from './organizer-login.component';

@Component({
  selector: 'test-login-mock-home',
  standalone: true,
  template: `<main><h1>Home Mock</h1></main>`
})
class MockHomeComponent {}

@Component({
  selector: 'test-login-mock-account',
  standalone: true,
  template: `<main><h1>Mi cuenta</h1></main>`
})
class MockAccountComponent {}

@Component({
  selector: 'test-login-mock-dashboard',
  standalone: true,
  template: `<main><h1>Mis eventos</h1></main>`
})
class MockDashboardComponent {}

const TEST_ROUTES: readonly PublicEntryRouteDescriptor[] = [
  {
    ...CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA.PUBLIC_HOME,
    component: MockHomeComponent
  },
  ORGANIZER_LOGIN_ROUTE_DESCRIPTOR,
  {
    ...CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA.ORGANIZER_ACCOUNT,
    component: MockAccountComponent
  },
  {
    ...CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA.ORGANIZER_DASHBOARD,
    component: MockDashboardComponent
  }
];

describe('OrganizerLoginComponent (EL-TK-207)', () => {
  it('renders canonical LoginForm fields, accessible labels, and no fake password recovery link', async () => {
    await TestBed.configureTestingModule({
      imports: [OrganizerLoginComponent],
      providers: [providePublicEntryRouter(TEST_ROUTES)]
    }).compileComponents();

    const router = TestBed.inject(PublicEntryRouterService);
    await router.navigateByUrl(APPROVED_PUBLIC_ENTRY_PATHS.LOGIN);

    const fixture = TestBed.createComponent(OrganizerLoginComponent);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h1')?.textContent).toContain('Iniciar sesión');
    expect(root.querySelector('label[for="organizer-login-email"]')?.textContent).toContain(
      'Correo electrónico'
    );
    expect(root.querySelector('label[for="organizer-login-password"]')?.textContent).toContain(
      'Contraseña'
    );
    expect(root.querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Iniciar sesión');
    expect(root.textContent).toContain('Volver al inicio');
    expect(root.textContent).not.toContain('Olvidé mi contraseña');
    expect(root.textContent).not.toContain('Recuperar contraseña');
  });

  it('validates empty fields locally without invoking API', async () => {
    await TestBed.configureTestingModule({
      imports: [OrganizerLoginComponent],
      providers: [providePublicEntryRouter(TEST_ROUTES)]
    }).compileComponents();

    const sessionService = TestBed.inject(OrganizerSessionService);
    const loginSpy = vi.spyOn(sessionService, 'login');

    const fixture = TestBed.createComponent(OrganizerLoginComponent);
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(loginSpy).not.toHaveBeenCalled();
    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(alert?.textContent).toContain(
      'Ingresa tu correo electrónico y tu contraseña para continuar.'
    );
  });

  it('navigates to authorized internal returnUrl (/mi-cuenta) after successful login and clears password', async () => {
    await TestBed.configureTestingModule({
      imports: [PublicEntryRouterOutletComponent, OrganizerLoginComponent],
      providers: [providePublicEntryRouter(TEST_ROUTES)]
    }).compileComponents();

    const router = TestBed.inject(PublicEntryRouterService);
    const sessionService = TestBed.inject(OrganizerSessionService);
    await router.navigateByUrl('/ingresar?returnUrl=%2Fmi-cuenta');

    vi.spyOn(sessionService, 'login').mockImplementation(async (_creds, rawReturnUrl) => {
      const snapshot = sessionService.applyServerProjection(
        {
          state: 'ORGANIZER_ACTIVE',
          capabilities: {
            canSignIn: false,
            canRequestBetaAccess: true,
            canAccessMyEvents: true,
            canAccessMyAccount: true,
            canManageSessions: true,
            canManageAccountDeletion: true,
            isDeletionRestricted: false,
            canSignOut: true
          },
          account: {
            email: 'org@eventlens.test',
            emailVerified: true,
            accountStatus: 'ACTIVE'
          }
        },
        'csrf-123'
      );
      return {
        ok: true,
        snapshot,
        returnDestination: sessionService.resolveAuthorizedReturnDestination(rawReturnUrl)
      };
    });

    const fixture = TestBed.createComponent(OrganizerLoginComponent);
    fixture.detectChanges();

    const emailInput = fixture.nativeElement.querySelector(
      '#organizer-login-email'
    ) as HTMLInputElement;
    const passwordInput = fixture.nativeElement.querySelector(
      '#organizer-login-password'
    ) as HTMLInputElement;

    emailInput.value = 'org@eventlens.test';
    emailInput.dispatchEvent(new Event('input'));
    passwordInput.value = 'ValidPass!234';
    passwordInput.dispatchEvent(new Event('input'));

    await fixture.componentInstance.onSubmit(new Event('submit'));
    fixture.detectChanges();

    expect(fixture.componentInstance.password()).toBe('');
    expect(router.activeDescriptor()?.id).toBe('ORGANIZER_ACCOUNT');
  });

  it('falls back to / when returnUrl is external or unauthorized for restricted deletion session', async () => {
    await TestBed.configureTestingModule({
      imports: [OrganizerLoginComponent],
      providers: [providePublicEntryRouter(TEST_ROUTES)]
    }).compileComponents();

    const router = TestBed.inject(PublicEntryRouterService);
    const sessionService = TestBed.inject(OrganizerSessionService);
    await router.navigateByUrl('/ingresar?returnUrl=%2Fmis-eventos');

    vi.spyOn(sessionService, 'login').mockImplementation(async (_creds, rawReturnUrl) => {
      const snapshot = sessionService.applyServerProjection(
        {
          state: 'ORGANIZER_RESTRICTED_DELETION',
          capabilities: {
            canSignIn: false,
            canRequestBetaAccess: true,
            canAccessMyEvents: false,
            canAccessMyAccount: true,
            canManageSessions: false,
            canManageAccountDeletion: true,
            isDeletionRestricted: true,
            canSignOut: true
          },
          account: {
            email: 'restricted@eventlens.test',
            emailVerified: true,
            accountStatus: 'PENDING_DELETION'
          }
        },
        'csrf-restricted'
      );
      return {
        ok: true,
        snapshot,
        returnDestination: sessionService.resolveAuthorizedReturnDestination(rawReturnUrl)
      };
    });

    const fixture = TestBed.createComponent(OrganizerLoginComponent);
    fixture.detectChanges();

    fixture.componentInstance.email.set('restricted@eventlens.test');
    fixture.componentInstance.password.set('ValidPass!234');

    await fixture.componentInstance.onSubmit(new Event('submit'));
    fixture.detectChanges();

    expect(router.activeDescriptor()?.id).toBe('PUBLIC_HOME');
  });

  it('displays neutral error on failed login or rate limit and prevents double submission while busy', async () => {
    await TestBed.configureTestingModule({
      imports: [OrganizerLoginComponent],
      providers: [providePublicEntryRouter(TEST_ROUTES)]
    }).compileComponents();

    const sessionService = TestBed.inject(OrganizerSessionService);
    let resolveLogin!: (value: any) => void;
    const loginSpy = vi.spyOn(sessionService, 'login').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        })
    );

    const fixture = TestBed.createComponent(OrganizerLoginComponent);
    fixture.detectChanges();

    fixture.componentInstance.email.set('org@eventlens.test');
    fixture.componentInstance.password.set('WrongPass!234');

    const firstSubmit = fixture.componentInstance.onSubmit(new Event('submit'));
    fixture.detectChanges();

    expect(fixture.componentInstance.isSubmitting()).toBe(true);
    expect(
      (fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement).textContent?.trim()
    ).toBe('Iniciando sesión…');

    // Second submit while busy should be ignored
    await fixture.componentInstance.onSubmit(new Event('submit'));
    expect(loginSpy).toHaveBeenCalledTimes(1);

    resolveLogin({
      ok: false,
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Correo electrónico o contraseña incorrectos. Verifica tus datos e inténtalo de nuevo.'
    });
    await firstSubmit;
    fixture.detectChanges();

    expect(fixture.componentInstance.isSubmitting()).toBe(false);
    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(alert?.textContent).toContain('Correo electrónico o contraseña incorrectos.');
  });
});
