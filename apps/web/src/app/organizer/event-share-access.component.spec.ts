import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventShareAccessComponent } from './event-share-access.component.js';
import { OrganizerService, type OrganizerShareSnapshot } from './organizer.service.js';

describe('QR preparation for scheduled events', () => {
  const snapshot: OrganizerShareSnapshot = {
    eventId: 'event-1', lookupKey: 'sample-key', sharePath: '/g/sample-key', shareUrl: 'https://events.example/g/sample-key',
    generation: 1, pinRequired: false, qrPayload: 'https://events.example/g/sample-key',
    qrSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29"><path d="M0 0h1v1h-1z"/></svg>'
  };
  let service: { getEventShareAccess: ReturnType<typeof vi.fn>; prepareEventShareAccess: ReturnType<typeof vi.fn>; getEventConfiguration: ReturnType<typeof vi.fn> };
  beforeEach(async () => {
    service = { getEventShareAccess: vi.fn().mockRejectedValue({ status: 404 }), prepareEventShareAccess: vi.fn().mockResolvedValue(undefined), getEventConfiguration: vi.fn().mockResolvedValue({ revision: '4', event: { status: 'SCHEDULED' } }) };
    await TestBed.configureTestingModule({ imports: [EventShareAccessComponent], providers: [{ provide: OrganizerService, useValue: service }] }).compileComponents();
  });
  async function create(status = 'SCHEDULED') {
    const fixture = TestBed.createComponent(EventShareAccessComponent);
    fixture.componentRef.setInput('eventId', 'event-1');
    fixture.componentRef.setInput('revision', '3');
    fixture.componentRef.setInput('status', status);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('prepares the QR from SCHEDULED and renders the authoritative link and SVG', async () => {
    const fixture = await create();
    expect(fixture.nativeElement.textContent).toContain('Crear QR');
    expect(fixture.nativeElement.textContent).toContain('antes de la apertura');
    service.getEventShareAccess.mockResolvedValue(snapshot);
    await fixture.componentInstance.prepare();
    fixture.detectChanges();
    expect(service.prepareEventShareAccess).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'event-1', expectedRevision: '3' }));
    expect(fixture.nativeElement.querySelector('input').value).toBe(snapshot.shareUrl);
    expect(decodeURIComponent(fixture.nativeElement.querySelector('img').getAttribute('src').split(',')[1])).toBe(snapshot.qrSvg);
  });

  it('does not create access from a draft or regenerate an existing scheduled QR', async () => {
    const draft = await create('DRAFT');
    await draft.componentInstance.prepare();
    expect(service.getEventShareAccess).not.toHaveBeenCalled();
    expect(service.prepareEventShareAccess).not.toHaveBeenCalled();
    service.getEventShareAccess.mockResolvedValue(snapshot);
    const scheduled = await create();
    await scheduled.componentInstance.prepare();
    expect(service.prepareEventShareAccess).not.toHaveBeenCalled();
    expect(scheduled.nativeElement.textContent).toContain('Descargar QR');
    expect(scheduled.nativeElement.textContent).not.toContain('Crear QR');
  });

  it('shows a localhost notice and reads the new configured base on refresh', async () => {
    service.getEventShareAccess.mockResolvedValue({ ...snapshot, shareUrl: 'http://localhost:4200/g/sample-key' });
    const fixture = await create();
    expect(fixture.nativeElement.textContent).toContain('solo sirve para pruebas');
    service.getEventShareAccess.mockResolvedValue(snapshot);
    await fixture.componentInstance.load();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input').value).toBe(snapshot.shareUrl);
    expect(fixture.nativeElement.textContent).not.toContain('solo sirve para pruebas');
  });

  it('keeps the same key for an uncertain retry and prevents double submission', async () => {
    const fixture = await create();
    service.prepareEventShareAccess.mockRejectedValueOnce({ status: 503 });
    await fixture.componentInstance.prepare();
    const first = service.prepareEventShareAccess.mock.calls[0][0];
    let done!: () => void;
    service.prepareEventShareAccess.mockImplementation(() => new Promise<void>(resolve => { done = resolve; }));
    const second = fixture.componentInstance.prepare();
    await fixture.componentInstance.prepare();
    expect(service.prepareEventShareAccess).toHaveBeenCalledTimes(2);
    expect(service.prepareEventShareAccess.mock.calls[1][0]).toEqual(first);
    service.getEventShareAccess.mockResolvedValue(snapshot);
    done();
    await second;
    expect(fixture.componentInstance.snapshot()?.lookupKey).toBe(snapshot.lookupKey);
  });

  it('does not falsely announce clipboard success', async () => {
    service.getEventShareAccess.mockResolvedValue(snapshot);
    const fixture = await create();
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('Clipboard denied')) } });
    try {
      await fixture.componentInstance.copyLink();
      expect(fixture.componentInstance.announcement()).toContain('copiarlo manualmente');
    } finally {
      if (original) Object.defineProperty(navigator, 'clipboard', original);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('refreshes the authoritative revision after conflict before an explicit new attempt', async () => {
    const fixture = await create();
    service.prepareEventShareAccess.mockRejectedValueOnce({ status: 409 });
    await fixture.componentInstance.prepare();
    await fixture.componentInstance.prepare();
    expect(service.prepareEventShareAccess).toHaveBeenCalledOnce();
    await fixture.componentInstance.refreshConfiguration();
    service.getEventShareAccess.mockResolvedValue(snapshot);
    await fixture.componentInstance.prepare();
    expect(service.prepareEventShareAccess.mock.calls[1][0].expectedRevision).toBe('4');
    expect(fixture.componentInstance.snapshot()?.lookupKey).toBe(snapshot.lookupKey);
  });

  it('discards QR responses when switching to another event', async () => {
    const fixture = await create();
    let done!: (value: OrganizerShareSnapshot) => void;
    service.getEventShareAccess.mockImplementationOnce(() => new Promise<OrganizerShareSnapshot>(resolve => { done = resolve; }));
    const loading = fixture.componentInstance.load();
    service.getEventShareAccess.mockResolvedValue({ ...snapshot, eventId: 'event-2', lookupKey: 'second-key' });
    fixture.componentRef.setInput('eventId', 'event-2');
    fixture.detectChanges();
    done(snapshot);
    await loading;
    await fixture.whenStable();
    expect(fixture.componentInstance.snapshot()?.eventId).toBe('event-2');
  });

  it('downloads the server SVG rather than regenerating or changing the printed access', async () => {
    service.getEventShareAccess.mockResolvedValue(snapshot);
    const fixture = await create();
    const objectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const revokeUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    const createUrl = vi.fn().mockReturnValue('blob:test-qr');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('evento-event-1-qr.svg');
      expect(this.href).toBe('blob:test-qr');
    });
    try {
      fixture.componentInstance.download();
      expect(click).toHaveBeenCalledOnce();
      expect(createUrl.mock.calls[0][0].type).toContain('image/svg+xml');
      expect(service.prepareEventShareAccess).not.toHaveBeenCalled();
      await new Promise(resolve => setTimeout(resolve, 0));
    } finally {
      click.mockRestore();
      if (objectUrl) Object.defineProperty(URL, 'createObjectURL', objectUrl); else Reflect.deleteProperty(URL, 'createObjectURL');
      if (revokeUrl) Object.defineProperty(URL, 'revokeObjectURL', revokeUrl); else Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });
});
