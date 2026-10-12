import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import type { OrganizerActorContext } from '@eventlens/identity';
import {
  EventPublicAccessService,
  EventManagementError,
  type EventAuditSink,
  type EventAuditRecord
} from '../src/index.js';

interface MockDb {
  events: Map<string, any>;
  credentials: Map<string, any>;
  sessions: Map<string, any>;
  pinAttempts: Map<string, any>;
  auditEvents: EventAuditRecord[];
}

function createMockRunner(db: MockDb): TransactionRunner {
  return {
    async run<R>(callback: (tx: SqlTransaction) => Promise<R>): Promise<R> {
      const tx: SqlTransaction = {
        async query<T extends object>(sql: string, ...params: unknown[]): Promise<T[]> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // SELECT ... FROM event WHERE id = $1
          if (normalized.includes('FROM event WHERE id = $1')) {
            const eventId = params[0] as string;
            const ev = db.events.get(eventId);
            if (!ev) return [] as unknown as T[];
            return [{ ...ev }] as unknown as T[];
          }

          // SELECT ... FROM public_access_credential WHERE event_id = $1 AND revoked_at IS NULL
          if (normalized.includes('FROM public_access_credential WHERE event_id = $1 AND revoked_at IS NULL')) {
            const eventId = params[0] as string;
            const active = Array.from(db.credentials.values())
              .filter((c) => c.event_id === eventId && c.revoked_at === null)
              .sort((a, b) => b.generation - a.generation);
            return active.map((c) => ({ ...c })) as unknown as T[];
          }

          // SELECT c.event_id, c.revoked_at, e.name AS event_name ... FROM public_access_credential c JOIN event e ... WHERE c.lookup_key = $1
          if (normalized.includes('FROM public_access_credential c JOIN event e') && normalized.includes('WHERE c.lookup_key = $1')) {
            const key = params[0] as string;
            const cred = Array.from(db.credentials.values()).find((c) => c.lookup_key === key);
            if (!cred) return [] as unknown as T[];
            const ev = db.events.get(cred.event_id);
            if (!ev) return [] as unknown as T[];
            return [{
              event_id: cred.event_id,
              revoked_at: cred.revoked_at ?? null,
              event_name: ev.name ?? 'Event Name',
              event_status: ev.status
            }] as unknown as T[];
          }

          // INSERT INTO public_access_credential ... RETURNING ...
          if (normalized.startsWith('INSERT INTO public_access_credential')) {
            const [id, eventId, lookupKey, tokenHash, generation, pinRequired, createdAt] = params;
            const row = {
              id,
              event_id: eventId,
              lookup_key: lookupKey,
              token_hash: tokenHash,
              generation,
              pin_required: pinRequired,
              created_at: createdAt,
              revoked_at: null
            };
            db.credentials.set(id as string, row);
            return [{ ...row }] as unknown as T[];
          }

          // UPDATE guest_session SET revoked_at = $2 WHERE event_id = $1 AND revoked_at IS NULL RETURNING id
          if (normalized.includes('UPDATE guest_session SET revoked_at =') && normalized.includes('RETURNING id')) {
            const eventId = params[0] as string;
            const now = params[1] as Date;
            const revoked: { id: string }[] = [];
            for (const s of db.sessions.values()) {
              if (s.event_id === eventId && s.revoked_at === null) {
                s.revoked_at = now;
                revoked.push({ id: s.id });
              }
            }
            return revoked as unknown as T[];
          }

          return [] as unknown as T[];
        },

        async execute(sql: string, ...params: unknown[]): Promise<number> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // UPDATE event SET pin_enabled = ... WHERE id = $1
          if (normalized.startsWith('UPDATE event SET pin_enabled =')) {
            const eventId = params[0] as string;
            const ev = db.events.get(eventId);
            if (ev) {
              if (normalized.includes('pin_enabled = true')) {
                ev.pin_enabled = true;
                ev.pin_hash = params[1];
                ev.pin_salt = params[2];
              } else {
                ev.pin_enabled = false;
                ev.pin_hash = null;
                ev.pin_salt = null;
              }
            }
            return 1;
          }

          // UPDATE public_access_credential SET pin_required = ...
          if (normalized.startsWith('UPDATE public_access_credential SET pin_required =')) {
            const eventId = params[0] as string;
            const pinReq = normalized.includes('pin_required = true');
            for (const c of db.credentials.values()) {
              if (c.event_id === eventId && c.revoked_at === null) {
                c.pin_required = pinReq;
              }
            }
            return 1;
          }

          // UPDATE public_access_credential SET revoked_at = $2 WHERE event_id = $1
          if (normalized.startsWith('UPDATE public_access_credential SET revoked_at =')) {
            const eventId = params[0] as string;
            const now = params[1] as Date;
            for (const c of db.credentials.values()) {
              if (c.event_id === eventId && c.revoked_at === null) {
                c.revoked_at = now;
              }
            }
            return 1;
          }

          // DELETE FROM guest_pin_attempt
          if (normalized.startsWith('DELETE FROM guest_pin_attempt')) {
            db.pinAttempts.clear();
            return 1;
          }

          return 1;
        }
      };

      return callback(tx);
    }
  };
}

