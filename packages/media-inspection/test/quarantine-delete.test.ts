import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  QuarantineDeleteService,
  QuarantineDeleteDeniedError,
  reconcileLegacyQuarantineDeleted,
  type QuarantineDeleteCommand,
  type AdminDeleteInterventionGrant
} from '../src/quarantine-delete.js';
import type { AdminActorContext } from '@eventlens/identity';

describe('QuarantineDeleteService (Unit Tests)', () => {
  const dummyTx = {
    query: vi.fn(),
    execute: vi.fn()
  } as any;

  const mockTransactions = {
    run: vi.fn().mockImplementation(async (cb) => cb(dummyTx))
  };

  const validAdminContext: AdminActorContext = {
    actorType: 'ADMIN_HUMAN',
    principalId: 'admin-principal-1',
    identifier: 'admin@eventlens.internal',
    sessionId: 'session-uuid-1',
    authTime: new Date(),
    credentialRevision: 1n,
    adminAuthRevision: 1n,
    sessionWatermark: 1n,
    recoveryEpoch: 1n
  };

  const validGrant: AdminDeleteInterventionGrant = {
    grantId: 'grant-uuid-1',
    principalId: 'admin-principal-1',
    action: 'DELETE_QUARANTINE',
    targetRef: 'media-1',
    reason: 'Severe malware confirmed; irreversible deletion required',
    status: 'ACTIVE'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails with INVALID_ARGUMENT when required identifiers are missing', async () => {
    const service = new QuarantineDeleteService(mockTransactions as any);

    const baseCmd = {
      operationId: 'op-1',
      justification: 'Confirmed harmful payload',
      actor: {
        type: 'ADMIN_HUMAN' as const,
        actorContext: validAdminContext,
        grant: validGrant
      }
    };

    await expect(service.execute({ ...baseCmd, mediaRef: '' })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT'
    });

    await expect(service.execute({ ...baseCmd, mediaRef: 'media-1', operationId: '' })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT'
    });
  });

  it('fails with MISSING_JUSTIFICATION when justification is absent or blank', async () => {
    const service = new QuarantineDeleteService(mockTransactions as any);

    const cmd: QuarantineDeleteCommand = {
      mediaRef: 'media-1',
      operationId: 'op-1',
      justification: '   ',
      actor: {
        type: 'ADMIN_HUMAN',
        actorContext: validAdminContext,
        grant: validGrant
      }
    };

    await expect(service.execute(cmd)).rejects.toMatchObject({
      code: 'MISSING_JUSTIFICATION'
    });
  });

  it('strictly forbids organizers from deleting quarantined media (ORGANIZER_DENIED)', async () => {
    const service = new QuarantineDeleteService(mockTransactions as any);

    const cmd: QuarantineDeleteCommand = {
      mediaRef: 'media-1',
      operationId: 'op-organizer-attempt',
      justification: 'Delete my photo',
      actor: {
        type: 'ORGANIZER',
        organizerRef: 'organizer-123'
      }
    };

    await expect(service.execute(cmd)).rejects.toMatchObject({
      code: 'ORGANIZER_DENIED'
    });

    // Verify denial was recorded in denial audit table
    expect(dummyTx.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO media_quarantine_delete_denial_audit'),
      expect.any(String),
      'op-organizer-attempt',
      'media-1',
      'ORGANIZER',
      'organizer-123',
      'ORGANIZER_DENIED'
    );
  });

  it('rejects unauthorized actors without appropriate credentials', async () => {
    const service = new QuarantineDeleteService(mockTransactions as any);

    const cmd: QuarantineDeleteCommand = {
      mediaRef: 'media-1',
      operationId: 'op-unauth',
      justification: 'Delete this',
      actor: {
        type: 'UNAUTHORIZED',
        actorId: 'guest-random'
      }
    };

    await expect(service.execute(cmd)).rejects.toMatchObject({
      code: 'UNAUTHORIZED_ACTOR'
    });
  });

  describe('Administrative Human Actor Validation', () => {
    it('rejects human admin if grant action is not DELETE_QUARANTINE', async () => {
      const service = new QuarantineDeleteService(mockTransactions as any);

      const invalidGrant = {
        ...validGrant,
        action: 'RELEASE_QUARANTINE' as any
      };

      await expect(
        service.execute({
          mediaRef: 'media-1',
          operationId: 'op-grant-1',
          justification: 'Delete',
          actor: {
            type: 'ADMIN_HUMAN',
            actorContext: validAdminContext,
            grant: invalidGrant
          }
        })
      ).rejects.toMatchObject({ code: 'INVALID_GRANT' });
    });

    it('rejects human admin if grant principalId does not match actorContext', async () => {
      const service = new QuarantineDeleteService(mockTransactions as any);

      const foreignGrant: AdminDeleteInterventionGrant = {
        ...validGrant,
        principalId: 'admin-principal-OTHER'
      };

      await expect(
        service.execute({
          mediaRef: 'media-1',
          operationId: 'op-grant-2',
          justification: 'Delete',
          actor: {
            type: 'ADMIN_HUMAN',
            actorContext: validAdminContext,
            grant: foreignGrant
          }
        })
      ).rejects.toMatchObject({ code: 'INVALID_GRANT' });
    });

    it('rejects human admin if grant targetRef does not match mediaRef', async () => {
      const service = new QuarantineDeleteService(mockTransactions as any);

      const mismatchedGrant: AdminDeleteInterventionGrant = {
        ...validGrant,
        targetRef: 'media-ANOTHER'
      };

      await expect(
        service.execute({
          mediaRef: 'media-1',
          operationId: 'op-grant-3',
          justification: 'Delete',
          actor: {
            type: 'ADMIN_HUMAN',
            actorContext: validAdminContext,
            grant: mismatchedGrant
          }
        })
      ).rejects.toMatchObject({ code: 'INVALID_GRANT' });
    });

    it('rejects human admin if grant is not ACTIVE or has expired', async () => {
      const service = new QuarantineDeleteService(mockTransactions as any);

      const revokedGrant: AdminDeleteInterventionGrant = {
        ...validGrant,
        status: 'REVOKED'
      };

      await expect(
        service.execute({
          mediaRef: 'media-1',
          operationId: 'op-grant-4',
          justification: 'Delete',
          actor: {
            type: 'ADMIN_HUMAN',
            actorContext: validAdminContext,
            grant: revokedGrant
          }
        })
      ).rejects.toMatchObject({ code: 'INVALID_GRANT' });

      const expiredGrant: AdminDeleteInterventionGrant = {
        ...validGrant,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() - 60000)
      };

      await expect(
        service.execute({
          mediaRef: 'media-1',
          operationId: 'op-grant-5',
          justification: 'Delete',
          actor: {
            type: 'ADMIN_HUMAN',
            actorContext: validAdminContext,
            grant: expiredGrant
          }
        })
      ).rejects.toMatchObject({ code: 'INVALID_GRANT' });
    });
  });

  describe('Security Automation Route and Option A Enforcement', () => {
    it('accepts authorized security automation, preserves QUARANTINED status, and sets anchor deadlines', async () => {
      const confirmedDate = new Date('2026-10-12T12:00:00.000Z');
      dummyTx.query.mockImplementation(async (sql: string) => {
        if (sql.includes('media_quarantine_delete_receipt')) return [];
        if (sql.includes('media_catalog') && sql.includes('FOR UPDATE')) {
          return [{
            media_ref: 'media-1',
            event_ref: 'event-1',
            guest_ref: 'guest-1',
            generation: 1n,
            revision: 2n,
            status: 'QUARANTINED',
            original: {},
            job_id: 'job-1'
          }];
        }
        if (sql.includes('media_quarantine_purge_intent') && sql.includes('SELECT id')) {
          return [];
        }
        if (sql.includes('UPDATE media_catalog')) {
          return [{ confirmed_at: confirmedDate }];
        }
        if (sql.includes('test_event_organizer')) return [{ organizer_ref: 'organizer-1' }];
        return [];
      });

      const service = new QuarantineDeleteService(mockTransactions as any);

      const receipt = await service.execute({
        mediaRef: 'media-1',
        operationId: 'op-auto-1',
        justification: 'Confirmed zero-day exploit binary; autonomous purge triggered',
        actor: {
          type: 'SECURITY_AUTOMATION',
          serviceId: 'malware-scanner-daemon',
          securityScope: 'MEDIA_SECURITY_AUTOMATION'
        }
      });

      expect(receipt.actorType).toBe('SECURITY_AUTOMATION');
      expect(receipt.actorId).toBe('malware-scanner-daemon');
      // Opción A: status remains QUARANTINED (restricted disposition, not DELETED physical)
      expect(receipt.status).toBe('QUARANTINED');
      expect(receipt.generation).toBe(1n);
      expect(receipt.previousRevision).toBe(2n);
      expect(receipt.newRevision).toBe(3n);
      expect(receipt.purgeIntentId).toBeDefined();
      expect(receipt.policyRef).toBe('MOD-008-TRASH-QUARANTINE-PURGE-POLICY-V1');
      expect(receipt.dispositionConfirmedAt).toEqual(confirmedDate);
      expect(receipt.purgeStartedAt).toEqual(confirmedDate);
      expect(receipt.mainPurgeDeadline.toISOString()).toBe('2026-10-19T12:00:00.000Z');
      expect(receipt.residualPurgeDeadline.toISOString()).toBe('2026-11-11T12:00:00.000Z');
      expect(receipt.expectedRevision).toBe(3n);
      expect(receipt.wasExisting).toBe(false);

      // Verify media_catalog updated with new revision without changing status to DELETED
      expect(dummyTx.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE media_catalog'),
        '3',
        'media-1'
      );

      // Verify active cycle termination and job queue cancellation
      expect(dummyTx.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE media_processing_cycle'),
        'media-1'
      );
      expect(dummyTx.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE job_queue'),
        'media-1'
      );
    });

    it('rejects automation if serviceId or securityScope is empty', async () => {
      const service = new QuarantineDeleteService(mockTransactions as any);

      await expect(
        service.execute({
          mediaRef: 'media-1',
          operationId: 'op-auto-bad',
          justification: 'Delete',
          actor: {
            type: 'SECURITY_AUTOMATION',
            serviceId: '',
            securityScope: 'SCOPE'
          }
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED_ACTOR' });
    });
  });

  describe('Media State and Idempotency Validation', () => {
    it('rejects if media is not in QUARANTINED status', async () => {
      dummyTx.query.mockImplementation(async (sql: string) => {
        if (sql.includes('media_quarantine_delete_receipt')) return [];
        if (sql.includes('media_catalog')) {
          return [{
            media_ref: 'media-1',
            event_ref: 'event-1',
            guest_ref: 'guest-1',
            generation: 1n,
            revision: 2n,
            status: 'PUBLISHED', // Not quarantined!
            original: {},
            job_id: 'job-1'
          }];
        }
        return [];
      });

      const service = new QuarantineDeleteService(mockTransactions as any);

      await expect(
        service.execute({
          mediaRef: 'media-1',
          operationId: 'op-not-quarantined',
          justification: 'Delete',
          actor: {
            type: 'ADMIN_HUMAN',
            actorContext: validAdminContext,
            grant: validGrant
          }
        })
      ).rejects.toMatchObject({ code: 'MEDIA_NOT_QUARANTINED' });
    });

    it('rejects if media already has active purge disposition', async () => {
      dummyTx.query.mockImplementation(async (sql: string) => {
        if (sql.includes('media_quarantine_delete_receipt')) return [];
        if (sql.includes('media_catalog')) {
          return [{
            media_ref: 'media-1',
            event_ref: 'event-1',
            guest_ref: 'guest-1',
            generation: 1n,
            revision: 2n,
            status: 'QUARANTINED',
            original: {},
            job_id: 'job-1'
          }];
        }
        if (sql.includes('media_quarantine_purge_intent') && sql.includes('SELECT id')) {
          return [{ id: 'intent-existing-1' }];
        }
        return [];
      });

      const service = new QuarantineDeleteService(mockTransactions as any);

      await expect(
        service.execute({
          mediaRef: 'media-1',
          operationId: 'op-second-disposition',
          justification: 'Delete again',
          actor: {
            type: 'ADMIN_HUMAN',
            actorContext: validAdminContext,
            grant: validGrant
          }
        })
      ).rejects.toMatchObject({ code: 'MEDIA_NOT_QUARANTINED' });
    });

    it('returns existing receipt on compatible idempotent retry', async () => {
      const committedAt = new Date('2026-10-12T10:00:00.000Z');
      dummyTx.query.mockImplementation(async (sql: string) => {
        if (sql.includes('media_quarantine_delete_receipt')) {
          return [{
            operation_id: 'op-replay',
            media_ref: 'media-1',
            generation: 1n,
            previous_revision: 2n,
            new_revision: 3n,
            status: 'QUARANTINED',
            actor_type: 'ADMIN_HUMAN',
            actor_id: 'admin-principal-1',
            grant_id: 'grant-uuid-1',
            justification: 'Already deleted',
            purge_intent_id: 'purge-uuid-1',
            committed_at: committedAt
          }];
        }
        if (sql.includes('media_quarantine_purge_intent')) {
          return [{
            policy_ref: 'MOD-008-TRASH-QUARANTINE-PURGE-POLICY-V1',
            disposition_confirmed_at: committedAt,
            purge_started_at: committedAt,
            main_purge_deadline: new Date('2026-10-19T10:00:00.000Z'),
            residual_purge_deadline: new Date('2026-11-11T10:00:00.000Z'),
            expected_revision: 3n
          }];
        }
        return [];
      });

      const service = new QuarantineDeleteService(mockTransactions as any);

      const receipt = await service.execute({
        mediaRef: 'media-1',
        operationId: 'op-replay',
        justification: 'Already deleted',
        actor: {
          type: 'ADMIN_HUMAN',
          actorContext: validAdminContext,
          grant: validGrant
        }
      });

      expect(receipt.wasExisting).toBe(true);
      expect(receipt.operationId).toBe('op-replay');
      expect(receipt.status).toBe('QUARANTINED');
      expect(receipt.purgeIntentId).toBe('purge-uuid-1');
      expect(receipt.mainPurgeDeadline.toISOString()).toBe('2026-10-19T10:00:00.000Z');
      expect(dummyTx.execute).not.toHaveBeenCalled();
    });

    it('throws IDEMPOTENCY_CONFLICT when same operationId has conflicting mediaRef or actor', async () => {
      dummyTx.query.mockImplementation(async (sql: string) => {
        if (sql.includes('media_quarantine_delete_receipt')) {
          return [{
            operation_id: 'op-conflict',
            media_ref: 'media-DIFFERENT',
            generation: 1n,
            previous_revision: 2n,
            new_revision: 3n,
            status: 'QUARANTINED',
            actor_type: 'ADMIN_HUMAN',
            actor_id: 'admin-principal-1',
            grant_id: 'grant-uuid-1',
            justification: 'Already deleted',
            purge_intent_id: 'purge-uuid-1',
            committed_at: new Date()
          }];
        }
        return [];
      });

      const service = new QuarantineDeleteService(mockTransactions as any);

      await expect(
        service.execute({
          mediaRef: 'media-1',
          operationId: 'op-conflict',
          justification: 'Different attempt',
          actor: {
            type: 'ADMIN_HUMAN',
            actorContext: validAdminContext,
            grant: validGrant
          }
        })
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    });
  });

  describe('Legacy Reconciliation (Escenario 3)', () => {
    it('reconciles legacy DELETED without physical proof: never reopened and never physicalPurged', async () => {
      dummyTx.query.mockResolvedValueOnce([{
        media_ref: 'media-legacy-1',
        event_ref: 'event-1',
        guest_ref: 'guest-1',
        generation: 1n,
        revision: 2n,
        status: 'DELETED',
        original: {},
        job_id: 'job-1'
      }]);

      const result = await reconcileLegacyQuarantineDeleted(dummyTx, 'media-legacy-1');

      expect(result.mediaRef).toBe('media-legacy-1');
      expect(result.status).toBe('DELETED');
      expect(result.isLegacyDeleted).toBe(true);
      expect(result.reopened).toBe(false);
      expect(result.physicalPurged).toBe(false);
    });

    it('reconciles non-deleted media correctly', async () => {
      dummyTx.query.mockResolvedValueOnce([{
        media_ref: 'media-quar-1',
        event_ref: 'event-1',
        guest_ref: 'guest-1',
        generation: 1n,
        revision: 2n,
        status: 'QUARANTINED',
        original: {},
        job_id: 'job-1'
      }]);

      const result = await reconcileLegacyQuarantineDeleted(dummyTx, 'media-quar-1');

      expect(result.status).toBe('QUARANTINED');
      expect(result.isLegacyDeleted).toBe(false);
      expect(result.reopened).toBe(false);
      expect(result.physicalPurged).toBe(false);
    });
  });
});
