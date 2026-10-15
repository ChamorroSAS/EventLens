import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { AdminReadOnlyShellComponent } from './admin-read-only-shell.component.js';
import { AdminSessionService } from './admin-session.service.js';
import { provideRouter } from '@angular/router';

describe('AdminReadOnlyShellComponent (EL-TK-235)', () => {
  it('offers login and explicit reconciliation after authorization is lost', async () => {
    const session = { state: vi.fn(() => 'ANONYMOUS'), isRevalidating: vi.fn(() => false),
      logoutUncertainty: vi.fn(() => 'No se pudo confirmar el cierre'),
      retryLogout: vi.fn(async () => ({ status: 'UNCERTAIN' })), refreshSession: vi.fn() };
    TestBed.configureTestingModule({ imports: [AdminReadOnlyShellComponent], providers: [
      provideRouter([]), { provide: AdminSessionService, useValue: session }
    ] });
    const fixture = TestBed.createComponent(AdminReadOnlyShellComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const loginLink = Array.from(element.querySelectorAll('a')).find((anchor) =>
      anchor.getAttribute('href')?.includes('/admin/ingresar')
    );
    expect(loginLink?.getAttribute('href')).toContain('/admin/ingresar');
    expect(element.textContent).toContain('Reintentar cierre');
    expect(element.textContent).not.toContain('Comprobando');
    await fixture.componentInstance.retry();
    expect(session.retryLogout).toHaveBeenCalledOnce();
    expect(session.refreshSession).not.toHaveBeenCalled();
  });
  it('renders no private content while the authority is unavailable and offers retry', async () => {
    const session = {
      state: vi.fn(() => 'UNAVAILABLE'),
      isRevalidating: vi.fn(() => false),
      logoutUncertainty: vi.fn(() => null),
      refreshSession: vi.fn(async () => ({ state: 'UNAVAILABLE' })),
      logout: vi.fn()
    };
    await TestBed.configureTestingModule({
      imports: [AdminReadOnlyShellComponent],
      providers: [provideRouter([]), { provide: AdminSessionService, useValue: session }]
    }).compileComponents();
    const fixture: ComponentFixture<AdminReadOnlyShellComponent> =
      TestBed.createComponent(AdminReadOnlyShellComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('no está disponible');
    expect(element.textContent).not.toContain('búsqueda administrativa estará disponible aquí');
    await fixture.componentInstance.retry();
    expect(session.refreshSession).toHaveBeenCalledOnce();
  });
});
