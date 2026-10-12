import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import type { AuditEventRecord } from './audit.types.js';

@Component({
  selector: 'eventlens-audit-log-detail',
  standalone: true,
  template: `
    <div class="modal-backdrop" (click)="onBackdropClick($event)">
      <div
        class="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-detail-title"
        tabindex="-1"
      >
        <header class="modal-header">
          <div class="header-title-group">
            <h2 id="audit-detail-title" class="modal-title">Detalle de Registro de Auditoría</h2>
            <span class="event-id" [attr.aria-label]="'Identificador del evento: ' + event.id">
              ID: {{ event.id }}
            </span>
          </div>
          <button
            type="button"
            class="close-button"
            aria-label="Cerrar detalle de auditoría"
            (click)="close()"
          >
            ✕
          </button>
        </header>

        <section class="modal-body">
          <!-- Estado y Acción Principal -->
          <div class="detail-overview">
            <div class="overview-item">
              <span class="item-label">Acción registrada</span>
              <span class="item-value action-value">{{ event.action }}</span>
            </div>
            <div class="overview-item">
              <span class="item-label">Resultado</span>
              <div class="status-wrapper">
                <span
                  class="status-badge"
                  [class]="'badge-' + event.result.toLowerCase()"
                  role="status"
                >
                  <span class="badge-icon" aria-hidden="true">
                    @if (event.result === 'SUCCESS') { ✓ }
                    @else if (event.result === 'FAILURE') { ✕ }
                    @else if (event.result === 'DENIED') { ⊘ }
                  </span>
                  <span>{{ getResultLabel() }}</span>
                </span>
              </div>
            </div>
            <div class="overview-item">
              <span class="item-label">Fecha y hora (UTC)</span>
              <time class="item-value" [attr.datetime]="formatDateIso(event.occurredAt)">
                {{ formatDateReadable(event.occurredAt) }}
              </time>
            </div>
          </div>

          <!-- Escenario 3: Resultado fallido se presenta estrictamente como dato, sin acción ejecutable -->
          @if (event.result === 'FAILURE' || event.result === 'DENIED') {
            <div class="readonly-notice" role="note">
              <span class="notice-icon" aria-hidden="true">ℹ️</span>
              <div class="notice-content">
                <strong>Registro de solo lectura</strong>
                <p>
                  Este registro refleja el resultado histórico de una operación y se presenta
                  exclusivamente como evidencia y trazabilidad de auditoría. No constituye una acción
                  ejecutable ni ofrece reintento directo desde esta vista.
                </p>
              </div>
            </div>
          }

          <!-- Recurso Afectado -->
          <div class="section-box">
            <h3 class="section-heading">Recurso Afectado</h3>
            <dl class="meta-dl">
              <dt>Tipo de recurso:</dt>
              <dd>{{ event.resourceType }}</dd>
              <dt>Identificador de recurso:</dt>
              <dd class="mono-value">{{ event.resourceId }}</dd>
            </dl>
          </div>

          <!-- Actor -->
          <div class="section-box">
            <h3 class="section-heading">Actor y Origen</h3>
            <dl class="meta-dl">
              <dt>Categoría de actor:</dt>
              <dd>
                <span class="actor-type-badge">
                  {{ isSystemActor() ? 'Sistema (Automático)' : 'Humano (' + event.actorType + ')' }}
                </span>
              </dd>
              <dt>Identificador de actor:</dt>
              <dd class="mono-value">{{ event.actorId }}</dd>
              @if (event.actorDetail) {
                @if (event.actorDetail['sessionRef']) {
                  <dt>Referencia de sesión:</dt>
                  <dd class="mono-value">{{ event.actorDetail['sessionRef'] }}</dd>
                }
                @if (event.actorDetail['ipAddress']) {
                  <dt>Dirección IP:</dt>
                  <dd class="mono-value">{{ event.actorDetail['ipAddress'] }}</dd>
                }
                @if (event.actorDetail['userAgent']) {
                  <dt>Agente de usuario:</dt>
                  <dd class="text-truncate">{{ event.actorDetail['userAgent'] }}</dd>
                }
              }
            </dl>
          </div>

          <!-- Motivo de la acción si existe -->
          @if (event.reason) {
            <div class="section-box">
              <h3 class="section-heading">Motivo / Causa Registrada</h3>
              <p class="reason-text">{{ event.reason }}</p>
            </div>
          }

          <!-- Metadatos Sanitizados -->
          <div class="section-box">
            <h3 class="section-heading">Metadatos Sanitizados</h3>
            @if (hasMetadata()) {
              <dl class="meta-dl">
                @for (entry of getMetadataEntries(); track entry[0]) {
                  <dt>{{ entry[0] }}:</dt>
                  <dd class="mono-value">{{ formatMetaValue(entry[1]) }}</dd>
                }
              </dl>
            } @else {
              <p class="empty-note">Sin metadatos complementarios registrados.</p>
            }
          </div>
        </section>

        <footer class="modal-footer">
          <button
            type="button"
            class="btn-primary"
            (click)="close()"
          >
            Volver a la consulta
          </button>
        </footer>
      </div>
    </div>
  `,
  styles: `
    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(23, 32, 42, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1050;
      padding: 1rem;
    }
    .modal-dialog {
      background-color: #ffffff;
      border: 1px solid #e7e7e3;
      border-radius: 0.5rem;
      width: 100%;
      max-width: 680px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
      outline: none;
    }
    .modal-header {
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid #e7e7e3;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
    }
    .header-title-group {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .modal-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: #17345c;
      margin: 0;
    }
    .event-id {
      font-size: 0.8125rem;
      color: #667085;
      font-family: monospace;
    }
    .close-button {
      background: transparent;
      border: none;
      font-size: 1.25rem;
      line-height: 1;
      color: #667085;
      cursor: pointer;
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
    }
    .close-button:hover, .close-button:focus-visible {
      color: #17202a;
      background-color: #fafaf8;
      outline: 2px solid #17345c;
    }
    .modal-body {
      padding: 1.5rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .detail-overview {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      padding: 1rem;
      background-color: #fafaf8;
      border: 1px solid #e7e7e3;
      border-radius: 0.375rem;
    }
    .overview-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .item-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #667085;
      font-weight: 600;
    }
    .item-value {
      font-size: 0.9375rem;
      color: #17202a;
      font-weight: 500;
    }
    .action-value {
      font-family: monospace;
      color: #17345c;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.25rem 0.625rem;
      border-radius: 9999px;
      font-size: 0.8125rem;
      font-weight: 600;
      width: fit-content;
    }
    .badge-success {
      background-color: #edf7f2;
      color: #278c63;
      border: 1px solid #b7e2d0;
    }
    .badge-failure {
      background-color: #fdf2f2;
      color: #c94a4a;
      border: 1px solid #f8b4b4;
    }
    .badge-denied {
      background-color: #fef8ee;
      color: #d98a26;
      border: 1px solid #f8dda6;
    }
    .readonly-notice {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.875rem 1rem;
      background-color: #fff1ed;
      border: 1px solid #fed7aa;
      border-radius: 0.375rem;
      color: #17202a;
    }
    .notice-icon {
      font-size: 1.125rem;
      flex-shrink: 0;
    }
    .notice-content p {
      margin: 0.25rem 0 0 0;
      font-size: 0.875rem;
      color: #667085;
      line-height: 1.4;
    }
    .section-box {
      border: 1px solid #e7e7e3;
      border-radius: 0.375rem;
      padding: 1rem;
      background-color: #ffffff;
    }
    .section-heading {
      font-size: 0.875rem;
      font-weight: 600;
      color: #17345c;
      margin: 0 0 0.75rem 0;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .meta-dl {
      display: grid;
      grid-template-columns: 180px 1fr;
      row-gap: 0.5rem;
      column-gap: 1rem;
      margin: 0;
      font-size: 0.875rem;
    }
    .meta-dl dt {
      color: #667085;
      font-weight: 500;
    }
    .meta-dl dd {
      margin: 0;
      color: #17202a;
      word-break: break-all;
    }
    .mono-value {
      font-family: monospace;
    }
    .actor-type-badge {
      font-weight: 600;
      color: #17345c;
    }
    .reason-text {
      margin: 0;
      font-size: 0.875rem;
      color: #17202a;
      background-color: #fafaf8;
      padding: 0.75rem;
      border-radius: 0.25rem;
      border-left: 3px solid #17345c;
    }
    .empty-note {
      margin: 0;
      font-size: 0.875rem;
      color: #667085;
      font-style: italic;
    }
    .modal-footer {
      padding: 1rem 1.5rem;
      border-top: 1px solid #e7e7e3;
      display: flex;
      justify-content: flex-end;
      background-color: #fafaf8;
    }
    .btn-primary {
      background-color: #17345c;
      color: #ffffff;
      border: none;
      padding: 0.5rem 1.25rem;
      font-size: 0.875rem;
      font-weight: 600;
      border-radius: 0.375rem;
      cursor: pointer;
    }
    .btn-primary:hover {
      background-color: #102a4d;
    }
    .btn-primary:focus-visible {
      outline: 2px solid #17345c;
      outline-offset: 2px;
    }
  `,
})
export class AuditLogDetailComponent {
  @Input({ required: true }) event!: AuditEventRecord;
  @Output() closed = new EventEmitter<void>();

  @HostListener('keydown.escape')
  onEscape(): void {
    this.close();
  }

  onBackdropClick(mouseEvent: MouseEvent): void {
    if ((mouseEvent.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close();
    }
  }

  close(): void {
    this.closed.emit();
  }

  getResultLabel(): string {
    switch (this.event.result) {
      case 'SUCCESS':
        return 'Éxito';
      case 'FAILURE':
        return 'Fallo';
      case 'DENIED':
        return 'Denegado';
      default:
        return this.event.result;
    }
  }

  isSystemActor(): boolean {
    return this.event.actorType === 'SYSTEM';
  }

  hasMetadata(): boolean {
    return !!this.event.metadata && Object.keys(this.event.metadata).length > 0;
  }

  getMetadataEntries(): [string, unknown][] {
    return Object.entries(this.event.metadata ?? {});
  }

  formatMetaValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  formatDateIso(date: string | Date): string {
    return date instanceof Date ? date.toISOString() : new Date(date).toISOString();
  }

  formatDateReadable(date: string | Date): string {
    const d = date instanceof Date ? date : new Date(date);
    return d.toUTCString();
  }
}
