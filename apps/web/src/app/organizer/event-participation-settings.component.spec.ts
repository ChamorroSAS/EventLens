import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventParticipationSettingsComponent } from './event-participation-settings.component.js';
import { OrganizerService } from './organizer.service.js';
import type { EventConfigurationModel } from './organizer.types.js';

describe('Event participation permissions', () => {
  let service: { setEventParticipation: ReturnType<typeof vi.fn>; getEventConfiguration: ReturnType<typeof vi.fn> };
  function config(overrides: Partial<EventConfigurationModel['event']> = {}, revision = '3', canEditSettings = true): EventConfigurationModel {
    return { revision, capabilities: { canEditSettings, canEditSchedule: false, canManageAccess: false, canViewLifecycle: true, canViewCapacity: true, canPublishOrActivate: false },
      event: { id: 'event-1', organizerId: 'owner', name: 'Evento', status: 'ACTIVE', timezone: 'America/Bogota', uploadsEnabled: false, guestGalleryEnabled: false, moderationMode: 'AUTO_PUBLISH', pinEnabled: false, createdAt: '', updatedAt: '', ...overrides } };
  }
  beforeEach(async () => {
    service = { setEventParticipation: vi.fn().mockResolvedValue({ eventId: 'event-1', outcome: 'UPDATED' }), getEventConfiguration: vi.fn().mockResolvedValue(config()) };
    await TestBed.configureTestingModule({ imports: [EventParticipationSettingsComponent], providers: [{ provide: OrganizerService, useValue: service }] }).compileComponents();
  });
  async function create(value = config()) {
    const fixture = TestBed.createComponent(EventParticipationSettingsComponent);
    fixture.componentRef.setInput('configuration', value);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  it.each([[false, false], [false, true], [true, false], [true, true]])('saves independent flags %s / %s and waits for the authoritative reload', async (uploadsEnabled, guestGalleryEnabled) => {
    const fixture = await create(config({ uploadsEnabled: !uploadsEnabled, guestGalleryEnabled: !guestGalleryEnabled }));
    const component = fixture.componentInstance;
    component.uploadsEnabled = uploadsEnabled;
    component.guestGalleryEnabled = guestGalleryEnabled;
    service.getEventConfiguration.mockResolvedValue(config({ uploadsEnabled, guestGalleryEnabled }, '4'));
    const saved = vi.spyOn(component.saved, 'emit');
    await component.save();
    expect(service.setEventParticipation).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'event-1', uploadsEnabled, guestGalleryEnabled, expectedRevision: '3' }));
    expect(component.snapshot()?.revision).toBe('4');
    expect(saved).toHaveBeenCalledOnce();
    expect(component.isDirty()).toBe(false);
    expect(component.announcement()).toContain('Guardado confirmado');
  });
  it('does not submit unchanged flags or infer authority from state', async () => {
    const fixture = await create();
    await fixture.componentInstance.save();
    fixture.componentRef.setInput('configuration', config({}, '3', false));
    fixture.detectChanges();
    fixture.componentInstance.uploadsEnabled = true;
    await fixture.componentInstance.save();
    expect(service.setEventParticipation).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('input').disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('transferencia real');
  });
  it('preserves an unsaved proposal across a same-event revision refresh', async () => {
    const fixture = await create();
    fixture.componentInstance.uploadsEnabled = true;
    fixture.componentRef.setInput('configuration', config({ guestGalleryEnabled: true }, '4'));
    fixture.detectChanges();
    expect(fixture.componentInstance.uploadsEnabled).toBe(true);
    expect(fixture.componentInstance.guestGalleryEnabled).toBe(false);
    expect(fixture.componentInstance.snapshot()?.revision).toBe('4');
  });
  it.each(['DRAFT', 'SCHEDULED', 'ACTIVE'] as const)('allows authorized editing in %s', async status => {
    const fixture = await create(config({ status }));
    expect(fixture.componentInstance.canEdit()).toBe(true);
  });
  it('enforces read-only state even if a stale capability says editing is allowed', async () => {
    const fixture = await create(config({ status: 'CLOSED' }));
    fixture.componentInstance.uploadsEnabled = true;
    await fixture.componentInstance.save();
    expect(service.setEventParticipation).not.toHaveBeenCalled();
  });
  it('ignores a pending command after the server removes editing capability', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    component.uploadsEnabled = true;
    let done!: (value: unknown) => void;
    service.setEventParticipation.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
    const saving = component.save();
    fixture.componentRef.setInput('configuration', config({}, '4', false));
    fixture.detectChanges();
    done({ eventId: 'event-1', outcome: 'UPDATED' });
    await saving;
    expect(component.canEdit()).toBe(false);
    expect(component.announcement()).toBeNull();
    expect(service.getEventConfiguration).not.toHaveBeenCalled();
  });
  it('reloads CAS preserving the proposal and uses the new revision and intent key', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    component.uploadsEnabled = true;
    service.setEventParticipation.mockRejectedValueOnce(new Error('CONCURRENCY_CONFLICT'));
    await component.save();
    await component.save();
    expect(service.setEventParticipation).toHaveBeenCalledOnce();
    const first = service.setEventParticipation.mock.calls[0][0];
    service.getEventConfiguration.mockResolvedValue(config({ guestGalleryEnabled: true }, '5'));
    await component.reload();
    expect(component.uploadsEnabled).toBe(true);
    expect(component.guestGalleryEnabled).toBe(false);
    await component.save();
    expect(service.setEventParticipation.mock.calls[1][0]).toMatchObject({ expectedRevision: '5', uploadsEnabled: true, guestGalleryEnabled: false });
    expect(service.setEventParticipation.mock.calls[1][0].idempotencyKey).not.toBe(first.idempotencyKey);
  });
  it('retries an uncertain intent exactly and blocks concurrent submits and editing', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    component.uploadsEnabled = true;
    service.setEventParticipation.mockRejectedValueOnce(new Error('COMMUNICATION_ERROR'));
    await component.save();
    expect(component.controlsLocked()).toBe(true);
    const first = service.setEventParticipation.mock.calls[0][0];
    let done!: (value: unknown) => void;
    service.setEventParticipation.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
    const saving = component.save();
    await component.save();
    expect(service.setEventParticipation).toHaveBeenCalledTimes(2);
    expect(service.setEventParticipation.mock.calls[1][0]).toEqual(first);
    done({ eventId: 'event-1', outcome: 'IDEMPOTENT_REPLAY' });
    await saving;
  });
  it.each(['ACCESS_DENIED', 'EVENT_NOT_FOUND'])('locks controls after %s, including failed reload', async code => {
    const fixture = await create();
    const component = fixture.componentInstance;
    component.uploadsEnabled = true;
    service.setEventParticipation.mockRejectedValueOnce(new Error(code));
    await component.save();
    expect(component.denied()).toBe(true);
    await component.save();
    expect(service.setEventParticipation).toHaveBeenCalledOnce();
  });
  it('consults authoritative flags during uncertainty without proving receipt or replacing the exact retry intent', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    component.uploadsEnabled = true;
    service.setEventParticipation.mockRejectedValueOnce(new Error('COMMUNICATION_ERROR'));
    await component.save();
    const original = service.setEventParticipation.mock.calls[0][0];
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Consultar datos actuales');
    service.getEventConfiguration.mockResolvedValue(config({ uploadsEnabled: true, guestGalleryEnabled: true }, '8'));
    await component.reload();
    expect(component.snapshot()?.revision).toBe('8');
    expect(component.uploadsEnabled).toBe(true);
    expect(component.guestGalleryEnabled).toBe(false);
    expect(component.uncertain()).toBe(true);
    expect(component.controlsLocked()).toBe(true);
    expect(component.announcement()).toContain('sigue sin confirmar');
    await component.save();
    expect(service.setEventParticipation.mock.calls[1][0]).toEqual(original);
  });
  it('keeps exact retry available after an uncertain consultation fails', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    component.uploadsEnabled = true;
    service.setEventParticipation.mockRejectedValueOnce(new Error('COMMUNICATION_ERROR'));
    await component.save();
    const original = service.setEventParticipation.mock.calls[0][0];
    service.getEventConfiguration.mockRejectedValueOnce(new Error('COMMUNICATION_ERROR'));
    await component.reload();
    expect(component.uncertain()).toBe(true);
    expect(component.needsReload()).toBe(false);
    await component.save();
    expect(service.setEventParticipation.mock.calls[1][0]).toEqual(original);
  });
  it('handles auth denial while reloading a CAS and never reports success', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    component.uploadsEnabled = true;
    service.setEventParticipation.mockRejectedValueOnce(new Error('CONCURRENCY_CONFLICT'));
    await component.save();
    service.getEventConfiguration.mockRejectedValueOnce(new Error('ACCESS_DENIED'));
    await component.reload();
    expect(component.controlsLocked()).toBe(true);
    expect(component.announcement()).toBeNull();
  });
  it.each(['INVALID_STATE', 'IDEMPOTENCY_CONFLICT', 'PARTICIPATION_CONFLICT'])('does not mislabel %s as CAS', async code => {
    const fixture = await create();
    fixture.componentInstance.uploadsEnabled = true;
    service.setEventParticipation.mockRejectedValueOnce(new Error(code));
    await fixture.componentInstance.save();
    expect(fixture.componentInstance.error()).not.toContain('conflicto de revisión');
    expect(fixture.componentInstance.needsReload()).toBe(true);
  });
  it('discards pending responses after switching events and after destroy', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    component.uploadsEnabled = true;
    let done!: (value: unknown) => void;
    service.setEventParticipation.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
    const saving = component.save();
    fixture.componentRef.setInput('configuration', config({ id: 'event-2', guestGalleryEnabled: true }, '8'));
    fixture.detectChanges();
    done({ eventId: 'event-1', outcome: 'UPDATED' });
    await saving;
    expect(component.snapshot()?.event.id).toBe('event-2');
    expect(component.guestGalleryEnabled).toBe(true);
    expect(component.announcement()).toBeNull();
    expect(service.getEventConfiguration).not.toHaveBeenCalled();
    component.uploadsEnabled = true;
    service.setEventParticipation.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
    const after = component.save();
    fixture.destroy();
    done({ eventId: 'event-2', outcome: 'UPDATED' });
    await after;
    expect(service.getEventConfiguration).not.toHaveBeenCalled();
  });
  it('requires a successful reload before announcing saved permissions', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    component.uploadsEnabled = true;
    service.getEventConfiguration.mockRejectedValueOnce(new Error('COMMUNICATION_ERROR'));
    await component.save();
    expect(component.announcement()).toBeNull();
    expect(component.needsReload()).toBe(true);
    await component.reload();
    expect(component.announcement()).toContain('Guardado confirmado');
    expect(service.setEventParticipation).toHaveBeenCalledOnce();
  });
});
