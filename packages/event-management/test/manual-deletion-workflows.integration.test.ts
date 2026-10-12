import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createPrismaClient,
  PrismaTransactions,
  type PrismaClientInstance,
} from '@eventlens/database';
import {
  AccountReauthenticationService,
  PasswordVerifier,
  type OrganizerActorContext,
  type AdminActorContext,
  type AuditSink,
  type RecoveryAuthorityPort,
} from '@eventlens/identity';
import {
  ManualDeletionWorkflowService,
  EventDraftService,
  computeCanonicalAccountDeletionIntentionHash,
  type DeletionRecoveryBarrierPort,
  type AdminCancellationGrantPort,
  type ExportDeletionBarrierPort,
  type DeletionNotificationPort,
  type BarrierObservabilityMetric,
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration(
  'EL-TK-189..193: Solicitudes y cancelaciones manuales de evento/cuenta y propagación de barreras (PostgreSQL 16 Integration)',
  () => {
    let prisma: PrismaClientInstance;
    let transactions: PrismaTransactions;
    let passwordVerifier: PasswordVerifier;
    let reauthService: AccountReauthenticationService;
    let draftService: EventDraftService;
    let metrics: BarrierObservabilityMetric[];

    let currentEpoch: bigint;
    let failNextPrepare: boolean;
    let failNextAck: boolean;
    let failNextNotification: boolean;
    const credentialRevisions = new Map<string, bigint>();
    const activeAdminGrants = new Map<string, {
      grantId: string;
      granteePrincipalId: string;
      operation: 'CANCEL_EVENT_DELETION' | 'CANCEL_ACCOUNT_DELETION';
      resourceType: 'EVENT' | 'ACCOUNT';
      resourceRef: string;
      requestId: string;
      status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
      expiresAt: Date;
    }>();

    let recoveryBarrierPort: DeletionRecoveryBarrierPort;
    let identityRecoveryAuthority: RecoveryAuthorityPort;
    let adminGrantPort: AdminCancellationGrantPort;
    let exportBarrierPort: ExportDeletionBarrierPort;
    let notificationPort: DeletionNotificationPort;
    let workflowService: ManualDeletionWorkflowService;

    beforeAll(async () => {
      prisma = createPrismaClient(databaseUrl!);
      transactions = new PrismaTransactions(prisma, 15000);
      passwordVerifier = new PasswordVerifier();
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    beforeEach(() => {
      currentEpoch = 1n;
      failNextPrepare = false;
      failNextAck = false;
      failNextNotification = false;
      metrics = [];
      credentialRevisions.clear();
      activeAdminGrants.clear();

      const auditSink: AuditSink = {
        async record() {},
      };

      identityRecoveryAuthority = {
        async getRecoveryEpoch() {
          return currentEpoch;
        },
        async getCredentialRevision(principalId: string) {
          return credentialRevisions.get(principalId) ?? 1n;
        },
        async getAdminAuthWatermark() {
          return 1n;
        },
      };

      reauthService = new AccountReauthenticationService(
        transactions,
        auditSink,
        identityRecoveryAuthority
      );

      draftService = new EventDraftService(transactions);

      recoveryBarrierPort = {
        async getRecoveryEpoch() {
          return currentEpoch;
        },
        async prepareDeletionBarrier() {
          if (failNextPrepare) {
            failNextPrepare = false;
            throw new Error('Simulated PREPARE outage');
          }
          return { preparedReceipt: `prep-${randomUUID()}`, sequence: 10n };
        },
        async ackDeletionBarrier() {
          if (failNextAck) {
            failNextAck = false;
            throw new Error('Simulated ACK timeout');
          }
        },
        async prepareCancellationBarrierRelease() {
          if (failNextPrepare) {
            failNextPrepare = false;
            throw new Error('Simulated cancel PREPARE outage');
          }
          return { preparedReceipt: `prep-cancel-${randomUUID()}`, sequence: 11n };
        },
        async ackCancellationBarrierRelease() {
          if (failNextAck) {
            failNextAck = false;
            throw new Error('Simulated cancel ACK timeout');
          }
        },
      };

      adminGrantPort = {
        async verifyActiveGrant(params) {
          const key = `${params.principalId}:${params.operation}:${params.resourceType}:${params.resourceRef}:${params.requestId}`;
          return activeAdminGrants.get(key) ?? null;
        },
      };

      exportBarrierPort = {
        async invalidateExportsForScope(params) {
          return {
            invalidatedExportsCount: params.targetEventIds.length,
            partsInventory: params.targetEventIds.map((evId, idx) => ({
              exportId: `exp-${evId}`,
              objectKey: `exports/${evId}/part-${idx + 1}.zip`,
              versionId: `v-${idx + 1}`,
              partKind: 'ZIP_PART' as const,
            })),
          };
        },
      };

      notificationPort = {
        async notifyAccountDeletionRequested() {
          if (failNextNotification) {
            failNextNotification = false;
            throw new Error('SMTP connection refused');
          }
        },
        async notifyAccountDeletionCancelled() {
          if (failNextNotification) {
            failNextNotification = false;
            throw new Error('SMTP connection refused');
          }
        },
      };

      workflowService = new ManualDeletionWorkflowService(transactions, {
        recoveryBarrierPort,
        reauthenticationPort: reauthService,
        adminGrantPort,
        exportBarrierPort,
        notificationPort,
        observabilitySink: {
          recordBarrierMetric(m) {
            metrics.push(m);
          },
        },
      });
    });

    async function seedOrganizerWithCredential(password = 'CorrectHorseBatteryStaple!99') {
      const adminId = randomUUID();
      const accountId = randomUUID();
      const invitationId = randomUUID();
      const sessionId = randomUUID();
      const email = `org-${accountId.slice(0, 8)}@example.com`;
      const secretDigest = await passwordVerifier.hashPassword(password);
      credentialRevisions.set(accountId, 1n);

      await transactions.run(async (tx) => {
        await tx.execute(
          `INSERT INTO admin_principal (
             id, identifier, status, auth_revision, provision_procedure, provisioned_by, created_at, updated_at
           ) VALUES ($1::uuid, $2, 'ACTIVE', 1, 'INITIAL_BOOTSTRAP', 'SYSTEM', NOW(), NOW())`,
          adminId,
          `adm-${adminId.slice(0, 8)}@eventlens.internal`
        );

        await tx.execute(
          `INSERT INTO beta_invitation (
             id, email, email_normalized, token_digest, status, issued_by, created_at, expires_at
           ) VALUES ($1::uuid, $2, $3, $4, 'CONSUMED', $5::uuid, NOW(), NOW() + INTERVAL '7 days')`,
          invitationId,
          email,
          email.toLowerCase(),
          `inv-td-${invitationId}`,
          adminId
        );

        await tx.execute(
          `INSERT INTO organizer_account (
             id, email, email_normalized, status, declared_adult, declared_adult_at,
             invitation_id, verified_at, created_at, updated_at
           ) VALUES ($1::uuid, $2, $3, 'ACTIVE', true, NOW(), $4::uuid, NOW(), NOW(), NOW())`,
          accountId,
          email,
          email.toLowerCase(),
          invitationId
        );

        await tx.execute(
          `INSERT INTO organizer_credential (
             id, account_id, purpose, secret_digest, revision, status, created_at, updated_at
           ) VALUES ($1::uuid, $2::uuid, 'ORGANIZER_AUTHENTICATION', $3, 1, 'ACTIVE', NOW(), NOW())`,
          randomUUID(),
          accountId,
          secretDigest
        );

        await tx.execute(
          `INSERT INTO organizer_session (
             id, account_id, token_digest, csrf_token_digest, auth_time,
             created_at, expires_at, last_active_at, idle_expires_at, session_watermark
           ) VALUES ($1::uuid, $2::uuid, $3, $4, NOW(), NOW(), NOW() + INTERVAL '8 hours', NOW(), NOW() + INTERVAL '30 minutes', 1)`,
          sessionId,
          accountId,
          `sess-td-${sessionId}`,
          `csrf-td-${sessionId}`
        );
      });

      const actorContext: OrganizerActorContext = {
        actorType: 'ORGANIZER_HUMAN',
        accountId,
        email,
        sessionId,
        authTime: new Date('2026-10-12T10:00:00.000Z'),
        credentialRevision: 1n,
        sessionWatermark: 1n,
        recoveryEpoch: 1n,
      };

      return { accountId, sessionId, email, password, actorContext };
    }

    async function seedEventForOrganizer(params: {
      organizerId: string;
      status?: string;
      previousStatus?: string | null;
      closedAt?: Date | null;
      suspendedAt?: Date | null;
      suspensionReason?: string | null;
      expiresAt?: Date | null;
      graceEndsAt?: Date | null;
      purgeStartedAt?: Date | null;
      withActiveGuestAndUpload?: boolean;
    }) {
      const eventId = randomUUID();
      const guestSessionId = randomUUID();
      const now = new Date('2026-10-12T10:00:00.000Z');

      await transactions.run(async (tx) => {
        await tx.execute(
          `INSERT INTO event (
             id, organizer_id, name, status, timezone,
             scheduled_at, activated_at, closed_at,
             expires_at, grace_ends_at, purge_started_at,
             suspended_at, suspension_reason, previous_status,
             uploads_enabled, guest_gallery_enabled,
             created_at, updated_at
           ) VALUES (
             $1::uuid, $2::uuid, $3, $4, 'America/Bogota',
             $5, $5, $6,
             $7, $8, $9,
             $10, $11, $12,
             true, true,
             $5, $5
           )`,
          eventId,
          params.organizerId,
          `Event ${eventId.slice(0, 6)}`,
          params.status ?? 'ACTIVE',
          now,
          params.closedAt ?? null,
          params.expiresAt ?? new Date('2026-10-25T10:00:00.000Z'),
          params.graceEndsAt ?? new Date('2026-11-15T10:00:00.000Z'),
          params.purgeStartedAt ?? null,
          params.suspendedAt ?? null,
          params.suspensionReason ?? null,
          params.previousStatus ?? null
        );

        if (params.withActiveGuestAndUpload) {
          await tx.execute(
            `INSERT INTO public_access_credential (
               id, event_id, lookup_key, token_hash, generation, pin_required, created_at
             ) VALUES ($1::uuid, $2::uuid, $3, $4, 1, false, $5)`,
            randomUUID(),
            eventId,
            `lk-${eventId.slice(0, 8)}`,
            `th-${eventId}`,
            now
          );

          await tx.execute(
            `INSERT INTO guest_session (
               id, event_id, token_hash, credential_generation, created_at, expires_at
             ) VALUES ($1::uuid, $2::uuid, $3, 1, $4, $5)`,
            guestSessionId,
            eventId,
            `gst-${guestSessionId}`,
            now,
            new Date('2026-10-13T10:00:00.000Z')
          );

          await tx.execute(
            `INSERT INTO upload_attempt (
               id, event_id, guest_session_id, reservation_id, idempotency_key,
               declared_size, declared_type, contributor_nickname, status,
               created_at, expires_at, updated_at
             ) VALUES (
               $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5,
               102400, 'image/jpeg', 'Invitado 1', 'AUTHORIZED',
               $6, $7, $6
             )`,
            randomUUID(),
            eventId,
            guestSessionId,
            randomUUID(),
            `up-idem-${eventId}`,
            now,
            new Date('2026-10-12T10:30:00.000Z')
          );
        }
      });

      return { eventId, guestSessionId };
    }

    it('EL-TK-189 & EL-TK-193: solicita eliminación manual de evento (72h), revoca accesos/sesiones, invalida exports y vigila writers en vuelo', async () => {
      const org = await seedOrganizerWithCredential();
      const otherOrg = await seedOrganizerWithCredential();
      const { eventId } = await seedEventForOrganizer({
        organizerId: org.accountId,
        status: 'ACTIVE',
        withActiveGuestAndUpload: true,
      });

      const clickNow = new Date('2026-10-12T12:00:00.000Z');

      // Escenario 3: Organizador ajeno no puede solicitar ni enumerar el evento
      await expect(
        workflowService.requestManualEventDeletion({
          actorContext: otherOrg.actorContext,
          eventId,
          confirmation: true,
          expectedRevision: 1n,
          idempotencyKey: `op-foreign-${randomUUID()}`,
          now: clickNow,
        })
      ).rejects.toMatchObject({
        code: 'REQUEST_NOT_FOUND',
      });

      // Escenario 1: Organizador dueño solicita eliminación manual con ventana fija de 72h
      const idempKey = `op-ev-del-${randomUUID()}`;
      const res = await workflowService.requestManualEventDeletion({
        actorContext: org.actorContext,
        eventId,
        confirmation: true,
        expectedRevision: 1n,
        idempotencyKey: idempKey,
        now: clickNow,
      });

      expect(res.outcome).toBe('REQUESTED');
      expect(res.eventStatus).toBe('PENDING_DELETION');
      expect(res.cancelUntil.toISOString()).toBe('2026-10-15T12:00:00.000Z'); // +72h exactas
      expect(res.purgeStartedAt.toISOString()).toBe('2026-10-15T12:00:00.000Z'); // ancla física al vencer ventana, no al clic
      expect(res.request.mainPurgeDeadline.toISOString()).toBe('2026-10-22T12:00:00.000Z'); // +7d UTC
      expect(res.request.residualPurgeDeadline.toISOString()).toBe('2026-11-14T12:00:00.000Z'); // +30d UTC

      // Escenario 2: Replay idempotente devuelve el mismo request y la misma ancla
      const replay = await workflowService.requestManualEventDeletion({
        actorContext: org.actorContext,
        eventId,
        confirmation: true,
        expectedRevision: 1n,
        idempotencyKey: idempKey,
        now: new Date('2026-10-12T12:05:00.000Z'),
      });
      expect(replay.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(replay.request.id).toBe(res.request.id);
      expect(replay.cancelUntil.toISOString()).toBe('2026-10-15T12:00:00.000Z');

      // EL-TK-193: Verificar propagación de barrera, revocación de grants, vigilancia de writer en vuelo e inventario de exportaciones
      const snapshot = await workflowService.getResourceBarrierSnapshot({
        targetScopeType: 'EVENT',
        targetScopeRef: eventId,
      });
      expect(snapshot.isBlocked).toBe(true);
      expect(snapshot.totalInFlightWritersWatched).toBe(1);
      expect(snapshot.totalRevokedGrants).toBe(2); // 1 guest_session + 1 public_access_credential
      expect(snapshot.totalInvalidatedExports).toBe(1);
      expect(snapshot.consolidatedExportPartsInventory).toHaveLength(1);
      expect(snapshot.consolidatedExportPartsInventory[0].objectKey).toContain(eventId);

      // EL-TK-193: Accesos públicos, subidas y nuevos grants quedan denegados
      const uploadDecision = await workflowService.evaluateBarrierAccess({
        eventId,
        action: 'GUEST_UPLOAD',
      });
      expect(uploadDecision.allowed).toBe(false);
      expect(uploadDecision.code).toBe('BLOCKED_BY_EVENT_DELETION_BARRIER');

      const exportDecision = await workflowService.evaluateBarrierAccess({
        eventId,
        action: 'ISSUE_EXPORT_GRANT',
        actorContext: org.actorContext,
      });
      expect(exportDecision.allowed).toBe(false);

      // Solo consultar estado de eliminación y cancelar están permitidos para el organizador dueño
      const statusViewDecision = await workflowService.evaluateBarrierAccess({
        eventId,
        action: 'ORGANIZER_VIEW_DELETION_STATUS',
        actorContext: org.actorContext,
      });
      expect(statusViewDecision.allowed).toBe(true);

      // Regla de negocio EL-TK-189: No dar ventana nueva de 72h después de vencida la gracia
      const expiredGraceEvent = await seedEventForOrganizer({
        organizerId: org.accountId,
        status: 'GRACE_PERIOD',
        graceEndsAt: new Date('2026-10-12T11:00:00.000Z'),
      });
      await expect(
        workflowService.requestManualEventDeletion({
          actorContext: org.actorContext,
          eventId: expiredGraceEvent.eventId,
          confirmation: true,
          expectedRevision: 1n,
          idempotencyKey: `op-grace-exp-${randomUUID()}`,
          now: clickNow,
        })
      ).rejects.toMatchObject({
        code: 'OBLIGATION_EXTENSION_FORBIDDEN',
      });
    });

    it('EL-TK-190: cancela eliminación manual de evento antes del claim (owner y ADMIN_HUMAN con grant MOD-007) y deniega en frontera exacta o tras claim', async () => {
      const org = await seedOrganizerWithCredential();
      // Evento con cierre voluntario previo (CLOSED)
      const { eventId } = await seedEventForOrganizer({
        organizerId: org.accountId,
        status: 'CLOSED',
        closedAt: new Date('2026-10-11T10:00:00.000Z'),
      });

      const reqTime = new Date('2026-10-12T12:00:00.000Z');
      const requested = await workflowService.requestManualEventDeletion({
        actorContext: org.actorContext,
        eventId,
        confirmation: true,
        expectedRevision: 1n,
        idempotencyKey: `op-req-cancel-test-${randomUUID()}`,
        now: reqTime,
      });

      // Escenario 2: A la hora exacta de fin de ventana (now === cancelUntil), se deniega estrictamente (now < cancelUntil)
      await expect(
        workflowService.cancelManualEventDeletion({
          actorContext: org.actorContext,
          eventId,
          requestId: requested.request.id,
          confirmation: true,
          expectedRevision: requested.request.currentRevision,
          idempotencyKey: `op-cancel-boundary-${randomUUID()}`,
          now: new Date('2026-10-15T12:00:00.000Z'), // exactamente igual a cancelUntil
        })
      ).rejects.toMatchObject({
        code: 'INVALID_STATUS_TRANSITION',
      });

      // Escenario 3: Si el ACK falla al cancelar, queda en OUTCOME_UNKNOWN y NO levanta la barrera
      failNextAck = true;
      const unknownCancel = await workflowService.cancelManualEventDeletion({
        actorContext: org.actorContext,
        eventId,
        requestId: requested.request.id,
        confirmation: true,
        expectedRevision: requested.request.currentRevision,
        idempotencyKey: `op-cancel-unknown-${randomUUID()}`,
        now: new Date('2026-10-13T12:00:00.000Z'),
      });
      expect(unknownCancel.outcome).toBe('OUTCOME_UNKNOWN');
      expect(unknownCancel.recalculatedEventStatus).toBe('PENDING_DELETION');
      expect(unknownCancel.remainingActiveBarriersCount).toBe(1);

      // Escenario 1: Reintento con ACK exitoso cancela la solicitud y recalcula el evento a CLOSED (nunca ACTIVE ciego)
      const cancelled = await workflowService.cancelManualEventDeletion({
        actorContext: org.actorContext,
        eventId,
        requestId: requested.request.id,
        confirmation: true,
        expectedRevision: unknownCancel.request.currentRevision,
        idempotencyKey: `op-cancel-ok-${randomUUID()}`,
        now: new Date('2026-10-13T12:05:00.000Z'),
      });
      expect(cancelled.outcome).toBe('CANCELLED');
      expect(cancelled.request.status).toBe('CANCELLED');
      expect(cancelled.recalculatedEventStatus).toBe('CLOSED');
      expect(cancelled.remainingActiveBarriersCount).toBe(0);

      // Escenario 4: Cancelación administrativa con ADMIN_HUMAN y grant MOD-007
      const { eventId: adminTargetEventId } = await seedEventForOrganizer({
        organizerId: org.accountId,
        status: 'ACTIVE',
      });
      const reqForAdmin = await workflowService.requestManualEventDeletion({
        actorContext: org.actorContext,
        eventId: adminTargetEventId,
        confirmation: true,
        expectedRevision: 1n,
        idempotencyKey: `op-req-admin-${randomUUID()}`,
        now: reqTime,
      });

      const adminActor: AdminActorContext = {
        actorType: 'ADMIN_HUMAN',
        principalId: randomUUID(),
        identifier: 'sec-admin@eventlens.internal',
        sessionId: randomUUID(),
        authTime: new Date('2026-10-13T09:55:00.000Z'),
        credentialRevision: 1n,
        adminAuthRevision: 1n,
        sessionWatermark: 1n,
        recoveryEpoch: 1n,
      };
      const cancelNow = new Date('2026-10-13T10:00:00.000Z');

      // Sin grant MOD-007 -> se deniega
      await expect(
        workflowService.cancelManualEventDeletion({
          actorContext: adminActor,
          eventId: adminTargetEventId,
          requestId: reqForAdmin.request.id,
          confirmation: true,
          expectedRevision: reqForAdmin.request.currentRevision,
          idempotencyKey: `op-admin-nogrant-${randomUUID()}`,
          reason: 'Soporte autorizado ticket #402',
          now: cancelNow,
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED_ACTOR',
      });

      // Registrar grant MOD-007 válido para este evento y requestId
      const grantKey = `${adminActor.principalId}:CANCEL_EVENT_DELETION:EVENT:${adminTargetEventId}:${reqForAdmin.request.id}`;
      activeAdminGrants.set(grantKey, {
        grantId: randomUUID(),
        granteePrincipalId: adminActor.principalId,
        operation: 'CANCEL_EVENT_DELETION',
        resourceType: 'EVENT',
        resourceRef: adminTargetEventId,
        requestId: reqForAdmin.request.id,
        status: 'ACTIVE',
        expiresAt: new Date('2026-10-13T11:00:00.000Z'),
      });

      // Admin intentando pasar organizerProofAttempt como sustituto -> se deniega
      await expect(
        workflowService.cancelManualEventDeletion({
          actorContext: adminActor,
          eventId: adminTargetEventId,
          requestId: reqForAdmin.request.id,
          confirmation: true,
          expectedRevision: reqForAdmin.request.currentRevision,
          idempotencyKey: `op-admin-proof-sub-${randomUUID()}`,
          reason: 'Soporte autorizado',
          organizerProofAttempt: 'fake-org-proof',
          now: cancelNow,
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED_ACTOR',
      });

      // Admin con grant MOD-007 válido, motivo auditado y sesión fresca -> cancela exitosamente
      const adminCancelled = await workflowService.cancelManualEventDeletion({
        actorContext: adminActor,
        eventId: adminTargetEventId,
        requestId: reqForAdmin.request.id,
        confirmation: true,
        expectedRevision: reqForAdmin.request.currentRevision,
        idempotencyKey: `op-admin-cancel-ok-${randomUUID()}`,
        reason: 'Soporte autorizado ticket #402',
        now: cancelNow,
      });
      expect(adminCancelled.outcome).toBe('CANCELLED');
      expect(adminCancelled.recalculatedEventStatus).toBe('ACTIVE');
      expect(adminCancelled.request.cancelReason).toContain('ADMIN_CANCELLED: Soporte autorizado ticket #402');
    });

    it('EL-TK-191, EL-TK-192 & EL-TK-193: ciclo completo de solicitud de cuenta (7d) con reautenticación MOD-001, replay exacto, aislamiento de fallo email y cancelación con recálculo selectivo de hijos', async () => {
      const org = await seedOrganizerWithCredential('MyUltraSecurePass!2026');

      // Crear 4 eventos hijos en distintos estados:
      // 1) ACTIVE
      const evActive = await seedEventForOrganizer({
        organizerId: org.accountId,
        status: 'ACTIVE',
        withActiveGuestAndUpload: true,
      });
      // 2) CLOSED voluntariamente
      const evClosed = await seedEventForOrganizer({
        organizerId: org.accountId,
        status: 'CLOSED',
        closedAt: new Date('2026-10-11T08:00:00.000Z'),
      });
      // 3) SUSPENDED administrativamente
      const evSuspended = await seedEventForOrganizer({
        organizerId: org.accountId,
        status: 'SUSPENDED',
        previousStatus: 'ACTIVE',
        suspendedAt: new Date('2026-10-11T09:00:00.000Z'),
        suspensionReason: 'Revisión preventiva MOD-007',
      });
      // 4) Con solicitud de eliminación manual propia independiente (72h)
      const evIndepDel = await seedEventForOrganizer({
        organizerId: org.accountId,
        status: 'ACTIVE',
      });

      const t0 = new Date('2026-10-12T15:00:00.000Z');
      const indepEventReq = await workflowService.requestManualEventDeletion({
        actorContext: org.actorContext,
        eventId: evIndepDel.eventId,
        confirmation: true,
        expectedRevision: 1n,
        idempotencyKey: `op-indep-ev-${randomUUID()}`,
        now: t0,
      });
      expect(indepEventReq.cancelUntil.toISOString()).toBe('2026-10-15T15:00:00.000Z'); // +72h

      // Emitir y verificar challenge MOD-001 para REQUEST_ACCOUNT_DELETION
      const reqIntentionHash = computeCanonicalAccountDeletionIntentionHash({
        operation: 'REQUEST_ACCOUNT_DELETION',
        accountId: org.accountId,
        expectedRevision: 1n,
        confirmation: true,
      });

      const challenge = await reauthService.beginChallenge({
        actorContext: org.actorContext,
        operation: 'REQUEST_ACCOUNT_DELETION',
        resourceType: 'ACCOUNT',
        resourceId: org.accountId,
        expectedRevision: 1n,
        intentionHash: reqIntentionHash,
      });

      const verified = await reauthService.verifyChallenge({
        actorContext: org.actorContext,
        challengeId: challenge.challengeId,
        credential: org.password,
      });

      // Simular fallo de email/notificación (EL-TK-191: fallo email no revierte la solicitud)
      failNextNotification = true;

      const accReqIdempKey = `op-acc-del-${randomUUID()}`;
      const accDelResult = await workflowService.requestManualAccountDeletion({
        actorContext: org.actorContext,
        accountId: org.accountId,
        confirmation: true,
        expectedRevision: 1n,
        reauthenticationEvidence: verified.evidence,
        idempotencyKey: accReqIdempKey,
        now: t0,
      });

      expect(accDelResult.outcome).toBe('REQUESTED');
      expect(accDelResult.accountStatus).toBe('PENDING_DELETION');
      expect(accDelResult.restrictedSessionContext).toBe('DELETION_MANAGEMENT_ONLY');
      expect(accDelResult.cancelUntil.toISOString()).toBe('2026-10-19T15:00:00.000Z'); // +7 días calendario UTC
      expect(accDelResult.purgeStartedAt.toISOString()).toBe('2026-10-19T15:00:00.000Z');
      expect(accDelResult.affectedEventIds).toHaveLength(4);
      expect(accDelResult.notificationWarning).toContain('SMTP connection refused');

      // Verificar que el evento con eliminación propia previa NO vio extendido su plazo de purga (+72h se preservó)
      const indepEventRowAfterAccDel = await transactions.run((tx) =>
        tx.query<{ purge_started_at: Date }>(
          `SELECT purge_started_at FROM event WHERE id = $1::uuid`,
          evIndepDel.eventId
        )
      );
      expect(new Date(indepEventRowAfterAccDel[0].purge_started_at).toISOString()).toBe(
        '2026-10-15T15:00:00.000Z'
      );

      // EL-TK-191 Escenario 2: Replay exacto con la misma Idempotency-Key devuelve IDEMPOTENT_REPLAY
      // consultando primero el recibo compatible aunque la evidencia ya haya sido consumida
      const accReplay = await workflowService.requestManualAccountDeletion({
        actorContext: org.actorContext,
        accountId: org.accountId,
        confirmation: true,
        expectedRevision: 1n,
        reauthenticationEvidence: verified.evidence,
        idempotencyKey: accReqIdempKey,
        now: new Date('2026-10-12T15:02:00.000Z'),
      });
      expect(accReplay.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(accReplay.request.id).toBe(accDelResult.request.id);

      // EL-TK-191 Escenario 1: Con sesión restringida DELETION_MANAGEMENT_ONLY se bloquea crear nuevos eventos
      const restrictedActor: OrganizerActorContext = {
        ...org.actorContext,
        restrictedContext: 'DELETION_MANAGEMENT_ONLY',
      };
      await expect(
        draftService.createDraft({
          actorContext: restrictedActor,
          name: 'Intento Evento Bloqueado',
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });

      // EL-TK-192 Escenario 1 y EL-TK-193 Escenario 3:
      // Cancelar la eliminación de cuenta usando una NUEVA evidencia de CANCEL_ACCOUNT_DELETION
      const cancelTime = new Date('2026-10-14T10:00:00.000Z');
      const cancelExpectedRev = accDelResult.request.currentRevision;

      const cancelIntentionHash = computeCanonicalAccountDeletionIntentionHash({
        operation: 'CANCEL_ACCOUNT_DELETION',
        accountId: org.accountId,
        expectedRevision: cancelExpectedRev,
        confirmation: true,
        requestId: accDelResult.request.id,
      });

      const cancelChallenge = await reauthService.beginChallenge({
        actorContext: restrictedActor,
        operation: 'CANCEL_ACCOUNT_DELETION',
        resourceType: 'ACCOUNT',
        resourceId: org.accountId,
        expectedRevision: 1n, // credential revision
        intentionHash: cancelIntentionHash,
        requestId: accDelResult.request.id,
      });

      const cancelVerified = await reauthService.verifyChallenge({
        actorContext: restrictedActor,
        challengeId: cancelChallenge.challengeId,
        credential: org.password,
      });

      const cancelIdempKey = `op-acc-cancel-${randomUUID()}`;
      const accCancelRes = await workflowService.cancelManualAccountDeletion({
        actorContext: restrictedActor,
        accountId: org.accountId,
        requestId: accDelResult.request.id,
        confirmation: true,
        expectedRevision: cancelExpectedRev,
        reauthenticationEvidence: cancelVerified.evidence,
        idempotencyKey: cancelIdempKey,
        now: cancelTime,
      });

      expect(accCancelRes.outcome).toBe('CANCELLED');
      expect(accCancelRes.accountStatus).toBe('ACTIVE');

      const byEvent = new Map(
        accCancelRes.recalculatedEvents.map((e) => [e.eventId, e])
      );

      // 1) evActive recuperó su estado ACTIVE
      expect(byEvent.get(evActive.eventId)?.statusAfterCancellation).toBe('ACTIVE');
      expect(byEvent.get(evActive.eventId)?.hasIndependentBarrier).toBe(false);

      // 2) evClosed conservó su cierre voluntario CLOSED
      expect(byEvent.get(evClosed.eventId)?.statusAfterCancellation).toBe('CLOSED');

      // 3) evSuspended conservó su suspensión administrativa SUSPENDED
      expect(byEvent.get(evSuspended.eventId)?.statusAfterCancellation).toBe('SUSPENDED');

      // 4) evIndepDel permanece en PENDING_DELETION porque su barrera propia sigue activa (EL-TK-193 Escenario 3)
      expect(byEvent.get(evIndepDel.eventId)?.statusAfterCancellation).toBe('PENDING_DELETION');
      expect(byEvent.get(evIndepDel.eventId)?.hasIndependentBarrier).toBe(true);

      // Verificar mediante evaluateBarrierAccess que evActive ya permite acceso pero evIndepDel sigue bloqueado
      const activeAccessAfterCancel = await workflowService.evaluateBarrierAccess({
        eventId: evActive.eventId,
        action: 'GUEST_VIEW_GALLERY',
      });
      expect(activeAccessAfterCancel.allowed).toBe(true);

      const indepAccessAfterCancel = await workflowService.evaluateBarrierAccess({
        eventId: evIndepDel.eventId,
        action: 'GUEST_VIEW_GALLERY',
      });
      expect(indepAccessAfterCancel.allowed).toBe(false);
      expect(indepAccessAfterCancel.blockingRequestIds).toEqual([indepEventReq.request.id]);

      // Replay exacto de cancelación de cuenta devuelve IDEMPOTENT_REPLAY sin re-consumir evidencia
      const cancelReplay = await workflowService.cancelManualAccountDeletion({
        actorContext: org.actorContext,
        accountId: org.accountId,
        requestId: accDelResult.request.id,
        confirmation: true,
        expectedRevision: cancelExpectedRev,
        reauthenticationEvidence: cancelVerified.evidence,
        idempotencyKey: cancelIdempKey,
        now: new Date('2026-10-14T10:01:00.000Z'),
      });
      expect(cancelReplay.outcome).toBe('IDEMPOTENT_REPLAY');
    });

    it('EL-TK-192 Escenario 4: ADMIN_HUMAN con grant MOD-007 y motivo auditado cancela eliminación de cuenta sin contraseña del organizador', async () => {
      const org = await seedOrganizerWithCredential('OrganizerPass!123');
      const ev = await seedEventForOrganizer({
        organizerId: org.accountId,
        status: 'ACTIVE',
      });

      const t0 = new Date('2026-10-12T16:00:00.000Z');
      const reqHash = computeCanonicalAccountDeletionIntentionHash({
        operation: 'REQUEST_ACCOUNT_DELETION',
        accountId: org.accountId,
        expectedRevision: 1n,
        confirmation: true,
      });
      const ch = await reauthService.beginChallenge({
        actorContext: org.actorContext,
        operation: 'REQUEST_ACCOUNT_DELETION',
        resourceType: 'ACCOUNT',
        resourceId: org.accountId,
        expectedRevision: 1n,
        intentionHash: reqHash,
      });
      const ver = await reauthService.verifyChallenge({
        actorContext: org.actorContext,
        challengeId: ch.challengeId,
        credential: org.password,
      });

      const accReq = await workflowService.requestManualAccountDeletion({
        actorContext: org.actorContext,
        accountId: org.accountId,
        confirmation: true,
        expectedRevision: 1n,
        reauthenticationEvidence: ver.evidence,
        idempotencyKey: `op-acc-admin-test-${randomUUID()}`,
        now: t0,
      });

      const adminActor: AdminActorContext = {
        actorType: 'ADMIN_HUMAN',
        principalId: randomUUID(),
        identifier: 'support-lead@eventlens.internal',
        sessionId: randomUUID(),
        authTime: new Date('2026-10-13T11:58:00.000Z'),
        credentialRevision: 1n,
        adminAuthRevision: 1n,
        sessionWatermark: 1n,
        recoveryEpoch: 1n,
      };
      const cancelTime = new Date('2026-10-13T12:00:00.000Z');

      // Registrar grant MOD-007 para CANCEL_ACCOUNT_DELETION
      const grantKey = `${adminActor.principalId}:CANCEL_ACCOUNT_DELETION:ACCOUNT:${org.accountId}:${accReq.request.id}`;
      activeAdminGrants.set(grantKey, {
        grantId: randomUUID(),
        granteePrincipalId: adminActor.principalId,
        operation: 'CANCEL_ACCOUNT_DELETION',
        resourceType: 'ACCOUNT',
        resourceRef: org.accountId,
        requestId: accReq.request.id,
        status: 'ACTIVE',
        expiresAt: new Date('2026-10-13T13:00:00.000Z'),
      });

      // Si el admin intenta suministrar reauthenticationEvidence del organizador, se deniega
      await expect(
        workflowService.cancelManualAccountDeletion({
          actorContext: adminActor,
          accountId: org.accountId,
          requestId: accReq.request.id,
          confirmation: true,
          expectedRevision: accReq.request.currentRevision,
          reauthenticationEvidence: 'organizer-proof-not-allowed',
          reason: 'Cancelación administrativa solicitada por soporte',
          idempotencyKey: `op-admin-acc-bad-${randomUUID()}`,
          now: cancelTime,
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED_ACTOR',
      });

      // Sin reauthenticationEvidence de organizador y con grant + motivo auditado -> éxito
      const adminAccCancel = await workflowService.cancelManualAccountDeletion({
        actorContext: adminActor,
        accountId: org.accountId,
        requestId: accReq.request.id,
        confirmation: true,
        expectedRevision: accReq.request.currentRevision,
        reason: 'Cancelación administrativa verificada MOD-007',
        idempotencyKey: `op-admin-acc-ok-${randomUUID()}`,
        now: cancelTime,
      });

      expect(adminAccCancel.outcome).toBe('CANCELLED');
      expect(adminAccCancel.accountStatus).toBe('ACTIVE');
      expect(adminAccCancel.recalculatedEvents).toEqual([
        {
          eventId: ev.eventId,
          statusAfterCancellation: 'ACTIVE',
          hasIndependentBarrier: false,
        },
      ]);
    });
  }
);
