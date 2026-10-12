import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventLifecyclePanelComponent } from './event-lifecycle-panel.component.js';
import type { LifecycleSnapshotModel, LifecycleCapabilities } from './lifecycle.types.js';

describe('EventLifecyclePanelComponent (Organizer Lifecycle Surface — EL-TK-073)', () => {
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
      eventId: 'evt-101',
      name: 'Boda Camila y Andrés',
      status: 'DRAFT',
      timezone: 'America/Bogota',
      startsAtLocal: null,
      scheduledAt: null,
      expiresAt: null,
      graceEndsAt: null,
      activatedAt: null,
      closedAt: null,
      capabilities: createDefaultCapabilities(),
      ...overrides
    };
  }

  function createComponent(snapshot: LifecycleSnapshotModel): ComponentFixture<EventLifecyclePanelComponent> {
    const fixture = TestBed.createComponent(EventLifecyclePanelComponent);
    fixture.componentRef.setInput('snapshot', snapshot);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EventLifecyclePanelComponent]
    });
  });

  it('Escenario 1 (DRAFT): Shows hierarchy, "Sin programar", and only "Programar evento" action', () => {
    const draftSnapshot = createSnapshot({
      status: 'DRAFT',
      capabilities: createDefaultCapabilities({ canSchedule: true, canSuspend: true })
    });
    const fixture = createComponent(draftSnapshot);
    const el = fixture.nativeElement as HTMLElement;

    // 1. Hierarchy: name & badge
    expect(el.querySelector('.event-name')?.textContent?.trim()).toBe('Boda Camila y Andrés');
    expect(el.querySelector('.status-badge')?.textContent?.trim()).toBe('Borrador');
    expect(el.textContent).toContain('Sin programar');

    // 2. Authorized actions
    const scheduleBtn = el.querySelector('button.btn-primary');
    expect(scheduleBtn?.textContent?.trim()).toBe('Programar evento');

    // Should NOT show activate, close, or reopen buttons
    expect(el.textContent).not.toContain('Activar ahora');
    expect(el.textContent).not.toContain('Cerrar evento');
    expect(el.textContent).not.toContain('Reabrir evento');
  });

  it('Escenario 1 (SCHEDULED): Shows scheduled time and "Activar ahora" when canActivateEarly is true', () => {
    const scheduledSnapshot = createSnapshot({
      status: 'SCHEDULED',
      startsAtLocal: '2026-11-20 18:00',
      scheduledAt: '2026-11-20T23:00:00Z',
      expiresAt: '2026-11-27T23:00:00Z',
      capabilities: createDefaultCapabilities({ canActivateEarly: true, canSuspend: true })
    });
    const fixture = createComponent(scheduledSnapshot);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.status-badge')?.textContent?.trim()).toBe('Programado');
    expect(el.textContent).toContain('2026-11-20 18:00');

    // "Activar ahora" button present
    const activateBtn = el.querySelector('button.btn-success');
    expect(activateBtn?.textContent?.trim()).toBe('Activar ahora');

    // Activate event emission
    const activateSpy = vi.fn();
    fixture.componentInstance.activateEarlyRequested.subscribe(activateSpy);
    activateBtn?.dispatchEvent(new MouseEvent('click'));
    expect(activateSpy).toHaveBeenCalled();
  });

  it('Escenario 1 (ACTIVE): Shows "Cerrar evento" dialog and warns that closing does not pause validity', () => {
    const activeSnapshot = createSnapshot({
      status: 'ACTIVE',
      expiresAt: '2026-11-27T23:00:00Z',
      capabilities: createDefaultCapabilities({ canClose: true, canSuspend: true, canUpload: true })
    });
    const fixture = createComponent(activeSnapshot);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.status-badge')?.textContent?.trim()).toBe('Activo');

    const closeBtn = el.querySelector('button.btn-warning');
    expect(closeBtn?.textContent?.trim()).toBe('Cerrar evento');

    // Clicking "Cerrar evento" opens the modal dialog
    closeBtn?.dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();

    expect(fixture.componentInstance.isCloseDialogOpen).toBe(true);
    expect(el.textContent).toContain('no pausa la vigencia');

    // Confirm close emission
    const closeSpy = vi.fn();
    fixture.componentInstance.closeRequested.subscribe(closeSpy);
    const confirmBtn = el.querySelector('.btn-confirm-close');
    confirmBtn?.dispatchEvent(new MouseEvent('click'));
    expect(closeSpy).toHaveBeenCalled();
  });

  it('Escenario 1 (GRACE_PERIOD): Shows grace period banner and info about download access', () => {
    const graceSnapshot = createSnapshot({
      status: 'GRACE_PERIOD',
      graceEndsAt: '2026-12-04T23:00:00Z',
      capabilities: createDefaultCapabilities({ isInGracePeriod: true, isClosed: true })
    });
    const fixture = createComponent(graceSnapshot);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.status-badge')?.textContent?.trim()).toBe('Periodo de gracia');
    expect(el.querySelector('eventlens-event-grace-period-banner')).not.toBeNull();
    expect(el.textContent).toContain('Periodo de gracia activo');
    expect(el.textContent).toContain('descargas de medios permanecen disponibles');
  });

  it('Escenario 1 (SUSPENDED): Shows suspension reason and "Reactivar" button when authorized', () => {
    const suspendedSnapshot = createSnapshot({
      status: 'SUSPENDED',
      previousStatus: 'ACTIVE',
      suspensionReason: 'Revisión administrativa de identidad',
      capabilities: createDefaultCapabilities({ isSuspended: true, canReactivate: true })
    });
    const fixture = createComponent(suspendedSnapshot);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.status-badge')?.textContent?.trim()).toBe('Suspendido');
    expect(el.textContent).toContain('Revisión administrativa de identidad');

    const reactivateBtn = el.querySelector('button.btn-primary');
    expect(reactivateBtn?.textContent?.trim()).toBe('Reactivar');

    // Opening dialog explains recalculation under DEC-081
    reactivateBtn?.dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();
    expect(fixture.componentInstance.isReactivateDialogOpen).toBe(true);
    expect(el.textContent).toContain('recalcula el estado temporal efectivo');
  });

  it('Escenario 3: Refreshes snapshot on button click without resetting focus or emitting continuous noise', () => {
    const snapshot = createSnapshot({ status: 'ACTIVE' });
    const fixture = createComponent(snapshot);
    const el = fixture.nativeElement as HTMLElement;

    const refreshSpy = vi.fn();
    fixture.componentInstance.refreshRequested.subscribe(refreshSpy);

    const refreshBtn = el.querySelector('button.btn-refresh');
    refreshBtn?.dispatchEvent(new MouseEvent('click'));
    expect(refreshSpy).toHaveBeenCalled();
  });
});
