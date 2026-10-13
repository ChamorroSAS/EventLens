import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import {
  APPROVED_PUBLIC_ENTRY_PATHS,
  CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA,
  PublicEntryRouterOutletComponent,
  PublicEntryRouterService,
  PublicNotFoundComponent,
  canonicalizeInternalReturnUrl,
  providePublicEntryRouter,
  type PublicEntryRouteDescriptor
} from './index';

@Component({
  selector: 'eventlens-test-home-fixture',
  standalone: true,
  template: `
    <main>
      <h1 id="test-home-h1" tabindex="-1">Inicio de prueba (Harness)</h1>
      <section id="como-funciona">
        <h2 id="test-anchor-h2" tabindex="-1">Cómo funciona</h2>
      </section>
    </main>
  `
})
class TestHomeFixtureComponent {}

@Component({
  selector: 'eventlens-test-dashboard-fixture',
  standalone: true,
  template: `
    <main>
      <h1 id="test-dashboard-h1" tabindex="-1">Eventos de prueba (Harness)</h1>
    </main>
  `
})
class TestDashboardFixtureComponent {}

@Component({
  selector: 'eventlens-test-guest-fixture',
  standalone: true,
  template: `
    <main>
      <h1 id="test-guest-h1" tabindex="-1">Invitado de prueba</h1>
      <p data-testid="lookup-key">{{ router.params()['lookupKey'] }}</p>
    </main>
  `
})
class TestGuestFixtureComponent {
  readonly router = inject(PublicEntryRouterService);
}

@Component({
  selector: 'eventlens-test-router-harness',
  standalone: true,
  imports: [PublicEntryRouterOutletComponent],
  template: `<eventlens-router-outlet />`
})
class TestRouterHarnessComponent {}

