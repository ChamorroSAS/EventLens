import { describe, it, expect, vi } from 'vitest';
import { OriginalDownloadGrantService } from '../src/original-download-grant.js';
import {
  type MediaGalleryAuditEvent,
  type ObjectStorageDownloadSigner,
  type SqlTransaction,
  type TransactionRunner
} from '../src/contracts.js';

const eventId = '11111111-1111-1111-1111-111111111111';
const organizerId = '33333333-3333-3333-3333-333333333333';
const mediaId = 'media-1';

interface Fixture {
  eventStatus?: string;
  organizer?: string | null;
  mediaStatus?: string;
  mediaEvent?: string;
  outcome?: string | null;
  original?: unknown;
}

function setup(f: Fixture = {}, signer?: ObjectStorageDownloadSigner) {
  const audits: MediaGalleryAuditEvent[] = [];
  const handler = async (sql: string): Promise<any[]> => {
    if (sql.includes('FROM event')) {
      return f.organizer === null ? [] : [{ status: f.eventStatus ?? 'ACTIVE', organizer_id: f.organizer ?? organizerId }];
    }
    if (sql.includes('FROM media_catalog')) {
      const ev = f.mediaEvent ?? eventId;
      if (ev !== eventId) return [];
      return [{
        media_ref: `media:${mediaId}`,
        event_ref: ev,
        generation: 1n,
        status: f.mediaStatus ?? 'PUBLISHED',
        original: f.original ?? { namespace: 'raw', key: 'originals/secret-key.jpg', fileName: 'foto.jpg' }
      }];
    }
    if (sql.includes('FROM media_inspection')) {
      return f.outcome === null ? [] : [{ fact: { outcome: f.outcome ?? 'APPROVED' } }];
    }
    return [];
  };
  const tx: SqlTransaction = { query: vi.fn(async (sql: string) => handler(sql)) as any, execute: vi.fn(async () => 0) };
  const runner: TransactionRunner = { run: vi.fn(async (cb) => cb(tx)) } as any;
  const sign = vi.fn(async () => 'https://s3.local/signed?x=1');
  const service = new OriginalDownloadGrantService(
    runner,
    signer ?? { createDownloadUrl: sign },
    { record: async (e) => { audits.push(e); } }
  );
  return { service, audits, sign };
}

const command = { eventId, mediaId, organizerAccountId: organizerId };

describe('OriginalDownloadGrantService (EL-TK-124)', () => {
  it('emite URL temporal al original para media propia, segura y elegible', async () => {
    const { service, sign } = setup();
    const grant = await service.requestOriginalDownloadGrant({ ...command, ttlSeconds: 120 });
    expect(grant.downloadUrl).toBe('https://s3.local/signed?x=1');
    expect(grant.ttlSeconds).toBe(120);
    expect(grant.securityStatus).toBe('APPROVED');
    expect(sign).toHaveBeenCalledWith(expect.objectContaining({
      namespace: 'raw', key: 'originals/secret-key.jpg', forceDownload: true, fileName: 'foto.jpg'
    }));
  });

  it('acota el TTL a [60, 3600] segundos', async () => {
    const { service } = setup();
    expect((await service.requestOriginalDownloadGrant({ ...command, ttlSeconds: 5 })).ttlSeconds).toBe(60);
    expect((await service.requestOriginalDownloadGrant({ ...command, ttlSeconds: 999999 })).ttlSeconds).toBe(3600);
  });

  it('permite PROCESSING_FAILED solo con inspección aprobada (DEC-075)', async () => {
    const ok = setup({ mediaStatus: 'PROCESSING_FAILED', outcome: 'APPROVED' });
    await expect(ok.service.requestOriginalDownloadGrant(command)).resolves.toMatchObject({ securityStatus: 'APPROVED' });
    for (const outcome of ['INCONCLUSIVE', 'DENIED', 'PENDING', null]) {
      const bad = setup({ mediaStatus: 'PROCESSING_FAILED', outcome });
      await expect(bad.service.requestOriginalDownloadGrant(command)).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' });
      expect(bad.sign).not.toHaveBeenCalled();
    }
  });

  it('deniega cuarentena, papelera, rechazada, borrada y estados sin inspeccionar', async () => {
    for (const mediaStatus of ['QUARANTINED', 'TRASHED', 'REJECTED', 'DELETED', 'UPLOADED', 'PROCESSING']) {
      const { service, sign } = setup({ mediaStatus });
      await expect(service.requestOriginalDownloadGrant(command)).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' });
      expect(sign).not.toHaveBeenCalled();
    }
  });

  it('deniega a actor ajeno o evento inexistente sin distinguirlos', async () => {
    const foreign = setup({ organizer: '99999999-9999-9999-9999-999999999999' });
    await expect(foreign.service.requestOriginalDownloadGrant(command)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    const missing = setup({ organizer: null });
    await expect(missing.service.requestOriginalDownloadGrant(command)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('responde MEDIA_NOT_FOUND si la media pertenece a otro evento', async () => {
    const { service } = setup({ mediaEvent: '22222222-2222-2222-2222-222222222222' });
    await expect(service.requestOriginalDownloadGrant(command)).rejects.toMatchObject({ code: 'MEDIA_NOT_FOUND' });
  });

  it('deniega en eventos suspendidos o en eliminación', async () => {
    for (const eventStatus of ['SUSPENDED', 'PENDING_DELETION', 'DELETED']) {
      const { service } = setup({ eventStatus });
      await expect(service.requestOriginalDownloadGrant(command)).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' });
    }
  });

  it('falla si el original no tiene referencia de storage', async () => {
    const { service } = setup({ original: { fileName: 'x.jpg' } });
    await expect(service.requestOriginalDownloadGrant(command)).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' });
  });

  it('mapea errores del storage a TEMPORARY_FAILURE sin filtrar detalles', async () => {
    const { service } = setup({}, { createDownloadUrl: async () => { throw new Error('boom key=originals/secret-key.jpg'); } });
    const error = await service.requestOriginalDownloadGrant(command).catch((e) => e);
    expect(error.code).toBe('TEMPORARY_FAILURE');
    expect(String(error.message)).not.toContain('secret-key');
  });

  it('valida argumentos', async () => {
    const { service } = setup();
    for (const bad of [{ ...command, eventId: ' ' }, { ...command, mediaId: '' }, { ...command, organizerAccountId: '' }]) {
      await expect(service.requestOriginalDownloadGrant(bad)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    }
  });

  it('audita la emisión sin URL ni object key', async () => {
    const { service, audits } = setup();
    await service.requestOriginalDownloadGrant(command);
    expect(audits).toHaveLength(1);
    const serialized = JSON.stringify(audits[0]);
    expect(audits[0]!.procedure).toBe('ORIGINAL_DOWNLOAD_GRANT_ISSUED');
    expect(serialized).not.toContain('signed');
    expect(serialized).not.toContain('secret-key');
  });
});
