import { describe, expect, it, vi } from 'vitest';
import { AdminReadOnlySearchStateService } from './admin-read-only-search-state.service.js';

describe('AdminReadOnlySearchStateService (EL-TK-236)', () => {
  it('ignores a stale response after a newer search has started', () => {
    const registerPrivateCacheClearer = vi.fn();
    const state = new AdminReadOnlySearchStateService({ registerPrivateCacheClearer } as any);
    const first = state.beginRequest();
    const second = state.beginRequest();
    const stale = { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } as any;
    const current = { items: [], pagination: { page: 2, limit: 20, total: 0, totalPages: 0 } } as any;

    expect(state.acceptResult(first, stale)).toBe(false);
    expect(state.result()).toBeNull();
    expect(state.acceptResult(second, current)).toBe(true);
    expect(state.result()).toEqual(current);
  });

  it('clears a private cached result through the session cache clearer', () => {
    let clearer!: () => void;
    const state = new AdminReadOnlySearchStateService({
      registerPrivateCacheClearer: (callback: () => void) => {
        clearer = callback;
        return () => undefined;
      }
    } as any);
    const request = state.beginRequest();
    state.acceptResult(request, { items: [{}], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } as any);
    state.rememberReturnFocus('event-1');

    clearer();

    expect(state.result()).toBeNull();
    expect(state.returnFocusEventId()).toBeNull();
    expect(state.loading()).toBe(false);
  });
});
