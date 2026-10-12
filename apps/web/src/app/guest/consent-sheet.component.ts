import { Component, EventEmitter, Input, Output, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'el-consent-sheet',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
      aria-describedby="consent-desc"
    >
      <div class="sheet-card" (click)="$event.stopPropagation()">
        <header class="sheet-header">
          <h2 id="consent-title" class="sheet-title">Términos de participación y consentimiento</h2>
          <span class="version-tag">Versión {{ documentVersion }}</span>
        </header>

        <div id="consent-desc" class="sheet-body">
          <p class="legal-summary">
            Antes de compartir tus recuerdos, debes confirmar que eres el titular de las fotos y videos
            que vas a cargar y que otorgas una licencia limitada para su procesamiento y visualización
            privada en este evento. Tus recuerdos no serán utilizados para publicidad ni venta a terceros.
          </p>
          <ul class="legal-points">
            <li>Conservas la propiedad de tus archivos originales.</li>
            <li>El organizador del evento podrá ver y gestionar el contenido compartido.</li>
            <li>Podrás consultar tus propios aportes mientras el evento esté disponible.</li>
          </ul>
        </div>

        <form (submit)="onSubmit($event)" class="consent-form">
          <label class="checkbox-label">
            <input
              type="checkbox"
              [checked]="accepted"
              (change)="onCheckboxChange($event)"
              name="acceptCheckbox"
              class="consent-checkbox"
              required
            />
            <span class="checkbox-text">He leído y acepto los términos de participación y privacidad (versión {{ documentVersion }}).</span>
          </label>

          <div class="actions">
            <button
              type="button"
              class="cancel-button"
              (click)="cancelConsent()"
              [disabled]="submitting"
            >
              Cancelar
            </button>
            <button
              type="submit"
              class="confirm-button"
              [disabled]="!accepted || submitting"
            >
              <span *ngIf="!submitting">Aceptar y continuar</span>
              <span *ngIf="submitting" aria-live="assertive">Guardando...</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: flex-end;
      justify-content: center;
      z-index: 1000;
    }
    @media (min-width: 640px) {
      .backdrop {
        align-items: center;
      }
    }
    .sheet-card {
      background: #ffffff;
      width: 100%;
      max-width: 500px;
      border-radius: 16px 16px 0 0;
      padding: 1.5rem;
      box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.15);
      max-height: 90vh;
      overflow-y: auto;
    }
    @media (min-width: 640px) {
      .sheet-card {
        border-radius: 16px;
      }
    }
    .sheet-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 0.75rem;
    }
    .sheet-title {
      font-size: 1.125rem;
      font-weight: 700;
      color: #1a202c;
      margin: 0;
    }
    .version-tag {
      font-size: 0.75rem;
      background: #edf2f7;
      color: #4a5568;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-weight: 600;
    }
    .sheet-body {
      color: #4a5568;
      font-size: 0.875rem;
      line-height: 1.5;
      margin-bottom: 1.25rem;
    }
    .legal-summary {
      margin-bottom: 0.75rem;
    }
    .legal-points {
      padding-left: 1.25rem;
      margin: 0;
    }
    .legal-points li {
      margin-bottom: 0.25rem;
    }
    .checkbox-label {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
      cursor: pointer;
    }
    .consent-checkbox {
      width: 22px;
      height: 22px;
      min-width: 22px;
      cursor: pointer;
      accent-color: #3182ce;
      margin-top: 2px;
    }
    .checkbox-text {
      font-size: 0.875rem;
      color: #2d3748;
      font-weight: 500;
    }
    .actions {
      display: flex;
      gap: 0.75rem;
      justify-content: flex-end;
    }
    .cancel-button {
      min-height: 44px;
      padding: 0 1rem;
      background: transparent;
      border: 1px solid #cbd5e0;
      color: #4a5568;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
    }
    .confirm-button {
      min-height: 44px;
      padding: 0 1.25rem;
      background: #3182ce;
      border: none;
      color: #ffffff;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
    }
    .confirm-button:disabled {
      background: #a0aec0;
      cursor: not-allowed;
    }
  `]
})
export class ConsentSheetComponent {
  @Input() documentVersion = 'v1.0';
  @Input() submitting = false;
  @Output() consentAccepted = new EventEmitter<string>();
  @Output() consentCancelled = new EventEmitter<void>();

  accepted = false;

  @HostListener('keydown.escape')
  onEscape(): void {
    if (!this.submitting) {
      this.cancelConsent();
    }
  }

  onCheckboxChange(event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    this.accepted = checkbox.checked;
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    if (this.accepted && !this.submitting) {
      this.consentAccepted.emit(this.documentVersion);
    }
  }

  cancelConsent(): void {
    this.consentCancelled.emit();
  }
}
