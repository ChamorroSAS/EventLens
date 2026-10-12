import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'el-gallery-disabled-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="disabled-state-card" role="alert" aria-live="polite">
      <div class="disabled-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.75">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
      </div>
      <h2 class="disabled-title">Galería no habilitada</h2>
      <p class="disabled-desc">
        La galería de recuerdos no está habilitada para invitados en este momento.
      </p>
    </div>
  `,
  styles: [`
    .disabled-state-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 1.5rem;
      text-align: center;
      background: #fffbeb;
      border: 1px solid #fef3c7;
      border-radius: 1rem;
      margin: 1.5rem 0;
    }
    .disabled-icon {
      color: #b45309;
      margin-bottom: 1rem;
    }
    .disabled-title {
      font-size: 1.125rem;
      font-weight: 700;
      color: #92400e;
      margin: 0 0 0.5rem;
    }
    .disabled-desc {
      font-size: 0.9375rem;
      color: #78350f;
      margin: 0;
      max-width: 420px;
      line-height: 1.5;
    }
  `]
})
export class GalleryDisabledStateComponent {}
