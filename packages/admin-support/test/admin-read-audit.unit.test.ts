import { describe, expect, it, vi } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import { AdminSearchService } from '../src/admin-search.js';
import { AdminEventDetailService } from '../src/admin-event-detail.js';
import type { AdminActorContext, AdminSupportAuditSink } from '../src/contracts.js';

const actor: AdminActorContext = { actorType: 'ADMIN_HUMAN', principalId: 'admin', identifier: 'admin@example.test', sessionId: 'session', authTime: new Date(), credentialRevision: 1n, adminAuthRevision: 1n, sessionWatermark: 1n, recoveryEpoch: 1n };
const eventId = '10000000-0000-0000-0000-000000000001';
function runner(ownerMissing = false): TransactionRunner {
  return { run: async action => action({
    query: async <R extends object>(sql: string) => (sql.includes('SUM(cnt)') ? [{ total: '0' }] : [{
      id: eventId, organizer_id: 'organizer', name: 'Event', status: 'DRAFT', timezone: 'America/Bogota', starts_at_local: null,
      scheduled_at: null, expires_at: null, grace_ends_at: null, activated_at: null, closed_at: null, suspended_at: null,
      suspension_reason: null, previous_status: null, uploads_enabled: false, guest_gallery_enabled: false,
      owner_id: ownerMissing ? null : 'organizer', owner_email: 'owner@example.test', owner_status: 'ACTIVE', owner_declared_adult: true, owner_created_at: new Date()
    }]) as unknown as R[], execute: async () => 1
  } satisfies SqlTransaction) };
}
function read(kind: 'search' | 'detail', tx: TransactionRunner, sink?: AdminSupportAuditSink) {
  return kind === 'search' ? new AdminSearchService(tx, sink, { requireDurableAudit: true }).search({ actorContext: actor, query: 'private-search' }) :
    new AdminEventDetailService(tx, undefined, undefined, sink, undefined, undefined, undefined, { requireDurableAudit: true }).getEventDetail({ actorContext: actor, eventId });
}

describe('MOD-007 strict HTTP audit mode', () => {
  it('does not fabricate account information when the owner is absent', async () => {
    const record = vi.fn(async () => {});
    await expect(read('detail', runner(true), { record })).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(record).not.toHaveBeenCalled();
  });
  it.each(['search', 'detail'] as const)('requires a configured audit sink before %s data access', async kind => {
    const run = vi.fn();
    await expect(read(kind, { run })).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(run).not.toHaveBeenCalled();
  });
  it.each(['search', 'detail'] as const)('does not swallow a failed %s audit', async kind => {
    await expect(read(kind, runner(), { record: async () => { throw new Error('private sink SDK credentials'); } })).rejects.toMatchObject({ code: 'INTERNAL_ERROR', message: 'Administrative audit is unavailable' });
  });
  it.each(['search', 'detail'] as const)('waits for one durable %s audit acknowledgement before publishing the result', async kind => {
    let acknowledge!: () => void;
    const pending = new Promise<void>(resolve => { acknowledge = resolve; });
    const record = vi.fn(async () => pending);
    let published = false;
    const response = read(kind, runner(), { record }).then(result => { published = true; return result; });
    // Await the sink entering its acknowledgement boundary, not a wall-clock delay.
    for (let i = 0; i < 10 && record.mock.calls.length === 0; i++) await Promise.resolve();
    expect(record).toHaveBeenCalledOnce();
    expect(published).toBe(false);
    expect(JSON.stringify(record.mock.calls)).not.toContain('private-search');
    acknowledge();
    await response;
    expect(published).toBe(true);
  });
});
