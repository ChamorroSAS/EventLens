import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import { ExportRequestService, type ExportAuditEvent } from '../src/index.js';

const eventId = '11111111-1111-1111-1111-111111111111';
const organizerId = '33333333-3333-3333-3333-333333333333';
const command = { eventId, organizerAccountId: organizerId, idempotencyKey: 'key-1' };
const fingerprint = createHash('sha256').update(JSON.stringify({ eventId })).digest('hex');

interface Fixture {
  event?: { status: string; organizer_id: string } | null;
  existing?: Record<string, unknown> | null;
  active?: boolean;
  inserted?: number;
  eligibleTotal?: number;
  exclusionRows?: { status: string; cnt: number }[];
  bytes?: bigint;
  failInsertWith?: unknown;
}

function setup(f: Fixture = {}) {
  const audits: ExportAuditEvent[] = [];
  const executed: { sql: string; args: unknown[] }[] = [];
  const tx: SqlTransaction = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('FROM event')) return f.event === null ? [] : [f.event ?? { status: 'ACTIVE', organizer_id: organizerId }];
      if (sql.includes('FROM export_request WHERE organizer_id')) return f.existing ? [f.existing] : [];
      if (sql.includes("status IN ('REQUESTED','PREPARING')")) return f.active ? [{ id: 'x' }] : [];
      if (sql.includes('GROUP BY status')) return f.exclusionRows ?? [];
      if (sql.includes("status IN ('PUBLISHED','HIDDEN')")) return [{ cnt: f.eligibleTotal ?? f.inserted ?? 3 }];
      if (sql.includes('sum(original_bytes)')) return [{ bytes: f.bytes ?? 3000n }];
      return [];
    }) as any,
    execute: vi.fn(async (sql: string, ...args: unknown[]) => {
      executed.push({ sql, args });
      if (sql.includes('INSERT INTO export_request_item')) {
        if (f.failInsertWith) throw f.failInsertWith;
        return f.inserted ?? 3;
      }
      return 1;
    })
  };
  const runner: TransactionRunner = { run: vi.fn(async (cb) => cb(tx)) } as any;
  const service = new ExportRequestService(runner, { record: async (e) => { audits.push(e); } });
  return { service, audits, executed };
}

describe('ExportRequestService (EL-TK-125)', () => {
  it('crea la solicitud con snapshot fijo, conteos y exclusiones', async () => {
    const { service, executed } = setup({
      inserted: 3, eligibleTotal: 4, bytes: 3072n,
      exclusionRows: [{ status: 'TRASHED', cnt: 2 }, { status: 'QUARANTINED', cnt: 1 }]
    });
    const result = await service.requestExport(command);
    expect(result).toMatchObject({ status: 'REQUESTED', selectedCount: 3, selectedBytes: 3072n, replayed: false });
    expect(result.exclusions).toEqual({ TRASHED: 2, QUARANTINED: 1, MISSING_ORIGINAL: 1 });
    // The manifest is frozen by one set-based INSERT ... SELECT limited to PUBLISHED/HIDDEN.
    const snapshot = executed.find((e) => e.sql.includes('INSERT INTO export_request_item'))!;
    expect(snapshot.sql).toContain("status IN ('PUBLISHED','HIDDEN')");
  });

  it('no crea una exportación vacía y reporta las exclusiones', async () => {
    const { service, audits } = setup({ inserted: 0, eligibleTotal: 0, exclusionRows: [{ status: 'PROCESSING', cnt: 5 }] });
    const error = await service.requestExport(command).catch((e) => e);
    expect(error.code).toBe('NO_ELIGIBLE_MEDIA');
    expect(error.exclusions).toEqual({ PROCESSING: 5 });
    expect(audits).toHaveLength(0);
  });

  it('es idempotente: repetir la misma clave devuelve la solicitud original', async () => {
    const { service, executed } = setup({
      existing: {
        id: 'abc', event_id: eventId, request_fingerprint: fingerprint, status: 'REQUESTED',
        selected_count: 7, selected_bytes: '7000', exclusions: '{"TRASHED":1}', requested_at: new Date('2026-10-12T10:00:00Z')
      }
    });
    const result = await service.requestExport(command);
    expect(result).toMatchObject({ exportId: 'abc', replayed: true, selectedCount: 7, selectedBytes: 7000n, exclusions: { TRASHED: 1 } });
    expect(executed).toHaveLength(0);
  });

  it('rechaza la misma clave usada para otro evento', async () => {
    const { service } = setup({ existing: { id: 'abc', event_id: eventId, request_fingerprint: 'otro', status: 'REQUESTED', selected_count: 1, selected_bytes: 1, exclusions: {}, requested_at: new Date() } });
    await expect(service.requestExport(command)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('rechaza una exportación simultánea activa del mismo evento', async () => {
    const { service } = setup({ active: true });
    await expect(service.requestExport(command)).rejects.toMatchObject({ code: 'EXPORT_IN_PROGRESS' });
  });

  it('mapea la violación del índice único de exportación activa a EXPORT_IN_PROGRESS', async () => {
    const { service } = setup({ failInsertWith: { code: 'P2010', meta: { code: '23505' } } });
    await expect(service.requestExport(command)).rejects.toMatchObject({ code: 'EXPORT_IN_PROGRESS' });
  });

  it('deniega a actor ajeno o evento inexistente sin distinguirlos', async () => {
    await expect(setup({ event: { status: 'ACTIVE', organizer_id: 'otro' } }).service.requestExport(command)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(setup({ event: null }).service.requestExport(command)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('deniega eventos suspendidos o en eliminación', async () => {
    for (const status of ['SUSPENDED', 'PENDING_DELETION', 'DELETED']) {
      await expect(setup({ event: { status, organizer_id: organizerId } }).service.requestExport(command))
        .rejects.toMatchObject({ code: 'EVENT_NOT_ELIGIBLE' });
    }
  });

  it('valida argumentos', async () => {
    const { service } = setup();
    for (const bad of [{ ...command, eventId: ' ' }, { ...command, organizerAccountId: '' }, { ...command, idempotencyKey: '' }, { ...command, idempotencyKey: 'x'.repeat(129) }]) {
      await expect(service.requestExport(bad)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    }
  });

  it('audita la solicitud solo con conteos, sin contenido', async () => {
    const { service, audits } = setup({ inserted: 2, eligibleTotal: 2, exclusionRows: [{ status: 'TRASHED', cnt: 4 }] });
    await service.requestExport(command);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ procedure: 'EXPORT_REQUESTED', itemCount: 2, excludedCount: 4 });
    expect(Object.keys(audits[0]!)).not.toContain('items');
  });
});
