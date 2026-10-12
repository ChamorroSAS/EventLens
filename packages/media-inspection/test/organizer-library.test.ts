import { describe, it, expect, vi } from 'vitest';
import {
  OrganizerMediaLibraryService,
  MediaLibraryError,
  type OrganizerMediaLibraryRepository,
  type OrganizerMediaLibraryRow,
  type MediaStatusFilter
} from '../src/organizer-library.js';
import type { EventStatusAuthorizer } from '../src/media-status.js';

describe('OrganizerMediaLibraryService unit logic (EL-TK-098)', () => {
  const dummyTx = {} as any;
  const mockTransactions = {
    run: vi.fn().mockImplementation(async (cb: any) => cb(dummyTx))
  };

  const sampleRows: OrganizerMediaLibraryRow[] = [
    {
      media_ref: 'media-001',
      event_ref: 'event-001',
      guest_ref: 'guest-001',
      generation: 1n,
      revision: 1n,
      status: 'PUBLISHED',
      original: { fileName: 'foto-boda.jpg', bytes: '2048500', mimeType: 'image/jpeg' },
      job_id: '11111111-1111-1111-1111-111111111111',
      preview_url: 'https://cdn.eventlens.app/previews/media-001.webp',
      safety_outcome: 'APPROVED',
      job_status: 'COMPLETED',
      job_attempt: 1
    },
    {
      media_ref: 'media-002',
      event_ref: 'event-001',
      guest_ref: 'guest-002',
      generation: 1n,
      revision: 2n,
      status: 'PROCESSING_FAILED',
      original: { fileName: 'video-brindis.mp4', bytes: '15485000', mimeType: 'video/mp4' },
      job_id: '22222222-2222-2222-2222-222222222222',
      preview_url: null,
      safety_outcome: 'INCONCLUSIVE',
      job_status: 'DEAD',
      job_attempt: 3
    },
    {
      media_ref: 'media-003',
      event_ref: 'event-001',
      guest_ref: 'guest-003',
      generation: 1n,
      revision: 1n,
      status: 'QUARANTINED',
      original: { fileName: 'malware.bin', bytes: '1024', mimeType: 'application/octet-stream' },
      job_id: '33333333-3333-3333-3333-333333333333',
      preview_url: null,
      safety_outcome: 'DENIED',
      job_status: 'TERMINATED',
      job_attempt: 1
    }
  ];

  it('falla con INVALID_ARGUMENT si faltan organizerRef o eventRef', async () => {
    const service = new OrganizerMediaLibraryService(
      mockTransactions,
      {} as OrganizerMediaLibraryRepository,
      {} as EventStatusAuthorizer
    );

    await expect(
      service.execute({ organizerRef: '', eventRef: 'event-001' })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });

    await expect(
      service.execute({ organizerRef: 'org-001', eventRef: '' })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('rechaza con ACCESS_DENIED si el autorizador deniega el acceso al evento', async () => {
    const mockAuthorizer: EventStatusAuthorizer = {
      assertAuthorized: vi.fn().mockRejectedValue({ code: 'ACCESS_DENIED' })
    };

    const service = new OrganizerMediaLibraryService(
      mockTransactions,
      {} as OrganizerMediaLibraryRepository,
      mockAuthorizer
    );

    await expect(
      service.execute({ organizerRef: 'org-ajeno', eventRef: 'event-001' })
    ).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });

  it('distingue EMPTY_LIBRARY cuando el total de medios del evento es 0', async () => {
    const mockAuthorizer: EventStatusAuthorizer = {
      assertAuthorized: vi.fn().mockResolvedValue(undefined)
    };
    const mockRepo: OrganizerMediaLibraryRepository = {
      getTotalEventCount: vi.fn().mockResolvedValue(0),
      getFilteredEventCount: vi.fn().mockResolvedValue(0),
      queryItems: vi.fn().mockResolvedValue([])
    };

    const service = new OrganizerMediaLibraryService(
      mockTransactions,
      mockRepo,
      mockAuthorizer
    );

    const snapshot = await service.execute({
      organizerRef: 'org-001',
      eventRef: 'event-001',
      statusFilter: 'ALL'
    });

    expect(snapshot.totalCount).toBe(0);
    expect(snapshot.filterCount).toBe(0);
    expect(snapshot.items).toEqual([]);
    expect(snapshot.emptyReason).toBe('EMPTY_LIBRARY');
  });

  it('distingue EMPTY_FILTER_RESULTS cuando hay medios en el evento pero ninguno coincide con el filtro', async () => {
    const mockAuthorizer: EventStatusAuthorizer = {
      assertAuthorized: vi.fn().mockResolvedValue(undefined)
    };
    const mockRepo: OrganizerMediaLibraryRepository = {
      getTotalEventCount: vi.fn().mockResolvedValue(10), // Total 10 medios en el evento
      getFilteredEventCount: vi.fn().mockResolvedValue(0), // 0 medios con filtro QUARANTINED
      queryItems: vi.fn().mockResolvedValue([])
    };

    const service = new OrganizerMediaLibraryService(
      mockTransactions,
      mockRepo,
      mockAuthorizer
    );

    const snapshot = await service.execute({
      organizerRef: 'org-001',
      eventRef: 'event-001',
      statusFilter: 'QUARANTINED'
    });

    expect(snapshot.totalCount).toBe(10);
    expect(snapshot.filterCount).toBe(0);
    expect(snapshot.items).toEqual([]);
    expect(snapshot.emptyReason).toBe('EMPTY_FILTER_RESULTS');
  });

  it('retorna ítems con estados, capacidades y metadatos correctos', async () => {
    const mockAuthorizer: EventStatusAuthorizer = {
      assertAuthorized: vi.fn().mockResolvedValue(undefined)
    };
    const mockRepo: OrganizerMediaLibraryRepository = {
      getTotalEventCount: vi.fn().mockResolvedValue(3),
      getFilteredEventCount: vi.fn().mockResolvedValue(3),
      queryItems: vi.fn().mockResolvedValue(sampleRows)
    };

    const service = new OrganizerMediaLibraryService(
      mockTransactions,
      mockRepo,
      mockAuthorizer
    );

    const snapshot = await service.execute({
      organizerRef: 'org-001',
      eventRef: 'event-001',
      statusFilter: 'ALL',
      limit: 20,
      offset: 0
    });

    expect(snapshot.totalCount).toBe(3);
    expect(snapshot.filterCount).toBe(3);
    expect(snapshot.emptyReason).toBeUndefined();
    expect(snapshot.items).toHaveLength(3);

    // Item 1: PUBLISHED & APPROVED
    const item1 = snapshot.items[0];
    expect(item1.mediaRef).toBe('media-001');
    expect(item1.status).toBe('PUBLISHED');
    expect(item1.fileName).toBe('foto-boda.jpg');
    expect(item1.previewUrl).toBe('https://cdn.eventlens.app/previews/media-001.webp');
    expect(item1.capabilities.canDownloadOriginal).toBe(true);
    expect(item1.capabilities.canRetry).toBe(false);
    expect(item1.capabilities.canView).toBe(true);
    expect(item1.capabilities.canDelete).toBe(true);

    // Item 2: PROCESSING_FAILED
    const item2 = snapshot.items[1];
    expect(item2.mediaRef).toBe('media-002');
    expect(item2.status).toBe('PROCESSING_FAILED');
    expect(item2.capabilities.canRetry).toBe(true); // Retry permitido
    expect(item2.capabilities.canDownloadOriginal).toBe(false); // No aprobado aún

    // Item 3: QUARANTINED
    const item3 = snapshot.items[2];
    expect(item3.mediaRef).toBe('media-003');
    expect(item3.status).toBe('QUARANTINED');
    expect(item3.capabilities.canRetry).toBe(false); // Cuarentena nunca permite retry a organizador
    expect(item3.capabilities.canDownloadOriginal).toBe(false);
    expect(item3.capabilities.canView).toBe(false); // No visible
  });
});
