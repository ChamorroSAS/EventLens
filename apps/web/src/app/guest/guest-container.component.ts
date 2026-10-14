import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges, ElementRef, HostListener, inject, signal } from '@angular/core';
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
import { GalleryComponent } from '../gallery/gallery.component.js';
import {
  APPROVED_PUBLIC_ENTRY_PATHS,
  CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA,
  type PublicEntryRouteDescriptor
} from '../navigation/public-entry-routes.contract.js';
import { PublicEntryRouterService } from '../navigation/public-entry-router.service.js';

export interface SelectedUploadItem {
  id: string;
  file: File;
  name: string;
  sizeBytes: number;
  type: 'PHOTO' | 'VIDEO';
  previewUrl: string;
  duration?: string;
  status: 'PENDING' | 'UPLOADING' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
  progress: number;
  errorMessage?: string;
}

export type GuestFlowStep =
  | 'LANDING'
  | 'CONSENT'
  | 'IDENTITY'
  | 'SELECT_FILES'
  | 'UPLOADING'
  | 'CONFIRMATION'
  | 'GALLERY';

@Component({
  selector: 'el-guest-container',
  standalone: true,
  imports: [
    CommonModule,
    PinAccessFormComponent,
    ConsentSheetComponent,
    GuestIdentityFormComponent,
    MyContributionsListComponent,
    RemovalRequestFlowComponent,
    GalleryComponent
  ],
  template: `
    <main class="guest-shell" role="main" [attr.aria-labelledby]="currentStep() === 'CONSENT' ? 'consent-title' : currentStep() === 'IDENTITY' ? 'identity-heading' : currentStep() === 'SELECT_FILES' ? 'selection-title' : currentStep() === 'GALLERY' ? 'gallery-title' : 'event-title'">
      <!-- Loading State -->
      @if (isLoadingEntry()) {
        <header class="event-hero" role="status" aria-live="polite">
          <div class="loading-spinner"></div>
          <h1 id="event-title" class="event-title">Verificando acceso al evento...</h1>
        </header>
      }

      <!-- Unavailable / Error State -->
      @else if (entryErrorMessage()) {
        <section class="unavailable-card" role="alert" aria-labelledby="event-title">
          <div class="unavailable-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#e11d48" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          </div>
          <h1 id="event-title" class="event-title">Enlace no disponible</h1>
          <p class="unavailable-text">{{ entryErrorMessage() }}</p>
          <div class="unavailable-actions">
            <a
              class="home-link-btn"
              [attr.href]="homePath"
              (click)="onNavigateHome($event)"
            >
              Ir al inicio de Phoeve
            </a>
          </div>
        </section>
      }

      <!-- Active Guest Flow -->
      @else {
        <!-- SCREEN 1: ENTRADA AL EVENTO (LANDING) -->
        @if (currentStep() === 'LANDING' && !showConsentSheet() && !showIdentityForm()) {
          <div class="screen-view landing-screen">
            <!-- App Header with Logo -->
            <header class="mobile-app-header">
              <div class="header-logo-box">
                <img
                  src="assets/branding/phoeve/logo-primary.png"
                  alt="Phoeve"
                  class="brand-logo"
                />
              </div>
              <button
                type="button"
                class="header-menu-btn"
                (click)="toggleMenu()"
                aria-label="Abrir menú"
                [attr.aria-expanded]="isMenuOpen()"
                aria-controls="guest-menu"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
              </button>
            </header>

            @if (isMenuOpen()) {
              <div id="guest-menu" class="header-dropdown-menu">
                <button type="button" class="menu-item" [disabled]="!canUpload || needsPinVerification" (click)="onUploadCtaClick(); closeMenu(false)">Subir fotos y videos</button>
                @if (!canUpload) { <p role="note">{{ uploadRestrictionMessage }}</p> }
                @if (hasActiveSession) {
                  <button type="button" class="menu-item" (click)="editNickname()">{{ currentSession?.contributorNickname ? 'Editar nombre o apodo' : 'Completar nombre o apodo' }}</button>
                }
                <button type="button" class="menu-item" [disabled]="!accessView?.canViewGallery" (click)="goToGallery(); closeMenu(false)">
                  🖼️ Ver Galería
                </button>
                <button type="button" class="menu-item" (click)="openUploadPolicy(); isMenuOpen.set(false)">
                  📋 Políticas de carga
                </button>
                <button type="button" class="menu-item" (click)="onRequestRemoval(); isMenuOpen.set(false)">
                  🛡️ Solicitar retiro
                </button>
              </div>
            }

            <!-- Event Hero Image Banner Card -->
            <section class="event-hero-card" aria-label="Información del evento">
              <div class="hero-image-wrap">
                <div class="neutral-event-cover" aria-hidden="true"></div>
                <div class="hero-gradient-overlay"></div>
              </div>

              <div class="hero-content-overlay">
                <span class="event-script-title">
                  {{ accessView?.name || 'Evento' }}
                </span>
                <h1 id="event-title" tabindex="-1" class="sr-only">{{ accessView?.name || 'Evento' }}</h1>

                <div class="event-meta-pills">
                  <div class="meta-pill">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <span>{{ eventDateLabel }}</span>
                  </div>

                  <div class="meta-pill">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    <span>{{ accessView?.timezone }}</span>
                  </div>
                </div>
              </div>
            </section>
            @if (accessView?.welcomeMessage) { <p class="event-welcome">{{ accessView?.welcomeMessage }}</p> }
            <p class="restriction-banner" role="note">{{ transferUnavailableMessage }}</p>

            <!-- Restriction / Session Alerts if applicable -->
            @if (accessView?.restrictionReason) {
              <div class="restriction-banner" role="alert">
                {{ uploadRestrictionMessage }}
              </div>
            }
            @if (sessionErrorMessage()) {
              <div class="restriction-banner error" role="alert">
                {{ sessionErrorMessage() }}
              </div>
            }

            <!-- Escenario 1: PIN requerido cuando el evento lo exige -->
            @if (needsPinVerification) {
              <section class="step-card">
                <el-pin-access-form
                  [submitting]="isSubmittingPin()"
                  [errorMessage]="pinErrorMessage()"
                  (pinSubmit)="onPinSubmitted($event)"
                ></el-pin-access-form>
              </section>
            }

            <!-- CTA Card: ¡Comparte los mejores momentos! -->
            @if (!needsPinVerification && !isUnavailableAccess) {
              <section class="festive-cta-card">
                <div class="confetti-sparkles" aria-hidden="true">
                  <span class="confetti sp-1">✦</span>
                  <span class="confetti sp-2">★</span>
                  <span class="confetti sp-3">◆</span>
                  <span class="confetti sp-4">●</span>
                </div>

                <div class="yellow-squiggle" aria-hidden="true">
                  <svg width="40" height="14" viewBox="0 0 40 14" fill="none">
                    <path d="M2 12C8 2 16 12 22 2C28 12 34 2 38 12" stroke="#fbbf24" stroke-width="3" stroke-linecap="round"/>
                  </svg>
                </div>

                <h2 class="festive-title">¡Comparte los mejores momentos!</h2>
                <p class="festive-desc">Fotos, videos y recuerdos de un día muy especial.</p>

                <div class="festive-buttons-col">

                    <button
                      type="button"
                      class="btn-primary-gradient cta-large"
                      (click)="onUploadCtaClick()"
                      aria-label="Subir fotos y videos"
                      [disabled]="!canUpload"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                      </svg>
                      <span>Subir fotos y videos</span>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                      </svg>
                    </button>

                  @if (!canUpload) { <p role="note">{{ uploadRestrictionMessage }}</p> }

                  <button
                    type="button"
                    class="btn-secondary-white cta-large"
                    (click)="goToGallery()"
                    aria-label="Ver galería"
                    [disabled]="!accessView?.canViewGallery"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                      <circle cx="8.5" cy="8.5" r="1.5"></circle>
                      <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                    <span>Ver galería</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </button>
                </div>
              </section>
            }

            <!-- Guest Session Bar & Mis aportes (Escenario 3) -->
            @if (hasActiveSession && !isUnavailableAccess) {
              <section class="active-session-tray">
                <div class="guest-identity-bar">
                  <span class="guest-identity-text">
                    Participando como <strong>{{ currentSession?.contributorNickname || 'Invitado' }}</strong>
                  </span>
                  <button type="button" class="view-contributions-toggle" (click)="editNickname()">{{ currentSession?.contributorNickname ? 'Editar nombre o apodo' : 'Completar nombre o apodo' }}</button>
                  <button
                    type="button"
                    class="view-contributions-toggle"
                    (click)="showContributionsTray.set(!showContributionsTray())"
                  >
                    {{ showContributionsTray() ? 'Ocultar aportes' : 'Mis aportes (' + contributions.length + ')' }}
                  </button>
                </div>

                @if (showContributionsTray() || contributions.length > 0) {
                  <el-my-contributions-list
                    [contributions]="contributions"
                    (requestRemoval)="onRequestRemoval()"
                  ></el-my-contributions-list>
                }
              </section>
            }

            <!-- Acceso directo a derivación de retiro sin sesión -->
            @if (!hasActiveSession && !needsPinVerification && !isUnavailableAccess) {
              <div class="removal-guest-link-row">
                <button
                  type="button"
                  class="link-muted-btn"
                  (click)="onRequestRemoval()"
                >
                  ¿Necesitas solicitar el retiro de un recuerdo?
                </button>
              </div>
            }

            <!-- Persistent Legal Footer -->
            <footer class="persistent-legal-footer">
              <button type="button" class="footer-legal-btn" (click)="openLegalModal('privacy')">Privacidad</button>
              <span class="sep">•</span>
              <button type="button" class="footer-legal-btn" (click)="openLegalModal('terms')">Términos</button>
              <span class="sep">•</span>
              <button type="button" class="footer-legal-btn" (click)="openLegalModal('publishing')">Condiciones de publicación</button>
            </footer>
          </div>
        }

        <!-- SCREEN 2: CONSENTIMIENTO -->
        @if (showConsentSheet() || currentStep() === 'CONSENT') {
          <el-consent-sheet
            [documentVersion]="'v1.0'"
            [eventName]="accessView?.name || 'Evento'"
            [submitting]="isSubmittingConsent()"
            [errorMessage]="sessionErrorMessage()"
            (consentAccepted)="onConsentAccepted($event)"
            (consentCancelled)="onConsentCancelled()"
          ></el-consent-sheet>
        }

        <!-- SCREEN 3: IDENTIFICACIÓN -->
        @if (showIdentityForm() || currentStep() === 'IDENTITY') {
          <div class="screen-view step-container">
            <el-guest-identity-form
              [initialNickname]="currentSession?.contributorNickname || ''"
              [submitting]="isSubmittingIdentity()"
              [errorMessage]="identityErrorMessage()"
              (nicknameSaved)="onNicknameSaved($event)"
              (back)="cancelIdentity()"
            ></el-guest-identity-form>

            <footer class="persistent-legal-footer">
              <button type="button" class="footer-legal-btn" (click)="openLegalModal('privacy')">Privacidad</button>
              <span class="sep">•</span>
              <button type="button" class="footer-legal-btn" (click)="openLegalModal('terms')">Términos</button>
              <span class="sep">•</span>
              <button type="button" class="footer-legal-btn" (click)="openLegalModal('publishing')">Condiciones de publicación</button>
            </footer>
          </div>
        }

        <!-- SCREEN 4: SELECCIÓN DE ARCHIVOS -->
        @if (currentStep() === 'SELECT_FILES') {
          <div class="screen-view file-selection-screen">
            <p class="restriction-banner" role="status">Los archivos seleccionados todavía no se han enviado. {{ transferUnavailableMessage }}</p>
            @if (sessionErrorMessage()) { <p role="alert">{{ sessionErrorMessage() }}</p> }
            <!-- Header bar -->
            <header class="mobile-app-header">
              <button type="button" class="header-nav-btn" (click)="goToStep('LANDING')" aria-label="Volver">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>
              <div class="header-logo-box">
                <img src="assets/branding/phoeve/logo-primary.png" alt="Phoeve" class="brand-logo" />
              </div>
              <div class="header-spacer"></div>
            </header>

            <div class="section-heading-box">
              <h2 id="selection-title" tabindex="-1" class="step-title">Tus recuerdos</h2>
              <p class="step-subtitle">
                Agrega fotos y videos del evento. ¡Nos encantará ver tu perspectiva!
              </p>
            </div>

            <!-- Upload Dropzone Card -->
            <div
              class="dropzone-card"
              [class.drag-over]="isDragOver()"
              (dragover)="onDragOver($event)"
              (dragleave)="isDragOver.set(false)"
              (drop)="onFileDrop($event)"
            >
              <div class="dropzone-icon-badge" aria-hidden="true">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#e11d74" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
              </div>

              <h3 class="dropzone-title">Agrega fotos y videos</h3>
              <p class="dropzone-desc">Arrastra archivos aquí o elige una opción</p>

              <!-- Hidden native file inputs -->
              <input
                #cameraFileInput
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                (change)="onNativeFilesPicked($event)"
              />
              <input
                #galleryFileInput
                type="file"
                accept="image/*,video/*"
                multiple
                hidden
                (change)="onNativeFilesPicked($event)"
              />

              <!-- Action buttons row -->
              <div class="dropzone-actions-row">
                <button
                  type="button"
                  class="btn-camera-action"
                  (click)="cameraFileInput.click()"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                    <circle cx="12" cy="13" r="4"></circle>
                  </svg>
                  <span>Tomar foto</span>
                </button>

                <button
                  type="button"
                  class="btn-gallery-action"
                  (click)="galleryFileInput.click()"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                  </svg>
                  <span>Elegir archivos</span>
                </button>
              </div>
            </div>

            <!-- Previews Grid of Selected Files -->
            @if (selectedFiles().length > 0) {
              <section class="selected-media-section" aria-label="Archivos seleccionados">
                <div class="previews-grid">
                  @for (item of selectedFiles(); track item.id) {
                    <div class="preview-item-card">
                      @if (item.type === 'PHOTO') { <img [src]="item.previewUrl" [alt]="item.name" class="preview-thumb" /> }
                      @else { <video [src]="item.previewUrl" class="preview-thumb" preload="metadata" [attr.aria-label]="item.name"></video> }

                      <button
                        type="button"
                        class="remove-thumb-btn"
                        (click)="removeSelectedFile(item.id)"
                        aria-label="Quitar archivo"
                      >
                        ✕
                      </button>

                      @if (item.type === 'VIDEO') {
                        <div class="video-badge-overlay">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="#ffffff">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                          </svg>
                          <span>Video</span>
                        </div>
                      }
                    </div>
                  }
                </div>
              </section>
            }

            <!-- Upload Policy Info Pill Callout -->
            <div class="info-pill-callout" (click)="openUploadPolicy()">
              <div class="info-pill-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
              </div>
              <span class="info-pill-text">Hasta 25 MB por foto y 500 MB por video.</span>
            </div>

            <!-- Start Upload Button -->
            <button
              type="button"
              class="btn-primary-gradient cta-large mt-auto"
              [disabled]="true"
              (click)="startUploadingSelectedFiles()"
            >
              <span>Subir recuerdos</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>

            <footer class="persistent-legal-footer">
              <button type="button" class="footer-legal-btn" (click)="openLegalModal('privacy')">Privacidad</button>
              <span class="sep">•</span>
              <button type="button" class="footer-legal-btn" (click)="openLegalModal('terms')">Términos</button>
              <span class="sep">•</span>
              <button type="button" class="footer-legal-btn" (click)="openLegalModal('publishing')">Condiciones de publicación</button>
            </footer>
          </div>
        }

        <!-- SCREEN 7: GALERÍA DEL EVENTO -->
        @if (currentStep() === 'GALLERY') {
          <div class="screen-view gallery-screen">
            <!-- Header bar with Back and Logo -->
            <header class="mobile-app-header">
              <button type="button" class="header-nav-btn" (click)="goToStep('LANDING')" aria-label="Volver a la portada">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>
              <div class="header-logo-box">
                <img src="assets/branding/phoeve/logo-primary.png" alt="Phoeve" class="brand-logo" />
              </div>
              <div class="header-spacer"></div>
            </header>

            <h2 id="gallery-title" tabindex="-1" class="step-title text-left mb-2">Galería del evento</h2>

            <!-- Filter Tabs Pills [Todos] [Fotos] [Videos] -->
            <div class="gallery-filter-tabs">
              <button
                type="button"
                class="filter-pill"
                [class.active]="activeGalleryFilter() === 'ALL'"
                (click)="activeGalleryFilter.set('ALL')"
              >
                Todos
              </button>
              <button
                type="button"
                class="filter-pill"
                [class.active]="activeGalleryFilter() === 'PHOTOS'"
                (click)="activeGalleryFilter.set('PHOTOS')"
              >
                Fotos
              </button>
              <button
                type="button"
                class="filter-pill"
                [class.active]="activeGalleryFilter() === 'VIDEOS'"
                (click)="activeGalleryFilter.set('VIDEOS')"
              >
                Videos
              </button>
            </div>

            <!-- Integrated Gallery Component -->
            <el-gallery
              [eventId]="accessView?.eventId || ''"
              [guestGalleryEnabled]="accessView?.canViewGallery !== false"
              [publicLookupKey]="effectiveLookupKey || ''"
            ></el-gallery>

            <!-- Bottom Removal intake link for safety & compliance -->
            <div class="removal-guest-link-row mt-4">
              <button
                type="button"
                class="link-muted-btn"
                (click)="onRequestRemoval()"
              >
                ¿Quieres solicitar el retiro de una foto o video?
              </button>
            </div>

            <footer class="persistent-legal-footer">
              <button type="button" class="footer-legal-btn" (click)="openLegalModal('privacy')">Privacidad</button>
              <span class="sep">•</span>
              <button type="button" class="footer-legal-btn" (click)="openLegalModal('terms')">Términos</button>
              <span class="sep">•</span>
              <button type="button" class="footer-legal-btn" (click)="openLegalModal('publishing')">Condiciones de publicación</button>
            </footer>
          </div>
        }

        <!-- Escenario 4: Modal de derivación a retiro sin sesión -->
        @if (removalIntakeView()) {
          <div class="removal-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="removal-title">
            <div class="removal-card">
              <h3 id="removal-title" class="removal-title">Solicitud de retiro de recuerdo</h3>
              <p class="removal-disclaimer">{{ removalIntakeView()?.disclaimer }}</p>
              <div class="removal-actions">
                <button type="button" class="close-removal-btn" (click)="closeRemovalModal()">Cerrar</button>
                <button type="button" class="intake-link-btn" (click)="openIntakeFlow()">Ir al formulario de solicitud</button>
              </div>
            </div>
          </div>
        }

        <!-- Escenario 4 & EL-TK-121: Flujo interactivo de retiro y denuncia -->
        @if (showRemovalFlow()) {
          <el-removal-request-flow
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

        <!-- Upload Policy Bottom Sheet / Modal (DEC-085 & Mockup UploadPolicy) -->
        @if (showUploadPolicyModal()) {
          <div class="policy-modal-backdrop" (click)="showUploadPolicyModal.set(false)">
            <div class="policy-sheet-card" (click)="$event.stopPropagation()">
              <header class="policy-sheet-header">
                <div class="policy-icon-badge">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
                  </svg>
                </div>
                <div class="policy-header-text">
                  <h3 class="policy-sheet-title">UploadPolicy</h3>
                  <span class="policy-sheet-subtitle">Reglas de carga de archivos</span>
                </div>
                <button
                  type="button"
                  class="policy-close-x"
                  (click)="showUploadPolicyModal.set(false)"
                  aria-label="Cerrar políticas"
                >
                  ✕
                </button>
              </header>

              <div class="policy-grid">
                <div class="policy-item-box">
                  <span class="policy-item-icon">🖼️</span>
                  <div class="policy-item-detail">
                    <span class="policy-item-title">Fotos hasta</span>
                    <strong class="policy-item-value">25 MB</strong>
                    <span class="policy-item-sub">por archivo</span>
                  </div>
                </div>

                <div class="policy-item-box">
                  <span class="policy-item-icon">🎬</span>
                  <div class="policy-item-detail">
                    <span class="policy-item-title">Videos hasta</span>
                    <strong class="policy-item-value">500 MB</strong>
                    <span class="policy-item-sub">por archivo</span>
                  </div>
                </div>

                <div class="policy-item-box full-width">
                  <span class="policy-item-icon">📄</span>
                  <div class="policy-item-detail">
                    <span class="policy-item-title">Formatos comunes</span>
                    <span class="policy-item-tags">JPG, PNG, HEIC, MP4, MOV, AVI</span>
                  </div>
                </div>

                <div class="policy-item-box full-width highlight-green">
                  <span class="policy-item-icon">🔒</span>
                  <div class="policy-item-detail">
                    <span class="policy-item-title">Carga segura</span>
                    <span class="policy-item-desc">Tus archivos se procesan de forma privada y segura.</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                class="policy-dismiss-btn"
                (click)="showUploadPolicyModal.set(false)"
              >
                Entendido
              </button>
            </div>
          </div>
        }

        <!-- Legal Detail Modal -->
        @if (activeLegalModal()) {
          <div class="legal-detail-backdrop" (click)="activeLegalModal.set(null)">
            <div class="legal-detail-card" (click)="$event.stopPropagation()">
              <h3 class="legal-detail-title">{{ getLegalTitle(activeLegalModal()!) }}</h3>
              <div class="legal-detail-body">
                <p>{{ getLegalText(activeLegalModal()!) }}</p>
              </div>
              <button
                type="button"
                class="legal-close-btn"
                (click)="activeLegalModal.set(null)"
              >
                Cerrar
              </button>
            </div>
          </div>
        }
      }
    </main>
  `,
  styles: [`
    .neutral-event-cover { width: 100%; height: 100%; background: linear-gradient(135deg, #163354, #334155); }
    button:disabled { cursor: not-allowed; opacity: 0.65; }
    .menu-item, .header-menu-btn, .header-nav-btn { min-height: 44px; min-width: 44px; }
    .header-dropdown-menu p { padding: 0 0.75rem; font-size: 0.875rem; }
    :host {
      display: block;
      min-height: 100vh;
      background: #f8fafc;
      color: #0f172a;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .guest-shell {
      max-width: 440px;
      margin: 0 auto;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      position: relative;
      background: #ffffff;
      box-shadow: 0 0 40px rgba(0, 0, 0, 0.04);
    }
    @media (min-width: 640px) {
      .guest-shell {
        border-left: 1px solid #e2e8f0;
        border-right: 1px solid #e2e8f0;
      }
    }

    /* Screen View Container */
    .screen-view {
      padding: 1rem 1.125rem 2rem;
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    /* Top Mobile App Header */
    .mobile-app-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.5rem 0 1rem;
      position: relative;
    }
    .header-logo-box {
      display: flex;
      align-items: center;
    }
    .brand-logo {
      height: 28px;
      width: auto;
      object-fit: contain;
    }
    .header-menu-btn, .header-nav-btn {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: #f1f5f9;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: #0f172a;
      transition: background 0.15s ease;
    }
    .header-menu-btn:hover, .header-nav-btn:hover {
      background: #e2e8f0;
    }
    .header-spacer {
      width: 38px;
    }
    .header-dropdown-menu {
      position: absolute;
      top: 3.5rem;
      right: 1rem;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.12);
      display: flex;
      flex-direction: column;
      padding: 0.5rem;
      z-index: 50;
      min-width: 180px;
    }
    .menu-item {
      background: none;
      border: none;
      padding: 0.65rem 0.85rem;
      text-align: left;
      font-size: 0.875rem;
      font-weight: 600;
      color: #1e293b;
      border-radius: 8px;
      cursor: pointer;
    }
    .menu-item:hover {
      background: #f1f5f9;
    }

    /* Hero Event Card (Screen 1) */
    .event-hero-card {
      position: relative;
      border-radius: 24px;
      overflow: hidden;
      margin-bottom: 1rem;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
      min-height: 230px;
    }
    .hero-image-wrap {
      position: absolute;
      inset: 0;
    }
    .hero-cover-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .hero-gradient-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(15, 23, 42, 0.2) 0%, rgba(15, 23, 42, 0.8) 100%);
    }
    .hero-content-overlay {
      position: relative;
      z-index: 2;
      padding: 1.5rem 1.25rem 1.25rem;
      min-height: 230px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      color: #ffffff;
    }
    .event-script-title {
      font-family: "Caveat", "Dancing Script", "Brush Script MT", cursive, sans-serif;
      font-size: 2.25rem;
      line-height: 1.15;
      font-weight: 700;
      color: #ffffff;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.6);
      margin-bottom: 0.85rem;
      letter-spacing: 0.02em;
    }
    .event-meta-pills {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .meta-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8125rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.95);
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
    }

    /* Festive CTA Card (Screen 1) */
    .festive-cta-card {
      background: #0d1527;
      color: #ffffff;
      border-radius: 24px;
      padding: 1.5rem 1.25rem;
      position: relative;
      overflow: hidden;
      margin-bottom: 1.25rem;
      box-shadow: 0 14px 30px rgba(13, 21, 39, 0.25);
    }
    .confetti-sparkles {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .confetti {
      position: absolute;
      font-size: 14px;
      font-weight: 800;
    }
    .sp-1 { top: 12px; left: 16px; color: #ec4899; }
    .sp-2 { top: 20px; right: 24px; color: #fbbf24; font-size: 16px; }
    .sp-3 { bottom: 20px; left: 24px; color: #38bdf8; }
    .sp-4 { bottom: 12px; right: 16px; color: #a855f7; }
    .sp-5 { top: 50%; right: 12px; color: #f43f5e; }
    .sp-6 { top: 50%; left: 12px; color: #fbbf24; }
    .yellow-squiggle {
      margin-bottom: 0.35rem;
    }
    .festive-title {
      font-size: 1.25rem;
      font-weight: 800;
      color: #ffffff;
      margin: 0 0 0.4rem;
      letter-spacing: -0.01em;
    }
    .festive-desc {
      font-size: 0.875rem;
      color: #94a3b8;
      line-height: 1.45;
      margin: 0 0 1.25rem;
    }
    .festive-buttons-col {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    /* Primary Gradient Button */
    .btn-primary-gradient {
      width: 100%;
      min-height: 52px;
      border-radius: 14px;
      background: linear-gradient(135deg, #e11d74 0%, #ec4899 100%);
      border: none;
      color: #ffffff;
      font-size: 0.95rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      cursor: pointer;
      box-shadow: 0 8px 20px rgba(225, 29, 116, 0.38);
      transition: all 0.2s ease;
      text-decoration: none;
    }
    .btn-primary-gradient:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 10px 24px rgba(225, 29, 116, 0.48);
    }
    .btn-primary-gradient:disabled {
      background: #cbd5e1;
      box-shadow: none;
      cursor: not-allowed;
      color: #64748b;
    }

    /* Secondary White Button */
    .btn-secondary-white {
      width: 100%;
      min-height: 50px;
      border-radius: 14px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      color: #0f172a;
      font-size: 0.95rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      cursor: pointer;
      transition: all 0.15s ease;
      text-decoration: none;
    }
    .btn-secondary-white:hover {
      background: #f8fafc;
      border-color: #94a3b8;
    }

    /* Session Bar */
    .active-session-tray {
      margin-bottom: 1.25rem;
    }
    .guest-identity-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #f1f5f9;
      border-radius: 12px;
      padding: 0.75rem 1rem;
      margin-bottom: 0.75rem;
    }
    .guest-identity-text {
      font-size: 0.8125rem;
      color: #475569;
    }
    .guest-identity-text strong {
      color: #0f172a;
    }
    .view-contributions-toggle {
      background: none;
      border: none;
      color: #e11d74;
      font-size: 0.8125rem;
      font-weight: 700;
      cursor: pointer;
    }

    /* Headings for Steps */
    .section-heading-box {
      margin-bottom: 1.25rem;
    }
    .flex-row-heading {
      display: flex;
      align-items: flex-start;
      gap: 0.875rem;
    }
    .clock-calendar-badge {
      width: 44px;
      height: 44px;
      min-width: 44px;
      border-radius: 12px;
      background: #fdf2f8;
      border: 1.5px solid #fbcfe8;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .step-title {
      font-size: 1.35rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 0.35rem;
      letter-spacing: -0.01em;
    }
    .step-subtitle {
      font-size: 0.875rem;
      color: #64748b;
      margin: 0;
      line-height: 1.45;
    }

    /* Screen 4: Dropzone Card */
    .dropzone-card {
      border: 2px dashed #cbd5e1;
      border-radius: 20px;
      background: #f8fafc;
      padding: 1.75rem 1.25rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      margin-bottom: 1.25rem;
      transition: all 0.2s ease;
    }
    .dropzone-card.drag-over {
      border-color: #e11d74;
      background: #fdf2f8;
    }
    .dropzone-icon-badge {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: #fce7f3;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 0.75rem;
    }
    .dropzone-title {
      font-size: 1.1rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 0.25rem;
    }
    .dropzone-desc {
      font-size: 0.8125rem;
      color: #64748b;
      margin: 0 0 1.25rem;
    }
    .dropzone-actions-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      max-width: 320px;
    }
    .btn-camera-action {
      flex: 1;
      min-height: 44px;
      border-radius: 12px;
      background: #ffffff;
      border: 1.5px solid #e11d74;
      color: #e11d74;
      font-size: 0.875rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .btn-camera-action:hover {
      background: #fdf2f8;
    }
    .btn-gallery-action {
      flex: 1;
      min-height: 44px;
      border-radius: 12px;
      background: #4f46e5;
      border: none;
      color: #ffffff;
      font-size: 0.875rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .btn-gallery-action:hover {
      background: #4338ca;
    }

    /* Screen 4: Previews Grid */
    .selected-media-section {
      margin-bottom: 1.25rem;
    }
    .previews-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.625rem;
    }
    .preview-item-card {
      position: relative;
      aspect-ratio: 1;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #e2e8f0;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
    }
    .preview-thumb {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .remove-thumb-btn {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: rgba(15, 23, 42, 0.7);
      color: #ffffff;
      border: none;
      font-size: 11px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .video-badge-overlay {
      position: absolute;
      bottom: 4px;
      right: 4px;
      background: rgba(15, 23, 42, 0.75);
      color: #ffffff;
      border-radius: 6px;
      padding: 0.15rem 0.35rem;
      font-size: 0.6875rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    /* Info Pill Callout */
    .info-pill-callout {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 12px;
      padding: 0.75rem 1rem;
      display: flex;
      align-items: center;
      gap: 0.625rem;
      margin-bottom: 1.25rem;
      cursor: pointer;
    }
    .info-pill-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
    }
    .info-pill-text {
      font-size: 0.8125rem;
      color: #1e40af;
      font-weight: 600;
      line-height: 1.4;
    }

    /* Screen 5: Uploading Files List */
    .uploading-files-list {
      list-style: none;
      padding: 0;
      margin: 0 0 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .upload-file-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 0.65rem 0.85rem;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    }
    .file-thumb-box {
      width: 48px;
      height: 48px;
      min-width: 48px;
      border-radius: 8px;
      overflow: hidden;
      position: relative;
      background: #f1f5f9;
    }
    .thumb-mini {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .mini-play-icon {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.4);
      color: #ffffff;
      font-size: 10px;
    }
    .file-detail-box {
      flex: 1;
      min-width: 0;
    }
    .file-title-text {
      font-size: 0.875rem;
      font-weight: 700;
      color: #0f172a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
    }
    .file-meta-row {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
      color: #64748b;
      margin: 0.15rem 0 0.35rem;
    }
    .file-progress-track {
      width: 100%;
      height: 5px;
      background: #e2e8f0;
      border-radius: 9999px;
      overflow: hidden;
    }
    .file-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #4f46e5 0%, #a855f7 100%);
      transition: width 0.2s ease;
    }
    .file-status-action {
      min-width: 80px;
      display: flex;
      justify-content: flex-end;
    }
    .status-badge-completed {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      color: #16a34a;
      font-size: 0.75rem;
      font-weight: 700;
    }
    .status-pct {
      font-size: 0.8125rem;
      font-weight: 700;
      color: #475569;
    }
    .status-spinner-row {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
      color: #6366f1;
    }
    .mini-spinner {
      width: 14px;
      height: 14px;
      border: 2px solid #e0e7ff;
      border-top-color: #4f46e5;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    .status-error-col {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.25rem;
    }
    .error-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.6875rem;
      font-weight: 700;
      color: #e11d48;
    }
    .btn-retry-pill {
      background: #fff1f2;
      border: 1px solid #fecdd3;
      color: #e11d48;
      border-radius: 6px;
      padding: 0.2rem 0.5rem;
      font-size: 0.6875rem;
      font-weight: 700;
      cursor: pointer;
    }

    /* Screen 6: Confirmation Screen */
    .confirmation-screen {
      align-items: center;
      text-align: center;
      padding-top: 1.5rem;
    }
    .celebration-burst-hero {
      position: relative;
      width: 140px;
      height: 140px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 1.25rem;
    }
    .confetti-sparkles-burst {
      position: absolute;
      inset: -10px;
      pointer-events: none;
    }
    .celebration-circle {
      width: 96px;
      height: 96px;
      border-radius: 50%;
      background: linear-gradient(135deg, #e11d74 0%, #a855f7 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 12px 30px rgba(225, 29, 116, 0.45);
      border: 4px solid #ffffff;
    }
    .celebration-title {
      font-size: 1.55rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 0.4rem;
      letter-spacing: -0.02em;
    }
    .celebration-subtitle {
      font-size: 0.9375rem;
      color: #64748b;
      margin: 0 0 1.75rem;
    }
    .stats-summary-row {
      display: flex;
      gap: 0.75rem;
      width: 100%;
      max-width: 340px;
      margin-bottom: 1.75rem;
    }
    .stat-pill-card {
      flex: 1;
      border-radius: 16px;
      padding: 0.85rem 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.65rem;
      border: 1px solid transparent;
    }
    .stat-photo {
      background: #fdf2f8;
      border-color: #fbcfe8;
    }
    .stat-video {
      background: #faf5ff;
      border-color: #e9d5ff;
    }
    .stat-icon-circle {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
    }
    .stat-text-col {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      text-align: left;
    }
    .stat-number {
      font-size: 1.25rem;
      font-weight: 800;
      color: #0f172a;
      line-height: 1;
    }
    .stat-label {
      font-size: 0.6875rem;
      font-weight: 600;
      color: #64748b;
      margin-top: 0.2rem;
    }
    .confirmation-actions-col {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      width: 100%;
      max-width: 340px;
      margin-bottom: 2rem;
    }
    .festive-balloons-footer {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      margin-top: auto;
      margin-bottom: 1.5rem;
    }
    .balloons-illustration {
      font-size: 24px;
      display: flex;
      gap: 2px;
    }
    .script-see-you {
      font-family: "Caveat", "Dancing Script", "Brush Script MT", cursive, sans-serif;
      font-size: 1.5rem;
      font-weight: 700;
      color: #0f172a;
    }

    /* Screen 7: Gallery Screen */
    .gallery-filter-tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    .filter-pill {
      min-height: 36px;
      padding: 0 1rem;
      border-radius: 9999px;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      color: #475569;
      font-size: 0.8125rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .filter-pill.active {
      background: linear-gradient(135deg, #e11d74 0%, #ec4899 100%);
      color: #ffffff;
      border-color: #e11d74;
      box-shadow: 0 4px 12px rgba(225, 29, 116, 0.3);
    }

    /* Removal & Compliance Links */
    .removal-guest-link-row {
      text-align: center;
      margin: 0.5rem 0 1.25rem;
    }
    .link-muted-btn {
      background: none;
      border: none;
      color: #64748b;
      font-size: 0.8125rem;
      text-decoration: underline;
      cursor: pointer;
    }

    /* Persistent Legal Footer (Mockup LegalFooter) */
    .persistent-legal-footer {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding-top: 1rem;
      margin-top: auto;
      font-size: 0.75rem;
    }
    .footer-legal-btn {
      background: none;
      border: none;
      color: #6366f1;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: underline;
      padding: 0.2rem;
    }
    .sep {
      color: #cbd5e1;
    }

    /* UploadPolicy Bottom Sheet Modal */
    .policy-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.5);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: flex-end;
      justify-content: center;
      z-index: 1050;
      padding: 1rem;
    }
    .policy-sheet-card {
      background: #ffffff;
      border-radius: 24px;
      padding: 1.5rem 1.25rem;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.2);
    }
    .policy-sheet-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.25rem;
      position: relative;
    }
    .policy-icon-badge {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .policy-sheet-title {
      font-size: 1.15rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0;
    }
    .policy-sheet-subtitle {
      font-size: 0.8125rem;
      color: #64748b;
    }
    .policy-close-x {
      margin-left: auto;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #f1f5f9;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: #475569;
    }
    .policy-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.625rem;
      margin-bottom: 1.25rem;
    }
    .policy-item-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 0.75rem;
      display: flex;
      gap: 0.5rem;
      align-items: flex-start;
    }
    .policy-item-box.full-width {
      grid-column: span 2;
    }
    .policy-item-box.highlight-green {
      background: #f0fdf4;
      border-color: #bbf7d0;
    }
    .policy-item-icon {
      font-size: 1.25rem;
    }
    .policy-item-detail {
      display: flex;
      flex-direction: column;
    }
    .policy-item-title {
      font-size: 0.75rem;
      color: #64748b;
      font-weight: 500;
    }
    .policy-item-value {
      font-size: 1.1rem;
      font-weight: 800;
      color: #0f172a;
    }
    .policy-item-sub {
      font-size: 0.6875rem;
      color: #94a3b8;
    }
    .policy-item-tags {
      font-size: 0.8125rem;
      font-weight: 700;
      color: #0f172a;
    }
    .policy-item-desc {
      font-size: 0.75rem;
      color: #166534;
      font-weight: 600;
    }
    .policy-dismiss-btn {
      width: 100%;
      min-height: 48px;
      border-radius: 12px;
      background: #0f172a;
      color: #ffffff;
      border: none;
      font-weight: 700;
      font-size: 0.9375rem;
      cursor: pointer;
    }

    /* Legal Detail Modal */
    .legal-detail-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1100;
      padding: 1rem;
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
      font-weight: 800;
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
      font-weight: 700;
      cursor: pointer;
    }

    /* Removal Request Modal */
    .removal-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      z-index: 1000;
    }
    .removal-card {
      background: #ffffff;
      border-radius: 16px;
      padding: 1.5rem;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
    }
    .removal-title {
      font-size: 1.25rem;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 0.75rem;
    }
    .removal-disclaimer {
      font-size: 0.875rem;
      color: #475569;
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
      background: #f1f5f9;
      color: #475569;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
    }
    .intake-link-btn {
      min-height: 44px;
      padding: 0 1rem;
      background: #e11d48;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      cursor: pointer;
    }

    /* Fallback and helper classes */
    .unavailable-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      padding: 2.5rem 1.5rem;
      text-align: center;
      margin: 2rem 1rem;
    }
    .unavailable-icon {
      margin-bottom: 1rem;
    }
    .unavailable-text {
      color: #475569;
      font-size: 0.9375rem;
      line-height: 1.5;
      margin: 0.75rem 0 1.5rem;
    }
    .home-link-btn {
      min-height: 46px;
      padding: 0 1.5rem;
      background: #0f172a;
      color: #ffffff;
      border-radius: 12px;
      text-decoration: none;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .restriction-banner {
      background: #fffaf0;
      border: 1px solid #fbd38d;
      color: #744210;
      padding: 0.75rem;
      border-radius: 12px;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }
    .restriction-banner.error {
      background: #fff1f2;
      border-color: #fecdd3;
      color: #9f1239;
    }
    .loading-spinner {
      width: 36px;
      height: 36px;
      border: 3px solid #e2e8f0;
      border-top-color: #e11d74;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 2rem auto 1rem;
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
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class GuestContainerComponent implements OnInit, OnDestroy, OnChanges {
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

  // Guest steps use authoritative session receipts and capabilities.
  readonly currentStep = signal<GuestFlowStep>('LANDING');
  readonly isMenuOpen = signal(false);
  readonly showContributionsTray = signal(false);
  readonly showUploadPolicyModal = signal(false);
  readonly activeLegalModal = signal<'privacy' | 'terms' | 'publishing' | null>(null);
  readonly activeGalleryFilter = signal<'ALL' | 'PHOTOS' | 'VIDEOS'>('ALL');
  readonly isDragOver = signal(false);

  readonly selectedFiles = signal<SelectedUploadItem[]>([]);
  readonly transferUnavailableMessage = 'La subida de archivos aún no está disponible.';
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private identityOrigin: GuestFlowStep | null = null;
  private fileSequence = 0;
  private entryRequest = 0;
  private serviceContext: number;

  constructor(public guestService: GuestService) { this.serviceContext = guestService.getContextVersion(); }

  private invalidateFlowRequests(): void {
    ++this.entryRequest;
    const version = this.guestService.invalidatePendingRequests(this.serviceContext);
    if (version !== null) this.serviceContext = version;
    this.isSubmittingPin.set(false);
    this.isSubmittingConsent.set(false);
    this.isSubmittingIdentity.set(false);
    this.pinErrorMessage.set(null);
    this.identityErrorMessage.set(null);
    this.sessionErrorMessage.set(null);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (Object.values(changes).every(change => change.firstChange)) return;
    if (changes['lookupKey'] || changes['accessView']) {
      this.invalidateFlowRequests();
      this.clearSelectedFiles();
      this.goToStep('LANDING');
      if (changes['lookupKey'] && this.effectiveLookupKey) void this.loadGuestEntry(this.effectiveLookupKey);
    }
  }

  ngOnInit(): void {
    const resolvedKey = this.effectiveLookupKey;
    if (!this.accessView && resolvedKey) {
      void this.loadGuestEntry(resolvedKey);
      return;
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
    const session = this.guestService.getSession();
    if (!session || !this.accessView || session.eventId !== this.accessView.eventId ||
        session.credentialGeneration !== this.accessView.generation || this.isUnavailableAccess) return null;
    return session;
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
    return this.hasActiveSession ? this.guestService.getContributions() : [];
  }

  get eventDateLabel(): string {
    if (!this.accessView?.scheduledAt) return 'Fecha por confirmar';
    try {
      return new Intl.DateTimeFormat('es-CO', { timeZone: this.accessView.timezone, dateStyle: 'long', timeStyle: 'short' }).format(new Date(this.accessView.scheduledAt));
    } catch { return 'Fecha por confirmar'; }
  }

  get uploadRestrictionMessage(): string {
    switch (this.accessView?.status) {
      case 'SCHEDULED': return 'El evento está programado. Podrás compartir cuando se active.';
      case 'ACTIVE': return 'El organizador tiene deshabilitada la subida de archivos.';
      case 'CLOSED': return 'El evento está cerrado y ya no acepta archivos.';
      case 'GRACE_PERIOD': return 'El plazo para subir archivos ha terminado.';
      default: return 'Este evento no permite subir archivos en este momento.';
    }
  }

  get confirmedPhotosCount(): number {
    const fromSelected = this.selectedFiles().filter(f => f.type === 'PHOTO' && f.status === 'COMPLETED').length;
    const fromContribs = this.contributions.filter(c => c.mediaType === 'PHOTO').length;
    return Math.max(fromSelected, fromContribs);
  }

  get confirmedVideosCount(): number {
    const fromSelected = this.selectedFiles().filter(f => f.type === 'VIDEO' && f.status === 'COMPLETED').length;
    const fromContribs = this.contributions.filter(c => c.mediaType === 'VIDEO').length;
    return Math.max(fromSelected, fromContribs);
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

  toggleMenu(): void {
    this.isMenuOpen.set(!this.isMenuOpen());
  }

  closeMenu(returnFocus = true): void {
    this.isMenuOpen.set(false);
    if (returnFocus) this.host.nativeElement.querySelector<HTMLButtonElement>('.header-menu-btn')?.focus();
  }

  @HostListener('keydown.escape')
  onMenuEscape(): void { if (this.isMenuOpen()) this.closeMenu(); }

  private focusStep(): void {
    queueMicrotask(() => {
      const title = this.host.nativeElement.querySelector<HTMLElement>('#consent-title, #identity-heading, .step-title, #event-title');
      title?.setAttribute('tabindex', '-1');
      title?.focus();
    });
  }

  goToStep(step: GuestFlowStep): void {
    if (step === 'UPLOADING' || step === 'CONFIRMATION') { this.sessionErrorMessage.set(this.transferUnavailableMessage); return; }
    if (step === 'GALLERY' && !this.accessView?.canViewGallery) return;
    if ((step === 'CONSENT' || step === 'SELECT_FILES' || (step === 'IDENTITY' && this.identityOrigin === null)) && (!this.canUpload || !this.hasActiveSession)) {
      this.goToStep('LANDING');
      this.sessionErrorMessage.set(this.hasActiveSession ? this.uploadRestrictionMessage : 'Tu sesión de invitado ha expirado o fue revocada.');
      return;
    }
    if (step === 'IDENTITY' && !this.hasActiveSession) { this.goToStep('LANDING'); return; }
    if (step === 'SELECT_FILES' && (!this.currentSession?.hasConsented || !this.currentSession?.contributorNickname)) { this.startUploadFlow(); return; }
    this.currentStep.set(step);
    this.isMenuOpen.set(false);
    if (step === 'LANDING') this.identityOrigin = null;
    if (step !== 'CONSENT') {
      this.showConsentSheet.set(false);
    }
    if (step !== 'IDENTITY') {
      this.showIdentityForm.set(false);
    }
    this.focusStep();
  }

  editNickname(): void {
    if (!this.hasActiveSession) return;
    this.identityOrigin = this.currentStep();
    this.identityErrorMessage.set(null);
    this.goToStep('IDENTITY');
    this.showIdentityForm.set(true);
  }

  cancelIdentity(): void { this.goToStep(this.identityOrigin ?? 'LANDING'); }

  goToGallery(): void {
    this.goToStep('GALLERY');
  }

  openUploadPolicy(): void {
    this.showUploadPolicyModal.set(true);
  }

  openLegalModal(type: 'privacy' | 'terms' | 'publishing'): void {
    this.activeLegalModal.set(type);
  }

  getLegalTitle(type: 'privacy' | 'terms' | 'publishing'): string {
    switch (type) {
      case 'terms': return 'Términos y Condiciones';
      case 'privacy': return 'Política de Privacidad';
      case 'publishing': return 'Condiciones de publicación';
    }
  }

  getLegalText(type: 'privacy' | 'terms' | 'publishing'): string {
    const name = this.accessView?.name || 'este evento';
    switch (type) {
      case 'terms':
        return `Conservas la propiedad de tus archivos originales. Al compartirlos en ${name}, otorgas una licencia privada y limitada para su visualización entre los invitados autorizados.`;
      case 'privacy':
        return 'Tus fotos y videos pertenecen exclusivamente a ti. Phoeve no comercializa tus datos, no comparte tus archivos con terceros ni los utiliza para entrenar modelos.';
      case 'publishing':
        return 'Solo se permite contenido respetuoso, festivo y relacionado con el evento. No se admiten contenidos ofensivos ni que vulneren la intimidad de las personas.';
    }
  }

  async loadGuestEntry(lookupKey: string): Promise<void> {
    this.invalidateFlowRequests();
    const request = this.entryRequest;
    this.clearSelectedFiles();
    this.goToStep('LANDING');
    this.isLoadingEntry.set(true);
    this.entryErrorMessage.set(null);
    this.sessionErrorMessage.set(null);

    const pending = this.guestService.resolvePublicEntry(lookupKey);
    this.serviceContext = this.guestService.getContextVersion();
    const outcome = await pending;
    if (request !== this.entryRequest) return;
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
    const request = this.entryRequest;
    this.serviceContext = this.guestService.getContextVersion();
    const key = this.effectiveLookupKey;
    if (!key) {
      this.pinErrorMessage.set('No se encontró un enlace de acceso válido para verificar el PIN.');
      return;
    }

    this.isSubmittingPin.set(true);
    this.pinErrorMessage.set(null);
    this.sessionErrorMessage.set(null);

    const outcome = await this.guestService.submitPin(key, pin);
    if (request !== this.entryRequest) return;
    this.isSubmittingPin.set(false);

    if (!outcome.ok) {
      this.pinErrorMessage.set(outcome.message);
      return;
    }
  }

  onUploadCtaClick(): void {
    this.startUploadFlow();
  }

  startUploadFlow(): void {
    if (!this.canUpload) { this.goToStep('LANDING'); this.sessionErrorMessage.set(this.uploadRestrictionMessage); return; }
    this.identityOrigin = null;
    const session = this.currentSession;
    if (!session) {
      this.goToStep('LANDING');
      this.sessionErrorMessage.set('Tu sesión de invitado ha expirado o fue revocada.');
      return;
    }
    if (!session.hasConsented) {
      this.showConsentSheet.set(true);
      this.goToStep('CONSENT');
      return;
    }
    if (!session.contributorNickname) {
      this.showIdentityForm.set(true);
      this.goToStep('IDENTITY');
      return;
    }

    // Both consented and named: go straight to file selection
    this.goToStep('SELECT_FILES');
  }

  async onConsentAccepted(version: string): Promise<void> {
    const request = this.entryRequest;
    if (this.isSubmittingConsent()) return;
    if (!this.canUpload || !this.hasActiveSession) { this.startUploadFlow(); return; }
    this.serviceContext = this.guestService.getContextVersion();
    this.isSubmittingConsent.set(true);
    this.sessionErrorMessage.set(null);

    const outcome = await this.guestService.confirmConsent(version, true);
    if (request !== this.entryRequest) return;
    this.isSubmittingConsent.set(false);

    if (!outcome.ok) {
      if (outcome.status === 401) { this.guestService.clearSession(); this.clearSelectedFiles(); this.goToStep('LANDING'); }
      else { this.goToStep('CONSENT'); this.showConsentSheet.set(true); }
      this.sessionErrorMessage.set(outcome.message);
      return;
    }

    this.showConsentSheet.set(false);
    this.startUploadFlow();
  }

  onConsentCancelled(): void {
    this.goToStep('LANDING');
  }

  async onNicknameSaved(nickname: string): Promise<void> {
    const request = this.entryRequest;
    if (this.isSubmittingIdentity()) return;
    if (!this.hasActiveSession) { this.goToStep('LANDING'); this.sessionErrorMessage.set('Tu sesión de invitado ha expirado o fue revocada.'); return; }
    this.serviceContext = this.guestService.getContextVersion();
    this.isSubmittingIdentity.set(true);
    this.identityErrorMessage.set(null);
    this.sessionErrorMessage.set(null);

    const outcome = await this.guestService.saveContributorNickname(nickname);
    if (request !== this.entryRequest) return;
    this.isSubmittingIdentity.set(false);

    if (!outcome.ok) {
      if (outcome.status === 401) {
        this.guestService.clearSession();
        this.clearSelectedFiles();
        this.goToStep('LANDING');
        this.sessionErrorMessage.set(outcome.message);
        return;
      }
      this.identityErrorMessage.set(outcome.message);
      return;
    }

    this.showIdentityForm.set(false);
    if (this.identityOrigin !== null) this.goToStep(this.identityOrigin);
    else this.startUploadFlow();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(true);
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
    if (event.dataTransfer?.files) {
      this.addLocalFiles(Array.from(event.dataTransfer.files));
    }
  }

  onNativeFilesPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.addLocalFiles(Array.from(input.files));
      input.value = '';
    }
  }

  addLocalFiles(files: File[]): void {
    if (!this.canUpload || !this.hasActiveSession || !this.currentSession?.hasConsented || !this.currentSession?.contributorNickname || this.currentStep() !== 'SELECT_FILES') return;
    const newItems: SelectedUploadItem[] = files.map((file) => {
      const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name);
      return {
        id: `sel-${++this.fileSequence}`,
        file,
        name: file.name,
        sizeBytes: file.size,
        type: isVideo ? 'VIDEO' : 'PHOTO',
        previewUrl: URL.createObjectURL(file),
        status: 'PENDING',
        progress: 0
      };
    });

    this.selectedFiles.set([...this.selectedFiles(), ...newItems]);
  }

  removeSelectedFile(id: string): void {
    const removed = this.selectedFiles().find(f => f.id === id);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    this.selectedFiles.set(this.selectedFiles().filter(f => f.id !== id));
  }

  startUploadingSelectedFiles(): void {
    if (!this.canUpload || !this.hasActiveSession) { this.startUploadFlow(); return; }
    if (!this.currentSession?.hasConsented || !this.currentSession?.contributorNickname) { this.startUploadFlow(); return; }
    this.sessionErrorMessage.set(this.transferUnavailableMessage);
  }

  retryFileUpload(_id: string): void { this.startUploadingSelectedFiles(); }

  isAllUploadsDone(): boolean { return false; }

  onUploadMoreClick(): void { this.startUploadFlow(); }

  formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    return (bytes / 1024).toFixed(0) + ' KB';
  }

  async refreshContributions(): Promise<void> {
    const request = this.entryRequest;
    this.serviceContext = this.guestService.getContextVersion();
    const outcome = await this.guestService.refreshOwnContributions();
    if (request !== this.entryRequest) return;
    if (!outcome.ok && outcome.status === 401) {
      this.clearSelectedFiles();
      this.goToStep('LANDING');
      this.sessionErrorMessage.set(outcome.message);
    }
  }

  private clearSelectedFiles(): void {
    for (const item of this.selectedFiles()) URL.revokeObjectURL(item.previewUrl);
    this.selectedFiles.set([]);
  }

  ngOnDestroy(): void { this.invalidateFlowRequests(); this.clearSelectedFiles(); }

  async onRequestRemoval(): Promise<void> {
    const request = this.entryRequest;
    const key = this.effectiveLookupKey;
    if (!key) {
      this.sessionErrorMessage.set('No se pudo consultar la derivación de retiro sin un enlace válido.');
      return;
    }

    const outcome = await this.guestService.resolveRemovalIntake(key);
    if (request !== this.entryRequest) return;
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
