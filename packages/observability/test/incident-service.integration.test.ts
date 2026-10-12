import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  AuditService,
  IncidentService,
  NeutralTelemetryCollector,
  TelemetryService
} from '../src/index.js';

const databaseUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://eventlens:eventlens-local-only@127.0.0.1:15432/eventlens';

describe('IncidentService (PostgreSQL 16 Integration Tests — EL-TK-173)', () => {
  const client = createPrismaClient(databaseUrl);
  const txs = new PrismaTransactions(client, 10000);

  const testTitleTag = `TEST_INC_${randomUUID().slice(0, 8)}`;
  const adminActor = { type: 'ADMIN' as const, actorId: 'admin-integration' };

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  beforeEach(async () => {
    await sql(`DELETE FROM operational_incident WHERE title LIKE $1`, `%${testTitleTag}%`);
    await sql(`DELETE FROM audit_event WHERE action LIKE $1`, `%${testTitleTag}%`);
  });

  afterEach(async () => {
    await sql(`DELETE FROM operational_incident WHERE title LIKE $1`, `%${testTitleTag}%`);
    await sql(`DELETE FROM audit_event WHERE action LIKE $1`, `%${testTitleTag}%`);
  });

  it('Scenario 1 & 2: creates incident in PostgreSQL, correlates real audit events, and resolves cleanly', async () => {
    const collector = new NeutralTelemetryCollector();
    const telemetry = new TelemetryService(collector);
    const auditService = new AuditService(txs);
    const incidentService = new IncidentService(txs, telemetry);

    // 1. Create a real audit event in PostgreSQL
    const auditRecord = await auditService.registerEvent({
      actor: adminActor,
      action: `admin.config_change_${testTitleTag}`,
      resourceType: 'configuration',
      resourceId: 'cfg-100',
      result: 'SUCCESS',
      metadata: { change: 'pool_size_adjusted' }
    });

    // 2. Open an incident in PostgreSQL
    const incident = await incidentService.createIncident({
      title: `Critical Database Spike [${testTitleTag}] with token=secret123`,
      severity: 'HIGH',
      component: 'DATABASE',
      description: 'Connection pool exhausted on postgresql://admin:secretpass@postgres:5432/eventlens',
      alertRefs: ['infrastructure:database'],
      actor: adminActor
    });

    expect(incident.id).toBeDefined();
    expect(incident.status).toBe('OPEN');
    expect(incident.title).not.toContain('secret123');
    expect(incident.title).toContain('[REDACTED]');
    expect(incident.description).not.toContain('secretpass');
    expect(incident.description).toContain('[REDACTED]');

    // 3. Correlate the audit event to the incident
    const correlated = await incidentService.correlateEvidence({
      incidentId: incident.id,
      auditRefs: [auditRecord.id],
      resourceRefs: ['database:primary'],
      actor: adminActor
    });

    expect(correlated.auditRefs).toContain(auditRecord.id);
    expect(correlated.resourceRefs).toContain('database:primary');

    // 4. Query incident with linked audit events
    const detailed = await incidentService.getIncidentWithAuditEvents(incident.id, adminActor);
    expect(detailed).toBeDefined();
    expect(detailed?.incident.id).toBe(incident.id);
    expect(detailed?.auditEvents.length).toBe(1);
    expect(detailed?.auditEvents[0].id).toBe(auditRecord.id);
    expect(detailed?.auditEvents[0].action).toBe(`admin.config_change_${testTitleTag}`);

    // 5. Resolve the incident in PostgreSQL
    const resolved = await incidentService.resolveIncident({
      incidentId: incident.id,
      resolutionNotes: 'DB pool increased to 50 connections with token=auth_ok',
      actor: adminActor
    });

    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.resolvedBy).toBe('admin-integration');
    expect(resolved.resolvedAt).toBeInstanceOf(Date);
    expect(resolved.resolutionNotes).not.toContain('auth_ok');
    expect(resolved.resolutionNotes).toContain('[REDACTED]');

    // 6. Verify listing with filter
    const listed = await incidentService.listIncidents(
      { status: 'RESOLVED', component: 'DATABASE' },
      adminActor
    );
    expect(listed.some((inc) => inc.id === incident.id)).toBe(true);
  });
});
