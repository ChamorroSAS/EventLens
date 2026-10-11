import { Component, Input } from '@angular/core';
import type { MediaCardModel } from './media.types.js';

@Component({
  selector: 'eventlens-quarantined-media-state',
  standalone: true,
  template: `
    <article class="quarantined-container" aria-labelledby="quarantine-heading">
      <header class="quarantine-header">
        <h3 id="quarantine-heading" class="quarantine-title">Contenido en cuarentena preventiva</h3>
        <span class="quarantine-badge" role="status">Aislado</span>
      </header>

      <p class="quarantine-explanation">
        Este archivo fue aislado de manera preventiva tras la inspección de seguridad automatizada.
        Por políticas de protección del evento y privacidad, no está disponible para visualización pública,
        generación de derivados ni descarga directa.
      </p>

      <footer class="quarantine-footer">
        <span class="file-ref">Referencia: {{ media.fileName }}</span>
        <span class="immutable-notice">El archivo se conserva aislado e inmutable sin opciones de liberación o reintento por el organizador.</span>
      </footer>
    </article>
  `,
  styles: `
    .quarantined-container {
      padding: 1rem;
      background-color: #fff7ed;
      border: 1px solid #fed7aa;
      border-radius: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
    }
    .quarantine-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .quarantine-title {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 600;
      color: #9a3412;
    }
    .quarantine-badge {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #7c2d12;
      background-color: #ffedd5;
      border: 1px solid #fdba74;
      border-radius: 9999px;
    }
    .quarantine-explanation {
      margin: 0;
      font-size: 0.875rem;
      line-height: 1.4;
      color: #9a3412;
    }
    .quarantine-footer {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      font-size: 0.8125rem;
      color: #78350f;
    }
    .file-ref {
      font-weight: 500;
      word-break: break-all;
    }
    .immutable-notice {
      font-size: 0.75rem;
      font-style: italic;
      color: #9a3412;
    }
  `,
})
export class QuarantinedMediaStateComponent {
  @Input({ required: true }) media!: MediaCardModel;
}
