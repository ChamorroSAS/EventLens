import { Component, OnInit, inject, signal, Input } from '@angular/core';
import type {
  OrganizerEventModel,
  EventConfigurationModel,
  EventSettingsSection
} from './organizer.types.js';
import { OrganizerService } from './organizer.service.js';
import { OrganizerAppShellComponent } from './organizer-app-shell.component.js';
import { EventListComponent } from './event-list.component.js';
import { EventSettingsNavComponent } from './event-settings-nav.component.js';
import { EventStatusBadgeComponent } from '../lifecycle/event-status-badge.component.js';
import { OrganizerMediaLibraryComponent } from '../media/organizer-media-library.component.js';
import { CreateEventFormComponent } from './create-event-form.component.js';
import { EventBasicInfoFormComponent } from './event-basic-info-form.component.js';
import {
  APPROVED_PUBLIC_ENTRY_PATHS,
  CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA,
  type PublicEntryRouteActivationContext,
  type PublicEntryRouteDescriptor
} from '../navigation/public-entry-routes.contract';
import { OrganizerSessionService } from '../organizer-session.service';

import { EventScheduleSectionComponent } from './event-schedule-section.component.js';
import { EventTimezoneSectionComponent } from './event-timezone-section.component.js';

@Component({
  selector: 'eventlens-organizer-dashboard',
  standalone: true,
  imports: [
    OrganizerAppShellComponent,
    EventListComponent,
    EventSettingsNavComponent,
    EventStatusBadgeComponent,
    OrganizerMediaLibraryComponent,
    CreateEventFormComponent,
    EventBasicInfoFormComponent,
    EventScheduleSectionComponent,
    EventTimezoneSectionComponent
  ],
  template: `
    <eventlens-organizer-app-shell
      [selectedEvent]="selectedEvent()"
      (exitContext)="onBackToEvents()"
    >
      <div class="dashboard-container">
        @if (isLoading()) {
          <div class="state-panel loading-state" role="status" aria-busy="true">
            <span class="spinner" aria-hidden="true">⏳</span>
            <p>Cargando eventos...</p>
          </div>
        } @else if (errorMessage()) {
          <div class="state-panel error-state" role="alert">
            <span class="alert-icon" aria-hidden="true">⚠️</span>
            <div class="error-content">
              <h3>Error al cargar los eventos</h3>
              <p>{{ errorMessage() }}</p>
              <button
                type="button"
                class="btn-retry"
                aria-label="Reintentar cargar eventos"
                (click)="loadEvents()"
              >
                Reintentar
              </button>
            </div>
          </div>
        } @else if (!selectedEventId()) {
          <!-- VISTA DE LISTA DE EVENTOS -->
          <header class="dashboard-header">
            <div>
              <h2 class="dashboard-title">Mis eventos</h2>
              <p class="dashboard-subtitle">Gestiona la preparación, acceso y recuerdos de tus eventos.</p>
            </div>
            <button
              #createBtn
              type="button"
              class="btn-create"
              aria-label="Crear un nuevo borrador de evento"
              (click)="onCreateDraft(createBtn)"
            >
              + Crear borrador
            </button>
          </header>

          @if (events().length === 0) {
            <div class="state-panel empty-state" role="status">
              <span class="empty-icon" aria-hidden="true">📅</span>
              <h3>Aún no tienes eventos creados</h3>
              <p>Comienza creando un borrador para definir su nombre, fecha y reglas de acceso.</p>
              <button
                #firstCreateBtn
                type="button"
                class="btn-primary"
                (click)="onCreateDraft(firstCreateBtn)"
              >
                Crear mi primer evento
              </button>
            </div>
          } @else {
            <eventlens-event-list
              [events]="events()"
              (selectEvent)="onEventSelected($event)"
            />
          }
        } @else {
          <!-- VISTA DE DETALLE / CONFIGURACIÓN DE EVENTO SELECCIONADO -->
          <div class="event-workspace">
            <aside class="workspace-sidebar">
              <eventlens-event-settings-nav
                [activeSection]="activeSection()"
                [capabilities]="selectedEventConfig()?.capabilities"
                (sectionChange)="onSectionChange($event)"
                (backToDashboard)="onBackToEvents()"
              />
            </aside>

            <main class="workspace-content" role="region" [attr.aria-label]="'Configuración de ' + activeSection()">
              <header class="section-header">
                <div class="section-title-row">
                  <h2 class="section-title">{{ getSectionTitle() }}</h2>
                  @if (selectedEvent()) {
                    <eventlens-event-status-badge [status]="selectedEvent()!.status" />
                  }
                </div>
                <p class="section-description">{{ getSectionDescription() }}</p>
              </header>

              <div class="section-body">
                @switch (activeSection()) {
                  @case ('general') {
                    @if (selectedEvent() && selectedEventConfig()) {
                      <eventlens-event-basic-info-form
                        [event]="selectedEvent()!"
                        [configuration]="selectedEventConfig()!"
                        (eventUpdated)="onEventBasicInfoUpdated($event)"
                        (dirtyChange)="isBasicInfoDirty.set($event)"
                      />
                    }
                  }
                  @case ('schedule') {
                    <div class="schedule-tab-sections">
                      <eventlens-event-timezone-section
                        [event]="selectedEvent() ?? undefined"
                        [revision]="selectedEventConfig()?.revision"
                        [canEdit]="!!(selectedEventConfig()?.capabilities?.canChangeTimezone ?? (selectedEvent()?.status === 'DRAFT' || selectedEvent()?.status === 'SCHEDULED'))"
                        (saved)="onTimezoneSaved()"
                        (reconcile)="onReconcileEvent()"
                      />
                      <eventlens-event-schedule-section
                        [event]="selectedEvent() ?? undefined"
                        [revision]="selectedEventConfig()?.revision"
                        [canEdit]="!!(selectedEventConfig()?.capabilities?.canSetLocalSchedule || selectedEventConfig()?.capabilities?.canEditSchedule)"
                        (saved)="onScheduleSaved()"
                        (reconcile)="onReconcileEvent()"
                      />
                    </div>
                  }
                  @case ('access') {
                    <div class="section-card">
                      <h3>Acceso y protección por PIN</h3>
                      <p>Protección por PIN: {{ selectedEvent()?.pinEnabled ? 'Activa' : 'Desactivada' }}</p>
                      @if (selectedEventConfig()?.capabilities?.canManageAccess) {
                        <p class="capability-notice">✓ La gestión de accesos y PIN está disponible.</p>
                      }
                    </div>
                  }
                  @case ('guest') {
                    <div class="section-card">
                      <h3>Participación e invitados</h3>
                      <p>Subidas habilitadas: {{ selectedEvent()?.uploadsEnabled ? 'Sí' : 'No' }}</p>
                      <p>Galería de invitados: {{ selectedEvent()?.guestGalleryEnabled ? 'Sí' : 'No' }}</p>
                    </div>
                  }
                  @case ('lifecycle') {
                    <div class="section-card">
                      <h3>Ciclo de vida</h3>
                      <p>Vigencia y transiciones temporales del evento.</p>
                    </div>
                  }
                  @case ('capacity') {
                    <div class="section-card">
                      <h3>Capacidad y almacenamiento</h3>
                      <p>Control de cuotas y consumo de archivos del evento.</p>
                    </div>
                  }
                  @case ('media') {
                    @if (selectedEvent()) {
                      <eventlens-organizer-media-library [eventRef]="selectedEvent()!.id" />
                    }
                  }
                }
              </div>
            </main>
          </div>
        }
      </div>

      @if (isCreatingEvent()) {
        <eventlens-create-event-form
          [triggerElement]="createEventTriggerElement"
          (eventCreated)="onEventCreated($event)"
          (cancel)="onCancelCreateEvent()"
        />
      }

      @if (showUnsavedChangesModal()) {
        <div
          class="unsaved-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="unsaved-modal-title"
          aria-describedby="unsaved-modal-desc"
        >
          <div class="unsaved-modal-card">
            <h3 id="unsaved-modal-title" class="unsaved-modal-title">¿Descartar cambios sin guardar?</h3>
            <p id="unsaved-modal-desc" class="unsaved-modal-desc">
              Tienes modificaciones en el nombre del evento que no has guardado. Si continúas, se perderán estos cambios.
            </p>
            <div class="unsaved-modal-actions">
              <button
                type="button"
                class="btn-cancel"
                (click)="onKeepEditing()"
              >
                Seguir editando
              </button>
              <button
                type="button"
                class="btn-danger"
                (click)="onDiscardAndNavigate()"
              >
                Descartar y continuar
              </button>
            </div>
          </div>
        </div>
      }
    </eventlens-organizer-app-shell>
  `,
  styleUrl: './organizer-dashboard.component.scss',
})
export class OrganizerDashboardComponent implements OnInit {
  private readonly organizerService = inject(OrganizerService);
  private readonly sessionService = inject(OrganizerSessionService, { optional: true });

