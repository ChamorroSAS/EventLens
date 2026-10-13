import { Component, Input, OnInit, inject, signal } from '@angular/core';
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
import { RemovalRequestFlowComponent } from './removal-request-flow.component.js';
import {
  APPROVED_PUBLIC_ENTRY_PATHS,
  CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA,
  type PublicEntryRouteDescriptor
} from '../navigation/public-entry-routes.contract.js';
import { PublicEntryRouterService } from '../navigation/public-entry-router.service.js';

@Component({
  selector: 'el-guest-container',
  standalone: true,
  imports: [
    CommonModule,
    PinAccessFormComponent,
    ConsentSheetComponent,
    GuestIdentityFormComponent,
    MyContributionsListComponent,
    RemovalRequestFlowComponent
  ],
  template: `
    <main class="guest-shell" role="main" aria-labelledby="event-title">
      @if (isLoadingEntry()) {
        <header class="event-hero" role="status" aria-live="polite">
          <h1 id="event-title" class="event-title">Verificando acceso al evento...</h1>
        </header>
      } @else if (entryErrorMessage()) {
        <section class="unavailable-card" role="alert" aria-labelledby="event-title">
          <h1 id="event-title" class="event-title">Enlace no disponible</h1>
          <p class="unavailable-text">{{ entryErrorMessage() }}</p>
          <div class="unavailable-actions">
            <a
              class="home-link-btn"
              [attr.href]="homePath"
              (click)="onNavigateHome($event)"
            >
              Ir al inicio de EventLens
            </a>
          </div>
        </section>
      } @else {
        <header class="event-hero">
          <div class="event-badge-row">
            <span class="status-badge" [ngClass]="'status-' + (accessView?.status?.toLowerCase() || 'draft')">
              {{ getStatusLabel(accessView?.status) }}
            </span>
            <span *ngIf="accessView?.timezone" class="timezone-chip">{{ accessView?.timezone }}</span>
          </div>
          <h1 id="event-title" class="event-title">{{ accessView?.name || 'Evento' }}</h1>
          <p *ngIf="accessView?.restrictionReason" class="restriction-banner" role="alert">
            {{ accessView?.restrictionReason }}
          </p>
          <p *ngIf="sessionErrorMessage()" class="restriction-banner" role="alert">
            {{ sessionErrorMessage() }}
          </p>
        </header>

        <!-- Escenario 1: PIN requerido cuando aún no hay sesión y el evento es accesible -->
        <section *ngIf="needsPinVerification" class="step-section">
          <el-pin-access-form
            [submitting]="isSubmittingPin()"
            [errorMessage]="pinErrorMessage()"
            (pinSubmit)="onPinSubmitted($event)"
          ></el-pin-access-form>
        </section>

        <!-- Escenario 2: Consentimiento requerido antes de cargar -->
        <el-consent-sheet
          *ngIf="showConsentSheet()"
          [documentVersion]="'v1.0'"
          [submitting]="isSubmittingConsent()"
          (consentAccepted)="onConsentAccepted($event)"
          (consentCancelled)="onConsentCancelled()"
        ></el-consent-sheet>

        <!-- Escenario 2: Identidad requerida tras consentimiento -->
        <section *ngIf="showIdentityForm()" class="step-section">
          <el-guest-identity-form
            [submitting]="isSubmittingIdentity()"
            [errorMessage]="identityErrorMessage()"
            (nicknameSaved)="onNicknameSaved($event)"
          ></el-guest-identity-form>
        </section>

        <!-- Escenario 3: Sesión activa y Mis aportes -->
        <section *ngIf="hasActiveSession && !showIdentityForm() && !isUnavailableAccess" class="active-session-content">
          <div class="guest-bar">
            <span class="welcome-text">
              Participando como <strong>{{ currentSession?.contributorNickname || 'Invitado' }}</strong>
            </span>
            <button
              *ngIf="canUpload"
              type="button"
              class="upload-trigger-btn"
              (click)="startUploadFlow()"
              aria-label="Cargar fotos o videos"
            >
              Subir recuerdos
            </button>
          </div>

          <el-my-contributions-list
            [contributions]="contributions"
            (requestRemoval)="onRequestRemoval()"
          ></el-my-contributions-list>
        </section>

        <!-- Acceso directo a derivación de retiro sin exigir sesión cuando el evento está restringido -->
        <section *ngIf="!hasActiveSession && !needsPinVerification && !isUnavailableAccess" class="step-section">
          <div class="guest-bar">
            <span class="welcome-text">¿Necesitas solicitar el retiro de un recuerdo?</span>
            <button
              type="button"
              class="close-removal-btn"
              (click)="onRequestRemoval()"
            >
              Solicitar retiro de recuerdo
            </button>
          </div>
        </section>

        <!-- Escenario 4: Modal o aviso de derivación a retiro sin sesión -->
        <div *ngIf="removalIntakeView()" class="removal-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="removal-title">
          <div class="removal-card">
            <h3 id="removal-title" class="removal-title">Solicitud de retiro de recuerdo</h3>
            <p class="removal-disclaimer">{{ removalIntakeView()?.disclaimer }}</p>
            <div class="removal-actions">
              <button type="button" class="close-removal-btn" (click)="closeRemovalModal()">Cerrar</button>
              <button type="button" class="intake-link-btn" (click)="openIntakeFlow()">Ir al formulario de solicitud</button>
            </div>
          </div>
        </div>

        <!-- Escenario 4 & EL-TK-121: Flujo interactivo de retiro y denuncia -->
        <el-removal-request-flow
          *ngIf="showRemovalFlow()"
          [isOpen]="showRemovalFlow()"
          [variant]="removalFlowVariant()"
          [eventId]="accessView?.eventId || ''"
          [eventName]="accessView?.name || 'Evento'"
          [mediaId]="targetMediaId()"
          [sessionToken]="currentSession?.token || ''"
          (close)="onCloseRemovalFlow()"
          (removed)="onContributionRemoved($event)"
        ></el-removal-request-flow>
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
    .status-draft, .status-suspended {
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
    .unavailable-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 2rem 1.5rem;
      text-align: center;
    }
    .unavailable-text {
      color: #4a5568;
      font-size: 0.9375rem;
      line-height: 1.5;
      margin: 0.75rem 0 1.5rem;
    }
    .unavailable-actions {
      display: flex;
      justify-content: center;
    }
    .home-link-btn {
      min-height: 44px;
      padding: 0 1.25rem;
      background: #edf2f7;
      color: #2d3748;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
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
      border: none;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      cursor: pointer;
    }
  `]
})
export class GuestContainerComponent implements OnInit {
  private readonly router = inject(PublicEntryRouterService, { optional: true });

