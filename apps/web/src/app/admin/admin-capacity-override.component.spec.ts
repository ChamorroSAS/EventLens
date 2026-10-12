import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminCapacityOverrideDialogComponent } from './admin-capacity-override-dialog.component.js';
import { AdminCapacityRequestsComponent } from './admin-capacity-requests.component.js';
import { AdminEventDetailComponent } from './admin-event-detail.component.js';
import { AdminApiService } from './admin-api.service.js';
import { JobsApiService } from '../jobs/jobs-api.service.js';
import { AuditApiService } from '../audit/audit-api.service.js';
import type {
  AdminEventDetailSnapshot,
  AdminCapacityRequestItem,
} from './admin.types.js';

describe('Admin Capacity Overrides & Extension Requests (EL-TK-144)', () => {
  let mockAdminApi: {
    getEventDetail: ReturnType<typeof vi.fn>;
    applyCapacityOverride: ReturnType<typeof vi.fn>;
    removeCapacityOverride: ReturnType<typeof vi.fn>;
    reviewExtensionRequest: ReturnType<typeof vi.fn>;
    executeIntervention: ReturnType<typeof vi.fn>;
    requestMediaGrant: ReturnType<typeof vi.fn>;
  };
  let mockJobsApi: {
    queryJobs: ReturnType<typeof vi.fn>;
  };
  let mockAuditApi: {
    queryAuditEvents: ReturnType<typeof vi.fn>;
  };

  const sampleSnapshot: AdminEventDetailSnapshot = {
    eventId: 'evt-test-101',
    name: 'Evento Prueba Overrides',
    overallAvailability: 'COMPLETE',
    owner: {
      id: 'org-1',
      email: 'owner@event.com',
      status: 'ACTIVE',
      declaredAdult: true,
      createdAt: '2026-01-01T00:00:00Z',
    },
    lifecycle: {
      status: 'ACTIVE',
      timezone: 'America/Bogota',
      startsAtLocal: '2026-10-15 18:00',
      scheduledAt: '2026-10-15T23:00:00Z',
      expiresAt: '2026-10-25T23:00:00Z',
      graceEndsAt: '2026-10-30T23:00:00Z',
      activatedAt: '2026-10-01T00:00:00Z',
      closedAt: null,
      suspendedAt: null,
      suspensionReason: null,
      previousStatus: null,
      uploadsEnabled: true,
      guestGalleryEnabled: true,
    },
    capacity: {
      availability: 'AVAILABLE',
      planCode: 'BETA_BASE',
      isOverrideActive: false,
      storageLimitBytes: '10737418240', // 10 GB
      storageUsedBytes: '4294967296', // 4 GB
      fileLimit: 1000,
      filesCount: 350,
      retentionDays: 30,
      baseStorageLimitBytes: '10737418240',
      baseMaxFiles: 1000,
      baseRetentionDays: 30,
    },
    capacityRequests: {
      availability: 'AVAILABLE',
      requests: [
        {
          requestId: 'req-cap-1',
          requestType: 'STORAGE',
          additionalGb: 5.5,
          additionalDays: null,
          status: 'PENDING_REVIEW',
          requestedAt: '2026-10-11T12:00:00Z',
          justification: 'Requiere más storage para videos 4K de la boda.',
          messages: [
            {
              id: 'm-1',
              authorRole: 'ORGANIZER',
              content: 'Requiere más storage para videos 4K de la boda.',
              createdAt: '2026-10-11T12:00:00Z',
            },
          ],
        },
      ],
    },
    jobs: { availability: 'AVAILABLE', totalJobs: 0 },
    capabilities: {
      canSuspend: true,
      canReactivate: false,
      canClose: true,
      canReopen: false,
      canExtendValidity: true,
      canViewAudit: true,
      canInspectJobs: true,
      canRequestMediaGrant: true,
    },
    fetchedAt: '2026-10-11T20:00:00Z',
  };

  beforeEach(() => {
    mockAdminApi = {
      getEventDetail: vi.fn().mockResolvedValue(sampleSnapshot),
      applyCapacityOverride: vi.fn().mockResolvedValue({ success: true, eventId: 'evt-test-101' }),
      removeCapacityOverride: vi.fn().mockResolvedValue({ success: true, eventId: 'evt-test-101' }),
      reviewExtensionRequest: vi.fn().mockResolvedValue({ success: true, requestId: 'req-cap-1', decision: 'APPROVE' }),
      executeIntervention: vi.fn(),
      requestMediaGrant: vi.fn(),
    };
    mockJobsApi = { queryJobs: vi.fn().mockResolvedValue({ items: [], pagination: { total: 0 } }) };
    mockAuditApi = { queryAuditEvents: vi.fn().mockResolvedValue({ items: [], pagination: { total: 0 } }) };

    TestBed.configureTestingModule({
      imports: [
        AdminEventDetailComponent,
        AdminCapacityOverrideDialogComponent,
        AdminCapacityRequestsComponent,
      ],
      providers: [
        { provide: AdminApiService, useValue: mockAdminApi },
        { provide: JobsApiService, useValue: mockJobsApi },
        { provide: AuditApiService, useValue: mockAuditApi },
      ],
    });
  });

  describe('Escenario 1: Revisión de solicitud con plan base, efectivo, uso e historial', () => {
    it('muestra el plan base, límites actuales, uso real y la lista de solicitudes con historial', async () => {
      const fixture = TestBed.createComponent(AdminEventDetailComponent);
      fixture.componentRef.setInput('eventId', 'evt-test-101');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('Capacidad y Consumo de Almacenamiento');
      expect(el.textContent).toContain('BETA_BASE');
      expect(el.textContent).toContain('Solicitudes de Ampliación de Capacidad');
      expect(el.textContent).toContain('5.5 GB');
      expect(el.textContent).toContain('Requiere más storage para videos 4K de la boda.');
      expect(el.textContent).toContain('Pendiente de Revisión');
    });

    it('permite pedir información adicional y emite reviewExtensionRequest con REQUEST_INFO', () => {
      const requestsFixture = TestBed.createComponent(AdminCapacityRequestsComponent);
      const reqItem: AdminCapacityRequestItem = sampleSnapshot.capacityRequests!.requests![0];
      requestsFixture.componentRef.setInput('requests', [reqItem]);
      requestsFixture.detectChanges();

      const el = requestsFixture.nativeElement as HTMLElement;
      const comp = requestsFixture.componentInstance;

      let emittedCommand: any = null;
      comp.reviewRequest.subscribe((cmd) => {
        emittedCommand = cmd;
      });

      // Inicia solicitud de información
      comp.startRequestInfo('req-cap-1');
      requestsFixture.detectChanges();

      expect(el.textContent).toContain('Solicitar Aclaración al Organizador');

      comp.actionReason.set('¿Cuántas horas de video proyectan grabar?');
      comp.confirmAction('req-cap-1');

      expect(emittedCommand).not.toBeNull();
      expect(emittedCommand.decision).toBe('REQUEST_INFO');
      expect(emittedCommand.reason).toBe('¿Cuántas horas de video proyectan grabar?');
    });
  });

  describe('Escenario 2: Aplicación y persistencia de override con comparación base/actual/propuesto', () => {
    it('renderiza comparativa y emite applyOverride con storageBytes en bytes exactos y motivo obligatorio', () => {
      const dialogFixture = TestBed.createComponent(AdminCapacityOverrideDialogComponent);
      dialogFixture.componentRef.setInput('eventId', 'evt-test-101');
      dialogFixture.componentRef.setInput('baseLimits', {
        storageGigabytes: 10.0,
        maxFiles: 1000,
        retentionDays: 30,
      });
      dialogFixture.componentRef.setInput('currentLimits', {
        storageGigabytes: 10.0,
        maxFiles: 1000,
        retentionDays: 30,
      });
      dialogFixture.componentRef.setInput('isOverrideActive', false);
      dialogFixture.detectChanges();

      const comp = dialogFixture.componentInstance;
      const el = dialogFixture.nativeElement as HTMLElement;

      expect(el.textContent).toContain('Comparativa de Límites');
      expect(el.textContent).toContain('10.0 GB');

      let emittedCmd: any = null;
      comp.applyOverride.subscribe((cmd) => {
        emittedCmd = cmd;
      });

      comp.proposedStorageGb = 20.0;
      comp.proposedMaxFiles = 2000;
      comp.proposedRetentionDays = 45;
      comp.reason = 'Acuerdo comercial corporativo VIP firmado';

      comp.onApply();

      expect(emittedCmd).not.toBeNull();
      expect(emittedCmd.maxFiles).toBe(2000);
      expect(emittedCmd.retentionDays).toBe(45);
      expect(emittedCmd.reason).toBe('Acuerdo comercial corporativo VIP firmado');
      // 20 GB en bytes
      expect(emittedCmd.storageBytes).toBe('21474836480');
    });

    it('permite retornar al plan base cuando hay override activo y emite revertToBase', () => {
      const dialogFixture = TestBed.createComponent(AdminCapacityOverrideDialogComponent);
      dialogFixture.componentRef.setInput('eventId', 'evt-test-101');
      dialogFixture.componentRef.setInput('baseLimits', {
        storageGigabytes: 10.0,
        maxFiles: 1000,
        retentionDays: 30,
      });
      dialogFixture.componentRef.setInput('currentLimits', {
        storageGigabytes: 25.0,
        maxFiles: 2000,
        retentionDays: 60,
      });
      dialogFixture.componentRef.setInput('isOverrideActive', true);
      dialogFixture.detectChanges();

      const comp = dialogFixture.componentInstance;
      const el = dialogFixture.nativeElement as HTMLElement;

      expect(el.textContent).toContain('Retornar al Plan Base');

      let emittedRevert: any = null;
      comp.revertToBase.subscribe((cmd) => {
        emittedRevert = cmd;
      });

      comp.reason = 'Vencimiento de periodo promocional VIP';
      comp.onRevertToBase();

      expect(emittedRevert).not.toBeNull();
      expect(emittedRevert.reason).toBe('Vencimiento de periodo promocional VIP');
    });
  });

  describe('Escenario 3: Manejo de denegación (ej. CANNOT_REDUCE_BELOW_PAST_EXPIRATION)', () => {
    it('muestra el mensaje autorizado y conserva los datos reales en el snapshot cuando backend deniega', async () => {
      const fixture = TestBed.createComponent(AdminEventDetailComponent);
      fixture.componentRef.setInput('eventId', 'evt-test-101');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const comp = fixture.componentInstance;
      // Simulamos que el backend rechaza la reducción porque dejaría la expiración en el pasado
      mockAdminApi.applyCapacityOverride.mockRejectedValueOnce(
        new Error('CANNOT_REDUCE_BELOW_PAST_EXPIRATION: La nueva vigencia calculada expiraría en el pasado.')
      );

      comp.openOverrideDialog();
      fixture.detectChanges();

      await comp.onApplyCapacityOverride({
        retentionDays: 5,
        reason: 'Reducción intentada',
      });
      fixture.detectChanges();

      // Diálogo sigue abierto mostrando el error
      expect(comp.isOverrideDialogOpen()).toBe(true);
      expect(comp.overrideErrorMessage()).toContain('CANNOT_REDUCE_BELOW_PAST_EXPIRATION');
      // Los datos del snapshot permanecen intactos
      expect(comp.snapshot()?.capacity.retentionDays).toBe(30);
    });
  });
});
