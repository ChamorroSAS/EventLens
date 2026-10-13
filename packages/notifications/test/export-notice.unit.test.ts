import { describe, it, expect, beforeEach } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  ExportNoticeService,
  NotificationIntentService,
  NoticeProjectionService,
  EmailRenderer,
  NotificationError,
  type DomainFactActorContext,
  type NotificationAuditRecord,
  type NotificationAuditSink
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

        if (norm.includes('FROM notification_intent WHERE dedup_key = $1')) {
          const dedupKey = parameters[0] as string;
          const found = this.intents.filter((row) => row.dedup_key === dedupKey);
          return found as unknown as R[];
        }

        if (norm.includes('FROM notification_intent WHERE id = $1')) {
          const id = parameters[0] as string;
          const found = this.intents.filter((row) => row.id === id);
          return found as unknown as R[];
        }

        if (norm.includes('FROM notification_intent') && norm.includes('WHERE recipient_ref = $1')) {
          const recipientRef = parameters[0] as string;
          let results = this.intents.filter(
            (row) => row.recipient_ref === recipientRef && row.status !== 'SUPERSEDED' && row.status !== 'CANCELLED'
          );
          if (norm.includes('AND resource_ref = $3')) {
            const resourceRef = parameters[2] as string;
            results = results.filter((row) => row.resource_ref === resourceRef);
          }
          return results as unknown as R[];
        }

        return [] as R[];
      },

      execute: async (sql: string, ...parameters: unknown[]): Promise<number> => {
        const norm = sql.replace(/\s+/g, ' ');

        if (norm.includes('INSERT INTO notification_intent')) {
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

        if (norm.includes('UPDATE notification_intent SET status = \'SUPERSEDED\'')) {
          const now = parameters[0] as Date;
          const supersededBy = parameters[1] as string;
          const oldDedupKey = parameters[2] as string;

          let count = 0;
          for (const row of this.intents) {
            if (row.dedup_key === oldDedupKey && row.status === 'PENDING') {
              row.status = 'SUPERSEDED';
              row.superseded_by = supersededBy;
              row.superseded_at = now;
              row.updated_at = now;
              count++;
            }
          }
          return count;
        }

        return 0;
      }
    };
    return work(tx);
  }
}

