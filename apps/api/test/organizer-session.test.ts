import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException
} from '@nestjs/common';
import { OrganizerSessionController } from '../src/identity/organizer-session.controller.js';
import {
  OrganizerSessionService,
  extractOrganizerSessionCookie
} from '../src/identity/organizer-session.service.js';

describe('OrganizerSessionController & OrganizerSessionService (EL-TK-205)', () => {
  it('extracts __Host-el_session cookie safely without leaking or throwing on malformed cookies', () => {
    expect(extractOrganizerSessionCookie(undefined)).toBeUndefined();
    expect(extractOrganizerSessionCookie('theme=dark; __Host-el_session=token-abc-123; Path=/')).toBe(
      'token-abc-123'
    );
    expect(extractOrganizerSessionCookie('__Host-el_session=%E0%A4%A')).toBeUndefined();
  });

  it('returns ANONYMOUS projection with Cache-Control: no-store and without X-CSRF-Token or private data', async () => {
    const mockService = {
      getEffectiveSessionProjection: vi.fn().mockResolvedValue({
        projection: {
          state: 'ANONYMOUS',
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
        },
        transientCsrfToken: undefined
      })
    } as unknown as OrganizerSessionService;

    const controller = new OrganizerSessionController(mockService);
    const headers: Record<string, string> = {};
    const result = await controller.getSessionProjection(
      { headers: {} },
      {
        setHeader: (name: string, value: string) => {
          headers[name.toLowerCase()] = value;
        }
      }
    );

    expect(result.state).toBe('ANONYMOUS');
    expect(result.account).toBeNull();
    expect(headers['cache-control']).toBe('no-store');
    expect(headers['x-csrf-token']).toBeUndefined();
  });

  it('surfaces 503 ServiceUnavailableException when identity authority cannot confirm session', async () => {
    const mockDatabase = {
      transactions: {
        run: vi.fn().mockRejectedValue(new Error('database connection refused'))
      }
    };
    const service = new OrganizerSessionService(mockDatabase as any, {
      port: 3000,
      host: '127.0.0.1',
      databaseUrl: 'postgresql://local:local@localhost:5432/local',
      databaseTimeoutMs: 2000,
      webOrigin: 'http://localhost:4200',
      publicEntryBaseUrl: 'http://localhost:4200',
      identityPepperSecret: 'eventlens-local-dev-pepper-secret-0123456789abcdef'
    });

    await expect(service.getEffectiveSessionProjection('some-session-token')).rejects.toBeInstanceOf(
      ServiceUnavailableException
    );
  });

  it('enforces Origin and X-CSRF-Token on mutating organizer session validations', async () => {
    const mockDatabase = {
      transactions: {
        run: vi.fn()
      }
    };
    const service = new OrganizerSessionService(mockDatabase as any, {
      port: 3000,
      host: '127.0.0.1',
      databaseUrl: 'postgresql://local:local@localhost:5432/local',
      databaseTimeoutMs: 2000,
      webOrigin: 'http://localhost:4200',
      publicEntryBaseUrl: 'http://localhost:4200',
      identityPepperSecret: 'eventlens-local-dev-pepper-secret-0123456789abcdef'
    });

    await expect(
      service.validateMutatingOrganizerSession({
        sessionToken: 'tok',
        csrfToken: 'csrf',
        originHeader: 'https://evil.example'
      })
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.validateMutatingOrganizerSession({
        sessionToken: undefined,
        csrfToken: 'csrf',
        originHeader: 'http://localhost:4200'
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(
      service.validateMutatingOrganizerSession({
        sessionToken: 'tok',
        csrfToken: '',
        originHeader: 'http://localhost:4200'
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
