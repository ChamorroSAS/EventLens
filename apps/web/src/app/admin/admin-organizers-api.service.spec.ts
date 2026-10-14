import { describe, expect, it, vi } from 'vitest';
import { AdminOrganizersApiService } from './admin-organizers-api.service.js';

function service(session: Record<string, unknown> = {}) {
  const base = {
    registerPrivateCacheClearer: vi.fn(),
    getCsrfToken: vi.fn(() => 'csrf-token'),
    renewSessionContext: vi.fn(async () => true),
    invalidateProtectedRead: vi.fn(),
    state: vi.fn(() => 'ADMIN_ACTIVE')
  };
  const merged = { ...base, ...session } as any;
  return { instance: new AdminOrganizersApiService(merged), session: merged };
}

function postOnce(instance: AdminOrganizersApiService, error: unknown, status: number) {
  vi.spyOn((instance as any).client, 'POST').mockResolvedValue({
    data: undefined,
    error,
    response: { ok: false, status, headers: new Headers() }
  } as any);
}

describe('AdminOrganizersApiService error differentiation (EL-TK-242)', () => {
  const body = { email: 'beta@example.test', reason: 'Beta', idempotencyKey: '00000000-0000-4000-8000-000000000000' };

  // Domain codes are the intended contract. The platform error filter forwards them
  // through an explicit allowlist (EL-TK-242, BLOCKER-1 resolved in
  // apps/api/src/platform/http/error.filter.ts); these cases pin the mapping.
  it('maps a domain EMAIL_EXISTS code to a distinct, actionable message', async () => {
    const { instance } = service();
    postOnce(instance, { code: 'EMAIL_EXISTS' }, 409);
    await expect(instance.create(body)).rejects.toThrow(/Ya existe una cuenta con ese correo/);
  });

  it('maps domain IDEMPOTENCY_CONFLICT and STALE_REVISION differently', async () => {
    const conflict = service();
    postOnce(conflict.instance, { code: 'IDEMPOTENCY_CONFLICT' }, 409);
    await expect(conflict.instance.create(body)).rejects.toThrow(/ya estaba registrada con otros datos/);

    const stale = service();
    postOnce(stale.instance, { code: 'STALE_REVISION' }, 409);
    await expect(stale.instance.create(body)).rejects.toThrow(/La cuenta cambió desde que abriste el formulario/);

    const invalid = service();
    postOnce(invalid.instance, { code: 'INVALID_ARGUMENT' }, 422);
    await expect(invalid.instance.create(body)).rejects.toThrow(/Revisa el correo, el nombre y el motivo/);
  });

  // Current server shape: the global PublicErrorFilter maps by status only, so the
  // client must still degrade gracefully to the transport status.
  it('falls back to the sanitized transport-status code the server actually sends', async () => {
    const conflict = service();
    postOnce(conflict.instance, { code: 'CONFLICT' }, 409);
    await expect(conflict.instance.create(body)).rejects.toThrow(/La cuenta cambió o la operación ya estaba registrada/);

    const validation = service();
    postOnce(validation.instance, { code: 'VALIDATION_ERROR' }, 422);
    await expect(validation.instance.create(body)).rejects.toThrow(/Revisa el correo, el nombre y el motivo/);

    const dependency = service();
    postOnce(dependency.instance, { code: 'DEPENDENCY_UNAVAILABLE' }, 503);
    await expect(dependency.instance.create(body)).rejects.toThrow(/no se habilitará acceso sin confirmación/);
  });

  it('does not expose the raw server body in the message', async () => {
    const { instance } = service();
    postOnce(instance, { code: 'CONFLICT', message: 'postgresql://secret:password@host/private' }, 409);
    const failure = await instance.create(body).catch((error: Error) => error);
    expect(String(failure)).not.toMatch(/postgresql|secret|private/);
  });

  it('clears the private session projection on 401 and renews CSRF when missing', async () => {
    const missingCsrf = service({ getCsrfToken: vi.fn(() => null), state: vi.fn(() => 'ANONYMOUS') });
    postOnce(missingCsrf.instance, { code: 'UNAUTHENTICATED' }, 401);
    await expect(missingCsrf.instance.create(body)).rejects.toThrow(/Tu sesión expiró/);
    expect(missingCsrf.session.renewSessionContext).toHaveBeenCalled();
    expect(missingCsrf.session.invalidateProtectedRead).toHaveBeenCalledWith(401);
  });

  it('reports an authority failure as 503 instead of expiring the session', async () => {
    const authority = service({ getCsrfToken: vi.fn(() => null), renewSessionContext: vi.fn(async () => false), state: vi.fn(() => 'UNAVAILABLE') });
    await expect(authority.instance.create(body)).rejects.toThrow(/no se habilitará acceso sin confirmación/);
    expect(authority.session.invalidateProtectedRead).not.toHaveBeenCalledWith(401);
  });
});
