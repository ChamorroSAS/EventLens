import { createHash,randomBytes,randomUUID } from 'node:crypto';
import { beforeAll,afterAll,it,expect,vi } from 'vitest';
import { S3Client,CreateBucketCommand,PutBucketVersioningCommand,GetObjectCommand } from '@aws-sdk/client-s3';
import { createApplication } from '../../dist/application.js';
import { readConfig } from '../../dist/platform/config/config.js';
import { LocalMediaStorage } from '../../dist/guest/guest-upload.service.js';
import { DatabaseService } from '../../dist/platform/database/database.service.js';
let application:Awaited<ReturnType<typeof createApplication>>,base:string,db:DatabaseService,s3:S3Client,config:ReturnType<typeof readConfig>;
beforeAll(async()=>{
 config=readConfig({...process.env,NODE_ENV:'development',LOCAL_MEDIA_UPLOAD_ENABLED:'true',MINIO_ENDPOINT:process.env.MINIO_ENDPOINT??'http://test-minio:9000',MINIO_BUCKET:`eventlens-test-${randomUUID()}`,MINIO_ROOT_USER:'isolated-media',MINIO_ROOT_PASSWORD:'isolated-media-test-only'});
 if(!config.localMedia)throw new Error('LOCAL_MEDIA_CONFIG_REQUIRED');
 s3=new S3Client({region:'us-east-1',endpoint:config.localMedia.endpoint,forcePathStyle:true,credentials:{accessKeyId:config.localMedia.accessKeyId,secretAccessKey:config.localMedia.secretAccessKey}});
 await s3.send(new CreateBucketCommand({Bucket:config.localMedia.bucket}));await s3.send(new PutBucketVersioningCommand({Bucket:config.localMedia.bucket,VersioningConfiguration:{Status:'Enabled'}}));
 application=await createApplication(config);await application.app.listen(0,'127.0.0.1');base=await application.app.getUrl();db=application.app.get(DatabaseService);
});
afterAll(async()=>{await application?.app.close();s3?.destroy();});
async function fixture(){
 const accountId=randomUUID(),eventId=randomUUID(),guestId=randomUUID(),token=randomBytes(32).toString('hex'),invitationId=randomUUID();
 await db.transactions.run(async tx=>{
  await tx.execute("INSERT INTO beta_invitation(id,email,email_normalized,token_digest,status,issued_by,expires_at) VALUES($1,$2,$2,$3,'CONSUMED',$4,$5)",invitationId,`${accountId}@isolated.test`,createHash('sha256').update(randomBytes(32)).digest('hex'),randomUUID(),new Date(Date.now()+86400000));
  await tx.execute("INSERT INTO organizer_account(id,email,email_normalized,status,declared_adult,declared_adult_at,invitation_id,verified_at) VALUES($1,$2,$2,'ACTIVE',true,NOW(),$3,NOW())",accountId,`${accountId}@isolated.test`,invitationId);
  await tx.execute("INSERT INTO event(id,organizer_id,name,status,uploads_enabled,expires_at) VALUES($1,$2,'Transfer test','ACTIVE',true,$3)",eventId,accountId,new Date(Date.now()+86400000));
  await tx.execute("INSERT INTO public_access_credential(id,event_id,lookup_key,token_hash) VALUES($1,$2,$3,$4)",randomUUID(),eventId,randomUUID(),randomUUID());
  await tx.execute("INSERT INTO guest_session(id,event_id,token_hash,expires_at,consent_recorded_at,consent_version,contributor_nickname) VALUES($1,$2,$3,$4,NOW(),'test','Test guest')",guestId,eventId,createHash('sha256').update(token).digest('hex'),new Date(Date.now()+86400000));
 });
 const headers={Cookie:`el_guest_session=${token}`,Origin:config.webOrigin,'Content-Type':'application/json'};
 return {accountId,eventId,guestId,token,headers};
}
function presign(f:any,file:any){return fetch(`${base}/api/v1/public/guest-session/uploads/presign`,{method:'POST',headers:f.headers,body:JSON.stringify({files:[file]})});}
function confirm(f:any,attemptId:string){return fetch(`${base}/api/v1/public/guest-session/uploads/confirm`,{method:'POST',headers:f.headers,body:JSON.stringify({attemptId})});}
const bytes=Buffer.from('actual private transfer bytes');
function file(key=randomUUID()){return {name:'photo.jpg',size:bytes.length,type:'image/jpeg',idempotencyKey:key};}
async function grant(f:any,requested=file()){
 const response=await presign(f,requested);expect(response.status).toBe(200);return ((await response.json()) as any).uploads[0];
}
async function upload(g:any,data=bytes){
 const form=new FormData();for(const [key,value]of Object.entries(g.fields))form.append(key,String(value));form.append('file',new Blob([data],{type:'image/jpeg'}),'photo.jpg');
 return fetch(`${config.localMedia!.endpoint}/${config.localMedia!.bucket}`,{method:'POST',body:form});
}
it('transfers real bytes, seals exact version, keeps one reservation and replays receipt',async()=>{
 const f=await fixture(),requested=file(),g=await grant(f,requested);expect(g.uploadUrl).toBe(`/storage/${config.localMedia!.bucket}`);expect(g.attemptId).toMatch(/^[0-9a-f-]{36}$/);
 expect((await upload(g)).ok).toBe(true);const ack=await confirm(f,g.attemptId);expect(ack.status).toBe(200);const received=await ack.json();expect(received).toMatchObject({status:'RECEIVED',state:'CONFIRMING',attemptId:g.attemptId});
 const replay=await confirm(f,g.attemptId);expect(replay.status).toBe(200);expect(await replay.json()).toEqual(received);
 const rows=await db.transactions.run(tx=>tx.query<any>('SELECT t.*,a.status,a.actual_size,r.status AS reservation_status FROM local_upload_transfer t JOIN upload_attempt a ON a.id=t.attempt_id JOIN capacity_reservation r ON r.id=a.reservation_id WHERE t.attempt_id=$1',g.attemptId));
 expect(rows[0]).toMatchObject({status:'CONFIRMING',reservation_status:'ACTIVE',actual_sha256:createHash('sha256').update(bytes).digest('hex')});
 const sealed=await s3.send(new GetObjectCommand({Bucket:config.localMedia!.bucket,Key:rows[0].sealed_key,VersionId:rows[0].sealed_version}));expect(Buffer.from(await sealed.Body!.transformToByteArray())).toEqual(bytes);
 // Old staging grants cannot overwrite the sealed original used by the receipt.
 expect((await upload(g,Buffer.alloc(bytes.length,120))).ok).toBe(true);
 const original=await s3.send(new GetObjectCommand({Bucket:config.localMedia!.bucket,Key:rows[0].sealed_key,VersionId:rows[0].sealed_version}));expect(Buffer.from(await original.Body!.transformToByteArray())).toEqual(bytes);
 expect((await presign(f,requested)).status).toBe(422);
 const count=await db.transactions.run(tx=>tx.query<any>('SELECT count(*)::int AS n FROM capacity_reservation WHERE event_id=$1',f.eventId));expect(count[0].n).toBe(1);
});
it('stable retry before upload reuses attempt; payload conflict and cross-guest confirmation fail',async()=>{
 const f=await fixture(),requested=file(),g=await grant(f,requested);expect((await grant(f,requested)).attemptId).toBe(g.attemptId);expect((await presign(f,{...requested,type:'image/png'})).status).toBe(409);
 const other=await fixture();expect((await confirm(other,g.attemptId)).status).toBe(404);expect((await confirm(f,g.attemptId)).status).toBe(422);
});
it('denies consent, nickname, QR rotation, account suspension, disabled uploads and invalid origin',async()=>{
 for(const mutation of ["UPDATE guest_session SET consent_recorded_at=NULL WHERE event_id=$1","UPDATE guest_session SET contributor_nickname=NULL WHERE event_id=$1","UPDATE public_access_credential SET revoked_at=NOW() WHERE event_id=$1","UPDATE event SET uploads_enabled=false WHERE id=$1","UPDATE organizer_account SET status='SUSPENDED' WHERE id=(SELECT organizer_id FROM event WHERE id=$1)"]){const f=await fixture();await db.transactions.run(tx=>tx.execute(mutation,f.eventId));expect((await presign(f,file())).status).toBeGreaterThanOrEqual(400);}
 const f=await fixture();expect((await presign({...f,headers:{...f.headers,Origin:'https://evil.test'}},file())).status).toBe(403);
});
it('rechecks current policy and active reservation after bytes arrive',async()=>{
 for(const mutation of ["UPDATE event SET uploads_enabled=false WHERE id=$1","UPDATE guest_session SET revoked_at=NOW() WHERE event_id=$1","UPDATE capacity_reservation SET status='RELEASED' WHERE event_id=$1"]){const f=await fixture(),g=await grant(f);expect((await upload(g)).ok).toBe(true);await db.transactions.run(tx=>tx.execute(mutation,f.eventId));expect((await confirm(f,g.attemptId)).status).toBeGreaterThanOrEqual(400);const rows=await db.transactions.run(tx=>tx.query<any>('SELECT received_at FROM local_upload_transfer WHERE attempt_id=$1',g.attemptId));expect(rows[0].received_at).toBeNull();}
});
it('validates optional checksum from real bytes and never accepts mismatched content',async()=>{
 const f=await fixture(),g=await grant(f,{...file(),sha256:'0'.repeat(64)});expect((await upload(g)).ok).toBe(true);expect((await confirm(f,g.attemptId)).status).toBe(422);const rows=await db.transactions.run(tx=>tx.query<any>('SELECT status FROM upload_attempt WHERE id=$1',g.attemptId));expect(rows[0].status).toBe('UPLOADING');
});

