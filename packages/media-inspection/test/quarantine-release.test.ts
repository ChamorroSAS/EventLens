import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  QuarantineReleaseService,
  QuarantineReleaseDeniedError,
  type QuarantineReleaseCommand,
  type AdminInterventionGrant
} from '../src/quarantine-release.js';
import type { AdminActorContext } from '@eventlens/identity';

describe('QuarantineReleaseService (Unit Tests)', () => {
  const dummyTx = {
    query: vi.fn(),
    execute: vi.fn()
  } as any;

  const mockTransactions = {
    run: vi.fn().mockImplementation(async (cb) => cb(dummyTx))
  };

  const mockQueue = {
    publish: vi.fn().mockResolvedValue('new-job-uuid-1111')
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

  const validGrant: AdminInterventionGrant = {
    grantId: 'grant-uuid-1',
    principalId: 'admin-principal-1',
    action: 'RELEASE_QUARANTINE',
    targetRef: 'media-1',
    reason: 'Security analysis confirmed false-positive detection',
    status: 'ACTIVE'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails with INVALID_ARGUMENT when required identifiers are missing', async () => {
    const service = new QuarantineReleaseService(mockTransactions as any, mockQueue as any);

    const baseCmd = {
      operationId: 'op-1',
      justification: 'Reviewed and safe',
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
    const service = new QuarantineReleaseService(mockTransactions as any, mockQueue as any);

    const cmd: QuarantineReleaseCommand = {
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

  it('strictly forbids organizers from releasing quarantined media (ORGANIZER_DENIED)', async () => {
    const service = new QuarantineReleaseService(mockTransactions as any, mockQueue as any);

    const cmd: QuarantineReleaseCommand = {
      mediaRef: 'media-1',
      operationId: 'op-organizer-attempt',
      justification: 'I am the event organizer and want my photo back',
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
      expect.stringContaining('INSERT INTO media_quarantine_release_denial_audit'),
      expect.any(String),
      'op-organizer-attempt',
      'media-1',
      'ORGANIZER',
      'organizer-123',
      'ORGANIZER_DENIED'
    );
  });

  it('rejects unauthorized actors without appropriate credentials', async () => {
    const service = new QuarantineReleaseService(mockTransactions as any, mockQueue as any);

    const cmd: QuarantineReleaseCommand = {
      mediaRef: 'media-1',
      operationId: 'op-unauth',
      justification: 'Some justification',
      actor: {
        type: 'UNAUTHORIZED',
        actorId: 'guest-random'
      }
    };

    await expect(service.execute(cmd)).rejects.toMatchObject({
      code: 'UNAUTHORIZED_ACTOR'
    });
  });

  describe('Admin Human Grant Validation (MOD-007)', () => {
    const service = new QuarantineReleaseService(mockTransactions as any, mockQueue as any);

    it('rejects human admin if grant action is not RELEASE_QUARANTINE', async () => {
      const wrongActionGrant: AdminInterventionGrant = {
        ...validGrant,
        action: 'OTHER_ACTION' as any
      };

      await expect(
        service.execute({
          mediaRef: 'media-1',
          operationId: 'op-grant-1',
          justification: 'Safe',
          actor: {
            type: 'ADMIN_HUMAN',
            actorContext: validAdminContext,
            grant: wrongActionGrant
          }
        })
      ).rejects.toMatchObject({ code: 'INVALID_GRANT' });
    });

    it('rejects human admin if grant principalId does not match actorContext', async () => {
      const mismatchGrant: AdminInterventionGrant = {
        ...validGrant,
        principalId: 'other-admin-principal'
      };

      await expect(
        service.execute({
          mediaRef: 'media-1',
          operationId: 'op-grant-2',
          justification: 'Safe',
          actor: {
            type: 'ADMIN_HUMAN',
            actorContext: validAdminContext,
            grant: mismatchGrant
          }
        })
      ).rejects.toMatchObject({ code: 'INVALID_GRANT' });
    });

    it('rejects human admin if grant targetRef does not match mediaRef', async () => {
      const wrongTargetGrant: AdminInterventionGrant = {
        ...validGrant,
        targetRef: 'media-DIFFERENT'
      };

      await expect(
        service.execute({
          mediaRef: 'media-1',
          operationId: 'op-grant-3',
          justification: 'Safe',
          actor: {
            type: 'ADMIN_HUMAN',
            actorContext: validAdminContext,
            grant: wrongTargetGrant
          }
        })
      ).rejects.toMatchObject({ code: 'INVALID_GRANT' });
    });

    it('rejects human admin if grant is not ACTIVE or has expired', async () => {
      const revokedGrant: AdminInterventionGrant = {
        ...validGrant,
        status: 'REVOKED'
      };

      await expect(
        service.execute({
          mediaRef: 'media-1',
          operationId: 'op-grant-4',
          justification: 'Safe',
          actor: {
            type: 'ADMIN_HUMAN',
            actorContext: validAdminContext,
            grant: revokedGrant
          }
        })
      ).rejects.toMatchObject({ code: 'INVALID_GRANT' });

      const expiredGrant: AdminInterventionGrant = {
        ...validGrant,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() - 60000) // 1 minute in the past
      };

      await expect(
        service.execute({
          mediaRef: 'media-1',
          operationId: 'op-grant-5',
          justification: 'Safe',
          actor: {
            type: 'ADMIN_HUMAN',
            actorContext: validAdminContext,
            grant: expiredGrant
          }
        })
      ).rejects.toMatchObject({ code: 'INVALID_GRANT' });
    });
  });

  describe('Security Automation Route', () => {
    it('accepts authorized security automation without human admin session', async () => {
      dummyTx.query.mockImplementation(async (sql: string) => {
        if (sql.includes('media_quarantine_release_receipt')) return [];
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
        if (sql.includes('MAX(cycle_number)')) return [{ next_num: 2 }];
        if (sql.includes('media_processing_cycle')) return [];
        return [];
      });

      const service = new QuarantineReleaseService(mockTransactions as any, mockQueue as any);

      const receipt = await service.execute({
        mediaRef: 'media-1',
        operationId: 'op-auto-1',
        justification: 'Automatic scanner engine definitions refreshed; remediation applied',
        actor: {
          type: 'SECURITY_AUTOMATION',
          serviceId: 'malware-scanner-daemon',
          securityScope: 'MEDIA_SECURITY_AUTOMATION'
        }
      });

      expect(receipt.actorType).toBe('SECURITY_AUTOMATION');
      expect(receipt.actorId).toBe('malware-scanner-daemon');
      expect(receipt.previousGeneration).toBe(1n);
      expect(receipt.newGeneration).toBe(2n);
      expect(receipt.previousRevision).toBe(2n);
      expect(receipt.newRevision).toBe(3n);
      expect(receipt.wasExisting).toBe(false);

      // Verify that MEDIA_INSPECTION job was enqueued for the new generation
      expect(mockQueue.publish).toHaveBeenCalledWith(
        dummyTx,
        expect.objectContaining({
          type: 'MEDIA_INSPECTION',
          resourceRef: 'media-1',
          generation: 2n,
          priority: 1
        })
      );
    });

    it('rejects automation if serviceId or securityScope is empty', async () => {
      const service = new QuarantineReleaseService(mockTransactions as any, mockQueue as any);

      await expect(
        service.execute({
          mediaRef: 'media-1',
          operationId: 'op-auto-bad',
          justification: 'Safe',
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
        if (sql.includes('media_quarantine_release_receipt')) return [];
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

      const service = new QuarantineReleaseService(mockTransactions as any, mockQueue as any);

      await expect(
        service.execute({
          mediaRef: 'media-1',
          operationId: 'op-not-quarantined',
          justification: 'Safe',
          actor: {
            type: 'ADMIN_HUMAN',
            actorContext: validAdminContext,
            grant: validGrant
          }
        })
      ).rejects.toMatchObject({ code: 'MEDIA_NOT_QUARANTINED' });
    });

    it('returns existing receipt on compatible idempotent retry', async () => {
      const committedAt = new Date();
      dummyTx.query.mockImplementation(async (sql: string) => {
        if (sql.includes('media_quarantine_release_receipt')) {
          return [{
            operation_id: 'op-replay',
            media_ref: 'media-1',
            previous_generation: 1n,
            new_generation: 2n,
            previous_revision: 2n,
            new_revision: 3n,
            job_id: 'job-uuid-original',
            cycle_id: 'cycle-uuid-original',
            actor_type: 'ADMIN_HUMAN',
            actor_id: 'admin-principal-1',
            grant_id: 'grant-uuid-1',
            justification: 'Already approved',
            committed_at: committedAt
          }];
        }
        return [];
      });

      const service = new QuarantineReleaseService(mockTransactions as any, mockQueue as any);

      const receipt = await service.execute({
        mediaRef: 'media-1',
        operationId: 'op-replay',
        justification: 'Already approved',
        actor: {
          type: 'ADMIN_HUMAN',
          actorContext: validAdminContext,
          grant: validGrant
        }
      });

      expect(receipt.wasExisting).toBe(true);
      expect(receipt.operationId).toBe('op-replay');
      expect(receipt.newGeneration).toBe(2n);
      expect(receipt.jobId).toBe('job-uuid-original');
      expect(mockQueue.publish).not.toHaveBeenCalled();
    });

    it('throws IDEMPOTENCY_CONFLICT when same operationId has conflicting mediaRef or actor', async () => {
      dummyTx.query.mockImplementation(async (sql: string) => {
        if (sql.includes('media_quarantine_release_receipt')) {
          return [{
            operation_id: 'op-conflict',
            media_ref: 'media-DIFFERENT',
            previous_generation: 1n,
            new_generation: 2n,
            previous_revision: 2n,
            new_revision: 3n,
            job_id: 'job-uuid-original',
            cycle_id: 'cycle-uuid-original',
            actor_type: 'ADMIN_HUMAN',
            actor_id: 'admin-principal-1',
            grant_id: 'grant-uuid-1',
            justification: 'Already approved',
            committed_at: new Date()
          }];
        }
        return [];
      });

      const service = new QuarantineReleaseService(mockTransactions as any, mockQueue as any);

      await expect(
        service.execute({
          mediaRef: 'media-1', // Conflicting mediaRef
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
});
