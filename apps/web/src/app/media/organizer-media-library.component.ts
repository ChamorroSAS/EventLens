import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import type {
  MediaCardModel,
  MediaStatusFilter,
  EmptyReason,
  RetryCycleResponse,
  EventModerationMode,
} from './media.types.js';
import { MediaLibraryService } from './media-library.service.js';
import { MediaStatusFilterComponent } from './media-status-filter.component.js';
import { OrganizerMediaCardComponent } from './organizer-media-card.component.js';
import { OrganizerMediaTableComponent } from './organizer-media-table.component.js';
import { HideMediaDialogComponent } from './hide-media-dialog.component.js';
import { RejectMediaDialogComponent } from './reject-media-dialog.component.js';
import { TrashMediaDialogComponent } from './trash-media-dialog.component.js';
import { RetentionNoticeComponent } from './retention-notice.component.js';
import { ModerationSettingsComponent } from './moderation-settings.component.js';
import { DownloadAllActionComponent } from './download-all-action.component.js';
import { ExportRequestDialogComponent } from './export-request-dialog.component.js';
import { ExportStatusPanelComponent } from './export-status-panel.component.js';
import type { ExportStatusSnapshotUI } from './media.types.js';

@Component({
  selector: 'eventlens-organizer-media-library',
  standalone: true,
  imports: [
    MediaStatusFilterComponent,
    OrganizerMediaCardComponent,
    OrganizerMediaTableComponent,
    HideMediaDialogComponent,
    RejectMediaDialogComponent,
    TrashMediaDialogComponent,
    RetentionNoticeComponent,
    ModerationSettingsComponent,
    DownloadAllActionComponent,
    ExportRequestDialogComponent,
    ExportStatusPanelComponent,
  ],
  template: `
    <div class="organizer-media-library" [attr.aria-label]="'Biblioteca de medios del evento ' + eventRef">
      <!-- CABECERA Y HERRAMIENTAS -->
      <header class="library-header">
        <div class="header-left">
          <h2 class="library-title">Biblioteca de fotos y videos</h2>
          <span class="library-counter" role="status" aria-live="polite">
            @if (totalCount() > 0) {
              Mostrando {{ items().length }} de {{ filterCount() }} archivos (Total evento: {{ totalCount() }})
            } @else if (!isLoading() && !errorMessage()) {
              0 archivos
            }
          </span>
        </div>

        <div class="header-actions">
          <!-- BOTÓN DESCARGAR TODO / EXPORTACIÓN -->
          <eventlens-download-all-action
            [exportStatus]="currentExport()?.status ?? null"
            (openDialogRequested)="openExportRequestDialog()"
            (statusRequested)="openExportStatusPanel()"
          />

          <!-- BOTÓN TOGGLE AJUSTES MODERACIÓN -->
          <button
            type="button"
            class="btn-toggle-settings"
            [class.active]="showSettings()"
            [attr.aria-expanded]="showSettings()"
            aria-label="Configurar modo de moderación del evento"
            (click)="toggleSettings()"
          >
            <span aria-hidden="true">⚙️</span> Moderación
          </button>

          <!-- CONMUTADOR DE VISTA (CUADRÍCULA / TABLA) -->
          <div class="view-switcher" role="group" aria-label="Modo de visualización">
            <button
              type="button"
              class="btn-view"
              [class.active]="viewMode() === 'grid'"
              [attr.aria-pressed]="viewMode() === 'grid'"
              aria-label="Ver en cuadrícula"
              (click)="setViewMode('grid')"
            >
              <span aria-hidden="true">⊞</span> Cuadrícula
            </button>
            <button
              type="button"
              class="btn-view"
              [class.active]="viewMode() === 'table'"
              [attr.aria-pressed]="viewMode() === 'table'"
              aria-label="Ver en tabla"
              (click)="setViewMode('table')"
            >
              <span aria-hidden="true">☰</span> Tabla
            </button>
          </div>

          <button
            type="button"
            class="btn-refresh"
            aria-label="Actualizar lista de archivos multimedia"
            [disabled]="isLoading()"
            (click)="loadLibrary()"
          >
            <span aria-hidden="true">🔄</span> Actualizar
          </button>
        </div>
      </header>

      <!-- PANEL DE AJUSTES DE MODERACIÓN (OPCIONAL/COLAPSABLE) -->
      @if (showSettings()) {
        <section class="settings-collapsible" aria-label="Sección de configuración de moderación">
          <eventlens-moderation-settings
            [eventRef]="eventRef"
            [moderationMode]="moderationMode()"
            [disabled]="isLoading()"
            (modeChanged)="onModerationModeChanged($event)"
          />
        </section>
      }

      <!-- ALERTAS Y MENSAJES DE ACCIÓN -->
      @if (actionSuccessMessage()) {
        <div class="alert-banner alert-success" role="status" aria-live="polite">
          <span class="alert-icon" aria-hidden="true">✓</span>
          <span>{{ actionSuccessMessage() }}</span>
          <button
            type="button"
            class="btn-dismiss"
            aria-label="Cerrar mensaje"
            (click)="actionSuccessMessage.set(null)"
          >
            ✕
          </button>
        </div>
      }

      @if (actionErrorMessage()) {
        <div class="alert-banner alert-danger" role="alert">
          <span class="alert-icon" aria-hidden="true">⚠️</span>
          <span>{{ actionErrorMessage() }}</span>
          <button
            type="button"
            class="btn-dismiss"
            aria-label="Cerrar mensaje de error"
            (click)="actionErrorMessage.set(null)"
          >
            ✕
          </button>
        </div>
      }

      <!-- AVISO DE RETENCIÓN EN PAPELERA (CUANDO EL FILTRO ES TRASHED) -->
      @if (activeFilter() === 'TRASHED') {
        <eventlens-retention-notice />
      }

      <!-- BARRA DE FILTROS ACCESIBLE -->
      <section class="toolbar-section" aria-label="Opciones de filtrado">
        <eventlens-media-status-filter
          [activeFilter]="activeFilter()"
          [disabled]="isLoading()"
          (filterChange)="onFilterChanged($event)"
        />
      </section>

      <!-- ESTADOS DE CARGA, ERROR, VACÍO Y CONTENIDO -->
      <div class="library-content" role="region" aria-label="Contenido multimedia del evento">
        @if (isLoading()) {
          <div class="state-card loading-state" role="status" aria-busy="true">
            <span class="spinner" aria-hidden="true">⏳</span>
            <p>Cargando archivos multimedia del evento…</p>
          </div>
        } @else if (errorMessage()) {
          <div class="state-card error-state" role="alert">
            <span class="alert-icon" aria-hidden="true">⚠️</span>
            <div class="error-details">
              <h3>Error al cargar los medios</h3>
              <p>{{ errorMessage() }}</p>
              <button
                type="button"
                class="btn-retry"
                aria-label="Reintentar cargar biblioteca de medios"
                (click)="loadLibrary()"
              >
                Reintentar
              </button>
            </div>
          </div>
        } @else if (emptyReason() === 'EMPTY_LIBRARY' || (totalCount() === 0 && items().length === 0)) {
          <!-- CRITERIO 3: VACÍO TOTAL DEL EVENTO (EMPTY_LIBRARY) -->
          <div class="state-card empty-library-state" role="status">
            <span class="empty-icon" aria-hidden="true">📷</span>
            <h3>Sin fotos ni videos en el evento</h3>
            <p class="empty-description">Aún no hay fotos ni videos subidos en este evento.</p>
          </div>
        } @else if (emptyReason() === 'EMPTY_FILTER_RESULTS' || items().length === 0) {
          <!-- CRITERIO 3: VACÍO POR FILTRO SIN RESULTADOS (EMPTY_FILTER_RESULTS) -->
          <div class="state-card empty-filter-state" role="status">
            <span class="empty-icon" aria-hidden="true">🔍</span>
            <h3>No se encontraron coincidencias</h3>
            <p class="empty-description">No hay medios que coincidan con el filtro seleccionado.</p>
            <button
              type="button"
              class="btn-clear-filters"
              aria-label="Limpiar filtros y ver todos los medios"
              (click)="onClearFilters()"
            >
              Limpiar filtros
            </button>
          </div>
        } @else {
          <!-- VISTA DE MEDIOS: CUADRÍCULA O TABLA -->
          @if (viewMode() === 'grid') {
            <div class="media-grid" role="list" aria-label="Cuadrícula de archivos multimedia">
              @for (item of items(); track item.mediaRef) {
                <div role="listitem">
                  <eventlens-organizer-media-card
                    [media]="item"
                    (retryCycleSubmitted)="onRetryCycleSubmitted($event)"
                    (refreshRequested)="loadLibrary()"
                    (downloadTriggered)="onDownloadTriggered(item)"
                    (approveRequested)="onApproveRequested($event)"
                    (rejectRequested)="onRejectRequested($event)"
                    (hideRequested)="onHideRequested($event)"
                    (republishRequested)="onRepublishRequested($event)"
                    (trashRequested)="onTrashRequested($event)"
                    (restoreRequested)="onRestoreRequested($event)"
                  />
                </div>
              }
            </div>
          } @else {
            <eventlens-organizer-media-table
              [items]="items()"
              (retryCycleSubmitted)="onRetryCycleSubmitted($event)"
              (refreshRequested)="loadLibrary()"
              (downloadTriggered)="onDownloadTriggered($event)"
              (approveRequested)="onApproveRequested($event)"
              (rejectRequested)="onRejectRequested($event)"
              (hideRequested)="onHideRequested($event)"
              (republishRequested)="onRepublishRequested($event)"
              (trashRequested)="onTrashRequested($event)"
              (restoreRequested)="onRestoreRequested($event)"
            />
          }
        }
      </div>

      <!-- MODALES DE CONFIRMACIÓN -->
      <eventlens-hide-media-dialog
        [media]="selectedDialogMedia()"
        [isOpen]="isHideDialogOpen()"
        [isSubmitting]="isDialogSubmitting()"
        (confirm)="onConfirmHide($event)"
        (cancel)="closeDialogs()"
      />

      <eventlens-reject-media-dialog
        [media]="selectedDialogMedia()"
        [isOpen]="isRejectDialogOpen()"
        [isSubmitting]="isDialogSubmitting()"
        (confirm)="onConfirmReject($event)"
        (cancel)="closeDialogs()"
      />

      <eventlens-trash-media-dialog
        [media]="selectedDialogMedia()"
        [isOpen]="isTrashDialogOpen()"
        [isSubmitting]="isDialogSubmitting()"
        (confirm)="onConfirmTrash($event)"
        (cancel)="closeDialogs()"
      />

      <!-- DIÁLOGO DE SOLICITUD DE EXPORTACIÓN Y PANEL DE ESTADO -->
      <eventlens-export-request-dialog
        [isOpen]="isExportRequestDialogOpen()"
        [isSubmitting]="isSubmittingExportRequest()"
        (confirm)="onConfirmExportRequest()"
        (cancel)="closeExportRequestDialog()"
      />

      <eventlens-export-status-panel
        [isOpen]="isExportStatusPanelOpen()"
        [snapshot]="currentExport()"
        (downloadPart)="onDownloadPart($event)"
        (retry)="onRetryExport()"
        (regenerate)="onRegenerateExport()"
        (requestNew)="onRequestNewExport()"
        (close)="closeExportStatusPanel()"
      />
    </div>
  `,
  styles: `
    .organizer-media-library {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      width: 100%;
    }
    .library-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid #e2e8f0;
    }
    .header-left {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .library-title {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: #0f172a;
    }
    .library-counter {
      font-size: 0.8125rem;
      color: #64748b;
      font-weight: 500;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .btn-toggle-settings {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      min-height: 38px;
      padding: 0.375rem 0.75rem;
      border-radius: 0.375rem;
      border: 1px solid #cbd5e1;
      background-color: #ffffff;
      color: #334155;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.15s ease, border-color 0.15s ease;
    }
    .btn-toggle-settings:hover {
      background-color: #f1f5f9;
    }
    .btn-toggle-settings.active {
      background-color: #eff6ff;
      border-color: #3b82f6;
      color: #1d4ed8;
    }
    .view-switcher {
      display: inline-flex;
      border: 1px solid #cbd5e1;
      border-radius: 0.5rem;
      overflow: hidden;
      background-color: #f8fafc;
    }
    .btn-view {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      min-height: 38px;
      padding: 0.375rem 0.75rem;
      border: none;
      background: none;
      color: #475569;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.15s ease, color 0.15s ease;
    }
    .btn-view:hover:not(.active) {
      background-color: #f1f5f9;
    }
    .btn-view.active {
      background-color: #ffffff;
      color: #0f172a;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }
    .btn-refresh {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      min-height: 38px;
      padding: 0.375rem 0.75rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.5rem;
      background-color: #ffffff;
      color: #334155;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.15s ease;
    }
    .btn-refresh:hover:not(:disabled) {
      background-color: #f1f5f9;
    }
    .btn-refresh:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .settings-collapsible {
      animation: fadeIn 0.15s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .alert-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
      font-size: 0.875rem;
    }
    .alert-success {
      background-color: #f0fdf4;
      border: 1px solid #bbf7d0;
      color: #166534;
    }
    .alert-danger {
      background-color: #fef2f2;
      border: 1px solid #fecaca;
      color: #991b1b;
    }
    .btn-dismiss {
      background: none;
      border: none;
      font-size: 0.875rem;
      cursor: pointer;
      color: inherit;
      padding: 0.25rem;
    }
    .toolbar-section {
      width: 100%;
    }
    .library-content {
      width: 100%;
      min-height: 240px;
    }
    .state-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 3rem 1.5rem;
      border: 1px dashed #cbd5e1;
      border-radius: 0.75rem;
      background-color: #ffffff;
      text-align: center;
    }
    .loading-state p {
      margin: 0;
      font-size: 0.875rem;
      color: #64748b;
    }
    .spinner {
      font-size: 2rem;
    }
    .error-state {
      border-color: #fca5a5;
      background-color: #fef2f2;
    }
    .alert-icon {
      font-size: 2rem;
    }
    .error-details h3 {
      margin: 0 0 0.5rem;
      font-size: 1rem;
      font-weight: 700;
      color: #991b1b;
    }
    .error-details p {
      margin: 0 0 1rem;
      font-size: 0.875rem;
      color: #7f1d1d;
    }
    .btn-retry {
      min-height: 40px;
      padding: 0.5rem 1.25rem;
      border-radius: 0.375rem;
      border: 1px solid #dc2626;
      background-color: #dc2626;
      color: #ffffff;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
    }
    .btn-retry:hover {
      background-color: #b91c1c;
    }
    .empty-icon {
      font-size: 2.5rem;
    }
    .empty-library-state h3,
    .empty-filter-state h3 {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 700;
      color: #0f172a;
    }
    .empty-description {
      margin: 0;
      font-size: 0.875rem;
      color: #64748b;
      max-width: 380px;
    }
    .btn-clear-filters {
      min-height: 40px;
      padding: 0.5rem 1rem;
      margin-top: 0.5rem;
      border-radius: 0.375rem;
      border: 1px solid #cbd5e1;
      background-color: #f8fafc;
      color: #0f172a;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
    }
    .btn-clear-filters:hover {
      background-color: #e2e8f0;
    }
    .media-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1rem;
      width: 100%;
    }
    @media (min-width: 640px) {
      .media-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    @media (min-width: 1024px) {
      .media-grid {
        grid-template-columns: repeat(3, 1fr);
      }
    }
    @media (min-width: 1280px) {
      .media-grid {
        grid-template-columns: repeat(4, 1fr);
      }
    }
    button:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }
  `,
})
export class OrganizerMediaLibraryComponent implements OnInit {
  private readonly mediaLibraryService = inject(MediaLibraryService);

