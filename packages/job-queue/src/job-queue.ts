import { createHash, randomUUID } from 'node:crypto';
import { type Json, type Execution, type JobSpec, type RecoveryAuthority, type ResourcePolicy, type SqlTransaction, type TransactionRunner, type RestrictionBinding, type RestrictionPermit, QueueError } from './contracts.js';
function canonical(value: unknown): string {
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if (value && typeof value==='object') return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
  const encoded=JSON.stringify(value); if(encoded===undefined) throw new QueueError('INVALID_ARGUMENT'); return encoded;
}
export function fingerprint(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function restrictionBinding(job:Execution,operationId:string,outcome:Json):RestrictionBinding {
  if(!operationId)throw new QueueError('INVALID_ARGUMENT');
  return {operationId,resourceRef:job.resourceRef,epoch:job.epoch,fingerprint:fingerprint({jobId:job.jobId,resourceRef:job.resourceRef,owner:job.owner,token:job.token,fence:job.fence,epoch:job.epoch,generation:job.generation,outcome,disposition:'RESTRICTION_CHECKPOINT'})};
}
function positive(value: number): void { if (!Number.isSafeInteger(value)||value<=0) throw new QueueError('INVALID_ARGUMENT'); }
interface Row {id:string; resource_ref:string; generation:bigint; queue:string; type:string; handler_version:string; payload:Json; attempt:number; fence:bigint; owner:string; token:string; epoch:string; lease_until:Date;}
function execution(row:Row):Execution {return {jobId:row.id,resourceRef:row.resource_ref,generation:row.generation,queue:row.queue,type:row.type,handlerVersion:row.handler_version,payload:row.payload,attempt:row.attempt,fence:row.fence,owner:row.owner,token:row.token,epoch:row.epoch,leaseUntil:row.lease_until};}
/** Local admission is synchronous so overlapping reserve calls never overbook this process.
 * Capacity is held until explicit physical quiescence; lease/CAS loss alone never releases it. */
export class LocalSlots {
  private occupied=0;
  constructor(readonly capacity:number){positive(capacity);}
  take(requested:number):number {positive(requested);const n=Math.min(requested,this.capacity-this.occupied);this.occupied+=n;return n;}
  release(count:number):void {if(!Number.isSafeInteger(count)||count<0||count>this.occupied) throw new QueueError('INVALID_ARGUMENT');this.occupied-=count;}
  get inUse():number{return this.occupied;}
}
export interface Reservation { readonly jobs:readonly Execution[]; /** Caller must first stop/drain physical work. */ releaseAfterQuiescence():void; }
export interface RecoverExpiredOptions { queues?: readonly string[]; maxAttempts?: number; backoffMs?: number | ((attempt: number) => number); limit?: number; }
export interface RecoveredLease { jobId: string; resourceRef: string; generation: bigint; queue: string; previousAttempt: number; disposition: 'RETRYING' | 'DEAD'; retryAt: Date | null; }
interface ScanCursor {priority:number;available_at:Date;id:string;}
export class JobQueuePostgres {
  // Fairness hint only, never authority. Denied windows advance, then wrap; bounded by configured scan budget.
  private readonly scanCursors=new Map<string,ScanCursor>();
  constructor(private readonly transactions:TransactionRunner, private readonly authority:RecoveryAuthority, private readonly policy:ResourcePolicy, private readonly slots:LocalSlots, private readonly options:{candidateScanLimit:number}) {positive(options.candidateScanLimit);}
  /** Called within the owner's existing domain/audit UnitOfWork; not a business handler. */
  async publish(tx:SqlTransaction,spec:JobSpec):Promise<string> {
    if(!spec.type||!spec.handlerVersion||!spec.resourceRef||!spec.queue||!spec.dedupKey||spec.generation<0n||!Number.isSafeInteger(spec.priority)||!Number.isFinite(spec.availableAt.getTime())||(spec.deadline&&!Number.isFinite(spec.deadline.getTime()))) throw new QueueError('INVALID_ARGUMENT');
    const hash=fingerprint(spec); const id=randomUUID();
    const rows=await tx.query<{id:string;fingerprint:string}>(`INSERT INTO job_queue(id,dedup_key,fingerprint,type,handler_version,resource_ref,generation,queue,priority,payload,available_at,deadline)
      VALUES($1::uuid,$2,$3,$4,$5,$6,$7::bigint,$8,$9,$10::jsonb,$11::timestamptz,$12::timestamptz)
      ON CONFLICT(dedup_key) DO UPDATE SET dedup_key=EXCLUDED.dedup_key RETURNING id,fingerprint`,id,spec.dedupKey,hash,spec.type,spec.handlerVersion,spec.resourceRef,spec.generation,spec.queue,spec.priority,JSON.stringify(spec.payload),spec.availableAt,spec.deadline??null);
    if(rows[0].fingerprint!==hash)throw new QueueError('IDEMPOTENCY_CONFLICT');return rows[0].id;
  }
  async reserve(queues:readonly string[],owner:string,batch:number,leaseMs:number):Promise<Reservation> {
    positive(batch);positive(leaseMs);if(!owner||!queues.length||queues.some(q=>!q))throw new QueueError('INVALID_ARGUMENT');
    const allocated=this.slots.take(batch);if(!allocated)return {jobs:[],releaseAfterQuiescence(){}};
    try {
      // Short candidate-only SKIP LOCKED scan commits before policy locking. Actual claim rechecks eligibility; no resource locks overlap this preliminary transaction.
      const scanKey=JSON.stringify([...new Set(queues)].sort());
      const cursor=this.scanCursors.get(scanKey);
      const candidates=await this.transactions.run(tx=>tx.query<{id:string;resource_ref:string;generation:bigint;priority:number;available_at:Date}>(`SELECT id,resource_ref,generation,priority,available_at FROM job_queue WHERE queue=ANY($1::text[]) AND status IN ('PENDING','RETRYING') AND NOT cancelled AND available_at<=clock_timestamp() AND (deadline IS NULL OR deadline>clock_timestamp()) AND ($3::integer IS NULL OR priority<$3 OR (priority=$3 AND (available_at>$4::timestamptz OR (available_at=$4::timestamptz AND id>$5::uuid)))) ORDER BY priority DESC,available_at,id LIMIT $2 FOR UPDATE SKIP LOCKED`,[...queues],this.options.candidateScanLimit,cursor?.priority??null,cursor?.available_at??null,cursor?.id??null));
      const permit=await this.authority.acquire(candidates.map(c=>c.resource_ref));
      let jobs:Execution[];
      try {jobs=await this.transactions.run(async tx=>{
        const claimed:Execution[]=[];
        // Stable ordering of scope locks avoids inversion for multi-resource batches.
        const authorized=new Set<string>();
        for(const c of [...candidates].sort((a,b)=>a.resource_ref.localeCompare(b.resource_ref)||a.id.localeCompare(b.id))){
          permit.assertCurrent(c.resource_ref);
          if(await this.policy.lockAndAuthorize(tx,c.resource_ref,c.generation,'RESERVE'))authorized.add(c.id);
        }
        // Selection still follows queue priority; all resource locks precede all job locks.
        for(const c of candidates){
          if(claimed.length>=allocated)break;
          if(!authorized.has(c.id))continue;          const rows=await tx.query<Row>(`WITH eligible AS (SELECT id FROM job_queue WHERE id=$1::uuid AND generation=$2::bigint AND resource_ref=$7 AND status IN ('PENDING','RETRYING') AND NOT cancelled AND available_at<=clock_timestamp() AND (deadline IS NULL OR deadline>clock_timestamp()) FOR UPDATE SKIP LOCKED)
            UPDATE job_queue j SET status='PROCESSING',attempt=attempt+1,fence=fence+1,owner=$3,token=$4::uuid,epoch=$5,lease_until=clock_timestamp()+$6::double precision*interval '1 millisecond' FROM eligible e WHERE j.id=e.id RETURNING j.*`,c.id,c.generation,owner,randomUUID(),permit.epoch,leaseMs,c.resource_ref);
          if(!rows.length)continue;const row=rows[0];
          await tx.execute(`INSERT INTO job_attempt(token,job_id,number,fence,owner,epoch,generation,started_at) VALUES($1::uuid,$2::uuid,$3,$4::bigint,$5,$6,$7::bigint,clock_timestamp())`,row.token,row.id,row.attempt,row.fence,row.owner,row.epoch,row.generation);
          claimed.push(execution(row));
        }
        for(const job of claimed)permit.assertCurrent(job.resourceRef);
        return claimed;
      });}finally{await permit.release();}
      if(!jobs.length&&candidates.length===this.options.candidateScanLimit){const last=candidates.at(-1)!;this.scanCursors.set(scanKey,{priority:last.priority,available_at:last.available_at,id:last.id});}else{this.scanCursors.delete(scanKey);}
      this.slots.release(allocated-jobs.length);let released=false;
      return {jobs,releaseAfterQuiescence:()=>{if(!released){released=true;this.slots.release(jobs.length);}}};
    }catch(error){this.slots.release(allocated);throw error;}
  }
  private async authorized<T>(job:Execution,operation:'HEARTBEAT'|'COMPLETE'|'RETRY',work:(tx:SqlTransaction)=>Promise<T>):Promise<T> {
    const permit=await this.authority.acquire([job.resourceRef]);
    try{return await this.transactions.run(async tx=>{
      permit.assertCurrent(job.resourceRef);
      if(permit.epoch!==job.epoch||!await this.policy.lockAndAuthorize(tx,job.resourceRef,job.generation,operation))throw new QueueError('LEASE_LOST');
      const result=await work(tx);permit.assertCurrent(job.resourceRef);return result;
    });}finally{await permit.release();}
  }
  private async lockExecution(tx:SqlTransaction,job:Execution):Promise<void>{
    const rows=await tx.query<{id:string}>(`SELECT id FROM job_queue WHERE id=$1::uuid AND resource_ref=$2 AND generation=$3::bigint AND owner=$4 AND token=$5::uuid AND fence=$6::bigint AND epoch=$7 AND status='PROCESSING' AND NOT cancelled AND lease_until>clock_timestamp() AND (deadline IS NULL OR deadline>clock_timestamp()) FOR UPDATE`,job.jobId,job.resourceRef,job.generation,job.owner,job.token,job.fence,job.epoch);
    if(!rows.length)throw new QueueError('LEASE_LOST');
  }
  async heartbeat(job:Execution,leaseMs:number):Promise<Date>{positive(leaseMs);return this.authorized(job,'HEARTBEAT',async tx=>{
    await this.lockExecution(tx,job);
    const rows=await tx.query<{lease_until:Date}>(`UPDATE job_queue SET lease_until=clock_timestamp()+$2::double precision*interval '1 millisecond' WHERE id=$1::uuid AND lease_until>clock_timestamp() AND (deadline IS NULL OR deadline>clock_timestamp()) RETURNING lease_until`,job.jobId,leaseMs);
    if(!rows.length)throw new QueueError('LEASE_LOST');return rows[0].lease_until;
  });}
  /** Effect MUST contain only domain/audit database changes using supplied tx. No external I/O. */
  /** Intermediate owner checkpoint; never completes/renews a job or releases its slot. */
  async checkpoint(job:Execution,operationId:string,outcome:Json,effect:(tx:SqlTransaction)=>Promise<void>,lockOwner?:(tx:SqlTransaction)=>Promise<void>):Promise<'COMMITTED'|'ALREADY_COMMITTED'>{
    if(!operationId)throw new QueueError('INVALID_ARGUMENT');
    const hash=fingerprint({jobId:job.jobId,resourceRef:job.resourceRef,token:job.token,fence:job.fence,epoch:job.epoch,generation:job.generation,outcome,disposition:'CHECKPOINT'});
    return this.authorized(job,'COMPLETE',async tx=>{
      if(lockOwner)await lockOwner(tx);
      await this.lockExecution(tx,job);
      const receipt=await tx.query<{fingerprint:string}>(`SELECT fingerprint FROM job_receipt WHERE operation_id=$1`,operationId);
      if(receipt.length){if(receipt[0].fingerprint!==hash)throw new QueueError('IDEMPOTENCY_CONFLICT');return 'ALREADY_COMMITTED';}
      await effect(tx);
      await this.lockExecution(tx,job);
      await tx.execute(`INSERT INTO job_receipt(operation_id,job_id,token,fingerprint,disposition,outcome,committed_at) VALUES($1,$2::uuid,$3::uuid,$4,'CHECKPOINT',$5::jsonb,clock_timestamp())`,operationId,job.jobId,job.token,hash,JSON.stringify(outcome));
      return 'COMMITTED';
    });
  }
  /** Database-only restrictive owner checkpoint. The same authority's narrowly
   * bound PREPARE capability replaces normal admission through its own barrier.
   * Does not finish/renew the job, cancel physical writers or release slots.
   * Caller ACKs the durable authority after SQL; uncertain ACK remains closed. */
  async restrictionCheckpoint(job:Execution,operationId:string,outcome:Json,permit:RestrictionPermit,lockOwner:(tx:SqlTransaction)=>Promise<void>,effect:(tx:SqlTransaction)=>Promise<void>):Promise<'COMMITTED'|'ALREADY_COMMITTED'>{
    const binding=restrictionBinding(job,operationId,outcome);
    const assert=()=>{
      if(permit.epoch!==job.epoch||!permit.sequence||fingerprint(permit.binding)!==fingerprint(binding))throw new QueueError('AUTHORITY_UNAVAILABLE');
      permit.assertRestriction(binding);permit.assertCurrent(job.resourceRef);
    };
    assert();
    if(!this.policy.lockAndAuthorizeRestriction)throw new QueueError('AUTHORITY_UNAVAILABLE');
    return this.transactions.run(async tx=>{
      assert();
      if(!await this.policy.lockAndAuthorizeRestriction!(tx,job.resourceRef,job.generation))throw new QueueError('LEASE_LOST');
      await lockOwner(tx);
      // Serialize receipt lookup even after this attempt's lease has expired.
      await tx.query('SELECT id FROM job_queue WHERE id=$1::uuid FOR UPDATE',job.jobId);
      const receipts=await tx.query<{fingerprint:string}>(`SELECT fingerprint FROM job_receipt WHERE operation_id=$1`,operationId);
      if(receipts.length){if(receipts[0].fingerprint!==binding.fingerprint)throw new QueueError('IDEMPOTENCY_CONFLICT');assert();return 'ALREADY_COMMITTED';}
      await this.lockExecution(tx,job);
      await effect(tx);
      await this.lockExecution(tx,job);
      await tx.execute(`INSERT INTO job_receipt(operation_id,job_id,token,fingerprint,disposition,outcome,committed_at) VALUES($1,$2::uuid,$3::uuid,$4,'CHECKPOINT',$5::jsonb,clock_timestamp())`,operationId,job.jobId,job.token,binding.fingerprint,JSON.stringify(outcome));
      assert();return 'COMMITTED';
    });
  }
  async complete(job:Execution,operationId:string,outcome:Json,effect:(tx:SqlTransaction)=>Promise<void>,lockOwner?:(tx:SqlTransaction)=>Promise<void>):Promise<'COMPLETED'|'ALREADY_COMMITTED'>{return this.finish(job,operationId,outcome,'COMPLETED',null,effect,lockOwner);}
  /** Retry scheduling/disposition is supplied by owner038; budget and recovery are implemented here and coordinated with owner policy. */
  async retry(job:Execution,operationId:string,outcome:Json,retryAt:Date|null,disposition:'RETRYING'|'FAILED'|'DEAD',effect:(tx:SqlTransaction)=>Promise<void>,lockOwner?:(tx:SqlTransaction)=>Promise<void>):Promise<'COMPLETED'|'ALREADY_COMMITTED'>{
    if(disposition==='RETRYING'&&(!retryAt||!Number.isFinite(retryAt.getTime())))throw new QueueError('INVALID_ARGUMENT');return this.finish(job,operationId,outcome,disposition,retryAt,effect,lockOwner);
  }
  async recoverExpiredLeases(options?:RecoverExpiredOptions):Promise<RecoveredLease[]>{
    const maxAttempts=options?.maxAttempts??3;positive(maxAttempts);
    const limit=options?.limit??32;positive(limit);
    const queues=options?.queues&&options.queues.length?[...new Set(options.queues)].sort():null;
    return this.transactions.run(async tx=>{
      const candidates=await tx.query<Row>(`SELECT id,resource_ref,generation,queue,type,handler_version,payload,attempt,fence,owner,token,epoch,lease_until FROM job_queue WHERE status='PROCESSING' AND lease_until<=clock_timestamp() AND NOT cancelled AND ($1::text[] IS NULL OR queue=ANY($1::text[])) ORDER BY priority DESC,available_at,id LIMIT $2 FOR UPDATE SKIP LOCKED`,queues,limit);
      const recovered:RecoveredLease[]=[];
      for(const row of candidates){
        const isExhausted=row.attempt>=maxAttempts;
        const disposition=isExhausted?'DEAD':'RETRYING';
        let retryAt:Date|null=null;
        if(!isExhausted){
          const delayMs=typeof options?.backoffMs==='function'?options.backoffMs(row.attempt):(options?.backoffMs??5000);
          positive(typeof delayMs==='number'?Math.max(1,delayMs):1);
          const delay=typeof delayMs==='number'?delayMs:5000;
          const [{next_time}]=await tx.query<{next_time:Date}>(`SELECT clock_timestamp()+$1::double precision*interval '1 millisecond' AS next_time`,delay);
          retryAt=next_time;
        }
        await tx.execute(`UPDATE job_queue SET status=$2,fence=fence+1,owner=NULL,token=NULL,lease_until=NULL,available_at=COALESCE($3::timestamptz,available_at) WHERE id=$1::uuid AND status='PROCESSING' AND lease_until<=clock_timestamp()`,row.id,disposition,retryAt);
        await tx.execute(`UPDATE job_attempt SET ended_at=clock_timestamp(),result=$2 WHERE token=$1::uuid AND ended_at IS NULL`,row.token,disposition==='DEAD'?'DEAD':'ABANDONED_LEASE');
        recovered.push({jobId:row.id,resourceRef:row.resource_ref,generation:row.generation,queue:row.queue,previousAttempt:row.attempt,disposition,retryAt});
      }
      return recovered;
    });
  }
  private async finish(job:Execution,operationId:string,outcome:Json,disposition:string,retryAt:Date|null,effect:(tx:SqlTransaction)=>Promise<void>,lockOwner?:(tx:SqlTransaction)=>Promise<void>):Promise<'COMPLETED'|'ALREADY_COMMITTED'>{
    if(!operationId)throw new QueueError('INVALID_ARGUMENT');const hash=fingerprint({jobId:job.jobId,resourceRef:job.resourceRef,attempt:job.attempt,token:job.token,owner:job.owner,fence:job.fence,epoch:job.epoch,generation:job.generation,outcome,disposition});
    return this.authorized(job,disposition==='COMPLETED'?'COMPLETE':'RETRY',async tx=>{
      // Owner locks precede job locks, including ACK replay. The ResourcePolicy
      // must already hold common ancestor locks before any owner resource lock.
      if(lockOwner)await lockOwner(tx);
      // Serialize ACK retries by job row before checking receipt; repeated committed attempt need not have a live lease.
      await tx.query(`SELECT id FROM job_queue WHERE id=$1::uuid FOR UPDATE`,job.jobId);
      const receipt=await tx.query<{fingerprint:string}>(`SELECT fingerprint FROM job_receipt WHERE operation_id=$1`,operationId);
      if(receipt.length){if(receipt[0].fingerprint!==hash)throw new QueueError('IDEMPOTENCY_CONFLICT');return 'ALREADY_COMMITTED';}
      await this.lockExecution(tx,job);
      await effect(tx);
      // Recheck DB clock after owner effect: an expired lease cannot commit even within a transaction.
      const updated=await tx.execute(`UPDATE job_queue SET status=$2,available_at=COALESCE($3::timestamptz,available_at),lease_until=NULL WHERE id=$1::uuid AND lease_until>clock_timestamp() AND NOT cancelled AND (deadline IS NULL OR deadline>clock_timestamp())`,job.jobId,disposition,retryAt);
      if(updated!==1)throw new QueueError('LEASE_LOST');
      await tx.execute(`UPDATE job_attempt SET ended_at=clock_timestamp(),result=$2 WHERE token=$1::uuid`,job.token,disposition);
      await tx.execute(`INSERT INTO job_receipt(operation_id,job_id,token,fingerprint,disposition,outcome,committed_at) VALUES($1,$2::uuid,$3::uuid,$4,$5,$6::jsonb,clock_timestamp())`,operationId,job.jobId,job.token,hash,disposition,JSON.stringify(outcome));
      return 'COMPLETED';
    });
  }
}
