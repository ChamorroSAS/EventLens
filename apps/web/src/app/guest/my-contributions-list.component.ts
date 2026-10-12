import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GuestContributionView } from './guest.types.js';

@Component({
  selector: 'el-my-contributions-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="contributions-panel" aria-labelledby="contributions-heading">
      <header class="panel-header">
        <h2 id="contributions-heading" class="panel-title">Mis aportes ({{ contributions.length }})</h2>
        <button
          type="button"
          class="request-removal-link"
          (click)="onRequestRemoval()"
          aria-label="Solicitar retiro de un recuerdo"
        >
          Solicitar retiro
        </button>
      </header>

      <div *ngIf="contributions.length === 0" class="empty-state" role="status">
        <p class="empty-text">Aún no has compartido recuerdos en este evento.</p>
      </div>

      <ul *ngIf="contributions.length > 0" class="contributions-list" role="list">
        <li
          *ngFor="let item of contributions; trackBy: trackByAttemptId"
          class="contribution-item"
        >
          <div class="item-icon" aria-hidden="true">
            <span *ngIf="item.mediaType === 'PHOTO'">📷</span>
            <span *ngIf="item.mediaType === 'VIDEO'">🎬</span>
          </div>

          <div class="item-info">
            <div class="item-title-row">
              <span class="media-type-badge">{{ item.mediaType === 'PHOTO' ? 'Foto' : 'Video' }}</span>
              <span class="status-chip" [ngClass]="getStatusClass(item.status)">
                {{ getStatusLabel(item.status) }}
              </span>
            </div>

            <div class="item-meta">
              <span>{{ formatSize(item.actualSize || item.declaredSize) }}</span>
              <span *ngIf="item.durationSeconds">• {{ item.durationSeconds }}s</span>
              <span>• {{ item.createdAt | date:'short' }}</span>
            </div>

            <div *ngIf="item.rejectionReason" class="rejection-note" role="note">
              Motivo: {{ item.rejectionReason }}
            </div>
          </div>
        </li>
      </ul>
    </section>
  `,
  styles: [`
    .contributions-panel {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 1.25rem;
    }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      border-bottom: 1px solid #edf2f7;
      padding-bottom: 0.75rem;
    }
    .panel-title {
      font-size: 1.125rem;
      font-weight: 700;
      color: #1a202c;
      margin: 0;
    }
    .request-removal-link {
      background: none;
      border: none;
      color: #e53e3e;
      font-size: 0.875rem;
      font-weight: 600;
      text-decoration: underline;
      cursor: pointer;
      min-height: 44px;
      padding: 0.5rem;
    }
    .empty-state {
      padding: 2rem 1rem;
      text-align: center;
      color: #718096;
      font-size: 0.875rem;
    }
    .contributions-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .contribution-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      background: #f7fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }
    .item-icon {
      font-size: 1.5rem;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #edf2f7;
      border-radius: 8px;
    }
    .item-info {
      flex: 1;
    }
    .item-title-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.25rem;
    }
    .media-type-badge {
      font-size: 0.75rem;
      font-weight: 700;
      color: #2d3748;
      background: #e2e8f0;
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
    }
    .status-chip {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.125rem 0.5rem;
      border-radius: 12px;
    }
    .status-accepted {
      background: #c6f6d5;
      color: #22543d;
    }
    .status-processing {
      background: #feebc8;
      color: #744210;
    }
    .status-rejected {
      background: #fed7d7;
      color: #742a2a;
    }
    .status-default {
      background: #edf2f7;
      color: #4a5568;
    }
    .item-meta {
      font-size: 0.75rem;
      color: #718096;
      display: flex;
      gap: 0.375rem;
    }
    .rejection-note {
      font-size: 0.75rem;
      color: #e53e3e;
      margin-top: 0.25rem;
    }
  `]
})
export class MyContributionsListComponent {
  @Input() contributions: GuestContributionView[] = [];
  @Output() requestRemoval = new EventEmitter<void>();

  trackByAttemptId(index: number, item: GuestContributionView): string {
    return item.attemptId;
  }

  formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    return (bytes / 1024).toFixed(0) + ' KB';
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'ACCEPTED':
      case 'READY':
        return 'status-accepted';
      case 'AUTHORIZED':
      case 'UPLOADING':
      case 'CONFIRMING':
      case 'VALIDATING':
      case 'PROCESSING':
        return 'status-processing';
      case 'REJECTED':
      case 'FAILED':
        return 'status-rejected';
      default:
        return 'status-default';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'ACCEPTED':
        return 'Recibido';
      case 'READY':
        return 'Listo en galería';
      case 'AUTHORIZED':
      case 'UPLOADING':
        return 'Cargando';
      case 'CONFIRMING':
      case 'VALIDATING':
      case 'PROCESSING':
        return 'Procesando';
      case 'REJECTED':
        return 'Rechazado';
      case 'CANCELLED':
        return 'Cancelado';
      default:
        return status;
    }
  }

  onRequestRemoval(): void {
    this.requestRemoval.emit();
  }
}
