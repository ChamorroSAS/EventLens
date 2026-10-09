// Experimental trusted publication supervisor; codec containers remain network/secret-free.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {randomUUID, createHash} from 'node:crypto';
import pg from 'pg';
import {S3Client,PutObjectCommand,HeadObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
process.on('uncaughtException',()=>{console.error('Bounded supplemental integration failed; raw credentials and SDK details suppressed.');process.exit(1);});
const hash=b=>createHash('sha256').update(b).digest('hex');
const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const binding=readJson('/state/input.json');
if(!/^[a-zA-Z0-9_.-]+$/.test(binding.outputName)||!binding.caseId||!binding.supplementalRunId)throw Error('Invalid supplemental identity');
const mediaFile=relative=>{
 if(typeof relative!=='string'||relative.includes('\\')||relative.split('/').includes('..'))throw Error('Unsafe media reference');
 const target=path.resolve('/media',relative);if(!target.startsWith('/media/')||fs.realpathSync(target)!==target)throw Error('Unsafe media containment');return target;
};
const originalFile=mediaFile(binding.originalFile), outputFile=mediaFile(binding.outputFile);
const original=fs.readFileSync(originalFile),output=fs.readFileSync(outputFile);
if(hash(original)!==binding.originalSha256||hash(output)!==binding.outputSha256)throw Error('Supplemental immutable binding mismatch');
const secret=n=>fs.readFileSync(`/run/secrets/${n}`,'utf8').trim();
const credentials={accessKeyId:secret('s3_lab_user'),secretAccessKey:secret('s3_lab_password')};
const client=endpoint=>new S3Client({endpoint,credentials,region:'us-east-1',forcePathStyle:true,maxAttempts:1});
const s3=client('http://minio:9000');
const db=new pg.Client({host:'postgres',database:'eventlens_lab',user:'lab_runner',password:secret('pg_lab'),connectionTimeoutMillis:1000,query_timeout:1000});
db.on('error',()=>{});await db.connect();
const runId=randomUUID(),prefix=`attempts/spike061/${runId}/`,Bucket='eventlens-lab',cases=[],timeline=[];
const record=(event,details={})=>timeline.push({at:new Date().toISOString(),event,...details});
const assert=(ok,message)=>{if(!ok)throw Error(`Assertion: ${message}`);};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const deadline=async(p,ms,label)=>{let timer;try{return await Promise.race([p,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error(`Assertion: ${label}`)),ms))]);}finally{clearTimeout(timer);}};
async function head(Key){try{await s3.send(new HeadObjectCommand({Bucket,Key}));return 'PRESENT';}catch(e){return e.$metadata?.httpStatusCode===404?'MISSING':'UNKNOWN';}}
async function getHash(Key){const r=await s3.send(new GetObjectCommand({Bucket,Key}));return hash(Buffer.from(await r.Body.transformToByteArray()));}
await db.query(`CREATE TABLE IF NOT EXISTS lab.spike061_authority(id text primary key,token text,fence int,generation int,epoch int,lease_until timestamptz,barrier boolean,promoted boolean);
 CREATE TABLE IF NOT EXISTS lab.spike061_inventory(id text primary key,run text,key text,state text,case_id text,sha256 text,fence int,generation int)`);
