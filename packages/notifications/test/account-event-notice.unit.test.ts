import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  AccountEventNoticeService,
  NotificationIntentService,
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
            created_at,
            updated_at
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
            Date,
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
            updated_at
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

describe('AccountEventNoticeService (Unit Tests — EL-TK-162)', () => {
  let runner: MockRunner;
  let audits: NotificationAuditRecord[];
  let auditSink: NotificationAuditSink;
  let intentService: NotificationIntentService;
  let service: AccountEventNoticeService;

  const systemActor: DomainFactActorContext = {
    actorType: 'SYSTEM',
    actorId: 'system-auth-bus'
  };

  beforeEach(() => {
    runner = new MockRunner();
    audits = [];
    auditSink = {
      record: async (rec) => {
        audits.push(rec);
      }
    };
    intentService = new NotificationIntentService(runner, auditSink);
    service = new AccountEventNoticeService(intentService, auditSink);
  });

  describe('Escenario 1: Hechos de seguridad con copy sanitizado', () => {
    it('genera aviso de inicio de sesión sospechoso con copy sanitizado sin fugar tokens ni credenciales', async () => {
      const result = await service.generateAccountSecurityNotice({
        actorContext: systemActor,
        accountRef: 'acc-user-42',
        recipientEmail: 'user42@eventlens.test',
        eventType: 'NEW_LOGIN',
        ipAddress: '198.51.100.24',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148'
      });

      expect(result.outcome).toBe('NOTICE_GENERATED');
      expect(result.intent).toBeDefined();

      const intent = result.intent!;
      expect(intent.notificationType).toBe('ACCOUNT_SECURITY');
      expect(intent.recipientRef).toBe('acc-user-42');
      expect(intent.payload.title).toContain('Nuevo inicio de sesión');
      expect(intent.payload.ipAddress).toBe('198.51.100.24');
      // No contiene contraseñas, secretos ni tokens
      expect(intent.payload.password).toBeUndefined();
      expect(intent.payload.token).toBeUndefined();
    });

    it('genera aviso de recuperación de cuenta con tipo ACCOUNT_RECOVERY', async () => {
      const result = await service.generateAccountSecurityNotice({
        actorContext: systemActor,
        accountRef: 'acc-user-42',
        recipientEmail: 'user42@eventlens.test',
        eventType: 'RECOVERY_REQUESTED'
      });

      expect(result.outcome).toBe('NOTICE_GENERATED');
      expect(result.intent!.notificationType).toBe('ACCOUNT_RECOVERY');
      expect(result.intent!.payload.title).toContain('recuperación');
    });

    it('idempotencia: llamadas repetidas con los mismos datos retornan IDEMPOTENT_REPLAY sin duplicar', async () => {
      const fact = {
        actorContext: systemActor,
        accountRef: 'acc-user-42',
        recipientEmail: 'user42@eventlens.test',
        eventType: 'PASSWORD_CHANGED' as const,
        dedupKey: 'sec:acc-user-42:password-changed:2026-10-11'
      };

      const first = await service.generateAccountSecurityNotice(fact);
      const second = await service.generateAccountSecurityNotice(fact);

      expect(first.outcome).toBe('NOTICE_GENERATED');
      expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(second.intent!.id).toBe(first.intent!.id);
      expect(runner.intents).toHaveLength(1);
    });
  });

  describe('Escenario 2: Suspensión de evento sin revelar motivo restringido y supresión', () => {
    it('cuando un motivo es restringido, genera aviso sanitizado sin revelar detalles confidenciales de investigación', async () => {
      const result = await service.generateEventSuspensionNotice({
        actorContext: { actorType: 'ADMIN_HUMAN', actorId: 'admin-sec-01' },
        eventRef: 'evt-susp-01',
        organizerRef: 'org-susp-01',
        recipientEmail: 'org@eventlens.test',
        reason: 'CONFIDENTIAL_FRAUD_INVESTIGATION_SUBPOENA_DO_NOT_DISCLOSE',
        isRestrictedReason: true
      });

      expect(result.outcome).toBe('NOTICE_GENERATED');
      const intent = result.intent!;
      expect(intent.notificationType).toBe('EVENT_SUSPENDED');
      // El motivo confidencial NO fue almacenado en el payload visible
      expect(intent.payload.reason).not.toContain('CONFIDENTIAL');
      expect(intent.payload.reason).not.toContain('SUBPOENA');
      expect(intent.payload.reason).toBe('Revisión administrativa preventiva');
      expect(intent.payload.actionDestination).toBe('/support?resource=evt-susp-01');
    });

    it('supresión de aviso: si suppressNotice es true por orden legal/seguridad, no crea aviso al organizador', async () => {
      const result = await service.generateEventSuspensionNotice({
        actorContext: { actorType: 'SYSTEM', actorId: 'system-compliance' },
        eventRef: 'evt-legal-hold-01',
        organizerRef: 'org-legal-01',
        reason: 'LEGAL_HOLD_SILENT_ENFORCEMENT',
        suppressNotice: true
      });

      expect(result.outcome).toBe('NOTICE_SUPPRESSED');
      expect(result.suppressedReason).toBe('LEGAL_OR_SECURITY_SUPPRESSION');
      expect(result.intent).toBeUndefined();

      // Ninguna intención fue guardada
      expect(runner.intents).toHaveLength(0);

      // Decisión registrada en auditoría interna
      expect(audits.some((a) => a.action === 'EVENT_SUSPENSION_NOTICE_SUPPRESSED')).toBe(true);
    });
  });

  describe('Escenario 3: Reactivación supersedes suspensión y deja vigente solo la comunicación aplicable', () => {
    it('al reactivar el evento, supersedes atómicamente el aviso de suspensión previo', async () => {
      // 1. Crear aviso de suspensión
      const suspension = await service.generateEventSuspensionNotice({
        actorContext: { actorType: 'ADMIN_HUMAN', actorId: 'admin-01' },
        eventRef: 'evt-cycle-01',
        organizerRef: 'org-cycle-01',
        reason: 'Documentación requerida'
      });
      expect(suspension.outcome).toBe('NOTICE_GENERATED');

      // 2. Crear aviso de reactivación
      const reactivation = await service.generateEventReactivationNotice({
        actorContext: { actorType: 'ADMIN_HUMAN', actorId: 'admin-01' },
        eventRef: 'evt-cycle-01',
        organizerRef: 'org-cycle-01'
      });

      expect(reactivation.outcome).toBe('SUPERSEDED_PREVIOUS');
      expect(reactivation.supersededCount).toBe(1);

      // Comprobar que el aviso de suspensión previo quedó en status SUPERSEDED
      const oldSuspensionRow = runner.intents.find((i) => i.id === suspension.intent!.id);
      expect(oldSuspensionRow!.status).toBe('SUPERSEDED');
      expect(oldSuspensionRow!.superseded_by).toContain('lifecycle:evt-cycle-01:reactivated');

      // El aviso de reactivación quedó activo en PENDING
      const reactivationRow = runner.intents.find((i) => i.id === reactivation.intent!.id);
      expect(reactivationRow!.status).toBe('PENDING');
      expect(reactivationRow!.notification_type).toBe('EVENT_REACTIVATED');
    });
  });

  describe('Avisos de evento próximo y cambios de configuración', () => {
    it('genera aviso de evento próximo con ventana temporal programada 24 horas antes del inicio', async () => {
      const startsAt = new Date(Date.now() + 36 * 3600 * 1000); // En 36 horas
      const result = await service.generateEventUpcomingNotice({
        actorContext: systemActor,
        eventRef: 'evt-wedding-01',
        eventName: 'Boda Carlos y Sofía',
        organizerRef: 'org-wedding',
        startsAt
      });

      expect(result.outcome).toBe('NOTICE_GENERATED');
      const intent = result.intent!;
      expect(intent.notificationType).toBe('EVENT_UPCOMING');
      // effectiveAt debe ser 24 horas antes del inicio
      const expectedEffective = new Date(startsAt.getTime() - 24 * 3600 * 1000);
      expect(intent.effectiveAt.getTime()).toBeCloseTo(expectedEffective.getTime(), -3);
      // expiresAt debe ser el momento de inicio
      expect(intent.expiresAt!.getTime()).toBe(startsAt.getTime());
    });

    it('genera aviso de cambio de configuración autorizada del evento', async () => {
      const result = await service.generateEventConfigurationChangedNotice({
        actorContext: { actorType: 'ORGANIZER_HUMAN', actorId: 'org-1' },
        eventRef: 'evt-cfg-01',
        organizerRef: 'org-1',
        changeType: 'ACCESS_POLICY_UPDATED',
        summary: 'Se actualizó el código PIN de acceso para invitados'
      });

      expect(result.outcome).toBe('NOTICE_GENERATED');
      expect(result.intent!.notificationType).toBe('EVENT_CONFIGURATION_CHANGED');
      expect(result.intent!.payload.summary).toContain('PIN');
      expect(result.intent!.payload.actionDestination).toBe('/events/evt-cfg-01/settings');
    });

    it('falla con INVALID_ARGUMENT si faltan parámetros requeridos', async () => {
      await expect(
        service.generateAccountSecurityNotice({
          actorContext: systemActor,
          accountRef: '',
          eventType: 'NEW_LOGIN'
        })
      ).rejects.toThrow(NotificationError);

      await expect(
        service.generateEventSuspensionNotice({
          actorContext: systemActor,
          eventRef: '',
          organizerRef: 'org-1'
        })
      ).rejects.toThrow(NotificationError);
    });
  });
});
