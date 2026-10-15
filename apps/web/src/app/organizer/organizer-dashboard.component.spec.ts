import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrganizerDashboardComponent } from './organizer-dashboard.component.js';
import { OrganizerService } from './organizer.service.js';
import type { OrganizerEventModel, EventConfigurationModel } from './organizer.types.js';
import { By } from '@angular/platform-browser';
import { EventScheduleSectionComponent } from './event-schedule-section.component.js';
import { EventParticipationSettingsComponent } from './event-participation-settings.component.js';

describe('OrganizerDashboardComponent & Organizer Navigation (EL-TK-048)', () => {
  let organizerServiceMock: {
    listEvents: ReturnType<typeof vi.fn>;
    getEventConfiguration: ReturnType<typeof vi.fn>;
  };

  const sampleEvents: OrganizerEventModel[] = [
    {
      id: 'event-101',
      organizerId: 'org-1',
      name: 'Cumpleaños de Valentina',
      status: 'DRAFT',
      timezone: 'America/Bogota',
      startsAtLocal: '2026-11-20T18:00:00',
      scheduledAt: '2026-11-20T23:00:00.000Z',
      utcOffsetMinutes: -300,
      expiresAt: null,
      graceEndsAt: null,
      uploadsEnabled: false,
      guestGalleryEnabled: false,
      moderationMode: 'AUTO_PUBLISH',
      pinEnabled: true,
      createdAt: '2026-10-10T10:00:00.000Z',
      updatedAt: '2026-10-10T10:00:00.000Z'
    },
    {
      id: 'event-102',
      organizerId: 'org-1',
      name: 'Festival de Fotografía',
      status: 'ACTIVE',
      timezone: 'America/Bogota',
      startsAtLocal: '2026-10-01T09:00:00',
      scheduledAt: '2026-10-01T14:00:00.000Z',
      utcOffsetMinutes: -300,
      expiresAt: '2026-10-15T14:00:00.000Z',
      graceEndsAt: null,
      uploadsEnabled: true,
      guestGalleryEnabled: true,
      moderationMode: 'AUTO_PUBLISH',
      pinEnabled: false,
      createdAt: '2026-09-25T10:00:00.000Z',
      updatedAt: '2026-09-25T10:00:00.000Z'
    }
  ];

  const sampleConfig: EventConfigurationModel = {
    event: sampleEvents[0],
    revision: '1696939200000',
    capabilities: {
      canEditSchedule: true,
      canEditSettings: true,
      canManageAccess: true,
      canViewLifecycle: true,
      canViewCapacity: true,
      canPublishOrActivate: true
    }
  };

  beforeEach(async () => {
    organizerServiceMock = {
      listEvents: vi.fn().mockResolvedValue(sampleEvents),
      getEventConfiguration: vi.fn().mockResolvedValue(sampleConfig)
    };

    await TestBed.configureTestingModule({
      imports: [OrganizerDashboardComponent],
      providers: [
        { provide: OrganizerService, useValue: organizerServiceMock }
      ]
    }).compileComponents();
  });

  async function createDashboard(): Promise<ComponentFixture<OrganizerDashboardComponent>> {
    const fixture = TestBed.createComponent(OrganizerDashboardComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('binds participation flags, revision and capabilities from the same authorized configuration', async () => {
    const fixture = await createDashboard();
    const config = { ...sampleConfig, revision: '6', event: { ...sampleEvents[0], uploadsEnabled: true, guestGalleryEnabled: true } };
    organizerServiceMock.getEventConfiguration.mockResolvedValue(config);
    await fixture.componentInstance.onEventSelected(sampleEvents[0].id);
    fixture.componentInstance.onSectionChange('guest');
    fixture.detectChanges();
    const section = fixture.debugElement.query(By.directive(EventParticipationSettingsComponent)).componentInstance as EventParticipationSettingsComponent;
    expect(section.configuration).toBe(config);
    expect(section.uploadsEnabled).toBe(true);
    expect(section.guestGalleryEnabled).toBe(true);
    expect(fixture.componentInstance.events()[0].uploadsEnabled).toBe(false);
  });

  it('updates schedule and revision from one configuration before the slower event-list refresh', async () => {
    const fixture = await createDashboard();
    await fixture.componentInstance.onEventSelected(sampleEvents[0].id);
    fixture.componentInstance.onSectionChange('schedule');
    fixture.detectChanges();
    const section = fixture.debugElement.query(By.directive(EventScheduleSectionComponent)).componentInstance as EventScheduleSectionComponent;
    expect(section.startsAtLocal).toBe('2026-11-20T18:00');
    const updatedEvent = { ...sampleEvents[0], startsAtLocal: '2026-11-20T20:30:00' };
    organizerServiceMock.getEventConfiguration.mockResolvedValue({ ...sampleConfig, revision: '6', event: updatedEvent });
    let resolveList!: (events: OrganizerEventModel[]) => void;
    organizerServiceMock.listEvents.mockImplementationOnce(() => new Promise<OrganizerEventModel[]>(resolve => { resolveList = resolve; }));
    const refreshing = fixture.componentInstance.onReconcileEvent();
    await Promise.resolve();
    fixture.detectChanges();
    expect(section.revision).toBe('6');
    expect(section.startsAtLocal).toBe('2026-11-20T20:30');
    resolveList([updatedEvent, sampleEvents[1]]);
    await refreshing;
    fixture.detectChanges();
    expect(section.startsAtLocal).toBe('2026-11-20T20:30');
  });

  it('Escenario 1: Renderiza lista de eventos con sus cards y badges de estado', async () => {
    const fixture = await createDashboard();
    await fixture.whenStable();
    fixture.detectChanges();

    const titleEl = fixture.nativeElement.querySelector('.dashboard-title');
    expect(titleEl.textContent).toContain('Mis eventos');

    const cards = fixture.nativeElement.querySelectorAll('eventlens-event-card');
    expect(cards.length).toBe(2);

    expect(fixture.nativeElement.textContent).toContain('Cumpleaños de Valentina');
    expect(fixture.nativeElement.textContent).toContain('Festival de Fotografía');
  });

  it('Escenario 2: Renderiza estado vacío accesible cuando no hay eventos registrados', async () => {
    organizerServiceMock.listEvents.mockResolvedValue([]);
    const fixture = await createDashboard();
    await fixture.whenStable();
    fixture.detectChanges();

    const emptyState = fixture.nativeElement.querySelector('.empty-state');
    expect(emptyState).toBeTruthy();
    expect(emptyState.textContent).toContain('Aún no tienes eventos creados');
    expect(emptyState.getAttribute('role')).toBe('status');
  });

  it('Escenario 3: Maneja error de carga y permite reintentar', async () => {
    organizerServiceMock.listEvents.mockRejectedValue(new Error('COMMUNICATION_ERROR'));
    const fixture = await createDashboard();
    await fixture.whenStable();
    fixture.detectChanges();

    const errorEl = fixture.nativeElement.querySelector('.error-state');
    expect(errorEl).toBeTruthy();
    expect(errorEl.getAttribute('role')).toBe('alert');
    expect(errorEl.textContent).toContain('No fue posible cargar tus eventos');

    // Recuperación con reintentar
    organizerServiceMock.listEvents.mockResolvedValue(sampleEvents);
    const retryBtn = fixture.nativeElement.querySelector('.btn-retry');
    retryBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.error-state')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('eventlens-event-card').length).toBe(2);
  });

  it('Escenario 4: Selecciona un evento, carga su configuración autorizada y navega entre secciones', async () => {
    const fixture = await createDashboard();
    await fixture.whenStable();
    fixture.detectChanges();

    // Seleccionar primer evento
    const configBtns = fixture.nativeElement.querySelectorAll('eventlens-event-card button');
    configBtns[0].click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(organizerServiceMock.getEventConfiguration).toHaveBeenCalledWith('event-101');
    expect(fixture.componentInstance.selectedEventId()).toBe('event-101');

    // Contexto en AppShell
    const contextEl = fixture.nativeElement.querySelector('.event-context-area');
    expect(contextEl).toBeTruthy();
    expect(contextEl.textContent).toContain('Cumpleaños de Valentina');

    // Barra de navegación de configuración
    const nav = fixture.nativeElement.querySelector('eventlens-event-settings-nav');
    expect(nav).toBeTruthy();

    // Cambiar a sección de programación
    const navTabs = fixture.nativeElement.querySelectorAll('.nav-tab');
    navTabs[1].click(); // Tab Programación
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.activeSection()).toBe('schedule');
    expect(fixture.nativeElement.textContent).toContain('Programación de inicio');
    expect(fixture.nativeElement.textContent).toContain('America/Bogota');
  });

  it('Escenario 5: Botón Volver a mis eventos restablece la vista de lista sin mutaciones', async () => {
    const fixture = await createDashboard();
    await fixture.whenStable();
    fixture.detectChanges();

    // Seleccionar evento
    await fixture.componentInstance.onEventSelected('event-101');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedEventId()).toBe('event-101');

    // Clic en Volver
    const backBtn = fixture.nativeElement.querySelector('.btn-back');
    backBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedEventId()).toBeNull();
    expect(fixture.componentInstance.selectedEventConfig()).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('eventlens-event-card').length).toBe(2);
  });

  it('EL-TK-210: allows ordinary organizer on /mis-eventos, redirects restricted PENDING_DELETION to /mi-cuenta, and clears cached events on logout', async () => {
    const { OrganizerSessionService } = await import('../organizer-session.service');
    const { organizerDashboardRouteGuard, ORGANIZER_DASHBOARD_ROUTE_DESCRIPTOR } = await import(
      './organizer-dashboard.component.js'
    );

    expect(ORGANIZER_DASHBOARD_ROUTE_DESCRIPTOR.path).toBe('/mis-eventos');

    const sessionService = TestBed.inject(OrganizerSessionService);
    sessionService.applyServerProjection(
      {
        state: 'ORGANIZER_ACTIVE',
        capabilities: {
          canSignIn: false,
          canRequestBetaAccess: true,
          canAccessMyEvents: true,
          canAccessMyAccount: true,
          canManageSessions: true,
          canManageAccountDeletion: true,
          isDeletionRestricted: false,
          canSignOut: true
        },
        account: {
          email: 'org@eventlens.test',
          emailVerified: true,
          accountStatus: 'ACTIVE'
        }
      },
      'csrf-1'
    );

    const allowed = await TestBed.runInInjectionContext(() =>
      organizerDashboardRouteGuard({
        pathname: '/mis-eventos',
        safePathname: '/mis-eventos',
        params: {},
        queryParams: {},
        fragment: null
      })
    );
    expect(allowed).toBe(true);

    const fixture = await createDashboard();
    expect(fixture.componentInstance.events().length).toBe(2);

    // Clearing local session projection wipes cached events
    sessionService.clearLocalSessionProjection('ANONYMOUS');
    expect(fixture.componentInstance.events().length).toBe(0);

    // Restricted PENDING_DELETION redirects to /mi-cuenta
    sessionService.applyServerProjection(
      {
        state: 'ORGANIZER_RESTRICTED_DELETION',
        capabilities: {
          canSignIn: false,
          canRequestBetaAccess: true,
          canAccessMyEvents: false,
          canAccessMyAccount: true,
          canManageSessions: false,
          canManageAccountDeletion: true,
          isDeletionRestricted: true,
          canSignOut: true
        },
        account: {
          email: 'restricted@eventlens.test',
          emailVerified: true,
          accountStatus: 'PENDING_DELETION'
        }
      },
      'csrf-2'
    );

    const restrictedRedirect = await TestBed.runInInjectionContext(() =>
      organizerDashboardRouteGuard({
        pathname: '/mis-eventos',
        safePathname: '/mis-eventos',
        params: {},
        queryParams: {},
        fragment: null
      })
    );
    expect(restrictedRedirect).toBe('/mi-cuenta');
  });

  describe('Unsaved changes navigation confirmation (EL-TK-230)', () => {
    let fixture: ComponentFixture<OrganizerDashboardComponent>;
    let component: OrganizerDashboardComponent;

    beforeEach(async () => {
      organizerServiceMock.listEvents.mockResolvedValue(sampleEvents);
      organizerServiceMock.getEventConfiguration.mockResolvedValue(sampleConfig);
      fixture = await createDashboard();
      component = fixture.componentInstance;
      await component.onEventSelected('event-101');
      fixture.detectChanges();
    });

    it('interrumpe el cambio de sección cuando hay cambios sin guardar y abre el modal de confirmación', () => {
      component.isBasicInfoDirty.set(true);
      fixture.detectChanges();

      // Intenta cambiar a la sección schedule
      component.onSectionChange('schedule');
      fixture.detectChanges();

      // Debe permanecer en general y abrir el modal
      expect(component.activeSection()).toBe('general');
      expect(component.showUnsavedChangesModal()).toBe(true);

      const modal = fixture.nativeElement.querySelector('.unsaved-modal-backdrop');
      expect(modal).toBeTruthy();
      expect(modal.textContent).toContain('¿Descartar cambios sin guardar?');

      // Si elige seguir editando
      component.onKeepEditing();
      fixture.detectChanges();

      expect(component.showUnsavedChangesModal()).toBe(false);
      expect(component.activeSection()).toBe('general');
    });

    it('descarta cambios y continúa con la navegación cuando el usuario confirma', () => {
      component.isBasicInfoDirty.set(true);
      fixture.detectChanges();

      // Intenta cambiar de sección
      component.onSectionChange('schedule');
      fixture.detectChanges();

      // Confirma descartar
      component.onDiscardAndNavigate();
      fixture.detectChanges();

      expect(component.showUnsavedChangesModal()).toBe(false);
      expect(component.isBasicInfoDirty()).toBe(false);
      expect(component.activeSection()).toBe('schedule');
    });

    it('interrumpe la salida a Mis eventos con cambios sin guardar y descarta al confirmar', () => {
      component.isBasicInfoDirty.set(true);
      fixture.detectChanges();

      component.onBackToEvents();
      fixture.detectChanges();

      expect(component.selectedEventId()).toBe('event-101');
      expect(component.showUnsavedChangesModal()).toBe(true);

      component.onDiscardAndNavigate();
      fixture.detectChanges();

      expect(component.selectedEventId()).toBeNull();
      expect(component.isBasicInfoDirty()).toBe(false);
    });

    it('actualiza el nombre del evento en la lista y configuración al recibir onEventBasicInfoUpdated', () => {
      const updatedName = 'Cumpleaños Renovado de Valentina';
      component.onEventBasicInfoUpdated({
        id: 'event-101',
        name: updatedName,
        revision: '2'
      });
      fixture.detectChanges();

      expect(component.selectedEvent()?.name).toBe(updatedName);
      expect(component.selectedEventConfig()?.event.name).toBe(updatedName);
      expect(component.selectedEventConfig()?.revision).toBe('2');
      expect(component.isBasicInfoDirty()).toBe(false);
    });

    it('descarta respuestas tardías de evento A cuando el usuario navega a evento B (carrera A->B - EL-TK-228)', async () => {
      let resolveA!: (value: any) => void;
      const promiseA = new Promise((res) => { resolveA = res; });
      const configB: EventConfigurationModel = {
        event: sampleEvents[1],
        revision: '200',
        capabilities: {
          canEditName: false,
          canEditSchedule: false,
          canChangeTimezone: false,
          canEditSettings: false,
          canManageAccess: false,
          canViewLifecycle: false,
          canViewCapacity: false,
          canPublishOrActivate: false
        }
      };

      organizerServiceMock.getEventConfiguration.mockImplementation((id: string) => {
        if (id === 'event-101') return promiseA;
        if (id === 'event-102') return Promise.resolve(configB);
        return Promise.reject(new Error('NOT_FOUND'));
      });

      // 1. Usuario selecciona evento A
      const selectionA = component.onEventSelected('event-101');
      expect(component.selectedEventId()).toBe('event-101');
      expect(component.selectedEventConfig()).toBeNull();

      // 2. Antes de que A responda, usuario selecciona evento B
      await component.onEventSelected('event-102');
      expect(component.selectedEventId()).toBe('event-102');
      expect(component.selectedEventConfig()).toBe(configB);

      // 3. Respuesta tardía de A llega ahora
      resolveA(sampleConfig);
      await selectionA;

      // 4. Configuración bajo B NO fue sobreescrita por A
      expect(component.selectedEventId()).toBe('event-102');
      expect(component.selectedEventConfig()).toBe(configB);
      expect(component.selectedEventConfig()?.event.id).toBe('event-102');
    });

    it('devuelve resultado neutro sin datos ni capacidades si el evento es ajeno o inexistente (EL-TK-228)', async () => {
      organizerServiceMock.getEventConfiguration.mockRejectedValueOnce(new Error('ACCESS_DENIED'));

      await component.onEventSelected('event-ajeno-999');

      expect(component.selectedEventId()).toBeNull();
      expect(component.selectedEventConfig()).toBeNull();
      expect(component.errorMessage()).toContain('El evento seleccionado no existe o no tienes permisos');
    });
  });
});
