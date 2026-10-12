import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  AccountReauthenticationService,
  ReauthenticationError,
  PasswordVerifier,
  type AuditSink,
  type RecoveryAuthorityPort,
  type OrganizerActorContext
} from '../src/index.js';

interface InMemoryDb {
  accounts: Map<string, any>;
  credentials: Map<string, any>;
  challenges: Map<string, any>;
  evidence: Map<string, any>;
  auditEvents: any[];
}

function createInMemoryRunner(db: InMemoryDb): TransactionRunner {
  return {
    async run<T>(callback: (tx: SqlTransaction) => Promise<T>): Promise<T> {
      const tx: SqlTransaction = {
        async execute(sql: string, ...params: unknown[]): Promise<number> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // INSERT INTO account_reauthentication_challenge
          if (normalized.includes('INSERT INTO account_reauthentication_challenge')) {
            const [
              id,
              account_id,
              session_id,
              operation,
              resource_type,
              resource_id,
              expected_revision,
              intention_hash,
              request_id,
              status,
              failed_attempts,
              created_at,
              expires_at
            ] = params;

            db.challenges.set(id as string, {
              id,
              account_id,
              session_id,
              operation,
              resource_type,
              resource_id,
              expected_revision,
              intention_hash,
              request_id,
              status,
              failed_attempts,
              created_at,
              expires_at,
              verified_at: null
            });
            return 1;
          }

          // UPDATE account_reauthentication_challenge SET status = 'VERIFIED'
          if (
            normalized.includes('UPDATE account_reauthentication_challenge') &&
            normalized.includes("status = 'VERIFIED'")
          ) {
            const [verified_at, id] = params as [Date, string];
            const ch = db.challenges.get(id);
            if (ch && ch.status === 'PENDING') {
              ch.status = 'VERIFIED';
              ch.verified_at = verified_at;
              return 1;
            }
            return 0;
          }

          // UPDATE account_reauthentication_challenge SET failed_attempts = $1, status = $2 WHERE id = $3
          if (
            normalized.includes('UPDATE account_reauthentication_challenge') &&
            normalized.includes('failed_attempts = $1')
          ) {
            const [failed_attempts, status, id] = params as [number, string, string];
            const ch = db.challenges.get(id);
            if (ch) {
              ch.failed_attempts = failed_attempts;
              ch.status = status;
              return 1;
            }
            return 0;
          }

          // UPDATE account_reauthentication_challenge SET status = 'EXPIRED' WHERE id = $1
          if (
            normalized.includes('UPDATE account_reauthentication_challenge') &&
            normalized.includes("status = 'EXPIRED'")
          ) {
            const [id] = params as [string];
            const ch = db.challenges.get(id);
            if (ch) {
              ch.status = 'EXPIRED';
              return 1;
            }
            return 0;
          }

          // INSERT INTO account_reauthentication_evidence
          if (normalized.includes('INSERT INTO account_reauthentication_evidence')) {
            const [
              id,
              challenge_id,
              account_id,
              session_id,
              evidence_digest,
              operation,
              resource_type,
              resource_id,
              expected_revision,
              intention_hash,
              request_id,
              status,
              created_at,
              expires_at
            ] = params;

            db.evidence.set(evidence_digest as string, {
              id,
              challenge_id,
              account_id,
              session_id,
              evidence_digest,
              operation,
              resource_type,
              resource_id,
              expected_revision,
              intention_hash,
              request_id,
              status,
              created_at,
              expires_at,
              consumed_at: null,
              consumption_receipt: null
            });
            return 1;
          }

          // UPDATE account_reauthentication_evidence SET status = 'CONSUMED'
          if (
            normalized.includes('UPDATE account_reauthentication_evidence') &&
            normalized.includes("status = 'CONSUMED'")
          ) {
            const [consumed_at, receipt, id] = params as [Date, string, string];
            for (const ev of db.evidence.values()) {
              if (ev.id === id && ev.status === 'ACTIVE') {
                ev.status = 'CONSUMED';
                ev.consumed_at = consumed_at;
                ev.consumption_receipt = receipt;
                return 1;
              }
            }
            return 0;
          }

          // UPDATE account_reauthentication_evidence SET status = 'EXPIRED'
          if (
            normalized.includes('UPDATE account_reauthentication_evidence') &&
            normalized.includes("status = 'EXPIRED'")
          ) {
            const [id] = params as [string];
            for (const ev of db.evidence.values()) {
              if (ev.id === id) {
                ev.status = 'EXPIRED';
                return 1;
              }
            }
            return 0;
          }

          throw new Error(`Unhandled mock SQL execute: ${sql}`);
        },

        async query<R = any>(sql: string, ...params: unknown[]): Promise<R[]> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // SELECT id, status FROM organizer_account WHERE id = $1
          if (normalized.includes('FROM organizer_account') && normalized.includes('WHERE id = $1')) {
            const accountId = params[0] as string;
            const acc = db.accounts.get(accountId);
            return acc ? ([{ id: acc.id, status: acc.status }] as unknown as R[]) : [];
          }

          // SELECT revision FROM organizer_credential WHERE account_id = $1
          if (normalized.includes('FROM organizer_credential') && normalized.includes('account_id = $1')) {
            const accountId = params[0] as string;
            const creds: any[] = [];
            for (const cred of db.credentials.values()) {
              if (cred.account_id === accountId && cred.purpose === 'ORGANIZER_AUTHENTICATION' && cred.status === 'ACTIVE') {
                creds.push({ ...cred });
              }
            }
            creds.sort((a, b) => (b.revision > a.revision ? 1 : -1));
            return creds as unknown as R[];
          }

          // SELECT ... FROM account_reauthentication_challenge WHERE id = $1
          if (normalized.includes('FROM account_reauthentication_challenge') && normalized.includes('WHERE id = $1')) {
            const id = params[0] as string;
            const ch = db.challenges.get(id);
            return ch ? ([{ ...ch }] as unknown as R[]) : [];
          }

          // SELECT ... FROM account_reauthentication_evidence WHERE evidence_digest = $1
          if (normalized.includes('FROM account_reauthentication_evidence') && normalized.includes('WHERE evidence_digest = $1')) {
            const digest = params[0] as string;
            const ev = db.evidence.get(digest);
            return ev ? ([{ ...ev }] as unknown as R[]) : [];
          }

          throw new Error(`Unhandled mock SQL query: ${sql}`);
        }
      };

      return callback(tx);
    }
  };
}

