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
import { AdministrativeActionReasonDialogComponent } from './administrative-action-reason-dialog.component.js';
import type {
  AdminCaseDetailResult,
  AdminMediaAccessGrantResult,
  AdminResolveCaseResult,
  ModerationSeverity
} from './admin.types.js';

type PendingAction =
  | { type: 'ACCESS_MEDIA' }
  | { type: 'CLASSIFY'; severity: ModerationSeverity }
  | { type: 'PREVENTIVE_HIDE' }
  | { type: 'RESOLVE'; resolution: 'DISMISSED' | 'REMOVED_PERMANENTLY' };

@Component({
  selector: 'eventlens-report-detail',
  standalone: true,
  imports: [
    CommonModule,
    ReportSeverityBadgeComponent,
    AdministrativeActionReasonDialogComponent
  ],
  template: `
    <div class="case-detail-container" role="region" aria-labelledby="detail-heading">
      <!-- Back Navigation Header -->
      <div class="detail-nav-bar">
        <button
          type="button"
          class="btn-back"
          (click)="onBack()"
          aria-label="Volver a la cola de moderación"
        >
          ← Volver a la cola
        </button>
        <span class="case-id-tag">Caso #{{ caseId }}</span>
      </div>

      <!-- Loading State -->
      @if (isLoading()) {
        <div class="state-container loading-state" role="status" aria-live="polite">
          <div class="spinner" aria-hidden="true"></div>
          <p>Cargando detalle del caso...</p>
        </div>
      } @else if (errorMessage()) {
        <!-- Error State -->
        <div class="state-container error-state" role="alert">
          <p class="error-msg">{{ errorMessage() }}</p>
          <button type="button" class="btn-retry" (click)="loadDetail()">Reintentar</button>
        </div>
      } @else if (detail()) {
        <!-- Case Information -->
        <div class="detail-grid">
          <!-- Main Info Panel -->
          <div class="panel main-panel">
            <div class="panel-header">
              <div class="title-row">
                <h2 id="detail-heading" class="panel-title">
                  {{ detail()!.caseType === 'REPORT' ? 'Reporte de contenido' : 'Solicitud de retiro' }}
                </h2>
                <eventlens-report-severity-badge [severity]="detail()!.severity"></eventlens-report-severity-badge>
              </div>
              <div class="meta-row">
                <span class="status-pill" [ngClass]="'status-' + detail()!.status.toLowerCase()">
                  {{ getStatusLabel(detail()!.status) }}
                </span>
                <span class="media-status-pill">
                  Media: <strong>{{ detail()!.mediaStatus }}</strong>
                </span>
                <span class="event-id-text">Evento: {{ detail()!.eventId }}</span>
              </div>
            </div>

            <!-- Content Details -->
            <div class="panel-section">
              <h3 class="section-title">Motivo reportado</h3>
              <p class="reason-highlight">{{ getReasonLabel(detail()!.reason) }}</p>

              @if (detail()!.description) {
                <h4 class="subsection-title">Descripción aportada:</h4>
                <blockquote class="user-description">
                  {{ detail()!.description }}
                </blockquote>
              }
            </div>

            <!-- Controlled Media Preview Section (DEC-019 / DEC-088) -->
            <div class="panel-section media-inspection-section">
              <h3 class="section-title">Inspección de multimedia</h3>

              @if (activeGrant()) {
                <div class="active-grant-box" role="region" aria-label="Vista previa autorizada">
                  <div class="grant-header">
                    <span class="grant-badge">Acceso temporal concedido (15 min)</span>
                    <span class="grant-expiry">Expira: {{ activeGrant()!.expiresAt | date:'mediumTime' }}</span>
                  </div>
                  <div class="media-preview-viewport">
                    <img
                      [src]="activeGrant()!.previewUrl"
                      alt="Vista previa de moderación autorizada"
                      class="preview-img"
                    />
                  </div>
                </div>
              } @else {
                <div class="media-protected-box">
                  <p class="media-protected-desc">
                    Por protección de privacidad, el contenido multimedia está restringido.
                    Para visualizarlo se requiere justificar el motivo de inspección técnica.
                  </p>
                  <button
                    type="button"
                    class="btn-inspect-media"
                    [disabled]="!detail()!.capabilities.canAccessMedia || isActionSubmitting()"
                    (click)="promptInspectMedia()"
                  >
                    Inspeccionar multimedia con justificación
                  </button>
                </div>
              }
            </div>

            <!-- Action Outcomes Banner -->
            @if (actionSuccessMessage()) {
              <div class="success-banner" role="status" aria-live="polite">
                {{ actionSuccessMessage() }}
              </div>
            }
          </div>

          <!-- Sidebar: Governance Actions & History -->
          <div class="sidebar-column">
            <!-- Governance Actions -->
            <div class="panel actions-panel">
              <h3 class="panel-title-sm">Acciones de Gobernanza</h3>

              <div class="actions-list">
                <!-- Classify action -->
                <div class="action-block">
                  <label class="action-label">Clasificar gravedad:</label>
                  <div class="action-buttons-group">
                    <button
                      type="button"
                      class="btn-action btn-classify-critical"
                      [disabled]="!detail()!.capabilities.canClassify || isActionSubmitting() || detail()!.severity === 'CRITICAL'"
                      (click)="promptClassify('CRITICAL')"
                    >
                      Marcar Crítica
                    </button>
                    <button
                      type="button"
                      class="btn-action btn-classify-normal"
                      [disabled]="!detail()!.capabilities.canClassify || isActionSubmitting() || detail()!.severity === 'NORMAL'"
                      (click)="promptClassify('NORMAL')"
                    >
                      Marcar Normal
                    </button>
                  </div>
                </div>

                <!-- Preventive Hide action (DEC-088: explicit hide, never auto) -->
                <div class="action-block">
                  <label class="action-label">Ocultamiento preventivo (DEC-088):</label>
                  <button
                    type="button"
                    class="btn-action btn-preventive-hide"
                    [disabled]="!detail()!.capabilities.canPreventiveHide || isActionSubmitting() || detail()!.mediaStatus === 'HIDDEN'"
                    (click)="promptPreventiveHide()"
                  >
                    {{ detail()!.mediaStatus === 'HIDDEN' ? 'Ya se encuentra oculto' : 'Ocultar preventivamente' }}
                  </button>
                </div>

                <!-- Resolve action -->
                <div class="action-block">
                  <label class="action-label">Resolución del caso:</label>
                  <div class="action-buttons-group">
                    <button
                      type="button"
                      class="btn-action btn-dismiss"
                      [disabled]="!detail()!.capabilities.canResolve || isActionSubmitting()"
                      (click)="promptResolve('DISMISSED')"
                    >
                      Desestimar
                    </button>
                    <button
                      type="button"
                      class="btn-action btn-remove-permanent"
                      [disabled]="!detail()!.capabilities.canResolve || isActionSubmitting()"
                      (click)="promptResolve('REMOVED_PERMANENTLY')"
                    >
                      Retirar definitivamente
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Immutable Audit History -->
            <div class="panel history-panel">
              <h3 class="panel-title-sm">Historial inmutable del caso</h3>
              <ul class="history-list" role="list">
                @for (entry of detail()!.history; track entry.id) {
                  <li class="history-item">
                    <div class="history-top">
                      <span class="history-action">{{ entry.action }}</span>
                      <span class="history-time">{{ entry.createdAt | date:'short' }}</span>
                    </div>
                    <div class="history-actor">Por: {{ entry.performedBy }}</div>
                    @if (entry.reason) {
                      <div class="history-reason">Motivo: {{ entry.reason }}</div>
                    }
                  </li>
                } @empty {
                  <li class="history-empty">Sin intervenciones previas registradas.</li>
                }
              </ul>
            </div>
          </div>
        </div>
      }

      <!-- Justification Modal for Sensitive Administrative Actions -->
      <eventlens-administrative-action-reason-dialog
        [isOpen]="isReasonDialogOpen()"
        [title]="dialogTitle()"
        [prompt]="dialogPrompt()"
        [confirmLabel]="dialogConfirmLabel()"
        [isDanger]="dialogIsDanger()"
        [isSubmitting]="isActionSubmitting()"
        (confirm)="onReasonConfirmed($event)"
        (cancel)="onReasonCancelled()"
      ></eventlens-administrative-action-reason-dialog>
    </div>
  `,
  styles: `
    .case-detail-container {
      background-color: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 0.75rem;
      padding: 1.5rem;
      color: #f8fafc;
    }
    .detail-nav-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid #1e293b;
    }
    .btn-back {
      background: none;
      border: none;
      color: #38bdf8;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      padding: 0.375rem 0.5rem;
      border-radius: 0.375rem;
    }
    .btn-back:hover {
      background-color: #1e293b;
    }
    .case-id-tag {
      font-family: monospace;
      font-size: 0.8125rem;
      color: #94a3b8;
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
    .btn-retry {
      background-color: #1e293b;
      border: 1px solid #334155;
      color: #38bdf8;
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
    }
    .detail-grid {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 1.5rem;
    }
    @media (max-width: 900px) {
      .detail-grid {
        grid-template-columns: 1fr;
      }
    }
    .panel {
      background-color: #090d16;
      border: 1px solid #1e293b;
      border-radius: 0.5rem;
      padding: 1.25rem;
    }
    .title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      margin-bottom: 0.5rem;
    }
    .panel-title {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: #f8fafc;
    }
    .panel-title-sm {
      margin: 0 0 1rem 0;
      font-size: 0.9375rem;
      font-weight: 700;
      color: #f1f5f9;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid #1e293b;
    }
    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
      font-size: 0.8125rem;
      color: #94a3b8;
    }
    .status-pill {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
    }
    .status-pending_review {
      background-color: #451a03;
      color: #fcd34d;
    }
    .status-under_investigation {
      background-color: #082f49;
      color: #7dd3fc;
    }
    .status-action_taken {
      background-color: #052e16;
      color: #86efac;
    }
    .status-dismissed {
      background-color: #1e293b;
      color: #94a3b8;
    }
    .media-status-pill {
      background-color: #1e293b;
      padding: 0.125rem 0.5rem;
      border-radius: 0.25rem;
      color: #cbd5e1;
    }
    .panel-section {
      margin-top: 1.5rem;
      padding-top: 1.25rem;
      border-top: 1px solid #1e293b;
    }
    .section-title {
      margin: 0 0 0.5rem 0;
      font-size: 0.875rem;
      font-weight: 600;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .reason-highlight {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
      color: #ffffff;
    }
    .subsection-title {
      margin: 1rem 0 0.25rem 0;
      font-size: 0.8125rem;
      color: #94a3b8;
    }
    .user-description {
      margin: 0;
      padding: 0.75rem 1rem;
      background-color: #1e293b;
      border-left: 3px solid #38bdf8;
      border-radius: 0 0.375rem 0.375rem 0;
      font-size: 0.875rem;
      color: #e2e8f0;
      line-height: 1.5;
    }
    .media-protected-box {
      padding: 1.5rem;
      background-color: #1e293b;
      border: 1px dashed #334155;
      border-radius: 0.5rem;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
    }
    .media-protected-desc {
      margin: 0;
      font-size: 0.875rem;
      color: #94a3b8;
      max-width: 28rem;
    }
    .btn-inspect-media {
      background-color: #0284c7;
      color: #ffffff;
      border: none;
      padding: 0.625rem 1.25rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-inspect-media:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .active-grant-box {
      background-color: #0f172a;
      border: 1px solid #0284c7;
      border-radius: 0.5rem;
      overflow: hidden;
    }
    .grant-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.625rem 1rem;
      background-color: #0369a1;
      font-size: 0.75rem;
      font-weight: 600;
      color: #ffffff;
    }
    .media-preview-viewport {
      padding: 1rem;
      display: flex;
      justify-content: center;
      align-items: center;
      background-color: #000000;
    }
    .preview-img {
      max-height: 320px;
      max-width: 100%;
      border-radius: 0.375rem;
      object-fit: contain;
    }
    .success-banner {
      margin-top: 1.25rem;
      padding: 0.75rem 1rem;
      background-color: #052e16;
      border: 1px solid #16a34a;
      border-radius: 0.375rem;
      color: #86efac;
      font-size: 0.875rem;
      font-weight: 500;
    }
    .sidebar-column {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .actions-list {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .action-block {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .action-label {
      font-size: 0.8125rem;
      font-weight: 600;
      color: #94a3b8;
    }
    .action-buttons-group {
      display: flex;
      gap: 0.5rem;
    }
    .btn-action {
      flex: 1;
      padding: 0.5rem 0.75rem;
      border-radius: 0.375rem;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      min-height: 38px;
    }
    .btn-action:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .btn-classify-critical {
      background-color: #450a0a;
      border-color: #991b1b;
      color: #fca5a5;
    }
    .btn-classify-normal {
      background-color: #451a03;
      border-color: #b45309;
      color: #fcd34d;
    }
    .btn-preventive-hide {
      width: 100%;
      background-color: #1e293b;
      border-color: #475569;
      color: #f1f5f9;
    }
    .btn-dismiss {
      background-color: #1e293b;
      border-color: #475569;
      color: #cbd5e1;
    }
    .btn-remove-permanent {
      background-color: #dc2626;
      color: #ffffff;
    }
    .history-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .history-item {
      padding: 0.625rem;
      background-color: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 0.375rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      font-size: 0.75rem;
    }
    .history-top {
      display: flex;
      justify-content: space-between;
      font-weight: 600;
      color: #f1f5f9;
    }
    .history-action {
      color: #38bdf8;
    }
    .history-time {
      color: #64748b;
    }
    .history-actor {
      color: #94a3b8;
    }
    .history-reason {
      color: #cbd5e1;
      font-style: italic;
    }
    .history-empty {
      font-size: 0.8125rem;
      color: #64748b;
      text-align: center;
      padding: 1rem;
    }
  `
})
export class ReportDetailComponent implements OnInit {
  @Input({ required: true }) caseId!: string;
  @Input() callerActorId?: string;
  @Output() back = new EventEmitter<void>();

