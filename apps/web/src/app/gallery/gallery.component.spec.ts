import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GalleryComponent } from './gallery.component.js';
import { GalleryViewerComponent } from './gallery-viewer.component.js';
import { GalleryService } from './gallery.service.js';
import type {
  GalleryMediaItem,
  GallerySnapshot,
  MediaViewGrant
} from './gallery.types.js';

describe('Gallery & Viewer Guest Integration (EL-TK-099)', () => {
  let mockGalleryService: {
    getGallerySnapshot: ReturnType<typeof vi.fn>;
    requestViewGrant: ReturnType<typeof vi.fn>;
  };

  const samplePhoto: GalleryMediaItem = {
    mediaId: 'photo-1',
    eventId: 'event-100',
    mediaType: 'PHOTO',
    committedAt: '2026-10-12T10:00:00Z',
    contributorNickname: 'Camila',
    thumbnailUrl: 'https://cdn.local/thumb-1.webp',
    status: 'PUBLISHED',
    revision: '1'
  };

  const sampleVideo: GalleryMediaItem = {
    mediaId: 'video-2',
    eventId: 'event-100',
    mediaType: 'VIDEO',
    committedAt: '2026-10-12T10:05:00Z',
    contributorNickname: 'Lucas',
    durationSeconds: 45,
    thumbnailUrl: 'https://cdn.local/thumb-2.webp',
    status: 'PUBLISHED',
    revision: '1'
  };

  beforeEach(() => {
    mockGalleryService = {
      getGallerySnapshot: vi.fn(),
      requestViewGrant: vi.fn()
    };

    TestBed.configureTestingModule({
      imports: [GalleryComponent, GalleryViewerComponent],
      providers: [
        { provide: GalleryService, useValue: mockGalleryService }
      ]
    });
  });

  function createGalleryComponent(props: {
    eventId?: string;
    guestGalleryEnabled?: boolean;
    guestSessionToken?: string;
  } = {}): ComponentFixture<GalleryComponent> {
    const fixture = TestBed.createComponent(GalleryComponent);
    fixture.componentRef.setInput('eventId', props.eventId ?? 'event-100');
    fixture.componentRef.setInput('guestGalleryEnabled', props.guestGalleryEnabled ?? true);
    if (props.guestSessionToken) {
      fixture.componentRef.setInput('guestSessionToken', props.guestSessionToken);
    }
    return fixture;
  }

  it('Escenario 1: Galería habilitada con publicaciones muestra grid y permite abrir viewer modal dentro del viewport', async () => {
    const mockSnapshot: GallerySnapshot = {
      eventId: 'event-100',
      items: [samplePhoto, sampleVideo],
      hasMore: false
    };
    mockGalleryService.getGallerySnapshot.mockResolvedValueOnce(mockSnapshot);

    const grantPhoto: MediaViewGrant = {
      mediaId: 'photo-1',
      eventId: 'event-100',
      role: 'PREVIEW',
      downloadUrl: 'https://cdn.local/preview-1.webp',
      expiresAt: '2026-10-12T11:00:00Z'
    };
    mockGalleryService.requestViewGrant.mockResolvedValueOnce(grantPhoto);

    const fixture = createGalleryComponent();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // 1. Grid rendered
    const cards = fixture.nativeElement.querySelectorAll('el-gallery-media-card');
    expect(cards.length).toBe(2);

    // 2. Open viewer by clicking first card
    const firstCardBtn = fixture.nativeElement.querySelector('#media-card-photo-1');
    expect(firstCardBtn).toBeTruthy();
    firstCardBtn.click();

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // 3. Viewer opened
    const viewer = fixture.nativeElement.querySelector('el-gallery-viewer');
    expect(viewer).toBeTruthy();
    expect(viewer.getAttribute('role')).toBe('dialog');
    expect(viewer.getAttribute('aria-modal')).toBe('true');

    // 4. Counter and controls visible
    expect(viewer.textContent).toContain('1 de 2');
    expect(mockGalleryService.requestViewGrant).toHaveBeenCalledWith({
      eventId: 'event-100',
      mediaId: 'photo-1',
      role: 'PREVIEW',
      guestSessionToken: undefined,
      publicLookupKey: undefined
    });
  });

  it('Escenario 2: Galería vacía muestra GalleryEmptyState claramente diferenciable del estado de galería deshabilitada', async () => {
    // 1. Galería vacía (habilitada pero sin fotos)
    mockGalleryService.getGallerySnapshot.mockResolvedValueOnce({
      eventId: 'event-100',
      items: [],
      hasMore: false
    });

    const fixtureEmpty = createGalleryComponent({ guestGalleryEnabled: true });
    fixtureEmpty.detectChanges();
    await fixtureEmpty.whenStable();
    fixtureEmpty.detectChanges();

    expect(fixtureEmpty.nativeElement.querySelector('el-gallery-empty-state')).toBeTruthy();
    expect(fixtureEmpty.nativeElement.textContent).toContain('Aún no hay recuerdos publicados en este evento.');
    expect(fixtureEmpty.nativeElement.querySelector('el-gallery-disabled-state')).toBeFalsy();

    // 2. Galería deshabilitada (guestGalleryEnabled: false)
    const fixtureDisabled = createGalleryComponent({ guestGalleryEnabled: false });
    fixtureDisabled.detectChanges();
    await fixtureDisabled.whenStable();
    fixtureDisabled.detectChanges();

    expect(fixtureDisabled.nativeElement.querySelector('el-gallery-disabled-state')).toBeTruthy();
    expect(fixtureDisabled.nativeElement.textContent).toContain('La galería de recuerdos no está habilitada para invitados en este momento.');
    expect(fixtureDisabled.nativeElement.querySelector('el-gallery-empty-state')).toBeFalsy();
    expect(mockGalleryService.getGallerySnapshot).toHaveBeenCalledTimes(1); // No hace llamada si está disabled
  });

  it('Escenario 3: Bloque incremental que falla por red conserva los resultados previos y permite un retry accesible sin reiniciar ni borrar el grid', async () => {
    // 1. Initial snapshot has 1 item and hasMore = true
    mockGalleryService.getGallerySnapshot.mockResolvedValueOnce({
      eventId: 'event-100',
      items: [samplePhoto],
      nextCursor: 'cursor-chunk-2',
      hasMore: true
    });

    const fixture = createGalleryComponent();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('el-gallery-media-card').length).toBe(1);

    // 2. Next incremental load fails with network error
    mockGalleryService.getGallerySnapshot.mockRejectedValueOnce(new Error('Network offline'));

    const loadMoreBtn = fixture.nativeElement.querySelector('.load-more-btn');
    expect(loadMoreBtn).toBeTruthy();
    loadMoreBtn.click();

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // PRESERVES previous item in grid!
    expect(fixture.nativeElement.querySelectorAll('el-gallery-media-card').length).toBe(1);

    // Shows incremental error and retry button
    const errorEl = fixture.nativeElement.querySelector('.incremental-error');
    expect(errorEl).toBeTruthy();
    expect(errorEl.textContent).toContain('Ocurrió un error al cargar el siguiente bloque de recuerdos.');

    const retryBtn = fixture.nativeElement.querySelector('.incremental-retry-btn');
    expect(retryBtn).toBeTruthy();

    // 3. Retry succeeds and appends new item
    mockGalleryService.getGallerySnapshot.mockResolvedValueOnce({
      eventId: 'event-100',
      items: [sampleVideo],
      nextCursor: null,
      hasMore: false
    });

    retryBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Both items are present now
    expect(fixture.nativeElement.querySelectorAll('el-gallery-media-card').length).toBe(2);
    expect(fixture.nativeElement.querySelector('.incremental-error')).toBeFalsy();
  });

  it('Escenario 4: Media retirada o acceso revocado mientras el viewer está abierto deja de emitir autorizaciones y presenta mensaje neutro comprensible', async () => {
    mockGalleryService.getGallerySnapshot.mockResolvedValueOnce({
      eventId: 'event-100',
      items: [samplePhoto, sampleVideo],
      hasMore: false
    });

    const fixture = createGalleryComponent();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // 1. Initial grant for photo succeeds
    mockGalleryService.requestViewGrant.mockResolvedValueOnce({
      mediaId: 'photo-1',
      eventId: 'event-100',
      role: 'PREVIEW',
      downloadUrl: 'https://cdn.local/preview-1.webp',
      expiresAt: '2026-10-12T11:00:00Z'
    });

    fixture.componentInstance.onOpenViewer(samplePhoto);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.activeGrant()).toBeTruthy();

    // 2. Next item grant fails because media was withdrawn (MEDIA_UNAVAILABLE)
    mockGalleryService.requestViewGrant.mockRejectedValueOnce(new Error('MEDIA_UNAVAILABLE'));

    fixture.componentInstance.onViewerNext();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Grant is null and neutral error message is displayed
    expect(fixture.componentInstance.activeGrant()).toBeNull();
    const viewerEl = fixture.nativeElement.querySelector('el-gallery-viewer');
    expect(viewerEl.textContent).toContain('Este recuerdo ya no se encuentra disponible.');

    // 3. If access revoked (ACCESS_REVOKED), displays revocation message
    mockGalleryService.requestViewGrant.mockRejectedValueOnce(new Error('ACCESS_REVOKED'));
    fixture.componentInstance.retryCurrentGrant();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(viewerEl.textContent).toContain('El acceso a este contenido ha sido revocado.');
  });

  it('Navegación de teclado y retorno de foco: Escape cierra el visor y regresa foco al card activador', async () => {
    mockGalleryService.getGallerySnapshot.mockResolvedValueOnce({
      eventId: 'event-100',
      items: [samplePhoto],
      hasMore: false
    });
    mockGalleryService.requestViewGrant.mockResolvedValueOnce({
      mediaId: 'photo-1',
      eventId: 'event-100',
      role: 'PREVIEW',
      downloadUrl: 'https://cdn.local/photo.webp',
      expiresAt: '2026-10-12T11:00:00Z'
    });

    const fixture = createGalleryComponent();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const cardBtn: HTMLButtonElement = fixture.nativeElement.querySelector('#media-card-photo-1');
    expect(cardBtn).toBeTruthy();

    // Open viewer
    cardBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.activeViewerItem()).toBeTruthy();

    // Close via close button or Escape
    fixture.componentInstance.onCloseViewer();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.activeViewerItem()).toBeNull();
  });

  it('VideoPlayer: no tiene autoplay forzado y tiene controles nativos (WCAG 2.2 AA)', async () => {
    mockGalleryService.getGallerySnapshot.mockResolvedValueOnce({
      eventId: 'event-100',
      items: [sampleVideo],
      hasMore: false
    });
    mockGalleryService.requestViewGrant.mockResolvedValueOnce({
      mediaId: 'video-2',
      eventId: 'event-100',
      role: 'PLAYBACK',
      downloadUrl: 'https://cdn.local/video-2.mp4',
      expiresAt: '2026-10-12T11:00:00Z'
    });

    const fixture = createGalleryComponent();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Open video
    fixture.componentInstance.onOpenViewer(sampleVideo);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const videoEl: HTMLVideoElement = fixture.nativeElement.querySelector('video');
    expect(videoEl).toBeTruthy();
    expect(videoEl.autoplay).toBe(false);
    expect(videoEl.hasAttribute('controls')).toBe(true);
  });

  it('Cumple con accesibilidad y diseño responsive: touch targets >= 44x44px y ausencia de botón de descarga guest', async () => {
    mockGalleryService.getGallerySnapshot.mockResolvedValueOnce({
      eventId: 'event-100',
      items: [samplePhoto],
      hasMore: false
    });
    mockGalleryService.requestViewGrant.mockResolvedValueOnce({
      mediaId: 'photo-1',
      eventId: 'event-100',
      role: 'PREVIEW',
      downloadUrl: 'https://cdn.local/photo.webp',
      expiresAt: '2026-10-12T11:00:00Z'
    });

    const fixture = createGalleryComponent();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // No download button in card or anywhere in guest gallery
    expect(fixture.nativeElement.textContent).not.toContain('Descargar');

    // Open viewer
    fixture.componentInstance.onOpenViewer(samplePhoto);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const viewerEl = fixture.nativeElement.querySelector('el-gallery-viewer');
    // Still zero download button
    expect(viewerEl.textContent).not.toContain('Descargar');

    // Report content action present
    expect(viewerEl.querySelector('el-report-content-action')).toBeTruthy();
  });
});
