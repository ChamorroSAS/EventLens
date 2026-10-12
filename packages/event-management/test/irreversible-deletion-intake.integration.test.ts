import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPrismaClient,
  PrismaTransactions,
  type PrismaClientInstance,
  type SqlTransaction,
  type TransactionRunner,
} from '@eventlens/database';
import {
  DeletionCoordinationError,
  IrreversibleDeletionIntakeService,
  ManualDeletionWorkflowService,
  addUtcCalendarDays,
  type DeletionRecoveryBarrierPort,
  type EventAuditRecord,
} from '../src/index.js';

class InMemoryRecoveryBarrierAuthority implements DeletionRecoveryBarrierPort {
  public currentEpoch = 1n;
  public failNextAck = false;
  private seq = 0n;

  async getRecoveryEpoch(): Promise<bigint> {
    return this.currentEpoch;
  }

  async prepareDeletionBarrier(params: {
    operationId: string;
    scopeType: string;
    scopeRef: string;
    cause: string;
    expectedRevision: bigint;
    recoveryEpoch: bigint;
  }): Promise<{ preparedReceipt: string; sequence: bigint }> {
    this.seq += 1n;
    return {
      preparedReceipt: `prep:${params.operationId}:${this.seq.toString()}`,
      sequence: this.seq,
    };
  }

  async ackDeletionBarrier(): Promise<void> {
    if (this.failNextAck) {
      this.failNextAck = false;
      throw new Error('Simulated ACK failure');
    }
  }

  async prepareCancellationBarrierRelease(params: {
    operationId: string;
    requestId: string;
  }): Promise<{ preparedReceipt: string; sequence: bigint }> {
    this.seq += 1n;
    return {
      preparedReceipt: `prep-rel:${params.operationId}:${this.seq.toString()}`,
      sequence: this.seq,
    };
  }

  async ackCancellationBarrierRelease(): Promise<void> {}
}