  readonly detail = signal<AdminCaseDetailResult | null>(null);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  // Active Media Grant for 15 min preview (DEC-019 / DEC-088)
  readonly activeGrant = signal<AdminMediaAccessGrantResult | null>(null);

  // Success Feedback
  readonly actionSuccessMessage = signal<string | null>(null);

  // Justification Dialog States
  readonly isReasonDialogOpen = signal(false);
  readonly isActionSubmitting = signal(false);
  readonly dialogTitle = signal('Justificación requerida');
  readonly dialogPrompt = signal('Ingresa el motivo para continuar:');
  readonly dialogConfirmLabel = signal('Confirmar');
  readonly dialogIsDanger = signal(false);

  private pendingAction: PendingAction | null = null;

  constructor(private readonly adminApi: AdminApiService) {}

  ngOnInit(): void {
    this.loadDetail();
  }

  async loadDetail(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const res = await this.adminApi.getCaseDetail(this.caseId, this.callerActorId);
      this.detail.set(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar el detalle';
      this.errorMessage.set(msg);
    } finally {
      this.isLoading.set(false);
    }
  }

  onBack(): void {
    this.back.emit();
  }

  // 1. INSPECT MEDIA PROMPT (Escenario 2: 15 min grant con motivo)
  promptInspectMedia(): void {
    this.pendingAction = { type: 'ACCESS_MEDIA' };
    this.dialogTitle.set('Justificación de acceso a multimedia');
    this.dialogPrompt.set(
      'Para inspeccionar el contenido privado se requiere registrar el motivo específico en la auditoría. El acceso será válido por 15 minutos.'
    );
    this.dialogConfirmLabel.set('Solicitar token de acceso');
    this.dialogIsDanger.set(false);
    this.isReasonDialogOpen.set(true);
  }

