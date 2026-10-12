import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect } from 'vitest';
import { EventCapacityPanelComponent } from './event-capacity-panel.component.js';
import type {
  CapacityUsageSummaryModel,
  ExtensionRequestModel,
} from './capacity.types.js';

describe('EventCapacityPanelComponent (Organizer Capacity Surface — EL-TK-143)', () => {
  function createCapacitySummary(
    overrides: Partial<CapacityUsageSummaryModel> = {}
  ): CapacityUsageSummaryModel {
    return {
      eventId: 'evt-test-123',
      effectiveLimits: {
        planCode: 'BETA_DEFAULT',
        planName: 'Beta',
        storageBytes: '10737418240', // 10 GB
        maxFiles: 1000,
        retentionDays: 30,
        isOverrideActive: false,
      },
      consumedStorage: {
        bytes: '4831838208',
        megabytes: 4608,
        gigabytes: 4.5,
        files: 250,
      },
      activeReservations: {
        bytes: '0',
        megabytes: 0,
        gigabytes: 0,
        files: 0,
      },
      available: {
        bytes: '5905580032',
        megabytes: 5632,
        gigabytes: 5.5,
        files: 750,
      },
      usagePercentage: {
        storagePercent: 45.0,
        filesPercent: 25.0,
      },
      flags: {
        isZeroUsage: false,
        isOverStorageQuota: false,
        isOverFilesQuota: false,
        isNearStorageLimit: false,
        isNearFilesLimit: false,
      },
      snapshotAt: new Date().toISOString(),
      ...overrides,
    };
  }

  function createComponent(
    summary: CapacityUsageSummaryModel,
    openRequest: ExtensionRequestModel | null = null
  ): ComponentFixture<EventCapacityPanelComponent> {
    const fixture = TestBed.createComponent(EventCapacityPanelComponent);
    fixture.componentRef.setInput('capacitySummary', summary);
    fixture.componentRef.setInput('openRequest', openRequest);
    fixture.detectChanges();
    return fixture;
  }

  describe('Escenario 1: Renderiza barras de progreso, porcentajes y cuota', () => {
    it('muestra métricas de GB y archivos con porcentaje y estado normal', () => {
      const summary = createCapacitySummary();
      const fixture = createComponent(summary);
      const el = fixture.nativeElement as HTMLElement;

      expect(el.textContent).toContain('4.50 GB / 10.00 GB');
      expect(el.textContent).toContain('45.0% utilizado');
      expect(el.textContent).toContain('250 / 1000');
      expect(el.textContent).toContain('Capacidad normal');
    });

    it('muestra advertencia cuando el uso supera el límite comercial (OVER_QUOTA)', () => {
      const summary = createCapacitySummary({
        usagePercentage: { storagePercent: 105.0, filesPercent: 60.0 },
        flags: {
          isZeroUsage: false,
          isOverStorageQuota: true,
          isOverFilesQuota: false,
          isNearStorageLimit: true,
          isNearFilesLimit: false,
        },
      });
      const fixture = createComponent(summary);
      const el = fixture.nativeElement as HTMLElement;

      expect(el.textContent).toContain('Límite excedido');
      expect(el.textContent).toContain('cargas bloqueadas');
    });
  });

  describe('Escenario 2: Solicitud de ampliación modal y envío', () => {
    it('muestra botón "Solicitar ampliación" cuando no hay solicitud abierta y abre modal', () => {
      const summary = createCapacitySummary();
      const fixture = createComponent(summary, null);
      const component = fixture.componentInstance;
      const el = fixture.nativeElement as HTMLElement;

      expect(el.textContent).toContain('Solicitar ampliación');
      expect(component.isDialogOpen).toBe(false);

      const button = el.querySelector('button.btn-outline') as HTMLButtonElement;
      button.click();
      fixture.detectChanges();

      expect(component.isDialogOpen).toBe(true);
      expect(el.querySelector('app-extension-request-dialog')).not.toBeNull();
    });

    it('emite evento requestCreated cuando el modal envía la solicitud', () => {
      const summary = createCapacitySummary();
      const fixture = createComponent(summary, null);
      const component = fixture.componentInstance;

      let emittedCommand: any = null;
      component.requestCreated.subscribe((cmd) => {
        emittedCommand = cmd;
      });

      component.onRequestSubmitted({
        eventId: 'evt-test-123',
        requestType: 'STORAGE',
        additionalGb: 5.5,
        reason: 'Ampliación para evento fotográfico',
      });

      expect(emittedCommand).not.toBeNull();
      expect(emittedCommand.additionalGb).toBe(5.5);
      expect(emittedCommand.reason).toBe('Ampliación para evento fotográfico');
    });
  });

  describe('Escenario 3: Respuesta a solicitud en INFORMATION_REQUESTED', () => {
    it('muestra historial y formulario de aclaración cuando la solicitud está en INFORMATION_REQUESTED', () => {
      const summary = createCapacitySummary();
      const openRequest: ExtensionRequestModel = {
        id: 'req-456',
        eventId: 'evt-test-123',
        requestedBy: 'org-1',
        requestType: 'STORAGE',
        additionalGb: 5,
        additionalDays: null,
        reason: 'Ampliación inicial',
        status: 'INFORMATION_REQUESTED',
        resolvedAt: null,
        resolvedBy: null,
        decisionReason: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [
          {
            id: 'm-1',
            requestId: 'req-456',
            authorRole: 'ORGANIZER',
            authorId: 'org-1',
            messageType: 'INITIAL_REQUEST',
            content: 'Ampliación inicial',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'm-2',
            requestId: 'req-456',
            authorRole: 'ADMIN',
            authorId: 'admin-1',
            messageType: 'INFORMATION_REQUESTED',
            content: '¿Cuál es el tipo de media prioritario?',
            createdAt: new Date().toISOString(),
          },
        ],
      };

      const fixture = createComponent(summary, openRequest);
      const component = fixture.componentInstance;
      const el = fixture.nativeElement as HTMLElement;

      expect(el.textContent).toContain('Información solicitada');
      expect(el.textContent).toContain('¿Cuál es el tipo de media prioritario?');
      expect(el.querySelector('.respond-box')).not.toBeNull();

      let emittedResponse: any = null;
      component.infoResponded.subscribe((res) => {
        emittedResponse = res;
      });

      component.responseText = 'Prioridad en fotos RAW y videos 4K.';
      component.onSendResponse();

      expect(emittedResponse).not.toBeNull();
      expect(emittedResponse.requestId).toBe('req-456');
      expect(emittedResponse.response).toBe('Prioridad en fotos RAW y videos 4K.');
    });
  });
});
