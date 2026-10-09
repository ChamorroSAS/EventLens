import {randomUUID} from 'node:crypto';
import {fingerprint,type Execution,type SqlTransaction} from '@eventlens/job-queue';
import {InspectionError,type InspectionInput,type InspectionRepository,type SafetyFact} from './contracts.js';
export class PostgresInspectionRepository implements InspectionRepository {
 async lockAndValidate(tx:SqlTransaction,input:InspectionInput,job:Execution):Promise<void>{
  const rows=await tx.query<{original:{namespace:string;key:string;version:string;sha256:string;bytes:string};revision:bigint;generation:bigint;status:string;job_id:string}>(`SELECT original,revision,generation,status,job_id FROM media_catalog WHERE media_ref=$1 FOR UPDATE`,input.mediaRef);
  const row=rows[0];
  if(!row||row.generation!==input.generation||row.revision!==input.revision||job.generation!==input.generation||row.job_id!==job.jobId||!['UPLOADED','PROCESSING'].includes(row.status)||row.original.sha256!==input.original.sha256||row.original.version!==input.original.immutableVersion||row.original.namespace!==input.original.namespace||row.original.key!==input.original.key||String(row.original.bytes)!==String(input.original.sizeBytes))throw new InspectionError('STALE_ORIGINAL');
 }
 async persist(tx:SqlTransaction,input:InspectionInput,fact:SafetyFact,job:Execution):Promise<void>{
  await this.lockAndValidate(tx,input,job);
  const previous=await this.get(tx,input.mediaRef,input.generation);
  if(fact.jobId!==job.jobId||fact.executionToken!==job.token||fact.fence!==String(job.fence)||fact.epoch!==job.epoch)throw new InspectionError('CONFLICT');
  if(previous&&previous.executionToken===job.token){if(fingerprint(previous)!==fingerprint(fact))throw new InspectionError('CONFLICT');return;}
  if(previous&&previous.outcome==='DENIED')throw new InspectionError('CONFLICT');
  if(previous){const changed=await tx.execute(`UPDATE media_inspection SET fact=$3::jsonb WHERE media_ref=$1 AND generation=$2::bigint AND fact=$4::jsonb`,input.mediaRef,input.generation,JSON.stringify(fact),JSON.stringify(previous));if(changed!==1)throw new InspectionError('CONFLICT');}
  else await tx.execute(`INSERT INTO media_inspection(media_ref,generation,fact) VALUES($1,$2::bigint,$3::jsonb)`,input.mediaRef,input.generation,JSON.stringify(fact));
  await tx.execute(`INSERT INTO media_inspection_history(media_ref,generation,token,fact) VALUES($1,$2::bigint,$3::uuid,$4::jsonb)`,input.mediaRef,input.generation,job.token,JSON.stringify(fact));
  await tx.execute(`INSERT INTO media_inspection_audit(id,media_ref,generation,job_id,token,epoch,outcome,committed_at) VALUES($1::uuid,$2,$3::bigint,$4::uuid,$5::uuid,$6,$7,clock_timestamp())`,randomUUID(),input.mediaRef,input.generation,job.jobId,job.token,job.epoch,fact.outcome);
 }
 async get(tx:SqlTransaction,mediaRef:string,generation:bigint):Promise<SafetyFact|null>{const rows=await tx.query<{fact:SafetyFact}>(`SELECT fact FROM media_inspection WHERE media_ref=$1 AND generation=$2::bigint`,mediaRef,generation);return rows[0]?.fact??null;}
}
