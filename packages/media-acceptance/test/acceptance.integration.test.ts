import { createHash } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, it, expect } from 'vitest';
import { createPrismaClient, PrismaTransactions, JobQueuePostgres, LocalSlots, QueueError, type RecoveryAuthority, type TransactionRunner, type SqlTransaction } from '@eventlens/job-queue';
import { MediaAcceptance, type SealedOriginal, type AcceptancePolicy, type AcceptanceLedger, type AcceptanceCommand } from '../src/index.js';
const client=createPrismaClient(process.env.DATABASE_URL!);const txs=new PrismaTransactions(client,10000);
const bytes=Buffer.from('immutable neutral original');const sha256=createHash('sha256').update(bytes).digest('hex');
class Authority implements RecoveryAuthority {
 epoch='epoch-current';revision=0;available=true;blocked=false;
 async acquire(){if(!this.available||this.blocked)throw new QueueError('AUTHORITY_UNAVAILABLE');const e=this.epoch,r=this.revision;return {epoch:e,assertCurrent:()=>{if(!this.available||this.blocked||e!==this.epoch||r!==this.revision)throw new QueueError('AUTHORITY_UNAVAILABLE');},release:async()=>{}};}
}
const authority=new Authority();
const source={async loadVerified(intentId:string):Promise<SealedOriginal>{const r=await txs.run(tx=>tx.query<{facts:SealedOriginal;verified:boolean}>('SELECT facts,verified FROM upstream_seal WHERE intent_id=$1',intentId));if(!r.length||!r[0].verified)throw Error('UNVERIFIED_SEAL');const f=r[0].facts;return {...f,generation:BigInt(f.generation),expectedRevision:BigInt(f.expectedRevision),original:{...f.original,bytes:BigInt(f.original.bytes)}};}};
const policy:AcceptancePolicy={async lockAndAuthorize(tx,f){
 const event=await tx.query<{blocked:boolean}>('SELECT blocked FROM owner_event WHERE ref=$1 FOR UPDATE',f.eventRef);
 const media=await tx.query<{generation:bigint;revision:bigint;guest_ref:string;blocked:boolean}>('SELECT * FROM owner_resource WHERE ref=$1 FOR UPDATE',f.mediaRef);
 return event.length===1&&!event[0].blocked&&media.length===1&&!media[0].blocked&&media[0].generation===f.generation&&media[0].revision===f.expectedRevision&&media[0].guest_ref===f.guestRef;
}};
const ledger:AcceptanceLedger={async commit(tx,f){await tx.execute('INSERT INTO owner_ledger(intent_id,media_ref) VALUES($1,$2)',f.intentId,f.mediaRef);}};
const queue=new JobQueuePostgres(txs,authority,{async lockAndAuthorize(){return false;}},new LocalSlots(1),{candidateScanLimit:8});
const config={type:'MEDIA_INSPECTION',handlerVersion:'1',queue:'media-processing',priority:1};
function service(runner:TransactionRunner=txs,l:AcceptanceLedger=ledger){return new MediaAcceptance(runner,authority,source,policy,l,queue,config);}
const command:AcceptanceCommand={intentId:'intent',operationId:'accept-command',generation:1n,expectedRevision:1n};
function facts(patch:Partial<SealedOriginal>={}):SealedOriginal{return {intentId:'intent',mediaRef:'media',eventRef:'event',guestRef:'guest',generation:1n,expectedRevision:1n,original:{namespace:'private',key:'original/intent/1',version:'sealed-version',sha256,bytes:BigInt(bytes.length)},...patch};}
async function sql(q:string,...args:unknown[]){return txs.run(tx=>tx.execute(q,...args));}
async function count(table:string){return Number((await txs.run(tx=>tx.query<{n:bigint}>(`SELECT count(*)::bigint n FROM ${table}`)))[0].n);}
async function seed(f=facts()){await sql('INSERT INTO upstream_seal(intent_id,facts,verified) VALUES($1,$2::jsonb,true)',f.intentId,JSON.stringify(f,(_k,v)=>typeof v==='bigint'?v.toString():v));}
beforeAll(async()=>{
 await sql('CREATE TABLE upstream_seal(intent_id text PRIMARY KEY,facts jsonb NOT NULL,verified boolean NOT NULL)');
 await sql('CREATE TABLE owner_event(ref text PRIMARY KEY,blocked boolean NOT NULL DEFAULT false)');
 await sql('CREATE TABLE owner_resource(ref text PRIMARY KEY,generation bigint NOT NULL,revision bigint NOT NULL,guest_ref text NOT NULL,blocked boolean NOT NULL DEFAULT false)');
 await sql('CREATE TABLE owner_ledger(intent_id text PRIMARY KEY,media_ref text NOT NULL UNIQUE)');
});
afterAll(async()=>{await client.$disconnect();});
beforeEach(async()=>{
 await sql('TRUNCATE media_acceptance_operation,media_acceptance_audit,media_acceptance_receipt,media_catalog,media_acceptance_intent,job_receipt,job_attempt,job_queue,upstream_seal,owner_ledger,owner_resource,owner_event');
 await sql("INSERT INTO owner_event(ref) VALUES('event')");await sql("INSERT INTO owner_resource(ref,generation,revision,guest_ref) VALUES('media',1,1,'guest')");await seed();
 authority.available=true;authority.blocked=false;authority.epoch='epoch-current';authority.revision=0;
});
it('prepared seal has no accepted media or job; first acceptance commits all effects',async()=>{
 const s=service();await s.prepare('intent');expect(await count('media_catalog')).toBe(0);expect(await count('job_queue')).toBe(0);
 const r=await s.confirm(command);for(const t of ['media_catalog','job_queue','owner_ledger','media_acceptance_receipt','media_acceptance_audit'])expect(await count(t)).toBe(1);
 const rows=await txs.run(tx=>tx.query<{status:string;original:Record<string,unknown>;job_id:string}>('SELECT * FROM media_catalog'));
 expect(rows[0].status).toBe('UPLOADED');expect(rows[0].original).toEqual({...facts().original,bytes:bytes.length.toString()});expect(rows[0].job_id).toBe(r.jobId);expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256);
});
it('repeat preparation and compatible ACK replay preserve every receipt field',async()=>{const s=service();await s.prepare('intent');await s.prepare('intent');const r=await s.confirm(command);expect(await s.confirm(command)).toEqual(r);expect(await count('job_queue')).toBe(1);expect(await count('owner_ledger')).toBe(1);});
it('concurrent confirmations serialize to one receipt and one logical job',async()=>{const s=service();await s.prepare('intent');const rs=await Promise.all(Array.from({length:8},()=>s.confirm(command)));expect(new Set(rs.map(r=>r.jobId)).size).toBe(1);expect(await count('media_acceptance_audit')).toBe(1);expect(await count('job_queue')).toBe(1);});
it('restart/config change returns prior receipt and never reschedules accepted job',async()=>{
 const s=service();await s.prepare('intent');const r=await s.confirm(command);const restarted=new MediaAcceptance(txs,authority,source,policy,ledger,queue,{...config,handlerVersion:'2',queue:'different',priority:99});expect(await restarted.confirm(command)).toEqual(r);
 const job=(await txs.run(tx=>tx.query<{handler_version:string;queue:string;available_at:Date}>('SELECT * FROM job_queue')))[0];expect(job.handler_version).toBe('1');expect(job.queue).toBe(config.queue);expect(job.available_at).toEqual(r.availableAt);
});
it('ledger failure rolls back catalog/job/receipt/audit while preserving seal projection',async()=>{const s=service(txs,{async commit(tx,f){await ledger.commit(tx,f);throw Error('ledger-failure');}});await s.prepare('intent');await expect(s.confirm(command)).rejects.toThrow('ledger-failure');for(const t of ['media_catalog','job_queue','owner_ledger','media_acceptance_receipt','media_acceptance_audit'])expect(await count(t)).toBe(0);expect(await count('media_acceptance_intent')).toBe(1);});
it('real commit then lost ACK replays safely',async()=>{await service().prepare('intent');let lose=true;const runner:TransactionRunner={async run(work){const result=await txs.run(work);if(lose){lose=false;throw Error('ACK_LOST_AFTER_COMMIT');}return result;}};await expect(service(runner).confirm(command)).rejects.toThrow('ACK_LOST');const r=await service(runner).confirm(command);expect(r.jobId).toBeTruthy();expect(await count('owner_ledger')).toBe(1);expect(await count('job_queue')).toBe(1);});
it('crash between durable seal/prepare and acceptance reconciles known intent and original retry',async()=>{const s=service();await s.prepare('intent');const pending=await service().pending(1);expect(pending).toHaveLength(1);const r=await service().confirm(pending[0]);expect(await s.confirm(command)).toEqual(r);expect(await service().pending(1)).toEqual([]);expect(await count('job_queue')).toBe(1);});
it('unverified/missing seal cannot prepare or accept',async()=>{await sql('UPDATE upstream_seal SET verified=false');await expect(service().prepare('intent')).rejects.toThrow('UNVERIFIED_SEAL');await expect(service().confirm(command)).rejects.toThrow('UNVERIFIED_SEAL');expect(await count('media_acceptance_intent')).toBe(0);});
it('confirmation without prepared projection is explicitly rejected',async()=>{await expect(service().confirm(command)).rejects.toMatchObject({code:'NOT_PREPARED'});expect(await count('job_queue')).toBe(0);});
it('incompatible revision/generation conflicts without replacing original',async()=>{const s=service();await s.prepare('intent');await s.confirm(command);for(const patch of [{expectedRevision:2n},{generation:2n}])await expect(s.confirm({...command,...patch})).rejects.toMatchObject({code:'CONFLICT'});expect(await count('job_queue')).toBe(1);});
it('changed original identity conflicts against durable fingerprint',async()=>{const s=service();await s.prepare('intent');await sql(`UPDATE upstream_seal SET facts=jsonb_set(facts,'{original,version}','"different"')`);await expect(s.confirm(command)).rejects.toMatchObject({code:'CONFLICT'});await expect(s.prepare('intent')).rejects.toMatchObject({code:'CONFLICT'});expect(await count('job_queue')).toBe(0);});
it('restrictive event/media barriers deny first commit and receipt replay',async()=>{const s=service();await s.prepare('intent');await sql('UPDATE owner_event SET blocked=true');await expect(s.confirm(command)).rejects.toMatchObject({code:'PERMISSION_DENIED'});await sql('UPDATE owner_event SET blocked=false');await s.confirm(command);await sql('UPDATE owner_resource SET blocked=true');await expect(s.confirm(command)).rejects.toMatchObject({code:'PERMISSION_DENIED'});expect(await count('job_queue')).toBe(1);});
it('stale ownership/revision/generation is denied including replay',async()=>{const s=service();await s.prepare('intent');await s.confirm(command);await sql('UPDATE owner_resource SET generation=2,revision=2');await expect(s.confirm(command)).rejects.toMatchObject({code:'PERMISSION_DENIED'});});
it('authority unavailable/PREPARED restore gap denies even previously accepted receipt',async()=>{const s=service();await s.prepare('intent');await s.confirm(command);authority.available=false;await expect(s.confirm(command)).rejects.toMatchObject({code:'AUTHORITY_UNAVAILABLE'});authority.available=true;authority.blocked=true;await expect(s.confirm(command)).rejects.toMatchObject({code:'AUTHORITY_UNAVAILABLE'});});
it('epoch/revision loss during SQL rolls back all effects',async()=>{const s=service(txs,{async commit(tx,f){await ledger.commit(tx,f);authority.epoch='restore-new-epoch';authority.revision++;}});await s.prepare('intent');await expect(s.confirm(command)).rejects.toMatchObject({code:'AUTHORITY_UNAVAILABLE'});expect(await count('job_queue')).toBe(0);expect(await count('owner_ledger')).toBe(0);});
it('pending recovery remains blocked until restore reconciliation; no snapshot authorization',async()=>{const s=service();await s.prepare('intent');authority.epoch='post-restore';authority.blocked=true;const [cmd]=await s.pending(1);await expect(s.confirm(cmd)).rejects.toMatchObject({code:'AUTHORITY_UNAVAILABLE'});expect(await count('media_catalog')).toBe(0);authority.blocked=false;await s.confirm(cmd);expect(await count('job_queue')).toBe(1);});
it('uniqueness prohibits two intents accepting one media resource',async()=>{await service().prepare('intent');await seed(facts({intentId:'other-intent'}));await expect(service().prepare('other-intent')).rejects.toThrow();expect(await count('media_acceptance_intent')).toBe(1);});
it('bounded cursor validation rejects unlimited scans and returns only matching page',async()=>{const s=service();await s.prepare('intent');await expect(s.pending(0)).rejects.toMatchObject({code:'INVALID_ARGUMENT'});await expect(s.pending(101)).rejects.toMatchObject({code:'INVALID_ARGUMENT'});expect(await s.pending(1,'intent')).toEqual([]);});
it('SQL failure after publish rolls back no orphan job',async()=>{await service().prepare('intent');const broken:TransactionRunner={run(work){return txs.run(tx=>work({query:tx.query.bind(tx),execute:async(q,...p)=>{if(q.startsWith('INSERT INTO media_acceptance_audit'))throw Error('DB_WRITE_LOST');return tx.execute(q,...p);}}));}};await expect(service(broken).confirm(command)).rejects.toThrow('DB_WRITE_LOST');expect(await count('job_queue')).toBe(0);expect(await count('media_catalog')).toBe(0);});
async function otherIntent(){
 await sql("INSERT INTO owner_event(ref) VALUES('other-event')");await sql("INSERT INTO owner_resource(ref,generation,revision,guest_ref) VALUES('other-media',1,1,'guest')");
 await seed(facts({intentId:'other-intent',mediaRef:'other-media',eventRef:'other-event',original:{...facts().original,key:'original/other/1'}}));await service().prepare('other-intent');
}
it('same operation key on different intent is typed conflict without partial effects',async()=>{await service().prepare('intent');await otherIntent();await service().confirm(command);await expect(service().confirm({...command,intentId:'other-intent'})).rejects.toMatchObject({code:'CONFLICT'});expect(await count('job_queue')).toBe(1);expect(await count('media_catalog')).toBe(1);});
it('concurrent same operation key on independent scopes has exactly one atomic winner',async()=>{
 await service().prepare('intent');await otherIntent();const results=await Promise.allSettled([service().confirm(command),service().confirm({...command,intentId:'other-intent'})]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);const rejected=results.find(r=>r.status==='rejected') as PromiseRejectedResult;expect(rejected.reason).toMatchObject({code:'CONFLICT'});
 for(const t of ['media_catalog','job_queue','owner_ledger','media_acceptance_receipt','media_acceptance_audit','media_acceptance_operation'])expect(await count(t)).toBe(1);
});
it('actual unavailable PostgreSQL never creates accepted effects',async()=>{
 await service().prepare('intent');const badUrl=new URL(process.env.DATABASE_URL!);badUrl.port='1';badUrl.searchParams.set('connect_timeout','1');const unavailable=createPrismaClient(badUrl.toString());
 try{await expect(service(new PrismaTransactions(unavailable,1000)).confirm(command)).rejects.toThrow();expect(await count('job_queue')).toBe(0);expect(await count('media_catalog')).toBe(0);}finally{await unavailable.$disconnect();}
});
it('parent lock orders preceding restrictive change ahead of acceptance',async()=>{
 const s=service();await s.prepare('intent');let ready!:()=>void,release!:()=>void;const signal=new Promise<void>(r=>ready=r),hold=new Promise<void>(r=>release=r);
 const restrictive=txs.run(async tx=>{await tx.query("SELECT ref FROM owner_event WHERE ref='event' FOR UPDATE");await tx.execute("UPDATE owner_event SET blocked=true WHERE ref='event'");ready();await hold;});await signal;
 const acceptance=s.confirm(command);release();await restrictive;await expect(acceptance).rejects.toMatchObject({code:'PERMISSION_DENIED'});expect(await count('job_queue')).toBe(0);
});
