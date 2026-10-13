import { describe, it, expect, vi } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import { ExportQueryService } from '../src/index.js';

const exportId = '11111111-1111-1111-1111-111111111111';
const eventId = '22222222-2222-2222-2222-222222222222';
const organizerId = '33333333-3333-3333-3333-333333333333';

interface Fixture {
  exportRows?: any[] | null;
  eventRow?: { status: string; organizer_id: string } | null;
  partRows?: any[];
}

function setup(f: Fixture = {}) {
  const tx: SqlTransaction = {
    query: vi.fn(async (sql: string, ...args: unknown[]) => {
      if (sql.includes('FROM event WHERE id = $1::uuid')) {
        return f.eventRow === null
          ? []
          : [f.eventRow ?? { status: 'ACTIVE', organizer_id: organizerId }];
      }
      if (sql.includes('FROM export_request')) {
        if (f.exportRows === null) return [];
        return (
          f.exportRows ?? [
            {
              id: exportId,
              event_id: eventId,
              organizer_id: organizerId,
              status: 'AVAILABLE',
              generation: 1n,
              selected_count: 5,
              selected_bytes: 50000n,
              requested_at: new Date('2026-10-13T10:00:00Z'),
              prepared_at: new Date('2026-10-13T10:05:00Z'),
              available_at: new Date('2026-10-13T10:05:00Z'),
              expires_at: new Date('2026-10-15T10:05:00Z'),
              expired_at: null,
              invalidated_at: null,
              failure_code: null,
              status_reason: null
            }
          ]
        );
      }
      if (sql.includes('FROM export_part')) {
        return (
          f.partRows ?? [
            {
              part_number: 1,
              status: 'READY',
              entry_count: 3,
              size_bytes: 30000n,
              sha256: 'sha1'
            },
            {
              part_number: 2,
              status: 'READY',
              entry_count: 2,
              size_bytes: 20000n,
              sha256: 'sha2'
            }
          ]
        );
      }
      return [];
    }) as any,
    execute: vi.fn(async () => 1)
  };

  const runner: TransactionRunner = { run: vi.fn(async (cb) => cb(tx)) } as any;
  const service = new ExportQueryService(runner, { clock: () => new Date('2026-10-13T12:00:00Z') });

  return { service, tx };
}

