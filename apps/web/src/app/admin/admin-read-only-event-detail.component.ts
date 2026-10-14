import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AdminReadOnlyApiService } from './admin-read-only-api.service.js';
import { AdminReadOnlySearchStateService } from './admin-read-only-search-state.service.js';
import { AdminSessionService } from './admin-session.service.js';
import type { AdminReadOnlyEventDetail } from './admin-read-only.types.js';

@Component({
  selector: 'eventlens-admin-read-only-event-detail',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section aria-labelledby="admin-event-detail-title">
      <button type="button" (click)="backToSearch()">Volver a resultados</button>
      @if (session.state() !== 'ADMIN_ACTIVE' || session.isRevalidating()) {
        <p role="status">Comprobando la sesión administrativa…</p>
      } @else if (loading()) {
        <p role="status">Cargando detalle del evento…</p>
      } @else if (failure()) {
        <p role="alert">{{ failureMessage() }}</p>
        <button type="button" (click)="load()">Reintentar</button>
      } @else if (detail(); as event) {
        <header><p>{{ event.overallAvailability === 'PARTIAL' ? 'Datos parciales' : 'Datos disponibles' }}</p><h2 id="admin-event-detail-title" tabindex="-1">{{ event.name }}</h2><p>{{ event.eventId }}</p></header>
        <section><h3>Organizador</h3><dl><dt>Identificador</dt><dd>{{ event.owner.id }}</dd><dt>Correo</dt><dd>{{ event.owner.email }}</dd><dt>Estado</dt><dd>{{ event.owner.status }}</dd><dt>Mayor de edad declarado</dt><dd>{{ event.owner.declaredAdult ? 'Sí' : 'No' }}</dd><dt>Creado</dt><dd>{{ event.owner.createdAt }}</dd></dl></section>
        <section><h3>Ciclo de vida</h3><dl><dt>Estado</dt><dd>{{ event.lifecycle.status }}</dd><dt>Zona horaria</dt><dd>{{ event.lifecycle.timezone }}</dd><dt>Inicio local</dt><dd>{{ value(event.lifecycle.startsAtLocal) }}</dd><dt>Programado</dt><dd>{{ value(event.lifecycle.scheduledAt) }}</dd><dt>Expira</dt><dd>{{ value(event.lifecycle.expiresAt) }}</dd><dt>Fin de gracia</dt><dd>{{ value(event.lifecycle.graceEndsAt) }}</dd><dt>Activado</dt><dd>{{ value(event.lifecycle.activatedAt) }}</dd><dt>Cerrado</dt><dd>{{ value(event.lifecycle.closedAt) }}</dd><dt>Suspendido</dt><dd>{{ value(event.lifecycle.suspendedAt) }}</dd><dt>Estado anterior</dt><dd>{{ value(event.lifecycle.previousStatus) }}</dd><dt>Cargas habilitadas</dt><dd>{{ event.lifecycle.uploadsEnabled ? 'Sí' : 'No' }}</dd><dt>Galería de invitados</dt><dd>{{ event.lifecycle.guestGalleryEnabled ? 'Sí' : 'No' }}</dd></dl></section>
        <section><h3>Capacidad</h3>
          @if (event.capacity.availability === 'UNAVAILABLE') { <p>Datos no disponibles.</p> }
          @else { <dl><dt>Disponibilidad</dt><dd>{{ event.capacity.availability }}</dd><dt>Plan</dt><dd>{{ value(event.capacity.planCode) }}</dd><dt>Almacenamiento asignado</dt><dd>{{ value(event.capacity.storageLimitBytes) }}</dd><dt>Almacenamiento usado</dt><dd>{{ value(event.capacity.storageUsedBytes) }}</dd><dt>Límite de archivos</dt><dd>{{ value(event.capacity.fileLimit) }}</dd><dt>Archivos</dt><dd>{{ value(event.capacity.filesCount) }}</dd></dl> }
        </section>
      }
    </section>
  `,
  styleUrl: './admin-read-only-event-detail.component.scss'
})
export class AdminReadOnlyEventDetailComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) eventId = '';
  readonly session = inject(AdminSessionService);
  readonly detail = signal<AdminReadOnlyEventDetail | null>(null);
  readonly loading = signal(false);
  readonly failure = signal<string | null>(null);
  private readonly api = inject(AdminReadOnlyApiService);
  private readonly searchState = inject(AdminReadOnlySearchStateService);
  private readonly router = inject(Router);
  private requestGeneration = 0;
  private readonly unregister = this.session.registerPrivateCacheClearer(() => this.clearPrivate());

  clearPrivate(): void {
    this.requestGeneration++;
    this.detail.set(null); this.loading.set(false); this.failure.set(null);
  }

  ngOnDestroy(): void { this.unregister(); this.clearPrivate(); }

  ngOnChanges(): void { void this.load(); }

  async load(): Promise<void> {
    const generation = ++this.requestGeneration;
    this.loading.set(true); this.failure.set(null); this.detail.set(null);
    const result = await this.api.eventDetail(this.eventId);
    if (generation !== this.requestGeneration) return;
    this.loading.set(false);
    if (result.ok) this.detail.set(result.data);
    else this.failure.set(result.kind);
  }

  async backToSearch(): Promise<void> { await this.router.navigateByUrl('/admin/eventos'); }
  value(value: string | number | null | undefined): string | number { return value ?? 'No definido'; }
  failureMessage(): string { return this.failure() === 'NOT_FOUND' ? 'No se pudo encontrar el evento solicitado.' : 'No se pudo cargar el detalle. Reintenta más tarde.'; }
}
