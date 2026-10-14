import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import { AdminAuthenticationService } from '../src/authentication.js';
import type { RecoveryAuthorityPort } from '../src/contracts.js';

function fixture() {
  const now = Date.now();
  const session = {
    id: 'session', principal_id: 'admin', token_digest: 'digest', csrf_token_digest: 'old-digest',
    auth_time: new Date(now - 60_000), created_at: new Date(now - 60_000),
    last_active_at: new Date(now - 30_000), expires_at: new Date(now + 3_600_000),
    idle_expires_at: new Date(now + 600_000), revoked_at: null as Date | null,
    session_watermark: 2n
  };
  const principal = { id: 'admin', identifier: 'admin@example.test', status: 'ACTIVE', auth_revision: 2n };
  let credentials = [{ id: 'credential', revision: 2n, status: 'ACTIVE' }];
  const authority: RecoveryAuthorityPort = {
    getRecoveryEpoch: vi.fn(async () => 3n),
    getCredentialRevision: vi.fn(async (): Promise<bigint | null> => 2n),
    getAdminAuthWatermark: vi.fn(async () => 2n),
    isRecoveryBarrierActive: vi.fn(async () => false)
  };
  const updates: { sql: string; args: unknown[] }[] = [];
  const tx: SqlTransaction = {
    query: async <R extends object>(sql: string): Promise<R[]> => {
      if (sql.includes('FROM admin_session')) return [session] as unknown as R[];
      if (sql.includes('FROM admin_principal')) return [principal] as unknown as R[];
      if (sql.includes('FROM admin_credential')) return credentials as unknown as R[];
      throw new Error('Unexpected query');
    },
    execute: async (sql, ...args) => {
      updates.push({ sql, args });
      if (sql.includes('SET csrf_token_digest')) session.csrf_token_digest = args[0] as string;
      return 1;
    }
  };
  const runner: TransactionRunner = { run: async action => action(tx) };
  const service = (port: RecoveryAuthorityPort | null = authority) => new AdminAuthenticationService(runner, {
    allowedOrigins: ['https://admin.example.test'], recoveryAuthority: port ?? undefined
  });
  const command = { sessionToken: 'token', origin: 'https://admin.example.test', customHeaderPresent: true };
  return { session, principal, authority, updates, service, command, revokeCredential: () => { credentials[0].status = 'REVOKED'; }, removeCredentials: () => { credentials = []; } };
}

describe('Administrative context renewal: domain checks without PostgreSQL', () => {
  it('rotates only the CSRF digest, retaining token, auth time, activity and both deadlines', async () => {
    const f = fixture();
    const before = { ...f.session };
    const result = await f.service().renewSessionContext(f.command);
    expect(result.csrfToken).toMatch(/^[0-9a-f]{64}$/);
    expect(f.session).toEqual({ ...before, csrf_token_digest: createHash('sha256').update(result.csrfToken).digest('hex') });
    expect(f.updates).toHaveLength(1);
    expect(result.actorContext.authTime).toEqual(before.auth_time);
    expect(result.actorContext.recoveryEpoch).toBe(3n);
  });

  it.each([
    ['missing credential', 'UNAUTHENTICATED', (f: ReturnType<typeof fixture>) => f.removeCredentials()],
    ['revoked credential', 'UNAUTHENTICATED', (f: ReturnType<typeof fixture>) => f.revokeCredential()],
    ['inactive principal', 'UNAUTHENTICATED', (f: ReturnType<typeof fixture>) => { f.principal.status = 'REVOKED'; }],
    ['SQL credential revision', 'SESSION_REVOKED', (f: ReturnType<typeof fixture>) => { f.session.session_watermark = 1n; }],
    ['authentication floor', 'SESSION_REVOKED', (f: ReturnType<typeof fixture>) => { f.principal.auth_revision = 3n; }],
    ['external credential revision', 'SESSION_REVOKED', (f: ReturnType<typeof fixture>) => { vi.mocked(f.authority.getCredentialRevision).mockResolvedValue(3n); }],
    ['external watermark', 'SESSION_REVOKED', (f: ReturnType<typeof fixture>) => { vi.mocked(f.authority.getAdminAuthWatermark).mockResolvedValue(3n); }],
    ['missing external revision', 'AUTHORITY_UNAVAILABLE', (f: ReturnType<typeof fixture>) => { vi.mocked(f.authority.getCredentialRevision).mockResolvedValue(null); }],
    ['missing external watermark', 'AUTHORITY_UNAVAILABLE', (f: ReturnType<typeof fixture>) => { vi.mocked(f.authority.getAdminAuthWatermark).mockResolvedValue(null as unknown as bigint); }],
    ['authority outage', 'AUTHORITY_UNAVAILABLE', (f: ReturnType<typeof fixture>) => { vi.mocked(f.authority.getRecoveryEpoch).mockRejectedValue(new Error('offline')); }],
    ['recovery barrier', 'AUTHORITY_UNAVAILABLE', (f: ReturnType<typeof fixture>) => { vi.mocked(f.authority.isRecoveryBarrierActive!).mockResolvedValue(true); }],
    ['absolute expiry', 'SESSION_EXPIRED', (f: ReturnType<typeof fixture>) => { f.session.expires_at = new Date(0); }],
    ['idle expiry', 'SESSION_EXPIRED', (f: ReturnType<typeof fixture>) => { f.session.idle_expires_at = new Date(0); }],
    ['revoked session', 'SESSION_EXPIRED', (f: ReturnType<typeof fixture>) => { f.session.revoked_at = new Date(); }],
    ['legacy binding', 'SESSION_REVOKED', (f: ReturnType<typeof fixture>) => { f.session.token_digest = ''; }]
  ])('rejects %s before CSRF rotation', async (_name, code, invalidate) => {
    const f = fixture();
    invalidate(f);
    await expect(f.service().renewSessionContext(f.command)).rejects.toMatchObject({ code });
    expect(f.session.csrf_token_digest).toBe('old-digest');
    expect(f.updates.some(update => update.sql.includes('SET csrf_token_digest'))).toBe(false);
  });

  it('rejects missing authority without issuing a renewed context', async () => {
    const f = fixture();
    await expect(f.service(null).renewSessionContext(f.command)).rejects.toMatchObject({ code: 'AUTHORITY_UNAVAILABLE' });
    expect(f.updates).toHaveLength(0);
  });
});
