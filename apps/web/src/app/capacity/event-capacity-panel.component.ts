import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type {
  CapacityUsageSummaryModel,
  CreateExtensionRequestCommandModel,
  ExtensionRequestModel,
  RespondExtensionInfoCommandModel,
} from './capacity.types.js';
import { ExtensionRequestDialogComponent } from './extension-request-dialog.component.js';

@Component({
  selector: 'app-event-capacity-panel',
  standalone: true,
  imports: [CommonModule, ExtensionRequestDialogComponent],
  template: `
    <section class="capacity-panel" aria-labelledby="capacity-panel-title">
      <header class="panel-header">
        <h2 id="capacity-panel-title" class="panel-title">Capacidad y Almacenamiento</h2>
        <span
          class="badge"
          [ngClass]="{
            'badge-danger': capacitySummary.flags.isOverStorageQuota || capacitySummary.flags.isOverFilesQuota,
            'badge-warning': capacitySummary.flags.isNearStorageLimit || capacitySummary.flags.isNearFilesLimit,
            'badge-success': !capacitySummary.flags.isNearStorageLimit && !capacitySummary.flags.isOverStorageQuota
          }"
        >
          {{ getQuotaStatusLabel() }}
        </span>
      </header>

      <!-- Resumen de Almacenamiento y Archivos -->
      <div class="metrics-grid">
        <!-- Tarjeta de Almacenamiento -->
        <article class="metric-card" aria-labelledby="storage-metric-label">
          <div class="metric-header">
            <span id="storage-metric-label" class="metric-label">Almacenamiento (GB)</span>
            <span class="metric-value">
              {{ capacitySummary.consumedStorage.gigabytes.toFixed(2) }} GB /
              {{ getLimitGigabytes().toFixed(2) }} GB
            </span>
          </div>
          <div class="progress-bar-container">
            <div
              class="progress-bar"
              role="progressbar"
              [style.width.%]="Math.min(capacitySummary.usagePercentage.storagePercent, 100)"
              [attr.aria-valuenow]="capacitySummary.usagePercentage.storagePercent"
              aria-valuemin="0"
              aria-valuemax="100"
              [ngClass]="{
                'progress-danger': capacitySummary.flags.isOverStorageQuota,
                'progress-warning': capacitySummary.flags.isNearStorageLimit,
                'progress-normal': !capacitySummary.flags.isNearStorageLimit && !capacitySummary.flags.isOverStorageQuota
              }"
            ></div>
          </div>
          <p class="metric-footer">
            {{ capacitySummary.usagePercentage.storagePercent.toFixed(1) }}% utilizado
            @if (capacitySummary.flags.isOverStorageQuota) {
              <span class="text-danger font-bold">
                (Límite excedido — cargas bloqueadas)
              </span>
            }
          </p>
        </article>

        <!-- Tarjeta de Archivos -->
        <article class="metric-card" aria-labelledby="files-metric-label">
          <div class="metric-header">
            <span id="files-metric-label" class="metric-label">Archivos Subidos</span>
            <span class="metric-value">
              {{ capacitySummary.consumedStorage.files }} /
              {{ capacitySummary.effectiveLimits.maxFiles }}
            </span>
          </div>
          <div class="progress-bar-container">
            <div
              class="progress-bar"
              role="progressbar"
              [style.width.%]="Math.min(capacitySummary.usagePercentage.filesPercent, 100)"
              [attr.aria-valuenow]="capacitySummary.usagePercentage.filesPercent"
              aria-valuemin="0"
              aria-valuemax="100"
              [ngClass]="{
                'progress-danger': capacitySummary.flags.isOverFilesQuota,
                'progress-warning': capacitySummary.flags.isNearFilesLimit,
                'progress-normal': !capacitySummary.flags.isNearFilesLimit && !capacitySummary.flags.isOverFilesQuota
              }"
            ></div>
          </div>
          <p class="metric-footer">
            {{ capacitySummary.usagePercentage.filesPercent.toFixed(1) }}% utilizado
          </p>
        </article>
      </div>

      <!-- Sección de Solicitudes de Ampliación -->
      <section class="extension-section" aria-labelledby="extension-section-title">
        <h3 id="extension-section-title" class="section-subtitle">Solicitudes de Ampliación</h3>

        <!-- Sin solicitud abierta -->
        @if (!openRequest) {
          <div class="empty-extension-state">
            <p>
              ¿Necesitas más almacenamiento o ampliar los días de vigencia de tu evento?
            </p>
            <button
              type="button"
              class="btn btn-outline"
              (click)="isDialogOpen = true"
              aria-haspopup="dialog"
            >
              Solicitar ampliación
            </button>
          </div>
        }

        <!-- Con solicitud abierta -->
        @if (openRequest) {
          <div class="active-request-card">
            <div class="request-header">
              <div>
                <h4 class="request-title">
                  Solicitud de ampliación: {{ getRequestTypeLabel(openRequest.requestType) }}
                </h4>
                <p class="request-date">
                  Enviada el {{ openRequest.createdAt | date: 'short' }}
                </p>
              </div>
              <span
                class="status-badge"
                [ngClass]="{
                  'status-pending': openRequest.status === 'PENDING_REVIEW',
                  'status-info': openRequest.status === 'INFORMATION_REQUESTED',
                  'status-approved': openRequest.status === 'APPROVED',
                  'status-rejected': openRequest.status === 'REJECTED'
                }"
              >
                {{ getRequestStatusLabel(openRequest.status) }}
              </span>
            </div>

            <div class="request-details">
              @if (openRequest.additionalGb) {
                <p>
                  <strong>Almacenamiento adicional pedido:</strong> {{ openRequest.additionalGb }} GB
                </p>
              }
              @if (openRequest.additionalDays) {
                <p>
                  <strong>Días adicionales pedidos:</strong> {{ openRequest.additionalDays }} días
                </p>
              }
              <p>
                <strong>Motivo inicial:</strong> {{ openRequest.reason }}
              </p>
            </div>

            <!-- Historial de mensajes -->
            @if (openRequest.messages && openRequest.messages.length > 0) {
              <div class="messages-history">
                <h5>Historial de la solicitud</h5>
                <ul class="message-list">
                  @for (msg of openRequest.messages; track msg.id) {
                    <li
                      class="message-item"
                      [ngClass]="{
                        'message-organizer': msg.authorRole === 'ORGANIZER',
                        'message-admin': msg.authorRole === 'ADMIN'
                      }"
                    >
                      <div class="message-meta">
                        <strong>{{ msg.authorRole === 'ADMIN' ? 'Equipo de Soporte' : 'Organizador' }}</strong>
                        <span>{{ msg.createdAt | date: 'short' }}</span>
                      </div>
                      <p class="message-body">{{ msg.content }}</p>
                    </li>
                  }
                </ul>
              </div>
            }

            <!-- Formulario de respuesta cuando está en INFORMATION_REQUESTED -->
            @if (openRequest.status === 'INFORMATION_REQUESTED') {
              <div class="respond-box">
                <h5 id="respond-title">Responder aclaración solicitada</h5>
                <p class="text-muted">
                  El equipo de soporte necesita información adicional para continuar revisando tu solicitud.
                </p>
                <form (submit)="onSendResponse($event)">
                  <textarea
                    name="infoResponse"
                    [value]="responseText"
                    (input)="onResponseTextInput($event)"
                    rows="3"
                    class="form-control"
                    placeholder="Escribe tu respuesta aquí..."
                    required
                    aria-labelledby="respond-title"
                  ></textarea>
                  <div class="respond-actions">
                    <button
                      type="submit"
                      class="btn btn-primary"
                      [disabled]="isSendingResponse || !responseText.trim()"
                    >
                      {{ isSendingResponse ? 'Enviando...' : 'Enviar respuesta' }}
                    </button>
                  </div>
                </form>
              </div>
            }
          </div>
        }
      </section>

      <!-- Modal de solicitud de ampliación -->
      @if (isDialogOpen) {
        <app-extension-request-dialog
          [eventId]="capacitySummary.eventId"
          (submitted)="onRequestSubmitted($event)"
          (cancelled)="isDialogOpen = false"
        ></app-extension-request-dialog>
      }
    </section>
  `,
  styles: [
    `
      .capacity-panel {
        background: #ffffff;
        border-radius: 12px;
        padding: 1.5rem;
        border: 1px solid #e2e8f0;
        margin-bottom: 2rem;
      }
      .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
      }
      .panel-title {
        font-size: 1.25rem;
        font-weight: 600;
        color: #0f172a;
        margin: 0;
      }
      .badge {
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 600;
      }
      .badge-success { background: #dcfce7; color: #15803d; }
      .badge-warning { background: #fef9c3; color: #a16207; }
      .badge-danger { background: #fee2e2; color: #b91c1c; }

      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 1.25rem;
        margin-bottom: 2rem;
      }
      .metric-card {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 1rem;
      }
      .metric-header {
        display: flex;
        justify-content: space-between;
        font-size: 0.875rem;
        margin-bottom: 0.5rem;
      }
      .metric-label { font-weight: 500; color: #475569; }
      .metric-value { font-weight: 600; color: #0f172a; }
      .progress-bar-container {
        height: 8px;
        background: #e2e8f0;
        border-radius: 9999px;
        overflow: hidden;
        margin-bottom: 0.5rem;
      }
      .progress-bar { height: 100%; border-radius: 9999px; transition: width 0.3s ease; }
      .progress-normal { background: #3b82f6; }
      .progress-warning { background: #eab308; }
      .progress-danger { background: #ef4444; }
      .metric-footer {
        font-size: 0.75rem;
        color: #64748b;
        margin: 0;
      }
      .text-danger { color: #dc2626; }
      .font-bold { font-weight: 700; }

      .extension-section {
        border-top: 1px solid #e2e8f0;
        padding-top: 1.5rem;
      }
      .section-subtitle {
        font-size: 1rem;
        font-weight: 600;
        color: #1e293b;
        margin-bottom: 1rem;
      }
      .empty-extension-state {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #f8fafc;
        padding: 1rem 1.25rem;
        border-radius: 8px;
        color: #475569;
        font-size: 0.875rem;
      }
      .btn {
        padding: 0.5rem 1rem;
        border-radius: 6px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        border: none;
      }
      .btn-outline {
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #1e293b;
      }
      .btn-outline:hover { background: #f1f5f9; }
      .btn-primary { background: #2563eb; color: #ffffff; }
      .btn-primary:hover:not(:disabled) { background: #1d4ed8; }

      .active-request-card {
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 1.25rem;
        background: #f8fafc;
      }
      .request-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 1rem;
      }
      .request-title { font-size: 1rem; font-weight: 600; margin: 0 0 0.25rem 0; color: #0f172a; }
      .request-date { font-size: 0.75rem; color: #64748b; margin: 0; }
      .status-badge {
        padding: 0.25rem 0.625rem;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 600;
      }
      .status-pending { background: #dbeafe; color: #1e40af; }
      .status-info { background: #fef3c7; color: #92400e; }
      .status-approved { background: #dcfce7; color: #166534; }
      .status-rejected { background: #fee2e2; color: #991b1b; }

      .request-details p { font-size: 0.875rem; color: #334155; margin: 0.25rem 0; }

      .messages-history {
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid #e2e8f0;
      }
      .messages-history h5 { font-size: 0.875rem; margin: 0 0 0.75rem 0; color: #334155; }
      .message-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
      .message-item {
        padding: 0.625rem 0.875rem;
        border-radius: 6px;
        font-size: 0.8125rem;
      }
      .message-organizer { background: #ffffff; border: 1px solid #e2e8f0; }
      .message-admin { background: #eff6ff; border: 1px solid #bfdbfe; }
      .message-meta { display: flex; justify-content: space-between; margin-bottom: 0.25rem; font-size: 0.75rem; color: #64748b; }
      .message-body { margin: 0; color: #1e293b; }

      .respond-box {
        margin-top: 1.25rem;
        padding: 1rem;
        background: #ffffff;
        border: 1px solid #fed7aa;
        border-radius: 6px;
      }
      .respond-box h5 { font-size: 0.875rem; margin: 0 0 0.25rem 0; color: #9a3412; }
      .text-muted { font-size: 0.75rem; color: #64748b; margin-bottom: 0.75rem; }
      .form-control {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        box-sizing: border-box;
        font-size: 0.875rem;
      }
      .respond-actions { display: flex; justify-content: flex-end; margin-top: 0.75rem; }
    `,
  ],
})
export class EventCapacityPanelComponent {
  @Input({ required: true }) capacitySummary!: CapacityUsageSummaryModel;
  @Input() openRequest: ExtensionRequestModel | null = null;