describe('EL-TK-206 — Infraestructura Router, retorno interno puro y ErrorState/404', () => {
  describe('canonicalizeInternalReturnUrl (retorno puro)', () => {
    it('conserva únicamente los paths internos permitidos para retorno tras login', () => {
      expect(canonicalizeInternalReturnUrl('/')).toBe('/');
      expect(canonicalizeInternalReturnUrl('/mi-cuenta')).toBe('/mi-cuenta');
      expect(canonicalizeInternalReturnUrl('/mis-eventos')).toBe('/mis-eventos');
      expect(canonicalizeInternalReturnUrl('/mis-eventos/')).toBe('/mis-eventos');
    });

    it('rechaza URLs externas, protocol-relative, esquemas y codificaciones peligrosas con fallback /', () => {
      expect(canonicalizeInternalReturnUrl(undefined)).toBe('/');
      expect(canonicalizeInternalReturnUrl(null)).toBe('/');
      expect(canonicalizeInternalReturnUrl('')).toBe('/');
      expect(canonicalizeInternalReturnUrl('   ')).toBe('/');
      expect(canonicalizeInternalReturnUrl('https://evil.example/mis-eventos')).toBe('/');
      expect(canonicalizeInternalReturnUrl('http://localhost:4200/mis-eventos')).toBe('/');
      expect(canonicalizeInternalReturnUrl('//evil.example/mis-eventos')).toBe('/');
      expect(canonicalizeInternalReturnUrl('/\\evil.example/mis-eventos')).toBe('/');
      expect(canonicalizeInternalReturnUrl('javascript:alert(1)')).toBe('/');
      expect(canonicalizeInternalReturnUrl('data:text/html,<script>alert(1)</script>')).toBe('/');
      expect(canonicalizeInternalReturnUrl('/%2f/evil.example')).toBe('/');
      expect(canonicalizeInternalReturnUrl('/%5cevil.example')).toBe('/');
      expect(canonicalizeInternalReturnUrl('/mis-eventos%00')).toBe('/');
      expect(canonicalizeInternalReturnUrl('/mis-eventos%0a')).toBe('/');
      expect(canonicalizeInternalReturnUrl('/%252f/evil.example')).toBe('/');
    });

    it('rechaza rutas API/media, QR guest, admin, auth/ciclos y traversal con fallback /', () => {
      expect(canonicalizeInternalReturnUrl('/api/v1/organizer/session')).toBe('/');
      expect(canonicalizeInternalReturnUrl('/api')).toBe('/');
      expect(canonicalizeInternalReturnUrl('/assets/logo.svg')).toBe('/');
      expect(canonicalizeInternalReturnUrl('/media/foto.jpg')).toBe('/');
      expect(canonicalizeInternalReturnUrl('/g/lookup_12345')).toBe('/');
      expect(canonicalizeInternalReturnUrl('/g')).toBe('/');
      expect(canonicalizeInternalReturnUrl('/admin')).toBe('/');
      expect(canonicalizeInternalReturnUrl('/admin/eventos')).toBe('/');
      expect(canonicalizeInternalReturnUrl('/ingresar')).toBe('/');
      expect(canonicalizeInternalReturnUrl('/ingresar?returnUrl=/mis-eventos')).toBe('/');
      expect(canonicalizeInternalReturnUrl('/solicitar-acceso')).toBe('/');
      expect(canonicalizeInternalReturnUrl('/mis-eventos/../admin')).toBe('/');
      expect(canonicalizeInternalReturnUrl('/./mis-eventos')).toBe('/');
      expect(canonicalizeInternalReturnUrl('/ruta-desconocida')).toBe('/');
    });
  });

  describe('Harness Angular exclusivo de pruebas (Router + Wildcard 404 + Foco)', () => {
    function setupHarness(allowDashboard = true) {
      const testRoutes: readonly PublicEntryRouteDescriptor[] = [
        {
          ...CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA.PUBLIC_HOME,
          component: TestHomeFixtureComponent
        },
        {
          ...CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA.ORGANIZER_DASHBOARD,
          component: TestDashboardFixtureComponent,
          canActivate: [() => (allowDashboard ? true : APPROVED_PUBLIC_ENTRY_PATHS.HOME)]
        },
        {
          ...CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA.GUEST_EVENT_ENTRY,
          component: TestGuestFixtureComponent
        },
        {
          ...CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA.NOT_FOUND,
          component: PublicNotFoundComponent
        }
      ];

      TestBed.configureTestingModule({
        imports: [TestRouterHarnessComponent],
        providers: [providePublicEntryRouter(testRoutes)]
      });

      const fixture = TestBed.createComponent(TestRouterHarnessComponent);
      const router = TestBed.inject(PublicEntryRouterService);
      return { fixture, router };
    }

    it('monta descriptores en el harness real, navega entre rutas, redacta lookupKey y gestiona foco en h1/h2', async () => {
      const { fixture, router } = setupHarness(true);
      await router.navigateByUrl('/');
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Inicio de prueba (Harness)');

      // Navegación a ancla del Home enfoca el h2 de la sección
      await router.navigateToHomeAnchor('como-funciona');
      await fixture.whenStable();
      fixture.detectChanges();
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(document.activeElement?.id).toBe('test-anchor-h2');

      // Navegación a ruta guest extrae lookupKey para el componente y lo redacta en safePathname
      await router.navigateByUrl('/g/secretLookupKey987');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="lookup-key"]').textContent).toBe(
        'secretLookupKey987'
      );
      expect(router.currentSafePath()).toBe('/g/[redacted]');
      expect(router.currentSafePath()).not.toContain('secretLookupKey987');
    });

    it('monta PublicNotFoundComponent (ErrorState/404) neutro en wildcard sin enumerar la ruta desconocida y permite volver al inicio', async () => {
      const { fixture, router } = setupHarness(true);
      await router.navigateByUrl('/ruta-privada-inexistente-999');
      await fixture.whenStable();
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Página no encontrada');
      expect(text).toContain('Volver al inicio');
      expect(text).not.toContain('ruta-privada-inexistente-999');

      const actionLink = fixture.nativeElement.querySelector(
        '.el-not-found__action'
      ) as HTMLAnchorElement;
      expect(actionLink).toBeTruthy();
      expect(actionLink.getAttribute('href')).toBe('/');

      actionLink.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Inicio de prueba (Harness)');
    });

    it('orienta navegación mediante guard sin otorgar autoridad propia cuando el guard redirige a /', async () => {
      const { fixture, router } = setupHarness(false);
      await router.navigateByUrl('/mis-eventos');
      await fixture.whenStable();
      fixture.detectChanges();

      expect(router.activeDescriptor()?.id).toBe('PUBLIC_HOME');
      expect(fixture.nativeElement.textContent).toContain('Inicio de prueba (Harness)');
    });
  });
});
