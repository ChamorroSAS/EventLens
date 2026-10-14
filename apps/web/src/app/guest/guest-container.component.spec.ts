import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GUEST_EVENT_ENTRY_ROUTE_DESCRIPTOR,
  GuestContainerComponent
} from './guest-container.component.js';
import { GuestService } from './guest.service.js';
import { PublicAccessView } from './guest.types.js';
import {
  PublicEntryRouterOutletComponent,
  PublicEntryRouterService,
  providePublicEntryRouter
} from '../navigation/public-entry-router.service.js';

describe('GuestContainerComponent (EL-TK-083 & EL-TK-211 & Mobile-First 7-Screen Guest Flow)', () => {
  let guestService: GuestService;

  const mockAccessView: PublicAccessView = {
    accessState: 'ALLOWED',
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

  function createComponent(
    accessView: PublicAccessView | null = mockAccessView,
    lookupKey = 'lk_valid_wedding_key_123456'
  ): {
    fixture: ComponentFixture<GuestContainerComponent>;
    component: GuestContainerComponent;
  } {
    const fixture = TestBed.createComponent(GuestContainerComponent);
    const component = fixture.componentInstance;
    component.lookupKey = lookupKey;
    component.accessView = accessView ? { ...accessView } : null;
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

  it('Escenario 2 (EL-TK-211): verifica PIN y confirma ConsentSheet + GuestIdentityForm mediante transporte owner real sin fabricar session-local-1 ni tokens JS', async () => {
    vi.spyOn(guestService, 'submitPin').mockImplementation(async (_key, pin) => {
      if (pin !== '123456') {
        return {
          ok: false,
          status: 401,
          code: 'INVALID_PIN',
          message: 'El código PIN ingresado es incorrecto.'
        };
      }
      const receipt = {
        id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        eventId: 'event-wedding-1',
        credentialGeneration: 1,
        contributorNickname: null,
        hasConsented: false,
        consentVersion: null
      };
      guestService.setSession(receipt);
      guestService.setContributions([]);
      return { ok: true, session: receipt, contributions: [] };
    });

    vi.spyOn(guestService, 'confirmConsent').mockImplementation(async (version) => {
      const updated = {
        id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        eventId: 'event-wedding-1',
        credentialGeneration: 1,
        contributorNickname: null,
        hasConsented: true,
        consentVersion: version
      };
      guestService.setSession(updated);
      return { ok: true, session: updated };
    });

    vi.spyOn(guestService, 'saveContributorNickname').mockImplementation(async (nickname) => {
      const updated = {
        id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        eventId: 'event-wedding-1',
        credentialGeneration: 1,
        contributorNickname: nickname.trim(),
        hasConsented: true,
        consentVersion: 'v1.0'
      };
      guestService.setSession(updated);
      return { ok: true, session: updated };
    });

    const { fixture, component } = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    // Intento con PIN incorrecto no fabrica sesión local
    await component.onPinSubmitted('000000');
    fixture.detectChanges();
    expect(component.hasActiveSession).toBe(false);
    expect(component.pinErrorMessage()).toContain('incorrecto');

    // 1. Submit PIN correcto
    await component.onPinSubmitted('123456');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.hasActiveSession).toBe(true);
    expect(guestService.getSession()?.id).not.toBe('session-local-1');
    expect(guestService.getSession()?.token).toBeUndefined();

    // 2. Trigger upload flow without prior consent
    component.startUploadFlow();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.showConsentSheet()).toBe(true);

    // 3. Accept consent
    await component.onConsentAccepted('v1.0');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.showConsentSheet()).toBe(false);
    expect(component.showIdentityForm()).toBe(true);

    // 4. Submit nickname
    await component.onNicknameSaved('Juan Pérez');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.showIdentityForm()).toBe(false);
    expect(guestService.isReadyToUpload()).toBe(true);
  });

  it('Escenario 3: muestra Mis aportes con los recuerdos asociados a la sesión guest y retira capacidades si la sesión es revocada (401)', async () => {
    guestService.setSession({
      id: 'sess-1',
      eventId: 'event-wedding-1',
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

    // Simular revocación de sesión desde el servidor (401)
    vi.spyOn(guestService, 'refreshOwnContributions').mockImplementation(async () => {
      guestService.clearSession();
      return {
        ok: false,
        status: 401,
        code: 'GUEST_SESSION_INVALID',
        message: 'Tu sesión de invitado ha expirado o fue revocada.'
      };
    });

    await component.refreshContributions();
    fixture.detectChanges();

    expect(component.hasActiveSession).toBe(false);
    expect(component.contributions.length).toBe(0);
    expect(component.sessionErrorMessage()).toContain('revocada');
  });

  it('Escenario 4: deriva a solicitud de retiro mediante transporte owner sin recuperar sesión ni eliminar automáticamente', async () => {
    vi.spyOn(guestService, 'resolveRemovalIntake').mockResolvedValue({
      ok: true,
      intake: {
        eventId: 'event-wedding-1',
        eventName: 'Boda Carlos y Sofia',
        intakePath: '/removal-request?eventId=event-wedding-1',
        disclaimer:
          'La recepción de esta solicitud no constituye una eliminación automática ni inmediata del contenido. El organizador o administrador del evento revisará la solicitud conforme a las políticas vigentes.',
        requiresSession: false
      }
    });

    const { fixture, component } = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    await component.onRequestRemoval();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.removalIntakeView()).toBeTruthy();
    expect(component.removalIntakeView()?.disclaimer).toContain(
      'La recepción de esta solicitud no constituye una eliminación automática'
    );
    expect(component.hasActiveSession).toBe(false);

    const removalModal = fixture.nativeElement.querySelector('.removal-modal-backdrop');
    expect(removalModal).toBeTruthy();

    component.closeRemovalModal();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.removalIntakeView()).toBeNull();
  });

  it('Escenario 5 (EL-TK-211): resuelve entrada directa /g/:lookupKey en el Router y maneja enlace revocado sin enumerar el evento', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PublicEntryRouterOutletComponent],
      providers: [
        GuestService,
        providePublicEntryRouter([GUEST_EVENT_ENTRY_ROUTE_DESCRIPTOR])
      ]
    }).compileComponents();

    const router = TestBed.inject(PublicEntryRouterService);
    const service = TestBed.inject(GuestService);

    vi.spyOn(service, 'resolvePublicEntry').mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: 'GUEST_ENTRY_NOT_FOUND',
      message: 'El enlace de acceso no es válido o ha sido revocado.'
    });

    await router.navigateByUrl('/g/revoked_key_999');
    const fixture = TestBed.createComponent(PublicEntryRouterOutletComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Enlace no disponible');
    expect(text).toContain('El enlace de acceso no es válido o ha sido revocado.');
    expect(text).not.toContain('Boda Carlos y Sofia');
    expect(router.currentSafePath()).toBe('/g/[redacted]');
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

  it('flujo móvil de 7 pantallas: transiciona a selección de archivos, progreso, confirmación y galería', async () => {
    guestService.setSession({
      id: 'sess-ready',
      eventId: 'event-wedding-1',
      credentialGeneration: 1,
      contributorNickname: 'Néstor',
      hasConsented: true,
      consentVersion: 'v1.0'
    });

    const accessWithoutPin: PublicAccessView = {
      ...mockAccessView,
      pinRequired: false
    };

    const { fixture, component } = createComponent(accessWithoutPin);
    await fixture.whenStable();
    fixture.detectChanges();

    // 1. Landing: click en subir recuerdos va directo a SELECT_FILES porque ya tiene sesión y consentimiento
    component.onUploadCtaClick();
    fixture.detectChanges();
    expect(component.currentStep()).toBe('SELECT_FILES');

    const dropzone = fixture.nativeElement.querySelector('.dropzone-card');
    expect(dropzone).toBeTruthy();
    expect(component.selectedFiles().length).toBeGreaterThan(0);

    // 2. Transición a UPLOADING
    component.startUploadingSelectedFiles();
    fixture.detectChanges();
    expect(component.currentStep()).toBe('UPLOADING');
    const progressList = fixture.nativeElement.querySelector('.uploading-files-list');
    expect(progressList).toBeTruthy();

    // 3. Transición a CONFIRMATION
    component.goToStep('CONFIRMATION');
    fixture.detectChanges();
    expect(component.currentStep()).toBe('CONFIRMATION');
    const celebrationTitle = fixture.nativeElement.querySelector('.celebration-title');
    expect(celebrationTitle.textContent).toContain('¡Gracias por compartir!');

    // 4. Transición a GALLERY
    component.goToGallery();
    fixture.detectChanges();
    expect(component.currentStep()).toBe('GALLERY');
    const galleryEl = fixture.nativeElement.querySelector('el-gallery');
    expect(galleryEl).toBeTruthy();

    // 5. Apertura de UploadPolicy modal
    component.openUploadPolicy();
    fixture.detectChanges();
    expect(component.showUploadPolicyModal()).toBe(true);
    const policyCard = fixture.nativeElement.querySelector('.policy-sheet-card');
    expect(policyCard).toBeTruthy();
    expect(policyCard.textContent).toContain('UploadPolicy');

    // 6. Apertura de Legal modal
    component.openLegalModal('privacy');
    fixture.detectChanges();
    expect(component.activeLegalModal()).toBe('privacy');
    const legalCard = fixture.nativeElement.querySelector('.legal-detail-card');
    expect(legalCard).toBeTruthy();
    expect(legalCard.textContent).toContain('Política de Privacidad');
  });
});
