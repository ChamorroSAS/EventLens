import { describe, it, expect, vi } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  ExportInvalidationService,
  type ExportAuditEvent,
  type ExportJobPublisher,
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
    failure_code: string | null;
    status_reason: string | null;
  } | null;
  mediaExports?: Array<{
    id: string;
    event_id: string;
    organizer_id: string;
    status: string;
    generation: bigint | number | string;
    selected_count: number;
    failure_code: string | null;
    status_reason: string | null;
  }>;
  scopeExports?: Array<{
    id: string;
    event_id: string;
    organizer_id: string;
    status: string;
    generation: bigint | number | string;
    selected_count: number;
    failure_code: string | null;
    status_reason: string | null;
  }>;
  partRows?: Array<{ export_id: string; part_number: number; object_key: string }>;
  manifestRows?: Array<{ id: string; manifest_key: string }>;
  revalidateOk?: boolean;
  revalidateCode?: string;
}

function setup(f: Fixture = {}) {
  const audits: ExportAuditEvent[] = [];
  const publishedJobs: unknown[] = [];
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
                failure_code: null,
                status_reason: null
              }
            ];
      }
      if (sql.includes('FROM export_request e') && sql.includes('JOIN export_request_item i')) {
        return f.mediaExports ?? [];
      }
      if (sql.includes('manifest_key IS NOT NULL')) {
        return f.manifestRows ?? [];
      }
      if (sql.includes('FROM export_request') && sql.includes('event_id = ANY($1::uuid[])')) {
        return f.scopeExports ?? [];
      }
      if (sql.includes('FROM export_part p')) {
        return f.partRows ?? [];
      }
      if (sql.includes('UPDATE export_part')) {
        return [{ count: 2 }];
      }
      return [];
    }) as any,
    execute: vi.fn(async (sql: string, ...args: unknown[]) => {
      executed.push({ sql, args });
      return 1;
    })
  };

  const runner: TransactionRunner = { run: vi.fn(async (cb) => cb(tx)) } as any;

  const revalidator: ExportRevalidator = {
    revalidate: vi.fn(async () =>
      f.revalidateOk !== false
        ? { ok: true }
        : { ok: false, code: f.revalidateCode ?? 'MEDIA_WITHDRAWN' }
    )
  };

  const jobPublisher: ExportJobPublisher = {
    publish: vi.fn(async (_tx, spec) => {
      publishedJobs.push(spec);
      return 'job-1';
    })
  };

  const service = new ExportInvalidationService(runner, {
    revalidator,
    auditSink: { record: async (e) => { audits.push(e); } },
    jobPublisher,
    clock: () => new Date('2026-10-13T00:00:00Z')
  });

  return { service, audits, publishedJobs, executed, revalidator, tx };
}

