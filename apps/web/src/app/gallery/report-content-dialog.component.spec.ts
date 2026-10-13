import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReportContentDialogComponent } from './report-content-dialog.component.js';
import { GalleryService } from './gallery.service.js';

describe('ReportContentDialogComponent (EL-TK-121 / DEC-088)', () => {
  let component: ReportContentDialogComponent;
  let fixture: ComponentFixture<ReportContentDialogComponent>;
  let galleryServiceMock: {
    submitReport: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    galleryServiceMock = {
      submitReport: vi.fn().mockResolvedValue({
        reportId: 'rep-123',
        status: 'PENDING_REVIEW',
        message: 'Reporte recibido para revisión'
      })
    };

    await TestBed.configureTestingModule({
      imports: [ReportContentDialogComponent],
      providers: [
        { provide: GalleryService, useValue: galleryServiceMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ReportContentDialogComponent);
    component = fixture.componentInstance;
    component.isOpen = true;
    component.eventId = 'evt-999';
    component.mediaId = 'med-888';
    fixture.detectChanges();
  });

  it('no es válido si no se ha seleccionado motivo', () => {
    expect(component.isValid()).toBe(false);
  });

  it('es válido para motivo estándar sin requerir descripción', () => {
    component.selectedReason = 'INAPPROPRIATE_CONTENT';
    component.description = '';
    expect(component.isValid()).toBe(true);
  });

  it('exige descripción cuando el motivo es OTHER', () => {
    component.selectedReason = 'OTHER';
    component.description = '';
    expect(component.isValid()).toBe(false);

    component.description = '   ';
    expect(component.isValid()).toBe(false);

    component.description = 'Detalle de la queja';
    expect(component.isValid()).toBe(true);
  });

  it('envía el reporte y muestra feedback de recepción, NUNCA "Contenido eliminado" (DEC-088)', async () => {
    component.selectedReason = 'PRIVACY_VIOLATION';
    component.description = 'Aparezco sin mi permiso';
    const reportedSpy = vi.fn();
    component.reported.subscribe(reportedSpy);

    await component.onSubmit();
    fixture.detectChanges();

    expect(galleryServiceMock.submitReport).toHaveBeenCalledWith({
      eventId: 'evt-999',
      mediaId: 'med-888',
      reason: 'PRIVACY_VIOLATION',
      description: 'Aparezco sin mi permiso'
    });

    expect(component.isSubmitted()).toBe(true);
    expect(reportedSpy).toHaveBeenCalledWith({
      reportId: 'rep-123',
      reason: 'PRIVACY_VIOLATION'
    });

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Reporte recibido para revisión');
    expect(compiled.textContent).not.toContain('Contenido eliminado');
  });

  it('maneja error de rate limit preservando inputs para retry', async () => {
    galleryServiceMock.submitReport.mockRejectedValueOnce(new Error('RATE_LIMIT_EXCEEDED'));

    component.selectedReason = 'INTIMACY_VIOLATION';
    component.description = 'Contenido sensible';

    await component.onSubmit();
    fixture.detectChanges();

    expect(component.isSubmitted()).toBe(false);
    expect(component.errorMessage()).toContain('límite de reportes permitidos');
    // Inputs preservados
    expect(component.selectedReason).toBe('INTIMACY_VIOLATION');
    expect(component.description).toBe('Contenido sensible');
  });

  it('emite close al cancelar o presionar Escape', () => {
    const closeSpy = vi.fn();
    component.close.subscribe(closeSpy);

    component.handleEscape(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closeSpy).toHaveBeenCalled();
  });
});
