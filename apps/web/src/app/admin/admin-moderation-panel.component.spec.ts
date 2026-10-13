import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminModerationPanelComponent } from './admin-moderation-panel.component.js';
import { ReportQueueComponent } from './report-queue.component.js';
import { ReportDetailComponent } from './report-detail.component.js';
import { AdminApiService } from './admin-api.service.js';
import type {
  AdminModerationQueueResult,
  AdminCaseDetailResult,
  AdminMediaAccessGrantResult,
  AdminResolveCaseResult
} from './admin.types.js';

describe('Admin Moderation Panel & Case Governance (EL-TK-122 / DEC-088)', () => {
  let adminApiMock: {
    getModerationQueue: ReturnType<typeof vi.fn>;
    getCaseDetail: ReturnType<typeof vi.fn>;
    classifyCase: ReturnType<typeof vi.fn>;
    grantMediaAccess: ReturnType<typeof vi.fn>;
    applyPreventiveHide: ReturnType<typeof vi.fn>;
    resolveCase: ReturnType<typeof vi.fn>;
  };

  const mockQueueResult: AdminModerationQueueResult = {
    items: [
      {
        caseId: 'case-crit-1',
        caseType: 'REPORT',
        eventId: 'evt-alpha',
        mediaId: 'med-alpha-1',
        reason: 'INTIMACY_VIOLATION',
        severity: 'CRITICAL',
        status: 'PENDING_REVIEW',
        reportsCount: 3,
        createdAt: '2026-10-12T10:00:00Z',
        lastReportedAt: '2026-10-12T11:00:00Z'
      },
      {
        caseId: 'case-norm-2',
        caseType: 'REMOVAL_REQUEST',
        eventId: 'evt-beta',
        mediaId: 'med-beta-2',
        reason: 'APPEAR_IN_MEDIA',
        severity: 'NORMAL',
        status: 'UNDER_INVESTIGATION',
        reportsCount: 1,
        createdAt: '2026-10-12T09:00:00Z',
        lastReportedAt: '2026-10-12T09:00:00Z'
      }
    ],
    total: 2
  };

  const mockDetailResult: AdminCaseDetailResult = {
    caseId: 'case-crit-1',
    caseType: 'REPORT',
    eventId: 'evt-alpha',
    mediaId: 'med-alpha-1',
    mediaStatus: 'PUBLISHED',
    reason: 'INTIMACY_VIOLATION',
    description: 'Material íntimo sin consentimiento publicado en la galería',
    severity: 'CRITICAL',
    status: 'PENDING_REVIEW',
    history: [
      {
        id: 'hist-1',
        caseId: 'case-crit-1',
        action: 'REPORTED',
        performedBy: 'guest-reporter',
        details: {},
        createdAt: '2026-10-12T10:00:00Z'
      }
    ],
    capabilities: {
      canClassify: true,
      canAccessMedia: true,
      canPreventiveHide: true,
      canResolve: true
    }
  };

  beforeEach(async () => {
    adminApiMock = {
      getModerationQueue: vi.fn().mockResolvedValue(mockQueueResult),
      getCaseDetail: vi.fn().mockResolvedValue(mockDetailResult),
      classifyCase: vi.fn().mockResolvedValue({ success: true, caseId: 'case-crit-1' }),
      grantMediaAccess: vi.fn().mockResolvedValue({
        grantToken: 'grant-tok-15m',
        previewUrl: 'https://storage.eventlens.internal/signed/preview.jpg',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        validMinutes: 15
      }),
      applyPreventiveHide: vi.fn().mockResolvedValue({ success: true, caseId: 'case-crit-1' }),
      resolveCase: vi.fn().mockResolvedValue({
        caseId: 'case-crit-1',
        status: 'ACTION_TAKEN',
        resolution: 'REMOVED_PERMANENTLY',
        downstreamPurged: true,
        message: 'Contenido retirado y orden de purga emitida'
      })
    };

    await TestBed.configureTestingModule({
      imports: [
        AdminModerationPanelComponent,
        ReportQueueComponent,
        ReportDetailComponent
      ],
      providers: [
        { provide: AdminApiService, useValue: adminApiMock }
      ]
    }).compileComponents();
  });

  describe('ReportQueueComponent (Escenario 1: Cola sanitizada y privacidad)', () => {
    it('muestra casos ordenados sanitizados y NO expone multimedia privada en la lista', async () => {
      const fixture = TestBed.createComponent(ReportQueueComponent);
      fixture.componentInstance.callerActorId = 'admin-user-1';
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(adminApiMock.getModerationQueue).toHaveBeenCalled();

      // Debe mostrar la severidad crítica y el tipo
      expect(compiled.textContent).toContain('Crítica');
      expect(compiled.textContent).toContain('Denuncia');
      expect(compiled.textContent).toContain('case-crit-1');

      // Privacidad estricta: NO debe existir ningún elemento <img> de vista previa en la lista
      const previewImgs = compiled.querySelectorAll('table img');
      expect(previewImgs.length).toBe(0);
    });

    it('distingue estado de cola vacía general de resultados vacíos por filtro', async () => {
      const fixture = TestBed.createComponent(ReportQueueComponent);
      adminApiMock.getModerationQueue.mockResolvedValueOnce({ items: [], total: 0 });

      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      let compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('Cola limpia');

      // Con filtro activo
      fixture.componentInstance.severityFilter.set('CRITICAL');
      adminApiMock.getModerationQueue.mockResolvedValueOnce({ items: [], total: 0 });
      await fixture.componentInstance.loadQueue();
      fixture.detectChanges();

      compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('Sin resultados para el filtro');
      expect(compiled.textContent).toContain('Restablecer filtros');
    });
  });

  describe('ReportDetailComponent (Escenario 2 & 3: Justificación, Inspección y Acciones)', () => {
    it('exige justificación antes de conceder vista previa de 15 minutos (Escenario 2)', async () => {
      const fixture = TestBed.createComponent(ReportDetailComponent);
      fixture.componentInstance.caseId = 'case-crit-1';
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('Por protección de privacidad, el contenido multimedia está restringido');

      // Solicita inspección
      fixture.componentInstance.promptInspectMedia();
      fixture.detectChanges();

      expect(fixture.componentInstance.isReasonDialogOpen()).toBe(true);

      // Confirma justificación
      await fixture.componentInstance.onReasonConfirmed('Verificación técnica de reporte de intimidad');
      fixture.detectChanges();

      expect(adminApiMock.grantMediaAccess).toHaveBeenCalledWith(
        {
          caseId: 'case-crit-1',
          reason: 'Verificación técnica de reporte de intimidad'
        },
        undefined
      );

      // Ahora el preview se encuentra visible con la alerta de 15 min
      expect(fixture.componentInstance.activeGrant()).toBeTruthy();
      expect(compiled.textContent).toContain('Acceso temporal concedido (15 min)');
      const img = compiled.querySelector('.preview-img') as HTMLImageElement;
      expect(img).toBeTruthy();
      expect(img.src).toContain('preview.jpg');
    });

    it('ocultamiento preventivo exige justificación y actualiza estado a HIDDEN (DEC-088)', async () => {
      const fixture = TestBed.createComponent(ReportDetailComponent);
      fixture.componentInstance.caseId = 'case-crit-1';
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      fixture.componentInstance.promptPreventiveHide();
      fixture.detectChanges();
      expect(fixture.componentInstance.isReasonDialogOpen()).toBe(true);

      await fixture.componentInstance.onReasonConfirmed('Medida cautelar mientras se revisa el caso');
      fixture.detectChanges();

      expect(adminApiMock.applyPreventiveHide).toHaveBeenCalledWith(
        {
          caseId: 'case-crit-1',
          reason: 'Medida cautelar mientras se revisa el caso'
        },
        undefined
      );

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('Contenido ocultado preventivamente');
    });

    it('resolución formal con purga confirma resultado downstream sin anticiparlo (Escenario 3)', async () => {
      const fixture = TestBed.createComponent(ReportDetailComponent);
      fixture.componentInstance.caseId = 'case-crit-1';
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      fixture.componentInstance.promptResolve('REMOVED_PERMANENTLY');
      fixture.detectChanges();
      expect(fixture.componentInstance.isReasonDialogOpen()).toBe(true);

      await fixture.componentInstance.onReasonConfirmed('Violación confirmada de intimidad');
      fixture.detectChanges();

      expect(adminApiMock.resolveCase).toHaveBeenCalledWith(
        {
          caseId: 'case-crit-1',
          resolution: 'REMOVED_PERMANENTLY',
          reason: 'Violación confirmada de intimidad'
        },
        undefined
      );

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('orden de purga emitida downstream');
    });
  });

  describe('AdminModerationPanelComponent (Integración)', () => {
    it('alterna entre cola de casos y detalle seleccionado', async () => {
      const fixture = TestBed.createComponent(AdminModerationPanelComponent);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      // Inicialmente en la cola
      expect(fixture.nativeElement.querySelector('eventlens-report-queue')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('eventlens-report-detail')).toBeFalsy();

      // Selecciona un caso
      fixture.componentInstance.onCaseSelected('case-crit-1');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('eventlens-report-detail')).toBeTruthy();

      // Vuelve a la cola
      fixture.componentInstance.onBackToQueue();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('eventlens-report-queue')).toBeTruthy();
    });
  });
});
