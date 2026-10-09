import fs from 'node:fs';
import http from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import pg from 'pg';
import {S3Client,PutObjectCommand,HeadObjectCommand,GetObjectCommand,DeleteObjectCommand,CreateMultipartUploadCommand,UploadPartCommand,CompleteMultipartUploadCommand,AbortMultipartUploadCommand,ListPartsCommand} from '@aws-sdk/client-s3';
const secret=n=>fs.readFileSync(`/run/secrets/${n}`,'utf8').trim();
const credentials={accessKeyId:secret('s3_lab_user'),secretAccessKey:secret('s3_lab_password')};
const s3=endpoint=>new S3Client({endpoint,credentials,region:'us-east-1',forcePathStyle:true,maxAttempts:1});
const direct=s3('http://minio:9000');
const connection={host:'postgres',database:'eventlens_lab',user:'lab_runner',password:secret('pg_lab'),connectionTimeoutMillis:500,query_timeout:300};
let db=new pg.Client(connection);db.on('error',()=>{});await db.connect();
const run=randomUUID(),prefix=`attempts/spike060/${run}/`,Bucket='eventlens-lab',timeline=[],cases=[];
const record=(event,data={})=>timeline.push({at:new Date().toISOString(),event,...data});
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function test(name,fn){const start=Date.now();try{const detail=await fn();cases.push({name,result:'PASS',durationMs:Date.now()-start,...detail});}catch(e){cases.push({name,result:'FAIL',durationMs:Date.now()-start,error:e.message?.startsWith('Assertion:')?e.message:'Bounded experiment case failed; no raw SDK/credential output.'});}}
async function head(Key){try{await direct.send(new HeadObjectCommand({Bucket,Key}));return 'PRESENT';}catch(e){return e.$metadata?.httpStatusCode===404?'MISSING':'UNKNOWN';}}
async function bytes(Key){return Buffer.from(await(await direct.send(new GetObjectCommand({Bucket,Key}))).Body.transformToByteArray());}
const hash=b=>createHash('sha256').update(b).digest('hex');
await db.query(`CREATE TABLE IF NOT EXISTS lab.spike060_authority(id text primary key, token text, fence int, generation int, epoch int, lease_until timestamptz, barrier boolean default false, promoted boolean default false);
 CREATE TABLE IF NOT EXISTS lab.spike060_inventory(id text primary key, run text, key text, state text, upload_id text, generation int, fence int)`);
