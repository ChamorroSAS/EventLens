import { Component, Input } from '@angular/core';
import type { EventStatus } from './lifecycle.types.js';

@Component({
  selector: 'eventlens-event-status-badge',
  standalone: true,
  template: `
    <span
      class="status-badge"
      [class]="'badge-' + statusClass"
      role="status"
      [attr.aria-label]="'Estado del evento: ' + statusLabel"
    >
      <span class="badge-dot" aria-hidden="true"></span>
      <span class="badge-text">{{ statusLabel }}</span>
    </span>
  `,
  styles: `
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.25rem 0.625rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      line-height: 1;
      border: 1px solid currentColor;
    }
    .badge-dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      background-color: currentColor;
    }
    .badge-draft {
      background-color: #f1f5f9;
      color: #475569;
      border-color: #cbd5e1;
    }
    .badge-scheduled {
      background-color: #fef3c7;
      color: #92400e;
      border-color: #fde68a;
    }
    .badge-active {
      background-color: #dcfce7;
      color: #15803d;
      border-color: #86efac;
    }
    .badge-closed {
      background-color: #f3f4f6;
      color: #374151;
      border-color: #d1d5db;
    }
    .badge-grace_period {
      background-color: #ffedd5;
      color: #c2410c;
      border-color: #fdba74;
    }
    .badge-pending_deletion {
      background-color: #fee2e2;
      color: #b91c1c;
      border-color: #fca5a5;
    }
    .badge-suspended {
      background-color: #fef2f2;
      color: #991b1b;
      border-color: #f87171;
    }
    .badge-deleted {
      background-color: #e5e7eb;
      color: #6b7280;
      border-color: #9ca3af;
    }
  `
})
export class EventStatusBadgeComponent {
  @Input({ required: true }) status!: EventStatus;

  get statusClass(): string {
    return (this.status || 'DRAFT').toLowerCase();
  }

  get statusLabel(): string {
    switch (this.status) {
      case 'DRAFT':
        return 'Borrador';
      case 'SCHEDULED':
        return 'Programado';
      case 'ACTIVE':
        return 'Activo';
      case 'CLOSED':
        return 'Cerrado';
      case 'GRACE_PERIOD':
        return 'Periodo de gracia';
      case 'PENDING_DELETION':
        return 'Pendiente de eliminación';
      case 'SUSPENDED':
        return 'Suspendido';
      case 'DELETED':
        return 'Eliminado';
      default:
        return this.status;
    }
  }
}
