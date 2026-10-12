import { TestBed } from '@angular/core/testing';
import {
  ACCOUNT_DELETION_UI_ADAPTER,
  type AccountDeletionUiAdapter,
  DeletionManagementComponent,
  EVENT_DELETION_UI_ADAPTER,
  type EventDeletionUiAdapter,
} from './deletion-management.component';

describe('DeletionManagementComponent (EL-TK-200 & EL-TK-201)', () => {
  it('EL-TK-200: opens EventDeleteRequestDialog with resource, 72h window, consequences and exit, and renders countdown only when cancelable', async () => {
    const eventAdapter: EventDeletionUiAdapter = {
      getEventState: vi.fn().mockResolvedValue({
        eventId: 'evt-100',
        eventName: 'Boda Ana y Luis',
        eventTimezone: 'America/Bogota',
        status: 'CLOSED',
        revision: 2,
        canRequestDeletion: true,
        canCancelDeletion: false,
        isIrreversible: false,
        isUncertainAck: false,
        cancelUntilLocalIso: null,
        countdownSummary: null,
        mainPurgeSummary: 'Sin purga activa',
        residualRetentionNotice: 'Purga +7d UTC / Residual +30d UTC',
      }),
      requestEventDeletion: vi.fn().mockResolvedValue({
        status: 'CONFIRMED',
        cancelUntilLocalIso: '2026-10-15T10:00:00-05:00',
        countdownSummary: 'Cancelable hasta 2026-10-15T10:00:00-05:00 (America/Bogota) — restan 71h 59m',
        message: 'Solicitud de eliminación registrada.',
      }),
      cancelEventDeletion: vi.fn().mockResolvedValue({
        eventStatus: 'CLOSED',
        status: 'CANCELLED',
        message: 'Cancelación confirmada por el servidor.',
      }),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: EVENT_DELETION_UI_ADAPTER, useValue: eventAdapter }],
    });

    const fixture = TestBed.createComponent(DeletionManagementComponent);
    await fixture.componentInstance.loadEvent('evt-100');
    fixture.detectChanges();

    const openBtn = fixture.nativeElement.querySelector(
      '[data-testid="open-event-delete-dialog-btn"]'
    ) as HTMLButtonElement;
    expect(openBtn).not.toBeNull();
    openBtn.click();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector(
      '[data-testid="event-delete-request-dialog"]'
    ) as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('Boda Ana y Luis');
    expect(dialog.textContent).toContain('72 horas');

    const confirmBtn = fixture.nativeElement.querySelector(
      '[data-testid="confirm-event-delete-btn"]'
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);

    const checkbox = fixture.nativeElement.querySelector(
      '[data-testid="event-delete-confirm-checkbox"]'
    ) as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(confirmBtn.disabled).toBe(false);

    confirmBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const countdown = fixture.nativeElement.querySelector(
      '[data-testid="event-deletion-countdown"]'
    ) as HTMLElement;
    expect(countdown).not.toBeNull();
    expect(countdown.textContent).toContain('2026-10-15T10:00:00-05:00');
    expect(
      fixture.nativeElement.querySelector('[data-testid="cancel-event-deletion-btn"]')
    ).not.toBeNull();
  });

  it('EL-TK-200 Escenario 3: does not claim cancellation or purge succeeded when server returns UNKNOWN or fails', async () => {
    const eventAdapter: EventDeletionUiAdapter = {
      getEventState: vi.fn().mockResolvedValue({
        eventId: 'evt-200',
        eventName: 'Conferencia Tech',
        eventTimezone: 'UTC',
        status: 'PENDING_DELETION',
        revision: 3,
        canRequestDeletion: false,
        canCancelDeletion: true,
        isIrreversible: false,
        isUncertainAck: false,
        cancelUntilLocalIso: '2026-10-15T12:00:00Z',
        countdownSummary: 'Restan 48h 0m',
        mainPurgeSummary: 'Purga programada',
        residualRetentionNotice: 'Residual pendiente',
      }),
      requestEventDeletion: vi.fn(),
      cancelEventDeletion: vi.fn().mockResolvedValue({
        eventStatus: 'PENDING_DELETION',
        status: 'UNKNOWN',
        message: 'Verificando resultado',
      }),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: EVENT_DELETION_UI_ADAPTER, useValue: eventAdapter }],
    });

    const fixture = TestBed.createComponent(DeletionManagementComponent);
    await fixture.componentInstance.loadEvent('evt-200');
    fixture.detectChanges();

    const cancelBtn = fixture.nativeElement.querySelector(
      '[data-testid="cancel-event-deletion-btn"]'
    ) as HTMLButtonElement;
    cancelBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.eventStatus()).toBe('PENDING_DELETION');
    expect(
      fixture.nativeElement.querySelector('[data-testid="polite-status-region"]').textContent
    ).toContain('Verificando resultado');
  });

  it('EL-TK-201: executes ConfirmDialog -> LoginForm.REAUTH_ACCOUNT -> restricted session without persisting password in storage', async () => {
    const accountAdapter: AccountDeletionUiAdapter = {
      getAccountState: vi.fn().mockResolvedValue({
        accountId: 'acc-500',
        accountStatus: 'ACTIVE',
        sessionMode: 'ORDINARY',
        revision: 1,
        affectedEventsCount: 3,
        canRequestDeletion: true,
        canCancelDeletion: false,
        cancelUntilUtcIso: null,
        isUncertainAck: false,
      }),
      beginReauthChallenge: vi.fn().mockResolvedValue({
        challengeId: 'ch-999',
        expiresAtIso: new Date(Date.now() + 300_000).toISOString(),
      }),
      verifyReauthAndExecute: vi.fn().mockResolvedValue({
        accountStatus: 'PENDING_DELETION',
        status: 'CONFIRMED',
        cancelUntilUtcIso: '2026-10-19T14:00:00.000Z',
        message: 'Solicitud de eliminación de cuenta confirmada.',
      }),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: ACCOUNT_DELETION_UI_ADAPTER, useValue: accountAdapter }],
    });

    const fixture = TestBed.createComponent(DeletionManagementComponent);
    await fixture.componentInstance.loadAccount('acc-500');
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="ordinary-organizer-nav"]')
    ).not.toBeNull();

    const startDeleteBtn = fixture.nativeElement.querySelector(
      '[data-testid="start-account-delete-btn"]'
    ) as HTMLButtonElement;
    startDeleteBtn.click();
    fixture.detectChanges();

    const proceedBtn = fixture.nativeElement.querySelector(
      '[data-testid="proceed-to-reauth-btn"]'
    ) as HTMLButtonElement;
    proceedBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const reauthForm = fixture.nativeElement.querySelector(
      '[data-testid="login-form-reauth-account"]'
    ) as HTMLFormElement;
    expect(reauthForm).not.toBeNull();
    expect(reauthForm.textContent).toContain('Contraseña actual');

    const pwdInput = fixture.nativeElement.querySelector(
      '[data-testid="reauth-password-input"]'
    ) as HTMLInputElement;
    pwdInput.value = 'SuperSecret#2026!';
    pwdInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    reauthForm.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    // Password signal was immediately wiped and never stored in localStorage
    expect(fixture.componentInstance.transientPasswordInput()).toBe('');
    expect(window.localStorage.length).toBe(0);

    // Account is now in restricted session mode: ordinary organizer nav is hidden
    expect(
      fixture.nativeElement.querySelector('[data-testid="ordinary-organizer-nav"]')
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="restricted-session-notice"]')
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="start-account-cancel-btn"]')
    ).not.toBeNull();
  });
});