  // 2. CLASSIFY PROMPT (DEC-088: alert without auto-hide)
  promptClassify(severity: ModerationSeverity): void {
    this.pendingAction = { type: 'CLASSIFY', severity };
    this.dialogTitle.set(`Clasificar caso como ${severity === 'CRITICAL' ? 'Crítico' : 'Normal'}`);
    this.dialogPrompt.set(
      severity === 'CRITICAL'
        ? 'Indica la justificación para clasificar este caso como Crítico (DEC-088: no auto-oculta el contenido pero genera alerta prioritaria):'
        : 'Indica la justificación para clasificar este caso como Normal:'
    );
    this.dialogConfirmLabel.set('Confirmar clasificación');
    this.dialogIsDanger.set(severity === 'CRITICAL');
    this.isReasonDialogOpen.set(true);
  }

  // 3. PREVENTIVE HIDE PROMPT (DEC-088: explicit preventive hide)
  promptPreventiveHide(): void {
    this.pendingAction = { type: 'PREVENTIVE_HIDE' };
    this.dialogTitle.set('Ocultamiento preventivo de contenido');
    this.dialogPrompt.set(
      'El contenido dejará de ser visible en la galería del evento mientras se resuelve la investigación. Indica el motivo:'
    );
    this.dialogConfirmLabel.set('Ocultar preventivamente');
    this.dialogIsDanger.set(true);
    this.isReasonDialogOpen.set(true);
  }

