import {randomUUID} from 'node:crypto';
import {fingerprint,restrictionBinding,QueueError,type Execution,type Json,type JobQueuePostgres,type RecoveryAuthority,type SqlTransaction,type TransactionRunner} from '@eventlens/job-queue';
import {InspectionError,type InspectionInput,type SafetyFact} from './contracts.js';
import {PostgresInspectionRepository} from './repository.js';

export type QuarantineCause='THREAT_DETECTED'|'DECLARED_FORMAT_MISMATCH'|'CONTAINER_MISMATCH';
/** Denial alone is not suspicion: invalid/corrupt/over-limit inputs and
 * inconclusive infrastructure failures keep their separate owner disposition. */
export class MediaQuarantinePolicy {
 static cause(fact:SafetyFact):QuarantineCause|null {
  if(fact.outcome!=='DENIED')return null;
  if(fact.malware.status==='THREAT_DETECTED')return 'THREAT_DETECTED';
  if(fact.format.status==='INVALID'&&(fact.format.reason==='DECLARED_FORMAT_MISMATCH'||fact.format.reason==='CONTAINER_MISMATCH'))return fact.format.reason;
  return null;
 }
 /** Guard only, never an access grant or administrative release. */
 static normalAccess(status:string,_operation:'READ'|'DOWNLOAD'|'RETRY'|'RELEASE'|'TRANSFORM'|'PROMOTE'):'DENY'|'DEFER_TO_OWNER_POLICY' {
  return status==='QUARANTINED'?'DENY':'DEFER_TO_OWNER_POLICY';
 }
}
export class PostgresQuarantineRepository {
 constructor(private readonly inspections=new PostgresInspectionRepository()){}
 async lock(tx:SqlTransaction,input:InspectionInput):Promise<void>{
  const rows=await tx.query<{generation:bigint}>(`SELECT generation FROM media_catalog WHERE media_ref=$1 FOR UPDATE`,input.mediaRef);
  if(!rows.length||rows[0].generation!==input.generation)throw new InspectionError('STALE_ORIGINAL');
 }
 async apply(tx:SqlTransaction,input:InspectionInput,fact:SafetyFact,job:Execution,operationId:string,sequence:string,cause:QuarantineCause):Promise<void>{
  await this.inspections.lockAndValidate(tx,input,job);
  const stored=await this.inspections.get(tx,input.mediaRef,input.generation);
  if(!stored||fingerprint(stored)!==fingerprint(fact)||fact.schemaVersion!==1||fact.mediaRef!==input.mediaRef||fact.jobId!==job.jobId||fact.executionToken!==job.token||fact.fence!==String(job.fence)||fact.epoch!==job.epoch||fact.generation!==String(input.generation)||fact.revision!==String(input.revision)||fact.originalSha256!==input.original.sha256||fact.originalVersion!==input.original.immutableVersion||MediaQuarantinePolicy.cause(stored)!==cause)throw new InspectionError('CONFLICT');
  const changed=await tx.execute(`UPDATE media_catalog SET status='QUARANTINED',revision=revision+1 WHERE media_ref=$1 AND generation=$2::bigint AND revision=$3::bigint AND status IN ('UPLOADED','PROCESSING')`,input.mediaRef,input.generation,input.revision);
  if(changed!==1)throw new InspectionError('CONFLICT');
  await tx.execute(`INSERT INTO media_quarantine_audit(id,operation_id,media_ref,generation,previous_revision,revision,job_id,token,epoch,journal_sequence,cause,actor,transition,committed_at) VALUES($1::uuid,$2,$3,$4::bigint,$5::bigint,$6::bigint,$7::uuid,$8::uuid,$9,$10,$11,'SYSTEM','QUARANTINED',clock_timestamp())`,randomUUID(),operationId,input.mediaRef,input.generation,input.revision,input.revision+1n,job.jobId,job.token,job.epoch,sequence,cause);
 }
 async verifyReplay(tx:SqlTransaction,operationId:string,sequence:string):Promise<void>{
  const rows=await tx.query<{journal_sequence:string}>(`SELECT journal_sequence FROM media_quarantine_audit WHERE operation_id=$1`,operationId);
  if(rows.length!==1||rows[0].journal_sequence!==sequence)throw new InspectionError('CONFLICT');
 }
}
export class QuarantineOriginal {
 constructor(private readonly repository:Pick<PostgresQuarantineRepository,'lock'|'apply'|'verifyReplay'>,private readonly queue:Pick<JobQueuePostgres,'restrictionCheckpoint'>,private readonly authority:RecoveryAuthority,private readonly transactions:TransactionRunner){}
 /** Retain immutable input/fact for ACK retry. The stored checkpoint is
  * revalidated under lock; a synthetic or stale fact cannot isolate media. */
 async execute(job:Execution,input:InspectionInput,fact:SafetyFact,operationId:string):Promise<'COMMITTED'|'ALREADY_COMMITTED'>{
  const cause=MediaQuarantinePolicy.cause(fact);
  if(!cause||input.mediaRef!==job.resourceRef||input.generation!==job.generation)throw new InspectionError('INVALID_ARGUMENT');
  if(!this.authority.prepareRestriction)throw new QueueError('AUTHORITY_UNAVAILABLE');
  const outcome=JSON.parse(JSON.stringify({input:{...input,generation:String(input.generation),revision:String(input.revision)},fact,cause})) as Json;
  const binding=restrictionBinding(job,operationId,outcome);
  const permit=await this.authority.prepareRestriction(binding);
  try {
   const result=await this.queue.restrictionCheckpoint(job,operationId,outcome,permit,tx=>this.repository.lock(tx,input),tx=>this.repository.apply(tx,input,fact,job,operationId,permit.sequence,cause));
   // Compatible SQL receipt is not a fresh access grant. Validate its journal
   // position before ACK; no external I/O occurs inside a SQL transaction.
   await this.transactions.run(tx=>this.repository.verifyReplay(tx,operationId,permit.sequence));
   permit.assertRestriction(binding);permit.assertCurrent(job.resourceRef);
   await permit.acknowledgeCommit({operationId,fingerprint:binding.fingerprint,sequence:permit.sequence});
   return result;
  }finally{await permit.release();}
 }
}
