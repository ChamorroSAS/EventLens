import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { JobsApiService } from './jobs-api.service.js';
import { JobDetailDialogComponent } from './job-detail-dialog.component.js';
import { JobActionConfirmDialogComponent } from './job-action-confirm-dialog.component.js';
import type {
  AdminJobAction,
  AdminJobDetail,
  AdminJobStatus,
  AdminJobSummaryItem,
  AdminQueryJobsResult
} from './jobs.types.js';

@Component({
  selector: 'eventlens-jobs-viewer',
  standalone: true,
  imports: [CommonModule, JobDetailDialogComponent, JobActionConfirmDialogComponent],
  template: `
    <section class="jobs-viewer-container" aria-labelledby="jobs-viewer-heading">
      <header class="viewer-header">
        <div class="header-titles">
          <h2 id="jobs-viewer-heading" class="viewer-title">Diagnóstico y Operaciones de Jobs</h2>
          @if (resourceRef) {
            <p class="viewer-subtitle">
              Recurso contextual: <span class="mono">{{ resourceRef }}</span>
            </p>
          }
        </div>
        <div class="header-status-announcer" role="status" aria-live="polite" aria-atomic="true">
          {{ announcerMessage() }}
        </div>
      </header>

      <!-- Barra de Filtros -->
      <div class="filter-bar" role="search" aria-label="Filtro de jobs">
        <div class="filter-group">
          <label for="filter-status" class="filter-label">Filtrar por Estado</label>
          <select
            id="filter-status"
            class="filter-select"
            [value]="selectedStatus() || ''"
            (change)="onStatusFilterChange($any($event.target).value)"
          >
            <option value="">Todos los estados</option>
            <option value="PENDING">PENDING</option>
            <option value="PROCESSING">PROCESSING</option>
            <option value="RETRYING">RETRYING</option>
            <option value="FAILED">FAILED</option>
            <option value="DEAD">DEAD</option>
            <option value="CANCELLED">CANCELLED</option>
            <option value="COMPLETED">COMPLETED</option>
          </select>
        </div>
        <button type="button" class="btn btn-secondary" (click)="loadJobs()">
          Actualizar
        </button>
      </div>

      <!-- Notificaciones de Éxito / Error -->
      @if (lastSuccessMessage()) {
        <div class="alert alert-success" role="status">
          {{ lastSuccessMessage() }}
        </div>
      }
      @if (lastErrorMessage()) {
        <div class="alert alert-danger" role="alert">
          {{ lastErrorMessage() }}
        </div>
      }

      <!-- Estado de Carga -->
      @if (loading()) {
        <div class="loading-state" role="status">
          <span class="spinner" aria-hidden="true"></span> Cargando jobs...
        </div>
      } @else if (jobs().length === 0) {
        <div class="empty-state">
          <p>No se encontraron jobs registrados para este criterio.</p>
        </div>
      } @else {
        <!-- Lista / Tabla de Jobs -->
        <div class="table-container">
          <table class="jobs-table" aria-label="Lista de trabajos del sistema">
            <thead>
              <tr>
                <th scope="col">Job Type</th>
                <th scope="col">Estado</th>
                <th scope="col">Cola</th>
                <th scope="col">Intentos</th>
                <th scope="col">Último Error</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (item of jobs(); track item.id) {
                <tr>
                  <td>
                    <div class="job-type-cell">
                      <span class="mono fw-semibold">{{ item.type }}</span>
                      <span class="mono text-muted text-xs">{{ item.id }}</span>
                    </div>
                  </td>
                  <td>
                    <span class="status-badge" [ngClass]="'status-' + item.status.toLowerCase()">
                      {{ item.status }}
                    </span>
                  </td>
                  <td>{{ item.queue }}</td>
                  <td>{{ item.attempts }}</td>
                  <td>
                    @if (item.lastError) {
                      <span class="text-danger text-xs error-truncated" [title]="item.lastError">
                        {{ item.lastError }}
                      </span>
                    } @else {
                      <span class="text-muted text-xs">—</span>
                    }
                  </td>
                  <td>
                    <div class="action-cell">
                      <button
                        type="button"
                        class="btn-sm btn-outline"
                        (click)="openDetail(item.id, $event)"
                        [attr.aria-label]="'Inspeccionar diagnóstico del job ' + item.id"
                      >
                        Diagnóstico
                      </button>
                      @if (item.capabilities.canRetry) {
                        <button
                          type="button"
                          class="btn-sm btn-retry"
                          (click)="requestAction(item.id, 'RETRY', $event)"
                          [attr.aria-label]="'Reintentar job ' + item.id"
                        >
                          Retry
                        </button>
                      }
                      @if (item.capabilities.canCancel) {
                        <button
                          type="button"
                          class="btn-sm btn-cancel"
                          (click)="requestAction(item.id, 'CANCEL', $event)"
                          [attr.aria-label]="'Cancelar job ' + item.id"
                        >
                          Cancel
                        </button>
                      }
                      @if (item.capabilities.canMarkDead) {
                        <button
                          type="button"
                          class="btn-sm btn-dead"
                          (click)="requestAction(item.id, 'MARK_DEAD', $event)"
                          [attr.aria-label]="'Marcar dead job ' + item.id"
                        >
                          Mark Dead
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- Diálogo de Diagnóstico Detallado -->
      @if (selectedJobDetail()) {
        <eventlens-job-detail-dialog
          [job]="selectedJobDetail()!"
          [invokingElement]="lastInvokingElement"
          (close)="closeDetail()"
          (actionRequested)="onDetailActionRequested($event)"
        ></eventlens-job-detail-dialog>
      }

      <!-- Diálogo de Confirmación de Acción -->
      @if (pendingAction()) {
        <eventlens-job-action-confirm-dialog
          [jobId]="pendingAction()!.jobId"
          [action]="pendingAction()!.action"
          [submitting]="actionSubmitting()"
          [invokingElement]="lastInvokingElement"
          (confirmed)="onActionConfirmed($event)"
          (cancelled)="cancelAction()"
        ></eventlens-job-action-confirm-dialog>
      }
    </section>
  `,
  styles: [`
    .jobs-viewer-container {
      background: #0f172a;
      color: #f8fafc;
      padding: 1.5rem;
      border-radius: 0.75rem;
      border: 1px solid #1e293b;
    }
    .viewer-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1.25rem;
      border-bottom: 1px solid #1e293b;
      padding-bottom: 1rem;
    }
    .viewer-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0;
    }
    .viewer-subtitle {
      font-size: 0.875rem;
      color: #94a3b8;
      margin: 0.25rem 0 0 0;
    }
    .header-status-announcer {
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
      gap: 1rem;
      align-items: flex-end;
      margin-bottom: 1.25rem;
    }
    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .filter-label {
      font-size: 0.75rem;
      color: #94a3b8;
      font-weight: 500;
    }
    .filter-select {
      background: #1e293b;
      color: #f8fafc;
      border: 1px solid #334155;
      padding: 0.5rem 0.75rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
    }
    .alert {
      padding: 0.75rem 1rem;
      border-radius: 0.375rem;
      margin-bottom: 1rem;
      font-size: 0.875rem;
    }
    .alert-success {
      background: rgba(4, 120, 87, 0.2);
      border: 1px solid #059669;
      color: #6ee7b7;
    }
    .alert-danger {
      background: rgba(225, 29, 72, 0.2);
      border: 1px solid #e11d48;
      color: #fda4af;
    }
    .loading-state, .empty-state {
      padding: 3rem 1rem;
      text-align: center;
      color: #94a3b8;
    }
    .table-container {
      overflow-x: auto;
      border: 1px solid #1e293b;
      border-radius: 0.5rem;
    }
    .jobs-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
      text-align: left;
    }
    .jobs-table th, .jobs-table td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #1e293b;
    }
    .jobs-table th {
      background: #1e293b;
      color: #94a3b8;
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .job-type-cell {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }
    .error-truncated {
      max-width: 15rem;
      display: inline-block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .action-cell {
      display: flex;
      gap: 0.375rem;
    }
    .btn {
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .btn-secondary { background: #334155; color: #f8fafc; }
    .btn-secondary:hover { background: #475569; }
    .btn-sm {
      padding: 0.25rem 0.5rem;
      font-size: 0.75rem;
      border-radius: 0.25rem;
      cursor: pointer;
      font-weight: 500;
      border: 1px solid transparent;
    }
    .btn-outline {
      background: transparent;
      border: 1px solid #475569;
      color: #cbd5e1;
    }
    .btn-outline:hover { background: #1e293b; }
    .btn-retry { background: #0284c7; color: white; }
    .btn-retry:hover { background: #0369a1; }
    .btn-cancel { background: #dc2626; color: white; }
    .btn-cancel:hover { background: #b91c1c; }
    .btn-dead { background: #7c3aed; color: white; }
    .btn-dead:hover { background: #6d28d9; }

    .status-badge {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .status-pending { background: #334155; color: #94a3b8; }
    .status-processing { background: #0369a1; color: #bae6fd; }
    .status-retrying { background: #b45309; color: #fde68a; }
    .status-failed { background: #be123c; color: #fecdd3; }
    .status-dead { background: #4c1d95; color: #ddd6fe; }
    .status-cancelled { background: #475569; color: #cbd5e1; }
    .status-completed { background: #047857; color: #a7f3d0; }

    .mono { font-family: monospace; }
    .fw-semibold { font-weight: 600; }
    .text-muted { color: #94a3b8; }
    .text-danger { color: #f87171; }
    .text-xs { font-size: 0.75rem; }
  `]
})
export class JobsViewerComponent implements OnInit {
  @Input() resourceRef?: string;
  @Input() callerActorId?: string;

