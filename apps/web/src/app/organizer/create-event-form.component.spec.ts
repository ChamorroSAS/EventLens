import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreateEventFormComponent } from './create-event-form.component.js';
import { OrganizerService } from './organizer.service.js';

describe('CreateEventFormComponent (EL-TK-229)', () => {
  let fixture: ComponentFixture<CreateEventFormComponent>;
  let component: CreateEventFormComponent;
  let organizerServiceMock: {
    createEvent: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    organizerServiceMock = {
      createEvent: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [CreateEventFormComponent],
      providers: [
        { provide: OrganizerService, useValue: organizerServiceMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CreateEventFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renderiza BottomSheet/Modal accesible con título, campo de nombre y helper', () => {
    const el: HTMLElement = fixture.nativeElement;
    const dialog = el.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');

    const title = el.querySelector('#create-event-title');
    expect(title?.textContent).toContain('Crear borrador de evento');

    const input = el.querySelector('#event-name-input') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.getAttribute('aria-describedby')).toBe('event-name-helper');

    const helper = el.querySelector('#event-name-helper');
    expect(helper?.textContent).toContain('Podrás configurar la fecha y el horario después.');

    const cancelBtn = el.querySelector('.btn-cancel');
    expect(cancelBtn?.textContent).toContain('Cancelar');

    const submitBtn = el.querySelector('.btn-submit');
    expect(submitBtn?.textContent).toContain('Crear borrador');
  });

  it('valida longitud de nombre en cliente (rechaza vacío o solo espacios) sin llamar al servicio', async () => {
    component.name.set('   ');
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(component.errorMessage()).toContain('entre 1 y 120 caracteres');
    expect(organizerServiceMock.createEvent).not.toHaveBeenCalled();
    expect(component.isBusy()).toBe(false);
  });

  it('envía nombre válido, activa busy state, deshabilita inputs y emite evento con el ID confirmado', async () => {
    const createdEventId = 'evt-created-123';
    organizerServiceMock.createEvent.mockResolvedValueOnce({
      id: createdEventId,
      outcome: 'APPLIED'
    });

    const eventCreatedSpy = vi.fn();
    component.eventCreated.subscribe(eventCreatedSpy);

    component.name.set('Boda de Sofía y Mateo');
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    const submitPromise = component.onSubmit(new Event('submit'));

    // Mientras está ocupado (busy)
    expect(component.isBusy()).toBe(true);

    await submitPromise;
    fixture.detectChanges();

    expect(component.isBusy()).toBe(false);
    expect(organizerServiceMock.createEvent).toHaveBeenCalledWith(
      'Boda de Sofía y Mateo',
      expect.stringMatching(/^[0-9a-f-]{36}$/)
    );
    expect(eventCreatedSpy).toHaveBeenCalledWith({
      id: createdEventId,
      outcome: 'APPLIED'
    });
  });

  it('maneja error 422 del servidor mostrando mensaje asociado al campo', async () => {
    const error422: any = new Error('Event name must be between 1 and 120 characters');
    error422.status = 422;
    error422.code = 'INVALID_NAME';
    organizerServiceMock.createEvent.mockRejectedValueOnce(error422);

    component.name.set('Nombre Rechazado');
    fixture.detectChanges();

    await component.onSubmit(new Event('submit'));
    fixture.detectChanges();

    expect(component.isBusy()).toBe(false);
    expect(component.errorMessage()).toContain('Event name must be between 1 and 120 characters');
  });

  it('maneja error 409 de conflicto de idempotencia', async () => {
    const error409: any = new Error('Idempotency conflict');
    error409.status = 409;
    error409.code = 'IDEMPOTENCY_CONFLICT';
    organizerServiceMock.createEvent.mockRejectedValueOnce(error409);

    component.name.set('Nombre en Conflicto');
    fixture.detectChanges();

    await component.onSubmit(new Event('submit'));
    fixture.detectChanges();

    expect(component.isBusy()).toBe(false);
    expect(component.errorMessage()).toContain('Conflicto');
  });

  it('maneja timeout / resultado incierto conservando la idempotency key en memoria y ofreciendo reconciliar', async () => {
    const networkError: any = new Error('Network timeout');
    networkError.status = 0;
    networkError.code = 'NETWORK_ERROR';
    organizerServiceMock.createEvent.mockRejectedValueOnce(networkError);

    component.name.set('Boda de Ana y Lucas');
    fixture.detectChanges();

    const initialKey = component.inMemoryIdempotencyKey;
    expect(initialKey).toBeTruthy();

    await component.onSubmit(new Event('submit'));
    fixture.detectChanges();

    // Debe estar en estado incierto y conservar la misma key en memoria
    expect(component.isUncertain()).toBe(true);
    expect(component.inMemoryIdempotencyKey).toBe(initialKey);
    expect(component.errorMessage()).toContain('reconciliar la solicitud');

    // Botón de reintento visible
    const retryBtn = fixture.nativeElement.querySelector('.btn-retry');
    expect(retryBtn).toBeTruthy();
    expect(retryBtn.textContent).toContain('Reintentar reconciliación');

    // Segundo intento con la misma key
    organizerServiceMock.createEvent.mockResolvedValueOnce({
      id: 'evt-reconciled-456',
      outcome: 'REPLAYED'
    });

    const eventCreatedSpy = vi.fn();
    component.eventCreated.subscribe(eventCreatedSpy);

    await component.onSubmit(new Event('submit'));
    fixture.detectChanges();

    expect(organizerServiceMock.createEvent).toHaveBeenLastCalledWith(
      'Boda de Ana y Lucas',
      initialKey
    );
    expect(eventCreatedSpy).toHaveBeenCalledWith({
      id: 'evt-reconciled-456',
      outcome: 'REPLAYED'
    });
  });

  it('cancelación antes del envío emite cancel y devuelve el foco al CTA', () => {
    const triggerBtn = document.createElement('button');
    document.body.appendChild(triggerBtn);
    const focusSpy = vi.spyOn(triggerBtn, 'focus');

    component.triggerElement = triggerBtn;
    const cancelSpy = vi.fn();
    component.cancel.subscribe(cancelSpy);

    component.onCancel();

    expect(cancelSpy).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();

    document.body.removeChild(triggerBtn);
  });

  it('bloquea cancelación mientras está busy enviando', () => {
    component.isBusy.set(true);
    const cancelSpy = vi.fn();
    component.cancel.subscribe(cancelSpy);

    component.onCancel();
    expect(cancelSpy).not.toHaveBeenCalled();

    component.onEscape();
    expect(cancelSpy).not.toHaveBeenCalled();
  });
});
