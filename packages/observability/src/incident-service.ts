import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  AuditActor,
  AuditEventRecord,
  CorrelateEvidenceCommand,
  CreateIncidentCommand,
  IncidentFilter,
  IncidentSeverity,
  IncidentStatus,
  OperationalIncident,
  ResolveIncidentCommand
} from './contracts.js';
import { TelemetrySanitizer } from './telemetry-sanitizer.js';
import { TelemetryService } from './telemetry-service.js';

interface RawIncidentRow {
  id: string;
  title: string;
  severity: string;
  status: string;
  component: string;
  description: string;
  alert_refs: unknown;
  audit_refs: unknown;
  resource_refs: unknown;
  opened_by: string;
  opened_at: Date | string;
  resolved_by: string | null;
  resolved_at: Date | string | null;
  resolution_notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface RawAuditRow {
  id: string;
  occurred_at: Date | string;
  actor_type: string;
  actor_id: string;
  actor_detail: unknown;
  action: string;
  resource_type: string;
  resource_id: string;
  result: string;
  reason: string | null;
  metadata: unknown;
  idempotency_key: string | null;
  created_at: Date | string;
}

export class IncidentService {
  private readonly sanitizer: TelemetrySanitizer;

  constructor(
    private readonly transactions: TransactionRunner,
    private readonly telemetryService?: TelemetryService,
    sanitizer?: TelemetrySanitizer
  ) {
    this.sanitizer = sanitizer ?? new TelemetrySanitizer();
  }

  public async createIncident(cmd: CreateIncidentCommand): Promise<OperationalIncident> {
    this.assertAuthorized(cmd.actor);

    const id = cmd.id ?? randomUUID();
    const now = new Date();

    const sanitizedTitle = this.sanitizer.sanitizeMessage(cmd.title) ?? cmd.title;
    const sanitizedDescription = this.sanitizer.sanitizeMessage(cmd.description) ?? cmd.description;

    const alertRefs = Array.from(new Set(cmd.alertRefs ?? []));
    const auditRefs = Array.from(new Set(cmd.auditRefs ?? []));
    const resourceRefs = Array.from(
      new Set(
        (cmd.resourceRefs ?? []).map((r) => this.sanitizer.sanitizeMessage(r) ?? r)
      )
    );

    const rows = await this.transactions.run(async (tx) => {
      return tx.query<RawIncidentRow>(
        `INSERT INTO operational_incident (
          id, title, severity, status, component, description,
          alert_refs, audit_refs, resource_refs, opened_by, opened_at,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, 'OPEN', $4, $5,
          $6::jsonb, $7::jsonb, $8::jsonb, $9, $10,
          $10, $10
        )
        RETURNING *`,
        id,
        sanitizedTitle,
        cmd.severity,
        cmd.component,
        sanitizedDescription,
        JSON.stringify(alertRefs),
        JSON.stringify(auditRefs),
        JSON.stringify(resourceRefs),
        this.getActorIdentifier(cmd.actor),
        now
      );
    });

    const incident = this.mapIncident(rows[0]);

    if (this.telemetryService) {
      this.telemetryService.emitMetric('incident.opened_count', 'COUNTER', 1, 'count', {
        severity: cmd.severity,
        component: cmd.component
      });
    }

    return incident;
  }

  public async correlateEvidence(cmd: CorrelateEvidenceCommand): Promise<OperationalIncident> {
    this.assertAuthorized(cmd.actor);

    return this.transactions.run(async (tx) => {
      const existing = await this.findRawById(tx, cmd.incidentId);
      if (!existing) {
        throw new Error(`NOT_FOUND: Incident '${cmd.incidentId}' not found`);
      }

      if (existing.status === 'RESOLVED') {
        throw new Error(`INVALID_STATE: Cannot correlate evidence to a resolved incident`);
      }

      const existingAlerts = this.parseJsonArray(existing.alert_refs);
      const existingAudits = this.parseJsonArray(existing.audit_refs);
      const existingResources = this.parseJsonArray(existing.resource_refs);

      const updatedAlerts = Array.from(new Set([...existingAlerts, ...(cmd.alertRefs ?? [])]));
      const updatedAudits = Array.from(new Set([...existingAudits, ...(cmd.auditRefs ?? [])]));
      const sanitizedIncomingResources = (cmd.resourceRefs ?? []).map(
        (r) => this.sanitizer.sanitizeMessage(r) ?? r
      );
      const updatedResources = Array.from(
        new Set([...existingResources, ...sanitizedIncomingResources])
      );

      const rows = await tx.query<RawIncidentRow>(
        `UPDATE operational_incident
         SET alert_refs = $1::jsonb,
             audit_refs = $2::jsonb,
             resource_refs = $3::jsonb,
             updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        JSON.stringify(updatedAlerts),
        JSON.stringify(updatedAudits),
        JSON.stringify(updatedResources),
        cmd.incidentId
      );

      return this.mapIncident(rows[0]);
    });
  }

  public async resolveIncident(cmd: ResolveIncidentCommand): Promise<OperationalIncident> {
    this.assertAuthorized(cmd.actor);

    const sanitizedNotes =
      this.sanitizer.sanitizeMessage(cmd.resolutionNotes) ?? cmd.resolutionNotes;

    const result = await this.transactions.run(async (tx) => {
      const existing = await this.findRawById(tx, cmd.incidentId);
      if (!existing) {
        throw new Error(`NOT_FOUND: Incident '${cmd.incidentId}' not found`);
      }

      if (existing.status === 'RESOLVED') {
        throw new Error(`INVALID_STATE: Incident is already resolved`);
      }

      const rows = await tx.query<RawIncidentRow>(
        `UPDATE operational_incident
         SET status = 'RESOLVED',
             resolved_by = $1,
             resolved_at = NOW(),
             resolution_notes = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        this.getActorIdentifier(cmd.actor),
        sanitizedNotes,
        cmd.incidentId
      );

      return this.mapIncident(rows[0]);
    });

    if (this.telemetryService) {
      this.telemetryService.emitMetric('incident.resolved_count', 'COUNTER', 1, 'count', {
        severity: result.severity,
        component: result.component
      });
    }

    return result;
  }

