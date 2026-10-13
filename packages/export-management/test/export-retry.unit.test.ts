import { describe, it, expect, vi } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  ExportRetryService,
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
    requested_at: Date | string;
    failure_code: string | null;
  } | null;
  eventRow?: { status: string; organizer_id: string } | null;
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
                status: 'FAILED',
                generation: 1n,
                selected_count: 5,
                requested_at: new Date('2026-10-12T10:00:00Z'),
                failure_code: 'STORAGE_TIMEOUT'
              }
            ];
      }
      if (sql.includes('FROM event WHERE id = $1::uuid')) {
        return f.eventRow === null
          ? []
          : [f.eventRow ?? { status: 'ACTIVE', organizer_id: organizerId }];
      }
      return [];
    }) as any,
    execute: vi.fn(async (sql: string, ...args: unknown[]) => {
      executed.push({ sql, args });
      return 1;
    })
  };

  const runner: TransactionRunner = { run: vi.fn(async (cb) => cb(tx)) } as any;

  const jobPublisher: ExportJobPublisher = {
    publish: vi.fn(async (_tx, spec) => {
      publishedJobs.push(spec);
      return 'job-retry-1';
    })
  };

  const revalidator: ExportRevalidator = {
    revalidate: vi.fn(async () =>
      f.revalidateOk !== false
        ? { ok: true }
        : { ok: false, code: f.revalidateCode ?? 'MEDIA_WITHDRAWN' }
    )
  };

  const service = new ExportRetryService(runner, {
    jobPublisher,
    revalidator,
    auditSink: { record: async (e) => { audits.push(e); } }
  });

  return { service, publishedJobs, audits, executed, revalidator };
}

describe('ExportRetryService (EL-TK-130)', () => {
  const now = new Date('2026-10-13T12:00:00Z');

  it('reintenta una exportación FAILED abriendo una nueva generación y encolando job', async () => {
    const { service, publishedJobs, audits, executed } = setup();

    const result = await service.retryExport({
      exportId,
      organizerAccountId: organizerId,
      now
    });

    expect(result).toMatchObject({
      exportId,
      eventId,
      generation: 2n,
      status: 'REQUESTED',
      priorStatus: 'FAILED',
      replayed: false
    });

    const updateSql = executed.find((e) => e.sql.includes('UPDATE export_request') && e.sql.includes('status = \'REQUESTED\''));
    expect(updateSql).toBeDefined();
    expect(updateSql!.args).toContain('2');

    expect(publishedJobs).toHaveLength(1);
    expect(publishedJobs[0]).toMatchObject({
      type: 'EXPORT_PREPARE',
      generation: 2n,
      resourceRef: `export:${exportId}`
    });

    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      procedure: 'EXPORT_REQUESTED',
      exportId,
      code: 'RETRY_FAILED'
    });
  });

  it('regenera una exportación EXPIRED en un nuevo ciclo autorizado', async () => {
    const { service, publishedJobs, audits } = setup({
      exportRow: {
        id: exportId,
        event_id: eventId,
        organizer_id: organizerId,
        status: 'EXPIRED',
        generation: 1n,
        selected_count: 5,
        requested_at: new Date('2026-10-10T10:00:00Z'),
        failure_code: null
      }
    });

    const result = await service.retryExport({
      exportId,
      organizerAccountId: organizerId,
      now
    });

    expect(result).toMatchObject({
      exportId,
      eventId,
      generation: 2n,
      status: 'REQUESTED',
      priorStatus: 'EXPIRED',
      replayed: false
    });
    expect(publishedJobs).toHaveLength(1);
    expect(audits[0]!.code).toBe('REGENERATE_EXPIRED');
  });

  it('deniega regenerar si la exportación está INVALIDATED exigiendo nueva solicitud', async () => {
    const { service, publishedJobs } = setup({
      exportRow: {
        id: exportId,
        event_id: eventId,
        organizer_id: organizerId,
        status: 'INVALIDATED',
        generation: 1n,
        selected_count: 5,
        requested_at: new Date('2026-10-12T10:00:00Z'),
        failure_code: 'MEDIA_WITHDRAWN'
      }
    });

    await expect(
      service.retryExport({
        exportId,
        organizerAccountId: organizerId,
        now
      })
    ).rejects.toMatchObject({ code: 'EXPORT_INVALIDATED' });

    expect(publishedJobs).toHaveLength(0);
  });

  it('invalida y deniega si al reintentar una FAILED se detecta que una media fue retirada', async () => {
    const { service, publishedJobs, audits, executed } = setup({
      revalidateOk: false,
      revalidateCode: 'MEDIA_WITHDRAWN'
    });

    await expect(
      service.retryExport({
        exportId,
        organizerAccountId: organizerId,
        now
      })
    ).rejects.toMatchObject({ code: 'EXPORT_INVALIDATED' });

    const updateSql = executed.find((e) => e.sql.includes('UPDATE export_request') && e.sql.includes('status = \'INVALIDATED\''));
    expect(updateSql).toBeDefined();

    expect(publishedJobs).toHaveLength(0);
    expect(audits).toHaveLength(1);
    expect(audits[0]!.procedure).toBe('EXPORT_INVALIDATED');
  });

  it('retorna ciclo actual si ya está en REQUESTED o PREPARING (replay idempotente)', async () => {
    const { service, publishedJobs } = setup({
      exportRow: {
        id: exportId,
        event_id: eventId,
        organizer_id: organizerId,
        status: 'PREPARING',
        generation: 2n,
        selected_count: 5,
        requested_at: new Date('2026-10-13T11:50:00Z'),
        failure_code: null
      }
    });

    const result = await service.retryExport({
      exportId,
      organizerAccountId: organizerId,
      now
    });

    expect(result).toMatchObject({
      exportId,
      generation: 2n,
      status: 'REQUESTED',
      replayed: true
    });
    expect(publishedJobs).toHaveLength(0);
  });

  it('deniega si el actor no es el dueño', async () => {
    const { service } = setup({
      eventRow: { status: 'ACTIVE', organizer_id: 'other-owner' }
    });

    await expect(
      service.retryExport({
        exportId,
        organizerAccountId: organizerId,
        now
      })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
