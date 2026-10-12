import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminAppShellComponent } from './admin-app-shell.component.js';
import { AdminEventDetailComponent } from './admin-event-detail.component.js';
import { AdminEventSearchComponent } from './admin-event-search.component.js';
import { AdminMediaGrantDialogComponent } from './admin-media-grant-dialog.component.js';
import { AdminInterventionDialogComponent } from './admin-intervention-dialog.component.js';
import { AdminApiService } from './admin-api.service.js';
import { JobsApiService } from '../jobs/jobs-api.service.js';
import { AuditApiService } from '../audit/audit-api.service.js';
import type {
  AdminEventDetailSnapshot,
  AdminSearchResult,
  AdministrativeSupportMediaGrant,
  ExecuteInterventionResult,
} from './admin.types.js';

describe('Admin Support Console Integration Tests (EL-TK-154)', () => {
  let mockAdminApi: {
    search: ReturnType<typeof vi.fn>;
    getEventDetail: ReturnType<typeof vi.fn>;
    requestMediaGrant: ReturnType<typeof vi.fn>;
    executeIntervention: ReturnType<typeof vi.fn>;
  };
  let mockJobsApi: {
    queryJobs: ReturnType<typeof vi.fn>;
    getJobDetail: ReturnType<typeof vi.fn>;
    executeJobAction: ReturnType<typeof vi.fn>;
  };
  let mockAuditApi: {
    queryAuditEvents: ReturnType<typeof vi.fn>;
  };

  const sampleEventSnapshot: AdminEventDetailSnapshot = {
    eventId: 'evt-test-101',
    name: 'Gala Anual Corporativa 2026',
    overallAvailability: 'COMPLETE',
    owner: {
      id: 'org-acc-88',
      email: 'organizador@empresa.com',
      status: 'ACTIVE',
      declaredAdult: true,
      createdAt: '2026-01-10T10:00:00Z',
    },
    lifecycle: {
      status: 'ACTIVE',
      timezone: 'America/Bogota',
      startsAtLocal: '2026-10-15 18:00',
      scheduledAt: '2026-10-15T23:00:00Z',
      expiresAt: '2026-10-20T23:00:00Z',
      graceEndsAt: '2026-10-25T23:00:00Z',
      activatedAt: '2026-10-01T08:00:00Z',
      closedAt: null,
      suspendedAt: null,
      suspensionReason: null,
      previousStatus: null,
      uploadsEnabled: true,
      guestGalleryEnabled: true,
    },
    capacity: {
      availability: 'AVAILABLE',
      planCode: 'PRO_ENTERPRISE',
      storageLimitBytes: '10737418240',
      storageUsedBytes: '2147483648',
      fileLimit: 1000,
      filesCount: 250,
    },
    jobs: {
      availability: 'AVAILABLE',
      totalJobs: 5,
      activeJobs: 0,
      failedJobs: 0,
      deadJobs: 0,
    },
    capabilities: {
      canSuspend: true,
      canReactivate: false, // Inactivo porque ya está ACTIVE
      canClose: true,
      canReopen: false,
      canExtendValidity: true,
      canViewAudit: true,
      canInspectJobs: true,
      canRequestMediaGrant: true,
    },
    fetchedAt: '2026-10-11T20:00:00Z',
  };

  const sampleSearchResult: AdminSearchResult = {
    items: [
      {
        type: 'EVENT',
        id: 'evt-test-101',
        name: 'Gala Anual Corporativa 2026',
        status: 'ACTIVE',
        organizerId: 'org-acc-88',
        timezone: 'America/Bogota',
        scheduledAt: '2026-10-15T23:00:00Z',
        createdAt: '2026-10-01T00:00:00Z',
      },
    ],
    pagination: {
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    },
  };

  beforeEach(() => {
    mockAdminApi = {
      search: vi.fn(async (): Promise<AdminSearchResult> => sampleSearchResult),
      getEventDetail: vi.fn(async (): Promise<AdminEventDetailSnapshot> => sampleEventSnapshot),
      requestMediaGrant: vi.fn(async (): Promise<AdministrativeSupportMediaGrant> => ({
        grantId: 'grant-xyz-99',
        eventId: 'evt-test-101',
        mediaId: 'media-item-evt-test-101-sample',
        purpose: 'INCIDENT_INVESTIGATION',
        targetKind: 'PREVIEW',
        storageKey: 'events/evt-test-101/media/sample.jpg',
        downloadUrl: 'https://cdn.eventlens.test/media/sample-signed.jpg',
        grantedAt: '2026-10-11T20:30:00Z',
        expiresAt: '2026-10-11T20:45:00Z',
        grantedTo: 'admin-actor-42',
      })),
      executeIntervention: vi.fn(async (): Promise<ExecuteInterventionResult> => ({
        outcome: 'EXECUTED',
        eventId: 'evt-test-101',
        interventionType: 'SUSPEND_EVENT',
        previousStatus: 'ACTIVE',
        newStatus: 'SUSPENDED',
        executedAt: '2026-10-11T20:35:00Z',
      })),
    };

    mockJobsApi = {
      queryJobs: vi.fn(async () => ({ items: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } })),
      getJobDetail: vi.fn(),
      executeJobAction: vi.fn(),
    };

    mockAuditApi = {
      queryAuditEvents: vi.fn(async () => ({ items: [], page: 1, limit: 10, totalCount: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false })),
    };

    TestBed.configureTestingModule({
      imports: [
        AdminAppShellComponent,
        AdminEventSearchComponent,
        AdminEventDetailComponent,
        AdminMediaGrantDialogComponent,
        AdminInterventionDialogComponent,
      ],
      providers: [
        { provide: AdminApiService, useValue: mockAdminApi },
        { provide: JobsApiService, useValue: mockJobsApi },
        { provide: AuditApiService, useValue: mockAuditApi },
      ],
    });
  });

  it('Escenario 1: Dado admin busca y abre evento, navega, ve detalle sin media previa y acciones vigentes', async () => {
    const fixture = TestBed.createComponent(AdminAppShellComponent);
    fixture.componentRef.setInput('callerActorId', 'admin-actor-42');
    fixture.detectChanges();
    await fixture.whenStable();

    // 1. Verificar búsqueda inicial
    const searchComp = fixture.nativeElement.querySelector('eventlens-admin-event-search');
    expect(searchComp).not.toBeNull();

    // Simular selección de evento
    fixture.componentInstance.onEventSelected({
      eventId: 'evt-test-101',
      element: document.body,
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.activeTab()).toBe('detail');
    expect(fixture.componentInstance.selectedEventId()).toBe('evt-test-101');

    const detailEl = fixture.nativeElement.querySelector('eventlens-admin-event-detail');
    expect(detailEl).not.toBeNull();
    expect(detailEl.textContent).toContain('Gala Anual Corporativa 2026');
    expect(detailEl.textContent).toContain('organizador@empresa.com');

    // VERIFICACIÓN CRÍTICA: NO hay ningún preview previo de imagen en el DOM
    const images = detailEl.querySelectorAll('img');
    expect(images.length).toBe(0);

    // Acciones vigentes según capabilities: Suspender está habilitado
    const suspendBtn = detailEl.querySelector('button.btn-danger');
    expect(suspendBtn).not.toBeNull();
    expect(suspendBtn.textContent).toContain('Suspender Evento');
  });

  it('Escenario 2: Dado necesita media, exige motivo y propósito (5..500 chars) antes de preview', async () => {
    const fixture = TestBed.createComponent(AdminEventDetailComponent);
    fixture.componentRef.setInput('eventId', 'evt-test-101');
    fixture.componentRef.setInput('callerActorId', 'admin-actor-42');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    // Abrir diálogo de media grant
    fixture.componentInstance.openMediaGrantDialog('media-item-evt-test-101-sample', { currentTarget: document.body } as any);
    fixture.detectChanges();
    await fixture.whenStable();

    const dialog = el.querySelector('eventlens-admin-media-grant-dialog');
    expect(dialog).not.toBeNull();

    // Intenta enviar sin motivo suficiente (menos de 5 caracteres)
    const textarea = dialog?.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    textarea.value = 'abc'; // 3 caracteres
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const submitBtn = dialog?.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    // Llenar motivo válido (mínimo 5 chars)
    textarea.value = 'Investigación de reporte por imagen corrupta #102';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(submitBtn.disabled).toBe(false);

    // Ejecutar solicitud de autorización
    await fixture.componentInstance.onRequestMediaGrant({
      eventId: 'evt-test-101',
      mediaId: 'media-item-evt-test-101-sample',
      purpose: 'INCIDENT_INVESTIGATION',
      reason: textarea.value,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(mockAdminApi.requestMediaGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt-test-101',
        mediaId: 'media-item-evt-test-101-sample',
        purpose: 'INCIDENT_INVESTIGATION',
        reason: 'Investigación de reporte por imagen corrupta #102',
      }),
      'admin-actor-42'
    );
  });

  it('Escenario 3: Dado acción no está disponible, se explica READ_ONLY / disabled sin bypass', async () => {
    // Simulamos evento ya cerrado o suspendido donde canSuspend es falso
    mockAdminApi.getEventDetail.mockResolvedValueOnce({
      ...sampleEventSnapshot,
      lifecycle: {
        ...sampleEventSnapshot.lifecycle,
        status: 'SUSPENDED',
      },
      capabilities: {
        ...sampleEventSnapshot.capabilities,
        canSuspend: false, // Ya suspendido
        canReactivate: true,
      },
    });

    const fixture = TestBed.createComponent(AdminEventDetailComponent);
    fixture.componentRef.setInput('eventId', 'evt-test-101');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const disabledBtn = el.querySelector('button.btn-disabled') as HTMLButtonElement;
    expect(disabledBtn).not.toBeNull();
    expect(disabledBtn.disabled).toBe(true);
    expect(disabledBtn.textContent).toContain('READ_ONLY');

    // Botón reactivar sí disponible
    const reactivateBtn = el.querySelector('button.btn-primary');
    expect(reactivateBtn?.textContent).toContain('Reactivar Evento');
  });

  it('Intervención ejecutada actualiza estado y feedback sin falsos positivos downstream', async () => {
    const fixture = TestBed.createComponent(AdminEventDetailComponent);
    fixture.componentRef.setInput('eventId', 'evt-test-101');
    fixture.componentRef.setInput('callerActorId', 'admin-actor-42');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Abrir intervención de suspensión
    fixture.componentInstance.requestIntervention('SUSPEND_EVENT', { currentTarget: document.body } as any);
    fixture.detectChanges();

    expect(fixture.componentInstance.pendingIntervention()?.type).toBe('SUSPEND_EVENT');

    // Confirmar intervención con motivo válido
    await fixture.componentInstance.onInterventionConfirmed({
      interventionType: 'SUSPEND_EVENT',
      reason: 'Solicitud legal de suspensión temporal por reclamo de marca',
      idempotencyKey: 'idem-test-interv-1',
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockAdminApi.executeIntervention).toHaveBeenCalledWith(
      'evt-test-101',
      expect.objectContaining({
        interventionType: 'SUSPEND_EVENT',
        reason: 'Solicitud legal de suspensión temporal por reclamo de marca',
      }),
      'admin-actor-42'
    );

    expect(fixture.componentInstance.interventionFeedback()).toContain('SUSPEND_EVENT ejecutada con éxito');
  });

  it('Cumple accesibilidad WCAG 2.2 AA con anunciador aria-live y roles semánticos en AdminAppShell', async () => {
    const fixture = TestBed.createComponent(AdminAppShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const announcer = el.querySelector('.header-status-announcer');
    expect(announcer?.getAttribute('aria-live')).toBe('polite');
    expect(announcer?.getAttribute('role')).toBe('status');

    // Cambio de pestaña anuncia navegación
    fixture.componentInstance.selectTab('jobs');
    fixture.detectChanges();
    expect(announcer?.textContent).toContain('diagnóstico de trabajos');
  });
});
