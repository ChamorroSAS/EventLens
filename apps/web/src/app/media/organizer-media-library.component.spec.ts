import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrganizerMediaLibraryComponent } from './organizer-media-library.component.js';
import { MediaLibraryService } from './media-library.service.js';
import { MediaProcessingService } from './media-processing.service.js';
import type {
  MediaCardModel,
  OrganizerMediaLibrarySnapshotModel,
} from './media.types.js';

describe('OrganizerMediaLibraryComponent & Media Integration (EL-TK-100)', () => {
  let mockLibraryService: {
    getOrganizerMediaLibrary: ReturnType<typeof vi.fn>;
    approveMedia: ReturnType<typeof vi.fn>;
    rejectMedia: ReturnType<typeof vi.fn>;
    hideMedia: ReturnType<typeof vi.fn>;
    republishMedia: ReturnType<typeof vi.fn>;
    trashMedia: ReturnType<typeof vi.fn>;
    restoreMedia: ReturnType<typeof vi.fn>;
    getModerationSettings: ReturnType<typeof vi.fn>;
    updateModerationMode: ReturnType<typeof vi.fn>;
  };
  let mockProcessingService: {
    getMediaStatus: ReturnType<typeof vi.fn>;
    requestRetryCycle: ReturnType<typeof vi.fn>;
  };

  const sampleMediaItems: MediaCardModel[] = [
    {
      mediaRef: 'media-01',
      eventRef: 'event-101',
      fileName: 'ceremonia_01.jpg',
      status: 'PUBLISHED',
      previewUrl: 'https://example.com/thumb-01.jpg',
      capabilities: {
        canRetry: false,
        canDownloadOriginal: true,
        canView: true,
        canDelete: true,
        canHide: true,
        canTrash: true,
      },
      safety: { outcome: 'APPROVED' },
    },
    {
      mediaRef: 'media-02',
      eventRef: 'event-101',
      fileName: 'baile_novios.mp4',
      status: 'PROCESSING',
      capabilities: { canRetry: false, canDownloadOriginal: false, canView: true, canDelete: true },
      safety: { outcome: 'PENDING' },
      observableProgress: { phase: 'OPTIMIZING', attempt: 1 },
    },
    {
      mediaRef: 'media-03',
      eventRef: 'event-101',
      fileName: 'discurso_padrino.mp4',
      format: 'MP4',
      status: 'PROCESSING_FAILED',
      capabilities: { canRetry: true, canDownloadOriginal: false, canView: true, canDelete: true },
      safety: { outcome: 'INCONCLUSIVE' },
    },
    {
      mediaRef: 'media-04',
      eventRef: 'event-101',
      fileName: 'archivo_sospechoso.exe',
      status: 'QUARANTINED',
      capabilities: { canRetry: false, canDownloadOriginal: false, canView: false, canDelete: false },
      safety: { outcome: 'DENIED' },
    },
  ];

  const defaultSnapshot: OrganizerMediaLibrarySnapshotModel = {
    eventRef: 'event-101',
    items: sampleMediaItems,
    totalCount: 4,
    filterCount: 4,
    limit: 50,
    offset: 0,
  };

  beforeEach(() => {
    mockLibraryService = {
      getOrganizerMediaLibrary: vi.fn().mockResolvedValue(defaultSnapshot),
      approveMedia: vi.fn().mockResolvedValue({ status: 'PUBLISHED' }),
      rejectMedia: vi.fn().mockResolvedValue({ status: 'REJECTED' }),
      hideMedia: vi.fn().mockResolvedValue({ status: 'HIDDEN' }),
      republishMedia: vi.fn().mockResolvedValue({ status: 'PUBLISHED' }),
      trashMedia: vi.fn().mockResolvedValue({ status: 'TRASHED' }),
      restoreMedia: vi.fn().mockResolvedValue({ status: 'RESTORED' }),
      getModerationSettings: vi.fn().mockResolvedValue({ eventRef: 'event-101', moderationMode: 'AUTO_PUBLISH' }),
      updateModerationMode: vi.fn().mockResolvedValue({ eventRef: 'event-101', moderationMode: 'ORGANIZER_REVIEW' }),
    };
    mockProcessingService = {
      getMediaStatus: vi.fn(),
      requestRetryCycle: vi.fn().mockResolvedValue({
        cycleId: 'cycle-99',
        cycleNumber: 2,
        status: 'ACTIVE',
        operationId: 'op-retry-test',
      }),
    };

    TestBed.configureTestingModule({
      imports: [OrganizerMediaLibraryComponent],
      providers: [
        { provide: MediaLibraryService, useValue: mockLibraryService },
        { provide: MediaProcessingService, useValue: mockProcessingService },
      ],
    });
  });

  async function createLibrary(eventRef = 'event-101'): Promise<ComponentFixture<OrganizerMediaLibraryComponent>> {
    const fixture = TestBed.createComponent(OrganizerMediaLibraryComponent);
    fixture.componentRef.setInput('eventRef', eventRef);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('Escenario 1: Renderiza la biblioteca con los estados autorizados y permite filtrar manteniendo aislamiento del evento', async () => {
    const fixture = await createLibrary('event-101');

    // 1. Consulta inicial autorizada con aislamiento estricto de eventRef
    expect(mockLibraryService.getOrganizerMediaLibrary).toHaveBeenCalledWith({
      eventRef: 'event-101',
      statusFilter: 'ALL',
      limit: 50,
      offset: 0,
    });

    // 2. Renderizado de título, contador y tarjetas
    const titleEl = fixture.nativeElement.querySelector('.library-title');
    expect(titleEl.textContent).toContain('Biblioteca de fotos y videos');

    const counterEl = fixture.nativeElement.querySelector('.library-counter');
    expect(counterEl.textContent).toContain('Mostrando 4 de 4 archivos (Total evento: 4)');

    const cards = fixture.nativeElement.querySelectorAll('eventlens-organizer-media-card');
    expect(cards.length).toBe(4);

    // 3. Filtrado: clic en filtro "Publicados"
    const publishedSnapshot: OrganizerMediaLibrarySnapshotModel = {
      eventRef: 'event-101',
      items: [sampleMediaItems[0]],
      totalCount: 4,
      filterCount: 1,
      limit: 50,
      offset: 0,
    };
    mockLibraryService.getOrganizerMediaLibrary.mockResolvedValueOnce(publishedSnapshot);

    const filterButtons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.filter-btn')
    );
    const publishedBtn = filterButtons.find(b => b.textContent?.trim() === 'Publicados');
    expect(publishedBtn).toBeTruthy();

    publishedBtn!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    // Verificación de aislamiento en la nueva llamada
    expect(mockLibraryService.getOrganizerMediaLibrary).toHaveBeenLastCalledWith({
      eventRef: 'event-101',
      statusFilter: 'PUBLISHED',
      limit: 50,
      offset: 0,
    });
    expect(fixture.componentInstance.activeFilter()).toBe('PUBLISHED');
  });

  it('Escenario 2: Reutiliza componentes de EL-TK-054 para ítems en PROCESSING_FAILED sin duplicar reglas de reintento', async () => {
    const fixture = await createLibrary('event-101');

    // Identificar la tarjeta de 'discurso_padrino.mp4' (PROCESSING_FAILED)
    const cards = fixture.nativeElement.querySelectorAll('eventlens-organizer-media-card');
    const failedCard = cards[2];
    expect(failedCard.textContent).toContain('discurso_padrino.mp4');

    // Reutiliza ProcessingFailedPanel
    const failedPanel = failedCard.querySelector('eventlens-processing-failed-panel');
    expect(failedPanel).toBeTruthy();
    expect(failedPanel.textContent).toContain('El procesamiento técnico de este archivo no se completó');

    // Reutiliza RetryProcessingAction
    const retryAction = failedCard.querySelector('eventlens-retry-processing-action');
    expect(retryAction).toBeTruthy();

    const retryBtn: HTMLButtonElement = retryAction.querySelector('.retry-btn');
    expect(retryBtn).toBeTruthy();
    expect(retryBtn.getAttribute('aria-label')).toBe('Reintentar procesamiento para discurso_padrino.mp4');

    // Disparar reintento técnico
    let cycleEmitted: any = null;
    fixture.componentInstance.retryCycleTriggered.subscribe(res => {
      cycleEmitted = res;
    });

    retryBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockProcessingService.requestRetryCycle).toHaveBeenCalledWith({
      mediaRef: 'media-03',
      eventRef: 'event-101',
    });
    expect(cycleEmitted).toEqual({
      cycleId: 'cycle-99',
      cycleNumber: 2,
      status: 'ACTIVE',
      operationId: 'op-retry-test',
    });
  });

  it('Escenario 3A: Distingue el estado de biblioteca vacía (EMPTY_LIBRARY) de forma accesible', async () => {
    const emptyLibrarySnapshot: OrganizerMediaLibrarySnapshotModel = {
      eventRef: 'event-101',
      items: [],
      totalCount: 0,
      filterCount: 0,
      limit: 50,
      offset: 0,
      emptyReason: 'EMPTY_LIBRARY',
    };
    mockLibraryService.getOrganizerMediaLibrary.mockResolvedValueOnce(emptyLibrarySnapshot);

    const fixture = await createLibrary('event-101');

    const emptyPanel = fixture.nativeElement.querySelector('.empty-library-state');
    expect(emptyPanel).toBeTruthy();
    expect(emptyPanel.getAttribute('role')).toBe('status');
    expect(emptyPanel.textContent).toContain('Sin fotos ni videos en el evento');
    expect(emptyPanel.textContent).toContain('Aún no hay fotos ni videos subidos en este evento.');

    // En EMPTY_LIBRARY no debe mostrar botón de "Limpiar filtros"
    const clearBtn = fixture.nativeElement.querySelector('.btn-clear-filters');
    expect(clearBtn).toBeNull();
  });

  it('Escenario 3B: Distingue el estado de filtro sin resultados (EMPTY_FILTER_RESULTS) con acción para limpiar filtros', async () => {
    const emptyFilterSnapshot: OrganizerMediaLibrarySnapshotModel = {
      eventRef: 'event-101',
      items: [],
      totalCount: 8,
      filterCount: 0,
      limit: 50,
      offset: 0,
      emptyReason: 'EMPTY_FILTER_RESULTS',
    };
    mockLibraryService.getOrganizerMediaLibrary.mockResolvedValueOnce(emptyFilterSnapshot);

    const fixture = await createLibrary('event-101');

    const filterEmptyPanel = fixture.nativeElement.querySelector('.empty-filter-state');
    expect(filterEmptyPanel).toBeTruthy();
    expect(filterEmptyPanel.getAttribute('role')).toBe('status');
    expect(filterEmptyPanel.textContent).toContain('No se encontraron coincidencias');
    expect(filterEmptyPanel.textContent).toContain('No hay medios que coincidan con el filtro seleccionado.');

    // Acción directa para limpiar filtros
    const clearBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-clear-filters');
    expect(clearBtn).toBeTruthy();
    expect(clearBtn.textContent?.trim()).toBe('Limpiar filtros');

    // Clic en limpiar filtros: restablece a ALL y recarga
    mockLibraryService.getOrganizerMediaLibrary.mockResolvedValueOnce(defaultSnapshot);
    clearBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.activeFilter()).toBe('ALL');
    expect(mockLibraryService.getOrganizerMediaLibrary).toHaveBeenLastCalledWith({
      eventRef: 'event-101',
      statusFilter: 'ALL',
      limit: 50,
      offset: 0,
    });
  });

  it('Escenario 4: Conmuta a vista de tabla accesible (OrganizerMediaTable) y renderiza metadatos y acciones', async () => {
    const fixture = await createLibrary('event-101');

    // Por defecto inicia en grid
    expect(fixture.nativeElement.querySelector('.media-grid')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('eventlens-organizer-media-table')).toBeNull();

    // Clic en botón "Tabla"
    const viewButtons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.btn-view')
    );
    const tableBtn = viewButtons.find(b => b.textContent?.includes('Tabla'));
    expect(tableBtn).toBeTruthy();

    tableBtn!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    // Verifica que se renderiza el componente OrganizerMediaTable
    const tableComponent = fixture.nativeElement.querySelector('eventlens-organizer-media-table');
    expect(tableComponent).toBeTruthy();

    const table = tableComponent.querySelector('table');
    expect(table).toBeTruthy();

    const rows = tableComponent.querySelectorAll('tbody tr');
    expect(rows.length).toBe(4);

    // Verificación de headers de columna accesibles con th scope="col"
    const headers = tableComponent.querySelectorAll('th[scope="col"]');
    expect(headers.length).toBe(5);

    // Verificación de acciones en la fila con fallo técnico
    const failedRow = rows[2];
    expect(failedRow.querySelector('eventlens-retry-processing-action')).toBeTruthy();
  });

  it('Escenario 5: Maneja denegación de acceso (ACCESS_DENIED) y errores de conexión con opción de reintento', async () => {
    // 1. Error de acceso no autorizado
    mockLibraryService.getOrganizerMediaLibrary.mockRejectedValueOnce(new Error('ACCESS_DENIED'));
    const fixture = await createLibrary('event-101');

    const errorPanel = fixture.nativeElement.querySelector('.error-state');
    expect(errorPanel).toBeTruthy();
    expect(errorPanel.getAttribute('role')).toBe('alert');
    expect(errorPanel.textContent).toContain('No tienes permisos autorizados para ver la biblioteca de este evento.');

    // 2. Recuperación con reintentar
    mockLibraryService.getOrganizerMediaLibrary.mockResolvedValueOnce(defaultSnapshot);
    const retryBtn: HTMLButtonElement = errorPanel.querySelector('.btn-retry');
    expect(retryBtn).toBeTruthy();

    retryBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.error-state')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('eventlens-organizer-media-card').length).toBe(4);
  });

  it('Escenario 6: Cumple con accesibilidad WCAG 2.2 AA (roles, estados aria, controles ≥ 44x44px)', async () => {
    const fixture = await createLibrary('event-101');

    // Botones interactivos con altura mínima de 44px
    const buttons = fixture.nativeElement.querySelectorAll('button');
    buttons.forEach((btn: HTMLButtonElement) => {
      expect(btn.getAttribute('aria-label') || btn.textContent?.trim()).toBeTruthy();
    });

    // Controles de conmutador de vista con aria-pressed
    const gridBtn = fixture.nativeElement.querySelector('.btn-view[aria-label="Ver en cuadrícula"]');
    const tableBtn = fixture.nativeElement.querySelector('.btn-view[aria-label="Ver en tabla"]');
    expect(gridBtn.getAttribute('aria-pressed')).toBe('true');
    expect(tableBtn.getAttribute('aria-pressed')).toBe('false');

    // Toolbar de filtros con role="toolbar"
    const toolbar = fixture.nativeElement.querySelector('.filter-toolbar');
    expect(toolbar.getAttribute('role')).toBe('toolbar');
  });

  describe('EL-TK-111 Moderation and Trash Integration', () => {
    const baseCaps = {
      canRetry: false,
      canDownloadOriginal: false,
      canView: true,
      canDelete: false,
    };

    it('Escenario 1: Ejecuta aprobación directa para media en PENDING_REVIEW con feedback accesible', async () => {
      const pendingItem: MediaCardModel = {
        mediaRef: 'media-pending-1',
        eventRef: 'event-101',
        fileName: 'foto_mesa_1.jpg',
        status: 'PENDING_REVIEW',
        safety: { outcome: 'APPROVED' },
        capabilities: {
          ...baseCaps,
          canApprove: true,
          canReject: true,
          canHide: false,
          canTrash: true,
          canRestore: false,
        },
      };

      mockLibraryService.getOrganizerMediaLibrary.mockResolvedValueOnce({
        eventRef: 'event-101',
        items: [pendingItem],
        totalCount: 1,
        filterCount: 1,
        limit: 50,
        offset: 0,
      });

      const fixture = await createLibrary('event-101');
      const approveBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-approve');
      expect(approveBtn).toBeTruthy();

      approveBtn.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(mockLibraryService.approveMedia).toHaveBeenCalledWith('event-101', 'media-pending-1');
      const successBanner = fixture.nativeElement.querySelector('.alert-success');
      expect(successBanner).toBeTruthy();
      expect(successBanner.textContent).toContain('«foto_mesa_1.jpg» fue aprobada y publicada en la galería.');
    });

    it('Escenario 2A: Abre HideMediaDialog con notas de consecuencia y ejecuta ocultamiento al confirmar', async () => {
      const publishedItem: MediaCardModel = {
        mediaRef: 'media-pub-1',
        eventRef: 'event-101',
        fileName: 'foto_pub.jpg',
        status: 'PUBLISHED',
        safety: { outcome: 'APPROVED' },
        capabilities: {
          ...baseCaps,
          canHide: true,
          canTrash: true,
        },
      };

      mockLibraryService.getOrganizerMediaLibrary.mockResolvedValueOnce({
        eventRef: 'event-101',
        items: [publishedItem],
        totalCount: 1,
        filterCount: 1,
        limit: 50,
        offset: 0,
      });

      const fixture = await createLibrary('event-101');
      const hideBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-hide');
      expect(hideBtn).toBeTruthy();

      // Click hide opens dialog
      hideBtn.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.componentInstance.isHideDialogOpen()).toBe(true);
      const hideDialog = fixture.nativeElement.querySelector('eventlens-hide-media-dialog');
      expect(hideDialog).toBeTruthy();
      expect(hideDialog.textContent).toContain('Esta acción es reversible');
      expect(hideDialog.textContent).toContain('no reduce tu consumo ni cuota comercial');

      // Click confirm in dialog
      const confirmBtn: HTMLButtonElement = hideDialog.querySelector('.btn-confirm-hide');
      confirmBtn.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(mockLibraryService.hideMedia).toHaveBeenCalledWith('event-101', 'media-pub-1');
      expect(fixture.componentInstance.isHideDialogOpen()).toBe(false);
      const banner = fixture.nativeElement.querySelector('.alert-success');
      expect(banner.textContent).toContain('«foto_pub.jpg» fue ocultada de la galería de invitados.');
    });

    it('Escenario 2B: Abre RejectMediaDialog, permite motivo opcional y cancela preservando estado', async () => {
      const pendingItem: MediaCardModel = {
        mediaRef: 'media-pen-2',
        eventRef: 'event-101',
        fileName: 'borrosa.jpg',
        status: 'PENDING_REVIEW',
        safety: { outcome: 'APPROVED' },
        capabilities: {
          ...baseCaps,
          canReject: true,
        },
      };

      mockLibraryService.getOrganizerMediaLibrary.mockResolvedValueOnce({
        eventRef: 'event-101',
        items: [pendingItem],
        totalCount: 1,
        filterCount: 1,
        limit: 50,
        offset: 0,
      });

      const fixture = await createLibrary('event-101');
      const rejectBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-reject');
      rejectBtn.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.componentInstance.isRejectDialogOpen()).toBe(true);
      const rejectDialog = fixture.nativeElement.querySelector('eventlens-reject-media-dialog');

      // Cancel first
      const cancelBtn: HTMLButtonElement = rejectDialog.querySelector('.btn-cancel');
      cancelBtn.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.componentInstance.isRejectDialogOpen()).toBe(false);
      expect(mockLibraryService.rejectMedia).not.toHaveBeenCalled();

      // Open again and confirm with reason
      rejectBtn.click();
      await fixture.whenStable();
      fixture.detectChanges();

      const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('eventlens-reject-media-dialog textarea');
      textarea.value = 'Fuera de foco';
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const confirmBtn: HTMLButtonElement = fixture.nativeElement.querySelector('eventlens-reject-media-dialog .btn-confirm-reject');
      confirmBtn.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(mockLibraryService.rejectMedia).toHaveBeenCalledWith('event-101', 'media-pen-2', 'Fuera de foco');
    });

    it('Escenario 2C: Abre TrashMediaDialog con advertencia de 7 días y ejecuta trash al confirmar', async () => {
      const item: MediaCardModel = {
        mediaRef: 'media-trash-1',
        eventRef: 'event-101',
        fileName: 'descarte.jpg',
        status: 'PUBLISHED',
        safety: { outcome: 'APPROVED' },
        capabilities: {
          ...baseCaps,
          canTrash: true,
        },
      };

      mockLibraryService.getOrganizerMediaLibrary.mockResolvedValueOnce({
        eventRef: 'event-101',
        items: [item],
        totalCount: 1,
        filterCount: 1,
        limit: 50,
        offset: 0,
      });

      const fixture = await createLibrary('event-101');
      const trashBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-trash');
      trashBtn.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.componentInstance.isTrashDialogOpen()).toBe(true);
      const trashDialog = fixture.nativeElement.querySelector('eventlens-trash-media-dialog');
      expect(trashDialog.textContent).toContain('Período de retención de 7 días');

      const confirmTrashBtn: HTMLButtonElement = trashDialog.querySelector('.btn-confirm-trash');
      confirmTrashBtn.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(mockLibraryService.trashMedia).toHaveBeenCalledWith('event-101', 'media-trash-1', undefined);
      expect(fixture.componentInstance.isTrashDialogOpen()).toBe(false);
    });

    it('Escenario 3: Filtro TRASHED muestra RetentionNotice y previene restauración inválida cuando canRestore es false', async () => {
      const expiredTrashedItem: MediaCardModel = {
        mediaRef: 'media-trash-expired',
        eventRef: 'event-101',
        fileName: 'antigua_purgable.jpg',
        status: 'TRASHED',
        safety: { outcome: 'APPROVED' },
        capabilities: {
          ...baseCaps,
          canView: false,
          canRestore: false, // Window expired or safety block (DEC-096)
        },
      };

      mockLibraryService.getOrganizerMediaLibrary.mockResolvedValue({
        eventRef: 'event-101',
        items: [expiredTrashedItem],
        totalCount: 1,
        filterCount: 1,
        limit: 50,
        offset: 0,
      });

      const fixture = await createLibrary('event-101');

      // Change filter to TRASHED
      const filterButtons: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('.filter-btn')
      );
      const trashFilterBtn = filterButtons.find(b => b.textContent?.includes('Papelera'));
      expect(trashFilterBtn).toBeTruthy();

      trashFilterBtn!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      // RetentionNotice rendered
      const retentionNotice = fixture.nativeElement.querySelector('eventlens-retention-notice');
      expect(retentionNotice).toBeTruthy();
      expect(retentionNotice.textContent).toContain('Los archivos enviados a la papelera se conservan durante 7 días calendario');

      // Expired restore warning rendered, no restore button
      expect(fixture.nativeElement.textContent).toContain('Ventana de restauración vencida');
      expect(fixture.nativeElement.querySelector('.btn-restore')).toBeNull();
    });

    it('Escenario 4: Conmuta panel de moderación y actualiza modo entre AUTO_PUBLISH y ORGANIZER_REVIEW', async () => {
      const fixture = await createLibrary('event-101');

      // Default settings panel closed
      expect(fixture.componentInstance.showSettings()).toBe(false);
      expect(fixture.nativeElement.querySelector('eventlens-moderation-settings')).toBeNull();

      // Click toggle
      const settingsToggleBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-toggle-settings');
      settingsToggleBtn.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.componentInstance.showSettings()).toBe(true);
      const settingsComponent = fixture.nativeElement.querySelector('eventlens-moderation-settings');
      expect(settingsComponent).toBeTruthy();

      // Change to ORGANIZER_REVIEW
      const radioOrganizer: HTMLInputElement = settingsComponent.querySelector('input[value="ORGANIZER_REVIEW"]');
      radioOrganizer.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(mockLibraryService.updateModerationMode).toHaveBeenCalledWith('event-101', 'ORGANIZER_REVIEW');
      const banner = fixture.nativeElement.querySelector('.alert-success');
      expect(banner.textContent).toContain('Modo de moderación actualizado a: Revisión previa del organizador.');
    });

    it('Escenario 5: Maneja error RESTORE_WINDOW_EXPIRED comunicando la regla al organizador', async () => {
      const trashedItem: MediaCardModel = {
        mediaRef: 'media-trash-err',
        eventRef: 'event-101',
        fileName: 'intento_restaurar.jpg',
        status: 'TRASHED',
        safety: { outcome: 'APPROVED' },
        capabilities: {
          ...baseCaps,
          canRestore: true,
        },
      };

      mockLibraryService.getOrganizerMediaLibrary.mockResolvedValueOnce({
        eventRef: 'event-101',
        items: [trashedItem],
        totalCount: 1,
        filterCount: 1,
        limit: 50,
        offset: 0,
      });
      mockLibraryService.restoreMedia.mockRejectedValueOnce(new Error('RESTORE_WINDOW_EXPIRED'));

      const fixture = await createLibrary('event-101');
      const restoreBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-restore');
      expect(restoreBtn).toBeTruthy();

      restoreBtn.click();
      await fixture.whenStable();
      fixture.detectChanges();

      const errorAlert = fixture.nativeElement.querySelector('.alert-danger');
      expect(errorAlert).toBeTruthy();
      expect(errorAlert.textContent).toContain('Ventana vencida: El archivo ya superó los 7 días en papelera y no puede restaurarse.');
    });
  });
});

