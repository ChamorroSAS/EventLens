import { describe, it, expect, beforeEach } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  PasswordResetService,
  PasswordResetError,
  PasswordVerifier,
  computeCredentialDigest,
  type AuditEventRecord,
  type AuditSink,
  type PasswordResetNotificationPort,
  type RecoveryAuthorityPort
} from '../src/index.js';

interface AccountRecord {
  id: string;
  email: string;
  email_normalized: string;
  status: string;
}

interface CredentialRecord {
  id: string;
  account_id: string;
  purpose: string;
  secret_digest: string;
  revision: bigint;
  status: string;
}

interface ResetIntentRecord {
  id: string;
  account_id: string;
  email_normalized: string;
  token_digest: string;
  status: string;
  created_at: Date;
  expires_at: Date;
  consumed_at?: Date | null;
}

interface SessionRecord {
  id: string;
  account_id: string;
  token_digest: string;
  revoked_at?: Date | null;
  revocation_reason?: string | null;
}

interface MockDb {
  accounts: Map<string, AccountRecord>;
  credentials: Map<string, CredentialRecord>;
  resetIntents: Map<string, ResetIntentRecord>;
  sessions: Map<string, SessionRecord>;
  auditEvents: AuditEventRecord[];
  notificationsSent: Array<{ email: string; token: string; expiresAt: Date }>;
}

function createMockRunner(db: MockDb): TransactionRunner {
  return {
    async run<T>(work: (tx: SqlTransaction) => Promise<T>): Promise<T> {
      const tx: SqlTransaction = {
        async query<R extends object>(sql: string, ...params: unknown[]): Promise<R[]> {
          if (sql.includes('FROM organizer_account') && sql.includes('WHERE email_normalized = $1')) {
            const emailNorm = params[0] as string;
            const found = [...db.accounts.values()].find((a) => a.email_normalized === emailNorm);
            return found ? ([found] as unknown as R[]) : [];
          }

          if (sql.includes('FROM organizer_account') && sql.includes('WHERE id = $1')) {
            const id = params[0] as string;
            const found = db.accounts.get(id);
            return found ? ([found] as unknown as R[]) : [];
          }

          if (sql.includes('FROM password_reset_intent') && sql.includes('WHERE token_digest = $1')) {
            const digest = params[0] as string;
            const found = [...db.resetIntents.values()].find((i) => i.token_digest === digest);
            return found ? ([found] as unknown as R[]) : [];
          }

          if (sql.includes('FROM organizer_credential') && sql.includes('WHERE account_id = $1')) {
            const accountId = params[0] as string;
            const found = [...db.credentials.values()].find((c) => c.account_id === accountId && c.status === 'ACTIVE');
            return found ? ([found] as unknown as R[]) : [];
          }

          return [];
        },

        async execute(sql: string, ...params: unknown[]): Promise<number> {
          if (sql.includes('UPDATE password_reset_intent') && sql.includes('SET status = \'SUPERSEDED\'')) {
            const accountId = params[0] as string;
            let count = 0;
            for (const intent of db.resetIntents.values()) {
              if (intent.account_id === accountId && intent.status === 'PENDING') {
                intent.status = 'SUPERSEDED';
                count++;
              }
            }
            return count;
          }

          if (sql.includes('INSERT INTO password_reset_intent')) {
            const [id, accountId, emailNorm, tokenDigest, , createdAt, expiresAt] = params as [
              string, string, string, string, string, Date, Date
            ];
            db.resetIntents.set(id, {
              id,
              account_id: accountId,
              email_normalized: emailNorm,
              token_digest: tokenDigest,
              status: 'PENDING',
              created_at: createdAt,
              expires_at: expiresAt,
              consumed_at: null
            });
            return 1;
          }

          if (sql.includes('UPDATE organizer_credential')) {
            const [newDigest, newRevision, updatedAt, id] = params as [string, string, Date, string];
            const cred = db.credentials.get(id);
            if (cred) {
              cred.secret_digest = newDigest;
              cred.revision = BigInt(newRevision);
            }
            return 1;
          }

          if (sql.includes('INSERT INTO organizer_credential')) {
            const [id, accountId, purpose, digest, revision, status, createdAt] = params as [
              string, string, string, string, string, string, Date
            ];
            db.credentials.set(id, {
              id,
              account_id: accountId,
              purpose,
              secret_digest: digest,
              revision: BigInt(revision),
              status
            });
            return 1;
          }

          if (sql.includes('UPDATE organizer_session') && sql.includes('PASSWORD_RESET')) {
            const [now, accountId] = params as [Date, string];
            let revoked = 0;
            for (const sess of db.sessions.values()) {
              if (sess.account_id === accountId && !sess.revoked_at) {
                sess.revoked_at = now;
                sess.revocation_reason = 'PASSWORD_RESET';
                revoked++;
              }
            }
            return revoked;
          }

          if (sql.includes('UPDATE password_reset_intent') && sql.includes('SET status = \'CONSUMED\'')) {
            const [consumedAt, id] = params as [Date, string];
            const intent = db.resetIntents.get(id);
            if (intent) {
              intent.status = 'CONSUMED';
              intent.consumed_at = consumedAt;
            }
            return 1;
          }

          return 0;
        }
      };
      return work(tx);
    }
  };
}

