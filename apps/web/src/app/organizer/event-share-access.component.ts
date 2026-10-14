import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, inject, signal } from '@angular/core';
import { OrganizerService, type OrganizerShareSnapshot } from './organizer.service.js';
import type { EventStatus } from './organizer.types.js';

@Component({
  selector: 'eventlens-event-share-access',
  standalone: true,
  templateUrl: './event-share-access.component.html',
  styleUrl: './event-share-access.component.scss'
})
export class EventShareAccessComponent implements OnChanges, OnDestroy {
  private readonly service = inject(OrganizerService);
  @Input({ required: true }) eventId!: string;
  @Input({ required: true }) status!: EventStatus;
  @Input({ required: true }) revision!: string;
  @Output() refreshed = new EventEmitter<void>();
  readonly snapshot = signal<OrganizerShareSnapshot | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly missing = signal(false);
  readonly uncertain = signal(false);
  readonly needsRefresh = signal(false);
  readonly error = signal<string | null>(null);
  readonly announcement = signal<string | null>(null);
  private intent: { eventId: string; expectedRevision: string; idempotencyKey: string } | null = null;
  private generation = 0;
  private alive = true;
  private currentRevision: string | null = null;

  get canPrepare(): boolean { return this.status === 'SCHEDULED' || this.status === 'ACTIVE'; }
  get qrSource(): string | null {
    const svg = this.snapshot()?.qrSvg;
    return svg ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) : null;
  }
  get isLocalLink(): boolean {
    const url = this.snapshot()?.shareUrl;
    if (!url) return false;
    const hostname = new URL(url).hostname.toLowerCase();
    return ['localhost', '127.0.0.1', '[::1]'].includes(hostname) || hostname.endsWith('.localhost');
  }

  ngOnChanges(): void {
    this.intent = null;
    this.currentRevision = null;
    this.needsRefresh.set(false);
    this.uncertain.set(false);
    this.saving.set(false);
    this.announcement.set(null);
    void this.load();
  }
  ngOnDestroy(): void { this.alive = false; this.generation++; }

  async load(): Promise<void> {
    if (this.saving()) return;
    const generation = ++this.generation;
    this.snapshot.set(null);
    this.missing.set(false);
    this.error.set(null);
    if (!this.canPrepare) { this.loading.set(false); return; }
    this.loading.set(true);
    try {
      const snapshot = await this.service.getEventShareAccess(this.eventId);
      if (!this.alive || generation !== this.generation) return;
      this.snapshot.set(snapshot);
      this.intent = null;
      this.uncertain.set(false);
    } catch (caught) {
      if (!this.alive || generation !== this.generation) return;
      if ((caught as { status?: number }).status === 404) this.missing.set(true);
      else this.error.set('No pudimos consultar el QR. Comprueba tu sesión y reintenta la consulta.');
    } finally {
      if (this.alive && generation === this.generation) this.loading.set(false);
    }
  }

  async prepare(): Promise<void> {
    if (this.saving() || this.loading() || this.needsRefresh() || !this.canPrepare || !this.revision || this.snapshot() || (!this.missing() && !this.uncertain())) return;
    this.intent ??= { eventId: this.eventId, expectedRevision: this.currentRevision ?? this.revision, idempotencyKey: crypto.randomUUID() };
    const generation = this.generation;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.service.prepareEventShareAccess(this.intent);
      if (!this.alive || generation !== this.generation) return;
      this.announcement.set('Acceso preparado. Consulta y descarga el QR vigente.');
      this.saving.set(false);
      await this.load();
    } catch (caught) {
      if (!this.alive || generation !== this.generation) return;
      const status = (caught as { status?: number }).status;
      this.needsRefresh.set(status === 409);
      this.uncertain.set(status === undefined || status >= 500);
      if (!this.uncertain()) {
        this.intent = null;
        this.missing.set(false);
      }
      this.error.set(this.uncertain()
        ? 'No se confirmó la creación. Consulta el QR o reintenta la misma operación.'
        : status === 409
          ? 'El evento cambió. Recarga sus datos antes de crear el QR.'
          : 'No se autorizó la creación del QR. Comprueba la sesión, el estado y la vigencia del evento.');
    } finally {
      if (this.alive && generation === this.generation) this.saving.set(false);
    }
  }

  async refreshConfiguration(): Promise<void> {
    if (this.saving() || this.loading()) return;
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set(null);
    try {
      const configuration = await this.service.getEventConfiguration(this.eventId);
      if (!this.alive || generation !== this.generation) return;
      this.currentRevision = configuration.revision;
      this.status = configuration.event.status;
      this.intent = null;
      this.uncertain.set(false);
      this.needsRefresh.set(false);
      this.loading.set(false);
      this.refreshed.emit();
      await this.load();
    } catch {
      if (this.alive && generation === this.generation) this.error.set('No pudimos actualizar el evento. Reintenta la actualización.');
    } finally {
      if (this.alive && generation === this.generation) this.loading.set(false);
    }
  }

  async copyLink(): Promise<void> {
    const snapshot = this.snapshot();
    const generation = this.generation;
    if (!snapshot) return;
    try {
      await navigator.clipboard.writeText(snapshot.shareUrl);
      if (this.alive && generation === this.generation) this.announcement.set('Enlace copiado.');
    } catch {
      if (this.alive && generation === this.generation) this.announcement.set('No pudimos copiarlo. Puedes seleccionar el enlace y copiarlo manualmente.');
    }
  }

  download(): void {
    const snapshot = this.snapshot();
    if (!snapshot) return;
    const url = URL.createObjectURL(new Blob([snapshot.qrSvg], { type: 'image/svg+xml;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `evento-${snapshot.eventId}-qr.svg`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
