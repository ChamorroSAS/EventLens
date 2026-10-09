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
}
export interface TransactionRunner {
  run<T>(work: (tx: SqlTransaction)=>Promise<T>): Promise<T>;
}
export class QueueError extends Error {
  constructor(public readonly code: 'LEASE_LOST'|'IDEMPOTENCY_CONFLICT'|'INVALID_ARGUMENT'|'AUTHORITY_UNAVAILABLE') { super(code); }
}
