import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
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
            const id = params[0] as string;
            const ev = db.events.get(id);
            if (ev) return [{ ...ev }] as unknown as T[];
            return [] as unknown as T[];
          }

          // SELECT ... FROM public_access_credential WHERE event_id = $1 AND revoked_at IS NULL
          if (normalized.includes('FROM public_access_credential') && normalized.includes('event_id = $1 AND revoked_at IS NULL')) {
            const eventId = params[0] as string;
            const active = Array.from(db.credentials.values())
              .filter((c) => c.event_id === eventId && !c.revoked_at)
              .sort((a, b) => b.generation - a.generation);
            if (active.length > 0) {
              return [{ ...active[0] }] as unknown as T[];
            }
            return [] as unknown as T[];
          }

          // INSERT INTO public_access_credential
          if (normalized.includes('INSERT INTO public_access_credential')) {
            const [
              id,
              event_id,
              lookup_key,
              token_hash,
              pin_required,
              created_at,
              idempotency_key,
              idempotency_payload_hash
            ] = params;

            const record = {
              id,
              event_id,
              lookup_key,
              token_hash,
              generation: 1,
              pin_required,
              created_at,
              revoked_at: null,
              idempotency_key,
              idempotency_payload_hash
            };
            db.credentials.set(id as string, record);
            return [{ ...record }] as unknown as T[];
          }

          throw new Error(`Unhandled mock query: ${sql}`);
        },

        async execute(sql: string, ...params: unknown[]): Promise<number> {
          throw new Error(`Unhandled mock execute: ${sql}`);
        }
      };

      return callback(tx);
    }
  };
}

describe('EL-TK-084: EventPublicAccessService (Unit Tests)', () => {
  let db: MockDb;
  let auditSink: EventAuditSink;
  let service: EventPublicAccessService;
  let ownerActor: OrganizerActorContext;

  beforeEach(() => {
    db = {
      events: new Map(),
      credentials: new Map(),
      auditEvents: []
    };

    auditSink = {
      record: vi.fn(async (event) => {
        db.auditEvents.push(event);
      })
    };

    service = new EventPublicAccessService(createMockRunner(db), auditSink);

    ownerActor = {
      actorType: 'ORGANIZER_HUMAN',
      accountId: randomUUID(),
      email: 'organizer@eventlens.local',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };
  });

  it('Escenario 1: Emite PublicAccessCredential inicial aleatoria con generation=1 y pinRequired=false cuando el evento no tiene PIN', async () => {
    const eventId = randomUUID();
    db.events.set(eventId, {
      id: eventId,
      organizer_id: ownerActor.accountId,
      status: 'DRAFT',
      pin_enabled: false
    });

    const result = await service.issueInitialCredential({
      actorContext: ownerActor,
      eventId
    });

    expect(result.outcome).toBe('ISSUED');
    expect(result.credential).toBeDefined();
    expect(result.credential.eventId).toBe(eventId);
    expect(result.credential.generation).toBe(1);
    expect(result.credential.pinRequired).toBe(false);
    expect(result.credential.revokedAt).toBeNull();
    expect(result.credential.lookupKey).toBeTypeOf('string');
    expect(result.credential.lookupKey.length).toBeGreaterThanOrEqual(20);
    // No debe contener el ID del evento (no indexable, no predecible)
    expect(result.credential.lookupKey).not.toContain(eventId);

    // Auditoría
    expect(auditSink.record).toHaveBeenCalled();
    const audit = db.auditEvents[0];
    expect(audit.procedure).toBe('EVENT_PUBLIC_CREDENTIAL_ISSUED');
    expect(audit.result).toBe('SUCCESS');
    expect(audit.details).not.toContain(result.credential.lookupKey);
  });

  it('Escenario 2: Vincula pinRequired=true si el evento tiene PIN inicial configurado per EL-TK-027', async () => {
    const eventId = randomUUID();
    db.events.set(eventId, {
      id: eventId,
      organizer_id: ownerActor.accountId,
      status: 'DRAFT',
      pin_enabled: true
    });

    const result = await service.issueInitialCredential({
      actorContext: ownerActor,
      eventId
    });

    expect(result.outcome).toBe('ISSUED');
    expect(result.credential.pinRequired).toBe(true);
    expect(result.credential.generation).toBe(1);
  });

  it('Escenario 3: Idempotencia: si ya existe una credencial activa, la devuelve limpiamente sin sobreescribir', async () => {
    const eventId = randomUUID();
    db.events.set(eventId, {
      id: eventId,
      organizer_id: ownerActor.accountId,
      status: 'ACTIVE',
      pin_enabled: false
    });

    // Primer llamado
    const first = await service.issueInitialCredential({
      actorContext: ownerActor,
      eventId
    });
    expect(first.outcome).toBe('ISSUED');

    // Segundo llamado sobre el mismo evento con credencial activa
    const second = await service.issueInitialCredential({
      actorContext: ownerActor,
      eventId
    });

    expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
    expect(second.credential.id).toBe(first.credential.id);
    expect(second.credential.lookupKey).toBe(first.credential.lookupKey);
    expect(second.credential.generation).toBe(1);

    // No se duplicó en la base de datos
    expect(db.credentials.size).toBe(1);
  });

  it('Rechaza emisión si el actor no es el propietario del evento (UNAUTHORIZED)', async () => {
    const eventId = randomUUID();
    db.events.set(eventId, {
      id: eventId,
      organizer_id: randomUUID(), // Dueño distinto
      status: 'DRAFT',
      pin_enabled: false
    });

    await expect(
      service.issueInitialCredential({
        actorContext: ownerActor,
        eventId
      })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('Rechaza emisión si el evento no existe (EVENT_NOT_FOUND) o si es terminal (EVENT_TERMINAL)', async () => {
    await expect(
      service.issueInitialCredential({
        actorContext: ownerActor,
        eventId: randomUUID()
      })
    ).rejects.toMatchObject({ code: 'EVENT_NOT_FOUND' });

    const terminalId = randomUUID();
    db.events.set(terminalId, {
      id: terminalId,
      organizer_id: ownerActor.accountId,
      status: 'PENDING_DELETION',
      pin_enabled: false
    });

    await expect(
      service.issueInitialCredential({
        actorContext: ownerActor,
        eventId: terminalId
      })
    ).rejects.toMatchObject({ code: 'EVENT_TERMINAL' });
  });
});
