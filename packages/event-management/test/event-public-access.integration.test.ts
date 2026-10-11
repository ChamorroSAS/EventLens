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
        pin_enabled BOOLEAN NOT NULL DEFAULT false,
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
});
