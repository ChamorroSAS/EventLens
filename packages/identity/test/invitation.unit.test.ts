import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  BetaInvitationService,
  InvitationError,
  type AdminActorContext,
  type AuditEventRecord,
  type AuditSink
} from '../src/index.js';

class MockTransactionRunner implements TransactionRunner {
  public executedQueries: { sql: string; params: unknown[] }[] = [];
  public mockRows: any[] = [];

  async run<T>(fn: (tx: SqlTransaction) => Promise<T>): Promise<T> {
    const tx: SqlTransaction = {
      query: async <R extends object>(sql: string, ...params: unknown[]): Promise<R[]> => {
        this.executedQueries.push({ sql, params });
        return [...this.mockRows] as R[];
      },
      execute: async (sql: string, ...params: unknown[]): Promise<number> => {
        this.executedQueries.push({ sql, params });
        return 1;
      }
    };
    return fn(tx);
  }
}

describe('BetaInvitationService (Unit Tests — EL-TK-005)', () => {
  const adminActor: AdminActorContext = {
    actorType: 'ADMIN_HUMAN',
    principalId: randomUUID(),
    identifier: 'admin@eventlens.internal',
    sessionId: randomUUID(),
    authTime: new Date(),
    credentialRevision: 1n,
    adminAuthRevision: 1n,
    sessionWatermark: 1n,
    recoveryEpoch: 1n
  };

  it('rejects issuance when actor context is missing or not ADMIN_HUMAN', async () => {
    const runner = new MockTransactionRunner();
    const service = new BetaInvitationService(runner);

    await expect(
      service.issueInvitation({
        actorContext: null as any,
        email: 'organizer@eventlens.internal'
      })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    await expect(
      service.issueInvitation({
        actorContext: { ...adminActor, actorType: 'SYSTEM' as any },
        email: 'organizer@eventlens.internal'
      })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects invalid email formats without touching database', async () => {
    const runner = new MockTransactionRunner();
    const service = new BetaInvitationService(runner);

    const invalidEmails = [
      '',
      'invalid-no-at',
      '@missing-local.com',
      'spaces in@domain.com',
      'missing-tld@domain',
      'a'.repeat(250) + '@domain.com' // Exceeds RFC 5322 254-char max
    ];

    for (const email of invalidEmails) {
      await expect(
        service.issueInvitation({
          actorContext: adminActor,
          email
        })
      ).rejects.toMatchObject({ code: 'INVALID_EMAIL' });
    }

    expect(runner.executedQueries.length).toBe(0);
  });

  describe('Criterio de Aceptación: Escenario 1 (Nueva invitación pendiente por 7 días)', () => {
    it('issues a new invitation with 7-day TTL and 256-bit unguessable token', async () => {
      const runner = new MockTransactionRunner();
      runner.mockRows = []; // No existing invitations

      const recordedAudits: AuditEventRecord[] = [];
      const auditSink: AuditSink = {
        record: async (event) => {
          recordedAudits.push(event);
        }
      };

      const service = new BetaInvitationService(runner, { auditSink });
      const email = 'NewOrganizer@EventLens.Internal '; // Mixed case + spaces

      const before = Date.now();
      const result = await service.issueInvitation({
        actorContext: adminActor,
        email
      });
      const after = Date.now();

      expect(result.outcome).toBe('ISSUED');
      expect(result.invitation.status).toBe('PENDING');
      expect(result.invitation.email).toBe('NewOrganizer@EventLens.Internal');
      expect(result.invitation.emailNormalized).toBe('neworganizer@eventlens.internal');
      expect(result.invitation.issuedBy).toBe(adminActor.principalId);

      // Verify unguessable 256-bit token
      expect(result.invitation.token).toHaveLength(64);

      // Verify 7-day TTL window (7 days = 604,800,000 ms)
      const expectedTtlMs = 7 * 24 * 60 * 60 * 1000;
      const duration = result.invitation.expiresAt.getTime() - result.invitation.createdAt.getTime();
      expect(duration).toBe(expectedTtlMs);

      // Verify expiration is 7 days from now
      expect(result.invitation.expiresAt.getTime()).toBeGreaterThanOrEqual(before + expectedTtlMs);
      expect(result.invitation.expiresAt.getTime()).toBeLessThanOrEqual(after + expectedTtlMs);

      // Verify SQL INSERT executed
      const insertQuery = runner.executedQueries.find((q) => q.sql.includes('INSERT INTO beta_invitation'));
      expect(insertQuery).toBeDefined();

      // Verify audit emitted with zero secrets
      expect(recordedAudits.length).toBe(1);
      expect(recordedAudits[0].procedure).toBe('BETA_INVITE_ISSUE');
      expect(recordedAudits[0].result).toBe('SUCCESS');
      expect(recordedAudits[0].targetIdentifier).toBe('neworganizer@eventlens.internal');
      expect(recordedAudits[0].details).not.toContain(result.invitation.token);
    });
  });

  describe('Criterio de Aceptación: Escenario 2 (Invitación vigente o usada)', () => {
    it('returns existing pending invitation with indication "ya está pendiente" without creating records', async () => {
      const runner = new MockTransactionRunner();
      const existingId = randomUUID();
      const now = new Date();
      const futureExpiry = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 days left

      runner.mockRows = [
        {
          id: existingId,
          email: 'pending@eventlens.internal',
          email_normalized: 'pending@eventlens.internal',
          token_digest: 'existing-token-hash',
          status: 'PENDING',
          issued_by: adminActor.principalId,
          created_at: now,
          expires_at: futureExpiry,
          consumed_at: null,
          revoked_at: null,
          revision: 1n
        }
      ];

      const recordedAudits: AuditEventRecord[] = [];
      const service = new BetaInvitationService(runner, {
        auditSink: {
          record: async (e) => {
            recordedAudits.push(e);
          }
        }
      });

      const result = await service.issueInvitation({
        actorContext: adminActor,
        email: 'pending@eventlens.internal'
      });

      expect(result.outcome).toBe('ALREADY_PENDING');
      expect(result.message).toBe('ya está pendiente');
      expect(result.invitation.id).toBe(existingId);
      expect(result.invitation.status).toBe('PENDING');
      expect(result.invitation.token).toBe(''); // Token is not leaked

      // No new invitation INSERT
      const insertQuery = runner.executedQueries.find((q) => q.sql.includes('INSERT INTO beta_invitation'));
      expect(insertQuery).toBeUndefined();

      // Audit recorded for duplicate attempt
      expect(recordedAudits.length).toBe(1);
      expect(recordedAudits[0].procedure).toBe('BETA_INVITE_DUPLICATE_ATTEMPT');
      expect(recordedAudits[0].result).toBe('ALREADY_PENDING');
    });

    it('returns existing consumed invitation with indication "ya utilizada" without creating records', async () => {
      const runner = new MockTransactionRunner();
      const existingId = randomUUID();
      const now = new Date();

      runner.mockRows = [
        {
          id: existingId,
          email: 'used@eventlens.internal',
          email_normalized: 'used@eventlens.internal',
          token_digest: 'used-token-hash',
          status: 'CONSUMED',
          issued_by: adminActor.principalId,
          created_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
          expires_at: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
          consumed_at: now,
          revoked_at: null,
          revision: 2n
        }
      ];

      const recordedAudits: AuditEventRecord[] = [];
      const service = new BetaInvitationService(runner, {
        auditSink: {
          record: async (e) => {
            recordedAudits.push(e);
          }
        }
      });

      const result = await service.issueInvitation({
        actorContext: adminActor,
        email: 'used@eventlens.internal'
      });

      expect(result.outcome).toBe('ALREADY_CONSUMED');
      expect(result.message).toBe('ya utilizada');
      expect(result.invitation.id).toBe(existingId);
      expect(result.invitation.status).toBe('CONSUMED');

      // No new invitation INSERT
      const insertQuery = runner.executedQueries.find((q) => q.sql.includes('INSERT INTO beta_invitation'));
      expect(insertQuery).toBeUndefined();

      // Audit recorded for duplicate attempt on consumed invitation
      expect(recordedAudits.length).toBe(1);
      expect(recordedAudits[0].procedure).toBe('BETA_INVITE_DUPLICATE_ATTEMPT');
      expect(recordedAudits[0].result).toBe('ALREADY_CONSUMED');
    });
  });

  describe('Criterio de Aceptación: Escenario 3 (Renovación de invitación vencida)', () => {
    it('issues a new invitation with own 7-day TTL when previous pending is expired without reusing old token', async () => {
      const runner = new MockTransactionRunner();
      const expiredId = randomUUID();
      const now = new Date();
      const pastExpiry = new Date(now.getTime() - 1000); // Expired 1 second ago

      runner.mockRows = [
        {
          id: expiredId,
          email: 'expired@eventlens.internal',
          email_normalized: 'expired@eventlens.internal',
          token_digest: 'old-expired-token-hash',
          status: 'PENDING',
          issued_by: adminActor.principalId,
          created_at: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
          expires_at: pastExpiry,
          consumed_at: null,
          revoked_at: null,
          revision: 1n
        }
      ];

      const recordedAudits: AuditEventRecord[] = [];
      const service = new BetaInvitationService(runner, {
        auditSink: {
          record: async (e) => {
            recordedAudits.push(e);
          }
        }
      });

      const before = Date.now();
      const result = await service.issueInvitation({
        actorContext: adminActor,
        email: 'expired@eventlens.internal'
      });
      const after = Date.now();

      expect(result.outcome).toBe('RENEWED_EXPIRED');
      expect(result.invitation.id).not.toBe(expiredId); // New ID
      expect(result.invitation.status).toBe('PENDING');
      expect(result.invitation.token).toHaveLength(64);

      // Verify expiration is fresh 7 days from now
      const expectedTtlMs = 7 * 24 * 60 * 60 * 1000;
      expect(result.invitation.expiresAt.getTime()).toBeGreaterThanOrEqual(before + expectedTtlMs);
      expect(result.invitation.expiresAt.getTime()).toBeLessThanOrEqual(after + expectedTtlMs);

      // Previous expired invitation was marked EXPIRED
      const updateQuery = runner.executedQueries.find((q) => q.sql.includes("UPDATE beta_invitation SET status = 'EXPIRED'"));
      expect(updateQuery).toBeDefined();

      // New invitation inserted
      const insertQuery = runner.executedQueries.find((q) => q.sql.includes('INSERT INTO beta_invitation'));
      expect(insertQuery).toBeDefined();

      // Audit recorded for renewal
      expect(recordedAudits.length).toBe(1);
      expect(recordedAudits[0].procedure).toBe('BETA_INVITE_RENEW');
      expect(recordedAudits[0].result).toBe('SUCCESS');
    });
  });

  describe('EL-TK-006: Revocar una invitación BETA no usada', () => {
    it('rejects revocation when actor context is missing or not ADMIN_HUMAN', async () => {
      const runner = new MockTransactionRunner();
      const service = new BetaInvitationService(runner);

      await expect(
        service.revokeInvitation({
          actorContext: null as any,
          invitationId: randomUUID()
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

      await expect(
        service.revokeInvitation({
          actorContext: { ...adminActor, actorType: 'SYSTEM' as any },
          invitationId: randomUUID()
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('rejects with INVITATION_NOT_FOUND when invitation does not exist', async () => {
      const runner = new MockTransactionRunner();
      runner.mockRows = [];
      const service = new BetaInvitationService(runner);

      await expect(
        service.revokeInvitation({
          actorContext: adminActor,
          invitationId: randomUUID()
        })
      ).rejects.toMatchObject({ code: 'INVITATION_NOT_FOUND' });
    });

    it('Scenario 1: revokes a PENDING invitation, advances revision and records audit', async () => {
      const runner = new MockTransactionRunner();
      const inviteId = randomUUID();
      const recordedAudits: AuditEventRecord[] = [];
      const service = new BetaInvitationService(runner, {
        auditSink: { record: async (e) => { recordedAudits.push(e); } }
      });

      runner.mockRows = [
        {
          id: inviteId,
          email: 'pending@eventlens.internal',
          email_normalized: 'pending@eventlens.internal',
          token_digest: 'token-digest',
          status: 'PENDING',
          issued_by: adminActor.principalId,
          created_at: new Date(),
          expires_at: new Date(Date.now() + 500000),
          consumed_at: null,
          revoked_at: null,
          revision: 1n
        }
      ];

      const result = await service.revokeInvitation({
        actorContext: adminActor,
        invitationId: inviteId,
        reason: 'Requested by test'
      });

      expect(result.outcome).toBe('REVOKED');
      expect(result.invitation.status).toBe('REVOKED');
      expect(result.invitation.revokedAt).toBeDefined();
      expect(result.invitation.revision).toBe(2n);

      const updateQuery = runner.executedQueries.find((q) =>
        q.sql.includes("UPDATE beta_invitation") && q.sql.includes("status = 'REVOKED'")
      );
      expect(updateQuery).toBeDefined();

      expect(recordedAudits.length).toBe(1);
      expect(recordedAudits[0].procedure).toBe('BETA_INVITE_REVOKE');
      expect(recordedAudits[0].result).toBe('SUCCESS');
    });

    it('Scenario 2: does NOT modify invitation or account when invitation was already CONSUMED', async () => {
      const runner = new MockTransactionRunner();
      const inviteId = randomUUID();
      const recordedAudits: AuditEventRecord[] = [];
      const service = new BetaInvitationService(runner, {
        auditSink: { record: async (e) => { recordedAudits.push(e); } }
      });

      runner.mockRows = [
        {
          id: inviteId,
          email: 'active-organizer@eventlens.internal',
          email_normalized: 'active-organizer@eventlens.internal',
          token_digest: 'token-digest',
          status: 'CONSUMED',
          issued_by: adminActor.principalId,
          created_at: new Date(),
          expires_at: new Date(),
          consumed_at: new Date(),
          revoked_at: null,
          revision: 2n
        }
      ];

      const result = await service.revokeInvitation({
        actorContext: adminActor,
        invitationId: inviteId
      });

      expect(result.outcome).toBe('CANNOT_REVOKE_CONSUMED');
      expect(result.invitation.status).toBe('CONSUMED');
      expect(result.invitation.revision).toBe(2n);

      // Verify no UPDATE query was executed
      const updateQuery = runner.executedQueries.find((q) =>
        q.sql.includes("UPDATE beta_invitation")
      );
      expect(updateQuery).toBeUndefined();

      expect(recordedAudits.length).toBe(1);
      expect(recordedAudits[0].procedure).toBe('BETA_INVITE_REVOKE');
      expect(recordedAudits[0].result).toBe('CANNOT_REVOKE_CONSUMED');
    });

    it('is idempotent when invitation is already REVOKED', async () => {
      const runner = new MockTransactionRunner();
      const inviteId = randomUUID();
      const service = new BetaInvitationService(runner);

      const alreadyRevokedAt = new Date();
      runner.mockRows = [
        {
          id: inviteId,
          email: 'revoked@eventlens.internal',
          email_normalized: 'revoked@eventlens.internal',
          token_digest: 'token-digest',
          status: 'REVOKED',
          issued_by: adminActor.principalId,
          created_at: new Date(),
          expires_at: new Date(),
          consumed_at: null,
          revoked_at: alreadyRevokedAt,
          revision: 3n
        }
      ];

      const result = await service.revokeInvitation({
        actorContext: adminActor,
        invitationId: inviteId
      });

      expect(result.outcome).toBe('ALREADY_REVOKED');
      expect(result.invitation.status).toBe('REVOKED');
      expect(result.invitation.revision).toBe(3n);

      const updateQuery = runner.executedQueries.find((q) =>
        q.sql.includes("UPDATE beta_invitation")
      );
      expect(updateQuery).toBeUndefined();
    });
  });

  describe('EL-TK-007: Consultar invitaciones BETA', () => {
    it('rejects listing when actor context is missing or unauthorized', async () => {
      const runner = new MockTransactionRunner();
      const service = new BetaInvitationService(runner);

      await expect(
        service.listInvitations({
          actorContext: null as any
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

      await expect(
        service.getInvitation({
          actorContext: { ...adminActor, actorType: 'SYSTEM' as any },
          invitationId: randomUUID()
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('Scenario 1: lists invitations with administrative details without exposing tokens', async () => {
      const runner = new MockTransactionRunner();
      const recordedAudits: AuditEventRecord[] = [];
      const service = new BetaInvitationService(runner, {
        auditSink: { record: async (e) => { recordedAudits.push(e); } }
      });

      const invite1 = {
        id: randomUUID(),
        email: 'organizer1@eventlens.internal',
        email_normalized: 'organizer1@eventlens.internal',
        token_digest: 'secret-hash-1',
        status: 'PENDING',
        issued_by: adminActor.principalId,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 600000),
        consumed_at: null,
        revoked_at: null,
        revision: 1n
      };

      // Mock returns count first, then rows
      let callCount = 0;
      runner.run = async (fn) => {
        const tx: SqlTransaction = {
          query: async <R extends object>(sql: string): Promise<R[]> => {
            if (sql.includes('COUNT(*)')) {
              return [{ total: 1 }] as any;
            }
            return [invite1] as any;
          },
          execute: async () => 1
        };
        return fn(tx);
      };

      const result = await service.listInvitations({
        actorContext: adminActor,
        status: 'PENDING'
      });

      expect(result.total).toBe(1);
      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe(invite1.id);
      expect(result.items[0].email).toBe(invite1.email);
      expect(result.items[0].status).toBe('PENDING');

      // Crucial: token plaintext and digests are strictly absent from summary records
      expect((result.items[0] as any).token).toBeUndefined();
      expect((result.items[0] as any).token_digest).toBeUndefined();
      expect((result.items[0] as any).tokenDigest).toBeUndefined();
    });

    it('Scenario 2: returns empty list when no invitations exist without error', async () => {
      const runner = new MockTransactionRunner();
      runner.run = async (fn) => {
        const tx: SqlTransaction = {
          query: async <R extends object>(sql: string): Promise<R[]> => {
            if (sql.includes('COUNT(*)')) {
              return [{ total: 0 }] as any;
            }
            return [] as any;
          },
          execute: async () => 1
        };
        return fn(tx);
      };

      const service = new BetaInvitationService(runner);
      const result = await service.listInvitations({
        actorContext: adminActor,
        status: 'ALL'
      });

      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
    });

    it('gets a single invitation detail or null if nonexistent', async () => {
      const runner = new MockTransactionRunner();
      const service = new BetaInvitationService(runner);
      const inviteId = randomUUID();

      runner.mockRows = [
        {
          id: inviteId,
          email: 'single@eventlens.internal',
          email_normalized: 'single@eventlens.internal',
          token_digest: 'secret-hash',
          status: 'PENDING',
          issued_by: adminActor.principalId,
          created_at: new Date(),
          expires_at: new Date(),
          consumed_at: null,
          revoked_at: null,
          revision: 1n
        }
      ];

      const found = await service.getInvitation({
        actorContext: adminActor,
        invitationId: inviteId
      });
      expect(found.invitation).not.toBeNull();
      expect(found.invitation?.id).toBe(inviteId);

      runner.mockRows = [];
      const notFound = await service.getInvitation({
        actorContext: adminActor,
        invitationId: randomUUID()
      });
      expect(notFound.invitation).toBeNull();
    });
  });
});

