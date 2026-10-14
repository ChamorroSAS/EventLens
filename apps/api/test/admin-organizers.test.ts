import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { describe,it,expect,vi } from 'vitest';
import { AdminOrganizersService } from '../src/identity/admin-organizers.service.js';
import { OrganizerSessionController } from '../src/identity/organizer-session.controller.js';
import { OrganizerSessionService } from '../src/identity/organizer-session.service.js';
describe('Administrative organizer HTTP boundary',()=>{
 const origin='https://beta.example.test',csrf='csrf-bound-to-admin-session';
 function setup(){
  const execute=vi.fn(),query=vi.fn().mockResolvedValue([{csrf_token_digest:createHash('sha256').update(csrf).digest('hex')}]);
  const database={transactions:{run:vi.fn(async work=>work({query,execute}))}};
  const sessions={getRecoveryAuthority:()=>({}),getAuthService:()=>({validateSession:vi.fn().mockResolvedValue({actorType:'ADMIN_HUMAN',sessionId:'session'}),assertFreshAuthentication:vi.fn()})};
  return {service:new AdminOrganizersService(database as any,sessions as any,{webOrigin:origin} as any),query,execute};
 }
 it('checks Origin and session-bound CSRF before mutating any organizer',async()=>{
  const {service,execute}=setup();
  await expect(service.mutate({sessionToken:'admin',origin:'https://other.example.test',csrfToken:csrf},'CREATE',undefined,{})).rejects.toMatchObject({status:403});
  await expect(service.mutate({sessionToken:'admin',origin,csrfToken:'wrong'},'CREATE',undefined,{})).rejects.toMatchObject({status:403});
  await expect(service.mutate({origin,csrfToken:csrf},'CREATE',undefined,{})).rejects.toMatchObject({status:401});
  expect(execute).not.toHaveBeenCalled();
 });
 it('rejects supplied actor, immutable email, and credential fields on update',async()=>{
  const {service,execute}=setup();
  for(const forbidden of ['actorContext','email','secretDigest','verifiedAt','declaredAdult','status']) {
   await expect(service.mutate({sessionToken:'admin',origin,csrfToken:csrf},'UPDATE','id',{displayName:'Name',reason:'Beta',expectedRevision:'1',idempotencyKey:'key',[forbidden]:'injected'})).rejects.toMatchObject({status:400});
  }
  expect(execute).not.toHaveBeenCalled();
 });
 it('password change rejects extra fields before service and clears cookies on success',async()=>{
  const changeTemporaryPassword=vi.fn().mockResolvedValue({outcome:'PASSWORD_CHANGED_RELOGIN_REQUIRED',setCookieHeaders:['expired-cookie']});
  const controller=new OrganizerSessionController({changeTemporaryPassword} as unknown as OrganizerSessionService);
  const headers:Record<string,string|string[]>={};const response={setHeader:(name:string,value:string|string[])=>{headers[name]=value;}};
  const body={currentPassword:'temporary',newPassword:'new-long-password',declaredAdult:true};
  await expect(controller.changeTemporaryPassword({...body,accountId:'another-organizer'},{headers:{}},response)).rejects.toMatchObject({status:400});
  expect(changeTemporaryPassword).not.toHaveBeenCalled();
  expect(await controller.changeTemporaryPassword(body,{headers:{cookie:'__Host-el_session=organizer-token',origin,'x-csrf-token':'organizer-csrf'}},response)).toEqual({outcome:'PASSWORD_CHANGED_RELOGIN_REQUIRED'});
  expect(changeTemporaryPassword).toHaveBeenCalledWith({...body,sessionToken:'organizer-token',csrfToken:'organizer-csrf',originHeader:origin});
  expect(headers['Cache-Control']).toBe('no-store');expect(headers['Set-Cookie']).toEqual(['expired-cookie']);
 });
});
