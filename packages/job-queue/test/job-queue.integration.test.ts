import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createPrismaClient, PrismaTransactions } from '../src/prisma-transactions.js';
import { JobQueuePostgres, LocalSlots, fingerprint } from '../src/job-queue.js';
import { type RecoveryAuthority, type ResourcePolicy, type JobSpec, type SqlTransaction, QueueError } from '../src/contracts.js';
const client=createPrismaClient(process.env.DATABASE_URL!);
const txs=new PrismaTransactions(client,5000);
// Test-only authority is deliberately outside the restored database timeline.
class TestAuthority implements RecoveryAuthority {
 epoch='external-epoch-1'; revision=0; blocked=false; available=true;
 async acquire(scopes:readonly string[]){
  if(!this.available||this.blocked)throw new QueueError('AUTHORITY_UNAVAILABLE');
  const epoch=this.epoch,revision=this.revision;
  return {epoch,assertCurrent:(_scope:string)=>{if(!this.available||this.blocked||epoch!==this.epoch||revision!==this.revision)throw new QueueError('AUTHORITY_UNAVAILABLE');},release:async()=>{}};
 }
}
const authority=new TestAuthority();
const policy:ResourcePolicy={async lockAndAuthorize(tx,ref,generation){
 const rows=await tx.query<{generation:bigint;blocked:boolean}>(`SELECT generation,blocked FROM test_resource WHERE ref=$1 FOR UPDATE`,ref);
 return rows.length===1&&!rows[0].blocked&&rows[0].generation===generation;
}};
let slots:LocalSlots,queue:JobQueuePostgres;
function spec(ref='r', overrides:Partial<JobSpec>={}):JobSpec{return {type:'TEST',handlerVersion:'1',resourceRef:ref,generation:1n,dedupKey:randomUUID(),queue:'media',priority:1,payload:{safe:'value'},availableAt:new Date(0),...overrides};}
async function publish(s=spec()){return txs.run(tx=>queue.publish(tx,s));}
async function reserve(ms=10000){return queue.reserve(['media'],'worker',1,ms);}
async function sql(text:string,...params:unknown[]){return txs.run(tx=>tx.execute(text,...params));}
async function count(table:string){const r=await txs.run(tx=>tx.query<{n:bigint}>(`SELECT count(*)::bigint n FROM ${table}`));return Number(r[0].n);}
const effect=(tx:SqlTransaction)=>tx.execute(`INSERT INTO test_effect(kind) VALUES('domain'),('audit')`).then(()=>{});
beforeAll(async()=>{await sql(`CREATE TABLE test_resource(ref text PRIMARY KEY,generation bigint NOT NULL,blocked boolean NOT NULL DEFAULT false)`);await sql(`CREATE TABLE test_effect(id bigserial PRIMARY KEY,kind text NOT NULL)`);});
afterAll(async()=>{await client.$disconnect();});
beforeEach(async()=>{
 await sql('TRUNCATE job_receipt,job_attempt,job_queue,test_resource,test_effect RESTART IDENTITY');
 await sql(`INSERT INTO test_resource(ref,generation) VALUES('r',1),('other',1)`);
 authority.epoch='external-epoch-1';authority.revision=0;authority.blocked=false;authority.available=true;
 slots=new LocalSlots(4);queue=new JobQueuePostgres(txs,authority,policy,slots,{candidateScanLimit:32});
});
describe('EL-TK-055 real PostgreSQL 16',()=>{
 it('idempotent publish fingerprints include full payload and scheduling',async()=>{const s=spec();const id=await publish(s);expect(await publish(s)).toBe(id);await expect(publish({...s,payload:{safe:'different'}})).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});expect(await count('job_queue')).toBe(1);});
 it('domain/audit/publish roll back together',async()=>{await expect(txs.run(async tx=>{await effect(tx);await queue.publish(tx,spec());throw Error('rollback');})).rejects.toThrow('rollback');expect(await count('job_queue')).toBe(0);expect(await count('test_effect')).toBe(0);});
 it('concurrent workers have one execution winner',async()=>{await publish();const another=new JobQueuePostgres(txs,authority,policy,new LocalSlots(2),{candidateScanLimit:32});const groups=await Promise.all([reserve(),another.reserve(['media'],'second',1,10000)]);expect(groups.flatMap(g=>g.jobs)).toHaveLength(1);expect(await count('job_attempt')).toBe(1);groups.forEach(g=>g.releaseAfterQuiescence());});
 it('overlapping reserves never exceed local slots and CAS loss does not release physical capacity',async()=>{
  for(let i=0;i<8;i++)await publish();const oneSlot=new LocalSlots(1);const q=new JobQueuePostgres(txs,authority,policy,oneSlot,{candidateScanLimit:32});
  const groups=await Promise.all(Array.from({length:8},()=>q.reserve(['media'],'w',1,10000)));expect(groups.flatMap(g=>g.jobs)).toHaveLength(1);expect(oneSlot.inUse).toBe(1);
  const job=groups.flatMap(g=>g.jobs)[0];await sql('UPDATE job_queue SET cancelled=true WHERE id=$1::uuid',job.jobId);await expect(q.heartbeat(job,10000)).rejects.toMatchObject({code:'LEASE_LOST'});expect(oneSlot.inUse).toBe(1);groups.forEach(g=>{g.releaseAfterQuiescence();g.releaseAfterQuiescence();});expect(oneSlot.inUse).toBe(0);
 });
 it('DB clock excludes future, expired, cancelled, invalid-generation and blocked resources',async()=>{
  await publish(spec('r',{availableAt:new Date(Date.now()+3600000)}));await publish(spec('r',{deadline:new Date(1)}));const id=await publish();await sql('UPDATE job_queue SET cancelled=true WHERE id=$1::uuid',id);await publish(spec('r',{generation:2n}));await publish(spec('other'));await sql("UPDATE test_resource SET blocked=true WHERE ref='other'");
  expect((await queue.reserve(['media'],'w',4,10000)).jobs).toHaveLength(0);
 });
 it('DB clock lease remains authoritative independent of client clock',async()=>{await publish();const g=await reserve();const r=await txs.run(tx=>tx.query<{delta:number}>('SELECT EXTRACT(EPOCH FROM (lease_until-clock_timestamp()))::float8 delta FROM job_queue'));expect(r[0].delta).toBeGreaterThan(8);expect(r[0].delta).toBeLessThanOrEqual(10);g.releaseAfterQuiescence();});
 it('SKIP LOCKED excludes locked job without waiting for unrelated resource',async()=>{
  const locked=await publish(spec('r',{priority:100}));await publish(spec('other',{priority:1}));let unlock!:()=>void;let ready!:()=>void;const signal=new Promise<void>(r=>ready=r);const hold=new Promise<void>(r=>unlock=r);
  const lock=txs.run(async tx=>{await tx.query('SELECT id FROM job_queue WHERE id=$1::uuid FOR UPDATE',locked);ready();await hold;});await signal;
  try{const g=await queue.reserve(['media'],'w',1,10000);expect(g.jobs).toHaveLength(1);expect(g.jobs[0].resourceRef).toBe('other');g.releaseAfterQuiescence();}finally{unlock();await lock;}
 });
 it('reserve rollback does not persist execution or consume slot',async()=>{await publish();const denied:ResourcePolicy={async lockAndAuthorize(){throw Error('policy failure');}};const q=new JobQueuePostgres(txs,authority,denied,slots,{candidateScanLimit:32});await expect(q.reserve(['media'],'w',1,10000)).rejects.toThrow('policy failure');expect(slots.inUse).toBe(0);expect(await count('job_attempt')).toBe(0);});
 it('heartbeat renews only matching owner/token/fence/generation/epoch',async()=>{await publish();const g=await reserve();const j=g.jobs[0];const renewed=await queue.heartbeat(j,20000);expect(renewed.getTime()).toBeGreaterThan(j.leaseUntil.getTime());for(const patch of [{owner:'other'},{token:randomUUID()},{fence:j.fence+1n},{generation:2n},{epoch:'old'}])await expect(queue.heartbeat({...j,...patch},10000)).rejects.toMatchObject({code:'LEASE_LOST'});g.releaseAfterQuiescence();});
 it('expired heartbeat and completion cannot resurrect execution',async()=>{await publish();const g=await reserve();const j=g.jobs[0];await sql("UPDATE job_queue SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1::uuid",j.jobId);await expect(queue.heartbeat(j,10000)).rejects.toMatchObject({code:'LEASE_LOST'});await expect(queue.complete(j,'result',{},effect)).rejects.toMatchObject({code:'LEASE_LOST'});expect(await count('test_effect')).toBe(0);g.releaseAfterQuiescence();});
 it('current resource barrier rejects heartbeat and promotion',async()=>{await publish();const g=await reserve();await sql("UPDATE test_resource SET blocked=true WHERE ref='r'");await expect(queue.heartbeat(g.jobs[0],10000)).rejects.toMatchObject({code:'LEASE_LOST'});await expect(queue.complete(g.jobs[0],'r',{},effect)).rejects.toMatchObject({code:'LEASE_LOST'});g.releaseAfterQuiescence();});
 it('authority unavailable/PREPARED barrier fails closed for every operation',async()=>{await publish();authority.available=false;await expect(reserve()).rejects.toMatchObject({code:'AUTHORITY_UNAVAILABLE'});authority.available=true;const g=await reserve();authority.blocked=true;await expect(queue.heartbeat(g.jobs[0],10000)).rejects.toMatchObject({code:'AUTHORITY_UNAVAILABLE'});await expect(queue.complete(g.jobs[0],'r',{},effect)).rejects.toMatchObject({code:'AUTHORITY_UNAVAILABLE'});g.releaseAfterQuiescence();});
 it('restored execution with identical counters cannot cross independent epoch',async()=>{await publish();const g=await reserve();const old=g.jobs[0];const snapshot=await txs.run(tx=>tx.query<{token:string;fence:bigint;epoch:string}>('SELECT token,fence,epoch FROM job_queue WHERE id=$1::uuid',old.jobId));authority.epoch='post-restore-epoch';// Snapshot row intentionally left/restored unchanged, including matching counter/token.
  await sql('UPDATE job_queue SET token=$2::uuid,fence=$3::bigint,epoch=$4 WHERE id=$1::uuid',old.jobId,snapshot[0].token,snapshot[0].fence,snapshot[0].epoch);
  await expect(queue.heartbeat(old,10000)).rejects.toMatchObject({code:'LEASE_LOST'});await expect(queue.complete(old,'restored',{},effect)).rejects.toMatchObject({code:'LEASE_LOST'});expect(await count('test_effect')).toBe(0);g.releaseAfterQuiescence();});
 it('completion commits domain/audit/receipt/job atomically and ACK retry is idempotent',async()=>{await publish();const g=await reserve();const j=g.jobs[0];expect(await queue.complete(j,'result',{ref:'opaque'},effect)).toBe('COMPLETED');expect(await queue.complete(j,'result',{ref:'opaque'},effect)).toBe('ALREADY_COMMITTED');expect(await count('test_effect')).toBe(2);expect(await count('job_receipt')).toBe(1);await expect(queue.complete(j,'result',{ref:'different'},effect)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});g.releaseAfterQuiescence();});
 it('two concurrent completion ACKs execute effect once',async()=>{await publish();const g=await reserve();const j=g.jobs[0];const r=await Promise.all([queue.complete(j,'same',{},effect),queue.complete(j,'same',{},effect)]);expect(r.sort()).toEqual(['ALREADY_COMMITTED','COMPLETED']);expect(await count('test_effect')).toBe(2);g.releaseAfterQuiescence();});
 it('effect failure rolls back receipt/job/attempt/domain/audit',async()=>{await publish();const g=await reserve();await expect(queue.complete(g.jobs[0],'bad',{},async tx=>{await effect(tx);throw Error('effect failure');})).rejects.toThrow('effect failure');expect(await count('test_effect')).toBe(0);expect(await count('job_receipt')).toBe(0);expect(await queue.complete(g.jobs[0],'good',{},effect)).toBe('COMPLETED');g.releaseAfterQuiescence();});
 it('lease expiring during effect rolls the whole transaction back',async()=>{await publish();const g=await reserve(150);await expect(queue.complete(g.jobs[0],'expired',{},async tx=>{await effect(tx);await tx.query('SELECT pg_sleep(0.2)::text AS waited');})).rejects.toMatchObject({code:'LEASE_LOST'});expect(await count('test_effect')).toBe(0);expect(await count('job_receipt')).toBe(0);g.releaseAfterQuiescence();});
 it('authority invalidation during SQL prevents commit and cannot use cached admission',async()=>{await publish();const g=await reserve();await expect(queue.complete(g.jobs[0],'revoked',{},async tx=>{await effect(tx);authority.revision++;})).rejects.toMatchObject({code:'AUTHORITY_UNAVAILABLE'});expect(await count('test_effect')).toBe(0);authority.blocked=true;await expect(reserve()).rejects.toMatchObject({code:'AUTHORITY_UNAVAILABLE'});g.releaseAfterQuiescence();});
 it('retry is fenced and preserves attempt history without implementing recovery policy',async()=>{await publish();const g=await reserve();const j=g.jobs[0];await expect(queue.retry({...j,fence:99n},'retry',{},new Date(0),'RETRYING',effect)).rejects.toMatchObject({code:'LEASE_LOST'});expect(await queue.retry(j,'retry',{reason:'TRANSIENT'},new Date(0),'RETRYING',effect)).toBe('COMPLETED');g.releaseAfterQuiescence();const next=await reserve();expect(next.jobs[0].attempt).toBe(2);expect(next.jobs[0].fence).toBe(j.fence+1n);expect(next.jobs[0].token).not.toBe(j.token);await expect(queue.complete(j,'late',{},effect)).rejects.toMatchObject({code:'LEASE_LOST'});expect(await count('job_attempt')).toBe(2);next.releaseAfterQuiescence();});
 it('SQL parameterization handles hostile references without injecting statements',async()=>{const ref="resource';DROP TABLE job_queue;--";await sql('INSERT INTO test_resource(ref,generation) VALUES($1,1)',ref);await publish(spec(ref));const g=await reserve();expect(g.jobs[0].resourceRef).toBe(ref);expect(await count('job_queue')).toBe(1);g.releaseAfterQuiescence();});
 it('validates slot and duration configuration instead of unbounded execution',async()=>{expect(()=>new LocalSlots(0)).toThrow();await expect(queue.reserve(['media'],'w',1,0)).rejects.toMatchObject({code:'INVALID_ARGUMENT'});expect(fingerprint({b:1,a:2})).toBe(fingerprint({a:2,b:1}));});
 it('bounded candidate scan skips policy-blocked head with one available slot preserving priority',async()=>{
  await publish(spec('r',{priority:100}));await publish(spec('other',{priority:1}));await sql("UPDATE test_resource SET blocked=true WHERE ref='r'");
  const g=await queue.reserve(['media'],'w',1,10000);expect(g.jobs).toHaveLength(1);expect(g.jobs[0].resourceRef).toBe('other');g.releaseAfterQuiescence();
 });
 it('returns exact handler version required for worker dispatch',async()=>{await publish(spec('r',{handlerVersion:'v-special-2'}));const g=await reserve();expect(g.jobs[0].handlerVersion).toBe('v-special-2');g.releaseAfterQuiescence();});
 it('receipt fingerprint binds resource identity on ACK replay',async()=>{await publish();const g=await reserve();await queue.complete(g.jobs[0],'bound',{},effect);await expect(queue.complete({...g.jobs[0],resourceRef:'other'},'bound',{},effect)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});g.releaseAfterQuiescence();}); it('bounded denied window advances across polls rather than starving valid tail',async()=>{
  for(let i=0;i<33;i++)await publish(spec('r',{priority:100}));await publish(spec('other',{priority:1}));await sql("UPDATE test_resource SET blocked=true WHERE ref='r'");
  expect((await queue.reserve(['media'],'w',1,10000)).jobs).toHaveLength(0);
  const g=await queue.reserve(['media'],'w',1,10000);expect(g.jobs).toHaveLength(1);expect(g.jobs[0].resourceRef).toBe('other');g.releaseAfterQuiescence();
 });
  it('recoverExpiredLeases reclaims abandoned leases, fences stale worker, and caps budget at maxAttempts',async()=>{
   await publish();
   const g=await reserve();
   const j=g.jobs[0];
   await sql("UPDATE job_queue SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1::uuid",j.jobId);
   const recovered=await queue.recoverExpiredLeases({maxAttempts:3,backoffMs:0});
   expect(recovered).toHaveLength(1);
   expect(recovered[0].disposition).toBe('RETRYING');
   await expect(queue.complete(j,'stale',{},effect)).rejects.toMatchObject({code:'LEASE_LOST'});
   await expect(queue.heartbeat(j,10000)).rejects.toMatchObject({code:'LEASE_LOST'});
   g.releaseAfterQuiescence();
   const g2=await reserve();
   expect(g2.jobs[0].attempt).toBe(2);
   await sql("UPDATE job_queue SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1::uuid",j.jobId);
   await queue.recoverExpiredLeases({maxAttempts:3,backoffMs:0});
   g2.releaseAfterQuiescence();
   const g3=await reserve();
   expect(g3.jobs[0].attempt).toBe(3);
   await sql("UPDATE job_queue SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1::uuid",j.jobId);
   const exhausted=await queue.recoverExpiredLeases({maxAttempts:3});
   expect(exhausted).toHaveLength(1);
   expect(exhausted[0].disposition).toBe('DEAD');
   g3.releaseAfterQuiescence();
   const empty=await queue.reserve(['media'],'w4',1,10000);
   expect(empty.jobs).toHaveLength(0);
   empty.releaseAfterQuiescence();
  });
});
