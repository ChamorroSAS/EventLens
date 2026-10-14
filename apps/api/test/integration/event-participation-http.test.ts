import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PasswordVerifier } from '@eventlens/identity';
import { createApplication } from '../../dist/application.js';
import { readConfig } from '../../dist/platform/config/config.js';
import { DatabaseService } from '../../dist/platform/database/database.service.js';
import { OrganizerSessionService } from '../../dist/identity/organizer-session.service.js';
import { OrganizerEventLifecycleAdapter } from '../../dist/events/organizer-event-lifecycle.js';
import { UploadLifecycleService, UploadAuthorizationService, GuestSessionService } from '@eventlens/event-management';
import { CapacityReservationService, CapacityPlanService } from '@eventlens/capacity-management';

let application: Awaited<ReturnType<typeof createApplication>>;
let base: string;
let db: DatabaseService;
let sessions: OrganizerSessionService;
let config: ReturnType<typeof readConfig>;

beforeAll(async () => {
  if (!process.env.DATABASE_URL && !process.env.PGHOST) throw new Error('REAL_POSTGRES_CONNECTION_REQUIRED');
  config = readConfig(process.env);
  application = await createApplication(config);
  await application.app.listen(0, '127.0.0.1');
  base = await application.app.getUrl();
  db = application.app.get(DatabaseService);
  sessions = application.app.get(OrganizerSessionService);
});
afterAll(async () => { await application?.app.close(); });

async function owner() {
  const accountId = randomUUID();
  const invitationId = randomUUID();
  const email = `lifecycle.${accountId}@eventlens.internal`;
  const password = 'LifecycleIntegrationPassword123!';
  const digest = await new PasswordVerifier().hashPassword(password);
  await db.transactions.run(async tx => {
    await tx.execute(`INSERT INTO beta_invitation (id,email,email_normalized,token_digest,status,issued_by,expires_at)
      VALUES ($1,$2,$2,$3,'CONSUMED',$4,$5)`, invitationId, email, createHash('sha256').update(randomBytes(32)).digest('hex'), randomUUID(), new Date(Date.now() + 86400000));
    await tx.execute(`INSERT INTO organizer_account (id,email,email_normalized,status,declared_adult,declared_adult_at,invitation_id,verified_at)
      VALUES ($1,$2,$2,'ACTIVE',true,NOW(),$3,NOW())`, accountId, email, invitationId);
    await tx.execute(`INSERT INTO organizer_credential (id,account_id,purpose,secret_digest,revision,status)
      VALUES ($1,$2,'ORGANIZER_AUTHENTICATION',$3,1,'ACTIVE')`, randomUUID(), accountId, digest);
  });
  const login = await sessions.getAuthService().login({ email, password, origin: config.webOrigin });
  const headers = { Cookie: `__Host-el_session=${login.sessionToken}`, Origin: config.webOrigin, 'X-CSRF-Token': login.csrfToken, 'Content-Type': 'application/json' };
  return { accountId, login, headers };
}

