import {randomUUID} from 'node:crypto';
import {fingerprint,type Execution,type Json,type JobQueuePostgres,type SqlTransaction} from '@eventlens/job-queue';
import type {CompletionEvidence} from '@eventlens/media-execution';
import {InspectionError,type InspectionInput} from './contracts.js';
import {MediaSafetyPolicy} from './inspection.js';
import {PostgresInspectionRepository} from './repository.js';
import {PostgresPhotoRepository,type PhotoCandidate} from './photo-derivatives.js';
import {PostgresVideoRepository,type VideoCandidate} from './video-derivatives.js';

export interface GovernanceDecision {
 mode:'AUTO'|'PRE_REVIEW';revision:string;decisionRevision:string;decision:'ALLOW'|'RESTRICTED';
}
/** Public MOD-004 port; there is deliberately no MOD-003 default implementation.
 * Composition MUST couple this with the completion ResourcePolicy: the policy
 * resolves canonical parents and locks account/ancestors -> event/settings ->
 * media. lockAndRead asserts/reuses those existing parent locks (throws if not
 * held), never acquires a new parent after media. Supplied tx only; locks last
 * until commit. Writers use the identical order. No HTTP/storage I/O in either
 * method. compareAndAssertCurrent is required for optimistic decision readers. */
export interface MediaGovernance {
 lockAndRead(tx:SqlTransaction,scope:{eventRef:string;mediaRef:string}):Promise<GovernanceDecision>;
 compareAndAssertCurrent?(tx:SqlTransaction,scope:{eventRef:string;mediaRef:string},expected:GovernanceDecision):Promise<boolean>;
}
export class GovernanceRevisionChanged extends Error {constructor(){super('GOVERNANCE_REVISION_CHANGED');}}
export interface SuccessfulProcessingCommand {eventRef:string;kind:'PHOTO'|'VIDEO';candidateFingerprint:string;}
export type ProcessingCandidate=PhotoCandidate|VideoCandidate;
export interface PromotionReceipt {operationId:string;status:'PUBLISHED'|'PENDING_REVIEW';revision:string;governance:GovernanceDecision;candidateFingerprint:string;}
export interface SuccessfulProcessingRepository {
 lock(tx:SqlTransaction,input:InspectionInput,eventRef:string):Promise<void>;
 apply(tx:SqlTransaction,job:Execution,input:InspectionInput,command:SuccessfulProcessingCommand,operationId:string,decision:GovernanceDecision):Promise<PromotionReceipt>;
 receipt(tx:SqlTransaction,operationId:string):Promise<PromotionReceipt|null>;
}
export function publicationStatus(decision:GovernanceDecision):'PUBLISHED'|'PENDING_REVIEW'{
 if(!decision||!['AUTO','PRE_REVIEW'].includes(decision.mode)||!decision.revision||!decision.decisionRevision||decision.decision!=='ALLOW')throw new InspectionError('CONFLICT');
 return decision.mode==='AUTO'?'PUBLISHED':'PENDING_REVIEW';
}
export class PostgresSuccessfulProcessingRepository implements SuccessfulProcessingRepository {
 constructor(private readonly evidence:CompletionEvidence,private readonly inspection=new PostgresInspectionRepository()){}
 async lock(tx:SqlTransaction,input:InspectionInput,eventRef:string):Promise<void>{
  // Replay locks identity only; old revision/processable state are first-effect
  // preconditions, never preconditions for recovering the committed receipt.
  const rows=await tx.query<{event_ref:string}>('SELECT event_ref FROM media_catalog WHERE media_ref=$1 FOR UPDATE',input.mediaRef);
  if(rows.length!==1||rows[0].event_ref!==eventRef)throw new InspectionError('CONFLICT');
 }
 async receipt(tx:SqlTransaction,operationId:string):Promise<PromotionReceipt|null>{
  const rows=await tx.query<{status:PromotionReceipt['status'];revision:bigint;governance:GovernanceDecision;candidate_fingerprint:string}>('SELECT status,revision,governance,candidate_fingerprint FROM media_promotion_receipt WHERE operation_id=$1',operationId);
  return rows[0]?{operationId,status:rows[0].status,revision:String(rows[0].revision),governance:rows[0].governance,candidateFingerprint:rows[0].candidate_fingerprint}:null;
 }
 async apply(tx:SqlTransaction,job:Execution,input:InspectionInput,command:SuccessfulProcessingCommand,operationId:string,decision:GovernanceDecision):Promise<PromotionReceipt>{
  const status=publicationStatus(decision);
  await this.inspection.lockAndValidate(tx,input,job);
  const safety=await this.inspection.get(tx,input.mediaRef,input.generation);
  if(!safety||safety.schemaVersion!==1||safety.mediaRef!==input.mediaRef||!MediaSafetyPolicy.eligible(safety,{generation:input.generation,revision:input.revision,sha256:input.original.sha256,version:input.original.immutableVersion,jobId:job.jobId,token:job.token,fence:job.fence,epoch:job.epoch}))throw new InspectionError('CONFLICT');
  const repository=command.kind==='PHOTO'?new PostgresPhotoRepository():new PostgresVideoRepository();
  const candidate=await repository.get(tx,input,job);
  if(!candidate||fingerprint(candidate)!==command.candidateFingerprint)throw new InspectionError('CONFLICT');
  // Reuse the producer's complete candidate validation, without rewriting the
  // immutable existing fact (persist returns on exact compatible identity).
  if(command.kind==='PHOTO')await new PostgresPhotoRepository().persist(tx,input,job,safety,candidate as PhotoCandidate);
  else await new PostgresVideoRepository().persist(tx,input,job,safety,candidate as VideoCandidate);
  await this.evidence.assertSuccessful(tx,{execution:job,attemptId:candidate.attemptId,phaseId:command.kind==='PHOTO'?'photo-derivatives':'video-derivatives',input:input.original,outputs:candidate.renditions});
  const changed=await tx.execute("UPDATE media_catalog SET status=$4,revision=revision+1 WHERE media_ref=$1 AND generation=$2::bigint AND revision=$3::bigint AND status IN ('UPLOADED','PROCESSING')",input.mediaRef,input.generation,input.revision,status);
  if(changed!==1)throw new InspectionError('CONFLICT');
  await tx.execute('INSERT INTO media_promotion_receipt(operation_id,media_ref,generation,previous_revision,revision,job_id,token,epoch,candidate_fingerprint,candidate,governance,status,committed_at) VALUES($1,$2,$3::bigint,$4::bigint,$5::bigint,$6::uuid,$7::uuid,$8,$9,$10::jsonb,$11::jsonb,$12,clock_timestamp())',operationId,input.mediaRef,input.generation,input.revision,input.revision+1n,job.jobId,job.token,job.epoch,command.candidateFingerprint,JSON.stringify(candidate),JSON.stringify(decision),status);
  for(const rendition of candidate.renditions)await tx.execute('INSERT INTO media_active_derivative(media_ref,generation,role,reference,operation_id) VALUES($1,$2::bigint,$3,$4::jsonb,$5)',input.mediaRef,input.generation,rendition.role,JSON.stringify(rendition),operationId);
  await tx.execute("INSERT INTO media_promotion_audit(id,operation_id,media_ref,generation,previous_revision,revision,job_id,token,epoch,governance,transition,actor,committed_at) VALUES($1::uuid,$2,$3,$4::bigint,$5::bigint,$6::bigint,$7::uuid,$8::uuid,$9,$10::jsonb,$11,'SYSTEM',clock_timestamp())",randomUUID(),operationId,input.mediaRef,input.generation,input.revision,input.revision+1n,job.jobId,job.token,job.epoch,JSON.stringify(decision),status);
  return {operationId,status,revision:String(input.revision+1n),governance:decision,candidateFingerprint:command.candidateFingerprint};
 }
}
export class ApplySuccessfulProcessing {
 constructor(private readonly repository:SuccessfulProcessingRepository,private readonly governance:MediaGovernance,private readonly queue:Pick<JobQueuePostgres,'complete'>){}
 async execute(job:Execution,input:InspectionInput,command:SuccessfulProcessingCommand,operationId:string):Promise<{result:'COMPLETED'|'ALREADY_COMMITTED';receipt:PromotionReceipt}>{
  if(!operationId||!command.eventRef||!['PHOTO','VIDEO'].includes(command.kind)||!/^[a-f0-9]{64}$/.test(command.candidateFingerprint)||input.mediaRef!==job.resourceRef||input.generation!==job.generation)throw new InspectionError('INVALID_ARGUMENT');
  // Immutable command identity excludes mutable effective governance. A replay
  // is checked by queue authority/policy, then returns the owner's applied fact.
  const outcome=JSON.parse(JSON.stringify({input:{...input,generation:String(input.generation),revision:String(input.revision)},command})) as Json;
  for(let attempt=0;attempt<3;attempt++){
   let decision:GovernanceDecision|undefined,receipt:PromotionReceipt|undefined;
   try{
    const result=await this.queue.complete(job,operationId,outcome,async tx=>{
     if(!decision)throw new InspectionError('CONFLICT');
     receipt=await this.repository.apply(tx,job,input,command,operationId,decision);
     if(this.governance.compareAndAssertCurrent&&!await this.governance.compareAndAssertCurrent(tx,{eventRef:command.eventRef,mediaRef:input.mediaRef},decision))throw new GovernanceRevisionChanged();
    },async tx=>{
     // Policy has already locked canonical parent/settings. This read must
     // assert that guarantee before taking/reusing the owner's media lock.
     decision=await this.governance.lockAndRead(tx,{eventRef:command.eventRef,mediaRef:input.mediaRef});
     await this.repository.lock(tx,input,command.eventRef);
     const previous=await this.repository.receipt(tx,operationId);if(previous)receipt=previous;
    });
    if(!receipt||receipt.candidateFingerprint!==command.candidateFingerprint)throw new InspectionError('CONFLICT');
    return {result,receipt};
   }catch(error){if(!(error instanceof GovernanceRevisionChanged)||attempt===2)throw error;}
  }
  throw new GovernanceRevisionChanged();
 }
}

export class PostgresMediaGovernance implements MediaGovernance {
  async lockAndRead(
    tx: SqlTransaction,
    scope: { eventRef: string; mediaRef: string }
  ): Promise<GovernanceDecision> {
    const rows = await tx.query<{
      moderation_mode: string;
      updated_at: Date | string;
    }>(
      `SELECT moderation_mode, updated_at
       FROM event
       WHERE id = $1`,
      scope.eventRef
    );

    if (!rows.length) {
      throw new InspectionError('CONFLICT');
    }

    const row = rows[0]!;
    const mode = row.moderation_mode === 'MANUAL_REVIEW' ? 'PRE_REVIEW' : 'AUTO';
    const rev = String(new Date(row.updated_at).getTime());

    return {
      mode,
      revision: rev,
      decisionRevision: rev,
      decision: 'ALLOW'
    };
  }

  async compareAndAssertCurrent(
    tx: SqlTransaction,
    scope: { eventRef: string; mediaRef: string },
    expected: GovernanceDecision
  ): Promise<boolean> {
    const current = await this.lockAndRead(tx, scope);
    return current.mode === expected.mode && current.revision === expected.revision;
  }
}
