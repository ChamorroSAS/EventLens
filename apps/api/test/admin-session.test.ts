import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException
} from '@nestjs/common';
import {
  extractAdminSessionCookie,
  extractHostAdminSessionCookie,
  type RecoveryAuthorityPort
} from '@eventlens/identity';
import { AdminSessionController } from '../src/identity/admin-session.controller.js';
import { AdminSessionService } from '../src/identity/admin-session.service.js';

describe('AdminSessionController & AdminSessionService (EL-TK-233)', () => {
  const dummyConfig = {
    port: 3000,
    host: '127.0.0.1',
    databaseUrl: 'postgresql://local:local@localhost:5432/local',
    databaseTimeoutMs: 2000,
    webOrigin: 'https://admin.eventlens.test',
    publicEntryBaseUrl: 'https://eventlens.test',
    identityPepperSecret: 'eventlens-local-dev-pepper-secret-0123456789abcdef'
  };

  it('mounts below the application global prefix without duplicating api/v1', () => {
    expect(Reflect.getMetadata('path', AdminSessionController)).toBe('admin/auth');
  });

  it('secure host cookie has no legacy fallback, rejects malformed, empty or duplicated values', () => {
    expect(extractHostAdminSessionCookie('__Host-el_admin_session=valid-token')).toBe('valid-token');
    for (const cookie of ['el_admin_session=legacy', '__Host-el_admin_session=; el_admin_session=legacy', '__Host-el_admin_session=%E0%A4%A; el_admin_session=legacy', '__Host-el_admin_session=a; __Host-el_admin_session=b']) {
      expect(extractHostAdminSessionCookie(cookie)).toBeUndefined();
    }
  });

  it('denies unconfigured authority before database reads or writes and preserves explicit DI', async () => {
    const run = vi.fn();
    const service = new AdminSessionService({ transactions: { run } } as any, dummyConfig);
    await expect(service.loginAdmin({ identifier: 'admin@example.test', secret: 'secret', originHeader: dummyConfig.webOrigin, clientHeader: '1' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.getSessionProjection('token')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.renewSessionContext({ sessionToken: 'token', originHeader: dummyConfig.webOrigin, clientHeader: '1' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.logoutAdmin({ sessionToken: 'token', originHeader: dummyConfig.webOrigin, csrfTokenHeader: 'csrf' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(run).not.toHaveBeenCalled();
    const response = { setHeader: vi.fn() };
    await expect(new AdminSessionController(service).getSession({ headers: { cookie: '__Host-el_admin_session=token' } }, response)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    await expect(service.getRecoveryAuthority().getRecoveryEpoch()).rejects.toMatchObject({ code: 'AUTHORITY_UNAVAILABLE' });
    const port: RecoveryAuthorityPort = { getRecoveryEpoch: async () => 1n, getCredentialRevision: async () => 1n, getAdminAuthWatermark: async () => 1n };
    expect(new AdminSessionService({ transactions: { run } } as any, dummyConfig, port).getRecoveryAuthority()).toBe(port);
  });

  it('1. Cookie extraction: extracts __Host-el_admin_session safely and ignores malformed inputs', () => {
    expect(extractAdminSessionCookie(undefined)).toBeUndefined();
    expect(extractAdminSessionCookie('')).toBeUndefined();
    expect(
      extractAdminSessionCookie('foo=bar; __Host-el_admin_session=secret-session-token-123; Path=/')
    ).toBe('secret-session-token-123');
    expect(extractAdminSessionCookie('__Host-el_admin_session=%E0%A4%A')).toBeUndefined();
    expect(extractAdminSessionCookie('el_admin_session=fallback-token-456')).toBe('fallback-token-456');
  });

  it('2. Login: enforces Origin exacto and X-EventLens-Admin-Client header', async () => {
    const mockDb = { transactions: { run: vi.fn() } };
    const mockAuthority: RecoveryAuthorityPort = {
      getRecoveryEpoch: async () => 1n,
      getCredentialRevision: async () => 1n,
      getAdminAuthWatermark: async () => 1n
    };
    const service = new AdminSessionService(mockDb as any, dummyConfig, mockAuthority);
    const controller = new AdminSessionController(service);

    const res = { setHeader: vi.fn() };

    // Fails without valid Origin
    await expect(
      controller.login(
        { identifier: 'admin@eventlens.test', secret: 'ValidSecret123!' },
        { headers: { origin: 'https://evil.attacker.com', 'x-eventlens-admin-client': '1' } },
        res
      )
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Fails without X-EventLens-Admin-Client: 1
    await expect(
      controller.login(
        { identifier: 'admin@eventlens.test', secret: 'ValidSecret123!' },
        { headers: { origin: 'https://admin.eventlens.test' } },
        res
      )
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Fails on missing identifier or secret
    await expect(
      controller.login(
        { identifier: '', secret: '' },
        { headers: { origin: 'https://admin.eventlens.test', 'x-eventlens-admin-client': '1' } },
        res
      )
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('3. Login exitoso: emite Set-Cookie __Host-el_admin_session, Cache-Control: no-store y proyección sin secretos', async () => {
    const mockAuthService = {
      authenticate: vi.fn().mockResolvedValue({
        actorContext: {
          principalId: 'adm-001',
          identifier: 'admin@eventlens.test',
          sessionId: 'sess-001',
          authTime: new Date('2026-10-13T20:00:00Z')
        },
        sessionToken: 'opaque-token-never-in-body',
        csrfToken: 'csrf-token-123',
        cookieSpec: {
          name: '__Host-el_admin_session',
          value: 'opaque-token-never-in-body',
          httpOnly: true,
          secure: true,
          sameSite: 'Strict',
          path: '/',
          maxAgeSeconds: 28800
        }
      })
    };

    const mockService = {
      loginAdmin: vi.fn().mockImplementation(async (params) => {
        if (params.clientHeader !== '1' || params.originHeader !== dummyConfig.webOrigin) {
          throw new ForbiddenException();
        }
        return {
          principal: { id: 'adm-001', identifier: 'admin@eventlens.test' },
          csrfToken: 'csrf-token-123',
          setCookieHeaders: [
            '__Host-el_admin_session=opaque-token-never-in-body; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800'
          ]
        };
      })
    } as unknown as AdminSessionService;

    const controller = new AdminSessionController(mockService);
    const headers: Record<string, string | string[]> = {};
    const res = {
      setHeader: (name: string, value: string | string[]) => {
        headers[name.toLowerCase()] = value;
      }
    };

    const result = await controller.login(
      { identifier: 'admin@eventlens.test', secret: 'SecretPass' },
      {
        headers: {
          origin: 'https://admin.eventlens.test',
          'x-eventlens-admin-client': '1'
        }
      },
      res
    );

    expect(result.principal).toEqual({ id: 'adm-001', identifier: 'admin@eventlens.test' });
    expect(result.csrfToken).toBe('csrf-token-123');
    // Session token is strictly in cookie, NOT in return body
    expect((result as any).sessionToken).toBeUndefined();
    expect(headers['cache-control']).toBe('no-store');
    expect(headers['set-cookie']).toContain(
      '__Host-el_admin_session=opaque-token-never-in-body; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800'
    );
  });

  it('4. Get Session: retorna proyección mínima validada con Cache-Control: no-store y 401 si no hay cookie', async () => {
    const mockService = {
      getSessionProjection: vi.fn().mockImplementation(async (token) => {
        if (!token) throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
        return {
          state: 'ADMIN_ACTIVE',
          principal: { id: 'adm-001', identifier: 'admin@eventlens.test' },
          authTime: '2026-10-13T20:00:00.000Z'
        };
      })
    } as unknown as AdminSessionService;

    const controller = new AdminSessionController(mockService);
    const headers: Record<string, string | string[]> = {};
    const res = {
      setHeader: (name: string, value: string | string[]) => {
        headers[name.toLowerCase()] = value;
      }
    };

    // Sin cookie -> 401
    await expect(controller.getSession({ headers: {} }, res)).rejects.toBeInstanceOf(
      UnauthorizedException
    );

    // Con cookie válida -> 200 con proyección mínima
    const proj = await controller.getSession(
      { headers: { cookie: '__Host-el_admin_session=valid-admin-token' } },
      res
    );
    expect(proj.state).toBe('ADMIN_ACTIVE');
    expect(proj.principal?.identifier).toBe('admin@eventlens.test');
    expect(headers['cache-control']).toBe('no-store');
  });

  it('5. Contexto (session-context): renueva solo CSRF sin alterar sesión ni TTL', async () => {
    const mockService = {
      renewSessionContext: vi.fn().mockImplementation(async (params) => {
        if (!params.sessionToken) throw new UnauthorizedException();
        if (params.clientHeader !== '1' || params.originHeader !== dummyConfig.webOrigin) {
          throw new ForbiddenException();
        }
        return { csrfToken: 'new-rotated-csrf-token-456' };
      })
    } as unknown as AdminSessionService;

    const controller = new AdminSessionController(mockService);
    const headers: Record<string, string | string[]> = {};
    const res = {
      setHeader: (name: string, value: string | string[]) => {
        headers[name.toLowerCase()] = value;
      }
    };

    const result = await controller.renewSessionContext(
      {
        headers: {
          cookie: '__Host-el_admin_session=valid-session-token',
          origin: 'https://admin.eventlens.test',
          'x-eventlens-admin-client': '1'
        }
      },
      res
    );

    expect(result.csrfToken).toBe('new-rotated-csrf-token-456');
    expect(headers['cache-control']).toBe('no-store');
  });

  it('6. Logout: exige Origin y X-CSRF-Token, revoca sesión y limpia cookie con Max-Age=0', async () => {
    const mockService = {
      logoutAdmin: vi.fn().mockImplementation(async (params) => {
        if (params.originHeader !== dummyConfig.webOrigin) throw new ForbiddenException();
        if (!params.csrfTokenHeader) throw new ForbiddenException({ code: 'CSRF_VALIDATION_FAILED' });
        return {
          outcome: 'LOGGED_OUT',
          setCookieHeaders: [
            '__Host-el_admin_session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0'
          ]
        };
      })
    } as unknown as AdminSessionService;

    const controller = new AdminSessionController(mockService);
    const headers: Record<string, string | string[]> = {};
    const res = {
      setHeader: (name: string, value: string | string[]) => {
        headers[name.toLowerCase()] = value;
      }
    };

    // Fails without X-CSRF-Token
    await expect(
      controller.logout(
        {
          headers: {
            cookie: '__Host-el_admin_session=valid-token',
            origin: 'https://admin.eventlens.test'
          }
        },
        res
      )
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Con CSRF y Origin -> 200 LOGGED_OUT y cookie limpiada
    const result = await controller.logout(
      {
        headers: {
          cookie: '__Host-el_admin_session=valid-token',
          origin: 'https://admin.eventlens.test',
          'x-csrf-token': 'valid-csrf-token'
        }
      },
      res
    );

    expect(result.outcome).toBe('LOGGED_OUT');
    expect(headers['cache-control']).toBe('no-store');
    expect(headers['set-cookie']).toContain(
      '__Host-el_admin_session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0'
    );
  });

  it('7. Falla cerrada: 503 ServiceUnavailableException cuando la RecoveryAuthority no está disponible o barrera activa', async () => {
    const mockDb = { transactions: { run: vi.fn() } };
    const failingAuthority: RecoveryAuthorityPort = {
      getRecoveryEpoch: vi.fn().mockRejectedValue(new Error('RECOVERY_STORAGE_OFFLINE')),
      getCredentialRevision: vi.fn(),
      getAdminAuthWatermark: vi.fn()
    };

    const service = new AdminSessionService(mockDb as any, dummyConfig, failingAuthority);

    await expect(
      service.loginAdmin({
        identifier: 'admin@eventlens.test',
        secret: 'Secret',
        originHeader: dummyConfig.webOrigin,
        clientHeader: '1'
      })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
