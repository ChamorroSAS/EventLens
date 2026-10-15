import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBasicInfoFormComponent } from './event-basic-info-form.component.js';
import { OrganizerService } from './organizer.service.js';
import type { EventConfigurationModel, OrganizerEventModel } from './organizer.types.js';

describe('EventBasicInfoFormComponent (EL-TK-230)', () => {
  let fixture: ComponentFixture<EventBasicInfoFormComponent>;
  let component: EventBasicInfoFormComponent;
  let organizerServiceMock: {
    updateEventName: ReturnType<typeof vi.fn>;
  };

  const sampleEvent: OrganizerEventModel = {
    id: 'event-draft-001',
    organizerId: 'org-001',
    name: 'Nombre Original del Borrador',
    status: 'DRAFT',
    timezone: 'America/Bogota',
    startsAtLocal: null,
    scheduledAt: null,
    utcOffsetMinutes: null,
    expiresAt: null,
    graceEndsAt: null,
    uploadsEnabled: false,
    guestGalleryEnabled: false,
    moderationMode: 'AUTO_PUBLISH',
    pinEnabled: false,
    createdAt: '2026-10-10T12:00:00.000Z',
    updatedAt: '2026-10-10T12:00:00.000Z'
  };

  const sampleConfig: EventConfigurationModel = {
    event: sampleEvent,
    revision: '1',
    capabilities: {
      canEditSchedule: true,
      canEditSettings: true,
      canManageAccess: true,
      canViewLifecycle: true,
      canViewCapacity: true,
      canPublishOrActivate: true,
      canEditName: true
    }
  };

  beforeEach(async () => {
    organizerServiceMock = {
      updateEventName: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [EventBasicInfoFormComponent],
      providers: [
        { provide: OrganizerService, useValue: organizerServiceMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(EventBasicInfoFormComponent);
    component = fixture.componentInstance;
    component.event = { ...sampleEvent };
    component.configuration = { ...sampleConfig };
    fixture.detectChanges();
  });

  it('renderiza el formulario con el nombre actual y en modo edición si canEditName es true', () => {
    const el: HTMLElement = fixture.nativeElement;
    const input = el.querySelector('#event-name-field') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('Nombre Original del Borrador');
    expect(input.disabled).toBe(false);

    const tag = el.querySelector('.capability-tag');
    expect(tag?.textContent).toContain('Modo edición');

    const saveBtn = el.querySelector('.btn-save') as HTMLButtonElement;
    expect(saveBtn).toBeTruthy();
    // Inicialmente no está dirty, debe estar deshabilitado
    expect(saveBtn.disabled).toBe(true);
  });

  it('guarda con revisión vigente y CAS, emite eventUpdated, limpia dirty y anuncia éxito', async () => {
    const newName = 'Boda de Camila y Alejandro';
    organizerServiceMock.updateEventName.mockResolvedValueOnce({
      id: 'event-draft-001',
      name: newName,
      revision: '2',
      outcome: 'APPLIED'
    });

    const eventUpdatedSpy = vi.fn();
    const dirtyChangeSpy = vi.fn();
    component.eventUpdated.subscribe(eventUpdatedSpy);
    component.dirtyChange.subscribe(dirtyChangeSpy);

    // Usuario modifica el nombre
    component.onNameInput({ target: { value: newName } } as unknown as Event);
    fixture.detectChanges();

    expect(component.isDirty()).toBe(true);
    expect(dirtyChangeSpy).toHaveBeenCalledWith(true);

    const saveBtn = fixture.nativeElement.querySelector('.btn-save') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);

    // Guardar
    await component.onSave();
    fixture.detectChanges();

    expect(organizerServiceMock.updateEventName).toHaveBeenCalledWith({
      eventId: 'event-draft-001',
      name: newName,
      expectedRevision: '1',
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/)
    });

    expect(component.isDirty()).toBe(false);
    expect(dirtyChangeSpy).toHaveBeenCalledWith(false);
    expect(component.successMessage()).toContain('guardado correctamente');
    expect(eventUpdatedSpy).toHaveBeenCalledWith({
      id: 'event-draft-001',
      name: newName,
      revision: '2'
    });
  });

  it('descarta cambios locales restaurando el dato original sin mutar en servidor', () => {
    const dirtyChangeSpy = vi.fn();
    component.dirtyChange.subscribe(dirtyChangeSpy);

    component.onNameInput({ target: { value: 'Nombre Que Será Descartado' } } as unknown as Event);
    fixture.detectChanges();
    expect(component.isDirty()).toBe(true);

    component.onDiscard();
    fixture.detectChanges();

    expect(component.currentName()).toBe('Nombre Original del Borrador');
    expect(component.isDirty()).toBe(false);
    expect(dirtyChangeSpy).toHaveBeenCalledWith(false);
    expect(organizerServiceMock.updateEventName).not.toHaveBeenCalled();
  });

  it('maneja conflicto 409 CAS conservando la entrada del usuario y advirtiendo conflicto', async () => {
    const conflictErr: any = new Error('Event revision conflict');
    conflictErr.status = 409;
    conflictErr.code = 'CONCURRENCY_CONFLICT';
    organizerServiceMock.updateEventName.mockRejectedValueOnce(conflictErr);

    const editedName = 'Nombre en Disputa Concurrente';
    component.onNameInput({ target: { value: editedName } } as unknown as Event);
    fixture.detectChanges();

    await component.onSave();
    fixture.detectChanges();

    // No se borra ni sobrescribe la entrada del usuario
    expect(component.currentName()).toBe(editedName);
    expect(component.conflictWarning()).toContain('modificado en otra sesión');
  });

  it('bloquea edición cuando canEditName es false (solo lectura fuera de DRAFT)', () => {
    component.configuration = {
      ...sampleConfig,
      capabilities: {
        ...sampleConfig.capabilities,
        canEditName: false
      }
    };
    fixture.detectChanges();

    expect(component.canEdit()).toBe(false);

    const input = fixture.nativeElement.querySelector('#event-name-field') as HTMLInputElement;
    expect(input.disabled).toBe(true);

    const tag = fixture.nativeElement.querySelector('.capability-tag');
    expect(tag?.textContent).toContain('Solo lectura');

    const saveBtn = fixture.nativeElement.querySelector('.btn-save');
    expect(saveBtn).toBeNull();
  });

  it('rechaza nombres inválidos (vacíos o solo espacios) en cliente sin llamar al servidor', async () => {
    component.onNameInput({ target: { value: '    ' } } as unknown as Event);
    fixture.detectChanges();

    await component.onSave();
    fixture.detectChanges();

    expect(component.errorMessage()).toContain('entre 1 y 120 caracteres');
    expect(organizerServiceMock.updateEventName).not.toHaveBeenCalled();
  });
});
