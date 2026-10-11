import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  GuestSessionService,
  EventPublicAccessService,
  EventManagementError,
  type EventAuditSink,
  type EventAuditRecord
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('GuestSessionService (Real PostgreSQL Integration Tests — EL-TK-075)', () => {
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

      ALTER TABLE event
        ADD COLUMN IF NOT EXISTS pin_hash TEXT,
        ADD COLUMN IF NOT EXISTS pin_salt TEXT;

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

      CREATE TABLE IF NOT EXISTS guest_pin_attempt (
        id UUID PRIMARY KEY,
        lookup_key TEXT NOT NULL UNIQUE,
        attempt_count INTEGER NOT NULL DEFAULT 1,
        locked_until TIMESTAMPTZ,
        last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS guest_consent_record (
        id UUID PRIMARY KEY,
        guest_session_id UUID NOT NULL,
        event_id UUID NOT NULL,
        document_version TEXT NOT NULL,
        accepted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    await sql('DELETE FROM guest_consent_record');
    await sql('DELETE FROM guest_session');
    await sql('DELETE FROM guest_pin_attempt');
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

  it('Escenario 1: Establece sesión guest en PostgreSQL al validar PIN correcto de 6 dígitos', async () => {
    const eventId = randomUUID();
    const organizerId = randomUUID();
    const pin = '456789';
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(pin, salt, 32).toString('hex');

    await sql(
      `INSERT INTO event (id, organizer_id, name, status, timezone, uploads_enabled, guest_gallery_enabled, pin_enabled, pin_hash, pin_salt)
       VALUES ($1, $2, $3, 'ACTIVE', 'America/Bogota', true, true, true, $4, $5)`,
      eventId,
      organizerId,
      'Conferencia PostgreSQL 2026',
      hash,
      salt
    );

    const credResult = await publicAccessService.issueInitialCredential({
      actorContext: {
        actorType: 'ORGANIZER_HUMAN',
        accountId: organizerId,
        email: 'org@eventlens.local',
        sessionId: randomUUID(),
        authTime: new Date(),
        credentialRevision: 1n,
        sessionWatermark: 1n,
        recoveryEpoch: 1n
      },
      eventId
    });

    const sessionResult = await guestService.createGuestSession({
      lookupKey: credResult.credential.lookupKey,
      pin: '456789'
    });

    expect(sessionResult.session.eventId).toBe(eventId);
    expect(sessionResult.session.token).toBeTypeOf('string');

    // Verificar en la BD
    const sessionRows = await query<{ count: number }>(
      'SELECT count(*)::int as count FROM guest_session WHERE id = $1',
      sessionResult.session.id
    );
    expect(sessionRows[0].count).toBe(1);

    // Resolver con token
    const resolved = await guestService.resolveGuestSession(sessionResult.session.token);
    expect(resolved.id).toBe(sessionResult.session.id);
  });

  it('Escenario 2: PIN erróneo rechaza e incrementa intentos en PostgreSQL, bloqueando tras 5 fallos', async () => {
    const eventId = randomUUID();
    const organizerId = randomUUID();
    const pin = '112233';
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(pin, salt, 32).toString('hex');

    await sql(
      `INSERT INTO event (id, organizer_id, name, status, pin_enabled, pin_hash, pin_salt)
       VALUES ($1, $2, 'Security Event', 'ACTIVE', true, $3, $4)`,
      eventId,
      organizerId,
      hash,
      salt
    );

    const lookupKey = 'lookup_test_rate_limiting_key';
    await sql(
      `INSERT INTO public_access_credential (id, event_id, lookup_key, token_hash, generation, pin_required)
       VALUES ($1, $2, $3, 'hash', 1, true)`,
      randomUUID(),
      eventId,
      lookupKey
    );

    // 4 fallos
    for (let i = 1; i <= 4; i++) {
      await expect(
        guestService.createGuestSession({ lookupKey, pin: '000000' })
      ).rejects.toMatchObject({ code: 'INVALID_PIN' });
    }

    // 5to fallo activa RATE_LIMIT_EXCEEDED
    await expect(
      guestService.createGuestSession({ lookupKey, pin: '000000' })
    ).rejects.toMatchObject({ code: 'RATE_LIMIT_EXCEEDED' });

    // Intento con PIN correcto también bloqueado
    await expect(
      guestService.createGuestSession({ lookupKey, pin })
    ).rejects.toMatchObject({ code: 'RATE_LIMIT_EXCEEDED' });
  });

  it('Escenario 3: Establece sesión guest en PostgreSQL sin PIN cuando el evento no lo exige', async () => {
    const eventId = randomUUID();
    const organizerId = randomUUID();

    await sql(
      `INSERT INTO event (id, organizer_id, name, status, pin_enabled)
       VALUES ($1, $2, 'Open Festival', 'ACTIVE', false)`,
      eventId,
      organizerId
    );

    const lookupKey = 'open_access_lookup_key_123';
    await sql(
      `INSERT INTO public_access_credential (id, event_id, lookup_key, token_hash, generation, pin_required)
       VALUES ($1, $2, $3, 'hash', 1, false)`,
      randomUUID(),
      eventId,
      lookupKey
    );

    const sessionResult = await guestService.createGuestSession({
      lookupKey
    });

    expect(sessionResult.session.eventId).toBe(eventId);
    expect(sessionResult.event.status).toBe('ACTIVE');

    const sessionRows = await query<{ count: number }>(
      'SELECT count(*)::int as count FROM guest_session WHERE id = $1',
      sessionResult.session.id
    );
    expect(sessionRows[0].count).toBe(1);
  });

  describe('EL-TK-076: recordConsent (Real PostgreSQL 16 Integration)', () => {
    it('Escenario 1 y 2: Registra consentimiento en PostgreSQL y persiste en guest_session y guest_consent_record', async () => {
      const eventId = randomUUID();
      const organizerId = randomUUID();

      await sql(
        `INSERT INTO event (id, organizer_id, name, status, pin_enabled)
         VALUES ($1, $2, 'Festival Consentimiento', 'ACTIVE', false)`,
        eventId,
        organizerId
      );

      const lookupKey = 'lookup_consent_integ_test_1';
      await sql(
        `INSERT INTO public_access_credential (id, event_id, lookup_key, token_hash, generation, pin_required)
         VALUES ($1, $2, $3, 'hash', 1, false)`,
        randomUUID(),
        eventId,
        lookupKey
      );

      const { session } = await guestService.createGuestSession({ lookupKey });

      // Verificar que inicialmente no tiene consentimiento
      const initialCheck = await guestService.checkConsent({
        sessionToken: session.token,
        requiredVersion: 'v2026.1'
      });
      expect(initialCheck.hasConsented).toBe(false);
      expect(initialCheck.requiresAcceptance).toBe(true);

      // Registrar aceptación
      const consentResult = await guestService.recordConsent({
        sessionToken: session.token,
        documentVersion: 'v2026.1',
        accepted: true
      });

      expect(consentResult.outcome).toBe('RECORDED');
      expect(consentResult.documentVersion).toBe('v2026.1');
      expect(consentResult.sessionId).toBe(session.id);

      // Verificar persistencia en guest_session
      const sessionInDb = await query<{ consent_recorded_at: Date; consent_version: string }>(
        'SELECT consent_recorded_at, consent_version FROM guest_session WHERE id = $1',
        session.id
      );
      expect(sessionInDb[0].consent_recorded_at).not.toBeNull();
      expect(sessionInDb[0].consent_version).toBe('v2026.1');

      // Verificar persistencia en guest_consent_record
      const recordInDb = await query<{ count: number }>(
        'SELECT count(*)::int as count FROM guest_consent_record WHERE guest_session_id = $1 AND document_version = $2',
        session.id,
        'v2026.1'
      );
      expect(recordInDb[0].count).toBe(1);

      // checkConsent refleja aceptación
      const verifiedCheck = await guestService.checkConsent({
        sessionToken: session.token,
        requiredVersion: 'v2026.1'
      });
      expect(verifiedCheck.hasConsented).toBe(true);
      expect(verifiedCheck.requiresAcceptance).toBe(false);
    });

    it('Escenario 3: Rechaza si accepted=false y no inserta registro en PostgreSQL', async () => {
      const eventId = randomUUID();
      const organizerId = randomUUID();

      await sql(
        `INSERT INTO event (id, organizer_id, name, status, pin_enabled)
         VALUES ($1, $2, 'Festival Rechazo', 'ACTIVE', false)`,
        eventId,
        organizerId
      );

      const lookupKey = 'lookup_consent_reject_test';
      await sql(
        `INSERT INTO public_access_credential (id, event_id, lookup_key, token_hash, generation, pin_required)
         VALUES ($1, $2, $3, 'hash', 1, false)`,
        randomUUID(),
        eventId,
        lookupKey
      );

      const { session } = await guestService.createGuestSession({ lookupKey });

      await expect(
        guestService.recordConsent({
          sessionToken: session.token,
          documentVersion: 'v2026.1',
          accepted: false
        })
      ).rejects.toMatchObject({ code: 'CONSENT_REJECTED' });

      // Ningún registro insertado
      const records = await query<{ count: number }>(
        'SELECT count(*)::int as count FROM guest_consent_record WHERE guest_session_id = $1',
        session.id
      );
      expect(records[0].count).toBe(0);
    });
  });

  describe('setContributorNickname (EL-TK-077)', () => {
    it('Escenario 1: Persiste apodo sanitizado en PostgreSQL 16 real y audita sin valor en claro', async () => {
      const eventId = randomUUID();
      const organizerId = randomUUID();

      await sql(
        `INSERT INTO event (id, organizer_id, name, status, pin_enabled)
         VALUES ($1, $2, 'Boda Real Nickname', 'ACTIVE', false)`,
        eventId,
        organizerId
      );

      const lookupKey = 'lookup_nickname_persist_test';
      await sql(
        `INSERT INTO public_access_credential (id, event_id, lookup_key, token_hash, generation, pin_required)
         VALUES ($1, $2, $3, 'hash', 1, false)`,
        randomUUID(),
        eventId,
        lookupKey
      );

      const { session } = await guestService.createGuestSession({ lookupKey });

      const result = await guestService.setContributorNickname({
        sessionToken: session.token,
        nickname: '  Invitado VIP   1 \x00 '
      });

      expect(result.contributorNickname).toBe('Invitado VIP 1');

      // Verificar persistencia directa en PostgreSQL
      const dbRow = await query<{ contributor_nickname: string | null }>(
        'SELECT contributor_nickname FROM guest_session WHERE id = $1',
        session.id
      );
      expect(dbRow[0].contributor_nickname).toBe('Invitado VIP 1');

      // Verificar resolución de sesión
      const resolved = await guestService.resolveGuestSession(session.token);
      expect(resolved.contributorNickname).toBe('Invitado VIP 1');

      // Verificar auditoría en base de datos
      const auditInDb = await query<{ details: string }>(
        "SELECT details FROM admin_audit_event WHERE procedure = 'GUEST_NICKNAME_SET' AND target_identifier = $1",
        eventId
      );
      expect(auditInDb.length).toBeGreaterThan(0);
      expect(auditInDb[0].details).not.toContain('Invitado VIP 1');
      expect(auditInDb[0].details).toContain('Contributor nickname set with length 14');
    });

    it('Escenario 2: Rechaza apodo inválido en PostgreSQL sin modificar la base de datos', async () => {
      const eventId = randomUUID();
      const organizerId = randomUUID();

      await sql(
        `INSERT INTO event (id, organizer_id, name, status, pin_enabled)
         VALUES ($1, $2, 'Evento Nickname Invalido', 'ACTIVE', false)`,
        eventId,
        organizerId
      );

      const lookupKey = 'lookup_nickname_invalid_test';
      await sql(
        `INSERT INTO public_access_credential (id, event_id, lookup_key, token_hash, generation, pin_required)
         VALUES ($1, $2, $3, 'hash', 1, false)`,
        randomUUID(),
        eventId,
        lookupKey
      );

      const { session } = await guestService.createGuestSession({ lookupKey });

      await expect(
        guestService.setContributorNickname({
          sessionToken: session.token,
          nickname: '    '
        })
      ).rejects.toMatchObject({ code: 'INVALID_CONTRIBUTOR_NICKNAME' });

      const dbRow = await query<{ contributor_nickname: string | null }>(
        'SELECT contributor_nickname FROM guest_session WHERE id = $1',
        session.id
      );
      expect(dbRow[0].contributor_nickname).toBeNull();
    });
  });
});
