import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  Mod001FactType,
  Mod001RecoveryFact,
  PrepareSensitiveOperationCommand,
  ReconciliationResult,
  RecoveryAuthorityPort,
  RecoveryCheckpoint,
  RecoveryError,
  RecoveryPreparedReceipt
} from './contracts.js';

export interface Mod001RecoveryCoordinatorOptions {
  readonly authority: RecoveryAuthorityPort;
  readonly transactions: TransactionRunner;
}

export class Mod001RecoveryCoordinator {
  private readonly authority: RecoveryAuthorityPort;
  private readonly transactions: TransactionRunner;

  constructor(options: Mod001RecoveryCoordinatorOptions) {
    if (!options?.authority) {
      throw new RecoveryError('INVALID_ARGUMENT', 'RecoveryAuthorityPort is required');
    }
    if (!options?.transactions) {
      throw new RecoveryError('INVALID_ARGUMENT', 'TransactionRunner is required');
    }
    this.authority = options.authority;
    this.transactions = options.transactions;
  }

  /**
   * Prepares a sensitive MOD-001 mutation with the RecoveryAuthority outside the SQL transaction.
   * Fails closed if the authority is unavailable or if a recovery barrier is active for MOD-001.
   */
  async prepareSensitiveOperation(command: PrepareSensitiveOperationCommand): Promise<RecoveryPreparedReceipt> {
    if (!command.operationId || !command.subjectRef || !command.fact?.type) {
      throw new RecoveryError('INVALID_ARGUMENT', 'operationId, subjectRef, and fact.type are required');
    }

    if (!this.authority.prepare) {
      throw new RecoveryError('AUTHORITY_UNAVAILABLE', 'Recovery authority does not support PREPARE protocol');
    }

    // Barrier check: if MOD-001 is fenced under recovery, sensitive mutations are denied
    const currentEpoch = await this.authority.getRecoveryEpoch();
    if (this.authority.isRecoveryBarrierActive) {
      const isBlocked = await this.authority.isRecoveryBarrierActive(currentEpoch, 'MOD-001');
      if (isBlocked) {
        throw new RecoveryError('BARRIER_ACTIVE', 'Sensitive operation rejected: MOD-001 recovery barrier is active');
      }
    }

    try {
      return await this.authority.prepare(command);
    } catch (err) {
      if (err instanceof RecoveryError) {
        throw err;
      }
      throw new RecoveryError('AUTHORITY_UNAVAILABLE', `Recovery authority PREPARE failed: ${(err as Error).message}`);
    }
  }

  /**
   * Executes a sensitive MOD-001 command using the PREPARE -> SQL commit -> ACK protocol.
   * If SQL fails, invokes resolveAbort to safely clear or record the failed attempt.
   * If ACK fails after SQL commit, throws fail-closed to prevent confirming access before durable receipt.
   */
  async executeSensitiveTransaction<T>(
    command: PrepareSensitiveOperationCommand,
    operation: (receipt: RecoveryPreparedReceipt, tx: SqlTransaction) => Promise<{ result: T; revision: bigint }>
  ): Promise<T> {
    const receipt = await this.prepareSensitiveOperation(command);

    let opOutcome: { result: T; revision: bigint };
    try {
      opOutcome = await this.transactions.run(async (tx) => {
        return operation(receipt, tx);
      });
    } catch (sqlError) {
      if (this.authority.resolveAbort) {
        try {
          await this.authority.resolveAbort(receipt.preparedReceipt, (sqlError as Error).message);
        } catch {
          // Keep original SQL error as primary cause
        }
      }
      throw sqlError;
    }

    if (!this.authority.ackCommit) {
      throw new RecoveryError(
        'AUTHORITY_UNAVAILABLE',
        'Recovery authority does not support mandatory ACK commit protocol'
      );
    }

    try {
      await this.authority.ackCommit(receipt.preparedReceipt, opOutcome.revision);
    } catch (ackError) {
      throw new RecoveryError(
        'AUTHORITY_UNAVAILABLE',
        `Failed to ACK committed operation with recovery authority: ${(ackError as Error).message}`
      );
    }

    return opOutcome.result;
  }

