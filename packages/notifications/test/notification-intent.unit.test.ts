import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  NotificationIntentService,
  NotificationError,
  type NotificationAuditRecord,
  type NotificationAuditSink,
  type DomainFactActorContext,
  type RecordDomainFactCommand
} from '../src/index.js';

interface InMemoryIntentRow {
  id: string;
  dedup_key: string;
  recipient_ref: string;
  recipient_email?: string | null;
  notification_type: string;
  resource_ref: string;
  status: string;
  payload: string;
  effective_at: Date | string;
  expires_at?: Date | string | null;
  superseded_at?: Date | string | null;
  superseded_by?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

class MockTransactionRunner implements TransactionRunner {
  public intents: InMemoryIntentRow[] = [];

  async run<T>(work: (tx: SqlTransaction) => Promise<T>): Promise<T> {
    const tx: SqlTransaction = {
      query: async <R extends object>(sql: string, ...parameters: unknown[]): Promise<R[]> => {
        // Query by dedup_key
        if (sql.includes('FROM notification_intent') && sql.includes('WHERE dedup_key = $1')) {
          const key = parameters[0] as string;
          const rows = this.intents.filter((i) => i.dedup_key === key);
          return rows as unknown as R[];
        }

        // Query by id
        if (sql.includes('FROM notification_intent') && sql.includes('WHERE id = $1')) {
          const id = parameters[0] as string;
          const rows = this.intents.filter((i) => i.id === id);
          return rows as unknown as R[];
        }

        // Query active by recipient_ref
        if (sql.includes('FROM notification_intent') && sql.includes('WHERE recipient_ref = $1')) {
          const recipient = parameters[0] as string;
          const now = new Date();
          const rows = this.intents.filter(
            (i) =>
              i.recipient_ref === recipient &&
              i.status === 'PENDING' &&
              (!i.expires_at || new Date(i.expires_at) > now)
          );
          return rows as unknown as R[];
        }

        return [] as R[];
      },

      execute: async (sql: string, ...parameters: unknown[]): Promise<number> => {
        // Insert intent
        if (sql.includes('INSERT INTO notification_intent')) {
          const [
            id,
            dedup_key,
            recipient_ref,
            recipient_email,
            notification_type,
            resource_ref,
            payload,
            effective_at,
            expires_at,
            created_at
          ] = parameters as [
            string,
            string,
            string,
            string | null,
            string,
            string,
            string,
            Date,
            Date | null,
            Date
          ];

          if (this.intents.some((i) => i.dedup_key === dedup_key)) {
            return 0; // ON CONFLICT DO NOTHING
          }

          this.intents.push({
            id,
            dedup_key,
            recipient_ref,
            recipient_email,
            notification_type,
            resource_ref,
            status: 'PENDING',
            payload,
            effective_at,
            expires_at,
            superseded_at: null,
            superseded_by: null,
            created_at,
            updated_at: created_at
          });
          return 1;
        }

        // Update status = 'SUPERSEDED' by dedup_key
        if (sql.includes('UPDATE notification_intent') && sql.includes('WHERE dedup_key = $3')) {
          const [now, superseded_by, dedup_key] = parameters as [Date, string, string];
          let updated = 0;
          for (const item of this.intents) {
            if (item.dedup_key === dedup_key && item.status === 'PENDING') {
              item.status = 'SUPERSEDED';
              item.superseded_at = now;
              item.superseded_by = superseded_by;
              item.updated_at = now;
              updated++;
            }
          }
          return updated;
        }

        // Update status = 'SUPERSEDED' by id
        if (sql.includes('UPDATE notification_intent') && sql.includes('WHERE id = $3')) {
          const [now, superseded_by, id] = parameters as [Date, string, string];
          const found = this.intents.find((i) => i.id === id);
          if (found) {
            found.status = 'SUPERSEDED';
            found.superseded_at = now;
            found.superseded_by = superseded_by;
            found.updated_at = now;
            return 1;
          }
          return 0;
        }

        return 0;
      }
    };

    return work(tx);
  }
}

describe('NotificationIntentService (Unit Tests — EL-TK-156)', () => {
  let runner: MockTransactionRunner;
  let audits: NotificationAuditRecord[];
  let auditSink: NotificationAuditSink;
  let service: NotificationIntentService;

  const systemActor: DomainFactActorContext = {
    actorType: 'SYSTEM',
    actorId: 'system-domain-bus'
  };

  beforeEach(() => {
    runner = new MockTransactionRunner();
    audits = [];
    auditSink = {
      record: async (record) => {
        audits.push(record);
      }
    };
    service = new NotificationIntentService(runner, auditSink);
  });

  describe('Escenario 1: Creación de intención única desde hecho de dominio nuevo', () => {
    it('crea exitosamente una intención de notificación con payload sanitizado y estado PENDING', async () => {
      const command: RecordDomainFactCommand = {
        actorContext: systemActor,
        dedupKey: 'event-upcoming:evt-100:24h',
        recipientRef: 'acc-organizer-01',
        recipientEmail: 'organizer@eventlens.test',
        notificationType: 'EVENT_UPCOMING',
        resourceRef: 'evt-100',
        payload: {
          eventName: 'Gala de Fin de Año',
          scheduledHoursRemaining: 24,
          actionUrl: '/events/evt-100'
        }
      };

      const result = await service.recordDomainFact(command);

      expect(result.outcome).toBe('CREATED');
      expect(result.intent.id).toBeDefined();
      expect(result.intent.dedupKey).toBe('event-upcoming:evt-100:24h');
      expect(result.intent.recipientRef).toBe('acc-organizer-01');
      expect(result.intent.recipientEmail).toBe('organizer@eventlens.test');
      expect(result.intent.notificationType).toBe('EVENT_UPCOMING');
      expect(result.intent.resourceRef).toBe('evt-100');
      expect(result.intent.status).toBe('PENDING');
      expect(result.intent.payload).toEqual({
        eventName: 'Gala de Fin de Año',
        scheduledHoursRemaining: 24,
        actionUrl: '/events/evt-100'
      });
      expect(result.intent.supersededAt).toBeNull();
      expect(result.intent.supersededBy).toBeNull();

      // Verificar persistencia en runner
      expect(runner.intents).toHaveLength(1);
      expect(runner.intents[0].dedup_key).toBe('event-upcoming:evt-100:24h');

      // Verificar auditoría
      expect(audits).toHaveLength(1);
      expect(audits[0].action).toBe('INTENT_RECORDED');
      expect(audits[0].result).toBe('SUCCESS');
      expect(audits[0].recipientRef).toBe('acc-organizer-01');
    });
  });

  describe('Escenario 2: Reprocesamiento de hecho / deduplicación idempotente', () => {
    it('no duplica la intención si se recibe el mismo hecho de dominio y devuelve IDEMPOTENT_REPLAY', async () => {
      const command: RecordDomainFactCommand = {
        actorContext: systemActor,
        dedupKey: 'quota-alert:evt-100:80pct',
        recipientRef: 'acc-organizer-01',
        notificationType: 'CAPACITY_WARNING_80',
        resourceRef: 'evt-100',
        payload: {
          currentUsageMb: 800,
          limitMb: 1000,
          percentage: 80
        }
      };

      const first = await service.recordDomainFact(command);
      expect(first.outcome).toBe('CREATED');

      const second = await service.recordDomainFact(command);
      expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(second.intent.id).toBe(first.intent.id);
      expect(second.intent.dedupKey).toBe(first.intent.dedupKey);

      // Persistencia no debe duplicar filas
      expect(runner.intents).toHaveLength(1);

      // Auditoría registra el replay
      const replayAudit = audits.find((a) => a.action === 'IDEMPOTENT_REPLAY');
      expect(replayAudit).toBeDefined();
      expect(replayAudit?.result).toBe('IDEMPOTENT_REPLAY');
    });

    it('rechaza con IDEMPOTENCY_CONFLICT si la misma dedupKey intenta persistirse con payload contradictorio', async () => {
      const baseCommand: RecordDomainFactCommand = {
        actorContext: systemActor,
        dedupKey: 'export-ready:exp-99',
        recipientRef: 'acc-organizer-01',
        notificationType: 'EXPORT_AVAILABLE',
        resourceRef: 'exp-99',
        payload: {
          downloadId: 'zip-01',
          fileCount: 45
        }
      };

      await service.recordDomainFact(baseCommand);

      const conflictingCommand: RecordDomainFactCommand = {
        ...baseCommand,
        payload: {
          downloadId: 'zip-02',
          fileCount: 999
        }
      };

      await expect(service.recordDomainFact(conflictingCommand)).rejects.toThrow(
        NotificationError
      );

      await expect(service.recordDomainFact(conflictingCommand)).rejects.toThrow(
        /conflicting parameters/i
      );

      // Solo la primera fila permanece
      expect(runner.intents).toHaveLength(1);
    });
  });

  describe('Escenario 3: Hecho queda obsoleto antes de entrega (superseded/cancelled)', () => {
    it('invalida intenciones previas atómicamente cuando el nuevo hecho declara supersedesDedupKeys', async () => {
      // 1. Crear intención de suspensión de evento
      await service.recordDomainFact({
        actorContext: systemActor,
        dedupKey: 'lifecycle:evt-100:suspended',
        recipientRef: 'acc-organizer-01',
        notificationType: 'EVENT_SUSPENDED',
        resourceRef: 'evt-100',
        payload: { reason: 'administrative_review' }
      });

      expect(runner.intents[0].status).toBe('PENDING');

      // 2. Evento es reactivado, declarando obsoleta la suspensión
      const reactivatedResult = await service.recordDomainFact({
        actorContext: systemActor,
        dedupKey: 'lifecycle:evt-100:reactivated',
        recipientRef: 'acc-organizer-01',
        notificationType: 'EVENT_REACTIVATED',
        resourceRef: 'evt-100',
        payload: { status: 'PUBLISHED' },
        supersedesDedupKeys: ['lifecycle:evt-100:suspended']
      });

      expect(reactivatedResult.outcome).toBe('CREATED');
      expect(reactivatedResult.supersededCount).toBe(1);

      // La intención original queda SUPERSEDED y ya no como riesgo vigente
      const oldIntent = await service.getIntentByDedupKey('lifecycle:evt-100:suspended');
      expect(oldIntent?.status).toBe('SUPERSEDED');
      expect(oldIntent?.supersededBy).toContain('SUPERSEDED_BY_lifecycle:evt-100:reactivated');
      expect(oldIntent?.supersededAt).toBeInstanceOf(Date);
    });

    it('permite revalidar una intención antes de envío y marcarla como obsoleta si la condición caducó', async () => {
      const result = await service.recordDomainFact({
        actorContext: systemActor,
        dedupKey: 'quota-risk:evt-200:80',
        recipientRef: 'acc-organizer-02',
        notificationType: 'CAPACITY_WARNING_80',
        resourceRef: 'evt-200',
        payload: { current: 80 }
      });

      expect(result.intent.status).toBe('PENDING');

      // Simular que el organizador amplió cuota o borró archivos y el riesgo ya no aplica
      const revalidated = await service.revalidateIntent(
        result.intent.id,
        () => false, // No longer valid
        'ORGANIZER_INCREASED_CAPACITY'
      );

      expect(revalidated.status).toBe('SUPERSEDED');
      expect(revalidated.supersededBy).toBe('ORGANIZER_INCREASED_CAPACITY');
      expect(revalidated.supersededAt).toBeInstanceOf(Date);
    });

    it('supersedeIntent manual actualiza el estado y previene presentar un riesgo obsoleto', async () => {
      const result = await service.recordDomainFact({
        actorContext: systemActor,
        dedupKey: 'notice:evt-300:temp',
        recipientRef: 'acc-organizer-03',
        notificationType: 'ACCOUNT_SECURITY',
        resourceRef: 'acc-organizer-03',
        payload: { action: 'NEW_LOGIN' }
      });

      const superseded = await service.supersedeIntent({
        actorContext: systemActor,
        intentId: result.intent.id,
        reason: 'SESSION_REVOKED_AND_ACKNOWLEDGED'
      });

      expect(superseded.status).toBe('SUPERSEDED');
      expect(superseded.supersededBy).toBe('SESSION_REVOKED_AND_ACKNOWLEDGED');

      // Consultar avisos activos excluye la intención obsoleta
      const activeIntents = await service.findActiveIntentsByRecipient('acc-organizer-03');
      expect(activeIntents).toHaveLength(0);
    });
  });

  describe('Validaciones, permisos y casos de error', () => {
    it('falla con INVALID_RECIPIENT si destinatario está ausente o vacío', async () => {
      await expect(
        service.recordDomainFact({
          actorContext: systemActor,
          dedupKey: 'test-key-1',
          recipientRef: '   ',
          notificationType: 'EVENT_UPCOMING',
          resourceRef: 'evt-01',
          payload: { foo: 'bar' }
        })
      ).rejects.toThrow(NotificationError);

      const rejectAudit = audits.find((a) => a.action === 'RECORD_INTENT_REJECTED');
      expect(rejectAudit).toBeDefined();
    });

    it('falla con INVALID_NOTIFICATION_TYPE si tipo está vacío', async () => {
      await expect(
        service.recordDomainFact({
          actorContext: systemActor,
          dedupKey: 'test-key-2',
          recipientRef: 'acc-01',
          notificationType: '',
          resourceRef: 'evt-01',
          payload: { foo: 'bar' }
        })
      ).rejects.toThrow(/Notification type is required/i);
    });

    it('falla con INVALID_RESOURCE si resourceRef está vacío', async () => {
      await expect(
        service.recordDomainFact({
          actorContext: systemActor,
          dedupKey: 'test-key-3',
          recipientRef: 'acc-01',
          notificationType: 'EVENT_UPCOMING',
          resourceRef: '',
          payload: { foo: 'bar' }
        })
      ).rejects.toThrow(/Resource reference is required/i);
    });

    it('falla con INVALID_DEDUP_KEY si dedupKey está vacío', async () => {
      await expect(
        service.recordDomainFact({
          actorContext: systemActor,
          dedupKey: '',
          recipientRef: 'acc-01',
          notificationType: 'EVENT_UPCOMING',
          resourceRef: 'evt-01',
          payload: { foo: 'bar' }
        })
      ).rejects.toThrow(/Dedup key is required/i);
    });

    it('falla con UNAUTHORIZED si actorContext no está presente', async () => {
      await expect(
        service.recordDomainFact({
          actorContext: null as any,
          dedupKey: 'test-key-4',
          recipientRef: 'acc-01',
          notificationType: 'EVENT_UPCOMING',
          resourceRef: 'evt-01',
          payload: { foo: 'bar' }
        })
      ).rejects.toThrow(/Authorized actor context is required/i);
    });
  });
});
