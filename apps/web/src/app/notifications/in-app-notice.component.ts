import {
  Component,
  Input,
  Output,
  EventEmitter
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
  templateUrl: './in-app-notice.component.html',
  styleUrl: './in-app-notice.component.scss'
})
export class InAppNoticeComponent {
  @Input() notice?: InAppNoticeItem;
  @Input() dismissible = false;
  @Input() now: Date = new Date();
  @Input() fallbackAction?: InAppNoticeAction | null;

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
    if (this.fallbackAction?.destination) {
      return this.fallbackAction.destination;
    }
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
