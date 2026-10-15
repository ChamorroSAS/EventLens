import { createHash, timingSafeEqual } from 'node:crypto';
import { BadRequestException, ForbiddenException, HttpException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { AdminOrganizerManagementService, AuthenticationError, OrganizerManagementError, type OrganizerManagementCommand } from '@eventlens/identity';
import { AdminSessionService } from './admin-session.service.js';
import { DatabaseService } from '../platform/database/database.service.js';
import { ORGANIZER_SESSION_CONFIG } from './organizer-session.service.js';
import type { PlatformConfig } from '../platform/config/config.js';

@Injectable()
export class AdminOrganizersService {
 private readonly management: AdminOrganizerManagementService;
 constructor(@Inject(DatabaseService) private readonly database: DatabaseService,@Inject(AdminSessionService) private readonly sessions: AdminSessionService,@Inject(ORGANIZER_SESSION_CONFIG) private readonly config: PlatformConfig) {
  this.management=new AdminOrganizerManagementService(database.transactions,sessions.getRecoveryAuthority());
 }
 private async actor(input:{sessionToken?:string;csrfToken?:string;origin?:string},mutating=false) {
  if(!input.sessionToken) throw new UnauthorizedException();
  if(mutating && (input.origin!==this.config.webOrigin || !input.csrfToken)) throw new ForbiddenException();
  const actor=await this.sessions.getAuthService().validateSession({sessionToken:input.sessionToken});
  if(mutating) {
   this.sessions.getAuthService().assertFreshAuthentication(actor);
   const rows=await this.database.transactions.run(tx=>tx.query<{csrf_token_digest:string}>(`SELECT csrf_token_digest FROM admin_session WHERE id=$1 AND revoked_at IS NULL`,actor.sessionId));
   const actual=Buffer.from(createHash('sha256').update(input.csrfToken!).digest('hex'));
   const expected=Buffer.from(rows[0]?.csrf_token_digest??'');
   if(actual.length!==expected.length || !timingSafeEqual(actual,expected)) throw new ForbiddenException();
  }
  return actor;
 }
 private async safely<T>(work:()=>Promise<T>):Promise<T> {
  try{return await work();}catch(error){
   if(error instanceof HttpException) throw error;
   if(error instanceof OrganizerManagementError){
    const status=error.code==='AUTHORITY_UNAVAILABLE'?503:error.code==='FORBIDDEN'?403:error.code==='NOT_FOUND'?404:error.code==='INVALID_ARGUMENT'?422:409;
    throw new HttpException({code:error.code,message:error.message},status);
   }
   if(error instanceof AuthenticationError){if(error.code==='AUTHORITY_UNAVAILABLE')throw new ServiceUnavailableException({code:error.code});throw new UnauthorizedException({code:error.code});}
   throw new ServiceUnavailableException({code:'TEMPORARY_FAILURE'});
  }
 }
 list(input:{sessionToken?:string},query:{limit?:number;offset?:number;search?:string}){return this.safely(async()=>this.management.list(await this.actor(input),query));}
 get(input:{sessionToken?:string},id:string){return this.safely(async()=>this.management.get(await this.actor(input),id));}
 mutate(input:{sessionToken?:string;csrfToken?:string;origin?:string},action:'CREATE'|'UPDATE'|'DISABLE'|'ENABLE'|'RESET_TEMPORARY_PASSWORD',id:string|undefined,body:unknown){
  return this.safely(async()=>{
   const actorContext=await this.actor(input,true);
   if(!body || typeof body!=='object' || Array.isArray(body)) throw new BadRequestException({code:'INVALID_ARGUMENT'});
   const data=body as Record<string,unknown>;
   const allowed=action==='CREATE'?['email','displayName','reason','idempotencyKey']:action==='UPDATE'?['displayName','reason','expectedRevision','idempotencyKey']:['reason','expectedRevision','idempotencyKey'];
   if(Object.keys(data).some(key=>!allowed.includes(key)) || typeof data.reason!=='string' || typeof data.idempotencyKey!=='string' || (action==='CREATE' && typeof data.email!=='string') || (action!=='CREATE' && typeof data.expectedRevision!=='string') || (action==='UPDATE' && !Object.hasOwn(data,'displayName'))) throw new BadRequestException({code:'INVALID_ARGUMENT'});
   return this.management.execute(action,{...data,actorContext,accountId:id} as OrganizerManagementCommand);
  });
 }
}
