import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RemovalRequestFlowComponent } from './removal-request-flow.component.js';
import { GuestService } from './guest.service.js';

describe('RemovalRequestFlowComponent (EL-TK-121 / DEC-089 / DEC-097 / DEC-103..105)', () => {
  let guestServiceMock: {
    getSession: ReturnType<typeof vi.fn>;
    removeOwnContribution: ReturnType<typeof vi.fn>;
    submitRemovalIntake: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    guestServiceMock = {
      getSession: vi.fn().mockReturnValue({
        token: 'sess-tok-123'
      }),
      removeOwnContribution: vi.fn().mockResolvedValue({
        mediaId: 'med-123',
        status: 'PURGED',
        message: 'Aporte retirado definitivamente'
      }),
      submitRemovalIntake: vi.fn().mockResolvedValue({
        requestId: 'req-456',
        status: 'PENDING_REVIEW',
        message: 'Solicitud recibida para revisión'
      })
    };

    await TestBed.configureTestingModule({
      imports: [RemovalRequestFlowComponent],
      providers: [
        { provide: GuestService, useValue: guestServiceMock }
      ]
    }).compileComponents();
  });

  function createComponent(props: Partial<RemovalRequestFlowComponent> = {}): {
    fixture: ComponentFixture<RemovalRequestFlowComponent>;
    component: RemovalRequestFlowComponent;
  } {
    const fixture = TestBed.createComponent(RemovalRequestFlowComponent);
    const component = fixture.componentInstance;
    component.isOpen = true;
    component.eventId = 'evt-100';
    component.eventName = 'Boda Test';
    Object.assign(component, props);
    fixture.detectChanges();
    return { fixture, component };
  }

  describe('Variante 1: Retiro propio irreversible (OWN_REMOVAL - DEC-089 / DEC-097)', () => {
    it('muestra advertencia clara de consecuencia irreversible antes del comando', () => {
      const { fixture } = createComponent({
        variant: 'OWN_REMOVAL',
        mediaId: 'med-123'
      });

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('Consecuencia irreversible antes de continuar');
      expect(compiled.textContent).toContain('Se retirará de visibilidad al confirmar. No podrás restaurarlo');
      expect(compiled.textContent).toContain('no ofrece papelera de organizador');

      const btn = compiled.querySelector('.btn-confirm-removal');
      expect(btn).toBeTruthy();
      expect(btn?.textContent).toContain('Retirar definitivamente mi aporte');
    });

    it('ejecuta el retiro y muestra estado completado irreversible', async () => {
      const { fixture, component } = createComponent({
        variant: 'OWN_REMOVAL',
        mediaId: 'med-123'
      });

      const removedSpy = vi.fn();
      component.removed.subscribe(removedSpy);

      await component.onConfirmOwnRemoval();
      fixture.detectChanges();

      expect(guestServiceMock.removeOwnContribution).toHaveBeenCalledWith({
        eventId: 'evt-100',
        mediaId: 'med-123',
        sessionToken: 'sess-tok-123'
      });

      expect(component.isCompleted()).toBe(true);
      expect(removedSpy).toHaveBeenCalledWith({ mediaId: 'med-123' });

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('Aporte retirado definitivamente');
      expect(compiled.textContent).toContain('ha salido de visibilidad de inmediato');
    });

    it('muestra error de sesión vencida si no hay token válido', async () => {
      guestServiceMock.getSession.mockReturnValue(null);
      const { fixture, component } = createComponent({
        variant: 'OWN_REMOVAL',
        mediaId: 'med-123',
        sessionToken: ''
      });

      await component.onConfirmOwnRemoval();
      fixture.detectChanges();

      expect(component.errorMessage()).toContain('sesión guest ha vencido');
      expect(component.isCompleted()).toBe(false);
    });
  });

  describe('Variante 2: Intake sin sesión (GUEST_INTAKE - DEC-103..105)', () => {
    it('inicia con declaración de buena fe desmarcada (DEC-105)', () => {
      const { component } = createComponent({
        variant: 'GUEST_INTAKE',
        intakeEventRef: 'evt-100',
        intakeMediaRef: 'med-123'
      });

      expect(component.goodFaithConfirmed).toBe(false);
      expect(component.isIntakeValid()).toBe(false);
    });

    it('exige descripción solo cuando el motivo es OTHER (DEC-104)', () => {
      const { component } = createComponent({
        variant: 'GUEST_INTAKE',
        intakeEventRef: 'evt-100',
        intakeMediaRef: 'med-123',
        contactEmail: 'contacto@ejemplo.com',
        goodFaithConfirmed: true
      });

      // Con motivo estándar no requiere descripción
      component.selectedReason = 'APPEAR_IN_MEDIA';
      component.intakeDescription = '';
      expect(component.isIntakeValid()).toBe(true);

      // Con OTHER requiere descripción
      component.selectedReason = 'OTHER';
      component.intakeDescription = '';
      expect(component.isIntakeValid()).toBe(false);

      component.intakeDescription = 'Explicación del caso';
      expect(component.isIntakeValid()).toBe(true);
    });

    it('valida formato básico de correo electrónico (DEC-103)', () => {
      const { component } = createComponent({
        variant: 'GUEST_INTAKE',
        intakeEventRef: 'evt-100',
        intakeMediaRef: 'med-123',
        selectedReason: 'INTIMACY_VIOLATION',
        goodFaithConfirmed: true
      });

      component.contactEmail = 'invalido';
      expect(component.isIntakeValid()).toBe(false);

      component.contactEmail = 'valido@correo.com';
      expect(component.isIntakeValid()).toBe(true);
    });

    it('envía solicitud y muestra feedback "Solicitud recibida para revisión" sin asumir titularidad', async () => {
      const { fixture, component } = createComponent({
        variant: 'GUEST_INTAKE',
        intakeEventRef: 'evt-100',
        intakeMediaRef: 'med-123',
        selectedReason: 'PRIVACY_VIOLATION',
        contactEmail: 'usuario@correo.com',
        requesterName: 'Carlos',
        goodFaithConfirmed: true
      });

      const intakeSpy = vi.fn();
      component.intakeSubmitted.subscribe(intakeSpy);

      await component.onSubmitIntake();
      fixture.detectChanges();

      expect(guestServiceMock.submitRemovalIntake).toHaveBeenCalledWith({
        eventId: 'evt-100',
        mediaRef: 'med-123',
        reason: 'PRIVACY_VIOLATION',
        description: undefined,
        contactEmail: 'usuario@correo.com',
        requesterName: 'Carlos',
        evidenceText: undefined,
        goodFaithConfirmed: true
      });

      expect(component.isCompleted()).toBe(true);
      expect(intakeSpy).toHaveBeenCalledWith({ requestId: 'req-456' });

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('Solicitud recibida para revisión');
      expect(compiled.textContent).toContain('No se ha asumido titularidad ni eliminado automáticamente');
    });

    it('maneja rate limit preservando los datos ingresados', async () => {
      guestServiceMock.submitRemovalIntake.mockRejectedValueOnce(new Error('RATE_LIMIT_EXCEEDED'));

      const { fixture, component } = createComponent({
        variant: 'GUEST_INTAKE',
        intakeEventRef: 'evt-100',
        intakeMediaRef: 'med-123',
        selectedReason: 'COPYRIGHT_INFRINGEMENT',
        contactEmail: 'creador@correo.com',
        goodFaithConfirmed: true
      });

      await component.onSubmitIntake();
      fixture.detectChanges();

      expect(component.errorMessage()).toContain('límite de solicitudes');
      expect(component.selectedReason).toBe('COPYRIGHT_INFRINGEMENT');
      expect(component.contactEmail).toBe('creador@correo.com');
      expect(component.goodFaithConfirmed).toBe(true);
    });
  });

  it('permite cerrar mediante Escape o botón Cancelar', () => {
    const { component } = createComponent();
    const closeSpy = vi.fn();
    component.close.subscribe(closeSpy);

    component.handleEscape(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closeSpy).toHaveBeenCalled();
  });
});