  @Input() accessView: PublicAccessView | null = null;
  @Input() lookupKey: string | null = null;

  readonly homePath = APPROVED_PUBLIC_ENTRY_PATHS.HOME;
  readonly isLoadingEntry = signal(false);
  readonly entryErrorMessage = signal<string | null>(null);
  readonly sessionErrorMessage = signal<string | null>(null);

  readonly isSubmittingPin = signal(false);
  readonly pinErrorMessage = signal<string | null>(null);

  readonly showConsentSheet = signal(false);
  readonly isSubmittingConsent = signal(false);

  readonly showIdentityForm = signal(false);
  readonly isSubmittingIdentity = signal(false);
  readonly identityErrorMessage = signal<string | null>(null);
  readonly removalIntakeView = signal<RemovalIntakeView | null>(null);
  readonly showRemovalFlow = signal(false);
  readonly removalFlowVariant = signal<'OWN_REMOVAL' | 'GUEST_INTAKE'>('GUEST_INTAKE');
  readonly targetMediaId = signal<string>('');

  constructor(public guestService: GuestService) {}

  ngOnInit(): void {
    const resolvedKey = this.effectiveLookupKey;
    if (!this.accessView && resolvedKey) {
      void this.loadGuestEntry(resolvedKey);
      return;
    }

    const session = this.guestService.getSession();
    if (session && !session.hasConsented) {
      this.showConsentSheet.set(true);
    }
  }

  get effectiveLookupKey(): string | null {
    if (this.lookupKey && this.lookupKey.trim().length > 0) {
      return this.lookupKey.trim();
    }
    const routeKey = this.router?.params()?.['lookupKey'];
    return routeKey && routeKey.trim().length > 0 ? routeKey.trim() : null;
  }

  get currentSession(): GuestSessionState | null {
    return this.guestService.getSession();
  }

  get hasActiveSession(): boolean {
    return Boolean(this.currentSession);
  }

  get isUnavailableAccess(): boolean {
    if (!this.accessView) return false;
    return (
      this.accessView.accessState === 'UNAVAILABLE' ||
      !this.accessView.canViewLanding
    );
  }

  get needsPinVerification(): boolean {
    if (!this.accessView?.pinRequired || this.isUnavailableAccess) return false;
    return !this.hasActiveSession;
  }

