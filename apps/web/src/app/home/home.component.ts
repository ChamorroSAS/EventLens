import { Component, inject, signal } from '@angular/core';
import { PlatformApiService } from '../core/services/platform-api.service';

@Component({
  selector: 'eventlens-home',
  standalone: true,
  template: `
    <main>
      <h1>EventLens</h1>
      <p>Entorno de desarrollo de la plataforma.</p>
      <h2>Conexión con la API</h2>
      <p role="status" aria-live="polite" aria-atomic="true">{{ message() }}</p>
      <button type="button" (click)="checkApi()" [disabled]="state() === 'loading'">Comprobar conexión</button>
    </main>
  `,
})
export class HomeComponent {
  private readonly api = inject(PlatformApiService);
  readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  readonly message = signal('Comprobando conexión…');

  constructor() { void this.checkApi(); }

  async checkApi(): Promise<void> {
    this.state.set('loading');
    this.message.set('Comprobando conexión…');
    try {
      await this.api.checkReadiness();
      this.state.set('ready');
      this.message.set('API disponible.');
    } catch {
      this.state.set('error');
      this.message.set('API no disponible. Puedes volver a comprobar la conexión.');
    }
  }
}
