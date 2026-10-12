import { describe, it, expect, beforeEach } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  GuestSessionService,
  EventManagementError,
  type EventAuditSink,
  type EventAuditRecord
} from '../src/index.js';

interface MockDb {
  events: Map<string, any>;
  sessions: Map<string, any>;
  attempts: Map<string, any>;
  auditEvents: EventAuditRecord[];
}

function createMockRunner(db: MockDb): TransactionRunner {
  return {
    async run<R>(callback: (tx: SqlTransaction) => Promise<R>): Promise<R> {
      const tx: SqlTransaction = {
        async query<T extends object>(sql: string, ...params: unknown[]): Promise<T[]> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // SELECT ... FROM guest_session WHERE token_hash = $1
          if (normalized.includes('FROM guest_session WHERE token_hash = $1')) {
            const tokenHash = params[0] as string;
            const session = Array.from(db.sessions.values()).find((s) => s.token_hash === tokenHash);
            if (!session) return [] as unknown as T[];
            return [{ ...session }] as unknown as T[];
          }

          // SELECT ... FROM event WHERE id = $1
          if (normalized.includes('FROM event WHERE id = $1')) {
            const eventId = params[0] as string;
            const ev = db.events.get(eventId);
            if (!ev) return [] as unknown as T[];
            return [{
              id: ev.id,
              name: ev.name ?? 'Mock Event',
              status: ev.status,
              timezone: ev.timezone ?? 'America/Bogota',
              organizer_id: ev.organizer_id ?? 'org-1',
              guest_gallery_enabled: Boolean(ev.guest_gallery_enabled),
              uploads_enabled: Boolean(ev.uploads_enabled)
            }] as unknown as T[];
          }

          // SELECT ... FROM upload_attempt WHERE guest_session_id = $1
          if (normalized.includes('FROM upload_attempt WHERE guest_session_id = $1')) {
            const sessionId = params[0] as string;
            const matching = Array.from(db.attempts.values())
              .filter((a) => a.guest_session_id === sessionId)
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            return matching.map((a) => ({ ...a })) as unknown as T[];
          }

          return [] as unknown as T[];
        },

        async execute(sql: string, ...params: unknown[]): Promise<number> {
          return 1;
        }
      };

      return callback(tx);
    }
  };
}

