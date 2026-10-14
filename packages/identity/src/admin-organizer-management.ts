import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import type { AdminActorContext, OrganizerActorContext, RecoveryAuthorityPort } from './contracts.js';
import { PasswordVerifier } from './password-verifier.js';

export class OrganizerManagementError extends Error {
  constructor(readonly code: 'INVALID_ARGUMENT' | 'FORBIDDEN' | 'NOT_FOUND' | 'EMAIL_EXISTS' | 'STALE_REVISION' | 'INVALID_STATE' | 'IDEMPOTENCY_CONFLICT' | 'AUTHORITY_UNAVAILABLE' | 'INVALID_PASSWORD' | 'TEMPORARY_PASSWORD_EXPIRED', message = code) { super(message); }
}
export interface OrganizerSummary {
  id: string; email: string; displayName: string | null; status: string; provisioningSource: 'INVITATION' | 'ADMIN_PROVISIONED';
  passwordChangeRequired: boolean; temporaryPasswordExpiresAt: string | null;
  revision: string; createdAt: string; updatedAt: string; emailVerified: boolean;
}
export interface OrganizerManagementResult { organizer: OrganizerSummary; outcome: string; temporaryPassword: string | null; }
interface Row {
 id: string; email: string; display_name: string | null; status: string;
 provisioning_source: string; password_change_required: boolean; administrative_revision: bigint | string;
 temporary_password_expires_at: Date | string | null; created_at: Date | string; updated_at: Date | string; verified_at: Date | null;
}
interface ReceiptRow { actor_id: string; payload_digest: string; authority_receipt: string | null; credential_revision: string | null; result: OrganizerManagementResult; }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function summary(row: Row): OrganizerSummary {
 return { id: row.id, email: row.email, displayName: row.display_name, status: row.status, provisioningSource: row.provisioning_source as 'INVITATION' | 'ADMIN_PROVISIONED',
 passwordChangeRequired: row.password_change_required, temporaryPasswordExpiresAt: row.temporary_password_expires_at ? new Date(row.temporary_password_expires_at).toISOString() : null,
 revision: String(row.administrative_revision), createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(), emailVerified: Boolean(row.verified_at) };
}
export interface OrganizerManagementCommand {
 actorContext: AdminActorContext; idempotencyKey: string; reason: string; accountId?: string;
 expectedRevision?: string; email?: string; displayName?: string | null;
}
/** Identity owns administrative provisioning; receipts never contain plaintext credentials. */
export class AdminOrganizerManagementService {
 constructor(private readonly runner: TransactionRunner, private readonly authority: RecoveryAuthorityPort, private readonly passwords = new PasswordVerifier()) {}

