import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import type {
  MediaCardModel,
  MediaStatusFilter,
  EmptyReason,
  RetryCycleResponse,
} from './media.types.js';
import { MediaLibraryService } from './media-library.service.js';
import { MediaStatusFilterComponent } from './media-status-filter.component.js';
import { OrganizerMediaCardComponent } from './organizer-media-card.component.js';
import { OrganizerMediaTableComponent } from './organizer-media-table.component.js';

@Component({
  selector: 'eventlens-organizer-media-library',
  standalone: true,
  imports: [
    MediaStatusFilterComponent,
    OrganizerMediaCardComponent,
    OrganizerMediaTableComponent,
  ],
  template: `
    <div class="organizer-media-library" [attr.aria-label]="'Biblioteca de medios del evento ' + eventRef">
      <!-- CABECERA Y HERRAMIENTAS -->
      <header class="library-header">
        <div class="header-left">
          <h2 class="library-title">Biblioteca de fotos y videos</h2>
          <span class="library-counter" role="status" aria-live="polite">
            @if (totalCount() > 0) {
              Mostrando {{ items().length }} de {{ filterCount() }} archivos (Total evento: {{ totalCount() }})
            } @else if (!isLoading() && !errorMessage()) {
              0 archivos
            }
          </span>
        </div>

        <div class="header-actions">
          <!-- CONMUTADOR DE VISTA (CUADRÍCULA / TABLA) -->
          <div class="view-switcher" role="group" aria-label="Modo de visualización">
            <button
              type="button"
              class="btn-view"
              [class.active]="viewMode() === 'grid'"
              [attr.aria-pressed]="viewMode() === 'grid'"
              aria-label="Ver en cuadrícula"
              (click)="setViewMode('grid')"
            >
              <span aria-hidden="true">⊞</span> Cuadrícula
            </button>
            <button
              type="button"
              class="btn-view"
              [class.active]="viewMode() === 'table'"
              [attr.aria-pressed]="viewMode() === 'table'"
              aria-label="Ver en tabla"
              (click)="setViewMode('table')"
            >
              <span aria-hidden="true">☰</span> Tabla
            </button>
          </div>

          <button
            type="button"
            class="btn-refresh"
            aria-label="Actualizar lista de archivos multimedia"
            [disabled]="isLoading()"
            (click)="loadLibrary()"
          >
            <span aria-hidden="true">🔄</span> Actualizar
          </button>
        </div>
      </header>

      <!-- BARRA DE FILTROS ACCESIBLE -->
      <section class="toolbar-section" aria-label="Opciones de filtrado">
        <eventlens-media-status-filter
          [activeFilter]="activeFilter()"
          [disabled]="isLoading()"
          (filterChange)="onFilterChanged($event)"
        />
      </section>

      <!-- ESTADOS DE CARGA, ERROR, VACÍO Y CONTENIDO -->
      <div class="library-content" role="region" aria-label="Contenido multimedia del evento">
        @if (isLoading()) {
          <div class="state-card loading-state" role="status" aria-busy="true">
            <span class="spinner" aria-hidden="true">⏳</span>
            <p>Cargando archivos multimedia del evento…</p>
          </div>
        } @else if (errorMessage()) {
          <div class="state-card error-state" role="alert">
            <span class="alert-icon" aria-hidden="true">⚠️</span>
            <div class="error-details">
              <h3>Error al cargar los medios</h3>
              <p>{{ errorMessage() }}</p>
              <button
                type="button"
                class="btn-retry"
                aria-label="Reintentar cargar biblioteca de medios"
                (click)="loadLibrary()"
              >
                Reintentar
              </button>
            </div>
          </div>
        } @else if (emptyReason() === 'EMPTY_LIBRARY' || (totalCount() === 0 && items().length === 0)) {
          <!-- CRITERIO 3: VACÍO TOTAL DEL EVENTO (EMPTY_LIBRARY) -->
          <div class="state-card empty-library-state" role="status">
            <span class="empty-icon" aria-hidden="true">📷</span>
            <h3>Sin fotos ni videos en el evento</h3>
            <p class="empty-description">Aún no hay fotos ni videos subidos en este evento.</p>
          </div>
        } @else if (emptyReason() === 'EMPTY_FILTER_RESULTS' || items().length === 0) {
          <!-- CRITERIO 3: VACÍO POR FILTRO SIN RESULTADOS (EMPTY_FILTER_RESULTS) -->
          <div class="state-card empty-filter-state" role="status">
            <span class="empty-icon" aria-hidden="true">🔍</span>
            <h3>No se encontraron coincidencias</h3>
            <p class="empty-description">No hay medios que coincidan con el filtro seleccionado.</p>
            <button
              type="button"
              class="btn-clear-filters"
              aria-label="Limpiar filtros y ver todos los medios"
              (click)="onClearFilters()"
            >
              Limpiar filtros
            </button>
          </div>
        } @else {
          <!-- VISTA DE MEDIOS: CUADRÍCULA O TABLA -->
          @if (viewMode() === 'grid') {
            <div class="media-grid" role="list" aria-label="Cuadrícula de archivos multimedia">
              @for (item of items(); track item.mediaRef) {
                <div role="listitem">
                  <eventlens-organizer-media-card
                    [media]="item"
                    (retryCycleSubmitted)="onRetryCycleSubmitted($event)"
                    (refreshRequested)="loadLibrary()"
                    (downloadTriggered)="onDownloadTriggered(item)"
                  />
                </div>
              }
            </div>
          } @else {
            <eventlens-organizer-media-table
              [items]="items()"
              (retryCycleSubmitted)="onRetryCycleSubmitted($event)"
              (refreshRequested)="loadLibrary()"
              (downloadTriggered)="onDownloadTriggered($event)"
            />
          }
        }
      </div>
    </div>
  `,
  styles: `
    .organizer-media-library {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      width: 100%;
    }
    .library-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid #e2e8f0;
    }
    .header-left {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .library-title {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: #0f172a;
    }
    .library-counter {
      font-size: 0.8125rem;
      color: #64748b;
      font-weight: 500;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .view-switcher {
      display: inline-flex;
      border: 1px solid #cbd5e1;
      border-radius: 0.5rem;
      overflow: hidden;
      background-color: #f8fafc;
    }
    .btn-view {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.375rem;
      min-height: 44px;
      padding: 0.5rem 0.875rem;
      font-size: 0.875rem;
      font-weight: 500;
      color: #475569;
      background: none;
      border: none;
      cursor: pointer;
      transition: all 0.15s ease-in-out;
    }
    .btn-view:hover:not(.active) {
      background-color: #e2e8f0;
      color: #0f172a;
    }
    .btn-view.active {
      background-color: #2563eb;
      color: #ffffff;
      font-weight: 600;
    }
    .btn-view:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: -2px;
      z-index: 1;
    }
    .btn-refresh {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.375rem;
      min-height: 44px;
      padding: 0.5rem 0.875rem;
      font-size: 0.875rem;
      font-weight: 500;
      color: #334155;
      background-color: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 0.5rem;
      cursor: pointer;
      transition: background-color 0.15s ease;
    }
    .btn-refresh:hover:not(:disabled) {
      background-color: #e2e8f0;
      color: #0f172a;
    }
    .btn-refresh:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }
    .btn-refresh:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .toolbar-section {
      width: 100%;
    }
    .library-content {
      width: 100%;
    }
    .state-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 1.5rem;
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 0.75rem;
      text-align: center;
      gap: 0.75rem;
    }
    .spinner, .empty-icon, .alert-icon {
      font-size: 2.25rem;
    }
    .state-card h3 {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
      color: #0f172a;
    }
    .empty-description {
      margin: 0;
      font-size: 0.875rem;
      color: #64748b;
      max-width: 440px;
    }
    .btn-clear-filters {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 0.5rem 1.25rem;
      border-radius: 0.5rem;
      background-color: #2563eb;
      color: #ffffff;
      font-size: 0.875rem;
      font-weight: 600;
      border: none;
      cursor: pointer;
      margin-top: 0.5rem;
      transition: background-color 0.15s ease;
    }
    .btn-clear-filters:hover {
      background-color: #1d4ed8;
    }
    .btn-clear-filters:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }
    .error-details {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
    }
    .error-state p {
      margin: 0;
      color: #991b1b;
      font-size: 0.875rem;
    }
    .btn-retry {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      background-color: #dc2626;
      color: #ffffff;
      font-size: 0.875rem;
      font-weight: 600;
      border: none;
      cursor: pointer;
      margin-top: 0.25rem;
    }
    .btn-retry:hover {
      background-color: #b91c1c;
    }
    .btn-retry:focus-visible {
      outline: 2px solid #dc2626;
      outline-offset: 2px;
    }
    .media-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.25rem;
    }
    @media (min-width: 640px) {
      .media-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    @media (min-width: 1024px) {
      .media-grid {
        grid-template-columns: repeat(3, 1fr);
      }
    }
    @media (min-width: 1280px) {
      .media-grid {
        grid-template-columns: repeat(4, 1fr);
      }
    }
  `,
})
export class OrganizerMediaLibraryComponent implements OnInit {
  private readonly mediaLibraryService = inject(MediaLibraryService);

