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

          // UPDATE event
          if (normalized.includes('UPDATE event')) {
            const id = params[0] as string;
            const existing = db.events.get(id);
            if (!existing) throw new Error(`Event not found for update: ${id}`);
            if (normalized.includes('pin_enabled = true')) {
              existing.pin_enabled = true;
              existing.pin_hash = params[1];
              existing.pin_salt = params[2];
              if (params[3]) existing.idempotency_key = params[3];
              if (params[4]) existing.idempotency_payload_hash = params[4];
              existing.updated_at = params[5];
            }
            return [{ ...existing }] as unknown as T[];
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

  describe('EL-TK-027: EventDraftService.setInitialPin (Unit Tests)', () => {
    it('Escenario 1: Establece PIN inicial de 6 dígitos con ceros a la izquierda, habilita pin_enabled y no expone hash ni secreto', async () => {
      const { event: draft } = await service.createDraft({
        actorContext: mockActor,
        name: 'Evento con PIN Inicial'
      });

      const pinResult = await service.setInitialPin({
        actorContext: mockActor,
        eventId: draft.id,
        pin: '001234'
      });

      expect(pinResult.outcome).toBe('PIN_SET');
      expect(pinResult.event.pinEnabled).toBe(true);
      // No expone pin ni secretos en el EventRecord
      expect((pinResult.event as any).pin).toBeUndefined();
      expect((pinResult.event as any).pinHash).toBeUndefined();
      expect((pinResult.event as any).pinSalt).toBeUndefined();

      // Auditoría sin texto plano ni hash
      const pinAudits = db.auditEvents.filter((a) => a.procedure === 'EVENT_INITIAL_PIN_SET');
      expect(pinAudits).toHaveLength(1);
      expect(pinAudits[0].result).toBe('SUCCESS');
      expect(pinAudits[0].details).not.toContain('001234');
    });

    it('Escenario 2: Rechaza PIN que no cumpla exactamente 6 dígitos numéricos (INVALID_PIN_FORMAT)', async () => {
      const { event: draft } = await service.createDraft({
        actorContext: mockActor,
        name: 'Evento Validación PIN'
      });

      const invalidPins = ['12345', '1234567', 'abcdef', '12345a', ' 12345', '12345 ', '12-345', ''];

      for (const invalidPin of invalidPins) {
        await expect(
          service.setInitialPin({
            actorContext: mockActor,
            eventId: draft.id,
            pin: invalidPin
          })
        ).rejects.toMatchObject({
          code: 'INVALID_PIN_FORMAT'
        });
      }
    });

    it('Escenario 2: Rechaza si el actor no es el organizador propietario (UNAUTHORIZED)', async () => {
      const { event: draft } = await service.createDraft({
        actorContext: mockActor,
        name: 'Evento Aislamiento PIN'
      });

      const otherOrganizer: OrganizerActorContext = {
        ...mockActor,
        accountId: randomUUID()
      };

      await expect(
        service.setInitialPin({
          actorContext: otherOrganizer,
          eventId: draft.id,
          pin: '987654'
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED'
      });
    });

    it('Escenario 2: Rechaza si el evento no está en DRAFT (EVENT_NOT_IN_DRAFT)', async () => {
      const { event: draft } = await service.createDraft({
        actorContext: mockActor,
        name: 'Evento No Draft'
      });

      // Modificamos a SCHEDULED en la base de datos simulada
      db.events.get(draft.id)!.status = 'SCHEDULED';

      await expect(
        service.setInitialPin({
          actorContext: mockActor,
          eventId: draft.id,
          pin: '112233'
        })
      ).rejects.toMatchObject({
        code: 'EVENT_NOT_IN_DRAFT'
      });
    });

    it('Escenario 2: Rechaza intento de cambiar/desactivar un PIN ya establecido (PIN_ALREADY_CONFIGURED)', async () => {
      const { event: draft } = await service.createDraft({
        actorContext: mockActor,
        name: 'Evento PIN Repetido'
      });

      await service.setInitialPin({
        actorContext: mockActor,
        eventId: draft.id,
        pin: '123456'
      });

      // Segundo intento con otro PIN se rechaza bajo EL-EP-002
      await expect(
        service.setInitialPin({
          actorContext: mockActor,
          eventId: draft.id,
          pin: '654321'
        })
      ).rejects.toMatchObject({
        code: 'PIN_ALREADY_CONFIGURED'
      });
    });

    it('Idempotencia: Replay idéntico devuelve IDEMPOTENT_REPLAY; cambio de PIN da conflicto', async () => {
      const { event: draft } = await service.createDraft({
        actorContext: mockActor,
        name: 'Evento Idempotencia PIN'
      });

      const key = 'pin-idem-key-1';

      const res1 = await service.setInitialPin({
        actorContext: mockActor,
        eventId: draft.id,
        pin: '445566',
        idempotencyKey: key
      });
      expect(res1.outcome).toBe('PIN_SET');

      const res2 = await service.setInitialPin({
        actorContext: mockActor,
        eventId: draft.id,
        pin: '445566',
        idempotencyKey: key
      });
      expect(res2.outcome).toBe('IDEMPOTENT_REPLAY');

      await expect(
        service.setInitialPin({
          actorContext: mockActor,
          eventId: draft.id,
          pin: '778899',
          idempotencyKey: key
        })
      ).rejects.toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT'
      });
    });
  });
});

