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

export interface AuditEventRecord {
  readonly id: string;
  readonly procedure: 'INITIAL_BOOTSTRAP' | 'AUTHORIZED_PROVISION' | 'PUBLIC_ENTRY_REJECTED';
  readonly actorId: string;
  readonly targetIdentifier: string;
  readonly targetPrincipalId?: string;
  readonly result:
    | 'SUCCESS'
    | 'REJECTED_BOOTSTRAP_CONSUMED'
    | 'REJECTED_UNAUTHORIZED'
    | 'REJECTED_PUBLIC_ELEVATION'
    | 'CONFLICT_DUPLICATE';
  readonly details?: string;
  readonly timestamp: Date;
}

export interface AuditSink {
  record(event: AuditEventRecord): Promise<void>;
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
