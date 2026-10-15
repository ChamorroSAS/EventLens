import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  AdminAuthenticationService,
  AuthenticationError,
  computeCredentialDigest,
  computeDummyCredentialDigest,
  serializeSessionCookie,
  type AuditEventRecord,
  type AuditSink,
  type RecoveryAuthorityPort
} from '../src/index.js';

class InMemoryTransactionRunner implements TransactionRunner {
  constructor(private readonly queryHandler: (sql: string, ...args: unknown[]) => Promise<unknown[] | number>) {}

  async run<T>(action: (tx: SqlTransaction) => Promise<T>): Promise<T> {
    const tx: SqlTransaction = {
      execute: async (sql: string, ...args: unknown[]): Promise<number> => {
        const res = await this.queryHandler(sql, ...args);
        return typeof res === 'number' ? res : res.length;
      },
      query: async <R extends object>(sql: string, ...args: unknown[]): Promise<R[]> => {
        const res = await this.queryHandler(sql, ...args);
        return (Array.isArray(res) ? res : []) as R[];
      }
    };
    return action(tx);
  }
}

describe('AdminAuthenticationService (Unit Tests)', () => {
  const allowedOrigins = ['https://admin.eventlens.internal'];
  const principalId = '11111111-1111-1111-1111-111111111111';
  const principalIdentifier = 'admin@eventlens.internal';
  const secret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const purpose = 'ADMIN_AUTHENTICATION';
  const secretDigest = computeCredentialDigest(purpose, principalId, secret);

  let auditEvents: AuditEventRecord[] = [];
  const auditSink: AuditSink = {
    record: async (event) => {
      auditEvents.push(event);
    }
  };

  const defaultRecoveryAuthority: RecoveryAuthorityPort = {
    getRecoveryEpoch: async () => 1n,
    getCredentialRevision: async () => 1n,
    getAdminAuthWatermark: async () => 1n,
    isRecoveryBarrierActive: async () => false
  };

  beforeEach(() => {
    auditEvents = [];
  });

  describe('Credential Hashing and Verification (TB-03)', () => {
    it('enforces purpose and subject separation in credential digests', () => {
      const digest1 = computeCredentialDigest('PURPOSE_A', principalId, secret);
      const digest2 = computeCredentialDigest('PURPOSE_B', principalId, secret);
      const digest3 = computeCredentialDigest('PURPOSE_A', '22222222-2222-2222-2222-222222222222', secret);

      expect(digest1).not.toBe(digest2);
      expect(digest1).not.toBe(digest3);
      expect(digest1).toHaveLength(64);
    });

    it('computes dummy credential digest with identical output shape for unknown subjects', () => {
      const dummy = computeDummyCredentialDigest(purpose, secret);
      expect(dummy).toHaveLength(64);
      expect(typeof dummy).toBe('string');
    });

    it('returns uniform neutral error code UNAUTHENTICATED for unknown, disabled, or wrong secret', async () => {
      // Setup runner that simulates unknown user
      const runnerUnknown = new InMemoryTransactionRunner(async (sql) => {
        if (sql.includes('FROM admin_principal')) return [];
        return [];
      });
      const serviceUnknown = new AdminAuthenticationService(runnerUnknown, {
        allowedOrigins,
        externalAuditSink: auditSink
      });

      await expect(
        serviceUnknown.authenticate({
          identifier: 'nonexistent@eventlens.internal',
          secret,
          origin: allowedOrigins[0],
          customHeaderPresent: true
        })
      ).rejects.toThrow(AuthenticationError);

      try {
        await serviceUnknown.authenticate({
          identifier: 'nonexistent@eventlens.internal',
          secret,
          origin: allowedOrigins[0],
          customHeaderPresent: true
        });
      } catch (err: any) {
        expect(err.code).toBe('UNAUTHENTICATED');
        expect(err.message).toBe('Invalid administrative credentials');
      }

      // Setup runner that simulates inactive principal
      const runnerInactive = new InMemoryTransactionRunner(async (sql) => {
        if (sql.includes('FROM admin_principal')) {
          return [{ id: principalId, identifier: principalIdentifier, status: 'DISABLED', auth_revision: 1n }];
        }
        return [];
      });
      const serviceInactive = new AdminAuthenticationService(runnerInactive, {
        allowedOrigins,
        externalAuditSink: auditSink
      });

      try {
        await serviceInactive.authenticate({
          identifier: principalIdentifier,
          secret,
          origin: allowedOrigins[0],
          customHeaderPresent: true
        });
      } catch (err: any) {
        expect(err.code).toBe('UNAUTHENTICATED');
        expect(err.message).toBe('Invalid administrative credentials');
      }

      // Setup runner that simulates active principal with wrong secret
      const runnerWrongSecret = new InMemoryTransactionRunner(async (sql) => {
        if (sql.includes('FROM admin_principal')) {
          return [{ id: principalId, identifier: principalIdentifier, status: 'ACTIVE', auth_revision: 1n }];
        }
        if (sql.includes('FROM admin_credential')) {
          return [{ id: 'cred-1', principal_id: principalId, purpose, secret_digest: secretDigest, revision: 1n, status: 'ACTIVE' }];
        }
        return [];
      });
      const serviceWrongSecret = new AdminAuthenticationService(runnerWrongSecret, {
        allowedOrigins,
        externalAuditSink: auditSink
      });

      try {
        await serviceWrongSecret.authenticate({
          identifier: principalIdentifier,
          secret: 'wrong-secret-token-that-does-not-match-at-all-0000000',
          origin: allowedOrigins[0],
          customHeaderPresent: true
        });
      } catch (err: any) {
        expect(err.code).toBe('UNAUTHENTICATED');
        expect(err.message).toBe('Invalid administrative credentials');
      }

      // Audit records should never contain secrets or tokens
      for (const event of auditEvents) {
        expect(event.result).toBe('REJECTED_UNAUTHENTICATED');
        expect(event.details).not.toContain(secret);
        expect(JSON.stringify(event)).not.toContain(secret);
      }
    });
  });

  describe('Session Issuance and Cookie Specification (TB-03)', () => {
    it('issues 256-bit random session token and __Host-el_admin_session cookie without fixation', async () => {
      let insertedSession: any = null;
      const runner = new InMemoryTransactionRunner(async (sql, ...args) => {
        if (sql.includes('FROM admin_principal')) {
          return [{ id: principalId, identifier: principalIdentifier, status: 'ACTIVE', auth_revision: 1n }];
        }
        if (sql.includes('FROM admin_credential')) {
          return [{ id: 'cred-1', principal_id: principalId, purpose, secret_digest: secretDigest, revision: 1n, status: 'ACTIVE' }];
        }
        if (sql.includes('INSERT INTO admin_session')) {
          insertedSession = { sql, args };
          return 1;
        }
        return [];
      });

      const service = new AdminAuthenticationService(runner, {
        allowedOrigins,
        externalAuditSink: auditSink,
        recoveryAuthority: defaultRecoveryAuthority
      });

      const result = await service.authenticate({
        identifier: principalIdentifier,
        secret,
        origin: allowedOrigins[0],
        customHeaderPresent: true
      });

      expect(result.sessionToken).toHaveLength(64); // 32 bytes hex = 256 bits
      expect(result.csrfToken).toHaveLength(64);
      expect(result.actorContext.actorType).toBe('ADMIN_HUMAN');
      expect(result.actorContext.principalId).toBe(principalId);
      expect(result.actorContext.identifier).toBe(principalIdentifier);
      expect(result.actorContext.authTime).toBeInstanceOf(Date);

      // Verify cookie spec
      expect(result.cookieSpec.name).toBe('__Host-el_admin_session');
      expect(result.cookieSpec.value).toBe(result.sessionToken);
      expect(result.cookieSpec.httpOnly).toBe(true);
      expect(result.cookieSpec.secure).toBe(true);
      expect(result.cookieSpec.sameSite).toBe('Strict');
      expect(result.cookieSpec.path).toBe('/');
      expect((result.cookieSpec as any).domain).toBeUndefined();
      expect(result.cookieSpec.maxAgeSeconds).toBe(28800); // 8 hours

      const cookieHeader = serializeSessionCookie(result.cookieSpec);
      expect(cookieHeader).toContain('__Host-el_admin_session=');
      expect(cookieHeader).toContain('Path=/');
      expect(cookieHeader).toContain('Secure');
      expect(cookieHeader).toContain('HttpOnly');
      expect(cookieHeader).toContain('SameSite=Strict');
      expect(cookieHeader).not.toContain('Domain=');

      // Verify DB stored only digest, never raw token
      expect(insertedSession).toBeDefined();
      expect(insertedSession.args[2]).not.toBe(result.sessionToken);
      expect(insertedSession.args[2]).toHaveLength(64);
    });

    it('rejects login when custom header is absent', async () => {
      const runner = new InMemoryTransactionRunner(async () => []);
      const service = new AdminAuthenticationService(runner, { allowedOrigins });

      await expect(
        service.authenticate({
          identifier: principalIdentifier,
          secret,
          origin: allowedOrigins[0],
          customHeaderPresent: false
        })
      ).rejects.toThrow('Missing required administrative client header');
    });

    it('rejects login when origin is null or not allowlisted', async () => {
      const runner = new InMemoryTransactionRunner(async () => []);
      const service = new AdminAuthenticationService(runner, { allowedOrigins });

      await expect(
        service.authenticate({
          identifier: principalIdentifier,
          secret,
          origin: 'null',
          customHeaderPresent: true
        })
      ).rejects.toThrow('Origin header must be present and non-null');

      await expect(
        service.authenticate({
          identifier: principalIdentifier,
          secret,
          origin: 'https://evil.attacker.com',
          customHeaderPresent: true
        })
      ).rejects.toThrow('Origin is not allowlisted for administrative operations');
    });
  });

  describe('Session Expiration and Activity Updates (TB-03)', () => {
    const sessionId = 'session-1111-2222';
    const now = new Date();

    it('rejects session that exceeded absolute 8-hour timeout', async () => {
      const pastCreated = new Date(now.getTime() - 9 * 60 * 60 * 1000);
      const pastAbsoluteExpiry = new Date(now.getTime() - 1 * 60 * 60 * 1000);
      const activeIdle = new Date(now.getTime() + 10 * 60 * 1000);

      const runner = new InMemoryTransactionRunner(async (sql) => {
        if (sql.includes('FROM admin_session')) {
          return [{
            id: sessionId,
            principal_id: principalId,
            token_digest: 'digest',
            csrf_token_digest: 'csrf_digest',
            auth_time: pastCreated,
            created_at: pastCreated,
            expires_at: pastAbsoluteExpiry,
            last_active_at: pastCreated,
            idle_expires_at: activeIdle,
            revoked_at: null,
            revocation_reason: null,
            session_watermark: 1n
          }];
        }
        return 1;
      });

      const service = new AdminAuthenticationService(runner, { allowedOrigins });

      await expect(
        service.validateSession({ sessionToken: 'any-token' })
      ).rejects.toThrow('Session exceeded absolute lifetime');
    });

    it('rejects session that exceeded idle 30-minute timeout', async () => {
      const created = new Date(now.getTime() - 40 * 60 * 1000);
      const futureAbsolute = new Date(now.getTime() + 7 * 60 * 60 * 1000);
      const pastIdle = new Date(now.getTime() - 10 * 60 * 1000);

      const runner = new InMemoryTransactionRunner(async (sql) => {
        if (sql.includes('FROM admin_session')) {
          return [{
            id: sessionId,
            principal_id: principalId,
            token_digest: 'digest',
            csrf_token_digest: 'csrf_digest',
            auth_time: created,
            created_at: created,
            expires_at: futureAbsolute,
            last_active_at: created,
            idle_expires_at: pastIdle,
            revoked_at: null,
            revocation_reason: null,
            session_watermark: 1n
          }];
        }
        return 1;
      });

      const service = new AdminAuthenticationService(runner, { allowedOrigins });

      await expect(
        service.validateSession({ sessionToken: 'any-token' })
      ).rejects.toThrow('Session expired due to inactivity');
    });

    it('updates idle expiration monotonically up to, but never exceeding, absolute expiration', async () => {
      // Case where session has only 10 minutes left before absolute expiration
      const absoluteExpiry = new Date(now.getTime() + 10 * 60 * 1000);
      const currentIdle = new Date(now.getTime() + 5 * 60 * 1000);
      let updatedIdleExpiry: Date | null = null;

      const runner = new InMemoryTransactionRunner(async (sql, ...args) => {
        if (sql.includes('FROM admin_session')) {
          return [{
            id: sessionId,
            principal_id: principalId,
            token_digest: 'digest',
            csrf_token_digest: 'csrf_digest',
            auth_time: now,
            created_at: now,
            expires_at: absoluteExpiry,
            last_active_at: now,
            idle_expires_at: currentIdle,
            revoked_at: null,
            revocation_reason: null,
            session_watermark: 1n
          }];
        }
        if (sql.includes('FROM admin_principal')) {
          return [{ id: principalId, identifier: principalIdentifier, status: 'ACTIVE', auth_revision: 1n }];
        }
        if (sql.includes('FROM admin_credential')) {
          return [{ id: 'cred-1', principal_id: principalId, purpose: 'ADMIN_AUTHENTICATION', secret_digest: secretDigest, revision: 1n, status: 'ACTIVE' }];
        }
        if (sql.includes('UPDATE admin_session') && sql.includes('last_active_at')) {
          updatedIdleExpiry = args[1] as Date;
          return 1;
        }
        return 1;
      });

      const service = new AdminAuthenticationService(runner, {
        allowedOrigins,
        recoveryAuthority: defaultRecoveryAuthority
      });
      const context = await service.validateSession({ sessionToken: 'valid-token' });

      expect(context.actorType).toBe('ADMIN_HUMAN');
      expect(context.sessionId).toBe(sessionId);
      expect(updatedIdleExpiry).toBeDefined();
      // Must not exceed absoluteExpiry
      expect(updatedIdleExpiry!.getTime()).toBeLessThanOrEqual(absoluteExpiry.getTime());
    });
  });

  describe('Re-authentication, Token Rotation, and Fresh Auth (TB-03)', () => {
    it('rotates to a new session token, revokes old session, and records fresh auth_time', async () => {
      const oldSessionId = 'old-session-id';
      const matchingCsrfToken = 'csrf-token-1234567890abcdef1234567890abcdef';
      const { createHash } = await import('node:crypto');
      const expectedCsrfDigest = createHash('sha256').update(matchingCsrfToken).digest('hex');
      let revokedSessionId: string | null = null;
      let newSessionInserted = false;

      const runner = new InMemoryTransactionRunner(async (sql, ...args) => {
        if (sql.includes('FROM admin_session')) {
          return [{
            id: oldSessionId,
            principal_id: principalId,
            csrf_token_digest: expectedCsrfDigest,
            expires_at: new Date(Date.now() + 3600000),
            idle_expires_at: new Date(Date.now() + 1800000),
            revoked_at: null,
            session_watermark: 1n
          }];
        }
        if (sql.includes('FROM admin_principal')) {
          return [{ id: principalId, identifier: principalIdentifier, status: 'ACTIVE', auth_revision: 1n }];
        }
        if (sql.includes('FROM admin_credential')) {
          return [{ id: 'cred-1', secret_digest: secretDigest, revision: 1n }];
        }
        if (sql.includes('UPDATE admin_session') && sql.includes('ROTATED_BY_REAUTH')) {
          revokedSessionId = args[1] as string;
          return 1;
        }
        if (sql.includes('INSERT INTO admin_session')) {
          newSessionInserted = true;
          return 1;
        }
        return 1;
      });

      const service = new AdminAuthenticationService(runner, {
        allowedOrigins,
        externalAuditSink: auditSink,
        recoveryAuthority: defaultRecoveryAuthority
      });

      const reauthResult = await service.reauthenticate({
        sessionToken: 'old-session-token',
        secret,
        origin: allowedOrigins[0],
        csrfToken: matchingCsrfToken
      });

      expect(revokedSessionId).toBe(oldSessionId);
      expect(newSessionInserted).toBe(true);
      expect(reauthResult.sessionToken).toBeDefined();
      expect(reauthResult.actorContext.sessionId).not.toBe(oldSessionId);
    });

    it('rejects sensitive operations when authentication is older than 5 minutes', () => {
      const service = new AdminAuthenticationService(new InMemoryTransactionRunner(async () => []), {
        allowedOrigins
      });

      const freshContext = {
        actorType: 'ADMIN_HUMAN' as const,
        principalId,
        identifier: principalIdentifier,
        sessionId: 'session-id',
        authTime: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
        credentialRevision: 1n,
        adminAuthRevision: 1n,
        sessionWatermark: 1n,
        recoveryEpoch: 1n
      };

      // Should not throw
      expect(() => service.assertFreshAuthentication(freshContext)).not.toThrow();

      const staleContext = {
        ...freshContext,
        authTime: new Date(Date.now() - 6 * 60 * 1000) // 6 minutes ago
      };

      expect(() => service.assertFreshAuthentication(staleContext)).toThrow(AuthenticationError);
      expect(() => service.assertFreshAuthentication(staleContext)).toThrow('Sensitive operation requires fresh authentication');
    });
  });

  describe('RecoveryAuthority Integration (AQR-001, TB-03)', () => {
    it('fails closed when RecoveryAuthority reports credential revision strictly newer than stored snapshot', async () => {
      const mockAuthority: RecoveryAuthorityPort = {
        getRecoveryEpoch: async () => 1n,
        getAdminAuthWatermark: async () => 1n,
        getCredentialRevision: async () => 2n // newer revision than stored revision 1n
      };

      const runner = new InMemoryTransactionRunner(async (sql) => {
        if (sql.includes('FROM admin_principal')) {
          return [{ id: principalId, identifier: principalIdentifier, status: 'ACTIVE', auth_revision: 1n }];
        }
        if (sql.includes('FROM admin_credential')) {
          return [{ id: 'cred-1', principal_id: principalId, purpose, secret_digest: secretDigest, revision: 1n, status: 'ACTIVE' }];
        }
        return [];
      });

      const service = new AdminAuthenticationService(runner, {
        allowedOrigins,
        recoveryAuthority: mockAuthority,
        externalAuditSink: auditSink
      });

      await expect(
        service.authenticate({
          identifier: principalIdentifier,
          secret,
          origin: allowedOrigins[0],
          customHeaderPresent: true
        })
      ).rejects.toThrow('Invalid administrative credentials');
    });

    it('executes external prepare and ack pattern during session emission', async () => {
      let prepared = false;
      let acked = false;

      const mockAuthority: RecoveryAuthorityPort = {
        getRecoveryEpoch: async () => 1n,
        getAdminAuthWatermark: async () => 1n,
        getCredentialRevision: async () => 1n,
        prepareSessionOperation: async (_opId, _principalId) => {
          prepared = true;
          return { receipt: 'receipt-xyz' };
        },
        ackSessionOperation: async (receipt) => {
          if (receipt === 'receipt-xyz') acked = true;
        }
      };

      const runner = new InMemoryTransactionRunner(async (sql) => {
        if (sql.includes('FROM admin_principal')) {
          return [{ id: principalId, identifier: principalIdentifier, status: 'ACTIVE', auth_revision: 1n }];
        }
        if (sql.includes('FROM admin_credential')) {
          return [{ id: 'cred-1', principal_id: principalId, purpose, secret_digest: secretDigest, revision: 1n, status: 'ACTIVE' }];
        }
        return 1;
      });

      const service = new AdminAuthenticationService(runner, {
        allowedOrigins,
        recoveryAuthority: mockAuthority
      });

      const result = await service.authenticate({
        identifier: principalIdentifier,
        secret,
        origin: allowedOrigins[0],
        customHeaderPresent: true
      });

      expect(prepared).toBe(true);
      expect(acked).toBe(true);
      expect(result.actorContext.sessionId).toBeDefined();
    });
  });

  describe('EL-TK-221: Session Binding, Credential Revision, Epoch and Recovery Authority (Admin)', () => {
    const sessionId = 'session-tk221-admin';
    const now = new Date();

    it('fails closed with AUTHORITY_UNAVAILABLE when RecoveryAuthority is missing or throws', async () => {
      const runner = new InMemoryTransactionRunner(async (sql) => {
        if (sql.includes('FROM admin_session')) {
          return [{
            id: sessionId,
            principal_id: principalId,
            token_digest: 'token-digest',
            csrf_token_digest: 'csrf-digest',
            auth_time: now,
            created_at: now,
            expires_at: new Date(now.getTime() + 3600000),
            last_active_at: now,
            idle_expires_at: new Date(now.getTime() + 1800000),
            revoked_at: null,
            revocation_reason: null,
            session_watermark: 1n
          }];
        }
        if (sql.includes('FROM admin_principal')) {
          return [{ id: principalId, identifier: principalIdentifier, status: 'ACTIVE', auth_revision: 1n }];
        }
        if (sql.includes('FROM admin_credential')) {
          return [{ id: 'cred-1', principal_id: principalId, purpose: 'ADMIN_AUTHENTICATION', secret_digest: secretDigest, revision: 1n, status: 'ACTIVE' }];
        }
        return 1;
      });

      // 1. Missing authority in options
      const serviceNoAuth = new AdminAuthenticationService(runner, { allowedOrigins });
      await expect(
        serviceNoAuth.validateSession({ sessionToken: 'token' })
      ).rejects.toMatchObject({ code: 'AUTHORITY_UNAVAILABLE' });

      // 2. Failing authority
      const failingAuthority: RecoveryAuthorityPort = {
        getRecoveryEpoch: vi.fn().mockRejectedValue(new Error('NETWORK_TIMEOUT')),
        getCredentialRevision: vi.fn().mockResolvedValue(1n),
        getAdminAuthWatermark: vi.fn().mockResolvedValue(1n)
      };
      const serviceFailing = new AdminAuthenticationService(runner, {
        allowedOrigins,
        recoveryAuthority: failingAuthority
      });
      await expect(
        serviceFailing.validateSession({ sessionToken: 'token' })
      ).rejects.toMatchObject({ code: 'AUTHORITY_UNAVAILABLE' });
    });

    it('fails closed with AUTHORITY_UNAVAILABLE when Recovery Barrier is active for MOD-001', async () => {
      const runner = new InMemoryTransactionRunner(async (sql) => {
        if (sql.includes('FROM admin_session')) {
          return [{
            id: sessionId,
            principal_id: principalId,
            token_digest: 'token-digest',
            csrf_token_digest: 'csrf-digest',
            auth_time: now,
            created_at: now,
            expires_at: new Date(now.getTime() + 3600000),
            last_active_at: now,
            idle_expires_at: new Date(now.getTime() + 1800000),
            revoked_at: null,
            revocation_reason: null,
            session_watermark: 1n
          }];
        }
        if (sql.includes('FROM admin_principal')) {
          return [{ id: principalId, identifier: principalIdentifier, status: 'ACTIVE', auth_revision: 1n }];
        }
        if (sql.includes('FROM admin_credential')) {
          return [{ id: 'cred-1', principal_id: principalId, purpose: 'ADMIN_AUTHENTICATION', secret_digest: secretDigest, revision: 1n, status: 'ACTIVE' }];
        }
        return 1;
      });

      const barrierAuthority: RecoveryAuthorityPort = {
        getRecoveryEpoch: async () => 2n,
        getCredentialRevision: async () => 1n,
        getAdminAuthWatermark: async () => 1n,
        isRecoveryBarrierActive: async (epoch, scope) => scope === 'MOD-001'
      };

      const service = new AdminAuthenticationService(runner, {
        allowedOrigins,
        recoveryAuthority: barrierAuthority
      });

      await expect(
        service.validateSession({ sessionToken: 'token' })
      ).rejects.toMatchObject({ code: 'AUTHORITY_UNAVAILABLE' });
    });

    it('fails with UNAUTHENTICATED when admin credential is missing or not ACTIVE', async () => {
      const runner = new InMemoryTransactionRunner(async (sql) => {
        if (sql.includes('FROM admin_session')) {
          return [{
            id: sessionId,
            principal_id: principalId,
            token_digest: 'token-digest',
            csrf_token_digest: 'csrf-digest',
            auth_time: now,
            created_at: now,
            expires_at: new Date(now.getTime() + 3600000),
            last_active_at: now,
            idle_expires_at: new Date(now.getTime() + 1800000),
            revoked_at: null,
            revocation_reason: null,
            session_watermark: 1n
          }];
        }
        if (sql.includes('FROM admin_principal')) {
          return [{ id: principalId, identifier: principalIdentifier, status: 'ACTIVE', auth_revision: 1n }];
        }
        if (sql.includes('FROM admin_credential')) {
          return []; // Missing active credential
        }
        return 1;
      });

      const service = new AdminAuthenticationService(runner, {
        allowedOrigins,
        recoveryAuthority: defaultRecoveryAuthority
      });

      await expect(
        service.validateSession({ sessionToken: 'token' })
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('derives credentialRevision strictly from admin_credential and never from principal.auth_revision', async () => {
      const runner = new InMemoryTransactionRunner(async (sql) => {
        if (sql.includes('FROM admin_session')) {
          return [{
            id: sessionId,
            principal_id: principalId,
            token_digest: 'token-digest',
            csrf_token_digest: 'csrf-digest',
            auth_time: now,
            created_at: now,
            expires_at: new Date(now.getTime() + 3600000),
            last_active_at: now,
            idle_expires_at: new Date(now.getTime() + 1800000),
            revoked_at: null,
            revocation_reason: null,
            session_watermark: 3n
          }];
        }
        if (sql.includes('FROM admin_principal')) {
          // principal auth_revision is 99n
          return [{ id: principalId, identifier: principalIdentifier, status: 'ACTIVE', auth_revision: 99n }];
        }
        if (sql.includes('FROM admin_credential')) {
          // admin_credential revision is 3n
          return [{ id: 'cred-1', principal_id: principalId, purpose: 'ADMIN_AUTHENTICATION', secret_digest: secretDigest, revision: 3n, status: 'ACTIVE' }];
        }
        return 1;
      });

      const service = new AdminAuthenticationService(runner, {
        allowedOrigins,
        recoveryAuthority: defaultRecoveryAuthority
      });

      const actorContext = await service.validateSession({ sessionToken: 'token' });
      expect(actorContext.credentialRevision).toBe(3n);
      expect(actorContext.adminAuthRevision).toBe(99n);
      expect(actorContext.credentialRevision).not.toBe(actorContext.adminAuthRevision);
    });

    it('invalidates legacy session lacking verifiable binding conservatively with LEGACY_UNVERIFIABLE', async () => {
      let markedRevokedReason: string | null = null;
      const runner = new InMemoryTransactionRunner(async (sql, ...args) => {
        if (sql.includes('FROM admin_session')) {
          return [{
            id: sessionId,
            principal_id: principalId,
            token_digest: '', // corrupt/empty
            csrf_token_digest: 'csrf',
            auth_time: now,
            created_at: now,
            expires_at: new Date(now.getTime() + 3600000),
            last_active_at: now,
            idle_expires_at: new Date(now.getTime() + 1800000),
            revoked_at: null,
            revocation_reason: null,
            session_watermark: 0n // non-positive watermark
          }];
        }
        if (sql.includes('UPDATE admin_session') && sql.includes('LEGACY_UNVERIFIABLE')) {
          markedRevokedReason = 'LEGACY_UNVERIFIABLE';
          return 1;
        }
        return 1;
      });

      const service = new AdminAuthenticationService(runner, {
        allowedOrigins,
        recoveryAuthority: defaultRecoveryAuthority
      });

      await expect(
        service.validateSession({ sessionToken: 'token' })
      ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
      expect(markedRevokedReason).toBe('LEGACY_UNVERIFIABLE');
    });

    it('logout revalidates against RecoveryAuthority failure and fails closed with AUTHORITY_UNAVAILABLE', async () => {
      const runner = new InMemoryTransactionRunner(async () => 1);
      const failingAuthority: RecoveryAuthorityPort = {
        getRecoveryEpoch: vi.fn().mockRejectedValue(new Error('OUTAGE')),
        getCredentialRevision: vi.fn().mockResolvedValue(1n),
        getAdminAuthWatermark: vi.fn().mockResolvedValue(1n)
      };

      const service = new AdminAuthenticationService(runner, {
        allowedOrigins,
        recoveryAuthority: failingAuthority
      });

      await expect(
        service.logout({ sessionToken: 'token', csrfToken: 'csrf', origin: allowedOrigins[0] })
      ).rejects.toMatchObject({ code: 'AUTHORITY_UNAVAILABLE' });
    });
  });
});
