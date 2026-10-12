import { describe, expect, it } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  DeletionCoordinationError,
  IrreversibleDeletionIntakeService,
  addUtcCalendarDays,
  type DeletionRecoveryBarrierPort,
} from '../src/index.js';

function createStubRunner(): TransactionRunner {
  const stubTx: SqlTransaction = {
    query: async () => [],
    execute: async () => 0,
  };
  return {
    run: async <T>(fn: (tx: SqlTransaction) => Promise<T>): Promise<T> => fn(stubTx),
  };
}

function createStubRecoveryPort(epoch = 1n): DeletionRecoveryBarrierPort {
  return {
    getRecoveryEpoch: async () => epoch,
    prepareDeletionBarrier: async () => ({ preparedReceipt: 'prep-1', sequence: 1n }),
    ackDeletionBarrier: async () => {},
    prepareCancellationBarrierRelease: async () => ({ preparedReceipt: 'prep-rel-1', sequence: 2n }),
    ackCancellationBarrierRelease: async () => {},
  };
}

describe('EL-TK-194 — IrreversibleDeletionIntakeService (Unit)', () => {
  it('rechaza acciones públicas o denuncias sin resolución confirmada como intake directo', async () => {
    const service = new IrreversibleDeletionIntakeService({
      runner: createStubRunner(),
      recoveryBarrierPort: createStubRecoveryPort(1n),
    });

    await expect(
      service.ingestIrreversibleIntent({
        cause: 'PRIVACY_ADMIN_RESOLUTION',
        ownerModule: 'MOD-004',
        sourceOperationId: 'pub-report-1',
        producerReceiptId: 'rec-pub-1',
        mediaRef: 'media-1',
        eventId: 'ev-1',
        removalConfirmedAt: new Date('2026-10-12T12:00:00.000Z'),
        isPublicReportIntakeOnly: true,
        policyRef: 'MOD-008-PRIVACY-REMOVAL-V1',
        expectedRevision: 1n,
        recoveryEpoch: 1n,
        actorId: 'guest-reporter',
      })
    ).rejects.toMatchObject({
      code: 'INVALID_DELETION_INTENT',
    } satisfies Partial<DeletionCoordinationError>);
  });

  it('rechaza disposición de cuarentena si el actor es ORGANIZER o PUBLIC y exige ADMIN_HUMAN o SECURITY_AUTOMATION', async () => {
    const service = new IrreversibleDeletionIntakeService({
      runner: createStubRunner(),
      recoveryBarrierPort: createStubRecoveryPort(1n),
    });

    await expect(
      service.ingestIrreversibleIntent({
        cause: 'QUARANTINE_DISPOSITION',
        ownerModule: 'MOD-003',
        sourceOperationId: 'q-disp-org-1',
        producerReceiptId: 'q-rec-1',
        mediaRef: 'media-q-1',
        eventId: 'ev-1',
        purgeIntentId: 'pi-1',
        dispositionConfirmedAt: new Date('2026-10-12T12:00:00.000Z'),
        dispositionActorRole: 'ORGANIZER',
        policyRef: 'MOD-008-QUARANTINE-V1',
        expectedRevision: 2n,
        recoveryEpoch: 1n,
        actorId: 'org-1',
      })
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED_ACTOR',
    } satisfies Partial<DeletionCoordinationError>);
  });

  it('valida epoch de autoridad, ausencia de legal hold y correspondencia estricta causa-ownerModule', async () => {
    const service = new IrreversibleDeletionIntakeService({
      runner: createStubRunner(),
      recoveryBarrierPort: createStubRecoveryPort(5n),
    });

    await expect(
      service.ingestIrreversibleIntent({
        cause: 'TRASH_RETENTION_EXPIRED',
        ownerModule: 'MOD-004',
        sourceOperationId: 'trash-exp-1',
        producerReceiptId: 'trash-rec-1',
        mediaRef: 'media-t-1',
        eventId: 'ev-1',
        trashRecordId: 'tr-1',
        restoreDeadline: new Date('2026-10-12T10:00:00.000Z'),
        policyRef: 'MOD-008-TRASH-V1',
        expectedRevision: 2n,
        recoveryEpoch: 4n, // stale epoch
        actorId: 'SYSTEM_SCHEDULER',
      })
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED_EPOCH',
    } satisfies Partial<DeletionCoordinationError>);

    await expect(
      service.ingestIrreversibleIntent({
        cause: 'TRASH_RETENTION_EXPIRED',
        ownerModule: 'MOD-004',
        sourceOperationId: 'trash-exp-hold',
        producerReceiptId: 'trash-rec-hold',
        mediaRef: 'media-t-1',
        eventId: 'ev-1',
        trashRecordId: 'tr-1',
        restoreDeadline: new Date('2026-10-12T10:00:00.000Z'),
        policyRef: 'LEGAL_OR_SECURITY_HOLD_V1',
        expectedRevision: 2n,
        recoveryEpoch: 5n,
        actorId: 'SYSTEM_SCHEDULER',
      })
    ).rejects.toMatchObject({
      code: 'LEGAL_HOLD_NOT_ENABLED',
    } satisfies Partial<DeletionCoordinationError>);

    // Cálculo canónico de +7 y +30 días calendario UTC desde restoreDeadline
    const restoreDeadline = new Date('2026-01-31T18:45:00.000Z');
    expect(addUtcCalendarDays(restoreDeadline, 7).toISOString()).toBe('2026-02-07T18:45:00.000Z');
    expect(addUtcCalendarDays(restoreDeadline, 30).toISOString()).toBe('2026-03-02T18:45:00.000Z');
  });
});