describe('EL-TK-186: AccountReauthenticationService (Unit Tests)', () => {
  let db: InMemoryDb;
  let auditSink: AuditSink;
  let recoveryAuthority: RecoveryAuthorityPort;
  let passwordVerifier: PasswordVerifier;
  let service: AccountReauthenticationService;

  beforeEach(() => {
    db = {
      accounts: new Map(),
      credentials: new Map(),
      challenges: new Map(),
      evidence: new Map(),
      auditEvents: []
    };

    auditSink = {
      record: vi.fn(async (event) => {
        db.auditEvents.push(event);
      })
    };

    recoveryAuthority = {
      getRecoveryEpoch: vi.fn().mockResolvedValue(1n),
      getCredentialRevision: vi.fn().mockResolvedValue(1n),
      getAdminAuthWatermark: vi.fn().mockResolvedValue(1n)
    };

    passwordVerifier = new PasswordVerifier();

    service = new AccountReauthenticationService(
      createInMemoryRunner(db),
      auditSink,
      recoveryAuthority,
      {
        passwordVerifier,
        challengeTtlMs: 5 * 60 * 1000,
        evidenceTtlMs: 5 * 60 * 1000,
        maxEmissionsPerMinute: 5,
        maxFailedVerificationAttempts: 5
      }
    );
  });

  async function seedOrganizerFixture(options: {
    status?: 'ACTIVE' | 'PENDING_DELETION' | 'REVOKED';
    password?: string;
    credRevision?: bigint;
  } = {}) {
    const accountId = randomUUID();
    const sessionId = randomUUID();
    const status = options.status ?? 'ACTIVE';
    const password = options.password ?? 'ValidSecurePassword123!';
    const credRevision = options.credRevision ?? 1n;

    const secretDigest = await passwordVerifier.hashPassword(password);

    db.accounts.set(accountId, {
      id: accountId,
      status
    });

    db.credentials.set(randomUUID(), {
      id: randomUUID(),
      account_id: accountId,
      purpose: 'ORGANIZER_AUTHENTICATION',
      secret_digest: secretDigest,
      revision: credRevision,
      status: 'ACTIVE'
    });

    const actorContext: OrganizerActorContext = {
      actorType: 'ORGANIZER_HUMAN',
      accountId,
      email: 'organizer@eventlens.internal',
      sessionId,
      authTime: new Date(),
      credentialRevision: credRevision,
      sessionWatermark: credRevision,
      recoveryEpoch: 1n
    };

    return {
      accountId,
      sessionId,
      password,
      credRevision,
      actorContext
    };
  }

  describe('Escenario 1: beginChallenge and verifyChallenge emit opaque single-use evidence <= 5 min', () => {
    it('issues challenge and verifies with active password to emit evidence', async () => {
      const fixture = await seedOrganizerFixture();

      const beginRes = await service.beginChallenge({
        actorContext: fixture.actorContext,
        operation: 'REQUEST_ACCOUNT_DELETION',
        resourceType: 'ACCOUNT',
        resourceId: fixture.accountId,
        expectedRevision: fixture.credRevision,
        intentionHash: 'intent-hash-abc-123'
      });

      expect(beginRes.challengeId).toBeDefined();
      expect(beginRes.operation).toBe('REQUEST_ACCOUNT_DELETION');
      expect(beginRes.resourceId).toBe(fixture.accountId);
      expect(beginRes.expiresAt.getTime()).toBeGreaterThan(Date.now());

      // Challenge in db is PENDING
      const chInDb = db.challenges.get(beginRes.challengeId);
      expect(chInDb.status).toBe('PENDING');

      // Verify challenge with correct password
      const verifyRes = await service.verifyChallenge({
        actorContext: fixture.actorContext,
        challengeId: beginRes.challengeId,
        credential: fixture.password
      });

      expect(verifyRes.evidence).toBeDefined();
      expect(typeof verifyRes.evidence).toBe('string');
      expect(verifyRes.expiresAt.getTime()).toBeGreaterThan(Date.now());

      // Challenge is marked VERIFIED
      expect(chInDb.status).toBe('VERIFIED');
      expect(chInDb.verified_at).toBeDefined();

      // Evidence record is stored with digest, never plaintext
      const evidenceDigest = createHash('sha256').update(verifyRes.evidence).digest('hex');
      const evInDb = db.evidence.get(evidenceDigest);
      expect(evInDb).toBeDefined();
      expect(evInDb.status).toBe('ACTIVE');
      expect(evInDb.account_id).toBe(fixture.accountId);
    });

    it('rejects double verification on the same challenge (single-use challenge)', async () => {
      const fixture = await seedOrganizerFixture();

      const beginRes = await service.beginChallenge({
        actorContext: fixture.actorContext,
        operation: 'REQUEST_ACCOUNT_DELETION',
        resourceType: 'ACCOUNT',
        resourceId: fixture.accountId,
        expectedRevision: fixture.credRevision,
        intentionHash: 'intent-hash-abc-123'
      });

      await service.verifyChallenge({
        actorContext: fixture.actorContext,
        challengeId: beginRes.challengeId,
        credential: fixture.password
      });

      // Second verification attempt on the same challenge fails
      await expect(
        service.verifyChallenge({
          actorContext: fixture.actorContext,
          challengeId: beginRes.challengeId,
          credential: fixture.password
        })
      ).rejects.toMatchObject({ code: 'CHALLENGE_ALREADY_VERIFIED' });
    });

    it('rejects invalid password, increments failed attempts, and blocks after 5 failures', async () => {
      const fixture = await seedOrganizerFixture();

      const beginRes = await service.beginChallenge({
        actorContext: fixture.actorContext,
        operation: 'REQUEST_ACCOUNT_DELETION',
        resourceType: 'ACCOUNT',
        resourceId: fixture.accountId,
        expectedRevision: fixture.credRevision,
        intentionHash: 'intent-hash-abc-123'
      });

      // 4 failed attempts
      for (let i = 0; i < 4; i++) {
        await expect(
          service.verifyChallenge({
            actorContext: fixture.actorContext,
            challengeId: beginRes.challengeId,
            credential: 'WrongPassword!'
          })
        ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      }

      // 5th attempt fails and cancels the challenge
      await expect(
        service.verifyChallenge({
          actorContext: fixture.actorContext,
          challengeId: beginRes.challengeId,
          credential: 'WrongPassword!'
        })
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

      // 6th attempt is RATE_LIMITED
      await expect(
        service.verifyChallenge({
          actorContext: fixture.actorContext,
          challengeId: beginRes.challengeId,
          credential: fixture.password
        })
      ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    });
  });

  describe('Escenario 2: assertAndConsumeEvidence, binding enforcement, and replay receipt recovery', () => {
    it('consumes active evidence atomically and rejects double consumption with mismatched payload', async () => {
      const fixture = await seedOrganizerFixture();

      const beginRes = await service.beginChallenge({
        actorContext: fixture.actorContext,
        operation: 'REQUEST_ACCOUNT_DELETION',
        resourceType: 'ACCOUNT',
        resourceId: fixture.accountId,
        expectedRevision: fixture.credRevision,
        intentionHash: 'intent-hash-456'
      });

      const verifyRes = await service.verifyChallenge({
        actorContext: fixture.actorContext,
        challengeId: beginRes.challengeId,
        credential: fixture.password
      });

      // Unit of work consumption
      const runner = createInMemoryRunner(db);
      const consumeRes = await runner.run(async (tx) => {
        return service.assertAndConsumeEvidence(tx, {
          evidence: verifyRes.evidence,
          accountId: fixture.accountId,
          sessionId: fixture.sessionId,
          operation: 'REQUEST_ACCOUNT_DELETION',
          resourceType: 'ACCOUNT',
          resourceId: fixture.accountId,
          expectedRevision: fixture.credRevision,
          intentionHash: 'intent-hash-456',
          idempotencyKey: 'idemp-key-1'
        });
      });

      expect(consumeRes.outcome).toBe('CONSUMED');
      expect(consumeRes.receiptId).toBeDefined();

      // Subsequent call with EXACT same payload returns REPLAY_ACKNOWLEDGED and same receipt
      const replayRes = await runner.run(async (tx) => {
        return service.assertAndConsumeEvidence(tx, {
          evidence: verifyRes.evidence,
          accountId: fixture.accountId,
          sessionId: fixture.sessionId,
          operation: 'REQUEST_ACCOUNT_DELETION',
          resourceType: 'ACCOUNT',
          resourceId: fixture.accountId,
          expectedRevision: fixture.credRevision,
          intentionHash: 'intent-hash-456',
          idempotencyKey: 'idemp-key-1'
        });
      });

      expect(replayRes.outcome).toBe('REPLAY_ACKNOWLEDGED');
      expect(replayRes.receiptId).toBe(consumeRes.receiptId);

      // Attempting to consume with a DIFFERENT operation, resource, or intention gives BINDING_MISMATCH
      await expect(
        runner.run(async (tx) => {
          return service.assertAndConsumeEvidence(tx, {
            evidence: verifyRes.evidence,
            accountId: fixture.accountId,
            sessionId: fixture.sessionId,
            operation: 'CANCEL_ACCOUNT_DELETION', // Mismatch!
            resourceType: 'ACCOUNT',
            resourceId: fixture.accountId,
            expectedRevision: fixture.credRevision,
            intentionHash: 'intent-hash-456'
          });
        })
      ).rejects.toMatchObject({ code: 'BINDING_MISMATCH' });
    });

    it('rejects evidence consumption when credential revision changed since issuance', async () => {
      const fixture = await seedOrganizerFixture();

      const beginRes = await service.beginChallenge({
        actorContext: fixture.actorContext,
        operation: 'REQUEST_ACCOUNT_DELETION',
        resourceType: 'ACCOUNT',
        resourceId: fixture.accountId,
        expectedRevision: fixture.credRevision,
        intentionHash: 'intent-hash-789'
      });

      const verifyRes = await service.verifyChallenge({
        actorContext: fixture.actorContext,
        challengeId: beginRes.challengeId,
        credential: fixture.password
      });

      // Advance credential revision (e.g. password rotated in between)
      for (const cred of db.credentials.values()) {
        if (cred.account_id === fixture.accountId) {
          cred.revision = 2n;
        }
      }

      const runner = createInMemoryRunner(db);
      await expect(
        runner.run(async (tx) => {
          return service.assertAndConsumeEvidence(tx, {
            evidence: verifyRes.evidence,
            accountId: fixture.accountId,
            sessionId: fixture.sessionId,
            operation: 'REQUEST_ACCOUNT_DELETION',
            resourceType: 'ACCOUNT',
            resourceId: fixture.accountId,
            expectedRevision: fixture.credRevision, // old 1n
            intentionHash: 'intent-hash-789'
          });
        })
      ).rejects.toMatchObject({ code: 'CONCURRENCY_CONFLICT' });
    });
  });

  describe('Escenario 3: Restricted context enforcement during PENDING_DELETION', () => {
    it('allows CANCEL_ACCOUNT_DELETION when account status is PENDING_DELETION', async () => {
      const fixture = await seedOrganizerFixture({ status: 'PENDING_DELETION' });
      const deletionRequestId = randomUUID();

      const beginRes = await service.beginChallenge({
        actorContext: fixture.actorContext,
        operation: 'CANCEL_ACCOUNT_DELETION',
        resourceType: 'ACCOUNT',
        resourceId: fixture.accountId,
        expectedRevision: fixture.credRevision,
        intentionHash: 'cancel-intent-hash',
        requestId: deletionRequestId
      });

      expect(beginRes.challengeId).toBeDefined();

      const verifyRes = await service.verifyChallenge({
        actorContext: fixture.actorContext,
        challengeId: beginRes.challengeId,
        credential: fixture.password
      });

      expect(verifyRes.evidence).toBeDefined();

      const runner = createInMemoryRunner(db);
      const consumeRes = await runner.run(async (tx) => {
        return service.assertAndConsumeEvidence(tx, {
          evidence: verifyRes.evidence,
          accountId: fixture.accountId,
          sessionId: fixture.sessionId,
          operation: 'CANCEL_ACCOUNT_DELETION',
          resourceType: 'ACCOUNT',
          resourceId: fixture.accountId,
          expectedRevision: fixture.credRevision,
          intentionHash: 'cancel-intent-hash',
          requestId: deletionRequestId
        });
      });

      expect(consumeRes.outcome).toBe('CONSUMED');
    });

    it('rejects REQUEST_ACCOUNT_DELETION when account is already PENDING_DELETION', async () => {
      const fixture = await seedOrganizerFixture({ status: 'PENDING_DELETION' });

      await expect(
        service.beginChallenge({
          actorContext: fixture.actorContext,
          operation: 'REQUEST_ACCOUNT_DELETION',
          resourceType: 'ACCOUNT',
          resourceId: fixture.accountId,
          expectedRevision: fixture.credRevision,
          intentionHash: 'some-hash'
        })
      ).rejects.toMatchObject({ code: 'RESTRICTED_CONTEXT_VIOLATION' });
    });

    it('rejects CANCEL_ACCOUNT_DELETION when account is ACTIVE', async () => {
      const fixture = await seedOrganizerFixture({ status: 'ACTIVE' });

      await expect(
        service.beginChallenge({
          actorContext: fixture.actorContext,
          operation: 'CANCEL_ACCOUNT_DELETION',
          resourceType: 'ACCOUNT',
          resourceId: fixture.accountId,
          expectedRevision: fixture.credRevision,
          intentionHash: 'some-hash',
          requestId: randomUUID()
        })
      ).rejects.toMatchObject({ code: 'RESTRICTED_CONTEXT_VIOLATION' });
    });
  });

  describe('Rate Limiting on Challenge Emissions', () => {
    it('enforces maximum 5 challenge emissions per minute per session', async () => {
      const fixture = await seedOrganizerFixture();

      for (let i = 0; i < 5; i++) {
        await service.beginChallenge({
          actorContext: fixture.actorContext,
          operation: 'REQUEST_ACCOUNT_DELETION',
          resourceType: 'ACCOUNT',
          resourceId: fixture.accountId,
          expectedRevision: fixture.credRevision,
          intentionHash: `intent-${i}`
        });
      }

      // 6th emission in the same minute is rejected
      await expect(
        service.beginChallenge({
          actorContext: fixture.actorContext,
          operation: 'REQUEST_ACCOUNT_DELETION',
          resourceType: 'ACCOUNT',
          resourceId: fixture.accountId,
          expectedRevision: fixture.credRevision,
          intentionHash: 'intent-6'
        })
      ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    });
  });
});
