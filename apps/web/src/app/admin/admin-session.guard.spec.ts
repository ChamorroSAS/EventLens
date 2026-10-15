import { TestBed } from '@angular/core/testing';
import { Router, type RouterStateSnapshot } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { adminSessionGuard } from './admin-session.guard.js';
import { AdminSessionService } from './admin-session.service.js';

describe('adminSessionGuard (EL-TK-235)', () => {
  it('revalidates and redirects an anonymous request only to the allowlisted admin login flow', async () => {
    const session = { logoutUncertainty: vi.fn(() => null), refreshSession: vi.fn(async () => ({ state: 'ANONYMOUS' })) };
    const tree = { toString: () => '/admin/ingresar?returnUrl=%2Fadmin%2Feventos' };
    const router = { createUrlTree: vi.fn(() => tree) };
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminSessionService, useValue: session },
        { provide: Router, useValue: router }
      ]
    });

    const result = await TestBed.runInInjectionContext(() =>
      adminSessionGuard({} as never, { url: '/admin/eventos' } as RouterStateSnapshot)
    );

    expect(session.refreshSession).toHaveBeenCalledOnce();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/admin/ingresar'], {
      queryParams: { returnUrl: '/admin/eventos' }
    });
    expect(result).toBe(tree);
  });

  it('allows the no-data unavailable shell without treating it as an active session', async () => {
    const session = { logoutUncertainty: vi.fn(() => null), refreshSession: vi.fn(async () => ({ state: 'UNAVAILABLE' })) };
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminSessionService, useValue: session },
        { provide: Router, useValue: { createUrlTree: vi.fn() } }
      ]
    });
    const result = await TestBed.runInInjectionContext(() =>
      adminSessionGuard({} as never, { url: '/admin/eventos' } as RouterStateSnapshot)
    );
    expect(result).toBe(true);
  });

  it('does not revalidate an uncertain logout from a deep link', async () => {
    const session = { logoutUncertainty: vi.fn(() => 'retry required'), refreshSession: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminSessionService, useValue: session },
        { provide: Router, useValue: { createUrlTree: vi.fn() } }
      ]
    });

    const result = await TestBed.runInInjectionContext(() =>
      adminSessionGuard({} as never, { url: '/admin/eventos' } as RouterStateSnapshot)
    );

    expect(result).toBe(true);
    expect(session.refreshSession).not.toHaveBeenCalled();
  });
});