describe('ExportQueryService (EL-TK-131)', () => {
  const now = new Date('2026-10-13T12:00:00Z');

  it('consulta exportación AVAILABLE con partes numeradas, tamaños y capabilities', async () => {
    const { service } = setup();

    const result = await service.queryExportStatus({
      eventId,
      organizerAccountId: organizerId,
      now
    });

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      exportId,
      eventId,
      status: 'AVAILABLE',
      generation: 1n,
      selectedCount: 5,
      capabilities: {
        canDownload: true,
        canRetry: false,
        canRegenerate: false,
        canRequestNew: true
      }
    });

    expect(result!.parts).toHaveLength(2);
    expect(result!.parts[0]).toMatchObject({
      partNumber: 1,
      status: 'READY',
      sizeBytes: 30000,
      fileName: 'event-22222222-export-part-1.zip'
    });
    expect(result!.progress).toEqual({ partsReady: 2, partsTotal: 2, percent: 100 });
  });

  it('muestra progreso real durante PREPARING solo cuando hay partes cuantificables', async () => {
    const { service } = setup({
      exportRows: [
        {
          id: exportId,
          event_id: eventId,
          organizer_id: organizerId,
          status: 'PREPARING',
          generation: 1n,
          selected_count: 4,
          selected_bytes: 40000n,
          requested_at: new Date('2026-10-13T11:55:00Z'),
          prepared_at: null,
          available_at: null,
          expires_at: null,
          expired_at: null,
          invalidated_at: null,
          failure_code: null,
          status_reason: null
        }
      ],
      partRows: [
        { part_number: 1, status: 'READY', entry_count: 2, size_bytes: 20000n, sha256: 'h1' },
        { part_number: 2, status: 'PENDING', entry_count: 2, size_bytes: null, sha256: null }
      ]
    });

    const result = await service.queryExportStatus({
      eventId,
      organizerAccountId: organizerId,
      now
    });

    expect(result!.status).toBe('PREPARING');
    expect(result!.progress).toEqual({ partsReady: 1, partsTotal: 2, percent: 50 });
    expect(result!.capabilities).toMatchObject({
      canDownload: false,
      canRequestNew: false
    });
  });

  it('no inventa progreso si PREPARING aún no tiene partes planificadas (progreso nulo/indeterminado)', async () => {
    const { service } = setup({
      exportRows: [
        {
          id: exportId,
          event_id: eventId,
          organizer_id: organizerId,
          status: 'PREPARING',
          generation: 1n,
          selected_count: 4,
          selected_bytes: 40000n,
          requested_at: new Date('2026-10-13T11:55:00Z'),
          prepared_at: null,
          available_at: null,
          expires_at: null,
          expired_at: null,
          invalidated_at: null,
          failure_code: null,
          status_reason: null
        }
      ],
      partRows: []
    });

    const result = await service.queryExportStatus({
      eventId,
      organizerAccountId: organizerId,
      now
    });

    expect(result!.status).toBe('PREPARING');
    expect(result!.progress).toBeNull();
  });

  it('reconcilia status a EXPIRED en tiempo real si expiró la ventana y expone canRegenerate', async () => {
    const { service } = setup({
      exportRows: [
        {
          id: exportId,
          event_id: eventId,
          organizer_id: organizerId,
          status: 'AVAILABLE',
          generation: 1n,
          selected_count: 5,
          selected_bytes: 50000n,
          requested_at: new Date('2026-10-10T10:00:00Z'),
          prepared_at: new Date('2026-10-10T10:05:00Z'),
          available_at: new Date('2026-10-10T10:05:00Z'),
          expires_at: new Date('2026-10-12T10:05:00Z'), // Vencido respecto a now
          expired_at: null,
          invalidated_at: null,
          failure_code: null,
          status_reason: null
        }
      ]
    });

    const result = await service.queryExportStatus({
      eventId,
      organizerAccountId: organizerId,
      now
    });

    expect(result!.status).toBe('EXPIRED');
    expect(result!.capabilities).toMatchObject({
      canDownload: false,
      canRetry: false,
      canRegenerate: true,
      canRequestNew: true
    });
  });

  it('muestra causa y habilita canRetry cuando status es FAILED', async () => {
    const { service } = setup({
      exportRows: [
        {
          id: exportId,
          event_id: eventId,
          organizer_id: organizerId,
          status: 'FAILED',
          generation: 1n,
          selected_count: 5,
          selected_bytes: 50000n,
          requested_at: new Date('2026-10-13T10:00:00Z'),
          prepared_at: null,
          available_at: null,
          expires_at: null,
          expired_at: null,
          invalidated_at: null,
          failure_code: 'STORAGE_TIMEOUT',
          status_reason: 'Timeout reading media'
        }
      ],
      partRows: []
    });

    const result = await service.queryExportStatus({
      eventId,
      organizerAccountId: organizerId,
      now
    });

    expect(result!.status).toBe('FAILED');
    expect(result!.failureCode).toBe('STORAGE_TIMEOUT');
    expect(result!.statusReason).toBe('Timeout reading media');
    expect(result!.capabilities).toMatchObject({
      canDownload: false,
      canRetry: true,
      canRegenerate: false,
      canRequestNew: true
    });
  });

  it('expone INVALIDATED con causa y canRequestNew: true, sin permitir regeneración directa', async () => {
    const { service } = setup({
      exportRows: [
        {
          id: exportId,
          event_id: eventId,
          organizer_id: organizerId,
          status: 'INVALIDATED',
          generation: 1n,
          selected_count: 5,
          selected_bytes: 50000n,
          requested_at: new Date('2026-10-13T10:00:00Z'),
          prepared_at: null,
          available_at: null,
          expires_at: null,
          expired_at: null,
          invalidated_at: new Date('2026-10-13T11:00:00Z'),
          failure_code: 'MEDIA_WITHDRAWN',
          status_reason: 'Photo deleted by uploader'
        }
      ],
      partRows: []
    });

    const result = await service.queryExportStatus({
      eventId,
      organizerAccountId: organizerId,
      now
    });

    expect(result!.status).toBe('INVALIDATED');
    expect(result!.failureCode).toBe('MEDIA_WITHDRAWN');
    expect(result!.capabilities).toMatchObject({
      canDownload: false,
      canRetry: false,
      canRegenerate: false,
      canRequestNew: true
    });
  });

  it('retorna null cuando el evento no tiene ninguna exportación', async () => {
    const { service } = setup({ exportRows: null });

    const result = await service.queryExportStatus({
      eventId,
      organizerAccountId: organizerId,
      now
    });

    expect(result).toBeNull();
  });

  it('deniega si el actor es de otro organizador', async () => {
    const { service } = setup({
      eventRow: { status: 'ACTIVE', organizer_id: 'other-user' }
    });

    await expect(
      service.queryExportStatus({
        eventId,
        organizerAccountId: organizerId,
        now
      })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
