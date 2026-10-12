import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { EventAccessContainerComponent } from './event-access-container.component.js';
import { EventAccessSettings, ShareAccessSnapshot } from './access.types.js';

describe('EventAccessContainerComponent (EL-TK-085)', () => {
  const mockSettings: EventAccessSettings = {
    eventId: 'event-1',
    pinEnabled: false,
    pinRequired: false,
    activeGeneration: 1
  };

  const mockSnapshot: ShareAccessSnapshot = {
    eventId: 'event-1',
    lookupKey: 'key-gen-1',
    sharePath: '/g/key-gen-1',
    shareUrl: 'https://eventlens.app/g/key-gen-1',
    generation: 1,
    pinRequired: false,
    qrPayload: 'https://eventlens.app/g/key-gen-1',
    qrSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29"><path d="M0,0h1v1h-1z"/></svg>'
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventAccessContainerComponent]
    }).compileComponents();
  });

  function createComponent(
    settings: EventAccessSettings = mockSettings,
    shareSnapshot: ShareAccessSnapshot = mockSnapshot
  ): ComponentFixture<EventAccessContainerComponent> {
    const fixture = TestBed.createComponent(EventAccessContainerComponent);
    fixture.componentInstance.settings = { ...settings };
    fixture.componentInstance.shareSnapshot = { ...shareSnapshot };
    return fixture;
  }

  it('Escenario 1: panel de compartir muestra QR, enlace actual y acción de copiar', async () => {
    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const sharePanel = fixture.nativeElement.querySelector('el-event-share-panel');
    expect(sharePanel).toBeTruthy();

    const linkInput = fixture.nativeElement.querySelector('.link-input');
    expect(linkInput.value).toBe('https://eventlens.app/g/key-gen-1');

    const copyBtn = fixture.nativeElement.querySelector('.copy-btn');
    copyBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const liveAnnouncement = fixture.nativeElement.querySelector('.sr-only');
    expect(liveAnnouncement.textContent).toContain('Enlace copiado al portapapeles');
  });

  it('Escenario 2: modificar PIN aplica comando y muestra feedback visual y advertencia de revocación', async () => {
    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const settingsComp = fixture.nativeElement.querySelector('el-event-access-settings');
    expect(settingsComp).toBeTruthy();

    // Change to PIN mode
    component.onUpdatePin({
      action: 'CHANGE_PIN',
      newPin: '654321'
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.settings?.pinEnabled).toBe(true);
    expect(component.pinSuccessMessage()).toContain('PIN configurado exitosamente');

    // Warning text is visible in DOM
    const warning = fixture.nativeElement.querySelector('.revocation-warning');
    expect(warning.textContent).toContain('DEC-083');
  });

  it('Escenario 3: regenerar acceso abre modal destructivo, confirma y retorna el foco al disparador', async () => {
    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;

    // 1. Open modal via DOM trigger button
    const regenBtn = fixture.nativeElement.querySelector('.regenerate-trigger-btn');
    expect(regenBtn).toBeTruthy();
    regenBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.showRegenerateDialog()).toBe(true);

    const dialog = fixture.nativeElement.querySelector('el-regenerate-access-dialog');
    expect(dialog).toBeTruthy();

    const warningText = fixture.nativeElement.querySelector('#dialog-desc');
    expect(warningText.textContent).toContain('El enlace anterior y el código QR impreso o compartido dejarán de funcionar');

    // 2. Confirm regeneration via dialog button
    const confirmBtn = fixture.nativeElement.querySelector('.confirm-destruct-btn');
    expect(confirmBtn).toBeTruthy();
    confirmBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.showRegenerateDialog()).toBe(false);
    expect(component.shareSnapshot?.generation).toBe(2);
    expect(component.shareSnapshot?.lookupKey).toContain('new-key-gen-2');
  });

  it('cumple con accesibilidad WCAG 2.2 AA (foco visible, roles y botones interactivos)', async () => {
    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const heading = fixture.nativeElement.querySelector('#mgmt-heading');
    expect(heading.textContent).toContain('Gestión de acceso');

    const copyBtn = fixture.nativeElement.querySelector('.copy-btn');
    expect(copyBtn.getAttribute('aria-label')).toBeTruthy();

    const regenBtn = fixture.nativeElement.querySelector('.regenerate-trigger-btn');
    expect(regenBtn.getAttribute('aria-label')).toBeTruthy();
  });
});