const original=prefix+'protected/original',active=prefix+'protected/active';
for(const Key of [original,active])await direct.send(new PutObjectCommand({Bucket,Key,Body:Buffer.from('protected-'+Key)}));
const protectedHashes=await Promise.all([original,active].map(async key=>({key,sha256:hash(await bytes(key))})));
let held=null;
const server=http.createServer(async(req,res)=>{
 const chunks=[];for await(const chunk of req)chunks.push(chunk);
 const op=held;if(!op){res.writeHead(503);res.end();return;}
 op.accepted=true;record('relay-request-accepted',{id:op.id,bytes:chunks.reduce((n,b)=>n+b.length,0)});
 await op.release;
 record('external-write-start',{id:op.id});
 const upstream=http.request({host:'minio',port:9000,path:req.url,method:req.method,headers:req.headers},response=>{
  const received=[];response.on('data',b=>received.push(b));response.on('end',()=>{op.status=response.statusCode;op.drained=true;record('external-write-drained',{id:op.id,status:response.statusCode});if(!res.destroyed){res.writeHead(response.statusCode,response.headers);res.end(Buffer.concat(received));}op.resolveDrain();});
 });
 upstream.on('error',()=>{op.drained=false;op.resolveDrain();if(!res.destroyed){res.writeHead(502);res.end();}});
 upstream.end(Buffer.concat(chunks));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const delayed=s3(`http://127.0.0.1:${server.address().port}`);
async function heldWrite(id,Key,command){
 let release,resolveDrain;held={id,accepted:false,drained:false,release:new Promise(r=>release=r),drain:new Promise(r=>resolveDrain=r),resolveDrain:()=>resolveDrain()};
 const controller=new AbortController();
 await db.query('INSERT INTO lab.spike060_inventory VALUES($1,$2,$3,$4,$5,1,1)',[id,run,Key,'ACTIVE',null]);
 record('durable-intent-before-io',{id,key:Key,generation:1,fence:1});
 const operation=delayed.send(command,{abortSignal:controller.signal}).then(()=> 'ACK',()=> 'UNKNOWN');
 for(let i=0;i<60&&!held.accepted;i++)await pause(20);
 assert(held.accepted,'Assertion: relay did not receive bounded request');
 return {controller,operation,release,relay:held};
}
const faults=['lease-expired','lease-revoked','heartbeat-loss','cancel','generation-change','epoch-change','fence-change','db-loss'];
try{
 for(const fault of faults)await test(fault,async()=>{
  const id=run+'-'+fault,token=randomUUID(),Key=prefix+fault+'/output';
  await db.query("INSERT INTO lab.spike060_authority VALUES($1,$2,1,1,1,clock_timestamp()+interval '20 seconds',false,false)",[id,token]);
  const renew=await db.query("UPDATE lab.spike060_authority SET lease_until=clock_timestamp()+interval '20 seconds' WHERE id=$1 AND token=$2 AND fence=1 AND generation=1 AND epoch=1 AND NOT barrier AND lease_until>clock_timestamp()",[id,token]);assert(renew.rowCount===1,'Assertion: current heartbeat not accepted');
  const write=await heldWrite(id,Key,new PutObjectCommand({Bucket,Key,Body:Buffer.from('late-output')}));
  const faultStart=Date.now();record('authority-loss',{id,fault});
  const parser=spawn(process.execPath,['-e',"const c=require('node:child_process').spawn('/bin/sleep',['30']);c.on('spawn',()=>process.send({pid:c.pid}));setInterval(()=>{},1000)"],{stdio:['ignore','ignore','ignore','ipc'],detached:true});
  const descendantPid=await new Promise(r=>parser.once('message',m=>r(m.pid)));assert(fs.existsSync(`/proc/${descendantPid}`),'Assertion: descendant missing before fault');record('parser-descendant-confirmed',{id,pid:descendantPid});
  const exited=new Promise(r=>parser.once('exit',r));let gateOpen=true;
  const detector=(async()=>{
   while(gateOpen){
    let allowed=false;try{allowed=(await db.query('SELECT 1 FROM lab.spike060_authority WHERE id=$1 AND token=$2 AND fence=1 AND generation=1 AND epoch=1 AND NOT barrier AND lease_until>clock_timestamp()',[id,token])).rowCount===1;}catch{}
    if(!allowed){gateOpen=false;record('supervisor-detected-authority-loss',{id});process.kill(-parser.pid,'SIGKILL');write.controller.abort();record('supervisor-killed-process-group-aborted-client',{id});return;}
    await pause(40);
   }
  })();
  if(fault==='lease-expired')await db.query("UPDATE lab.spike060_authority SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[id]);
  // Stop renewing a real short lease and wait for database-clock expiry.
  if(fault==='heartbeat-loss')await db.query("UPDATE lab.spike060_authority SET lease_until=clock_timestamp()+interval '250 milliseconds' WHERE id=$1",[id]);
  if(fault==='lease-revoked')await db.query('UPDATE lab.spike060_authority SET token=$2 WHERE id=$1',[id,randomUUID()]);
  if(fault==='cancel')await db.query('UPDATE lab.spike060_authority SET barrier=true WHERE id=$1',[id]);
  if(fault==='generation-change')await db.query('UPDATE lab.spike060_authority SET generation=generation+1 WHERE id=$1',[id]);
  if(fault==='epoch-change')await db.query('UPDATE lab.spike060_authority SET epoch=epoch+1 WHERE id=$1',[id]);
  if(fault==='fence-change')await db.query('UPDATE lab.spike060_authority SET fence=fence+1 WHERE id=$1',[id]);
  if(fault==='db-loss'){
   fs.writeFileSync('/evidence/spike060-control.json',JSON.stringify({request:'PAUSE_POSTGRES',run}));
   for(let i=0;i<80;i++){try{if(JSON.parse(fs.readFileSync('/evidence/spike060-control-ack.json','utf8').replace(/^\uFEFF/,'')).run===run)break;}catch{}await pause(25);}
   let failed=false;try{await db.query('SELECT clock_timestamp()');}catch{failed=true;}assert(failed,'Assertion: real database fault did not prevent query');
  }
  await Promise.race([detector,pause(3500).then(()=>{throw Error('Assertion: supervisor detection deadline');})]);await exited;
  const liveDescendant=()=>{try{return !fs.readFileSync(`/proc/${descendantPid}/stat`,'utf8').split(' ')[2].match(/Z|X/);}catch{return false;}};
  for(let i=0;i<30&&liveDescendant();i++)await pause(20);assert(!liveDescendant(),'Assertion: descendant survived process-group stop');record('descendant-no-longer-running',{id,pid:descendantPid});
  assert(!gateOpen,'Assertion: writer admission gate remained open');
  let attemptedNewIo=0,rejectedNewIo=0;const guardedWrite=async()=>{attemptedNewIo++;if(!gateOpen){rejectedNewIo++;return;}throw Error('Assertion: new I/O passed closed gate');};await guardedWrite();
  const outcome=await write.operation;assert(outcome==='UNKNOWN','Assertion: aborted writer incorrectly acknowledged');
  // Even an aborted caller cannot claim drain while the external writer remains held.
  assert(!write.relay.drained,'Assertion: premature drain');record('physical-completion-refused',{id,reason:'ACTIVE_EXTERNAL_WRITER'});
  const stopMs=Date.now()-faultStart;assert(stopMs<4000,'Assertion: loss reaction deadline exceeded');
  if(fault==='db-loss'){
   await db.end().catch(()=>{});await pause(1700);db=new pg.Client(connection);db.on('error',()=>{});await db.connect();
   await db.query('UPDATE lab.spike060_authority SET barrier=true WHERE id=$1',[id]);
  }
  await db.query("UPDATE lab.spike060_inventory SET state='UNKNOWN' WHERE id=$1",[id]);
  const cas=await db.query('UPDATE lab.spike060_authority SET promoted=true WHERE id=$1 AND token=$2 AND fence=1 AND generation=1 AND epoch=1 AND NOT barrier AND lease_until>clock_timestamp()',[id,token]);assert(cas.rowCount===0,'Assertion: stale CAS accepted');
  const beforeDrain=(await db.query('SELECT state FROM lab.spike060_inventory WHERE id=$1',[id])).rows[0].state;assert(beforeDrain==='UNKNOWN','Assertion: Unknown lost before drain');
  write.release();await Promise.race([write.relay.drain,pause(4000).then(()=>{throw Error('Assertion: drain timeout');})]);assert(write.relay.drained&&write.relay.status===200,'Assertion: late actual PUT not verified');
  assert(await head(Key)==='PRESENT','Assertion: late PUT missing');
  await db.query("UPDATE lab.spike060_inventory SET state='DRAINED' WHERE id=$1",[id]);
  await direct.send(new DeleteObjectCommand({Bucket,Key}));assert(await head(Key)==='MISSING','Assertion: cleanup did not establish absence');
  await pause(100);assert(await head(Key)==='MISSING','Assertion: writer recreated object');
  await db.query("UPDATE lab.spike060_inventory SET state='CLEANED' WHERE id=$1",[id]);record('physical-completion-after-drain-and-head',{id});
  const oldRenew=await db.query("UPDATE lab.spike060_authority SET lease_until=clock_timestamp()+interval '20 seconds' WHERE id=$1 AND token=$2 AND fence=1 AND generation=1 AND epoch=1 AND NOT barrier AND lease_until>clock_timestamp()",[id,token]);assert(oldRenew.rowCount===0,'Assertion: stale renewal accepted');
  return {stopMs,deadlineMs:4000,stalePromotion:false,clientOutcome:outcome,actualLatePut:true,writerDrained:true,attemptedNewIo,rejectedNewIo,processGroupKillObserved:true,staleRenewalRejected:true};
 });
 await test('multipart-late-complete-and-abort',async()=>{
  const Key=prefix+'multipart/output';const {UploadId}=await direct.send(new CreateMultipartUploadCommand({Bucket,Key}));
  const part=await direct.send(new UploadPartCommand({Bucket,Key,UploadId,PartNumber:1,Body:Buffer.from('multipart-late')}));
  const id=run+'-multipart';const write=await heldWrite(id,Key,new CompleteMultipartUploadCommand({Bucket,Key,UploadId,MultipartUpload:{Parts:[{PartNumber:1,ETag:part.ETag}]}}));
  await db.query("UPDATE lab.spike060_inventory SET upload_id=$2,state='UNKNOWN' WHERE id=$1",[id,UploadId]);write.controller.abort();assert(await write.operation==='UNKNOWN','Assertion: multipart ACK not unknown');assert(!write.relay.drained,'Assertion: multipart premature drain');
  write.release();await Promise.race([write.relay.drain,pause(4000).then(()=>{throw Error('Assertion: multipart drain deadline');})]);assert(write.relay.status===200&&await head(Key)==='PRESENT','Assertion: multipart completion not real');
  await direct.send(new DeleteObjectCommand({Bucket,Key}));await db.query("UPDATE lab.spike060_inventory SET state='CLEANED' WHERE id=$1",[id]);
  const partialKey=prefix+'multipart/partial';const partial=await direct.send(new CreateMultipartUploadCommand({Bucket,Key:partialKey}));await direct.send(new UploadPartCommand({Bucket,Key:partialKey,UploadId:partial.UploadId,PartNumber:1,Body:Buffer.from('partial')}));
  await direct.send(new AbortMultipartUploadCommand({Bucket,Key:partialKey,UploadId:partial.UploadId}));let absent=false;try{await direct.send(new ListPartsCommand({Bucket,Key:partialKey,UploadId:partial.UploadId}));}catch(e){absent=e.$metadata?.httpStatusCode===404;}assert(absent,'Assertion: multipart abort not verified');
  return {actualLateCompletion:true,clientOutcome:'UNKNOWN',abortVerifiedByListParts404:true};
 });
 await test('crash-recovery-durable-inventory',async()=>{
  const Key=prefix+'crash/partial',id=run+'-crash';await db.query('INSERT INTO lab.spike060_inventory VALUES($1,$2,$3,$4,null,1,1)',[id,run,Key,'UNKNOWN']);
  let release,resolveDrain;held={id,accepted:false,drained:false,release:new Promise(r=>release=r),drain:new Promise(r=>resolveDrain=r),resolveDrain:()=>resolveDrain()};
  const child=spawn(process.execPath,['runtime-isolation/writer.mjs',`http://127.0.0.1:${server.address().port}`,Key],{stdio:'ignore'});
  const exit=new Promise(r=>child.once('exit',r));for(let i=0;i<80&&!held.accepted;i++)await pause(25);assert(held.accepted,'Assertion: crash writer did not issue actual PUT');
  child.kill('SIGKILL');await exit;record('writer-supervisor-process-crashed-with-inflight-put',{id});assert(!held.drained,'Assertion: premature crash drain');
  const recovered=new pg.Client(connection);await recovered.connect();const inventory=(await recovered.query('SELECT id,key,state FROM lab.spike060_inventory WHERE run=$1',[run])).rows;const orphan=inventory.find(r=>r.id===id);assert(orphan?.state==='UNKNOWN','Assertion: recovery intent missing');
  assert(orphan.key.startsWith(prefix+'crash/')&&!protectedHashes.some(r=>r.key===orphan.key),'Assertion: cleanup scope unsafe');
  release();await Promise.race([held.drain,pause(4000).then(()=>{throw Error('Assertion: crash external drain deadline');})]);assert(held.drained&&held.status===200&&await head(Key)==='PRESENT','Assertion: late write after actual process crash not verified');
  await direct.send(new DeleteObjectCommand({Bucket,Key:orphan.key}));assert(await head(Key)==='MISSING','Assertion: crash cleanup absence unknown');await recovered.query("UPDATE lab.spike060_inventory SET state='CLEANED' WHERE id=$1",[id]);await recovered.end();
  return {recoveryConnectionIndependent:true,inventoryBefore:inventory,writerExitObserved:true,latePutAfterCrash:true,scope:'trusted adapter process crashed; independent relay models external in-flight storage request'};
 });
 await test('protected-original-active-preserved',async()=>{for(const row of protectedHashes)assert(hash(await bytes(row.key))===row.sha256,'Assertion: protected object changed');return {protectedHashes};});
}finally{
 delayed.destroy();direct.destroy();server.closeAllConnections();await new Promise(r=>server.close(r));
 const inventory=(await db.query('SELECT id,key,state,upload_id,generation,fence FROM lab.spike060_inventory WHERE run=$1',[run])).rows;await db.end();
 fs.writeFileSync('/evidence/spike060-integration.json',JSON.stringify({ticket:'EL-TK-060',run,recordedAt:new Date().toISOString(),experimentOnly:true,cases,timeline,inventory,limitations:['Synthetic header budgets are not codec parser validation.','No production executor or final provider certified.'],result:cases.every(c=>c.result==='PASS')?'PASS':'FAIL'},null,2));
 console.log(JSON.stringify({ticket:'EL-TK-060',integrationCases:cases.length,passed:cases.filter(c=>c.result==='PASS').length,failed:cases.filter(c=>c.result==='FAIL').length}));
}