  @Input() set eventId(id: string | undefined) {
    if (id) {
      this.selectedEventId.set(id);
    }
  }

  @Input() set section(sec: string | undefined) {
    if (sec === 'general' || sec === 'schedule' || sec === 'programacion') {
      this.activeSection.set(sec === 'programacion' ? 'schedule' : (sec as EventSettingsSection));
    }
  }

  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly events = signal<OrganizerEventModel[]>([]);
  readonly selectedEventId = signal<string | null>(null);
  readonly selectedEventConfig = signal<EventConfigurationModel | null>(null);
  readonly activeSection = signal<EventSettingsSection>('general');
  readonly isCreatingEvent = signal<boolean>(false);
  readonly isBasicInfoDirty = signal<boolean>(false);
  readonly showUnsavedChangesModal = signal<boolean>(false);
  createEventTriggerElement: HTMLElement | null = null;
  pendingNavigation: { type: 'section' | 'back'; targetSection?: EventSettingsSection } | null = null;

  constructor() {
    this.sessionService?.registerOrganizerCacheClearer(() => {
      this.events.set([]);
      this.selectedEventId.set(null);
      this.selectedEventConfig.set(null);
      this.isCreatingEvent.set(false);
      this.isBasicInfoDirty.set(false);
      this.showUnsavedChangesModal.set(false);
      this.pendingNavigation = null;
    });
  }

