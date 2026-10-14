import { describe, expect, it, vi } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminReadOnlyEventSearchComponent } from './admin-read-only-event-search.component.js';
import { AdminSessionService } from './admin-session.service.js';
import { AdminReadOnlyApiService } from './admin-read-only-api.service.js';
import { AdminReadOnlySearchStateService } from './admin-read-only-search-state.service.js';

describe('Administrative read-only search', () => {
  it('renders a captioned table and only event detail links, with server pagination', () => {
    TestBed.configureTestingModule({ imports: [AdminReadOnlyEventSearchComponent], providers: [provideRouter([]),
      { provide: AdminSessionService, useValue: { state: signal('ADMIN_ACTIVE'), isRevalidating: signal(false), registerPrivateCacheClearer: vi.fn() } },
      { provide: AdminReadOnlyApiService, useValue: { search: vi.fn() } }
    ] });
    const state = TestBed.inject(AdminReadOnlySearchStateService);
    state.result.set({ items: [
      { type: 'EVENT', id: 'event-1', name: 'Evento', status: 'DRAFT', organizerId: 'org-1', timezone: 'America/Bogota', scheduledAt: null, createdAt: '2026-10-13' },
      { type: 'ORGANIZER', id: 'org-1', email: 'fixture@example.test', status: 'ACTIVE', declaredAdult: true, createdAt: '2026-10-13' }
    ], pagination: { page: 2, limit: 20, total: 41, totalPages: 3 } });
    const fixture = TestBed.createComponent(AdminReadOnlyEventSearchComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('caption')?.textContent).toContain('Resultados');
    expect(element.querySelector('.card')?.textContent).toContain('Creado: 2026-10-13');
    expect(element.querySelectorAll('th[scope="col"]')).toHaveLength(5);
    expect(Array.from(element.querySelectorAll('a')).every(link => link.getAttribute('href') === '/admin/eventos/event-1')).toBe(true);
    expect(element.textContent).toContain('Página 2 de 3');
  });

  it('returns focus to the visible table link rather than the hidden mobile card', () => {
    const component = Object.create(AdminReadOnlyEventSearchComponent.prototype) as any;
    component.state = { consumeReturnFocus: () => 'event-1' };
    const card = document.createElement('a'); card.id = 'admin-search-event-event-1-card';
    const table = document.createElement('a'); table.id = 'admin-search-event-event-1-table'; table.href = '#';
    document.body.append(card, table);
    vi.spyOn(card, 'getClientRects').mockReturnValue([] as any);
    vi.spyOn(table, 'getClientRects').mockReturnValue([{}] as any);
    component.restoreFocus();
    expect(document.activeElement).toBe(table);
    card.remove(); table.remove();
  });
});
