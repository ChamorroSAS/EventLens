import { TestBed } from '@angular/core/testing';
import { describe, it, expect } from 'vitest';
import { AppComponent } from './app.component';
import {
  PublicEntryRouterService,
  providePublicEntryRouter
} from './navigation/public-entry-router.service';
import { ALL_PUBLIC_ENTRY_ROUTES } from './navigation/all-routes';
import { OrganizerSessionService } from './organizer-session.service';
import { computed, signal } from '@angular/core';

describe('AppComponent (EL-TK-213 Production Root Shell)', () => {
  it('hosts the public entry router outlet and boots without disclosing internal errors', async () => {
    const mockSession = {
      snapshot: signal({
        state: 'ANONYMOUS' as const,
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
      }).asReadonly(),
      state: computed(() => 'ANONYMOUS' as const),
      capabilities: computed(() => ({
        canSignIn: true,
        canRequestBetaAccess: true,
        canAccessMyEvents: false,
        canAccessMyAccount: false,
        canManageSessions: false,
        canManageAccountDeletion: false,
        isDeletionRestricted: false,
        canSignOut: false
      })),
      account: computed(() => null),
      isLoggingOut: signal(false).asReadonly(),
      lastLogoutAnnouncement: signal<string | null>(null).asReadonly(),
      logout: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        providePublicEntryRouter(ALL_PUBLIC_ENTRY_ROUTES),
        { provide: OrganizerSessionService, useValue: mockSession }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(PublicEntryRouterService);
    await router.navigateByUrl('/');
    await fixture.whenStable();
    fixture.detectChanges();

    const outletEl = fixture.nativeElement.querySelector('eventlens-router-outlet, router-outlet');
    expect(outletEl).toBeTruthy();

    // Verify Home renders as root default route without errors
    const homeTitle = fixture.nativeElement.querySelector('#hero-title');
    expect(homeTitle).toBeTruthy();
    expect(homeTitle.textContent).toContain('Tu evento termina. Sus recuerdos continúan.');
  });
});
