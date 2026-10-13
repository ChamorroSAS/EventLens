import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { AuditLogDetailComponent } from './audit-log-detail.component.js';
import { AuditApiService } from './audit-api.service.js';
import type {
  AuditEventPage,
  AuditEventRecord,
  AuditQueryFilters,
  AuditResult,
  AuditActorType,
  AuditViewState,
} from './audit.types.js';

@Component({
  selector: 'eventlens-audit-log-viewer',
  standalone: true,
  imports: [AuditLogDetailComponent],
  template: `
    <section class="audit-viewer-container" aria-labelledby="audit-viewer-heading">
      <header class="viewer-header">
        <div class="header-titles">
          <h2 id="audit-viewer-heading" class="viewer-title">{{ headline }}</h2>
          @if (resourceType && resourceId) {
            <p class="viewer-subtitle">
              Auditoría contextual de <span class="context-tag">{{ resourceType }}</span>:
              <span class="context-id">{{ resourceId }}</span>
            </p>
          }
        </div>
        <div class="header-status-announcer" role="status" aria-live="polite" aria-atomic="true">
          {{ screenReaderStatus() }}
        </div>
      </header>

      <!-- Barra de Filtros Contextuales -->
      <form class="filter-bar" (submit)="onApplyFilters($event)" role="search" aria-label="Filtros de auditoría">
        <div class="filter-group">
          <label for="filter-action" class="filter-label">Acción</label>
          <input
            id="filter-action"
            type="text"
            class="filter-input"
            placeholder="ej. EVENT_UPDATE"
            [value]="filters.action || ''"
            (input)="updateFilter('action', $any($event.target).value)"
          />
        </div>

        <div class="filter-group">
          <label for="filter-result" class="filter-label">Resultado</label>
          <select
            id="filter-result"
            class="filter-select"
            [value]="filters.result || ''"
            (change)="updateFilter('result', $any($event.target).value)"
          >
            <option value="">Todos los resultados</option>
            <option value="SUCCESS">Éxito</option>
            <option value="FAILURE">Fallo</option>
            <option value="DENIED">Denegado</option>
          </select>
        </div>

        <div class="filter-group">
          <label for="filter-actortype" class="filter-label">Tipo de Actor</label>
          <select
            id="filter-actortype"
            class="filter-select"
            [value]="filters.actorType || ''"
            (change)="updateFilter('actorType', $any($event.target).value)"
          >
            <option value="">Todos los actores</option>
            <option value="SYSTEM">Sistema</option>
            <option value="ADMIN">Administrador</option>
            <option value="ORGANIZER">Organizador</option>
            <option value="ANONYMOUS_GUEST">Invitado</option>
          </select>
        </div>

        <div class="filter-group">
          <label for="filter-actorid" class="filter-label">Identificador de Actor</label>
          <input
            id="filter-actorid"
            type="text"
            class="filter-input"
            placeholder="ej. admin-123"
            [value]="filters.actorId || ''"
            (input)="updateFilter('actorId', $any($event.target).value)"
          />
        </div>

        <div class="filter-actions">
          <button type="submit" class="btn-filter-apply" [disabled]="viewState() === 'loading'">
            Aplicar filtros
          </button>
          <button
            type="button"
            class="btn-filter-reset"
            (click)="resetFilters()"
            [disabled]="viewState() === 'loading' || !hasActiveFilters()"
          >
            Restablecer
          </button>
        </div>
      </form>

      <!-- Aviso de Degradación / Resultados Parciales -->
      @if (pageData()?.isPartial) {
        <div class="partial-notice" role="alert">
          <span class="notice-icon" aria-hidden="true">⚠️</span>
          <span>
            Aviso de observabilidad: Mostrando registros parciales debido a una degradación temporal en la recolección de logs.
          </span>
        </div>
      }

      <!-- Contenedor Principal de Estados -->
      <div class="viewer-content">
        <!-- Estado: Cargando -->
        @if (viewState() === 'loading') {
          <div class="state-container state-loading" role="status" aria-live="polite">
            <span class="spinner" aria-hidden="true"></span>
            <p>Cargando eventos de auditoría…</p>
          </div>
        }

        <!-- Estado: Sesión expirada / No autorizado -->
        @else if (viewState() === 'forbidden') {
          <div class="state-container state-forbidden" role="alert">
            <span class="state-icon" aria-hidden="true">🔒</span>
            <h3>Acceso No Autorizado</h3>
            <p>
              Tu sesión ha expirado o no cuentas con los permisos administrativos necesarios para consultar la auditoría.
            </p>
          </div>
        }

        <!-- Estado: Error de comunicación -->
        @else if (viewState() === 'error') {
          <div class="state-container state-error" role="alert">
            <span class="state-icon" aria-hidden="true">⚠️</span>
            <h3>Error al Consultar Auditoría</h3>
            <p>No fue posible comunicarse con el servicio de auditoría contextual.</p>
            <button type="button" class="btn-retry" (click)="loadEvents(currentPage())">
              Reintentar consulta
            </button>
          </div>
        }

        <!-- Estado: Sin coincidencias con filtros aplicados (Escenario 2) -->
        @else if (viewState() === 'no-results') {
          <div class="state-container state-no-results" role="status">
            <span class="state-icon" aria-hidden="true">🔍</span>
            <h3>Sin Coincidencias</h3>
            <p>No se encontraron eventos de auditoría que coincidan con los filtros aplicados.</p>
            <button type="button" class="btn-reset-empty" (click)="resetFilters()">
              Restablecer filtros
            </button>
          </div>
        }

        <!-- Estado: Vacío sin filtros -->
        @else if (viewState() === 'empty') {
          <div class="state-container state-empty">
            <span class="state-icon" aria-hidden="true">📋</span>
            <h3>Sin Registros de Auditoría</h3>
            <p>No existen registros de auditoría disponibles para este contexto.</p>
          </div>
        }

        <!-- Estado: Éxito con registros (Desktop/Tablet Table + Mobile Cards) -->
        @else if (viewState() === 'success' && pageData()) {
          <div class="table-wrapper">
            <table class="audit-table">
              <caption class="sr-only">
                Listado tabular de eventos de auditoría sanitizados para el contexto actual.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Fecha / Hora</th>
                  <th scope="col">Acción</th>
                  <th scope="col">Resultado</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Recurso</th>
                  <th scope="col" class="th-actions"><span class="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                @for (event of pageData()!.items; track event.id) {
                  <tr
                    class="table-row"
                    tabindex="0"
                    (click)="openDetail(event)"
                    (keydown.enter)="openDetail(event)"
                  >
                    <td class="td-date">
                      <time [attr.datetime]="formatDateIso(event.occurredAt)">
                        {{ formatDateShort(event.occurredAt) }}
                      </time>
                    </td>
                    <td class="td-action">
                      <code class="action-tag">{{ event.action }}</code>
                    </td>
                    <td class="td-result">
                      <span
                        class="status-pill"
                        [class]="'pill-' + event.result.toLowerCase()"
                        role="status"
                      >
                        <span class="pill-icon" aria-hidden="true">
                          @if (event.result === 'SUCCESS') { ✓ }
                          @else if (event.result === 'FAILURE') { ✕ }
                          @else if (event.result === 'DENIED') { ⊘ }
                        </span>
                        <span>{{ formatResultLabel(event.result) }}</span>
                      </span>
                    </td>
                    <td class="td-actor">
                      <div class="actor-cell">
                        <span class="actor-category">
                          {{ event.actorType === 'SYSTEM' ? 'Sistema' : event.actorType }}
                        </span>
                        <span class="actor-id">{{ event.actorId }}</span>
                      </div>
                    </td>
                    <td class="td-resource">
                      <span class="resource-text">{{ event.resourceType }}: {{ event.resourceId }}</span>
                    </td>
                    <td class="td-actions">
                      <button
                        type="button"
                        class="btn-row-detail"
                        [id]="'btn-detail-' + event.id"
                        [attr.aria-label]="'Ver detalle del evento ' + event.action + ' con ID ' + event.id"
                        (click)="openDetail(event); $event.stopPropagation()"
                      >
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Vista de Tarjetas Móvil -->
          <div class="mobile-cards-list">
            @for (event of pageData()!.items; track event.id) {
              <article
                class="audit-card-mobile"
                tabindex="0"
                (click)="openDetail(event)"
                (keydown.enter)="openDetail(event)"
              >
                <div class="card-mobile-header">
                  <code class="action-tag">{{ event.action }}</code>
                  <span
                    class="status-pill"
                    [class]="'pill-' + event.result.toLowerCase()"
                    role="status"
                  >
                    <span class="pill-icon" aria-hidden="true">
                      @if (event.result === 'SUCCESS') { ✓ }
                      @else if (event.result === 'FAILURE') { ✕ }
                      @else if (event.result === 'DENIED') { ⊘ }
                    </span>
                    <span>{{ formatResultLabel(event.result) }}</span>
                  </span>
                </div>
                <div class="card-mobile-body">
                  <div class="card-meta-line">
                    <span class="meta-label">Fecha:</span>
                    <time [attr.datetime]="formatDateIso(event.occurredAt)">
                      {{ formatDateShort(event.occurredAt) }}
                    </time>
                  </div>
                  <div class="card-meta-line">
                    <span class="meta-label">Actor:</span>
                    <span>{{ event.actorType === 'SYSTEM' ? 'Sistema' : event.actorType }} ({{ event.actorId }})</span>
                  </div>
                  <div class="card-meta-line">
                    <span class="meta-label">Recurso:</span>
                    <span>{{ event.resourceType }}: {{ event.resourceId }}</span>
                  </div>
                </div>
                <div class="card-mobile-footer">
                  <button
                    type="button"
                    class="btn-row-detail"
                    [attr.aria-label]="'Ver detalle del evento ' + event.action + ' con ID ' + event.id"
                    (click)="openDetail(event); $event.stopPropagation()"
                  >
                    Ver detalle completo
                  </button>
                </div>
              </article>
            }
          </div>

          <!-- Paginación Accesible -->
          <nav class="pagination-bar" aria-label="Navegación de páginas de auditoría">
            <div class="pagination-info">
              Página {{ pageData()!.page }} de {{ pageData()!.totalPages || 1 }}
              <span class="total-count">({{ pageData()!.totalCount }} registros)</span>
            </div>
            <div class="pagination-controls">
              <button
                type="button"
                class="btn-page"
                [disabled]="!pageData()!.hasPreviousPage || viewState() === 'loading'"
                (click)="loadEvents(pageData()!.page - 1)"
                aria-label="Ir a la página anterior"
              >
                ← Anterior
              </button>
              <button
                type="button"
                class="btn-page"
                [disabled]="!pageData()!.hasNextPage || viewState() === 'loading'"
                (click)="loadEvents(pageData()!.page + 1)"
                aria-label="Ir a la página siguiente"
              >
                Siguiente →
              </button>
            </div>
          </nav>
        }
      </div>

      <!-- Detalle Modal Contextual (Solo Lectura) -->
      @if (selectedEvent()) {
        <eventlens-audit-log-detail
          [event]="selectedEvent()!"
          (closed)="closeDetail()"
        />
      }
    </section>
  `,
  styles: `
    .audit-viewer-container {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      background-color: #ffffff;
      border: 1px solid #e7e7e3;
      border-radius: 0.5rem;
      padding: 1.5rem;
      color: #17202a;
    }
    .viewer-header {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      border-bottom: 1px solid #e7e7e3;
      padding-bottom: 1rem;
    }
    .viewer-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: #17345c;
      margin: 0;
    }
    .viewer-subtitle {
      font-size: 0.875rem;
      color: #667085;
      margin: 0;
    }
    .context-tag {
      font-weight: 600;
      color: #17345c;
    }
    .context-id {
      font-family: monospace;
      color: #17202a;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .filter-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: flex-end;
      padding: 1rem;
      background-color: #fafaf8;
      border: 1px solid #e7e7e3;
      border-radius: 0.375rem;
    }
    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 150px;
      flex: 1 1 150px;
    }
    .filter-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: #667085;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .filter-input, .filter-select {
      height: 38px;
      padding: 0.375rem 0.625rem;
      border: 1px solid #e7e7e3;
      border-radius: 0.375rem;
      background-color: #ffffff;
      color: #17202a;
      font-size: 0.875rem;
    }
    .filter-input:focus-visible, .filter-select:focus-visible {
      outline: 2px solid #17345c;
    }
    .filter-actions {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      padding-top: 0.5rem;
    }
    .btn-filter-apply {
      height: 38px;
      background-color: #17345c;
      color: #ffffff;
      border: none;
      border-radius: 0.375rem;
      padding: 0 1rem;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-filter-apply:hover:not(:disabled) {
      background-color: #102a4d;
    }
    .btn-filter-apply:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .btn-filter-reset {
      height: 38px;
      background-color: transparent;
      color: #667085;
      border: 1px solid #e7e7e3;
      border-radius: 0.375rem;
      padding: 0 0.875rem;
      font-size: 0.875rem;
      cursor: pointer;
    }
    .btn-filter-reset:hover:not(:disabled) {
      background-color: #ffffff;
      color: #17202a;
    }
    .btn-filter-reset:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .partial-notice {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      background-color: #fef8ee;
      border: 1px solid #f8dda6;
      border-radius: 0.375rem;
      color: #d98a26;
      font-size: 0.875rem;
      font-weight: 500;
    }
    .viewer-content {
      min-height: 240px;
      position: relative;
    }
    .state-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 3rem 1.5rem;
      border: 1px dashed #e7e7e3;
      border-radius: 0.375rem;
      background-color: #fafaf8;
    }
    .state-icon {
      font-size: 2rem;
      margin-bottom: 0.75rem;
    }
    .state-container h3 {
      font-size: 1.125rem;
      font-weight: 600;
      color: #17345c;
      margin: 0 0 0.5rem 0;
    }
    .state-container p {
      margin: 0;
      color: #667085;
      font-size: 0.875rem;
      max-width: 440px;
    }
    .spinner {
      width: 2rem;
      height: 2rem;
      border: 3px solid #e7e7e3;
      border-top-color: #17345c;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 0.75rem;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .btn-retry, .btn-reset-empty {
      margin-top: 1rem;
      background-color: #17345c;
      color: #ffffff;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-retry:hover, .btn-reset-empty:hover {
      background-color: #102a4d;
    }
    .table-wrapper {
      overflow-x: auto;
      border: 1px solid #e7e7e3;
      border-radius: 0.375rem;
      background-color: #ffffff;
    }
    .audit-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
      text-align: left;
    }
    .audit-table th {
      background-color: #fafaf8;
      color: #667085;
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #e7e7e3;
    }
    .audit-table td {
      padding: 0.875rem 1rem;
      border-bottom: 1px solid #e7e7e3;
      vertical-align: middle;
    }
    .table-row:hover {
      background-color: #fafaf8;
      cursor: pointer;
    }
    .table-row:focus-visible {
      outline: 2px solid #17345c;
      background-color: #f0f4f9;
    }
    .action-tag {
      font-family: monospace;
      font-weight: 600;
      color: #17345c;
      background-color: #f0f4f9;
      padding: 0.2rem 0.4rem;
      border-radius: 0.25rem;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.2rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      width: fit-content;
    }
    .pill-success {
      background-color: #edf7f2;
      color: #278c63;
      border: 1px solid #b7e2d0;
    }
    .pill-failure {
      background-color: #fdf2f2;
      color: #c94a4a;
      border: 1px solid #f8b4b4;
    }
    .pill-denied {
      background-color: #fef8ee;
      color: #d98a26;
      border: 1px solid #f8dda6;
    }
    .actor-cell {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }
    .actor-category {
      font-weight: 600;
      color: #17345c;
      font-size: 0.8125rem;
    }
    .actor-id {
      font-size: 0.75rem;
      color: #667085;
      font-family: monospace;
    }
    .btn-row-detail {
      background: transparent;
      border: 1px solid #e7e7e3;
      color: #17345c;
      border-radius: 0.25rem;
      padding: 0.35rem 0.65rem;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-row-detail:hover {
      background-color: #17345c;
      color: #ffffff;
    }
    .btn-row-detail:focus-visible {
      outline: 2px solid #17345c;
    }
    .mobile-cards-list {
      display: none;
      flex-direction: column;
      gap: 0.75rem;
    }
    .audit-card-mobile {
      border: 1px solid #e7e7e3;
      border-radius: 0.375rem;
      padding: 0.875rem;
      background-color: #ffffff;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .card-mobile-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .card-meta-line {
      display: flex;
      gap: 0.5rem;
      font-size: 0.8125rem;
      color: #17202a;
    }
    .meta-label {
      font-weight: 600;
      color: #667085;
      min-width: 60px;
    }
    .card-mobile-footer {
      display: flex;
      justify-content: flex-end;
      padding-top: 0.25rem;
    }
    .pagination-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.875rem 0.5rem 0 0.5rem;
      font-size: 0.875rem;
    }
    .pagination-info {
      color: #667085;
    }
    .total-count {
      font-weight: 500;
      color: #17202a;
    }
    .pagination-controls {
      display: flex;
      gap: 0.5rem;
    }
    .btn-page {
      background-color: #ffffff;
      border: 1px solid #e7e7e3;
      color: #17345c;
      border-radius: 0.375rem;
      padding: 0.375rem 0.75rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
    }
    .btn-page:hover:not(:disabled) {
      background-color: #fafaf8;
      border-color: #17345c;
    }
    .btn-page:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    @media (max-width: 768px) {
      .table-wrapper {
        display: none;
      }
      .mobile-cards-list {
        display: flex;
      }
      .filter-bar {
        flex-direction: column;
        align-items: stretch;
      }
      .filter-actions {
        width: 100%;
        justify-content: flex-end;
      }
    }
  `,
})
export class AuditLogViewerComponent implements OnInit {
  @Input() resourceType?: string;
  @Input() resourceId?: string;
  @Input() callerActorId?: string;
  @Input() headline: string = 'Registro de Auditoría Contextual';

