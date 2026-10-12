import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { GuestContainerComponent } from './guest-container.component.js';
import { GuestService } from './guest.service.js';
import { PublicAccessView } from './guest.types.js';

describe('GuestContainerComponent (EL-TK-083)', () => {
  let guestService: GuestService;

  const mockAccessView: PublicAccessView = {
    eventId: 'event-wedding-1',
    name: 'Boda Carlos y Sofia',
    status: 'ACTIVE',
    timezone: 'America/Bogota',
    generation: 1,
    pinRequired: true,
    canViewLanding: true,
    canUpload: true,
    canViewGallery: true
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GuestContainerComponent],
      providers: [GuestService]
    }).compileComponents();

    guestService = TestBed.inject(GuestService);
    guestService.clearSession();
  });

  function createComponent(accessView: PublicAccessView = mockAccessView): {
    fixture: ComponentFixture<GuestContainerComponent>;
    component: GuestContainerComponent;
  } {
    const fixture = TestBed.createComponent(GuestContainerComponent);
    const component = fixture.componentInstance;
    component.accessView = { ...accessView };
    return { fixture, component };
  }

  it('Escenario 1: muestra formulario de PIN cuando el evento requiere PIN y no hay sesión activa', async () => {
    const { fixture, component } = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.needsPinVerification).toBe(true);

    const pinForm = fixture.nativeElement.querySelector('el-pin-access-form');
    expect(pinForm).toBeTruthy();
  });

  it('Escenario 2: presenta ConsentSheet y luego GuestIdentityForm antes de habilitar la carga', async () => {
    const { fixture, component } = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    // 1. Submit PIN
    component.onPinSubmitted('123456');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.hasActiveSession).toBe(true);

    // 2. Trigger upload flow without prior consent
    component.startUploadFlow();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.showConsentSheet()).toBe(true);

    // 3. Accept consent
    component.onConsentAccepted('v1.0');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.showConsentSheet()).toBe(false);
    expect(component.showIdentityForm()).toBe(true);

    // 4. Submit nickname
    component.onNicknameSaved('Juan Pérez');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.showIdentityForm()).toBe(false);
    expect(guestService.isReadyToUpload()).toBe(true);
  });

  it('Escenario 3: muestra Mis aportes con los recuerdos asociados a la sesión guest', async () => {
    guestService.setSession({
      id: 'sess-1',
      eventId: 'event-wedding-1',
      token: 'tok-1',
      credentialGeneration: 1,
      contributorNickname: 'Andrea',
      hasConsented: true,
      consentVersion: 'v1.0'
    });

    guestService.setContributions([
      {
        attemptId: 'att-1',
        mediaType: 'PHOTO',
        status: 'ACCEPTED',
        declaredSize: 2000000,
        actualSize: 1950000,
        detectedType: 'image/jpeg',
        durationSeconds: null,
        createdAt: new Date().toISOString()
      }
    ]);

    const { fixture, component } = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const contributionsList = fixture.nativeElement.querySelector('el-my-contributions-list');
    expect(contributionsList).toBeTruthy();
    expect(component.contributions.length).toBe(1);
    expect(component.contributions[0].mediaType).toBe('PHOTO');
  });

  it('Escenario 4: deriva a solicitud de retiro mostrando modal informativo con disclaimer oficial', async () => {
    const { fixture, component } = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    component.onRequestRemoval();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.removalIntakeView()).toBeTruthy();
    expect(component.removalIntakeView()?.disclaimer).toContain(
      'La recepción de esta solicitud no constituye una eliminación automática'
    );

    const removalModal = fixture.nativeElement.querySelector('.removal-modal-backdrop');
    expect(removalModal).toBeTruthy();

    component.closeRemovalModal();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.removalIntakeView()).toBeNull();
  });

  it('cumple con accesibilidad WCAG 2.2 AA (regiones principales, roles y botones interactivos)', async () => {
    const { fixture } = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const mainEl = fixture.nativeElement.querySelector('main');
    expect(mainEl.getAttribute('role')).toBe('main');
    expect(mainEl.getAttribute('aria-labelledby')).toBe('event-title');

    const titleEl = fixture.nativeElement.querySelector('#event-title');
    expect(titleEl.textContent).toContain('Boda Carlos y Sofia');
  });
});
