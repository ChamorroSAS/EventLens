import { Component, OnInit, inject, signal } from '@angular/core';
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
import {
  APPROVED_PUBLIC_ENTRY_PATHS,
  CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA,
  type PublicEntryRouteActivationContext,
  type PublicEntryRouteDescriptor
} from '../navigation/public-entry-routes.contract';
import { OrganizerSessionService } from '../organizer-session.service';

@Component({
  selector: 'eventlens-organizer-dashboard',
  standalone: true,
  imports: [
    OrganizerAppShellComponent,
    EventListComponent,
    EventSettingsNavComponent,
    EventStatusBadgeComponent,
    OrganizerMediaLibraryComponent
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
              type="button"
              class="btn-create"
              aria-label="Crear un nuevo borrador de evento"
              (click)="onCreateDraft()"
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
                type="button"
                class="btn-primary"
                (click)="onCreateDraft()"
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
                    <div class="section-card">
                      <h3>Información del evento</h3>
                      <dl class="detail-list">
                        <div class="detail-item">
                          <dt>Nombre:</dt>
                          <dd>{{ selectedEvent()?.name }}</dd>
                        </div>
                        <div class="detail-item">
                          <dt>Zona horaria:</dt>
                          <dd>{{ selectedEvent()?.timezone }}</dd>
                        </div>
                        <div class="detail-item">
                          <dt>Estado de ciclo de vida:</dt>
                          <dd>{{ selectedEvent()?.status }}</dd>
                        </div>
                        <div class="detail-item">
                          <dt>Revisión actual:</dt>
                          <dd>{{ selectedEventConfig()?.revision }}</dd>
                        </div>
                      </dl>
                    </div>
                  }
                  @case ('schedule') {
                    <div class="section-card">
                      <h3>Programación y timeline</h3>
                      <p>Fecha de inicio local: {{ selectedEvent()?.startsAtLocal || 'Sin programar' }}</p>
                      @if (selectedEventConfig()?.capabilities?.canEditSchedule) {
                        <p class="capability-notice">✓ La reprogramación está permitida en este estado.</p>
                      } @else {
                        <p class="capability-disabled">⚠️ La programación no se puede modificar en el estado actual.</p>
                      }
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
    </eventlens-organizer-app-shell>
  `,
  styleUrl: './organizer-dashboard.component.scss',
})
export class OrganizerDashboardComponent implements OnInit {
  private readonly organizerService = inject(OrganizerService);
  private readonly sessionService = inject(OrganizerSessionService, { optional: true });

  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly events = signal<OrganizerEventModel[]>([]);
  readonly selectedEventId = signal<string | null>(null);
  readonly selectedEventConfig = signal<EventConfigurationModel | null>(null);
  readonly activeSection = signal<EventSettingsSection>('general');

  constructor() {
    this.sessionService?.registerOrganizerCacheClearer(() => {
      this.events.set([]);
      this.selectedEventId.set(null);
      this.selectedEventConfig.set(null);
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
    this.activeSection.set('general');
    try {
      const config = await this.organizerService.getEventConfiguration(eventId);
      this.selectedEventConfig.set(config);
    } catch (err) {
      this.errorMessage.set('No se pudo obtener la configuración del evento seleccionado.');
    }
  }

  onBackToEvents(): void {
    this.selectedEventId.set(null);
    this.selectedEventConfig.set(null);
    this.activeSection.set('general');
  }

  onSectionChange(section: EventSettingsSection): void {
    this.activeSection.set(section);
  }

  onCreateDraft(): void {
    // Delegated to CreateEventForm
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
