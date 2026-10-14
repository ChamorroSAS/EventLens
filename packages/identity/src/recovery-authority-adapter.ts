import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Mod001FactType,
  Mod001RecoveryFact,
  PrepareSensitiveOperationCommand,
  RecoveryAuthorityPort,
  RecoveryCheckpoint,
  RecoveryError,
  RecoveryPreparedReceipt
} from './contracts.js';

export interface DurableRecoveryAuthorityOptions {
  /** Directory on durable storage volume where journal and checkpoints reside */
  readonly storageDir: string;
  /** Initial epoch if initializing a fresh authority (default: 1n) */
  readonly initialEpoch?: bigint;
  /** Whether to invoke synchronous fsync on writes (default: true) */
  readonly strictFsync?: boolean;
}

interface DurableJournalEntry {
  sequence: string;
  epoch: string;
  operationId: string;
  subjectRef: string;
  type: Mod001FactType;
  data: Record<string, unknown>;
  state: 'PREPARED' | 'COMMITTED' | 'ABORTED';
  receipt: string;
  dbRevision?: string;
  timestamp: string;
  previousHash: string;
  recordHash: string;
}

interface DurableCheckpointData {
  epoch: string;
  checkpointSequence: string;
  lastRecordHash: string;
  checkpointDigest: string;
  barriers: Record<string, boolean>;
  watermarks: Record<string, string>;
  credentialRevisions: Record<string, string>;
  accountRevisions: Record<string, string>;
  invitationRevisions: Record<string, string>;
  reconciledScopes: Record<
    string,
    {
      epoch: string;
      checkpoint: string;
      digest: string;
      reconciledAt: string;
    }
  >;
  updatedAt: string;
}

const GENESIS_HASH = '0'.repeat(64);

