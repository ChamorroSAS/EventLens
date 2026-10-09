import { randomUUID } from 'node:crypto';
import { fingerprint, type RecoveryAuthority, type TransactionRunner, type SqlTransaction } from '@eventlens/job-queue';
import { AcceptanceError, type SealedOriginal, type SealedOriginalSource, type AcceptancePolicy, type AcceptanceLedger, type ProcessingConfiguration, type JobPublisher, type AcceptanceCommand, type AcceptanceReceipt } from './contracts.js';
interface IntentRow {fingerprint:string;facts:Record<string,unknown>;}
interface ReceiptRow {operation_id:string;command_fingerprint:string;media_ref:string;generation:bigint;job_id:string;accepted_at:Date;available_at:Date;handler_version:string;}
function validate(f:SealedOriginal):void {
 if(!f.intentId||!f.mediaRef||!f.eventRef||!f.guestRef||!f.original.namespace||!f.original.key||!f.original.version||! /^[a-f0-9]{64}$/.test(f.original.sha256)||f.original.bytes<=0n||f.generation<0n||f.expectedRevision<0n)throw new AcceptanceError('INVALID_ARGUMENT');
}
function encoded(f:unknown):string{return JSON.stringify(f,(_k,v)=>typeof v==='bigint'?v.toString():v);}
function decoded(raw:Record<string,unknown>):SealedOriginal {const f=raw as unknown as SealedOriginal;return {...f,generation:BigInt(f.generation),expectedRevision:BigInt(f.expectedRevision),original:{...f.original,bytes:BigInt(f.original.bytes)}};}
function receipt(intentId:string,r:ReceiptRow):AcceptanceReceipt{return {intentId,operationId:r.operation_id,mediaRef:r.media_ref,generation:r.generation,jobId:r.job_id,acceptedAt:r.accepted_at,availableAt:r.available_at,handlerVersion:r.handler_version};}
/** Translate only uniqueness conflicts after the SQL transaction has rolled back.
 * Do not catch inside an aborted transaction or disclose raw storage details. */
function conflict(error:unknown):never {
 const e=error as {code?:string;meta?:{code?:string;driverAdapterError?:{cause?:{kind?:string;originalCode?:string}}}};
 const cause=e?.meta?.driverAdapterError?.cause;
 if(e?.code==='P2002'||(e?.code==='P2010'&&(e.meta?.code==='23505'||(cause?.kind==='UniqueConstraintViolation'&&cause.originalCode==='23505'))))throw new AcceptanceError('CONFLICT');
 throw error;
}
/** MOD-003 boundary. No physical upload/sealing, quota policy, parser, promotion,
 * HTTP endpoint or production RecoveryAuthority adapter. */
