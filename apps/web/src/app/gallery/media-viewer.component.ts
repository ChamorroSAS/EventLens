import { Component, Input, Output, EventEmitter } from '@angular/core';
import type { GalleryMediaItem, MediaViewGrant } from './gallery.types.js';
import { ImagePlayerComponent } from './image-player.component.js';
import { VideoPlayerComponent } from './video-player.component.js';

@Component({
  selector: 'el-media-viewer',
  standalone: true,
  imports: [ImagePlayerComponent, VideoPlayerComponent],
  template: `
    <div class="media-viewer-root">
      @if (isLoading) {
        <div class="loading-state" aria-live="polite">
          <div class="spinner" aria-hidden="true"></div>
          <p class="loading-text">Cargando contenido...</p>
        </div>
      }

      @if (errorMessage && !isLoading) {
        <div class="error-state" role="alert">
          <p class="error-title">{{ errorMessage }}</p>
          <button type="button" class="retry-action-btn" (click)="retry.emit()">
            Reintentar autorización
          </button>
        </div>
      }

      @if (!isLoading && !errorMessage && viewGrant) {
        @if (item.mediaType === 'PHOTO') {
          <el-image-player
            [src]="viewGrant.downloadUrl"
            [alt]="getAltText()"
            (retry)="retry.emit()"
          ></el-image-player>
        }

        @if (item.mediaType === 'VIDEO') {
          <el-video-player
            [src]="viewGrant.downloadUrl"
            [poster]="item.thumbnailUrl"
            [durationSeconds]="item.durationSeconds"
            (retry)="retry.emit()"
          ></el-video-player>
        }
      }
    </div>
  `,
  styles: [`
    .media-viewer-root {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 280px;
    }
    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      color: #94a3b8;
    }
    .loading-text {
      margin: 0;
      font-size: 0.9375rem;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(255, 255, 255, 0.2);
      border-top-color: #38bdf8;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      padding: 2rem;
      text-align: center;
      max-width: 400px;
    }
    .error-title {
      margin: 0;
      color: #fca5a5;
      font-size: 1rem;
      font-weight: 500;
      line-height: 1.5;
    }
    .retry-action-btn {
      padding: 0.625rem 1.25rem;
      background: #0284c7;
      color: #ffffff;
      border: none;
      border-radius: 0.5rem;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      min-height: 44px;
      min-width: 44px;
    }
  `]
})
export class MediaViewerComponent {
  @Input({ required: true }) item!: GalleryMediaItem;
  @Input() viewGrant?: MediaViewGrant | null;
  @Input() isLoading: boolean = false;
  @Input() errorMessage?: string | null;
  @Output() retry = new EventEmitter<void>();

  public getAltText(): string {
    const author = this.item.contributorNickname ? ` de ${this.item.contributorNickname}` : '';
    return `Recuerdo${author}`;
  }
}
