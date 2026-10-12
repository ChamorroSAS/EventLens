import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { AdminActorContext } from '@eventlens/identity';
import {
  AdminJobInspectionService,
  sanitizeTechnicalError,
  calculateJobCapabilities,
  type AdminSupportAuditSink,
  type SqlTransaction,
  type TransactionRunner
} from '../src/index.js';

interface MockJobDb {
  jobs: Map<string, any>;
  attempts: Map<string, any[]>;
}

function createMockRunner(db: MockJobDb): TransactionRunner {
  return {
    async run<T>(callback: (tx: SqlTransaction) => Promise<T>): Promise<T> {
      const tx: SqlTransaction = {
        async query<R extends object = object>(sql: string, ...params: unknown[]): Promise<R[]> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // Conteo total
          if (normalized.includes('SELECT COUNT(*)::bigint AS total FROM job_queue')) {
            let total = 0;
            const resourceRef = params[0] as string | undefined;

            for (const j of db.jobs.values()) {
              if (resourceRef && !j.resource_ref.includes(resourceRef.replaceAll('%', ''))) {
                continue;
              }
              total++;
            }
            return [{ total: total.toString() }] as unknown as R[];
          }

          // Detalle de un job por ID
          if (normalized.includes('WHERE j.id = $1')) {
            const jobId = params[0] as string;
            const j = db.jobs.get(jobId);
            if (!j) return [] as R[];
            return [
              {
                id: j.id,
                type: j.type,
                status: j.status,
                queue: j.queue,
                priority: j.priority,
                resource_ref: j.resource_ref,
                attempt: j.attempt,
                available_at: j.available_at,
                deadline: j.deadline,
                cancelled: j.cancelled,
                last_result: null
              }
            ] as unknown as R[];
          }

          // Consulta de lista de jobs
          if (normalized.includes('SELECT j.id::text AS id, j.type AS type')) {
            let rows: any[] = [];
            const resourceRef = params[0] as string | undefined;

            for (const j of db.jobs.values()) {
              if (resourceRef && !j.resource_ref.includes(resourceRef.replaceAll('%', ''))) {
                continue;
              }
              const atts = db.attempts.get(j.id) ?? [];
              const lastResult = atts.length > 0 ? atts[atts.length - 1].result : null;

              rows.push({
                id: j.id,
                type: j.type,
                status: j.status,
                queue: j.queue,
                priority: j.priority,
                resource_ref: j.resource_ref,
                attempt: j.attempt,
                available_at: j.available_at,
                deadline: j.deadline,
                cancelled: j.cancelled,
                last_result: lastResult
              });
            }

            // Paginación
            const limit = (params[params.length - 2] as number) ?? 20;
            const offset = (params[params.length - 1] as number) ?? 0;
            return rows.slice(offset, offset + limit) as unknown as R[];
          }

          // Historial de attempts de un job
          if (normalized.includes('FROM job_attempt a WHERE a.job_id = $1')) {
            const jobId = params[0] as string;
            const atts = db.attempts.get(jobId) ?? [];
            return atts as unknown as R[];
          }

          return [] as R[];
        },
        async execute(): Promise<number> {
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
    identifier: 'admin-sec@eventlens.test',
    sessionId: randomUUID(),
    authTime: new Date(),
    credentialRevision: 1n,
    adminAuthRevision: 1n,
    sessionWatermark: 1n,
    recoveryEpoch: 1n
  };
}

describe('EL-TK-148: AdminJobInspectionService (Unit Tests)', () => {
  let db: MockJobDb;
  let auditSink: AdminSupportAuditSink;
  let service: AdminJobInspectionService;
  let validAdminContext: AdminActorContext;

  const eventId = randomUUID();
  const job1Id = randomUUID();
  const jobDeadId = randomUUID();

  beforeEach(() => {
    validAdminContext = createValidAdminContext();

    db = {
      jobs: new Map([
        [
          job1Id,
          {
            id: job1Id,
            type: 'MEDIA_INSPECTION',
            status: 'PROCESSING',
            queue: 'media-processing',
            priority: 5,
            resource_ref: `event:${eventId}/media:4001`,
            attempt: 1,
            available_at: new Date('2026-10-12T10:00:00Z'),
            deadline: new Date('2026-10-12T10:30:00Z'),
            cancelled: false
          }
        ],
        [
          jobDeadId,
          {
            id: jobDeadId,
            type: 'MEDIA_PROCESSING',
            status: 'DEAD',
            queue: 'media-processing',
            priority: 10,
            resource_ref: `event:${eventId}/media:4002`,
            attempt: 3,
            available_at: new Date('2026-10-12T09:00:00Z'),
            deadline: null,
            cancelled: false
          }
        ]
      ]),
      attempts: new Map([
        [
          job1Id,
          [
            {
              number: 1,
              started_at: new Date('2026-10-12T10:00:05Z'),
              ended_at: null,
              result: null
            }
          ]
        ],
        [
          jobDeadId,
          [
            {
              number: 1,
              started_at: new Date('2026-10-12T09:01:00Z'),
              ended_at: new Date('2026-10-12T09:02:00Z'),
              result: 'Connection error to postgresql://user:superSecretPass@db.internal:5432/eventlens'
            },
            {
              number: 2,
              started_at: new Date('2026-10-12T09:05:00Z'),
              ended_at: new Date('2026-10-12T09:06:00Z'),
              result: 'Storage error at /workspace/packages/media-execution/temp.mp4 with token=bearer999xyz'
            },
            {
              number: 3,
              started_at: new Date('2026-10-12T09:10:00Z'),
              ended_at: new Date('2026-10-12T09:11:00Z'),
              result: 'Fatal decode error: Corrupt MP4 header at offset 0x44'
            }
          ]
        ]
      ])
    };

    auditSink = {
      record: vi.fn(async () => {})
    };

    service = new AdminJobInspectionService(createMockRunner(db), auditSink);
  });

  describe('Función sanitizeTechnicalError', () => {
    it('Oculta contraseñas en URLs de base de datos', () => {
      const err = 'Failed to connect to postgresql://admin:P@ssword123@10.0.0.5:5432/eventlens';
      const clean = sanitizeTechnicalError(err);
      expect(clean).toContain('[REDACTED_DATABASE_URL]');
      expect(clean).not.toContain('P@ssword123');
    });

    it('Oculta tokens, secrets y passwords', () => {
      const err = 'Auth failed: token=abc123456xyz and secret: topSecretValue789';
      const clean = sanitizeTechnicalError(err);
      expect(clean).toContain('[REDACTED_SECRET]');
      expect(clean).not.toContain('abc123456xyz');
      expect(clean).not.toContain('topSecretValue789');
    });

    it('Oculta URLs firmadas con Signature de S3', () => {
      const err = 'Download failed from https://s3.local/bucket/photo.jpg?Signature=ab897cd65e&Expires=170000';
      const clean = sanitizeTechnicalError(err);
      expect(clean).toContain('[REDACTED_SIGNED_URL]');
      expect(clean).not.toContain('Signature=ab897cd65e');
    });

    it('Oculta rutas absolutas del host', () => {
      const err = 'File not found at /workspace/apps/api/temp/file.bin';
      const clean = sanitizeTechnicalError(err);
      expect(clean).toContain('[PATH_REDACTED]');
      expect(clean).not.toContain('/workspace/apps/api/temp/file.bin');
    });
  });

  describe('Criterio 1: Consulta de lista de jobs filtrada por recurso', () => {
    it('Devuelve estados, colas e intentos sanitizados para jobs existentes', async () => {
      const result = await service.queryJobs({
        actorContext: validAdminContext,
        resourceRef: eventId,
        page: 1,
        limit: 10
      });

      expect(result.items).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.totalPages).toBe(1);

      const processingJob = result.items.find((j) => j.id === job1Id);
      expect(processingJob?.status).toBe('PROCESSING');
      expect(processingJob?.attempts).toBe(1);
      expect(processingJob?.capabilities.canCancel).toBe(false);

      const deadJob = result.items.find((j) => j.id === jobDeadId);
      expect(deadJob?.status).toBe('DEAD');
      expect(deadJob?.attempts).toBe(3);
      expect(deadJob?.lastError).toContain('Fatal decode error');
      expect(deadJob?.capabilities.canRetry).toBe(true);
    });
  });

  describe('Criterio 2: Detalle de job DEAD con causa técnica sanitizada', () => {
    it('Presenta historial de attempts sanitizado y capacidades para job DEAD', async () => {
      const detail = await service.getJobDetail({
        actorContext: validAdminContext,
        jobId: jobDeadId
      });

      expect(detail.id).toBe(jobDeadId);
      expect(detail.status).toBe('DEAD');
      expect(detail.attempts).toBe(3);
      expect(detail.sanitizedError).toBe('Fatal decode error: Corrupt MP4 header at offset 0x44');
      expect(detail.attemptsHistory).toHaveLength(3);

      // Attempt 1 tenía password oculto
      expect(detail.attemptsHistory[0].result).toContain('[REDACTED_DATABASE_URL]');
      expect(detail.attemptsHistory[0].result).not.toContain('superSecretPass');

      // Attempt 2 tenía path y bearer ocultos
      expect(detail.attemptsHistory[1].result).toContain('[PATH_REDACTED]');
      expect(detail.attemptsHistory[1].result).toContain('[REDACTED_SECRET]');
      expect(detail.attemptsHistory[1].result).not.toContain('bearer999xyz');

      // Capacidades permitidas para DEAD
      expect(detail.capabilities.canRetry).toBe(true);
      expect(detail.capabilities.canCancel).toBe(false);
      expect(detail.capabilities.canMarkDead).toBe(false);
    });
  });

  describe('Criterio 3: Estado vacío distinguible de error cuando no hay jobs', () => {
    it('Devuelve items vacío y total 0 cuando el recurso no tiene jobs asociados', async () => {
      const result = await service.queryJobs({
        actorContext: validAdminContext,
        resourceRef: 'recurso_sin_jobs_404',
        page: 1,
        limit: 10
      });

      expect(result.items).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });
  });

  describe('Validaciones y control de permisos', () => {
    it('Rechaza si actorContext no es proporcionado (UNAUTHORIZED)', async () => {
      await expect(
        service.queryJobs({
          actorContext: null as any,
          resourceRef: eventId
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('Rechaza si actorType no es ADMIN_HUMAN (UNAUTHORIZED)', async () => {
      await expect(
        service.getJobDetail({
          actorContext: { ...validAdminContext, actorType: 'ORGANIZER_HUMAN' as any },
          jobId: job1Id
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('Rechaza si jobId no es un UUID válido (INVALID_ARGUMENT)', async () => {
      await expect(
        service.getJobDetail({
          actorContext: validAdminContext,
          jobId: 'bad-uuid-format'
        })
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('Rechaza si el job no existe en la base de datos (INVALID_ARGUMENT)', async () => {
      await expect(
        service.getJobDetail({
          actorContext: validAdminContext,
          jobId: randomUUID()
        })
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
  });

  describe('Observabilidad y auditoría', () => {
    it('Registra eventos ADMIN_JOB_LIST_VIEWED y ADMIN_JOB_DETAIL_VIEWED sin datos sensibles', async () => {
      await service.queryJobs({
        actorContext: validAdminContext,
        resourceRef: eventId
      });

      expect(auditSink.record).toHaveBeenCalledWith(
        expect.objectContaining({
          procedure: 'ADMIN_JOB_LIST_VIEWED',
          principalId: validAdminContext.principalId
        })
      );

      await service.getJobDetail({
        actorContext: validAdminContext,
        jobId: job1Id
      });

      expect(auditSink.record).toHaveBeenCalledWith(
        expect.objectContaining({
          procedure: 'ADMIN_JOB_DETAIL_VIEWED',
          principalId: validAdminContext.principalId
        })
      );
    });
  });
});
