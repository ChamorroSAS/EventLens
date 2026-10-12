import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions, type PrismaClientInstance } from '@eventlens/database';
import {
  DeletionCoordinationService,
  PostgresDeletionCoordinationRepository,
  type DeletionTelemetryMetric,
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration(
  'EL-TK-188: Contrato canónico de solicitudes e intenciones de eliminación (PostgreSQL 16 Integration)',
  () => {
    let prisma: PrismaClientInstance;
    let transactions: PrismaTransactions;
    let repository: PostgresDeletionCoordinationRepository;
    let service: DeletionCoordinationService;
    let metrics: DeletionTelemetryMetric[];

    beforeAll(async () => {
      prisma = createPrismaClient(databaseUrl!);
      transactions = new PrismaTransactions(prisma, 10000);
      repository = new PostgresDeletionCoordinationRepository();
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    beforeEach(() => {
      metrics = [];
      service = new DeletionCoordinationService(transactions, repository, {
        recordDeletionMetric(metric) {
          metrics.push(metric);
        },
      });
    });

    it('persiste todas las causas válidas en PostgreSQL 16 respetando restricciones DDL y plazos UTC (+7 / +30)', async () => {
      const eventId = randomUUID();
      const accountId = randomUUID();
      const mediaId = randomUUID();
      const anchor = new Date('2026-10-12T14:20:30.500Z');

      // 1. Manual Event Deletion (72h window)
      const manualEventRes = await service.registerDeletionIntent({
        sourceOperationId: `op-pg-ev-${randomUUID()}`,
        cause: 'MANUAL_EVENT_DELETION',
        scopeType: 'EVENT',
        scopeRef: eventId,
        ownerModule: 'MOD-002',
        policyRef: 'MOD-008-MANUAL-EVENT-V1',
        anchorTimestamp: anchor,
        actorId: 'organizer-pg-1',
        relatedResources: [{ resourceType: 'EVENT', resourceRef: eventId }],
      });

      expect(manualEventRes.outcome).toBe('REGISTERED');
      expect(manualEventRes.request.cancelUntil?.toISOString()).toBe('2026-10-15T14:20:30.500Z');
      expect(manualEventRes.request.purgeStartedAt.toISOString()).toBe('2026-10-15T14:20:30.500Z');
      expect(manualEventRes.request.mainPurgeDeadline.toISOString()).toBe('2026-10-22T14:20:30.500Z');
      expect(manualEventRes.request.residualPurgeDeadline.toISOString()).toBe('2026-11-14T14:20:30.500Z');

      // 2. Manual Account Deletion (7d window)
      const manualAccRes = await service.registerDeletionIntent({
        sourceOperationId: `op-pg-acc-${randomUUID()}`,
        cause: 'MANUAL_ACCOUNT_DELETION',
        scopeType: 'ACCOUNT',
        scopeRef: accountId,
        ownerModule: 'MOD-001',
        policyRef: 'MOD-008-MANUAL-ACCOUNT-V1',
        anchorTimestamp: anchor,
        actorId: 'organizer-pg-1',
      });

      expect(manualAccRes.request.cancelUntil?.toISOString()).toBe('2026-10-19T14:20:30.500Z');
      expect(manualAccRes.request.mainPurgeDeadline.toISOString()).toBe('2026-10-26T14:20:30.500Z');
      expect(manualAccRes.request.residualPurgeDeadline.toISOString()).toBe('2026-11-18T14:20:30.500Z');

      // 3. Irreversible Quarantine Disposition (no cancel window)
      const quarRes = await service.registerDeletionIntent({
        sourceOperationId: `op-pg-quar-${randomUUID()}`,
        cause: 'QUARANTINE_DISPOSITION',
        scopeType: 'MEDIA',
        scopeRef: mediaId,
        ownerModule: 'MOD-003',
        policyRef: 'MOD-008-TRASH-QUARANTINE-PURGE-POLICY-V1',
        anchorTimestamp: anchor,
        actorId: 'admin-sec-1',
      });

      expect(quarRes.request.cancelUntil).toBeNull();
      expect(quarRes.request.purgeStartedAt.toISOString()).toBe('2026-10-12T14:20:30.500Z');
      expect(quarRes.request.mainPurgeDeadline.toISOString()).toBe('2026-10-19T14:20:30.500Z');
      expect(quarRes.request.residualPurgeDeadline.toISOString()).toBe('2026-11-11T14:20:30.500Z');
    });

    it('garantiza idempotencia en PostgreSQL ante replay y rechaza conflicto de payload sin corromper el registro original', async () => {
      const mediaRef = `media-pg-${randomUUID()}`;
      const sourceOpId = `op-pg-idemp-${randomUUID()}`;
      const anchor = new Date('2026-10-12T18:00:00.000Z');

      const first = await service.registerDeletionIntent({
        sourceOperationId: sourceOpId,
        cause: 'PRIVACY_OWN_REMOVAL',
        scopeType: 'MEDIA',
        scopeRef: mediaRef,
        ownerModule: 'MOD-004',
        policyRef: 'PRIVACY_OWN_REMOVAL',
        anchorTimestamp: anchor,
        actorId: 'guest-pg-1',
      });

      const replay = await service.registerDeletionIntent({
        sourceOperationId: sourceOpId,
        cause: 'PRIVACY_OWN_REMOVAL',
        scopeType: 'MEDIA',
        scopeRef: mediaRef,
        ownerModule: 'MOD-004',
        policyRef: 'PRIVACY_OWN_REMOVAL',
        anchorTimestamp: anchor,
        actorId: 'guest-pg-1',
      });

      expect(replay.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(replay.request.id).toBe(first.request.id);

      // Conflicto de payload con misma clave
      await expect(
        service.registerDeletionIntent({
          sourceOperationId: sourceOpId,
          cause: 'PRIVACY_OWN_REMOVAL',
          scopeType: 'MEDIA',
          scopeRef: mediaRef,
          ownerModule: 'MOD-004',
          policyRef: 'PRIVACY_OWN_REMOVAL_ALTERED',
          anchorTimestamp: anchor,
          actorId: 'guest-pg-1',
        })
      ).rejects.toMatchObject({
        code: 'DELETION_INTENT_PAYLOAD_CONFLICT',
      });

      // Verificar en DB que sigue existiendo exactamente 1 fila y 1 recibo
      const projection = await service.getDeletionProjection({
        requestId: first.request.id,
      });
      expect(projection).not.toBeNull();
      expect(projection!.policyRef).toBe('PRIVACY_OWN_REMOVAL');
      expect(projection!.receipts.length).toBe(1);
    });

    it('ejecuta flujo completo PREPARED -> UNKNOWN -> RECONCILED -> CONFIRMED con CAS y recibos en PostgreSQL', async () => {
      const eventId = randomUUID();
      const anchor = new Date('2026-10-12T09:00:00.000Z');

      const prepared = await service.registerDeletionIntent({
        sourceOperationId: `op-pg-prep-${randomUUID()}`,
        cause: 'GRACE_PERIOD_EXPIRED',
        scopeType: 'EVENT',
        scopeRef: eventId,
        ownerModule: 'MOD-002',
        expectedRevision: 1n,
        recoveryEpoch: 2n,
        policyRef: 'MOD-008-GRACE-EXPIRED-V1',
        anchorTimestamp: anchor,
        initialStatus: 'PREPARED',
        actorId: 'lifecycle-scheduler',
      });

      expect(prepared.request.status).toBe('PREPARED');

      // Falla si se intenta confirmar con epoch obsoleto
      await expect(
        service.confirmPreparedRequest({
          requestId: prepared.request.id,
          expectedRevision: 1n,
          recoveryEpoch: 1n, // menor que 2n
          actorId: 'lifecycle-scheduler',
          sourceOperationId: 'op-confirm-stale-epoch',
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED_EPOCH',
      });

      // Se marca UNKNOWN ante timeout de ACK
      const unknown = await service.markRequestUnknown({
        requestId: prepared.request.id,
        expectedRevision: 1n,
        recoveryEpoch: 2n,
        actorId: 'watchdog',
        sourceOperationId: 'op-mark-unknown',
        reason: 'Timeout waiting for external journal ACK',
      });
      expect(unknown.status).toBe('UNKNOWN');
      expect(unknown.currentRevision).toBe(2n);

      // Reconciliación confirma conservando ancla original intacta
      const reconciled = await service.reconcileUnknownRequest({
        requestId: prepared.request.id,
        targetStatus: 'CONFIRMED',
        expectedRevision: 2n,
        recoveryEpoch: 2n,
        actorId: 'recovery-reconciler',
        sourceOperationId: 'op-reconcile-ok',
        resolutionNotes: 'Verified journal entry committed in RecoveryAuthority',
      });
      expect(reconciled.status).toBe('CONFIRMED');
      expect(reconciled.currentRevision).toBe(3n);

      const projection = await service.getDeletionProjection({
        scopeType: 'EVENT',
        scopeRef: eventId,
      });
      expect(projection).not.toBeNull();
      expect(projection!.status).toBe('CONFIRMED');
      expect(projection!.isCancellable).toBe(false); // GRACE_PERIOD_EXPIRED no es cancelable
      expect(projection!.anchorTimestamp).toBe('2026-10-12T09:00:00.000Z');
      expect(projection!.receipts.length).toBe(3);
    });
  }
);
