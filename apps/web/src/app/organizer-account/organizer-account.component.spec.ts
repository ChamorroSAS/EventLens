import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ACCOUNT_DELETION_UI_ADAPTER, type AccountDeletionUiAdapter } from '../deletion-management.component';
import {
  APPROVED_PUBLIC_ENTRY_PATHS,
  CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA,
  type PublicEntryRouteDescriptor
} from '../navigation/public-entry-routes.contract';
import {
  PublicEntryRouterService,
  providePublicEntryRouter
} from '../navigation/public-entry-router.service';
import { OrganizerSessionService } from '../organizer-session.service';
import {
  AccountAuthorizationLostError,
  ORGANIZER_ACCOUNT_ROUTE_DESCRIPTOR,
  OrganizerAccountComponent,
  OrganizerAccountGatewayService
} from './organizer-account.component';

@Component({
  selector: 'test-account-mock-home',
  standalone: true,
  template: `<main><h1>Home Mock</h1></main>`
})
class MockHomeComponent {}

@Component({
  selector: 'test-account-mock-login',
  standalone: true,
  template: `<main><h1>Iniciar sesión</h1></main>`
})
class MockLoginComponent {}

const TEST_ROUTES: readonly PublicEntryRouteDescriptor[] = [
  {
    ...CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA.PUBLIC_HOME,
    component: MockHomeComponent
  },
  {
    ...CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA.ORGANIZER_LOGIN,
    component: MockLoginComponent
  },
  ORGANIZER_ACCOUNT_ROUTE_DESCRIPTOR
];

