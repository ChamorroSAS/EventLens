import {
  Component,
  Input,
  Output,
  EventEmitter,
  HostListener,
  ElementRef,
  AfterViewInit,
  ViewChild
} from '@angular/core';
import type { GalleryMediaItem, MediaViewGrant } from './gallery.types.js';
import { MediaViewerComponent } from './media-viewer.component.js';
import { ReportContentActionComponent } from './report-content-action.component.js';

@Component({
  selector: 'el-gallery-viewer',
  standalone: true,
  imports: [MediaViewerComponent, ReportContentActionComponent],
  host: {
    'role': 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Visor de recuerdos'
  },
  template: `
    <div
      #modalContainer
      class="viewer-overlay"
      tabindex="-1"
    >
      <div class="viewer-backdrop" (click)="onClose()"></div>

      <div class="viewer-content">
        <!-- Header Bar -->
        <header class="viewer-header">
          <div class="counter-badge" aria-live="polite">
            {{ currentIndex + 1 }} de {{ totalCount }}
          </div>

          <div class="header-actions">
            <!-- Report button -->
            <el-report-content-action
              [mediaId]="item.mediaId"
              [eventId]="item.eventId"
              (reportTriggered)="report.emit($event)"
            ></el-report-content-action>

            <!-- Close button -->
            <button
              #closeBtn
              type="button"
              class="close-btn"
              (click)="onClose()"
              aria-label="Cerrar visor"
              title="Cerrar visor (Escape)"
            >
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </header>

        <!-- Main Media Area -->
        <main class="viewer-body">
          <el-media-viewer
            [item]="item"
            [viewGrant]="viewGrant"
            [isLoading]="isLoadingGrant"
            [errorMessage]="getFriendlyErrorMessage()"
            (retry)="retryGrant.emit()"
          ></el-media-viewer>
        </main>

        <!-- Navigation Controls -->
        <footer class="viewer-footer">
          <button
            type="button"
            class="nav-btn prev-btn"
            [disabled]="!hasPrevious"
            (click)="onPrevious()"
            aria-label="Recuerdo anterior"
            title="Recuerdo anterior (Flecha izquierda)"
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            <span class="nav-label">Anterior</span>
          </button>

          <button
            type="button"
            class="nav-btn next-btn"
            [disabled]="!hasNext"
            (click)="onNext()"
            aria-label="Recuerdo siguiente"
            title="Recuerdo siguiente (Flecha derecha)"
          >
            <span class="nav-label">Siguiente</span>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    .viewer-overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.92);
      outline: none;
    }
    .viewer-backdrop {
      position: absolute;
      inset: 0;
    }
    .viewer-content {
      position: relative;
      z-index: 1001;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: env(safe-area-inset-top, 1rem) env(safe-area-inset-right, 1rem) env(safe-area-inset-bottom, 1rem) env(safe-area-inset-left, 1rem);
      box-sizing: border-box;
    }
    .viewer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      background: linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%);
    }
    .counter-badge {
      color: #e2e8f0;
      font-size: 0.875rem;
      font-weight: 600;
      background: rgba(255, 255, 255, 0.15);
      padding: 0.25rem 0.625rem;
      border-radius: 9999px;
      backdrop-filter: blur(8px);
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .close-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      padding: 0;
      background: rgba(255, 255, 255, 0.15);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 0.5rem;
      cursor: pointer;
      backdrop-filter: blur(8px);
      transition: background 0.15s ease;
    }
    .close-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    .close-btn:focus-visible {
      outline: 2px solid #38bdf8;
      outline-offset: 2px;
    }
    .viewer-body {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      padding: 0.5rem 0;
    }
    .viewer-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      background: linear-gradient(0deg, rgba(0,0,0,0.6) 0%, transparent 100%);
    }
    .nav-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      min-height: 44px;
      min-width: 44px;
      padding: 0.5rem 1rem;
      background: rgba(255, 255, 255, 0.15);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 0.5rem;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      backdrop-filter: blur(8px);
      transition: background 0.15s ease, opacity 0.15s ease;
    }
    .nav-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
    .nav-btn:not(:disabled):hover {
      background: rgba(255, 255, 255, 0.25);
    }
    .nav-btn:focus-visible {
      outline: 2px solid #38bdf8;
      outline-offset: 2px;
    }
    @media (max-width: 480px) {
      .nav-label {
        display: none;
      }
    }
  `]
})
export class GalleryViewerComponent implements AfterViewInit {
  @Input({ required: true }) item!: GalleryMediaItem;
  @Input({ required: true }) currentIndex: number = 0;
  @Input({ required: true }) totalCount: number = 0;
  @Input() hasPrevious: boolean = false;
  @Input() hasNext: boolean = false;
  @Input() viewGrant?: MediaViewGrant | null;
  @Input() isLoadingGrant: boolean = false;
  @Input() grantError?: string | null;

  @Output() close = new EventEmitter<void>();
  @Output() previous = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();
  @Output() report = new EventEmitter<{ eventId: string; mediaId: string }>();
  @Output() retryGrant = new EventEmitter<void>();

  @ViewChild('modalContainer') modalContainerRef?: ElementRef<HTMLDivElement>;
  @ViewChild('closeBtn') closeBtnRef?: ElementRef<HTMLButtonElement>;

  ngAfterViewInit(): void {
    // Focus the modal or close button on open
    setTimeout(() => {
      if (this.closeBtnRef?.nativeElement) {
        this.closeBtnRef.nativeElement.focus();
      } else if (this.modalContainerRef?.nativeElement) {
        this.modalContainerRef.nativeElement.focus();
      }
    }, 0);
  }

  @HostListener('keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onClose();
    } else if (event.key === 'ArrowLeft') {
      if (this.hasPrevious) {
        event.preventDefault();
        this.onPrevious();
      }
    } else if (event.key === 'ArrowRight') {
      if (this.hasNext) {
        event.preventDefault();
        this.onNext();
      }
    }
  }

  public onClose(): void {
    this.close.emit();
  }

  public onPrevious(): void {
    if (this.hasPrevious) {
      this.previous.emit();
    }
  }

  public onNext(): void {
    if (this.hasNext) {
      this.next.emit();
    }
  }

  public getFriendlyErrorMessage(): string | null {
    if (!this.grantError) return null;
    if (this.grantError.includes('MEDIA_UNAVAILABLE') || this.grantError.includes('404')) {
      return 'Este recuerdo ya no se encuentra disponible.';
    }
    if (this.grantError.includes('ACCESS_REVOKED') || this.grantError.includes('403')) {
      return 'El acceso a este contenido ha sido revocado.';
    }
    if (this.grantError.includes('SESSION_EXPIRED') || this.grantError.includes('401')) {
      return 'Tu sesión ha expirado.';
    }
    return 'No fue posible autorizar la visualización de este recuerdo.';
  }
}
