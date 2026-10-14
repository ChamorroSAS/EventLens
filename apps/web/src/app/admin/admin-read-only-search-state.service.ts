import { Injectable, signal } from '@angular/core';
import { AdminSessionService } from './admin-session.service.js';
import type { AdminReadOnlySearchFilter, AdminReadOnlySearchResponse } from './admin-read-only.types.js';

const INITIAL_FILTER: AdminReadOnlySearchFilter = Object.freeze({
  entityType: 'ALL',
  page: 1,
  limit: 20
});

/** Private in-memory query state. It is retained only while the same authenticated session is revalidated. */
@Injectable({ providedIn: 'root' })
export class AdminReadOnlySearchStateService {
  private requestGeneration = 0;

  readonly filter = signal<AdminReadOnlySearchFilter>(INITIAL_FILTER);
  readonly result = signal<AdminReadOnlySearchResponse | null>(null);
  readonly failure = signal<string | null>(null);
  readonly loading = signal(false);
  readonly returnFocusEventId = signal<string | null>(null);

  constructor(session: AdminSessionService) {
    session.registerPrivateCacheClearer(() => this.clear());
  }

  beginRequest(): number {
    const generation = ++this.requestGeneration;
    this.loading.set(true);
    this.failure.set(null);
    return generation;
  }

  acceptResult(generation: number, result: AdminReadOnlySearchResponse): boolean {
    if (generation !== this.requestGeneration) return false;
    this.result.set(result);
    this.failure.set(null);
    this.loading.set(false);
    return true;
  }

  acceptFailure(generation: number, kind: string): boolean {
    if (generation !== this.requestGeneration) return false;
    this.result.set(null);
    this.failure.set(kind);
    this.loading.set(false);
    return true;
  }

  updateFilter(filter: AdminReadOnlySearchFilter): void {
    this.filter.set(Object.freeze({ ...filter }));
  }

  rememberReturnFocus(eventId: string): void {
    this.returnFocusEventId.set(eventId);
  }

  consumeReturnFocus(): string | null {
    const eventId = this.returnFocusEventId();
    this.returnFocusEventId.set(null);
    return eventId;
  }

  clear(): void {
    this.requestGeneration++;
    this.filter.set(INITIAL_FILTER);
    this.result.set(null);
    this.failure.set(null);
    this.loading.set(false);
    this.returnFocusEventId.set(null);
  }
}