describe('Guest Contributions Query — EL-TK-078 (DEC-084)', () => {
  let db: MockDb;
  let auditSink: EventAuditSink;
  let service: GuestSessionService;
  const now = new Date('2026-10-11T12:00:00Z');

  const validToken = 'valid-token-secret-1234567890';
  const tokenHash = createHash('sha256').update(validToken).digest('hex');
  const otherToken = 'other-token-secret-0987654321';
  const otherTokenHash = createHash('sha256').update(otherToken).digest('hex');

  const eventId = 'event-1';
  const session1Id = 'session-1';
  const session2Id = 'session-2';

  beforeEach(() => {
    db = {
      events: new Map(),
      sessions: new Map(),
      attempts: new Map(),
      auditEvents: []
    };

    auditSink = {
      async record(event: EventAuditRecord) {
        db.auditEvents.push(event);
      }
    };

    service = new GuestSessionService(createMockRunner(db), auditSink);

    // Setup base event
    db.events.set(eventId, {
      id: eventId,
      name: 'Boda de Ensueño',
      status: 'ACTIVE',
      timezone: 'America/Bogota',
      organizer_id: 'org-1',
      guest_gallery_enabled: true,
      uploads_enabled: true
    });

    // Setup session 1
    db.sessions.set(session1Id, {
      id: session1Id,
      event_id: eventId,
      token_hash: tokenHash,
      credential_generation: 1,
      created_at: new Date(now.getTime() - 3600000),
      expires_at: new Date(now.getTime() + 86400000),
      revoked_at: null,
      consent_recorded_at: now,
      consent_version: 'v1.0',
      contributor_nickname: 'Invitado Feliz'
    });

    // Setup session 2
    db.sessions.set(session2Id, {
      id: session2Id,
      event_id: eventId,
      token_hash: otherTokenHash,
      credential_generation: 1,
      created_at: new Date(now.getTime() - 3600000),
      expires_at: new Date(now.getTime() + 86400000),
      revoked_at: null,
      consent_recorded_at: now,
      consent_version: 'v1.0',
      contributor_nickname: 'Otro Invitado'
    });
  });

  it('Escenario 1: devuelve únicamente los aportes asociados a la sesión guest autenticada con aislamiento estricto', async () => {
    // Add attempt for session 1
    db.attempts.set('att-1', {
      id: 'att-1',
      event_id: eventId,
      guest_session_id: session1Id,
      declared_type: 'PHOTO',
      declared_size: 2000000,
      actual_size: 1980000,
      detected_type: 'image/jpeg',
      status: 'ACCEPTED',
      duration_seconds: null,
      rejection_reason: null,
      created_at: new Date(now.getTime() - 1000),
      updated_at: now
    });

    // Add attempt for session 2
    db.attempts.set('att-2', {
      id: 'att-2',
      event_id: eventId,
      guest_session_id: session2Id,
      declared_type: 'VIDEO',
      declared_size: 15000000,
      actual_size: 14500000,
      detected_type: 'video/mp4',
      status: 'ACCEPTED',
      duration_seconds: 45,
      rejection_reason: null,
      created_at: new Date(now.getTime() - 500),
      updated_at: now
    });

    const result = await service.getGuestContributions({ sessionToken: validToken, now });

    expect(result.sessionId).toBe(session1Id);
    expect(result.contributorNickname).toBe('Invitado Feliz');
    expect(result.totalCount).toBe(1);
    expect(result.acceptedCount).toBe(1);
    expect(result.items[0].attemptId).toBe('att-1');
    expect(result.items[0].mediaType).toBe('PHOTO');
    expect(result.items[0].status).toBe('ACCEPTED');

    // Audit verification
    expect(db.auditEvents.some((e) => e.procedure === 'GUEST_CONTRIBUTIONS_QUERIED')).toBe(true);
  });

  it('Escenario 2 (DEC-084): permite consultar Mis aportes cuando la galería está apagada', async () => {
    db.events.set(eventId, {
      ...db.events.get(eventId),
      guest_gallery_enabled: false
    });

    db.attempts.set('att-1', {
      id: 'att-1',
      guest_session_id: session1Id,
      declared_type: 'PHOTO',
      declared_size: 1000,
      actual_size: 1000,
      detected_type: 'image/png',
      status: 'ACCEPTED',
      duration_seconds: null,
      rejection_reason: null,
      created_at: now,
      updated_at: now
    });

    const result = await service.getGuestContributions({ sessionToken: validToken, now });
    expect(result.totalCount).toBe(1);
    expect(result.items[0].attemptId).toBe('att-1');
  });

  it('Escenario 2 (DEC-084): permite consultar Mis aportes cuando el evento está CLOSED o en GRACE_PERIOD', async () => {
    // Test CLOSED
    db.events.set(eventId, {
      ...db.events.get(eventId),
      status: 'CLOSED',
      uploads_enabled: false,
      guest_gallery_enabled: false
    });

    const resultClosed = await service.getGuestContributions({ sessionToken: validToken, now });
    expect(resultClosed.sessionId).toBe(session1Id);

    // Test GRACE_PERIOD
    db.events.set(eventId, {
      ...db.events.get(eventId),
      status: 'GRACE_PERIOD',
      uploads_enabled: false
    });

    const resultGrace = await service.getGuestContributions({ sessionToken: validToken, now });
    expect(resultGrace.sessionId).toBe(session1Id);
  });

  it('Escenario 3: deniega fail-closed cuando la sesión está revocada', async () => {
    db.sessions.set(session1Id, {
      ...db.sessions.get(session1Id),
      revoked_at: new Date(now.getTime() - 1000)
    });

    await expect(
      service.getGuestContributions({ sessionToken: validToken, now })
    ).rejects.toThrowError(EventManagementError);
  });

  it('Escenario 3: deniega fail-closed cuando el token no existe', async () => {
    await expect(
      service.getGuestContributions({ sessionToken: 'nonexistent-token', now })
    ).rejects.toThrowError(EventManagementError);
  });

  it('devuelve lista vacía cuando el usuario no tiene aportes sin fallar', async () => {
    const result = await service.getGuestContributions({ sessionToken: validToken, now });
    expect(result.totalCount).toBe(0);
    expect(result.acceptedCount).toBe(0);
    expect(result.items).toEqual([]);
  });

  it('deniega acceso si el evento está en SUSPENDED o DRAFT', async () => {
    db.events.set(eventId, {
      ...db.events.get(eventId),
      status: 'SUSPENDED'
    });

    await expect(
      service.getGuestContributions({ sessionToken: validToken, now })
    ).rejects.toThrowError(/cannot be accessed/);
  });
});
