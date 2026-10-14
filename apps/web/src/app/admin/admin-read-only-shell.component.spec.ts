import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { AdminReadOnlyShellComponent } from './admin-read-only-shell.component.js';
import { AdminSessionService } from './admin-session.service.js';

describe('AdminReadOnlyShellComponent (EL-TK-235)', () => {
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
      providers: [{ provide: AdminSessionService, useValue: session }]
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
