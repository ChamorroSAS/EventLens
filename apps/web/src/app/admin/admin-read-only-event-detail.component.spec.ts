import { describe, expect, it, vi } from 'vitest';
import { AdminReadOnlyEventDetailComponent } from './admin-read-only-event-detail.component.js';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { AdminSessionService } from './admin-session.service.js';
import { AdminReadOnlyApiService } from './admin-read-only-api.service.js';
import { AdminReadOnlySearchStateService } from './admin-read-only-search-state.service.js';

describe('AdminReadOnlyEventDetailComponent (EL-TK-236)', () => {
  it('clears an actual component on logout and rejects its pending private response', async () => {
    let clear!: () => void;
    let resolve!: (value: any) => void;
    const unregister = vi.fn();
    TestBed.configureTestingModule({ imports: [AdminReadOnlyEventDetailComponent], providers: [
      { provide: AdminSessionService, useValue: { state: signal('ADMIN_ACTIVE'), isRevalidating: signal(false), registerPrivateCacheClearer: (callback: () => void) => { clear = callback; return unregister; } } },
      { provide: AdminReadOnlyApiService, useValue: { eventDetail: () => new Promise(done => { resolve = done; }) } },
      { provide: AdminReadOnlySearchStateService, useValue: {} },
      { provide: Router, useValue: { navigateByUrl: vi.fn() } }
    ] });
    const fixture = TestBed.createComponent(AdminReadOnlyEventDetailComponent);
    fixture.componentInstance.eventId = 'private-event';
    const pending = fixture.componentInstance.load();
    clear();
    resolve({ ok: true, data: { eventId: 'private-event' } });
    await pending;
    expect(fixture.componentInstance.detail()).toBeNull();
    fixture.destroy();
    expect(unregister).toHaveBeenCalledOnce();
  });
  it('does not manufacture zero capacity when the server marks it unavailable', () => {
    const component = Object.create(AdminReadOnlyEventDetailComponent.prototype) as AdminReadOnlyEventDetailComponent;
    expect(component.value(undefined)).toBe('No definido');
    expect(component.value(0)).toBe(0);
  });

  it('does not turn a stale detail response into current presentation', async () => {
    const pending: Array<(result: any) => void> = [];
    const component = Object.create(AdminReadOnlyEventDetailComponent.prototype) as any;
    component.requestGeneration = 0;
    component.loading = { set: vi.fn() };
    component.failure = { set: vi.fn() };
    component.detail = { set: vi.fn() };
    component.api = { eventDetail: vi.fn(() => new Promise(resolve => pending.push(resolve))) };
    component.eventId = 'first';
    const first = component.load();
    component.eventId = 'second';
    const second = component.load();
    pending[0]({ ok: true, data: { eventId: 'first' } });
    pending[1]({ ok: true, data: { eventId: 'second' } });
    await Promise.all([first, second]);
    expect(component.detail.set).toHaveBeenCalledTimes(3);
    expect(component.detail.set).toHaveBeenLastCalledWith({ eventId: 'second' });
  });
});