  @Input({ required: true }) eventRef!: string;
  @Input() initialFilter: MediaStatusFilter = 'ALL';

  @Output() retryCycleTriggered = new EventEmitter<RetryCycleResponse>();
  @Output() downloadItemTriggered = new EventEmitter<MediaCardModel>();

  readonly items = signal<MediaCardModel[]>([]);
  readonly totalCount = signal<number>(0);
  readonly filterCount = signal<number>(0);
  readonly activeFilter = signal<MediaStatusFilter>('ALL');
  readonly emptyReason = signal<EmptyReason | null>(null);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly viewMode = signal<'grid' | 'table'>('grid');

  // Moderation Settings & Notices
  readonly showSettings = signal<boolean>(false);
  readonly moderationMode = signal<EventModerationMode>('AUTO_PUBLISH');

  // Dialogs
  readonly selectedDialogMedia = signal<MediaCardModel | null>(null);
  readonly isHideDialogOpen = signal<boolean>(false);
  readonly isRejectDialogOpen = signal<boolean>(false);
  readonly isTrashDialogOpen = signal<boolean>(false);
  readonly isDialogSubmitting = signal<boolean>(false);

  // Export State & Dialogs
  readonly currentExport = signal<ExportStatusSnapshotUI | null>(null);
  readonly isExportRequestDialogOpen = signal<boolean>(false);
  readonly isSubmittingExportRequest = signal<boolean>(false);
  readonly isExportStatusPanelOpen = signal<boolean>(false);