const guardSql='id=$1 AND token=$2 AND fence=1 AND generation=1 AND epoch=1 AND NOT barrier AND lease_until>clock_timestamp()';
async function authority(id,token){return (await db.query(`SELECT 1 FROM lab.spike061_authority WHERE ${guardSql}`,[id,token])).rowCount===1;}
async function promote(id,token){return (await db.query(`UPDATE lab.spike061_authority SET promoted=true WHERE ${guardSql}`,[id,token])).rowCount;}
async function intent(id,token,Key){
 await db.query('INSERT INTO lab.spike061_authority VALUES($1,$2,1,1,1,clock_timestamp()+interval \'30 seconds\',false,false)',[id,token]);
 await db.query('INSERT INTO lab.spike061_inventory VALUES($1,$2,$3,$4,$5,$6,1,1)',[id,runId,Key,'ACTIVE',binding.caseId,binding.outputSha256]);
 record('durable-intent-before-io',{id,key:Key,caseId:binding.caseId,sha256:binding.outputSha256,fence:1,generation:1});
}
let held=null;
const relay=http.createServer(async(req,res)=>{
 const op=held;if(!op){res.writeHead(503);res.end();return;}
 const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16*1024*1024){res.writeHead(413);res.end();return;}chunks.push(chunk);}
 op.accepted=true;record('held-real-media-put',{id:op.id,bytes:size});await op.release;
 const upstream=http.request({host:'minio',port:9000,path:req.url,method:req.method,headers:req.headers},response=>{
  const received=[];response.on('data',b=>received.push(b));response.on('end',()=>{op.status=response.statusCode;op.drained=true;record('actual-external-writer-drained',{id:op.id,status:response.statusCode});if(!res.destroyed){res.writeHead(response.statusCode,response.headers);res.end(Buffer.concat(received));}op.resolveDrain();});
 });upstream.on('error',()=>{op.resolveDrain();if(!res.destroyed){res.writeHead(502);res.end();}});upstream.end(Buffer.concat(chunks));
});
await new Promise(r=>relay.listen(0,'127.0.0.1',r));const delayed=client(`http://127.0.0.1:${relay.address().port}`);
const protectedKey=prefix+'protected/original';await s3.send(new PutObjectCommand({Bucket,Key:protectedKey,Body:original}));record('controlled-original-staged',{key:protectedKey,sha256:binding.originalSha256});
async function test(name,fn){try{const details=await fn();cases.push({name,result:'PASS',...details});}catch(e){cases.push({name,result:'FAIL',error:e.message?.startsWith('Assertion:')?e.message:'Bounded integration failure; raw SDK/credential details suppressed.'});}}
try{
 await test('valid-current-real-media-promotion',async()=>{
  const id=runId+'-valid',token=randomUUID(),Key=prefix+'valid/'+binding.outputName;await intent(id,token,Key);assert(await authority(id,token),'valid authority');
  await s3.send(new PutObjectCommand({Bucket,Key,Body:output}));assert(await getHash(Key)===binding.outputSha256,'valid media write hash');assert(await promote(id,token)===1,'valid CAS');
  await db.query("UPDATE lab.spike061_inventory SET state='PROMOTED' WHERE id=$1",[id]);record('valid-publication-cas',{id});
  await s3.send(new DeleteObjectCommand({Bucket,Key}));assert(await head(Key)==='MISSING','valid fixture cleanup');return {casRows:1,actualMediaSha256:binding.outputSha256,cleanup:'HEAD_404'};
 });
 for(const fault of ['cancel','token-revoked','fence-change','generation-change','epoch-change','lease-expired','heartbeat-loss'])await test(fault,async()=>{
  const id=runId+'-'+fault,token=randomUUID(),Key=prefix+fault+'/'+binding.outputName;await intent(id,token,Key);
  let release,resolveDrain;held={id,accepted:false,drained:false,release:new Promise(r=>release=r),drain:new Promise(r=>resolveDrain=r),resolveDrain:()=>resolveDrain()};
  const op=held,abort=new AbortController();let gateOpen=true;
  const write=delayed.send(new PutObjectCommand({Bucket,Key,Body:output}),{abortSignal:abort.signal}).then(()=> 'ACK',()=> 'UNKNOWN');
  for(let n=0;n<100&&!op.accepted;n++)await pause(20);assert(op.accepted,'real-media held PUT accepted');
  if(fault==='cancel')await db.query('UPDATE lab.spike061_authority SET barrier=true WHERE id=$1',[id]);
  if(fault==='token-revoked')await db.query('UPDATE lab.spike061_authority SET token=$2 WHERE id=$1',[id,randomUUID()]);
  if(['fence-change','generation-change','epoch-change'].includes(fault)){const column=fault.split('-')[0];await db.query(`UPDATE lab.spike061_authority SET ${column}=${column}+1 WHERE id=$1`,[id]);}
  if(fault==='lease-expired')await db.query("UPDATE lab.spike061_authority SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[id]);
  if(fault==='heartbeat-loss')await db.query("UPDATE lab.spike061_authority SET lease_until=clock_timestamp()+interval '100 milliseconds' WHERE id=$1",[id]);
  record('authority-fault-injected',{id,fault});const started=Date.now();
  while(await authority(id,token)){assert(Date.now()-started<2000,'authority loss detection deadline');await pause(20);}
  gateOpen=false;abort.abort();record('writer-admission-closed-client-aborted',{id});assert(await write==='UNKNOWN','aborted caller unknown');
  assert(!op.drained,'premature writer drain');await db.query("UPDATE lab.spike061_inventory SET state='UNKNOWN' WHERE id=$1",[id]);
  assert(await promote(id,token)===0,'stale CAS rejected');
  let rejectedNewIo=0;const guardedWrite=async()=>{if(!gateOpen){rejectedNewIo++;return 'DENIED';}await s3.send(new PutObjectCommand({Bucket,Key,Body:output}));return 'ISSUED';};
  assert(await guardedWrite()==='DENIED'&&rejectedNewIo===1,'new IO blocked');record('partial-not-promoted',{id,casRows:0,reason:'ACTIVE_EXTERNAL_WRITER'});
  release();await deadline(op.drain,5000,'external writer drain deadline');assert(op.drained&&op.status===200,'actual late storage write');assert(await getHash(Key)===binding.outputSha256,'late real-media hash');
  await db.query("UPDATE lab.spike061_inventory SET state='DRAINED' WHERE id=$1",[id]);
  await s3.send(new DeleteObjectCommand({Bucket,Key}));assert(await head(Key)==='MISSING','post-drain absence');await pause(100);assert(await head(Key)==='MISSING','no resurrection');
  assert(await promote(id,token)===0,'late result still stale');await db.query("UPDATE lab.spike061_inventory SET state='CLEANED' WHERE id=$1",[id]);record('cleanup-after-drain-confirmed',{id});
  return {caseId:binding.caseId,mediaSha256:binding.outputSha256,staleCasRows:0,clientOutcome:'UNKNOWN',actualLatePut:true,writerDrained:true,newIoDenied:true,rejectedNewIo,cleanup:'HEAD_404',reactionMs:Date.now()-started};
 });
 await test('original-byte-identical-after-faults',async()=>{assert(hash(fs.readFileSync(originalFile))===binding.originalSha256,'input original intact');assert(await getHash(protectedKey)===binding.originalSha256,'stored original intact');return {originalSha256:binding.originalSha256};});
}finally{
 delayed.destroy();s3.destroy();relay.closeAllConnections();await new Promise(r=>relay.close(r));
 const inventory=(await db.query('SELECT id,key,state,case_id,sha256,fence,generation FROM lab.spike061_inventory WHERE run=$1',[runId])).rows;await db.end();
 const evidence={ticket:'EL-TK-061',runId,recordedAt:new Date().toISOString(),experimentOnly:true,binding,cases,timeline,inventory,reference:'EL-TK-060 PASS: process-group stop, external writer containment and crash recovery remain separately evidenced; this experiment links publication faults to actual multimedia derivatives.',limitations:['Trusted publication supervisor only; no codec parser receives network or secrets.','No production executor/provider certification.','Protected controlled original is retained within this unique private attempt prefix.'],result:cases.length===9&&cases.every(c=>c.result==='PASS')?'PASS':'FAIL'};
 fs.writeFileSync('/state/result.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({ticket:'EL-TK-061',supplementalIntegrationRunId:runId,passed:cases.filter(c=>c.result==='PASS').length,total:cases.length,result:evidence.result}));
 if(evidence.result!=='PASS')process.exitCode=1;
}
