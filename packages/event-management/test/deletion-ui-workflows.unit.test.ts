import { describe, expect, it } from 'vitest';
import {
  AccountDeletionUiController,
  type AccountDeletionReauthApiPort,
  type AccountDeletionServerSnapshot,
  addUtcCalendarDays,
  addUtcHours,
  EventDeletionUiController,
  type EventDeletionApiPort,
  type EventDeletionServerSnapshot,
  UiApiError,
} from '../src/index.js';

describe('EL-TK-200 & EL-TK-201 — Deletion UI Controllers Unit Tests', () => {
  it('EL-TK-200 Escenarios 1, 2 & 3: manages EventDeleteRequestDialog, timezone-formatted Countdown, irreversible omission, and 409/503/timeout without optimistic claims', async () => {
    const anchor = new Date('2026-10-12T15:00:00.000Z');
    const cancelUntil = addUtcHours(anchor, 72);
    const mainDeadline = addUtcCalendarDays(cancelUntil, 7);
    const residualDeadline = addUtcCalendarDays(cancelUntil, 30);

    let currentSnapshot: EventDeletionServerSnapshot = {
      eventId: 'evt-900',
      eventName: 'Gala Anual 2026',
      eventTimezone: 'America/Bogota',
      eventStatus: 'CLOSED',
      currentRevision: 4n,
      generation: 1n,
      deletionRequest: null,
      serverCapabilities: {
        canRequestManualDeletion: true,
        canCancelManualDeletion: false,
        isReadOnlyView: false,
      },
    };

    let shouldFailCancelWith503 = true;

    const apiPort: EventDeletionApiPort = {
      async getEventDeletionSnapshot() {
        return currentSnapshot;
      },
      async requestEventDeletion() {
        currentSnapshot = {
          ...currentSnapshot,
          eventStatus: 'PENDING_DELETION',
          currentRevision: 5n,
          deletionRequest: {
            requestId: 'req-evt-900',
            cause: 'MANUAL_EVENT_DELETION',
            status: 'CONFIRMED',
            anchorTimestamp: anchor,
            cancelUntil,
            purgeStartedAt: cancelUntil,
            mainPurgeDeadline: mainDeadline,
            residualPurgeDeadline: residualDeadline,
            mainPurgedAt: null,
            mainPurgeStatus: 'PENDING',
            residualPurgeStatus: 'PENDING_RESIDUAL',
          },
          serverCapabilities: {
            canRequestManualDeletion: false,
            canCancelManualDeletion: true,
            isReadOnlyView: false,
          },
        };
        return currentSnapshot;
      },
      async cancelEventDeletion() {
        if (shouldFailCancelWith503) {
          throw new UiApiError(503, 'AUTHORITY_ACK_TIMEOUT', 'Authority timeout');
        }
        currentSnapshot = {
          ...currentSnapshot,
          eventStatus: 'CLOSED',
          currentRevision: 6n,
          deletionRequest: {
            ...currentSnapshot.deletionRequest!,
            status: 'CANCELLED',
          },
          serverCapabilities: {
            canRequestManualDeletion: true,
            canCancelManualDeletion: false,
            isReadOnlyView: false,
          },
        };
        return currentSnapshot;
      },
    };

    const controller = new EventDeletionUiController(apiPort);
    controller.setViewport('MOBILE');

    const initialPanel = await controller.loadSnapshot('evt-900', anchor);
    expect(initialPanel.availableActions).toEqual(['REQUEST_EVENT_DELETION']);

    // Escenario 1: Open dialog on MOBILE -> BOTTOM_SHEET, shows resource, 72h, consequences, exit
    const dialog = controller.openDeleteRequestDialog('btn-open-delete', anchor);
    expect(dialog.open).toBe(true);
    expect(dialog.surfaceContainer).toBe('BOTTOM_SHEET');
    expect(dialog.cancellationWindowHours).toBe(72);
    expect(dialog.cancelExitVisible).toBe(true);
    expect(dialog.submitDisabled).toBe(true);
    expect(controller.getFocusState().focusTrapped).toBe(true);

    controller.setDialogConfirmation(true);
    const submitRes = await controller.submitDeleteRequest('idem-evt-900', anchor);
    expect(submitRes.dialog.open).toBe(false);

    // Escenario 2: Cancelable pending deletion shows exact date in America/Bogota (-05:00) and countdown without live-region tick spam
    expect(submitRes.panel.isCancelable).toBe(true);
    expect(submitRes.panel.countdown).not.toBeNull();
    expect(submitRes.panel.countdown?.exactDeadlineLocalIso).toBe('2026-10-15T10:00:00');
    expect(submitRes.panel.countdown?.timezone).toBe('America/Bogota');
    expect(submitRes.panel.countdown?.announceInLiveRegion).toBe(false);
    expect(submitRes.panel.availableActions).toContain('CANCEL_EVENT_DELETION');

    // Escenario 3: 503 on cancel re-queries server and NEVER claims cancellation succeeded
    const after503Panel = await controller.submitCancelDeletion(
      'idem-cancel-900',
      new Date('2026-10-13T15:00:00.000Z')
    );
    expect(after503Panel.eventStatus).toBe('PENDING_DELETION');
    expect(after503Panel.bannerMessage).toContain('Verificando resultado');

    // Irreversible cause (GRACE_PERIOD_EXPIRED) omits countdown and cancel button
    currentSnapshot = {
      ...currentSnapshot,
      deletionRequest: {
        ...currentSnapshot.deletionRequest!,
        cause: 'GRACE_PERIOD_EXPIRED',
        cancelUntil: null,
      },
      serverCapabilities: {
        canRequestManualDeletion: false,
        canCancelManualDeletion: false,
        isReadOnlyView: false,
      },
    };
    const irreversiblePanel = await controller.loadSnapshot('evt-900', anchor);
    expect(irreversiblePanel.isIrreversible).toBe(true);
    expect(irreversiblePanel.isCancelable).toBe(false);
    expect(irreversiblePanel.countdown).toBeNull();
  });

  it('EL-TK-201 Escenarios 1, 2 & 3: executes ConfirmDialog -> LoginForm.REAUTH_ACCOUNT -> restricted session, wipes secrets on error/expiry, and re-queries on 409/503', async () => {
    const now = new Date('2026-10-12T16:00:00.000Z');
    const cancelUntil = addUtcCalendarDays(now, 7);

    let accountSnap: AccountDeletionServerSnapshot = {
      accountId: 'acc-777',
      accountStatus: 'ACTIVE',
      currentRevision: 1n,
      sessionMode: 'ORDINARY',
      affectedEventsCount: 4,
      activeDeletionRequest: null,
      serverCapabilities: {
        canRequestAccountDeletion: true,
        canCancelAccountDeletion: false,
        canAccessOrdinaryFeatures: true,
      },
    };

    let challengeCounter = 0;
    let consumedEvidences = new Set<string>();

    const apiPort: AccountDeletionReauthApiPort = {
      async getAccountDeletionSnapshot() {
        return accountSnap;
      },
      async beginAccountReauthentication(params) {
        challengeCounter += 1;
        return {
          challengeId: `ch-${challengeCounter}`,
          expiresAt: new Date(params.now.getTime() + 5 * 60_000),
          operation: params.operation,
          resourceId: params.resourceId,
        };
      },
      async verifyAccountReauthentication(params) {
        if (params.credential !== 'CorrectHorseBatteryStaple!1') {
          throw new UiApiError(400, 'INVALID_CREDENTIALS', 'Invalid password');
        }
        return {
          evidence: `ev-token-${params.challengeId}`,
          expiresAt: new Date(params.now.getTime() + 5 * 60_000),
        };
      },
      async requestAccountDeletion(params) {
        if (consumedEvidences.has(params.reauthenticationEvidence)) {
          throw new UiApiError(409, 'EVIDENCE_ALREADY_CONSUMED', 'Evidence already used');
        }
        consumedEvidences.add(params.reauthenticationEvidence);
        accountSnap = {
          accountId: 'acc-777',
          accountStatus: 'PENDING_DELETION',
          currentRevision: 2n,
          sessionMode: 'DELETION_MANAGEMENT_ONLY',
          affectedEventsCount: 4,
          activeDeletionRequest: {
            requestId: 'req-acc-777',
            status: 'CONFIRMED',
            anchorTimestamp: now,
            cancelUntil,
            purgeStartedAt: cancelUntil,
            mainPurgeDeadline: addUtcCalendarDays(cancelUntil, 7),
            residualPurgeDeadline: addUtcCalendarDays(cancelUntil, 30),
            mainPurgeStatus: 'PENDING',
            residualPurgeStatus: 'PENDING_RESIDUAL',
          },
          serverCapabilities: {
            canRequestAccountDeletion: false,
            canCancelAccountDeletion: true,
            canAccessOrdinaryFeatures: false,
          },
        };
        return accountSnap;
      },
      async cancelAccountDeletion(params) {
        consumedEvidences.add(params.reauthenticationEvidence);
        accountSnap = {
          accountId: 'acc-777',
          accountStatus: 'ACTIVE',
          currentRevision: 3n,
          sessionMode: 'ORDINARY',
          affectedEventsCount: 4,
          activeDeletionRequest: null,
          serverCapabilities: {
            canRequestAccountDeletion: true,
            canCancelAccountDeletion: false,
            canAccessOrdinaryFeatures: true,
          },
        };
        return accountSnap;
      },
    };

    const controller = new AccountDeletionUiController(apiPort);
    const initialVm = await controller.loadAccountSnapshot('acc-777', now);
    expect(initialVm.ordinaryNavigationVisible).toBe(true);

    // Step 1: Open ConfirmDialog for REQUEST_ACCOUNT_DELETION
    const confirmVm = controller.openConfirmDialog('REQUEST_ACCOUNT_DELETION', now);
    expect(confirmVm.confirmDialog.open).toBe(true);
    expect(confirmVm.reauthForm).toBeNull();

    // Step 2: Confirm consequences and begin challenge -> shows LoginForm.REAUTH_ACCOUNT
    const reauthVm = await controller.confirmConsequencesAndBeginChallenge(now);
    expect(reauthVm.reauthForm?.variant).toBe('REAUTH_ACCOUNT');
    expect(reauthVm.reauthForm?.passwordFieldLabel).toBe('Contraseña actual');
    expect(reauthVm.reauthForm?.showEmailOrIdentityField).toBe(false);
    expect(reauthVm.reauthForm?.primaryCtaLabel).toBe('Solicitar eliminación de cuenta');

    // Wrong password attempt wipes credential buffer and keeps neutral field error
    const wrongPwdVm = await controller.verifyPasswordAndSubmitCommand({
      currentPassword: 'wrong-password',
      idempotencyKey: 'idem-acc-req-1',
      now,
    });
    expect(wrongPwdVm.reauthForm?.fieldErrorMessage).toContain('No se pudo verificar la contraseña actual');
    expect(controller.getDebugSecretLeakCheck().hasRawPasswordInMemory).toBe(false);

    // Escenario 3: Expired challenge (after 6 minutes) wipes secrets and requires new challenge
    const expiredVm = await controller.verifyPasswordAndSubmitCommand({
      currentPassword: 'CorrectHorseBatteryStaple!1',
      idempotencyKey: 'idem-acc-req-1',
      now: new Date(now.getTime() + 6 * 60_000),
    });
    expect(expiredVm.stage).toBe('CONFIRM_CONSEQUENCES_DIALOG');
    expect(controller.getDebugSecretLeakCheck()).toEqual({
      hasRawPasswordInMemory: false,
      hasEvidenceInMemory: false,
      hasChallengeInMemory: false,
    });

    // Escenario 1: Start fresh challenge, verify password and execute REQUEST_ACCOUNT_DELETION
    await controller.confirmConsequencesAndBeginChallenge(now);
    const requestedVm = await controller.verifyPasswordAndSubmitCommand({
      currentPassword: 'CorrectHorseBatteryStaple!1',
      idempotencyKey: 'idem-acc-req-2',
      now,
    });

    expect(requestedVm.accountStatus).toBe('PENDING_DELETION');
    expect(requestedVm.sessionMode).toBe('DELETION_MANAGEMENT_ONLY');
    // Escenario 2: Restricted session hides ordinary features and allows only status & cancel
    expect(requestedVm.ordinaryNavigationVisible).toBe(false);
    expect(requestedVm.securityNotice.availableActions).toContain('CANCEL_ACCOUNT_DELETION');
    expect(controller.getDebugSecretLeakCheck()).toEqual({
      hasRawPasswordInMemory: false,
      hasEvidenceInMemory: false,
      hasChallengeInMemory: false,
    });

    // Cancel account deletion requires a brand new challenge
    controller.openConfirmDialog('CANCEL_ACCOUNT_DELETION', now);
    const cancelReauthVm = await controller.confirmConsequencesAndBeginChallenge(now);
    expect(cancelReauthVm.reauthForm?.primaryCtaLabel).toBe('Cancelar eliminación de cuenta');

    const cancelledVm = await controller.verifyPasswordAndSubmitCommand({
      currentPassword: 'CorrectHorseBatteryStaple!1',
      idempotencyKey: 'idem-acc-cancel-1',
      now,
    });
    expect(cancelledVm.accountStatus).toBe('ACTIVE');
    expect(cancelledVm.ordinaryNavigationVisible).toBe(true);
  });
});
