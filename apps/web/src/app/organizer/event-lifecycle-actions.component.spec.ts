import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventLifecycleActionsComponent } from './event-lifecycle-actions.component.js';
import { OrganizerService, type OrganizerLifecycleSnapshot } from './organizer.service.js';

describe('Organizer lifecycle actions', () => {
  const draft: OrganizerLifecycleSnapshot = {
    eventId: 'event-1', status: 'DRAFT', timezone: 'America/Bogota',
    startsAtLocal: '2026-11-20T18:00:00', scheduledAt: '2026-11-20T23:00:00.000Z',
    expiresAt: null, graceEndsAt: null, revision: '3', validityDurationDays: 30, graceDays: 7,
    capabilities: { canSchedule: true, canActivateEarly: false }
  };
  let service: { getEventLifecycle: ReturnType<typeof vi.fn>; transitionEventLifecycle: ReturnType<typeof vi.fn> };
  beforeEach(async () => {
    service = { getEventLifecycle: vi.fn().mockResolvedValue(draft), transitionEventLifecycle: vi.fn().mockResolvedValue(undefined) };
    await TestBed.configureTestingModule({ imports: [EventLifecycleActionsComponent], providers: [{ provide: OrganizerService, useValue: service }] }).compileComponents();
  });
  async function create() {
    const fixture = TestBed.createComponent(EventLifecycleActionsComponent);
    fixture.componentRef.setInput('eventId', 'event-1');
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('requires explicit publication confirmation and reads server state afterwards', async () => {
    const fixture = await create();
    expect(fixture.nativeElement.textContent).toContain('Guardar la fecha solo configura el borrador');
    fixture.componentInstance.begin('schedule');
    expect(service.transitionEventLifecycle).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('30 días');
    service.getEventLifecycle.mockResolvedValue({ ...draft, status: 'SCHEDULED', revision: '4', capabilities: { canSchedule: false, canActivateEarly: true } });
    const updated = vi.fn();
    fixture.componentInstance.updated.subscribe(updated);
    await fixture.componentInstance.confirm();
    expect(service.transitionEventLifecycle).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'event-1', action: 'schedule', expectedRevision: '3' }));
    expect(fixture.componentInstance.snapshot()?.status).toBe('SCHEDULED');
    expect(updated).toHaveBeenCalledOnce();
  });

  it('only offers activation when the server authorizes it', async () => {
    service.getEventLifecycle.mockResolvedValue({ ...draft, status: 'SCHEDULED', capabilities: { canSchedule: false, canActivateEarly: true } });
    const fixture = await create();
    expect(fixture.nativeElement.textContent).toContain('Activar ahora');
    fixture.componentInstance.begin('activate');
    await fixture.componentInstance.confirm();
    expect(service.transitionEventLifecycle).toHaveBeenCalledWith(expect.objectContaining({ action: 'activate' }));
    fixture.componentInstance.snapshot.set({ ...draft, status: 'SCHEDULED', capabilities: { canSchedule: false, canActivateEarly: false } });
    fixture.detectChanges();
    expect([...fixture.nativeElement.querySelectorAll('button')].some((button: any) => button.textContent.trim() === 'Activar ahora')).toBe(false);
  });

  it('shows the current active state after replaying an earlier publication', async () => {
    const fixture = await create();
    service.transitionEventLifecycle.mockRejectedValueOnce({ status: 503 });
    fixture.componentInstance.begin('schedule');
    await fixture.componentInstance.confirm();
    service.getEventLifecycle.mockResolvedValue({ ...draft, status: 'ACTIVE', revision: '5', capabilities: { canSchedule: false, canActivateEarly: false } });
    await fixture.componentInstance.confirm();
    fixture.detectChanges();
    expect(fixture.componentInstance.snapshot()?.status).toBe('ACTIVE');
    expect(fixture.componentInstance.success()).toBe('Operación confirmada.');
    expect(fixture.nativeElement.textContent).toContain('El evento está activo');
    expect(fixture.nativeElement.textContent).not.toContain('Ya puedes activarlo');
  });

  it('cannot program a draft before saving its start date', async () => {
    service.getEventLifecycle.mockResolvedValue({ ...draft, scheduledAt: null });
    const fixture = await create();
    const button = fixture.nativeElement.querySelector('button.primary') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fixture.componentInstance.begin('schedule');
    await fixture.componentInstance.confirm();
    expect(service.transitionEventLifecycle).not.toHaveBeenCalled();
  });

  it('does not invent success on a revision conflict or retry automatically', async () => {
    const fixture = await create();
    service.transitionEventLifecycle.mockRejectedValue({ status: 409 });
    fixture.componentInstance.begin('schedule');
    await fixture.componentInstance.confirm();
    expect(fixture.componentInstance.snapshot()).toBeNull();
    expect(fixture.componentInstance.success()).toBeNull();
    expect(fixture.componentInstance.error()).toContain('revisión');
    expect(service.transitionEventLifecycle).toHaveBeenCalledOnce();
  });

  it('retains the exact intention for an explicit retry after an uncertain response', async () => {
    const fixture = await create();
    service.transitionEventLifecycle.mockRejectedValueOnce({ status: 503 });
    fixture.componentInstance.begin('schedule');
    await fixture.componentInstance.confirm();
    expect(fixture.componentInstance.uncertain()).toBe(true);
    const first = service.transitionEventLifecycle.mock.calls[0][0];
    await fixture.componentInstance.confirm();
    expect(service.transitionEventLifecycle.mock.calls[1][0]).toEqual(first);
  });

  it('prevents double submission and discards responses after changing events', async () => {
    const fixture = await create();
    let resolve!: () => void;
    service.transitionEventLifecycle.mockImplementation(() => new Promise<void>(done => { resolve = done; }));
    fixture.componentInstance.begin('schedule');
    const saving = fixture.componentInstance.confirm();
    await fixture.componentInstance.confirm();
    expect(service.transitionEventLifecycle).toHaveBeenCalledOnce();
    const updated = vi.fn();
    fixture.componentInstance.updated.subscribe(updated);
    fixture.componentRef.setInput('eventId', 'event-2');
    service.getEventLifecycle.mockResolvedValue({ ...draft, eventId: 'event-2' });
    fixture.detectChanges();
    resolve();
    await saving;
    await fixture.whenStable();
    expect(updated).not.toHaveBeenCalled();
    expect(fixture.componentInstance.snapshot()?.eventId).toBe('event-2');
  });
});
