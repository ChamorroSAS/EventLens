import { describe, it, expect, beforeEach } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  LifecycleNoticeService,
  NotificationIntentService,
  NotificationError,
  type DomainFactActorContext,
  type LifecycleTimelineFact,
  type NotificationAuditRecord,
  type NotificationAuditSink
} from '../src/index.js';

// ── In-memory mock runner (mirrors the pattern from other notice unit tests) ─

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
        if (
          norm.includes('FROM notification_intent WHERE dedup_key = $1 AND status') &&
          norm.includes('FOR UPDATE')
        ) {
          const dedupKey = parameters[0] as string;
          const found = this.intents.filter(
            (row) => row.dedup_key === dedupKey && row.status === 'PENDING'
          );
          return found as unknown as R[];
        }
        return [] as R[];
      },

      execute: async (sql: string, ...parameters: unknown[]): Promise<number> => {
        const norm = sql.replace(/\s+/g, ' ');

        if (norm.includes('INSERT INTO notification_intent')) {
          const [id, dedup_key, recipient_ref, recipient_email, notification_type, resource_ref, payload, effective_at, expires_at, created_at] =
            parameters as [string, string, string, string | null, string, string, string, Date, Date | null, Date];

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

        if (norm.includes('UPDATE notification_intent') && norm.includes('WHERE dedup_key = $3')) {
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

        return 0;
      }
    };

    return work(tx);
  }
}

// ── Test helpers ─────────────────────────────────────────────────────────────

const systemActor: DomainFactActorContext = {
  actorType: 'SYSTEM',
  actorId: 'system-lifecycle-scheduler'
};

