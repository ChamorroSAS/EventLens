import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  inject,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminApiService } from './admin-api.service.js';
import { AdminInterventionDialogComponent } from './admin-intervention-dialog.component.js';
import { AdminMediaGrantDialogComponent } from './admin-media-grant-dialog.component.js';
import { JobsViewerComponent } from '../jobs/jobs-viewer.component.js';
import { AuditLogViewerComponent } from '../audit/audit-log-viewer.component.js';
import { AdminCapacityOverrideDialogComponent } from './admin-capacity-override-dialog.component.js';
import { AdminCapacityRequestsComponent } from './admin-capacity-requests.component.js';
import type {
  AdminApplyOverrideCommand,
  AdminCapacityRequestItem,
  AdminEventDetailSnapshot,
  AdminInterventionType,
  AdminMediaPurpose,
  AdminRemoveOverrideCommand,
  AdminReviewRequestCommand,
  AdministrativeSupportMediaGrant,
  ExecuteInterventionPayload,
} from './admin.types.js';

@Component({
  selector: 'eventlens-admin-event-detail',
  standalone: true,
  imports: [
    CommonModule,
    AdminInterventionDialogComponent,
    AdminMediaGrantDialogComponent,
    JobsViewerComponent,
    AuditLogViewerComponent,
    AdminCapacityOverrideDialogComponent,
    AdminCapacityRequestsComponent,
  ],
  template: `
    <section class="event-detail-container" aria-labelledby="detail-heading">
      <header class="detail-header">
        <div class="header-main">
          <button
            type="button"
            class="btn-back"
            (click)="onBack()"
            aria-label="Regresar a búsqueda"
          >
            ← Volver a Búsqueda
          </button>
          <h2 id="detail-heading" class="event-title">
            {{ snapshot()?.name || 'Cargando detalle del evento...' }}
          </h2>
          <div class="event-meta-line">
            <span class="mono text-muted">ID: {{ eventId }}</span>
            @if (snapshot()) {
              <span class="status-badge status-{{ snapshot()!.lifecycle.status.toLowerCase() }}">
                {{ snapshot()!.lifecycle.status }}
              </span>
              @if (snapshot()!.overallAvailability === 'PARTIAL') {
                <span class="badge badge-partial" role="status">
                  Datos Parciales (Servicios Externos Degradados)
                </span>
              }
            }
          </div>
        </div>
      </header>

      @if (loading()) {
        <div class="loading-box" role="status">
          Cargando agregación administrativa del evento...
        </div>
      } @else if (errorMessage()) {
        <div class="alert alert-danger" role="alert">
          {{ errorMessage() }}
        </div>
      } @else if (snapshot()) {
        <!-- Acciones de Intervención Contextuales -->
        <section class="section-card actions-card" aria-labelledby="actions-heading">
          <h3 id="actions-heading" class="section-title">Intervenciones Administrativas Disponibles</h3>
          <div class="action-buttons-group">
            @if (snapshot()!.capabilities.canSuspend) {
              <button
                type="button"
                class="btn btn-danger"
                (click)="requestIntervention('SUSPEND_EVENT', $event)"
              >
                Suspender Evento
              </button>
            } @else {
              <button
                type="button"
                class="btn btn-disabled"
                disabled
                title="No disponible para el estado actual"
              >
                Suspender Evento (READ_ONLY: Estado no elegible)
              </button>
            }

            @if (snapshot()!.capabilities.canReactivate) {
              <button
                type="button"
                class="btn btn-primary"
                (click)="requestIntervention('REACTIVATE_EVENT', $event)"
              >
                Reactivar Evento
              </button>
            }

            @if (snapshot()!.capabilities.canExtendValidity) {
              <button
                type="button"
                class="btn btn-secondary"
                (click)="requestIntervention('EXTEND_EVENT_VALIDITY', $event)"
              >
                Extender Vigencia
              </button>
            }

            @if (snapshot()!.capabilities.canClose) {
              <button
                type="button"
                class="btn btn-warning"
                (click)="requestIntervention('CLOSE_EVENT', $event)"
              >
                Cerrar Evento
              </button>
            }
          </div>

          @if (interventionFeedback()) {
            <div class="alert alert-success" role="status">
              {{ interventionFeedback() }}
            </div>
          }
        </section>

        <!-- Resumen del Organizador (AdminOrganizerSummary) -->
        <section class="section-card" aria-labelledby="org-summary-heading">
          <h3 id="org-summary-heading" class="section-title">Organizador Responsable</h3>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">ID de Cuenta</span>
              <span class="mono">{{ snapshot()!.owner.id }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Correo Electrónico</span>
              <strong>{{ snapshot()!.owner.email }}</strong>
            </div>
            <div class="info-item">
              <span class="info-label">Estado de Cuenta</span>
              <span class="status-pill">{{ snapshot()!.owner.status }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Mayoría de Edad Declarada</span>
              <span>{{ snapshot()!.owner.declaredAdult ? 'Sí' : 'No' }}</span>
            </div>
          </div>
        </section>

        <!-- Ciclo de Vida y Fechas -->
        <section class="section-card" aria-labelledby="lifecycle-heading">
          <h3 id="lifecycle-heading" class="section-title">Ciclo de Vida y Temporalidad</h3>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Zona Horaria</span>
              <span class="mono">{{ snapshot()!.lifecycle.timezone }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Inicio Programado (Local)</span>
              <span>{{ snapshot()!.lifecycle.startsAtLocal || snapshot()!.lifecycle.scheduledAt || 'No fijado' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Vigencia / Expiración</span>
              <span>{{ snapshot()!.lifecycle.expiresAt || 'Indefinida' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Fin Periodo de Gracia</span>
              <span>{{ snapshot()!.lifecycle.graceEndsAt || 'No aplica' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Cargas Habilitadas</span>
              <span>{{ snapshot()!.lifecycle.uploadsEnabled ? 'Habilitadas' : 'Deshabilitadas' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Galería de Invitados</span>
              <span>{{ snapshot()!.lifecycle.guestGalleryEnabled ? 'Activa' : 'Inactiva' }}</span>
            </div>
          </div>
        </section>

        <!-- Capacidad y Cuotas (Disponibilidad honesta) -->
        <section class="section-card" aria-labelledby="capacity-heading">
          <div class="card-header-flex">
            <h3 id="capacity-heading" class="section-title">Capacidad y Consumo de Almacenamiento</h3>
            @if (snapshot()!.capacity.availability === 'AVAILABLE') {
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                (click)="openOverrideDialog()"
              >
                Ajustar Capacidad / Overrides
              </button>
            }
          </div>

          @if (snapshot()!.capacity.availability === 'AVAILABLE') {
            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">Plan Activo</span>
                <strong>
                  {{ snapshot()!.capacity.planCode || 'Standard' }}
                  @if (snapshot()!.capacity.isOverrideActive) {
                    <span class="badge badge-override">(Override Activo)</span>
                  }
                </strong>
              </div>
              <div class="info-item">
                <span class="info-label">Límite de Almacenamiento</span>
                <span>{{ snapshot()!.capacity.storageLimitBytes || 'Sin límite' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Consumo Actual</span>
                <span>{{ snapshot()!.capacity.storageUsedBytes || '0' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Total Archivos</span>
                <span>{{ snapshot()!.capacity.filesCount ?? 0 }} / {{ snapshot()!.capacity.fileLimit || 'Ilimitado' }}</span>
              </div>
            </div>

            <!-- Solicitudes de Ampliación de Capacidad -->
            @if (snapshot()!.capacityRequests && snapshot()!.capacityRequests!.availability === 'AVAILABLE') {
              <div class="requests-block">
                <eventlens-admin-capacity-requests
                  [requests]="snapshot()!.capacityRequests!.requests || []"
                  (openOverrideForApproval)="onOpenOverrideForApproval($event)"
                  (reviewRequest)="onReviewCapacityRequest($event)"
                ></eventlens-admin-capacity-requests>
              </div>
            }
          } @else {
            <div class="alert alert-warning" role="status">
              <strong>Capacidad No Disponible:</strong> {{ snapshot()!.capacity.unavailableReason || 'El servicio de cuotas está temporalmente degradado.' }} No se asume consumo cero.
            </div>
          }
        </section>

        <!-- Acceso Multimedia Justificado (REGLA: NINGÚN PREVIEW PREVIO) -->
        <section class="section-card" aria-labelledby="media-heading">
          <h3 id="media-heading" class="section-title">Inspección de Contenidos Multimedia</h3>
          <p class="section-subtitle">
            Por política estricta de privacidad (DEC-027), no se genera vista previa de ningún contenido hasta obtener una autorización justificada para soporte o incidente.
          </p>

          <div class="media-inspection-panel">
            <div class="media-row">
              <div class="media-ref-info">
                <span class="info-label">Muestra de Recurso Multimedia del Evento</span>
                <span class="mono">media-item-{{ eventId }}-sample</span>
              </div>
              <button
                type="button"
                class="btn btn-primary"
                (click)="openMediaGrantDialog('media-item-' + eventId + '-sample', $event)"
              >
                Solicitar Acceso Justificado
              </button>
            </div>
          </div>
        </section>

        <!-- Diagnóstico de Jobs Asociados (EL-TK-153) -->
        <section class="section-card" aria-labelledby="jobs-heading">
          <h3 id="jobs-heading" class="section-title">Diagnóstico y Operaciones de Jobs</h3>
          <eventlens-jobs-viewer
            [resourceRef]="'event:' + eventId"
            [callerActorId]="callerActorId"
          ></eventlens-jobs-viewer>
        </section>

        <!-- Auditoría Contextual (EL-TK-175) -->
        <section class="section-card" aria-labelledby="audit-heading">
          <h3 id="audit-heading" class="section-title">Auditoría Contextual Inmutable</h3>
          <eventlens-audit-log-viewer
            [resourceType]="'event'"
            [resourceId]="eventId"
            [callerActorId]="callerActorId"
          ></eventlens-audit-log-viewer>
        </section>
      }

      <!-- Diálogo de Intervención -->
      @if (pendingIntervention()) {
        <eventlens-admin-intervention-dialog
          [eventId]="eventId"
          [interventionType]="pendingIntervention()!.type"
          [submitting]="interventionSubmitting()"
          [invokingElement]="lastInvokingElement"
          (confirmed)="onInterventionConfirmed($event)"
          (cancelled)="cancelIntervention()"
        ></eventlens-admin-intervention-dialog>
      }

      <!-- Diálogo de Media Grant -->
      @if (pendingMediaGrantTarget()) {
        <eventlens-admin-media-grant-dialog
          [eventId]="eventId"
          [mediaId]="pendingMediaGrantTarget()!"
          [invokingElement]="lastInvokingElement"
          (requestGrant)="onRequestMediaGrant($event)"
          (close)="closeMediaGrantDialog()"
        ></eventlens-admin-media-grant-dialog>
      }

      <!-- Diálogo de Override de Capacidad -->
      @if (isOverrideDialogOpen() && snapshot()?.capacity) {
        <eventlens-admin-capacity-override-dialog
          [eventId]="eventId"
          [baseLimits]="getBaseLimits()"
          [currentLimits]="getCurrentLimits()"
          [isOverrideActive]="snapshot()!.capacity.isOverrideActive || false"
          [submitting]="overrideSubmitting()"
          [errorMessage]="overrideErrorMessage()"
          (applyOverride)="onApplyCapacityOverride($event)"
          (revertToBase)="onRevertCapacityOverride($event)"
          (cancel)="closeOverrideDialog()"
        ></eventlens-admin-capacity-override-dialog>
      }
    </section>
  `,
  styles: [`
    .event-detail-container {
      background: #0f172a;
      color: #f8fafc;
      padding: 1.5rem;
      border-radius: 0.75rem;
      border: 1px solid #1e293b;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .detail-header {
      border-bottom: 1px solid #1e293b;
      padding-bottom: 1.25rem;
    }
    .btn-back {
      background: transparent;
      border: 0;
      color: #38bdf8;
      cursor: pointer;
      font-size: 0.875rem;
      padding: 0;
      margin-bottom: 0.5rem;
    }
    .btn-back:hover { text-decoration: underline; }
    .event-title {
      font-size: 1.5rem;
      font-weight: 700;
      margin: 0 0 0.5rem 0;
    }
    .event-meta-line {
      display: flex;
      gap: 1rem;
      align-items: center;
      font-size: 0.875rem;
    }
    .section-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 0.5rem;
      padding: 1.25rem;
    }
    .section-title {
      font-size: 1.125rem;
      font-weight: 600;
      margin: 0 0 1rem 0;
      color: #f8fafc;
    }
    .section-subtitle {
      font-size: 0.8125rem;
      color: #94a3b8;
      margin: 0 0 1rem 0;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
      gap: 1rem;
    }
    .info-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .info-label {
      font-size: 0.75rem;
      color: #94a3b8;
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.05em;
    }
    .action-buttons-group {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .media-inspection-panel {
      background: #0f172a;
      border: 1px dashed #475569;
      border-radius: 0.375rem;
      padding: 1rem;
    }
    .media-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }
    .media-ref-info {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
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
    .btn-secondary { background: #334155; color: #f8fafc; }
    .btn-secondary:hover:not(:disabled) { background: #475569; }
    .btn-danger { background: #dc2626; color: white; }
    .btn-danger:hover:not(:disabled) { background: #b91c1c; }
    .btn-warning { background: #d97706; color: white; }
    .btn-warning:hover:not(:disabled) { background: #b45309; }
    .btn-disabled {
      background: #1e293b;
      border: 1px solid #475569;
      color: #64748b;
      cursor: not-allowed;
    }
    .alert {
      padding: 0.75rem 1rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      margin-top: 1rem;
    }
    .alert-danger {
      background: rgba(225, 29, 72, 0.2);
      border: 1px solid #e11d48;
      color: #fda4af;
    }
    .alert-warning {
      background: rgba(217, 119, 6, 0.2);
      border: 1px solid #d97706;
      color: #fde68a;
    }
    .alert-success {
      background: rgba(4, 120, 87, 0.2);
      border: 1px solid #059669;
      color: #6ee7b7;
    }
    .loading-box {
      padding: 3rem 1rem;
      text-align: center;
      color: #94a3b8;
    }
    .status-badge {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .status-active { background: #047857; color: #a7f3d0; }
    .status-suspended { background: #be123c; color: #fecdd3; }
    .status-closed { background: #475569; color: #cbd5e1; }
    .badge-partial {
      background: #7c2d12;
      color: #fed7aa;
      padding: 0.125rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .card-header-flex {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    .btn-sm {
      padding: 0.25rem 0.625rem;
      font-size: 0.75rem;
    }
    .badge-override {
      background: rgba(56, 189, 248, 0.2);
      color: #38bdf8;
      border: 1px solid #0284c7;
      padding: 0.125rem 0.375rem;
      border-radius: 0.25rem;
      font-size: 0.6875rem;
      font-weight: 600;
      margin-left: 0.375rem;
    }
    .requests-block {
      margin-top: 1.5rem;
      padding-top: 1.25rem;
      border-top: 1px solid #334155;
    }
    .mono { font-family: monospace; }
    .text-muted { color: #94a3b8; }
  `]
})
export class AdminEventDetailComponent implements OnInit {
  @Input({ required: true }) eventId!: string;
  @Input() callerActorId?: string;
  @Output() back = new EventEmitter<void>();