export class MediaAcceptance {
 constructor(private readonly transactions:TransactionRunner,private readonly authority:RecoveryAuthority,private readonly source:SealedOriginalSource,private readonly policy:AcceptancePolicy,private readonly ledger:AcceptanceLedger,private readonly publisher:JobPublisher,private readonly config:ProcessingConfiguration){
  if(!config.type||!config.handlerVersion||!config.queue||!Number.isSafeInteger(config.priority))throw new AcceptanceError('INVALID_ARGUMENT');
 }
 private async authorized<T>(facts:SealedOriginal,work:(tx:SqlTransaction,epoch:string)=>Promise<T>):Promise<T>{
  const permit=await this.authority.acquire([facts.eventRef,facts.mediaRef]);
  try{return await this.transactions.run(async tx=>{
   permit.assertCurrent(facts.eventRef);permit.assertCurrent(facts.mediaRef);
   if(!await this.policy.lockAndAuthorize(tx,facts))throw new AcceptanceError('PERMISSION_DENIED');
   const result=await work(tx,permit.epoch);
   permit.assertCurrent(facts.eventRef);permit.assertCurrent(facts.mediaRef);return result;
  });}finally{await permit.release();}
 }
 /** Store projection of upstream durable verified seal. No UPLOADED or job yet. */
 async prepare(intentId:string):Promise<void>{
  if(!intentId)throw new AcceptanceError('INVALID_ARGUMENT');
  const facts=await this.source.loadVerified(intentId);validate(facts);
  if(facts.intentId!==intentId)throw new AcceptanceError('CONFLICT');
  await this.authorized(facts,async tx=>{
   const rows=await tx.query<IntentRow>(`INSERT INTO media_acceptance_intent(intent_id,media_ref,generation,fingerprint,facts) VALUES($1,$2,$3::bigint,$4,$5::jsonb) ON CONFLICT(intent_id) DO UPDATE SET intent_id=EXCLUDED.intent_id RETURNING fingerprint,facts`,intentId,facts.mediaRef,facts.generation,fingerprint(facts),encoded(facts));
   if(rows[0].fingerprint!==fingerprint(facts))throw new AcceptanceError('CONFLICT');
  }).catch(conflict);
 }
 async confirm(command:AcceptanceCommand):Promise<AcceptanceReceipt>{
  if(!command.intentId||!command.operationId||command.expectedRevision<0n||command.generation<0n)throw new AcceptanceError('INVALID_ARGUMENT');
  const facts=await this.source.loadVerified(command.intentId);validate(facts);
  if(facts.intentId!==command.intentId||facts.generation!==command.generation||facts.expectedRevision!==command.expectedRevision)throw new AcceptanceError('CONFLICT');
  const hash=fingerprint({intentId:command.intentId,generation:command.generation,expectedRevision:command.expectedRevision,facts});
  return this.authorized(facts,async(tx,epoch)=>{
   const intents=await tx.query<IntentRow>('SELECT fingerprint,facts FROM media_acceptance_intent WHERE intent_id=$1 FOR UPDATE',command.intentId);
   if(!intents.length)throw new AcceptanceError('NOT_PREPARED');
   if(intents[0].fingerprint!==fingerprint(facts))throw new AcceptanceError('CONFLICT');
   const alias=await tx.query<{intent_id:string;command_fingerprint:string}>('SELECT intent_id,command_fingerprint FROM media_acceptance_operation WHERE operation_id=$1',command.operationId);
   if(alias.length&&(alias[0].intent_id!==command.intentId||alias[0].command_fingerprint!==hash))throw new AcceptanceError('CONFLICT');
   const previous=await tx.query<ReceiptRow>('SELECT * FROM media_acceptance_receipt WHERE intent_id=$1',command.intentId);
   if(previous.length){
    if(previous[0].command_fingerprint!==hash)throw new AcceptanceError('CONFLICT');
    await tx.execute('INSERT INTO media_acceptance_operation(operation_id,intent_id,command_fingerprint) VALUES($1,$2,$3) ON CONFLICT(operation_id) DO NOTHING',command.operationId,command.intentId,hash);
    const bound=await tx.query<{intent_id:string;command_fingerprint:string}>('SELECT intent_id,command_fingerprint FROM media_acceptance_operation WHERE operation_id=$1',command.operationId);
    if(bound[0].intent_id!==command.intentId||bound[0].command_fingerprint!==hash)throw new AcceptanceError('CONFLICT');
    return receipt(command.intentId,previous[0]);
   }
   if((await tx.query('SELECT media_ref FROM media_catalog WHERE media_ref=$1 FOR UPDATE',facts.mediaRef)).length)throw new AcceptanceError('CONFLICT');
   const [{now}]=await tx.query<{now:Date}>('SELECT clock_timestamp() AS now');
   const jobId=await this.publisher.publish(tx,{type:this.config.type,handlerVersion:this.config.handlerVersion,resourceRef:facts.mediaRef,generation:facts.generation,dedupKey:`media-acceptance:${fingerprint({mediaRef:facts.mediaRef,generation:facts.generation})}`,queue:this.config.queue,priority:this.config.priority,availableAt:now,payload:{mediaRef:facts.mediaRef,generation:facts.generation.toString(),original:{...facts.original,bytes:facts.original.bytes.toString()}}});
   await this.ledger.commit(tx,facts);
   await tx.execute(`INSERT INTO media_catalog(media_ref,intent_id,event_ref,guest_ref,generation,revision,status,original,job_id) VALUES($1,$2,$3,$4,$5::bigint,$6::bigint,'UPLOADED',$7::jsonb,$8::uuid)`,facts.mediaRef,facts.intentId,facts.eventRef,facts.guestRef,facts.generation,facts.expectedRevision,encoded(facts.original),jobId);
   const rows=await tx.query<ReceiptRow>(`INSERT INTO media_acceptance_receipt(intent_id,operation_id,command_fingerprint,media_ref,generation,job_id,available_at,handler_version,accepted_at) VALUES($1,$2,$3,$4,$5::bigint,$6::uuid,$7::timestamptz,$8,$7::timestamptz) RETURNING *`,command.intentId,command.operationId,hash,facts.mediaRef,facts.generation,jobId,now,this.config.handlerVersion);
   await tx.execute('INSERT INTO media_acceptance_operation(operation_id,intent_id,command_fingerprint) VALUES($1,$2,$3)',command.operationId,command.intentId,hash);
   await tx.execute(`INSERT INTO media_acceptance_audit(id,intent_id,media_ref,job_id,generation,epoch,transition,committed_at) VALUES($1::uuid,$2,$3,$4::uuid,$5::bigint,$6,'UPLOADED',$7::timestamptz)`,randomUUID(),facts.intentId,facts.mediaRef,jobId,facts.generation,epoch,now);
   return receipt(command.intentId,rows[0]);
  }).catch(conflict);
 }
 /** Bounded scan of known seal projections only; every confirm revalidates source
  * and owner. Cursor is lexical intent ID; no storage-list recovery. */
 async pending(limit:number,afterIntentId=''):Promise<AcceptanceCommand[]>{
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new AcceptanceError('INVALID_ARGUMENT');
  const rows=await this.transactions.run(tx=>tx.query<{intent_id:string;facts:Record<string,unknown>}>(`SELECT i.intent_id,i.facts FROM media_acceptance_intent i LEFT JOIN media_acceptance_receipt r USING(intent_id) WHERE r.intent_id IS NULL AND i.intent_id>$1 ORDER BY i.intent_id LIMIT $2`,afterIntentId,limit));
  return rows.map(r=>{const f=decoded(r.facts);return {intentId:r.intent_id,operationId:`accept:${fingerprint({intentId:r.intent_id})}`,generation:f.generation,expectedRevision:f.expectedRevision};});
 }
}
