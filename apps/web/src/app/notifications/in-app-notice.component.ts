import {
  Component,
  Input,
  Output,
  EventEmitter,
  computed,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';

export interface InAppNoticeAction {
  label: string;
  destination: string;
}

export type InAppNoticeSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface InAppNoticeItem {
  id: string;
  intentId?: string | null;
  notificationType: string;
  title: string;
  fact: string;
  date: Date | string;
  validUntil?: Date | string | null;
  consequence: string;
  action?: InAppNoticeAction | null;
  severity: InAppNoticeSeverity;
  resourceRef?: string;
  recipientRef?: string;
}

@Component({
  selector: 'eventlens-in-app-notice',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (notice) {
      <div
        class="el-notice-card"
        [ngClass]="'severity-' + (notice.severity || 'info').toLowerCase()"
        [attr.role]="isCritical() ? 'alert' : 'status'"
        [attr.aria-live]="isCritical() ? 'assertive' : 'polite'"
        [attr.data-testid]="'notice-' + notice.id"
      >
        <div class="notice-header">
          <span class="severity-icon" aria-hidden="true">{{ getSeverityIcon() }}</span>
          <div class="notice-title-group">
            <h4 class="notice-title">{{ notice.title }}</h4>
            <span class="notice-date">{{ formattedDate() }}</span>
          </div>
        </div>

        <div class="notice-body">
          <p class="notice-fact">
            <strong>Hecho:</strong> {{ notice.fact }}
          </p>
          <p class="notice-consequence">
            <strong>Consecuencia:</strong> {{ notice.consequence }}
          </p>

          @if (isActionExpired()) {
            <p class="notice-expired-warning" role="note">
              ⚠️ La ventana de acción para este aviso ha finalizado o ha expirado. Verifica el estado actualizado en la plataforma.
            </p>
          }
        </div>

        <div class="notice-footer">
          @if (notice.action && !isActionExpired()) {
            <a
              class="notice-action-btn"
              [href]="notice.action.destination"
              (click)="onActionClicked($event, notice.action.destination)"
            >
              {{ notice.action.label }}
            </a>
          } @else if (notice.action && isActionExpired()) {
            <a
              class="notice-action-btn fallback-btn"
              [href]="fallbackDestination()"
              (click)="onActionClicked($event, fallbackDestination())"
            >
              Ver estado en la biblioteca
            </a>
          }

          @if (dismissible) {
            <button
              type="button"
              class="dismiss-btn"
              (click)="onDismiss()"
              aria-label="Ocultar aviso temporalmente"
            >
              Ocultar
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .el-notice-card {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 1rem 1.25rem;
      border-radius: 8px;
      margin-bottom: 1rem;
      border: 1px solid transparent;
      font-family: inherit;
    }

    .severity-info {
      background-color: #eff6ff;
      border-color: #bfdbfe;
      color: #1e3a8a;
    }

    .severity-warning {
      background-color: #fffbeb;
      border-color: #fde68a;
      color: #78350f;
    }

    .severity-critical {
      background-color: #fef2f2;
      border-color: #fecaca;
      color: #991b1b;
    }

    .notice-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .severity-icon {
      font-size: 1.25rem;
      line-height: 1;
    }

    .notice-title-group {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }

    .notice-title {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 700;
      color: inherit;
    }

    .notice-date {
      font-size: 0.75rem;
      opacity: 0.8;
    }

    .notice-body {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      font-size: 0.875rem;
      line-height: 1.4;
    }

    .notice-body p {
      margin: 0;
    }

    .notice-expired-warning {
      margin-top: 0.25rem;
      font-weight: 600;
      font-size: 0.8rem;
    }

    .notice-footer {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-top: 0.25rem;
    }

    .notice-action-btn {
      display: inline-block;
      padding: 0.4rem 0.85rem;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 600;
      text-decoration: none;
      background-color: #1e40af;
      color: #ffffff;
      border: 1px solid transparent;
      transition: background-color 0.15s ease;
    }

    .notice-action-btn:hover, .notice-action-btn:focus {
      background-color: #1d4ed8;
      outline: 2px solid #2563eb;
    }

    .severity-warning .notice-action-btn {
      background-color: #b45309;
    }
    .severity-warning .notice-action-btn:hover {
      background-color: #92400e;
    }

    .severity-critical .notice-action-btn {
      background-color: #b91c1c;
    }
    .severity-critical .notice-action-btn:hover {
      background-color: #991b1b;
    }

    .notice-action-btn.fallback-btn {
      background-color: transparent;
      color: inherit;
      border-color: currentColor;
    }

    .dismiss-btn {
      background: none;
      border: none;
      font-size: 0.8rem;
      color: inherit;
      opacity: 0.75;
      cursor: pointer;
      padding: 0.25rem 0.5rem;
    }

    .dismiss-btn:hover {
      opacity: 1;
      text-decoration: underline;
    }
  `]
})
export class InAppNoticeComponent {
  @Input() notice?: InAppNoticeItem;
  @Input() dismissible = false;
  @Input() now: Date = new Date();

  @Output() actionClick = new EventEmitter<string>();
  @Output() dismiss = new EventEmitter<void>();

  isCritical(): boolean {
    return this.notice?.severity === 'CRITICAL';
  }

  isActionExpired(): boolean {
    if (!this.notice?.validUntil) return false;
    const expiry = new Date(this.notice.validUntil);
    return expiry.getTime() <= this.now.getTime();
  }

  getSeverityIcon(): string {
    switch (this.notice?.severity) {
      case 'CRITICAL':
        return '🚨';
      case 'WARNING':
        return '⚠️';
      default:
        return 'ℹ️';
    }
  }

  formattedDate(): string {
    if (!this.notice?.date) return '';
    try {
      const d = new Date(this.notice.date);
      return d.toLocaleDateString('es', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return String(this.notice.date);
    }
  }

  fallbackDestination(): string {
    if (this.notice?.resourceRef && this.notice.resourceRef.startsWith('events/')) {
      return `/${this.notice.resourceRef}/media`;
    }
    return '/';
  }

  onActionClicked(event: MouseEvent, dest: string): void {
    if (this.actionClick.observed) {
      event.preventDefault();
      this.actionClick.emit(dest);
    }
  }

  onDismiss(): void {
    this.dismiss.emit();
  }
}