  get canUpload(): boolean {
    return Boolean(this.accessView?.canUpload) && !this.isUnavailableAccess;
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
      case 'SUSPENDED': return 'No disponible';
      default: return status || 'Borrador';
    }
  }

  async loadGuestEntry(lookupKey: string): Promise<void> {
    this.isLoadingEntry.set(true);
    this.entryErrorMessage.set(null);
    this.sessionErrorMessage.set(null);

    const outcome = await this.guestService.resolvePublicEntry(lookupKey);
    this.isLoadingEntry.set(false);

    if (!outcome.ok) {
      this.accessView = null;
      this.entryErrorMessage.set(outcome.message);
      return;
    }

    this.accessView = outcome.access;
    if (outcome.session && !outcome.session.hasConsented && this.canUpload) {
      this.showConsentSheet.set(false);
    }
  }

  async onPinSubmitted(pin: string): Promise<void> {
    const key = this.effectiveLookupKey;
    if (!key) {
      this.pinErrorMessage.set('No se encontró un enlace de acceso válido para verificar el PIN.');
      return;
    }

    this.isSubmittingPin.set(true);
    this.pinErrorMessage.set(null);
    this.sessionErrorMessage.set(null);

    const outcome = await this.guestService.submitPin(key, pin);
    this.isSubmittingPin.set(false);

    if (!outcome.ok) {
      this.pinErrorMessage.set(outcome.message);
      return;
    }
  }

  startUploadFlow(): void {
    const session = this.guestService.getSession();
    if (!session) {
      this.sessionErrorMessage.set('Tu sesión de invitado ha expirado o fue revocada.');
      return;
    }
    if (!session.hasConsented) {
      this.showConsentSheet.set(true);
      return;
    }
    if (!session.contributorNickname) {
      this.showIdentityForm.set(true);
      return;
    }
  }

  async onConsentAccepted(version: string): Promise<void> {
    this.isSubmittingConsent.set(true);
    this.sessionErrorMessage.set(null);

    const outcome = await this.guestService.confirmConsent(version, true);
    this.isSubmittingConsent.set(false);

    if (!outcome.ok) {
      this.showConsentSheet.set(false);
      this.sessionErrorMessage.set(outcome.message);
      return;
    }

    this.showConsentSheet.set(false);
    if (!outcome.session.contributorNickname) {
      this.showIdentityForm.set(true);
    }
  }

  onConsentCancelled(): void {
    this.showConsentSheet.set(false);
  }

  async onNicknameSaved(nickname: string): Promise<void> {
    this.isSubmittingIdentity.set(true);
    this.identityErrorMessage.set(null);
    this.sessionErrorMessage.set(null);

    const outcome = await this.guestService.saveContributorNickname(nickname);
    this.isSubmittingIdentity.set(false);

    if (!outcome.ok) {
      if (outcome.status === 401) {
        this.showIdentityForm.set(false);
        this.sessionErrorMessage.set(outcome.message);
        return;
      }
      this.identityErrorMessage.set(outcome.message);
      return;
    }

    this.showIdentityForm.set(false);
  }

  async refreshContributions(): Promise<void> {
    const outcome = await this.guestService.refreshOwnContributions();
    if (!outcome.ok && outcome.status === 401) {
      this.sessionErrorMessage.set(outcome.message);
    }
  }

  async onRequestRemoval(): Promise<void> {
    const key = this.effectiveLookupKey;
    if (!key) {
      this.sessionErrorMessage.set('No se pudo consultar la derivación de retiro sin un enlace válido.');
      return;
    }

    const outcome = await this.guestService.resolveRemovalIntake(key);
    if (!outcome.ok) {
      this.sessionErrorMessage.set(outcome.message);
      return;
    }

    this.removalIntakeView.set(outcome.intake);
  }

  closeRemovalModal(): void {
    this.removalIntakeView.set(null);
  }

  openOwnRemovalFlow(mediaId: string): void {
    this.targetMediaId.set(mediaId);
    this.removalFlowVariant.set('OWN_REMOVAL');
    this.showRemovalFlow.set(true);
  }

  openIntakeFlow(): void {
    this.removalIntakeView.set(null);
    this.removalFlowVariant.set('GUEST_INTAKE');
    this.showRemovalFlow.set(true);
  }

  onCloseRemovalFlow(): void {
    this.showRemovalFlow.set(false);
  }

  onContributionRemoved(_event: { mediaId: string }): void {
    this.showRemovalFlow.set(false);
  }

  onNavigateHome(event: MouseEvent): void {
    if (this.router) {
      event.preventDefault();
      void this.router.navigateByUrl(this.homePath);
    }
  }
}

export const GUEST_EVENT_ENTRY_ROUTE_DESCRIPTOR: PublicEntryRouteDescriptor = Object.freeze({
  ...CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA.GUEST_EVENT_ENTRY,
  component: GuestContainerComponent
});
