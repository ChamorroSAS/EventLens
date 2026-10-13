import { describe, it, expect, vi } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  ExportError,
  ExportPartDownloadGrantService,
  type ExportAuditEvent,
  type ExportPartDownloadSigner,
  type ExportRevalidator
} from '../src/index.js';

const exportId = '11111111-1111-1111-1111-111111111111';
const eventId = '22222222-2222-2222-2222-222222222222';
const organizerId = '33333333-3333-3333-3333-333333333333';

interface Fixture {
  exportRow?: {
    id: string;
    event_id: string;
    organizer_id: string;
    status: string;
    generation: bigint | number | string;
    selected_count: number;
    expires_at: Date | string | null;
    failure_code: string | null;
  } | null;
  eventRow?: { status: string; organizer_id: string } | null;
  partRow?: {
    part_number: number;
    status: string;
    object_namespace: string | null;
    object_key: string | null;
    size_bytes: bigint | number | string | null;
    sha256: string | null;
  } | null;
  revalidateOk?: boolean;
  revalidateCode?: string;
  failSigner?: boolean;
}

function setup(f: Fixture = {}) {
  const audits: ExportAuditEvent[] = [];
  const executed: { sql: string; args: unknown[] }[] = [];

  const tx: SqlTransaction = {
    query: vi.fn(async (sql: string, ...args: unknown[]) => {
      if (sql.includes('FROM export_request WHERE id = $1::uuid')) {
        return f.exportRow === null
          ? []
          : [
              f.exportRow ?? {
                id: exportId,
                event_id: eventId,
                organizer_id: organizerId,
                status: 'AVAILABLE',
                generation: 1n,
                selected_count: 5,
                expires_at: new Date('2026-10-14T12:00:00Z'),
                failure_code: null
              }
            ];
      }
      if (sql.includes('FROM event WHERE id = $1::uuid')) {
        return f.eventRow === null
          ? []
          : [f.eventRow ?? { status: 'ACTIVE', organizer_id: organizerId }];
      }
      if (sql.includes('FROM export_part')) {
        return f.partRow === null
          ? []
          : [
              f.partRow ?? {
                part_number: 1,
                status: 'READY',
                object_namespace: 'exports-private',
                object_key: 'exports/exp-1/part-1.zip',
                size_bytes: 4096n,
                sha256: 'sha256part1'
              }
            ];
      }
      return [];
    }) as any,
    execute: vi.fn(async (sql: string, ...args: unknown[]) => {
      executed.push({ sql, args });
      return 1;
    })
  };

  const runner: TransactionRunner = { run: vi.fn(async (cb) => cb(tx)) } as any;

  const signer: ExportPartDownloadSigner = {
    createDownloadUrl: vi.fn(async ({ fileName }) => {
      if (f.failSigner) throw new Error('storage offline');
      return `https://storage.private.internal/downloads/${fileName}?token=secret`;
    })
  };

  const revalidator: ExportRevalidator = {
    revalidate: vi.fn(async () =>
      f.revalidateOk !== false
        ? { ok: true }
        : { ok: false, code: f.revalidateCode ?? 'MEDIA_WITHDRAWN' }
    )
  };

  const service = new ExportPartDownloadGrantService(runner, signer, {
    revalidator,
    auditSink: { record: async (e) => { audits.push(e); } }
  });

  return { service, signer, audits, executed, revalidator };
}