  // Feedback alerts
  readonly actionSuccessMessage = signal<string | null>(null);
  readonly actionErrorMessage = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    if (this.initialFilter) {
      this.activeFilter.set(this.initialFilter);
    }
    await this.loadLibrary();
    await this.loadModerationSettings();
    await this.loadExportStatus();
  }

  async loadExportStatus(): Promise<void> {
    if (!this.eventRef) return;
    try {
      const status = await this.mediaLibraryService.getExportStatus(this.eventRef);
      this.currentExport.set(status);
    } catch {
      // Dejar currentExport en su estado previo si la llamada falla
    }
  }

  openExportRequestDialog(): void {
    this.isExportRequestDialogOpen.set(true);
  }

  closeExportRequestDialog(): void {
    this.isExportRequestDialogOpen.set(false);
  }

  openExportStatusPanel(): void {
    this.isExportStatusPanelOpen.set(true);
  }

  closeExportStatusPanel(): void {
    this.isExportStatusPanelOpen.set(false);
  }

  onRequestNewExport(): void {
    this.closeExportStatusPanel();
    this.openExportRequestDialog();
  }

  async onConfirmExportRequest(): Promise<void> {
    this.isSubmittingExportRequest.set(true);
    this.clearAlerts();
    try {
      const idempotencyKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `export-${Date.now()}`;
      await this.mediaLibraryService.requestExport(this.eventRef, idempotencyKey);
      this.closeExportRequestDialog();
      await this.loadExportStatus();
      this.openExportStatusPanel();
      this.actionSuccessMessage.set(
        'Solicitud de exportación enviada. La preparación continuará de forma asíncrona.'
      );
    } catch (err: unknown) {
      this.handleActionError(err, 'solicitar la exportación');
    } finally {
      this.isSubmittingExportRequest.set(false);
    }
  }

  async onDownloadPart(partNumber: number): Promise<void> {
    const exp = this.currentExport();
    if (!exp) return;
    this.clearAlerts();
    try {
      const grant = await this.mediaLibraryService.requestExportPartGrant(
        this.eventRef,
        exp.exportId,
        partNumber
      );
      if (typeof window !== 'undefined' && grant.downloadUrl) {
        window.open(grant.downloadUrl, '_blank');
      }
      this.actionSuccessMessage.set(
        `Enlace para descargar la parte ${partNumber} generado. La transferencia se gestiona a través del navegador.`
      );
    } catch (err: unknown) {
      this.handleActionError(err, `descargar la parte ${partNumber}`);
    }
  }

  async onRetryExport(): Promise<void> {
    const exp = this.currentExport();
    if (!exp) return;
    this.clearAlerts();
    try {
      await this.mediaLibraryService.retryExport(this.eventRef, exp.exportId);
      this.actionSuccessMessage.set('Exportación reactivada para reintento.');
      await this.loadExportStatus();
    } catch (err: unknown) {
      this.handleActionError(err, 'reintentar la exportación');
    }
  }

  async onRegenerateExport(): Promise<void> {
    const exp = this.currentExport();
    if (!exp) return;
    this.clearAlerts();
    try {
      await this.mediaLibraryService.retryExport(this.eventRef, exp.exportId);
      this.actionSuccessMessage.set('Exportación reactivada para regeneración.');
      await this.loadExportStatus();
    } catch (err: unknown) {
      this.handleActionError(err, 'regenerar la exportación');
    }
  }

  async loadLibrary(): Promise<void> {
    if (!this.eventRef) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const snapshot = await this.mediaLibraryService.getOrganizerMediaLibrary({
        eventRef: this.eventRef,
        statusFilter: this.activeFilter(),
        limit: 50,
        offset: 0,
      });

      this.items.set(snapshot.items ?? []);
      this.totalCount.set(snapshot.totalCount ?? 0);
      this.filterCount.set(snapshot.filterCount ?? 0);
      this.emptyReason.set(snapshot.emptyReason ?? null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'ACCESS_DENIED') {
        this.errorMessage.set('No tienes permisos autorizados para ver la biblioteca de este evento.');
      } else if (msg === 'EVENT_NOT_FOUND') {
        this.errorMessage.set('El evento solicitado no fue encontrado.');
      } else {
        this.errorMessage.set('No fue posible conectar con el servidor para consultar los medios.');
      }
      this.items.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadModerationSettings(): Promise<void> {
    if (!this.eventRef) return;
    try {
      const settings = await this.mediaLibraryService.getModerationSettings(this.eventRef);
      this.moderationMode.set(settings.moderationMode);
    } catch {
      // Keep default AUTO_PUBLISH if settings query fails
    }
  }

  async onFilterChanged(filter: MediaStatusFilter): Promise<void> {
    this.activeFilter.set(filter);
    await this.loadLibrary();
  }

  async onClearFilters(): Promise<void> {
    this.activeFilter.set('ALL');
    await this.loadLibrary();
  }

  setViewMode(mode: 'grid' | 'table'): void {
    this.viewMode.set(mode);
  }

  toggleSettings(): void {
    this.showSettings.set(!this.showSettings());
  }

  async onModerationModeChanged(mode: EventModerationMode): Promise<void> {
    this.actionErrorMessage.set(null);
    try {
      await this.mediaLibraryService.updateModerationMode(this.eventRef, mode);
      this.moderationMode.set(mode);
      this.actionSuccessMessage.set(
        `Modo de moderación actualizado a: ${
          mode === 'AUTO_PUBLISH' ? 'Publicación automática' : 'Revisión previa del organizador'
        }.`
      );
    } catch (err: unknown) {
      this.handleActionError(err, 'actualizar el modo de moderación');
    }
  }

  onRetryCycleSubmitted(response: RetryCycleResponse): void {
    this.retryCycleTriggered.emit(response);
    void this.loadLibrary();
  }

  async onDownloadTriggered(item: MediaCardModel): Promise<void> {
    this.downloadItemTriggered.emit(item);
    this.clearAlerts();
    if (!item.capabilities?.canDownloadOriginal) {
      this.actionErrorMessage.set('La descarga del archivo original no está permitida para este medio.');
      return;
    }
    try {
      const grant = await this.mediaLibraryService.requestOriginalDownload(
        this.eventRef,
        item.mediaRef
      );
      if (typeof window !== 'undefined' && grant.downloadUrl) {
        window.open(grant.downloadUrl, '_blank');
      }
      this.actionSuccessMessage.set(
        `Enlace de descarga para «${item.fileName}» generado. La transferencia del archivo original se gestiona a través del navegador.`
      );
    } catch (err: unknown) {
      this.handleActionError(err, 'descargar el archivo original');
    }
  }

  // --- ACCIONES DIRECTAS DE MODERACIÓN ---

  async onApproveRequested(media: MediaCardModel): Promise<void> {
    this.clearAlerts();
    try {
      await this.mediaLibraryService.approveMedia(this.eventRef, media.mediaRef);
      this.actionSuccessMessage.set(`«${media.fileName}» fue aprobada y publicada en la galería.`);
      await this.loadLibrary();
    } catch (err: unknown) {
      this.handleActionError(err, 'aprobar la foto/video');
    }
  }

  async onRepublishRequested(media: MediaCardModel): Promise<void> {
    this.clearAlerts();
    try {
      await this.mediaLibraryService.republishMedia(this.eventRef, media.mediaRef);
      this.actionSuccessMessage.set(`«${media.fileName}» fue vuelta a publicar.`);
      await this.loadLibrary();
    } catch (err: unknown) {
      this.handleActionError(err, 'volver a publicar');
    }
  }

  async onRestoreRequested(media: MediaCardModel): Promise<void> {
    this.clearAlerts();
    try {
      await this.mediaLibraryService.restoreMedia(this.eventRef, media.mediaRef);
      this.actionSuccessMessage.set(`«${media.fileName}» fue restaurada de la papelera con éxito.`);
      await this.loadLibrary();
    } catch (err: unknown) {
      this.handleActionError(err, 'restaurar de la papelera');
    }
  }

  // --- APERTURA DE DIALOGS DE CONFIRMACIÓN ---

  onHideRequested(media: MediaCardModel): void {
    this.clearAlerts();
    this.selectedDialogMedia.set(media);
    this.isHideDialogOpen.set(true);
  }

  onRejectRequested(media: MediaCardModel): void {
    this.clearAlerts();
    this.selectedDialogMedia.set(media);
    this.isRejectDialogOpen.set(true);
  }

  onTrashRequested(media: MediaCardModel): void {
    this.clearAlerts();
    this.selectedDialogMedia.set(media);
    this.isTrashDialogOpen.set(true);
  }

  closeDialogs(): void {
    this.isHideDialogOpen.set(false);
    this.isRejectDialogOpen.set(false);
    this.isTrashDialogOpen.set(false);
    this.selectedDialogMedia.set(null);
  }

  // --- CONFIRMACIÓN EN DIALOGS ---

  async onConfirmHide(media: MediaCardModel): Promise<void> {
    this.isDialogSubmitting.set(true);
    try {
      await this.mediaLibraryService.hideMedia(this.eventRef, media.mediaRef);
      this.closeDialogs();
      this.actionSuccessMessage.set(`«${media.fileName}» fue ocultada de la galería de invitados.`);
      await this.loadLibrary();
    } catch (err: unknown) {
      this.handleActionError(err, 'ocultar el archivo');
    } finally {
      this.isDialogSubmitting.set(false);
    }
  }

  async onConfirmReject(event: { media: MediaCardModel; reason?: string }): Promise<void> {
    this.isDialogSubmitting.set(true);
    try {
      await this.mediaLibraryService.rejectMedia(this.eventRef, event.media.mediaRef, event.reason);
      this.closeDialogs();
      this.actionSuccessMessage.set(`«${event.media.fileName}» fue rechazada.`);
      await this.loadLibrary();
    } catch (err: unknown) {
      this.handleActionError(err, 'rechazar el archivo');
    } finally {
      this.isDialogSubmitting.set(false);
    }
  }

  async onConfirmTrash(event: { media: MediaCardModel; reason?: string }): Promise<void> {
    this.isDialogSubmitting.set(true);
    try {
      await this.mediaLibraryService.trashMedia(this.eventRef, event.media.mediaRef, event.reason);
      this.closeDialogs();
      this.actionSuccessMessage.set(`«${event.media.fileName}» fue enviada a la papelera (retención 7 días).`);
      await this.loadLibrary();
    } catch (err: unknown) {
      this.handleActionError(err, 'mover a papelera');
    } finally {
      this.isDialogSubmitting.set(false);
    }
  }

  private clearAlerts(): void {
    this.actionSuccessMessage.set(null);
    this.actionErrorMessage.set(null);
  }

  private handleActionError(err: unknown, actionDesc: string): void {
    const code = err instanceof Error ? err.message : '';
    if (code === 'SAFETY_BLOCKED') {
      this.actionErrorMessage.set('Acción denegada: El archivo tiene un bloqueo de seguridad vigente.');
    } else if (code === 'CONCURRENCY_CONFLICT') {
      this.actionErrorMessage.set('Conflicto concurrente: El archivo cambió en el servidor. Actualiza la lista.');
    } else if (code === 'RESTORE_WINDOW_EXPIRED') {
      this.actionErrorMessage.set('Ventana vencida: El archivo ya superó los 7 días en papelera y no puede restaurarse.');
    } else if (code === 'EXPORT_EXPIRED') {
      this.actionErrorMessage.set('La exportación ha expirado (ventana de 48h vencida). Puedes volver a generarla.');
    } else if (code === 'EXPORT_INVALIDATED') {
      this.actionErrorMessage.set('La exportación fue invalidada debido al retiro o cambio de acceso de archivos.');
    } else if (code === 'EXPORT_UNAVAILABLE') {
      this.actionErrorMessage.set('La exportación aún no está disponible para descarga.');
    } else if (code === 'PART_NOT_FOUND') {
      this.actionErrorMessage.set('La parte de exportación solicitada no fue encontrada.');
    } else if (code === 'NOT_FOUND') {
      this.actionErrorMessage.set('El recurso solicitado no fue encontrado.');
    } else if (code === 'ACCESS_DENIED') {
      this.actionErrorMessage.set(`Permiso denegado para ${actionDesc}.`);
    } else {
      this.actionErrorMessage.set(`Ocurrió un error al intentar ${actionDesc}.`);
    }
  }
}
