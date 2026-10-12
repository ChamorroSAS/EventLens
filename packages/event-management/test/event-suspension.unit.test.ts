import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import type { AdminActorContext } from '@eventlens/identity';
import {
  EventLifecycleService,
  EventManagementError,
  type EventAuditSink,
  type EventAuditRecord,
  type EventRecord,
  type EventStatus
} from '../src/index.js';

interface InMemoryEventRow {
  id: string;
  organizer_id: string;
  name: string;
  status: string;
  previous_status?: string | null;
  suspension_reason?: string | null;
  suspended_at?: Date | string | null;
  scheduled_at?: Date | string | null;
  expires_at?: Date | string | null;
  grace_ends_at?: Date | string | null;
  revision?: bigint | number | string | null;
  timezone: string;
  uploads_enabled: boolean;
  guest_gallery_enabled: boolean;
  moderation_mode: string;
  pin_enabled: boolean;
  idempotency_key?: string | null;
  idempotency_payload_hash?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface InMemoryDb {
  events: Map<string, InMemoryEventRow>;
  auditEvents: EventAuditRecord[];
}

function createInMemoryRunner(db: InMemoryDb): TransactionRunner {
  return {
    async run<R>(callback: (tx: SqlTransaction) => Promise<R>): Promise<R> {
      const tx: SqlTransaction = {
        async query<T extends object>(sql: string, ...params: unknown[]): Promise<T[]> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // SELECT ... FROM event WHERE id = $1 [FOR UPDATE]
          if (normalized.includes('FROM event WHERE id = $1')) {
            const id = (params[0] as string).toLowerCase();
            const ev = db.events.get(id);
            if (ev) return [{ ...ev }] as unknown as T[];
            return [] as unknown as T[];
          }

          throw new Error(`Unhandled mock SQL query: ${sql}`);
        },

        async execute(sql: string, ...params: unknown[]): Promise<number> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // UPDATE event SET status = 'SUSPENDED' ... WHERE id = $5
          if (normalized.startsWith('UPDATE event SET status = \'SUSPENDED\'')) {
            const [previousStatus, suspensionReason, suspendedAt, revision, id] = params;
            const normalizedId = (id as string).toLowerCase();
            const existing = db.events.get(normalizedId);
            if (!existing) return 0;

            const updated: InMemoryEventRow = {
              ...existing,
              status: 'SUSPENDED',
              previous_status: previousStatus as string,
              suspension_reason: suspensionReason as string,
              suspended_at: suspendedAt as Date,
              revision: revision as bigint,
              updated_at: suspendedAt as Date
            };
            db.events.set(normalizedId, updated);
            return 1;
          }

          throw new Error(`Unhandled mock SQL execute: ${sql}`);
        }
      };

      return callback(tx);
    }
  };
}