describe('ExportPartDownloadGrantService (EL-TK-129)', () => {
  const now = new Date('2026-10-13T12:00:00Z');

  it('emite grant temporal para una parte de exportación AVAILABLE vigente', async () => {
    const { service, signer, audits } = setup();
    const grant = await service.requestPartDownloadGrant({
      exportId,
      partNumber: 1,
      organizerAccountId: organizerId,
      ttlSeconds: 600,
      now
    });

    expect(grant).toMatchObject({
      exportId,
      eventId,
      partNumber: 1,
      downloadUrl: expect.stringContaining('event-22222222-export-part-1.zip'),
      ttlSeconds: 600,
      sizeBytes: 4096,
      sha256: 'sha256part1',
      fileName: 'event-22222222-export-part-1.zip'
    });
    expect(new Date(grant.expiresAt).getTime()).toBe(now.getTime() + 600 * 1000);

    expect(signer.createDownloadUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'exports-private',
        key: 'exports/exp-1/part-1.zip',
        ttlSeconds: 600,
        forceDownload: true
      })
    );

    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      procedure: 'EXPORT_PART_GRANT_ISSUED',
      exportId,
      eventId,
      partNumber: 1,
      bytes: 4096
    });
  });

  it('deniega si el actor es de otro organizador o evento inexistente', async () => {
    const { service } = setup({
      eventRow: { status: 'ACTIVE', organizer_id: 'other-organizer' }
    });

    await expect(
      service.requestPartDownloadGrant({
        exportId,
        partNumber: 1,
        organizerAccountId: organizerId,
        now
      })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('deniega si el evento está en estado suspendido o en eliminación', async () => {
    const { service } = setup({
      eventRow: { status: 'SUSPENDED', organizer_id: organizerId }
    });

    await expect(
      service.requestPartDownloadGrant({
        exportId,
        partNumber: 1,
        organizerAccountId: organizerId,
        now
      })
    ).rejects.toMatchObject({ code: 'EVENT_NOT_ELIGIBLE' });
  });

  it('deniega con EXPORT_EXPIRED si la exportación ha expirado por fecha', async () => {
    const { service } = setup({
      exportRow: {
        id: exportId,
        event_id: eventId,
        organizer_id: organizerId,
        status: 'AVAILABLE',
        generation: 1n,
        selected_count: 5,
        expires_at: new Date('2026-10-13T11:59:59Z'), // Vencida respecto a `now`
        failure_code: null
      }
    });

    await expect(
      service.requestPartDownloadGrant({
        exportId,
        partNumber: 1,
        organizerAccountId: organizerId,
        now
      })
    ).rejects.toMatchObject({ code: 'EXPORT_EXPIRED' });
  });

  it('invalida la exportación y deniega si la revalidación falla (DEC-090)', async () => {
    const { service, audits, executed } = setup({
      revalidateOk: false,
      revalidateCode: 'MEDIA_WITHDRAWN'
    });

    await expect(
      service.requestPartDownloadGrant({
        exportId,
        partNumber: 1,
        organizerAccountId: organizerId,
        now
      })
    ).rejects.toMatchObject({ code: 'EXPORT_INVALIDATED' });

    // Verify it updated export_request and export_part to INVALIDATED
    const updateReq = executed.find((e) => e.sql.includes('UPDATE export_request'));
    expect(updateReq).toBeDefined();
    expect(updateReq!.args).toContain('MEDIA_WITHDRAWN');

    const updateParts = executed.find((e) => e.sql.includes('UPDATE export_part'));
    expect(updateParts).toBeDefined();

    expect(audits).toHaveLength(1);
    expect(audits[0]!.procedure).toBe('EXPORT_INVALIDATED');
    expect(audits[0]!.code).toBe('MEDIA_WITHDRAWN');
  });

  it('deniega con PART_NOT_FOUND si la parte no existe o no está READY', async () => {
    const { service } = setup({
      partRow: {
        part_number: 1,
        status: 'PENDING',
        object_namespace: null,
        object_key: null,
        size_bytes: null,
        sha256: null
      }
    });

    await expect(
      service.requestPartDownloadGrant({
        exportId,
        partNumber: 1,
        organizerAccountId: organizerId,
        now
      })
    ).rejects.toMatchObject({ code: 'PART_NOT_FOUND' });
  });

  it('deniega con TEMPORARY_FAILURE si el storage falla al firmar la URL', async () => {
    const { service } = setup({ failSigner: true });

    await expect(
      service.requestPartDownloadGrant({
        exportId,
        partNumber: 1,
        organizerAccountId: organizerId,
        now
      })
    ).rejects.toMatchObject({ code: 'TEMPORARY_FAILURE' });
  });
});
