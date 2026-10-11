import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  GuestSessionService,
  EventManagementError,
  type EventAuditSink,
  type EventAuditRecord
} from '../src/index.js';

interface MockDb {
  events: Map<string, any>;
  credentials: Map<string, any>;
  attempts: Map<string, any>;
  sessions: Map<string, any>;
  auditEvents: EventAuditRecord[];
}

function createMockRunner(db: MockDb): TransactionRunner {
  return {
    async run<R>(callback: (tx: SqlTransaction) => Promise<R>): Promise<R> {
      const tx: SqlTransaction = {
        async query<T extends object>(sql: string, ...params: unknown[]): Promise<T[]> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // SELECT ... FROM public_access_credential c JOIN event e ... WHERE c.lookup_key = $1
          if (normalized.includes('FROM public_access_credential c JOIN event e') && normalized.includes('WHERE c.lookup_key = $1')) {
            const key = params[0] as string;
            const cred = Array.from(db.credentials.values()).find((c) => c.lookup_key === key);
            if (!cred) return [] as unknown as T[];
            const ev = db.events.get(cred.event_id);
            if (!ev) return [] as unknown as T[];

            return [{
              cred_id: cred.id,
              event_id: cred.event_id,
              lookup_key: cred.lookup_key,
              cred_token_hash: cred.token_hash,
              generation: cred.generation,
              pin_required: cred.pin_required,
              cred_revoked_at: cred.revoked_at ?? null,
              name: ev.name ?? 'Mock Event',
              status: ev.status,
              timezone: ev.timezone ?? 'America/Bogota',
              pin_enabled: Boolean(ev.pin_enabled),
              pin_hash: ev.pin_hash ?? null,
              pin_salt: ev.pin_salt ?? null,
              starts_at_local: ev.starts_at_local ?? null,
              scheduled_at: ev.scheduled_at ?? null,
              expires_at: ev.expires_at ?? null,
              grace_ends_at: ev.grace_ends_at ?? null,
              activated_at: ev.activated_at ?? null,
              closed_at: ev.closed_at ?? null,
              purge_started_at: ev.purge_started_at ?? null,
              suspended_at: ev.suspended_at ?? null,
              suspension_reason: ev.suspension_reason ?? null,
              previous_status: ev.previous_status ?? null,
              validity_duration_days: ev.validity_duration_days ?? null,
              grace_days: ev.grace_days ?? null,
              uploads_enabled: Boolean(ev.uploads_enabled),
              guest_gallery_enabled: Boolean(ev.guest_gallery_enabled),
              moderation_mode: ev.moderation_mode ?? 'AUTO_PUBLISH',
              organizer_id: ev.organizer_id ?? randomUUID(),
              created_at: cred.created_at,
              updated_at: cred.created_at
            }] as unknown as T[];
          }

          // SELECT ... FROM guest_pin_attempt WHERE lookup_key = $1
          if (normalized.includes('FROM guest_pin_attempt WHERE lookup_key = $1')) {
            const key = params[0] as string;
            const attempt = db.attempts.get(key);
            if (attempt) return [{ ...attempt }] as unknown as T[];
            return [] as unknown as T[];
          }

          // SELECT ... FROM guest_session WHERE token_hash = $1
          if (normalized.includes('FROM guest_session WHERE token_hash = $1')) {
            const hash = params[0] as string;
            const sess = Array.from(db.sessions.values()).find((s) => s.token_hash === hash);
            if (sess) return [{ ...sess }] as unknown as T[];
            return [] as unknown as T[];
          }

          throw new Error(`Unhandled mock query: ${sql}`);
        },

        async execute(sql: string, ...params: unknown[]): Promise<number> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // INSERT INTO guest_session
          if (normalized.includes('INSERT INTO guest_session')) {
            const [id, event_id, token_hash, credential_generation, created_at, expires_at] = params;
            db.sessions.set(id as string, {
              id,
              event_id,
              token_hash,
              credential_generation,
              created_at,
              expires_at,
              revoked_at: null,
              consent_recorded_at: null,
              consent_version: null,
              contributor_nickname: null
            });
            return 1;
          }

          // INSERT INTO guest_pin_attempt
          if (normalized.includes('INSERT INTO guest_pin_attempt')) {
            const [id, lookup_key, attempt_count, locked_until, last_attempt_at] = params;
            db.attempts.set(lookup_key as string, {
              id,
              lookup_key,
              attempt_count,
              locked_until,
              last_attempt_at
            });
            return 1;
          }

          // UPDATE guest_pin_attempt
          if (normalized.includes('UPDATE guest_pin_attempt')) {
            const [id, attempt_count, locked_until, last_attempt_at] = params;
            for (const [k, v] of db.attempts.entries()) {
              if (v.id === id) {
                db.attempts.set(k, {
                  ...v,
                  attempt_count,
                  locked_until,
                  last_attempt_at
                });
                break;
              }
            }
            return 1;
          }

          // DELETE FROM guest_pin_attempt WHERE lookup_key = $1
          if (normalized.includes('DELETE FROM guest_pin_attempt WHERE lookup_key = $1')) {
            const key = params[0] as string;
            db.attempts.delete(key);
            return 1;
          }

          // UPDATE guest_session SET revoked_at = NOW() WHERE id = $1
          if (normalized.includes('UPDATE guest_session SET revoked_at')) {
            const id = params[0] as string;
            const sess = db.sessions.get(id);
            if (sess) {
              sess.revoked_at = new Date();
            }
            return 1;
          }

          throw new Error(`Unhandled mock execute: ${sql}`);
        }
      };

      return callback(tx);
    }
  };
}