 private assertActor(actor: AdminActorContext) { if (actor?.actorType !== 'ADMIN_HUMAN' || !uuid.test(actor.principalId)) throw new OrganizerManagementError('FORBIDDEN'); }
 async list(actor: AdminActorContext, input: { limit?: number; offset?: number; search?: string } = {}) {
  this.assertActor(actor);
  const limit = input.limit ?? 25, offset = input.offset ?? 0, search = input.search?.trim() ?? '';
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || search.length > 200) throw new OrganizerManagementError('INVALID_ARGUMENT');
  return this.runner.run(async tx => {
   const items = await tx.query<Row>(`SELECT * FROM organizer_account WHERE ($1 = '' OR position(lower($1) in lower(email)) > 0 OR position(lower($1) in lower(coalesce(display_name,''))) > 0) ORDER BY created_at DESC, id LIMIT $2 OFFSET $3`, search, limit, offset);
   const counts = await tx.query<{ total: bigint }>(`SELECT count(*) AS total FROM organizer_account WHERE ($1 = '' OR position(lower($1) in lower(email)) > 0 OR position(lower($1) in lower(coalesce(display_name,''))) > 0)`, search);
   return { items: items.map(summary), total: Number(counts[0]!.total), limit, offset };
  });
 }
 async get(actor: AdminActorContext, id: string) { this.assertActor(actor); if (!uuid.test(id)) throw new OrganizerManagementError('INVALID_ARGUMENT'); return this.runner.run(async tx => summary(await this.account(tx, id))); }
 private async account(tx: SqlTransaction, id: string, lock = false) {
  const rows = await tx.query<Row>(`SELECT * FROM organizer_account WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, id);
  if (!rows[0]) throw new OrganizerManagementError('NOT_FOUND'); return rows[0];
 }
 private async replay(key: string, actorId: string, digest: string): Promise<OrganizerManagementResult | null> {
  const rows = await this.runner.run(tx => tx.query<ReceiptRow>('SELECT * FROM organizer_management_request WHERE id = $1', key));
  if (!rows[0]) return null;
  const row = rows[0];
  if (row.actor_id !== actorId || row.payload_digest !== digest) throw new OrganizerManagementError('IDEMPOTENCY_CONFLICT');
  if (row.authority_receipt) {
   try { await this.authority.ackCommit!(row.authority_receipt, BigInt(row.credential_revision!)); } catch { throw new OrganizerManagementError('AUTHORITY_UNAVAILABLE'); }
  }
  return { ...row.result, temporaryPassword: null };
 }
 private async operational() {
  try {
   if (!this.authority.prepare || !this.authority.ackCommit) throw new Error();
   const epoch = await this.authority.getRecoveryEpoch();
   if (await this.authority.isRecoveryBarrierActive?.(epoch, 'MOD-001')) throw new Error();
  } catch { throw new OrganizerManagementError('AUTHORITY_UNAVAILABLE'); }
 }
 /** SQL receipts prove the entire account/credential/session transaction committed. */
 private async reconcileCommitted(accountId: string) {
  const receipts = await this.runner.run(tx=>tx.query<{authority_receipt:string;credential_revision:bigint}>(`SELECT r.authority_receipt,r.credential_revision FROM organizer_management_request r JOIN organizer_credential c ON c.account_id=r.account_id AND c.status='ACTIVE' WHERE r.account_id=$1 AND r.authority_receipt IS NOT NULL AND r.credential_revision <= c.revision ORDER BY r.credential_revision`,accountId));
  for(const receipt of receipts) {
   try { if(!this.authority.ackCommit) throw new Error(); await this.authority.ackCommit(receipt.authority_receipt,BigInt(receipt.credential_revision)); }
   catch {throw new OrganizerManagementError('AUTHORITY_UNAVAILABLE');}
  }
 }
 async execute(action: 'CREATE' | 'UPDATE' | 'DISABLE' | 'ENABLE' | 'RESET_TEMPORARY_PASSWORD', command: OrganizerManagementCommand): Promise<OrganizerManagementResult> {
  this.assertActor(command.actorContext);
  if (!uuid.test(command.idempotencyKey) || typeof command.reason !== 'string' || !command.reason.trim() || command.reason.length > 500) throw new OrganizerManagementError('INVALID_ARGUMENT');
  const email = command.email?.trim().toLowerCase();
  if (action === 'CREATE' && (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new OrganizerManagementError('INVALID_ARGUMENT');
  if (command.displayName !== undefined && command.displayName !== null && (typeof command.displayName !== 'string' || command.displayName.trim().length > 120)) throw new OrganizerManagementError('INVALID_ARGUMENT');
  if (action !== 'CREATE' && (!command.accountId || !uuid.test(command.accountId) || !/^[1-9]\d*$/.test(command.expectedRevision ?? ''))) throw new OrganizerManagementError('INVALID_ARGUMENT');
  const displayName = command.displayName?.trim() || null;
  const payloadDigest = createHash('sha256').update(JSON.stringify([action, command.accountId ?? null, email ?? null, displayName, command.expectedRevision ?? null, command.reason.trim()])).digest('hex');
  const actorId = command.actorContext.principalId;
  const existing = await this.replay(command.idempotencyKey, actorId, payloadDigest); if (existing) return existing;
  // Deterministic identity ensures a retry cannot provision a second subject.
  const hex = createHash('sha256').update(`organizer:${actorId}:${command.idempotencyKey}`).digest('hex');
  const accountId = command.accountId ?? `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
  const changesAccess = action !== 'UPDATE';
  const temporaryPassword = action === 'CREATE' || action === 'RESET_TEMPORARY_PASSWORD' ? randomBytes(24).toString('base64url') : null;
  const secretDigest = temporaryPassword ? await this.passwords.hashPassword(temporaryPassword) : null;
  let credentialRevision = 1n;
  if (action !== 'CREATE') {
   await this.reconcileCommitted(accountId);
   await this.runner.run(async tx => {
    const row = await this.account(tx, accountId);
    this.assertMutable(row, command.expectedRevision!);
    if(action==='RESET_TEMPORARY_PASSWORD' && row.provisioning_source!=='ADMIN_PROVISIONED') throw new OrganizerManagementError('INVALID_STATE');
    const creds = await tx.query<{revision: bigint}>('SELECT revision FROM organizer_credential WHERE account_id=$1 AND status=\'ACTIVE\' ORDER BY revision DESC LIMIT 1', accountId);
    if (!creds[0]) throw new OrganizerManagementError('INVALID_STATE');
    credentialRevision = BigInt(creds[0].revision) + (changesAccess ? 1n : 0n);
   });
  }
  await this.operational();
  let receipt: string | null = null;
  if (changesAccess) {
   try { receipt = (await this.authority.prepare!({operationId: randomUUID(), subjectRef: accountId, fact: {type: 'CREDENTIAL_ROTATED', data: {subjectKind:'ORGANIZER', accountId, cause:action, newRevision:credentialRevision}}})).preparedReceipt; }
   catch { throw new OrganizerManagementError('AUTHORITY_UNAVAILABLE'); }
  }
  let result: OrganizerManagementResult;
  try {
   result = await this.runner.run(async tx => {
    const adminSessions = await tx.query(`SELECT s.id FROM admin_session s JOIN admin_principal p ON p.id=s.principal_id WHERE s.id=$1 AND p.id=$2 AND p.status='ACTIVE' AND s.revoked_at IS NULL AND s.expires_at>now() AND s.idle_expires_at>now() AND p.auth_revision=$3 AND s.session_watermark=$4 FOR SHARE OF s,p`,command.actorContext.sessionId,actorId,command.actorContext.adminAuthRevision,command.actorContext.sessionWatermark);
    if (!adminSessions.length) throw new OrganizerManagementError('FORBIDDEN');
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text AS locked', command.idempotencyKey);
    const requests = await tx.query<ReceiptRow>('SELECT * FROM organizer_management_request WHERE id=$1', command.idempotencyKey);
    if (requests[0]) throw new OrganizerManagementError('IDEMPOTENCY_CONFLICT');
    const now = new Date(), expires = temporaryPassword ? new Date(now.getTime()+7*24*60*60*1000) : null;
    if (action === 'CREATE') {
     await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text AS locked', `organizer-email:${email}`);
     const duplicate = await tx.query('SELECT id FROM organizer_account WHERE email_normalized=$1', email);
     if (duplicate.length) throw new OrganizerManagementError('EMAIL_EXISTS');
     await tx.execute(`INSERT INTO organizer_account (id,email,email_normalized,status,declared_adult,invitation_id,provisioning_source,display_name,password_change_required,temporary_password_expires_at) VALUES ($1,$2,$2,'ACTIVE',false,NULL,'ADMIN_PROVISIONED',$3,true,$4)`, accountId,email,displayName,expires);
     await tx.execute(`INSERT INTO organizer_credential (id,account_id,secret_digest,revision) VALUES ($1,$2,$3,$4)`,randomUUID(),accountId,secretDigest,credentialRevision);
    } else {
     const row = await this.account(tx,accountId,true); this.assertMutable(row,command.expectedRevision!);
     if(action==='RESET_TEMPORARY_PASSWORD' && row.provisioning_source!=='ADMIN_PROVISIONED') throw new OrganizerManagementError('INVALID_STATE');
     if ((action==='ENABLE' && row.status!=='SUSPENDED') || (action==='DISABLE' && row.status!=='ACTIVE')) throw new OrganizerManagementError('INVALID_STATE');
     if (changesAccess) {
      const updated = await tx.execute(`UPDATE organizer_credential SET revision=$1,secret_digest=coalesce($2,secret_digest),updated_at=$3 WHERE account_id=$4 AND status='ACTIVE' AND revision=$5`,credentialRevision,secretDigest,now,accountId,credentialRevision-1n);
      if(updated!==1) throw new OrganizerManagementError('STALE_REVISION');
      await tx.execute(`UPDATE organizer_session SET revoked_at=$1,revocation_reason=$2 WHERE account_id=$3 AND revoked_at IS NULL`,now,action,accountId);
     }
     await tx.execute(`UPDATE organizer_account SET display_name=CASE WHEN $1='UPDATE' THEN $2 ELSE display_name END,status=CASE WHEN $1='DISABLE' THEN 'SUSPENDED' WHEN $1='ENABLE' THEN 'ACTIVE' ELSE status END,password_change_required=CASE WHEN $1='RESET_TEMPORARY_PASSWORD' THEN true ELSE password_change_required END,temporary_password_expires_at=CASE WHEN $1='RESET_TEMPORARY_PASSWORD' THEN $3 ELSE temporary_password_expires_at END,administrative_revision=administrative_revision+1,updated_at=$4 WHERE id=$5`,action,displayName,expires,now,accountId);
    }
    const organizer=summary(await this.account(tx,accountId));
    const safeResult={organizer,outcome:action,temporaryPassword:null};
    await tx.execute(`INSERT INTO organizer_management_request (id,actor_id,payload_digest,account_id,authority_receipt,credential_revision,result) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,command.idempotencyKey,actorId,payloadDigest,accountId,receipt,changesAccess?credentialRevision:null,JSON.stringify(safeResult));
    await tx.execute(`INSERT INTO admin_audit_event (id,procedure,actor_id,target_identifier,target_principal_id,result,details,timestamp) VALUES ($1,$2,$3,$4::text,$4::text::uuid,'SUCCESS',$5,$6)`,randomUUID(),`ADMIN_ORGANIZER_${action}`,actorId,accountId,command.reason.trim(),now);
    return {...safeResult,temporaryPassword};
   });
  } catch(error) {
   // Only domain errors prove callback rollback; transport/commit ambiguity retains PREPARED.
   if(error instanceof OrganizerManagementError && receipt) await this.authority.resolveAbort?.(receipt,'Known SQL rollback').catch(()=>{});
   if(error instanceof OrganizerManagementError && error.code==='IDEMPOTENCY_CONFLICT') { const replay=await this.replay(command.idempotencyKey,actorId,payloadDigest); if(replay) return replay; }
   if(error instanceof OrganizerManagementError) throw error;
   const failure = new OrganizerManagementError('AUTHORITY_UNAVAILABLE'); failure.cause = error; throw failure;
  }
  if(receipt) { try {await this.authority.ackCommit!(receipt,credentialRevision);} catch {throw new OrganizerManagementError('AUTHORITY_UNAVAILABLE');} }
  return result;
 }
 private assertMutable(row:Row,revision:string) {
  if(String(row.administrative_revision)!==revision) throw new OrganizerManagementError('STALE_REVISION');
  if(row.status!=='ACTIVE' && row.status!=='SUSPENDED') throw new OrganizerManagementError('INVALID_STATE');
 }
 async changeTemporaryPassword(command:{actorContext:OrganizerActorContext;currentPassword:string;newPassword:string;declaredAdult:boolean}) {
  const actor=command.actorContext;
  if(actor?.actorType!=='ORGANIZER_HUMAN' || actor.restrictedContext!=='PASSWORD_CHANGE_ONLY') throw new OrganizerManagementError('FORBIDDEN');
  if(command.declaredAdult!==true || typeof command.newPassword!=='string' || command.newPassword.length<8 || command.newPassword.length>1024 || command.newPassword===command.currentPassword) throw new OrganizerManagementError('INVALID_ARGUMENT');
  const state=await this.runner.run(async tx=>{
   const row=await this.account(tx,actor.accountId);
   this.assertTemporary(row);
   const creds=await tx.query<{id:string;secret_digest:string;revision:bigint}>(`SELECT id,secret_digest,revision FROM organizer_credential WHERE account_id=$1 AND status='ACTIVE' ORDER BY revision DESC LIMIT 1`,actor.accountId);
   const cred=creds[0]; if(!cred || BigInt(cred.revision)!==actor.credentialRevision || !(await this.passwords.verifyPassword(cred.secret_digest,command.currentPassword))) throw new OrganizerManagementError('INVALID_PASSWORD');
   return {row,cred};
  });
  const digest=await this.passwords.hashPassword(command.newPassword), next=BigInt(state.cred.revision)+1n;
  await this.operational();
  const receipt=await this.authority.prepare!({operationId:randomUUID(),subjectRef:actor.accountId,fact:{type:'CREDENTIAL_ROTATED',data:{subjectKind:'ORGANIZER',accountId:actor.accountId,cause:'INITIAL_PASSWORD_CHANGE',newRevision:next}}});
  try {
   await this.runner.run(async tx=>{
    const row=await this.account(tx,actor.accountId,true);this.assertTemporary(row);
    if(String(row.administrative_revision)!==String(state.row.administrative_revision)) throw new OrganizerManagementError('STALE_REVISION');
    const sessions=await tx.query(`SELECT id FROM organizer_session WHERE id=$1 AND account_id=$2 AND revoked_at IS NULL AND expires_at>now() AND idle_expires_at>now() AND session_watermark=$3`,actor.sessionId,actor.accountId,actor.sessionWatermark);
    if(!sessions.length) throw new OrganizerManagementError('FORBIDDEN');
    const now=new Date();
    if(await tx.execute(`UPDATE organizer_credential SET secret_digest=$1,revision=$2,updated_at=$3 WHERE id=$4 AND revision=$5 AND status='ACTIVE'`,digest,next,now,state.cred.id,state.cred.revision)!==1) throw new OrganizerManagementError('STALE_REVISION');
    await tx.execute(`UPDATE organizer_account SET password_change_required=false,temporary_password_expires_at=NULL,declared_adult=true,declared_adult_at=$1,administrative_revision=administrative_revision+1,updated_at=$1 WHERE id=$2`,now,actor.accountId);
    await tx.execute(`UPDATE organizer_session SET revoked_at=$1,revocation_reason='INITIAL_PASSWORD_CHANGE' WHERE account_id=$2 AND revoked_at IS NULL`,now,actor.accountId);
    const organizer=summary(await this.account(tx,actor.accountId));
    const payloadDigest=createHash('sha256').update(JSON.stringify(['INITIAL_PASSWORD_CHANGE',actor.accountId,String(next),receipt.preparedReceipt])).digest('hex');
    await tx.execute(`INSERT INTO organizer_management_request (id,actor_id,payload_digest,account_id,authority_receipt,credential_revision,result) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,randomUUID(),actor.accountId,payloadDigest,actor.accountId,receipt.preparedReceipt,next,JSON.stringify({organizer,outcome:'PASSWORD_CHANGED_RELOGIN_REQUIRED',temporaryPassword:null}));
    await tx.execute(`INSERT INTO admin_audit_event (id,procedure,actor_id,target_identifier,target_principal_id,result,timestamp) VALUES ($1,'ORGANIZER_INITIAL_PASSWORD_CHANGE',$2::text,$2::text,$2::text::uuid,'SUCCESS',$3)`,randomUUID(),actor.accountId,now);
   });
  } catch(error) { if(error instanceof OrganizerManagementError) { await this.authority.resolveAbort?.(receipt.preparedReceipt,'Known SQL rollback').catch(()=>{}); throw error; } throw new OrganizerManagementError('AUTHORITY_UNAVAILABLE'); }
  try {await this.authority.ackCommit!(receipt.preparedReceipt,next);} catch {throw new OrganizerManagementError('AUTHORITY_UNAVAILABLE');}
  return {outcome:'PASSWORD_CHANGED_RELOGIN_REQUIRED' as const};
 }
 private assertTemporary(row:Row) {
  if(row.status!=='ACTIVE' || !row.password_change_required) throw new OrganizerManagementError('INVALID_STATE');
  if(!row.temporary_password_expires_at || new Date(row.temporary_password_expires_at).getTime()<=Date.now()) throw new OrganizerManagementError('TEMPORARY_PASSWORD_EXPIRED');
 }
}
