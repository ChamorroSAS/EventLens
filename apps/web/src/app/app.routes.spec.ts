import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { Location } from '@angular/common';
import { signal, computed } from '@angular/core';

import { routes } from './app.routes';
import { AppComponent } from './app.component';
import { PublicHomePageComponent } from './public-home/public-home.component';
import { OrganizerLoginComponent } from './organizer-auth/organizer-login.component';
import { BetaAccessRequestComponent } from './beta-access/beta-access-request.component';
import { OrganizerAccountComponent } from './organizer-account/organizer-account.component';
import { OrganizerDashboardComponent } from './organizer/organizer-dashboard.component';
import { GuestContainerComponent } from './guest/guest-container.component';
import { AdminLoginComponent } from './admin/admin-login.component';
import { AdminReadOnlyShellComponent } from './admin/admin-read-only-shell.component';
import { AdminSessionService } from './admin/admin-session.service';
import { PublicNotFoundComponent } from './navigation/public-not-found.component';
import {
  PublicEntryRouterService,
  providePublicEntryRouter
} from './navigation/public-entry-router.service';
import { ALL_PUBLIC_ENTRY_ROUTES } from './navigation/all-routes';
import {
  canonicalizeAdminReturnUrl,
  canonicalizeInternalReturnUrl
} from './navigation/return-url.canonicalizer';
import { OrganizerSessionService } from './organizer-session.service';
import { OrganizerService } from './organizer/organizer.service';

