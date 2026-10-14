import { describe,it,expect,beforeAll,afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPrismaClient,PrismaTransactions,readDatabaseUrl } from '@eventlens/database';
import { IsolatedTestTransactions } from '@eventlens/database/testing';
import { AdminOrganizerManagementService, AuthenticationError, computeCredentialDigest, DurableRecoveryAuthorityAdapter, OrganizerAuthenticationService, type AdminActorContext } from '../src/index.js';
const databaseUrl=process.env.EVENTLENS_TEST_DATABASE ? readDatabaseUrl(process.env) : undefined;
(databaseUrl?describe:describe.skip)('Admin organizer provisioning with real PostgreSQL and durable authority',()=>{
 if(!databaseUrl)return;
 const client=createPrismaClient(databaseUrl),runner=new IsolatedTestTransactions(new PrismaTransactions(client,15000));
 let directory:string,authority:DurableRecoveryAuthorityAdapter,management:AdminOrganizerManagementService,auth:OrganizerAuthenticationService;
 const actor:AdminActorContext={actorType:'ADMIN_HUMAN',principalId:randomUUID(),identifier:`admin-${randomUUID()}`,sessionId:randomUUID(),authTime:new Date(),credentialRevision:1n,adminAuthRevision:1n,sessionWatermark:1n,recoveryEpoch:1n};
 beforeAll(async()=>{
  directory=await mkdtemp(join(tmpdir(),'el-managed-organizer-'));authority=new DurableRecoveryAuthorityAdapter({storageDir:directory});await authority.initialize();
  management=new AdminOrganizerManagementService(runner,authority);auth=new OrganizerAuthenticationService(runner,{record:async()=>{}},authority);
  await runner.run(async tx=>{
   await tx.execute(`INSERT INTO admin_principal(id,identifier,provision_procedure,provisioned_by) VALUES($1,$2,'INITIAL_BOOTSTRAP','test')`,actor.principalId,actor.identifier);
   await tx.execute(`INSERT INTO admin_session(id,principal_id,token_digest,csrf_token_digest,auth_time,expires_at,last_active_at,idle_expires_at) VALUES($1,$2,$3,'test',now(),now()+interval '8 hours',now(),now()+interval '30 minutes')`,actor.sessionId,actor.principalId,randomUUID());
  });
 });
 afterAll(async()=>{await client.$disconnect();await rm(directory,{recursive:true,force:true});});
 const create=(email:string,key=randomUUID())=>management.execute('CREATE',{actorContext:actor,email,displayName:'Beta organizer',reason:'Beta access',idempotencyKey:key});
 it('provisions without invented verification/adulthood and keeps replay secret-free',async()=>{
  const email=`one-${randomUUID()}@example.test`,key=randomUUID();const result=await create(email,key);
  expect(result.temporaryPassword).toHaveLength(32);expect(result.organizer).toMatchObject({email,emailVerified:false,status:'ACTIVE',passwordChangeRequired:true,revision:'1'});
  const [account]=await runner.run(tx=>tx.query<{declared_adult:boolean;invitation_id:string|null;provisioning_source:string}>('SELECT declared_adult,invitation_id,provisioning_source FROM organizer_account WHERE id=$1',result.organizer.id));
  expect(account).toMatchObject({declared_adult:false,invitation_id:null,provisioning_source:'ADMIN_PROVISIONED'});
  expect((await create(email,key)).temporaryPassword).toBeNull();
  const [request]=await runner.run(tx=>tx.query<{result:unknown}>('SELECT result FROM organizer_management_request WHERE id=$1',key));
  expect(JSON.stringify(request)).not.toContain(result.temporaryPassword!);
  await expect(create(`other-${randomUUID()}@example.test`,key)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  await expect(create(email)).rejects.toMatchObject({code:'EMAIL_EXISTS'});
 });
 it('requires current temporal and adult declaration, fences every ordinary session, rotates and revokes',async()=>{
  const result=await create(`login-${randomUUID()}@example.test`);const login=await auth.login({email:result.organizer.email,password:result.temporaryPassword!});
  expect(login.projection.state).toBe('PASSWORD_CHANGE_REQUIRED');expect(login.projection.account?.emailVerified).toBe(false);
  await expect(auth.validateSession({sessionToken:login.sessionToken})).rejects.toMatchObject({code:'FORBIDDEN'});
  expect((await auth.projectSession({sessionToken:login.sessionToken})).state).toBe('PASSWORD_CHANGE_REQUIRED');
  await expect(management.changeTemporaryPassword({actorContext:login.actorContext,currentPassword:result.temporaryPassword!,newPassword:'new-valid-password',declaredAdult:false})).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
  await expect(management.changeTemporaryPassword({actorContext:login.actorContext,currentPassword:'incorrect-temporary',newPassword:'new-valid-password',declaredAdult:true})).rejects.toMatchObject({code:'INVALID_PASSWORD'});
  await expect(management.changeTemporaryPassword({actorContext:login.actorContext,currentPassword:result.temporaryPassword!,newPassword:result.temporaryPassword!,declaredAdult:true})).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
  expect(await management.changeTemporaryPassword({actorContext:login.actorContext,currentPassword:result.temporaryPassword!,newPassword:'new-valid-password',declaredAdult:true})).toEqual({outcome:'PASSWORD_CHANGED_RELOGIN_REQUIRED'});
  await expect(auth.validateSession({sessionToken:login.sessionToken,allowPasswordChangeOnly:true})).rejects.toMatchObject({code:'SESSION_REVOKED'});
  const ordinary=await auth.login({email:result.organizer.email,password:'new-valid-password'});expect(ordinary.projection.state).toBe('ORGANIZER_ACTIVE');expect(ordinary.projection.account?.emailVerified).toBe(false);
 });
 it('soft disable preserves events, stale concurrent access loses CAS, and suspended reset never enables',async()=>{
  const result=await create(`disable-${randomUUID()}@example.test`),id=result.organizer.id;
  const eventId=randomUUID();await runner.run(tx=>tx.execute(`INSERT INTO event(id,organizer_id,name,idempotency_key) VALUES($1,$2,'Preserved beta event',$3)`,eventId,id,randomUUID()));
  const login=await auth.login({email:result.organizer.email,password:result.temporaryPassword!});
  const action={actorContext:actor,accountId:id,reason:'Support',expectedRevision:'1'};
  const results=await Promise.allSettled([management.execute('DISABLE',{...action,idempotencyKey:randomUUID()}),management.execute('DISABLE',{...action,idempotencyKey:randomUUID()})]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  expect((await management.get(actor,id)).status).toBe('SUSPENDED');
  expect(await runner.run(tx=>tx.query('SELECT id FROM event WHERE id=$1',eventId))).toHaveLength(1);
  await expect(auth.login({email:result.organizer.email,password:result.temporaryPassword!})).rejects.toMatchObject({code:'UNAUTHENTICATED'});
  await expect(auth.validateSession({sessionToken:login.sessionToken,allowPasswordChangeOnly:true})).rejects.toMatchObject({code:'SESSION_REVOKED'});
  const reset=await management.execute('RESET_TEMPORARY_PASSWORD',{...action,expectedRevision:'2',idempotencyKey:randomUUID()});expect(reset.organizer.status).toBe('SUSPENDED');expect(reset.temporaryPassword).toBeTruthy();
  const enable=await management.execute('ENABLE',{...action,expectedRevision:'3',idempotencyKey:randomUUID()});expect(enable.organizer.passwordChangeRequired).toBe(true);
  expect((await auth.login({email:result.organizer.email,password:reset.temporaryPassword!})).projection.state).toBe('PASSWORD_CHANGE_REQUIRED');
 });
 it('expired temporary cannot login; terminal accounts cannot be enabled',async()=>{
  const result=await create(`expired-${randomUUID()}@example.test`);
  await runner.run(tx=>tx.execute(`UPDATE organizer_account SET temporary_password_expires_at=now()-interval '1 second' WHERE id=$1`,result.organizer.id));
  await expect(auth.login({email:result.organizer.email,password:result.temporaryPassword!})).rejects.toMatchObject({code:'UNAUTHENTICATED'});
  await runner.run(tx=>tx.execute(`UPDATE organizer_account SET status='REVOKED' WHERE id=$1`,result.organizer.id));
  await expect(management.execute('ENABLE',{actorContext:actor,accountId:result.organizer.id,reason:'Support',expectedRevision:'1',idempotencyKey:randomUUID()})).rejects.toMatchObject({code:'INVALID_STATE'});
 });
 it('SQL committed but ACK lost stays unavailable; compatible replay ACKs without redisplaying password',async()=>{
  const original=authority.ackCommit.bind(authority);let fail=true;
  authority.ackCommit=async(...args)=>{if(fail)throw new Error('ack unavailable');return original(...args);};
  const email=`uncertain-${randomUUID()}@example.test`,key=randomUUID();
  await expect(create(email,key)).rejects.toMatchObject({code:'AUTHORITY_UNAVAILABLE'});
  const [row]=await runner.run(tx=>tx.query<{id:string}>('SELECT id FROM organizer_account WHERE email=$1',email));
  await expect(authority.getCredentialRevision(row!.id)).rejects.toMatchObject({code:'AUTHORITY_UNAVAILABLE'});
  const restart=new DurableRecoveryAuthorityAdapter({storageDir:directory});await restart.initialize();await expect(restart.getCredentialRevision(row!.id)).rejects.toMatchObject({code:'AUTHORITY_UNAVAILABLE'});
  fail=false;expect((await create(email,key)).temporaryPassword).toBeNull();expect(await authority.getCredentialRevision(row!.id)).toBe(1n);
 });
 it('initial password change with lost ACK persists proof and explicit administrative reset reconciles it',async()=>{
  const result=await create(`initial-ack-${randomUUID()}@example.test`);
  const login=await auth.login({email:result.organizer.email,password:result.temporaryPassword!});
  const original=authority.ackCommit.bind(authority);let fail=true;
  authority.ackCommit=async(...args)=>{if(fail)throw new Error('lost initial change ACK');return original(...args);};
  await expect(management.changeTemporaryPassword({actorContext:login.actorContext,currentPassword:result.temporaryPassword!,newPassword:'new-initial-password',declaredAdult:true})).rejects.toMatchObject({code:'AUTHORITY_UNAVAILABLE'});
  await expect(auth.login({email:result.organizer.email,password:'new-initial-password'})).rejects.toMatchObject({code:'AUTHORITY_UNAVAILABLE'});
  const [receipt]=await runner.run(tx=>tx.query<{result:{outcome:string;temporaryPassword:null};credential_revision:bigint}>(`SELECT result,credential_revision FROM organizer_management_request WHERE account_id=$1 AND credential_revision=2`,result.organizer.id));
  expect(receipt).toMatchObject({result:{outcome:'PASSWORD_CHANGED_RELOGIN_REQUIRED',temporaryPassword:null},credential_revision:2n});
  fail=false;
  const reset=await management.execute('RESET_TEMPORARY_PASSWORD',{actorContext:actor,accountId:result.organizer.id,expectedRevision:'2',idempotencyKey:randomUUID(),reason:'Recover confirmed initial change'});
  expect(await authority.getCredentialRevision(result.organizer.id)).toBe(3n);
  expect((await auth.login({email:result.organizer.email,password:reset.temporaryPassword!})).projection.state).toBe('PASSWORD_CHANGE_REQUIRED');
 });
 it('invitation legacy upgrade never ACKs before SQL commit and known SQL rollback restores authority compatibility',async()=>{
  const accountId=randomUUID(),invitationId=randomUUID(),email=`legacy-${randomUUID()}@example.test`,password='Legacy-password-valid';
  const legacy=computeCredentialDigest('ORGANIZER_AUTHENTICATION',accountId,password);
  await runner.run(async tx=>{
   await tx.execute(`INSERT INTO beta_invitation(id,email,email_normalized,token_digest,issued_by,expires_at) VALUES($1,$2,$2,$3,$4,now()+interval '7 days')`,invitationId,email,randomUUID(),actor.principalId);
   await tx.execute(`INSERT INTO organizer_account(id,email,email_normalized,status,declared_adult,invitation_id,verified_at) VALUES($1,$2,$2,'ACTIVE',true,$3,now())`,accountId,email,invitationId);
   await tx.execute(`INSERT INTO organizer_credential(id,account_id,secret_digest) VALUES($1,$2,$3)`,randomUUID(),accountId,legacy);
  });
  const registered=await authority.prepare({operationId:randomUUID(),subjectRef:accountId,fact:{type:'CREDENTIAL_ROTATED',data:{cause:'TEST_INVITATION_COMPATIBILITY'}}});await authority.ackCommit(registered.preparedReceipt,1n);
  const failureRunner={run:<T>(work:Parameters<typeof runner.run<T>>[0])=>runner.run(tx=>work({...tx,execute:async(sql:string,...args:unknown[])=>{if(sql.includes('INSERT INTO organizer_session'))throw new AuthenticationError('TEMPORARY_FAILURE','Injected known rollback after credential upgrade');return tx.execute(sql,...args);}}))};
  const failingAuth=new OrganizerAuthenticationService(failureRunner,{record:async()=>{}},authority);
  await expect(failingAuth.login({email,password})).rejects.toMatchObject({code:'TEMPORARY_FAILURE'});
  expect(await authority.getCredentialRevision(accountId)).toBe(1n);
  const [before]=await runner.run(tx=>tx.query<{revision:bigint;secret_digest:string}>('SELECT revision,secret_digest FROM organizer_credential WHERE account_id=$1',accountId));expect(before).toMatchObject({revision:1n,secret_digest:legacy});
  const original=authority.ackCommit.bind(authority);let checked=false;
  authority.ackCommit=async(receipt,revision)=>{
   if(revision===2n){const [committed]=await runner.run(tx=>tx.query<{revision:bigint}>('SELECT revision FROM organizer_credential WHERE account_id=$1',accountId));expect(committed?.revision).toBe(2n);checked=true;}
   return original(receipt,revision);
  };
  const login=await auth.login({email,password});expect(checked).toBe(true);expect(login.projection.state).toBe('ORGANIZER_ACTIVE');expect(await authority.getCredentialRevision(accountId)).toBe(2n);
  authority.ackCommit=original;
  await expect(management.execute('RESET_TEMPORARY_PASSWORD',{actorContext:actor,accountId,expectedRevision:'1',idempotencyKey:randomUUID(),reason:'Forbidden invitation reset'})).rejects.toMatchObject({code:'INVALID_STATE'});
 });
});