describe('ExportNoticeService (EL-TK-161 Unit Tests)', () => {
  let runner: MockRunner;
  let intentService: NotificationIntentService;
  let noticeService: ExportNoticeService;
  let auditLogs: NotificationAuditRecord[];
  let auditSink: NotificationAuditSink;

  const actorContext: DomainFactActorContext = {
    actorType: 'SYSTEM',
    actorId: 'export-worker-1'
  };

  beforeEach(() => {
    runner = new MockRunner();
    auditLogs = [];
    auditSink = {
      record: async (record: NotificationAuditRecord) => {
        auditLogs.push(record);
      }
    };
    intentService = new NotificationIntentService(runner, auditSink);
    noticeService = new ExportNoticeService(intentService, auditSink);
  });

  it('Escenario 1: Dado export queda AVAILABLE, crea aviso con expiresAt real (48h) y datos de descarga consolidados', async () => {
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const result = await noticeService.generateExportNotice({
      actorContext,
      exportId: 'exp-001',
      eventId: 'evt-001',
      organizerRef: 'org-001',
      recipientEmail: 'organizer@eventlens.io',
      noticeType: 'EXPORT_AVAILABLE',
      generation: 1n,
      partCount: 2,
      totalSizeBytes: 10737418240n, // 10 GB
      expiresAt
    });

    expect(result.outcome).toBe('NOTICE_GENERATED');
    expect(result.intent).toBeDefined();
    expect(result.intent?.notificationType).toBe('EXPORT_AVAILABLE');
    expect(result.intent?.payload.title).toContain('Exportación de recuerdos lista');
    expect(result.intent?.payload.partCount).toBe(2);
    expect(result.intent?.payload.actionDestination).toBe('/events/evt-001/media');
    expect(result.intent?.payload.expiresAt).toBe(expiresAt.toISOString());
    expect(result.intent?.expiresAt?.getTime()).toBe(expiresAt.getTime());

    // Strict deduplication: idempotent replay
    const replay = await noticeService.generateExportNotice({
      actorContext,
      exportId: 'exp-001',
      eventId: 'evt-001',
      organizerRef: 'org-001',
      recipientEmail: 'organizer@eventlens.io',
      noticeType: 'EXPORT_AVAILABLE',
      generation: 1n,
      partCount: 2,
      totalSizeBytes: 10737418240n,
      expiresAt
    });
    expect(replay.outcome).toBe('IDEMPOTENT_REPLAY');
    expect(runner.intents).toHaveLength(1);
  });

  it('Escenario 2: Dado export expira o se invalida, el nuevo aviso supersede el aviso AVAILABLE previo', async () => {
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    // 1. Emit available notice
    await noticeService.generateExportNotice({
      actorContext,
      exportId: 'exp-002',
      eventId: 'evt-001',
      organizerRef: 'org-001',
      recipientEmail: 'organizer@eventlens.io',
      noticeType: 'EXPORT_AVAILABLE',
      generation: 1n,
      partCount: 1,
      expiresAt
    });
    expect(runner.intents[0].status).toBe('PENDING');

    // 2. Export expires after 48h
    const expireResult = await noticeService.generateExportNotice({
      actorContext,
      exportId: 'exp-002',
      eventId: 'evt-001',
      organizerRef: 'org-001',
      recipientEmail: 'organizer@eventlens.io',
      noticeType: 'EXPORT_EXPIRED',
      generation: 1n
    });

    expect(expireResult.outcome).toBe('NOTICE_GENERATED');
    expect(expireResult.supersededCount).toBe(1);
    expect(runner.intents[0].status).toBe('SUPERSEDED'); // prior available notice superseded
    expect(runner.intents[1].status).toBe('PENDING');
    expect(runner.intents[1].payload).toContain('Regenerar exportación');

    // 3. Alternatively, if invalidated for privacy/removal
    const invalidResult = await noticeService.generateExportNotice({
      actorContext,
      exportId: 'exp-003',
      eventId: 'evt-001',
      organizerRef: 'org-001',
      noticeType: 'EXPORT_INVALIDATED',
      generation: 1n,
      invalidationReason: 'Retiro de privacidad'
    });
    expect(invalidResult.outcome).toBe('NOTICE_GENERATED');
    expect(invalidResult.intent?.payload.consequence).toContain('DEC-090');
  });

  it('Escenario 3: Dado evento produce múltiples partes (~5GB c/u), emite un único aviso sin spam por parte', async () => {
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const result = await noticeService.generateExportNotice({
      actorContext,
      exportId: 'exp-multipart-01',
      eventId: 'evt-large',
      organizerRef: 'org-001',
      recipientEmail: 'organizer@eventlens.io',
      noticeType: 'EXPORT_AVAILABLE',
      generation: 1n,
      partCount: 4, // 4 parts (~20GB)
      totalSizeBytes: 21474836480n,
      expiresAt
    });

    expect(result.outcome).toBe('NOTICE_GENERATED');
    expect(runner.intents).toHaveLength(1);
    expect(result.intent?.payload.partCount).toBe(4);
    expect(result.intent?.payload.fact).toContain('4 partes descargables');
    // Notice is consolidated, not multiplied by 4
  });

  it('Verifica validación estricta de parámetros obligatorios', async () => {
    await expect(
      noticeService.generateExportNotice({
        actorContext,
        exportId: '',
        eventId: 'evt-001',
        organizerRef: 'org-001',
        noticeType: 'EXPORT_AVAILABLE'
      })
    ).rejects.toThrow(NotificationError);

    await expect(
      noticeService.generateExportNotice({
        actorContext,
        exportId: 'exp-001',
        eventId: '',
        organizerRef: 'org-001',
        noticeType: 'EXPORT_AVAILABLE'
      })
    ).rejects.toThrow(NotificationError);

    await expect(
      noticeService.generateExportNotice({
        actorContext,
        exportId: 'exp-001',
        eventId: 'evt-001',
        organizerRef: 'org-001',
        noticeType: 'EXPORT_AVAILABLE'
        // Missing expiresAt for EXPORT_AVAILABLE
      })
    ).rejects.toThrow(NotificationError);
  });

  it('Integra con NoticeProjectionService y renderiza aviso proyectado en el panel', async () => {
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await noticeService.generateExportNotice({
      actorContext,
      exportId: 'exp-proj-01',
      eventId: 'evt-001',
      organizerRef: 'org-001',
      recipientEmail: 'organizer@eventlens.io',
      noticeType: 'EXPORT_AVAILABLE',
      generation: 1n,
      partCount: 3,
      expiresAt
    });

    const projectionService = new NoticeProjectionService(runner);
    const projection = await projectionService.projectNoticesForOrganizer({
      recipientRef: 'org-001'
    });

    expect(projection.notices).toHaveLength(1);
    expect(projection.notices[0].title).toContain('Exportación de recuerdos lista');
    expect(projection.notices[0].action?.label).toBe('Ver y descargar partes');
    expect(projection.notices[0].action?.destination).toBe('/events/evt-001/media');
  });
});
