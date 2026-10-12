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

          // SELECT ... FROM public_access_credential c JOIN event e ON e.id = c.event_id WHERE c.lookup_key = $1
          if (normalized.includes('FROM public_access_credential c JOIN event e') && normalized.includes('WHERE c.lookup_key = $1')) {
            const key = params[0] as string;
            const cred = Array.from(db.credentials.values()).find((c) => c.lookup_key === key);
            if (!cred) return [] as unknown as T[];
            const ev = db.events.get(cred.event_id);
            if (!ev) return [] as unknown as T[];
            return [{
              id: cred.id,
              event_id: cred.event_id,
              lookup_key: cred.lookup_key,
              token_hash: cred.token_hash,
              generation: cred.generation,
              pin_required: cred.pin_required,
              revoked_at: cred.revoked_at ?? null,
              event_name: ev.name ?? 'Event Name',
              event_status: ev.status,
              event_timezone: ev.timezone ?? 'America/Bogota',
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
              pin_enabled: Boolean(ev.pin_enabled),
              organizer_id: ev.organizer_id,
              created_at: cred.created_at,
              updated_at: cred.created_at
            }] as unknown as T[];
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

  describe('EL-TK-074: resolvePublicAccess', () => {
    it('Escenario 1: Resuelve enlace vigente de evento ACTIVE concediendo capacidades autorizadas sin autenticación ni PII', async () => {
      const eventId = randomUUID();
      const lookupKey = 'valid_high_entropy_token_12345';
      const credId = randomUUID();

      db.events.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Tech Conference 2026',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
        uploads_enabled: true,
        guest_gallery_enabled: true,
        pin_enabled: false
      });

      db.credentials.set(credId, {
        id: credId,
        event_id: eventId,
        lookup_key: lookupKey,
        token_hash: 'somehash',
        generation: 1,
        pin_required: false,
        created_at: new Date(),
        revoked_at: null
      });

      const result = await service.resolvePublicAccess({ lookupKey });

      expect(result.accessState).toBe('ALLOWED');
      expect(result.eventId).toBe(eventId);
      expect(result.name).toBe('Tech Conference 2026');
      expect(result.status).toBe('ACTIVE');
      expect(result.timezone).toBe('America/Bogota');
      expect(result.generation).toBe(1);
      expect(result.pinRequired).toBe(false);
      expect(result.capabilities).toEqual({
        canViewLanding: true,
        canUpload: true,
        canViewGallery: true
      });
      // No contiene información privada del organizador
      expect((result as any).organizerId).toBeUndefined();
      expect((result as any).pinHash).toBeUndefined();

      // Auditoría sanitizada
      const audit = db.auditEvents.find((a) => a.procedure === 'EVENT_PUBLIC_ACCESS_RESOLVED');
      expect(audit).toBeDefined();
      expect(audit?.targetIdentifier).toBe(eventId);
      expect(audit?.details).not.toContain(lookupKey);
    });

    it('Escenario 1 con PIN: Indica pinRequired=true si la credencial exige PIN según EL-TK-027', async () => {
      const eventId = randomUUID();
      const lookupKey = 'pin_protected_token_abcdef';
      const credId = randomUUID();

      db.events.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Private Gala',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
        uploads_enabled: true,
        guest_gallery_enabled: false,
        pin_enabled: true
      });

      db.credentials.set(credId, {
        id: credId,
        event_id: eventId,
        lookup_key: lookupKey,
        token_hash: 'somehash',
        generation: 1,
        pin_required: true,
        created_at: new Date(),
        revoked_at: null
      });

      const result = await service.resolvePublicAccess({ lookupKey });

      expect(result.accessState).toBe('ALLOWED');
      expect(result.pinRequired).toBe(true);
      expect(result.capabilities.canUpload).toBe(true);
      expect(result.capabilities.canViewGallery).toBe(false);
    });

    it('Escenario 2: Enlace revocado o inexistente devuelve INVALID_CREDENTIAL fail-closed sin filtrar datos del evento', async () => {
      // 1. Inexistente
      await expect(
        service.resolvePublicAccess({ lookupKey: 'non_existent_token_0000000000' })
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL' });

      // 2. Revocado tras sustitución o regeneración
      const eventId = randomUUID();
      const revokedKey = 'old_revoked_token_1111111111';
      const credId = randomUUID();

      db.events.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Secret Party',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
        uploads_enabled: true,
        guest_gallery_enabled: true
      });

      db.credentials.set(credId, {
        id: credId,
        event_id: eventId,
        lookup_key: revokedKey,
        token_hash: 'revokedhash',
        generation: 1,
        pin_required: false,
        created_at: new Date(),
        revoked_at: new Date() // Revocado
      });

      await expect(
        service.resolvePublicAccess({ lookupKey: revokedKey })
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL' });
    });

    it('Escenario 3: Evento SUSPENDED con credencial válida devuelve UNAVAILABLE respetando policy de lifecycle', async () => {
      const eventId = randomUUID();
      const lookupKey = 'suspended_token_2222222222';
      const credId = randomUUID();

      db.events.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Suspended Festival',
        status: 'SUSPENDED',
        timezone: 'America/Bogota',
        uploads_enabled: true,
        guest_gallery_enabled: true
      });

      db.credentials.set(credId, {
        id: credId,
        event_id: eventId,
        lookup_key: lookupKey,
        token_hash: 'suspendedhash',
        generation: 1,
        pin_required: false,
        created_at: new Date(),
        revoked_at: null
      });

      const result = await service.resolvePublicAccess({ lookupKey });

      expect(result.accessState).toBe('UNAVAILABLE');
      expect(result.status).toBe('SUSPENDED');
      expect(result.capabilities).toEqual({
        canViewLanding: false,
        canUpload: false,
        canViewGallery: false
      });
      expect(result.restrictionReason).toContain('suspended');
    });

    it('Escenario 3: Evento CLOSED con credencial válida devuelve RESTRICTED (uploads cerrados, galería accesible si está habilitada)', async () => {
      const eventId = randomUUID();
      const lookupKey = 'closed_token_3333333333';
      const credId = randomUUID();

      db.events.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Concluded Summit',
        status: 'CLOSED',
        timezone: 'America/Bogota',
        uploads_enabled: true,
        guest_gallery_enabled: true
      });

      db.credentials.set(credId, {
        id: credId,
        event_id: eventId,
        lookup_key: lookupKey,
        token_hash: 'closedhash',
        generation: 1,
        pin_required: false,
        created_at: new Date(),
        revoked_at: null
      });

      const result = await service.resolvePublicAccess({ lookupKey });

      expect(result.accessState).toBe('RESTRICTED');
      expect(result.status).toBe('CLOSED');
      expect(result.capabilities.canViewLanding).toBe(true);
      expect(result.capabilities.canUpload).toBe(false);
      expect(result.capabilities.canViewGallery).toBe(true);
      expect(result.restrictionReason).toBeDefined();
    });

    it('Escenario 3: Evento SCHEDULED con credencial válida devuelve RESTRICTED (landing accesible, uploads y galería cerrados)', async () => {
      const eventId = randomUUID();
      const lookupKey = 'scheduled_token_4444444444';
      const credId = randomUUID();

      db.events.set(eventId, {
        id: eventId,
        organizer_id: ownerActor.accountId,
        name: 'Upcoming Expo',
        status: 'SCHEDULED',
        timezone: 'America/Bogota',
        uploads_enabled: true,
        guest_gallery_enabled: true
      });

      db.credentials.set(credId, {
        id: credId,
        event_id: eventId,
        lookup_key: lookupKey,
        token_hash: 'scheduledhash',
        generation: 1,
        pin_required: false,
        created_at: new Date(),
        revoked_at: null
      });

      const result = await service.resolvePublicAccess({ lookupKey });

      expect(result.accessState).toBe('RESTRICTED');
      expect(result.status).toBe('SCHEDULED');
      expect(result.capabilities.canViewLanding).toBe(true);
      expect(result.capabilities.canUpload).toBe(false);
      expect(result.capabilities.canViewGallery).toBe(false);
    });
  });
});