describe('OrganizerAccountComponent (EL-TK-209)', () => {
  it('renders minimal read-only account fields, SecurityNotice, SessionList, SignOutOtherSessionsAction, and EL-TK-201 deletion zone for ordinary organizer', async () => {
    const accountDeletionAdapter: AccountDeletionUiAdapter = {
      getAccountState: vi.fn().mockResolvedValue({
        accountId: '11111111-1111-4111-8111-111111111111',
        accountStatus: 'ACTIVE',
        sessionMode: 'ORDINARY',
        revision: 1,
        affectedEventsCount: 2,
        canRequestDeletion: true,
        canCancelDeletion: false,
        cancelUntilUtcIso: null,
        isUncertainAck: false,
        isIrreversible: false
      }),
      beginReauthChallenge: vi.fn(),
      verifyReauthAndExecute: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [OrganizerAccountComponent],
      providers: [
        providePublicEntryRouter(TEST_ROUTES),
        { provide: ACCOUNT_DELETION_UI_ADAPTER, useValue: accountDeletionAdapter }
      ]
    }).compileComponents();

    const sessionService = TestBed.inject(OrganizerSessionService);
    const gateway = TestBed.inject(OrganizerAccountGatewayService);

    sessionService.applyServerProjection(
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
          email: 'ana@eventlens.test',
          emailVerified: true,
          accountStatus: 'ACTIVE'
        }
      },
      'csrf-ordinary'
    );

    vi.spyOn(gateway, 'listSessions').mockResolvedValue({
      sessions: [
        {
          id: 'sess-current',
          authTime: '2026-10-12T10:00:00.000Z',
          createdAt: '2026-10-12T10:00:00.000Z',
          lastActiveAt: '2026-10-12T10:05:00.000Z',
          expiresAt: '2026-10-12T18:00:00.000Z',
          idleExpiresAt: '2026-10-12T10:35:00.000Z',
          isCurrent: true
        },
        {
          id: 'sess-other',
          authTime: '2026-10-12T09:00:00.000Z',
          createdAt: '2026-10-12T09:00:00.000Z',
          lastActiveAt: '2026-10-12T09:30:00.000Z',
          expiresAt: '2026-10-12T17:00:00.000Z',
          idleExpiresAt: '2026-10-12T10:00:00.000Z',
          isCurrent: false
        }
      ],
      total: 2
    });

    const revokeOtherSpy = vi.spyOn(gateway, 'revokeOtherSessions').mockResolvedValue({
      outcome: 'REVOKED_OTHERS',
      revokedCount: 1,
      preservedCurrentSessionId: 'sess-current'
    });

    const fixture = TestBed.createComponent(OrganizerAccountComponent);
    await fixture.componentInstance.reloadAccountSurface();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h1')?.textContent?.trim()).toBe('Mi cuenta');
    expect(root.querySelector('[data-testid="account-email-value"]')?.textContent?.trim()).toBe(
      'ana@eventlens.test'
    );
    expect(root.querySelector('[data-testid="account-verified-value"]')?.textContent?.trim()).toBe(
      'Verificado'
    );
    expect(root.querySelector('[data-testid="account-status-value"]')?.textContent?.trim()).toBe(
      'Activa'
    );

    // No editable profile, avatar, phone, or password change fields
    expect(root.textContent).not.toContain('Cambiar contraseña');
    expect(root.textContent).not.toContain('Teléfono');
    expect(root.textContent).not.toContain('Avatar');

    // Ordinary sessions surface and EL-TK-201 deletion section present, without event lifecycle panel
    expect(root.querySelector('[data-testid="organizer-security-notice"]')).not.toBeNull();
    expect(root.querySelectorAll('[data-testid="organizer-session-item"]').length).toBe(2);
    expect(root.querySelector('[data-testid="sign-out-other-sessions-btn"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="account-security-section"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="event-lifecycle-panel"]')).toBeNull();

    // Execute SignOutOtherSessionsAction
    await fixture.componentInstance.onRevokeOtherSessions();
    fixture.detectChanges();
    expect(revokeOtherSpy).toHaveBeenCalledTimes(1);
    expect(root.querySelectorAll('[data-testid="organizer-session-item"]').length).toBe(1);
  });

  it('hides sessions, ordinary security, and Mis eventos link when account is in restricted PENDING_DELETION state', async () => {
    const accountDeletionAdapter: AccountDeletionUiAdapter = {
      getAccountState: vi.fn().mockResolvedValue({
        accountId: '22222222-2222-4222-8222-222222222222',
        accountStatus: 'PENDING_DELETION',
        sessionMode: 'DELETION_MANAGEMENT_ONLY',
        revision: 2,
        affectedEventsCount: 1,
        canRequestDeletion: false,
        canCancelDeletion: true,
        cancelUntilUtcIso: '2026-10-19T12:00:00.000Z',
        isUncertainAck: false,
        isIrreversible: false
      }),
      beginReauthChallenge: vi.fn(),
      verifyReauthAndExecute: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [OrganizerAccountComponent],
      providers: [
        providePublicEntryRouter(TEST_ROUTES),
        { provide: ACCOUNT_DELETION_UI_ADAPTER, useValue: accountDeletionAdapter }
      ]
    }).compileComponents();

    const sessionService = TestBed.inject(OrganizerSessionService);
    const gateway = TestBed.inject(OrganizerAccountGatewayService);
    const listSessionsSpy = vi.spyOn(gateway, 'listSessions');

    sessionService.applyServerProjection(
      {
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
          email: 'restringida@eventlens.test',
          emailVerified: true,
          accountStatus: 'PENDING_DELETION'
        }
      },
      'csrf-restricted'
    );

    const fixture = TestBed.createComponent(OrganizerAccountComponent);
    await fixture.componentInstance.reloadAccountSurface();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(listSessionsSpy).not.toHaveBeenCalled();
    expect(root.querySelector('[data-testid="account-sessions-section"]')).toBeNull();
    expect(root.querySelector('[data-testid="account-link-my-events"]')).toBeNull();
    expect(root.querySelector('[data-testid="restricted-session-notice"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="start-account-cancel-btn"]')).not.toBeNull();
  });

  it('wipes private data and redirects to /ingresar?returnUrl=%2Fmi-cuenta without inferring deletion on loss of authorization (401)', async () => {
    const accountDeletionAdapter: AccountDeletionUiAdapter = {
      getAccountState: vi.fn().mockRejectedValue(new AccountAuthorizationLostError(401)),
      beginReauthChallenge: vi.fn(),
      verifyReauthAndExecute: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [OrganizerAccountComponent],
      providers: [
        providePublicEntryRouter(TEST_ROUTES),
        { provide: ACCOUNT_DELETION_UI_ADAPTER, useValue: accountDeletionAdapter }
      ]
    }).compileComponents();

    const router = TestBed.inject(PublicEntryRouterService);
    const sessionService = TestBed.inject(OrganizerSessionService);

    sessionService.applyServerProjection(
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
          email: 'expirada@eventlens.test',
          emailVerified: true,
          accountStatus: 'ACTIVE'
        }
      },
      'csrf-exp'
    );

    await router.navigateByUrl(APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_ACCOUNT);
    const fixture = TestBed.createComponent(OrganizerAccountComponent);
    await fixture.componentInstance.reloadAccountSurface();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(sessionService.state()).toBe('ANONYMOUS');
    expect(sessionService.account()).toBeNull();
    expect(router.activeDescriptor()?.id).toBe('ORGANIZER_LOGIN');
    expect(router.queryParams()['returnUrl']).toBe('/mi-cuenta');
  });
});