async function fixture(status = 'ACTIVE') {
  const actor = await owner();
  const response = await fetch(`${base}/api/v1/events`, { method: 'POST', headers: { ...actor.headers, 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ name: 'Participation integration' }) });
  expect(response.status).toBe(201);
  const eventId = ((await response.json()) as any).event.id as string;
  await db.transactions.run(tx => tx.execute('UPDATE event SET status=$2,uploads_enabled=true,expires_at=$3 WHERE id=$1', eventId, status, new Date(Date.now()+86400000)));
  return { ...actor, eventId };
}
async function snapshot(f: Awaited<ReturnType<typeof fixture>>) {
  const response = await fetch(`${base}/api/v1/events/${f.eventId}/configuration`, { headers: f.headers });
  expect(response.status).toBe(200);
  return await response.json() as any;
}
function save(f: Awaited<ReturnType<typeof fixture>>, expectedRevision: string, uploadsEnabled: boolean, guestGalleryEnabled: boolean, key = randomUUID(), headers = f.headers) {
  return fetch(`${base}/api/v1/events/${f.eventId}/configuration/participation`, { method:'PUT',headers:{...headers,'Idempotency-Key':key},body:JSON.stringify({uploadsEnabled,guestGalleryEnabled,expectedRevision}) });
}
async function attempts(eventId: string) {
  const sessionId = randomUUID();
  const token = randomBytes(32).toString('hex');
  await db.transactions.run(async tx => {
    await tx.execute("INSERT INTO public_access_credential (id,event_id,lookup_key,token_hash) VALUES ($1,$2,$3,$4)", randomUUID(),eventId,randomUUID(),randomUUID());
    await tx.execute("INSERT INTO guest_session (id,event_id,token_hash,expires_at,consent_recorded_at,consent_version,contributor_nickname) VALUES ($1,$2,$3,$4,NOW(),'test','Guest')",sessionId,eventId,createHash('sha256').update(token).digest('hex'),new Date(Date.now()+86400000));
  });
  const records: {id:string;reservationId:string;status:string;objectKey:string}[]=[];
  for(const status of ['AUTHORIZED','UPLOADING','CONFIRMING','VALIDATED','ACCEPTED']) {
    const id=randomUUID(),reservationId=randomUUID(),objectKey=`events/${eventId}/originals/${id}`;
    await db.transactions.run(async tx=>{
      await tx.execute("INSERT INTO capacity_reservation (id,event_id,idempotency_key,bytes,status) VALUES ($1,$2,$3,100,$4)",reservationId,eventId,id,status==='ACCEPTED'?'COMMITTED':'ACTIVE');
      await tx.execute("INSERT INTO upload_attempt (id,event_id,guest_session_id,reservation_id,idempotency_key,declared_size,declared_type,contributor_nickname,status,object_key,expires_at) VALUES ($1::uuid,$2,$3,$4,$1::text,100,'PHOTO','Guest',$5,$6,$7)",id,eventId,sessionId,reservationId,status,objectKey,new Date(Date.now()+86400000));
    });
    records.push({id,reservationId,status,objectKey});
  }
  return {sessionId,token,records};
}

it('persists four independent flag combinations across editable states and rejects terminal edits',async()=>{
  for(const status of ['DRAFT','SCHEDULED','ACTIVE']) {
    const f=await fixture(status);
    for(const [uploads,gallery] of [[false,false],[false,true],[true,false],[true,true]]) {
      const before=await snapshot(f);
      const response=await save(f,before.revision,uploads,gallery);
      expect(response.status).toBe(200);
      const ack=await response.json() as any;
      expect(ack.receipt.appliedRevision).toBe(String(BigInt(before.revision)+1n));
      const stored=await db.transactions.run(tx=>tx.query<any>('SELECT uploads_enabled,guest_gallery_enabled,status FROM event WHERE id=$1',f.eventId));
      expect(stored[0]).toMatchObject({uploads_enabled:uploads,guest_gallery_enabled:gallery,status});
    }
  }
  for(const status of ['CLOSED','GRACE_PERIOD','SUSPENDED','PENDING_DELETION','ARCHIVED']) {
    const f=await fixture(status);
    const revision=await db.transactions.run(tx=>tx.query<any>('SELECT revision FROM event WHERE id=$1',f.eventId));
    expect((await save(f,String(revision[0].revision),false,true)).status).toBe(409);
  }
},30000);