  private readonly auditApi = inject(AuditApiService);

  readonly viewState = signal<AuditViewState>('idle');
  readonly pageData = signal<AuditEventPage | null>(null);
  readonly currentPage = signal<number>(1);
  readonly selectedEvent = signal<AuditEventRecord | null>(null);
  readonly screenReaderStatus = signal<string>('Visor de auditoría listo.');

  private lastFocusedElementId: string | null = null;

  filters: AuditQueryFilters = {
    action: '',
    result: '',
    actorType: '',
    actorId: '',
  };

  ngOnInit(): void {
    if (this.resourceType) this.filters.resourceType = this.resourceType;
    if (this.resourceId) this.filters.resourceId = this.resourceId;
    void this.loadEvents(1);
  }

  updateFilter<K extends keyof AuditQueryFilters>(key: K, value: AuditQueryFilters[K]): void {
    this.filters[key] = value;
  }

  onApplyFilters(e: Event): void {
    e.preventDefault();
    void this.loadEvents(1);
  }

  resetFilters(): void {
    this.filters = {
      action: '',
      result: '',
      actorType: '',
      actorId: '',
      resourceType: this.resourceType,
      resourceId: this.resourceId,
    };
    void this.loadEvents(1);
  }

  hasActiveFilters(): boolean {
    return !!(
      this.filters.action ||
      this.filters.result ||
      this.filters.actorType ||
      this.filters.actorId
    );
  }