  // 4. RESOLVE PROMPT (Escenario 3: resultado real y downstream purge)
  promptResolve(resolution: 'DISMISSED' | 'REMOVED_PERMANENTLY'): void {
    this.pendingAction = { type: 'RESOLVE', resolution };
    if (resolution === 'REMOVED_PERMANENTLY') {
      this.dialogTitle.set('Retiro definitivo y purga downstream');
      this.dialogPrompt.set(
        'El contenido será eliminado permanentemente y se emitirá orden de purga irreversible sin papelera (DEC-089 / DEC-097). Indica el motivo formal:'
      );
      this.dialogConfirmLabel.set('Confirmar retiro y purga');
      this.dialogIsDanger.set(true);
    } else {
      this.dialogTitle.set('Desestimar caso');
      this.dialogPrompt.set('Indica la razón por la cual se desestima el caso:');
      this.dialogConfirmLabel.set('Desestimar caso');
      this.dialogIsDanger.set(false);
    }
    this.isReasonDialogOpen.set(true);
  }

  // EXECUTE CONFIRMED ACTION
  async onReasonConfirmed(reason: string): Promise<void> {
    if (!this.pendingAction || this.isActionSubmitting()) return;

    this.isActionSubmitting.set(true);
    this.actionSuccessMessage.set(null);

    try {
      if (this.pendingAction.type === 'ACCESS_MEDIA') {
        const grant = await this.adminApi.grantMediaAccess(
          {
            caseId: this.caseId,
            reason
          },
          this.callerActorId
        );
        this.activeGrant.set(grant);
        this.actionSuccessMessage.set('Acceso a multimedia concedido por 15 minutos.');
      } else if (this.pendingAction.type === 'CLASSIFY') {
        await this.adminApi.classifyCase(
          {
            caseId: this.caseId,
            severity: this.pendingAction.severity,
            reason
          },
          this.callerActorId
        );
        this.actionSuccessMessage.set(`Caso clasificado como ${this.pendingAction.severity}.`);
        await this.loadDetail();
      } else if (this.pendingAction.type === 'PREVENTIVE_HIDE') {
        await this.adminApi.applyPreventiveHide(
          {
            caseId: this.caseId,
            reason
          },
          this.callerActorId
        );
        this.actionSuccessMessage.set('Contenido ocultado preventivamente de la galería.');
        await this.loadDetail();
      } else if (this.pendingAction.type === 'RESOLVE') {
        const result: AdminResolveCaseResult = await this.adminApi.resolveCase(
          {
            caseId: this.caseId,
            resolution: this.pendingAction.resolution,
            reason
          },
          this.callerActorId
        );
        if (result.resolution === 'REMOVED_PERMANENTLY') {
          this.actionSuccessMessage.set(
            `Caso resuelto: Contenido retirado y orden de purga emitida downstream (purga confirmada: ${result.downstreamPurged}).`
          );
        } else {
          this.actionSuccessMessage.set('Caso resuelto: Desestimado sin cambios en el contenido.');
        }
        await this.loadDetail();
      }

      this.isReasonDialogOpen.set(false);
      this.pendingAction = null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al ejecutar la acción';
      this.errorMessage.set(msg);
      this.isReasonDialogOpen.set(false);
    } finally {
      this.isActionSubmitting.set(false);
    }
  }

  onReasonCancelled(): void {
    this.isReasonDialogOpen.set(false);
    this.pendingAction = null;
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

  getStatusLabel(status: string): string {
    switch (status) {
      case 'PENDING_REVIEW': return 'Pendiente de revisión';
      case 'UNDER_INVESTIGATION': return 'En investigación';
      case 'ACTION_TAKEN': return 'Resuelto';
      case 'DISMISSED': return 'Desestimado';
      default: return status;
    }
  }
}
