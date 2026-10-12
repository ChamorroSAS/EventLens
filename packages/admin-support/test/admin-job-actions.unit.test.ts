import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { AdminActorContext } from '@eventlens/identity';
import {
  AdminJobActionService,
  type AdminSupportAuditSink,
  type SqlTransaction,
  type TransactionRunner
} from '../src/index.js';

interface MockJobActionDb {
  jobs: Map<string, {
    id: string;
    status: string;
    cancelled: boolean;
    lease_until: Date | null;
  }>;
  receipts: Map<string, {
    id: string;
    job_id: string;
    action: string;
    reason: string;
    principal_id: string;
    idempotency_key: string;
    previous_status: string;
    new_status: string;
    created_at: Date;
  }>;
}

function createMockRunner(db: MockJobActionDb): TransactionRunner {
  return {
    async run<T>(callback: (tx: SqlTransaction) => Promise<T>): Promise<T> {
      const tx: SqlTransaction = {
        async query<R extends object = object>(sql: string, ...params: unknown[]): Promise<R[]> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // Consulta de recibo de idempotencia
          if (normalized.includes('FROM admin_job_action_receipt WHERE idempotency_key = $1')) {
            const key = params[0] as string;
            const r = db.receipts.get(key);
            if (!r) return [] as R[];
            return [r] as unknown as R[];
          }

          // Consulta de job FOR UPDATE
          if (normalized.includes('FROM job_queue WHERE id = $1 FOR UPDATE')) {
            const id = params[0] as string;
            const j = db.jobs.get(id);
            if (!j) return [] as R[];
            return [
              {
                id: j.id,
                status: j.status,
                cancelled: j.cancelled,
                lease_until: j.lease_until
              }
            ] as unknown as R[];
          }

          return [] as R[];
        },

        async execute(sql: string, ...params: unknown[]): Promise<number> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // UPDATE job_queue RETRY
          if (normalized.includes('UPDATE job_queue SET status = \'PENDING\'')) {
            const id = params[0] as string;
            const j = db.jobs.get(id);
            if (j) {
              j.status = 'PENDING';
              j.cancelled = false;
              j.lease_until = null;
            }
            return 1;
          }

          // UPDATE job_queue CANCEL
          if (normalized.includes('UPDATE job_queue SET status = \'CANCELLED\'')) {
            const id = params[0] as string;
            const j = db.jobs.get(id);
            if (j) {
              j.status = 'CANCELLED';
              j.cancelled = true;
            }
            return 1;
          }

          // UPDATE job_queue MARK_DEAD
          if (normalized.includes('UPDATE job_queue SET status = \'DEAD\'')) {
            const id = params[0] as string;
            const j = db.jobs.get(id);
            if (j) {
              j.status = 'DEAD';
            }
            return 1;
          }

          // INSERT INTO admin_job_action_receipt
          if (normalized.includes('INSERT INTO admin_job_action_receipt')) {
            const [id, job_id, action, reason, principal_id, idempotency_key, previous_status, new_status] = params;
            db.receipts.set(idempotency_key as string, {
              id: id as string,
              job_id: job_id as string,
              action: action as string,
              reason: reason as string,
              principal_id: principal_id as string,
              idempotency_key: idempotency_key as string,
              previous_status: previous_status as string,
              new_status: new_status as string,
              created_at: new Date()
            });
            return 1;
          }

          return 0;
        }
      };

      return callback(tx);
    }
  };
}

function createValidAdminContext(): AdminActorContext {
  return {
    actorType: 'ADMIN_HUMAN',
    principalId: randomUUID(),
    identifier: 'admin-action@eventlens.test',
    sessionId: randomUUID(),
    authTime: new Date(),
    credentialRevision: 1n,
    adminAuthRevision: 1n,
    sessionWatermark: 1n,
    recoveryEpoch: 1n
  };
}

