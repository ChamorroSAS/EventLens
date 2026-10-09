import type { JobSpec, SqlTransaction } from '@eventlens/job-queue';
/** Trusted upstream facts: seal and its immutable identity already durably
 * recorded and verified. Never a client DTO or inferred from storage listing. */
export interface SealedOriginal {
 intentId:string; mediaRef:string; eventRef:string; guestRef:string;
 generation:bigint; expectedRevision:bigint;
 original:{namespace:string;key:string;version:string;sha256:string;bytes:bigint};
}
export interface SealedOriginalSource {loadVerified(intentId:string):Promise<SealedOriginal>;}
export interface AcceptancePolicy {
 /** DB-only; ancestor/event locks before media/intent/job, held through commit.
  * Revalidate ownership, revision/generation, lifecycle, consent, authorization,
  * cancellation and reconciliation. Lock any ledger/capacity rows before
  * intent/media/job as well; ledger.commit must not acquire inverted locks.
  * Replays are never exempt. */
 lockAndAuthorize(tx:SqlTransaction,facts:SealedOriginal):Promise<boolean>;
}
export interface AcceptanceLedger {
 /** Upload owner commits its reservation/ledger in supplied SQL tx once;
  * no external IO and no new quota policy supplied by this component. */
 commit(tx:SqlTransaction,facts:SealedOriginal):Promise<void>;
}
export interface ProcessingConfiguration {type:string;handlerVersion:string;queue:string;priority:number;}
export interface AcceptanceCommand {intentId:string;operationId:string;expectedRevision:bigint;generation:bigint;}
export interface AcceptanceReceipt {intentId:string;operationId:string;mediaRef:string;generation:bigint;jobId:string;acceptedAt:Date;availableAt:Date;handlerVersion:string;}
export interface JobPublisher {publish(tx:SqlTransaction,spec:JobSpec):Promise<string>;}
export class AcceptanceError extends Error {
 constructor(readonly code:'INVALID_ARGUMENT'|'NOT_PREPARED'|'CONFLICT'|'PERMISSION_DENIED'){super(code);}
}
