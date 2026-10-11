import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import type { OrganizerActorContext } from '@eventlens/identity';
import {
  EventDraftService,
  EventAccessPolicy,
  EventManagementError,
  type EventAuditSink,
  type EventAuditRecord
} from '../src/index.js';

interface InMemoryDb {
  events: Map<string, any>;
  auditEvents: EventAuditRecord[];
}

function createInMemoryRunner(db: InMemoryDb): TransactionRunner {
  return {
    async run<R>(callback: (tx: SqlTransaction) => Promise<R>): Promise<R> {
      const tx: SqlTransaction = {
        async query<T extends object>(sql: string, ...params: unknown[]): Promise<T[]> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // SELECT ... FROM event WHERE idempotency_key = $1
          if (normalized.includes('FROM event') && normalized.includes('idempotency_key = $1')) {
            const key = params[0] as string;
            for (const ev of db.events.values()) {
              if (ev.idempotency_key === key) {
                return [{ ...ev }] as unknown as T[];
              }
            }
            return [] as unknown as T[];
          }

          // SELECT ... FROM event WHERE id = $1
          if (normalized.includes('FROM event') && normalized.includes('id = $1')) {
            const id = params[0] as string;
            const ev = db.events.get(id);
            if (ev) return [{ ...ev }] as unknown as T[];
            return [] as unknown as T[];
          }

          throw new Error(`Unhandled mock SQL query: ${sql}`);
        },

        async execute(sql: string, ...params: unknown[]): Promise<number> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // INSERT INTO event
          if (normalized.includes('INSERT INTO event')) {
            const [
              id,
              organizer_id,
              name,
              status,
              timezone,
              uploads_enabled,
              guest_gallery_enabled,
              moderation_mode,
              pin_enabled,
              idempotency_key,
              idempotency_payload_hash,
              created_at,
              updated_at
            ] = params;

            const record = {
              id,
              organizer_id,
              name,
              status,
              timezone,
              uploads_enabled,
              guest_gallery_enabled,
              moderation_mode,
              pin_enabled,
              idempotency_key,
              idempotency_payload_hash,
              created_at,
              updated_at
            };
            db.events.set(id as string, record);
            return 1;
          }

          throw new Error(`Unhandled mock SQL execute: ${sql}`);
        }
      };

      return callback(tx);
    }
  };
}

describe('EL-TK-020: EventDraftService (Unit Tests)', () => {
  let db: InMemoryDb;
  let auditSink: EventAuditSink;
  let service: EventDraftService;
  let mockActor: OrganizerActorContext;

  beforeEach(() => {
    db = {
      events: new Map(),
      auditEvents: []
    };

    auditSink = {
      record: vi.fn(async (event) => {
        db.auditEvents.push(event);
      })
    };

    service = new EventDraftService(createInMemoryRunner(db), auditSink);

    mockActor = {
      actorType: 'ORGANIZER_HUMAN',
      accountId: randomUUID(),
      email: 'organizer@eventlens.internal',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };
  });

  it('Escenario 1: Crea un borrador de evento con valores iniciales confirmados (DEC-069)', async () => {
    const result = await service.createDraft({
      actorContext: mockActor,
      name: 'Graduación Medicina 2026'
    });

    expect(result.outcome).toBe('CREATED');
    expect(result.event).toBeDefined();
    expect(result.event.id).toBeDefined();
    expect(result.event.organizerId).toBe(mockActor.accountId);
    expect(result.event.name).toBe('Graduación Medicina 2026');
    expect(result.event.status).toBe('DRAFT');
    expect(result.event.timezone).toBe('America/Bogota');
    expect(result.event.uploadsEnabled).toBe(false);
    expect(result.event.guestGalleryEnabled).toBe(false);
    expect(result.event.moderationMode).toBe('AUTO_PUBLISH');
    expect(result.event.pinEnabled).toBe(false);

    expect(auditSink.record).toHaveBeenCalled();
    const auditCall = (auditSink.record as any).mock.calls[0][0];
    expect(auditCall.procedure).toBe('EVENT_DRAFT_CREATED');
    expect(auditCall.result).toBe('SUCCESS');
    expect(auditCall.actorId).toBe(mockActor.accountId);
  });

  it('Escenario 2: Rechaza creación con nombre vacío o solo espacios en blanco sin crear evento', async () => {
    await expect(
      service.createDraft({
        actorContext: mockActor,
        name: ''
      })
    ).rejects.toThrowError(EventManagementError);

    await expect(
      service.createDraft({
        actorContext: mockActor,
        name: '    '
      })
    ).rejects.toMatchObject({
      code: 'INVALID_NAME'
    });

    expect(db.events.size).toBe(0);
  });

  it('Escenario 2: Rechaza nombres que exceden 120 caracteres', async () => {
    const overlyLongName = 'A'.repeat(121);
    await expect(
      service.createDraft({
        actorContext: mockActor,
        name: overlyLongName
      })
    ).rejects.toMatchObject({
      code: 'INVALID_NAME'
    });

    expect(db.events.size).toBe(0);
  });

  it('Escenario 2: Rechaza llamadas sin actor autenticado válido', async () => {
    await expect(
      service.createDraft({
        actorContext: { ...mockActor, actorType: 'GUEST_ANONYMOUS' as any },
        name: 'Evento no autorizado'
      })
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED'
    });

    expect(db.events.size).toBe(0);
  });

  it('Escenario 3: Un borrador de evento bloquea estrictamente acceso y subidas de invitados (EventAccessPolicy)', async () => {
    const { event } = await service.createDraft({
      actorContext: mockActor,
      name: 'Boda Campestre 2026'
    });

    // En estado DRAFT, invitados nunca acceden ni cargan
    expect(EventAccessPolicy.canGuestAccess(event)).toBe(false);
    expect(EventAccessPolicy.canGuestUpload(event)).toBe(false);

    // El organizador creador sí puede gestionar
    expect(EventAccessPolicy.canOrganizerManage(event, mockActor)).toBe(true);

    // Otro organizador no puede gestionar el evento
    const otherOrganizer = { ...mockActor, accountId: randomUUID() };
    expect(EventAccessPolicy.canOrganizerManage(event, otherOrganizer)).toBe(false);
  });

  it('Idempotencia: Replay idéntico devuelve el mismo evento y misma clave con diferente nombre da conflicto', async () => {
    const idempotencyKey = 'unique-key-12345';

    // Primer intento
    const firstCall = await service.createDraft({
      actorContext: mockActor,
      name: 'Congreso Internacional',
      idempotencyKey
    });

    expect(firstCall.outcome).toBe('CREATED');

    // Replay idéntico
    const secondCall = await service.createDraft({
      actorContext: mockActor,
      name: 'Congreso Internacional',
      idempotencyKey
    });

    expect(secondCall.outcome).toBe('IDEMPOTENT_REPLAY');
    expect(secondCall.event.id).toBe(firstCall.event.id);

    // Mismo key con payload distinto -> Conflicto
    await expect(
      service.createDraft({
        actorContext: mockActor,
        name: 'Otro Nombre Diferente',
        idempotencyKey
      })
    ).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT'
    });
  });
});