describe('EL-TK-149: AdminJobActionService (Unit Tests)', () => {
  let db: MockJobActionDb;
  let auditSink: AdminSupportAuditSink;
  let service: AdminJobActionService;
  let validAdminContext: AdminActorContext;

  const deadJobId = randomUUID();
  const pendingJobId = randomUUID();
  const failedJobId = randomUUID();
  const completedJobId = randomUUID();
  const processingJobId = randomUUID();

  beforeEach(() => {
    validAdminContext = createValidAdminContext();

    db = {
      jobs: new Map([
        [
          deadJobId,
          {
            id: deadJobId,
            status: 'DEAD',
            cancelled: false,
            lease_until: null
          }
        ],
        [
          pendingJobId,
          {
            id: pendingJobId,
            status: 'PENDING',
            cancelled: false,
            lease_until: null
          }
        ],
        [
          failedJobId,
          {
            id: failedJobId,
            status: 'FAILED',
            cancelled: false,
            lease_until: null
          }
        ],
        [
          completedJobId,
          {
            id: completedJobId,
            status: 'COMPLETED',
            cancelled: false,
            lease_until: null
          }
        ],
        [
          processingJobId,
          {
            id: processingJobId,
            status: 'PROCESSING',
            cancelled: false,
            lease_until: new Date(Date.now() + 60000) // Lease activo en el futuro
          }
        ]
      ]),
      receipts: new Map()
    };

    auditSink = {
      record: vi.fn(async () => {})
    };

    service = new AdminJobActionService(createMockRunner(db), auditSink);
  });

  describe('Criterio 1: Reintentar job DEAD elegible con motivo operativo', () => {
    it('Ejecuta RETRY sobre job DEAD, actualiza estado a PENDING y registra recibo', async () => {
      const result = await service.executeAction({
        actorContext: validAdminContext,
        jobId: deadJobId,
        action: 'RETRY',
        reason: 'Reintento autorizado tras recuperación de storage',
        idempotencyKey: 'idem_retry_001'
      });

      expect(result.outcome).toBe('EXECUTED');
      expect(result.jobId).toBe(deadJobId);
      expect(result.action).toBe('RETRY');
      expect(result.previousStatus).toBe('DEAD');
      expect(result.newStatus).toBe('PENDING');

      const jobInDb = db.jobs.get(deadJobId);
      expect(jobInDb?.status).toBe('PENDING');
      expect(jobInDb?.cancelled).toBe(false);
      expect(db.receipts.size).toBe(1);
    });

    it('Ejecuta RETRY sobre job FAILED', async () => {
      const result = await service.executeAction({
        actorContext: validAdminContext,
        jobId: failedJobId,
        action: 'RETRY',
        reason: 'Error transitorio resuelto por soporte',
        idempotencyKey: 'idem_retry_failed_001'
      });

      expect(result.outcome).toBe('EXECUTED');
      expect(result.previousStatus).toBe('FAILED');
      expect(result.newStatus).toBe('PENDING');
    });
  });

  describe('Criterio 2: Denegación ante estado incompatible o job bloqueado', () => {
    it('Rechaza RETRY sobre job COMPLETED (INCOMPATIBLE_JOB_STATUS)', async () => {
      await expect(
        service.executeAction({
          actorContext: validAdminContext,
          jobId: completedJobId,
          action: 'RETRY',
          reason: 'Intento inválido de reintentar trabajo finalizado',
          idempotencyKey: 'idem_bad_retry'
        })
      ).rejects.toMatchObject({ code: 'INCOMPATIBLE_JOB_STATUS' });
    });

    it('Rechaza CANCEL sobre job en PROCESSING con lease activo (JOB_LOCKED_OR_PROCESSING)', async () => {
      await expect(
        service.executeAction({
          actorContext: validAdminContext,
          jobId: processingJobId,
          action: 'CANCEL',
          reason: 'Cancelación rechazada por estar en ejecución activa',
          idempotencyKey: 'idem_cancel_processing'
        })
      ).rejects.toMatchObject({ code: 'JOB_LOCKED_OR_PROCESSING' });
    });

    it('Rechaza MARK_DEAD sobre job DEAD ya finalizado (INCOMPATIBLE_JOB_STATUS)', async () => {
      await expect(
        service.executeAction({
          actorContext: validAdminContext,
          jobId: deadJobId,
          action: 'MARK_DEAD',
          reason: 'Ya está muerto',
          idempotencyKey: 'idem_mark_dead_invalid'
        })
      ).rejects.toMatchObject({ code: 'INCOMPATIBLE_JOB_STATUS' });
    });
  });

  describe('Criterio 3: Idempotencia y repetición de comandos', () => {
    it('Llamadas repetidas devuelven IDEMPOTENT_REPLAY sin duplicar mutaciones ni recibos', async () => {
      const first = await service.executeAction({
        actorContext: validAdminContext,
        jobId: deadJobId,
        action: 'RETRY',
        reason: 'Reintento inicial con idempotencia',
        idempotencyKey: 'idem_replay_test_01'
      });
      expect(first.outcome).toBe('EXECUTED');

      const second = await service.executeAction({
        actorContext: validAdminContext,
        jobId: deadJobId,
        action: 'RETRY',
        reason: 'Reintento inicial con idempotencia',
        idempotencyKey: 'idem_replay_test_01'
      });
      expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(second.newStatus).toBe(first.newStatus);
      expect(db.receipts.size).toBe(1);
    });

    it('Rechaza con IDEMPOTENCY_CONFLICT si se reusa la clave con acción o job discordante', async () => {
      await service.executeAction({
        actorContext: validAdminContext,
        jobId: deadJobId,
        action: 'RETRY',
        reason: 'Reintento legítimo',
        idempotencyKey: 'idem_conflict_test'
      });

      await expect(
        service.executeAction({
          actorContext: validAdminContext,
          jobId: pendingJobId, // Diferente job
          action: 'CANCEL',
          reason: 'Otro comando con misma clave',
          idempotencyKey: 'idem_conflict_test'
        })
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    });
  });

  describe('Acciones CANCEL y MARK_DEAD en estados permitidos', () => {
    it('Cancela exitosamente un job en estado PENDING', async () => {
      const result = await service.executeAction({
        actorContext: validAdminContext,
        jobId: pendingJobId,
        action: 'CANCEL',
        reason: 'Cancelación preventiva solicitada por organizador',
        idempotencyKey: 'idem_cancel_pending_01'
      });

      expect(result.outcome).toBe('EXECUTED');
      expect(result.previousStatus).toBe('PENDING');
      expect(result.newStatus).toBe('CANCELLED');

      const jobInDb = db.jobs.get(pendingJobId);
      expect(jobInDb?.status).toBe('CANCELLED');
      expect(jobInDb?.cancelled).toBe(true);
    });

    it('Marca como DEAD un job en estado FAILED', async () => {
      const result = await service.executeAction({
        actorContext: validAdminContext,
        jobId: failedJobId,
        action: 'MARK_DEAD',
        reason: 'Fallo definitivo identificado, no reintentar',
        idempotencyKey: 'idem_mark_dead_01'
      });

      expect(result.outcome).toBe('EXECUTED');
      expect(result.previousStatus).toBe('FAILED');
      expect(result.newStatus).toBe('DEAD');

      const jobInDb = db.jobs.get(failedJobId);
      expect(jobInDb?.status).toBe('DEAD');
    });
  });

  describe('Validaciones y control de permisos', () => {
    it('Rechaza con UNAUTHORIZED si actorContext no es proporcionado', async () => {
      await expect(
        service.executeAction({
          actorContext: null as any,
          jobId: deadJobId,
          action: 'RETRY',
          reason: 'Motivo válido',
          idempotencyKey: 'idem_no_actor'
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('Rechaza con UNAUTHORIZED si actorType no es ADMIN_HUMAN', async () => {
      await expect(
        service.executeAction({
          actorContext: { ...validAdminContext, actorType: 'ORGANIZER_HUMAN' as any },
          jobId: deadJobId,
          action: 'RETRY',
          reason: 'Motivo válido',
          idempotencyKey: 'idem_wrong_role'
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('Rechaza con INVALID_ARGUMENT si motivo es menor a 5 caracteres', async () => {
      await expect(
        service.executeAction({
          actorContext: validAdminContext,
          jobId: deadJobId,
          action: 'RETRY',
          reason: 'abc', // Demasiado corto
          idempotencyKey: 'idem_short_reason'
        })
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('Rechaza con NOT_FOUND si el job no existe', async () => {
      await expect(
        service.executeAction({
          actorContext: validAdminContext,
          jobId: randomUUID(),
          action: 'RETRY',
          reason: 'Job no existente',
          idempotencyKey: 'idem_not_found'
        })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('Observabilidad y auditoría', () => {
    it('Registra evento de auditoría ADMIN_JOB_ACTION_EXECUTED con motivo y actor', async () => {
      await service.executeAction({
        actorContext: validAdminContext,
        jobId: deadJobId,
        action: 'RETRY',
        reason: 'Auditoría obligatoria de acción operativa',
        idempotencyKey: 'idem_audit_test'
      });

      expect(auditSink.record).toHaveBeenCalledTimes(1);
      expect(auditSink.record).toHaveBeenCalledWith(
        expect.objectContaining({
          procedure: 'ADMIN_JOB_ACTION_EXECUTED',
          principalId: validAdminContext.principalId
        })
      );
    });
  });
});
