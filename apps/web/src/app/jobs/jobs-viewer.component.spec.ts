import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobsViewerComponent } from './jobs-viewer.component.js';
import { JobsApiService } from './jobs-api.service.js';
import type { AdminJobDetail, AdminJobSummaryItem, AdminQueryJobsResult } from './jobs.types.js';

describe('JobsViewerComponent (Angular Component Tests — EL-TK-153)', () => {
  let fixture: ComponentFixture<JobsViewerComponent>;
  let component: JobsViewerComponent;
  let mockJobsApi: {
    queryJobs: ReturnType<typeof vi.fn>;
    getJobDetail: ReturnType<typeof vi.fn>;
    executeJobAction: ReturnType<typeof vi.fn>;
  };

  const deadJobSummary: AdminJobSummaryItem = {
    id: '99000000-0000-0000-0000-000000000001',
    type: 'PROCESS_IMAGE',
    status: 'DEAD',
    queue: 'media-processing',
    priority: 10,
    resourceRef: 'event:111',
    attempts: 3,
    availableAt: '2026-10-11T12:00:00Z',
    cancelled: false,
    lastError: 'S3 Connection timeout after 3 attempts',
    capabilities: {
      canRetry: true,
      canCancel: false,
      canMarkDead: false
    }
  };

  const deadJobDetail: AdminJobDetail = {
    id: '99000000-0000-0000-0000-000000000001',
    type: 'PROCESS_IMAGE',
    status: 'DEAD',
    queue: 'media-processing',
    priority: 10,
    resourceRef: 'event:111',
    attempts: 3,
    availableAt: '2026-10-11T12:00:00Z',
    deadline: null,
    cancelled: false,
    sanitizedError: 'S3 Connection timeout after 3 attempts [Sanitized Trace]',
    attemptsHistory: [
      { number: 1, startedAt: '2026-10-11T11:58:00Z', endedAt: '2026-10-11T11:58:10Z', result: 'FAILED' },
      { number: 2, startedAt: '2026-10-11T11:59:00Z', endedAt: '2026-10-11T11:59:10Z', result: 'FAILED' },
      { number: 3, startedAt: '2026-10-11T12:00:00Z', endedAt: '2026-10-11T12:00:10Z', result: 'FAILED' }
    ],
    capabilities: {
      canRetry: true,
      canCancel: false,
      canMarkDead: false
    }
  };

  beforeEach(async () => {
    mockJobsApi = {
      queryJobs: vi.fn(async (): Promise<AdminQueryJobsResult> => ({
        items: [deadJobSummary],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
      })),
      getJobDetail: vi.fn(async (): Promise<AdminJobDetail> => deadJobDetail),
      executeJobAction: vi.fn(async () => ({
        outcome: 'EXECUTED' as const,
        jobId: deadJobSummary.id,
        action: 'RETRY' as const,
        previousStatus: 'DEAD' as const,
        newStatus: 'PENDING' as const,
        executedAt: new Date().toISOString()
      }))
    };

    await TestBed.configureTestingModule({
      imports: [JobsViewerComponent],
      providers: [
        { provide: JobsApiService, useValue: mockJobsApi }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(JobsViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('Escenario 1: Dado job DEAD elegible, muestra Retry y capacidades habilitadas', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const retryBtn = compiled.querySelector('.btn-retry');
    expect(retryBtn).not.toBeNull();
    expect(retryBtn?.textContent).toContain('Retry');

    const cancelBtn = compiled.querySelector('.btn-cancel');
    expect(cancelBtn).toBeNull(); // canCancel es falso para job DEAD
  });

  it('Escenario 2: Apertura de diálogo de confirmación, captura de motivo y cancelación preservando estado', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    // Iniciar acción Retry
    component.requestAction(deadJobSummary.id, 'RETRY', { currentTarget: document.body } as any);
    fixture.detectChanges();

    expect(component.pendingAction()).toEqual({
      jobId: deadJobSummary.id,
      action: 'RETRY'
    });

    const compiled = fixture.nativeElement as HTMLElement;
    const dialog = compiled.querySelector('eventlens-job-action-confirm-dialog');
    expect(dialog).not.toBeNull();

    // Cancelar diálogo
    component.cancelAction();
    fixture.detectChanges();

    expect(component.pendingAction()).toBeNull();
    expect(compiled.querySelector('eventlens-job-action-confirm-dialog')).toBeNull();
  });

  it('Escenario 3: Si comando falla o entra en conflicto, UI actualiza contexto sin afirmar éxito', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    mockJobsApi.executeJobAction.mockRejectedValueOnce(
      new Error('INCOMPATIBLE_JOB_STATUS: Job ya fue reclamado por otro worker')
    );

    await component.onActionConfirmed({
      jobId: deadJobSummary.id,
      action: 'RETRY',
      reason: 'Reintento tras resolucion de incidencia S3'
    });

    await fixture.whenStable();
    fixture.detectChanges();

    // Error mostrado sin fingir éxito
    expect(component.lastErrorMessage()).toContain('INCOMPATIBLE_JOB_STATUS');
    expect(component.lastSuccessMessage()).toBeNull();

    // Refresca la lista de jobs para sincronizar el estado real
    expect(mockJobsApi.queryJobs).toHaveBeenCalledTimes(2);
  });

  it('Garantiza accesibilidad WCAG 2.2 AA con anunciador aria-live y roles semanticos', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const announcer = compiled.querySelector('.header-status-announcer');
    expect(announcer?.getAttribute('aria-live')).toBe('polite');
    expect(announcer?.getAttribute('role')).toBe('status');
  });
});