it('concurrent confirms persist one stable receipt and audit without duplicate quota',async()=>{
 const f=await fixture(),g=await grant(f);expect((await upload(g)).ok).toBe(true);
 const responses=await Promise.all([confirm(f,g.attemptId),confirm(f,g.attemptId)]);expect(responses.map(r=>r.status)).toEqual([200,200]);expect(await responses[0].json()).toEqual(await responses[1].json());
 const audits=await db.transactions.run(tx=>tx.query<any>("SELECT count(*)::int AS n FROM admin_audit_event WHERE target_identifier=$1 AND procedure='GUEST_UPLOAD_RECEIVED'",g.attemptId));expect(audits[0].n).toBe(1);
});
it('policy change after external seal is revalidated without acknowledging receipt',async()=>{
 const f=await fixture(),g=await grant(f);expect((await upload(g)).ok).toBe(true);
 const original=LocalMediaStorage.prototype.seal;
 const spy=vi.spyOn(LocalMediaStorage.prototype,'seal').mockImplementation(async function(grant:any){const sealed=await original.call(this,grant);await db.transactions.run(tx=>tx.execute('UPDATE event SET uploads_enabled=false WHERE id=$1',f.eventId));return sealed;});
 try{expect((await confirm(f,g.attemptId)).status).toBe(403);}finally{spy.mockRestore();}
 const rows=await db.transactions.run(tx=>tx.query<any>('SELECT received_at FROM local_upload_transfer WHERE attempt_id=$1',g.attemptId));expect(rows[0].received_at).toBeNull();
});
it('denies same-event other guest, expired grant and storage POST wrong byte length',async()=>{
 const f=await fixture(),g=await grant(f);const otherId=randomUUID(),otherToken=randomBytes(32).toString('hex');
 await db.transactions.run(tx=>tx.execute("INSERT INTO guest_session(id,event_id,token_hash,expires_at,consent_recorded_at,consent_version,contributor_nickname) VALUES($1,$2,$3,$4,NOW(),'test','Other guest')",otherId,f.eventId,createHash('sha256').update(otherToken).digest('hex'),new Date(Date.now()+86400000)));
 expect((await confirm({...f,headers:{...f.headers,Cookie:`el_guest_session=${otherToken}`}},g.attemptId)).status).toBe(404);
 expect((await upload(g,Buffer.alloc(bytes.length+1))).ok).toBe(false);
 expect((await upload(g)).ok).toBe(true);
 await db.transactions.run(tx=>tx.execute('UPDATE local_upload_transfer SET grant_expires_at=$2 WHERE attempt_id=$1',g.attemptId,new Date(Date.now()-1000)));
 expect((await confirm(f,g.attemptId)).status).toBe(422);
});
it('enforces exhausted capacity and changed request filename without creating extra intent',async()=>{
 const f=await fixture(),requested=file();await grant(f,requested);expect((await presign(f,{...requested,name:'changed.jpg'})).status).toBe(409);
 await db.transactions.run(tx=>tx.execute("UPDATE event_capacity_balance SET consumed_files=(SELECT max_files FROM plan WHERE code='BETA_DEFAULT') WHERE event_id=$1",f.eventId));
 const denied=await presign(f,file());expect(denied.status).toBe(422);expect(await denied.json()).toMatchObject({code:'INSUFFICIENT_FILE_CAPACITY'});
 const attempts=await db.transactions.run(tx=>tx.query<any>('SELECT count(*)::int AS n FROM upload_attempt WHERE event_id=$1',f.eventId));expect(attempts[0].n).toBe(1);
});
it('own contributions reload uses durable CONFIRMING snapshot after receipt',async()=>{
 const f=await fixture(),g=await grant(f);expect((await upload(g)).ok).toBe(true);expect((await confirm(f,g.attemptId)).status).toBe(200);
 const response=await fetch(`${base}/api/v1/public/guest-session/contributions`,{headers:f.headers});expect(response.status).toBe(200);
 const snapshot=await response.json() as any;expect(snapshot.contributions).toEqual(expect.arrayContaining([expect.objectContaining({attemptId:g.attemptId,status:'CONFIRMING',actualSize:bytes.length})]));
});
it('database rejects an incomplete received receipt with NULL byte count',async()=>{
 const f=await fixture(),g=await grant(f);
 await expect(db.transactions.run(tx=>tx.execute("UPDATE local_upload_transfer SET received_at=NOW(),operation_id=attempt_id,source_version='source',sealed_key='private',sealed_version='sealed',actual_sha256=$2,actual_bytes=NULL WHERE attempt_id=$1",g.attemptId,'0'.repeat(64)))).rejects.toBeDefined();
 const rows=await db.transactions.run(tx=>tx.query<any>('SELECT received_at FROM local_upload_transfer WHERE attempt_id=$1',g.attemptId));expect(rows[0].received_at).toBeNull();
});
