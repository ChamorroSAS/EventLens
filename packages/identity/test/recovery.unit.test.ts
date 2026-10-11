import { describe, it, expect, vi } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  Mod001RecoveryCoordinator,
  RecoveryError,
  type RecoveryAuthorityPort,
  type PrepareSensitiveOperationCommand,
  type Mod001RecoveryFact,
  type RecoveryCheckpoint
} from '../src/index.js';

class MockTransactionRunner implements TransactionRunner {
  public executedQueries: { sql: string; params: unknown[] }[] = [];
  public shouldFailSql = false;

  async run<T>(fn: (tx: SqlTransaction) => Promise<T>): Promise<T> {
    const tx: SqlTransaction = {
      query: async <R extends object>(sql: string, ...params: unknown[]): Promise<R[]> => {
        this.executedQueries.push({ sql, params });
        if (this.shouldFailSql) throw new Error('SQL_EXECUTION_FAILURE');
        return [] as R[];
      },
      execute: async (sql: string, ...params: unknown[]): Promise<number> => {
        this.executedQueries.push({ sql, params });
        if (this.shouldFailSql) throw new Error('SQL_EXECUTION_FAILURE');
        return 1;
      }
    };
    return fn(tx);
  }
}

describe('Mod001RecoveryCoordinator (Unit Tests)', () => {
  const baseCommand: PrepareSensitiveOperationCommand = {
    operationId: 'op-046-001',
    subjectRef: 'user-admin-1',
    fact: {
      type: 'ADMIN_PRINCIPAL_REVOKED',
      data: { reason: 'SECURITY_INCIDENT' }
    }
  };

  it('validates required dependencies on constructor', () => {
    const runner = new MockTransactionRunner();
    const authority: RecoveryAuthorityPort = {
      getRecoveryEpoch: async () => 1n,
      getCredentialRevision: async () => 1n,
      getAdminAuthWatermark: async () => 1n
    };

    expect(() => new Mod001RecoveryCoordinator({ authority: null as any, transactions: runner }))
      .toThrow(RecoveryError);
    expect(() => new Mod001RecoveryCoordinator({ authority, transactions: null as any }))
      .toThrow(RecoveryError);
  });

  describe('prepareSensitiveOperation', () => {
    it('validates required parameters', async () => {
      const runner = new MockTransactionRunner();
      const authority: RecoveryAuthorityPort = {
        getRecoveryEpoch: async () => 1n,
        getCredentialRevision: async () => 1n,
        getAdminAuthWatermark: async () => 1n,
        prepare: vi.fn()
      };
      const coordinator = new Mod001RecoveryCoordinator({ authority, transactions: runner });

      await expect(coordinator.prepareSensitiveOperation({ ...baseCommand, operationId: '' }))
        .rejects.toThrow('operationId, subjectRef, and fact.type are required');
      await expect(coordinator.prepareSensitiveOperation({ ...baseCommand, subjectRef: '' }))
        .rejects.toThrow('operationId, subjectRef, and fact.type are required');
      await expect(coordinator.prepareSensitiveOperation({ ...baseCommand, fact: null as any }))
        .rejects.toThrow('operationId, subjectRef, and fact.type are required');
    });

    it('fails closed when recovery authority does not implement prepare', async () => {
      const runner = new MockTransactionRunner();
      const authority: RecoveryAuthorityPort = {
        getRecoveryEpoch: async () => 1n,
        getCredentialRevision: async () => 1n,
        getAdminAuthWatermark: async () => 1n
      };
      const coordinator = new Mod001RecoveryCoordinator({ authority, transactions: runner });

      await expect(coordinator.prepareSensitiveOperation(baseCommand))
        .rejects.toMatchObject({ code: 'AUTHORITY_UNAVAILABLE' });
    });

    it('fails closed when a recovery barrier is active for MOD-001', async () => {
      const runner = new MockTransactionRunner();
      const authority: RecoveryAuthorityPort = {
        getRecoveryEpoch: async () => 2n,
        getCredentialRevision: async () => 1n,
        getAdminAuthWatermark: async () => 1n,
        prepare: vi.fn(),
        isRecoveryBarrierActive: vi.fn().mockResolvedValue(true)
      };
      const coordinator = new Mod001RecoveryCoordinator({ authority, transactions: runner });

      await expect(coordinator.prepareSensitiveOperation(baseCommand))
        .rejects.toMatchObject({ code: 'BARRIER_ACTIVE' });
      expect(authority.prepare).not.toHaveBeenCalled();
    });

    it('successfully calls authority.prepare when barrier is inactive', async () => {
      const runner = new MockTransactionRunner();
      const expectedReceipt = {
        preparedReceipt: 'rcpt-prep-123',
        sequence: 42n,
        operationId: baseCommand.operationId,
        subjectRef: baseCommand.subjectRef
      };
      const authority: RecoveryAuthorityPort = {
        getRecoveryEpoch: async () => 1n,
        getCredentialRevision: async () => 1n,
        getAdminAuthWatermark: async () => 1n,
        prepare: vi.fn().mockResolvedValue(expectedReceipt),
        isRecoveryBarrierActive: vi.fn().mockResolvedValue(false)
      };
      const coordinator = new Mod001RecoveryCoordinator({ authority, transactions: runner });

      const receipt = await coordinator.prepareSensitiveOperation(baseCommand);
      expect(receipt).toEqual(expectedReceipt);
      expect(authority.prepare).toHaveBeenCalledWith(baseCommand);
    });
  });

  describe('executeSensitiveTransaction', () => {
    it('executes PREPARE -> SQL commit -> ACK protocol successfully', async () => {
      const runner = new MockTransactionRunner();
      const preparedReceipt = {
        preparedReceipt: 'rcpt-prep-abc',
        sequence: 10n,
        operationId: baseCommand.operationId,
        subjectRef: baseCommand.subjectRef
      };
      const ackCommitMock = vi.fn().mockResolvedValue(undefined);
      const resolveAbortMock = vi.fn().mockResolvedValue(undefined);

      const authority: RecoveryAuthorityPort = {
        getRecoveryEpoch: async () => 1n,
        getCredentialRevision: async () => 1n,
        getAdminAuthWatermark: async () => 1n,
        prepare: vi.fn().mockResolvedValue(preparedReceipt),
        ackCommit: ackCommitMock,
        resolveAbort: resolveAbortMock
      };
      const coordinator = new Mod001RecoveryCoordinator({ authority, transactions: runner });

      const result = await coordinator.executeSensitiveTransaction(baseCommand, async (rcpt, tx) => {
        expect(rcpt).toEqual(preparedReceipt);
        await tx.execute('UPDATE mock_entity SET status = 1');
        return { result: { success: true }, revision: 15n };
      });

      expect(result).toEqual({ success: true });
      expect(ackCommitMock).toHaveBeenCalledWith('rcpt-prep-abc', 15n);
      expect(resolveAbortMock).not.toHaveBeenCalled();
      expect(runner.executedQueries.length).toBe(1);
    });

    it('calls resolveAbort and throws when SQL transaction fails', async () => {
      const runner = new MockTransactionRunner();
      runner.shouldFailSql = true;

      const preparedReceipt = {
        preparedReceipt: 'rcpt-prep-abort',
        sequence: 11n,
        operationId: baseCommand.operationId,
        subjectRef: baseCommand.subjectRef
      };
      const ackCommitMock = vi.fn().mockResolvedValue(undefined);
      const resolveAbortMock = vi.fn().mockResolvedValue(undefined);

      const authority: RecoveryAuthorityPort = {
        getRecoveryEpoch: async () => 1n,
        getCredentialRevision: async () => 1n,
        getAdminAuthWatermark: async () => 1n,
        prepare: vi.fn().mockResolvedValue(preparedReceipt),
        ackCommit: ackCommitMock,
        resolveAbort: resolveAbortMock
      };
      const coordinator = new Mod001RecoveryCoordinator({ authority, transactions: runner });

      await expect(
        coordinator.executeSensitiveTransaction(baseCommand, async (_rcpt, tx) => {
          await tx.execute('FAILING_QUERY');
          return { result: 'SHOULD_NOT_REACH', revision: 1n };
        })
      ).rejects.toThrow('SQL_EXECUTION_FAILURE');

      expect(resolveAbortMock).toHaveBeenCalledWith('rcpt-prep-abort', 'SQL_EXECUTION_FAILURE');
      expect(ackCommitMock).not.toHaveBeenCalled();
    });

    it('throws fail-closed when ackCommit fails after SQL commit', async () => {
      const runner = new MockTransactionRunner();
      const preparedReceipt = {
        preparedReceipt: 'rcpt-prep-ack-fail',
        sequence: 12n,
        operationId: baseCommand.operationId,
        subjectRef: baseCommand.subjectRef
      };

      const authority: RecoveryAuthorityPort = {
        getRecoveryEpoch: async () => 1n,
        getCredentialRevision: async () => 1n,
        getAdminAuthWatermark: async () => 1n,
        prepare: vi.fn().mockResolvedValue(preparedReceipt),
        ackCommit: vi.fn().mockRejectedValue(new Error('REMOTE_TIMEOUT'))
      };
      const coordinator = new Mod001RecoveryCoordinator({ authority, transactions: runner });

      await expect(
        coordinator.executeSensitiveTransaction(baseCommand, async (_rcpt, _tx) => {
          return { result: 'done', revision: 2n };
        })
      ).rejects.toMatchObject({ code: 'AUTHORITY_UNAVAILABLE' });
    });
  });

  describe('reconcileMod001', () => {
    it('fails closed when recovery authority does not support reading checkpoint or facts', async () => {
      const runner = new MockTransactionRunner();
      const authority: RecoveryAuthorityPort = {
        getRecoveryEpoch: async () => 1n,
        getCredentialRevision: async () => 1n,
        getAdminAuthWatermark: async () => 1n
      };
      const coordinator = new Mod001RecoveryCoordinator({ authority, transactions: runner });

      await expect(coordinator.reconcileMod001()).rejects.toMatchObject({
        code: 'AUTHORITY_UNAVAILABLE'
      });
    });

    it('fails closed when sequence gaps are detected in recovery facts', async () => {
      const runner = new MockTransactionRunner();
      const checkpoint: RecoveryCheckpoint = {
        epoch: 2n,
        checkpointSequence: 3n,
        checkpointDigest: 'sha256-checkpoint-digest'
      };
      const factsWithGap: Mod001RecoveryFact[] = [
        {
          type: 'ADMIN_PRINCIPAL_REVOKED',
          subjectRef: 'p-1',
          revision: 2n,
          sequence: 1n,
          facts: {},
          timestamp: new Date()
        },
        {
          type: 'CREDENTIAL_ROTATED',
          subjectRef: 'p-1',
          revision: 3n,
          sequence: 3n, // GAP: expected sequence 2
          facts: {},
          timestamp: new Date()
        }
      ];

      const authority: RecoveryAuthorityPort = {
        getRecoveryEpoch: async () => 2n,
        getCredentialRevision: async () => 1n,
        getAdminAuthWatermark: async () => 1n,
        readCheckpoint: vi.fn().mockResolvedValue(checkpoint),
        readFacts: vi.fn().mockResolvedValue(factsWithGap)
      };
      const coordinator = new Mod001RecoveryCoordinator({ authority, transactions: runner });

      await expect(coordinator.reconcileMod001()).rejects.toMatchObject({
        code: 'GAP_DETECTED'
      });
    });

    it('successfully reconciles facts, updates database restrictions, and acknowledges reconciliation', async () => {
      const runner = new MockTransactionRunner();
      const checkpoint: RecoveryCheckpoint = {
        epoch: 2n,
        checkpointSequence: 3n,
        checkpointDigest: 'sha256-complete-digest'
      };
      const continuousFacts: Mod001RecoveryFact[] = [
        {
          type: 'ADMIN_PRINCIPAL_REVOKED',
          subjectRef: 'p-revoked',
          revision: 2n,
          sequence: 1n,
          facts: {},
          timestamp: new Date()
        },
        {
          type: 'CREDENTIAL_ROTATED',
          subjectRef: 'p-rotated',
          revision: 5n,
          sequence: 2n,
          facts: {},
          timestamp: new Date()
        },
        {
          type: 'SESSION_REVOKED',
          subjectRef: 'session-123',
          revision: 1n,
          sequence: 3n,
          facts: { watermark: 10n, principalId: 'p-rotated' },
          timestamp: new Date()
        }
      ];

      const ackReconciledMock = vi.fn().mockResolvedValue(undefined);
      const authority: RecoveryAuthorityPort = {
        getRecoveryEpoch: async () => 2n,
        getCredentialRevision: async () => 1n,
        getAdminAuthWatermark: async () => 1n,
        readCheckpoint: vi.fn().mockResolvedValue(checkpoint),
        readFacts: vi.fn().mockResolvedValue(continuousFacts),
        ackReconciled: ackReconciledMock
      };
      const coordinator = new Mod001RecoveryCoordinator({ authority, transactions: runner });

      const outcome = await coordinator.reconcileMod001('MOD-001');

      expect(outcome.status).toBe('RECONCILED');
      expect(outcome.scope).toBe('MOD-001');
      expect(outcome.epoch).toBe(2n);
      expect(outcome.checkpointSequence).toBe(3n);
      expect(outcome.factsEvaluated).toBe(3);
      expect(outcome.restrictionsApplied).toBeGreaterThan(0);
      expect(ackReconciledMock).toHaveBeenCalledWith('MOD-001', 2n, 3n, 'sha256-complete-digest');
    });
  });
});
