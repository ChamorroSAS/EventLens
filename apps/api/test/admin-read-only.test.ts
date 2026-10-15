import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import type { RecoveryAuthorityPort } from '@eventlens/identity';
import { AdminSessionService } from '../src/identity/admin-session.service.js';
import { AdminReadOnlyController, adminReadOnlyDetailSchema } from '../src/admin/admin-read-only.controller.js';
import { AdminReadOnlyService } from '../src/admin/admin-read-only.service.js';

const eventId = '10000000-0000-0000-0000-000000000001';
const principalId = '20000000-0000-0000-0000-000000000001';
const cookie = '__Host-el_admin_session=opaque-session-token';
const config = { port: 3000, host: '127.0.0.1', databaseUrl: 'unused-in-memory', databaseTimeoutMs: 2000, webOrigin: 'https://admin.example.test', publicEntryBaseUrl: 'https://example.test', identityPepperSecret: 'unused-unit-pepper' };

function fixture(options: { auditFail?: boolean; eventMissing?: boolean; revoked?: boolean; dbFail?: boolean; authorityAbsent?: boolean; authorityOutage?: boolean } = {}) {
  const queries: { sql: string; args: unknown[] }[] = [];
  const writes: { sql: string; args: unknown[] }[] = [];
  const now = new Date();
  const tx: SqlTransaction = {
    query: async <R extends object>(sql: string, ...args: unknown[]): Promise<R[]> => {
      queries.push({ sql, args });
      if (options.dbFail) throw new Error('private postgres address/password');
      if (sql.includes('FROM admin_session')) return [{ id: 'session', principal_id: principalId, token_digest: 'digest', csrf_token_digest: 'digest', auth_time: now, created_at: now, expires_at: new Date(Date.now() + 3_600_000), idle_expires_at: new Date(Date.now() + 600_000), revoked_at: options.revoked ? now : null, session_watermark: 1n }] as unknown as R[];
      if (sql.includes('FROM admin_principal')) return [{ id: principalId, identifier: 'admin@example.test', status: 'ACTIVE', auth_revision: 1n }] as unknown as R[];
      if (sql.includes('FROM admin_credential')) return [{ id: 'credential', revision: 1n, status: 'ACTIVE' }] as unknown as R[];
      if (sql.includes('SELECT SUM(cnt)')) return [{ total: '1' }] as unknown as R[];
      if (sql.includes('LEFT JOIN organizer_account')) return (options.eventMissing ? [] : [{ id: eventId, organizer_id: 'organizer', name: 'Event', status: 'ACTIVE', timezone: 'America/Bogota', starts_at_local: null, scheduled_at: null, expires_at: null, grace_ends_at: null, activated_at: null, closed_at: null, suspended_at: null, suspension_reason: 'private reason', previous_status: null, uploads_enabled: true, guest_gallery_enabled: true, owner_id: 'organizer', owner_email: 'owner@example.test', owner_status: 'ACTIVE', owner_declared_adult: true, owner_created_at: now }]) as unknown as R[];
      if (sql.includes('FROM event')) return [{ row_type: 'EVENT', id: eventId, name_or_email: 'Event', status: 'ACTIVE', organizer_id: 'organizer', timezone: 'America/Bogota', scheduled_at: null, created_at: now, declared_adult: null, invitationCode: 'must-not-leak', media: 'must-not-leak' }] as unknown as R[];
      throw new Error('Unexpected SQL');
    },
    execute: async (sql, ...args) => {
      writes.push({ sql, args });
      if (options.auditFail && sql.includes('INSERT INTO admin_audit_event')) throw new Error('private audit SQL failure');
      return 1;
    }
  };
  const transactions: TransactionRunner = { run: async action => action(tx) };
  const database = { transactions } as any;
  const authority: RecoveryAuthorityPort = {
    getRecoveryEpoch: async () => { if (options.authorityOutage) throw new Error('private SDK path'); return 1n; },
    getCredentialRevision: async () => 1n, getAdminAuthWatermark: async () => 1n
  };
  const sessions = new AdminSessionService(database, config, options.authorityAbsent ? undefined : authority);
  const controller = new AdminReadOnlyController(new AdminReadOnlyService(database, sessions));
  const response = { setHeader: vi.fn() };
  return { controller, response, queries, writes };
}

