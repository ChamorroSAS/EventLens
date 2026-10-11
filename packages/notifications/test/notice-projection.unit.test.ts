import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  NoticeProjectionService,
  NotificationError,
  type InAppNoticeProjection,
  type NotificationIntentRecord
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
  effective_at: Date;
  expires_at?: Date | null;
  superseded_at?: Date | null;
  superseded_by?: string | null;
  created_at: Date;
  updated_at: Date;
}

class MockRunner implements TransactionRunner {
  public intents: InMemoryIntentRow[] = [];

  async run<T>(work: (tx: SqlTransaction) => Promise<T>): Promise<T> {
    const tx: SqlTransaction = {
      query: async <R extends object>(sql: string, ...parameters: unknown[]): Promise<R[]> => {
        const norm = sql.replace(/\s+/g, ' ');
        if (norm.includes('FROM notification_intent WHERE recipient_ref = $1')) {
          const recipientRef = parameters[0] as string;
          const asOf = (parameters[1] as Date) || new Date();
          const resourceRef = parameters[2] as string | undefined;

          let filtered = this.intents.filter((row) => {
            if (row.recipient_ref !== recipientRef) return false;
            if (row.status === 'SUPERSEDED' || row.status === 'CANCELLED') return false;
            if (row.expires_at && row.expires_at.getTime() <= asOf.getTime()) return false;
            if (row.effective_at.getTime() > asOf.getTime()) return false;
            if (resourceRef && row.resource_ref !== resourceRef) return false;
            return true;
          });

          // Order by effective_at DESC, created_at DESC
          filtered.sort((a, b) => {
            const diffEff = b.effective_at.getTime() - a.effective_at.getTime();
            if (diffEff !== 0) return diffEff;
            return b.created_at.getTime() - a.created_at.getTime();
          });

          return filtered as unknown as R[];
        }

        return [] as R[];
      },

      execute: async (): Promise<number> => 0
    };

    return work(tx);
  }
}

