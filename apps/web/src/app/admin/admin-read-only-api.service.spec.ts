import { describe, expect, it, vi } from 'vitest';
import { AdminReadOnlyApiService } from './admin-read-only-api.service.js';

describe('AdminReadOnlyApiService (EL-TK-236)', () => {
  it('ignores a stale failure after private state was cleared for a newer session', async () => {
    let clear!: () => void;
    const session = { invalidateProtectedRead: vi.fn(), registerPrivateCacheClearer: (callback: () => void) => { clear = callback; } } as any;
    const service = new AdminReadOnlyApiService(session);
    let resolve!: (value: any) => void;
    vi.spyOn((service as any).client, 'GET').mockReturnValue(new Promise(done => { resolve = done; }) as any);
    const pending = service.search({ entityType: 'ALL', page: 1, limit: 20 });
    clear();
    resolve({ response: { ok: false, status: 503 } });
    expect(await pending).toEqual({ ok: false, status: 0, kind: 'CANCELLED' });
    expect(session.invalidateProtectedRead).not.toHaveBeenCalled();
  });
  it('fails closed on a service failure without retaining or exposing its body', async () => {
    const session = { invalidateProtectedRead: vi.fn(), registerPrivateCacheClearer: vi.fn() } as any;
    const service = new AdminReadOnlyApiService(session);
    vi.spyOn((service as any).client, 'GET').mockResolvedValue({
      data: undefined,
      error: { message: 'internal detail must not reach the UI' },
      response: { ok: false, status: 503, headers: new Headers() }
    });

    const result = await service.search({ entityType: 'ALL', page: 1, limit: 20 });

    expect(result).toEqual({ ok: false, status: 503, kind: 'UNAVAILABLE' });
    expect(session.invalidateProtectedRead).toHaveBeenCalledWith(503);
  });

  it('does not clear the session for a locally invalid filter response', async () => {
    const session = { invalidateProtectedRead: vi.fn(), registerPrivateCacheClearer: vi.fn() } as any;
    const service = new AdminReadOnlyApiService(session);
    vi.spyOn((service as any).client, 'GET').mockResolvedValue({
      data: undefined,
      response: { ok: false, status: 400, headers: new Headers() }
    });

    await service.search({ entityType: 'ALL', page: 1, limit: 20 });

    expect(session.invalidateProtectedRead).not.toHaveBeenCalled();
  });
});