describe('PasswordResetService (EL-TK-018 & EL-TK-019)', () => {
  let db: MockDb;
  let auditSink: AuditSink;
  let notificationPort: PasswordResetNotificationPort;
  let recoveryAuthority: RecoveryAuthorityPort;
  let service: PasswordResetService;

  beforeEach(() => {
    db = {
      accounts: new Map(),
      credentials: new Map(),
      resetIntents: new Map(),
      sessions: new Map(),
      auditEvents: [],
      notificationsSent: []
    };

    auditSink = {
      async record(event: AuditEventRecord): Promise<void> {
        db.auditEvents.push(event);
      }
    };

    notificationPort = {
      async sendPasswordResetEmail(recipient): Promise<void> {
        db.notificationsSent.push(recipient);
      }
    };

    recoveryAuthority = {
      async getRecoveryEpoch(): Promise<bigint> {
        return 1n;
      },
      async getCredentialRevision(): Promise<bigint | null> {
        return 1n;
      },
      async getAdminAuthWatermark(): Promise<bigint> {
        return 1n;
      },
      async prepare(): Promise<{ preparedReceipt: string; sequence: bigint; operationId: string; subjectRef: string }> {
        return { preparedReceipt: 'receipt-1', sequence: 1n, operationId: 'op-1', subjectRef: 'sub-1' };
      },
      async ackCommit(): Promise<void> {}
    };

    service = new PasswordResetService(createMockRunner(db), {
      auditSink,
      notificationPort,
      recoveryAuthority,
      tokenTtlMs: 3600 * 1000,
      maxRequestsPerWindow: 5,
      rateLimitWindowMs: 15 * 60 * 1000
    });
  });

  describe('EL-TK-018: requestPasswordReset', () => {
    it('emits reset token and sends email for active verified organizer account', async () => {
      const accountId = randomUUID();
      db.accounts.set(accountId, {
        id: accountId,
        email: 'organizer@eventlens.local',
        email_normalized: 'organizer@eventlens.local',
        status: 'ACTIVE'
      });

      const result = await service.requestPasswordReset({
        email: 'organizer@eventlens.local'
      });

      expect(result.outcome).toBe('RESET_REQUEST_RECEIVED');
      expect(result.message).toContain('password reset instructions have been sent');

      // Intent was persisted
      expect(db.resetIntents.size).toBe(1);
      const intent = [...db.resetIntents.values()][0];
      expect(intent.account_id).toBe(accountId);
      expect(intent.status).toBe('PENDING');

      // Notification was dispatched
      expect(db.notificationsSent.length).toBe(1);
      expect(db.notificationsSent[0].email).toBe('organizer@eventlens.local');
      expect(db.notificationsSent[0].token).toBeDefined();

      // Verify token digest matches
      const tokenHash = createHash('sha256').update(db.notificationsSent[0].token).digest('hex');
      expect(intent.token_digest).toBe(tokenHash);

      // Audit was recorded without token secrets
      const audit = db.auditEvents.find((e) => e.procedure === 'ORGANIZER_PASSWORD_RESET_REQUESTED');
      expect(audit).toBeDefined();
      expect(audit?.actorId).toBe(accountId);
      expect(JSON.stringify(audit)).not.toContain(db.notificationsSent[0].token);
    });

    it('supersedes previously pending reset intents for the same account', async () => {
      const accountId = randomUUID();
      db.accounts.set(accountId, {
        id: accountId,
        email: 'organizer@eventlens.local',
        email_normalized: 'organizer@eventlens.local',
        status: 'ACTIVE'
      });

      // First request
      await service.requestPasswordReset({ email: 'organizer@eventlens.local' });
      expect(db.resetIntents.size).toBe(1);
      const firstIntentId = [...db.resetIntents.values()][0].id;

      // Second request
      await service.requestPasswordReset({ email: 'organizer@eventlens.local' });
      expect(db.resetIntents.size).toBe(2);

      const firstIntent = db.resetIntents.get(firstIntentId);
      expect(firstIntent?.status).toBe('SUPERSEDED');

      const secondIntent = [...db.resetIntents.values()].find((i) => i.id !== firstIntentId);
      expect(secondIntent?.status).toBe('PENDING');
    });

    it('returns equivalent neutral outcome for non-existent account without sending email', async () => {
      const result = await service.requestPasswordReset({
        email: 'nobody@example.com'
      });

      expect(result.outcome).toBe('RESET_REQUEST_RECEIVED');
      expect(db.resetIntents.size).toBe(0);
      expect(db.notificationsSent.length).toBe(0);

      const audit = db.auditEvents.find((e) => e.procedure === 'ORGANIZER_PASSWORD_RESET_REQUESTED');
      expect(audit).toBeDefined();
      expect(audit?.actorId).toBe('ANONYMOUS');
    });

    it('returns equivalent neutral outcome for inactive account without sending email', async () => {
      const accountId = randomUUID();
      db.accounts.set(accountId, {
        id: accountId,
        email: 'pending@eventlens.local',
        email_normalized: 'pending@eventlens.local',
        status: 'PENDING_VERIFICATION'
      });

      const result = await service.requestPasswordReset({
        email: 'pending@eventlens.local'
      });

      expect(result.outcome).toBe('RESET_REQUEST_RECEIVED');
      expect(db.resetIntents.size).toBe(0);
      expect(db.notificationsSent.length).toBe(0);
    });

    it('rejects invalid email formats', async () => {
      await expect(
        service.requestPasswordReset({ email: 'not-an-email' })
      ).rejects.toMatchObject({
        code: 'INVALID_EMAIL'
      });
    });

    it('enforces rate limiting without disclosing account existence', async () => {
      for (let i = 0; i < 5; i++) {
        await service.requestPasswordReset({ email: 'user@example.com', clientIp: '192.168.1.1' });
      }

      await expect(
        service.requestPasswordReset({ email: 'user@example.com', clientIp: '192.168.1.1' })
      ).rejects.toMatchObject({
        code: 'RATE_LIMITED'
      });
    });
  });

  describe('EL-TK-019: completePasswordReset', () => {
    it('completes password recovery, updates credential revision, and revokes active sessions', async () => {
      const accountId = randomUUID();
      db.accounts.set(accountId, {
        id: accountId,
        email: 'organizer@eventlens.local',
        email_normalized: 'organizer@eventlens.local',
        status: 'ACTIVE'
      });

      // Existing credential
      const credId = randomUUID();
      db.credentials.set(credId, {
        id: credId,
        account_id: accountId,
        purpose: 'ORGANIZER_AUTHENTICATION',
        secret_digest: computeCredentialDigest('ORGANIZER_AUTHENTICATION', accountId, 'oldPassword123'),
        revision: 1n,
        status: 'ACTIVE'
      });

      // Existing active sessions
      const sess1 = randomUUID();
      const sess2 = randomUUID();
      db.sessions.set(sess1, { id: sess1, account_id: accountId, token_digest: 'digest-1', revoked_at: null });
      db.sessions.set(sess2, { id: sess2, account_id: accountId, token_digest: 'digest-2', revoked_at: null });

      // Request reset
      await service.requestPasswordReset({ email: 'organizer@eventlens.local' });
      const rawToken = db.notificationsSent[0].token;

      // Complete reset with strong new password
      const completeResult = await service.completePasswordReset({
        resetToken: rawToken,
        newPassword: 'BrandNewSecurePassword2026!'
      });

      expect(completeResult.outcome).toBe('PASSWORD_RESET_COMPLETED');
      expect(completeResult.accountId).toBe(accountId);
      expect(completeResult.revokedSessionsCount).toBe(2);

      // Verify sessions were revoked
      expect(db.sessions.get(sess1)?.revocation_reason).toBe('PASSWORD_RESET');
      expect(db.sessions.get(sess2)?.revocation_reason).toBe('PASSWORD_RESET');

      // Verify credential was updated with new Argon2id envelope and revision 2
      const updatedCred = db.credentials.get(credId);
      expect(updatedCred?.revision).toBe(2n);
      expect(updatedCred?.secret_digest.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
      const verifier = new PasswordVerifier();
      const matches = await verifier.verifyPassword(updatedCred!.secret_digest, 'BrandNewSecurePassword2026!');
      expect(matches).toBe(true);

      // Verify intent is CONSUMED
      const intent = [...db.resetIntents.values()][0];
      expect(intent.status).toBe('CONSUMED');
      expect(intent.consumed_at).toBeDefined();

      // Audit recorded
      const completeAudit = db.auditEvents.find((e) => e.procedure === 'ORGANIZER_PASSWORD_RESET_COMPLETED');
      expect(completeAudit).toBeDefined();
      expect(JSON.stringify(completeAudit)).not.toContain('BrandNewSecurePassword2026!');
    });

    it('succeeds cleanly when the account had zero prior sessions', async () => {
      const accountId = randomUUID();
      db.accounts.set(accountId, {
        id: accountId,
        email: 'organizer@eventlens.local',
        email_normalized: 'organizer@eventlens.local',
        status: 'ACTIVE'
      });

      await service.requestPasswordReset({ email: 'organizer@eventlens.local' });
      const rawToken = db.notificationsSent[0].token;

      const completeResult = await service.completePasswordReset({
        resetToken: rawToken,
        newPassword: 'NewPassword999!'
      });

      expect(completeResult.outcome).toBe('PASSWORD_RESET_COMPLETED');
      expect(completeResult.revokedSessionsCount).toBe(0);
    });

    it('rejects double consumption of the same token', async () => {
      const accountId = randomUUID();
      db.accounts.set(accountId, {
        id: accountId,
        email: 'organizer@eventlens.local',
        email_normalized: 'organizer@eventlens.local',
        status: 'ACTIVE'
      });

      await service.requestPasswordReset({ email: 'organizer@eventlens.local' });
      const rawToken = db.notificationsSent[0].token;

      // First completion succeeds
      await service.completePasswordReset({
        resetToken: rawToken,
        newPassword: 'NewPassword999!'
      });

      // Second completion fails
      await expect(
        service.completePasswordReset({
          resetToken: rawToken,
          newPassword: 'AnotherPassword123!'
        })
      ).rejects.toMatchObject({
        code: 'TOKEN_ALREADY_USED'
      });
    });

    it('rejects superseded token', async () => {
      const accountId = randomUUID();
      db.accounts.set(accountId, {
        id: accountId,
        email: 'organizer@eventlens.local',
        email_normalized: 'organizer@eventlens.local',
        status: 'ACTIVE'
      });

      // Request 1
      await service.requestPasswordReset({ email: 'organizer@eventlens.local' });
      const token1 = db.notificationsSent[0].token;

      // Request 2 (supersedes token 1)
      await service.requestPasswordReset({ email: 'organizer@eventlens.local' });
      const token2 = db.notificationsSent[1].token;

      // Attempting to complete with token 1 fails
      await expect(
        service.completePasswordReset({
          resetToken: token1,
          newPassword: 'NewPassword999!'
        })
      ).rejects.toMatchObject({
        code: 'TOKEN_REVOKED'
      });

      // Completing with token 2 succeeds
      await expect(
        service.completePasswordReset({
          resetToken: token2,
          newPassword: 'NewPassword999!'
        })
      ).resolves.toMatchObject({
        outcome: 'PASSWORD_RESET_COMPLETED'
      });
    });

    it('rejects expired token', async () => {
      const accountId = randomUUID();
      db.accounts.set(accountId, {
        id: accountId,
        email: 'organizer@eventlens.local',
        email_normalized: 'organizer@eventlens.local',
        status: 'ACTIVE'
      });

      const rawToken = randomBytes(32).toString('hex');
      const tokenDigest = createHash('sha256').update(rawToken).digest('hex');

      // Intent expired 10 minutes ago
      db.resetIntents.set(randomUUID(), {
        id: randomUUID(),
        account_id: accountId,
        email_normalized: 'organizer@eventlens.local',
        token_digest: tokenDigest,
        status: 'PENDING',
        created_at: new Date(Date.now() - 70 * 60 * 1000),
        expires_at: new Date(Date.now() - 10 * 60 * 1000),
        consumed_at: null
      });

      await expect(
        service.completePasswordReset({
          resetToken: rawToken,
          newPassword: 'NewPassword999!'
        })
      ).rejects.toMatchObject({
        code: 'TOKEN_EXPIRED'
      });
    });

    it('rejects weak new password (< 8 characters)', async () => {
      const accountId = randomUUID();
      db.accounts.set(accountId, {
        id: accountId,
        email: 'organizer@eventlens.local',
        email_normalized: 'organizer@eventlens.local',
        status: 'ACTIVE'
      });

      await service.requestPasswordReset({ email: 'organizer@eventlens.local' });
      const rawToken = db.notificationsSent[0].token;

      await expect(
        service.completePasswordReset({
          resetToken: rawToken,
          newPassword: 'short'
        })
      ).rejects.toMatchObject({
        code: 'WEAK_PASSWORD'
      });

      // Token remains PENDING
      const intent = [...db.resetIntents.values()][0];
      expect(intent.status).toBe('PENDING');
    });

    it('rejects unknown or malformed token', async () => {
      await expect(
        service.completePasswordReset({
          resetToken: 'completely-non-existent-token',
          newPassword: 'StrongPassword123!'
        })
      ).rejects.toMatchObject({
        code: 'INVALID_OR_UNUSABLE_TOKEN'
      });
    });
  });
});
