import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  AdminPrincipal,
  AuditEventRecord,
  AuditSink,
  ProvisionInitialBootstrapCommand,
  ProvisionSubsequentCommand,
  ProvisioningError,
  assertPublicRegistrationSafe
} from './contracts.js';

interface PrincipalRow {
  id: string;
  identifier: string;
  status: string;
  auth_revision: string | bigint;
  provision_procedure: string;
  provisioned_by: string;
  created_at: Date;
  updated_at: Date;
}

interface BootstrapStateRow {
  id: string;
  is_consumed: boolean;
  consumed_at: Date | null;
  consumed_by: string | null;
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function toAdminPrincipal(row: PrincipalRow): AdminPrincipal {
  return {
    id: row.id,
    identifier: row.identifier,
    status: 'ACTIVE',
    authRevision: BigInt(row.auth_revision),
    provisionProcedure: row.provision_procedure as 'INITIAL_BOOTSTRAP' | 'AUTHORIZED_PROVISION',
    provisionedBy: row.provisioned_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Service governing administrative principal provisioning in MOD-001 (ARCH-013, AQR-003).
 *
 * Enforces:
 * 1. Single-use initial bootstrap mechanism, irreversibly disabled upon completion.
 * 2. Subsequent provisioning requires an authorized identity and separate procedure,
 *    never reopening the consumed bootstrap.
 * 3. Rejection of unauthorized provisioning attempts with secret-free audit trails.
 * 4. Rejection of public registration self-service elevation attempts.
 */
export class AdminProvisioningService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly bootstrapSecret: string,
    private readonly externalAuditSink?: AuditSink
  ) {
    if (!bootstrapSecret || typeof bootstrapSecret !== 'string' || bootstrapSecret.trim().length === 0) {
      throw new ProvisioningError('INVALID_ARGUMENT', 'Bootstrap secret configuration is required');
    }
  }

  private async emitAudit(
    tx: SqlTransaction | null,
    event: AuditEventRecord
  ): Promise<void> {
    if (tx) {
      await tx.execute(
        `INSERT INTO admin_audit_event (id, procedure, actor_id, target_identifier, target_principal_id, result, details, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        event.id,
        event.procedure,
        event.actorId,
        event.targetIdentifier,
        event.targetPrincipalId ?? null,
        event.result,
        event.details ?? null,
        event.timestamp
      );
    }
    if (this.externalAuditSink) {
      try {
        await this.externalAuditSink.record(event);
      } catch {
        // External sink failure must not suppress or break core integrity
      }
    }
  }

  /**
   * Check whether the initial bootstrap procedure has been consumed.
   */
  async isBootstrapConsumed(): Promise<boolean> {
    return this.transactions.run(async (tx) => {
      const rows = await tx.query<BootstrapStateRow>(
        `SELECT is_consumed FROM operational_bootstrap_state WHERE id = 'SYSTEM_BOOTSTRAP'`
      );
      if (!rows.length) {
        return false;
      }
      return rows[0].is_consumed;
    });
  }

  /**
   * Executes the controlled single-use initial bootstrap procedure (Variant A).
   * Creates exactly one initial administrative principal and disables the bootstrap mechanism permanently.
   */
  async provisionInitialBootstrap(command: ProvisionInitialBootstrapCommand): Promise<AdminPrincipal> {
    if (!command.identifier || typeof command.identifier !== 'string' || command.identifier.trim().length === 0) {
      throw new ProvisioningError('INVALID_ARGUMENT', 'Administrative identifier is required');
    }
    if (!command.operatorToken || typeof command.operatorToken !== 'string') {
      throw new ProvisioningError('INVALID_ARGUMENT', 'Operator token is required');
    }

    const normalizedIdentifier = command.identifier.trim().toLowerCase();

    // Verify operational secret out-of-band token using constant-time comparison
    if (!safeCompare(command.operatorToken, this.bootstrapSecret)) {
      await this.transactions.run(async (tx) => {
        await this.emitAudit(tx, {
          id: randomUUID(),
          procedure: 'INITIAL_BOOTSTRAP',
          actorId: 'UNKNOWN_OPERATOR',
          targetIdentifier: normalizedIdentifier,
          result: 'REJECTED_UNAUTHORIZED',
          details: 'Invalid bootstrap operator token provided',
          timestamp: new Date()
        });
      });
      throw new ProvisioningError('UNAUTHORIZED_PROVISIONER', 'Invalid operational bootstrap token');
    }

    return this.transactions.run(async (tx) => {
      // Lock bootstrap state row to prevent concurrent race conditions
      const stateRows = await tx.query<BootstrapStateRow>(
        `SELECT id, is_consumed FROM operational_bootstrap_state WHERE id = 'SYSTEM_BOOTSTRAP' FOR UPDATE`
      );

      if (!stateRows.length) {
        // Initialize state if not present (defensive)
        await tx.execute(
          `INSERT INTO operational_bootstrap_state (id, is_consumed) VALUES ('SYSTEM_BOOTSTRAP', false) ON CONFLICT DO NOTHING`
        );
      } else if (stateRows[0].is_consumed) {
        await this.emitAudit(tx, {
          id: randomUUID(),
          procedure: 'INITIAL_BOOTSTRAP',
          actorId: 'SYSTEM_BOOTSTRAP',
          targetIdentifier: normalizedIdentifier,
          result: 'REJECTED_BOOTSTRAP_CONSUMED',
          details: 'Initial bootstrap mechanism was already consumed and is irreversibly disabled',
          timestamp: new Date()
        });
        throw new ProvisioningError('BOOTSTRAP_ALREADY_CONSUMED', 'Initial operational bootstrap has already been consumed');
      }

      // Check for duplicate principal
      const existing = await tx.query<PrincipalRow>(
        `SELECT id FROM admin_principal WHERE identifier = $1`,
        normalizedIdentifier
      );
      if (existing.length > 0) {
        await this.emitAudit(tx, {
          id: randomUUID(),
          procedure: 'INITIAL_BOOTSTRAP',
          actorId: 'SYSTEM_BOOTSTRAP',
          targetIdentifier: normalizedIdentifier,
          result: 'CONFLICT_DUPLICATE',
          details: 'Administrative principal with this identifier already exists',
          timestamp: new Date()
        });
        throw new ProvisioningError('DUPLICATE_PRINCIPAL', 'Administrative principal already exists');
      }

      const principalId = randomUUID();
      const now = new Date();

      // Create initial administrative principal
      const createdRows = await tx.query<PrincipalRow>(
        `INSERT INTO admin_principal (
           id, identifier, status, auth_revision, provision_procedure, provisioned_by, created_at, updated_at
         ) VALUES ($1, $2, 'ACTIVE', 1, 'INITIAL_BOOTSTRAP', 'SYSTEM_BOOTSTRAP', $3, $3)
         RETURNING *`,
        principalId,
        normalizedIdentifier,
        now
      );

      // Irreversibly disable initial bootstrap state
      await tx.execute(
        `UPDATE operational_bootstrap_state
         SET is_consumed = true, consumed_at = $1, consumed_by = 'INITIAL_BOOTSTRAP'
         WHERE id = 'SYSTEM_BOOTSTRAP'`,
        now
      );

      // Record audit event without secrets
      await this.emitAudit(tx, {
        id: randomUUID(),
        procedure: 'INITIAL_BOOTSTRAP',
        actorId: 'SYSTEM_BOOTSTRAP',
        targetIdentifier: normalizedIdentifier,
        targetPrincipalId: principalId,
        result: 'SUCCESS',
        details: 'Initial administrative principal created; bootstrap mechanism permanently disabled',
        timestamp: now
      });

      return toAdminPrincipal(createdRows[0]);
    });
  }

  /**
   * Executes subsequent administrative provisioning (Variant B).
   * Requires an authorized identity and separate procedure; does NOT reopen the bootstrap.
   */
  async provisionSubsequent(command: ProvisionSubsequentCommand): Promise<AdminPrincipal> {
    if (!command.identifier || typeof command.identifier !== 'string' || command.identifier.trim().length === 0) {
      throw new ProvisioningError('INVALID_ARGUMENT', 'Administrative identifier is required');
    }
    const normalizedIdentifier = command.identifier.trim().toLowerCase();

    // Verify authorizing actor exists and is an authorized provisioner
    if (!command.authorizingActor || !command.authorizingActor.id || !command.authorizingActor.isAuthorizedProvisioner) {
      const actorId = command.authorizingActor?.id ?? 'UNKNOWN_ACTOR';
      await this.transactions.run(async (tx) => {
        await this.emitAudit(tx, {
          id: randomUUID(),
          procedure: 'AUTHORIZED_PROVISION',
          actorId,
          targetIdentifier: normalizedIdentifier,
          result: 'REJECTED_UNAUTHORIZED',
          details: 'Caller is not authorized to provision administrative principals',
          timestamp: new Date()
        });
      });
      throw new ProvisioningError('UNAUTHORIZED_PROVISIONER', 'Caller is not authorized to provision administrative principals');
    }

    return this.transactions.run(async (tx) => {
      // Validate that the authorizing actor is an active admin principal
      const authorizerRows = await tx.query<PrincipalRow>(
        `SELECT id, status FROM admin_principal WHERE id = $1 AND status = 'ACTIVE'`,
        command.authorizingActor.id
      );

      if (!authorizerRows.length) {
        await this.emitAudit(tx, {
          id: randomUUID(),
          procedure: 'AUTHORIZED_PROVISION',
          actorId: command.authorizingActor.id,
          targetIdentifier: normalizedIdentifier,
          result: 'REJECTED_UNAUTHORIZED',
          details: 'Authorizing administrative principal was not found or is inactive',
          timestamp: new Date()
        });
        throw new ProvisioningError('UNAUTHORIZED_PROVISIONER', 'Authorizing principal is not active');
      }

      // Check for duplicate principal
      const existing = await tx.query<PrincipalRow>(
        `SELECT id FROM admin_principal WHERE identifier = $1`,
        normalizedIdentifier
      );
      if (existing.length > 0) {
        await this.emitAudit(tx, {
          id: randomUUID(),
          procedure: 'AUTHORIZED_PROVISION',
          actorId: command.authorizingActor.id,
          targetIdentifier: normalizedIdentifier,
          result: 'CONFLICT_DUPLICATE',
          details: 'Administrative principal with this identifier already exists',
          timestamp: new Date()
        });
        throw new ProvisioningError('DUPLICATE_PRINCIPAL', 'Administrative principal already exists');
      }

      const principalId = randomUUID();
      const now = new Date();

      // Create new administrative principal via authorized procedure
      const createdRows = await tx.query<PrincipalRow>(
        `INSERT INTO admin_principal (
           id, identifier, status, auth_revision, provision_procedure, provisioned_by, created_at, updated_at
         ) VALUES ($1, $2, 'ACTIVE', 1, 'AUTHORIZED_PROVISION', $3, $4, $4)
         RETURNING *`,
        principalId,
        normalizedIdentifier,
        command.authorizingActor.id,
        now
      );

      // Record audit event without secrets
      await this.emitAudit(tx, {
        id: randomUUID(),
        procedure: 'AUTHORIZED_PROVISION',
        actorId: command.authorizingActor.id,
        targetIdentifier: normalizedIdentifier,
        targetPrincipalId: principalId,
        result: 'SUCCESS',
        details: 'Subsequent administrative principal created via authorized procedure',
        timestamp: now
      });

      return toAdminPrincipal(createdRows[0]);
    });
  }

  /**
   * Guards public beta entry against self-service elevation attacks.
   * If any administrative/role field is present, audits and rejects without elevation or leaked secrets.
   */
  async guardPublicRegistration(payload: Record<string, unknown>): Promise<void> {
    try {
      assertPublicRegistrationSafe(payload);
    } catch (error) {
      if (error instanceof ProvisioningError && error.code === 'PUBLIC_ELEVATION_DENIED') {
        const email = typeof payload?.email === 'string' ? payload.email : 'UNKNOWN_PUBLIC_ENTRY';
        await this.transactions.run(async (tx) => {
          await this.emitAudit(tx, {
            id: randomUUID(),
            procedure: 'PUBLIC_ENTRY_REJECTED',
            actorId: 'PUBLIC_BETA_USER',
            targetIdentifier: email,
            result: 'REJECTED_PUBLIC_ELEVATION',
            details: 'Self-service elevation attempted via public registration; denied without privilege grant',
            timestamp: new Date()
          });
        });
      }
      throw error;
    }
  }
}
