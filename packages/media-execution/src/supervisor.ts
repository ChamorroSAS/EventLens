import {createHash,randomUUID} from 'node:crypto';
import type {JobQueuePostgres,RecoveryAuthority,RecoveryPermit} from '@eventlens/job-queue';
import type {AttemptInventory,AttemptRecord,ExecutionPlan,ExecutionRequest,ExecutionResult,Limits,ObjectStorage,OutputProof,ProcessRuntime,ResultCode} from './contracts.js';
import {ExecutionError} from './contracts.js';
function bounded<T>(promise:Promise<T>,ms:number):Promise<T>{return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new ExecutionError('UNKNOWN')),ms);promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});}
function abortable<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{return new Promise((resolve,reject)=>{const abort=()=>reject(new ExecutionError('AUTHORIZATION_LOST'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();promise.then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});});}
export function validateLimits(l:Limits):void {
 if(!l||!Number.isFinite(l.cpu)||l.cpu<=0)throw new ExecutionError('INVALID_CONFIG');
 for(const key of ['memoryBytes','pids','scratchBytes','wallMs','maxInputBytes','maxOutputBytes','maxPixels','maxStreams','threads','heartbeatMs','leaseMs','controlTimeoutMs','maxControlBytes'] as const)
  if(!Number.isSafeInteger(l[key])||l[key]<=0)throw new ExecutionError('INVALID_CONFIG');
 if(l.threads!==1||l.heartbeatMs>=l.leaseMs||l.maxOutputBytes>l.scratchBytes)throw new ExecutionError('INVALID_CONFIG');
}
export function validatePlan(plan:ExecutionPlan,l:Limits):void {
 if(!plan?.input||!plan.input.namespace||!plan.input.key||!plan.input.immutableVersion||!/^[a-f0-9]{64}$/.test(plan.input.sha256)||!Number.isSafeInteger(plan.input.sizeBytes)||plan.input.sizeBytes<1)throw new ExecutionError('INVALID_PLAN');
 if(plan.input.sizeBytes>l.maxInputBytes)throw new ExecutionError('LIMIT_EXCEEDED');
 if(plan.steps.some(s=>s.tool!=='ffprobe'&&s.tool!=='clamscan'&&s.tool!=='input-header')&&!plan.inspected)throw new ExecutionError('INVALID_PLAN');
 if(plan.inspected){const {width,height,streams}=plan.inspected;if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||width>l.maxPixels/height||!Number.isSafeInteger(streams)||streams<=0||streams>l.maxStreams)throw new ExecutionError('LIMIT_EXCEEDED');}
 const filenames=new Set<string>(),keys=new Set<string>();
 for(const output of plan.outputs){
  const key=JSON.stringify(output.destination);
  if(!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|mp4|json|zip)$/.test(output.file)||filenames.has(output.file)||keys.has(key)||!output.destination.namespace||!output.destination.key||(output.destination.namespace===plan.input.namespace&&output.destination.key===plan.input.key))throw new ExecutionError('INVALID_PLAN');
  filenames.add(output.file);keys.add(key);
 }
 for(const step of plan.steps){if(!['ffprobe','ffmpeg','heif-convert','clamscan','input-header','photo-output-report','video-output-report'].includes(step.tool)||!Array.isArray(step.args)||step.args.some(a=>typeof a!=='string'||a.includes('\0')))throw new ExecutionError('INVALID_PLAN');}
}
/** No publication/domain completion occurs here. The owner must commit through055 after
 * current policy validation. UNKNOWN retains the physical slot and inventory for recovery. */
