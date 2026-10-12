import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'el-report-content-action',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      type="button"
      class="report-btn"
      (click)="onClick()"
      aria-label="Reportar contenido"
      title="Reportar contenido"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
        <line x1="4" y1="22" x2="4" y2="15"></line>
      </svg>
      <span class="report-label">Reportar</span>
    </button>
  `,
  styles: [`
    .report-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.5rem 0.75rem;
      background: rgba(255, 255, 255, 0.15);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 0.5rem;
      font-size: 0.8125rem;
      font-weight: 500;
      cursor: pointer;
      min-height: 44px;
      min-width: 44px;
      backdrop-filter: blur(8px);
      transition: background 0.15s ease;
    }
    .report-btn:hover {
      background: rgba(239, 68, 68, 0.4);
      border-color: rgba(239, 68, 68, 0.6);
    }
    .report-btn:focus-visible {
      outline: 2px solid #ef4444;
      outline-offset: 2px;
    }
    .report-label {
      font-size: 0.8125rem;
    }
  `]
})
export class ReportContentActionComponent {
  @Input({ required: true }) mediaId!: string;
  @Input({ required: true }) eventId!: string;
  @Output() reportTriggered = new EventEmitter<{ eventId: string; mediaId: string }>();

  public onClick(): void {
    this.reportTriggered.emit({
      eventId: this.eventId,
      mediaId: this.mediaId
    });
  }
}
