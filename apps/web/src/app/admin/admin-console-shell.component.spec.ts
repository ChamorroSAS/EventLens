import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminConsoleShellComponent } from './admin-console-shell.component.js';
import { AdminSessionService } from './admin-session.service.js';

@Component({
  template: `
    <eventlens-admin-console-shell activeNav="eventos">
      <div id="projected-content" class="custom-projected">Contenido Proyectado de Prueba</div>
    </eventlens-admin-console-shell>
  `,
  standalone: true,
  imports: [AdminConsoleShellComponent]
})
class TestHostComponent {}

describe('AdminConsoleShellComponent (paridad visual con el panel del organizador)', () => {
  function createFixture(): ComponentFixture<AdminConsoleShellComponent> {
    return TestBed.createComponent(AdminConsoleShellComponent);
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminConsoleShellComponent, TestHostComponent],
      providers: [provideRouter([])]
    }).compileComponents();
  });

  it('Escenario 1: renderiza identidad de marca, rol de administrador, navegación y footer', () => {
    const fixture = createFixture();
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;

    const logoImg = element.querySelector('.brand-title img.brand-logo') as HTMLImageElement;
    expect(logoImg).not.toBeNull();
    expect(logoImg.getAttribute('src')).toBe('assets/branding/phoeve/logo-primary.png');
    expect(logoImg.getAttribute('alt')).toBe('Phoeve');

    const brandBadge = element.querySelector('.brand-badge');
    expect(brandBadge?.textContent?.trim()).toBe('Administrador');

    const organizersLink = element.querySelector('[data-testid="sidebar-nav-organizers"]') as HTMLAnchorElement;
    const eventsLink = element.querySelector('[data-testid="sidebar-nav-events"]') as HTMLAnchorElement;
    expect(organizersLink.getAttribute('href')).toBe('/admin/organizadores');
    expect(eventsLink.getAttribute('href')).toBe('/admin/eventos');

    const footerText = element.querySelector('.footer-text');
    expect(footerText?.textContent).toContain('Phoeve BETA');

    const logout = element.querySelector('.sidebar-logout-btn') as HTMLButtonElement;
    expect(logout).not.toBeNull();
    expect(logout.textContent).toContain('Cerrar sesión');
  });

  it('Escenario 2: marca el elemento activo según activeNav', () => {
    const fixture = createFixture();
    fixture.componentInstance.activeNav = 'organizadores';
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const organizersLink = element.querySelector('[data-testid="sidebar-nav-organizers"]') as HTMLElement;
    const eventsLink = element.querySelector('[data-testid="sidebar-nav-events"]') as HTMLElement;

    expect(organizersLink.classList.contains('is-active')).toBe(true);
    expect(eventsLink.classList.contains('is-active')).toBe(false);
  });

  it('Escenario 3: fallback accesible cuando el logo falla', () => {
    const fixture = createFixture();
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const logoImg = element.querySelector('img.brand-logo') as HTMLImageElement;
    logoImg.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(fixture.componentInstance.logoFailed).toBe(true);
    expect(element.querySelector('img.brand-logo')).toBeNull();
    expect(element.querySelector('.brand-fallback-text')?.textContent?.trim()).toBe('Phoeve');
  });

  it('Escenario 4: muestra el identificador del administrador cuando la sesión está activa', async () => {
    TestBed.resetTestingModule();
    const session = {
      state: vi.fn(() => 'ADMIN_ACTIVE'),
      principal: vi.fn(() => ({ id: 'admin-1', identifier: 'ops@phoeve.test' })),
      logout: vi.fn(async () => undefined)
    };
    await TestBed.configureTestingModule({
      imports: [AdminConsoleShellComponent],
      providers: [provideRouter([]), { provide: AdminSessionService, useValue: session }]
    }).compileComponents();

    const fixture = createFixture();
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.sidebar-user-email')?.textContent?.trim()).toBe('ops@phoeve.test');
    expect(element.querySelector('.sidebar-avatar-fallback')?.textContent?.trim()).toBe('O');
  });

  it('Escenario 5: cerrar sesión delega en el servicio y navega al acceso administrativo', async () => {
    TestBed.resetTestingModule();
    const session = {
      state: vi.fn(() => 'ADMIN_ACTIVE'),
      principal: vi.fn(() => ({ id: 'admin-1', identifier: 'ops@phoeve.test' })),
      logout: vi.fn(async () => undefined)
    };
    await TestBed.configureTestingModule({
      imports: [AdminConsoleShellComponent],
      providers: [provideRouter([]), { provide: AdminSessionService, useValue: session }]
    }).compileComponents();

    const fixture = createFixture();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture.detectChanges();

    const logout = fixture.nativeElement.querySelector('.sidebar-logout-btn') as HTMLButtonElement;
    logout.click();
    await fixture.whenStable();

    expect(session.logout).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/admin/ingresar');
  });

  it('Escenario 6: preserva el aislamiento y proyecta el contenido del panel', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.admin-console-shell')).not.toBeNull();
    expect(element.querySelector('.shell-main')).not.toBeNull();

    const projected = element.querySelector('#projected-content') as HTMLElement;
    expect(projected).not.toBeNull();
    expect(projected.textContent).toBe('Contenido Proyectado de Prueba');
  });
});
