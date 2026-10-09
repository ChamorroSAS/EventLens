import {type Execution,type Reservation,type JobQueuePostgres,type TransactionRunner} from '@eventlens/job-queue';
import {InspectionError,type InspectionRepository,type InspectionSource,type MalwareInspection,type MediaInspector,type SafetyFact} from './contracts.js';
export class MediaSafetyPolicy {
 static eligible(fact:SafetyFact|null,identity:{generation:bigint;revision:bigint;sha256:string;version:string;jobId:string;token:string;fence:bigint;epoch:string}):boolean {
  return !!fact&&fact.jobId===identity.jobId&&fact.executionToken===identity.token&&fact.fence===String(identity.fence)&&fact.epoch===identity.epoch&&fact.outcome==='APPROVED'&&fact.format.status==='VALID'&&!!fact.format.metadata&&fact.malware.status==='NO_THREAT_DETECTED'&&fact.malware.originalSha256===identity.sha256&&fact.malware.engineVersion==='1.4.6'&&fact.malware.imageDigest==='sha256:e4df73bcde9afeb6bd1b464091f053537b3df86d8bf5a0431ae87c1760b332ae'&&!!fact.malware.attemptId&&!!fact.format.attemptId&&/^[a-f0-9]{64}$/.test(fact.malware.snapshotId)&&/^[a-f0-9]{64}$/.test(fact.malware.profileHash)&&Date.parse(fact.malware.validUntil??'')>Date.now()&&fact.generation===String(identity.generation)&&fact.revision===String(identity.revision)&&fact.originalSha256===identity.sha256&&fact.originalVersion===identity.version;
 }
}
export class InspectOriginal {
 constructor(private readonly source:InspectionSource,private readonly inspector:MediaInspector,private readonly scanner:MalwareInspection,private readonly repository:InspectionRepository,private readonly queue:Pick<JobQueuePostgres,'checkpoint'>,private readonly transactions:TransactionRunner){}
 async execute(job:Execution,reservation:Reservation,operationId:string,signal?:AbortSignal):Promise<SafetyFact>{
  const input=await this.source.load(job);
  if(input.mediaRef!==job.resourceRef||input.generation!==job.generation||input.revision<0n||!input.declaredMime)throw new InspectionError('INVALID_ARGUMENT');
  const previous=await this.transactions.run(tx=>this.repository.get(tx,input.mediaRef,input.generation));
  if(previous&&previous.executionToken===job.token){
   if(previous.jobId!==job.jobId||previous.fence!==String(job.fence)||previous.epoch!==job.epoch||!this.scanner.compatible(previous.malware))throw new InspectionError('CONFLICT');
   await this.queue.checkpoint(job,operationId,JSON.parse(JSON.stringify(previous)),tx=>this.repository.persist(tx,input,previous,job),tx=>this.repository.lockAndValidate(tx,input,job));return previous;
  }
  // Each supervised phase releases only its own physical slot after drain. The
  // caller's processing reservation spans this whole phase and following owners.
  const phase:Reservation={jobs:reservation.jobs,releaseAfterQuiescence(){}};
  const format=await this.inspector.inspect(input,job,phase,signal);
  const malware=format.reason==='EXECUTION_UNKNOWN'?{status:'INCONCLUSIVE' as const,reason:'PRIOR_PHASE_NOT_QUIESCENT',engine:'ClamAV' as const,engineVersion:'UNKNOWN',imageDigest:'UNKNOWN',snapshotId:'UNKNOWN',profileHash:'UNKNOWN'}:await this.scanner.inspect(input,job,phase,signal);
  const outcome=format.status==='VALID'&&malware.status==='NO_THREAT_DETECTED'?'APPROVED':format.status==='INVALID'||malware.status==='THREAT_DETECTED'?'DENIED':'INCONCLUSIVE';
  const fact:SafetyFact={schemaVersion:1,jobId:job.jobId,executionToken:job.token,fence:String(job.fence),epoch:job.epoch,mediaRef:input.mediaRef,generation:String(input.generation),revision:String(input.revision),originalSha256:input.original.sha256,originalVersion:input.original.immutableVersion,outcome,format,malware};
  await this.queue.checkpoint(job,operationId,JSON.parse(JSON.stringify(fact)),tx=>this.repository.persist(tx,input,fact,job),tx=>this.repository.lockAndValidate(tx,input,job));
  return fact;
 }
}
