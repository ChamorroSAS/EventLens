import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import type { RecoveryAuthorityPort } from './contracts.js';

/**
 * Minimal durable RecoveryAuthorityPort adapter (EL-TK-020 / EL-TK-046).
 * Reads the persisted recovery epoch and fails safe to epoch 1 when no state row exists.
 * Administrative credential facts are outside MOD-001 for this boundary, so revision/watermark
 * are reported conservatively (null / 1) to keep organizer session validation operational.
 */
export class PostgresRecoveryAuthority implements RecoveryAuthorityPort {
  constructor(private readonly runner: TransactionRunner) {}

  public async getRecoveryEpoch(): Promise<bigint> {
    return this.runner.run(async (tx: SqlTransaction) => {
      const rows = await tx.query<{ recovery_epoch: bigint | number | string }>(
        `SELECT recovery_epoch FROM recovery_authority_state
         ORDER BY recovery_epoch DESC
         LIMIT 1`
      );
      return rows.length > 0 ? BigInt(rows[0].recovery_epoch) : 1n;
    });
  }

  public async getCredentialRevision(_principalId: string): Promise<bigint | null> {
    return null;
  }

  public async getAdminAuthWatermark(_principalId: string): Promise<bigint> {
    return 1n;
  }
}
