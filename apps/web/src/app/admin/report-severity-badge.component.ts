import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ModerationSeverity } from './admin.types.js';

@Component({
  selector: 'eventlens-report-severity-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="severity-badge"
      [ngClass]="'badge-' + severity.toLowerCase()"
      [attr.aria-label]="'Severidad: ' + getLabel()"
    >
      <span class="badge-dot" aria-hidden="true"></span>
      <span class="badge-text">{{ getLabel() }}</span>
    </span>
  `,
  styles: `
    .severity-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.25rem 0.625rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.025em;
      text-transform: uppercase;
      line-height: 1;
    }
    .badge-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }
    .badge-critical {
      background-color: #450a0a;
      color: #fca5a5;
      border: 1px solid #991b1b;
    }
    .badge-critical .badge-dot {
      background-color: #ef4444;
      box-shadow: 0 0 6px #ef4444;
    }
    .badge-normal {
      background-color: #451a03;
      color: #fcd34d;
      border: 1px solid #b45309;
    }
    .badge-normal .badge-dot {
      background-color: #f59e0b;
    }
    .badge-unclassified {
      background-color: #1e293b;
      color: #94a3b8;
      border: 1px solid #334155;
    }
    .badge-unclassified .badge-dot {
      background-color: #64748b;
    }
  `
})
export class ReportSeverityBadgeComponent {
  @Input({ required: true }) severity!: ModerationSeverity;

  getLabel(): string {
    switch (this.severity) {
      case 'CRITICAL':
        return 'Crítica';
      case 'NORMAL':
        return 'Normal';
      case 'UNCLASSIFIED':
      default:
        return 'Sin clasificar';
    }
  }
}
