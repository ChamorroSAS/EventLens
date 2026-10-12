import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import type {
  AdminCapacityRequestItem,
  AdminReviewRequestCommand,
} from './admin.types.js';

@Component({
  selector: 'eventlens-admin-capacity-requests',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="requests-container" aria-labelledby="requests-heading">
      <h3 id="requests-heading" class="section-title">
        Solicitudes de Ampliación de Capacidad
      </h3>

      @if (!requests || requests.length === 0) {
        <p class="empty-state">No hay solicitudes de ampliación registradas para este evento.</p>
      } @else {
        <div class="requests-list">
          @for (req of requests; track req.requestId) {
            <article class="request-card" [class.highlight]="req.status === 'PENDING_REVIEW'">
              <header class="request-header">
                <div class="request-meta">
                  <h4 class="request-title">
                    Solicitud {{ req.requestType || req.requestedPlan || 'GENERAL' }}
                  </h4>
                  <span class="text-muted mono">ID: {{ req.requestId }} • {{ req.requestedAt | date: 'short' }}</span>
                </div>
                <span
                  class="status-badge"
                  [ngClass]="{
                    'badge-pending': req.status === 'PENDING' || req.status === 'PENDING_REVIEW',
                    'badge-info': req.status === 'INFORMATION_REQUESTED',
                    'badge-approved': req.status === 'APPROVED',
                    'badge-rejected': req.status === 'REJECTED'
                  }"
                >
                  {{ getStatusLabel(req.status) }}
                </span>
              </header>

              <div class="request-details">
                @if (req.additionalGb) {
                  <p><strong>Almacenamiento Adicional:</strong> {{ req.additionalGb }} GB</p>
                }
                @if (req.additionalDays) {
                  <p><strong>Vigencia Adicional:</strong> {{ req.additionalDays }} días</p>
                }
                <p><strong>Motivo del Organizador:</strong> {{ req.justification }}</p>
              </div>

              <!-- Historial de Mensajes -->
              @if (req.messages && req.messages.length > 0) {
                <div class="messages-history">
                  <h5 class="history-title">Historial de Intercambio</h5>
                  <ul class="message-list">
                    @for (msg of req.messages; track msg.id) {
                      <li
                        class="message-item"
                        [class.organizer-msg]="msg.authorRole === 'ORGANIZER'"
                        [class.admin-msg]="msg.authorRole === 'ADMIN'"
                      >
                        <div class="msg-meta">
                          <strong>{{ msg.authorRole === 'ADMIN' ? 'Soporte' : 'Organizador' }}</strong>
                          <span>{{ msg.createdAt | date: 'short' }}</span>
                        </div>
                        <p class="msg-content">{{ msg.content }}</p>
                      </li>
                    }
                  </ul>
                </div>
              }

              <!-- Acciones Administrativas para solicitudes no terminales -->
              @if (req.status === 'PENDING_REVIEW' || req.status === 'PENDING') {
                <div class="action-panel">
                  @if (activeActionRequestId() !== req.requestId) {
                    <div class="btn-group">
                      <button
                        type="button"
                        class="btn btn-success"
                        (click)="startApproval(req)"
                      >
                        Aprobar Solicitud
                      </button>
                      <button
                        type="button"
                        class="btn btn-warning"
                        (click)="startRequestInfo(req.requestId)"
                      >
                        Pedir Información
                      </button>
                      <button
                        type="button"
                        class="btn btn-danger"
                        (click)="startReject(req.requestId)"
                      >
                        Rechazar
                      </button>
                    </div>
                  } @else {
                    <div class="action-form">
                      <h5 class="action-form-title">
                        {{ currentAction() === 'REQUEST_INFO' ? 'Solicitar Aclaración al Organizador' : 'Rechazar Solicitud' }}
                      </h5>
                      <textarea
                        class="form-control"
                        rows="2"
                        [value]="actionReason()"
                        (input)="onActionReasonInput($event)"
                        [placeholder]="currentAction() === 'REQUEST_INFO' ? 'Escribe la consulta o aclaración que necesita soporte...' : 'Indica el motivo del rechazo de la solicitud...'"
                        required
                      ></textarea>
                      <div class="form-buttons">
                        <button
                          type="button"
                          class="btn btn-secondary"
                          (click)="cancelAction()"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          class="btn"
                          [class.btn-warning]="currentAction() === 'REQUEST_INFO'"
                          [class.btn-danger]="currentAction() === 'REJECT'"
                          [disabled]="!actionReason().trim()"
                          (click)="confirmAction(req.requestId)"
                        >
                          Confirmar {{ currentAction() === 'REQUEST_INFO' ? 'Solicitud de Información' : 'Rechazo' }}
                        </button>
                      </div>
                    </div>
                  }
                </div>
              }
            </article>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .requests-container {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .section-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #f8fafc;
      margin: 0;
    }
    .empty-state {
      font-size: 0.875rem;
      color: #94a3b8;
      margin: 0;
    }
    .requests-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .request-card {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 0.5rem;
      padding: 1rem;
    }
    .request-card.highlight {
      border-color: #38bdf8;
    }
    .request-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.75rem;
    }
    .request-title {
      font-size: 1rem;
      font-weight: 600;
      color: #f8fafc;
      margin: 0 0 0.25rem 0;
    }
    .text-muted {
      color: #94a3b8;
      font-size: 0.75rem;
    }
    .status-badge {
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge-pending { background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid #0284c7; }
    .badge-info { background: rgba(234, 179, 8, 0.2); color: #facc15; border: 1px solid #ca8a04; }
    .badge-approved { background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid #16a34a; }
    .badge-rejected { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #dc2626; }
    .request-details p {
      font-size: 0.8125rem;
      color: #cbd5e1;
      margin: 0.25rem 0;
    }
    .messages-history {
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid #1e293b;
    }
    .history-title {
      font-size: 0.75rem;
      font-weight: 600;
      color: #94a3b8;
      margin: 0 0 0.5rem 0;
    }
    .message-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .message-item {
      padding: 0.5rem 0.75rem;
      border-radius: 0.375rem;
      font-size: 0.8125rem;
    }
    .organizer-msg { background: #1e293b; border-left: 3px solid #38bdf8; }
    .admin-msg { background: #1e293b; border-left: 3px solid #eab308; }
    .msg-meta {
      display: flex;
      justify-content: space-between;
      font-size: 0.6875rem;
      color: #94a3b8;
      margin-bottom: 0.25rem;
    }
    .msg-content {
      margin: 0;
      color: #f8fafc;
    }
    .action-panel {
      margin-top: 1rem;
      padding-top: 0.75rem;
      border-top: 1px solid #1e293b;
    }
    .btn-group {
      display: flex;
      gap: 0.5rem;
    }
    .btn {
      padding: 0.375rem 0.75rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .btn-success { background: #16a34a; color: #ffffff; }
    .btn-warning { background: #d97706; color: #ffffff; }
    .btn-danger { background: #dc2626; color: #ffffff; }
    .btn-secondary { background: #475569; color: #ffffff; }
    .action-form {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      background: #1e293b;
      padding: 0.75rem;
      border-radius: 0.375rem;
    }
    .action-form-title {
      margin: 0;
      font-size: 0.8125rem;
      font-weight: 600;
      color: #f8fafc;
    }
    .form-control {
      background: #0f172a;
      border: 1px solid #475569;
      border-radius: 0.25rem;
      padding: 0.5rem;
      color: #f8fafc;
      font-size: 0.8125rem;
      width: 100%;
      box-sizing: border-box;
    }
    .form-buttons {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }
  `],
})
export class AdminCapacityRequestsComponent {
  @Input({ required: true }) requests: readonly AdminCapacityRequestItem[] = [];

  @Output() reviewRequest = new EventEmitter<AdminReviewRequestCommand>();
  @Output() openOverrideForApproval = new EventEmitter<AdminCapacityRequestItem>();

  activeActionRequestId = signal<string | null>(null);
  currentAction = signal<'REQUEST_INFO' | 'REJECT' | null>(null);
  actionReason = signal<string>('');

  getStatusLabel(status: string): string {
    switch (status) {
      case 'PENDING':
      case 'PENDING_REVIEW':
        return 'Pendiente de Revisión';
      case 'INFORMATION_REQUESTED':
        return 'Información Solicitada';
      case 'APPROVED':
        return 'Aprobada';
      case 'REJECTED':
        return 'Rechazada';
      default:
        return status;
    }
  }

  startApproval(req: AdminCapacityRequestItem): void {
    this.openOverrideForApproval.emit(req);
  }

  startRequestInfo(requestId: string): void {
    this.activeActionRequestId.set(requestId);
    this.currentAction.set('REQUEST_INFO');
    this.actionReason.set('');
  }

  startReject(requestId: string): void {
    this.activeActionRequestId.set(requestId);
    this.currentAction.set('REJECT');
    this.actionReason.set('');
  }

  onActionReasonInput(event: Event): void {
    this.actionReason.set((event.target as HTMLTextAreaElement).value ?? '');
  }

  cancelAction(): void {
    this.activeActionRequestId.set(null);
    this.currentAction.set(null);
    this.actionReason.set('');
  }

  confirmAction(requestId: string): void {
    const action = this.currentAction();
    const reason = this.actionReason().trim();
    if (!action || !reason) return;

    this.reviewRequest.emit({
      requestId,
      decision: action,
      reason,
    });

    this.cancelAction();
  }
}
