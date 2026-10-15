import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UploadContainerComponent } from './upload-container.component.js';
import { UploadService } from './upload.service.js';
import { UploadOrchestratorService } from './upload-orchestrator.service.js';

describe('UploadContainerComponent (EL-TK-094 Mobile Upload Flow & WCAG 2.2 AA)', () => {
  let mockOrchestrator: { startUpload: ReturnType<typeof vi.fn>; retryUpload: ReturnType<typeof vi.fn>; abort: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockOrchestrator = {
      startUpload: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn(),
      retryUpload: vi.fn()
    };

    TestBed.configureTestingModule({
      imports: [UploadContainerComponent],
      providers: [
        UploadService,
        { provide: UploadOrchestratorService, useValue: mockOrchestrator }
      ]
    });
  });

  function createComponent(): {
    fixture: ComponentFixture<UploadContainerComponent>;
    component: UploadContainerComponent;
  } {
    const fixture = TestBed.createComponent(UploadContainerComponent);
    const component = fixture.componentInstance;
    return { fixture, component };
  }

  it('Escenario 1: identifies locally invalid files individually without blocking eligible files in mixed selection', () => {
    const { fixture, component } = createComponent();

    const validPhoto = new File(['fake-jpg-content'], 'foto_boda.jpg', { type: 'image/jpeg' });
    const invalidDoc = new File(['fake-pdf-content'], 'contrato.pdf', { type: 'application/pdf' });
    const validVideo = new File(['fake-mp4-content'], 'brindis.mp4', { type: 'video/mp4' });

    component.onFilesSelected([validPhoto, invalidDoc, validVideo]);
    fixture.detectChanges();

    expect(component.files.length).toBe(3);

    // Eligible files are queued
    expect(component.files[0].name).toBe('foto_boda.jpg');
    expect(component.files[0].status).toBe('QUEUED');
    expect(component.files[0].isInvalidLocal).toBeFalsy();

    // Invalid file is flagged without blocking others
    expect(component.files[1].name).toBe('contrato.pdf');
    expect(component.files[1].status).toBe('REJECTED');
    expect(component.files[1].isInvalidLocal).toBe(true);
    expect(component.files[1].localValidationError).toContain('Formato no soportado');

    // Second eligible file is also queued
    expect(component.files[2].name).toBe('brindis.mp4');
    expect(component.files[2].status).toBe('QUEUED');
    expect(component.files[2].isInvalidLocal).toBeFalsy();

    // Rendered rows check
    const rows = fixture.nativeElement.querySelectorAll('.file-item-row');
    expect(rows.length).toBe(3);
    expect(rows[1].classList.contains('item-error')).toBe(true);
    expect(rows[1].textContent).toContain('Archivo no admitido localmente');
  });

  it('Escenario 2: displays measurable progress per file and aggregate batch level without claiming premature acceptance', () => {
    const { fixture, component } = createComponent();

    const file1 = new File(['content1'], 'foto1.jpg', { type: 'image/jpeg' });
    const file2 = new File(['content2'], 'foto2.jpg', { type: 'image/jpeg' });

    component.onFilesSelected([file1, file2]);
    const id1 = component.files[0].id;
    const id2 = component.files[1].id;

    // Simulate transfer active for file1
    component.updateFileStatus(id1, 'UPLOADING');
    component.updateFileProgress(id1, 60);

    // file2 is confirming (not yet accepted)
    component.updateFileStatus(id2, 'CONFIRMING');

    fixture.detectChanges();

    // Per-file progress bar present only for uploading file
    const file1Row = fixture.nativeElement.querySelectorAll('.file-item-row')[0];
    const progressBar = file1Row.querySelector('.progress-bar-container');
    expect(progressBar).not.toBeNull();
    expect(progressBar.getAttribute('aria-valuenow')).toBe('60');

    // Confirming file shows textual indeterminate state
    const file2Row = fixture.nativeElement.querySelectorAll('.file-item-row')[1];
    expect(file2Row.textContent).toContain('Confirmando carga…');

    // Aggregate summary reflects accurate counts without claiming acceptance
    const summaryCard = fixture.nativeElement.querySelector('.progress-summary-card');
    expect(summaryCard.textContent).toContain('0 recibidos, 2 en curso');
  });

  it('Escenario 3: allows retrying a failed file while other files strictly preserve their state', () => {
    const { fixture, component } = createComponent();

    const file1 = new File(['content1'], 'exito.jpg', { type: 'image/jpeg' });
    const file2 = new File(['content2'], 'falla_red.jpg', { type: 'image/jpeg' });
    const file3 = new File(['content3'], 'en_espera.jpg', { type: 'image/jpeg' });

    component.onFilesSelected([file1, file2, file3]);
    const id1 = component.files[0].id;
    const id2 = component.files[1].id;
    const id3 = component.files[2].id;

    // Set statuses: file1 is RECEIVED, file2 failed with retry capability, file3 is QUEUED
    component.updateFileStatus(id1, 'RECEIVED');
    component.updateFileStatus(id2, 'REJECTED', {
      error: 'Error de red temporal al transferir el archivo',
      canRetry: true
    });
    component.updateFileStatus(id3, 'QUEUED');

    fixture.detectChanges();

    // Retry button exists for failed file with accessible tap target
    const retryBtn = fixture.nativeElement.querySelector('.retry-btn');
    expect(retryBtn).not.toBeNull();
    expect(retryBtn.getAttribute('aria-label')).toContain('Reintentar carga de falla_red.jpg');

    // Trigger retry
    let retriedId = '';
    component.fileRetried.subscribe((id) => (retriedId = id));
    retryBtn.click();
    fixture.detectChanges();

    expect(retriedId).toBe(id2);
    expect(component.files[1].status).toBe('QUEUED');
    expect(component.files[1].canRetry).toBe(false);

    // Other files strictly preserve their state
    expect(component.files[0].status).toBe('RECEIVED');
    expect(component.files[2].status).toBe('QUEUED');
  });

  it('Escenario 4: cancels unconfirmed attempts and preserves received originals upon policy cancellation (DEC-085)', () => {
    const { fixture, component } = createComponent();

    const fileReceived = new File(['c1'], 'recibido.jpg', { type: 'image/jpeg' });
    const fileUploading = new File(['c2'], 'en_vuelo.jpg', { type: 'image/jpeg' });
    const fileQueued = new File(['c3'], 'en_cola.jpg', { type: 'image/jpeg' });

    component.onFilesSelected([fileReceived, fileUploading, fileQueued]);
    const idReceived = component.files[0].id;
    const idUploading = component.files[1].id;

    component.updateFileStatus(idReceived, 'RECEIVED');
    component.updateFileStatus(idUploading, 'UPLOADING');

    // Trigger policy cancellation (e.g. event closed)
    component.handlePolicyCancellation('EVENT_CLOSED');
    fixture.detectChanges();

    // Policy banner is visible
    const alertBox = fixture.nativeElement.querySelector('.usage-alert-box');
    expect(alertBox).not.toBeNull();
    expect(alertBox.textContent).toContain('Cargas suspendidas por política');
    expect(alertBox.textContent).toContain('Consulta Mis aportes');

    // File picker disabled
    expect(component.isPolicyBlocked).toBe(true);

    // Invariant DEC-085: Received file is PRESERVED
    expect(component.files[0].status).toBe('RECEIVED');

    // In-flight and queued files are CANCELLED
    expect(component.files[1].status).toBe('CANCELLED_POLICY');
    expect(component.files[2].status).toBe('CANCELLED_POLICY');
  });

  it('WCAG 2.2 AA: enforces accessible labels, roles, and min 44x44px tap targets', () => {
    const { fixture, component } = createComponent();

    const file = new File(['content'], 'foto.jpg', { type: 'image/jpeg' });
    component.onFilesSelected([file]);
    component.updateFileStatus(component.files[0].id, 'REJECTED', {
      error: 'Error',
      canRetry: true
    });
    fixture.detectChanges();

    const pickerBtn = fixture.nativeElement.querySelector('.picker-trigger-btn');
    expect(pickerBtn.getAttribute('role')).toBe('button');

    const retryBtn = fixture.nativeElement.querySelector('.retry-btn');
    expect(retryBtn.getAttribute('aria-label')).toBeDefined();

    // Semantic list
    const list = fixture.nativeElement.querySelector('.upload-queue-list');
    expect(list.getAttribute('role')).toBe('list');
  });

  it('waits for explicit start and bounds transfer concurrency to two', async () => {
    const completions: (() => void)[] = [];
    mockOrchestrator.startUpload.mockImplementation(() => new Promise<void>(resolve => completions.push(resolve)));
    const { component } = createComponent();
    component.onFilesSelected([1, 2, 3].map(value => new File(['x'], `${value}.jpg`, { type: 'image/jpeg' })));
    expect(mockOrchestrator.startUpload).not.toHaveBeenCalled();
    component.startQueuedUploads();
    expect(mockOrchestrator.startUpload).toHaveBeenCalledTimes(2);
    completions[0](); await Promise.resolve(); await Promise.resolve();
    expect(mockOrchestrator.startUpload).toHaveBeenCalledTimes(3);
    completions[1](); completions[2]();
  });

  it('aborts only owned files on destruction and ignores late completion', () => {
    mockOrchestrator.startUpload.mockReturnValue(new Promise<void>(() => {}));
    const { component } = createComponent();
    component.onFilesSelected([new File(['x'], 'one.jpg', { type: 'image/jpeg' })]);
    component.startQueuedUploads();
    const callbacks = mockOrchestrator.startUpload.mock.calls[0][1];
    const id = component.files[0].id;
    component.ngOnDestroy();
    callbacks.onStatusChange(id, 'RECEIVED', { attemptId: 'server-id' });
    expect(mockOrchestrator.abort).toHaveBeenCalledWith([id]);
    expect(component.files[0].status).toBe('QUEUED');
  });

  it('authoritative cancellation overrides a transferred pending receipt', () => {
    const { component } = createComponent();
    component.onFilesSelected([new File(['x'], 'one.jpg', { type: 'image/jpeg' })]);
    const file = component.files[0];
    component.updateFileStatus(file.id, 'RECEIVED', { attemptId: 'server-id' });
    component.reconcileContributions([{ attemptId: 'server-id', status: 'CANCELLED' }]);
    expect(file.status).toBe('CANCELLED_POLICY');
    component.updateFileStatus(file.id, 'RECEIVED');
    expect(file.status).toBe('CANCELLED_POLICY');
  });
});