  async loadEvents(page: number): Promise<void> {
    this.viewState.set('loading');
    this.screenReaderStatus.set('Consultando registros de auditoría…');

    try {
      const activeFilters: AuditQueryFilters = { ...this.filters };
      if (!activeFilters.action) delete activeFilters.action;
      if (!activeFilters.result) delete activeFilters.result;
      if (!activeFilters.actorType) delete activeFilters.actorType;
      if (!activeFilters.actorId) delete activeFilters.actorId;

      const pageResult = await this.auditApi.queryAuditEvents({
        filters: activeFilters,
        page,
        limit: 10,
        callerActorId: this.callerActorId,
      });

      this.currentPage.set(page);
      this.pageData.set(pageResult);

      if (pageResult.totalCount === 0) {
        if (this.hasActiveFilters()) {
          this.viewState.set('no-results');
          this.screenReaderStatus.set('No se encontraron registros de auditoría que coincidan con los filtros aplicados.');
        } else {
          this.viewState.set('empty');
          this.screenReaderStatus.set('No existen registros de auditoría para este contexto.');
        }
      } else {
        this.viewState.set('success');
        this.screenReaderStatus.set(
          `Se cargaron ${pageResult.items.length} registros de auditoría (Página ${pageResult.page} de ${pageResult.totalPages}).`
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'UNAUTHORIZED_ACCESS' || msg === 'FORBIDDEN') {
        this.viewState.set('forbidden');
        this.screenReaderStatus.set('Acceso no autorizado o sesión expirada.');
      } else {
        this.viewState.set('error');
        this.screenReaderStatus.set('Error de comunicación al consultar auditoría.');
      }
    }
  }

  openDetail(event: AuditEventRecord): void {
    this.lastFocusedElementId = `btn-detail-${event.id}`;
    this.selectedEvent.set(event);
  }

  closeDetail(): void {
    this.selectedEvent.set(null);
    if (this.lastFocusedElementId) {
      setTimeout(() => {
        const el = document.getElementById(this.lastFocusedElementId!);
        if (el) el.focus();
      }, 0);
    }
  }

  formatResultLabel(result: AuditResult): string {
    switch (result) {
      case 'SUCCESS':
        return 'Éxito';
      case 'FAILURE':
        return 'Fallo';
      case 'DENIED':
        return 'Denegado';
      default:
        return result;
    }
  }

  formatDateIso(date: string | Date): string {
    return date instanceof Date ? date.toISOString() : new Date(date).toISOString();
  }

  formatDateShort(date: string | Date): string {
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().replace('T', ' ').substring(0, 19);
  }
}