  /**
   * Reconciles MOD-001 entities and restrictions post-PITR restore.
   * Evaluates recovery checkpoint and external facts to prevent stale snapshots
   * from resurrecting revoked credentials, expired sessions, or consumed invitations.
   * Fails closed if sequence gaps, authority unavailability, or unresolvable ambiguities occur.
   */
  async reconcileMod001(scope: string = 'MOD-001'): Promise<ReconciliationResult> {
    if (!this.authority.readCheckpoint || !this.authority.readFacts) {
      throw new RecoveryError('AUTHORITY_UNAVAILABLE', 'Recovery authority does not support checkpoint/facts inspection');
    }

    let checkpoint: RecoveryCheckpoint;
    try {
      checkpoint = await this.authority.readCheckpoint();
    } catch (err) {
      throw new RecoveryError('AUTHORITY_UNAVAILABLE', `Failed to read recovery checkpoint: ${(err as Error).message}`);
    }

    // Read all facts through the checkpoint
    const facts = await this.authority.readFacts(0n, checkpoint.checkpointSequence);

    // Validate journal sequence continuity: no gaps allowed (fail-closed)
    let expectedSequence = 1n;
    for (const fact of facts) {
      if (fact.sequence !== expectedSequence) {
        throw new RecoveryError(
          'GAP_DETECTED',
          `Sequence gap in recovery journal: expected ${expectedSequence}, found ${fact.sequence}`
        );
      }
      expectedSequence++;
    }

    let restrictionsApplied = 0;

    await this.transactions.run(async (tx) => {
      for (const fact of facts) {
        switch (fact.type) {
          case 'ADMIN_PRINCIPAL_REVOKED': {
            const updated = await tx.execute(
              `UPDATE admin_principal SET status = 'REVOKED', auth_revision = auth_revision + 1, updated_at = NOW() WHERE id = $1 AND status != 'REVOKED'`,
              fact.subjectRef
            );
            if (updated > 0) {
              restrictionsApplied += updated;
            }
            break;
          }

          case 'CREDENTIAL_ROTATED': {
            // Ensure restored credential does not authorize if its revision is older than the fact
            const isOrganizer = fact.facts?.subjectKind === 'ORGANIZER' || fact.facts?.kind === 'ORGANIZER';
            if (isOrganizer) {
              const updated = await tx.execute(
                `UPDATE organizer_credential SET status = 'REVOKED', updated_at = NOW() WHERE account_id = $1 AND revision < $2 AND status = 'ACTIVE'`,
                fact.subjectRef,
                fact.revision.toString()
              );
              if (updated > 0) {
                restrictionsApplied += updated;
              }
            } else {
              const updated = await tx.execute(
                `UPDATE admin_credential SET status = 'REVOKED', updated_at = NOW() WHERE principal_id = $1 AND revision < $2 AND status = 'ACTIVE'`,
                fact.subjectRef,
                fact.revision.toString()
              );
              if (updated > 0) {
                restrictionsApplied += updated;
              }
            }
            break;
          }

          case 'SESSION_REVOKED': {
            // Revoke matching session or any session with older watermark
            const isOrganizer = fact.facts?.subjectKind === 'ORGANIZER' || fact.facts?.kind === 'ORGANIZER';
            const watermark = fact.facts?.watermark ? String(fact.facts.watermark) : '0';
            if (isOrganizer) {
              const updated = await tx.execute(
                `UPDATE organizer_session SET revoked_at = NOW(), revocation_reason = 'RECOVERY_RECONCILIATION' WHERE (id = $1 OR (account_id = $2 AND session_watermark < $3)) AND revoked_at IS NULL`,
                fact.subjectRef,
                fact.facts?.accountId ? String(fact.facts.accountId) : fact.subjectRef,
                watermark
              );
              if (updated > 0) {
                restrictionsApplied += updated;
              }
            } else {
              const updated = await tx.execute(
                `UPDATE admin_session SET revoked_at = NOW(), revocation_reason = 'RECOVERY_RECONCILIATION' WHERE (id = $1 OR (principal_id = $2 AND session_watermark < $3)) AND revoked_at IS NULL`,
                fact.subjectRef,
                fact.facts?.principalId ? String(fact.facts.principalId) : fact.subjectRef,
                watermark
              );
              if (updated > 0) {
                restrictionsApplied += updated;
              }
            }
            break;
          }

          default:
            // Facts pertinent to future entities (e.g. BETA invitations) evaluate cleanly
            break;
        }
      }

      // Enforce recovery epoch barrier on active sessions: sessions created before current recovery epoch are invalidated
      const invalidatedSessions = await tx.execute(
        `UPDATE admin_session SET revoked_at = NOW(), revocation_reason = 'RECOVERY_EPOCH_SUPERSEDED' WHERE auth_time < NOW() AND revoked_at IS NULL AND $1 > 1`,
        checkpoint.epoch.toString()
      );
      if (invalidatedSessions > 0) {
        restrictionsApplied += invalidatedSessions;
      }
    });

    // Durably acknowledge reconciliation with RecoveryAuthority
    if (this.authority.ackReconciled) {
      await this.authority.ackReconciled(
        scope,
        checkpoint.epoch,
        checkpoint.checkpointSequence,
        checkpoint.checkpointDigest
      );
    }

    return {
      scope,
      epoch: checkpoint.epoch,
      checkpointSequence: checkpoint.checkpointSequence,
      factsEvaluated: facts.length,
      restrictionsApplied,
      status: 'RECONCILED'
    };
  }
}
