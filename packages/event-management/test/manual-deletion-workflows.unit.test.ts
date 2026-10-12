import { describe, it, expect } from 'vitest';
import {
  computeCanonicalAccountDeletionIntentionHash,
  calculateFaithfulEventStatusAfterBarrierRelease,
} from '../src/index.js';

describe('EL-TK-189..193: Manual Deletion Workflows & Faithful Recalculation (Unit)', () => {
  it('calcula intentionHash canónico determinista para REQUEST y CANCEL de cuenta sin incluir secretos', () => {
    const reqHash1 = computeCanonicalAccountDeletionIntentionHash({
      operation: 'REQUEST_ACCOUNT_DELETION',
      accountId: 'acc-101',
      expectedRevision: 1n,
      confirmation: true,
    });
    const reqHash2 = computeCanonicalAccountDeletionIntentionHash({
      operation: 'REQUEST_ACCOUNT_DELETION',
      accountId: 'acc-101',
      expectedRevision: 1n,
      confirmation: true,
    });
    expect(reqHash1).toBe(reqHash2);

    const cancelHash = computeCanonicalAccountDeletionIntentionHash({
      operation: 'CANCEL_ACCOUNT_DELETION',
      accountId: 'acc-101',
      expectedRevision: 2n,
      confirmation: true,
      requestId: 'req-999',
    });
    expect(cancelHash).not.toBe(reqHash1);
  });

  it('recalcula evento ACTIVE, CLOSED, DRAFT y SCHEDULED fielmente al liberar barrera (EL-TK-190 / EL-TK-192)', () => {
    const now = new Date('2026-10-15T12:00:00.000Z');
    const baseEvent = {
      id: 'ev-1',
      organizer_id: 'org-1',
      status: 'PENDING_DELETION',
      previous_status: 'CLOSED',
      scheduled_at: new Date('2026-10-10T10:00:00.000Z'),
      activated_at: new Date('2026-10-10T10:00:00.000Z'),
      closed_at: new Date('2026-10-12T10:00:00.000Z'),
      expires_at: new Date('2026-10-25T10:00:00.000Z'),
      grace_ends_at: new Date('2026-11-10T10:00:00.000Z'),
      purge_started_at: new Date('2026-10-18T10:00:00.000Z'),
      suspended_at: null,
      suspension_reason: null,
    };

    // 1. Cierre voluntario preservado (no regresa a ACTIVE ciego)
    const closedRes = calculateFaithfulEventStatusAfterBarrierRelease({
      event: baseEvent,
      snapshotStatus: 'CLOSED',
      snapshotPreviousStatus: null,
      remainingActiveBarriersCount: 0,
      now,
    });
    expect(closedRes.targetStatus).toBe('CLOSED');
    expect(closedRes.purgeStartedAtToPersist).toBeNull();

    // 2. Evento DRAFT regresa a DRAFT
    const draftRes = calculateFaithfulEventStatusAfterBarrierRelease({
      event: { ...baseEvent, closed_at: null, previous_status: 'DRAFT' },
      snapshotStatus: 'DRAFT',
      snapshotPreviousStatus: null,
      remainingActiveBarriersCount: 0,
      now,
    });
    expect(draftRes.targetStatus).toBe('DRAFT');

    // 3. Evento SCHEDULED con fecha futura permanece SCHEDULED; con fecha pasada pasa a ACTIVE
    const schedFuture = calculateFaithfulEventStatusAfterBarrierRelease({
      event: {
        ...baseEvent,
        closed_at: null,
        scheduled_at: new Date('2026-10-20T10:00:00.000Z'),
      },
      snapshotStatus: 'SCHEDULED',
      snapshotPreviousStatus: null,
      remainingActiveBarriersCount: 0,
      now,
    });
    expect(schedFuture.targetStatus).toBe('SCHEDULED');

    const schedPast = calculateFaithfulEventStatusAfterBarrierRelease({
      event: {
        ...baseEvent,
        closed_at: null,
        scheduled_at: new Date('2026-10-14T10:00:00.000Z'),
      },
      snapshotStatus: 'SCHEDULED',
      snapshotPreviousStatus: null,
      remainingActiveBarriersCount: 0,
      now,
    });
    expect(schedPast.targetStatus).toBe('ACTIVE');
  });

  it('preserva SUSPENDED, aplica GRACE_PERIOD si venció vigencia y mantiene PENDING_DELETION si venció gracia o persisten otras barreras', () => {
    const now = new Date('2026-10-15T12:00:00.000Z');
    const baseEvent = {
      id: 'ev-2',
      organizer_id: 'org-1',
      status: 'PENDING_DELETION',
      previous_status: 'ACTIVE',
      scheduled_at: new Date('2026-10-01T10:00:00.000Z'),
      activated_at: new Date('2026-10-01T10:00:00.000Z'),
      closed_at: null,
      expires_at: new Date('2026-10-20T10:00:00.000Z'),
      grace_ends_at: new Date('2026-11-05T10:00:00.000Z'),
      purge_started_at: new Date('2026-10-18T10:00:00.000Z'),
      suspended_at: null,
      suspension_reason: null,
    };

    // 1. Si persiste otra barrera (ej. barrera de cuenta o de evento independiente), sigue en PENDING_DELETION
    const withRemainingBarrier = calculateFaithfulEventStatusAfterBarrierRelease({
      event: baseEvent,
      snapshotStatus: 'ACTIVE',
      snapshotPreviousStatus: null,
      remainingActiveBarriersCount: 1,
      now,
    });
    expect(withRemainingBarrier.targetStatus).toBe('PENDING_DELETION');

    // 2. Si tenía suspensión administrativa activa, regresa a SUSPENDED conservando su estado pre-suspensión
    const suspendedRes = calculateFaithfulEventStatusAfterBarrierRelease({
      event: {
        ...baseEvent,
        suspended_at: new Date('2026-10-11T00:00:00.000Z'),
        suspension_reason: 'Revision de seguridad',
      },
      snapshotStatus: 'SUSPENDED',
      snapshotPreviousStatus: 'ACTIVE',
      remainingActiveBarriersCount: 0,
      now,
    });
    expect(suspendedRes.targetStatus).toBe('SUSPENDED');
    expect(suspendedRes.previousStatusToPersist).toBe('ACTIVE');

    // 3. Si expiresAt ya pasó pero graceEndsAt aún no, pasa a GRACE_PERIOD
    const graceRes = calculateFaithfulEventStatusAfterBarrierRelease({
      event: {
        ...baseEvent,
        expires_at: new Date('2026-10-14T00:00:00.000Z'),
      },
      snapshotStatus: 'ACTIVE',
      snapshotPreviousStatus: null,
      remainingActiveBarriersCount: 0,
      now,
    });
    expect(graceRes.targetStatus).toBe('GRACE_PERIOD');

    // 4. Si graceEndsAt ya venció, queda en PENDING_DELETION con ancla en graceEndsAt sin ventana extra
    const graceEnd = new Date('2026-10-14T18:00:00.000Z');
    const expiredGraceRes = calculateFaithfulEventStatusAfterBarrierRelease({
      event: {
        ...baseEvent,
        expires_at: new Date('2026-10-05T00:00:00.000Z'),
        grace_ends_at: graceEnd,
      },
      snapshotStatus: 'GRACE_PERIOD',
      snapshotPreviousStatus: null,
      remainingActiveBarriersCount: 0,
      now,
    });
    expect(expiredGraceRes.targetStatus).toBe('PENDING_DELETION');
    expect(expiredGraceRes.purgeStartedAtToPersist?.toISOString()).toBe(graceEnd.toISOString());
    expect(expiredGraceRes.graceExpiredDuringWindow).toBe(true);
  });
});
