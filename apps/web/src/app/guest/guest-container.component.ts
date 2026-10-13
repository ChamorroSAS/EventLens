import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GuestService } from './guest.service.js';
import {
  PublicAccessView,
  GuestSessionState,
  GuestContributionView,
  RemovalIntakeView
} from './guest.types.js';
import { PinAccessFormComponent } from './pin-access-form.component.js';
import { ConsentSheetComponent } from './consent-sheet.component.js';
import { GuestIdentityFormComponent } from './guest-identity-form.component.js';
import { MyContributionsListComponent } from './my-contributions-list.component.js';

@Component({
  selector: 'el-guest-container',
  standalone: true,
  imports: [
    CommonModule,
    PinAccessFormComponent,
    ConsentSheetComponent,
    GuestIdentityFormComponent,
    MyContributionsListComponent
  ],
  template: `
    <main class="guest-shell" role="main" aria-labelledby="event-title">
      <header class="event-hero">
        <div class="event-badge-row">
          <span class="status-badge" [ngClass]="'status-' + (accessView?.status?.toLowerCase() || 'draft')">
            {{ getStatusLabel(accessView?.status) }}
          </span>
          @if (accessView?.timezone) {
            <span class="timezone-chip">{{ accessView?.timezone }}</span>
          }
        </div>
        <h1 id="event-title" class="event-title">{{ accessView?.name || 'Cargando evento...' }}</h1>
        @if (accessView?.restrictionReason) {
          <p class="restriction-banner" role="alert">
            {{ accessView?.restrictionReason }}
          </p>
        }
      </header>

      <!-- Escenario 1: PIN requerido cuando aún no hay sesión -->
      @if (needsPinVerification) {
        <section class="step-section">
          <el-pin-access-form
            [submitting]="isSubmittingPin()"
            [errorMessage]="pinErrorMessage()"
            (pinSubmit)="onPinSubmitted($event)"
          ></el-pin-access-form>
        </section>
      }

      <!-- Escenario 2: Consentimiento requerido antes de cargar -->
      @if (showConsentSheet()) {
        <el-consent-sheet
          [documentVersion]="'v1.0'"
          [submitting]="isSubmittingConsent()"
          (consentAccepted)="onConsentAccepted($event)"
          (consentCancelled)="onConsentCancelled()"
        ></el-consent-sheet>
      }

      <!-- Escenario 2: Identidad requerida tras consentimiento -->
      @if (showIdentityForm()) {
        <section class="step-section">
          <el-guest-identity-form
            [submitting]="isSubmittingIdentity()"
            [errorMessage]="identityErrorMessage()"
            (nicknameSaved)="onNicknameSaved($event)"
          ></el-guest-identity-form>
        </section>
      }

      <!-- Escenario 3: Sesión activa y Mis aportes -->
      @if (hasActiveSession && !showIdentityForm()) {
        <section class="active-session-content">
          <div class="guest-bar">
            <span class="welcome-text">
              Participando como <strong>{{ currentSession?.contributorNickname || 'Invitado' }}</strong>
            </span>
            @if (canUpload) {
              <button
                type="button"
                class="upload-trigger-btn"
                (click)="startUploadFlow()"
                aria-label="Cargar fotos o videos"
              >
                Subir recuerdos
              </button>
            }
          </div>

          <el-my-contributions-list
            [contributions]="contributions"
            (requestRemoval)="onRequestRemoval()"
          ></el-my-contributions-list>
        </section>
      }

      <!-- Escenario 4: Modal o aviso de derivación a retiro sin sesión -->
      @if (removalIntakeView()) {
        <div class="removal-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="removal-title">
          <div class="removal-card">
            <h3 id="removal-title" class="removal-title">Solicitud de retiro de recuerdo</h3>
            <p class="removal-disclaimer">{{ removalIntakeView()?.disclaimer }}</p>
            <div class="removal-actions">
              <button type="button" class="close-removal-btn" (click)="closeRemovalModal()">Cerrar</button>
              <a [href]="removalIntakeView()?.intakePath" class="intake-link-btn">Ir al formulario de solicitud</a>
            </div>
          </div>
        </div>
      }
    </main>
  `,
  styles: [`
    .guest-shell {
      max-width: 600px;
      margin: 0 auto;
      padding: 1.5rem 1rem 3rem;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .event-hero {
      margin-bottom: 2rem;
      text-align: center;
    }
    .event-badge-row {
      display: flex;
      justify-content: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }
    .status-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .status-active {
      background: #c6f6d5;
      color: #22543d;
    }
    .status-closed {
      background: #feebc8;
      color: #744210;
    }
    .status-grace_period {
      background: #fed7d7;
      color: #742a2a;
    }
    .status-scheduled {
      background: #e2e8f0;
      color: #2d3748;
    }
    .status-draft {
      background: #edf2f7;
      color: #4a5568;
    }
    .timezone-chip {
      font-size: 0.75rem;
      color: #718096;
      background: #edf2f7;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
    }
    .event-title {
      font-size: 1.75rem;
      font-weight: 800;
      color: #1a202c;
      margin: 0 0 0.5rem 0;
    }
    .restriction-banner {
      background: #fffaf0;
      border: 1px solid #fbd38d;
      color: #744210;
      padding: 0.75rem;
      border-radius: 8px;
      font-size: 0.875rem;
      margin-top: 1rem;
    }
    .step-section {
      margin-bottom: 2rem;
    }
    .active-session-content {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .guest-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #ffffff;
      padding: 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }
    .welcome-text {
      font-size: 0.875rem;
      color: #4a5568;
    }
    .upload-trigger-btn {
      min-height: 44px;
      padding: 0 1rem;
      background: #3182ce;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
    }
    .removal-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      z-index: 1000;
    }
    .removal-card {
      background: #ffffff;
      border-radius: 12px;
      padding: 1.5rem;
      max-width: 480px;
      width: 100%;
    }
    .removal-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: #1a202c;
      margin-bottom: 0.75rem;
    }
    .removal-disclaimer {
      font-size: 0.875rem;
      color: #4a5568;
      line-height: 1.5;
      margin-bottom: 1.5rem;
    }
    .removal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
    }
    .close-removal-btn {
      min-height: 44px;
      padding: 0 1rem;
      background: #edf2f7;
      color: #4a5568;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
    }
    .intake-link-btn {
      min-height: 44px;
      padding: 0 1rem;
      background: #e53e3e;
      color: #ffffff;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
    }
  `]
})
export class GuestContainerComponent implements OnInit {
  @Input() accessView: PublicAccessView | null = null;

