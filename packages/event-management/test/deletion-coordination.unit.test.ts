import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  DeletionCoordinationService,
  DeletionCoordinationError,
  addUtcCalendarDays,
  addUtcHours,
  computeDeletionDeadlines,
  type DeletionCoordinationRepository,
  type DeletionRequestRecord,
  type DeletionReceiptRecord,
  type DeletionRequestStatus,
  type DeletionScopeType,
  type DeletionTelemetryMetric,
  type DeletionTelemetrySink,
} from '../src/index.js';

class InMemoryDeletionCoordinationRepository implements DeletionCoordinationRepository {
  public requests = new Map<string, DeletionRequestRecord>();
  public receipts = new Map<string, DeletionReceiptRecord[]>();

  async findByDedupKeyForUpdate(
    _tx: SqlTransaction,
    dedupKey: string
  ): Promise<DeletionRequestRecord | null> {
    for (const req of this.requests.values()) {
      if (req.dedupKey === dedupKey) return req;
    }
    return null;
  }

  async findByIdForUpdate(
    _tx: SqlTransaction,
    requestId: string
  ): Promise<DeletionRequestRecord | null> {
    return this.requests.get(requestId) ?? null;
  }

  async findById(_tx: SqlTransaction, requestId: string): Promise<DeletionRequestRecord | null> {
    return this.requests.get(requestId) ?? null;
  }

  async findActiveByScopeForUpdate(
    _tx: SqlTransaction,
    scopeType: DeletionScopeType,
    scopeRef: string
  ): Promise<DeletionRequestRecord[]> {
    const activeStatuses: DeletionRequestStatus[] = [
      'PREPARED',
      'CONFIRMED',
      'UNKNOWN',
      'CLAIMED',
      'MAIN_PURGED',
    ];
    return [...this.requests.values()]
      .filter(
        (r) =>
          r.scopeType === scopeType &&
          r.scopeRef === scopeRef &&
          activeStatuses.includes(r.status)
      )
      .sort((a, b) => a.mainPurgeDeadline.getTime() - b.mainPurgeDeadline.getTime());
  }

  async findLatestByScope(
    _tx: SqlTransaction,
    scopeType: DeletionScopeType,
    scopeRef: string
  ): Promise<DeletionRequestRecord | null> {
    const matching = [...this.requests.values()]
      .filter((r) => r.scopeType === scopeType && r.scopeRef === scopeRef)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return matching[0] ?? null;
  }

  async insertRequest(_tx: SqlTransaction, record: DeletionRequestRecord): Promise<void> {
    this.requests.set(record.id, record);
  }

  async updateRequestStatus(
    _tx: SqlTransaction,
    params: {
      requestId: string;
      expectedRevision: bigint;
      newStatus: DeletionRequestStatus;
      newRevision: bigint;
      cancelledAt?: Date | null;
      cancelledBy?: string | null;
      cancelReason?: string | null;
      updatedAt: Date;
    }
  ): Promise<boolean> {
    const existing = this.requests.get(params.requestId);
    if (!existing || existing.currentRevision !== params.expectedRevision) {
      return false;
    }
    this.requests.set(params.requestId, {
      ...existing,
      status: params.newStatus,
      currentRevision: params.newRevision,
      cancelledAt: params.cancelledAt ?? existing.cancelledAt,
      cancelledBy: params.cancelledBy ?? existing.cancelledBy,
      cancelReason: params.cancelReason ?? existing.cancelReason,
      updatedAt: params.updatedAt,
    });
    return true;
  }

  async insertReceipt(_tx: SqlTransaction, receipt: DeletionReceiptRecord): Promise<void> {
    const list = this.receipts.get(receipt.requestId) ?? [];
    list.push(receipt);
    this.receipts.set(receipt.requestId, list);
  }

  async findReceiptsByRequestId(
    _tx: SqlTransaction,
    requestId: string
  ): Promise<DeletionReceiptRecord[]> {
    return [...(this.receipts.get(requestId) ?? [])];
  }
}

