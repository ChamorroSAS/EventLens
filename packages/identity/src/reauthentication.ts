import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  ReauthenticationError,
  type AccountReauthenticationPort,
  type BeginReauthenticationCommand,
  type BeginReauthenticationResult,
  type VerifyReauthenticationCommand,
  type VerifyReauthenticationResult,
  type ConsumeReauthenticationEvidenceCommand,
  type ConsumeReauthenticationEvidenceResult,
  type AuditSink,
  type RecoveryAuthorityPort
} from './contracts.js';
import { PasswordVerifier } from './password-verifier.js';

interface ChallengeRow {
  id: string;
  account_id: string;
  session_id: string;
  operation: string;
  resource_type: string;
  resource_id: string;
  expected_revision: bigint | number | string;
  intention_hash: string;
  request_id?: string | null;
  status: string;
  failed_attempts: number;
  created_at: Date | string;
  expires_at: Date | string;
  verified_at?: Date | string | null;
}

interface EvidenceRow {
  id: string;
  challenge_id: string;
  account_id: string;
  session_id: string;
  evidence_digest: string;
  operation: string;
  resource_type: string;
  resource_id: string;
  expected_revision: bigint | number | string;
  intention_hash: string;
  request_id?: string | null;
  status: string;
  created_at: Date | string;
  expires_at: Date | string;
  consumed_at?: Date | string | null;
  consumption_receipt?: string | null;
}

export interface ReauthenticationServiceOptions {
  readonly passwordVerifier?: PasswordVerifier;
  readonly challengeTtlMs?: number;
  readonly evidenceTtlMs?: number;
  readonly maxEmissionsPerMinute?: number;
  readonly maxFailedVerificationAttempts?: number;
}

/**
 * Service implementing MOD-001 Account Reauthentication (EL-TK-186, DEC-107, ARCH-017).
 * Provides single-use challenges and evidence bound to session, operation, resource, revision, and intention.
 */
export class AccountReauthenticationService implements AccountReauthenticationPort {
  private readonly passwordVerifier: PasswordVerifier;
  private readonly challengeTtlMs: number;
  private readonly evidenceTtlMs: number;
  private readonly maxEmissionsPerMinute: number;
  private readonly maxFailedVerificationAttempts: number;