  @Output() requestCreated = new EventEmitter<CreateExtensionRequestCommandModel>();
  @Output() infoResponded = new EventEmitter<RespondExtensionInfoCommandModel>();

  isDialogOpen = false;
  responseText = '';
  isSendingResponse = false;
  Math = Math;

  getQuotaStatusLabel(): string {
    if (this.capacitySummary.flags.isOverStorageQuota || this.capacitySummary.flags.isOverFilesQuota) {
      return 'Límite excedido';
    }
    if (this.capacitySummary.flags.isNearStorageLimit || this.capacitySummary.flags.isNearFilesLimit) {
      return 'Uso cercano al límite (≥ 80%)';
    }
    return 'Capacidad normal';
  }

  getLimitGigabytes(): number {
    const bytes = BigInt(this.capacitySummary.effectiveLimits.storageBytes);
    return Number(bytes) / (1024 * 1024 * 1024);
  }

  getRequestTypeLabel(type: string): string {
    switch (type) {
      case 'STORAGE':
        return 'Almacenamiento';
      case 'DURATION':
        return 'Vigencia';
      case 'BOTH':
        return 'Almacenamiento y Vigencia';
      default:
        return type;
    }
  }

  getRequestStatusLabel(status: string): string {
    switch (status) {
      case 'PENDING_REVIEW':
        return 'En revisión';
      case 'INFORMATION_REQUESTED':
        return 'Información solicitada';
      case 'APPROVED':
        return 'Aprobada';
      case 'REJECTED':
        return 'Rechazada';
      default:
        return status;
    }
  }

  onRequestSubmitted(command: CreateExtensionRequestCommandModel): void {
    this.isDialogOpen = false;
    this.requestCreated.emit(command);
  }

  onResponseTextInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;
    this.responseText = target?.value ?? '';
  }

  onSendResponse(event?: Event): void {
    if (event) event.preventDefault();
    if (!this.responseText.trim() || !this.openRequest) return;

    this.isSendingResponse = true;
    this.infoResponded.emit({
      requestId: this.openRequest.id,
      response: this.responseText.trim(),
    });
    this.responseText = '';
    this.isSendingResponse = false;
  }
}
