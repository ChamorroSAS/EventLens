import {randomUUID} from 'node:crypto';
import {fingerprint,type Execution,type Reservation,type JobQueuePostgres,type SqlTransaction,type TransactionRunner} from '@eventlens/job-queue';
import {type MediaExecutionSupervisor,type OutputProof,type ProcessStep,type ValidatedOutput} from '@eventlens/media-execution';
import {InspectionError,type InspectionInput,type InspectionSource,type SafetyFact} from './contracts.js';
import {MediaSafetyPolicy} from './inspection.js';
import {PostgresInspectionRepository} from './repository.js';

export interface PhotoMeasurement {durationMs:number;inputFormat:string;result:"SUCCEEDED"|"FAILED"|"UNKNOWN"|"REJECTED";}
export interface PhotoCandidate {schemaVersion:1;operationId:string;jobId:string;executionToken:string;fence:string;epoch:string;mediaRef:string;generation:string;revision:string;originalSha256:string;originalVersion:string;safetyFingerprint:string;attemptId:string;durationMs:number;inputFormat:string;renditions:readonly (OutputProof&{role:'THUMBNAIL'|'PREVIEW';mime:'image/jpeg';width:number;height:number})[];}
export interface PhotoRepository {get(tx:SqlTransaction,input:InspectionInput,job:Execution):Promise<PhotoCandidate|null>;lock(tx:SqlTransaction,input:InspectionInput,job:Execution,safety:SafetyFact):Promise<void>;persist(tx:SqlTransaction,input:InspectionInput,job:Execution,safety:SafetyFact,candidate:PhotoCandidate):Promise<void>;}
function eligible(input:InspectionInput,job:Execution,safety:SafetyFact):boolean{return MediaSafetyPolicy.eligible(safety,{generation:input.generation,revision:input.revision,sha256:input.original.sha256,version:input.original.immutableVersion,jobId:job.jobId,token:job.token,fence:job.fence,epoch:job.epoch})&&safety.mediaRef===input.mediaRef&&['JPEG','PNG','WEBP','HEIF'].includes(safety.format.metadata?.format??'');}
export function validatePhotoReport(raw:string):{source:{width:number;height:number};outputs:(ValidatedOutput&{width:number;height:number})[]}{
 const report=JSON.parse(raw);const positive=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>0;
 if(!positive(report.source?.width)||!positive(report.source?.height)||!Array.isArray(report.outputs)||report.outputs.length!==2)throw new InspectionError('INVALID_ARGUMENT');
 for(const [index,file,max] of [[0,'thumbnail.jpg',320],[1,'preview.jpg',960]] as const){const o=report.outputs[index];const expectedWidth=Math.min(max,report.source.width);if(o?.file!==file||!/^[a-f0-9]{64}$/.test(o.sha256)||!positive(o.sizeBytes)||!positive(o.width)||!positive(o.height)||o.metadataOmitted!==true||o.width!==expectedWidth||o.height>report.source.height||Math.abs(o.height-report.source.height*o.width/report.source.width)>1)throw new InspectionError('INVALID_ARGUMENT');}
 return report;
}
export class PostgresPhotoRepository implements PhotoRepository {
 private readonly inspection=new PostgresInspectionRepository();
 async get(tx:SqlTransaction,input:InspectionInput,job:Execution):Promise<PhotoCandidate|null>{return (await tx.query<{fact:PhotoCandidate}>('SELECT fact FROM media_photo_candidate WHERE media_ref=$1 AND generation=$2::bigint AND token=$3::uuid',input.mediaRef,input.generation,job.token))[0]?.fact??null;}
 async lock(tx:SqlTransaction,input:InspectionInput,job:Execution,safety:SafetyFact):Promise<void>{await this.inspection.lockAndValidate(tx,input,job);const stored=await this.inspection.get(tx,input.mediaRef,input.generation);if(!stored||fingerprint(stored)!==fingerprint(safety)||!eligible(input,job,stored))throw new InspectionError('CONFLICT');}
 async persist(tx:SqlTransaction,input:InspectionInput,job:Execution,safety:SafetyFact,candidate:PhotoCandidate):Promise<void>{
  await this.lock(tx,input,job,safety);
  if(candidate.schemaVersion!==1||candidate.mediaRef!==input.mediaRef||candidate.generation!==String(input.generation)||candidate.revision!==String(input.revision)||candidate.jobId!==job.jobId||candidate.executionToken!==job.token||candidate.fence!==String(job.fence)||candidate.epoch!==job.epoch||candidate.originalSha256!==input.original.sha256||candidate.originalVersion!==input.original.immutableVersion||candidate.safetyFingerprint!==fingerprint(safety)||!candidate.operationId||!Number.isSafeInteger(candidate.durationMs)||candidate.durationMs<0||candidate.inputFormat!==safety.format.metadata?.format||!/^[a-f0-9-]{36}$/.test(candidate.attemptId)||candidate.renditions?.length!==2||candidate.renditions.some((r,i)=>r.role!==(i===0?'THUMBNAIL':'PREVIEW')||r.file!==(i===0?'thumbnail.jpg':'preview.jpg')||r.mime!=='image/jpeg'||!r.namespace||!r.key.includes('/'+candidate.attemptId+'/')||!r.immutableVersion||!/^[a-f0-9]{64}$/.test(r.sha256)||!Number.isSafeInteger(r.sizeBytes)||r.sizeBytes<1||!Number.isSafeInteger(r.width)||r.width<1||r.width>(i===0?320:960)||!Number.isSafeInteger(r.height)||r.height<1))throw new InspectionError('CONFLICT');
  const previous=await this.get(tx,input,job);if(previous){if(fingerprint(previous)!==fingerprint(candidate))throw new InspectionError('CONFLICT');return;}
  await tx.execute('INSERT INTO media_photo_candidate(media_ref,generation,token,fact) VALUES($1,$2::bigint,$3::uuid,$4::jsonb)',input.mediaRef,input.generation,job.token,JSON.stringify(candidate));
  await tx.execute('INSERT INTO media_photo_audit(id,media_ref,generation,job_id,token,epoch,result,duration_ms,input_format,committed_at) VALUES($1::uuid,$2,$3::bigint,$4::uuid,$5::uuid,$6,$7,$8,$9,clock_timestamp())',randomUUID(),input.mediaRef,input.generation,job.jobId,job.token,job.epoch,'CANDIDATES_VALIDATED',candidate.durationMs,candidate.inputFormat);
 }
}
/** Technical private candidates only. Publication, job completion and cleanup have other owners. */
export class GeneratePhotoDerivatives {
 constructor(private readonly source:InspectionSource,private readonly inspection:PostgresInspectionRepository,private readonly repository:PhotoRepository,private readonly supervisor:MediaExecutionSupervisor,private readonly queue:Pick<JobQueuePostgres,'checkpoint'>,private readonly transactions:TransactionRunner,private readonly configuration:{outputNamespace:string;maxOutputBytes:number;observe?:(measurement:Readonly<PhotoMeasurement>)=>void}){if(!configuration.outputNamespace||!Number.isSafeInteger(configuration.maxOutputBytes)||configuration.maxOutputBytes<1)throw new InspectionError('INVALID_ARGUMENT');}
 async execute(job:Execution,reservation:Reservation,operationId:string,signal?:AbortSignal):Promise<PhotoCandidate>{
  const started=performance.now(),measurement:PhotoMeasurement={durationMs:0,inputFormat:'UNKNOWN',result:'FAILED'};
  try{const candidate=await this.generate(job,reservation,operationId,measurement,signal);measurement.result='SUCCEEDED';return candidate;}
  finally{measurement.durationMs=Math.max(0,Math.round(performance.now()-started));try{this.configuration.observe?.(Object.freeze({...measurement}));}catch{/* Telemetry cannot alter a committed outcome or replace the original failure. */}}
 }
 private async generate(job:Execution,reservation:Reservation,operationId:string,measurement:PhotoMeasurement,signal?:AbortSignal):Promise<PhotoCandidate>{
  const started=performance.now();const input=await this.source.load(job);if(input.mediaRef!==job.resourceRef||input.generation!==job.generation||!operationId)throw new InspectionError('INVALID_ARGUMENT');
  const safety=await this.transactions.run(tx=>this.inspection.get(tx,input.mediaRef,input.generation));if(!safety||!eligible(input,job,safety))throw new InspectionError('CONFLICT');
  measurement.inputFormat=safety.format.metadata!.format;measurement.result='REJECTED';
  const prior=await this.transactions.run(tx=>this.repository.get(tx,input,job));
  if(prior){if(prior.operationId!==operationId||prior.executionToken!==job.token||prior.safetyFingerprint!==fingerprint(safety)||prior.revision!==String(input.revision)||prior.epoch!==job.epoch||prior.fence!==String(job.fence))throw new InspectionError('CONFLICT');await this.queue.checkpoint(job,operationId,JSON.parse(JSON.stringify(prior)),tx=>this.repository.persist(tx,input,job,safety,prior),tx=>this.repository.lock(tx,input,job,safety));return prior;}
  await this.transactions.run(tx=>this.repository.lock(tx,input,job,safety));
  const heif=safety.format.metadata!.format==='HEIF',source=heif?'/scratch/heif.png':'/input/original';const steps:ProcessStep[]=heif?[{tool:'heif-convert',args:['/input/original',source]}]:[];
  for(const [file,max] of [['thumbnail.jpg',320],['preview.jpg',960]] as const){steps.push({tool:'ffmpeg',args:['-v','error','-i',source,'-map','0:v:0','-frames:v','1','-vf',`scale=w=min(${max}\\,iw):h=max(1\\,round(ih*min(1\\,${max}/iw))),sidedata=mode=delete`,'-map_metadata','-1','-map_chapters','-1','-fflags','+bitexact','-flags:v','+bitexact','-y','/scratch/'+file]});steps.push({tool:'ffmpeg',args:['-v','error','-xerror','-i','/scratch/'+file,'-f','null','-']});}
  steps.push({tool:'photo-output-report',args:[source,String(this.configuration.maxOutputBytes)]});
  measurement.result='FAILED';
  const result=await this.supervisor.execute({execution:job,reservation:{jobs:reservation.jobs,releaseAfterQuiescence(){}},signal,phaseId:'photo-derivatives',plan:{input:input.original,inspected:safety.format.metadata!,steps,outputs:['thumbnail.jpg','preview.jpg'].map(file=>({file,destination:{namespace:this.configuration.outputNamespace,key:'private-candidate/'+file}})),validateOutputs:observations=>{const report=validatePhotoReport(observations.at(-1)??'');const m=safety.format.metadata!;if(!((report.source.width===m.width&&report.source.height===m.height)||(report.source.width===m.height&&report.source.height===m.width)))throw new InspectionError('CONFLICT');return report.outputs;}}});
  if(result.code!=='SUCCESS'||!result.quiescent||result.outputProofs?.length!==2){measurement.result=result.code==='UNKNOWN'?'UNKNOWN':'FAILED';throw new InspectionError('CONFLICT');}
  const report=validatePhotoReport(result.observations?.at(-1)??'');
  const candidate:PhotoCandidate={schemaVersion:1,operationId,jobId:job.jobId,executionToken:job.token,fence:String(job.fence),epoch:job.epoch,mediaRef:input.mediaRef,generation:String(input.generation),revision:String(input.revision),originalSha256:input.original.sha256,originalVersion:input.original.immutableVersion,safetyFingerprint:fingerprint(safety),attemptId:result.attemptId,durationMs:Math.max(0,Math.round(performance.now()-started)),inputFormat:safety.format.metadata!.format,renditions:report.outputs.map((output,i)=>{const proof=result.outputProofs!.find(p=>p.file===output.file);if(!proof||proof.sha256!==output.sha256||proof.sizeBytes!==output.sizeBytes||proof.namespace!==this.configuration.outputNamespace||!proof.key.includes('/'+result.attemptId+'/'))throw new InspectionError('CONFLICT');return {...proof,role:i===0?'THUMBNAIL':'PREVIEW',mime:'image/jpeg',width:output.width,height:output.height};})};
  measurement.result='REJECTED';
  await this.queue.checkpoint(job,operationId,JSON.parse(JSON.stringify(candidate)),tx=>this.repository.persist(tx,input,job,safety,candidate),tx=>this.repository.lock(tx,input,job,safety));return candidate;
 }
}