describe('EL-TK-223: Angular Router único para rutas de paneles y entrada pública', () => {
  let router: Router;
  let location: Location;
  let routerFacade: PublicEntryRouterService;

  const mockOrganizerSession = {
    snapshot: signal({
      state: 'ANONYMOUS' as const,
      capabilities: {
        canSignIn: true,
        canRequestBetaAccess: true,
        canAccessMyEvents: false,
        canAccessMyAccount: false,
        canManageSessions: false,
        canManageAccountDeletion: false,
        isDeletionRestricted: false,
        canSignOut: false
      },
      account: null
    }).asReadonly(),
    state: computed(() => 'ANONYMOUS' as const),
    capabilities: computed(() => ({
      canSignIn: true,
      canRequestBetaAccess: true,
      canAccessMyEvents: false,
      canAccessMyAccount: false,
      canManageSessions: false,
      canManageAccountDeletion: false,
      isDeletionRestricted: false,
      canSignOut: false
    })),
    account: computed(() => null),
    isLoggingOut: signal(false).asReadonly(),
    lastLogoutAnnouncement: signal<string | null>(null).asReadonly(),
    logout: vi.fn(),
    registerOrganizerCacheClearer: vi.fn()
  };

  const mockOrganizerService = {
    listEvents: vi.fn().mockResolvedValue([]),
    createDraft: vi.fn().mockResolvedValue({ id: 'evt-created-1' }),
    getEventConfiguration: vi.fn().mockResolvedValue(null)
  };
  const mockAdminSession = {
    state: signal('UNAVAILABLE'),
    isRevalidating: signal(false),
    logoutUncertainty: signal(null),
    refreshSession: vi.fn()
  };

  beforeEach(async () => {
    mockAdminSession.refreshSession.mockResolvedValue({ state: 'UNAVAILABLE', principal: null });
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        providePublicEntryRouter(ALL_PUBLIC_ENTRY_ROUTES),
        { provide: OrganizerSessionService, useValue: mockOrganizerSession },
        { provide: AdminSessionService, useValue: mockAdminSession },
        { provide: OrganizerService, useValue: mockOrganizerService }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    location = TestBed.inject(Location);
    routerFacade = TestBed.inject(PublicEntryRouterService);
  });

  describe('Criterio 1: Resolución directa de rutas bajo Angular Router único', () => {
    it('resuelve la ruta pública raíz "/" hacia PublicHomeComponent', async () => {
      const navigated = await router.navigateByUrl('/');
      expect(navigated).toBe(true);
      expect(location.path()).toBe('');
      expect(routerFacade.activeDescriptor()?.id).toBe('PUBLIC_HOME');
    });

    it('resuelve "/ingresar" hacia OrganizerLoginComponent', async () => {
      const navigated = await router.navigateByUrl('/ingresar');
      expect(navigated).toBe(true);
      expect(location.path()).toBe('/ingresar');
      expect(routerFacade.activeDescriptor()?.id).toBe('ORGANIZER_LOGIN');
    });

    it('resuelve "/solicitar-acceso" hacia BetaAccessRequestComponent', async () => {
      const navigated = await router.navigateByUrl('/solicitar-acceso');
      expect(navigated).toBe(true);
      expect(location.path()).toBe('/solicitar-acceso');
      expect(routerFacade.activeDescriptor()?.id).toBe('BETA_ACCESS_REQUEST');
    });

    it('resuelve "/mi-cuenta" hacia OrganizerAccountComponent', async () => {
      const navigated = await router.navigateByUrl('/mi-cuenta');
      expect(navigated).toBe(true);
      expect(location.path()).toBe('/mi-cuenta');
      expect(routerFacade.activeDescriptor()?.id).toBe('ORGANIZER_ACCOUNT');
    });

    it('resuelve "/mis-eventos" hacia OrganizerDashboardComponent', async () => {
      const navigated = await router.navigateByUrl('/mis-eventos');
      expect(navigated).toBe(true);
      expect(location.path()).toBe('/mis-eventos');
      expect(routerFacade.activeDescriptor()?.id).toBe('ORGANIZER_DASHBOARD');
    });

    it('resuelve panel organizador "/mis-eventos/:eventId" extrayendo parámetros', async () => {
      const navigated = await router.navigateByUrl('/mis-eventos/evt-101');
      expect(navigated).toBe(true);
      expect(location.path()).toBe('/mis-eventos/evt-101');
      expect(routerFacade.activeDescriptor()?.id).toBe('ORGANIZER_EVENT_DETAIL');
      expect(routerFacade.params()['eventId']).toBe('evt-101');
    });

    it('resuelve panel organizador "/mis-eventos/:eventId/configuracion/general"', async () => {
      const navigated = await router.navigateByUrl('/mis-eventos/evt-101/configuracion/general');
      expect(navigated).toBe(true);
      expect(location.path()).toBe('/mis-eventos/evt-101/configuracion/general');
      expect(routerFacade.activeDescriptor()?.id).toBe('ORGANIZER_EVENT_CONFIG_GENERAL');
      expect(routerFacade.params()['eventId']).toBe('evt-101');
    });

    it('resuelve panel organizador "/mis-eventos/:eventId/configuracion/programacion"', async () => {
      const navigated = await router.navigateByUrl('/mis-eventos/evt-101/configuracion/programacion');
      expect(navigated).toBe(true);
      expect(location.path()).toBe('/mis-eventos/evt-101/configuracion/programacion');
      expect(routerFacade.activeDescriptor()?.id).toBe('ORGANIZER_EVENT_CONFIG_SCHEDULE');
      expect(routerFacade.params()['eventId']).toBe('evt-101');
    });

    it('resuelve ruta de invitado "/g/:lookupKey" hacia GuestContainerComponent sin ser absorbida por paneles', async () => {
      const navigated = await router.navigateByUrl('/g/boda-camila-2026');
      expect(navigated).toBe(true);
      expect(location.path()).toBe('/g/boda-camila-2026');
      expect(routerFacade.activeDescriptor()?.id).toBe('GUEST_EVENT_ENTRY');
      expect(routerFacade.params()['lookupKey']).toBe('boda-camila-2026');
    });

    it('resuelve ruta administrativa "/admin/ingresar" hacia AdminLoginComponent', async () => {
      const navigated = await router.navigateByUrl('/admin/ingresar');
      expect(navigated).toBe(true);
      expect(location.path()).toBe('/admin/ingresar');
      expect(routerFacade.activeDescriptor()?.id).toBe('ADMIN_LOGIN');
    });

    it('resuelve ruta administrativa hacia el shell sin datos cuando está indisponible', async () => {
      const navigated = await router.navigateByUrl('/admin/eventos');
      expect(navigated).toBe(true);
      expect(location.path()).toBe('/admin/eventos');
      expect(routerFacade.activeDescriptor()?.id).toBe('ADMIN_EVENTS');
      expect(routerFacade.activeDescriptor()?.component).toBe(AdminReadOnlyShellComponent);
    });

    it('redirige una sesión administrativa ausente al login y revalida al entrar', async () => {
      mockAdminSession.refreshSession.mockResolvedValueOnce({ state: 'ANONYMOUS', principal: null });
      await router.navigateByUrl('/admin/eventos');
      expect(mockAdminSession.refreshSession).toHaveBeenCalled();
      expect(location.path()).toContain('/admin/ingresar?returnUrl=');
    });

    it('resuelve ruta administrativa "/admin/eventos/:eventId" con detalle', async () => {
      const navigated = await router.navigateByUrl('/admin/eventos/evt-999');
      expect(navigated).toBe(true);
      expect(location.path()).toBe('/admin/eventos/evt-999');
      expect(routerFacade.activeDescriptor()?.id).toBe('ADMIN_EVENT_DETAIL');
      expect(routerFacade.params()['eventId']).toBe('evt-999');
    });

    it('rutas desconocidas caen en fallback 404 (PublicNotFoundComponent) sin revelar datos privados', async () => {
      const navigated = await router.navigateByUrl('/ruta-inexistente-aleatoria');
      expect(navigated).toBe(true);
      expect(routerFacade.activeDescriptor()?.id).toBe('NOT_FOUND');
    });
  });

  describe('Criterio 2: Reglas de negocio y no absorción de rutas', () => {
    it('logout no es ruta GET navegable y cae al 404 fallback', async () => {
      const navigated = await router.navigateByUrl('/logout');
      expect(navigated).toBe(true);
      expect(routerFacade.activeDescriptor()?.id).toBe('NOT_FOUND');

      const adminLogout = await router.navigateByUrl('/admin/logout');
      expect(adminLogout).toBe(true);
      expect(routerFacade.activeDescriptor()?.id).toBe('NOT_FOUND');
    });

    it('rutas legacy no contratadas (/guest, /organizer, /admin) no existen como alias y caen al 404', async () => {
      await router.navigateByUrl('/guest');
      expect(routerFacade.activeDescriptor()?.id).toBe('NOT_FOUND');

      await router.navigateByUrl('/organizer');
      expect(routerFacade.activeDescriptor()?.id).toBe('NOT_FOUND');

      await router.navigateByUrl('/admin');
      expect(routerFacade.activeDescriptor()?.id).toBe('NOT_FOUND');
    });
  });

  describe('Criterio 3: Retorno seguro y aislamiento entre actores (returnUrl canonicalizer)', () => {
    it('canonicalizeAdminReturnUrl acepta destinos allowlisted de administración', () => {
      expect(canonicalizeAdminReturnUrl('/admin/eventos')).toBe('/admin/eventos');
      expect(canonicalizeAdminReturnUrl('/admin/eventos/evt-12345')).toBe('/admin/eventos/evt-12345');
    });

    it('canonicalizeAdminReturnUrl rechaza ciclos de login administrativo y cae a /admin/eventos', () => {
      expect(canonicalizeAdminReturnUrl('/admin/ingresar')).toBe('/admin/eventos');
    });

    it('canonicalizeAdminReturnUrl NUNCA cruza actor hacia organizador, invitado o público', () => {
      expect(canonicalizeAdminReturnUrl('/mis-eventos')).toBe('/admin/eventos');
      expect(canonicalizeAdminReturnUrl('/mi-cuenta')).toBe('/admin/eventos');
      expect(canonicalizeAdminReturnUrl('/g/invitado')).toBe('/admin/eventos');
      expect(canonicalizeAdminReturnUrl('/')).toBe('/admin/eventos');
      expect(canonicalizeAdminReturnUrl('/solicitar-acceso')).toBe('/admin/eventos');
    });

    it('canonicalizeAdminReturnUrl rechaza esquemas, URLs externas y path traversal', () => {
      expect(canonicalizeAdminReturnUrl('https://evil.attacker.com/admin/eventos')).toBe('/admin/eventos');
      expect(canonicalizeAdminReturnUrl('//evil.attacker.com/admin/eventos')).toBe('/admin/eventos');
      expect(canonicalizeAdminReturnUrl('javascript:alert(1)')).toBe('/admin/eventos');
      expect(canonicalizeAdminReturnUrl('/admin/eventos/../secret')).toBe('/admin/eventos');
      expect(canonicalizeAdminReturnUrl('/admin/eventos/%2e%2e/secret')).toBe('/admin/eventos');
      expect(canonicalizeAdminReturnUrl(null)).toBe('/admin/eventos');
      expect(canonicalizeAdminReturnUrl(undefined)).toBe('/admin/eventos');
    });

    it('canonicalizeInternalReturnUrl permite rutas de organizador pero rechaza administración', () => {
      expect(canonicalizeInternalReturnUrl('/mis-eventos')).toBe('/mis-eventos');
      expect(canonicalizeInternalReturnUrl('/mis-eventos/evt-123')).toBe('/mis-eventos/evt-123');
      expect(canonicalizeInternalReturnUrl('/mis-eventos/evt-123/configuracion/general')).toBe(
        '/mis-eventos/evt-123/configuracion/general'
      );
      expect(canonicalizeInternalReturnUrl('/mi-cuenta')).toBe('/mi-cuenta');
      expect(canonicalizeInternalReturnUrl('/')).toBe('/');

      // Debe rechazar rutas administrativas
      expect(canonicalizeInternalReturnUrl('/admin/eventos')).toBe('/');
      expect(canonicalizeInternalReturnUrl('/admin/ingresar')).toBe('/');
      expect(canonicalizeInternalReturnUrl('/g/evento')).toBe('/');
    });
  });

  describe('Criterio 4: Delegación y autoridad única del Router Facade', () => {
    it('PublicEntryRouterService.navigateByUrl delega en Angular Router', async () => {
      const outcome = await routerFacade.navigateByUrl('/solicitar-acceso');
      expect(outcome).toBe(true);
      expect(location.path()).toBe('/solicitar-acceso');
      expect(routerFacade.activeDescriptor()?.id).toBe('BETA_ACCESS_REQUEST');
    });

    it('PublicEntryRouterService.navigateToHomeAnchor navega a la raíz con hash de sección', async () => {
      const outcome = await routerFacade.navigateToHomeAnchor('como-funciona');
      expect(outcome).toBe(true);
      expect(router.url).toContain('#como-funciona');
    });
  });
});
