import { CommonModule } from '@angular/common';
import { Component, afterNextRender, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AdminReadOnlyApiService } from './admin-read-only-api.service.js';
import { AdminReadOnlySearchStateService } from './admin-read-only-search-state.service.js';
import { AdminSessionService } from './admin-session.service.js';
import type { AdminReadOnlyEntityType, AdminReadOnlySearchItem } from './admin-read-only.types.js';

@Component({
  selector: 'eventlens-admin-read-only-event-search',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section aria-labelledby="admin-search-title">
      <h2 id="admin-search-title" tabindex="-1">Buscar eventos y organizadores</h2>
      <form class="search-form" (submit)="search($event)">
        <label for="admin-search-query">Término de búsqueda</label>
        <input id="admin-search-query" type="search" maxlength="100" [value]="query" (input)="query = $any($event.target).value" />
        <label for="admin-search-kind">Tipo</label>
        <select id="admin-search-kind" [value]="entityType" (change)="entityType = $any($event.target).value">
          <option value="ALL">Todos</option><option value="EVENT">Eventos</option><option value="ORGANIZER">Organizadores</option>
        </select>
        <label for="admin-search-status">Estado (opcional)</label>
        <input id="admin-search-status" [value]="status" (input)="status = $any($event.target).value" />
        <button type="submit" [disabled]="state.loading()">{{ state.loading() ? 'Buscando…' : 'Buscar' }}</button>
      </form>

      @if (session.state() === 'ADMIN_ACTIVE' && !session.isRevalidating()) {
        @if (state.failure(); as failure) {
          <p role="alert">{{ failureMessage(failure) }}</p>
          <button type="button" (click)="search()">Reintentar</button>
        } @else if (state.loading()) {
          <p role="status">Buscando registros…</p>
        } @else if (state.result(); as result) {
          @if (result.items.length === 0) {
            <p role="status">No se encontraron resultados.</p>
          } @else {
            <div class="cards">
              @for (item of result.items; track item.id) { <article class="card"><ng-container *ngTemplateOutlet="resultItem; context: {$implicit: item}"></ng-container></article> }
            </div>
            <table><caption>Resultados de búsqueda administrativa</caption><thead><tr><th scope="col">Tipo</th><th scope="col">Resultado</th><th scope="col">Estado</th><th scope="col">Creado</th><th scope="col">Detalle</th></tr></thead><tbody>
              @for (item of result.items; track item.id) { <tr><ng-container *ngTemplateOutlet="resultItem; context: {$implicit: item, table: true}"></ng-container></tr> }
            </tbody></table>
            <nav aria-label="Paginación de resultados">
              <button type="button" (click)="goToPage(result.pagination.page - 1)" [disabled]="result.pagination.page <= 1">Anterior</button>
              <span>Página {{ result.pagination.page }} de {{ result.pagination.totalPages }}</span>
              <button type="button" (click)="goToPage(result.pagination.page + 1)" [disabled]="result.pagination.page >= result.pagination.totalPages">Siguiente</button>
            </nav>
          }
        } @else {
          <p role="status">Introduce los criterios y selecciona Buscar.</p>
        }
      } @else {
        <p role="status">Comprobando la sesión administrativa…</p>
      }
    </section>

    <ng-template #resultItem let-item let-table="table">
      @if (table) {
        <td>{{ item.type === 'EVENT' ? 'Evento' : 'Organizador' }}</td>
        <td>{{ item.type === 'EVENT' ? item.name : item.email }}</td><td>{{ item.status }}</td><td>{{ item.createdAt }}</td>
        <td>@if (item.type === 'EVENT') { <a [routerLink]="['/admin/eventos', item.id]" [id]="focusId(item.id, 'table')" (click)="state.rememberReturnFocus(item.id)">Ver detalle</a> }</td>
      } @else {
        <p>{{ item.type === 'EVENT' ? 'Evento' : 'Organizador' }}</p><h3>{{ item.type === 'EVENT' ? item.name : item.email }}</h3><p>{{ item.status }}</p><p>Creado: {{ item.createdAt }}</p>
        @if (item.type === 'EVENT') { <a [routerLink]="['/admin/eventos', item.id]" [id]="focusId(item.id, 'card')" (click)="state.rememberReturnFocus(item.id)">Ver detalle</a> }
      }
    </ng-template>
  `,
  styleUrl: './admin-read-only-event-search.component.scss'
})
export class AdminReadOnlyEventSearchComponent {
  readonly state = inject(AdminReadOnlySearchStateService);
  readonly session = inject(AdminSessionService);
  private readonly api = inject(AdminReadOnlyApiService);
  private readonly router = inject(Router);
  query = this.state.filter().query ?? '';
  entityType: AdminReadOnlyEntityType = this.state.filter().entityType;
  status = this.state.filter().status ?? '';

  constructor() {
    afterNextRender(() => this.restoreFocus());
  }

  restoreFocus(): void {
    const eventId = this.state.consumeReturnFocus();
    const target = eventId ? ['card', 'table'].map(view => document.getElementById(this.focusId(eventId, view as 'card' | 'table')))
      .find(element => element && element.getClientRects().length > 0) : null;
    (target ?? document.getElementById('admin-search-title'))?.focus();
  }

  async search(event?: Event, page = 1): Promise<void> {
    event?.preventDefault();
    const filter = { query: this.query.trim() || undefined, status: this.status.trim() || undefined, entityType: this.entityType, page, limit: 20 } as const;
    this.state.updateFilter(filter);
    const generation = this.state.beginRequest();
    const result = await this.api.search(filter);
    if (result.ok) this.state.acceptResult(generation, result.data);
    else this.state.acceptFailure(generation, result.kind);
  }

  async goToPage(page: number): Promise<void> {
    if (page >= 1) await this.search(undefined, page);
  }

  async openEvent(eventId: string): Promise<void> {
    this.state.rememberReturnFocus(eventId);
    await this.router.navigateByUrl(`/admin/eventos/${encodeURIComponent(eventId)}`);
  }

  focusId(eventId: string, view: 'card' | 'table'): string { return `admin-search-event-${eventId}-${view}`; }

  failureMessage(kind: string): string {
    return kind === 'NOT_FOUND' ? 'No se encontró el recurso solicitado.' : 'No se pudo completar la consulta. Reintenta más tarde.';
  }

  isEvent(item: AdminReadOnlySearchItem): boolean { return item.type === 'EVENT'; }
}