  public async getIncident(id: string, actor: AuditActor): Promise<OperationalIncident | null> {
    this.assertAuthorized(actor);

    return this.transactions.run(async (tx) => {
      const row = await this.findRawById(tx, id);
      return row ? this.mapIncident(row) : null;
    });
  }

  public async getIncidentWithAuditEvents(
    id: string,
    actor: AuditActor
  ): Promise<{ incident: OperationalIncident; auditEvents: AuditEventRecord[] } | null> {
    this.assertAuthorized(actor);

    return this.transactions.run(async (tx) => {
      const row = await this.findRawById(tx, id);
      if (!row) {
        return null;
      }

      const incident = this.mapIncident(row);
      let auditEvents: AuditEventRecord[] = [];

      if (incident.auditRefs.length > 0) {
        const auditRows = await tx.query<RawAuditRow>(
          `SELECT * FROM audit_event
           WHERE id = ANY($1::uuid[])
           ORDER BY occurred_at ASC`,
          incident.auditRefs
        );

        auditEvents = auditRows.map((r) => ({
          id: r.id,
          occurredAt: new Date(r.occurred_at),
          actorType: r.actor_type as any,
          actorId: r.actor_id,
          actorDetail:
            typeof r.actor_detail === 'object' && r.actor_detail !== null
              ? (r.actor_detail as Record<string, unknown>)
              : null,
          action: r.action,
          resourceType: r.resource_type,
          resourceId: r.resource_id,
          result: r.result as any,
          reason: r.reason ?? null,
          metadata:
            typeof r.metadata === 'object' && r.metadata !== null
              ? (r.metadata as Record<string, unknown>)
              : {},
          idempotencyKey: r.idempotency_key ?? null,
          createdAt: new Date(r.created_at)
        }));
      }

      return { incident, auditEvents };
    });
  }

  public async listIncidents(filter: IncidentFilter, actor: AuditActor): Promise<OperationalIncident[]> {
    this.assertAuthorized(actor);

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filter.status) {
      conditions.push(`status = $${idx++}`);
      values.push(filter.status);
    }

    if (filter.severity) {
      conditions.push(`severity = $${idx++}`);
      values.push(filter.severity);
    }

    if (filter.component) {
      conditions.push(`component = $${idx++}`);
      values.push(filter.component);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    values.push(limit);
    const limitIdx = idx++;
    values.push(offset);
    const offsetIdx = idx++;

    const rows = await this.transactions.run(async (tx) => {
      return tx.query<RawIncidentRow>(
        `SELECT * FROM operational_incident
         ${whereClause}
         ORDER BY opened_at DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        ...values
      );
    });

    return rows.map((r) => this.mapIncident(r));
  }

  private assertAuthorized(actor: AuditActor): void {
    if (actor.type !== 'ADMIN' && actor.type !== 'SYSTEM') {
      throw new Error(`FORBIDDEN: Actor type '${actor.type}' is not authorized to manage operational incidents`);
    }
  }

  private getActorIdentifier(actor: AuditActor): string {
    return actor.type === 'SYSTEM' ? actor.systemId : actor.actorId;
  }

  private async findRawById(tx: SqlTransaction, id: string): Promise<RawIncidentRow | null> {
    const rows = await tx.query<RawIncidentRow>(
      `SELECT * FROM operational_incident WHERE id = $1`,
      id
    );
    return rows[0] ?? null;
  }

  private mapIncident(row: RawIncidentRow): OperationalIncident {
    return {
      id: row.id,
      title: row.title,
      severity: row.severity as IncidentSeverity,
      status: row.status as IncidentStatus,
      component: row.component,
      description: row.description,
      alertRefs: this.parseJsonArray(row.alert_refs),
      auditRefs: this.parseJsonArray(row.audit_refs),
      resourceRefs: this.parseJsonArray(row.resource_refs),
      openedBy: row.opened_by,
      openedAt: new Date(row.opened_at),
      resolvedBy: row.resolved_by ?? undefined,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
      resolutionNotes: row.resolution_notes ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private parseJsonArray(val: unknown): string[] {
    if (Array.isArray(val)) {
      return val as string[];
    }
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }
}
