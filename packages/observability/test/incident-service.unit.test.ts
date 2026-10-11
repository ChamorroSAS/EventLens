import { describe, expect, it } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  IncidentService,
  NeutralTelemetryCollector,
  TelemetryService
} from '../src/index.js';

function createMockIncidentDb() {
  const store = new Map<string, any>();
  const auditStore = new Map<string, any>();

  const runner: TransactionRunner = {
    async run<T>(fn: (tx: SqlTransaction) => Promise<T>): Promise<T> {
      const tx: SqlTransaction = {
        async execute(): Promise<number> {
          return 0;
        },
        async query<R = unknown>(sql: string, ...params: unknown[]): Promise<R[]> {
          if (sql.includes('INSERT INTO operational_incident')) {
            const [
              id,
              title,
              severity,
              component,
              description,
              alert_refs,
              audit_refs,
              resource_refs,
              opened_by,
              opened_at
            ] = params;
            const record = {
              id,
              title,
              severity,
              status: 'OPEN',
              component,
              description,
              alert_refs,
              audit_refs,
              resource_refs,
              opened_by,
              opened_at,
              resolved_by: null,
              resolved_at: null,
              resolution_notes: null,
              created_at: opened_at,
              updated_at: opened_at
            };
            store.set(id as string, record);
            return [record] as R[];
          }

          if (sql.includes('SELECT * FROM operational_incident WHERE id = $1')) {
            const id = params[0] as string;
            const found = store.get(id);
            return (found ? [found] : []) as R[];
          }

          if (sql.includes('UPDATE operational_incident') && sql.includes('SET alert_refs')) {
            const [alert_refs, audit_refs, resource_refs, id] = params;
            const existing = store.get(id as string);
            if (existing) {
              existing.alert_refs = alert_refs;
              existing.audit_refs = audit_refs;
              existing.resource_refs = resource_refs;
              existing.updated_at = new Date();
              return [existing] as R[];
            }
            return [] as R[];
          }

          if (sql.includes('UPDATE operational_incident') && sql.includes("SET status = 'RESOLVED'")) {
            const [resolved_by, resolution_notes, id] = params;
            const existing = store.get(id as string);
            if (existing) {
              existing.status = 'RESOLVED';
              existing.resolved_by = resolved_by;
              existing.resolved_at = new Date();
              existing.resolution_notes = resolution_notes;
              existing.updated_at = new Date();
              return [existing] as R[];
            }
            return [] as R[];
          }

          if (sql.includes('SELECT * FROM audit_event')) {
            const ids = params[0] as string[];
            const found = ids.map((id) => auditStore.get(id)).filter(Boolean);
            return found as R[];
          }

          if (sql.includes('SELECT * FROM operational_incident')) {
            return Array.from(store.values()) as R[];
          }

          return [] as R[];
        }
      };
      return fn(tx);
    }
  };

  return { runner, store, auditStore };
}