  readonly isSubmittingPin = signal(false);
  readonly pinErrorMessage = signal<string | null>(null);

  readonly showConsentSheet = signal(false);
  readonly isSubmittingConsent = signal(false);

  readonly showIdentityForm = signal(false);
  readonly isSubmittingIdentity = signal(false);
  readonly identityErrorMessage = signal<string | null>(null);

  readonly removalIntakeView = signal<RemovalIntakeView | null>(null);

  constructor(public guestService: GuestService) {}

  ngOnInit(): void {
    const session = this.guestService.getSession();
    if (session && !session.hasConsented) {
      this.showConsentSheet.set(true);
    }
  }

  get currentSession(): GuestSessionState | null {
    return this.guestService.getSession();
  }

  get hasActiveSession(): boolean {
    return Boolean(this.currentSession);
  }

  get needsPinVerification(): boolean {
    if (!this.accessView?.pinRequired) return false;
    return !this.hasActiveSession;
  }

  get canUpload(): boolean {
    return Boolean(this.accessView?.canUpload);
  }

  get contributions(): GuestContributionView[] {
    return this.guestService.getContributions();
  }

  getStatusLabel(status?: string): string {
    switch (status) {
      case 'ACTIVE': return 'Abierto';
      case 'CLOSED': return 'Cerrado';
      case 'GRACE_PERIOD': return 'Periodo de gracia';
      case 'SCHEDULED': return 'Próximamente';
      default: return status || 'Borrador';
    }
  }

  onPinSubmitted(pin: string): void {
    this.isSubmittingPin.set(false);
    this.pinErrorMessage.set(null);
    this.guestService.setSession({
      id: 'session-local-1',
      eventId: this.accessView?.eventId || 'event-1',
      token: 'token-' + Date.now(),
      credentialGeneration: this.accessView?.generation || 1,
      contributorNickname: null,
      hasConsented: false,
      consentVersion: null
    });
  }

  startUploadFlow(): void {
    const session = this.guestService.getSession();
    if (!session?.hasConsented) {
      this.showConsentSheet.set(true);
      return;
    }
    if (!session?.contributorNickname) {
      this.showIdentityForm.set(true);
      return;
    }
  }

  onConsentAccepted(version: string): void {
    this.isSubmittingConsent.set(false);
    this.showConsentSheet.set(false);
    this.guestService.recordConsent(version);
    const session = this.guestService.getSession();
    if (!session?.contributorNickname) {
      this.showIdentityForm.set(true);
    }
  }

  onConsentCancelled(): void {
    this.showConsentSheet.set(false);
  }

  onNicknameSaved(nickname: string): void {
    this.isSubmittingIdentity.set(false);
    this.showIdentityForm.set(false);
    this.guestService.setContributorNickname(nickname);
  }

  onRequestRemoval(): void {
    this.removalIntakeView.set({
      eventId: this.accessView?.eventId || 'event-1',
      eventName: this.accessView?.name || 'Evento',
      intakePath: '/removal-request?eventId=' + (this.accessView?.eventId || 'event-1'),
      disclaimer: 'La recepción de esta solicitud no constituye una eliminación automática ni inmediata del contenido. El organizador o administrador del evento revisará la solicitud conforme a las políticas vigentes.',
      requiresSession: false
    });
  }

  closeRemovalModal(): void {
    this.removalIntakeView.set(null);
  }
}
