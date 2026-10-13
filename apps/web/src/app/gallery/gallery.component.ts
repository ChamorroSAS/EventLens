import {
  Component,
  Input,
  OnInit,
  signal,
  computed
} from '@angular/core';
import type {
  GalleryMediaItem,
  MediaViewGrant
} from './gallery.types.js';
import { GalleryService } from './gallery.service.js';
import { GalleryMediaCardComponent } from './gallery-media-card.component.js';
import { GalleryEmptyStateComponent } from './gallery-empty-state.component.js';
import { GalleryDisabledStateComponent } from './gallery-disabled-state.component.js';
import { GalleryViewerComponent } from './gallery-viewer.component.js';
import { ReportContentDialogComponent } from './report-content-dialog.component.js';

@Component({
  selector: 'el-gallery',
  standalone: true,
  imports: [
    GalleryMediaCardComponent,
    GalleryEmptyStateComponent,
    GalleryDisabledStateComponent,
    GalleryViewerComponent,
    ReportContentDialogComponent
  ],
  template: `
    <section class="gallery-root" aria-label="Galería de recuerdos">
      <!-- Escenario 2: Galería Deshabilitada -->
      @if (!guestGalleryEnabled) {
        <el-gallery-disabled-state></el-gallery-disabled-state>
      }

      <!-- Galería Habilitada -->
      @if (guestGalleryEnabled) {
        <!-- Loading Inicial -->
        @if (isLoadingInitial()) {
          <div class="gallery-loading" aria-live="polite">
            <div class="spinner" aria-hidden="true"></div>
            <p class="loading-label">Cargando recuerdos...</p>
          </div>
        }

        <!-- Error Inicial con Retry -->
        @if (initialError() && !isLoadingInitial()) {
          <div class="gallery-error-banner" role="alert">
            <p class="error-text">{{ initialError() }}</p>
            <button type="button" class="retry-btn" (click)="loadInitial()">
              Reintentar
            </button>
          </div>
        }

        <!-- Escenario 2: Galería Vacía (claramente distinguible) -->
        @if (!isLoadingInitial() && !initialError() && items().length === 0) {
          <el-gallery-empty-state></el-gallery-empty-state>
        }

        <!-- Escenario 1: Grid de Recuerdos -->
        @if (items().length > 0) {
          <div class="gallery-grid" role="region" aria-label="Recuerdos publicados">
            @for (item of items(); track item.mediaId) {
              <el-gallery-media-card
                [media]="item"
                [thumbnailUrl]="item.thumbnailUrl || (thumbnailGrants().get(item.mediaId)?.downloadUrl)"
                (openViewer)="onOpenViewer($event)"
              ></el-gallery-media-card>
            }
          </div>
        }

        <!-- Escenario 3: Paginación y Carga Incremental -->
        @if (hasMore() && items().length > 0) {
          <div class="pagination-area">
            <!-- Botón de carga incremental -->
            @if (!isLoadingMore() && !incrementalError()) {
              <button
                type="button"
                class="load-more-btn"
                (click)="loadMore()"
                aria-label="Cargar más recuerdos"
              >
                Cargar más recuerdos
              </button>
            }

            <!-- Spinner durante carga incremental -->
            @if (isLoadingMore()) {
              <div class="incremental-loading" aria-live="polite">
                <div class="mini-spinner" aria-hidden="true"></div>
                <span>Cargando más recuerdos...</span>
              </div>
            }

            <!-- Escenario 3: Error incremental que conserva items previos y permite retry accesible -->
            @if (incrementalError()) {
              <div class="incremental-error" role="alert">
                <p class="error-msg">{{ incrementalError() }}</p>
                <button
                  type="button"
                  class="incremental-retry-btn"
                  (click)="loadMore()"
                  aria-label="Reintentar cargar más recuerdos"
                >
                  Reintentar carga
                </button>
              </div>
            }
          </div>
        }
      }

      <!-- Escenario 1 & 4: Visor Modal de Recuerdos -->
      @if (activeViewerItem()) {
        <el-gallery-viewer
          [item]="activeViewerItem()!"
          [currentIndex]="currentViewerIndex()"
          [totalCount]="items().length"
          [hasPrevious]="currentViewerIndex() > 0"
          [hasNext]="currentViewerIndex() < items().length - 1"
          [viewGrant]="activeGrant()"
          [isLoadingGrant]="isLoadingGrant()"
          [grantError]="grantError()"
          (close)="onCloseViewer()"
          (previous)="onViewerPrevious()"
          (next)="onViewerNext()"
          (report)="onReportTriggered($event)"
          (retryGrant)="retryCurrentGrant()"
        ></el-gallery-viewer>
      }

      <!-- Diálogo de Reporte de Contenido (EL-TK-121 / DEC-088) -->
      @if (reportingMediaId()) {
        <el-report-content-dialog
          [isOpen]="reportingMediaId() !== null"
          [mediaId]="reportingMediaId()!"
          [eventId]="eventId"
          (close)="onCloseReportDialog()"
        ></el-report-content-dialog>
      }
    </section>
  `,
  styles: [`
    .gallery-root {
      width: 100%;
      margin: 1.5rem 0;
      font-family: inherit;
    }
    .gallery-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      padding: 3rem 1rem;
      color: #64748b;
    }
    .loading-label {
      font-size: 0.9375rem;
      margin: 0;
    }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid #e2e8f0;
      border-top-color: #0284c7;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    .mini-spinner {
      width: 20px;
      height: 20px;
      border: 2px solid #cbd5e1;
      border-top-color: #0284c7;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .gallery-error-banner {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      padding: 2rem 1rem;
      background: #fef2f2;
      border: 1px solid #fee2e2;
      border-radius: 0.75rem;
      color: #991b1b;
      text-align: center;
    }
    .error-text {
      margin: 0;
      font-size: 0.9375rem;
    }
    .retry-btn {
      padding: 0.5rem 1.25rem;
      background: #dc2626;
      color: #ffffff;
      border: none;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      min-height: 44px;
      min-width: 44px;
    }
    /* Mobile-first: 2 columnas adaptativo a 3-4 en tablet/desktop */
    .gallery-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
    }
    @media (min-width: 640px) {
      .gallery-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 1rem;
      }
    }
    @media (min-width: 1024px) {
      .gallery-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 1.25rem;
      }
    }
    .pagination-area {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-top: 1.5rem;
    }
    .load-more-btn {
      padding: 0.625rem 1.5rem;
      background: #0284c7;
      color: #ffffff;
      border: none;
      border-radius: 0.5rem;
      font-size: 0.9375rem;
      font-weight: 600;
      cursor: pointer;
      min-height: 44px;
      min-width: 44px;
      transition: background 0.15s ease;
    }
    .load-more-btn:hover {
      background: #0369a1;
    }
    .load-more-btn:focus-visible {
      outline: 2px solid #0284c7;
      outline-offset: 2px;
    }
    .incremental-loading {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: #64748b;
    }
    .incremental-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 1rem;
      background: #fef2f2;
      border: 1px solid #fee2e2;
      border-radius: 0.5rem;
      color: #991b1b;
      text-align: center;
    }
    .error-msg {
      margin: 0;
      font-size: 0.875rem;
    }
    .incremental-retry-btn {
      padding: 0.375rem 1rem;
      background: #ffffff;
      color: #dc2626;
      border: 1px solid #fca5a5;
      border-radius: 0.375rem;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
      min-height: 44px;
      min-width: 44px;
    }
  `]
})
export class GalleryComponent implements OnInit {
  @Input({ required: true }) eventId!: string;
  @Input() guestGalleryEnabled: boolean = true;
  @Input() guestSessionToken?: string;
  @Input() publicLookupKey?: string;