describe('EL-TK-234 private read-only boundary (real domain validation, no PostgreSQL)', () => {
  it('returns owner pagination, parameterizes sanitized input, audits once without sensitive search text', async () => {
    const f = fixture();
    const result = await f.controller.search({ query: 'private\u0000term', entityType: 'EVENT', page: '2', limit: '10' }, { headers: { cookie, 'x-admin-actor-id': 'attacker' } }, f.response);
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 1, totalPages: 1 });
    expect(result.items[0]).not.toHaveProperty('invitationCode');
    expect(result.items[0]).not.toHaveProperty('media');
    expect(f.queries.some(query => query.args.includes('%privateterm%'))).toBe(true);
    expect(f.queries.some(query => query.sql.includes('privateterm'))).toBe(false);
    const audits = f.writes.filter(write => write.sql.includes('INSERT INTO admin_audit_event'));
    expect(audits).toHaveLength(1);
    expect(audits[0].args[1]).toBe('ADMIN_SEARCH_PERFORMED');
    expect(audits[0].args[2]).toBe(principalId);
    expect(JSON.stringify(audits)).not.toContain('privateterm');
    expect(JSON.stringify(audits)).not.toContain('opaque-session-token');
    expect(f.response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('returns PARTIAL availability without invented counts, actions, jobs, invitations or raw messages', async () => {
    const f = fixture();
    const result = await f.controller.detail(eventId, { headers: { cookie } }, f.response);
    expect(result.overallAvailability).toBe('PARTIAL');
    expect(result.capacity).toEqual({ availability: 'UNAVAILABLE' });
    expect(Object.keys(result)).toEqual(['eventId', 'name', 'overallAvailability', 'owner', 'lifecycle', 'capacity', 'fetchedAt']);
    expect(result.lifecycle).not.toHaveProperty('suspensionReason');
    expect(JSON.stringify(result)).not.toMatch(/invitationCode|capabilities|media|jobs|unavailableReason/);
    expect(f.writes.filter(write => write.args[1] === 'ADMIN_EVENT_DETAIL_VIEWED')).toHaveLength(1);
    expect(adminReadOnlyDetailSchema.additionalProperties).toBe(false);
  });

  it.each([undefined, 'el_admin_session=legacy-token', 'organizer_session=other-actor', '__Host-el_admin_session=; el_admin_session=legacy', '__Host-el_admin_session=%E0%A4%A; el_admin_session=legacy', '__Host-el_admin_session=one; __Host-el_admin_session=two'])('rejects absent/wrong-actor cookies regardless of caller actor headers: %s', async incomingCookie => {
    const f = fixture();
    await expect(f.controller.search({}, { headers: { cookie: incomingCookie, 'x-admin-actor-id': principalId } }, f.response)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(f.queries).toHaveLength(0);
    expect(f.writes).toHaveLength(0);
    expect(f.response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it.each(['search', 'detail'] as const)('fails closed before %s response when durable audit fails', async operation => {
    const f = fixture({ auditFail: true });
    const request = operation === 'search' ? f.controller.search({}, { headers: { cookie } }, f.response) : f.controller.detail(eventId, { headers: { cookie } }, f.response);
    await expect(request).rejects.toMatchObject({ response: { code: 'TEMPORARY_FAILURE', message: 'Administrative service unavailable' } });
    expect(f.response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(f.writes.filter(write => write.sql.includes('INSERT INTO admin_audit_event'))).toHaveLength(1);
  });

  it.each([{ authorityAbsent: true }, { authorityOutage: true }])('denies missing/offline authority before any DB operation', async options => {
    const f = fixture(options);
    await expect(f.controller.search({}, { headers: { cookie } }, f.response)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(f.queries).toHaveLength(0);
    expect(f.writes).toHaveLength(0);
  });

  it('revalidates revoked sessions before owner data access', async () => {
    const f = fixture({ revoked: true });
    await expect(f.controller.search({}, { headers: { cookie } }, f.response)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(f.queries.some(query => query.sql.includes('FROM event'))).toBe(false);
  });

  it('maps an absent event to neutral 404 with no-store', async () => {
    const f = fixture({ eventMissing: true });
    await expect(f.controller.detail(eventId, { headers: { cookie } }, f.response)).rejects.toBeInstanceOf(NotFoundException);
    expect(f.response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it.each([{ entityType: 'MEDIA' }, { query: ['duplicated'] }, { page: '1.5' }, { limit: '101' }, { page: '9007199254740992' }, { page: '9007199254740991', limit: '100' }])('rejects malformed filters/pagination: %s', async query => {
    const f = fixture();
    await expect(f.controller.search(query, { headers: { cookie } }, f.response)).rejects.toBeInstanceOf(BadRequestException);
    expect(f.queries.some(item => item.sql.includes('FROM event'))).toBe(false);
  });

  it('sanitizes PostgreSQL errors to a neutral unavailable response', async () => {
    const f = fixture({ dbFail: true });
    await expect(f.controller.search({}, { headers: { cookie } }, f.response)).rejects.toMatchObject({ response: { code: 'TEMPORARY_FAILURE', message: 'Administrative service unavailable' } });
  });
});
