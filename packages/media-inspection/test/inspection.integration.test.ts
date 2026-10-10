import {beforeAll,afterAll,it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {PutObjectCommand} from '@aws-sdk/client-s3';
import {JobQueuePostgres,LocalSlots,PrismaTransactions,createPrismaClient,fingerprint,type RecoveryAuthority,type Execution,type Reservation} from '@eventlens/job-queue';
import {DockerProcessRuntime,ADOPTED_SCANNER_IMAGE,MediaExecutionSupervisor,PrismaAttemptInventory,createInventoryClient,type Limits,type ScannerRuntimeProfile} from '@eventlens/media-execution';
import {LaboratoryStorage} from '../../media-execution/test/laboratory-storage.js';
import {ClamAvInspection,FfprobeMediaInspector,verifySnapshot,type SignatureManifest} from '../src/adapters.js';
import {PostgresInspectionRepository} from '../src/repository.js';
import {InspectOriginal,MediaSafetyPolicy} from '../src/inspection.js';
import type {InspectionInput,SafetyFact} from '../src/contracts.js';
const client=createPrismaClient(process.env.DATABASE_URL!),transactions=new PrismaTransactions(client,5000),inventoryClient=createInventoryClient(process.env.DATABASE_URL!),inventory=new PrismaAttemptInventory(inventoryClient),storage=new LaboratoryStorage();
const manifest=JSON.parse(readFileSync('/signatures/manifest.json','utf8')) as SignatureManifest;
const limits:Limits={cpu:1,memoryBytes:4*1024**3,pids:64,scratchBytes:128*1024**2,wallMs:120000,maxInputBytes:500000000,maxOutputBytes:1000000,maxPixels:40000000,maxStreams:8,threads:1,heartbeatMs:1000,leaseMs:15000,controlTimeoutMs:10000,maxControlBytes:65536};
const scannerProfile:ScannerRuntimeProfile={image:ADOPTED_SCANNER_IMAGE,signaturesRoot:process.env.DOCKER_SIGNATURE_ROOT!,snapshotId:manifest.snapshotId,maxFileBytes:500000000,maxScanBytes:1000000000,maxFiles:10000,maxRecursion:16,maxScanTimeMs:90000};
const configuration={snapshotRoot:'/signatures',manifest,maxSignatureAgeMs:7*24*3600000,profileHash:fingerprint({scannerProfile,limits})};
let epoch='inspection-epoch';const authority:RecoveryAuthority={async acquire(){const current=epoch;return {epoch:current,assertCurrent(){if(current!==epoch)throw Error('EPOCH_CHANGED');},async release(){}};}};
const slots=new LocalSlots(1);const queue=new JobQueuePostgres(transactions,authority,{async lockAndAuthorize(tx,ref,generation){const rows=await tx.query<{generation:bigint;allowed:boolean}>('SELECT generation,allowed FROM inspection_policy WHERE ref=$1 FOR UPDATE',ref);return rows[0]?.allowed===true&&rows[0].generation===generation;}},slots,{candidateScanLimit:16});
const scannerRuntime=new DockerProcessRuntime({inputRoot:'/inputs',dockerInputRoot:process.env.DOCKER_INPUT_ROOT!,scanner:scannerProfile});
const mediaRuntime=new DockerProcessRuntime({inputRoot:'/inputs',dockerInputRoot:process.env.DOCKER_INPUT_ROOT!});
const scanner=new ClamAvInspection(new MediaExecutionSupervisor(queue,authority,storage,scannerRuntime,inventory,limits),configuration);
const inspector=new FfprobeMediaInspector(new MediaExecutionSupervisor(queue,authority,storage,mediaRuntime,inventory,limits),{maxPixels:40000000,maxStreams:8,maxDurationSeconds:300,maxPhotoBytes:25000000,maxVideoBytes:500000000});
const repo=new PostgresInspectionRepository();const observations:unknown[]=[];
async function prepared(bytes:Buffer,mime='image/jpeg'):Promise<{input:InspectionInput;job:Execution;reservation:Reservation}>{
 const ref='media:'+randomUUID(),intent=randomUUID(),version=randomUUID(),sha=createHash('sha256').update(bytes).digest('hex');
 const original={namespace:'eventlens-lab',key:`attempts/media-inspection/${process.env.MEDIA_INSPECTION_RUN_ID}/${randomUUID()}`,immutableVersion:version,sha256:sha,sizeBytes:bytes.length};
 await storage.s3.send(new PutObjectCommand({Bucket:original.namespace,Key:original.key,Body:bytes,Metadata:{sha256:sha,version}}));
 const jobId=await transactions.run(tx=>queue.publish(tx,{type:'MEDIA',handlerVersion:'1',resourceRef:ref,generation:1n,queue:'inspection',dedupKey:randomUUID(),priority:1,payload:null,availableAt:new Date(0)}));
 await transactions.run(async tx=>{
  await tx.execute('INSERT INTO inspection_policy(ref,generation,allowed) VALUES($1,1,true)',ref);
  await tx.execute('INSERT INTO media_acceptance_intent(intent_id,media_ref,generation,fingerprint,facts) VALUES($1,$2,1,$3,$4::jsonb)',intent,ref,fingerprint(original),'{}');
  await tx.execute("INSERT INTO media_catalog(media_ref,intent_id,event_ref,guest_ref,generation,revision,status,original,job_id) VALUES($1,$2,'event','guest',1,1,'UPLOADED',$3::jsonb,$4::uuid)",ref,intent,JSON.stringify({namespace:original.namespace,key:original.key,version,sha256:sha,bytes:String(bytes.length)}),jobId);
 });
 const reservation=await queue.reserve(['inspection'],'inspection-worker',1,limits.leaseMs);
 return {input:{mediaRef:ref,generation:1n,revision:1n,original,declaredMime:mime},job:reservation.jobs[0],reservation};
}
beforeAll(async()=>{await client.$executeRawUnsafe('CREATE TABLE inspection_policy(ref text PRIMARY KEY,generation bigint NOT NULL,allowed boolean NOT NULL)');await storage.start();});
afterAll(async()=>{writeFileSync('/evidence/inspection-observations.json',JSON.stringify({runId:process.env.MEDIA_INSPECTION_RUN_ID,snapshotId:manifest.snapshotId,profileHash:configuration.profileHash,observations},null,2));await storage.close();await inventoryClient.$disconnect();await client.$disconnect();});
it('official immutable snapshot loads and stale/missing identity denies',async()=>{expect(await verifySnapshot(configuration)).toBe(true);expect(await verifySnapshot({...configuration,maxSignatureAgeMs:1})).toBe(false);expect(await verifySnapshot({...configuration,snapshotRoot:'/absent'})).toBe(false);expect(await verifySnapshot({...configuration,manifest:{...manifest,snapshotId:'f'.repeat(64)}})).toBe(false);});
it('actual official engine detects EICAR independently from invalid format',async()=>{
 const bytes=Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
 const p=await prepared(bytes);try{const r=await scanner.inspect(p.input,p.job,{jobs:p.reservation.jobs,releaseAfterQuiescence(){}});observations.push({case:'EICAR',result:r});expect(r.status).toBe('THREAT_DETECTED');expect(r.reason).toBe('SIGNATURE_DETECTION');expect(slots.inUse).toBe(1);}finally{p.reservation.releaseAfterQuiescence();}
},180000);
const corpus=JSON.parse(readFileSync('/registered.json','utf8').replace(/^\uFEFF/,''));
const mimeFor:Record<string,string>={'JPEG/JPG':'image/jpeg',PNG:'image/png',WebP:'image/webp',HEIC:'image/heic',HEIF:'image/heif',MP4:'video/mp4',MOV:'video/quicktime',WebM:'video/webm'};
const selected=Object.values(Object.fromEntries(corpus.cases.filter((c:any)=>c.expected.outcome==='ACCEPT').map((c:any)=>[c.expected.format,c]))) as any[];
selected.push({id:'HEIF-GENERIC-MIF1',absolutePath:'/supplemental/generic.heif',expected:{format:'HEIF',outcome:'ACCEPT'},originalSha256:'94b622a02f65d9e88a15b8b106b744ecdda439bb67aedca9296ecfb28b96d459'});
it.each(selected)('real neutral corpus $id complete format + official no threat original unchanged',async c=>{
 const bytes=readFileSync(c.absolutePath??('/corpus/'+c.relativePath));expect(createHash('sha256').update(bytes).digest('hex')).toBe(c.originalSha256);const p=await prepared(bytes,mimeFor[c.expected.format]);
 try{const handler=new InspectOriginal({async load(){return p.input;}},inspector,scanner,repo,queue,transactions);
 const op=randomUUID();const fact=await handler.execute(p.job,p.reservation,op);observations.push({case:c.id,fact});expect(fact.outcome).toBe('APPROVED');expect(fact.format.status).toBe('VALID');expect(fact.malware.status).toBe('NO_THREAT_DETECTED');expect(await handler.execute(p.job,p.reservation,op)).toEqual(fact);
 expect(MediaSafetyPolicy.eligible(fact,{generation:1n,revision:1n,sha256:p.input.original.sha256,version:p.input.original.immutableVersion,jobId:p.job.jobId,token:p.job.token,fence:p.job.fence,epoch:p.job.epoch})).toBe(true);
 expect(MediaSafetyPolicy.eligible({...fact,malware:{...fact.malware,originalSha256:'0'.repeat(64)}},{generation:1n,revision:1n,sha256:p.input.original.sha256,version:p.input.original.immutableVersion,jobId:p.job.jobId,token:p.job.token,fence:p.job.fence,epoch:p.job.epoch})).toBe(false);
 const rows=await transactions.run(tx=>tx.query<{status:string;ended_at:Date|null}>('SELECT j.status,a.ended_at FROM job_queue j JOIN job_attempt a ON a.token=j.token WHERE j.id=$1::uuid',p.job.jobId));expect(rows[0].status).toBe('PROCESSING');expect(rows[0].ended_at).toBeNull();
 const audit=await transactions.run(tx=>tx.query<{n:bigint}>('SELECT count(*)::bigint n FROM media_inspection_audit WHERE media_ref=$1',p.input.mediaRef));expect(Number(audit[0].n)).toBe(1);expect(slots.inUse).toBe(1);
 }finally{p.reservation.releaseAfterQuiescence();}
},180000);
it('checkpoint rollback, conflicting replay and late lease cannot leave owner effects',async()=>{
 const p=await prepared(Buffer.from('neutral'));try{
  await expect(queue.checkpoint(p.job,'rollback',null,async tx=>{await tx.execute("INSERT INTO media_inspection_audit(id,media_ref,generation,job_id,token,epoch,outcome,committed_at) VALUES($1::uuid,$2,1,$3::uuid,$4::uuid,$5,'INCONCLUSIVE',clock_timestamp())",randomUUID(),p.input.mediaRef,p.job.jobId,p.job.token,p.job.epoch);throw Error('ROLLBACK');})).rejects.toThrow('ROLLBACK');
  expect(await transactions.run(tx=>tx.query('SELECT * FROM media_inspection_audit WHERE media_ref=$1',p.input.mediaRef))).toHaveLength(0);
  await queue.checkpoint(p.job,'replay',{},async()=>{});await expect(queue.checkpoint(p.job,'replay',{different:true},async()=>{})).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  await client.$executeRawUnsafe("UPDATE job_queue SET lease_until=clock_timestamp()+interval '40 milliseconds' WHERE id=$1::uuid",p.job.jobId);
  await expect(queue.checkpoint(p.job,'late',null,async tx=>{await tx.query('SELECT true AS waited FROM pg_sleep(0.08)');})).rejects.toThrow('LEASE_LOST');
  expect(await transactions.run(tx=>tx.query("SELECT * FROM job_receipt WHERE operation_id='late'"))).toHaveLength(0);
 }finally{p.reservation.releaseAfterQuiescence();}
});
it.each(['cancel','fence','generation','epoch'] as const)('checkpoint rejects stale %s without fact or receipt',async mode=>{
 const p=await prepared(Buffer.from('neutral'));
 try{if(mode==='cancel')await client.$executeRawUnsafe('UPDATE job_queue SET cancelled=true WHERE id=$1::uuid',p.job.jobId);
 else if(mode==='fence')await client.$executeRawUnsafe('UPDATE job_queue SET fence=fence+1 WHERE id=$1::uuid',p.job.jobId);
 else if(mode==='generation')await client.$executeRawUnsafe('UPDATE inspection_policy SET generation=2 WHERE ref=$1',p.input.mediaRef);
 else epoch='new-epoch';
 await expect(queue.checkpoint(p.job,randomUUID(),null,async()=>{})).rejects.toThrow('LEASE_LOST');
 expect(await transactions.run(tx=>tx.query('SELECT * FROM job_receipt WHERE job_id=$1::uuid',p.job.jobId))).toHaveLength(0);
 }finally{epoch='inspection-epoch';p.reservation.releaseAfterQuiescence();}
});
it('phase exclusion is transactional and UNKNOWN blocks new phases; default processing compatible',async()=>{
 const token=randomUUID(),id=randomUUID();
 const record={id,token,jobId:randomUUID(),resourceRef:'fixture',generation:'1',fence:'1',epoch:'fixture',input:{namespace:'fixture',key:'fixture',immutableVersion:'v',sha256:'a'.repeat(64),sizeBytes:1},outputs:[],readOperationId:randomUUID(),limits,status:'ACTIVE' as const};
 await inventory.begin(record);await expect(inventory.begin({...record,id:randomUUID(),phaseId:'scanner'})).rejects.toThrow('ATTEMPT_ALREADY_EXISTS');
 await inventory.update({...record,status:'UNKNOWN'});await expect(inventory.begin({...record,id:randomUUID(),phaseId:'scanner'})).rejects.toThrow('ATTEMPT_ALREADY_EXISTS');
 await inventory.update({...record,status:'QUIESCENT'});const next={...record,id:randomUUID(),phaseId:'scanner'};await inventory.begin(next);await inventory.update({...next,status:'QUIESCENT'});
 await expect(inventory.begin({...record,id:randomUUID()})).rejects.toThrow('ATTEMPT_ALREADY_EXISTS');
});
it('owner lock is acquired before job and replay still validates owner/current clock',async()=>{
 const p=await prepared(Buffer.from('neutral'));let preparedOwner=false;
 try{const result=await queue.checkpoint(p.job,randomUUID(),null,async()=>{expect(preparedOwner).toBe(true);},async tx=>{await repo.lockAndValidate(tx,p.input,p.job);preparedOwner=true;});expect(result).toBe('COMMITTED');
 await client.$executeRawUnsafe("UPDATE media_catalog SET status='TRASHED' WHERE media_ref=$1",p.input.mediaRef);
 await expect(queue.checkpoint(p.job,randomUUID(),null,async()=>{},tx=>repo.lockAndValidate(tx,p.input,p.job))).rejects.toThrow('STALE_ORIGINAL');
 }finally{p.reservation.releaseAfterQuiescence();}
});
it.each(['file-limit','timeout','oom','cancel'] as const)('actual scanner %s never falsely approves',async mode=>{
 const p=await prepared(Buffer.from('neutral-data-longer-than-one-byte'));
 const profile={...scannerProfile,...(mode==='file-limit'?{maxFileBytes:1}:{})};
 const customLimits={...limits,...(mode==='timeout'?{wallMs:1000}:{}),...(mode==='oom'?{memoryBytes:64*1024**2}:{})};
 const customRuntime=new DockerProcessRuntime({inputRoot:'/inputs',dockerInputRoot:process.env.DOCKER_INPUT_ROOT!,scanner:profile});
 const custom=new ClamAvInspection(new MediaExecutionSupervisor(queue,authority,storage,customRuntime,inventory,customLimits),{...configuration,profileHash:fingerprint({profile,customLimits})});
 const abort=new AbortController();const timer=mode==='cancel'?setTimeout(()=>abort.abort(),2000):undefined;
 try{const result=await custom.inspect(p.input,p.job,{jobs:p.reservation.jobs,releaseAfterQuiescence(){}},abort.signal);observations.push({case:mode,result});expect(result.status).toBe('INCONCLUSIVE');}
 finally{clearTimeout(timer);p.reservation.releaseAfterQuiescence();}
},180000);
it('copied actual database corruption is inconclusive without mutating official snapshot',async()=>{
 const directory='/inputs/signature-corruption-'+randomUUID();await mkdir(directory);
 for(const file of manifest.files)await copyFile('/signatures/'+file.name,directory+'/'+file.name);
 await copyFile('/signatures/manifest.json',directory+'/manifest.json');
 await writeFile(directory+'/bytecode.cvd',Buffer.from('corrupt-controlled-database'));
 const corrupted={...configuration,snapshotRoot:directory};expect(await verifySnapshot(corrupted)).toBe(false);
 const p=await prepared(Buffer.from('neutral'));try{const isolated=new ClamAvInspection(new MediaExecutionSupervisor(queue,authority,storage,scannerRuntime,inventory,limits),corrupted);expect(await isolated.inspect(p.input,p.job,{jobs:p.reservation.jobs,releaseAfterQuiescence(){}})).toMatchObject({status:'INCONCLUSIVE',reason:'SIGNATURE_SNAPSHOT_UNAVAILABLE'});}finally{p.reservation.releaseAfterQuiescence();}
 expect(await verifySnapshot(configuration)).toBe(true);
});
it('claimed fresh snapshot A cannot approve different actual mounted official database set B',async()=>{
 const folder='signature-mismatch-'+randomUUID(),directory='/inputs/'+folder;await mkdir(directory);
 for(const file of manifest.files)await copyFile('/signatures/'+file.name,directory+'/'+file.name);
 await copyFile('/signatures/manifest.json',directory+'/manifest.json');
 // A valid official CVD under a different database name creates an actual B set;
 // no official snapshot or corpus byte is modified.
 await copyFile('/signatures/daily.cvd',directory+'/bytecode.cvd');
 const profile={...scannerProfile,signaturesRoot:process.env.DOCKER_INPUT_ROOT+'/'+folder};
 const mismatched=new ClamAvInspection(new MediaExecutionSupervisor(queue,authority,storage,new DockerProcessRuntime({inputRoot:'/inputs',dockerInputRoot:process.env.DOCKER_INPUT_ROOT!,scanner:profile}),inventory,limits),configuration);
 const p=await prepared(Buffer.from('neutral valid scanner fixture'));
 try{const result=await mismatched.inspect(p.input,p.job,{jobs:p.reservation.jobs,releaseAfterQuiescence(){}});observations.push({case:'snapshot-A-runtime-B',result});expect(result.status).toBe('INCONCLUSIVE');expect(result.reason).toBe('SNAPSHOT_MISMATCH');}finally{p.reservation.releaseAfterQuiescence();}
},180000);
it('unexpected hidden scanner database cannot be used or approved',async()=>{
 const folder='signature-hidden-'+randomUUID(),directory='/inputs/'+folder;await mkdir(directory);
 for(const file of manifest.files)await copyFile('/signatures/'+file.name,directory+'/'+file.name);
 await copyFile('/signatures/manifest.json',directory+'/manifest.json');
 await writeFile(directory+'/.unexpected.ign2','controlled unexpected database');
 const profile={...scannerProfile,signaturesRoot:process.env.DOCKER_INPUT_ROOT+'/'+folder};
 const untrustedSet=new ClamAvInspection(new MediaExecutionSupervisor(queue,authority,storage,new DockerProcessRuntime({inputRoot:'/inputs',dockerInputRoot:process.env.DOCKER_INPUT_ROOT!,scanner:profile}),inventory,limits),configuration);
 const p=await prepared(Buffer.from('neutral hidden-database fixture'));
 try{const result=await untrustedSet.inspect(p.input,p.job,{jobs:p.reservation.jobs,releaseAfterQuiescence(){}});observations.push({case:'hidden-database',result});expect(result.status).toBe('INCONCLUSIVE');expect(result.reason).toBe('EXECUTION_PROCESSING_ERROR');}finally{p.reservation.releaseAfterQuiescence();}
},180000);
it.each(['encrypted','nested-limit'] as const)('actual %s archive coverage cannot be approved',async mode=>{
 const directory='/tmp/inspection-archive-'+randomUUID();await mkdir(directory);await writeFile(directory+'/neutral.txt','controlled neutral archive fixture');
 const zip=(target:string,input:string,password?:string)=>{const result=spawnSync('zip',['-q','-j',...(password?['-P',password]:[]),target,input],{encoding:'utf8'});if(result.status!==0)throw Error('CONTROLLED_ZIP_FIXTURE_FAILED');};
 let path=directory+'/a.zip';zip(path,directory+'/neutral.txt',mode==='encrypted'?'controlled-fixture-password':undefined);
 if(mode==='nested-limit'){zip(directory+'/b.zip',path);zip(directory+'/c.zip',directory+'/b.zip');path=directory+'/c.zip';}
 const p=await prepared(readFileSync(path));const profile={...scannerProfile,...(mode==='nested-limit'?{maxRecursion:1}:{})};
 const custom=new ClamAvInspection(new MediaExecutionSupervisor(queue,authority,storage,new DockerProcessRuntime({inputRoot:'/inputs',dockerInputRoot:process.env.DOCKER_INPUT_ROOT!,scanner:profile}),inventory,limits),{...configuration,profileHash:fingerprint({profile,limits})});
 try{const result=await custom.inspect(p.input,p.job,{jobs:p.reservation.jobs,releaseAfterQuiescence(){}});observations.push({case:mode,result});expect(result.status).toBe('INCONCLUSIVE');expect(result.reason).toBe('INCOMPLETE_COVERAGE');}finally{p.reservation.releaseAfterQuiescence();}
},180000);
it.each(corpus.cases.filter((c:any)=>c.expected.outcome==='REJECT') as any[])('invalid/corrupt actual bytes $id never yield VALID',async(c:any)=>{
 const p=await prepared(readFileSync('/corpus/'+c.relativePath),mimeFor[c.expected.format]);
 try{const result=await inspector.inspect(p.input,p.job,{jobs:p.reservation.jobs,releaseAfterQuiescence(){}});observations.push({case:c.id,result});expect(result.status).not.toBe('VALID');}finally{p.reservation.releaseAfterQuiescence();}
},180000);
it.each(['declared-format','pixel-limit'] as const)('actual real original %s denies validation',async mode=>{
 const p=await prepared(readFileSync('/corpus/generated/neutral.png'),mode==='declared-format'?'image/jpeg':'image/png');
 const constrained=new FfprobeMediaInspector(new MediaExecutionSupervisor(queue,authority,storage,mediaRuntime,inventory,limits),{maxPixels:mode==='pixel-limit'?1:40000000,maxStreams:8,maxDurationSeconds:300,maxPhotoBytes:25000000,maxVideoBytes:500000000});
 try{const result=await constrained.inspect(p.input,p.job,{jobs:p.reservation.jobs,releaseAfterQuiescence(){}});expect(result).toMatchObject({status:'INVALID',reason:mode==='declared-format'?'DECLARED_FORMAT_MISMATCH':'PIXEL_LIMIT'});}finally{p.reservation.releaseAfterQuiescence();}
},180000);
it.each(['inconclusive','approved'] as const)('new current retry token reinspects %s projection and preserves both historical facts',async mode=>{
 const p=await prepared(readFileSync('/corpus/generated/neutral.png'),'image/png');
 const shortScanner=new ClamAvInspection(new MediaExecutionSupervisor(queue,authority,storage,scannerRuntime,inventory,{...limits,wallMs:1000}),configuration);
 const source={async load(){return p.input;}};
 const firstHandler=new InspectOriginal(source,inspector,mode==='inconclusive'?shortScanner:scanner,repo,queue,transactions);
 const first=await firstHandler.execute(p.job,p.reservation,randomUUID());expect(first.outcome).toBe(mode==='inconclusive'?'INCONCLUSIVE':'APPROVED');
 await queue.retry(p.job,randomUUID(),{reason:'controlled-validation-retry'},new Date(0),'RETRYING',async()=>{});p.reservation.releaseAfterQuiescence();
 const next=await queue.reserve(['inspection'],'retry-validation-worker',1,limits.leaseMs);const job=next.jobs[0];
 try{const second=await new InspectOriginal(source,inspector,scanner,repo,queue,transactions).execute(job,next,randomUUID());expect(second.outcome).toBe('APPROVED');expect(second.executionToken).not.toBe(first.executionToken);
 const history=await transactions.run(tx=>tx.query<{fact:SafetyFact}>('SELECT fact FROM media_inspection_history WHERE media_ref=$1',p.input.mediaRef));expect(history).toHaveLength(2);expect(history.some(r=>r.fact.executionToken===first.executionToken&&r.fact.outcome===first.outcome)).toBe(true);
 await expect(queue.checkpoint(p.job,randomUUID(),null,async()=>{})).rejects.toThrow('LEASE_LOST');
 expect(MediaSafetyPolicy.eligible(first,{generation:1n,revision:1n,sha256:p.input.original.sha256,version:p.input.original.immutableVersion,jobId:job.jobId,token:job.token,fence:job.fence,epoch:job.epoch})).toBe(false);
 }finally{next.releaseAfterQuiescence();}
},180000);