it('replays exact receipt before current state/CAS, differentiates key mismatch and rejects unauthorized callers',async()=>{
  const f=await fixture(),alien=await owner();const before=await snapshot(f);const key=randomUUID();
  expect((await save(f,before.revision,true,true,key)).status).toBe(200);
  expect((await save(f,before.revision,false,true)).status).toBe(409);
  expect((await save(f,before.revision,false,true,key)).status).toBe(409);
  await db.transactions.run(tx=>tx.execute("UPDATE event SET status='CLOSED' WHERE id=$1",f.eventId));
  const replay=await save(f,before.revision,true,true,key);expect(replay.status).toBe(200);expect((await replay.json() as any).outcome).toBe('IDEMPOTENT_REPLAY');
  expect((await save(f,before.revision,true,true,key,alien.headers)).status).toBe(404);
  expect((await save(f,before.revision,true,true,key,{...f.headers,Origin:'https://alien.invalid'})).status).toBe(403);
  expect((await save(f,before.revision,true,true,key,{...f.headers,'X-CSRF-Token':'bad'})).status).toBe(403);
  await db.transactions.run(tx=>tx.execute("UPDATE organizer_account SET status='PENDING_DELETION' WHERE id=$1",f.accountId));
  expect((await save(f,before.revision,true,true,key)).status).toBe(403);
},30000);

it('cancels only unconfirmed attempts, releases once, retains object keys and preserves other events',async()=>{
  const f=await fixture(),other=await fixture();const pending=await attempts(f.eventId),foreign=await attempts(other.eventId);const before=await snapshot(f),key=randomUUID();
  expect((await save(f,before.revision,false,true,key)).status).toBe(200);
  expect((await save(f,before.revision,false,true,key)).status).toBe(200);
  const stored=await db.transactions.run(tx=>tx.query<any>('SELECT a.id,a.status,a.object_key,r.status AS reservation_status FROM upload_attempt a JOIN capacity_reservation r ON r.id=a.reservation_id WHERE a.event_id=$1',f.eventId));
  for(const record of pending.records){const row=stored.find(r=>r.id===record.id);expect(row.object_key).toBe(record.objectKey);expect(row.status).toBe(['VALIDATED','ACCEPTED'].includes(record.status)?record.status:'CANCELLED');expect(row.reservation_status).toBe(record.status==='ACCEPTED'?'COMMITTED':record.status==='VALIDATED'?'ACTIVE':'RELEASED');}
  const untouched=await db.transactions.run(tx=>tx.query<any>('SELECT id,status FROM upload_attempt WHERE event_id=$1',other.eventId));
  for(const record of foreign.records)expect(untouched.find(r=>r.id===record.id).status).toBe(record.status);
},30000);

it('rolls back all effects when release or receipt persistence fails',async()=>{
  const f=await fixture();await attempts(f.eventId);const before=await snapshot(f);
  const auditCount=async()=>db.transactions.run(tx=>tx.query<any>("SELECT count(*)::int AS count FROM admin_audit_event WHERE target_identifier=$1 AND procedure='EVENT_PARTICIPATION_CONFIGURED'",f.eventId));
  const auditsBefore=(await auditCount())[0].count;
  for(const failingSql of ['UPDATE capacity_reservation','INSERT INTO event_command_receipt']) {
    const adapter=new OrganizerEventLifecycleAdapter({run:work=>db.transactions.run(tx=>work({query:(sql,...args)=>{if(sql.includes(failingSql))throw Error('INJECTED_FAILURE');return tx.query(sql,...args);},execute:(sql,...args)=>{if(sql.includes(failingSql))throw Error('INJECTED_FAILURE');return tx.execute(sql,...args);}}))},sessions);
    await expect(adapter.setParticipation({eventId:f.eventId,cookieHeader:f.headers.Cookie,originHeader:config.webOrigin,csrfToken:f.login.csrfToken,idempotencyKey:randomUUID(),body:{uploadsEnabled:false,guestGalleryEnabled:true,expectedRevision:before.revision}})).rejects.toThrow('INJECTED_FAILURE');
    expect((await snapshot(f)).revision).toBe(before.revision);
    const flags=await db.transactions.run(tx=>tx.query<any>('SELECT uploads_enabled,guest_gallery_enabled FROM event WHERE id=$1',f.eventId));expect(flags[0]).toMatchObject({uploads_enabled:true,guest_gallery_enabled:false});
    expect((await auditCount())[0].count).toBe(auditsBefore);
    const released=await db.transactions.run(tx=>tx.query<any>("SELECT count(*)::int AS count FROM capacity_reservation WHERE event_id=$1 AND status='RELEASED'",f.eventId));expect(released[0].count).toBe(0);
    const cancelled=await db.transactions.run(tx=>tx.query<any>("SELECT count(*)::int AS count FROM upload_attempt WHERE event_id=$1 AND status='CANCELLED'",f.eventId));expect(cancelled[0].count).toBe(0);
  }
},30000);

