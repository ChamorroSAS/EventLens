import { describe,it,expect,vi } from 'vitest';
import { AdminOrganizerManagementService, projectOrganizerEffectiveSession, OrganizerAuthenticationService, type AdminActorContext, type OrganizerActorContext } from '../src/index.js';
const actor:AdminActorContext={actorType:'ADMIN_HUMAN',principalId:'a9fa3f38-c399-4e41-a5e7-a6c4450b2a1a',identifier:'admin',sessionId:'13f33142-1072-4e48-aae3-79e9b9a1f5ac',authTime:new Date(),credentialRevision:1n,adminAuthRevision:1n,sessionWatermark:1n,recoveryEpoch:1n};
describe('Managed organizer boundary',()=>{
 it('rejects invalid command binding before SQL or authority preparation',async()=>{
  const run=vi.fn(),prepare=vi.fn(); const service=new AdminOrganizerManagementService({run},{getRecoveryEpoch:vi.fn(),getCredentialRevision:vi.fn(),getAdminAuthWatermark:vi.fn(),prepare});
  await expect(service.execute('CREATE',{actorContext:actor,email:'user@example.test',reason:'beta',idempotencyKey:'not-a-uuid'})).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
  await expect(service.execute('CREATE',{actorContext:{...actor,actorType:'ORGANIZER_HUMAN'} as unknown as AdminActorContext,email:'user@example.test',reason:'beta',idempotencyKey:actor.sessionId})).rejects.toMatchObject({code:'FORBIDDEN'});
  expect(run).not.toHaveBeenCalled();expect(prepare).not.toHaveBeenCalled();
 });
 it('temporary sessions expose only password change and sign out capabilities',async()=>{
  const organizer:OrganizerActorContext={actorType:'ORGANIZER_HUMAN',accountId:actor.principalId,email:'user@example.test',sessionId:actor.sessionId,authTime:new Date(),credentialRevision:1n,sessionWatermark:1n,recoveryEpoch:1n,restrictedContext:'PASSWORD_CHANGE_ONLY'};
  const projection=projectOrganizerEffectiveSession({actorContext:organizer,emailVerified:false});
  expect(projection.state).toBe('PASSWORD_CHANGE_REQUIRED');expect(projection.account?.emailVerified).toBe(false);
  expect(projection.capabilities).toMatchObject({canAccessMyEvents:false,canAccessMyAccount:false,canManageSessions:false,canManageAccountDeletion:false,canChangePassword:true,canSignOut:true});
  const auth=new OrganizerAuthenticationService({run:vi.fn()}, {record:vi.fn()}, {} as any);
  await expect(auth.listSessions({actorContext:organizer})).rejects.toMatchObject({code:'FORBIDDEN'});
 });
});