export class MediaExecutionSupervisor {
 constructor(private readonly queue:Pick<JobQueuePostgres,'heartbeat'>,private readonly authority:RecoveryAuthority,private readonly storage:ObjectStorage,private readonly runtime:ProcessRuntime,private readonly inventory:AttemptInventory,private readonly limits:Limits){validateLimits(limits);}
 async execute(request:ExecutionRequest):Promise<ExecutionResult>{
  validatePlan(request.plan,this.limits);
  const job=request.execution;
  const phaseId=request.phaseId??'processing';if(!/^[a-z][a-z0-9-]{0,63}$/.test(phaseId))throw new ExecutionError('INVALID_PLAN');
  if(request.reservation.jobs.length!==1||request.reservation.jobs[0].token!==job.token)throw new ExecutionError('INVALID_PLAN');
  const id=randomUUID();
  const resourceHash=createHash('sha256').update(job.resourceRef).digest('hex');
  const record:AttemptRecord={id,phaseId,token:job.token,jobId:job.jobId,resourceRef:job.resourceRef,generation:String(job.generation),fence:String(job.fence),epoch:job.epoch,input:request.plan.input,outputs:request.plan.outputs.map(o=>({file:o.file,destination:{namespace:o.destination.namespace,key:`attempts/${resourceHash}/${job.generation}/${id}/${o.file}`},operationId:randomUUID()})),readOperationId:randomUUID(),limits:this.limits,status:'ACTIVE'};
  // No external dispatch until all exact refs/operation intents have committed.
  await bounded(this.inventory.begin(record),this.limits.controlTimeoutMs);
  this.runtime.registerNewAttempt(id);
  const controller=new AbortController();let failure:ResultCode|undefined;let monitoring:Promise<void>|undefined;
  const stop=(code:ResultCode)=>{if(!failure){failure=code;controller.abort();void this.runtime.stopAndVerify(id,this.limits).catch(()=>{});}};
  const cancel=()=>stop('CANCELLED');request.signal?.addEventListener('abort',cancel,{once:true});if(request.signal?.aborted)cancel();
  const timeout=setTimeout(()=>stop('LIMIT_EXCEEDED'),this.limits.wallMs);
  const admit=async():Promise<RecoveryPermit>=>{
   if(controller.signal.aborted)throw new ExecutionError(failure??'AUTHORIZATION_LOST');
   let admissionTimedOut=false;
   const acquisition=this.authority.acquire([job.resourceRef]).then(async p=>{if(admissionTimedOut){await bounded(p.release(),this.limits.controlTimeoutMs).catch(()=>{});throw new ExecutionError('AUTHORIZATION_LOST');}return p;});
   const deadline=<T>(promise:Promise<T>):Promise<T>=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{admissionTimedOut=true;reject(new ExecutionError('AUTHORIZATION_LOST'));},this.limits.controlTimeoutMs);promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
   const permit=await deadline(acquisition).catch(()=>{throw new ExecutionError('AUTHORIZATION_LOST');});
   try{permit.assertCurrent(job.resourceRef);if(permit.epoch!==job.epoch)throw new ExecutionError('AUTHORIZATION_LOST');await deadline(this.queue.heartbeat(job,this.limits.leaseMs));permit.assertCurrent(job.resourceRef);if(controller.signal.aborted)throw new ExecutionError(failure??'AUTHORIZATION_LOST');return permit;}
   catch{await bounded(permit.release(),this.limits.controlTimeoutMs).catch(()=>{});throw new ExecutionError('AUTHORIZATION_LOST');}
  };
  const timer=setInterval(()=>{if(!monitoring&&!controller.signal.aborted){monitoring=(async()=>{let permit:RecoveryPermit|undefined;try{permit=await admit();}catch{stop('AUTHORIZATION_LOST');}finally{if(permit)await bounded(permit.release(),this.limits.controlTimeoutMs).catch(()=>stop('AUTHORIZATION_LOST'));}})().finally(()=>{monitoring=undefined;});}},this.limits.heartbeatMs);
  const operation=async<T>(work:()=>Promise<T>):Promise<T>=>{const permit=await admit();try{const result=await abortable(work(),controller.signal);try{permit.assertCurrent(job.resourceRef);}catch{throw new ExecutionError('AUTHORIZATION_LOST');}if(controller.signal.aborted)throw new ExecutionError(failure??'AUTHORIZATION_LOST');return result;}finally{await bounded(permit.release(),this.limits.controlTimeoutMs);}};
  let code:ResultCode='SUCCESS';const observations:string[]=[];const outputProofs:OutputProof[]=[];
  try{
   await operation(async()=>{const bytes=await this.storage.read(record.input,record.readOperationId,controller.signal);await this.runtime.stage(id,bytes,record.input,controller.signal);});
   await operation(()=>this.runtime.start(id,this.limits,controller.signal));
   for(const step of request.plan.steps)observations.push(await operation(()=>this.runtime.step(id,step,this.limits,controller.signal)));
   const validated=request.plan.validateOutputs?.(observations);
   if(request.plan.validateOutputs&&(!Array.isArray(validated)||!this.storage.verifyOutput||validated.length!==record.outputs.length||new Set(validated.map(v=>v.file)).size!==validated.length||validated.some(v=>!record.outputs.some(o=>o.file===v.file)||!/^[a-f0-9]{64}$/.test(v.sha256)||!Number.isSafeInteger(v.sizeBytes)||v.sizeBytes<1||v.sizeBytes>this.limits.maxOutputBytes)))throw new ExecutionError('INVALID_PLAN');
   for(const output of record.outputs)await operation(async()=>{
    const expected=validated?.find(v=>v.file===output.file);const hash=createHash('sha256');let size=0,fullyConsumed=false;const runtime=this.runtime,limit=this.limits.maxOutputBytes;
    const bytes=(async function*(){for await(const chunk of runtime.output(id,output.file,limit,controller.signal)){size+=chunk.length;if(size>limit)throw new ExecutionError('LIMIT_EXCEEDED');hash.update(chunk);yield chunk;}if(expected&&(size!==expected.sizeBytes||hash.digest('hex')!==expected.sha256))throw new ExecutionError('PROCESSING_ERROR');fullyConsumed=true;})();
    await this.storage.write(output.destination,bytes,output.operationId,controller.signal);
    if(expected){if(!fullyConsumed)throw new ExecutionError('PROCESSING_ERROR');const observed=await this.storage.verifyOutput!(output.destination,output.operationId,limit,controller.signal);if(observed.namespace!==output.destination.namespace||observed.key!==output.destination.key||!observed.immutableVersion||observed.sha256!==expected.sha256||observed.sizeBytes!==expected.sizeBytes)throw new ExecutionError('PROCESSING_ERROR');outputProofs.push({...observed,file:output.file});}
   });
  }catch(error){code=failure??(error instanceof ExecutionError?(error.code==='LIMIT_EXCEEDED'?'LIMIT_EXCEEDED':error.code==='AUTHORIZATION_LOST'?'AUTHORIZATION_LOST':'PROCESSING_ERROR'):'PROCESSING_ERROR');stop(code);}
  finally{clearTimeout(timeout);clearInterval(timer);request.signal?.removeEventListener('abort',cancel);await monitoring;}
  if(failure)code=failure;
  const quiescent=await this.drain(record,code);
  if(quiescent)request.reservation.releaseAfterQuiescence();
  return {attemptId:id,code:quiescent?code:'UNKNOWN',quiescent,outputs:quiescent&&code==='SUCCESS'?record.outputs.map(o=>o.destination):[],observations:quiescent&&code==='SUCCESS'?observations:[],...(request.plan.validateOutputs?{outputProofs:quiescent&&code==='SUCCESS'?outputProofs:[]}: {})};
 }
 private async drain(record:AttemptRecord,code:ResultCode):Promise<boolean>{
  record.status='UNKNOWN';record.result=code;
  // Even when DB is lost we still physically stop/drain. No durable success is claimed.
  let persisted=true;try{await bounded(this.inventory.update(record),record.limits.controlTimeoutMs);}catch{persisted=false;}
  const process=record.processProof??await this.runtime.stopAndVerify(record.id,record.limits).catch(()=>'UNKNOWN' as const);
  const proofs=[];let drained=process!=='UNKNOWN';
  for(const operationId of [record.readOperationId,...record.outputs.map(o=>o.operationId)]){
   const signal=AbortSignal.timeout(record.limits.controlTimeoutMs);
   const proof=await bounded(this.storage.reconcileAndDrain(operationId,signal),record.limits.controlTimeoutMs).catch(()=>'UNKNOWN' as const);
   if(proof==='UNKNOWN'||proof.operationId!==operationId||!proof.terminal||!proof.evidenceId){drained=false;}else{proofs.push(proof);}
  }
  if(process!=='UNKNOWN')record.processProof=process;
  record.ioProofs=proofs;
  if(!drained||!persisted){try{await bounded(this.inventory.update(record),record.limits.controlTimeoutMs);}catch{}return false;}
  record.status='QUIESCENT';record.processProof=process as Exclude<typeof process,'UNKNOWN'>;record.ioProofs=proofs;
  try{await bounded(this.inventory.update(record),record.limits.controlTimeoutMs);return true;}catch{return false;}
 }
 /** Restrictive crash recovery never resumes/reuses the old execution. No deletion or
  * promotion. Caller releases its slot only after this returns true. */
 async recover(attemptId:string):Promise<boolean>{const record=await this.inventory.get(attemptId);if(!record)return false;if(record.status==='QUIESCENT')return true;return this.drain(record,'AUTHORIZATION_LOST');}
}