function safeJsonStringify(obj: unknown): string {
  return JSON.stringify(obj, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
}

function computeRecordHash(entry: Omit<DurableJournalEntry, 'recordHash'>): string {
  const h = createHash('sha256');
  h.update(entry.previousHash);
  h.update(':');
  h.update(entry.sequence);
  h.update(':');
  h.update(entry.epoch);
  h.update(':');
  h.update(entry.operationId);
  h.update(':');
  h.update(entry.subjectRef);
  h.update(':');
  h.update(entry.type);
  h.update(':');
  h.update(entry.state);
  h.update(':');
  h.update(entry.receipt);
  h.update(':');
  h.update(entry.dbRevision ?? '');
  h.update(':');
  h.update(safeJsonStringify(entry.data));
  return h.digest('hex');
}

function computeCheckpointDigest(epoch: string, sequence: string, lastRecordHash: string): string {
  return createHash('sha256')
    .update(`${epoch}:${sequence}:${lastRecordHash}`)
    .digest('hex');
}

/**
 * Production-ready durable RecoveryAuthority adapter (EL-TK-222, DEC-112).
 * Persists append-only cryptographic journal entries and consistent checkpoints
 * on a dedicated volume outside the PostgreSQL PITR restore timeline.
 *
 * Guarantees:
 * 1. Independent timeline: Survives PostgreSQL PITR restores intact.
 * 2. Monotonic sequence & gap detection: Missing or reordered entries fail closed.
 * 3. Cryptographic integrity: Tampered records or hash mismatch fail closed.
 * 4. PREPARE -> SQL -> ACK durable receipts with synchronous fsync.
 * 5. Replay and duplicate resistance via immutable operationId binding.
 * 6. Conservative fail-closed behavior on storage outage, corruption, or active barriers.
 */
export class DurableRecoveryAuthorityAdapter implements RecoveryAuthorityPort {
  private readonly storageDir: string;
  private readonly journalFilePath: string;
  private readonly checkpointFilePath: string;
  private readonly strictFsync: boolean;

  private isInitialized = false;
  private currentEpoch: bigint;
  private currentSequence = 0n;
  private lastRecordHash = GENESIS_HASH;

  private readonly entriesByReceipt = new Map<string, DurableJournalEntry>();
  private readonly entriesByOperationId = new Map<string, DurableJournalEntry>();
  private readonly committedFacts: Mod001RecoveryFact[] = [];

  private readonly watermarks = new Map<string, bigint>();
  private readonly credentialRevisions = new Map<string, bigint>();
  private readonly accountRevisions = new Map<string, bigint>();
  private readonly invitationRevisions = new Map<string, bigint>();
  private readonly barriers = new Map<string, boolean>();
  private readonly reconciledScopes = new Map<
    string,
    { epoch: bigint; checkpoint: bigint; digest: string; reconciledAt: string }
  >();

  constructor(options: DurableRecoveryAuthorityOptions) {
    if (!options?.storageDir) {
      throw new RecoveryError('INVALID_ARGUMENT', 'storageDir is required for DurableRecoveryAuthorityAdapter');
    }
    this.storageDir = options.storageDir;
    this.journalFilePath = path.join(this.storageDir, 'recovery-journal.ndjson');
    this.checkpointFilePath = path.join(this.storageDir, 'recovery-checkpoint.json');
    this.currentEpoch = options.initialEpoch ?? 1n;
    this.strictFsync = options.strictFsync ?? true;
  }

  /**
   * Initializes the adapter: creates the storage directory if needed,
   * reads and validates existing checkpoints and journal entries,
   * and builds verified state in memory.
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true, mode: 0o700 });
      }

      await this.recoverStateFromStorage();
      this.isInitialized = true;
    } catch (err) {
      if (err instanceof RecoveryError) {
        throw err;
      }
      throw new RecoveryError('AUTHORITY_UNAVAILABLE', `Failed to initialize storage: ${(err as Error).message}`);
    }
  }

  private async assertOperational(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private async recoverStateFromStorage(): Promise<void> {
    this.entriesByReceipt.clear();
    this.entriesByOperationId.clear();
    this.committedFacts.length = 0;
    this.watermarks.clear();
    this.credentialRevisions.clear();
    this.accountRevisions.clear();
    this.invitationRevisions.clear();
    this.barriers.clear();
    this.reconciledScopes.clear();

    this.currentSequence = 0n;
    this.lastRecordHash = GENESIS_HASH;

    // 1. Recover and validate Journal
    if (fs.existsSync(this.journalFilePath)) {
      const content = fs.readFileSync(this.journalFilePath, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);

      let expectedSeq = 1n;
      let expectedPrevHash = GENESIS_HASH;

      for (let i = 0; i < lines.length; i++) {
        let entry: DurableJournalEntry;
        try {
          entry = JSON.parse(lines[i]);
        } catch {
          throw new RecoveryError('CORRUPTED_ARTIFACT', `Corrupted journal record at line ${i + 1}`);
        }

        if (
          !entry ||
          typeof entry.sequence !== 'string' ||
          typeof entry.previousHash !== 'string' ||
          typeof entry.recordHash !== 'string'
        ) {
          throw new RecoveryError('CORRUPTED_ARTIFACT', `Malformed journal record structure at line ${i + 1}`);
        }

        let seq: bigint;
        try {
          seq = BigInt(entry.sequence);
        } catch {
          throw new RecoveryError('CORRUPTED_ARTIFACT', `Invalid sequence bigint at line ${i + 1}`);
        }

        if (seq !== expectedSeq) {
          throw new RecoveryError(
            'GAP_DETECTED',
            `Journal sequence gap at line ${i + 1}: expected ${expectedSeq}, found ${seq}`
          );
        }

        if (entry.previousHash !== expectedPrevHash) {
          throw new RecoveryError(
            'CORRUPTED_ARTIFACT',
            `Journal hash chain broken at sequence ${seq}: expected previousHash ${expectedPrevHash}, found ${entry.previousHash}`
          );
        }

        const computed = computeRecordHash(entry);
        if (computed !== entry.recordHash) {
          throw new RecoveryError(
            'CORRUPTED_ARTIFACT',
            `Cryptographic digest mismatch at sequence ${seq}: computed ${computed}, recorded ${entry.recordHash}`
          );
        }

        expectedSeq++;
        expectedPrevHash = entry.recordHash;
        this.currentSequence = seq;
        this.lastRecordHash = entry.recordHash;

        const epochBig = BigInt(entry.epoch);
        if (epochBig > this.currentEpoch) {
          this.currentEpoch = epochBig;
        }

        this.entriesByReceipt.set(entry.receipt, entry);
        this.entriesByOperationId.set(entry.operationId, entry);

        if (entry.state === 'COMMITTED') {
          this.applyCommittedEntryToState(entry);
        }
      }
    }

    // 2. Validate Checkpoint if present
    if (fs.existsSync(this.checkpointFilePath)) {
      let cp: DurableCheckpointData;
      try {
        const raw = fs.readFileSync(this.checkpointFilePath, 'utf8');
        cp = JSON.parse(raw);
      } catch {
        throw new RecoveryError('CORRUPTED_ARTIFACT', 'Corrupted checkpoint file format');
      }

      const cpEpoch = BigInt(cp.epoch);
      const cpSeq = BigInt(cp.checkpointSequence);

      const expectedDigest = computeCheckpointDigest(cp.epoch, cp.checkpointSequence, cp.lastRecordHash);
      if (cp.checkpointDigest !== expectedDigest) {
        throw new RecoveryError('CORRUPTED_ARTIFACT', 'Checkpoint digest mismatch');
      }

      if (cpSeq > this.currentSequence) {
        throw new RecoveryError(
          'GAP_DETECTED',
          `Checkpoint sequence (${cpSeq}) exceeds journal sequence (${this.currentSequence})`
        );
      }

      if (cpEpoch > this.currentEpoch) {
        this.currentEpoch = cpEpoch;
      }

      // Restore barriers
      for (const [scope, active] of Object.entries(cp.barriers ?? {})) {
        this.barriers.set(scope, Boolean(active));
      }

      // Restore reconciled scopes
      for (const [scope, rec] of Object.entries(cp.reconciledScopes ?? {})) {
        this.reconciledScopes.set(scope, {
          epoch: BigInt(rec.epoch),
          checkpoint: BigInt(rec.checkpoint),
          digest: rec.digest,
          reconciledAt: rec.reconciledAt
        });
      }
    }
  }

  private applyCommittedEntryToState(entry: DurableJournalEntry): void {
    const rev = entry.dbRevision ? BigInt(entry.dbRevision) : BigInt(entry.sequence);
    const factSequence = BigInt(this.committedFacts.length + 1);

    this.committedFacts.push({
      type: entry.type,
      subjectRef: entry.subjectRef,
      revision: rev,
      sequence: factSequence,
      facts: entry.data,
      timestamp: new Date(entry.timestamp)
    });

    switch (entry.type) {
      case 'ADMIN_PRINCIPAL_REVOKED':
        this.watermarks.set(entry.subjectRef, rev);
        break;
      case 'CREDENTIAL_ROTATED':
        this.credentialRevisions.set(entry.subjectRef, rev);
        this.watermarks.set(entry.subjectRef, rev);
        break;
      case 'SESSION_REVOKED': {
        const wm = entry.data?.watermark ? BigInt(String(entry.data.watermark)) : rev;
        const target = (entry.data?.principalId as string) || entry.subjectRef;
        this.watermarks.set(target, wm);
        break;
      }
      default:
        break;
    }
  }

  private appendEntryToJournal(entry: DurableJournalEntry): void {
    const line = safeJsonStringify(entry) + '\n';
    try {
      const fd = fs.openSync(this.journalFilePath, 'a', 0o600);
      try {
        fs.writeFileSync(fd, line, 'utf8');
        if (this.strictFsync) {
          fs.fsyncSync(fd);
        }
      } finally {
        fs.closeSync(fd);
      }
    } catch (err) {
      throw new RecoveryError('AUTHORITY_UNAVAILABLE', `Journal write failed: ${(err as Error).message}`);
    }
  }

  private writeCheckpointAtomic(): void {
    const barriersObj: Record<string, boolean> = {};
    for (const [k, v] of this.barriers.entries()) {
      barriersObj[k] = v;
    }

    const watermarksObj: Record<string, string> = {};
    for (const [k, v] of this.watermarks.entries()) {
      watermarksObj[k] = v.toString();
    }

    const credRevObj: Record<string, string> = {};
    for (const [k, v] of this.credentialRevisions.entries()) {
      credRevObj[k] = v.toString();
    }

    const reconciledObj: Record<
      string,
      { epoch: string; checkpoint: string; digest: string; reconciledAt: string }
    > = {};
    for (const [k, v] of this.reconciledScopes.entries()) {
      reconciledObj[k] = {
        epoch: v.epoch.toString(),
        checkpoint: v.checkpoint.toString(),
        digest: v.digest,
        reconciledAt: v.reconciledAt
      };
    }

    const epochStr = this.currentEpoch.toString();
    const seqStr = this.currentSequence.toString();
    const digest = computeCheckpointDigest(epochStr, seqStr, this.lastRecordHash);

    const cpData: DurableCheckpointData = {
      epoch: epochStr,
      checkpointSequence: seqStr,
      lastRecordHash: this.lastRecordHash,
      checkpointDigest: digest,
      barriers: barriersObj,
      watermarks: watermarksObj,
      credentialRevisions: credRevObj,
      accountRevisions: {},
      invitationRevisions: {},
      reconciledScopes: reconciledObj,
      updatedAt: new Date().toISOString()
    };

    const tempFile = path.join(this.storageDir, `recovery-checkpoint.tmp.${randomUUID()}`);
    try {
      const fd = fs.openSync(tempFile, 'w', 0o600);
      try {
        fs.writeFileSync(fd, JSON.stringify(cpData, null, 2), 'utf8');
        if (this.strictFsync) {
          fs.fsyncSync(fd);
        }
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tempFile, this.checkpointFilePath);
    } catch (err) {
      try {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      } catch {
        // ignore cleanup error
      }
      throw new RecoveryError('AUTHORITY_UNAVAILABLE', `Checkpoint write failed: ${(err as Error).message}`);
    }
  }

  // --- RecoveryAuthorityPort implementation ---

  async getRecoveryEpoch(): Promise<bigint> {
    await this.assertOperational();
    return this.currentEpoch;
  }

  async getCredentialRevision(principalId: string): Promise<bigint | null> {
    await this.assertOperational();
    return this.credentialRevisions.get(principalId) ?? null;
  }

  async getAdminAuthWatermark(principalId: string): Promise<bigint> {
    await this.assertOperational();
    return this.watermarks.get(principalId) ?? 0n;
  }

  async getInvitationRevision(invitationId: string): Promise<bigint | null> {
    await this.assertOperational();
    return this.invitationRevisions.get(invitationId) ?? null;
  }

  async getAccountRevision(accountId: string): Promise<bigint | null> {
    await this.assertOperational();
    return this.accountRevisions.get(accountId) ?? null;
  }

  async setRecoveryBarrier(epoch: bigint, scope: string): Promise<void> {
    await this.assertOperational();
    if (epoch !== this.currentEpoch) {
      this.currentEpoch = epoch;
    }
    this.barriers.set(scope, true);
    this.writeCheckpointAtomic();
  }

  async isRecoveryBarrierActive(epoch: bigint, scope: string): Promise<boolean> {
    await this.assertOperational();
    if (epoch < this.currentEpoch) {
      return true; // Superseded epoch enforces barrier
    }
    return this.barriers.get(scope) === true;
  }

  async prepare(command: PrepareSensitiveOperationCommand): Promise<RecoveryPreparedReceipt> {
    await this.assertOperational();

    if (!command.operationId || !command.subjectRef || !command.fact?.type) {
      throw new RecoveryError('INVALID_ARGUMENT', 'operationId, subjectRef, and fact.type are required');
    }

    if (this.barriers.get('MOD-001') === true) {
      throw new RecoveryError('BARRIER_ACTIVE', 'Sensitive operation rejected: MOD-001 recovery barrier is active');
    }

    // Idempotency check: if operationId was already prepared, return identical receipt
    const existing = this.entriesByOperationId.get(command.operationId);
    if (existing) {
      if (existing.subjectRef !== command.subjectRef || existing.type !== command.fact.type) {
        throw new RecoveryError('INVALID_ARGUMENT', 'Idempotency conflict: differing parameters for same operationId');
      }
      return {
        preparedReceipt: existing.receipt,
        sequence: BigInt(existing.sequence),
        operationId: existing.operationId,
        subjectRef: existing.subjectRef
      };
    }

    const nextSeq = this.currentSequence + 1n;
    const receiptStr = `rcpt-${command.operationId}`;

    const rawEntry: Omit<DurableJournalEntry, 'recordHash'> = {
      sequence: nextSeq.toString(),
      epoch: this.currentEpoch.toString(),
      operationId: command.operationId,
      subjectRef: command.subjectRef,
      type: command.fact.type,
      data: (command.fact.data as Record<string, unknown>) ?? {},
      state: 'PREPARED',
      receipt: receiptStr,
      timestamp: new Date().toISOString(),
      previousHash: this.lastRecordHash
    };

    const entry: DurableJournalEntry = {
      ...rawEntry,
      recordHash: computeRecordHash(rawEntry)
    };

    this.appendEntryToJournal(entry);

    this.currentSequence = nextSeq;
    this.lastRecordHash = entry.recordHash;
    this.entriesByReceipt.set(receiptStr, entry);
    this.entriesByOperationId.set(command.operationId, entry);

    return {
      preparedReceipt: receiptStr,
      sequence: nextSeq,
      operationId: command.operationId,
      subjectRef: command.subjectRef
    };
  }

  async ackCommit(receipt: string, dbRevision: bigint): Promise<void> {
    await this.assertOperational();

    const entry = this.entriesByReceipt.get(receipt);
    if (!entry) {
      throw new RecoveryError('INVALID_RECEIPT', `No prepared entry found for receipt '${receipt}'`);
    }

    if (entry.state === 'COMMITTED') {
      // Idempotent ACK
      return;
    }

    if (entry.state === 'ABORTED') {
      throw new RecoveryError('INVALID_RECEIPT', `Cannot commit aborted receipt '${receipt}'`);
    }

    // Append COMMIT record
    const nextSeq = this.currentSequence + 1n;
    const rawCommitEntry: Omit<DurableJournalEntry, 'recordHash'> = {
      sequence: nextSeq.toString(),
      epoch: this.currentEpoch.toString(),
      operationId: entry.operationId,
      subjectRef: entry.subjectRef,
      type: entry.type,
      data: entry.data,
      state: 'COMMITTED',
      receipt,
      dbRevision: dbRevision.toString(),
      timestamp: new Date().toISOString(),
      previousHash: this.lastRecordHash
    };

    const commitEntry: DurableJournalEntry = {
      ...rawCommitEntry,
      recordHash: computeRecordHash(rawCommitEntry)
    };

    this.appendEntryToJournal(commitEntry);

    this.currentSequence = nextSeq;
    this.lastRecordHash = commitEntry.recordHash;

    entry.state = 'COMMITTED';
    entry.dbRevision = dbRevision.toString();

    this.applyCommittedEntryToState(commitEntry);
    this.writeCheckpointAtomic();
  }

  async resolveAbort(receipt: string, reason: string): Promise<void> {
    await this.assertOperational();

    const entry = this.entriesByReceipt.get(receipt);
    if (!entry) {
      return; // Idempotent no-op
    }

    if (entry.state === 'COMMITTED') {
      throw new RecoveryError('ABORT_UNRESOLVED', `Cannot abort committed receipt '${receipt}'`);
    }

    if (entry.state === 'ABORTED') {
      return;
    }

    const nextSeq = this.currentSequence + 1n;
    const rawAbortEntry: Omit<DurableJournalEntry, 'recordHash'> = {
      sequence: nextSeq.toString(),
      epoch: this.currentEpoch.toString(),
      operationId: entry.operationId,
      subjectRef: entry.subjectRef,
      type: entry.type,
      data: { ...entry.data, abortReason: reason },
      state: 'ABORTED',
      receipt,
      timestamp: new Date().toISOString(),
      previousHash: this.lastRecordHash
    };

    const abortEntry: DurableJournalEntry = {
      ...rawAbortEntry,
      recordHash: computeRecordHash(rawAbortEntry)
    };

    this.appendEntryToJournal(abortEntry);

    this.currentSequence = nextSeq;
    this.lastRecordHash = abortEntry.recordHash;
    entry.state = 'ABORTED';

    this.writeCheckpointAtomic();
  }

  async readCheckpoint(): Promise<RecoveryCheckpoint> {
    await this.assertOperational();
    const digest = computeCheckpointDigest(
      this.currentEpoch.toString(),
      this.currentSequence.toString(),
      this.lastRecordHash
    );

    return {
      epoch: this.currentEpoch,
      checkpointSequence: this.currentSequence,
      checkpointDigest: digest
    };
  }

  async readFacts(afterSequence: bigint, throughCheckpoint: bigint): Promise<readonly Mod001RecoveryFact[]> {
    await this.assertOperational();
    return this.committedFacts.filter(
      (f) => f.sequence > afterSequence && f.sequence <= throughCheckpoint
    );
  }

  async ackReconciled(scope: string, epoch: bigint, checkpoint: bigint, digest: string): Promise<void> {
    await this.assertOperational();
    this.reconciledScopes.set(scope, {
      epoch,
      checkpoint,
      digest,
      reconciledAt: new Date().toISOString()
    });
    // Lifting barrier upon successful reconciliation
    this.barriers.set(scope, false);
    this.writeCheckpointAtomic();
  }

  async prepareSessionOperation(operationId: string, principalId: string): Promise<{ receipt: string }> {
    const prep = await this.prepare({
      operationId,
      subjectRef: principalId,
      fact: {
        type: 'SESSION_REVOKED',
        data: { principalId }
      }
    });
    return { receipt: prep.preparedReceipt };
  }

  async ackSessionOperation(receipt: string): Promise<void> {
    await this.ackCommit(receipt, 1n);
  }

  /**
   * Helper to manually advance the recovery epoch (e.g. after catastrophic restore).
   */
  public advanceEpoch(): bigint {
    this.currentEpoch++;
    this.writeCheckpointAtomic();
    return this.currentEpoch;
  }
}