  readonly items = signal<GalleryMediaItem[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly hasMore = signal<boolean>(false);

  readonly isLoadingInitial = signal<boolean>(false);
  readonly initialError = signal<string | null>(null);

  readonly isLoadingMore = signal<boolean>(false);
  readonly incrementalError = signal<string | null>(null);

  readonly activeViewerItem = signal<GalleryMediaItem | null>(null);
  readonly activeGrant = signal<MediaViewGrant | null>(null);
  readonly isLoadingGrant = signal<boolean>(false);
  readonly grantError = signal<string | null>(null);

  // Cached grants for thumbnails
  readonly thumbnailGrants = signal<Map<string, MediaViewGrant>>(new Map());

  // Diálogo de reporte (EL-TK-121)
  readonly reportingMediaId = signal<string | null>(null);

  // Focus tracking for returning focus upon viewer close
  private lastTriggeringCardId: string | null = null;

  readonly currentViewerIndex = computed(() => {
    const active = this.activeViewerItem();
    if (!active) return -1;
    return this.items().findIndex((it) => it.mediaId === active.mediaId);
  });

  constructor(private readonly galleryService: GalleryService) {}

  ngOnInit(): void {
    if (this.guestGalleryEnabled && this.eventId) {
      this.loadInitial();
    }
  }

  public async loadInitial(): Promise<void> {
    if (!this.guestGalleryEnabled || !this.eventId) return;

    this.isLoadingInitial.set(true);
    this.initialError.set(null);

    try {
      const snapshot = await this.galleryService.getGallerySnapshot({
        eventId: this.eventId,
        guestSessionToken: this.guestSessionToken,
        publicLookupKey: this.publicLookupKey
      });

      this.items.set([...snapshot.items]);
      this.nextCursor.set(snapshot.nextCursor ?? null);
      this.hasMore.set(snapshot.hasMore);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al cargar recuerdos';
      this.initialError.set(
        msg === 'GALLERY_DISABLED'
          ? 'La galería ha sido deshabilitada en este evento.'
          : 'No se pudieron cargar los recuerdos. Por favor, reintenta.'
      );
    } finally {
      this.isLoadingInitial.set(false);
    }
  }

  /**
   * Escenario 3: Carga incremental.
   * Si ocurre un fallo de red, conserva los resultados previos intactos y muestra un retry accesible.
   */
  public async loadMore(): Promise<void> {
    const cursor = this.nextCursor();
    if (!cursor || this.isLoadingMore()) return;

    this.isLoadingMore.set(true);
    this.incrementalError.set(null);

    try {
      const snapshot = await this.galleryService.getGallerySnapshot({
        eventId: this.eventId,
        cursor,
        guestSessionToken: this.guestSessionToken,
        publicLookupKey: this.publicLookupKey
      });

      // Append items preserving previous items
      this.items.set([...this.items(), ...snapshot.items]);
      this.nextCursor.set(snapshot.nextCursor ?? null);
      this.hasMore.set(snapshot.hasMore);
    } catch {
      // PRESERVE items; only set incremental error
      this.incrementalError.set('Ocurrió un error al cargar el siguiente bloque de recuerdos.');
    } finally {
      this.isLoadingMore.set(false);
    }
  }

  public onOpenViewer(item: GalleryMediaItem): void {
    this.lastTriggeringCardId = `media-card-${item.mediaId}`;
    this.activeViewerItem.set(item);
    this.fetchViewGrant(item);
  }

  public onCloseViewer(): void {
    this.activeViewerItem.set(null);
    this.activeGrant.set(null);
    this.grantError.set(null);

    // Return focus to triggering card button
    if (this.lastTriggeringCardId) {
      setTimeout(() => {
        const el = document.getElementById(this.lastTriggeringCardId!);
        if (el) {
          el.focus();
        }
      }, 0);
    }
  }

  public onReportTriggered(event: { eventId: string; mediaId: string }): void {
    this.reportingMediaId.set(event.mediaId);
  }

  public onCloseReportDialog(): void {
    this.reportingMediaId.set(null);
  }

  public onViewerPrevious(): void {
    const idx = this.currentViewerIndex();
    if (idx > 0) {
      const prevItem = this.items()[idx - 1]!;
      this.activeViewerItem.set(prevItem);
      this.fetchViewGrant(prevItem);
    }
  }

  public onViewerNext(): void {
    const idx = this.currentViewerIndex();
    if (idx >= 0 && idx < this.items().length - 1) {
      const nextItem = this.items()[idx + 1]!;
      this.activeViewerItem.set(nextItem);
      this.fetchViewGrant(nextItem);
    }
  }

  public retryCurrentGrant(): void {
    const active = this.activeViewerItem();
    if (active) {
      this.fetchViewGrant(active);
    }
  }

  private async fetchViewGrant(item: GalleryMediaItem): Promise<void> {
    this.isLoadingGrant.set(true);
    this.grantError.set(null);
    this.activeGrant.set(null);

    const role = item.mediaType === 'VIDEO' ? 'PLAYBACK' : 'PREVIEW';

    try {
      const grant = await this.galleryService.requestViewGrant({
        eventId: this.eventId,
        mediaId: item.mediaId,
        role,
        guestSessionToken: this.guestSessionToken,
        publicLookupKey: this.publicLookupKey
      });

      this.activeGrant.set(grant);
    } catch (err) {
      // Escenario 4: Media retirada o acceso revocado mientras el viewer está abierto
      const code = err instanceof Error ? err.message : 'UNAVAILABLE';
      this.grantError.set(code);
    } finally {
      this.isLoadingGrant.set(false);
    }
  }
}