  @Input({ required: true }) eventRef!: string;
  @Input() initialFilter: MediaStatusFilter = 'ALL';

  @Output() retryCycleTriggered = new EventEmitter<RetryCycleResponse>();
  @Output() downloadItemTriggered = new EventEmitter<MediaCardModel>();

  readonly items = signal<MediaCardModel[]>([]);
  readonly totalCount = signal<number>(0);
  readonly filterCount = signal<number>(0);
  readonly activeFilter = signal<MediaStatusFilter>('ALL');
  readonly emptyReason = signal<EmptyReason | null>(null);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly viewMode = signal<'grid' | 'table'>('grid');

  async ngOnInit(): Promise<void> {
    if (this.initialFilter) {
      this.activeFilter.set(this.initialFilter);
    }
    await this.loadLibrary();
  }

  async loadLibrary(): Promise<void> {
    if (!this.eventRef) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const snapshot = await this.mediaLibraryService.getOrganizerMediaLibrary({
        eventRef: this.eventRef,
        statusFilter: this.activeFilter(),
        limit: 50,
        offset: 0,
      });

      this.items.set(snapshot.items ?? []);
      this.totalCount.set(snapshot.totalCount ?? 0);
      this.filterCount.set(snapshot.filterCount ?? 0);
      this.emptyReason.set(snapshot.emptyReason ?? null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'ACCESS_DENIED') {
        this.errorMessage.set('No tienes permisos autorizados para ver la biblioteca de este evento.');
      } else if (msg === 'EVENT_NOT_FOUND') {
        this.errorMessage.set('El evento solicitado no fue encontrado.');
      } else {
        this.errorMessage.set('No fue posible conectar con el servidor para consultar los medios.');
      }
      this.items.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  async onFilterChanged(filter: MediaStatusFilter): Promise<void> {
    this.activeFilter.set(filter);
    await this.loadLibrary();
  }

  async onClearFilters(): Promise<void> {
    this.activeFilter.set('ALL');
    await this.loadLibrary();
  }

  setViewMode(mode: 'grid' | 'table'): void {
    this.viewMode.set(mode);
  }

  onRetryCycleSubmitted(response: RetryCycleResponse): void {
    this.retryCycleTriggered.emit(response);
    // Reload library to update progress indicators
    void this.loadLibrary();
  }

  onDownloadTriggered(item: MediaCardModel): void {
    this.downloadItemTriggered.emit(item);
  }
}
