import { createHash } from 'node:crypto';
import type { SqlTransaction } from '@eventlens/database';

export type ProvisioningErrorCode =
  | 'INVALID_ARGUMENT'
  | 'BOOTSTRAP_ALREADY_CONSUMED'
  | 'UNAUTHORIZED_PROVISIONER'
  | 'PUBLIC_ELEVATION_DENIED'
  | 'DUPLICATE_PRINCIPAL'
  | 'PRINCIPAL_NOT_FOUND'
  | 'CANNOT_REVOKE_SOLE_ACTIVE_ADMIN';

export class ProvisioningError extends Error {
  constructor(public readonly code: ProvisioningErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ProvisioningError';
  }
}

export type AuthenticationErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'SESSION_NOT_FOUND'
  | 'FRESH_AUTH_REQUIRED'
  | 'INVALID_ORIGIN'
  | 'CSRF_VALIDATION_FAILED'
  | 'RATE_LIMITED'
  | 'TEMPORARY_FAILURE'
  | 'INVALID_ARGUMENT'
  | 'AUTHORITY_UNAVAILABLE';

export class AuthenticationError extends Error {
  constructor(public readonly code: AuthenticationErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AuthenticationError';
  }
}

export type InvitationErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_EMAIL'
  | 'INVALID_ARGUMENT'
  | 'INVITATION_NOT_FOUND'
  | 'INVITATION_ALREADY_USED'
  | 'INVITATION_REVOKED'
  | 'INVITATION_EXPIRED'
  | 'CANNOT_REVOKE_CONSUMED';

export class InvitationError extends Error {
  constructor(public readonly code: InvitationErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'InvitationError';
  }
}

export interface BetaInvitationRecord {
  readonly id: string;
  readonly email: string;
  readonly emailNormalized: string;
  readonly token: string;
  readonly status: 'PENDING' | 'CONSUMED' | 'REVOKED' | 'EXPIRED';
  readonly issuedBy: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly consumedAt?: Date | null;
  readonly revokedAt?: Date | null;
  readonly revision: bigint;
}

export interface BetaInvitationSummaryRecord {
  readonly id: string;
  readonly email: string;
  readonly emailNormalized: string;
  readonly status: 'PENDING' | 'CONSUMED' | 'REVOKED' | 'EXPIRED';
  readonly issuedBy: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly consumedAt?: Date | null;
  readonly revokedAt?: Date | null;
  readonly revision: bigint;
}

export interface IssueBetaInvitationCommand {
  readonly actorContext: AdminActorContext;
  readonly email: string;
}

export interface IssueBetaInvitationResult {
  readonly invitation: BetaInvitationRecord;
  readonly outcome: 'ISSUED' | 'ALREADY_PENDING' | 'ALREADY_CONSUMED' | 'RENEWED_EXPIRED';
  readonly message?: string;
}

export interface RevokeBetaInvitationCommand {
  readonly actorContext: AdminActorContext;
  readonly invitationId: string;
  readonly reason?: string;
}

export interface RevokeBetaInvitationResult {
  readonly invitation: BetaInvitationSummaryRecord;
  readonly outcome: 'REVOKED' | 'ALREADY_REVOKED' | 'CANNOT_REVOKE_CONSUMED';
  readonly message?: string;
}

export interface ListBetaInvitationsQuery {
  readonly actorContext: AdminActorContext;
  readonly status?: 'PENDING' | 'CONSUMED' | 'REVOKED' | 'EXPIRED' | 'ALL';
  readonly limit?: number;
  readonly offset?: number;
}