  private readonly adminApi = inject(AdminApiService);

  snapshot = signal<AdminEventDetailSnapshot | null>(null);
  loading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  interventionFeedback = signal<string | null>(null);

  pendingIntervention = signal<{ type: AdminInterventionType } | null>(null);
  interventionSubmitting = signal<boolean>(false);

  pendingMediaGrantTarget = signal<string | null>(null);
  lastInvokingElement: HTMLElement | null = null;

  isOverrideDialogOpen = signal<boolean>(false);
  overrideSubmitting = signal<boolean>(false);
  overrideErrorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.loadDetail();
  }

  async loadDetail(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const data = await this.adminApi.getEventDetail(this.eventId, this.callerActorId);
      this.snapshot.set(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al cargar detalle del evento';
      this.errorMessage.set(msg);
    } finally {
      this.loading.set(false);
    }
  }

  onBack(): void {
    this.back.emit();
  }

  requestIntervention(type: AdminInterventionType, event: Event): void {
    this.lastInvokingElement = event.currentTarget as HTMLElement;
    this.pendingIntervention.set({ type });
  }

  cancelIntervention(): void {
    this.pendingIntervention.set(null);
  }

  async onInterventionConfirmed(payload: ExecuteInterventionPayload): Promise<void> {
    this.interventionSubmitting.set(true);
    this.interventionFeedback.set(null);
    try {
      const result = await this.adminApi.executeIntervention(this.eventId, payload, this.callerActorId);
      this.interventionFeedback.set(
        `Intervención ${payload.interventionType} ejecutada con éxito. Nuevo estado: ${result.newStatus}`
      );
      this.pendingIntervention.set(null);
      await this.loadDetail();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al ejecutar intervención';
      this.errorMessage.set(`Fallo al intervenir: ${msg}`);
      this.pendingIntervention.set(null);
    } finally {
      this.interventionSubmitting.set(false);
    }
  }

  openMediaGrantDialog(mediaId: string, event: Event): void {
    this.lastInvokingElement = event.currentTarget as HTMLElement;
    this.pendingMediaGrantTarget.set(mediaId);
  }

  closeMediaGrantDialog(): void {
    this.pendingMediaGrantTarget.set(null);
  }

  async onRequestMediaGrant(payload: {
    eventId: string;
    mediaId: string;
    purpose: AdminMediaPurpose;
    reason: string;
  }): Promise<void> {
    try {
      const grant = await this.adminApi.requestMediaGrant(payload, this.callerActorId);
      // Dialog renders the preview when grant is active
      const dialog = document.querySelector('eventlens-admin-media-grant-dialog');
      if (dialog && (dialog as any).setGrant) {
        (dialog as any).setGrant(grant);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al solicitar autorización';
      this.errorMessage.set(`No se pudo autorizar acceso a multimedia: ${msg}`);
      this.closeMediaGrantDialog();
    }
  }

  openOverrideDialog(): void {
    this.overrideErrorMessage.set(null);
    this.isOverrideDialogOpen.set(true);
  }

  closeOverrideDialog(): void {
    this.isOverrideDialogOpen.set(false);
  }

  getBaseLimits(): { storageGigabytes: number; maxFiles: number; retentionDays: number } {
    const cap = this.snapshot()?.capacity;
    const bytes = cap?.baseStorageLimitBytes
      ? BigInt(cap.baseStorageLimitBytes)
      : cap?.storageLimitBytes
        ? BigInt(cap.storageLimitBytes)
        : 10737418240n;
    return {
      storageGigabytes: Number(bytes) / (1024 * 1024 * 1024),
      maxFiles: cap?.baseMaxFiles ?? cap?.fileLimit ?? 1000,
      retentionDays: cap?.baseRetentionDays ?? cap?.retentionDays ?? 30,
    };
  }

  getCurrentLimits(): { storageGigabytes: number; maxFiles: number; retentionDays: number } {
    const cap = this.snapshot()?.capacity;
    const bytes = cap?.storageLimitBytes ? BigInt(cap.storageLimitBytes) : 10737418240n;
    return {
      storageGigabytes: Number(bytes) / (1024 * 1024 * 1024),
      maxFiles: cap?.fileLimit ?? 1000,
      retentionDays: cap?.retentionDays ?? 30,
    };
  }

  async onApplyCapacityOverride(command: AdminApplyOverrideCommand): Promise<void> {
    this.overrideSubmitting.set(true);
    this.overrideErrorMessage.set(null);
    try {
      await this.adminApi.applyCapacityOverride(this.eventId, command, this.callerActorId);
      this.closeOverrideDialog();
      await this.loadDetail();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al aplicar override';
      this.overrideErrorMessage.set(msg);
    } finally {
      this.overrideSubmitting.set(false);
    }
  }

  async onRevertCapacityOverride(command: AdminRemoveOverrideCommand): Promise<void> {
    this.overrideSubmitting.set(true);
    this.overrideErrorMessage.set(null);
    try {
      await this.adminApi.removeCapacityOverride(this.eventId, command, this.callerActorId);
      this.closeOverrideDialog();
      await this.loadDetail();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al revertir override';
      this.overrideErrorMessage.set(msg);
    } finally {
      this.overrideSubmitting.set(false);
    }
  }

  async onReviewCapacityRequest(command: AdminReviewRequestCommand): Promise<void> {
    this.loading.set(true);
    try {
      await this.adminApi.reviewExtensionRequest(command.requestId, command, this.callerActorId);
      await this.loadDetail();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al revisar solicitud de ampliación';
      this.errorMessage.set(msg);
    } finally {
      this.loading.set(false);
    }
  }

  onOpenOverrideForApproval(_req: AdminCapacityRequestItem): void {
    this.openOverrideDialog();
  }
}
