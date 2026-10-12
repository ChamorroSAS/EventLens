import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'el-gallery-empty-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="empty-state-card" role="status" aria-live="polite">
      <div class="empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.75">
          <rect x="3" y="3" width="18" height="18" rx="3" ry="3"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
      </div>
      <h2 class="empty-title">Aún no hay recuerdos publicados en este evento.</h2>
      <p class="empty-desc">
        Sé el primero en compartir fotos o videos con los demás invitados.
      </p>
    </div>
  `,
  styles: [`
    .empty-state-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 1.5rem;
      text-align: center;
      background: #f8fafc;
      border: 1px dashed #cbd5e1;
      border-radius: 1rem;
      margin: 1.5rem 0;
    }
    .empty-icon {
      color: #0284c7;
      margin-bottom: 1rem;
    }
    .empty-title {
      font-size: 1.125rem;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 0.5rem;
      line-height: 1.4;
    }
    .empty-desc {
      font-size: 0.9375rem;
      color: #475569;
      margin: 0;
      max-width: 380px;
      line-height: 1.5;
    }
  `]
})
export class GalleryEmptyStateComponent {}
