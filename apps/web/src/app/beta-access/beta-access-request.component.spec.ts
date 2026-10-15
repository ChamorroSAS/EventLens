import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  APPROVED_PUBLIC_ENTRY_PATHS,
  CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA,
  type PublicEntryRouteDescriptor
} from '../navigation/public-entry-routes.contract';
import {
  PublicEntryRouterService,
  providePublicEntryRouter
} from '../navigation/public-entry-router.service';
import {
  BETA_ACCESS_REQUEST_ROUTE_DESCRIPTOR,
  BetaAccessRequestComponent,
  PublicBetaAccessRequestService
} from './beta-access-request.component';

@Component({
  selector: 'test-beta-mock-home',
  standalone: true,
  template: `<main><h1>Home Mock</h1></main>`
})
class MockHomeComponent {}

const TEST_ROUTES: readonly PublicEntryRouteDescriptor[] = [
  {
    ...CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA.PUBLIC_HOME,
    component: MockHomeComponent
  },
  BETA_ACCESS_REQUEST_ROUTE_DESCRIPTOR
];

describe('BetaAccessRequestComponent (EL-TK-208)', () => {
  it('renders only email field, exact CTA "Solicitar acceso a la Beta", helper text, and return to Home link', async () => {
    await TestBed.configureTestingModule({
      imports: [BetaAccessRequestComponent],
      providers: [providePublicEntryRouter(TEST_ROUTES)]
    }).compileComponents();

    const router = TestBed.inject(PublicEntryRouterService);
    await router.navigateByUrl(APPROVED_PUBLIC_ENTRY_PATHS.BETA_ACCESS);

    const fixture = TestBed.createComponent(BetaAccessRequestComponent);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h1')?.textContent?.trim()).toBe('Solicitar acceso a la Beta');
    expect(root.textContent).toContain(
      'Enviar esta solicitud no crea una cuenta ni garantiza una invitación.'
    );
    const inputs = root.querySelectorAll('input');
    expect(inputs.length).toBe(1);
    expect(inputs[0]?.getAttribute('type')).toBe('email');
    expect(root.querySelector('label[for="beta-access-email"]')?.textContent?.trim()).toBe(
      'Correo electrónico'
    );
    expect(root.querySelector('button[type="submit"]')?.textContent?.trim()).toBe(
      'Solicitar acceso a la Beta'
    );
    expect(root.textContent).toContain('Volver al inicio');
  });

  it('shows uniform "Solicitud recibida" without revealing prior existence or creating an account', async () => {
    await TestBed.configureTestingModule({
      imports: [BetaAccessRequestComponent],
      providers: [providePublicEntryRouter(TEST_ROUTES)]
    }).compileComponents();

    const service = TestBed.inject(PublicBetaAccessRequestService);
    vi.spyOn(service, 'submitRequest').mockResolvedValue({
      status: 'RECEIVED',
      title: 'Solicitud recibida',
      message:
        'Recibimos tu solicitud para la Beta de Phoeve. Enviar esta solicitud no crea una cuenta ni garantiza una invitación.'
    });

    const fixture = TestBed.createComponent(BetaAccessRequestComponent);
    fixture.detectChanges();

    fixture.componentInstance.email.set('visitante@eventlens.test');
    await fixture.componentInstance.onSubmit(new Event('submit'));
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h2')?.textContent?.trim()).toBe('Solicitud recibida');
    expect(fixture.componentInstance.email()).toBe('');
  });

  it('preserves email only in memory on 429 rate limit or 503 unavailability and shows retryAfter/retry button', async () => {
    const localStorageSetItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    await TestBed.configureTestingModule({
      imports: [BetaAccessRequestComponent],
      providers: [providePublicEntryRouter(TEST_ROUTES)]
    }).compileComponents();

    const service = TestBed.inject(PublicBetaAccessRequestService);
    const submitSpy = vi
      .spyOn(service, 'submitRequest')
      .mockResolvedValueOnce({
        status: 'RATE_LIMITED',
        retryAfterSeconds: 900,
        message:
          'Se alcanzó el límite temporal de solicitudes. Espera 900 segundos antes de volver a intentarlo.'
      })
      .mockResolvedValueOnce({
        status: 'UNAVAILABLE',
        message:
          'No pudimos registrar tu solicitud en este momento. Tu correo se conserva en esta pantalla para que puedas reintentar.'
      });

    const fixture = TestBed.createComponent(BetaAccessRequestComponent);
    fixture.detectChanges();

    fixture.componentInstance.email.set('persistir-memoria@eventlens.test');
    await fixture.componentInstance.onSubmit(new Event('submit'));
    fixture.detectChanges();

    expect(fixture.componentInstance.formState()).toBe('RATE_LIMITED');
    expect(fixture.componentInstance.retryAfterSeconds()).toBe(900);
    expect(fixture.componentInstance.email()).toBe('persistir-memoria@eventlens.test');
    expect(localStorageSetItemSpy).not.toHaveBeenCalled();

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('900 segundos');
    expect(alert.textContent).toContain('Reintentar envío');

    await fixture.componentInstance.retrySubmission();
    fixture.detectChanges();

    expect(submitSpy).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.formState()).toBe('UNAVAILABLE');
    expect(fixture.componentInstance.email()).toBe('persistir-memoria@eventlens.test');
    expect(localStorageSetItemSpy).not.toHaveBeenCalled();

    localStorageSetItemSpy.mockRestore();
  });

  it('validates invalid email format and navigates back to Home via Volver al inicio', async () => {
    await TestBed.configureTestingModule({
      imports: [BetaAccessRequestComponent],
      providers: [providePublicEntryRouter(TEST_ROUTES)]
    }).compileComponents();

    const router = TestBed.inject(PublicEntryRouterService);
    const service = TestBed.inject(PublicBetaAccessRequestService);
    const submitSpy = vi.spyOn(service, 'submitRequest');

    await router.navigateByUrl(APPROVED_PUBLIC_ENTRY_PATHS.BETA_ACCESS);
    const fixture = TestBed.createComponent(BetaAccessRequestComponent);
    fixture.detectChanges();

    fixture.componentInstance.email.set('correo-invalido');
    await fixture.componentInstance.onSubmit(new Event('submit'));
    fixture.detectChanges();

    expect(submitSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.formState()).toBe('INVALID');

    fixture.componentInstance.onReturnHome(new Event('click'));
    await Promise.resolve();
    expect(router.activeDescriptor()?.id).toBe('PUBLIC_HOME');
  });
});
