import { describe, expect, it, vi } from 'vitest';
import { OrganizerSessionService } from './organizer-session.service';

describe('OrganizerSessionService (EL-TK-205 & EL-TK-207)', () => {
  it('starts in CHECKING without private capabilities or account data', () => {
    const service = new OrganizerSessionService();
    expect(service.state()).toBe('CHECKING');
    expect(service.account()).toBeNull();
    expect(service.capabilities()).toEqual({
      canSignIn: false,
      canRequestBetaAccess: true,
      canAccessMyEvents: false,
      canAccessMyAccount: false,
      canManageSessions: false,
      canManageAccountDeletion: false,
      isDeletionRestricted: false,
      canSignOut: false
    });
  });

  it('projects ORGANIZER_RESTRICTED_DELETION when account is PENDING_DELETION without granting Mis eventos capability', async () => {
    const service = new OrganizerSessionService();
    vi.spyOn((service as any).client, 'GET').mockResolvedValue({
      data: {
        state: 'ORGANIZER_RESTRICTED_DELETION',
        capabilities: {
          canSignIn: false,
          canRequestBetaAccess: true,
          canAccessMyEvents: false,
          canAccessMyAccount: true,
          canManageSessions: false,
          canManageAccountDeletion: true,
          isDeletionRestricted: true,
          canSignOut: true
        },
        account: {
          email: 'restricted@eventlens.test',
          emailVerified: true,
          accountStatus: 'PENDING_DELETION'
        }
      },
      error: undefined,
      response: {
        ok: true,
        status: 200,
        headers: new Headers({ 'x-csrf-token': 'transient-csrf-123' })
      }
    });

    const snapshot = await service.refreshSessionProjection();
    expect(snapshot.state).toBe('ORGANIZER_RESTRICTED_DELETION');
    expect(snapshot.capabilities.canAccessMyEvents).toBe(false);
    expect(snapshot.capabilities.canManageSessions).toBe(false);
    expect(snapshot.capabilities.canAccessMyAccount).toBe(true);
    expect(snapshot.capabilities.canManageAccountDeletion).toBe(true);
    expect(snapshot.capabilities.isDeletionRestricted).toBe(true);
    expect(snapshot.capabilities.canSignOut).toBe(true);
    expect(snapshot.account?.accountStatus).toBe('PENDING_DELETION');
    expect(service.getCsrfToken()).toBe('transient-csrf-123');
    // En modo restringido, returnUrl a /mis-eventos no está autorizado y vuelve a /
    expect(service.resolveAuthorizedReturnDestination('/mis-eventos')).toBe('/');
    expect(service.resolveAuthorizedReturnDestination('/mi-cuenta')).toBe('/mi-cuenta');
  });

  it('distinguishes authority/transport failure (UNAVAILABLE) from confirmed logout (ANONYMOUS) and grants zero private capabilities', async () => {
    const service = new OrganizerSessionService();
    vi.spyOn((service as any).client, 'GET').mockResolvedValue({
      data: undefined,
      error: {
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'El servicio no está disponible temporalmente.',
        correlationId: '00000000-0000-4000-8000-000000000001'
      },
      response: {
        ok: false,
        status: 503,
        headers: new Headers()
      }
    });

    const snapshot = await service.refreshSessionProjection();
    expect(snapshot.state).toBe('UNAVAILABLE');
    expect(snapshot.state).not.toBe('ANONYMOUS');
    expect(snapshot.account).toBeNull();
    expect(service.getCsrfToken()).toBeNull();
  });

  it('EL-TK-207: withdraws private presentation and informs uncertain outcome without announcing revocation when logout ACK fails', async () => {
    const service = new OrganizerSessionService();
    service.applyServerProjection(
      {
        state: 'ORGANIZER_ACTIVE',
        capabilities: {
          canSignIn: false,
          canRequestBetaAccess: true,
          canAccessMyEvents: true,
          canAccessMyAccount: true,
          canManageSessions: true,
          canManageAccountDeletion: true,
          isDeletionRestricted: false,
          canSignOut: true
        },
        account: {
          email: 'active@eventlens.test',
          emailVerified: true,
          accountStatus: 'ACTIVE'
        }
      },
      'csrf-active-1'
    );

    let clearedCache = false;
    service.registerOrganizerCacheClearer(() => {
      clearedCache = true;
    });

    const postSpy = vi.spyOn((service as any).client, 'POST').mockResolvedValueOnce({
      data: undefined,
      error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Error temporal', correlationId: '1' },
      response: { ok: false, status: 503, headers: new Headers() }
    });

    const uncertain = await service.logout();
    expect(uncertain.status).toBe('UNCERTAIN');
    expect(service.state()).toBe('UNAVAILABLE');
    expect(service.account()).toBeNull();
    expect(service.capabilities().canAccessMyEvents).toBe(false);
    expect(service.lastLogoutAnnouncement()).toBeNull();
    expect(service.logoutUncertaintyMessage()).toContain('No se pudo confirmar el cierre de sesión');
    expect(clearedCache).toBe(true);

    // Reintento exitoso confirma cierre de sesión
    postSpy.mockResolvedValueOnce({
      data: {
        outcome: 'LOGGED_OUT',
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
        }
      },
      error: undefined,
      response: { ok: true, status: 200, headers: new Headers() }
    });

    const confirmed = await service.logout();
    expect(confirmed.status).toBe('CONFIRMED');
    expect(service.state()).toBe('ANONYMOUS');
    expect(service.lastLogoutAnnouncement()).toBe('Sesión cerrada.');
    expect(service.logoutUncertaintyMessage()).toBeNull();
  });
});
