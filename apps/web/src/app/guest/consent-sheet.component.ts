import { Component, EventEmitter, Input, Output, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'el-consent-sheet',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="consent-viewport"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
      aria-describedby="consent-desc"
    >
      <div class="consent-container" (click)="$event.stopPropagation()">
        <!-- Top bar with Back, Phoeve Logo, and Close -->
        <header class="top-nav-bar">
          <button
            type="button"
            class="nav-icon-btn"
            (click)="cancelConsent()"
            aria-label="Volver"
            [disabled]="submitting"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>

          <div class="nav-logo-box">
            <img
              src="assets/branding/phoeve/logo-primary.png"
              alt="Phoeve"
              class="brand-logo"
            />
          </div>

          <button
            type="button"
            class="nav-icon-btn"
            (click)="cancelConsent()"
            aria-label="Cerrar consentimiento"
            [disabled]="submitting"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>

        <!-- Illustration badge with document & shield + confetti sparkles -->
        <div class="illustration-hero">
          <div class="confetti-decorations" aria-hidden="true">
            <span class="confetti c-yellow-1">✦</span>
            <span class="confetti c-pink-1">★</span>
            <span class="confetti c-blue-1">◆</span>
            <span class="confetti c-yellow-2">●</span>
            <span class="confetti c-pink-2">▲</span>
            <span class="confetti c-blue-2">✦</span>
          </div>

          <div class="badge-document">
            <div class="badge-inner-card">
              <div class="doc-lines">
                <span class="doc-line line-1"></span>
                <span class="doc-line line-2"></span>
                <span class="doc-line line-3"></span>
              </div>
              <div class="shield-check">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
            </div>
          </div>
        </div>

        <h1 id="consent-title" tabindex="-1" class="consent-heading">Comparte tus recuerdos</h1>
        @if (errorMessage) { <p role="alert">{{ errorMessage }}</p> }
        <p id="consent-desc" class="consent-subheading">
          Antes de continuar, por favor acepta las políticas del evento para poder subir tus fotos y videos.
        </p>

        <!-- 3 Policies Checkboxes -->
        <form (submit)="onSubmit($event)" class="consent-form">
          <div class="checkbox-list">
            <label class="custom-checkbox-row">
              <input
                type="checkbox"
                [checked]="acceptedTerms"
                (change)="onToggleTerms($event)"
                class="sr-only"
              />
              <span class="checkbox-box" [class.checked]="acceptedTerms" aria-hidden="true">
                @if (acceptedTerms) {
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                }
              </span>
              <span class="checkbox-label-text">Acepto Términos y Condiciones</span>
            </label>

            <label class="custom-checkbox-row">
              <input
                type="checkbox"
                [checked]="acceptedPrivacy"
                (change)="onTogglePrivacy($event)"
                class="sr-only"
              />
              <span class="checkbox-box" [class.checked]="acceptedPrivacy" aria-hidden="true">
                @if (acceptedPrivacy) {
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                }
              </span>
              <span class="checkbox-label-text">Acepto Política de Privacidad</span>
            </label>

            <label class="custom-checkbox-row">
              <input
                type="checkbox"
                [checked]="acceptedPublishing"
                (change)="onTogglePublishing($event)"
                class="sr-only"
              />
              <span class="checkbox-box" [class.checked]="acceptedPublishing" aria-hidden="true">
                @if (acceptedPublishing) {
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                }
              </span>
              <span class="checkbox-label-text">Acepto Condiciones de publicación</span>
            </label>
          </div>

          <!-- Main CTA Button -->
          <button
            type="submit"
            class="submit-continue-btn"
            [disabled]="!accepted || submitting"
          >
            @if (!submitting) {
              <span>Continuar</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            } @else {
              <span aria-live="assertive">Guardando...</span>
            }
          </button>
        </form>

        <!-- Bottom persistent legal links -->
        <footer class="legal-mini-footer">
          <button type="button" class="legal-link" (click)="openLegalModal('privacy')">Privacidad</button>
          <span class="sep">•</span>
          <button type="button" class="legal-link" (click)="openLegalModal('terms')">Términos</button>
          <span class="sep">•</span>
          <button type="button" class="legal-link" (click)="openLegalModal('publishing')">Condiciones</button>
        </footer>
      </div>

      <!-- Legal Info Dialog if user clicks links -->
      @if (activeLegalModal) {
        <div class="legal-detail-backdrop" (click)="activeLegalModal = null">
          <div class="legal-detail-card" (click)="$event.stopPropagation()">
            <h3 class="legal-detail-title">{{ getLegalTitle(activeLegalModal) }}</h3>
            <div class="legal-detail-body">
              <p>{{ getLegalText(activeLegalModal) }}</p>
            </div>
            <button type="button" class="legal-close-btn" (click)="activeLegalModal = null">
              Entendido
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .consent-viewport {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
      font-family: inherit;
    }
    .consent-container {
      background: #ffffff;
      width: 100%;
      max-width: 420px;
      border-radius: 28px;
      padding: 1.5rem 1.25rem 1.75rem;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.08);
      max-height: 94vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
    }
    @media (max-width: 480px) {
      .consent-viewport {
        padding: 0;
        align-items: flex-end;
      }
      .consent-container {
        border-radius: 28px 28px 0 0;
        max-height: 95vh;
        padding-bottom: 2rem;
      }
    }
    .top-nav-bar {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.25rem;
    }
    .nav-icon-btn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #f1f5f9;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #475569;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .nav-icon-btn:hover {
      background: #e2e8f0;
      color: #0f172a;
    }
    .nav-logo-box {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .brand-logo {
      height: 28px;
      width: auto;
      object-fit: contain;
    }

    /* Hero Illustration */
    .illustration-hero {
      position: relative;
      width: 120px;
      height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0.5rem 0 1rem;
    }
    .confetti-decorations {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .confetti {
      position: absolute;
      font-size: 14px;
      font-weight: 800;
      animation: floatSparkle 3s ease-in-out infinite alternate;
    }
    .c-yellow-1 { top: 0; left: 10px; color: #f59e0b; }
    .c-pink-1 { top: 12px; right: 8px; color: #ec4899; font-size: 16px; }
    .c-blue-1 { bottom: 16px; left: 6px; color: #3b82f6; }
    .c-yellow-2 { bottom: 4px; right: 16px; color: #fbbf24; }
    .c-pink-2 { top: 45%; left: -6px; color: #f43f5e; font-size: 10px; }
    .c-blue-2 { top: 40%; right: -6px; color: #6366f1; }
    @keyframes floatSparkle {
      0% { transform: scale(0.9) rotate(0deg); opacity: 0.7; }
      100% { transform: scale(1.15) rotate(15deg); opacity: 1; }
    }
    .badge-document {
      position: relative;
      width: 84px;
      height: 98px;
      background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
      border: 3px solid #cbd5e1;
      border-radius: 16px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .badge-inner-card {
      width: 100%;
      height: 100%;
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-top: 14px;
    }
    .doc-lines {
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 50%;
    }
    .doc-line {
      height: 4px;
      background: #94a3b8;
      border-radius: 9999px;
    }
    .line-1 { width: 100%; }
    .line-2 { width: 75%; }
    .line-3 { width: 60%; }
    .shield-check {
      position: absolute;
      bottom: -10px;
      right: -10px;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: linear-gradient(135deg, #e11d74 0%, #d946ef 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 6px 14px rgba(225, 29, 116, 0.4);
      border: 3px solid #ffffff;
    }

    /* Headings */
    .consent-heading {
      font-size: 1.45rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0.25rem 0 0.5rem;
      text-align: center;
      letter-spacing: -0.02em;
    }
    .consent-subheading {
      font-size: 0.875rem;
      color: #64748b;
      line-height: 1.5;
      text-align: center;
      margin: 0 0 1.5rem;
      padding: 0 0.5rem;
    }

    /* Form & Checkboxes */
    .consent-form {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .checkbox-list {
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 1rem 1.125rem;
    }
    .custom-checkbox-row {
      display: flex;
      align-items: center;
      gap: 0.875rem;
      cursor: pointer;
      user-select: none;
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
    .checkbox-box {
      width: 24px;
      height: 24px;
      min-width: 24px;
      border-radius: 6px;
      border: 2px solid #cbd5e1;
      background: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }
    .checkbox-box.checked {
      background: linear-gradient(135deg, #e11d74 0%, #ec4899 100%);
      border-color: #e11d74;
      box-shadow: 0 2px 8px rgba(225, 29, 116, 0.35);
    }
    .checkbox-label-text {
      font-size: 0.9rem;
      font-weight: 600;
      color: #1e293b;
    }

    /* Primary Action */
    .submit-continue-btn {
      width: 100%;
      min-height: 52px;
      border-radius: 14px;
      background: linear-gradient(135deg, #e11d74 0%, #ec4899 100%);
      border: none;
      color: #ffffff;
      font-size: 1rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      cursor: pointer;
      box-shadow: 0 8px 20px rgba(225, 29, 116, 0.35);
      transition: all 0.2s ease;
    }
    .submit-continue-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 10px 24px rgba(225, 29, 116, 0.45);
    }
    .submit-continue-btn:active:not(:disabled) {
      transform: translateY(0);
    }
    .submit-continue-btn:disabled {
      background: #cbd5e1;
      box-shadow: none;
      cursor: not-allowed;
      color: #64748b;
    }

    /* Mini Legal Links */
    .legal-mini-footer {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      margin-top: 1.25rem;
      font-size: 0.8125rem;
      color: #6366f1;
    }
    .legal-link {
      background: none;
      border: none;
      color: #4f46e5;
      font-size: 0.8125rem;
      font-weight: 500;
      text-decoration: underline;
      cursor: pointer;
      padding: 0.25rem;
    }
    .sep {
      color: #94a3b8;
    }

    /* Detail Modal */
    .legal-detail-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      z-index: 1100;
    }
    .legal-detail-card {
      background: #ffffff;
      border-radius: 20px;
      padding: 1.5rem;
      max-width: 400px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
    }
    .legal-detail-title {
      font-size: 1.15rem;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 0.75rem;
    }
    .legal-detail-body {
      font-size: 0.875rem;
      color: #475569;
      line-height: 1.6;
      margin-bottom: 1.25rem;
    }
    .legal-close-btn {
      width: 100%;
      min-height: 44px;
      border-radius: 10px;
      background: #0f172a;
      color: #ffffff;
      border: none;
      font-weight: 600;
      cursor: pointer;
    }
  `]
})
export class ConsentSheetComponent {
  @Input() documentVersion = 'v1.0';
  @Input() submitting = false;
  @Input() eventName = 'Evento';
  @Input() errorMessage: string | null = null;
  @Output() consentAccepted = new EventEmitter<string>();
  @Output() consentCancelled = new EventEmitter<void>();

  acceptedTerms = false;
  acceptedPrivacy = false;
  acceptedPublishing = false;

  activeLegalModal: 'privacy' | 'terms' | 'publishing' | null = null;

  get accepted(): boolean {
    return this.acceptedTerms && this.acceptedPrivacy && this.acceptedPublishing;
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    if (this.activeLegalModal) {
      this.activeLegalModal = null;
      return;
    }
    if (!this.submitting) {
      this.cancelConsent();
    }
  }

  onToggleTerms(event: Event): void {
    this.acceptedTerms = (event.target as HTMLInputElement).checked;
  }

  onTogglePrivacy(event: Event): void {
    this.acceptedPrivacy = (event.target as HTMLInputElement).checked;
  }

  onTogglePublishing(event: Event): void {
    this.acceptedPublishing = (event.target as HTMLInputElement).checked;
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

  openLegalModal(type: 'privacy' | 'terms' | 'publishing'): void {
    this.activeLegalModal = type;
  }

  getLegalTitle(type: 'privacy' | 'terms' | 'publishing'): string {
    switch (type) {
      case 'terms': return 'Términos y Condiciones';
      case 'privacy': return 'Política de Privacidad';
      case 'publishing': return 'Condiciones de publicación';
    }
  }

  getLegalText(type: 'privacy' | 'terms' | 'publishing'): string {
    switch (type) {
      case 'terms':
        return `Conservas la propiedad de tus archivos originales. Al compartirlos en ${this.eventName}, otorgas una licencia limitada para su visualización privada por parte de los asistentes e invitados del evento.`;
      case 'privacy':
        return 'Tus recuerdos no serán utilizados para publicidad, venta a terceros ni entrenamiento de inteligencia artificial. Tu información se procesa bajo estándares estrictos de confidencialidad.';
      case 'publishing':
        return 'Solo se permite contenido respetuoso y propio del evento. El organizador se reserva la facultad de moderar o remover contenido que infrinja la privacidad o integridad de los invitados.';
    }
  }
}
