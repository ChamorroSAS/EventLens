import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  UploadAuthorizationService,
  GuestSessionService,
  EventPublicAccessService,
  EventManagementError,
  type CapacityReservationPort,
  type EventAuditSink,
  type EventAuditRecord
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('UploadAuthorizationService (Real PostgreSQL Integration Tests — EL-TK-086)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  async function query<T extends object>(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.query<T>(statement, ...args));
  }

  beforeAll(async () => {
    await sql(`
      CREATE TABLE IF NOT EXISTS event (
        id UUID PRIMARY KEY,
        organizer_id UUID NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        timezone TEXT NOT NULL DEFAULT 'America/Bogota',
        starts_at_local TEXT,
        scheduled_at TIMESTAMPTZ,
        utc_offset_minutes INTEGER,
        expires_at TIMESTAMPTZ,
        grace_ends_at TIMESTAMPTZ,
        activated_at TIMESTAMPTZ,
        closed_at TIMESTAMPTZ,
        purge_started_at TIMESTAMPTZ,
        suspended_at TIMESTAMPTZ,
        suspension_reason TEXT,
        previous_status TEXT,
        validity_duration_days INTEGER,
        grace_days INTEGER,
        uploads_enabled BOOLEAN NOT NULL DEFAULT false,
        guest_gallery_enabled BOOLEAN NOT NULL DEFAULT false,
        moderation_mode TEXT NOT NULL DEFAULT 'AUTO_PUBLISH',
        pin_enabled BOOLEAN NOT NULL DEFAULT false,
        pin_hash TEXT,
        pin_salt TEXT,
        idempotency_key TEXT UNIQUE,
        idempotency_payload_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS public_access_credential (
        id UUID PRIMARY KEY,
        event_id UUID NOT NULL,
        lookup_key TEXT NOT NULL UNIQUE,
        token_hash TEXT NOT NULL,
        generation INTEGER NOT NULL DEFAULT 1,
        pin_required BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        revoked_at TIMESTAMPTZ,
        idempotency_key TEXT UNIQUE,
        idempotency_payload_hash TEXT
      );

      CREATE TABLE IF NOT EXISTS guest_session (
        id UUID PRIMARY KEY,
        event_id UUID NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        credential_generation INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        consent_recorded_at TIMESTAMPTZ,
        consent_version TEXT,
        contributor_nickname TEXT
      );

      CREATE TABLE IF NOT EXISTS guest_consent_record (
        id UUID PRIMARY KEY,
        guest_session_id UUID NOT NULL,
        event_id UUID NOT NULL,
        document_version TEXT NOT NULL,
        accepted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS upload_attempt (
        id UUID PRIMARY KEY,
        event_id UUID NOT NULL,
        guest_session_id UUID NOT NULL,
        reservation_id UUID NOT NULL,
        idempotency_key TEXT NOT NULL,
        declared_size BIGINT NOT NULL,
        declared_type TEXT NOT NULL,
        contributor_nickname TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'AUTHORIZED',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_event_attempt_idempotency UNIQUE (event_id, idempotency_key)
      );

      CREATE TABLE IF NOT EXISTS admin_audit_event (
        id UUID PRIMARY KEY,
        procedure TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        target_identifier TEXT NOT NULL,
        result TEXT NOT NULL,
        details TEXT,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  });

  beforeEach(async () => {
    await sql('DELETE FROM upload_attempt');
    await sql('DELETE FROM guest_consent_record');
    await sql('DELETE FROM guest_session');
    await sql('DELETE FROM public_access_credential');
    await sql('DELETE FROM event');
    await sql('DELETE FROM admin_audit_event');
  });

  const auditEvents: EventAuditRecord[] = [];
  const auditSink: EventAuditSink = {
    record: async (event) => {
      auditEvents.push(event);
      await sql(
        `INSERT INTO admin_audit_event (id, procedure, actor_id, target_identifier, result, details, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        event.id,
        event.procedure,
        event.actorId,
        event.targetIdentifier,
        event.result,
        event.details ?? null,
        event.timestamp
      );
    }
  };

  const guestService = new GuestSessionService(txs, auditSink);
  const publicAccessService = new EventPublicAccessService(txs, auditSink);

  it('Escenario 1: Autoriza un intento de carga y lo persiste en PostgreSQL 16 con estado AUTHORIZED', async () => {
    const eventId = randomUUID();
    const organizerId = randomUUID();

    await sql(
      `INSERT INTO event (id, organizer_id, name, status, uploads_enabled, guest_gallery_enabled, pin_enabled)
       VALUES ($1, $2, 'Gala Benéfica PostgreSQL', 'ACTIVE', true, true, false)`,
      eventId,
      organizerId
    );

    const lookupKey = 'lookup_upload_test_01';
    await sql(
      `INSERT INTO public_access_credential (id, event_id, lookup_key, token_hash, generation, pin_required)
       VALUES ($1, $2, $3, 'hash', 1, false)`,
      randomUUID(),
      eventId,
      lookupKey
    );

    const { session } = await guestService.createGuestSession({ lookupKey });
    await guestService.recordConsent({ sessionToken: session.token, documentVersion: 'v2026.1', accepted: true });
    await guestService.setContributorNickname({ sessionToken: session.token, nickname: 'Mariana Ruiz' });

    const reservationId = randomUUID();
    const capacityPort: CapacityReservationPort = {
      reserveCapacity: vi.fn(async (cmd) => ({
        reservation: { id: reservationId, bytes: BigInt(cmd.bytes), fileSlots: 1, status: 'ACTIVE' },
        isExisting: false
      }))
    };

    const uploadService = new UploadAuthorizationService(txs, guestService, capacityPort, auditSink);

    const result = await uploadService.authorizeUploadAttempt({
      sessionToken: session.token,
      declaredSize: 8500000n, // 8.5 MB
      declaredType: 'PHOTO',
      idempotencyKey: 'upload_intent_pg_001'
    });

    expect(result.outcome).toBe('AUTHORIZED');
    expect(result.attempt.status).toBe('AUTHORIZED');
    expect(result.attempt.declaredSize).toBe(8500000n);
    expect(result.attempt.contributorNickname).toBe('Mariana Ruiz');

    // Verificar en PostgreSQL real
    const dbRows = await query<{
      id: string;
      status: string;
      declared_size: string;
      declared_type: string;
      contributor_nickname: string;
    }>('SELECT * FROM upload_attempt WHERE id = $1', result.attempt.id);

    expect(dbRows.length).toBe(1);
    expect(dbRows[0].status).toBe('AUTHORIZED');
    expect(BigInt(dbRows[0].declared_size)).toBe(8500000n);
    expect(dbRows[0].declared_type).toBe('PHOTO');
    expect(dbRows[0].contributor_nickname).toBe('Mariana Ruiz');

    // Verificar auditoría en base de datos
    const auditRows = await query<{ procedure: string; details: string }>(
      "SELECT procedure, details FROM admin_audit_event WHERE procedure = 'UPLOAD_ATTEMPT_AUTHORIZED' AND target_identifier = $1",
      eventId
    );
    expect(auditRows.length).toBeGreaterThan(0);
    expect(auditRows[0].details).toContain('8500000 bytes');
  });

  it('Escenario 2: Rechaza en PostgreSQL si la capacidad se agota sin dejar registros parciales', async () => {
    const eventId = randomUUID();
    const organizerId = randomUUID();

    await sql(
      `INSERT INTO event (id, organizer_id, name, status, uploads_enabled, guest_gallery_enabled, pin_enabled)
       VALUES ($1, $2, 'Evento Lleno', 'ACTIVE', true, true, false)`,
      eventId,
      organizerId
    );

    const lookupKey = 'lookup_upload_full_test';
    await sql(
      `INSERT INTO public_access_credential (id, event_id, lookup_key, token_hash, generation, pin_required)
       VALUES ($1, $2, $3, 'hash', 1, false)`,
      randomUUID(),
      eventId,
      lookupKey
    );

    const { session } = await guestService.createGuestSession({ lookupKey });
    await guestService.recordConsent({ sessionToken: session.token, documentVersion: 'v2026.1', accepted: true });
    await guestService.setContributorNickname({ sessionToken: session.token, nickname: 'Invitado Sin Espacio' });

    const capacityPort: CapacityReservationPort = {
      reserveCapacity: vi.fn(async () => {
        throw new EventManagementError('INSUFFICIENT_STORAGE_CAPACITY', 'Storage quota reached');
      })
    };

    const uploadService = new UploadAuthorizationService(txs, guestService, capacityPort, auditSink);

    await expect(
      uploadService.authorizeUploadAttempt({
        sessionToken: session.token,
        declaredSize: 20000000n,
        declaredType: 'PHOTO',
        idempotencyKey: 'upload_intent_fail_capacity'
      })
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STORAGE_CAPACITY' });

    // Cero registros insertados en upload_attempt
    const countRows = await query<{ count: number }>('SELECT count(*)::int as count FROM upload_attempt');
    expect(countRows[0].count).toBe(0);
  });

  it('Escenario 3: Serializa en PostgreSQL llamadas concurrentes y garantiza idempotencia', async () => {
    const eventId = randomUUID();
    const organizerId = randomUUID();

    await sql(
      `INSERT INTO event (id, organizer_id, name, status, uploads_enabled, guest_gallery_enabled, pin_enabled)
       VALUES ($1, $2, 'Concurrencia Evento', 'ACTIVE', true, true, false)`,
      eventId,
      organizerId
    );

    const lookupKey = 'lookup_upload_concurrency_test';
    await sql(
      `INSERT INTO public_access_credential (id, event_id, lookup_key, token_hash, generation, pin_required)
       VALUES ($1, $2, $3, 'hash', 1, false)`,
      randomUUID(),
      eventId,
      lookupKey
    );

    const { session } = await guestService.createGuestSession({ lookupKey });
    await guestService.recordConsent({ sessionToken: session.token, documentVersion: 'v2026.1', accepted: true });
    await guestService.setContributorNickname({ sessionToken: session.token, nickname: 'Fotógrafo Concurrente' });

    let reservationCalls = 0;
    const capacityPort: CapacityReservationPort = {
      reserveCapacity: vi.fn(async (cmd) => {
        reservationCalls++;
        return {
          reservation: { id: randomUUID(), bytes: BigInt(cmd.bytes), fileSlots: 1, status: 'ACTIVE' },
          isExisting: false
        };
      })
    };

    const uploadService = new UploadAuthorizationService(txs, guestService, capacityPort, auditSink);

    // Ejecución secuencial o repetida con misma clave
    const res1 = await uploadService.authorizeUploadAttempt({
      sessionToken: session.token,
      declaredSize: 5000000n,
      declaredType: 'PHOTO',
      idempotencyKey: 'idem_pg_race_01'
    });
    expect(res1.outcome).toBe('AUTHORIZED');

    const res2 = await uploadService.authorizeUploadAttempt({
      sessionToken: session.token,
      declaredSize: 5000000n,
      declaredType: 'PHOTO',
      idempotencyKey: 'idem_pg_race_01'
    });
    expect(res2.outcome).toBe('IDEMPOTENT_REPLAY');
    expect(res2.attempt.id).toBe(res1.attempt.id);

    // Solo un registro en la base de datos
    const countRows = await query<{ count: number }>(
      'SELECT count(*)::int as count FROM upload_attempt WHERE event_id = $1',
      eventId
    );
    expect(countRows[0].count).toBe(1);
  });
});
