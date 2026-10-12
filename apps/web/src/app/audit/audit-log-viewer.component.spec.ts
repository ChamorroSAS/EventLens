import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditLogViewerComponent } from './audit-log-viewer.component.js';
import { AuditLogDetailComponent } from './audit-log-detail.component.js';
import { AuditApiService } from './audit-api.service.js';
import type { AuditEventPage, AuditEventRecord } from './audit.types.js';

describe('AuditLogViewer & AuditLogDetail contextual integration (EL-TK-175)', () => {
  let mockAuditApi: {
    queryAuditEvents: ReturnType<typeof vi.fn>;
  };

  const sampleEvents: AuditEventRecord[] = [
    {
      id: 'audit-evt-001',
      occurredAt: '2026-10-10T12:00:00.000Z',
      actorType: 'ADMIN',
      actorId: 'admin-usr-42',
      actorDetail: {
        sessionRef: 'sess-abc-123',
        ipAddress: '192.168.1.10',
        userAgent: 'Mozilla/5.0 AdminConsole',
      },
      action: 'ADMIN_MEDIA_OVERRIDE',
      resourceType: 'media',
      resourceId: 'media-item-88',
      result: 'SUCCESS',
      reason: 'Aprobación manual por revisión de soporte',
      metadata: {
        sanitizedBatchId: 'batch-01',
        overrideScope: 'QUARANTINE_RELEASE',
      },
    },
    {
      id: 'audit-evt-002',
      occurredAt: '2026-10-10T12:15:00.000Z',
      actorType: 'SYSTEM',
      actorId: 'job-worker-purger',
      actorDetail: null,
      action: 'MEDIA_PURGE_EXECUTION',
      resourceType: 'media',
      resourceId: 'media-item-99',
      result: 'FAILURE',
      reason: 'Fallo al purgar archivo en bucket de almacenamiento',
      metadata: {
        errorCode: 'STORAGE_UNAVAILABLE',
        attemptCount: 3,
      },
    },
    {
      id: 'audit-evt-003',
      occurredAt: '2026-10-10T12:30:00.000Z',
      actorType: 'ORGANIZER',
      actorId: 'organizer-owner-01',
      actorDetail: { sessionRef: 'sess-org-99' },
      action: 'EVENT_SETTINGS_UPDATE',
      resourceType: 'event',
      resourceId: 'event-001',
      result: 'DENIED',
      reason: 'Acceso denegado: evento en estado ARCHIVED',
      metadata: {},
    },
  ];

  const defaultPage: AuditEventPage = {
    items: sampleEvents,
    page: 1,
    limit: 10,
    totalCount: 3,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
    isPartial: false,
  };

  beforeEach(() => {
    mockAuditApi = {
      queryAuditEvents: vi.fn().mockResolvedValue(defaultPage),
    };

    TestBed.configureTestingModule({
      imports: [AuditLogViewerComponent, AuditLogDetailComponent],
      providers: [{ provide: AuditApiService, useValue: mockAuditApi }],
    });
  });

  function createComponent(inputs?: {
    resourceType?: string;
    resourceId?: string;
    callerActorId?: string;
  }): ComponentFixture<AuditLogViewerComponent> {
    const fixture = TestBed.createComponent(AuditLogViewerComponent);
    if (inputs?.resourceType) fixture.componentRef.setInput('resourceType', inputs.resourceType);
    if (inputs?.resourceId) fixture.componentRef.setInput('resourceId', inputs.resourceId);
    if (inputs?.callerActorId) fixture.componentRef.setInput('callerActorId', inputs.callerActorId);
    fixture.detectChanges();
    return fixture;
  }

  // Escenario 1
  it('Escenario 1: admin opens contextual audit for a resource and views sanitized records with filters', async () => {
    const fixture = createComponent({
      resourceType: 'media',
      resourceId: 'media-item-88',
      callerActorId: 'admin-super-01',
    });

    await fixture.whenStable();
    fixture.detectChanges();

    // Verifies query was invoked with contextual filters
    expect(mockAuditApi.queryAuditEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          resourceType: 'media',
          resourceId: 'media-item-88',
        }),
        page: 1,
        callerActorId: 'admin-super-01',
      })
    );

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('media-item-88');
    expect(el.textContent).toContain('ADMIN_MEDIA_OVERRIDE');
    expect(el.textContent).toContain('MEDIA_PURGE_EXECUTION');
    expect(el.textContent).toContain('Éxito');
    expect(el.textContent).toContain('Fallo');

    // Table headers and accessibility
    const table = el.querySelector('table.audit-table');
    expect(table).not.toBeNull();
    const caption = el.querySelector('caption');
    expect(caption?.textContent).toContain('eventos de auditoría sanitizados');
  });

  // Escenario 2
  it('Escenario 2: filter yields no results and displays explicit no-results empty state', async () => {
    const fixture = createComponent({ resourceType: 'event', resourceId: 'event-001' });
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;

    // Mock zero results when filter is applied
    mockAuditApi.queryAuditEvents.mockResolvedValueOnce({
      items: [],
      page: 1,
      limit: 10,
      totalCount: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    });

    // Simulate applying a non-matching filter
    component.updateFilter('action', 'NON_EXISTENT_ACTION');
    await component.loadEvents(1);
    fixture.detectChanges();

    expect(component.viewState()).toBe('no-results');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Sin Coincidencias');
    expect(el.textContent).toContain('No se encontraron eventos de auditoría que coincidan con los filtros aplicados');

    // Resetting filters restores clean state
    mockAuditApi.queryAuditEvents.mockResolvedValueOnce(defaultPage);
    component.resetFilters();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.filters.action).toBe('');
    expect(component.viewState()).toBe('success');
  });

  // Escenario 3
  it('Escenario 3: failed audit record opens in detail and is presented strictly as read-only data without executable action', async () => {
    const fixture = createComponent({ resourceType: 'media', resourceId: 'media-item-99' });
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const failedEvent = sampleEvents[1]; // Result: FAILURE

    // Open detail
    component.openDetail(failedEvent);
    fixture.detectChanges();

    expect(component.selectedEvent()).toEqual(failedEvent);

    const el = fixture.nativeElement as HTMLElement;
    const detailDialog = el.querySelector('eventlens-audit-log-detail');
    expect(detailDialog).not.toBeNull();

    // Verify read-only notice is rendered (Escenario 3)
    expect(detailDialog?.textContent).toContain('Registro de solo lectura');
    expect(detailDialog?.textContent).toContain('No constituye una acción ejecutable ni ofrece reintento directo');

    // Verify there are NO executable buttons like retry, edit, execute, or delete
    const buttons = Array.from(detailDialog?.querySelectorAll('button') ?? []);
    const buttonTexts = buttons.map((b) => b.textContent?.trim().toLowerCase());
    expect(buttonTexts).not.toContain('reintentar');
    expect(buttonTexts).not.toContain('ejecutar');
    expect(buttonTexts).not.toContain('editar');
    expect(buttonTexts).not.toContain('eliminar');

    // Verify cause/reason and sanitized metadata are displayed
    expect(detailDialog?.textContent).toContain('Fallo al purgar archivo en bucket de almacenamiento');
    expect(detailDialog?.textContent).toContain('STORAGE_UNAVAILABLE');

    // Verify close action
    const closeBtn = detailDialog?.querySelector('button.close-button') as HTMLButtonElement;
    closeBtn.click();
    fixture.detectChanges();

    expect(component.selectedEvent()).toBeNull();
  });

  it('correctly discriminates between SYSTEM actor and human actor with sanitized credentials', async () => {
    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;

    // 1. Inspect SYSTEM actor
    component.openDetail(sampleEvents[1]); // System actor
    fixture.detectChanges();
    let detailEl = fixture.nativeElement.querySelector('eventlens-audit-log-detail');
    expect(detailEl?.textContent).toContain('Sistema (Automático)');
    expect(detailEl?.textContent).toContain('job-worker-purger');

    // 2. Inspect Human ADMIN actor
    component.openDetail(sampleEvents[0]); // Admin actor
    fixture.detectChanges();
    detailEl = fixture.nativeElement.querySelector('eventlens-audit-log-detail');
    expect(detailEl?.textContent).toContain('Humano (ADMIN)');
    expect(detailEl?.textContent).toContain('admin-usr-42');
    expect(detailEl?.textContent).toContain('192.168.1.10');
    expect(detailEl?.textContent).toContain('sess-abc-123');
  });

  it('handles UNAUTHORIZED_ACCESS / session expired error gracefully', async () => {
    mockAuditApi.queryAuditEvents.mockRejectedValueOnce(new Error('UNAUTHORIZED_ACCESS'));

    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component.viewState()).toBe('forbidden');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Acceso No Autorizado');
    expect(el.textContent).toContain('Tu sesión ha expirado o no cuentas con los permisos administrativos');
  });

  it('handles communication error with accessible retry button', async () => {
    mockAuditApi.queryAuditEvents.mockRejectedValueOnce(new Error('COMMUNICATION_ERROR'));

    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component.viewState()).toBe('error');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Error al Consultar Auditoría');

    // Click retry
    mockAuditApi.queryAuditEvents.mockResolvedValueOnce(defaultPage);
    const retryBtn = el.querySelector('button.btn-retry') as HTMLButtonElement;
    retryBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.viewState()).toBe('success');
  });

  it('renders partial logs warning when response contains isPartial: true', async () => {
    mockAuditApi.queryAuditEvents.mockResolvedValueOnce({
      ...defaultPage,
      isPartial: true,
    });

    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Aviso de observabilidad: Mostrando registros parciales');
  });

  it('supports accessible pagination across pages', async () => {
    mockAuditApi.queryAuditEvents.mockResolvedValueOnce({
      items: [sampleEvents[0]],
      page: 1,
      limit: 1,
      totalCount: 2,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    });

    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component.pageData()?.page).toBe(1);

    mockAuditApi.queryAuditEvents.mockResolvedValueOnce({
      items: [sampleEvents[1]],
      page: 2,
      limit: 1,
      totalCount: 2,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    });

    const nextBtn = fixture.nativeElement.querySelector('button[aria-label="Ir a la página siguiente"]') as HTMLButtonElement;
    nextBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.pageData()?.page).toBe(2);
    expect(mockAuditApi.queryAuditEvents).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2 })
    );
  });
});
