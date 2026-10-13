import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ShareAccessSnapshot } from './access.types.js';

@Component({
  selector: 'el-event-share-panel',
  standalone: true,
  template: `
    <section class="share-panel-card" aria-labelledby="share-panel-title">
      <header class="panel-header">
        <h2 id="share-panel-title" class="panel-title">Compartir acceso al evento</h2>
        <span class="gen-tag">Generación {{ snapshot?.generation || 1 }}</span>
      </header>

      <div class="panel-content">
        <!-- QR Visual Area -->
        <div class="qr-preview-area">
          @if (safeQrSvg) {
            <div class="qr-box" [innerHTML]="safeQrSvg" role="img" [attr.aria-label]="'Código QR para: ' + (snapshot?.shareUrl || '')"></div>
          }
          <div class="qr-actions">
            <button
              type="button"
              class="download-qr-btn"
              (click)="downloadQrCode()"
              aria-label="Descargar código QR en formato SVG"
            >
              Descargar QR (SVG)
            </button>
          </div>
        </div>

        <!-- Share Link Area -->
        <div class="link-area">
          <label for="shareUrlInput" class="field-label">Enlace público de invitación</label>
          <div class="link-input-row">
            <input
              id="shareUrlInput"
              type="text"
              readonly
              [value]="snapshot?.shareUrl || ''"
              class="link-input"
            />
            <button
              type="button"
              class="copy-btn"
              (click)="copyLinkToClipboard()"
              aria-label="Copiar enlace público de acceso"
            >
              {{ copied ? '¡Copiado!' : 'Copiar enlace' }}
            </button>
          </div>

          @if (copyAnnouncement) {
            <div class="sr-only" role="status" aria-live="polite">
              {{ copyAnnouncement }}
            </div>
          }

          <div class="danger-zone">
            <p class="danger-desc">
              Si este enlace fue filtrado públicamente o deseas revocar el acceso a todos los invitados anteriores, puedes regenerarlo.
            </p>
            <button
              type="button"
              class="regenerate-trigger-btn"
              (click)="onOpenRegenerateDialog()"
              aria-label="Regenerar credencial de acceso y revocar enlace anterior"
            >
              Regenerar enlace y QR
            </button>
          </div>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .share-panel-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 1.5rem;
    }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.25rem;
    }
    .panel-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: #1a202c;
      margin: 0;
    }
    .gen-tag {
      font-size: 0.75rem;
      background: #edf2f7;
      color: #4a5568;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-weight: 600;
    }
    .panel-content {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.5rem;
    }
    @media (min-width: 640px) {
      .panel-content {
        grid-template-columns: 200px 1fr;
      }
    }
    .qr-preview-area {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
    }
    .qr-box {
      width: 180px;
      height: 180px;
      padding: 0.5rem;
      background: #ffffff;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .download-qr-btn {
      min-height: 44px;
      padding: 0 1rem;
      background: #edf2f7;
      color: #2d3748;
      border: 1px solid #cbd5e0;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
    }
    .download-qr-btn:hover {
      background: #e2e8f0;
    }
    .link-area {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .field-label {
      font-size: 0.875rem;
      font-weight: 600;
      color: #2d3748;
    }
    .link-input-row {
      display: flex;
      gap: 0.5rem;
    }
    .link-input {
      flex: 1;
      height: 44px;
      padding: 0 0.75rem;
      font-size: 0.875rem;
      color: #4a5568;
      background: #f7fafc;
      border: 1px solid #cbd5e0;
      border-radius: 8px;
    }
    .copy-btn {
      min-height: 44px;
      padding: 0 1.25rem;
      background: #3182ce;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    .copy-btn:hover {
      background: #2b6cb0;
    }
    .danger-zone {
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid #e2e8f0;
    }
    .danger-desc {
      font-size: 0.8125rem;
      color: #718096;
      margin-bottom: 0.75rem;
    }
    .regenerate-trigger-btn {
      min-height: 44px;
      padding: 0 1rem;
      background: #fff5f5;
      color: #c53030;
      border: 1px solid #feb2b2;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
    }
    .regenerate-trigger-btn:hover {
      background: #fed7d7;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border-width: 0;
    }
  `]
})
export class EventSharePanelComponent {
  @Input() snapshot: ShareAccessSnapshot | null = null;
  @Output() openRegenerateDialog = new EventEmitter<void>();

  copied = false;
  copyAnnouncement: string | null = null;

  constructor(private sanitizer: DomSanitizer) {}

  get safeQrSvg(): SafeHtml | null {
    if (!this.snapshot?.qrSvg) return null;
    return this.sanitizer.bypassSecurityTrustHtml(this.snapshot.qrSvg);
  }

  copyLinkToClipboard(): void {
    if (!this.snapshot?.shareUrl) return;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(this.snapshot.shareUrl).catch(() => {});
    }

    this.copied = true;
    this.copyAnnouncement = 'Enlace copiado al portapapeles';

    setTimeout(() => {
      this.copied = false;
      this.copyAnnouncement = null;
    }, 2500);
  }

  downloadQrCode(): void {
    if (!this.snapshot?.qrSvg) return;

    const blob = new Blob([this.snapshot.qrSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `event-${this.snapshot.eventId}-qr.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  onOpenRegenerateDialog(): void {
    this.openRegenerateDialog.emit();
  }
}
