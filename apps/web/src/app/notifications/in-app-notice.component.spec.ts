import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InAppNoticeComponent, InAppNoticeItem } from './in-app-notice.component';

describe('InAppNoticeComponent (EL-TK-164 Accessible In-App Notices)', () => {
  let fixture: ComponentFixture<InAppNoticeComponent>;
  let component: InAppNoticeComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InAppNoticeComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(InAppNoticeComponent);
    component = fixture.componentInstance;
  });

  it('Escenario 1: Renderiza aviso contextual vigente mostrando título, hecho, fecha, consecuencia y botón de acción', () => {
    const notice: InAppNoticeItem = {
      id: 'not-01',
      notificationType: 'CAPACITY_WARNING_80',
      title: 'Capacidad al 80%',
      fact: 'El almacenamiento ha alcanzado el 80% de la cuota disponible.',
      date: new Date('2026-10-13T10:00:00Z'),
      consequence: 'Al 100% las nuevas cargas se pausarán.',
      action: {
        label: 'Gestionar capacidad',
        destination: '/events/evt-1/capacity'
      },
      severity: 'WARNING',
      resourceRef: 'events/evt-1'
    };

    component.notice = notice;
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.notice-title')?.textContent).toContain('Capacidad al 80%');
    expect(root.querySelector('.notice-fact')?.textContent).toContain('El almacenamiento ha alcanzado el 80%');
    expect(root.querySelector('.notice-consequence')?.textContent).toContain('Al 100% las nuevas cargas se pausarán');

    const actionLink = root.querySelector('.notice-action-btn') as HTMLAnchorElement;
    expect(actionLink).toBeTruthy();
    expect(actionLink.textContent).toContain('Gestionar capacidad');
    expect(actionLink.getAttribute('href')).toBe('/events/evt-1/capacity');
  });

  it('Escenario 2A: Aplica role="status" y aria-live="polite" para avisos WARNING o INFO', () => {
    component.notice = {
      id: 'not-warn',
      notificationType: 'EXPORT_EXPIRED',
      title: 'Exportación caducada',
      fact: 'La ventana de 48h finalizó.',
      date: new Date(),
      consequence: 'Enlaces caducados.',
      severity: 'WARNING'
    };
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('.el-notice-card');
    expect(card.getAttribute('role')).toBe('status');
    expect(card.getAttribute('aria-live')).toBe('polite');
  });

  it('Escenario 2B: Aplica role="alert" y aria-live="assertive" exclusivamente para avisos CRITICAL', () => {
    component.notice = {
      id: 'not-crit',
      notificationType: 'CASE_CRITICAL_ALERT',
      title: 'Alerta de moderación prioritaria',
      fact: 'Reporte grave recibido.',
      date: new Date(),
      consequence: 'Requiere revisión inmediata.',
      severity: 'CRITICAL'
    };
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('.el-notice-card');
    expect(card.getAttribute('role')).toBe('alert');
    expect(card.getAttribute('aria-live')).toBe('assertive');
  });

  it('Escenario 3: Dado destino expiró por validUntil, muestra aviso inline y alternativa vigente sin asumir permiso', () => {
    const expiredDate = new Date(Date.now() - 3600000); // 1h ago
    component.notice = {
      id: 'not-expired',
      notificationType: 'EXPORT_AVAILABLE',
      title: 'Exportación disponible',
      fact: 'Archivo listo.',
      date: new Date(Date.now() - 7200000),
      validUntil: expiredDate,
      consequence: 'Caduca en 48 horas.',
      action: {
        label: 'Descargar recuerdos',
        destination: '/events/evt-1/exports/1'
      },
      severity: 'INFO',
      resourceRef: 'events/evt-1'
    };
    component.now = new Date();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const warning = root.querySelector('.notice-expired-warning');
    expect(warning).toBeTruthy();
    expect(warning?.textContent).toContain('ha finalizado o ha expirado');

    // Fallback action rendered instead of direct stale link
    const fallbackLink = root.querySelector('.fallback-btn') as HTMLAnchorElement;
    expect(fallbackLink).toBeTruthy();
    expect(fallbackLink.textContent).toContain('Ver estado en la biblioteca');
    expect(fallbackLink.getAttribute('href')).toBe('/events/evt-1/media');
  });

  it('Emite evento de acción al hacer click cuando hay listener', () => {
    const onAction = vi.fn();
    component.actionClick.subscribe(onAction);

    component.notice = {
      id: 'not-click',
      notificationType: 'INFO',
      title: 'Aviso',
      fact: 'Hecho',
      date: new Date(),
      consequence: 'Consecuencia',
      action: {
        label: 'Ir',
        destination: '/dest'
      },
      severity: 'INFO'
    };
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('.notice-action-btn') as HTMLAnchorElement;
    link.click();
    expect(onAction).toHaveBeenCalledWith('/dest');
  });
});
