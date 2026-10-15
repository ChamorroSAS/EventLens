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

  it('preserves real local selection without inventing transfer or success', async () => {
    guestService.setSession({ id: 'sess-ready', eventId: mockAccessView.eventId, credentialGeneration: 1, contributorNickname: 'Nestor', hasConsented: true, consentVersion: 'v1.0' });
    const { fixture, component } = createComponent({ ...mockAccessView, pinRequired: false });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(component.transferUnavailableMessage);
    component.startUploadFlow(); fixture.detectChanges();
    expect(component.currentStep()).toBe('SELECT_FILES');
    expect(component.selectedFiles()).toEqual([]);
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:real-file');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    component.addLocalFiles([file]); fixture.detectChanges();
    expect(component.selectedFiles()[0].file).toBe(file);
    expect(component.selectedFiles()[0].sizeBytes).toBe(4);
    expect(component.selectedFiles()[0].duration).toBeUndefined();
    expect(fixture.nativeElement.querySelector('.file-selection-screen button.mt-auto').disabled).toBe(true);
    component.startUploadingSelectedFiles(); component.retryFileUpload(component.selectedFiles()[0].id); component.goToStep('CONFIRMATION');
    expect(component.currentStep()).toBe('SELECT_FILES');
    expect(component.selectedFiles()[0].status).toBe('PENDING');
    expect(component.selectedFiles()[0].progress).toBe(0);
    expect(component.confirmedPhotosCount).toBe(0);
    expect(component.confirmedVideosCount).toBe(0);
    component.removeSelectedFile(component.selectedFiles()[0].id);
    expect(revoke).toHaveBeenCalledWith('blob:real-file');
    component.addLocalFiles([file]); fixture.destroy();
    expect(revoke).toHaveBeenCalledTimes(2);
    createUrl.mockRestore(); revoke.mockRestore();
  });

  it('renders actual date in event timezone and welcome without fictional city or cover', () => {
    const { fixture, component } = createComponent({ ...mockAccessView, scheduledAt: '2026-10-18T01:15:00.000Z', welcomeMessage: 'Welcome from organizer' });
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('17 de octubre de 2026');
    expect(text).toContain('8:15');
    expect(text).toContain('America/Bogota');
    expect(text).toContain('Welcome from organizer');
    expect(text).not.toContain('Barranquilla');
    expect(fixture.nativeElement.querySelector('.hero-cover-img')).toBeNull();
    expect(component.eventDateLabel).not.toContain('18 de octubre');
  });

  it('shows disabled upload menu and CTA with explanation without hiding name editing', async () => {
    guestService.setSession({ id: 'sess-ready', eventId: mockAccessView.eventId, credentialGeneration: 1, contributorNickname: null, hasConsented: false, consentVersion: null });
    const { fixture, component } = createComponent({ ...mockAccessView, pinRequired: false, canUpload: false, restrictionReason: 'Uploads disabled for this event.' });
    fixture.detectChanges();
    expect(component.currentStep()).toBe('LANDING');
    const menuButton = fixture.nativeElement.querySelector('.header-menu-btn');
    menuButton.click(); fixture.detectChanges();
    expect(menuButton.getAttribute('aria-expanded')).toBe('true');
    const menu = fixture.nativeElement.querySelector('#guest-menu');
    expect(menu.querySelector('button').disabled).toBe(true);
    expect(menu.textContent).toContain(component.uploadRestrictionMessage);
    expect(fixture.nativeElement.textContent).not.toContain('Uploads disabled');
    menuButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); fixture.detectChanges();
    expect(component.isMenuOpen()).toBe(false);
    expect(document.activeElement).toBe(menuButton);
    component.startUploadFlow(); expect(component.currentStep()).toBe('LANDING');
    component.editNickname(); fixture.detectChanges();
    expect(component.currentStep()).toBe('IDENTITY');
    expect(fixture.nativeElement.querySelector('#emailOrAliasInput')).toBeNull();
    vi.spyOn(guestService, 'saveContributorNickname').mockImplementation(async nickname => {
      const session = { ...guestService.getSession()!, contributorNickname: nickname }; guestService.setSession(session); return { ok: true, session };
    });
    await component.onNicknameSaved('Andrea'); fixture.detectChanges();
    expect(component.currentStep()).toBe('LANDING');
    expect(fixture.nativeElement.textContent).toContain('Andrea');
    expect(component.selectedFiles()).toEqual([]);
  });

  it('keeps consent errors visible and returns 401 to landing rather than orphaned steps', async () => {
    guestService.setSession({ id: 'sess', eventId: mockAccessView.eventId, credentialGeneration: 1, contributorNickname: null, hasConsented: false, consentVersion: null });
    const { fixture, component } = createComponent({ ...mockAccessView, pinRequired: false }); fixture.detectChanges();
    component.startUploadFlow(); fixture.detectChanges();
    const checkboxes = [...fixture.nativeElement.querySelectorAll('el-consent-sheet input[type=checkbox]')] as HTMLInputElement[];
    expect(checkboxes).toHaveLength(3); expect(checkboxes.every(input => !input.checked)).toBe(true);
    expect(fixture.nativeElement.querySelector('el-consent-sheet button[type=submit]').disabled).toBe(true);
    const consent = vi.spyOn(guestService, 'confirmConsent').mockResolvedValue({ ok: false, status: 503, code: 'DEPENDENCY_UNAVAILABLE', message: 'Consent unavailable' });
    await component.onConsentAccepted('v1.0'); fixture.detectChanges();
    expect(component.currentStep()).toBe('CONSENT');
    expect(fixture.nativeElement.querySelector('el-consent-sheet [role=alert]').textContent).toContain('Consent unavailable');
    consent.mockResolvedValue({ ok: false, status: 401, code: 'GUEST_SESSION_INVALID', message: 'Session expired' });
    await component.onConsentAccepted('v1.0'); fixture.detectChanges();
    expect(component.currentStep()).toBe('LANDING');
    expect(component.showConsentSheet()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Session expired');
    component.onUploadMoreClick(); expect(component.currentStep()).toBe('LANDING');
  });

  it('never edits or uploads using another event or credential generation session', () => {
    guestService.setSession({ id: 'other', eventId: 'other-event', credentialGeneration: 1, contributorNickname: 'Other', hasConsented: true, consentVersion: 'v1.0' });
    const { fixture, component } = createComponent({ ...mockAccessView, pinRequired: false }); fixture.detectChanges();
    component.editNickname(); component.startUploadFlow();
    expect(component.currentStep()).toBe('LANDING'); expect(component.hasActiveSession).toBe(false);
    guestService.setSession({ ...guestService.getSession()!, eventId: mockAccessView.eventId, credentialGeneration: 2 });
    component.editNickname(); expect(component.currentStep()).toBe('LANDING'); expect(component.hasActiveSession).toBe(false);
  });

  it('cancels nickname editing to origin and shows nickname 401 on landing', async () => {
    guestService.setSession({ id: 'sess', eventId: mockAccessView.eventId, credentialGeneration: 1, contributorNickname: null, hasConsented: false, consentVersion: null });
    const { fixture, component } = createComponent({ ...mockAccessView, canUpload: false }); fixture.detectChanges();
    component.editNickname(); component.cancelIdentity(); fixture.detectChanges();
    expect(component.currentStep()).toBe('LANDING');
    expect(component.showIdentityForm()).toBe(false);
    component.editNickname();
    vi.spyOn(guestService, 'saveContributorNickname').mockResolvedValue({ ok: false, status: 401, code: 'GUEST_SESSION_INVALID', message: 'Expired nickname session' });
    await component.onNicknameSaved('Andrea'); fixture.detectChanges();
    expect(component.currentStep()).toBe('LANDING');
    expect(component.showIdentityForm()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Expired nickname session');
  });

  it.each(['nickname', 'consent', 'PIN'])('ignores pending %s callback after event navigation', async action => {
    guestService.setSession({ id: 'sess-A', eventId: mockAccessView.eventId, credentialGeneration: 1, contributorNickname: null, hasConsented: false, consentVersion: null });
    const { fixture, component } = createComponent(); fixture.detectChanges();
    let finish!: (value: Awaited<ReturnType<GuestService['confirmConsent']>>) => void;
    const delayed = new Promise<Awaited<ReturnType<GuestService['confirmConsent']>>>(resolve => { finish = resolve; });
    const method = action === 'nickname' ? 'saveContributorNickname' : action === 'consent' ? 'confirmConsent' : 'submitPin';
    vi.spyOn(guestService, method).mockReturnValue(delayed);
    if (action === 'nickname') component.editNickname();
    else if (action === 'consent') component.startUploadFlow();
    const old = action === 'nickname' ? component.onNicknameSaved('Old') : action === 'consent' ? component.onConsentAccepted('v1.0') : component.onPinSubmitted('123456');
    vi.spyOn(guestService, 'resolvePublicEntry').mockImplementation(async () => {
      const session = { id: 'sess-B', eventId: 'event-B', credentialGeneration: 1, contributorNickname: 'New', hasConsented: true, consentVersion: 'v1.0' };
      guestService.setSession(session);
      return { ok: true, session, contributions: [], access: { ...mockAccessView, eventId: 'event-B', name: 'New event' } };
    });
    await component.loadGuestEntry('B');
    finish({ ok: false, status: 401, code: 'GUEST_SESSION_INVALID', message: 'Old session expired' });
    await old; fixture.detectChanges();
    expect(component.currentStep()).toBe('LANDING');
    expect(component.accessView?.name).toBe('New event');
    expect(guestService.getSession()?.id).toBe('sess-B');
    expect(component.sessionErrorMessage()).toBeNull();
    expect(component.pinErrorMessage()).toBeNull();
    expect(component.showConsentSheet()).toBe(false);
    expect(component.showIdentityForm()).toBe(false);
  });
});