describe('NoticeProjectionService (Unit Tests — EL-TK-158)', () => {
  let runner: MockRunner;
  let service: NoticeProjectionService;

  beforeEach(() => {
    runner = new MockRunner();
    service = new NoticeProjectionService(runner);
  });

  function addSampleIntent(overrides?: Partial<InMemoryIntentRow>): InMemoryIntentRow {
    const id = overrides?.id ?? randomUUID();
    const row: InMemoryIntentRow = {
      id,
      dedup_key: overrides?.dedup_key ?? 'dedup-' + randomUUID(),
      recipient_ref: overrides?.recipient_ref ?? 'organizer-01',
      recipient_email: overrides?.recipient_email ?? 'org@eventlens.test',
      notification_type: overrides?.notification_type ?? 'CAPACITY_WARNING_80',
      resource_ref: overrides?.resource_ref ?? 'evt-100',
      status: overrides?.status ?? 'PENDING',
      payload: overrides?.payload ?? JSON.stringify({ current: 80, limit: 100 }),
      effective_at: overrides?.effective_at ?? new Date(Date.now() - 1000),
      expires_at: overrides?.expires_at ?? null,
      superseded_at: overrides?.superseded_at ?? null,
      superseded_by: overrides?.superseded_by ?? null,
      created_at: overrides?.created_at ?? new Date(Date.now() - 1000),
      updated_at: overrides?.updated_at ?? new Date(Date.now() - 1000)
    };
    runner.intents.push(row);
    return row;
  }

  describe('Escenario 1: Proyección de avisos autorizados y deduplicados', () => {
    it('proyecta avisos vigentes para el organizador con título, hecho, consecuencia, acción y severidad', async () => {
      addSampleIntent({
        recipient_ref: 'org-1',
        notification_type: 'CAPACITY_WARNING_80',
        resource_ref: 'evt-200',
        payload: JSON.stringify({ current: 80, limit: 100 })
      });

      const projection = await service.projectNoticesForOrganizer({
        recipientRef: 'org-1'
      });

      expect(projection.recipientRef).toBe('org-1');
      expect(projection.hasActiveNotices).toBe(true);
      expect(projection.totalCount).toBe(1);
      expect(projection.notices).toHaveLength(1);

      const notice = projection.notices[0];
      expect(notice.title).toBe('Capacidad al 80%');
      expect(notice.fact).toContain('80%');
      expect(notice.consequence).toContain('cargas de fotos y videos se pausarán');
      expect(notice.action.label).toBe('Gestionar capacidad');
      expect(notice.action.destination).toBe('/events/evt-200/capacity');
      expect(notice.severity).toBe('WARNING');
      expect(notice.resourceRef).toBe('evt-200');
    });

    it('aislamiento por destinatario: no proyecta avisos que pertenezcan a otros usuarios', async () => {
      addSampleIntent({ recipient_ref: 'org-other', resource_ref: 'evt-999' });

      const projection = await service.projectNoticesForOrganizer({
        recipientRef: 'org-me'
      });

      expect(projection.hasActiveNotices).toBe(false);
      expect(projection.totalCount).toBe(0);
      expect(projection.notices).toHaveLength(0);
    });

    it('filtra por resourceRef opcional cuando el organizador consulta el contexto de un evento específico', async () => {
      addSampleIntent({ recipient_ref: 'org-1', resource_ref: 'evt-A', notification_type: 'CAPACITY_WARNING_80' });
      addSampleIntent({ recipient_ref: 'org-1', resource_ref: 'evt-B', notification_type: 'EXPORT_AVAILABLE' });

      const projectionA = await service.projectNoticesForOrganizer({
        recipientRef: 'org-1',
        resourceRef: 'evt-A'
      });

      expect(projectionA.notices).toHaveLength(1);
      expect(projectionA.notices[0].resourceRef).toBe('evt-A');
      expect(projectionA.notices[0].notificationType).toBe('CAPACITY_WARNING_80');
    });

    it('deduplicación: si existen avisos repetidos del mismo tipo y recurso, proyecta únicamente el más reciente', async () => {
      const older = addSampleIntent({
        recipient_ref: 'org-1',
        resource_ref: 'evt-1',
        notification_type: 'CAPACITY_WARNING_80',
        created_at: new Date(Date.now() - 5000),
        effective_at: new Date(Date.now() - 5000),
        payload: JSON.stringify({ current: 80, limit: 100 })
      });

      const newer = addSampleIntent({
        recipient_ref: 'org-1',
        resource_ref: 'evt-1',
        notification_type: 'CAPACITY_WARNING_80',
        created_at: new Date(Date.now() - 1000),
        effective_at: new Date(Date.now() - 1000),
        payload: JSON.stringify({ current: 85, limit: 100 })
      });

      const projection = await service.projectNoticesForOrganizer({ recipientRef: 'org-1' });

      expect(projection.notices).toHaveLength(1);
      expect(projection.notices[0].intentId).toBe(newer.id);
      expect(projection.notices[0].fact).toContain('85');
    });
  });

  describe('Escenario 2: Estado vacío sin banner invasivo obligatorio', () => {
    it('cuando no existen avisos vigentes, retorna proyección limpia con notices vacío y hasActiveNotices false', async () => {
      const projection = await service.projectNoticesForOrganizer({
        recipientRef: 'org-empty'
      });

      expect(projection.recipientRef).toBe('org-empty');
      expect(projection.notices).toEqual([]);
      expect(projection.totalCount).toBe(0);
      expect(projection.hasActiveNotices).toBe(false);
      expect(projection.projectedAt).toBeInstanceOf(Date);
    });
  });

  describe('Escenario 3: Exclusión de avisos obsoletos o expirados', () => {
    it('excluye avisos marcados con status SUPERSEDED o CANCELLED', async () => {
      addSampleIntent({
        recipient_ref: 'org-1',
        notification_type: 'EVENT_SUSPENDED',
        status: 'SUPERSEDED',
        superseded_at: new Date()
      });

      addSampleIntent({
        recipient_ref: 'org-1',
        notification_type: 'EVENT_UPCOMING',
        status: 'CANCELLED'
      });

      const projection = await service.projectNoticesForOrganizer({ recipientRef: 'org-1' });
      expect(projection.notices).toHaveLength(0);
    });

    it('excluye avisos cuya fecha expires_at haya pasado', async () => {
      addSampleIntent({
        recipient_ref: 'org-1',
        notification_type: 'EXPORT_AVAILABLE',
        expires_at: new Date(Date.now() - 10000) // Expirado hace 10s
      });

      const projection = await service.projectNoticesForOrganizer({ recipientRef: 'org-1' });
      expect(projection.notices).toHaveLength(0);
    });

    it('excluye avisos cuya fecha effective_at sea futura', async () => {
      addSampleIntent({
        recipient_ref: 'org-1',
        notification_type: 'EVENT_UPCOMING',
        effective_at: new Date(Date.now() + 60000) // 1 minuto en el futuro
      });

      const projection = await service.projectNoticesForOrganizer({ recipientRef: 'org-1' });
      expect(projection.notices).toHaveLength(0);
    });
  });

  describe('Validaciones y semántica de severidad', () => {
    it('rechaza consulta si recipientRef es vacío o inválido con INVALID_RECIPIENT_REF', async () => {
      await expect(service.projectNoticesForOrganizer({ recipientRef: '' })).rejects.toThrow(
        NotificationError
      );
      await expect(
        service.projectNoticesForOrganizer({ recipientRef: '   ' })
      ).rejects.toMatchObject({ code: 'INVALID_RECIPIENT' });
    });

    it('asigna severidad CRITICAL a suspensión de evento y límite de capacidad 100%', () => {
      const intentSuspended: NotificationIntentRecord = {
        id: 'id-1',
        dedupKey: 'k-1',
        recipientRef: 'r-1',
        notificationType: 'EVENT_SUSPENDED',
        resourceRef: 'evt-1',
        status: 'PENDING',
        payload: {},
        effectiveAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const notice1 = service.mapIntentToNotice(intentSuspended);
      expect(notice1.severity).toBe('CRITICAL');

      const intentCap100: NotificationIntentRecord = {
        id: 'id-2',
        dedupKey: 'k-2',
        recipientRef: 'r-1',
        notificationType: 'CAPACITY_EXCEEDED_100',
        resourceRef: 'evt-1',
        status: 'PENDING',
        payload: {},
        effectiveAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const notice2 = service.mapIntentToNotice(intentCap100);
      expect(notice2.severity).toBe('CRITICAL');
    });

    it('asigna severidad WARNING a periodo de gracia, alerta 80% y alerta de seguridad', () => {
      const intentGrace: NotificationIntentRecord = {
        id: 'id-3',
        dedupKey: 'k-3',
        recipientRef: 'r-1',
        notificationType: 'EVENT_GRACE_PERIOD',
        resourceRef: 'evt-1',
        status: 'PENDING',
        payload: {},
        effectiveAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      expect(service.mapIntentToNotice(intentGrace).severity).toBe('WARNING');
    });

    it('soporta payload genérico seguro con valores por defecto ante hechos no catalogados', () => {
      const customIntent: NotificationIntentRecord = {
        id: 'id-custom',
        dedupKey: 'k-custom',
        recipientRef: 'r-1',
        notificationType: 'CUSTOM_SYSTEM_NOTICE',
        resourceRef: 'res-custom',
        status: 'PENDING',
        payload: {
          title: 'Aviso personalizado',
          fact: 'Se realizó un mantenimiento programado',
          consequence: 'No requiere acción',
          actionLabel: 'Ver estado',
          actionDestination: '/status',
          severity: 'INFO'
        },
        effectiveAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const notice = service.mapIntentToNotice(customIntent);
      expect(notice.title).toBe('Aviso personalizado');
      expect(notice.fact).toBe('Se realizó un mantenimiento programado');
      expect(notice.action.label).toBe('Ver estado');
      expect(notice.action.destination).toBe('/status');
      expect(notice.severity).toBe('INFO');
    });
  });
});