describe('EventLifecycleService — Administrative Suspension Unit Tests (EL-TK-068)', () => {
  let db: InMemoryDb;
  let auditSink: EventAuditSink;
  let service: EventLifecycleService;

  const validAdminContext: AdminActorContext = {
    actorType: 'ADMIN_HUMAN',
    principalId: 'admin-uuid-001',
    identifier: 'admin@eventlens.local',
    sessionId: 'session-001',
    authTime: new Date(),
    credentialRevision: 1n,
    adminAuthRevision: 1n,
    sessionWatermark: 1n,
    recoveryEpoch: 1n
  };

  beforeEach(() => {
    db = {
      events: new Map(),
      auditEvents: []
    };

    auditSink = {
      record: vi.fn(async (rec: EventAuditRecord) => {
        db.auditEvents.push(rec);
      })
    };

    service = new EventLifecycleService(createInMemoryRunner(db), auditSink);
  });

  function seedEvent(id: string, overrides: Partial<InMemoryEventRow> = {}): InMemoryEventRow {
    const row: InMemoryEventRow = {
      id: id.toLowerCase(),
      organizer_id: randomUUID(),
      name: 'Corporate Summit 2026',
      status: 'ACTIVE',
      previous_status: null,
      suspension_reason: null,
      suspended_at: null,
      scheduled_at: null,
      expires_at: null,
      grace_ends_at: null,
      revision: 1n,
      timezone: 'America/Bogota',
      uploads_enabled: true,
      guest_gallery_enabled: true,
      moderation_mode: 'AUTO_PUBLISH',
      pin_enabled: false,
      created_at: new Date('2026-10-01T00:00:00Z'),
      updated_at: new Date('2026-10-01T00:00:00Z'),
      ...overrides
    };
    db.events.set(id.toLowerCase(), row);
    return row;
  }

  it('Escenario 1: Suspends an active event preserving previous status and reason', async () => {
    const eventId = randomUUID();
    seedEvent(eventId, { status: 'ACTIVE', revision: 2n });

    const result = await service.suspendEvent({
      actorContext: validAdminContext,
      eventId,
      reason: 'Terms of service investigation regarding unauthorized branding.'
    });

    expect(result.event.status).toBe('SUSPENDED');
    expect(result.previousStatus).toBe('ACTIVE');
    expect(result.event.previousStatus).toBe('ACTIVE');
    expect(result.suspensionReason).toBe('Terms of service investigation regarding unauthorized branding.');
    expect(result.event.suspensionReason).toBe('Terms of service investigation regarding unauthorized branding.');
    expect(result.revision).toBe(3n);
    expect(result.event.revision).toBe(3n);
    expect(result.suspendedAt).toBeInstanceOf(Date);

    // Verify persistence in db
    const stored = db.events.get(eventId.toLowerCase())!;
    expect(stored.status).toBe('SUSPENDED');
    expect(stored.previous_status).toBe('ACTIVE');
    expect(stored.revision).toBe(3n);

    // Verify audit
    expect(auditSink.record).toHaveBeenCalledWith(
      expect.objectContaining({
        procedure: 'EVENT_SUSPENDED',
        actorId: validAdminContext.principalId,
        targetIdentifier: eventId.toLowerCase(),
        result: 'SUCCESS'
      })
    );
  });

  it('Escenario 2: Rejects suspension of a terminal DELETED event with TERMINAL_STATE_CANNOT_SUSPEND', async () => {
    const eventId = randomUUID();
    seedEvent(eventId, { status: 'DELETED', revision: 5n });

    await expect(
      service.suspendEvent({
        actorContext: validAdminContext,
        eventId,
        reason: 'Attempted administrative hold on deleted event'
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'TERMINAL_STATE_CANNOT_SUSPEND'
      })
    );

    const stored = db.events.get(eventId.toLowerCase())!;
    expect(stored.status).toBe('DELETED');
    expect(stored.revision).toBe(5n);

    expect(auditSink.record).toHaveBeenCalledWith(
      expect.objectContaining({
        procedure: 'EVENT_SUSPENDED',
        result: 'REJECTED_INVALID_STATE',
        targetIdentifier: eventId.toLowerCase()
      })
    );
  });

  it('Rejects unauthorized callers without ADMIN_HUMAN context', async () => {
    const eventId = randomUUID();
    seedEvent(eventId, { status: 'ACTIVE' });

    // Unauthorized non-admin context
    await expect(
      service.suspendEvent({
        actorContext: { actorType: 'ORGANIZER_HUMAN' } as any,
        eventId,
        reason: 'Organizer attempting to self-suspend'
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'UNAUTHORIZED'
      })
    );

    const stored = db.events.get(eventId.toLowerCase())!;
    expect(stored.status).toBe('ACTIVE');
  });

  it('Rejects missing or empty suspension reasons', async () => {
    const eventId = randomUUID();
    seedEvent(eventId, { status: 'ACTIVE' });

    await expect(
      service.suspendEvent({
        actorContext: validAdminContext,
        eventId,
        reason: '   '
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'INVALID_ARGUMENT'
      })
    );

    await expect(
      service.suspendEvent({
        actorContext: validAdminContext,
        eventId,
        reason: ''
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'INVALID_ARGUMENT'
      })
    );

    const stored = db.events.get(eventId.toLowerCase())!;
    expect(stored.status).toBe('ACTIVE');
  });

  it('Rejects invalid eventId formats', async () => {
    await expect(
      service.suspendEvent({
        actorContext: validAdminContext,
        eventId: 'invalid-not-uuid',
        reason: 'Reason'
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'INVALID_ARGUMENT'
      })
    );
  });

  it('Throws EVENT_NOT_FOUND if event does not exist', async () => {
    const nonExistentId = randomUUID();
    await expect(
      service.suspendEvent({
        actorContext: validAdminContext,
        eventId: nonExistentId,
        reason: 'Reason'
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'EVENT_NOT_FOUND'
      })
    );
  });

  it('Throws INVALID_STATE if the event is already SUSPENDED', async () => {
    const eventId = randomUUID();
    seedEvent(eventId, { status: 'SUSPENDED', previous_status: 'ACTIVE' });

    await expect(
      service.suspendEvent({
        actorContext: validAdminContext,
        eventId,
        reason: 'Second suspension attempt'
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'INVALID_STATE'
      })
    );
  });

  it('Enforces optimistic concurrency control and rejects on revision mismatch', async () => {
    const eventId = randomUUID();
    seedEvent(eventId, { status: 'SCHEDULED', revision: 4n });

    // Stale revision: expected 3n while event is already at 4n
    await expect(
      service.suspendEvent({
        actorContext: validAdminContext,
        eventId,
        reason: 'Conflict test',
        expectedRevision: 3n
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'CONCURRENCY_CONFLICT'
      })
    );

    const stored = db.events.get(eventId.toLowerCase())!;
    expect(stored.status).toBe('SCHEDULED');
    expect(stored.revision).toBe(4n);

    expect(auditSink.record).toHaveBeenCalledWith(
      expect.objectContaining({
        procedure: 'EVENT_SUSPENDED',
        result: 'CONCURRENCY_CONFLICT'
      })
    );

    // Matching revision succeeds
    const successResult = await service.suspendEvent({
      actorContext: validAdminContext,
      eventId,
      reason: 'Conflict test resolved',
      expectedRevision: 4n
    });

    expect(successResult.event.status).toBe('SUSPENDED');
    expect(successResult.previousStatus).toBe('SCHEDULED');
    expect(successResult.revision).toBe(5n);
  });
});
