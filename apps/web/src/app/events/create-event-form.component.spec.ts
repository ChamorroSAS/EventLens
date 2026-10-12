import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { CreateEventFormComponent } from './create-event-form.component.js';
import { EventsService } from './events.service.js';
import { CreateEventError } from './events.types.js';
import type { CreateEventInput, CreateEventOutcome, EventDraft } from './events.types.js';

type CreateDraftFn = (input: CreateEventInput) => Promise<CreateEventOutcome>;

function draft(name: string): EventDraft {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name,
    status: 'DRAFT',
    timezone: 'America/Bogota',
    uploadsEnabled: false,
    guestGalleryEnabled: false,
    moderationMode: 'AUTO_PUBLISH',
    pinEnabled: false,
    createdAt: '2026-10-11T00:00:00.000Z',
    updatedAt: '2026-10-11T00:00:00.000Z',
  };
}

function setup(createDraft: CreateDraftFn) {
  const navigate = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: EventsService, useValue: { createDraft } },
      { provide: Router, useValue: { navigate } },
    ],
  });
  const fixture = TestBed.createComponent(CreateEventFormComponent);
  fixture.detectChanges();
  return { fixture, navigate };
}

function typeName(fixture: ReturnType<typeof setup>['fixture'], value: string): HTMLInputElement {
  const input = fixture.nativeElement.querySelector('#event-name') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  return input;
}

function submitForm(fixture: ReturnType<typeof setup>['fixture']): void {
  const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
  form.dispatchEvent(new Event('submit'));
}

describe('CreateEventForm', () => {
  it('associates the required label and blocks submission when the name is blank', () => {
    const createDraft = vi.fn<CreateDraftFn>();
    const { fixture } = setup(createDraft);

    const label = fixture.nativeElement.querySelector('label[for="event-name"]');
    expect(label.textContent).toContain('Nombre del evento');

    typeName(fixture, '   ');
    submitForm(fixture);
    fixture.detectChanges();

    expect(createDraft).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Escribe un nombre para el evento.');
  });

  it('creates the draft with the trimmed name and announces success', async () => {
    const received: CreateEventInput[] = [];
    const createDraft: CreateDraftFn = async (input) => {
      received.push(input);
      return { kind: 'created', event: draft('Boda de Ana') };
    };
    const { fixture } = setup(createDraft);

    typeName(fixture, '  Boda de Ana  ');
    submitForm(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ name: 'Boda de Ana' });
    expect(typeof received[0].idempotencyKey).toBe('string');
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('Borrador creado: Boda de Ana.');
  });

  it('prevents double submission while the request is busy', async () => {
    let resolveRequest: (value: CreateEventOutcome) => void = () => undefined;
    let calls = 0;
    const createDraft: CreateDraftFn = () => {
      calls += 1;
      return new Promise<CreateEventOutcome>((resolve) => {
        resolveRequest = resolve;
      });
    };
    const { fixture } = setup(createDraft);

    typeName(fixture, 'Boda');
    submitForm(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(calls).toBe(1);
    const submitButton = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);

    submitForm(fixture);
    await fixture.whenStable();
    expect(calls).toBe(1);

    resolveRequest({ kind: 'created', event: draft('Boda') });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(submitButton.disabled).toBe(false);
  });

  it('preserves the typed name and reports a conflict without revealing foreign events', async () => {
    const createDraft: CreateDraftFn = async () => {
      throw new CreateEventError(409, 'CONFLICT');
    };
    const { fixture } = setup(createDraft);

    const input = typeName(fixture, 'Evento repetido');
    submitForm(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(input.value).toBe('Evento repetido');
    expect(fixture.nativeElement.textContent).toContain('Ya usaste este intento con otro contenido.');
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toBe('');
  });

  it('explains an expired session', async () => {
    const createDraft: CreateDraftFn = async () => {
      throw new CreateEventError(401, 'UNAUTHORIZED');
    };
    const { fixture } = setup(createDraft);
    typeName(fixture, 'Boda');
    submitForm(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Tu sesión expiró.');
  });

  it('ties a server validation error to the name field', async () => {
    const createDraft: CreateDraftFn = async () => {
      throw new CreateEventError(422, 'VALIDATION_ERROR');
    };
    const { fixture } = setup(createDraft);
    typeName(fixture, 'Boda');
    submitForm(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('El nombre del evento no es válido.');
    const input = fixture.nativeElement.querySelector('#event-name') as HTMLInputElement;
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('navigates back to the dashboard when cancelled', () => {
    const createDraft = vi.fn<CreateDraftFn>();
    const { fixture, navigate } = setup(createDraft);
    const cancel = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(cancel.textContent).toContain('Cancelar');
    cancel.click();
    expect(navigate).toHaveBeenCalledWith(['/']);
  });
});
