import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { EventModerationMode } from './media.types.js';

@Component({
  selector: 'eventlens-moderation-settings',
  standalone: true,
  template: `
    <div class="moderation-settings-panel" role="region" aria-label="Ajustes de moderación del evento">
      <div class="settings-header">
        <span class="settings-icon" aria-hidden="true">🛡️</span>
        <div class="settings-title-group">
          <h3 class="settings-title">Modo de moderación del evento</h3>
          <p class="settings-subtitle">
            Controla si las fotos y videos cargados se publican automáticamente o requieren tu aprobación previa.
          </p>
        </div>
      </div>

      <div class="settings-controls" role="radiogroup" aria-label="Seleccionar modo de moderación">
        <label
          class="mode-option"
          [class.selected]="moderationMode === 'AUTO_PUBLISH'"
          [class.disabled]="disabled || !canChange"
        >
          <input
            type="radio"
            name="moderationModeRadio"
            value="AUTO_PUBLISH"
            [checked]="moderationMode === 'AUTO_PUBLISH'"
            [disabled]="disabled || !canChange"
            (change)="onSelectMode('AUTO_PUBLISH')"
          />
          <div class="option-content">
            <span class="option-name">Publicación automática</span>
            <span class="option-desc">
              Las fotos y videos aprobados por el análisis de seguridad se publican directamente en la galería.
            </span>
          </div>
        </label>

        <label
          class="mode-option"
          [class.selected]="moderationMode === 'ORGANIZER_REVIEW'"
          [class.disabled]="disabled || !canChange"
        >
          <input
            type="radio"
            name="moderationModeRadio"
            value="ORGANIZER_REVIEW"
            [checked]="moderationMode === 'ORGANIZER_REVIEW'"
            [disabled]="disabled || !canChange"
            (change)="onSelectMode('ORGANIZER_REVIEW')"
          />
          <div class="option-content">
            <span class="option-name">Revisión previa del organizador</span>
            <span class="option-desc">
              Los archivos quedan en estado «Pendiente» hasta que decidas aprobarlos o rechazarlos individualmente.
            </span>
          </div>
        </label>
      </div>

      <p class="settings-note">
        ℹ️ El cambio de modo rige para las cargas futuras. No reescribe ni altera el estado de las fotos ya existentes en el evento.
      </p>
    </div>
  `,
  styles: `
    .moderation-settings-panel {
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 0.5rem;
      padding: 1rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
    }
    .settings-header {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
    }
    .settings-icon {
      font-size: 1.5rem;
      flex-shrink: 0;
    }
    .settings-title-group {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }
    .settings-title {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 700;
      color: #0f172a;
    }
    .settings-subtitle {
      margin: 0;
      font-size: 0.8125rem;
      color: #64748b;
    }
    .settings-controls {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 0.75rem;
    }
    .mode-option {
      display: flex;
      align-items: flex-start;
      gap: 0.625rem;
      padding: 0.75rem 1rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.5rem;
      cursor: pointer;
      background-color: #f8fafc;
      transition: border-color 0.15s ease, background-color 0.15s ease;
    }
    .mode-option:hover:not(.disabled) {
      border-color: #94a3b8;
      background-color: #f1f5f9;
    }
    .mode-option.selected {
      border-color: #2563eb;
      background-color: #eff6ff;
    }
    .mode-option.disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .mode-option input[type="radio"] {
      margin-top: 0.1875rem;
      cursor: inherit;
    }
    .option-content {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .option-name {
      font-size: 0.875rem;
      font-weight: 600;
      color: #0f172a;
    }
    .option-desc {
      font-size: 0.75rem;
      color: #475569;
      line-height: 1.35;
    }
    .settings-note {
      margin: 0;
      font-size: 0.75rem;
      color: #64748b;
    }
  `,
})
export class ModerationSettingsComponent {
  @Input() eventRef = '';
  @Input() moderationMode: EventModerationMode = 'AUTO_PUBLISH';
  @Input() canChange = true;
  @Input() disabled = false;

  @Output() modeChanged = new EventEmitter<EventModerationMode>();

  onSelectMode(mode: EventModerationMode): void {
    if (!this.disabled && this.canChange && mode !== this.moderationMode) {
      this.modeChanged.emit(mode);
    }
  }
}
