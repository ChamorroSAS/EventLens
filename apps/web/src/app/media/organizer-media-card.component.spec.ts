import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrganizerMediaCardComponent } from './organizer-media-card.component.js';
import { MediaProcessingService } from './media-processing.service.js';
import type { MediaCardModel } from './media.types.js';

describe('OrganizerMediaCard & media failure/retry states (EL-TK-054)', () => {
  let mockProcessingService: {
    getMediaStatus: ReturnType<typeof vi.fn>;
    requestRetryCycle: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockProcessingService = {
      getMediaStatus: vi.fn(),
      requestRetryCycle: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [OrganizerMediaCardComponent],
      providers: [
        { provide: MediaProcessingService, useValue: mockProcessingService },
      ],
    });
  });

  function createComponent(media: MediaCardModel): ComponentFixture<OrganizerMediaCardComponent> {
    const fixture = TestBed.createComponent(OrganizerMediaCardComponent);
    fixture.componentRef.setInput('media', media);
    fixture.detectChanges();
    return fixture;
  }

  it('renders legible text and accessible badge in absence of preview for UPLOADED and PROCESSING', () => {
    // 1. UPLOADED
    const uploadedMedia: MediaCardModel = {
      mediaRef: 'media-1',
      eventRef: 'event-1',
      fileName: 'invitados_01.jpg',
      status: 'UPLOADED',
      capabilities: { canRetry: false, canDownloadOriginal: false, canView: true, canDelete: true },
      safety: { outcome: 'PENDING' },
    };
    const fixture1 = createComponent(uploadedMedia);
    expect(fixture1.nativeElement.textContent).toContain('Archivo recibido, en cola de inspección');
    expect(fixture1.nativeElement.querySelector('.badge').textContent.trim()).toBe('Subido');

    // 2. PROCESSING with observable progress
    const processingMedia: MediaCardModel = {
      mediaRef: 'media-2',
      eventRef: 'event-1',
      fileName: 'baile_novios.mp4',
      status: 'PROCESSING',
      capabilities: { canRetry: false, canDownloadOriginal: false, canView: true, canDelete: true },
      safety: { outcome: 'PENDING' },
      observableProgress: { phase: 'INSPECTION', attempt: 1 },
    };
    const fixture2 = createComponent(processingMedia);
    expect(fixture2.nativeElement.textContent).toContain('Procesando archivo multimedia…');
    expect(fixture2.nativeElement.textContent).toContain('Intento 1');
    expect(fixture2.nativeElement.textContent).toContain('(INSPECTION)');
    expect(fixture2.nativeElement.querySelector('.badge').textContent.trim()).toBe('Procesando');
  });

  it('respects DEC-075 in PROCESSING_FAILED: INCONCLUSIVE safety allows retry but DENIES download', () => {
    const failedInconclusive: MediaCardModel = {
      mediaRef: 'media-3',
      eventRef: 'event-1',
      fileName: 'foto_oscura.jpg',
      format: 'JPEG',
      status: 'PROCESSING_FAILED',
      capabilities: {
        canRetry: true, // Retry is permitted for inconclusive to re-examine in new cycle (DEC-076)
        canDownloadOriginal: false, // Download strictly requires APPROVED safety (DEC-075)
        canView: true,
        canDelete: true,
      },
      safety: { outcome: 'INCONCLUSIVE' },
    };

    const fixture = createComponent(failedInconclusive);
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('El procesamiento técnico de este archivo no se completó');
    expect(text).toContain('La inspección de seguridad inicial fue no concluyente');
    expect(text).toContain('la descarga del archivo original permanece deshabilitada');

    // Retry action is rendered
    const retryBtn = fixture.nativeElement.querySelector('.retry-btn');
    expect(retryBtn).toBeTruthy();
    expect(retryBtn.getAttribute('aria-label')).toBe('Reintentar procesamiento para foto_oscura.jpg');

    // Download action is NOT rendered
    const downloadBtn = fixture.nativeElement.querySelector('.download-btn');
    expect(downloadBtn).toBeNull();
  });

  it('respects DEC-075 in PROCESSING_FAILED: APPROVED safety allows BOTH retry and original download', () => {
    const failedApproved: MediaCardModel = {
      mediaRef: 'media-4',
      eventRef: 'event-1',
      fileName: 'video_brindis.mp4',
      format: 'MP4',
      status: 'PROCESSING_FAILED',
      capabilities: {
        canRetry: true,
        canDownloadOriginal: true, // APPROVED safety permits download eligibility
        canView: true,
        canDelete: true,
      },
      safety: { outcome: 'APPROVED' },
    };

    const fixture = createComponent(failedApproved);
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('El archivo original fue aprobado por seguridad');
    expect(text).toContain('está disponible para descarga');

    // Both actions are present
    const retryBtn = fixture.nativeElement.querySelector('.retry-btn');
    expect(retryBtn).toBeTruthy();
    const downloadBtn = fixture.nativeElement.querySelector('.download-btn');
    expect(downloadBtn).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Original seguro verificado');
  });

  it('enforces QUARANTINED state as strictly read-only: no retry and no download options', () => {
    const quarantinedMedia: MediaCardModel = {
      mediaRef: 'media-q',
      eventRef: 'event-1',
      fileName: 'archivo_sospechoso.exe',
      status: 'QUARANTINED',
      capabilities: {
        canRetry: false, // Quarantine can never be retried by organizer
        canDownloadOriginal: false, // Quarantine cannot be downloaded
        canView: false,
        canDelete: false,
      },
      safety: { outcome: 'DENIED' },
    };

    const fixture = createComponent(quarantinedMedia);
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('Contenido en cuarentena preventiva');
    expect(text).toContain('Este archivo fue aislado de manera preventiva tras la inspección de seguridad');
    expect(text).toContain('sin opciones de liberación o reintento por el organizador');

    // Zero action buttons available to organizer
    expect(fixture.nativeElement.querySelector('.retry-btn')).toBeNull();
    expect(fixture.nativeElement.querySelector('.download-btn')).toBeNull();
  });

  it('prevents double submission on retry, confirms cycle submission, and does NOT announce premature PROCESSING', async () => {
    const media: MediaCardModel = {
      mediaRef: 'media-retry-1',
      eventRef: 'event-1',
      fileName: 'discurso.mp4',
      status: 'PROCESSING_FAILED',
      capabilities: { canRetry: true, canDownloadOriginal: false, canView: true, canDelete: true },
      safety: { outcome: 'INCONCLUSIVE' },
    };

    let resolvePromise!: (val: any) => void;
    mockProcessingService.requestRetryCycle.mockReturnValue(
      new Promise(resolve => {
        resolvePromise = resolve;
      })
    );

    const fixture = createComponent(media);
    const retryBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.retry-btn');
    expect(retryBtn.disabled).toBe(false);

    // Click retry
    retryBtn.click();
    fixture.detectChanges();

    // Immediately disabled while submitting to prevent double-click
    expect(retryBtn.disabled).toBe(true);
    expect(retryBtn.textContent).toContain('Enviando solicitud…');

    // Resolve API response with new cycle #2
    resolvePromise({
      cycleId: 'cycle-123',
      cycleNumber: 2,
      status: 'ACTIVE',
      operationId: 'op-1',
    });

    await fixture.whenStable();
    fixture.detectChanges();

    // Re-enabled after submission
    expect(retryBtn.disabled).toBe(false);

    // Verify accessible confirmation message in aria-live container
    const statusMsg = fixture.nativeElement.querySelector('.retry-action-container [role="status"]');
    expect(statusMsg).toBeTruthy();
    expect(statusMsg.textContent).toContain('Solicitud aceptada. Se programó el ciclo #2.');
    // Invariant: does not falsely declare that the media is already PROCESSING
    expect(statusMsg.textContent).toContain('El procesamiento iniciará al reservar un ejecutor.');
  });

  it('handles conflict (active cycle already present) gracefully by refreshing capabilities', async () => {
    const media: MediaCardModel = {
      mediaRef: 'media-conflict-1',
      eventRef: 'event-1',
      fileName: 'vals.jpg',
      status: 'PROCESSING_FAILED',
      capabilities: { canRetry: true, canDownloadOriginal: false, canView: true, canDelete: true },
      safety: { outcome: 'INCONCLUSIVE' },
    };

    mockProcessingService.requestRetryCycle.mockRejectedValue(new Error('CYCLE_ALREADY_ACTIVE'));

    const fixture = createComponent(media);
    let refreshTriggered = false;
    fixture.componentInstance.refreshRequested.subscribe(() => {
      refreshTriggered = true;
    });

    const retryBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.retry-btn');
    retryBtn.click();

    await fixture.whenStable();
    fixture.detectChanges();

    expect(refreshTriggered).toBe(true);
    const feedback = fixture.nativeElement.querySelector('.feedback-msg');
    expect(feedback.textContent).toContain('Un ciclo de reintento ya se encuentra activo para este archivo');
  });

  it('handles authorization failure with sanitized message without leaking private details', async () => {
    const media: MediaCardModel = {
      mediaRef: 'media-denied-1',
      eventRef: 'event-1',
      fileName: 'entrada.jpg',
      status: 'PROCESSING_FAILED',
      capabilities: { canRetry: true, canDownloadOriginal: false, canView: true, canDelete: true },
      safety: { outcome: 'INCONCLUSIVE' },
    };

    mockProcessingService.requestRetryCycle.mockRejectedValue(new Error('RETRY_DENIED'));

    const fixture = createComponent(media);
    const retryBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.retry-btn');
    retryBtn.click();

    await fixture.whenStable();
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain('No se pudo solicitar el reintento: permisos no válidos');
    expect(alert.textContent).not.toContain('RETRY_DENIED');
  });

  it('renders moderation actions according to capabilities and emits events (EL-TK-111)', () => {
    const pendingMedia: MediaCardModel = {
      mediaRef: 'media-pending-1',
      eventRef: 'event-1',
      fileName: 'selfie_mesa_3.jpg',
      status: 'PENDING_REVIEW',
      safety: { outcome: 'APPROVED' },
      capabilities: {
        canRetry: false,
        canDownloadOriginal: false,
        canView: true,
        canDelete: false,
        canApprove: true,
        canReject: true,
        canHide: false,
        canRepublish: false,
        canTrash: true,
        canRestore: false,
      },
    };

    const fixture = createComponent(pendingMedia);
    expect(fixture.nativeElement.querySelector('.badge').textContent.trim()).toBe('Pendiente');
    expect(fixture.nativeElement.textContent).toContain('Pendiente de aprobación del organizador');

    // Moderation action buttons present per capabilities
    const approveBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-approve');
    const rejectBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-reject');
    const trashBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-trash');
    const hideBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-hide');

    expect(approveBtn).toBeTruthy();
    expect(rejectBtn).toBeTruthy();
    expect(trashBtn).toBeTruthy();
    expect(hideBtn).toBeNull();

    let approvedEmitted = false;
    fixture.componentInstance.approveRequested.subscribe(m => {
      expect(m.mediaRef).toBe('media-pending-1');
      approvedEmitted = true;
    });

    approveBtn.click();
    expect(approvedEmitted).toBe(true);
  });

  it('renders trashed state with retention period badge and expired restore state when canRestore is false', () => {
    const trashedExpired: MediaCardModel = {
      mediaRef: 'media-trash-old',
      eventRef: 'event-1',
      fileName: 'borrosa.jpg',
      status: 'TRASHED',
      safety: { outcome: 'APPROVED' },
      capabilities: {
        canRetry: false,
        canDownloadOriginal: false,
        canView: false,
        canDelete: false,
        canRestore: false,
      },
    };

    const fixture = createComponent(trashedExpired);
    expect(fixture.nativeElement.querySelector('.badge').textContent.trim()).toBe('En papelera');
    expect(fixture.nativeElement.textContent).toContain('En papelera (retención 7 días)');
    expect(fixture.nativeElement.textContent).toContain('Ventana de restauración vencida');
    expect(fixture.nativeElement.querySelector('.btn-restore')).toBeNull();
  });
});

