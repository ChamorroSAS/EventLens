import { Component, EventEmitter, Input, Output, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminApiService } from './admin-api.service.js';
import type {
  AdminSearchEntityType,
  AdminSearchResultItem,
  AdminSearchEventItem,
  AdminSearchOrganizerItem,
} from './admin.types.js';

@Component({
  selector: 'eventlens-admin-event-search',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="admin-search-container" aria-labelledby="search-heading">
      <header class="search-header">
        <h2 id="search-heading" class="search-title">Búsqueda Administrativa</h2>
        <p class="search-desc">
          Localiza eventos u organizadores para diagnóstico y soporte. Los resultados no muestran previsualizaciones de medios.
        </p>
      </header>

      <form (submit)="onSearch($event)" class="search-bar">
        <div class="search-inputs">
          <div class="input-field">
            <label for="search-term-input" class="visually-hidden">Término de búsqueda</label>
            <input
              id="search-term-input"
              type="search"
              class="form-control"
              placeholder="Buscar por ID, nombre de evento o correo de organizador..."
              [value]="searchQuery()"
              (input)="onQueryInput($any($event.target).value)"
            />
          </div>

          <div class="select-field">
            <label for="search-type-select" class="visually-hidden">Tipo de entidad</label>
            <select
              id="search-type-select"
              class="form-select"
              [value]="entityType()"
              (change)="onEntityTypeChange($any($event.target).value)"
            >
              <option value="ALL">Todos (Eventos y Organizadores)</option>
              <option value="EVENT">Solo Eventos</option>
              <option value="ORGANIZER">Solo Organizadores</option>
            </select>
          </div>

          <button type="submit" class="btn btn-primary" [disabled]="loading()">
            {{ loading() ? 'Buscando...' : 'Buscar' }}
          </button>
        </div>
      </form>

      @if (errorMessage()) {
        <div class="alert alert-danger" role="alert">
          {{ errorMessage() }}
        </div>
      }

      @if (loading()) {
        <div class="loading-state" role="status">
          Buscando registros en la consola...
        </div>
      } @else if (searched() && results().length === 0) {
        <div class="empty-state" role="status">
          <p>No se encontraron eventos u organizadores con el criterio especificado.</p>
        </div>
      } @else if (results().length > 0) {
        <div class="results-table-container">
          <table class="results-table" aria-label="Resultados de búsqueda administrativa">
            <thead>
              <tr>
                <th scope="col">Tipo</th>
                <th scope="col">Identificador / Nombre</th>
                <th scope="col">Detalle / Contacto</th>
                <th scope="col">Estado</th>
                <th scope="col">Fecha Creación</th>
                <th scope="col">Acción</th>
              </tr>
            </thead>
            <tbody>
              @for (item of results(); track item.id) {
                <tr>
                  <td>
                    <span
                      class="badge"
                      [ngClass]="item.type === 'EVENT' ? 'badge-event' : 'badge-org'"
                    >
                      {{ item.type === 'EVENT' ? 'Evento' : 'Organizador' }}
                    </span>
                  </td>
                  <td>
                    <strong class="item-title">
                      {{ item.type === 'EVENT' ? asEvent(item).name : asOrg(item).email }}
                    </strong>
                    <div class="item-id mono">{{ item.id }}</div>
                  </td>
                  <td>
                    @if (item.type === 'EVENT') {
                      <div class="text-xs text-muted">
                        Org: <span class="mono">{{ asEvent(item).organizerId }}</span>
                      </div>
                      <div class="text-xs text-muted">TZ: {{ asEvent(item).timezone }}</div>
                    } @else {
                      <div class="text-xs text-muted">
                        Adulto: {{ asOrg(item).declaredAdult ? 'Sí' : 'No' }}
                      </div>
                    }
                  </td>
                  <td>
                    <span class="status-pill status-{{ item.status.toLowerCase() }}">
                      {{ item.status }}
                    </span>
                  </td>
                  <td class="text-xs text-muted">
                    {{ item.createdAt }}
                  </td>
                  <td>
                    @if (item.type === 'EVENT') {
                      <button
                        type="button"
                        class="btn-sm btn-inspect"
                        (click)="onSelectEvent(item.id, $event)"
                        [attr.aria-label]="'Abrir detalle del evento ' + asEvent(item).name"
                      >
                        Abrir Detalle
                      </button>
                    } @else {
                      <span class="text-xs text-muted">Org Registrado</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
  styles: [`
    .admin-search-container {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 0.75rem;
      padding: 1.5rem;
      color: #f8fafc;
    }
    .search-header { margin-bottom: 1.25rem; }
    .search-title { font-size: 1.25rem; font-weight: 600; margin: 0 0 0.25rem 0; }
    .search-desc { font-size: 0.875rem; color: #94a3b8; margin: 0; }
    .search-bar { margin-bottom: 1.5rem; }
    .search-inputs {
      display: flex;
      gap: 0.75rem;
      align-items: center;
      flex-wrap: wrap;
    }
    .input-field { flex: 1; min-width: 16rem; }
    .form-control, .form-select {
      background: #1e293b;
      border: 1px solid #334155;
      color: #f8fafc;
      padding: 0.5rem 0.75rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      width: 100%;
      box-sizing: border-box;
    }
    .form-control:focus, .form-select:focus {
      outline: 2px solid #38bdf8;
      border-color: #38bdf8;
    }
    .select-field { width: 14rem; }
    .btn {
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .btn-primary { background: #0284c7; color: white; }
    .btn-primary:hover:not(:disabled) { background: #0369a1; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-sm {
      padding: 0.25rem 0.5rem;
      font-size: 0.75rem;
      border-radius: 0.25rem;
      cursor: pointer;
      font-weight: 500;
      border: 1px solid transparent;
    }
    .btn-inspect { background: #38bdf8; color: #0f172a; }
    .btn-inspect:hover { background: #7dd3fc; }
    .loading-state, .empty-state {
      padding: 2.5rem 1rem;
      text-align: center;
      color: #94a3b8;
    }
    .results-table-container {
      overflow-x: auto;
      border: 1px solid #1e293b;
      border-radius: 0.5rem;
    }
    .results-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
      text-align: left;
    }
    .results-table th, .results-table td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #1e293b;
    }
    .results-table th {
      background: #1e293b;
      color: #94a3b8;
      font-size: 0.75rem;
      text-transform: uppercase;
      font-weight: 600;
    }
    .badge {
      display: inline-block;
      padding: 0.125rem 0.375rem;
      border-radius: 0.25rem;
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-event { background: #0369a1; color: #bae6fd; }
    .badge-org { background: #4c1d95; color: #ddd6fe; }
    .status-pill {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .status-draft { background: #334155; color: #94a3b8; }
    .status-active { background: #047857; color: #a7f3d0; }
    .status-suspended { background: #b91c1c; color: #fecdd3; }
    .status-closed { background: #475569; color: #cbd5e1; }
    .mono { font-family: monospace; }
    .text-xs { font-size: 0.75rem; }
    .text-muted { color: #94a3b8; }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0,0,0,0);
      border: 0;
    }
  `]
})
export class AdminEventSearchComponent {
  @Input() callerActorId?: string;
  @Output() eventSelected = new EventEmitter<{ eventId: string; element: HTMLElement }>();

  private readonly adminApi = inject(AdminApiService);

  readonly searchQuery = signal<string>('');
  readonly entityType = signal<AdminSearchEntityType>('ALL');
  readonly results = signal<AdminSearchResultItem[]>([]);
  readonly loading = signal<boolean>(false);
  readonly searched = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  asEvent(item: AdminSearchResultItem): AdminSearchEventItem {
    return item as AdminSearchEventItem;
  }

  asOrg(item: AdminSearchResultItem): AdminSearchOrganizerItem {
    return item as AdminSearchOrganizerItem;
  }

  onQueryInput(val: string): void {
    this.searchQuery.set(val);
  }

  onEntityTypeChange(val: string): void {
    this.entityType.set(val as AdminSearchEntityType);
  }

  async onSearch(event?: Event): Promise<void> {
    if (event) event.preventDefault();
    this.loading.set(true);
    this.errorMessage.set(null);
    this.searched.set(true);

    try {
      const res = await this.adminApi.search({
        query: this.searchQuery().trim() || undefined,
        entityType: this.entityType(),
        page: 1,
        limit: 20,
      }, this.callerActorId);
      this.results.set([...res.items]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al buscar en el soporte administrativo';
      this.errorMessage.set(msg);
      this.results.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  onSelectEvent(eventId: string, event: Event): void {
    this.eventSelected.emit({
      eventId,
      element: event.currentTarget as HTMLElement,
    });
  }
}
