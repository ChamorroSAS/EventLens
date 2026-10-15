import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventScheduleSectionComponent } from './event-schedule-section.component.js';
import { OrganizerService } from './organizer.service.js';
import type { OrganizerEventModel } from './organizer.types.js';

describe('EventScheduleSectionComponent (EL-TK-231)', () => {
  let fixture: ComponentFixture<EventScheduleSectionComponent>;
  let component: EventScheduleSectionComponent;
  let mockOrganizerService: {
    setEventSchedule: ReturnType<typeof vi.fn>;
  };

  const sampleEvent: OrganizerEventModel = {
    id: 'event-123',
    organizerId: 'org-123',
    name: 'Boda Campestre',
    status: 'DRAFT',
    timezone: 'America/Bogota',
    startsAtLocal: '2026-11-20T18:00:00',
    scheduledAt: null,
    utcOffsetMinutes: null,
    expiresAt: null,
    graceEndsAt: null,
    uploadsEnabled: false,
    guestGalleryEnabled: false,
    moderationMode: 'AUTO_PUBLISH',
    pinEnabled: false,
    createdAt: '2026-10-10T10:00:00Z',
    updatedAt: '2026-10-10T10:00:00Z'
  };

  beforeEach(async () => {
    mockOrganizerService = {
      setEventSchedule: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [EventScheduleSectionComponent],
      providers: [
        { provide: OrganizerService, useValue: mockOrganizerService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(EventScheduleSectionComponent);
    component = fixture.componentInstance;
    component.event = sampleEvent;
    component.revision = '5';
    component.canEdit = true;
    component.ngOnChanges();
    fixture.detectChanges();
  });

  it('Escenario 1: renderiza el formulario con la zona horaria confirmada visible y fecha actual', () => {
    const el: HTMLElement = fixture.nativeElement;
    const badge = el.querySelector('.timezone-badge');
    expect(badge?.textContent).toContain('America/Bogota');

    const input = el.querySelector('#startsAtInput') as HTMLInputElement;
    expect(input.value).toBe('2026-11-20T18:00');
  });

  it('Escenario 2: guarda fecha local y anuncia confirmación sin cálculo cliente', async () => {
    mockOrganizerService.setEventSchedule.mockResolvedValueOnce({
      event: {
        ...sampleEvent,
        startsAtLocal: '2026-11-20T19:30:00'
      },
      outcome: 'UPDATED'
    });

    const savedSpy = vi.fn();
    component.saved.subscribe(savedSpy);

    component.startsAtLocal = '2026-11-20T19:30';
    await component.onSave();
    fixture.detectChanges();

    expect(mockOrganizerService.setEventSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'event-123',
        startsAtLocal: '2026-11-20T19:30',
        expectedRevision: '5'
      })
    );

    expect(component.successMessage()).toContain('Fecha y hora guardadas');
    expect(savedSpy).toHaveBeenCalled();
  });

  it('Escenario 3: ante error 422 DST_GAP_TIME muestra mensaje sin inventar hora', async () => {
    mockOrganizerService.setEventSchedule.mockRejectedValueOnce(new Error('DST_GAP_TIME'));

    component.startsAtLocal = '2026-03-29T02:30';
    await component.onSave();
    fixture.detectChanges();

    expect(component.errorMessage()).toContain('no existe en esta zona horaria');
    expect(component.availableOffsets()).toEqual([]);
  });

  it('Escenario 4: ante horario ambiguo (overlap) expone RadioGroup para desambiguar', async () => {
    mockOrganizerService.setEventSchedule.mockRejectedValueOnce(Object.assign(new Error('AMBIGUOUS_LOCAL_TIME'), { availableOffsets: [60, 120] }));

    component.startsAtLocal = '2026-10-25T02:30';
    await component.onSave();
    fixture.detectChanges();

    expect(component.errorMessage()).toContain('es ambigua');
    expect(component.availableOffsets().length).toBeGreaterThan(0);

    const el: HTMLElement = fixture.nativeElement;
    const radioGroup = el.querySelector('.overlap-fieldset');
    expect(radioGroup).not.toBeNull();
  });

  it('Escenario 5: cambiar la fecha invalida la selección de offset previa', () => {
    component.availableOffsets.set([-300, -240]);
    component.selectedOffset = -300;

    component.onDateChange();

    expect(component.availableOffsets()).toEqual([]);
    expect(component.selectedOffset).toBeNull();
  });

  it('Escenario 6: conflicto CAS (409) preserva entradas y permite reconciliar', async () => {
    mockOrganizerService.setEventSchedule.mockRejectedValueOnce(new Error('CONCURRENCY_CONFLICT'));

    const reconcileSpy = vi.fn();
    component.reconcile.subscribe(reconcileSpy);

    component.startsAtLocal = '2026-11-20T20:00';
    await component.onSave();
    fixture.detectChanges();

    expect(component.hasConflict()).toBe(true);
    expect(component.errorMessage()).toContain('conflicto CAS');
    expect(component.startsAtLocal).toBe('2026-11-20T20:00');

    component.onReconcile();
    expect(reconcileSpy).toHaveBeenCalled();
  });

  it('permite editar SCHEDULED autorizado y explica el recálculo conservando el QR', async () => {
    component.event = { ...sampleEvent, status: 'SCHEDULED' };
    component.ngOnChanges();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('El QR se conserva');
    expect((fixture.nativeElement.querySelector('#startsAtInput') as HTMLInputElement).disabled).toBe(false);
    mockOrganizerService.setEventSchedule.mockResolvedValue({ event: component.event, outcome: 'UPDATED' });
    await component.onSave();
    expect(mockOrganizerService.setEventSchedule).toHaveBeenCalledOnce();
  });

  it('distingue el rechazo por estado del conflicto CAS y bloquea guardado no autorizado', async () => {
    mockOrganizerService.setEventSchedule.mockRejectedValueOnce(new Error('INVALID_STATE'));
    await component.onSave();
    expect(component.hasConflict()).toBe(false);
    expect(component.needsReload()).toBe(true);
    expect(component.errorMessage()).toContain('estado actual');
    expect(component.errorMessage()).not.toContain('CAS');
    component.canEdit = false;
    await component.onSave();
    expect(mockOrganizerService.setEventSchedule).toHaveBeenCalledOnce();
  });

  it('recarga revisión conservando propuesta y permite un nuevo guardado explícito', async () => {
    mockOrganizerService.setEventSchedule.mockRejectedValueOnce(new Error('CONCURRENCY_CONFLICT'));
    component.startsAtLocal = '2026-11-20T20:00';
    await component.onSave();
    component.onReconcile();
    component.event = { ...sampleEvent, startsAtLocal: '2026-11-20T18:30:00' };
    component.revision = '6';
    component.ngOnChanges();
    expect(component.startsAtLocal).toBe('2026-11-20T20:00');
    expect(component.confirmedStartsAt()).toBe('2026-11-20T18:30:00');
    expect(component.errorMessage()).toBeNull();
    expect(component.hasConflict()).toBe(false);
    mockOrganizerService.setEventSchedule.mockResolvedValue({ event: component.event, outcome: 'UPDATED' });
    await component.onSave();
    expect(mockOrganizerService.setEventSchedule.mock.calls[1][0].expectedRevision).toBe('6');
  });

  it('conserva la intención completa ante respuesta incierta e impide doble envío', async () => {
    mockOrganizerService.setEventSchedule.mockRejectedValueOnce(new Error('COMMUNICATION_ERROR'));
    await component.onSave();
    const first = mockOrganizerService.setEventSchedule.mock.calls[0][0];
    expect(component.uncertain()).toBe(true);
    let done!: (value: unknown) => void;
    mockOrganizerService.setEventSchedule.mockImplementation(() => new Promise(resolve => { done = resolve; }));
    const saving = component.onSave();
    await component.onSave();
    expect(mockOrganizerService.setEventSchedule).toHaveBeenCalledTimes(2);
    expect(mockOrganizerService.setEventSchedule.mock.calls[1][0]).toEqual(first);
    done({ event: sampleEvent, outcome: 'IDEMPOTENT_REPLAY' });
    await saving;
    expect(component.uncertain()).toBe(false);
  });

  it('descarta el resultado de un guardado al cambiar de evento', async () => {
    let done!: (value: unknown) => void;
    mockOrganizerService.setEventSchedule.mockImplementation(() => new Promise(resolve => { done = resolve; }));
    const saving = component.onSave();
    const saved = vi.fn();
    component.saved.subscribe(saved);
    component.event = { ...sampleEvent, id: 'second-event' };
    component.ngOnChanges();
    done({ event: sampleEvent, outcome: 'UPDATED' });
    await saving;
    expect(saved).not.toHaveBeenCalled();
    expect(component.successMessage()).toBeNull();
    expect(component.isSaving()).toBe(false);
  });
});
