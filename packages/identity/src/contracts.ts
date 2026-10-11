import { createHash } from 'node:crypto';

export type ProvisioningErrorCode =
  | 'INVALID_ARGUMENT'
  | 'BOOTSTRAP_ALREADY_CONSUMED'
  | 'UNAUTHORIZED_PROVISIONER'
  | 'PUBLIC_ELEVATION_DENIED'
  | 'DUPLICATE_PRINCIPAL';

export class ProvisioningError extends Error {
  constructor(public readonly code: ProvisioningErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ProvisioningError';
  }
}

export type AuthenticationErrorCode =
  | 'UNAUTHENTICATED'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'FRESH_AUTH_REQUIRED'
  | 'INVALID_ORIGIN'
  | 'CSRF_VALIDATION_FAILED'
  | 'TEMPORARY_FAILURE'
  | 'INVALID_ARGUMENT';

export class AuthenticationError extends Error {
  constructor(public readonly code: AuthenticationErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AuthenticationError';
  }
}

export interface AdminPrincipal {
  readonly id: string;
  readonly identifier: string;
  readonly status: 'ACTIVE';
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

export interface RecoveryAuthorityPort {
  getRecoveryEpoch(): Promise<bigint>;
  getCredentialRevision(principalId: string): Promise<bigint | null>;
  getAdminAuthWatermark(principalId: string): Promise<bigint>;
  prepareSessionOperation?(operationId: string, principalId: string): Promise<{ receipt: string }>;
  ackSessionOperation?(receipt: string): Promise<void>;
}

export interface AuditEventRecord {
  readonly id: string;
  readonly procedure:
    | 'INITIAL_BOOTSTRAP'
    | 'AUTHORIZED_PROVISION'
    | 'PUBLIC_ENTRY_REJECTED'
    | 'ADMIN_LOGIN'
    | 'ADMIN_REAUTH'
    | 'ADMIN_LOGOUT'
    | 'ADMIN_SESSION_VALIDATE';
  readonly actorId: string;
  readonly targetIdentifier: string;
  readonly targetPrincipalId?: string;
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
    | 'REJECTED_CSRF';
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