export interface ListBetaInvitationsResult {
  readonly items: readonly BetaInvitationSummaryRecord[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface GetBetaInvitationQuery {
  readonly actorContext: AdminActorContext;
  readonly invitationId: string;
}

export interface GetBetaInvitationResult {
  readonly invitation: BetaInvitationSummaryRecord | null;
}

export type AccessRequestErrorCode =
  | 'INVALID_EMAIL'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'REQUEST_NOT_FOUND'
  | 'INVALID_ARGUMENT';

export class AccessRequestError extends Error {
  constructor(public readonly code: AccessRequestErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AccessRequestError';
  }
}

export interface BetaAccessRequestRecord {
  readonly id: string;
  readonly email: string;
  readonly emailNormalized: string;
  readonly status: 'PENDING_REVIEW' | 'REVIEWED';
  readonly notes?: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RequestBetaAccessCommand {
  readonly email: string;
  readonly notes?: string;
  readonly clientIp?: string;
}

export interface RequestBetaAccessResult {
  readonly outcome: 'REQUEST_RECEIVED';
  readonly message: string;
  readonly requestId: string;
}

export interface ListBetaAccessRequestsQuery {
  readonly actorContext: AdminActorContext;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ListBetaAccessRequestsResult {
  readonly items: readonly BetaAccessRequestRecord[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface GetBetaAccessRequestQuery {
  readonly actorContext: AdminActorContext;
  readonly requestId: string;
}

export interface GetBetaAccessRequestResult {
  readonly request: BetaAccessRequestRecord | null;
}

export interface AdminPrincipal {
  readonly id: string;
  readonly identifier: string;
  readonly status: 'ACTIVE' | 'REVOKED';
  readonly authRevision: bigint;
  readonly provisionProcedure: 'INITIAL_BOOTSTRAP' | 'AUTHORIZED_PROVISION';
  readonly provisionedBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProvisionInitialBootstrapCommand {
  /** Out-of-band operational secret token. Never logged, returned, or persisted. */
  readonly operatorToken: string;
  /** Normalized administrative identity (e.g. username/email). */
  readonly identifier: string;
}

export interface AuthorizingActor {
  readonly id: string;
  readonly isAuthorizedProvisioner: boolean;
}

export interface ProvisionSubsequentCommand {
  readonly authorizingActor: AuthorizingActor;
  readonly identifier: string;
}

export interface RevokeAdminPrincipalCommand {
  readonly authorizingActor: AuthorizingActor;
  readonly targetPrincipalId: string;
  readonly reason?: string;
}

export interface RevokeAdminPrincipalResult {
  readonly principal: AdminPrincipal;
  readonly outcome: 'REVOKED' | 'ALREADY_REVOKED';
  readonly revokedSessionsCount: number;
  readonly message?: string;
}

export interface AdminCredentialRecord {
  readonly id: string;
  readonly principalId: string;
  readonly purpose: string;
  readonly secretDigest: string;
  readonly revision: bigint;
  readonly status: 'ACTIVE' | 'REVOKED';
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RegisterAdminCredentialCommand {
  readonly principalId: string;
  /** Uniform random 256-bit secret. Never persisted, logged, or returned. */
  readonly secret: string;
  readonly purpose?: string;
  readonly revision?: bigint;
}

export interface SessionCookieSpec {
  readonly name: '__Host-el_admin_session';
  readonly value: string;
  readonly httpOnly: true;
  readonly secure: true;
  readonly sameSite: 'Strict';
  readonly path: '/';
  readonly maxAgeSeconds: number;
}

export function serializeSessionCookie(spec: SessionCookieSpec): string {
  return `${spec.name}=${spec.value}; Path=${spec.path}; Secure; HttpOnly; SameSite=${spec.sameSite}; Max-Age=${spec.maxAgeSeconds}`;
}

export interface AdminActorContext {
  readonly actorType: 'ADMIN_HUMAN';
  readonly principalId: string;
  readonly identifier: string;
  readonly sessionId: string;
  readonly authTime: Date;
  readonly credentialRevision: bigint;
  readonly adminAuthRevision: bigint;
  readonly sessionWatermark: bigint;
  readonly recoveryEpoch: bigint;
}

export interface AdminLoginCommand {
  readonly identifier: string;
  /** Uniform random 256-bit secret. Never persisted, logged, or returned. */
  readonly secret: string;
  readonly origin: string;
  readonly customHeaderPresent: boolean;
}

export interface AdminLoginResult {
  readonly actorContext: AdminActorContext;
  readonly sessionToken: string;
  readonly csrfToken: string;
  readonly cookieSpec: SessionCookieSpec;
}

export interface ValidateSessionCommand {
  readonly sessionToken: string;
  readonly maxAgeAuthTimeMs?: number;
}

export interface ReauthenticateCommand {
  readonly sessionToken: string;
  readonly secret: string;
  readonly origin: string;
  readonly csrfToken: string;
}

export interface AdminReauthResult {
  readonly actorContext: AdminActorContext;
  readonly sessionToken: string;
  readonly csrfToken: string;
  readonly cookieSpec: SessionCookieSpec;
}

export interface LogoutCommand {
  readonly sessionToken: string;
  readonly origin: string;
  readonly csrfToken: string;
}

export type RecoveryErrorCode =
  | 'AUTHORITY_UNAVAILABLE'
  | 'BARRIER_ACTIVE'
  | 'GAP_DETECTED'
  | 'CORRUPTED_ARTIFACT'
  | 'STALE_SNAPSHOT'
  | 'RECONCILIATION_FAILED'
  | 'INVALID_RECEIPT'
  | 'ABORT_UNRESOLVED'
  | 'INVALID_ARGUMENT';

export class RecoveryError extends Error {
  constructor(public readonly code: RecoveryErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'RecoveryError';
  }
}

export type Mod001FactType =
  | 'BETA_INVITATION_EMITTED'
  | 'BETA_INVITATION_CONSUMED'
  | 'BETA_INVITATION_REVOKED'
  | 'ADMIN_PRINCIPAL_PROVISIONED'
  | 'ADMIN_PRINCIPAL_REVOKED'
  | 'CREDENTIAL_ROTATED'
  | 'SESSION_REVOKED'
  | 'PASSWORD_RESET_CONSUMED'
  | 'TOKEN_REVOKED';

export interface Mod001RecoveryFact {
  readonly type: Mod001FactType;
  readonly subjectRef: string;
  readonly revision: bigint;
  readonly sequence: bigint;
  readonly facts: Record<string, unknown>;
  readonly timestamp: Date;
}

export interface RecoveryPreparedReceipt {
  readonly preparedReceipt: string;
  readonly sequence: bigint;
  readonly operationId: string;
  readonly subjectRef: string;
}

export interface RecoveryCheckpoint {
  readonly epoch: bigint;
  readonly checkpointSequence: bigint;
  readonly checkpointDigest: string;
}

export interface PrepareSensitiveOperationCommand {
  readonly operationId: string;
  readonly subjectRef: string;
  readonly expectedSequence?: bigint;
  readonly fact: {
    readonly type: Mod001FactType;
    readonly data: Record<string, unknown>;
  };
}

export interface ReconciliationResult {
  readonly scope: string;
  readonly epoch: bigint;
  readonly checkpointSequence: bigint;
  readonly factsEvaluated: number;
  readonly restrictionsApplied: number;
  readonly status: 'RECONCILED' | 'FAIL_CLOSED';
  readonly details?: string;
}

export interface RecoveryAuthorityPort {
  getRecoveryEpoch(): Promise<bigint>;
  getCredentialRevision(principalId: string): Promise<bigint | null>;
  getAdminAuthWatermark(principalId: string): Promise<bigint>;
  getInvitationRevision?(invitationId: string): Promise<bigint | null>;
  getAccountRevision?(accountId: string): Promise<bigint | null>;

  prepare?(command: PrepareSensitiveOperationCommand): Promise<RecoveryPreparedReceipt>;
  ackCommit?(receipt: string, dbRevision: bigint): Promise<void>;
  resolveAbort?(receipt: string, reason: string): Promise<void>;

  readCheckpoint?(): Promise<RecoveryCheckpoint>;
  readFacts?(afterSequence: bigint, throughCheckpoint: bigint): Promise<readonly Mod001RecoveryFact[]>;

  setRecoveryBarrier?(epoch: bigint, scope: string): Promise<void>;
  isRecoveryBarrierActive?(epoch: bigint, scope: string): Promise<boolean>;
  ackReconciled?(scope: string, epoch: bigint, checkpoint: bigint, digest: string): Promise<void>;

  prepareSessionOperation?(operationId: string, principalId: string): Promise<{ receipt: string }>;
  ackSessionOperation?(receipt: string): Promise<void>;
}

export interface AuditEventRecord {
  readonly id: string;
  readonly procedure:
    | 'INITIAL_BOOTSTRAP'
    | 'AUTHORIZED_PROVISION'
    | 'ADMIN_PRINCIPAL_REVOKED'
    | 'PUBLIC_ENTRY_REJECTED'
    | 'ADMIN_LOGIN'
    | 'ADMIN_REAUTH'
    | 'ADMIN_LOGOUT'
    | 'ADMIN_SESSION_VALIDATE'
    | 'BETA_INVITE_ISSUE'
    | 'BETA_INVITE_DUPLICATE_ATTEMPT'
    | 'BETA_INVITE_RENEW'
    | 'BETA_INVITE_REVOKE'
    | 'BETA_INVITE_LIST_VIEWED'
    | 'BETA_ACCESS_REQUEST_SUBMITTED'
    | 'BETA_ACCESS_REQUEST_LIST_VIEWED'
    | 'BETA_ACCESS_REQUEST_DETAIL_VIEWED'
    | 'ORGANIZER_REGISTRATION'
    | 'ORGANIZER_EMAIL_VERIFIED_AND_ACTIVATED'
    | 'ORGANIZER_EMAIL_VERIFICATION_RESENT'
    | 'ORGANIZER_PASSWORD_RESET_REQUESTED'
    | 'ORGANIZER_PASSWORD_RESET_COMPLETED'
    | 'ORGANIZER_LOGIN'
    | 'ORGANIZER_LOGOUT'
    | 'ORGANIZER_SESSION_VALIDATE'
    | 'ORGANIZER_SESSION_LIST_VIEWED'
    | 'ORGANIZER_SESSION_REVOKED'
    | 'ORGANIZER_OTHER_SESSIONS_REVOKED'
    | 'ACCOUNT_REAUTHENTICATION_CHALLENGE_BEGUN'
    | 'ACCOUNT_REAUTHENTICATION_VERIFIED'
    | 'ACCOUNT_REAUTHENTICATION_EVIDENCE_CONSUMED';
  readonly actorId: string;
  readonly targetIdentifier: string;
  readonly targetPrincipalId?: string | null;
  readonly result:
    | 'SUCCESS'
    | 'REJECTED_BOOTSTRAP_CONSUMED'
    | 'REJECTED_UNAUTHORIZED'
    | 'REJECTED_PUBLIC_ELEVATION'
    | 'CONFLICT_DUPLICATE'
    | 'REJECTED_UNAUTHENTICATED'
    | 'REJECTED_EXPIRED'
    | 'REJECTED_REVOKED'
    | 'REJECTED_FRESH_AUTH_REQUIRED'
    | 'REJECTED_INVALID_ORIGIN'
    | 'REJECTED_CSRF'
    | 'ALREADY_CONSUMED'
    | 'ALREADY_PENDING'
    | 'ALREADY_REGISTERED_PENDING'
    | 'ACTIVATED'
    | 'REVOKED'
    | 'ALREADY_REVOKED'
    | 'CANNOT_REVOKE_CONSUMED'
    | 'REQUEST_RECEIVED'
    | 'RESEND_ACCEPTED'
    | 'RESET_REQUEST_RECEIVED'
    | 'PASSWORD_RESET_COMPLETED'
    | 'PRINCIPAL_REVOKED'
    | 'OTHER_SESSIONS_REVOKED';
  readonly details?: string;
  readonly timestamp: Date;
}

export interface AuditSink {
  record(event: AuditEventRecord): Promise<void>;
}

/**
 * Computes a purpose/subject-separated SHA-256 digest of an administrative secret.
 * Enforces strict domain separation to prevent cross-purpose or cross-subject hash reuse (TB-03).
 */
export function computeCredentialDigest(
  purpose: string,
  subjectId: string,
  secret: string | Buffer
): string {
  const secretBuffer = typeof secret === 'string' ? Buffer.from(secret, 'utf8') : secret;
  return createHash('sha256')
    .update(`purpose:${purpose};subject:${subjectId};secret:`)
    .update(secretBuffer)
    .digest('hex');
}

/**
 * Computes a constant-time dummy credential digest for non-existent users
 * to avoid timing oracle attacks / user enumeration (TB-03).
 */
export function computeDummyCredentialDigest(
  purpose: string,
  secret: string | Buffer
): string {
  const dummySubject = '00000000-0000-0000-0000-000000000000';
  return computeCredentialDigest(purpose, dummySubject, secret);
}

/**
 * Forbidden keys that must never be accepted from public registration inputs to prevent
 * unauthorized self-service elevation into administrative principals (ARCH-013, AQR-003).
 */
const FORBIDDEN_PUBLIC_ELEVATION_KEYS = new Set([
  'role',
  'roles',
  'admin',
  'isadmin',
  'is_admin',
  'administrative',
  'isadministrative',
  'permissions',
  'permission',
  'privilege',
  'privileges',
  'superuser',
  'is_superuser',
  'issuperuser',
  'provisionprocedure',
  'provision_procedure',
  'authrevision',
  'auth_revision'
]);

/**
 * Validates that an input payload from public registration does not attempt
 * self-service elevation via role/admin fields.
 * Throws PUBLIC_ELEVATION_DENIED if any elevation key is present.
 */
export function assertPublicRegistrationSafe(payload: Record<string, unknown>): void {
  if (!payload || typeof payload !== 'object') {
    return;
  }
  for (const key of Object.keys(payload)) {
    const normalized = key.toLowerCase().replace(/[-_]/g, '');
    if (FORBIDDEN_PUBLIC_ELEVATION_KEYS.has(normalized)) {
      throw new ProvisioningError('PUBLIC_ELEVATION_DENIED', `Public registration rejected: elevation attempt via field "${key}"`);
    }
  }
}

export type RegistrationErrorCode =
  | 'ADULT_DECLARATION_REQUIRED'
  | 'INVALID_EMAIL'
  | 'INVALID_OR_UNUSABLE_INVITATION'
  | 'EMAIL_MISMATCH'
  | 'WEAK_PASSWORD'
  | 'PUBLIC_ELEVATION_DENIED'
  | 'ALREADY_ACTIVE'
  | 'TEMPORARY_FAILURE'
  | 'INVALID_ARGUMENT';

export class RegistrationError extends Error {
  constructor(public readonly code: RegistrationErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'RegistrationError';
  }
}

export interface OrganizerAccountRecord {
  readonly id: string;
  readonly email: string;
  readonly emailNormalized: string;
  readonly status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'PENDING_DELETION' | 'DELETED';
  readonly declaredAdult: boolean;
  readonly declaredAdultAt?: Date | null;
  readonly invitationId: string;
  readonly verifiedAt?: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface EmailVerificationNotificationPort {
  sendVerificationEmail(recipient: {
    email: string;
    token: string;
    expiresAt: Date;
  }): Promise<void>;
}

export interface RegisterOrganizerCommand {
  readonly invitationToken: string;
  readonly email: string;
  readonly password: string;
  readonly declaredAdult: boolean;
  readonly metadata?: Record<string, unknown>;
}

export interface RegisterOrganizerResult {
  readonly account: OrganizerAccountRecord;
  readonly outcome: 'REGISTERED_PENDING' | 'ALREADY_REGISTERED_PENDING';
  readonly verificationIssued: boolean;
  readonly invitationId: string;
}

export type VerificationErrorCode =
  | 'INVALID_OR_UNUSABLE_TOKEN'
  | 'INVITATION_NOT_USABLE'
  | 'ACCOUNT_NOT_FOUND'
  | 'ACCOUNT_PENDING_VERIFICATION'
  | 'ALREADY_ACTIVE'
  | 'TEMPORARY_FAILURE'
  | 'INVALID_ARGUMENT';

export class VerificationError extends Error {
  constructor(public readonly code: VerificationErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'VerificationError';
  }
}

export interface VerifyEmailAndActivateCommand {
  readonly verificationToken: string;
}

export interface VerifyEmailAndActivateResult {
  readonly accountId: string;
  readonly emailNormalized: string;
  readonly status: 'ACTIVE';
  readonly outcome: 'ACTIVATED' | 'ALREADY_ACTIVE';
  readonly verifiedAt: Date;
}

export interface OrganizerActorContext {
  readonly actorType: 'ORGANIZER_HUMAN';
  readonly accountId: string;
  readonly email: string;
  readonly sessionId: string;
  readonly authTime: Date;
  readonly credentialRevision: bigint;
  readonly sessionWatermark: bigint;
  readonly recoveryEpoch: bigint;
  readonly restrictedContext?: 'DELETION_MANAGEMENT_ONLY';
}

export interface OrganizerSessionCookieSpec {
  readonly name: '__Host-el_session';
  readonly value: string;
  readonly httpOnly: true;
  readonly secure: true;
  readonly sameSite: 'Strict';
  readonly path: '/';
  readonly maxAgeSeconds: number;
}

export function serializeOrganizerSessionCookie(spec: OrganizerSessionCookieSpec): string {
  return `${spec.name}=${spec.value}; Path=${spec.path}; Secure; HttpOnly; SameSite=${spec.sameSite}; Max-Age=${spec.maxAgeSeconds}`;
}

export type OrganizerEffectiveSessionState =
  | 'ANONYMOUS'
  | 'ORGANIZER_ACTIVE'
  | 'ORGANIZER_RESTRICTED_DELETION';

export interface OrganizerEffectiveSessionCapabilities {
  readonly canSignIn: boolean;
  readonly canRequestBetaAccess: boolean;
  readonly canAccessMyEvents: boolean;
  readonly canAccessMyAccount: boolean;
  readonly canManageSessions: boolean;
  readonly canManageAccountDeletion: boolean;
  readonly isDeletionRestricted: boolean;
  readonly canSignOut: boolean;
}

export interface OrganizerProjectedAccountMetadata {
  readonly email: string;
  readonly emailVerified: boolean;
  readonly accountStatus: 'ACTIVE' | 'PENDING_DELETION';
}

export interface OrganizerEffectiveSessionProjection {
  readonly state: OrganizerEffectiveSessionState;
  readonly capabilities: OrganizerEffectiveSessionCapabilities;
  readonly account: OrganizerProjectedAccountMetadata | null;
  readonly csrfToken?: string;
}

export interface ProjectOrganizerSessionCommand {
  readonly sessionToken?: string | null;
}

export interface OrganizerLoginCommand {
  readonly email: string;
  /** Plaintext password provided by organizer. Never logged, returned, or persisted. */
  readonly password: string;
  readonly origin?: string;
}

export interface OrganizerLoginResult {
  readonly actorContext: OrganizerActorContext;
  readonly sessionToken: string;
  readonly csrfToken: string;
  readonly cookieSpec: OrganizerSessionCookieSpec;
  readonly account: OrganizerAccountRecord;
  readonly projection: OrganizerEffectiveSessionProjection;
}

export interface ValidateOrganizerSessionCommand {
  readonly sessionToken: string;
  readonly csrfToken?: string | null;
  readonly requireCsrf?: boolean;
}

export interface ValidateOrganizerSessionResult {
  readonly actorContext: OrganizerActorContext;
  readonly projection: OrganizerEffectiveSessionProjection;
}

export interface ResendVerificationEmailCommand {
  readonly email: string;
  readonly clientIp?: string;
}

export interface ResendVerificationEmailResult {
  readonly outcome: 'RESEND_ACCEPTED';
  readonly message: string;
}

export interface OrganizerSessionSummaryRecord {
  readonly id: string;
  readonly accountId: string;
  readonly authTime: Date;
  readonly createdAt: Date;
  readonly lastActiveAt: Date;
  readonly expiresAt: Date;
  readonly idleExpiresAt: Date;
  readonly isCurrent: boolean;
}

export interface ListOrganizerSessionsCommand {
  readonly actorContext: OrganizerActorContext;
}

export interface ListOrganizerSessionsResult {
  readonly sessions: readonly OrganizerSessionSummaryRecord[];
  readonly total: number;
}

export interface LogoutOrganizerCommand {
  readonly actorContext: OrganizerActorContext;
  readonly origin?: string;
}

export interface LogoutOrganizerResult {
  readonly outcome: 'LOGGED_OUT';
  readonly sessionId: string;
}

export interface RevokeSpecificSessionCommand {
  readonly actorContext: OrganizerActorContext;
  readonly targetSessionId: string;
  readonly reason?: string;
}

export interface RevokeSpecificSessionResult {
  readonly outcome: 'REVOKED' | 'ALREADY_REVOKED';
  readonly targetSessionId: string;
  readonly isCurrentSession: boolean;
}

export interface RevokeOtherSessionsCommand {
  readonly actorContext: OrganizerActorContext;
  readonly reason?: string;
}

export interface RevokeOtherSessionsResult {
  readonly outcome: 'OTHER_SESSIONS_REVOKED';
  readonly revokedCount: number;
  readonly currentSessionId: string;
}

export type PasswordResetErrorCode =
  | 'INVALID_EMAIL'
  | 'INVALID_OR_UNUSABLE_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_ALREADY_USED'
  | 'TOKEN_REVOKED'
  | 'ACCOUNT_NOT_ACTIVE'
  | 'WEAK_PASSWORD'
  | 'RATE_LIMITED'
  | 'TEMPORARY_FAILURE'
  | 'INVALID_ARGUMENT';

export class PasswordResetError extends Error {
  constructor(public readonly code: PasswordResetErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'PasswordResetError';
  }
}

export interface PasswordResetNotificationPort {
  sendPasswordResetEmail(recipient: {
    email: string;
    token: string;
    expiresAt: Date;
  }): Promise<void>;
}

export interface RequestPasswordResetCommand {
  readonly email: string;
  readonly clientIp?: string;
}

export interface RequestPasswordResetResult {
  readonly outcome: 'RESET_REQUEST_RECEIVED';
  readonly message: string;
}

export interface CompletePasswordResetCommand {
  readonly resetToken: string;
  readonly newPassword: string;
  readonly clientIp?: string;
}

export interface CompletePasswordResetResult {
  readonly accountId: string;
  readonly emailNormalized: string;
  readonly outcome: 'PASSWORD_RESET_COMPLETED';
  readonly revokedSessionsCount: number;
}

// ---------------------------------------------------------------------------
// Account Reauthentication (EL-TK-186 / MOD-001 / DEC-107 / ARCH-017)
// ---------------------------------------------------------------------------

export type ReauthenticationOperation = 'REQUEST_ACCOUNT_DELETION' | 'CANCEL_ACCOUNT_DELETION';
export type ReauthenticationResourceType = 'ACCOUNT';
export type ReauthenticationChallengeStatus = 'PENDING' | 'VERIFIED' | 'EXPIRED' | 'CANCELLED';
export type ReauthenticationEvidenceStatus = 'ACTIVE' | 'CONSUMED' | 'EXPIRED';

export type ReauthenticationErrorCode =
  | 'INVALID_ARGUMENT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'CHALLENGE_NOT_FOUND'
  | 'CHALLENGE_EXPIRED'
  | 'CHALLENGE_ALREADY_VERIFIED'
  | 'EVIDENCE_NOT_FOUND'
  | 'EVIDENCE_EXPIRED'
  | 'EVIDENCE_ALREADY_CONSUMED'
  | 'BINDING_MISMATCH'
  | 'CONCURRENCY_CONFLICT'
  | 'RATE_LIMITED'
  | 'RESTRICTED_CONTEXT_VIOLATION'
  | 'RECOVERY_AUTHORITY_UNAVAILABLE';

export class ReauthenticationError extends Error {
  constructor(public readonly code: ReauthenticationErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ReauthenticationError';
  }
}

export interface BeginReauthenticationCommand {
  readonly actorContext: OrganizerActorContext;
  readonly operation: ReauthenticationOperation;
  readonly resourceType: ReauthenticationResourceType;
  readonly resourceId: string;
  readonly expectedRevision: bigint;
  readonly intentionHash: string;
  readonly requestId?: string;
}

export interface BeginReauthenticationResult {
  readonly challengeId: string;
  readonly expiresAt: Date;
  readonly operation: ReauthenticationOperation;
  readonly resourceId: string;
}

export interface VerifyReauthenticationCommand {
  readonly actorContext: OrganizerActorContext;
  readonly challengeId: string;
  readonly credential: string; // raw password
}

export interface VerifyReauthenticationResult {
  readonly evidence: string; // raw opaque evidence token
  readonly expiresAt: Date;
}

export interface ConsumeReauthenticationEvidenceCommand {
  readonly evidence: string; // raw opaque evidence token
  readonly accountId: string;
  readonly sessionId: string;
  readonly operation: ReauthenticationOperation;
  readonly resourceType: ReauthenticationResourceType;
  readonly resourceId: string;
  readonly expectedRevision: bigint;
  readonly intentionHash: string;
  readonly requestId?: string;
  readonly idempotencyKey?: string;
}

export interface ConsumeReauthenticationEvidenceResult {
  readonly outcome: 'CONSUMED' | 'REPLAY_ACKNOWLEDGED';
  readonly consumedAt: Date;
  readonly receiptId: string;
}

export interface AccountReauthenticationPort {
  beginChallenge(command: BeginReauthenticationCommand): Promise<BeginReauthenticationResult>;
  verifyChallenge(command: VerifyReauthenticationCommand): Promise<VerifyReauthenticationResult>;
  assertAndConsumeEvidence(
    tx: SqlTransaction,
    command: ConsumeReauthenticationEvidenceCommand
  ): Promise<ConsumeReauthenticationEvidenceResult>;
}