  get selectedEvent(): () => OrganizerEventModel | null {
    return () => {
      const id = this.selectedEventId();
      if (!id) return null;
      return this.events().find((e) => e.id === id) ?? null;
    };
  }

  async ngOnInit(): Promise<void> {
    await this.loadEvents();
  }

  async loadEvents(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const items = await this.organizerService.listEvents();
      this.events.set(items);
    } catch (err) {
      this.events.set([]);
      this.selectedEventId.set(null);
      this.selectedEventConfig.set(null);
      this.errorMessage.set('No fue posible cargar tus eventos. Por favor verifica tu sesión.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async onEventSelected(eventId: string): Promise<void> {
    this.selectedEventId.set(eventId);
    // Limpiar datos y capacidades A antes de leer B
    this.selectedEventConfig.set(null);
    this.activeSection.set('general');
    this.isBasicInfoDirty.set(false);
    try {
      const config = await this.organizerService.getEventConfiguration(eventId);
      // Carrera A->B: si el usuario navegó a otro evento mientras cargaba, descartar
      if (this.selectedEventId() !== eventId) {
        return;
      }
      this.selectedEventConfig.set(config);
    } catch (err) {
      if (this.selectedEventId() !== eventId) {
        return;
      }
      // Detalle seguro: si el evento es ajeno o ausente, resultado neutro sin datos ni capacidades
      this.selectedEventId.set(null);
      this.selectedEventConfig.set(null);
      this.errorMessage.set('El evento seleccionado no existe o no tienes permisos para acceder a él.');
    }
  }

  onBackToEvents(): void {
    if (this.isBasicInfoDirty()) {
      this.pendingNavigation = { type: 'back' };
      this.showUnsavedChangesModal.set(true);
      return;
    }
    this.selectedEventId.set(null);
    this.selectedEventConfig.set(null);
    this.activeSection.set('general');
    this.isBasicInfoDirty.set(false);
  }

  onSectionChange(section: EventSettingsSection): void {
    if (this.isBasicInfoDirty() && section !== this.activeSection()) {
      this.pendingNavigation = { type: 'section', targetSection: section };
      this.showUnsavedChangesModal.set(true);
      return;
    }
    this.activeSection.set(section);
  }

  onKeepEditing(): void {
    this.showUnsavedChangesModal.set(false);
    this.pendingNavigation = null;
  }

  onDiscardAndNavigate(): void {
    this.showUnsavedChangesModal.set(false);
    this.isBasicInfoDirty.set(false);
    const nav = this.pendingNavigation;
    this.pendingNavigation = null;
    if (nav?.type === 'section' && nav.targetSection) {
      this.activeSection.set(nav.targetSection);
    } else if (nav?.type === 'back') {
      this.selectedEventId.set(null);
      this.selectedEventConfig.set(null);
      this.activeSection.set('general');
    }
  }

  onEventBasicInfoUpdated(updated: { id: string; name: string; revision: string }): void {
    this.isBasicInfoDirty.set(false);
    this.events.update((list) =>
      list.map((e) => (e.id === updated.id ? { ...e, name: updated.name } : e))
    );
    const currentConfig = this.selectedEventConfig();
    if (currentConfig && currentConfig.event.id === updated.id) {
      this.selectedEventConfig.set({
        ...currentConfig,
        revision: updated.revision,
        event: {
          ...currentConfig.event,
          name: updated.name
        }
      });
    }
  }

  onCreateDraft(trigger?: HTMLElement): void {
    this.createEventTriggerElement = trigger ?? null;
    this.isCreatingEvent.set(true);
  }

  onCancelCreateEvent(): void {
    this.isCreatingEvent.set(false);
  }

  async onEventCreated(eventRef: { id: string }): Promise<void> {
    this.isCreatingEvent.set(false);
    try {
      await this.loadEvents();
    } catch {
      // conservar navegación si la lista falla
    }
    await this.onEventSelected(eventRef.id);
  }

  async onScheduleSaved(): Promise<void> {
    const id = this.selectedEventId();
    if (id) {
      await this.refreshSelectedEvent(id);
    }
  }

  async onTimezoneSaved(): Promise<void> {
    const id = this.selectedEventId();
    if (id) {
      await this.refreshSelectedEvent(id);
    }
  }

  async onReconcileEvent(): Promise<void> {
    const id = this.selectedEventId();
    if (id) {
      await this.refreshSelectedEvent(id);
    }
  }

  private async refreshSelectedEvent(eventId: string): Promise<void> {
    try {
      const config = await this.organizerService.getEventConfiguration(eventId);
      this.selectedEventConfig.set(config);
      const items = await this.organizerService.listEvents();
      this.events.set(items);
    } catch {
      // Ignora errores transitorios de recarga
    }
  }

  getSectionTitle(): string {
    switch (this.activeSection()) {
      case 'general': return 'Configuración general';
      case 'schedule': return 'Fecha y horario';
      case 'access': return 'Acceso de invitados y PIN';
      case 'guest': return 'Aportes y permisos';
      case 'lifecycle': return 'Ciclo de vida del evento';
      case 'capacity': return 'Capacidad y almacenamiento';
      case 'media': return 'Biblioteca de medios';
    }
  }

  getSectionDescription(): string {
    switch (this.activeSection()) {
      case 'general': return 'Nombre, descripción y detalles básicos del evento.';
      case 'schedule': return 'Define cuándo se abrirá y comenzará a recibir fotos tu evento.';
      case 'access': return 'Configura la credencial pública y el PIN de seguridad de 6 dígitos.';
      case 'guest': return 'Habilita o deshabilita la subida de fotos y visualización de la galería.';
      case 'lifecycle': return 'Supervisa el avance temporal, apertura, cierre y período de gracia.';
      case 'capacity': return 'Controla el espacio utilizado y solicita ampliaciones si lo necesitas.';
      case 'media': return 'Revisa fotos y videos, estados técnicos de procesamiento y disponibilidad.';
    }
  }
}

export async function organizerDashboardRouteGuard(
  _context: PublicEntryRouteActivationContext
): Promise<boolean | string> {
  const sessionService = inject(OrganizerSessionService);
  if (sessionService.state() === 'CHECKING') {
    await sessionService.refreshSessionProjection();
  }

  const state = sessionService.state();
  const capabilities = sessionService.capabilities();

  if (
    state === 'ORGANIZER_ACTIVE' &&
    capabilities.canAccessMyEvents &&
    !capabilities.isDeletionRestricted
  ) {
    return true;
  }

  if (state === 'ORGANIZER_RESTRICTED_DELETION') {
    return APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_ACCOUNT;
  }

  if (state === 'ANONYMOUS') {
    return '/ingresar?returnUrl=%2Fmis-eventos';
  }

  return APPROVED_PUBLIC_ENTRY_PATHS.HOME;
}

export const ORGANIZER_DASHBOARD_ROUTE_DESCRIPTOR: PublicEntryRouteDescriptor = Object.freeze({
  ...CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA.ORGANIZER_DASHBOARD,
  component: OrganizerDashboardComponent,
  canActivate: [organizerDashboardRouteGuard]
});
