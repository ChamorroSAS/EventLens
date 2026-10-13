import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PublicHomePageComponent,
  PUBLIC_HOME_ROUTE_DESCRIPTOR
} from './public-home.component';
import { AppHeaderComponent } from './app-header.component';
import { LegalFooterComponent } from './legal-footer.component';
import {
  OrganizerSessionService,
  type OrganizerSessionSnapshot,
  type OrganizerSessionConsumerState
} from '../organizer-session.service';
import {
  PublicEntryRouterService,
  providePublicEntryRouter
} from '../navigation/public-entry-router.service';
import { APPROVED_PUBLIC_ENTRY_PATHS } from '../navigation/public-entry-routes.contract';

describe('PublicHomePageComponent & AppHeaderComponent (EL-TK-213)', () => {
  let fixture: ComponentFixture<PublicHomePageComponent>;
  let component: PublicHomePageComponent;
  let element: HTMLElement;

  let sessionStateSignal: ReturnType<typeof signal<OrganizerSessionSnapshot>>;
  let mockSessionService: Partial<OrganizerSessionService>;
  let routerService: PublicEntryRouterService;

  function createSnapshot(state: OrganizerSessionConsumerState): OrganizerSessionSnapshot {
    return {
      state,
      capabilities: {
        canSignIn: state === 'ANONYMOUS',
        canRequestBetaAccess: true,
        canAccessMyEvents: state === 'ORGANIZER_ACTIVE',
        canAccessMyAccount: state === 'ORGANIZER_ACTIVE' || state === 'ORGANIZER_RESTRICTED_DELETION',
        canManageSessions: state === 'ORGANIZER_ACTIVE',
        canManageAccountDeletion: state === 'ORGANIZER_ACTIVE' || state === 'ORGANIZER_RESTRICTED_DELETION',
        isDeletionRestricted: state === 'ORGANIZER_RESTRICTED_DELETION',
        canSignOut: state === 'ORGANIZER_ACTIVE' || state === 'ORGANIZER_RESTRICTED_DELETION'
      },
      account:
        state === 'ORGANIZER_ACTIVE' || state === 'ORGANIZER_RESTRICTED_DELETION'
          ? {
              email: 'organizer@eventlens.internal',
              emailVerified: true,
              accountStatus: state === 'ORGANIZER_ACTIVE' ? 'ACTIVE' : 'PENDING_DELETION'
            }
          : null
    };
  }

  beforeEach(async () => {
    sessionStateSignal = signal<OrganizerSessionSnapshot>(createSnapshot('ANONYMOUS'));

    mockSessionService = {
      snapshot: sessionStateSignal.asReadonly(),
      state: computed(() => sessionStateSignal().state),
      capabilities: computed(() => sessionStateSignal().capabilities),
      account: computed(() => sessionStateSignal().account),
      isLoggingOut: signal(false).asReadonly(),
      lastLogoutAnnouncement: signal<string | null>(null).asReadonly(),
      logout: vi.fn().mockResolvedValue({
        status: 'CONFIRMED',
        outcome: 'LOGGED_OUT',
        announcement: 'Sesión finalizada',
        redirectPath: '/'
      })
    };

    await TestBed.configureTestingModule({
      imports: [PublicHomePageComponent, AppHeaderComponent, LegalFooterComponent],
      providers: [
        providePublicEntryRouter([PUBLIC_HOME_ROUTE_DESCRIPTOR]),
        { provide: OrganizerSessionService, useValue: mockSessionService }
      ]
    }).compileComponents();

    routerService = TestBed.inject(PublicEntryRouterService);
    fixture = TestBed.createComponent(PublicHomePageComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('renderiza hero con textos exactos de la dirección editorial confirmada', () => {
    const heroTitle = element.querySelector('#hero-title');
    expect(heroTitle).toBeTruthy();
    expect(heroTitle?.textContent?.trim()).toBe('Tu evento termina. Sus recuerdos continúan.');

    const subtitle = element.querySelector('.el-hero__subtitle');
    expect(subtitle?.textContent?.trim()).toContain('Cada invitado vive momentos diferentes.');

    const cta = element.querySelector('.el-hero .el-btn-primary');
    expect(cta?.textContent?.trim()).toBe('Solicitar acceso a la Beta');
    expect(cta?.getAttribute('href')).toBe(APPROVED_PUBLIC_ENTRY_PATHS.BETA_ACCESS);

    const microcopy = element.querySelector('.el-hero__microcopy');
    expect(microcopy?.textContent?.trim()).toBe('Acceso disponible mediante invitación.');
  });

  it('contiene las cuatro secciones canónicas por anclas: beneficios, cómo funciona, privacidad y FAQ', () => {
    const beneficios = element.querySelector('#beneficios');
    expect(beneficios).toBeTruthy();
    expect(beneficios?.querySelector('h2')?.textContent?.trim()).toBe('Cada mirada cuenta');
    expect(beneficios?.querySelectorAll('.el-card').length).toBe(3);

    const steps = element.querySelector('#como-funciona');
    expect(steps).toBeTruthy();
    expect(steps?.querySelector('h2')?.textContent?.trim()).toBe('Cómo funciona');
    expect(steps?.querySelectorAll('.el-step').length).toBe(4);

    const privacy = element.querySelector('#privacidad');
    expect(privacy).toBeTruthy();
    expect(privacy?.querySelector('h2')?.textContent?.trim()).toBe(
      'Tus recuerdos, tu espacio, tus decisiones'
    );

    const faq = element.querySelector('#preguntas-frecuentes');
    expect(faq).toBeTruthy();
    expect(faq?.querySelector('h2')?.textContent?.trim()).toBe('Preguntas frecuentes');
    expect(faq?.querySelectorAll('.el-faq-item').length).toBe(4);
  });

  it('renderiza cierre emocional con llamada a la acción y footer minimalista', () => {
    const closingTitle = element.querySelector('#closing-heading');
    expect(closingTitle?.textContent?.trim()).toBe('Cada celebración tiene una historia.');

    const closingCta = element.querySelector('.el-section--closing .el-btn-primary');
    expect(closingCta?.textContent?.trim()).toBe('Solicitar acceso a la Beta');

    const footer = element.querySelector('footer.el-footer');
    expect(footer).toBeTruthy();
    expect(footer?.textContent).toContain('Los recuerdos de cada celebración, reunidos en un solo lugar');
    expect(footer?.textContent).toContain('Phoeve · Beta privada');
  });

  it('cabecera anónima: muestra enlaces públicos e Iniciar sesión, sin botón Beta en header y ocultando acciones privadas', () => {
    sessionStateSignal.set(createSnapshot('ANONYMOUS'));
    fixture.detectChanges();

    const desktopActions = element.querySelector('.el-header__actions--desktop');
    expect(desktopActions).toBeTruthy();
    expect(desktopActions?.textContent).toContain('Iniciar sesión');
    expect(desktopActions?.textContent).not.toContain('Solicitar acceso a la Beta');
    expect(desktopActions?.textContent).not.toContain('Mis eventos');
    expect(desktopActions?.textContent).not.toContain('Mi cuenta');
    expect(desktopActions?.textContent).not.toContain('Cerrar sesión');
  });

  it('cabecera organizador activo: muestra Mis eventos, Mi cuenta y Cerrar sesión, sustituyendo login/beta', () => {
    sessionStateSignal.set(createSnapshot('ORGANIZER_ACTIVE'));
    fixture.detectChanges();

    const desktopActions = element.querySelector('.el-header__actions--desktop');
    expect(desktopActions?.textContent).toContain('Mis eventos');
    expect(desktopActions?.textContent).toContain('Mi cuenta');
    expect(desktopActions?.textContent).toContain('Cerrar sesión');
    expect(desktopActions?.textContent).not.toContain('Iniciar sesión');
    expect(desktopActions?.textContent).not.toContain('Solicitar acceso a la Beta');
  });

  it('cabecera organizador restringido: muestra Mi cuenta y Cerrar sesión, pero no Mis eventos ni login', () => {
    sessionStateSignal.set(createSnapshot('ORGANIZER_RESTRICTED_DELETION'));
    fixture.detectChanges();

    const desktopActions = element.querySelector('.el-header__actions--desktop');
    expect(desktopActions?.textContent).toContain('Mi cuenta');
    expect(desktopActions?.textContent).toContain('Cerrar sesión');
    expect(desktopActions?.textContent).not.toContain('Mis eventos');
    expect(desktopActions?.textContent).not.toContain('Iniciar sesión');
  });

  it('menú móvil accesible: abre, cierra con Escape y alterna aria-expanded', () => {
    const menuBtn = element.querySelector('.el-header__menu-btn') as HTMLButtonElement;
    expect(menuBtn.getAttribute('aria-expanded')).toBe('false');

    menuBtn.click();
    fixture.detectChanges();

    expect(menuBtn.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector('.el-mobile-menu')).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(menuBtn.getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('.el-mobile-menu')).toBeFalsy();
  });

  it('navegación por CTA: redirige a /solicitar-acceso', async () => {
    const navigateSpy = vi.spyOn(routerService, 'navigateByUrl');
    const heroCta = element.querySelector('.el-hero .el-btn-primary') as HTMLAnchorElement;

    heroCta.click();
    expect(navigateSpy).toHaveBeenCalledWith(APPROVED_PUBLIC_ENTRY_PATHS.BETA_ACCESS);
  });
});
