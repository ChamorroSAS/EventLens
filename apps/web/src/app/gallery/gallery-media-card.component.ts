import { Component, Input, Output, EventEmitter } from '@angular/core';
import type { GalleryMediaItem } from './gallery.types.js';

@Component({
  selector: 'el-gallery-media-card',
  standalone: true,
  template: `
    <button
      type="button"
      [id]="'media-card-' + media.mediaId"
      class="media-card-btn"
      (click)="onClick()"
      [attr.aria-label]="getAriaLabel()"
    >
      <div class="thumbnail-wrapper">
        @if (thumbnailUrl) {
          <img
            [src]="thumbnailUrl"
            [alt]="getAriaLabel()"
            class="card-img"
            loading="lazy"
          />
        } @else {
          <div class="card-placeholder" aria-hidden="true">
            @if (media.mediaType === 'PHOTO') {
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.75">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
            }
            @if (media.mediaType === 'VIDEO') {
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.75">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            }
          </div>
        }

        <!-- Video badge with duration -->
        @if (media.mediaType === 'VIDEO') {
          <div class="video-badge" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            @if (media.durationSeconds) {
              <span>{{ formatDuration(media.durationSeconds) }}</span>
            }
          </div>
        }

        <!-- Contributor nickname chip -->
        @if (media.contributorNickname) {
          <div class="contributor-chip" aria-hidden="true">
            {{ media.contributorNickname }}
          </div>
        }
      </div>
    </button>
  `,
  styles: [`
    .media-card-btn {
      display: block;
      width: 100%;
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;
      border-radius: 0.75rem;
      overflow: hidden;
      outline: none;
      min-height: 44px;
      min-width: 44px;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .media-card-btn:focus-visible {
      box-shadow: 0 0 0 3px #0284c7, 0 4px 12px rgba(2, 132, 199, 0.3);
      transform: scale(1.02);
    }
    .media-card-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }
    .thumbnail-wrapper {
      position: relative;
      aspect-ratio: 1 / 1;
      width: 100%;
      background: #e2e8f0;
      border-radius: 0.75rem;
      overflow: hidden;
    }
    .card-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .card-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #94a3b8;
      background: #f1f5f9;
    }
    .video-badge {
      position: absolute;
      bottom: 0.5rem;
      right: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.25rem;
      background: rgba(15, 23, 42, 0.75);
      color: #ffffff;
      padding: 0.2rem 0.45rem;
      border-radius: 9999px;
      font-size: 0.7rem;
      font-weight: 600;
      backdrop-filter: blur(4px);
    }
    .contributor-chip {
      position: absolute;
      top: 0.5rem;
      left: 0.5rem;
      background: rgba(15, 23, 42, 0.65);
      color: #f8fafc;
      padding: 0.15rem 0.45rem;
      border-radius: 0.375rem;
      font-size: 0.7rem;
      font-weight: 500;
      max-width: 80%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      backdrop-filter: blur(4px);
    }
  `]
})
export class GalleryMediaCardComponent {
  @Input({ required: true }) media!: GalleryMediaItem;
  @Input() thumbnailUrl?: string;
  @Output() openViewer = new EventEmitter<GalleryMediaItem>();

  public onClick(): void {
    this.openViewer.emit(this.media);
  }

  public getAriaLabel(): string {
    const typeLabel = this.media.mediaType === 'VIDEO' ? 'Video' : 'Foto';
    const author = this.media.contributorNickname ? ` de ${this.media.contributorNickname}` : '';
    return `${typeLabel}${author}. Abrir en visor`;
  }

  public formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
