import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import type { AdminActorContext } from '@eventlens/identity';
import {
  AdminInterventionOrchestrator,
  type AdminLifecyclePort,
  type AdminAccessPort,
  type AdminSupportAuditSink
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('AdminInterventionOrchestrator (PostgreSQL 16 Integration Tests — EL-TK-151)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  async function querySql<T extends object = Record<string, unknown>>(statement: string, ...args: unknown[]): Promise<T[]> {
    return txs.run((tx) => tx.query<T>(statement, ...args));
  }

  let auditSink: AdminSupportAuditSink;
  let orchestrator: AdminInterventionOrchestrator;
  let adminContext: AdminActorContext;

  beforeAll(async () => {
    await sql(`
      CREATE TABLE IF NOT EXISTS event (
        id UUID PRIMARY KEY,
        organizer_id UUID NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
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
        uploads_enabled BOOLEAN NOT NULL DEFAULT true,
        guest_gallery_enabled BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS guest_session (
        id UUID PRIMARY KEY,
        event_id UUID NOT NULL,
        token TEXT NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  });

  beforeEach(() => {
    // Adaptador de lifecycle conectado a PostgreSQL 16
    const realLifecyclePort: AdminLifecyclePort = {
      async suspendEvent({ eventId, reason }) {
        return txs.run(async (tx) => {
          const rows = await tx.query<{ status: string }>(
            `SELECT status FROM event WHERE id = $1 FOR UPDATE`,
            eventId
          );
          if (!rows.length) throw Error('EVENT_NOT_FOUND');
          const current = rows[0]!.status;
          if (current === 'SUSPENDED') throw Error('EVENT_ALREADY_SUSPENDED');

          await tx.execute(
            `UPDATE event 
             SET status = 'SUSPENDED', previous_status = $1, suspension_reason = $2, suspended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            current,
            reason,
            eventId
          );

          return {
            outcome: 'EXECUTED',
            previousStatus: current,
            newStatus: 'SUSPENDED',
            suspendedAt: new Date().toISOString()
          };
        });
      },

      async reactivateEvent({ eventId }) {
        return txs.run(async (tx) => {
          const rows = await tx.query<{ status: string; previous_status: string | null }>(
            `SELECT status, previous_status FROM event WHERE id = $1 FOR UPDATE`,
            eventId
          );
          if (!rows.length) throw Error('EVENT_NOT_FOUND');
          const current = rows[0]!.status;
          if (current !== 'SUSPENDED') throw Error('EVENT_NOT_SUSPENDED');

          const restored = rows[0]!.previous_status || 'ACTIVE';
          await tx.execute(
            `UPDATE event 
             SET status = $1, previous_status = NULL, suspension_reason = NULL, suspended_at = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            restored,
            eventId
          );

          return {
            outcome: 'EXECUTED',
            previousStatus: current,
            newStatus: restored,
            reactivatedAt: new Date().toISOString()
          };
        });
      },

      async extendEventValidity() {
        return {
          outcome: 'EXECUTED',
          previousStatus: 'ACTIVE',
          newStatus: 'ACTIVE',
          newExpiresAt: new Date(Date.now() + 86400000 * 7).toISOString(),
          extendedAt: new Date().toISOString()
        };
      },

      async closeEvent({ eventId }) {
        return txs.run(async (tx) => {
          await tx.execute(`UPDATE event SET status = 'CLOSED' WHERE id = $1`, eventId);
          return {
            outcome: 'EXECUTED',
            previousStatus: 'ACTIVE',
            newStatus: 'CLOSED',
            closedAt: new Date().toISOString()
          };
        });
      }
    };

    // Adaptador de acceso conectado a PostgreSQL 16
    const realAccessPort: AdminAccessPort = {
      async revokeAllGuestSessions({ eventId }) {
        return txs.run(async (tx) => {
          const count = await tx.execute(
            `UPDATE guest_session SET revoked_at = CURRENT_TIMESTAMP WHERE event_id = $1 AND revoked_at IS NULL`,
            eventId
          );
          return {
            outcome: 'EXECUTED',
            eventId,
            revokedSessionsCount: count,
            revokedAt: new Date().toISOString()
          };
        });
      }
    };

    auditSink = {
      record: vi.fn(async () => {})
    };

    orchestrator = new AdminInterventionOrchestrator(
      realLifecyclePort,
      realAccessPort,
      undefined,
      auditSink
    );

    adminContext = {
      actorType: 'ADMIN_HUMAN',
      principalId: randomUUID(),
      identifier: 'intervention-admin@eventlens.test',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      adminAuthRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };
  });

  it('ejecuta SUSPEND_EVENT en PostgreSQL 16 actualizando la fila del evento y registrando auditoria', async () => {
    const eventId = randomUUID();
    const organizerId = randomUUID();

    await sql(
      `INSERT INTO event (id, organizer_id, name, status) VALUES ($1, $2, 'Boda Real', 'ACTIVE')`,
      eventId,
      organizerId
    );

    const result = await orchestrator.executeIntervention({
      actorContext: adminContext,
      eventId,
      interventionType: 'SUSPEND_EVENT',
      reason: 'Violacion reiterada de condiciones de uso por spam de medios'
    });

    expect(result.outcome).toBe('EXECUTED');
    expect(result.interventionType).toBe('SUSPEND_EVENT');

    // Verificar estado en PostgreSQL
    const rows = await querySql<{ status: string; previous_status: string; suspension_reason: string }>(
      `SELECT status, previous_status, suspension_reason FROM event WHERE id = $1`,
      eventId
    );
    expect(rows[0]?.status).toBe('SUSPENDED');
    expect(rows[0]?.previous_status).toBe('ACTIVE');
    expect(rows[0]?.suspension_reason).toContain('Violacion reiterada');

    // Verificar auditoria
    expect(auditSink.record).toHaveBeenCalledTimes(1);
  });

  it('ejecuta REVOKE_GUEST_ACCESS invalidando de forma masiva sesiones de invitados en PostgreSQL 16', async () => {
    const eventId = randomUUID();
    const s1 = randomUUID();
    const s2 = randomUUID();

    await sql(
      `INSERT INTO guest_session (id, event_id, token) VALUES ($1, $2, 'tok1'), ($3, $2, 'tok2')`,
      s1,
      eventId,
      s2
    );

    const result = await orchestrator.executeIntervention({
      actorContext: adminContext,
      eventId,
      interventionType: 'REVOKE_GUEST_ACCESS',
      reason: 'Filtracion de token de acceso en grupo no autorizado'
    });

    expect(result.outcome).toBe('EXECUTED');
    expect(result.downstreamResult.revokedSessionsCount).toBe(2);

    // Verificar en DB que ambas quedaron revoked
    const check = await querySql<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM guest_session WHERE event_id = $1 AND revoked_at IS NOT NULL`,
      eventId
    );
    expect(check[0]?.count).toBe(2);
  });

  it('no fuerza cambio ni bypass si el dominio rechaza por estado (EVENT_ALREADY_SUSPENDED)', async () => {
    const eventId = randomUUID();
    const organizerId = randomUUID();

    await sql(
      `INSERT INTO event (id, organizer_id, name, status) VALUES ($1, $2, 'Concierto', 'SUSPENDED')`,
      eventId,
      organizerId
    );

    await expect(
      orchestrator.executeIntervention({
        actorContext: adminContext,
        eventId,
        interventionType: 'SUSPEND_EVENT',
        reason: 'Segunda suspension innecesaria'
      })
    ).rejects.toThrow('EVENT_ALREADY_SUSPENDED');
  });
});
