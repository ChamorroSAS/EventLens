import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { ExportStatusSnapshotUI } from './media.types.js';
export type { ExportStatusSnapshotUI };

@Component({
  selector: 'eventlens-export-status-panel',
  standalone: true,
  template: `
    @if (isOpen && snapshot) {
      <div class="panel-backdrop" (click)="onBackdropClick($event)">
        <section
          class="export-panel-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-panel-title"
        >
          <!-- HEADER -->
          <header class="panel-header">
            <div class="header-content">
              <h3 id="export-panel-title">Estado de la exportación</h3>
              <span class="status-badge status-{{ snapshot.status.toLowerCase() }}">
                {{ statusLabel(snapshot.status) }}
              </span>
            </div>
            <button
              type="button"
              class="btn-close"
              aria-label="Cerrar panel de estado"
              (click)="close.emit()"
            >
              ✕
            </button>
          </header>

          <div class="panel-body">
            <!-- 1. PREPARING / REQUESTED: PROGRESS -->
            @if (snapshot.status === 'PREPARING' || snapshot.status === 'REQUESTED') {
              <div class="preparing-card" role="status" aria-busy="true">
                <div class="preparing-header">
                  <span class="spinner" aria-hidden="true">⏳</span>
                  <span class="preparing-title">Estamos preparando tus archivos</span>
                </div>
                <p class="preparing-desc">
                  Procesando {{ snapshot.selectedCount }} originales en paquetes ZIP64 multipartes.
                </p>

                @if (snapshot.progress && snapshot.progress.partsTotal > 0) {
                  <div class="progress-bar-container" aria-label="Progreso de preparación">
                    <div
                      class="progress-bar-fill"
                      [style.width.%]="snapshot.progress.percent ?? 0"
                    ></div>
                  </div>
                  <div class="progress-meta">
                    <span>Partes listas: {{ snapshot.progress.partsReady }} de {{ snapshot.progress.partsTotal }}</span>
                    <span>{{ snapshot.progress.percent }}%</span>
                  </div>
                } @else {
                  <p class="progress-indeterminate">
                    Empaquetando en storage privado… (progreso estimado en actualización continua)
                  </p>
                }
              </div>
            }

            <!-- 2. AVAILABLE: PACKAGES & EXPIRY -->
            @if (snapshot.status === 'AVAILABLE') {
              <div class="available-card">
                <!-- EXPIRY NOTICE (48h DEC-048) -->
                @if (snapshot.expiresAt) {
                  <div class="expiry-notice" role="note">
                    <span aria-hidden="true">⏱️</span>
                    <span>Disponible hasta: <strong>{{ formatDateTime(snapshot.expiresAt) }}</strong> (48 horas desde preparación).</span>
                  </div>
                }

                <!-- PACKAGE LIST -->
                <h4 class="packages-title">Partes preparadas para descargar ({{ snapshot.parts.length }})</h4>
                <ul class="packages-list" role="list">
                  @for (part of snapshot.parts; track part.partNumber) {
                    <li class="package-item" role="listitem">
                      <div class="package-info">
                        <span class="package-name">Parte {{ part.partNumber }}</span>
                        <span class="package-meta">
                          {{ formatBytes(part.sizeBytes) }} • {{ part.entryCount }} archivos
                        </span>
                        @if (part.sha256) {
                          <span class="package-hash" title="Integridad SHA-256 verificada">
                            SHA-256: {{ part.sha256.slice(0, 12) }}…
                          </span>
                        }
                      </div>

                      <button
                        type="button"
                        class="btn-download-part"
                        [disabled]="part.status !== 'READY' || isDownloadingPart(part.partNumber)"
                        [attr.aria-label]="'Descargar parte ' + part.partNumber + ' (' + formatBytes(part.sizeBytes) + ')'"
                        (click)="onDownloadPart(part.partNumber)"
                      >
                        @if (isDownloadingPart(part.partNumber)) {
                          <span class="spinner" aria-hidden="true">⏳</span>
                          <span>Generando enlace…</span>
                        } @else {
                          <span>Descargar parte {{ part.partNumber }}</span>
                        }
                      </button>
                    </li>
                  }
                </ul>
              </div>
            }

            <!-- 3. FAILED: ERROR & RETRY -->
            @if (snapshot.status === 'FAILED') {
              <div class="failed-card" role="alert">
                <span class="alert-icon" aria-hidden="true">⚠️</span>
                <div class="failed-details">
                  <h4>No se pudo completar la preparación</h4>
                  <p>
                    {{ snapshot.statusReason ?? 'Ocurrió un error temporal durante el empaquetado.' }}
                    @if (snapshot.failureCode) {
                      <span class="error-code">Código: {{ snapshot.failureCode }}</span>
                    }
                  </p>

                  @if (snapshot.capabilities.canRetry) {
                    <button
                      type="button"
                      class="btn-action-primary btn-retry-export"
                      [disabled]="isActionSubmitting"
                      (click)="retry.emit()"
                    >
                      Reintentar preparación
                    </button>
                  }
                </div>
              </div>
            }

            <!-- 4. EXPIRED: REGENERATE -->
            @if (snapshot.status === 'EXPIRED') {
              <div class="expired-card" role="alert">
                <span class="alert-icon" aria-hidden="true">⌛</span>
                <div class="expired-details">
                  <h4>La exportación ha expirado</h4>
                  <p>
                    La ventana de 48 horas finalizó y los paquetes temporales fueron retirados de storage privado (DEC-048).
                  </p>
                  @if (snapshot.capabilities.canRegenerate) {
                    <button
                      type="button"
                      class="btn-action-primary"
                      [disabled]="isActionSubmitting"
                      (click)="regenerate.emit()"
                    >
                      Regenerar paquete de exportación
                    </button>
                  }
                </div>
              </div>
            }

            <!-- 5. INVALIDATED: CONTENT WITHDRAWN / ACCESS CHANGED (DEC-090) -->
            @if (snapshot.status === 'INVALIDATED') {
              <div class="invalidated-card" role="alert">
                <span class="alert-icon" aria-hidden="true">🚫</span>
                <div class="invalidated-details">
                  <h4>Exportación no disponible por cambios en el contenido o permisos</h4>
                  <p>
                    {{ snapshot.statusReason ?? 'Uno o más archivos fueron retirados o los permisos del evento fueron revocados (DEC-090).' }}
                  </p>
                  <p class="invalidated-sub">
                    Para recuperar los archivos actualmente válidos, inicia una nueva solicitud de exportación desde la biblioteca.
                  </p>
                  @if (snapshot.capabilities.canRequestNew) {
                    <button
                      type="button"
                      class="btn-action-primary"
                      [disabled]="isActionSubmitting"
                      (click)="requestNew.emit()"
                    >
                      Nueva solicitud de exportación
                    </button>
                  }
                </div>
              </div>
            }
          </div>

          <footer class="panel-footer">
            <button
              type="button"
              class="btn-close-footer"
              (click)="close.emit()"
            >
              Cerrar
            </button>
          </footer>
        </section>
      </div>
    }
  `,
  styles: `
    .panel-backdrop {
      position: fixed;
      inset: 0;
      background-color: rgba(15, 23, 42, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
    }
    .export-panel-card {
      background: #ffffff;
      border-radius: 0.75rem;
      max-width: 600px;
      width: 100%;
      max-height: 85vh;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid #e2e8f0;
    }
    .header-content {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .panel-header h3 {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 700;
      color: #0f172a;
    }
    .status-badge {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.25rem 0.5rem;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }
    .status-preparing, .status-requested {
      background: #e0f2fe;
      color: #0369a1;
    }
    .status-available {
      background: #dcfce7;
      color: #15803d;
    }
    .status-failed {
      background: #fee2e2;
      color: #b91c1c;
    }
    .status-expired {
      background: #ffedd5;
      color: #c2410c;
    }
    .status-invalidated {
      background: #f1f5f9;
      color: #475569;
    }
    .btn-close {
      background: none;
      border: none;
      font-size: 1.25rem;
      color: #64748b;
      cursor: pointer;
      padding: 0.25rem;
    }
    .panel-body {
      padding: 1.5rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .preparing-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 0.5rem;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .preparing-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .preparing-title {
      font-weight: 600;
      color: #0f172a;
    }
    .preparing-desc {
      margin: 0;
      font-size: 0.875rem;
      color: #475569;
    }
    .progress-bar-container {
      height: 8px;
      background: #e2e8f0;
      border-radius: 4px;
      overflow: hidden;
    }
    .progress-bar-fill {
      height: 100%;
      background: #2563eb;
      transition: width 0.3s ease;
    }
    .progress-meta {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: #64748b;
    }
    .progress-indeterminate {
      margin: 0;
      font-size: 0.8125rem;
      color: #64748b;
      font-style: italic;
    }
    .available-card {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .expiry-notice {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: #fefce8;
      border: 1px solid #fef08a;
      border-radius: 0.375rem;
      padding: 0.625rem 0.875rem;
      font-size: 0.8125rem;
      color: #854d0e;
    }
    .packages-title {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 600;
      color: #1e293b;
    }
    .packages-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .package-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.875rem 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 0.5rem;
      background: #ffffff;
      flex-wrap: wrap;
    }
    .package-info {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .package-name {
      font-weight: 600;
      color: #0f172a;
      font-size: 0.875rem;
    }
    .package-meta {
      font-size: 0.75rem;
      color: #64748b;
    }
    .package-hash {
      font-size: 0.6875rem;
      color: #94a3b8;
      font-family: monospace;
    }
    .btn-download-part {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.5rem 0.875rem;
      border-radius: 0.375rem;
      border: 1px solid #0f172a;
      background: #0f172a;
      color: #ffffff;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    .btn-download-part:hover:not(:disabled) {
      background: #1e293b;
    }
    .btn-download-part:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .failed-card, .expired-card, .invalidated-card {
      display: flex;
      gap: 0.75rem;
      padding: 1rem;
      border-radius: 0.5rem;
      font-size: 0.875rem;
    }
    .failed-card {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #991b1b;
    }
    .expired-card {
      background: #fff7ed;
      border: 1px solid #fed7aa;
      color: #9a3412;
    }
    .invalidated-card {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      color: #334155;
    }
    .failed-details h4, .expired-details h4, .invalidated-details h4 {
      margin: 0 0 0.375rem 0;
      font-weight: 600;
    }
    .failed-details p, .expired-details p, .invalidated-details p {
      margin: 0 0 0.75rem 0;
      line-height: 1.4;
    }
    .invalidated-sub {
      font-size: 0.8125rem;
      color: #64748b;
    }
    .error-code {
      display: block;
      font-size: 0.75rem;
      font-family: monospace;
      margin-top: 0.25rem;
    }
    .btn-action-primary {
      padding: 0.5rem 0.875rem;
      border-radius: 0.375rem;
      border: 1px solid #0f172a;
      background: #0f172a;
      color: #ffffff;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-action-primary:hover:not(:disabled) {
      background: #1e293b;
    }
    .panel-footer {
      display: flex;
      justify-content: flex-end;
      padding: 0.875rem 1.5rem;
      border-top: 1px solid #e2e8f0;
      background: #f8fafc;
    }
    .btn-close-footer {
      padding: 0.375rem 0.875rem;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: #334155;
      border-radius: 0.375rem;
      font-size: 0.8125rem;
      cursor: pointer;
    }
    .spinner {
      display: inline-block;
      animation: spin 1.5s linear infinite;
    }
    @keyframes spin {
      100% { transform: rotate(360deg); }
    }
  `
})
export class ExportStatusPanelComponent {
  @Input() isOpen = false;
  @Input() snapshot: ExportStatusSnapshotUI | null = null;
  @Input() isActionSubmitting = false;
  @Input() downloadingParts: number[] = [];

  @Output() downloadPart = new EventEmitter<number>();
  @Output() retry = new EventEmitter<void>();
  @Output() regenerate = new EventEmitter<void>();
  @Output() requestNew = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }

  isDownloadingPart(partNumber: number): boolean {
    return this.downloadingParts.includes(partNumber);
  }

  onDownloadPart(partNumber: number): void {
    if (this.isDownloadingPart(partNumber)) return;
    this.downloadPart.emit(partNumber);
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'REQUESTED':
        return 'Solicitado';
      case 'PREPARING':
        return 'Preparando';
      case 'AVAILABLE':
        return 'Disponible';
      case 'FAILED':
        return 'Fallido';
      case 'EXPIRED':
        return 'Expirado';
      case 'INVALIDATED':
        return 'Invalidado';
      default:
        return status;
    }
  }

  formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  formatDateTime(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleString('es', {
        dateStyle: 'short',
        timeStyle: 'short'
      });
    } catch {
      return iso;
    }
  }
}