const dummyTx = {} as SqlTransaction;
const dummyRunner: TransactionRunner = {
  async run<T>(work: (tx: SqlTransaction) => Promise<T>): Promise<T> {
    return work(dummyTx);
  },
};

describe('EL-TK-188: Contrato canónico de solicitudes e intenciones de eliminación (Unit)', () => {
  let repository: InMemoryDeletionCoordinationRepository;
  let metrics: DeletionTelemetryMetric[];
  let telemetrySink: DeletionTelemetrySink;
  let service: DeletionCoordinationService;

  beforeEach(() => {
    repository = new InMemoryDeletionCoordinationRepository();
    metrics = [];
    telemetrySink = {
      recordDeletionMetric(metric) {
        metrics.push(metric);
      },
    };
    service = new DeletionCoordinationService(dummyRunner, repository, telemetrySink);
  });

  describe('Aritmética de calendario UTC (+7 / +30 días, años bisiestos y DST)', () => {
    it('suma +7 y +30 días calendario UTC conservando exactamente hora, minutos, segundos y milisegundos en año bisiesto', () => {
      const leapAnchor = new Date('2024-02-29T18:42:15.789Z');
      const plus7 = addUtcCalendarDays(leapAnchor, 7);
      const plus30 = addUtcCalendarDays(leapAnchor, 30);

      expect(plus7.toISOString()).toBe('2024-03-07T18:42:15.789Z');
      expect(plus30.toISOString()).toBe('2024-03-30T18:42:15.789Z');
    });

    it('suma correctamente a través de fin de febrero en año no bisiesto y cambio de año', () => {
      const nonLeapFeb = new Date('2025-02-25T09:15:00.000Z');
      expect(addUtcCalendarDays(nonLeapFeb, 7).toISOString()).toBe('2025-03-04T09:15:00.000Z');

      const yearEnd = new Date('2026-12-28T23:59:59.999Z');
      expect(addUtcCalendarDays(yearEnd, 7).toISOString()).toBe('2027-01-04T23:59:59.999Z');
      expect(addUtcCalendarDays(yearEnd, 30).toISOString()).toBe('2027-01-27T23:59:59.999Z');
    });

    it('permanece inmune a transiciones DST y retrasos del worker (Escenario 3)', () => {
      // Fecha previa a cambio de horario DST en EE.UU./Europa (marzo)
      const anchor = new Date('2026-03-06T06:30:00.000Z');
      const lateWorkerNow = new Date('2026-03-09T19:00:00.000Z'); // Worker llega 3 días tarde

      const deadlines = computeDeletionDeadlines({
        cause: 'GRACE_PERIOD_EXPIRED',
        anchorTimestamp: anchor,
      });

      expect(deadlines.anchorTimestamp.toISOString()).toBe('2026-03-06T06:30:00.000Z');
      expect(deadlines.purgeStartedAt.toISOString()).toBe('2026-03-06T06:30:00.000Z');
      expect(deadlines.mainPurgeDeadline.toISOString()).toBe('2026-03-13T06:30:00.000Z');
      expect(deadlines.residualPurgeDeadline.toISOString()).toBe('2026-04-05T06:30:00.000Z');
      expect(deadlines.purgeStartedAt.getTime()).not.toBe(lateWorkerNow.getTime());
    });
  });

  describe('Escenario 1: Registro por cada causa válida con anclas y plazos propietarios', () => {
    it('calcula ventana cancelable de 72h para MANUAL_EVENT_DELETION y ancla purga al vencimiento de las 72h', async () => {
      const anchor = new Date('2026-10-12T10:00:00.000Z');
      const result = await service.registerDeletionIntent({
        sourceOperationId: 'op-manual-event-1',
        cause: 'MANUAL_EVENT_DELETION',
        scopeType: 'EVENT',
        scopeRef: randomUUID(),
        ownerModule: 'MOD-002',
        policyRef: 'MOD-008-MANUAL-EVENT-V1',
        anchorTimestamp: anchor,
        actorId: 'organizer-1',
      });

      expect(result.outcome).toBe('REGISTERED');
      expect(result.request.cancelUntil?.toISOString()).toBe('2026-10-15T10:00:00.000Z'); // +72h
      expect(result.request.purgeStartedAt.toISOString()).toBe('2026-10-15T10:00:00.000Z');
      expect(result.request.mainPurgeDeadline.toISOString()).toBe('2026-10-22T10:00:00.000Z'); // +7d desde purgeStartedAt
      expect(result.request.residualPurgeDeadline.toISOString()).toBe('2026-11-14T10:00:00.000Z'); // +30d desde purgeStartedAt
    });

    it('calcula ventana cancelable de 7 días para MANUAL_ACCOUNT_DELETION y ancla purga al vencer los 7 días', async () => {
      const anchor = new Date('2026-10-12T12:00:00.000Z');
      const result = await service.registerDeletionIntent({
        sourceOperationId: 'op-manual-account-1',
        cause: 'MANUAL_ACCOUNT_DELETION',
        scopeType: 'ACCOUNT',
        scopeRef: randomUUID(),
        ownerModule: 'MOD-001',
        policyRef: 'MOD-008-MANUAL-ACCOUNT-V1',
        anchorTimestamp: anchor,
        actorId: 'organizer-1',
      });

      expect(result.request.cancelUntil?.toISOString()).toBe('2026-10-19T12:00:00.000Z'); // +7d
      expect(result.request.purgeStartedAt.toISOString()).toBe('2026-10-19T12:00:00.000Z');
      expect(result.request.mainPurgeDeadline.toISOString()).toBe('2026-10-26T12:00:00.000Z'); // +7d desde 19 oct
      expect(result.request.residualPurgeDeadline.toISOString()).toBe('2026-11-18T12:00:00.000Z'); // +30d desde 19 oct
    });

    it('registra causas irreversibles (gracia, retiro propio, papelera, cuarentena) sin cancelUntil y con ancla inmediata', async () => {
      const causes = [
        { cause: 'GRACE_PERIOD_EXPIRED' as const, scopeType: 'EVENT' as const, ownerModule: 'MOD-002' as const },
        { cause: 'PRIVACY_OWN_REMOVAL' as const, scopeType: 'MEDIA' as const, ownerModule: 'MOD-004' as const },
        { cause: 'PRIVACY_ADMIN_RESOLUTION' as const, scopeType: 'MEDIA' as const, ownerModule: 'MOD-004' as const },
        { cause: 'TRASH_RETENTION_EXPIRED' as const, scopeType: 'MEDIA' as const, ownerModule: 'MOD-004' as const },
        { cause: 'QUARANTINE_DISPOSITION' as const, scopeType: 'MEDIA' as const, ownerModule: 'MOD-003' as const },
      ];

      const anchor = new Date('2026-10-12T15:00:00.000Z');

      for (const item of causes) {
        const res = await service.registerDeletionIntent({
          sourceOperationId: `op-${item.cause}`,
          cause: item.cause,
          scopeType: item.scopeType,
          scopeRef: randomUUID(),
          ownerModule: item.ownerModule,
          policyRef: `POLICY-${item.cause}`,
          anchorTimestamp: anchor,
          actorId: 'system-actor',
        });

        expect(res.request.cancelUntil).toBeNull();
        expect(res.request.purgeStartedAt.toISOString()).toBe('2026-10-12T15:00:00.000Z');
        expect(res.request.mainPurgeDeadline.toISOString()).toBe('2026-10-19T15:00:00.000Z');
        expect(res.request.residualPurgeDeadline.toISOString()).toBe('2026-11-11T15:00:00.000Z');
      }
    });
  });

  describe('Escenario 2: Idempotencia determinista y detección de conflictos de payload', () => {
    it('devuelve IDEMPOTENT_REPLAY ante mismo dedupKey y payload sin duplicar registros', async () => {
      const scopeRef = randomUUID();
      const anchor = new Date('2026-10-12T16:00:00.000Z');

      const first = await service.registerDeletionIntent({
        sourceOperationId: 'op-own-rem-99',
        cause: 'PRIVACY_OWN_REMOVAL',
        scopeType: 'MEDIA',
        scopeRef,
        ownerModule: 'MOD-004',
        policyRef: 'PRIVACY_OWN_REMOVAL',
        anchorTimestamp: anchor,
        actorId: 'guest-1',
      });

      const second = await service.registerDeletionIntent({
        sourceOperationId: 'op-own-rem-99',
        cause: 'PRIVACY_OWN_REMOVAL',
        scopeType: 'MEDIA',
        scopeRef,
        ownerModule: 'MOD-004',
        policyRef: 'PRIVACY_OWN_REMOVAL',
        anchorTimestamp: anchor,
        actorId: 'guest-1',
        now: new Date('2026-10-13T16:00:00.000Z'), // llamada posterior
      });

      expect(first.outcome).toBe('REGISTERED');
      expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(second.request.id).toBe(first.request.id);
      expect(repository.requests.size).toBe(1);
    });

    it('lanza DELETION_INTENT_PAYLOAD_CONFLICT si llega la misma clave con ancla o política distinta', async () => {
      const scopeRef = randomUUID();
      const anchor = new Date('2026-10-12T16:00:00.000Z');

      await service.registerDeletionIntent({
        sourceOperationId: 'op-conflict-1',
        cause: 'PRIVACY_OWN_REMOVAL',
        scopeType: 'MEDIA',
        scopeRef,
        ownerModule: 'MOD-004',
        policyRef: 'PRIVACY_OWN_REMOVAL',
        anchorTimestamp: anchor,
        actorId: 'guest-1',
      });

      await expect(
        service.registerDeletionIntent({
          sourceOperationId: 'op-conflict-1',
          cause: 'PRIVACY_OWN_REMOVAL',
          scopeType: 'MEDIA',
          scopeRef,
          ownerModule: 'MOD-004',
          policyRef: 'DIFFERENT_POLICY',
          anchorTimestamp: anchor,
          actorId: 'guest-1',
        })
      ).rejects.toMatchObject({
        code: 'DELETION_INTENT_PAYLOAD_CONFLICT',
      });
    });
  });

  describe('Reglas de negocio: Prohibición de Legal Hold, no-cancelación irreversible y no-extensión de deadlines', () => {
    it('rechaza cualquier intento de LEGAL_OR_SECURITY_HOLD con LEGAL_HOLD_NOT_ENABLED', async () => {
      await expect(
        service.registerDeletionIntent({
          sourceOperationId: 'op-hold-1',
          cause: 'MANUAL_EVENT_DELETION',
          scopeType: 'EVENT',
          scopeRef: randomUUID(),
          ownerModule: 'MOD-002',
          policyRef: 'LEGAL_OR_SECURITY_HOLD',
          anchorTimestamp: new Date(),
          actorId: 'admin-1',
        })
      ).rejects.toMatchObject({
        code: 'LEGAL_HOLD_NOT_ENABLED',
      });

      await expect(
        service.registerDeletionIntent({
          sourceOperationId: 'op-hold-2',
          cause: 'MANUAL_EVENT_DELETION',
          scopeType: 'EVENT',
          scopeRef: randomUUID(),
          ownerModule: 'MOD-002',
          policyRef: 'MOD-008-STANDARD',
          anchorTimestamp: new Date(),
          actorId: 'admin-1',
          legalHold: true,
        })
      ).rejects.toMatchObject({
        code: 'LEGAL_HOLD_NOT_ENABLED',
      });
    });

    it('rechaza ventana cancelUntil en causas irreversibles con IRREVERSIBLE_CAUSE_CANNOT_CANCEL', async () => {
      const anchor = new Date('2026-10-12T10:00:00.000Z');
      await expect(
        service.registerDeletionIntent({
          sourceOperationId: 'op-irrev-cancel',
          cause: 'TRASH_RETENTION_EXPIRED',
          scopeType: 'MEDIA',
          scopeRef: randomUUID(),
          ownerModule: 'MOD-004',
          policyRef: 'MOD-008-TRASH',
          anchorTimestamp: anchor,
          cancelUntil: addUtcHours(anchor, 72),
          actorId: 'system',
        })
      ).rejects.toMatchObject({
        code: 'IRREVERSIBLE_CAUSE_CANNOT_CANCEL',
      });
    });

    it('impide que una nueva causa extienda una obligación de purga anterior sobre el mismo recurso', async () => {
      const mediaRef = randomUUID();
      const earlierAnchor = new Date('2026-10-10T10:00:00.000Z');
      const laterAnchor = new Date('2026-10-12T10:00:00.000Z');

      await service.registerDeletionIntent({
        sourceOperationId: 'op-early-1',
        cause: 'TRASH_RETENTION_EXPIRED',
        scopeType: 'MEDIA',
        scopeRef: mediaRef,
        ownerModule: 'MOD-004',
        expectedRevision: 1n,
        policyRef: 'MOD-008-TRASH',
        anchorTimestamp: earlierAnchor,
        actorId: 'system',
      });

      await expect(
        service.registerDeletionIntent({
          sourceOperationId: 'op-late-2',
          cause: 'PRIVACY_ADMIN_RESOLUTION',
          scopeType: 'MEDIA',
          scopeRef: mediaRef,
          ownerModule: 'MOD-004',
          expectedRevision: 2n,
          policyRef: 'MOD-008-ADMIN',
          anchorTimestamp: laterAnchor,
          actorId: 'admin-1',
        })
      ).rejects.toMatchObject({
        code: 'OBLIGATION_EXTENSION_FORBIDDEN',
      });
    });
  });

  describe('Protocolo PREPARED -> CONFIRMED / UNKNOWN y proyección de consulta', () => {
    it('gestiona transición PREPARED -> UNKNOWN -> RECONCILED conservando ancla original y recibos', async () => {
      const eventId = randomUUID();
      const anchor = new Date('2026-10-12T08:00:00.000Z');

      const reg = await service.registerDeletionIntent({
        sourceOperationId: 'op-prep-1',
        cause: 'MANUAL_EVENT_DELETION',
        scopeType: 'EVENT',
        scopeRef: eventId,
        ownerModule: 'MOD-002',
        expectedRevision: 1n,
        policyRef: 'MOD-008-EVENT',
        anchorTimestamp: anchor,
        initialStatus: 'PREPARED',
        actorId: 'organizer-1',
      });

      expect(reg.request.status).toBe('PREPARED');

      // Falla ACK externo -> se marca UNKNOWN
      const unknownReq = await service.markRequestUnknown({
        requestId: reg.request.id,
        expectedRevision: 1n,
        recoveryEpoch: 1n,
        actorId: 'system-watchdog',
        sourceOperationId: 'op-watchdog-1',
        reason: 'ACK timeout from RecoveryAuthority',
      });
      expect(unknownReq.status).toBe('UNKNOWN');
      expect(unknownReq.currentRevision).toBe(2n);

      // Reconciliación posterior confirma sin mover el ancla ni los deadlines
      const reconciled = await service.reconcileUnknownRequest({
        requestId: reg.request.id,
        targetStatus: 'CONFIRMED',
        expectedRevision: 2n,
        recoveryEpoch: 1n,
        actorId: 'recovery-reconciler',
        sourceOperationId: 'op-reconcile-1',
        resolutionNotes: 'RecoveryAuthority journal verified entry committed',
        now: new Date('2026-10-13T08:00:00.000Z'),
      });

      expect(reconciled.status).toBe('CONFIRMED');
      expect(reconciled.currentRevision).toBe(3n);
      expect(reconciled.anchorTimestamp.toISOString()).toBe('2026-10-12T08:00:00.000Z');
      expect(reconciled.purgeStartedAt.toISOString()).toBe('2026-10-15T08:00:00.000Z');

      const projection = await service.getDeletionProjection({
        requestId: reg.request.id,
        now: new Date('2026-10-13T12:00:00.000Z'),
      });

      expect(projection).not.toBeNull();
      expect(projection!.isCancellable).toBe(true);
      expect(projection!.receipts.length).toBe(3);
      expect(projection!.receipts.map((r) => r.operationType)).toEqual([
        'PREPARE',
        'MARK_UNKNOWN',
        'RECONCILE',
      ]);
      expect(metrics.length).toBe(3);
    });
  });
});