it('serializes disable with confirmation under event-before-attempt locks',async()=>{
  const f=await fixture();const seeded=await attempts(f.eventId),before=await snapshot(f),attempt=seeded.records.find(r=>r.status==='UPLOADING')!;
  const storage={getObjectMetadata:async()=>({sizeBytes:100n}),createUploadUrl:async()=>{throw Error('unused');},abortOrDeleteObject:async()=>{throw Error('unused');}};
  const uploads=new UploadLifecycleService(db.transactions,new GuestSessionService(db.transactions),storage as any);
  const outcomes=await Promise.allSettled([uploads.confirmUpload({sessionToken:seeded.token,attemptId:attempt.id}),save(f,before.revision,false,true)]);
  expect(outcomes[1].status).toBe('fulfilled');if(outcomes[1].status==='fulfilled')expect(outcomes[1].value.status).toBe(200);
  const final=await db.transactions.run(tx=>tx.query<any>('SELECT status FROM upload_attempt WHERE id=$1',attempt.id));expect(final[0].status).toBe('CANCELLED');
},30000);

it('rejects malformed flags/revision/key and revoked sessions without effects',async()=>{
  const f=await fixture(),before=await snapshot(f);
  for(const body of [{uploadsEnabled:'false',guestGalleryEnabled:true,expectedRevision:before.revision},{uploadsEnabled:true,expectedRevision:before.revision},{uploadsEnabled:true,guestGalleryEnabled:true,expectedRevision:'0'},{uploadsEnabled:true,guestGalleryEnabled:true,expectedRevision:before.revision,unknown:true}]) {
    const response=await fetch(`${base}/api/v1/events/${f.eventId}/configuration/participation`,{method:'PUT',headers:{...f.headers,'Idempotency-Key':randomUUID()},body:JSON.stringify(body)});expect(response.status).toBe(400);
  }
  expect((await save(f,before.revision,false,true,'invalid key')).status).toBe(400);
  expect((await snapshot(f)).revision).toBe(before.revision);
  const validated = await sessions.getAuthService().validateSession({sessionToken:f.login.sessionToken});
  await sessions.getAuthService().logout({actorContext:validated.actorContext});
  expect((await save(f,before.revision,false,true)).status).toBe(401);
},30000);

it('serializes disable with new authorization and leaves no live unconfirmed attempts',async()=>{
  const f=await fixture(),seeded=await attempts(f.eventId),before=await snapshot(f);
  // Bind capacity and authorization to the identical SQL transaction.
  const authorize=db.transactions.run(async tx=>{
    const scoped={run:<T>(callback:any):Promise<T>=>callback(tx)};
    const capacity=new CapacityReservationService(scoped,new CapacityPlanService(scoped));
    return new UploadAuthorizationService(scoped,new GuestSessionService(scoped),{reserveCapacity:command=>capacity.reserveCapacity(command)}).authorizeUploadAttempt({sessionToken:seeded.token,declaredSize:100n,declaredType:'PHOTO',idempotencyKey:randomUUID()});
  });
  const outcomes=await Promise.allSettled([authorize,save(f,before.revision,false,true)]);
  if(outcomes[1].status==='fulfilled')expect(outcomes[1].value.status).toBe(200);else throw outcomes[1].reason;
  if(outcomes[0].status==='rejected')expect(outcomes[0].reason.code).toBe('UPLOADS_DISABLED');
  const final=await db.transactions.run(tx=>tx.query<any>("SELECT count(*)::int AS count FROM upload_attempt WHERE event_id=$1 AND status IN ('AUTHORIZED','UPLOADING','CONFIRMING')",f.eventId));expect(final[0].count).toBe(0);
},30000);

