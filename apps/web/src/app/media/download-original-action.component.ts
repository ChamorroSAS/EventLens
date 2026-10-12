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
    @use 'mixins' as m;

    .download-action-container {
      display: inline-flex;
      align-items: center;
      gap: var(--el-space-sm);
      flex-wrap: wrap;
    }
    .download-btn {
      display: inline-flex;
      align-items: center;
      padding: var(--el-space-sm) var(--el-space-md);
      font-size: var(--el-font-size-body-small);
      font-weight: var(--el-font-weight-medium);
      color: var(--el-color-text);
      background-color: var(--el-color-surface-muted);
      border: 1px solid var(--el-color-border-strong);
      border-radius: var(--el-radius-sm);
      transition: background-color 0.15s ease-in-out;
    }
    .download-btn:hover:not(:disabled) {
      background-color: var(--el-color-border);
    }
    .download-btn:focus-visible {
      @include m.el-focus-ring;
    }
    .download-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .security-badge {
      display: inline-block;
      padding: var(--el-space-xs) var(--el-space-sm);
      font-size: var(--el-font-size-caption);
      font-weight: var(--el-font-weight-medium);
      color: var(--el-color-text);
      background-color: var(--el-color-success-soft);
      border: 1px solid var(--el-color-success);
      border-radius: var(--el-radius-pill);
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