describe('EL-TK-075: GuestSessionService (Unit Tests)', () => {
  let db: MockDb;
  let auditSink: EventAuditSink;
  let service: GuestSessionService;

  beforeEach(() => {
    db = {
      events: new Map(),
      credentials: new Map(),
      attempts: new Map(),
      sessions: new Map(),
      auditEvents: []
    };

    auditSink = {
      record: vi.fn(async (event) => {
        db.auditEvents.push(event);
      })
    };

    service = new GuestSessionService(createMockRunner(db), auditSink);
  });

  function setupEventWithPin(pin: string = '123456') {
    const eventId = randomUUID();
    const lookupKey = 'lookup_' + randomBytes(12).toString('hex');
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(pin, salt, 32).toString('hex');

    db.events.set(eventId, {
      id: eventId,
      name: 'PIN Protected Event',
      status: 'ACTIVE',
      timezone: 'America/Bogota',
      pin_enabled: true,
      pin_hash: hash,
      pin_salt: salt,
      uploads_enabled: true,
      guest_gallery_enabled: true
    });

    const credId = randomUUID();
    db.credentials.set(credId, {
      id: credId,
      event_id: eventId,
      lookup_key: lookupKey,
      token_hash: 'credhash',
      generation: 1,
      pin_required: true,
      created_at: new Date(),
      revoked_at: null
    });

    return { eventId, lookupKey, pin };
  }

  function setupEventWithoutPin() {
    const eventId = randomUUID();
    const lookupKey = 'lookup_' + randomBytes(12).toString('hex');

    db.events.set(eventId, {
      id: eventId,
      name: 'Open Event No PIN',
      status: 'ACTIVE',
      timezone: 'America/Bogota',
      pin_enabled: false,
      pin_hash: null,
      pin_salt: null,
      uploads_enabled: true,
      guest_gallery_enabled: true
    });

    const credId = randomUUID();
    db.credentials.set(credId, {
      id: credId,
      event_id: eventId,
      lookup_key: lookupKey,
      token_hash: 'credhash',
      generation: 1,
      pin_required: false,
      created_at: new Date(),
      revoked_at: null
    });

    return { eventId, lookupKey };
  }

  it('Escenario 1: Establece sesión anónima guest al validar el PIN correcto de 6 dígitos', async () => {
    const { eventId, lookupKey, pin } = setupEventWithPin('654321');

    const result = await service.createGuestSession({
      lookupKey,
      pin
    });

    expect(result.session).toBeDefined();
    expect(result.session.eventId).toBe(eventId);
    expect(result.session.token).toBeTypeOf('string');
    expect(result.session.token.length).toBeGreaterThanOrEqual(30);
    expect(result.session.credentialGeneration).toBe(1);
    expect(result.session.expiresAt.getTime()).toBeGreaterThan(Date.now());

    expect(result.event).toBeDefined();
    expect(result.event.id).toBe(eventId);
    expect(result.event.name).toBe('PIN Protected Event');
    expect(result.event.status).toBe('ACTIVE');

    // Auditoría
    const audit = db.auditEvents.find((a) => a.procedure === 'GUEST_SESSION_CREATED');
    expect(audit).toBeDefined();
    expect(audit?.targetIdentifier).toBe(eventId);
    expect(audit?.result).toBe('SUCCESS');
    expect(audit?.details).not.toContain(pin);
    expect(audit?.details).not.toContain(result.session.token);
  });

  it('Escenario 1: Preserva ceros a la izquierda en PIN (ej. "000123")', async () => {
    const { eventId, lookupKey, pin } = setupEventWithPin('000123');

    const result = await service.createGuestSession({
      lookupKey,
      pin
    });

    expect(result.session.eventId).toBe(eventId);
    expect(db.sessions.size).toBe(1);
  });

  it('Escenario 2: Deniega con INVALID_PIN si el PIN es incorrecto e incrementa intentos', async () => {
    const { eventId, lookupKey } = setupEventWithPin('123456');

    await expect(
      service.createGuestSession({
        lookupKey,
        pin: '999999'
      })
    ).rejects.toMatchObject({ code: 'INVALID_PIN' });

    // Auditoría de fallo sin filtrar PIN
    const failAudit = db.auditEvents.find((a) => a.procedure === 'GUEST_PIN_VALIDATION_FAILED');
    expect(failAudit).toBeDefined();
    expect(failAudit?.details).not.toContain('999999');

    // Intento registrado
    const attempt = db.attempts.get(lookupKey);
    expect(attempt).toBeDefined();
    expect(attempt.attempt_count).toBe(1);
  });

  it('Escenario 2: Aplica RATE_LIMIT_EXCEEDED al alcanzar 5 intentos fallidos consecutivos', async () => {
    const { lookupKey } = setupEventWithPin('123456');

    // 4 intentos fallidos
    for (let i = 1; i <= 4; i++) {
      await expect(
        service.createGuestSession({ lookupKey, pin: '000000' })
      ).rejects.toMatchObject({ code: 'INVALID_PIN' });
    }

    // 5to intento fallido activa el bloqueo
    await expect(
      service.createGuestSession({ lookupKey, pin: '000000' })
    ).rejects.toMatchObject({ code: 'RATE_LIMIT_EXCEEDED' });

    // Siguiente intento (incluso con PIN correcto) queda temporalmente bloqueado
    await expect(
      service.createGuestSession({ lookupKey, pin: '123456' })
    ).rejects.toMatchObject({ code: 'RATE_LIMIT_EXCEEDED' });
  });

  it('Valida formato exacto de 6 dígitos numéricos (INVALID_PIN_FORMAT)', async () => {
    const { lookupKey } = setupEventWithPin('123456');

    // Menos de 6 dígitos
    await expect(
      service.createGuestSession({ lookupKey, pin: '12345' })
    ).rejects.toMatchObject({ code: 'INVALID_PIN_FORMAT' });

    // Más de 6 dígitos
    await expect(
      service.createGuestSession({ lookupKey, pin: '1234567' })
    ).rejects.toMatchObject({ code: 'INVALID_PIN_FORMAT' });

    // Caracteres no numéricos
    await expect(
      service.createGuestSession({ lookupKey, pin: 'abcdef' })
    ).rejects.toMatchObject({ code: 'INVALID_PIN_FORMAT' });
  });

  it('Escenario 3: Establece sesión guest directamente sin pedir PIN cuando el evento no tiene PIN configurado', async () => {
    const { eventId, lookupKey } = setupEventWithoutPin();

    const result = await service.createGuestSession({
      lookupKey
    });

    expect(result.session).toBeDefined();
    expect(result.session.eventId).toBe(eventId);
    expect(result.session.token).toBeTypeOf('string');
    expect(result.event.status).toBe('ACTIVE');
    expect(db.sessions.size).toBe(1);
  });

  it('Exige PIN (PIN_REQUIRED) si el evento requiere PIN pero el invitado no lo envía', async () => {
    const { lookupKey } = setupEventWithPin('123456');

    await expect(
      service.createGuestSession({ lookupKey })
    ).rejects.toMatchObject({ code: 'PIN_REQUIRED' });
  });

  it('Rechaza credencial inexistente o revocada con INVALID_CREDENTIAL fail-closed', async () => {
    await expect(
      service.createGuestSession({ lookupKey: 'non_existent_key_111' })
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL' });

    const { lookupKey } = setupEventWithoutPin();
    const cred = Array.from(db.credentials.values()).find((c) => c.lookup_key === lookupKey);
    cred.revoked_at = new Date();

    await expect(
      service.createGuestSession({ lookupKey })
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL' });
  });

  it('Rechaza sesión si el evento está SUSPENDED o terminal (EVENT_NOT_ACCESSIBLE)', async () => {
    const { lookupKey, eventId } = setupEventWithoutPin();
    const event = db.events.get(eventId);
    event.status = 'SUSPENDED';

    await expect(
      service.createGuestSession({ lookupKey })
    ).rejects.toMatchObject({ code: 'EVENT_NOT_ACCESSIBLE' });
  });

  it('Permite resolver una sesión guest activa y revocarla limpiamente', async () => {
    const { lookupKey } = setupEventWithoutPin();
    const { session } = await service.createGuestSession({ lookupKey });

    const resolved = await service.resolveGuestSession(session.token);
    expect(resolved.id).toBe(session.id);
    expect(resolved.eventId).toBe(session.eventId);
    expect(resolved.revokedAt).toBeNull();

    // Revocar
    await service.revokeGuestSession(session.id);
    await expect(
      service.resolveGuestSession(session.token)
    ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  });
});
