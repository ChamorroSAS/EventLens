export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface JobSpec {
  type: string; handlerVersion: string; resourceRef: string; generation: bigint;
  dedupKey: string; queue: string; priority: number; payload: Json;
  availableAt: Date; deadline?: Date;
}
export interface Execution {
  jobId: string; resourceRef: string; generation: bigint; queue: string; type: string;
  payload: Json; handlerVersion: string; attempt: number; fence: bigint; owner: string; token: string;
  epoch: string; leaseUntil: Date;
}
/** Acquired outside SQL. The owner supplies a current, reconciled, fail-closed permit.
 * Each acquire MUST authoritatively admit this operation against current reconciled epoch/revision/checkpoint; PREPARED/gaps/unavailable deny. Admission has a linearization point ordered with restrictive writes: a preceding barrier denies; a subsequent admission observes it. A snapshot reused across operations is invalid. If that ordering cannot be proven, deny admission. assertCurrent MUST be synchronous and MUST reject revoked/stale/unavailable permits.
 * Revocation/epoch change must coordinate admission and in-flight commits; this guard catches known invalidation, not arbitrary remote changes. A cached epoch alone is insufficient.
 * No in-memory adapter is supplied for production. */
export interface RecoveryPermit {
  readonly epoch: string;
  assertCurrent(resourceRef: string): void;
  release(): Promise<void>;
}
export interface RecoveryAuthority {
  acquire(scopes: readonly string[]): Promise<RecoveryPermit>;
  /** Durable PREPARE installs a conservative barrier before SQL. Idempotent by
   * operationId and the complete binding; a different binding conflicts.
   * Optional until the owner supplies its reconciled durable adapter. */
  prepareRestriction?(binding: RestrictionBinding): Promise<RestrictionPermit>;
}
export interface RestrictionBinding {
  readonly operationId: string;
  readonly resourceRef: string;
  readonly epoch: string;
  readonly fingerprint: string;
}
/** Admits ONLY this restriction's SQL commit/replay through its own PREPARED
 * barrier, never normal work. Other barriers/ancestor restrictions, restored
 * checkpoint gaps, epoch changes and unavailable authority remain fail-closed.
 * assertRestriction is synchronous and ordered with competing admission and
 * revocation. sequence is an immutable durable journal position.
 * ACK must durably prove this exact SQL receipt; an uncertain ACK throws.
 * release never aborts PREPARE or removes its barrier. */
export interface RestrictionPermit extends RecoveryPermit {
  readonly binding: RestrictionBinding;
  readonly sequence: string;
  assertRestriction(binding: RestrictionBinding): void;
  acknowledgeCommit(receipt: {operationId: string; fingerprint: string; sequence: string}): Promise<void>;
}
/** Database-only UnitOfWork capability; deliberately not generated Prisma/domain entities. */
export interface SqlTransaction {
  query<T extends object>(sql: string, ...parameters: unknown[]): Promise<T[]>;
  execute(sql: string, ...parameters: unknown[]): Promise<number>;
}
export interface ResourcePolicy {
  /** Lock current resource/ancestor barriers before the job lock. No external I/O.
   * Keep locks to commit; validate generation, cancellation, authorization and reconciliation. */
  lockAndAuthorize(tx: SqlTransaction, resourceRef: string, generation: bigint, operation: 'RESERVE'|'HEARTBEAT'|'COMPLETE'|'RETRY'): Promise<boolean>;
  /** Lock current parent/resource SQL barriers before the owner's row and job.
   * Own quarantine restriction is permitted; unrelated barriers deny. Replay
   * must not require the old media revision or a live processing lease. */
  lockAndAuthorizeRestriction?(tx: SqlTransaction, resourceRef: string, generation: bigint): Promise<boolean>;
}
export interface TransactionRunner {
  run<T>(work: (tx: SqlTransaction)=>Promise<T>): Promise<T>;
}
export class QueueError extends Error {
  constructor(public readonly code: 'LEASE_LOST'|'IDEMPOTENCY_CONFLICT'|'INVALID_ARGUMENT'|'AUTHORITY_UNAVAILABLE') { super(code); }
}