describe('IncidentService (Unit Tests — EL-TK-173)', () => {
  it('Scenario 1: creates an incident with sanitized alerts, resources, and emits metrics', async () => {
    const db = createMockIncidentDb();
    const collector = new NeutralTelemetryCollector();
    const telemetry = new TelemetryService(collector);
    const service = new IncidentService(db.runner, telemetry);

    const adminActor = { type: 'ADMIN' as const, actorId: 'admin-1' };

    const incident = await service.createIncident({
      title: 'Database connection drop with secret_token=abc12345',
      severity: 'CRITICAL',
      component: 'DATABASE',
      description: 'DB pool exhausted for postgresql://app:supersecret@db/eventlens',
      alertRefs: ['infrastructure:database', 'infrastructure:database'], // duplicates
      auditRefs: ['audit-1'],
      resourceRefs: ['s3://media/avatars/secret_avatar.jpg', 'event:evt-100'],
      actor: adminActor
    });

    expect(incident.id).toBeDefined();
    expect(incident.status).toBe('OPEN');
    expect(incident.title).not.toContain('abc12345');
    expect(incident.title).toContain('[REDACTED]');
    expect(incident.description).not.toContain('supersecret');
    expect(incident.description).toContain('[REDACTED]');
    expect(incident.alertRefs).toEqual(['infrastructure:database']); // deduplicated
    expect(incident.resourceRefs[0]).toContain('[REDACTED_KEY]'); // sanitized storage key

    // Metric check
    const metrics = collector.getMetrics({ name: 'incident.opened_count' });
    expect(metrics.length).toBe(1);
    expect(metrics[0].value).toBe(1);
  });

  it('Scenario 2: correlates new evidence and queries incident with linked AuditEvents', async () => {
    const db = createMockIncidentDb();
    const service = new IncidentService(db.runner);

    const adminActor = { type: 'ADMIN' as const, actorId: 'admin-1' };

    // Seed mock audit event in DB
    db.auditStore.set('audit-100', {
      id: 'audit-100',
      occurred_at: new Date('2026-10-11T12:00:00Z'),
      actor_type: 'ADMIN',
      actor_id: 'admin-1',
      action: 'event.delete',
      resource_type: 'event',
      resource_id: 'evt-999',
      result: 'SUCCESS',
      metadata: {},
      created_at: new Date('2026-10-11T12:00:00Z')
    });

    const incident = await service.createIncident({
      title: 'Unauthorized event mutation detected',
      severity: 'HIGH',
      component: 'API',
      description: 'Investigating bulk deletion',
      actor: adminActor
    });

    // Correlate new evidence
    const updated = await service.correlateEvidence({
      incidentId: incident.id,
      auditRefs: ['audit-100'],
      alertRefs: ['alert-api-rate-limit'],
      resourceRefs: ['event:evt-999'],
      actor: adminActor
    });

    expect(updated.auditRefs).toEqual(['audit-100']);
    expect(updated.alertRefs).toEqual(['alert-api-rate-limit']);

    // Query with linked AuditEvents
    const result = await service.getIncidentWithAuditEvents(incident.id, adminActor);
    expect(result).toBeDefined();
    expect(result?.incident.id).toBe(incident.id);
    expect(result?.auditEvents.length).toBe(1);
    expect(result?.auditEvents[0].id).toBe('audit-100');
    expect(result?.auditEvents[0].action).toBe('event.delete');
  });

  it('Scenario 3: resolves incident with sanitized notes and prevents subsequent mutation', async () => {
    const db = createMockIncidentDb();
    const collector = new NeutralTelemetryCollector();
    const telemetry = new TelemetryService(collector);
    const service = new IncidentService(db.runner, telemetry);

    const adminActor = { type: 'ADMIN' as const, actorId: 'admin-99' };

    const incident = await service.createIncident({
      title: 'Transcoder worker crash',
      severity: 'MEDIUM',
      component: 'WORKERS',
      description: 'Process memory exceeded',
      actor: adminActor
    });

    // Resolve incident
    const resolved = await service.resolveIncident({
      incidentId: incident.id,
      resolutionNotes: 'Worker pool restarted with increased memory limits token=tokenxyz',
      actor: adminActor
    });

    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.resolvedBy).toBe('admin-99');
    expect(resolved.resolvedAt).toBeDefined();
    expect(resolved.resolutionNotes).not.toContain('tokenxyz');
    expect(resolved.resolutionNotes).toContain('[REDACTED]');

    // Metric check
    const metrics = collector.getMetrics({ name: 'incident.resolved_count' });
    expect(metrics.length).toBe(1);

    // Prevent re-resolving
    await expect(
      service.resolveIncident({
        incidentId: incident.id,
        resolutionNotes: 'Trying to resolve again',
        actor: adminActor
      })
    ).rejects.toThrow(/INVALID_STATE/);

    // Prevent correlating evidence to resolved incident
    await expect(
      service.correlateEvidence({
        incidentId: incident.id,
        alertRefs: ['alert-late'],
        actor: adminActor
      })
    ).rejects.toThrow(/INVALID_STATE/);
  });

  it('enforces authorization guards against unauthorized actors', async () => {
    const db = createMockIncidentDb();
    const service = new IncidentService(db.runner);

    const guestActor = { type: 'GUEST' as const, actorId: 'guest-1' };
    const organizerActor = { type: 'ORGANIZER' as const, actorId: 'org-1' };

    await expect(
      service.createIncident({
        title: 'Security incident',
        severity: 'HIGH',
        component: 'API',
        description: 'Breach attempt',
        actor: guestActor as any
      })
    ).rejects.toThrow(/FORBIDDEN/);

    await expect(
      service.getIncident('inc-123', organizerActor as any)
    ).rejects.toThrow(/FORBIDDEN/);
  });
});
