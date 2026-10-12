import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminApiService } from './admin-api.service.js';
import { ReportSeverityBadgeComponent } from './report-severity-badge.component.js';
import type {
  AdminModerationQueueItem,
  ModerationSeverity,
  ModerationCaseStatus
} from './admin.types.js';

@Component({
  selector: 'eventlens-report-queue',
  standalone: true,
  imports: [CommonModule, ReportSeverityBadgeComponent],
  template: `
    <div class="report-queue-container" role="region" aria-labelledby="queue-heading">
      <div class="queue-header">
        <div>
          <h2 id="queue-heading" class="queue-title">Cola de Moderación y Casos</h2>
          <p class="queue-subtitle">
            Listado sanitizado de reportes y solicitudes de retiro. No expone multimedia sin justificación explícita.
          </p>
        </div>
        <button
          type="button"
          class="btn-refresh"
          (click)="loadQueue()"
          [disabled]="isLoading()"
          aria-label="Actualizar cola de moderación"
        >
          Actualizar
        </button>
      </div>

      <!-- Filters Toolbar -->
      <div class="filter-toolbar" role="search" aria-label="Filtros de moderación">
        <div class="filter-group">
          <label for="filter-severity" class="filter-label">Severidad:</label>
          <select
            id="filter-severity"
            class="filter-select"
            [value]="severityFilter()"
            (change)="onSeverityFilterChange($event)"
          >
            <option value="ALL">Todas las severidades</option>
            <option value="CRITICAL">Crítica (Prioridad)</option>
            <option value="NORMAL">Normal</option>
            <option value="UNCLASSIFIED">Sin clasificar</option>
          </select>
        </div>

        <div class="filter-group">
          <label for="filter-status" class="filter-label">Estado:</label>
          <select
            id="filter-status"
            class="filter-select"
            [value]="statusFilter()"
            (change)="onStatusFilterChange($event)"
          >
            <option value="ALL">Todos los estados</option>
            <option value="PENDING_REVIEW">Pendiente de revisión</option>
            <option value="UNDER_INVESTIGATION">En investigación</option>
            <option value="ACTION_TAKEN">Acción tomada</option>
            <option value="DISMISSED">Desestimado</option>
          </select>
        </div>
      </div>

      <!-- Loading State -->
      @if (isLoading()) {
        <div class="state-container loading-state" role="status" aria-live="polite">
          <div class="spinner" aria-hidden="true"></div>
          <p>Cargando cola de moderación...</p>
        </div>
      } @else if (errorMessage()) {
        <!-- Error State -->
        <div class="state-container error-state" role="alert">
          <p class="error-msg">{{ errorMessage() }}</p>
          <button type="button" class="btn-retry" (click)="loadQueue()">Reintentar</button>
        </div>
      } @else if (items().length === 0) {
        <!-- Empty States (Diferencia EMPTY_QUEUE de EMPTY_FILTER_RESULTS) -->
        <div class="state-container empty-state" role="status">
          @if (isFiltered()) {
            <h3 class="empty-title">Sin resultados para el filtro</h3>
            <p class="empty-desc">
              No se encontraron casos de moderación que coincidan con los filtros seleccionados.
            </p>
            <button type="button" class="btn-reset-filters" (click)="resetFilters()">
              Restablecer filtros
            </button>
          } @else {
            <h3 class="empty-title">Cola limpia</h3>
            <p class="empty-desc">
              No hay casos de moderación pendientes en la cola general.
            </p>
          }
        </div>
      } @else {
        <!-- Data Table (SANITIZED: NO MEDIA PREVIEW in queue list) -->
        <div class="table-responsive">
          <table class="queue-table" aria-label="Casos de moderación en cola">
            <thead>
              <tr>
                <th scope="col">Severidad</th>
                <th scope="col">Tipo</th>
                <th scope="col">Motivo</th>
                <th scope="col">Evento / Ref</th>
                <th scope="col">Reportes</th>
                <th scope="col">Estado</th>
                <th scope="col">Fecha</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              @for (item of items(); track item.caseId) {
                <tr class="queue-row" [class.row-critical]="item.severity === 'CRITICAL'">
                  <td>
                    <eventlens-report-severity-badge [severity]="item.severity"></eventlens-report-severity-badge>
                  </td>
                  <td>
                    <span class="type-badge" [ngClass]="item.caseType === 'REPORT' ? 'type-report' : 'type-removal'">
                      {{ item.caseType === 'REPORT' ? 'Denuncia' : 'Retiro' }}
                    </span>
                  </td>
                  <td>
                    <span class="reason-cell" [title]="item.reason">{{ getReasonLabel(item.reason) }}</span>
                  </td>
                  <td>
                    <span class="ref-cell" [title]="item.eventId">{{ item.eventId }}</span>
                  </td>
                  <td>
                    <span class="count-badge">{{ item.reportsCount }}</span>
                  </td>
                  <td>
                    <span class="status-cell" [ngClass]="'status-' + item.status.toLowerCase()">
                      {{ getStatusLabel(item.status) }}
                    </span>
                  </td>
                  <td class="date-cell">
                    {{ item.createdAt | date:'short' }}
                  </td>
                  <td class="action-cell">
                    <button
                      type="button"
                      class="btn-view-detail"
                      (click)="onSelectCase(item.caseId)"
                      [attr.aria-label]="'Revisar caso ' + item.caseId"
                    >
                      Revisar caso ({{ item.caseId }})
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: `
    .report-queue-container {
      background-color: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 0.75rem;
      padding: 1.5rem;
      color: #f8fafc;
    }
    .queue-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #1e293b;
    }
    .queue-title {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: #f8fafc;
    }
    .queue-subtitle {
      margin: 0.25rem 0 0 0;
      font-size: 0.875rem;
      color: #94a3b8;
    }
    .btn-refresh {
      background-color: #1e293b;
      color: #cbd5e1;
      border: 1px solid #334155;
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
      min-height: 38px;
    }
    .btn-refresh:hover:not(:disabled) {
      background-color: #334155;
      color: #ffffff;
    }
    .filter-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem;
      margin-bottom: 1.25rem;
      padding: 0.75rem 1rem;
      background-color: #090d16;
      border: 1px solid #1e293b;
      border-radius: 0.5rem;
    }
    .filter-group {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .filter-label {
      font-size: 0.8125rem;
      font-weight: 600;
      color: #94a3b8;
    }
    .filter-select {
      background-color: #1e293b;
      border: 1px solid #334155;
      color: #f1f5f9;
      padding: 0.375rem 0.75rem;
      border-radius: 0.375rem;
      font-size: 0.8125rem;
      font-family: inherit;
      outline: none;
    }
    .filter-select:focus {
      border-color: #38bdf8;
    }
    .state-container {
      padding: 3rem 1.5rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 0.75rem;
    }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #1e293b;
      border-top-color: #38bdf8;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .error-msg {
      margin: 0;
      color: #fca5a5;
      font-size: 0.875rem;
    }
    .btn-retry, .btn-reset-filters {
      background-color: #1e293b;
      border: 1px solid #334155;
      color: #38bdf8;
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
    }
    .empty-title {
      margin: 0;
      font-size: 1.125rem;
      color: #f1f5f9;
    }
    .empty-desc {
      margin: 0;
      font-size: 0.875rem;
      color: #64748b;
      max-width: 24rem;
    }
    .table-responsive {
      overflow-x: auto;
    }
    .queue-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
      text-align: left;
    }
    .queue-table th {
      padding: 0.75rem 1rem;
      background-color: #090d16;
      color: #94a3b8;
      font-weight: 600;
      border-bottom: 1px solid #1e293b;
      white-space: nowrap;
    }
    .queue-table td {
      padding: 0.875rem 1rem;
      border-bottom: 1px solid #1e293b;
      vertical-align: middle;
    }
    .queue-row:hover {
      background-color: rgba(30, 41, 59, 0.4);
    }
    .row-critical {
      background-color: rgba(69, 10, 10, 0.15);
    }
    .type-badge {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .type-report {
      background-color: #1e293b;
      color: #93c5fd;
    }
    .type-removal {
      background-color: #1e293b;
      color: #f472b6;
    }
    .reason-cell {
      font-weight: 500;
      color: #f1f5f9;
    }
    .ref-cell {
      font-family: monospace;
      color: #94a3b8;
      font-size: 0.8125rem;
    }
    .count-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0 0.375rem;
      border-radius: 10px;
      background-color: #1e293b;
      color: #cbd5e1;
      font-size: 0.75rem;
      font-weight: 700;
    }
    .status-cell {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: capitalize;
    }
    .status-pending_review {
      color: #f59e0b;
    }
    .status-under_investigation {
      color: #38bdf8;
    }
    .status-action_taken {
      color: #22c55e;
    }
    .status-dismissed {
      color: #94a3b8;
    }
    .date-cell {
      color: #64748b;
      font-size: 0.8125rem;
      white-space: nowrap;
    }
    .btn-view-detail {
      background-color: #0284c7;
      color: #ffffff;
      border: none;
      padding: 0.375rem 0.75rem;
      border-radius: 0.375rem;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      min-height: 32px;
      white-space: nowrap;
      transition: background-color 0.15s;
    }
    .btn-view-detail:hover {
      background-color: #0369a1;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      border: 0;
    }
  `
})
export class ReportQueueComponent implements OnInit {
  @Input() callerActorId?: string;
  @Output() caseSelected = new EventEmitter<string>();

  readonly items = signal<readonly AdminModerationQueueItem[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly severityFilter = signal<ModerationSeverity | 'ALL'>('ALL');
  readonly statusFilter = signal<ModerationCaseStatus | 'ALL'>('ALL');

  constructor(private readonly adminApi: AdminApiService) {}

  ngOnInit(): void {
    this.loadQueue();
  }

  isFiltered(): boolean {
    return this.severityFilter() !== 'ALL' || this.statusFilter() !== 'ALL';
  }

  onSeverityFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.severityFilter.set(target.value as ModerationSeverity | 'ALL');
    this.loadQueue();
  }

  onStatusFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.statusFilter.set(target.value as ModerationCaseStatus | 'ALL');
    this.loadQueue();
  }

  resetFilters(): void {
    this.severityFilter.set('ALL');
    this.statusFilter.set('ALL');
    this.loadQueue();
  }

  async loadQueue(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const result = await this.adminApi.getModerationQueue(
        {
          severity: this.severityFilter(),
          status: this.statusFilter()
        },
        this.callerActorId
      );
      this.items.set(result.items);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar la cola';
      this.errorMessage.set(msg);
    } finally {
      this.isLoading.set(false);
    }
  }

  onSelectCase(caseId: string): void {
    this.caseSelected.emit(caseId);
  }

  getReasonLabel(reason: string): string {
    switch (reason) {
      case 'INAPPROPRIATE_CONTENT': return 'Contenido inapropiado';
      case 'PRIVACY_VIOLATION': return 'Violación de privacidad';
      case 'INTIMACY_VIOLATION': return 'Contenido íntimo';
      case 'COPYRIGHT_INFRINGEMENT': return 'Derechos de autor';
      case 'APPEAR_IN_MEDIA': return 'Aparece en la imagen';
      case 'OTHER': return 'Otro motivo';
      default: return reason;
    }
  }

  getStatusLabel(status: ModerationCaseStatus): string {
    switch (status) {
      case 'PENDING_REVIEW': return 'Pendiente';
      case 'UNDER_INVESTIGATION': return 'Investigando';
      case 'ACTION_TAKEN': return 'Resuelto';
      case 'DISMISSED': return 'Desestimado';
      default: return status;
    }
  }
}
