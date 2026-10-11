import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import type { OrganizerActorContext } from '@eventlens/identity';
import {
  EventPublicAccessService,
  EventManagementError,
  type EventAuditSink,
  type EventAuditRecord
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('EventPublicAccessService (Real PostgreSQL Integration Tests — EL-TK-084)', () => {
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
        idempotency_key TEXT UNIQUE,
        idempotency_payload_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE event
        ADD COLUMN IF NOT EXISTS starts_at_local TEXT,
        ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS utc_offset_minutes INTEGER,
        ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS grace_ends_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS purge_started_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
        ADD COLUMN IF NOT EXISTS previous_status TEXT,
        ADD COLUMN IF NOT EXISTS validity_duration_days INTEGER,
        ADD COLUMN IF NOT EXISTS grace_days INTEGER,
        ADD COLUMN IF NOT EXISTS uploads_enabled BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS guest_gallery_enabled BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS moderation_mode TEXT NOT NULL DEFAULT 'AUTO_PUBLISH',
        ADD COLUMN IF NOT EXISTS pin_enabled BOOLEAN NOT NULL DEFAULT false;

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
    await sql('DELETE FROM public_access_credential');
    await sql('DELETE FROM event');
    await sql('DELETE FROM admin_audit_event');
  });

  const ownerActor: OrganizerActorContext = {
    actorType: 'ORGANIZER_HUMAN',
    accountId: randomUUID(),
    email: 'organizer-integ@eventlens.local',
    sessionId: randomUUID(),
    authTime: new Date(),
    credentialRevision: 1n,
    sessionWatermark: 1n,
    recoveryEpoch: 1n
  };

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

  const service = new EventPublicAccessService(txs, auditSink);

  it('EL-TK-084 Escenario 1: Persiste PublicAccessCredential inicial en PostgreSQL con generation=1 y pin_required=false', async () => {
    const eventId = randomUUID();
    await sql(
      `INSERT INTO event (id, organizer_id, name, status, pin_enabled)
       VALUES ($1, $2, $3, 'DRAFT', false)`,
      eventId,
      ownerActor.accountId,
      'Evento Público Sin PIN'
    );

    const result = await service.issueInitialCredential({
      actorContext: ownerActor,
      eventId
    });

    expect(result.outcome).toBe('ISSUED');
    expect(result.credential.generation).toBe(1);
    expect(result.credential.pinRequired).toBe(false);
    expect(result.credential.revokedAt).toBeNull();

    // Comprobar en PostgreSQL 16
    const rows = await query<{
      id: string;
      lookup_key: string;
      token_hash: string;
      generation: number;
      pin_required: boolean;
    }>('SELECT * FROM public_access_credential WHERE event_id = $1', eventId);

    expect(rows).toHaveLength(1);
    expect(rows[0].generation).toBe(1);
    expect(rows[0].pin_required).toBe(false);
    expect(rows[0].lookup_key).toBe(result.credential.lookupKey);
    expect(rows[0].token_hash).toBe(result.credential.tokenHash);

    // Auditoría
    const audits = await query<{ procedure: string; result: string }>(
      'SELECT procedure, result FROM admin_audit_event WHERE target_identifier = $1',
      eventId
    );
    expect(audits).toHaveLength(1);
    expect(audits[0].procedure).toBe('EVENT_PUBLIC_CREDENTIAL_ISSUED');
    expect(audits[0].result).toBe('SUCCESS');
  });

  it('EL-TK-084 Escenario 2: Vincula pin_required=true en PostgreSQL si el evento tiene PIN inicial de EL-TK-027', async () => {
    const eventId = randomUUID();
    await sql(
      `INSERT INTO event (id, organizer_id, name, status, pin_enabled)
       VALUES ($1, $2, $3, 'DRAFT', true)`,
      eventId,
      ownerActor.accountId,
      'Evento Público Protegido con PIN'
    );

    const result = await service.issueInitialCredential({
      actorContext: ownerActor,
      eventId
    });

    expect(result.outcome).toBe('ISSUED');
    expect(result.credential.pinRequired).toBe(true);

    const rows = await query<{ pin_required: boolean }>(
      'SELECT pin_required FROM public_access_credential WHERE event_id = $1',
      eventId
    );
    expect(rows[0].pin_required).toBe(true);
  });

  it('EL-TK-084 Escenario 3: Serializa llamadas concurrentes de emisión bajo FOR UPDATE garantizando credencial única y replay', async () => {
    const eventId = randomUUID();
    await sql(
      `INSERT INTO event (id, organizer_id, name, status, pin_enabled)
       VALUES ($1, $2, $3, 'ACTIVE', false)`,
      eventId,
      ownerActor.accountId,
      'Evento Concurrencia Credencial'
    );

    const [res1, res2] = await Promise.all([
      service.issueInitialCredential({ actorContext: ownerActor, eventId }),
      service.issueInitialCredential({ actorContext: ownerActor, eventId })
    ]);

    const outcomes = [res1.outcome, res2.outcome].sort();
    expect(outcomes).toEqual(['IDEMPOTENT_REPLAY', 'ISSUED']);

    // Exactamente 1 fila creada en la tabla
    const rows = await query<{ count: number }>(
      'SELECT count(*)::int as count FROM public_access_credential WHERE event_id = $1',
      eventId
    );
    expect(rows[0].count).toBe(1);
  });

  it('EL-TK-084: Rechaza emisión en PostgreSQL si el organizador no es propietario (AQR-003)', async () => {
    const eventId = randomUUID();
    await sql(
      `INSERT INTO event (id, organizer_id, name, status)
       VALUES ($1, $2, $3, 'DRAFT')`,
      eventId,
      ownerActor.accountId,
      'Evento Aislamiento SQL'
    );

    const otherOrganizer: OrganizerActorContext = {
      ...ownerActor,
      accountId: randomUUID()
    };

    await expect(
      service.issueInitialCredential({
        actorContext: otherOrganizer,
        eventId
      })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  describe('EL-TK-074: resolvePublicAccess (PostgreSQL 16 Integration)', () => {
    it('Escenario 1: Resuelve enlace vigente de evento ACTIVE concediendo acceso público y capacidades', async () => {
      const eventId = randomUUID();
      await sql(
        `INSERT INTO event (id, organizer_id, name, status, timezone, uploads_enabled, guest_gallery_enabled, pin_enabled)
         VALUES ($1, $2, $3, 'ACTIVE', 'America/Bogota', true, true, false)`,
        eventId,
        ownerActor.accountId,
        'Festival Bogotá 2026'
      );

      // Emitir credencial inicial
      const issued = await service.issueInitialCredential({
        actorContext: ownerActor,
        eventId
      });

      // Resolver credencial como invitado anónimo
      const resolved = await service.resolvePublicAccess({
        lookupKey: issued.credential.lookupKey
      });

      expect(resolved.accessState).toBe('ALLOWED');
      expect(resolved.eventId).toBe(eventId);
      expect(resolved.name).toBe('Festival Bogotá 2026');
      expect(resolved.status).toBe('ACTIVE');
      expect(resolved.timezone).toBe('America/Bogota');
      expect(resolved.pinRequired).toBe(false);
      expect(resolved.generation).toBe(1);
      expect(resolved.capabilities).toEqual({
        canViewLanding: true,
        canUpload: true,
        canViewGallery: true
      });

      // Verificar persistencia de auditoría
      const auditRows = await query<{ procedure: string; target_identifier: string; result: string }>(
        `SELECT procedure, target_identifier, result
         FROM admin_audit_event
         WHERE procedure = 'EVENT_PUBLIC_ACCESS_RESOLVED' AND target_identifier = $1`,
        eventId
      );
      expect(auditRows.length).toBeGreaterThanOrEqual(1);
      expect(auditRows[0].result).toBe('SUCCESS');
    });

    it('Escenario 1 con PIN: Resuelve enlace vigente de evento con PIN requiriendo pinRequired=true', async () => {
      const eventId = randomUUID();
      await sql(
        `INSERT INTO event (id, organizer_id, name, status, timezone, uploads_enabled, guest_gallery_enabled, pin_enabled)
         VALUES ($1, $2, $3, 'ACTIVE', 'America/Bogota', true, false, true)`,
        eventId,
        ownerActor.accountId,
        'Evento Privado con PIN'
      );

      const issued = await service.issueInitialCredential({
        actorContext: ownerActor,
        eventId
      });

      const resolved = await service.resolvePublicAccess({
        lookupKey: issued.credential.lookupKey
      });

      expect(resolved.accessState).toBe('ALLOWED');
      expect(resolved.pinRequired).toBe(true);
      expect(resolved.capabilities.canUpload).toBe(true);
      expect(resolved.capabilities.canViewGallery).toBe(false);
    });

    it('Escenario 2: Rechaza enlace revocado o no existente en PostgreSQL fail-closed', async () => {
      // 1. Inexistente
      await expect(
        service.resolvePublicAccess({ lookupKey: 'non_existent_key_xyz987' })
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL' });

      // 2. Revocado
      const eventId = randomUUID();
      await sql(
        `INSERT INTO event (id, organizer_id, name, status)
         VALUES ($1, $2, $3, 'ACTIVE')`,
        eventId,
        ownerActor.accountId,
        'Evento con Enlace Revocado'
      );

      const issued = await service.issueInitialCredential({
        actorContext: ownerActor,
        eventId
      });

      // Marcar revocado en la base de datos
      await sql(
        'UPDATE public_access_credential SET revoked_at = NOW() WHERE id = $1',
        issued.credential.id
      );

      await expect(
        service.resolvePublicAccess({ lookupKey: issued.credential.lookupKey })
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL' });
    });

    it('Escenario 3: Resuelve evento SUSPENDED y CLOSED aplicando restricciones canónicas de lifecycle', async () => {
      // 1. Evento SUSPENDED
      const suspendedId = randomUUID();
      await sql(
        `INSERT INTO event (id, organizer_id, name, status, uploads_enabled, guest_gallery_enabled)
         VALUES ($1, $2, $3, 'SUSPENDED', true, true)`,
        suspendedId,
        ownerActor.accountId,
        'Evento Suspendido'
      );

      // Insertar credencial activa directamente para el evento suspendido
      const suspendedKey = 'suspended_event_token_key_123';
      await sql(
        `INSERT INTO public_access_credential (id, event_id, lookup_key, token_hash, generation, pin_required)
         VALUES ($1, $2, $3, 'hash', 1, false)`,
        randomUUID(),
        suspendedId,
        suspendedKey
      );

      const resSuspended = await service.resolvePublicAccess({ lookupKey: suspendedKey });
      expect(resSuspended.accessState).toBe('UNAVAILABLE');
      expect(resSuspended.status).toBe('SUSPENDED');
      expect(resSuspended.capabilities.canViewLanding).toBe(false);
      expect(resSuspended.capabilities.canUpload).toBe(false);
      expect(resSuspended.capabilities.canViewGallery).toBe(false);

      // 2. Evento CLOSED
      const closedId = randomUUID();
      await sql(
        `INSERT INTO event (id, organizer_id, name, status, uploads_enabled, guest_gallery_enabled)
         VALUES ($1, $2, $3, 'CLOSED', true, true)`,
        closedId,
        ownerActor.accountId,
        'Evento Cerrado'
      );

      const closedKey = 'closed_event_token_key_456';
      await sql(
        `INSERT INTO public_access_credential (id, event_id, lookup_key, token_hash, generation, pin_required)
         VALUES ($1, $2, $3, 'hash', 1, false)`,
        randomUUID(),
        closedId,
        closedKey
      );

      const resClosed = await service.resolvePublicAccess({ lookupKey: closedKey });
      expect(resClosed.accessState).toBe('RESTRICTED');
      expect(resClosed.status).toBe('CLOSED');
      expect(resClosed.capabilities.canViewLanding).toBe(true);
      expect(resClosed.capabilities.canUpload).toBe(false);
      expect(resClosed.capabilities.canViewGallery).toBe(true);
    });
  });
});