  // Rate-limiting trackers
  private readonly emissionTracker = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly runner: TransactionRunner,
    private readonly auditSink: AuditSink,
    private readonly recoveryAuthority: RecoveryAuthorityPort,
    options: ReauthenticationServiceOptions = {}
  ) {
    this.passwordVerifier = options.passwordVerifier ?? new PasswordVerifier();
    this.challengeTtlMs = options.challengeTtlMs ?? 5 * 60 * 1000; // 5 min
    this.evidenceTtlMs = options.evidenceTtlMs ?? 5 * 60 * 1000; // 5 min
    this.maxEmissionsPerMinute = options.maxEmissionsPerMinute ?? 5;
    this.maxFailedVerificationAttempts = options.maxFailedVerificationAttempts ?? 5;
  }

  public resetRateLimitTrackers(): void {
    this.emissionTracker.clear();
  }

  private checkEmissionRateLimit(sessionId: string): void {
    const now = Date.now();
    const entry = this.emissionTracker.get(sessionId);

    if (!entry || now - entry.windowStart > 60_000) {
      this.emissionTracker.set(sessionId, { count: 1, windowStart: now });
      return;
    }

    if (entry.count >= this.maxEmissionsPerMinute) {
      throw new ReauthenticationError(
        'RATE_LIMITED',
        'Exceeded maximum reauthentication challenge emissions per minute'
      );
    }

    entry.count++;
  }

  /**
   * Begins a new reauthentication challenge bound to the actor's session, operation, and intended resource.
   */
  async beginChallenge(command: BeginReauthenticationCommand): Promise<BeginReauthenticationResult> {
    if (!command || !command.actorContext) {
      throw new ReauthenticationError('INVALID_ARGUMENT', 'Actor context is required');
    }

    const { actorContext, operation, resourceType, resourceId, expectedRevision, intentionHash, requestId } = command;

    if (actorContext.actorType !== 'ORGANIZER_HUMAN') {
      throw new ReauthenticationError('UNAUTHENTICATED', 'Organizer human actor context required');
    }

    if (operation !== 'REQUEST_ACCOUNT_DELETION' && operation !== 'CANCEL_ACCOUNT_DELETION') {
      throw new ReauthenticationError('INVALID_ARGUMENT', `Unsupported operation '${operation}'`);
    }

    if (resourceType !== 'ACCOUNT') {
      throw new ReauthenticationError('INVALID_ARGUMENT', `Unsupported resource type '${resourceType}'`);
    }

    if (!resourceId || resourceId !== actorContext.accountId) {
      throw new ReauthenticationError('FORBIDDEN', 'Resource ID must match authenticated organizer account ID');
    }

    if (!intentionHash || typeof intentionHash !== 'string' || !intentionHash.trim()) {
      throw new ReauthenticationError('INVALID_ARGUMENT', 'Intention hash is required');
    }

    if (operation === 'CANCEL_ACCOUNT_DELETION' && (!requestId || typeof requestId !== 'string')) {
      throw new ReauthenticationError('INVALID_ARGUMENT', 'Request ID is required to cancel account deletion');
    }

    this.checkEmissionRateLimit(actorContext.sessionId);

    return this.runner.run(async (tx: SqlTransaction) => {
      const now = new Date();

      // 1. Validate account status and restricted deletion context
      const accountRows = await tx.query<{ id: string; status: string }>(
        `SELECT id, status FROM organizer_account WHERE id = $1`,
        actorContext.accountId
      );

      if (!accountRows.length) {
        throw new ReauthenticationError('UNAUTHENTICATED', 'Organizer account not found');
      }

      const account = accountRows[0];

      if (operation === 'CANCEL_ACCOUNT_DELETION') {
        if (account.status !== 'PENDING_DELETION') {
          throw new ReauthenticationError(
            'RESTRICTED_CONTEXT_VIOLATION',
            'Account is not pending deletion; cannot begin cancellation challenge'
          );
        }
      } else if (operation === 'REQUEST_ACCOUNT_DELETION') {
        if (account.status === 'PENDING_DELETION') {
          throw new ReauthenticationError(
            'RESTRICTED_CONTEXT_VIOLATION',
            'Account is already pending deletion'
          );
        }
        if (account.status !== 'ACTIVE') {
          throw new ReauthenticationError('FORBIDDEN', 'Organizer account is inactive');
        }
      }

      // 2. Validate expected revision against active credential
      const credRows = await tx.query<{ revision: bigint | number | string }>(
        `SELECT revision FROM organizer_credential
         WHERE account_id = $1 AND purpose = 'ORGANIZER_AUTHENTICATION' AND status = 'ACTIVE'
         ORDER BY revision DESC LIMIT 1`,
        actorContext.accountId
      );

      if (!credRows.length) {
        throw new ReauthenticationError('UNAUTHENTICATED', 'No active credential found');
      }

      const currentCredRev = BigInt(credRows[0].revision);
      if (currentCredRev !== BigInt(expectedRevision)) {
        throw new ReauthenticationError(
          'BINDING_MISMATCH',
          `Expected revision ${expectedRevision} does not match current credential revision ${currentCredRev}`
        );
      }

      // 3. Issue challenge
      const challengeId = randomUUID();
      const expiresAt = new Date(now.getTime() + this.challengeTtlMs);

      await tx.execute(
        `INSERT INTO account_reauthentication_challenge (
           id, account_id, session_id, operation, resource_type, resource_id,
           expected_revision, intention_hash, request_id, status, failed_attempts,
           created_at, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        challengeId,
        actorContext.accountId,
        actorContext.sessionId,
        operation,
        resourceType,
        resourceId,
        currentCredRev,
        intentionHash,
        requestId ?? null,
        'PENDING',
        0,
        now,
        expiresAt
      );

      await this.auditSink.record({
        id: randomUUID(),
        procedure: 'ACCOUNT_REAUTHENTICATION_CHALLENGE_BEGUN',
        actorId: actorContext.accountId,
        targetIdentifier: actorContext.accountId,
        targetPrincipalId: actorContext.accountId,
        result: 'SUCCESS',
        details: `Challenge issued for operation ${operation}`,
        timestamp: now
      });

      return {
        challengeId,
        expiresAt,
        operation,
        resourceId
      };
    });
  }

  /**
   * Verifies an outstanding reauthentication challenge against the organizer's active password
   * and issues an opaque, single-use reauthentication evidence token.
   */
  async verifyChallenge(command: VerifyReauthenticationCommand): Promise<VerifyReauthenticationResult> {
    if (!command || !command.actorContext) {
      throw new ReauthenticationError('INVALID_ARGUMENT', 'Actor context is required');
    }

    const { actorContext, challengeId, credential } = command;

    if (!challengeId || typeof challengeId !== 'string') {
      throw new ReauthenticationError('INVALID_ARGUMENT', 'Challenge ID is required');
    }

    if (!credential || typeof credential !== 'string') {
      throw new ReauthenticationError('INVALID_ARGUMENT', 'Credential is required');
    }

    return this.runner.run(async (tx: SqlTransaction) => {
      const now = new Date();

      // 1. Fetch challenge under FOR UPDATE
      const challengeRows = await tx.query<ChallengeRow>(
        `SELECT id, account_id, session_id, operation, resource_type, resource_id,
                expected_revision, intention_hash, request_id, status, failed_attempts,
                created_at, expires_at, verified_at
         FROM account_reauthentication_challenge
         WHERE id = $1
         FOR UPDATE`,
        challengeId
      );

      if (!challengeRows.length) {
        await this.passwordVerifier.verifyDummy(credential);
        throw new ReauthenticationError('CHALLENGE_NOT_FOUND', 'Challenge not found');
      }

      const challenge = challengeRows[0];

      // 2. Validate binding with current actor context
      if (
        challenge.account_id !== actorContext.accountId ||
        challenge.session_id !== actorContext.sessionId
      ) {
        await this.passwordVerifier.verifyDummy(credential);
        throw new ReauthenticationError('BINDING_MISMATCH', 'Challenge session or account binding mismatch');
      }

      // 3. Status checks
      if (challenge.status === 'VERIFIED') {
        throw new ReauthenticationError(
          'CHALLENGE_ALREADY_VERIFIED',
          'Challenge has already been verified and consumed'
        );
      }

      if (
        challenge.failed_attempts >= this.maxFailedVerificationAttempts ||
        challenge.status === 'CANCELLED'
      ) {
        throw new ReauthenticationError(
          'RATE_LIMITED',
          'Too many failed attempts for this reauthentication challenge'
        );
      }

      if (challenge.status !== 'PENDING') {
        throw new ReauthenticationError('CHALLENGE_EXPIRED', `Challenge status is ${challenge.status}`);
      }

      if (now.getTime() >= new Date(challenge.expires_at).getTime()) {
        await tx.execute(
          `UPDATE account_reauthentication_challenge SET status = 'EXPIRED' WHERE id = $1`,
          challenge.id
        );
        throw new ReauthenticationError('CHALLENGE_EXPIRED', 'Challenge has expired');
      }

      // 5. Query active credential
      const credRows = await tx.query<{ id: string; secret_digest: string; revision: bigint | number | string }>(
        `SELECT id, secret_digest, revision FROM organizer_credential
         WHERE account_id = $1 AND purpose = 'ORGANIZER_AUTHENTICATION' AND status = 'ACTIVE'
         ORDER BY revision DESC LIMIT 1
         FOR UPDATE`,
        challenge.account_id
      );

      if (!credRows.length) {
        await this.passwordVerifier.verifyDummy(credential);
        throw new ReauthenticationError('UNAUTHENTICATED', 'No active credential found');
      }

      const activeCred = credRows[0];
      const activeCredRev = BigInt(activeCred.revision);

      if (activeCredRev !== BigInt(challenge.expected_revision)) {
        throw new ReauthenticationError(
          'BINDING_MISMATCH',
          'Credential revision changed since challenge issuance'
        );
      }

      // 6. Verify password
      let isMatch = false;
      if (this.passwordVerifier.isLegacyShaDigest(activeCred.secret_digest)) {
        isMatch = this.passwordVerifier.verifyLegacyDigest(activeCred.secret_digest, challenge.account_id, credential);
      } else {
        isMatch = await this.passwordVerifier.verifyPassword(activeCred.secret_digest, credential);
      }

      if (!isMatch) {
        const nextAttempts = challenge.failed_attempts + 1;
        const targetStatus = nextAttempts >= this.maxFailedVerificationAttempts ? 'CANCELLED' : 'PENDING';

        await tx.execute(
          `UPDATE account_reauthentication_challenge
           SET failed_attempts = $1, status = $2
           WHERE id = $3`,
          nextAttempts,
          targetStatus,
          challenge.id
        );

        await this.auditSink.record({
          id: randomUUID(),
          procedure: 'ACCOUNT_REAUTHENTICATION_VERIFIED',
          actorId: challenge.account_id,
          targetIdentifier: challenge.account_id,
          targetPrincipalId: challenge.account_id,
          result: 'REJECTED_UNAUTHENTICATED',
          details: 'Reauthentication failed: invalid credential secret',
          timestamp: now
        });

        throw new ReauthenticationError('UNAUTHENTICATED', 'Invalid credentials');
      }

      // 7. Verify recovery authority revision alignment
      const authRev = await this.recoveryAuthority.getCredentialRevision(challenge.account_id);
      if (authRev !== null && authRev !== activeCredRev) {
        throw new ReauthenticationError(
          'RECOVERY_AUTHORITY_UNAVAILABLE',
          'Recovery authority revision mismatch with active credential'
        );
      }

      // 8. CAS update challenge status -> VERIFIED
      const updatedChallengeRows = await tx.execute(
        `UPDATE account_reauthentication_challenge
         SET status = 'VERIFIED', verified_at = $1
         WHERE id = $2 AND status = 'PENDING'`,
        now,
        challenge.id
      );

      if (updatedChallengeRows === 0) {
        throw new ReauthenticationError(
          'CONCURRENCY_CONFLICT',
          'Concurrent verification attempt conflicted on challenge'
        );
      }

      // 9. Generate opaque evidence
      const rawEvidence = randomBytes(32).toString('hex');
      const evidenceDigest = createHash('sha256').update(rawEvidence).digest('hex');
      const evidenceExpiresAt = new Date(now.getTime() + this.evidenceTtlMs);
      const evidenceId = randomUUID();

      await tx.execute(
        `INSERT INTO account_reauthentication_evidence (
           id, challenge_id, account_id, session_id, evidence_digest, operation,
           resource_type, resource_id, expected_revision, intention_hash, request_id,
           status, created_at, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        evidenceId,
        challenge.id,
        challenge.account_id,
        challenge.session_id,
        evidenceDigest,
        challenge.operation,
        challenge.resource_type,
        challenge.resource_id,
        activeCredRev,
        challenge.intention_hash,
        challenge.request_id ?? null,
        'ACTIVE',
        now,
        evidenceExpiresAt
      );

      await this.auditSink.record({
        id: randomUUID(),
        procedure: 'ACCOUNT_REAUTHENTICATION_VERIFIED',
        actorId: challenge.account_id,
        targetIdentifier: challenge.account_id,
        targetPrincipalId: challenge.account_id,
        result: 'SUCCESS',
        details: `Reauthentication verified; evidence issued for challenge ${challenge.id}`,
        timestamp: now
      });

      return {
        evidence: rawEvidence,
        expiresAt: evidenceExpiresAt
      };
    });
  }

  /**
   * Asserts and consumes reauthentication evidence within an existing unit-of-work (tx).
   * Validates binding, prevents double consumption, detects identical replays,
   * and marks the evidence CONSUMED atomically.
   */
  async assertAndConsumeEvidence(
    tx: SqlTransaction,
    command: ConsumeReauthenticationEvidenceCommand
  ): Promise<ConsumeReauthenticationEvidenceResult> {
    if (!command || !command.evidence) {
      throw new ReauthenticationError('INVALID_ARGUMENT', 'Evidence token is required');
    }

    const {
      evidence,
      accountId,
      sessionId,
      operation,
      resourceType,
      resourceId,
      expectedRevision,
      intentionHash,
      requestId,
      idempotencyKey
    } = command;

    const evidenceDigest = createHash('sha256').update(evidence).digest('hex');
    const now = new Date();

    const evidenceRows = await tx.query<EvidenceRow>(
      `SELECT id, challenge_id, account_id, session_id, evidence_digest, operation,
              resource_type, resource_id, expected_revision, intention_hash, request_id,
              status, created_at, expires_at, consumed_at, consumption_receipt
       FROM account_reauthentication_evidence
       WHERE evidence_digest = $1
       FOR UPDATE`,
      evidenceDigest
    );

    if (!evidenceRows.length) {
      throw new ReauthenticationError('EVIDENCE_NOT_FOUND', 'Reauthentication evidence not found');
    }

    const ev = evidenceRows[0];

    // 1. Strict binding verification
    if (
      ev.account_id !== accountId ||
      ev.session_id !== sessionId ||
      ev.operation !== operation ||
      ev.resource_type !== resourceType ||
      ev.resource_id !== resourceId ||
      BigInt(ev.expected_revision) !== BigInt(expectedRevision) ||
      ev.intention_hash !== intentionHash
    ) {
      throw new ReauthenticationError('BINDING_MISMATCH', 'Evidence binding mismatch with operation payload');
    }

    if (operation === 'CANCEL_ACCOUNT_DELETION' && ev.request_id !== requestId) {
      throw new ReauthenticationError('BINDING_MISMATCH', 'Evidence request_id mismatch for cancellation');
    }

    // 2. Replay detection:
    // If evidence was already consumed for the EXACT same authorized operation & payload,
    // return the existing receipt without re-executing or erroring.
    if (ev.status === 'CONSUMED') {
      return {
        outcome: 'REPLAY_ACKNOWLEDGED',
        consumedAt: new Date(ev.consumed_at!),
        receiptId: ev.consumption_receipt!
      };
    }

    if (ev.status !== 'ACTIVE') {
      throw new ReauthenticationError('EVIDENCE_ALREADY_CONSUMED', `Evidence status is ${ev.status}`);
    }

    // 3. Expiration verification (<= 5 minutes by server clock; equality is expired)
    if (now.getTime() >= new Date(ev.expires_at).getTime()) {
      await tx.execute(
        `UPDATE account_reauthentication_evidence SET status = 'EXPIRED' WHERE id = $1`,
        ev.id
      );
      throw new ReauthenticationError('EVIDENCE_EXPIRED', 'Reauthentication evidence has expired');
    }

    // 4. Validate current credential revision has not advanced
    const credRows = await tx.query<{ revision: bigint | number | string }>(
      `SELECT revision FROM organizer_credential
       WHERE account_id = $1 AND purpose = 'ORGANIZER_AUTHENTICATION' AND status = 'ACTIVE'
       ORDER BY revision DESC LIMIT 1`,
      accountId
    );

    if (!credRows.length || BigInt(credRows[0].revision) !== BigInt(expectedRevision)) {
      throw new ReauthenticationError(
        'CONCURRENCY_CONFLICT',
        'Credential revision changed since evidence verification'
      );
    }

    // 5. Consume evidence atomically
    const receiptId = idempotencyKey
      ? `rcpt-${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 16)}`
      : randomUUID();

    const updateCount = await tx.execute(
      `UPDATE account_reauthentication_evidence
       SET status = 'CONSUMED', consumed_at = $1, consumption_receipt = $2
       WHERE id = $3 AND status = 'ACTIVE'`,
      now,
      receiptId,
      ev.id
    );

    if (updateCount === 0) {
      throw new ReauthenticationError(
        'CONCURRENCY_CONFLICT',
        'Concurrent consumption conflict on reauthentication evidence'
      );
    }

    await this.auditSink.record({
      id: randomUUID(),
      procedure: 'ACCOUNT_REAUTHENTICATION_EVIDENCE_CONSUMED',
      actorId: accountId,
      targetIdentifier: accountId,
      targetPrincipalId: accountId,
      result: 'SUCCESS',
      details: `Evidence consumed for ${operation} with receipt ${receiptId}`,
      timestamp: now
    });

    return {
      outcome: 'CONSUMED',
      consumedAt: now,
      receiptId
    };
  }
}
