import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { describe, it, expect, beforeEach } from 'vitest';
import { OrganizerAppShellComponent } from './organizer-app-shell.component.js';
import type { OrganizerEventModel } from './organizer.types.js';

@Component({
  template: `
    <eventlens-organizer-app-shell [selectedEvent]="event" (exitContext)="onExit()">
      <div id="projected-content" class="custom-projected">Contenido Proyectado de Prueba</div>
    </eventlens-organizer-app-shell>
  `,
  standalone: true,
  imports: [OrganizerAppShellComponent]
})
class TestHostComponent {
  event: OrganizerEventModel | null = null;
  exitCalled = false;

  onExit(): void {
    this.exitCalled = true;
  }
}

describe('OrganizerAppShellComponent (EL-TK-204 Visual Foundation & Pilot)', () => {
  const sampleEvent: OrganizerEventModel = {
    id: 'event-001',
    organizerId: 'org-001',
    name: 'Boda de Andrea y Carlos 2026',
    status: 'ACTIVE',
    timezone: 'America/Bogota',
    startsAtLocal: '2026-11-20T18:00:00',
    scheduledAt: '2026-11-20T23:00:00.000Z',
    utcOffsetMinutes: -300,
    expiresAt: null,
    graceEndsAt: null,
    uploadsEnabled: true,
    guestGalleryEnabled: true,
    moderationMode: 'AUTO_PUBLISH',
    pinEnabled: false,
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z'
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent, OrganizerAppShellComponent]
    }).compileComponents();
  });

  it('Escenario 1: Renderiza identidad corporativa, rol y footer sin evento seleccionado', () => {
    const fixture = TestBed.createComponent(OrganizerAppShellComponent);
    const component = fixture.componentInstance;
    component.selectedEvent = null;
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const brandTitle = element.querySelector('.brand-title');
    expect(brandTitle).not.toBeNull();

    const logoImg = brandTitle?.querySelector('img.brand-logo') as HTMLImageElement;
    expect(logoImg).not.toBeNull();
    expect(logoImg.getAttribute('src')).toBe('assets/branding/phoeve/logo-primary.png');
    expect(logoImg.getAttribute('alt')).toBe('Phoeve');

    const brandBadge = element.querySelector('.brand-badge');
    expect(brandBadge?.textContent?.trim()).toBe('Organizador');

    // Context area should NOT be present when selectedEvent is null
    const contextArea = element.querySelector('.event-context-area');
    expect(contextArea).toBeNull();

    // Footer is rendered
    const footerText = element.querySelector('.footer-text');
    expect(footerText?.textContent).toContain('Phoeve BETA');
  });

  it('Escenario 2: Renderiza región de contexto del evento activo y emite exitContext al accionar Mis eventos', () => {
    const fixture = TestBed.createComponent(OrganizerAppShellComponent);
    const component = fixture.componentInstance;
    component.selectedEvent = sampleEvent;

    let exitEmitted = false;
    component.exitContext.subscribe(() => {
      exitEmitted = true;
    });

    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const contextArea = element.querySelector('.event-context-area');
    expect(contextArea).not.toBeNull();
    expect(contextArea?.getAttribute('aria-label')).toBe('Contexto del evento activo');

    const contextLabel = contextArea?.querySelector('.context-label');
    expect(contextLabel?.textContent?.trim()).toBe('Evento activo:');

    const eventName = contextArea?.querySelector('.context-event-name');
    expect(eventName?.textContent?.trim()).toBe('Boda de Andrea y Carlos 2026');

    const statusBadge = contextArea?.querySelector('eventlens-event-status-badge');
    expect(statusBadge).not.toBeNull();

    const exitBtn = contextArea?.querySelector('.btn-exit-context') as HTMLButtonElement;
    expect(exitBtn).not.toBeNull();
    expect(exitBtn.getAttribute('aria-label')).toBe('Salir de la configuración del evento');
    expect(exitBtn.textContent?.trim()).toBe('Mis eventos');

    exitBtn.click();
    expect(exitEmitted).toBe(true);
  });

  it('Escenario 3: Manejo de fallback accesible cuando el logo SVG falla', () => {
    const fixture = TestBed.createComponent(OrganizerAppShellComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const logoImg = element.querySelector('img.brand-logo') as HTMLImageElement;
    expect(logoImg).not.toBeNull();

    // Trigger image error via native event
    logoImg.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(component.logoFailed).toBe(true);

    const hiddenImg = element.querySelector('img.brand-logo');
    expect(hiddenImg).toBeNull();

    const fallbackText = element.querySelector('.brand-fallback-text');
    expect(fallbackText).not.toBeNull();
    expect(fallbackText?.textContent?.trim()).toBe('Phoeve');
  });

  it('Escenario 4: Nombres largos sin espacios permanecen completos en la región de contexto', () => {
    const fixture = TestBed.createComponent(OrganizerAppShellComponent);
    const component = fixture.componentInstance;
    const longName = 'SupercalifragilisticoespialidosoCelebracion2026SinEspaciosDeNombreMuyLargo';
    component.selectedEvent = {
      ...sampleEvent,
      name: longName
    };
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const eventName = element.querySelector('.context-event-name');
    expect(eventName?.textContent?.trim()).toBe(longName);
  });

  it('Escenario 5: Preservación de aislamiento estricto y no contaminación a nodos proyectados', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    const host = fixture.componentInstance;
    host.event = sampleEvent;
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const shell = element.querySelector('.organizer-shell') as HTMLElement;
    expect(shell).not.toBeNull();

    const projected = element.querySelector('#projected-content') as HTMLElement;
    expect(projected).not.toBeNull();
    expect(projected.classList.contains('custom-projected')).toBe(true);
    expect(projected.textContent).toBe('Contenido Proyectado de Prueba');

    const badge = element.querySelector('eventlens-event-status-badge');
    expect(badge).not.toBeNull();
  });
});
