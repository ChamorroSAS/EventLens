import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EventTimezoneSectionComponent } from './event-timezone-section.component.js';
import { OrganizerService } from './organizer.service.js';
import type { OrganizerEventModel } from './organizer.types.js';

describe('EventTimezoneSectionComponent', () => {
  let component: EventTimezoneSectionComponent;
  let fixture: ComponentFixture<EventTimezoneSectionComponent>;
  let organizerServiceSpy: {
    changeEventTimezone: ReturnType<typeof vi.fn>;
  };

  const mockDraftEvent: OrganizerEventModel = {
    id: 'evt-draft-1',
    organizerId: 'org-1',
    name: 'Boda de Prueba',
    status: 'DRAFT',
    timezone: 'America/Bogota',
    startsAtLocal: null,
    scheduledAt: null,
    utcOffsetMinutes: null,
    expiresAt: null,
    graceEndsAt: null,
    uploadsEnabled: true,
    guestGalleryEnabled: true,
    moderationMode: 'AUTO_PUBLISH',
    pinEnabled: false,
    createdAt: '2026-10-13T10:00:00Z',
    updatedAt: '2026-10-13T10:00:00Z'
  };

  const mockScheduledEvent: OrganizerEventModel = {
    ...mockDraftEvent,
    id: 'evt-sched-1',
    status: 'SCHEDULED',
    startsAtLocal: '2026-11-01T15:00',
    scheduledAt: '2026-11-01T20:00:00.000Z',
    utcOffsetMinutes: -300
  };

  const mockActiveEvent: OrganizerEventModel = {
    ...mockDraftEvent,
    id: 'evt-active-1',
    status: 'ACTIVE'
  };

  beforeEach(async () => {
    organizerServiceSpy = {
      changeEventTimezone: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [EventTimezoneSectionComponent],
      providers: [{ provide: OrganizerService, useValue: organizerServiceSpy }]
    }).compileComponents();

    fixture = TestBed.createComponent(EventTimezoneSectionComponent);
    component = fixture.componentInstance;
  });

  it('renders confirmed timezone badge and timezone select options', () => {
    component.event = mockDraftEvent;
    component.revision = '1';
    component.ngOnChanges({
      event: {
        currentValue: mockDraftEvent,
        previousValue: undefined,
        firstChange: true,
        isFirstChange: () => true
      }
    });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const badge = el.querySelector('.timezone-badge');
    expect(badge?.textContent).toContain('America/Bogota');

    const select = el.querySelector('#tz-select-input') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.disabled).toBe(false);

    // Save button should be disabled because no different timezone is selected yet
    const saveBtn = el.querySelector('.btn-save') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it('filters timezones when user types in search input', () => {
    component.event = mockDraftEvent;
    component.ngOnChanges({
      event: {
        currentValue: mockDraftEvent,
        previousValue: undefined,
        firstChange: true,
        isFirstChange: () => true
      }
    });
    fixture.detectChanges();

    component.onSearchInput({ target: { value: 'Madrid' } } as unknown as Event);
    fixture.detectChanges();

    expect(component.filteredTimezones()).toContain('Europe/Madrid');
    expect(component.filteredTimezones().length).toBeLessThan(component.allTimezones().length);
  });

  it('shows recalculation notice when event is SCHEDULED and user prepares different timezone', () => {
    component.event = mockScheduledEvent;
    component.ngOnChanges({
      event: {
        currentValue: mockScheduledEvent,
        previousValue: undefined,
        firstChange: true,
        isFirstChange: () => true
      }
    });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    // Before selecting different timezone, warning notice is not visible
    expect(el.querySelector('.alert-warning')).toBeNull();

    // User selects Europe/Madrid
    component.selectedTimezone.set('Europe/Madrid');
    fixture.detectChanges();

    const warning = el.querySelector('.alert-warning');
    expect(warning).toBeTruthy();
    expect(warning?.textContent).toContain('Aviso de recálculo');
    expect(warning?.textContent).toContain('recalculada automáticamente por el servidor');
  });

  it('successfully saves new timezone for DRAFT event and emits saved event', async () => {
    component.event = mockDraftEvent;
    component.revision = '3';
    component.ngOnChanges({
      event: {
        currentValue: mockDraftEvent,
        previousValue: undefined,
        firstChange: true,
        isFirstChange: () => true
      }
    });
    fixture.detectChanges();

    component.selectedTimezone.set('America/New_York');
    organizerServiceSpy.changeEventTimezone.mockResolvedValue({
      event: { ...mockDraftEvent, timezone: 'America/New_York' },
      previousTimezone: 'America/Bogota',
      revision: 4,
      warning: null,
      outcome: 'TIMEZONE_CHANGED',
      receipt: null
    });

    const savedSpy = vi.spyOn(component.saved, 'emit');

    await component.onSubmit();
    fixture.detectChanges();

    expect(organizerServiceSpy.changeEventTimezone).toHaveBeenCalledWith({
      eventId: 'evt-draft-1',
      timezone: 'America/New_York',
      expectedRevision: '3'
    });
    expect(savedSpy).toHaveBeenCalled();

    const el = fixture.nativeElement as HTMLElement;
    const successAlert = el.querySelector('.alert-success');
    expect(successAlert?.textContent).toContain('Zona horaria guardada con éxito.');
  });

  it('handles CONCURRENCY_CONFLICT (409) preserving input and emits reconcile on click', async () => {
    component.event = mockDraftEvent;
    component.revision = '2';
    component.ngOnChanges({
      event: {
        currentValue: mockDraftEvent,
        previousValue: undefined,
        firstChange: true,
        isFirstChange: () => true
      }
    });
    fixture.detectChanges();

    component.selectedTimezone.set('Europe/Paris');
    organizerServiceSpy.changeEventTimezone.mockRejectedValue(new Error('CONCURRENCY_CONFLICT'));

    const reconcileSpy = vi.spyOn(component.reconcile, 'emit');

    await component.onSubmit();
    fixture.detectChanges();

    expect(component.selectedTimezone()).toBe('Europe/Paris');
    const el = fixture.nativeElement as HTMLElement;
    const errorAlert = el.querySelector('.alert-danger');
    expect(errorAlert?.textContent).toContain('Conflicto de concurrencia');

    const reconcileBtn = el.querySelector('.btn-reconcile') as HTMLButtonElement;
    expect(reconcileBtn).toBeTruthy();
    reconcileBtn.click();
    expect(reconcileSpy).toHaveBeenCalled();
  });

  it('blocks modification and displays informational alert when event is ACTIVE', () => {
    component.event = mockActiveEvent;
    component.ngOnChanges({
      event: {
        currentValue: mockActiveEvent,
        previousValue: undefined,
        firstChange: true,
        isFirstChange: () => true
      }
    });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const infoAlert = el.querySelector('.alert-info');
    expect(infoAlert?.textContent).toContain('ACTIVO');
    expect(infoAlert?.textContent).toContain('no se permite cambiar la zona horaria');

    const searchInput = el.querySelector('#tz-search-input') as HTMLInputElement;
    const select = el.querySelector('#tz-select-input') as HTMLSelectElement;
    const saveBtn = el.querySelector('.btn-save') as HTMLButtonElement;

    expect(searchInput.disabled).toBe(true);
    expect(select.disabled).toBe(true);
    expect(saveBtn.disabled).toBe(true);
  });
});
