import {test,expect,afterAll} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import pg from 'pg';
import {S3Client,PutObjectCommand,GetObjectCommand,HeadObjectCommand,DeleteObjectCommand,CreateMultipartUploadCommand,UploadPartCommand,CompleteMultipartUploadCommand,AbortMultipartUploadCommand,ListPartsCommand} from '@aws-sdk/client-s3';
const secret=(n:string)=>readFileSync(`/run/secrets/${n}`,'utf8').trim();
const endpoint=process.env.S3_ENDPOINT??'http://minio:9000';
const s3=new S3Client({region:'us-east-1',endpoint,forcePathStyle:true,maxAttempts:1,credentials:{accessKeyId:secret('s3_lab_user'),secretAccessKey:secret('s3_lab_password')}});
const config={host:'postgres',database:'eventlens_lab',user:'lab_runner',password:secret('pg_lab')};
const evidence:{test:string;result:string}[]=[];
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const bucket='eventlens-lab';
async function objectResult(key:string){try{await s3.send(new HeadObjectCommand({Bucket:bucket,Key:key}));return 'Exists';}catch(e:any){return e.$metadata?.httpStatusCode===404?'Missing':'Unknown';}}
test('PostgreSQL real commit, rollback and lab SKIP LOCKED concurrency',async()=>{
 const a=new pg.Client(config),b=new pg.Client(config);await a.connect();await b.connect();
 try{
 await a.query('CREATE TABLE IF NOT EXISTS lab.capability_rows(id int primary key, note text not null)');
 await a.query('BEGIN');await a.query("INSERT INTO lab.capability_rows VALUES(1,'persistent') ON CONFLICT(id) DO NOTHING");await a.query('COMMIT');
 await a.query('BEGIN');await a.query("INSERT INTO lab.capability_rows VALUES(2,'rolled-back') ON CONFLICT(id) DO NOTHING");await a.query('ROLLBACK');
 expect((await b.query('SELECT id FROM lab.capability_rows WHERE id=2')).rowCount).toBe(0);
 await a.query("INSERT INTO lab.capability_rows VALUES(3,'claim-a'),(4,'claim-b') ON CONFLICT(id) DO NOTHING");
 await a.query('BEGIN');await b.query('BEGIN');
 const x=await a.query('SELECT id FROM lab.capability_rows WHERE id>=3 ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED');
 const y=await b.query('SELECT id FROM lab.capability_rows WHERE id>=3 ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED');
 expect(x.rows[0].id).not.toBe(y.rows[0].id);await a.query('ROLLBACK');await b.query('ROLLBACK');
 expect((await a.query('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0]).toEqual({rolsuper:false,rolcreatedb:false,rolcreaterole:false});
 evidence.push({test:'postgres-transactions-and-concurrent-locks',result:'CAPABILITY_CONFIRMED'});
 }finally{await a.end();await b.end();}
});
test('private scoped object IO, checksums and metadata',async()=>{
 const key='attempts/persistence-check.bin',bytes=Buffer.from('EventLens lab persistence fixture\n');
 await s3.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,Metadata:{purpose:'tk059-capability'}}));
 const found=await s3.send(new GetObjectCommand({Bucket:bucket,Key:key}));
 expect(hash(await found.Body!.transformToByteArray())).toBe(hash(bytes));expect(found.Metadata?.purpose).toBe('tk059-capability');
 expect((await fetch(`${endpoint}/${bucket}/${key}`)).status).toBe(403);
 await expect(s3.send(new PutObjectCommand({Bucket:'eventlens-foreign',Key:'attempts/denied',Body:'x'}))).rejects.toMatchObject({$metadata:{httpStatusCode:403}});
 await expect(s3.send(new PutObjectCommand({Bucket:bucket,Key:'outside/denied',Body:'x'}))).rejects.toMatchObject({$metadata:{httpStatusCode:403}});
 evidence.push({test:'private-scope-real-object-checksum-and-metadata',result:'CAPABILITY_CONFIRMED'});
});
test('real multipart complete and abort',async()=>{
 const key=`attempts/multipart-${randomUUID()}`;
 const created=await s3.send(new CreateMultipartUploadCommand({Bucket:bucket,Key:key}));
 const payload=Buffer.from('single permitted multipart part');
 const part=await s3.send(new UploadPartCommand({Bucket:bucket,Key:key,UploadId:created.UploadId,PartNumber:1,Body:payload}));
 await s3.send(new CompleteMultipartUploadCommand({Bucket:bucket,Key:key,UploadId:created.UploadId,MultipartUpload:{Parts:[{PartNumber:1,ETag:part.ETag}]}}));
 const got=await s3.send(new GetObjectCommand({Bucket:bucket,Key:key}));expect(hash(await got.Body!.transformToByteArray())).toBe(hash(payload));
 await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));
 const aborted=await s3.send(new CreateMultipartUploadCommand({Bucket:bucket,Key:key}));
 await s3.send(new UploadPartCommand({Bucket:bucket,Key:key,UploadId:aborted.UploadId,PartNumber:1,Body:payload}));
 await s3.send(new AbortMultipartUploadCommand({Bucket:bucket,Key:key,UploadId:aborted.UploadId}));
 await expect(s3.send(new ListPartsCommand({Bucket:bucket,Key:key,UploadId:aborted.UploadId}))).rejects.toMatchObject({$metadata:{httpStatusCode:404}});
 evidence.push({test:'real-multipart-complete-and-abort',result:'CAPABILITY_CONFIRMED'});
});
test('Missing requires 404; failed connectivity remains Unknown',async()=>{
 const key=`attempts/delete-${randomUUID()}`;await s3.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:'delete fixture'}));
 await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));expect(await objectResult(key)).toBe('Missing');
 await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));expect(await objectResult(key)).toBe('Missing');
 const broken=new S3Client({region:'us-east-1',endpoint:'http://127.0.0.1:1',forcePathStyle:true,maxAttempts:1,credentials:{accessKeyId:secret('s3_lab_user'),secretAccessKey:secret('s3_lab_password')}});
 let classification='Unknown';try{await broken.send(new HeadObjectCommand({Bucket:bucket,Key:key}));classification='Exists';}catch(e:any){classification=e.$metadata?.httpStatusCode===404?'Missing':'Unknown';}finally{broken.destroy();}
 expect(classification).toBe('Unknown');evidence.push({test:'delete-missing-versus-real-connectivity-unknown',result:'CAPABILITY_CONFIRMED'});
});
afterAll(()=>{s3.destroy();writeFileSync('/evidence/capabilities.json',JSON.stringify({ticket:'EL-TK-059',recordedAt:new Date().toISOString(),checks:evidence,TB02:'NOT_EXECUTED',TB01:'NOT_EXECUTED',validationGates:'NOT_EVALUATED',fullCorpus:'PENDING',physicalPlayback:'NOT_EXECUTED'},null,2));});
