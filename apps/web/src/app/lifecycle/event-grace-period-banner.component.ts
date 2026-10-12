import { Component, Input } from '@angular/core';
import type { LifecycleSnapshotModel } from './lifecycle.types.js';

@Component({
  selector: 'eventlens-event-grace-period-banner',
  standalone: true,
  template: `
    @if (showBanner) {
      <aside
        class="grace-banner"
        role="region"
        aria-label="Aviso de periodo de gracia"
      >
        <div class="banner-icon" aria-hidden="true">⏳</div>
        <div class="banner-content">
          <h4 class="banner-title">Periodo de gracia activo</h4>
          <p class="banner-text">
            La vigencia de captura ha finalizado. La galería y descargas de medios permanecen
            disponibles para consulta y respaldo hasta el
            <strong>{{ formattedGraceEnd }}</strong>.
          </p>
          <p class="banner-subtext">
            Para ampliar la vigencia y habilitar nuevas cargas, consulta las opciones de ampliación
            en los planes de capacidad de la plataforma.
          </p>
        </div>
      </aside>
    }
  `,
  styles: `
    .grace-banner {
      display: flex;
      align-items: flex-start;
      gap: 0.875rem;
      padding: 1rem 1.25rem;
      border-radius: 0.5rem;
      background-color: #fff7ed;
      border: 1px solid #fdba74;
      color: #9a3412;
    }
    .banner-icon {
      font-size: 1.5rem;
      line-height: 1;
    }
    .banner-content {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }
    .banner-title {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 700;
      color: #9a3412;
    }
    .banner-text {
      margin: 0;
      font-size: 0.875rem;
      line-height: 1.4;
      color: #7c2d12;
    }
    .banner-subtext {
      margin: 0;
      font-size: 0.8125rem;
      color: #9a3412;
      opacity: 0.9;
    }
  `
})
export class EventGracePeriodBannerComponent {
  @Input({ required: true }) snapshot!: LifecycleSnapshotModel;

  get showBanner(): boolean {
    if (!this.snapshot) return false;
    return Boolean(this.snapshot.capabilities?.isInGracePeriod || this.snapshot.status === 'GRACE_PERIOD');
  }

  get formattedGraceEnd(): string {
    if (!this.snapshot?.graceEndsAt) return 'la fecha límite';
    const date = new Date(this.snapshot.graceEndsAt);
    return date.toLocaleString('es-CO', {
      timeZone: this.snapshot.timezone || 'America/Bogota',
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  }
}
