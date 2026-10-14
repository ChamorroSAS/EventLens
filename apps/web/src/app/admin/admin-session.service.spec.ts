import { describe, expect, it, vi } from 'vitest';
import { AdminSessionService } from './admin-session.service.js';

describe('AdminSessionService (EL-TK-235)', () => {
  it('keeps the initial state private and treats a 503 as unavailable, not anonymous', async () => {
    const service = new AdminSessionService();
    expect(service.state()).toBe('CHECKING');
    expect(service.principal()).toBeNull();

    vi.spyOn((service as any).client, 'GET').mockResolvedValue({
      data: undefined,
      response: { ok: false, status: 503, headers: new Headers() }
    });

    await service.refreshSession();
    expect(service.state()).toBe('UNAVAILABLE');
    expect(service.principal()).toBeNull();
  });

  it('uses the generated login endpoint, keeps CSRF transient, and canonicalizes returns', async () => {
    const service = new AdminSessionService();
    const post = vi.spyOn((service as any).client, 'POST').mockResolvedValue({
      data: { principal: { id: 'admin-1', identifier: 'operator' }, csrfToken: 'transient-token' },
      response: { ok: true, status: 200, headers: new Headers() }
    });

    const outcome = await service.login(
      { identifier: ' operator ', secret: 'secret-only-in-memory' },
      'https://outside.example/admin/eventos'
    );

    expect(post).toHaveBeenCalledWith('/api/v1/admin/auth/login', expect.objectContaining({
      body: { identifier: 'operator', secret: 'secret-only-in-memory' },
      headers: { 'X-EventLens-Admin-Client': '1' }
    }));
    expect(outcome).toEqual({ ok: true, returnDestination: '/admin/eventos' });
    expect(service.state()).toBe('ADMIN_ACTIVE');
    expect(service.getCsrfToken()).toBe('transient-token');
  });

  it('clears every registered private cache and does not claim success when logout acknowledgement fails', async () => {
    const service = new AdminSessionService();
    vi.spyOn((service as any).client, 'POST').mockResolvedValueOnce({
      data: { principal: { id: 'admin-1', identifier: 'operator' }, csrfToken: 'transient-token' },
      response: { ok: true, status: 200, headers: new Headers() }
    });
    await service.login({ identifier: 'operator', secret: 'secret' });

    const clearer = vi.fn();
    service.registerPrivateCacheClearer(clearer);
    vi.spyOn((service as any).client, 'POST').mockResolvedValueOnce({
      data: undefined,
      response: { ok: false, status: 503, headers: new Headers() }
    });

    const outcome = await service.logout();
    expect(outcome.status).toBe('UNCERTAIN');
    expect(service.state()).toBe('UNAVAILABLE');
    expect(service.principal()).toBeNull();
    expect(service.getCsrfToken()).toBeNull();
    expect(clearer).toHaveBeenCalled();
    expect(service.logoutUncertainty()).toContain('No se pudo confirmar');
  });

  it('keeps a valid same-principal cache through revalidation, but ignores a late refresh after logout begins', async () => {
    const service = new AdminSessionService();
    vi.spyOn((service as any).client, 'POST').mockResolvedValueOnce({
      data: { principal: { id: 'admin-1', identifier: 'operator' }, csrfToken: 'csrf' },
      response: { ok: true, status: 200, headers: new Headers() }
    });
    await service.login({ identifier: 'operator', secret: 'secret' });
    const clearer = vi.fn();
    service.registerPrivateCacheClearer(clearer);

    let resolveRefresh!: (value: unknown) => void;
    vi.spyOn((service as any).client, 'GET').mockReturnValueOnce(
      new Promise((resolve) => { resolveRefresh = resolve; }) as any
    );
    const refresh = service.refreshSession();
    expect(service.state()).toBe('ADMIN_ACTIVE');
    expect(service.isRevalidating()).toBe(true);
    expect(clearer).not.toHaveBeenCalled();

    vi.spyOn((service as any).client, 'POST').mockResolvedValueOnce({
      data: { outcome: 'LOGGED_OUT' },
      response: { ok: true, status: 200, headers: new Headers() }
    });
    await service.logout();
    resolveRefresh({
      data: { state: 'ADMIN_ACTIVE', principal: { id: 'admin-1', identifier: 'operator' } },
      response: { ok: true, status: 200, headers: new Headers() }
    });
    await refresh;

    expect(service.state()).toBe('ANONYMOUS');
    expect(service.principal()).toBeNull();
    expect(clearer).toHaveBeenCalled();
  });

  it('clears prior private caches when a new login creates a new session context', async () => {
    const service = new AdminSessionService();
    const post = vi.spyOn((service as any).client, 'POST');
    post.mockResolvedValueOnce({
      data: { principal: { id: 'admin-1', identifier: 'operator' }, csrfToken: 'first' },
      response: { ok: true, status: 200, headers: new Headers() }
    });
    await service.login({ identifier: 'operator', secret: 'first-secret' });
    const clearer = vi.fn();
    service.registerPrivateCacheClearer(clearer);
    post.mockResolvedValueOnce({
      data: { principal: { id: 'admin-2', identifier: 'other-operator' }, csrfToken: 'second' },
      response: { ok: true, status: 200, headers: new Headers() }
    });

    await service.login({ identifier: 'other-operator', secret: 'second-secret' });

    expect(clearer).toHaveBeenCalled();
    expect(service.principal()?.id).toBe('admin-2');
  });

  it('does not let a late logout failure replace a newer successful login', async () => {
    const service = new AdminSessionService();
    const post = vi.spyOn((service as any).client, 'POST');
    post.mockResolvedValueOnce({
      data: { principal: { id: 'admin-1', identifier: 'operator' }, csrfToken: 'first' },
      response: { ok: true, status: 200, headers: new Headers() }
    });
    await service.login({ identifier: 'operator', secret: 'first-secret' });
    let resolveLogout!: (value: unknown) => void;
    post.mockReturnValueOnce(new Promise(resolve => { resolveLogout = resolve; }) as any);
    const logout = service.logout();
    post.mockResolvedValueOnce({
      data: { principal: { id: 'admin-2', identifier: 'other-operator' }, csrfToken: 'second' },
      response: { ok: true, status: 200, headers: new Headers() }
    });
    await service.login({ identifier: 'other-operator', secret: 'second-secret' });
    resolveLogout({ data: undefined, response: { ok: false, status: 503, headers: new Headers() } });
    await logout;

    expect(service.state()).toBe('ADMIN_ACTIVE');
    expect(service.principal()?.id).toBe('admin-2');
    expect(service.logoutUncertainty()).toBeNull();
  });

  it('uses a one-request session-context token for an explicit logout retry and announces only confirmation', async () => {
    const service = new AdminSessionService();
    const post = vi.spyOn((service as any).client, 'POST')
      .mockResolvedValueOnce({
        data: { csrfToken: 'context-only-token' },
        response: { ok: true, status: 200, headers: new Headers() }
      })
      .mockResolvedValueOnce({
        data: { outcome: 'LOGGED_OUT' },
        response: { ok: true, status: 200, headers: new Headers() }
      });

    const outcome = await service.retryLogout();

    expect(outcome.status).toBe('CONFIRMED');
    expect(post).toHaveBeenNthCalledWith(1, '/api/v1/admin/auth/session-context', expect.anything());
    expect(post).toHaveBeenNthCalledWith(2, '/api/v1/admin/auth/logout', {
      headers: { 'X-CSRF-Token': 'context-only-token' }
    });
    expect(service.announcement()).toContain('cerró correctamente');
  });
});