describe('ExportInvalidationService (EL-TK-128 / DEC-090)', () => {
  describe('revalidateExport', () => {
    it('retorna NOT_FOUND si la exportación no existe', async () => {
      const { service } = setup({ exportRow: null });
      const result = await service.revalidateExport(exportId);
      expect(result).toEqual({ exportId, status: 'NOT_FOUND', ok: false, invalidatedNow: false });
    });

    it('conserva estado y no re-invalida si ya estaba INVALIDATED', async () => {
      const { service, executed, publishedJobs } = setup({
        exportRow: {
          id: exportId,
          event_id: eventId,
          organizer_id: organizerId,
          status: 'INVALIDATED',
          generation: 1n,
          selected_count: 5,
          failure_code: 'MEDIA_WITHDRAWN',
          status_reason: 'Withdrawn earlier'
        }
      });
      const result = await service.revalidateExport(exportId);
      expect(result).toEqual({
        exportId,
        status: 'INVALIDATED',
        ok: false,
        invalidatedNow: false,
        code: 'MEDIA_WITHDRAWN'
      });
      expect(executed.length).toBe(0);
      expect(publishedJobs.length).toBe(0);
    });

    it('retorna ok: true si la exportación sigue autorizada y completa', async () => {
      const { service, executed } = setup({ revalidateOk: true });
      const result = await service.revalidateExport(exportId);
      expect(result).toEqual({ exportId, status: 'AVAILABLE', ok: true, invalidatedNow: false });
      expect(executed.length).toBe(0);
    });

    it('invalida exportación AVAILABLE si una media fue retirada', async () => {
      const { service, audits, publishedJobs, executed } = setup({
        revalidateOk: false,
        revalidateCode: 'MEDIA_WITHDRAWN'
      });
      const result = await service.revalidateExport(exportId);
      expect(result).toEqual({
        exportId,
        status: 'INVALIDATED',
        ok: false,
        invalidatedNow: true,
        code: 'MEDIA_WITHDRAWN'
      });

      const updateSql = executed.find((e) => e.sql.includes('UPDATE export_request'));
      expect(updateSql).toBeDefined();
      expect(updateSql!.args).toContain('MEDIA_WITHDRAWN');

      expect(publishedJobs.length).toBe(1);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        procedure: 'EXPORT_INVALIDATED',
        exportId,
        code: 'MEDIA_WITHDRAWN',
        itemCount: 5
      });
    });

    it('invalida exportación PREPARING si se revoca acceso al evento', async () => {
      const { service, audits, publishedJobs } = setup({
        exportRow: {
          id: exportId,
          event_id: eventId,
          organizer_id: organizerId,
          status: 'PREPARING',
          generation: 2n,
          selected_count: 3,
          failure_code: null,
          status_reason: null
        },
        revalidateOk: false,
        revalidateCode: 'EVENT_ACCESS_REVOKED'
      });
      const result = await service.revalidateExport(exportId);
      expect(result).toMatchObject({
        exportId,
        status: 'INVALIDATED',
        ok: false,
        invalidatedNow: true,
        code: 'EVENT_ACCESS_REVOKED'
      });
      expect(publishedJobs).toHaveLength(1);
      expect(audits[0]!.code).toBe('EVENT_ACCESS_REVOKED');
    });
  });

  describe('invalidateExport', () => {
    it('invalida explícitamente una exportación activa y programa limpieza', async () => {
      const { service, publishedJobs, audits, executed } = setup();
      const result = await service.invalidateExport(exportId, {
        code: 'PRIVACY_RETRACTION',
        reason: 'Contenido retirado por organizador'
      });

      expect(result).toMatchObject({
        exportId,
        status: 'INVALIDATED',
        invalidatedNow: true,
        code: 'PRIVACY_RETRACTION',
        cleanupJobQueued: true
      });

      const updateSql = executed.find((e) => e.sql.includes('UPDATE export_request'));
      expect(updateSql!.args).toContain('PRIVACY_RETRACTION');
      expect(updateSql!.args).toContain('Contenido retirado por organizador');
      expect(publishedJobs).toHaveLength(1);
      expect(audits[0]!.code).toBe('PRIVACY_RETRACTION');
    });

    it('es idempotente si la exportación ya estaba INVALIDATED', async () => {
      const { service, publishedJobs } = setup({
        exportRow: {
          id: exportId,
          event_id: eventId,
          organizer_id: organizerId,
          status: 'INVALIDATED',
          generation: 1n,
          selected_count: 5,
          failure_code: 'PREV_CODE',
          status_reason: null
        }
      });
      const result = await service.invalidateExport(exportId, { code: 'NEW_CODE' });
      expect(result).toMatchObject({
        exportId,
        status: 'INVALIDATED',
        invalidatedNow: false,
        code: 'PREV_CODE'
      });
      expect(publishedJobs).toHaveLength(0);
    });
  });

  describe('invalidateExportsForMedia', () => {
    it('invalida todas las exportaciones activas que contienen la media retirada', async () => {
      const exp1 = {
        id: 'exp-1',
        event_id: eventId,
        organizer_id: organizerId,
        status: 'AVAILABLE',
        generation: 1n,
        selected_count: 10,
        failure_code: null,
        status_reason: null
      };
      const exp2 = {
        id: 'exp-2',
        event_id: eventId,
        organizer_id: organizerId,
        status: 'PREPARING',
        generation: 2n,
        selected_count: 8,
        failure_code: null,
        status_reason: null
      };

      const { service, audits, publishedJobs } = setup({
        mediaExports: [exp1, exp2]
      });

      const result = await service.invalidateExportsForMedia('media:999');
      expect(result).toEqual({
        invalidatedCount: 2,
        exportIds: ['exp-1', 'exp-2']
      });

      expect(publishedJobs).toHaveLength(2);
      expect(audits).toHaveLength(2);
      expect(audits[0]!.code).toBe('MEDIA_WITHDRAWN');
      expect(audits[1]!.code).toBe('MEDIA_WITHDRAWN');
    });
  });

  describe('invalidateExportsForScope (ExportDeletionBarrierPort)', () => {
    it('invalida exportaciones del scope y compila inventario de partes físicas', async () => {
      const activeExport = {
        id: 'exp-scope-1',
        event_id: eventId,
        organizer_id: organizerId,
        status: 'AVAILABLE',
        generation: 1n,
        selected_count: 4,
        failure_code: null,
        status_reason: null
      };

      const { service, audits, publishedJobs } = setup({
        scopeExports: [activeExport],
        partRows: [
          { export_id: 'exp-scope-1', part_number: 1, object_key: 'exports/exp-scope-1/part-1.zip' },
          { export_id: 'exp-scope-1', part_number: 2, object_key: 'exports/exp-scope-1/part-2.zip' }
        ],
        manifestRows: [
          { id: 'exp-scope-1', manifest_key: 'exports/exp-scope-1/manifest.json' }
        ]
      });

      const result = await service.invalidateExportsForScope({
        scopeType: 'EVENT',
        scopeRef: eventId,
        targetEventIds: [eventId],
        requestId: 'req-del-1',
        reason: 'Event deleted'
      });

      expect(result.invalidatedExportsCount).toBe(1);
      expect(result.partsInventory).toEqual([
        {
          exportId: 'exp-scope-1',
          partNumber: 1,
          objectKey: 'exports/exp-scope-1/part-1.zip',
          versionId: null,
          partKind: 'ZIP_PART'
        },
        {
          exportId: 'exp-scope-1',
          partNumber: 2,
          objectKey: 'exports/exp-scope-1/part-2.zip',
          versionId: null,
          partKind: 'ZIP_PART'
        },
        {
          exportId: 'exp-scope-1',
          partNumber: 0,
          objectKey: 'exports/exp-scope-1/manifest.json',
          versionId: null,
          partKind: 'MANIFEST'
        }
      ]);

      expect(publishedJobs).toHaveLength(1);
      expect(audits[0]!.code).toBe('DELETION_BARRIER');
    });
  });
});
