import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventAccessStatusComponent } from './event-access-status.component.js';
import type { LifecycleSnapshotModel, LifecycleCapabilities } from './lifecycle.types.js';

describe('EventAccessStatusComponent (Guest Surface & Lifecycle Restrictions — EL-TK-073)', () => {
  function createDefaultCapabilities(overrides: Partial<LifecycleCapabilities> = {}): LifecycleCapabilities {
    return {
      canSchedule: false,
      canActivateEarly: false,
      canClose: false,
      canReopen: false,
      canSuspend: false,
      canReactivate: false,
      canExtendValidity: false,
      canUpload: false,
      canViewGuestGallery: false,
      canParticipate: false,
      isClosed: false,
      isInGracePeriod: false,
      isSuspended: false,
      isTerminal: false,
      ...overrides
    };
  }

  function createSnapshot(overrides: Partial<LifecycleSnapshotModel> = {}): LifecycleSnapshotModel {
    return {
      eventId: 'evt-202',
      name: 'Festival de Música 2026',
      status: 'ACTIVE',
      timezone: 'America/Bogota',
      startsAtLocal: null,
      scheduledAt: null,
      expiresAt: null,
      graceEndsAt: null,
      activatedAt: null,
      closedAt: null,
      capabilities: createDefaultCapabilities({ canUpload: true, canParticipate: true }),
      ...overrides
    };
  }

  function createComponent(
    snapshot: LifecycleSnapshotModel,
    hasGuestSession = false
  ): ComponentFixture<EventAccessStatusComponent> {
    const fixture = TestBed.createComponent(EventAccessStatusComponent);
    fixture.componentRef.setInput('snapshot', snapshot);
    fixture.componentRef.setInput('hasGuestSession', hasGuestSession);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EventAccessStatusComponent]
    });
  });

  it('Escenario 2 (SCHEDULED): Shows "El evento aún no inicia" and prevents uploading by error', () => {
    const scheduledSnapshot = createSnapshot({
      status: 'SCHEDULED',
      startsAtLocal: '2026-12-01 10:00',
      capabilities: createDefaultCapabilities({ canUpload: false, canParticipate: false })
    });
    const fixture = createComponent(scheduledSnapshot);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.status-headline')?.textContent?.trim()).toBe('El evento aún no inicia');
    expect(el.textContent).toContain('2026-12-01 10:00');
    expect(el.textContent).toContain('Las cargas se habilitarán automáticamente');
  });

  it('Escenario 2 (CLOSED): Shows "Las cargas están cerradas" with gallery viewing clarification', () => {
    const closedSnapshot = createSnapshot({
      status: 'CLOSED',
      capabilities: createDefaultCapabilities({ isClosed: true, canUpload: false, canViewGuestGallery: true })
    });
    const fixture = createComponent(closedSnapshot);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.status-headline')?.textContent?.trim()).toBe('Las cargas están cerradas');
    expect(el.textContent).toContain('El organizador ha cerrado la recepción de nuevo contenido');
  });

  it('Escenario 2 (GRACE_PERIOD): Shows "La vigencia del evento terminó" with read-only notice', () => {
    const graceSnapshot = createSnapshot({
      status: 'GRACE_PERIOD',
      capabilities: createDefaultCapabilities({ isInGracePeriod: true, canUpload: false })
    });
    const fixture = createComponent(graceSnapshot);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.status-headline')?.textContent?.trim()).toBe('La vigencia del evento terminó');
    expect(el.textContent).toContain('El periodo de participación activa ha concluido');
  });

  it('Escenario 2 (SUSPENDED): Shows neutral message and does NOT leak administrative investigation reasons', () => {
    const suspendedSnapshot = createSnapshot({
      status: 'SUSPENDED',
      suspensionReason: 'Investigación confidencial por fraude y reporte policial interno',
      capabilities: createDefaultCapabilities({ isSuspended: true, canUpload: false })
    });
    const fixture = createComponent(suspendedSnapshot);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.status-headline')?.textContent?.trim()).toBe('Evento no disponible temporalmente');
    expect(el.textContent).toContain('en pausa administrativa por revisión');

    // PRIVACY / NON-ENUMERATION GUARANTEE: Never reveal sensitive reason to guest
    expect(el.textContent).not.toContain('Investigación confidencial');
    expect(el.textContent).not.toContain('fraude');
    expect(el.textContent).not.toContain('reporte policial');
  });

  it('DEC-084 Exception: Preserves "Mis aportes" link when hasGuestSession is true', () => {
    const closedSnapshot = createSnapshot({
      status: 'CLOSED',
      capabilities: createDefaultCapabilities({ isClosed: true, canUpload: false })
    });

    // 1. Without guest session: no exception box
    const fixtureNoSession = createComponent(closedSnapshot, false);
    expect(fixtureNoSession.nativeElement.querySelector('.contributions-exception-box')).toBeNull();

    // 2. With valid guest session: exception box rendered with action button
    const fixtureWithSession = createComponent(closedSnapshot, true);
    const el = fixtureWithSession.nativeElement as HTMLElement;
    expect(el.querySelector('.contributions-exception-box')).not.toBeNull();
    expect(el.textContent).toContain('Ver mis aportes y solicitudes');

    const spy = vi.fn();
    fixtureWithSession.componentInstance.viewOwnContributions.subscribe(spy);
    const btn = el.querySelector('button.btn-contributions');
    btn?.dispatchEvent(new MouseEvent('click'));
    expect(spy).toHaveBeenCalled();
  });
});