  private readonly jobsApi = inject(JobsApiService);

  readonly jobs = signal<AdminJobSummaryItem[]>([]);
  readonly loading = signal<boolean>(false);
  readonly selectedStatus = signal<AdminJobStatus | undefined>(undefined);
  readonly announcerMessage = signal<string>('');
  readonly lastSuccessMessage = signal<string | null>(null);
  readonly lastErrorMessage = signal<string | null>(null);

  readonly selectedJobDetail = signal<AdminJobDetail | null>(null);
  readonly pendingAction = signal<{ jobId: string; action: AdminJobAction } | null>(null);
  readonly actionSubmitting = signal<boolean>(false);

  lastInvokingElement: HTMLElement | null = null;

  ngOnInit(): void {
    this.loadJobs();
  }

  onStatusFilterChange(status: string): void {
    this.selectedStatus.set(status ? (status as AdminJobStatus) : undefined);
    this.loadJobs();
  }

  async loadJobs(): Promise<void> {
    this.loading.set(true);
    this.lastErrorMessage.set(null);
    try {
      const res = await this.jobsApi.queryJobs({
        resourceRef: this.resourceRef,
        status: this.selectedStatus(),
        callerActorId: this.callerActorId
      });
      this.jobs.set([...res.items]);
      this.announcerMessage.set(`Lista de jobs actualizada. ${res.items.length} trabajos encontrados.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al cargar trabajos';
      this.lastErrorMessage.set(msg);
      this.announcerMessage.set(`Error al consultar trabajos: ${msg}`);
    } finally {
      this.loading.set(false);
    }
  }

  async openDetail(jobId: string, event: Event): Promise<void> {
    this.lastInvokingElement = event.currentTarget as HTMLElement;
    this.lastErrorMessage.set(null);
    try {
      const detail = await this.jobsApi.getJobDetail(jobId, this.callerActorId);
      this.selectedJobDetail.set(detail);
      this.announcerMessage.set(`Diagnóstico abierto para el trabajo ${detail.type}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al obtener diagnóstico del job';
      this.lastErrorMessage.set(msg);
      this.announcerMessage.set(`Error al abrir diagnóstico: ${msg}`);
    }
  }

  closeDetail(): void {
    this.selectedJobDetail.set(null);
    this.announcerMessage.set('Diagnóstico cerrado.');
  }

  requestAction(jobId: string, action: AdminJobAction, event: Event): void {
    this.lastInvokingElement = event.currentTarget as HTMLElement;
    this.pendingAction.set({ jobId, action });
  }

  onDetailActionRequested(payload: { jobId: string; action: AdminJobAction; element: HTMLElement }): void {
    this.lastInvokingElement = payload.element;
    this.pendingAction.set({ jobId: payload.jobId, action: payload.action });
  }

  cancelAction(): void {
    this.pendingAction.set(null);
    this.announcerMessage.set('Acción cancelada.');
  }

  async onActionConfirmed(event: { jobId: string; action: AdminJobAction; reason: string }): Promise<void> {
    this.actionSubmitting.set(true);
    this.lastSuccessMessage.set(null);
    this.lastErrorMessage.set(null);

    const idempotencyKey = `idem-${event.action.toLowerCase()}-${Date.now()}`;

    try {
      const res = await this.jobsApi.executeJobAction(
        event.jobId,
        {
          action: event.action,
          reason: event.reason,
          idempotencyKey
        },
        this.callerActorId
      );

      this.lastSuccessMessage.set(
        `Acción ${event.action} registrada con éxito para job ${event.jobId}. Nuevo estado: ${res.newStatus}`
      );
      this.announcerMessage.set(
        `Acción completada: Job ${event.jobId} ahora en estado ${res.newStatus}.`
      );

      // Si el detalle estaba abierto, actualizarlo o cerrarlo
      this.closeDetail();
      this.pendingAction.set(null);

      // Recargar lista
      await this.loadJobs();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al ejecutar acción';
      const actionError = `No se pudo ejecutar ${event.action}: ${msg}`;
      this.announcerMessage.set(`Error en la acción ${event.action}: ${msg}`);
      this.pendingAction.set(null);
      // Recargar para sincronizar estado real vigente
      await this.loadJobs();
      this.lastErrorMessage.set(actionError);
    } finally {
      this.actionSubmitting.set(false);
    }
  }
}
