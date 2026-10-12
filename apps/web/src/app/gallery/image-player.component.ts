import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'el-image-player',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="image-player-container">
      <div *ngIf="isLoading()" class="player-loading" aria-live="polite">
        <div class="spinner" aria-hidden="true"></div>
        <span class="sr-only">Cargando imagen...</span>
      </div>

      <div *ngIf="hasError()" class="player-error" role="alert">
        <p class="error-msg">No se pudo cargar la imagen.</p>
        <button type="button" class="retry-btn" (click)="onRetry()">
          Reintentar
        </button>
      </div>

      <img
        *ngIf="!hasError()"
        [src]="src"
        [alt]="alt"
        class="player-img"
        [ngClass]="{ 'img-visible': !isLoading() }"
        (load)="onImageLoaded()"
        (error)="onImageError()"
      />
    </div>
  `,
  styles: [`
    .image-player-container {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000000;
      min-height: 240px;
    }
    .player-img {
      max-width: 100%;
      max-height: 80vh;
      object-fit: contain;
      display: block;
      opacity: 0;
      transition: opacity 0.2s ease-in;
    }
    .img-visible {
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
export class ImagePlayerComponent {
  @Input({ required: true }) src!: string;
  @Input() alt: string = 'Recuerdo fotográfico';
  @Output() retry = new EventEmitter<void>();

  readonly isLoading = signal<boolean>(true);
  readonly hasError = signal<boolean>(false);

  public onImageLoaded(): void {
    this.isLoading.set(false);
    this.hasError.set(false);
  }

  public onImageError(): void {
    this.isLoading.set(false);
    this.hasError.set(true);
  }

  public onRetry(): void {
    this.isLoading.set(true);
    this.hasError.set(false);
    this.retry.emit();
  }
}