describe('Event Access Management — EL-TK-079, EL-TK-080, EL-TK-081, EL-TK-082', () => {
  let db: MockDb;
  let auditSink: EventAuditSink;
  let service: EventPublicAccessService;

  const now = new Date('2026-10-11T12:00:00Z');
  const organizerId = 'org-1';
  const eventId = 'event-1';
  const organizerContext: OrganizerActorContext = {
    actorType: 'ORGANIZER_HUMAN',
    accountId: organizerId
  };

  beforeEach(() => {
    db = {
      events: new Map(),
      credentials: new Map(),
      sessions: new Map(),
      pinAttempts: new Map(),
      auditEvents: []
    };

    auditSink = {
      async record(event: EventAuditRecord) {
        db.auditEvents.push(event);
      }
    };

    service = new EventPublicAccessService(createMockRunner(db), auditSink);

    // Initial event
    db.events.set(eventId, {
      id: eventId,
      organizer_id: organizerId,
      name: 'Gala Anual',
      status: 'ACTIVE',
      pin_enabled: false,
      pin_hash: null,
      pin_salt: null
    });

    // Initial credential (gen 1)
    db.credentials.set('cred-1', {
      id: 'cred-1',
      event_id: eventId,
      lookup_key: 'lookup-key-1',
      token_hash: 'hash-1',
      generation: 1,
      pin_required: false,
      created_at: now,
      revoked_at: null
    });

    // Initial active guest sessions
    db.sessions.set('sess-1', { id: 'sess-1', event_id: eventId, revoked_at: null });
    db.sessions.set('sess-2', { id: 'sess-2', event_id: eventId, revoked_at: null });
  });

  describe('EL-TK-079: Cambiar o desactivar PIN y revocar sesiones guest', () => {
    it('Escenario 1: cambia el PIN correctamente, activa pin_required y revoca sesiones previas (DEC-083)', async () => {
      const result = await service.updateEventPin({
        actorContext: organizerContext,
        eventId,
        action: 'CHANGE_PIN',
        newPin: '654321',
        now
      });

      expect(result.pinEnabled).toBe(true);
      expect(result.revokedSessionsCount).toBe(2);

      const event = db.events.get(eventId);
      expect(event.pin_enabled).toBe(true);
      expect(event.pin_hash).toBeTruthy();
      expect(event.pin_salt).toBeTruthy();

      const cred = db.credentials.get('cred-1');
      expect(cred.pin_required).toBe(true);

      // Verify sessions were revoked
      expect(db.sessions.get('sess-1').revoked_at).toEqual(now);
      expect(db.sessions.get('sess-2').revoked_at).toEqual(now);

      // Verify audit
      expect(db.auditEvents.some((e) => e.procedure === 'EVENT_PIN_UPDATED' && e.result === 'PIN_UPDATED')).toBe(true);
    });

    it('Escenario 2: desactiva el PIN, pone pin_required en false y revoca sesiones previas (DEC-083)', async () => {
      const result = await service.updateEventPin({
        actorContext: organizerContext,
        eventId,
        action: 'DISABLE_PIN',
        now
      });

      expect(result.pinEnabled).toBe(false);
      expect(result.revokedSessionsCount).toBe(2);

      const event = db.events.get(eventId);
      expect(event.pin_enabled).toBe(false);
      expect(event.pin_hash).toBeNull();

      expect(db.sessions.get('sess-1').revoked_at).toEqual(now);
      expect(db.auditEvents.some((e) => e.procedure === 'EVENT_PIN_UPDATED' && e.result === 'PIN_DISABLED')).toBe(true);
    });

    it('Escenario 3: valida formato estricto de 6 dígitos numéricos para nuevo PIN', async () => {
      await expect(
        service.updateEventPin({
          actorContext: organizerContext,
          eventId,
          action: 'CHANGE_PIN',
          newPin: 'abc123',
          now
        })
      ).rejects.toThrowError(/PIN must be exactly 6 numeric digits/);

      await expect(
        service.updateEventPin({
          actorContext: organizerContext,
          eventId,
          action: 'CHANGE_PIN',
          newPin: '12345',
          now
        })
      ).rejects.toThrowError(/PIN must be exactly 6 numeric digits/);
    });

    it('deniega si el actor no es el organizador propietario', async () => {
      const foreignContext: OrganizerActorContext = {
        actorType: 'ORGANIZER_HUMAN',
        accountId: 'other-org'
      };

      await expect(
        service.updateEventPin({
          actorContext: foreignContext,
          eventId,
          action: 'DISABLE_PIN',
          now
        })
      ).rejects.toThrowError(EventManagementError);
    });
  });

  describe('EL-TK-080: Regenerar credencial pública y revocar enlace anterior', () => {
    it('Escenario 1 & 2: genera nueva credencial con incremento de generación, revoca anterior y revoca sesiones previas (DEC-083)', async () => {
      const result = await service.regeneratePublicCredential({
        actorContext: organizerContext,
        eventId,
        now
      });

      expect(result.outcome).toBe('REGENERATED');
      expect(result.previousGeneration).toBe(1);
      expect(result.credential.generation).toBe(2);
      expect(result.credential.lookupKey).toBeTruthy();
      expect(result.credential.lookupKey).not.toBe('lookup-key-1');
      expect(result.revokedSessionsCount).toBe(2);

      // Verify old cred was revoked
      expect(db.credentials.get('cred-1').revoked_at).toEqual(now);

      // Verify sessions were revoked
      expect(db.sessions.get('sess-1').revoked_at).toEqual(now);

      // Verify audit
      expect(db.auditEvents.some((e) => e.procedure === 'EVENT_PUBLIC_CREDENTIAL_REGENERATED')).toBe(true);
    });

    it('deniega regeneración para un actor no propietario', async () => {
      const foreignContext: OrganizerActorContext = {
        actorType: 'ORGANIZER_HUMAN',
        accountId: 'other-org'
      };

      await expect(
        service.regeneratePublicCredential({
          actorContext: foreignContext,
          eventId,
          now
        })
      ).rejects.toThrowError(EventManagementError);
    });
  });

  describe('EL-TK-081: Consultar datos de compartir y QR del acceso vigente', () => {
    it('Escenario 1: devuelve enlace vigente y representación QR en SVG', async () => {
      const result = await service.getShareAccessSnapshot({
        actorContext: organizerContext,
        eventId,
        baseUrl: 'https://eventlens.app',
        now
      });

      expect(result.lookupKey).toBe('lookup-key-1');
      expect(result.sharePath).toBe('/g/lookup-key-1');
      expect(result.shareUrl).toBe('https://eventlens.app/g/lookup-key-1');
      expect(result.generation).toBe(1);
      expect(result.qrPayload).toBe(result.shareUrl);
      expect(result.qrSvg).toContain('<svg');
      expect(result.qrSvg).toContain(`aria-label="QR Code: ${result.shareUrl}"`);

      expect(db.auditEvents.some((e) => e.procedure === 'EVENT_SHARE_ACCESS_QUERIED')).toBe(true);
    });

    it('Escenario 2: post-regeneración nunca devuelve la credencial anterior', async () => {
      // Regenerate first
      const regenResult = await service.regeneratePublicCredential({
        actorContext: organizerContext,
        eventId,
        now
      });

      // Now query share snapshot
      const shareResult = await service.getShareAccessSnapshot({
        actorContext: organizerContext,
        eventId,
        baseUrl: 'https://eventlens.app',
        now
      });

      expect(shareResult.generation).toBe(2);
      expect(shareResult.lookupKey).toBe(regenResult.credential.lookupKey);
      expect(shareResult.lookupKey).not.toBe('lookup-key-1');
    });

    it('falla con CREDENTIAL_NOT_FOUND si no hay credencial activa', async () => {
      // Revoke existing
      db.credentials.get('cred-1').revoked_at = now;

      await expect(
        service.getShareAccessSnapshot({
          actorContext: organizerContext,
          eventId,
          now
        })
      ).rejects.toThrowError(/No active public access credential found/);
    });
  });

  describe('EL-TK-082: Derivar a solicitud de retiro sin sesión', () => {
    it('Escenario 1 & 2: expone ruta de intake y disclaimer de recepción!=resolución sin sesión (DEC-103..105)', async () => {
      const result = await service.getRemovalIntakeRoute({
        lookupKey: 'lookup-key-1',
        baseUrl: 'https://eventlens.app',
        now
      });

      expect(result.eventId).toBe(eventId);
      expect(result.eventName).toBe('Gala Anual');
      expect(result.intakePath).toBe('https://eventlens.app/removal-request?eventId=' + eventId);
      expect(result.requiresSession).toBe(false);
      expect(result.disclaimer).toContain('La recepción de esta solicitud no constituye una eliminación');

      expect(db.auditEvents.some((e) => e.procedure === 'REMOVAL_INTAKE_ROUTED')).toBe(true);
    });

    it('deniega si la credencial es inválida o fue revocada', async () => {
      db.credentials.get('cred-1').revoked_at = now;

      await expect(
        service.getRemovalIntakeRoute({
          lookupKey: 'lookup-key-1',
          now
        })
      ).rejects.toThrowError(/credential is invalid or has been revoked/);
    });
  });
});