function buildFact(overrides: Partial<LifecycleTimelineFact> = {}): LifecycleTimelineFact {
  const now = new Date('2026-10-01T12:00:00Z');
  const scheduledAt = new Date(now.getTime() + 2 * 24 * 3600 * 1000);      // +2d (in future)
  const expiresAt = new Date(scheduledAt.getTime() + 30 * 24 * 3600 * 1000); // +30d validity
  const graceEndsAt = new Date(expiresAt.getTime() + 7 * 24 * 3600 * 1000);  // +7d grace

  return {
    actorContext: systemActor,
    eventRef: 'evt-lc-test-01',
    eventName: 'Boda de Prueba',
    organizerRef: 'org-lc-test-01',
    recipientEmail: 'organizer@eventlens.test',
    scheduledAt,
    expiresAt,
    graceEndsAt,
    timezone: 'America/Mexico_City',
    ...overrides
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('LifecycleNoticeService (Unit Tests — EL-TK-159)', () => {
  let runner: MockRunner;
  let audits: NotificationAuditRecord[];
  let auditSink: NotificationAuditSink;
  let intentService: NotificationIntentService;
  let service: LifecycleNoticeService;

  beforeEach(() => {
    runner = new MockRunner();
    audits = [];
    auditSink = { record: async (rec) => { audits.push(rec); } };
    intentService = new NotificationIntentService(runner, auditSink);
    service = new LifecycleNoticeService(intentService, auditSink);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Escenario 1: Scheduler evalúa hito futuro → crea intención una vez
  // ────────────────────────────────────────────────────────────────────────────
  describe('Escenario 1 — Hito futuro dentro de ventana notificable crea intención única', () => {
    it('para un evento con 30d de validez y 7d de gracia, genera los 7 hitos aplicables', async () => {
      const now = new Date('2026-10-01T12:00:00Z');
      const fact = buildFact(); // validez 30d → todos los hitos son aplicables
      const result = await service.scheduleLifecycleNotices(fact, now);

      expect(result.eventRef).toBe('evt-lc-test-01');
      expect(result.scheduledCount).toBe(7);
      expect(result.skippedCount).toBe(0);

      const types = runner.intents.map((i) => i.notification_type);
      expect(types).toContain('LIFECYCLE_EVENT_UPCOMING_24H');
      expect(types).toContain('LIFECYCLE_EXPIRY_WARNING_7D');
      expect(types).toContain('LIFECYCLE_EXPIRY_WARNING_3D');
      expect(types).toContain('LIFECYCLE_EXPIRY_WARNING_1D');
      expect(types).toContain('LIFECYCLE_GRACE_ENTERED');
      expect(types).toContain('LIFECYCLE_DELETION_UPCOMING');
      expect(types).toContain('LIFECYCLE_DELETED');
    });

    it('cada intención tiene dedupKey única que incluye el tipo de hito y la ventana de validez', async () => {
      const now = new Date('2026-10-01T12:00:00Z');
      const fact = buildFact();
      await service.scheduleLifecycleNotices(fact, now);

      const keys = runner.intents.map((i) => i.dedup_key);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);

      // Cada dedupKey contiene el eventRef y el tipo de milestone
      for (const key of keys) {
        expect(key).toContain('evt-lc-test-01');
      }
    });

    it('la intención de aviso 24h tiene effectiveAt ≈ 24h antes del scheduledAt y expiresAt = scheduledAt', async () => {
      const now = new Date('2026-10-01T12:00:00Z');
      const fact = buildFact();
      await service.scheduleLifecycleNotices(fact, now);

      const upcoming = runner.intents.find((i) => i.notification_type === 'LIFECYCLE_EVENT_UPCOMING_24H');
      expect(upcoming).toBeDefined();
      const expectedEffective = new Date(fact.scheduledAt.getTime() - 24 * 3600 * 1000);
      expect(upcoming!.effective_at.getTime()).toBe(expectedEffective.getTime());
      expect(upcoming!.expires_at!.getTime()).toBe(fact.scheduledAt.getTime());
    });

    it('la intención de aviso 7d tiene effectiveAt = expiresAt - 7d', async () => {
      const now = new Date('2026-10-01T12:00:00Z');
      const fact = buildFact();
      await service.scheduleLifecycleNotices(fact, now);

      const warning7d = runner.intents.find((i) => i.notification_type === 'LIFECYCLE_EXPIRY_WARNING_7D');
      expect(warning7d).toBeDefined();
      const expected = new Date(fact.expiresAt.getTime() - 7 * 24 * 3600 * 1000);
      expect(warning7d!.effective_at.getTime()).toBe(expected.getTime());
    });

    it('el payload contiene eventRef, eventName, timestamps canónicos y actionDestination', async () => {
      const now = new Date('2026-10-01T12:00:00Z');
      const fact = buildFact();
      await service.scheduleLifecycleNotices(fact, now);

      const intent = runner.intents[0];
      const payload = JSON.parse(intent.payload) as Record<string, unknown>;
      expect(payload.eventRef).toBe('evt-lc-test-01');
      expect(payload.eventName).toBe('Boda de Prueba');
      expect(payload.timezone).toBe('America/Mexico_City');
      expect(typeof payload.scheduledAt).toBe('string');
      expect(typeof payload.expiresAt).toBe('string');
      expect(typeof payload.graceEndsAt).toBe('string');
      expect(typeof payload.actionDestination).toBe('string');
    });

    it('llamadas repetidas con el mismo fact retornan IDEMPOTENT_REPLAY sin duplicar intenciones', async () => {
      const now = new Date('2026-10-01T12:00:00Z');
      const fact = buildFact();

      const first = await service.scheduleLifecycleNotices(fact, now);
      const second = await service.scheduleLifecycleNotices(fact, now);

      expect(first.scheduledCount).toBe(7);
      expect(second.scheduledCount).toBe(0); // todos replay
      expect(runner.intents).toHaveLength(7); // no se duplicaron

      for (const m of second.milestones) {
        expect(m.outcome).toBe('IDEMPOTENT_REPLAY');
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Escenario 2: Extensión de vigencia → avisos anteriores obsoletos
  // ────────────────────────────────────────────────────────────────────────────
  describe('Escenario 2 — Vigencia extendida: avisos anteriores quedan obsoletos', () => {
    it('al extender la vigencia, los avisos de la ventana anterior quedan SUPERSEDED y se emiten nuevos', async () => {
      const now = new Date('2026-10-01T12:00:00Z');
      const originalFact = buildFact({
        windowKey: 'lc-win:evt-lc-ext:original'
      });

      // 1. Programa avisos con la ventana original
      const firstResult = await service.scheduleLifecycleNotices(originalFact, now);
      expect(firstResult.scheduledCount).toBeGreaterThan(0);
      const originalPendingCount = runner.intents.filter((i) => i.status === 'PENDING').length;
      expect(originalPendingCount).toBeGreaterThan(0);

      // 2. Extiende la vigencia → nueva ventana
      const extendedFact = buildFact({
        windowKey: 'lc-win:evt-lc-ext:extended',
        expiresAt: new Date(originalFact.expiresAt.getTime() + 10 * 24 * 3600 * 1000),
        graceEndsAt: new Date(originalFact.graceEndsAt.getTime() + 10 * 24 * 3600 * 1000)
      });

      const extendedResult = await service.rescheduleAfterExtension(
        extendedFact,
        'lc-win:evt-lc-ext:original',
        now
      );

      expect(extendedResult.supersededCount).toBeGreaterThan(0);
      expect(extendedResult.scheduledCount).toBeGreaterThan(0);
      expect(extendedResult.windowKey).toBe('lc-win:evt-lc-ext:extended');

      // Los avisos de la ventana original deben estar SUPERSEDED
      const supersededRows = runner.intents.filter((i) => i.status === 'SUPERSEDED');
      expect(supersededRows.length).toBeGreaterThan(0);

      // Los avisos de la nueva ventana deben estar PENDING
      const pendingRows = runner.intents.filter(
        (i) => i.status === 'PENDING' && i.dedup_key.includes('lc-win:evt-lc-ext:extended')
      );
      expect(pendingRows.length).toBeGreaterThan(0);
    });

    it('rescheduleAfterExtension genera windowKey diferente cuando cambia expiresAt', async () => {
      const now = new Date('2026-10-01T12:00:00Z');
      const factA = buildFact();
      const resultA = await service.scheduleLifecycleNotices(factA, now);
      const windowKeyA = resultA.windowKey;

      const factB = buildFact({
        expiresAt: new Date(factA.expiresAt.getTime() + 5 * 24 * 3600 * 1000),
        graceEndsAt: new Date(factA.graceEndsAt.getTime() + 5 * 24 * 3600 * 1000)
      });
      const resultB = await service.scheduleLifecycleNotices(factB, now, [windowKeyA]);

      expect(resultB.windowKey).not.toBe(windowKeyA);
      expect(resultB.supersededCount).toBeGreaterThan(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Escenario 3: Vigencia corta → solo genera avisos posibles sin duplicar
  // ────────────────────────────────────────────────────────────────────────────
  describe('Escenario 3 — Vigencia corta: solo genera avisos posibles', () => {
    it('para un evento con 2d de validez: omite los avisos de 7d y 3d; genera 1d, gracia y eliminación', async () => {
      const now = new Date('2026-10-01T12:00:00Z');
      // scheduledAt = now (ya iniciado), expiresAt = now + 2d
      const scheduledAt = new Date(now.getTime() - 60 * 1000); // ya pasó
      const expiresAt = new Date(now.getTime() + 2 * 24 * 3600 * 1000);
      const graceEndsAt = new Date(expiresAt.getTime() + 7 * 24 * 3600 * 1000);

      const fact = buildFact({ scheduledAt, expiresAt, graceEndsAt });
      const result = await service.scheduleLifecycleNotices(fact, now);

      const skippedMilestones = result.milestones.filter((m) => m.outcome === 'SKIPPED_WINDOW_TOO_SHORT');
      const scheduled = result.milestones.filter((m) => m.outcome === 'NOTICE_GENERATED');

      // 24h (ya pasó scheduledAt → se omite), 7d (expiresAt en 2d < 7d → se omite), 3d (2d < 3d → omitido)
      expect(skippedMilestones.length).toBeGreaterThan(0);
      // 1d warning, grace-entered, deletion-upcoming, deleted → aplicables
      expect(scheduled.length).toBeGreaterThan(0);

      // No se duplica ningún tipo
      const scheduledTypes = scheduled.map((m) => m.milestone);
      const uniqueScheduled = new Set(scheduledTypes);
      expect(uniqueScheduled.size).toBe(scheduledTypes.length);
    });

    it('para un evento extremadamente corto (< 1d validez) desde un now ya próximo a expiresAt', async () => {
      const now = new Date('2026-10-01T12:00:00Z');
      const scheduledAt = new Date(now.getTime() - 12 * 3600 * 1000); // pasó 12h atrás
      const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);     // expira en 30 min
      const graceEndsAt = new Date(expiresAt.getTime() + 7 * 24 * 3600 * 1000);

      const fact = buildFact({ scheduledAt, expiresAt, graceEndsAt });
      const result = await service.scheduleLifecycleNotices(fact, now);

      // No crash; los avisos de expiresAt futuro se omiten o son SKIPPED
      // Solo gracia y eliminación pueden ser aplicables
      expect(result.milestones).toHaveLength(7);
      const errors = result.milestones.filter(
        (m) => m.outcome !== 'NOTICE_GENERATED' &&
               m.outcome !== 'IDEMPOTENT_REPLAY' &&
               m.outcome !== 'SKIPPED_WINDOW_TOO_SHORT'
      );
      expect(errors).toHaveLength(0);
    });

    it('no genera duplicados cuando el scheduler reevalúa con vigencia corta', async () => {
      const now = new Date('2026-10-01T12:00:00Z');
      const scheduledAt = new Date(now.getTime() - 60 * 1000);
      const expiresAt = new Date(now.getTime() + 2 * 24 * 3600 * 1000);
      const graceEndsAt = new Date(expiresAt.getTime() + 7 * 24 * 3600 * 1000);

      const fact = buildFact({ scheduledAt, expiresAt, graceEndsAt });
      await service.scheduleLifecycleNotices(fact, now);
      const countBefore = runner.intents.length;
      await service.scheduleLifecycleNotices(fact, now); // reeval
      expect(runner.intents).toHaveLength(countBefore); // sin duplicados
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Validaciones de entrada
  // ────────────────────────────────────────────────────────────────────────────
  describe('Validaciones de entrada', () => {
    it('lanza INVALID_ARGUMENT si falta eventRef', async () => {
      const fact = buildFact({ eventRef: '' });
      await expect(service.scheduleLifecycleNotices(fact)).rejects.toThrow(NotificationError);
    });

    it('lanza INVALID_ARGUMENT si falta organizerRef', async () => {
      const fact = buildFact({ organizerRef: '' });
      await expect(service.scheduleLifecycleNotices(fact)).rejects.toThrow(NotificationError);
    });

    it('lanza UNAUTHORIZED si falta actorContext', async () => {
      const fact = buildFact({ actorContext: { actorType: 'SYSTEM', actorId: '' } });
      await expect(service.scheduleLifecycleNotices(fact)).rejects.toThrow(NotificationError);
    });

    it('lanza INVALID_ARGUMENT si expiresAt <= scheduledAt', async () => {
      const fact = buildFact({
        expiresAt: buildFact().scheduledAt // igual al scheduledAt
      });
      await expect(service.scheduleLifecycleNotices(fact)).rejects.toThrow(NotificationError);
    });

    it('lanza INVALID_ARGUMENT si graceEndsAt < expiresAt', async () => {
      const base = buildFact();
      const fact = buildFact({
        graceEndsAt: new Date(base.expiresAt.getTime() - 1000)
      });
      await expect(service.scheduleLifecycleNotices(fact)).rejects.toThrow(NotificationError);
    });

    it('lanza INVALID_ARGUMENT si eventName está vacío', async () => {
      const fact = buildFact({ eventName: '' });
      await expect(service.scheduleLifecycleNotices(fact)).rejects.toThrow(NotificationError);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Observabilidad: auditoría de scheduling
  // ────────────────────────────────────────────────────────────────────────────
  describe('Observabilidad', () => {
    it('registra una entrada de auditoría LIFECYCLE_NOTICES_SCHEDULED por cada evaluación', async () => {
      const now = new Date('2026-10-01T12:00:00Z');
      const fact = buildFact();
      await service.scheduleLifecycleNotices(fact, now);

      const lifecycleAudits = audits.filter((a) => a.action === 'LIFECYCLE_NOTICES_SCHEDULED');
      expect(lifecycleAudits).toHaveLength(1);
      expect(lifecycleAudits[0].details).toContain('evt-lc-test-01');
      expect(lifecycleAudits[0].recipientRef).toBe('org-lc-test-01');
    });

    it('el resultado incluye scheduledCount, skippedCount y supersededCount correctos', async () => {
      const now = new Date('2026-10-01T12:00:00Z');
      const fact = buildFact();
      const result = await service.scheduleLifecycleNotices(fact, now);

      expect(result.scheduledCount + result.skippedCount).toBe(7);
      expect(result.supersededCount).toBe(0); // no hay prior window
    });
  });
});
