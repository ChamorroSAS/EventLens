import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'eventlens-download-original-action',
  standalone: true,
  template: `
    <div class="download-action-container">
      <button
        type="button"
        class="download-btn"
        [disabled]="disabled"
        [attr.aria-label]="'Descargar archivo original ' + fileName"
        (click)="onDownloadClick()"
      >
        <span>Descargar original</span>
      </button>
      <span class="security-badge" title="Inspección de seguridad aprobada">Original seguro verificado</span>
    </div>
  `,
  styles: `
    .download-action-container {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .download-btn {
      display: inline-flex;
      align-items: center;
      padding: 0.5rem 0.875rem;
      font-size: 0.875rem;
      font-weight: 500;
      color: #0f172a;
      background-color: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 0.375rem;
      cursor: pointer;
      transition: background-color 0.15s ease-in-out;
    }
    .download-btn:hover:not(:disabled) {
      background-color: #e2e8f0;
    }
    .download-btn:focus-visible {
      outline: 2px solid #0f172a;
      outline-offset: 2px;
    }
    .download-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .security-badge {
      font-size: 0.75rem;
      color: #15803d;
      font-weight: 500;
    }
  `,
})
export class DownloadOriginalActionComponent {
  @Input({ required: true }) fileName!: string;
  @Input() disabled = false;
  @Output() downloadRequested = new EventEmitter<void>();

  onDownloadClick(): void {
    if (this.disabled) return;
    this.downloadRequested.emit();
  }
}
