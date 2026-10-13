import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'el-video-player',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="video-player-container">
      @if (isLoading()) {
        <div class="player-loading" aria-live="polite">
          <div class="spinner" aria-hidden="true"></div>
          <span class="sr-only">Cargando video...</span>
        </div>
      }

      @if (hasError()) {
        <div class="player-error" role="alert">
          <p class="error-msg">No se pudo reproducir el video.</p>
          <button type="button" class="retry-btn" (click)="onRetry()">
            Reintentar
          </button>
        </div>
      }

      <!-- NO autoplay por accesibilidad WCAG 2.2 AA y DEC rules -->
      @if (!hasError()) {
        <video
          [src]="src"
          [poster]="poster"
          controls
          playsinline
          preload="metadata"
          class="player-video"
          [ngClass]="{ 'video-visible': !isLoading() }"
          (loadeddata)="onVideoLoaded()"
          (error)="onVideoError()"
        >
          <p>Tu navegador no soporta reproducción de video HTML5.</p>
        </video>
      }
    </div>
  `,
  styles: [`
    .video-player-container {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000000;
      min-height: 240px;
    }
    .player-video {
      max-width: 100%;
      max-height: 80vh;
      display: block;
      opacity: 0;
      transition: opacity 0.2s ease-in;
    }
    .video-visible {
      opacity: 1;
    }
    .player-loading {
      position: absolute;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid rgba(255, 255, 255, 0.2);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .player-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      color: #fca5a5;
      padding: 1.5rem;
      text-align: center;
    }
    .error-msg {
      margin: 0;
      font-size: 0.9375rem;
    }
    .retry-btn {
      padding: 0.5rem 1.25rem;
      background: #ffffff;
      color: #0f172a;
      border: none;
      border-radius: 0.5rem;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      min-height: 44px;
      min-width: 44px;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      border: 0;
    }
  `]
})
export class VideoPlayerComponent {
  @Input({ required: true }) src!: string;
  @Input() poster?: string;
  @Input() durationSeconds?: number | null;
  @Output() retry = new EventEmitter<void>();

  readonly isLoading = signal<boolean>(true);
  readonly hasError = signal<boolean>(false);

  public onVideoLoaded(): void {
    this.isLoading.set(false);
    this.hasError.set(false);
  }

  public onVideoError(): void {
    this.isLoading.set(false);
    this.hasError.set(true);
  }

  public onRetry(): void {
    this.isLoading.set(true);
    this.hasError.set(false);
    this.retry.emit();
  }
}