describe('EL-TK-194 — IrreversibleDeletionIntakeService (PostgreSQL 16 Integration)', () => {
  let db: PrismaClientInstance;
  let runner: TransactionRunner;

  beforeAll(async () => {
    db = createPrismaClient(process.env.DATABASE_URL!);
    runner = new PrismaTransactions(db, 15000);

    // Ensure media_catalog exists in test schema so serialized media row locks & Option A checks run against real SQL
    await runner.run(async (tx: SqlTransaction) => {
      await tx.execute(
        `CREATE TABLE IF NOT EXISTS media_catalog (
           media_ref TEXT PRIMARY KEY,
           event_ref TEXT NOT NULL,
           guest_ref TEXT NOT NULL DEFAULT 'guest-1',
           generation BIGINT NOT NULL DEFAULT 1,
           revision BIGINT NOT NULL DEFAULT 1,
           status TEXT NOT NULL,
           original JSONB NOT NULL DEFAULT '{}'::jsonb,
           job_id TEXT NOT NULL DEFAULT 'job-1'
         )`
      );
    });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  beforeEach(async () => {
    await runner.run(async (tx: SqlTransaction) => {
      await tx.execute('DELETE FROM deletion_access_barrier');
      await tx.execute('DELETE FROM deletion_receipt');
      await tx.execute('DELETE FROM deletion_request');
    });
  });

  async function seedOrganizerAndEvent(params: {
    organizerId: string;
    eventId: string;
    status: string;
    graceEndsAt?: Date | null;
    purgeStartedAt?: Date | null;
  }): Promise<void> {
    const now = new Date('2026-10-10T10:00:00.000Z');
    const adminId = randomUUID();
    const invitationId = randomUUID();
    const email = `org-${params.organizerId.slice(0, 8)}@eventlens.test`;

    await runner.run(async (tx: SqlTransaction) => {
      await tx.execute(
        `INSERT INTO admin_principal (
           id, identifier, status, auth_revision, provision_procedure, provisioned_by, created_at, updated_at
         ) VALUES ($1::uuid, $2, 'ACTIVE', 1, 'INITIAL_BOOTSTRAP', 'SYSTEM', $3, $3)`,
        adminId,
        `adm-${adminId.slice(0, 8)}@eventlens.internal`,
        now
      );
      await tx.execute(
        `INSERT INTO beta_invitation (
           id, email, email_normalized, token_digest, status, issued_by, created_at, expires_at
         ) VALUES ($1::uuid, $2, $3, $4, 'CONSUMED', $5::uuid, $6, $7)`,
        invitationId,
        email,
        email.toLowerCase(),
        `tok-${invitationId}`,
        adminId,
        now,
        new Date('2026-12-31T00:00:00.000Z')
      );
      await tx.execute(
        `INSERT INTO organizer_account (
           id, email, email_normalized, status, declared_adult, declared_adult_at,
           invitation_id, verified_at, created_at, updated_at
         ) VALUES ($1::uuid, $2, $3, 'ACTIVE', true, $4, $5::uuid, $4, $4, $4)`,
        params.organizerId,
        email,
        email.toLowerCase(),
        now,
        invitationId
      );
      await tx.execute(
        `INSERT INTO event (
           id, organizer_id, name, status, timezone,
           grace_ends_at, purge_started_at,
           uploads_enabled, guest_gallery_enabled,
           created_at, updated_at
         ) VALUES ($1::uuid, $2::uuid, 'Irreversible Intake Event', $3, 'UTC', $4, $5, true, true, $6, $6)`,
        params.eventId,
        params.organizerId,
        params.status,
        params.graceEndsAt ?? null,
        params.purgeStartedAt ?? null,
        now
      );
    });
  }

  async function seedMediaCatalog(params: {
    mediaRef: string;
    eventRef: string;
    generation: number;
    revision: number;
    status: string;
  }): Promise<void> {
    const jobId = randomUUID();
    const intentId = randomUUID();
    await runner.run(async (tx: SqlTransaction) => {
      await tx.execute(
        `INSERT INTO job_queue (
           id, dedup_key, fingerprint, type, handler_version, resource_ref,
           generation, queue, priority, payload, status, available_at
         ) VALUES ($1::uuid, $2, 'fp', 'MEDIA_INSPECTION', '1', $3, $4, 'q', 1, 'null'::jsonb, 'PENDING', NOW())`,
        jobId,
        `dedup-${jobId}`,
        params.mediaRef,
        params.generation
      );
      await tx.execute(
        `INSERT INTO media_acceptance_intent VALUES ($1, $2, $3, $4, '{}'::jsonb)`,
        intentId,
        params.mediaRef,
        params.generation,
        'e'.repeat(64)
      );
      await tx.execute(
        `INSERT INTO media_catalog VALUES ($1, $2, $3, 'guest-1', $4, $5, $6, '{}'::jsonb, $7::uuid)`,
        params.mediaRef,
        intentId,
        params.eventRef,
        params.generation,
        params.revision,
        params.status,
        jobId
      );
    });
  }

  it('Escenario 1: GRACE_PERIOD_EXPIRED fija purgeStartedAt=graceEndsAt sin ventana cancelable y no permite extender obligaciones anteriores', async () => {
    const organizerId = randomUUID();
    const eventId = randomUUID();
    const graceEndsAt = new Date('2026-10-12T08:00:00.000Z');
    const delayedWorkerNow = new Date('2026-10-12T14:30:00.000Z'); // 6.5h después del vencimiento

    await seedOrganizerAndEvent({
      organizerId,
      eventId,
      status: 'GRACE_PERIOD',
      graceEndsAt,
    });

    const authority = new InMemoryRecoveryBarrierAuthority();
    const auditLogs: EventAuditRecord[] = [];
    const intake = new IrreversibleDeletionIntakeService({
      runner,
      recoveryBarrierPort: authority,
      auditSink: {
        record: async (entry) => {
          auditLogs.push(entry);
        },
      },
    });
    const manualWorkflows = new ManualDeletionWorkflowService(runner, {
      recoveryBarrierPort: authority,
    });

    const result = await intake.ingestIrreversibleIntent({
      cause: 'GRACE_PERIOD_EXPIRED',
      ownerModule: 'MOD-002',
      sourceOperationId: 'grace-exp-op-1',
      producerReceiptId: 'lifecycle-rec-1',
      eventId,
      graceEndsAt,
      policyRef: 'MOD-008-GRACE-EXPIRED-V1',
      expectedRevision: 1n,
      recoveryEpoch: 1n,
      actorId: 'SYSTEM_SCHEDULER',
      now: delayedWorkerNow,
    });

    expect(result.outcome).toBe('INGESTED');
    expect(result.request.cancelUntil).toBeNull();
    expect(result.request.purgeStartedAt.toISOString()).toBe('2026-10-12T08:00:00.000Z');
    expect(result.request.mainPurgeDeadline.toISOString()).toBe('2026-10-19T08:00:00.000Z');
    expect(result.request.residualPurgeDeadline.toISOString()).toBe('2026-11-11T08:00:00.000Z');
    expect(result.barrier.barrierState).toBe('ACTIVE');
    expect(auditLogs).toHaveLength(1);

    // Barrera bloquea cualquier acceso inmediatamente
    const accessCheck = await manualWorkflows.evaluateBarrierAccess({
      scopeType: 'EVENT',
      scopeRef: eventId,
      capability: 'GUEST_GALLERY',
    });
    expect(accessCheck.allowed).toBe(false);

    // Duplicate delivery devuelve IDEMPOTENT_REPLAY con la misma ancla y request
    const replay = await intake.ingestIrreversibleIntent({
      cause: 'GRACE_PERIOD_EXPIRED',
      ownerModule: 'MOD-002',
      sourceOperationId: 'grace-exp-op-1',
      producerReceiptId: 'lifecycle-rec-1',
      eventId,
      graceEndsAt,
      policyRef: 'MOD-008-GRACE-EXPIRED-V1',
      expectedRevision: 1n,
      recoveryEpoch: 1n,
      actorId: 'SYSTEM_SCHEDULER',
      now: new Date('2026-10-12T16:00:00.000Z'),
    });
    expect(replay.outcome).toBe('IDEMPOTENT_REPLAY');
    expect(replay.request.id).toBe(result.request.id);

    // Prohibido cancelar una solicitud irreversible
    await expect(
      manualWorkflows.cancelManualEventDeletion({
        actorContext: {
          actorType: 'ORGANIZER_HUMAN',
          accountId: organizerId,
          sessionId: 'sess-1',
          credentialRevision: 1n,
          recoveryEpoch: 1n,
        },
        eventId,
        requestId: result.request.id,
        confirmation: true,
        expectedRevision: result.request.currentRevision,
        idempotencyKey: 'try-cancel-grace',
        now: delayedWorkerNow,
      })
    ).rejects.toMatchObject({
      code: 'IRREVERSIBLE_CAUSE_CANNOT_CANCEL',
    } satisfies Partial<DeletionCoordinationError>);
  });

  it('Escenario 2: PRIVACY_OWN_REMOVAL y PRIVACY_ADMIN_RESOLUTION son irreversibles con ancla de confirmación y no amplían obligaciones previas', async () => {
    const organizerId = randomUUID();
    const eventId = randomUUID();
    const mediaRef = `media-priv-${randomUUID()}`;

    await seedOrganizerAndEvent({
      organizerId,
      eventId,
      status: 'ACTIVE',
    });

    await seedMediaCatalog({
      mediaRef,
      eventRef: eventId,
      generation: 1,
      revision: 2,
      status: 'DELETED',
    });

    const authority = new InMemoryRecoveryBarrierAuthority();
    const intake = new IrreversibleDeletionIntakeService({
      runner,
      recoveryBarrierPort: authority,
    });
    const manualWorkflows = new ManualDeletionWorkflowService(runner, {
      recoveryBarrierPort: authority,
    });

    const ownRemovalConfirmedAt = new Date('2026-10-12T09:15:00.000Z');
    const ownRemovalRes = await intake.ingestIrreversibleIntent({
      cause: 'PRIVACY_OWN_REMOVAL',
      ownerModule: 'MOD-004',
      sourceOperationId: 'own-rem-1',
      producerReceiptId: 'own-rem-rec-1',
      mediaRef,
      eventId,
      removalConfirmedAt: ownRemovalConfirmedAt,
      policyRef: 'MOD-008-OWN-REMOVAL-V1',
      expectedGeneration: 1n,
      expectedRevision: 2n,
      recoveryEpoch: 1n,
      actorId: 'guest-1',
      now: new Date('2026-10-12T09:16:00.000Z'),
    });

    expect(ownRemovalRes.outcome).toBe('INGESTED');
    expect(ownRemovalRes.request.cancelUntil).toBeNull();
    expect(ownRemovalRes.request.purgeStartedAt.toISOString()).toBe('2026-10-12T09:15:00.000Z');
    expect(ownRemovalRes.request.mainPurgeDeadline.toISOString()).toBe('2026-10-19T09:15:00.000Z');
    expect(ownRemovalRes.request.residualPurgeDeadline.toISOString()).toBe('2026-11-11T09:15:00.000Z');

    // Si después se registra una resolución administrativa sobre el mismo media con fecha posterior,
    // no desplaza ni amplía la obligación anterior más temprana (09:15 UTC)
    const adminResolutionAt = new Date('2026-10-13T11:00:00.000Z');
    const adminRes = await intake.ingestIrreversibleIntent({
      cause: 'PRIVACY_ADMIN_RESOLUTION',
      ownerModule: 'MOD-004',
      sourceOperationId: 'admin-priv-res-1',
      producerReceiptId: 'admin-priv-rec-1',
      mediaRef,
      eventId,
      removalConfirmedAt: adminResolutionAt,
      policyRef: 'MOD-008-PRIVACY-CASE-V1',
      expectedGeneration: 1n,
      expectedRevision: 2n,
      recoveryEpoch: 1n,
      actorId: 'admin-1',
      now: new Date('2026-10-13T11:05:00.000Z'),
    });

    expect(adminRes.outcome).toBe('INGESTED');
    expect(adminRes.effectivePurgeStartedAt.toISOString()).toBe('2026-10-12T09:15:00.000Z');
    expect(adminRes.effectiveMainPurgeDeadline.toISOString()).toBe('2026-10-19T09:15:00.000Z');
    expect(adminRes.effectiveResidualPurgeDeadline.toISOString()).toBe('2026-11-11T09:15:00.000Z');

    // Intento de la misma causa con fecha posterior intentando extender obligación es rechazado
    await expect(
      intake.ingestIrreversibleIntent({
        cause: 'PRIVACY_OWN_REMOVAL',
        ownerModule: 'MOD-004',
        sourceOperationId: 'own-rem-extend-attempt',
        producerReceiptId: 'own-rem-rec-2',
        mediaRef,
        eventId,
        removalConfirmedAt: new Date('2026-10-14T00:00:00.000Z'),
        policyRef: 'MOD-008-OWN-REMOVAL-V1',
        expectedGeneration: 1n,
        expectedRevision: 2n,
        recoveryEpoch: 1n,
        actorId: 'guest-1',
        now: new Date('2026-10-14T00:05:00.000Z'),
      })
    ).rejects.toMatchObject({
      code: 'OBLIGATION_EXTENSION_FORBIDDEN',
    } satisfies Partial<DeletionCoordinationError>);

    // Barrera activa sobre MEDIA impide cualquier acceso o restauración
    const mediaAccess = await manualWorkflows.evaluateBarrierAccess({
      scopeType: 'MEDIA',
      scopeRef: mediaRef,
      capability: 'ORGANIZER_MUTATION',
    });
    expect(mediaAccess.allowed).toBe(false);
  });

  it('Escenario 3 (Papelera): conserva restoreDeadline como ancla (+7/+30) y serializa carrera restauración vs expiración', async () => {
    const organizerId = randomUUID();
    const eventId = randomUUID();
    const mediaExpiredRef = `media-trash-exp-${randomUUID()}`;
    const mediaRestoredRef = `media-trash-rest-${randomUUID()}`;

    await seedOrganizerAndEvent({
      organizerId,
      eventId,
      status: 'ACTIVE',
    });

    await seedMediaCatalog({
      mediaRef: mediaExpiredRef,
      eventRef: eventId,
      generation: 1,
      revision: 3,
      status: 'DELETED',
    });
    await seedMediaCatalog({
      mediaRef: mediaRestoredRef,
      eventRef: eventId,
      generation: 1,
      revision: 4,
      status: 'PUBLISHED',
    });

    const authority = new InMemoryRecoveryBarrierAuthority();
    const intake = new IrreversibleDeletionIntakeService({
      runner,
      recoveryBarrierPort: authority,
    });

    const restoreDeadline = new Date('2026-10-12T10:00:00.000Z');

    // 1. Si el worker intenta ingresar antes de restoreDeadline, se rechaza por CLOCK_CONTRADICTION
    await expect(
      intake.ingestIrreversibleIntent({
        cause: 'TRASH_RETENTION_EXPIRED',
        ownerModule: 'MOD-004',
        sourceOperationId: 'trash-early-1',
        producerReceiptId: 'tr-rec-early',
        mediaRef: mediaExpiredRef,
        eventId,
        trashRecordId: 'trash-1',
        restoreDeadline,
        policyRef: 'MOD-008/ARCH-019',
        expectedGeneration: 1n,
        expectedRevision: 3n,
        recoveryEpoch: 1n,
        actorId: 'SYSTEM_SCHEDULER',
        now: new Date('2026-10-12T09:59:59.999Z'),
      })
    ).rejects.toMatchObject({
      code: 'CLOCK_CONTRADICTION',
    } satisfies Partial<DeletionCoordinationError>);

    // 2. En o después de restoreDeadline, se ingresa con purgeStartedAt = restoreDeadline exacto
    const expRes = await intake.ingestIrreversibleIntent({
      cause: 'TRASH_RETENTION_EXPIRED',
      ownerModule: 'MOD-004',
      sourceOperationId: 'trash-exp-ok-1',
      producerReceiptId: 'tr-rec-ok-1',
      mediaRef: mediaExpiredRef,
      eventId,
      trashRecordId: 'trash-1',
      restoreDeadline,
      policyRef: 'MOD-008/ARCH-019',
      expectedGeneration: 1n,
      expectedRevision: 3n,
      recoveryEpoch: 1n,
      actorId: 'SYSTEM_SCHEDULER',
      now: new Date('2026-10-12T12:45:00.000Z'), // scheduler demorado 2h45m
    });

    expect(expRes.outcome).toBe('INGESTED');
    expect(expRes.request.purgeStartedAt.toISOString()).toBe('2026-10-12T10:00:00.000Z');
    expect(expRes.request.mainPurgeDeadline.toISOString()).toBe(
      addUtcCalendarDays(restoreDeadline, 7).toISOString()
    );
    expect(expRes.request.residualPurgeDeadline.toISOString()).toBe(
      addUtcCalendarDays(restoreDeadline, 30).toISOString()
    );

    // 3. Carrera restauración vs expiración: si la media fue restaurada antes del deadline (status=PUBLISHED),
    // un intent atrasado del productor es rechazado por REVISION_CONFLICT sin purgar la media restaurada
    await expect(
      intake.ingestIrreversibleIntent({
        cause: 'TRASH_RETENTION_EXPIRED',
        ownerModule: 'MOD-004',
        sourceOperationId: 'trash-stale-producer-1',
        producerReceiptId: 'tr-rec-stale-1',
        mediaRef: mediaRestoredRef,
        eventId,
        trashRecordId: 'trash-2',
        restoreDeadline,
        policyRef: 'MOD-008/ARCH-019',
        expectedGeneration: 1n,
        expectedRevision: 3n,
        recoveryEpoch: 1n,
        actorId: 'SYSTEM_SCHEDULER',
        now: new Date('2026-10-12T10:00:01.000Z'),
      })
    ).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
    } satisfies Partial<DeletionCoordinationError>);
  });

  it('Escenario 3 (Cuarentena Opción A, recibo UNKNOWN y registros históricos 042): conserva dispositionConfirmedAt, mantiene QUARANTINED en BD y reconcilia legacy sin reabrir', async () => {
    const organizerId = randomUUID();
    const eventId = randomUUID();
    const mediaQuarantinedRef = `media-quar-${randomUUID()}`;
    const mediaUnknownAckRef = `media-quar-unk-${randomUUID()}`;
    const mediaLegacy042Ref = `media-legacy-042-${randomUUID()}`;

    await seedOrganizerAndEvent({
      organizerId,
      eventId,
      status: 'ACTIVE',
    });

    await seedMediaCatalog({
      mediaRef: mediaQuarantinedRef,
      eventRef: eventId,
      generation: 1,
      revision: 2,
      status: 'QUARANTINED',
    });
    await seedMediaCatalog({
      mediaRef: mediaUnknownAckRef,
      eventRef: eventId,
      generation: 1,
      revision: 2,
      status: 'QUARANTINED',
    });
    await seedMediaCatalog({
      mediaRef: mediaLegacy042Ref,
      eventRef: eventId,
      generation: 1,
      revision: 5,
      status: 'DELETED',
    });

    const authority = new InMemoryRecoveryBarrierAuthority();
    const intake = new IrreversibleDeletionIntakeService({
      runner,
      recoveryBarrierPort: authority,
    });
    const manualWorkflows = new ManualDeletionWorkflowService(runner, {
      recoveryBarrierPort: authority,
    });

    const dispositionConfirmedAt = new Date('2026-10-12T11:20:30.000Z');
    const dispRes = await intake.ingestIrreversibleIntent({
      cause: 'QUARANTINE_DISPOSITION',
      ownerModule: 'MOD-003',
      sourceOperationId: 'quar-disp-1',
      producerReceiptId: 'quar-rec-1',
      mediaRef: mediaQuarantinedRef,
      eventId,
      purgeIntentId: randomUUID(),
      dispositionConfirmedAt,
      dispositionActorRole: 'ADMIN_HUMAN',
      policyRef: 'MOD-008-TRASH-QUARANTINE-PURGE-POLICY-V1',
      expectedGeneration: 1n,
      expectedRevision: 2n,
      recoveryEpoch: 1n,
      actorId: 'admin-sec-1',
      now: new Date('2026-10-12T11:21:00.000Z'),
    });

    expect(dispRes.outcome).toBe('INGESTED');
    expect(dispRes.request.purgeStartedAt.toISOString()).toBe('2026-10-12T11:20:30.000Z');
    expect(dispRes.request.mainPurgeDeadline.toISOString()).toBe('2026-10-19T11:20:30.000Z');
    expect(dispRes.request.residualPurgeDeadline.toISOString()).toBe('2026-11-11T11:20:30.000Z');

    // Verificar Opción A: media_catalog sigue en QUARANTINED hasta que se verifique la purga física,
    // pero la barrera de acceso bloquea cualquier intento de liberación o acceso
    const dbMediaRows = await runner.run((tx) =>
      tx.query<{ status: string }>(
        `SELECT status FROM media_catalog WHERE media_ref = $1`,
        mediaQuarantinedRef
      )
    );
    expect(dbMediaRows[0].status).toBe('QUARANTINED');

    const quarBarrierCheck = await manualWorkflows.evaluateBarrierAccess({
      scopeType: 'MEDIA',
      scopeRef: mediaQuarantinedRef,
      capability: 'ORGANIZER_MUTATION',
    });
    expect(quarBarrierCheck.allowed).toBe(false);

    // Productor con recibo UNKNOWN falla cerrado en estado UNKNOWN sin levantar barrera
    const unknownRes = await intake.ingestIrreversibleIntent({
      cause: 'QUARANTINE_DISPOSITION',
      ownerModule: 'MOD-003',
      sourceOperationId: 'quar-disp-unknown-1',
      producerReceiptId: 'quar-rec-unk-1',
      producerReceiptStatus: 'UNKNOWN',
      mediaRef: mediaUnknownAckRef,
      eventId,
      purgeIntentId: randomUUID(),
      dispositionConfirmedAt,
      dispositionActorRole: 'SECURITY_AUTOMATION',
      policyRef: 'MOD-008-TRASH-QUARANTINE-PURGE-POLICY-V1',
      expectedGeneration: 1n,
      expectedRevision: 2n,
      recoveryEpoch: 1n,
      actorId: 'sec-bot-1',
      now: new Date('2026-10-12T11:22:00.000Z'),
    });
    expect(unknownRes.outcome).toBe('OUTCOME_UNKNOWN');
    expect(unknownRes.request.status).toBe('UNKNOWN');
    expect(unknownRes.barrier.barrierState).toBe('UNKNOWN');

    // Registro histórico DELETED con sólo recibo de 042: mantiene restricción, no se reabre a QUARANTINED
    // ni se cuenta como purga completada
    const legacyRes = await intake.reconcileLegacyQuarantineRecord({
      mediaRef: mediaLegacy042Ref,
      eventId,
      legacyOperationId: 'legacy-042-op-99',
      legacyCommittedAt: new Date('2026-09-01T10:00:00.000Z'),
      expectedGeneration: 1n,
      expectedRevision: 5n,
      recoveryEpoch: 1n,
    });

    expect(legacyRes.isLegacyDeletedWithoutPhysicalProof).toBe(true);
    expect(legacyRes.reopenedToQuarantined).toBe(false);
    expect(legacyRes.countedAsPhysicallyPurged).toBe(false);
    expect(legacyRes.accessRestrictedByBarrier).toBe(true);
    expect(legacyRes.request.status).toBe('UNKNOWN');
  });
});
