import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  ApplyPlanOverrideCommand,
  AssignPlanCommand,
  CapacityAuditRecord,
  CapacityError,
  EffectiveLimits,
  PlanAssignmentRecord,
  PlanOverrideRecord,
  PlanRecord,
  RemovePlanOverrideCommand,
  ResolveEffectiveLimitsCommand
} from './contracts.js';

export const DEFAULT_PLAN_CODE = 'BETA_DEFAULT';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface RawPlanRow {
  id: string;
  code: string;
  name: string;
  storage_bytes: string | bigint;
  max_files: number;
  max_photo_bytes: string | bigint;
  max_video_bytes: string | bigint;
  max_video_duration_seconds: number;
  retention_days: number;
  created_at: Date;
}

interface RawAssignmentRow {
  id: string;
  event_id: string;
  plan_id: string;
  status: string;
  assigned_at: Date;
  created_at: Date;
  updated_at: Date;
}

interface RawOverrideRow {
  id: string;
  event_id: string;
  storage_bytes: string | bigint | null;
  max_files: number | null;
  retention_days: number | null;
  reason: string;
  authorized_by: string;
  status: string;
  created_at: Date;
  removed_at: Date | null;
  updated_at: Date;
}

export class CapacityPlanService {
  constructor(private readonly transactions: TransactionRunner) {
    if (!transactions) {
      throw new CapacityError('INVALID_ARGUMENT', 'TransactionRunner is required');
    }
  }

  /**
   * Assigns a plan to an event (defaults to BETA_DEFAULT)
   */
  async assignPlan(command: AssignPlanCommand): Promise<PlanAssignmentRecord> {
    if (!command.eventId || typeof command.eventId !== 'string') {
      throw new CapacityError('INVALID_ARGUMENT', 'Valid eventId is required');
    }

    const planCode = command.planCode || DEFAULT_PLAN_CODE;

    return this.transactions.run(async (tx) => {
      // Find the plan
      const plan = await this.findPlanByCode(tx, planCode);
      if (!plan) {
        throw new CapacityError('PLAN_NOT_FOUND', `Plan with code '${planCode}' not found`);
      }

      // Check existing assignment
      const existing = await tx.query<RawAssignmentRow>(
        `SELECT id, event_id, plan_id, status, assigned_at, created_at, updated_at
         FROM plan_assignment
         WHERE event_id = $1
         FOR UPDATE`,
        command.eventId
      );

      const now = new Date();

      if (existing.length > 0) {
        const row = existing[0];
        // If already assigned to this plan, return existing
        if (row.plan_id === plan.id && row.status === 'ACTIVE') {
          return {
            id: row.id,
            eventId: row.event_id,
            planId: row.plan_id,
            status: row.status as 'ACTIVE' | 'INACTIVE',
            assignedAt: new Date(row.assigned_at),
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at)
          };
        }

        // Update assignment
        await tx.execute(
          `UPDATE plan_assignment
           SET plan_id = $1, status = 'ACTIVE', assigned_at = $2, updated_at = $2
           WHERE id = $3`,
          plan.id,
          now,
          row.id
        );

        await this.emitAudit(tx, {
          id: randomUUID(),
          procedure: 'PLAN_ASSIGNED',
          actorId: command.actorContext ? (command.actorContext as any).principalId || (command.actorContext as any).accountId || 'SYSTEM' : 'SYSTEM',
          eventId: command.eventId,
          details: `Plan reassigned to ${plan.code}`,
          timestamp: now
        });

        return {
          id: row.id,
          eventId: command.eventId,
          planId: plan.id,
          status: 'ACTIVE',
          assignedAt: now,
          createdAt: new Date(row.created_at),
          updatedAt: now
        };
      }

      // New assignment
      const assignmentId = randomUUID();
      await tx.execute(
        `INSERT INTO plan_assignment (id, event_id, plan_id, status, assigned_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'ACTIVE', $4, $4, $4)`,
        assignmentId,
        command.eventId,
        plan.id,
        now
      );

      await this.emitAudit(tx, {
        id: randomUUID(),
        procedure: 'PLAN_ASSIGNED',
        actorId: command.actorContext ? (command.actorContext as any).principalId || (command.actorContext as any).accountId || 'SYSTEM' : 'SYSTEM',
        eventId: command.eventId,
        details: `Plan assigned to ${plan.code}`,
        timestamp: now
      });

      return {
        id: assignmentId,
        eventId: command.eventId,
        planId: plan.id,
        status: 'ACTIVE',
        assignedAt: now,
        createdAt: now,
        updatedAt: now
      };
    });
  }

  /**
   * Resolves effective limits combining base plan and active override (EL-TK-134)
   */
  async resolveEffectiveLimits(command: ResolveEffectiveLimitsCommand): Promise<EffectiveLimits> {
    if (!command.eventId || typeof command.eventId !== 'string') {
      throw new CapacityError('INVALID_ARGUMENT', 'Valid eventId is required');
    }

    return this.transactions.run(async (tx) => this.resolveEffectiveLimitsWithTx(tx, command));
  }

  public async resolveEffectiveLimitsWithTx(
    tx: SqlTransaction,
    command: ResolveEffectiveLimitsCommand
  ): Promise<EffectiveLimits> {
    // 1. Get plan assignment (auto-assign default if missing)
    let assignmentRows = await tx.query<RawAssignmentRow>(
      `SELECT id, event_id, plan_id, status, assigned_at, created_at, updated_at
       FROM plan_assignment
       WHERE event_id = $1`,
      command.eventId
    );

    let planId: string;
    if (assignmentRows.length === 0) {
      const defaultPlan = await this.findPlanByCode(tx, DEFAULT_PLAN_CODE);
      if (!defaultPlan) {
        throw new CapacityError('PLAN_NOT_FOUND', `Default plan '${DEFAULT_PLAN_CODE}' not found`);
      }
      const now = new Date();
      const assignmentId = randomUUID();
      await tx.execute(
        `INSERT INTO plan_assignment (id, event_id, plan_id, status, assigned_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'ACTIVE', $4, $4, $4)
         ON CONFLICT (event_id) DO NOTHING`,
        assignmentId,
        command.eventId,
        defaultPlan.id,
        now
      );
      planId = defaultPlan.id;
    } else {
      planId = assignmentRows[0].plan_id;
    }

    // 2. Fetch base plan
    const plan = await this.findPlanById(tx, planId);
    if (!plan) {
      throw new CapacityError('PLAN_NOT_FOUND', `Plan with id '${planId}' not found`);
    }

    // 3. Query active override for this event
    const overrideRows = await tx.query<RawOverrideRow>(
      `SELECT id, event_id, storage_bytes, max_files, retention_days, reason, authorized_by, status, created_at, removed_at, updated_at
       FROM plan_override
       WHERE event_id = $1 AND status = 'ACTIVE'
       ORDER BY created_at DESC
       LIMIT 1`,
      command.eventId
    );

    const activeOverride = overrideRows.length > 0 ? overrideRows[0] : null;

    // 4. Resolve effective values
    const effectiveStorageBytes =
      activeOverride && activeOverride.storage_bytes !== null
        ? BigInt(activeOverride.storage_bytes)
        : plan.storageBytes;

    const effectiveMaxFiles =
      activeOverride && activeOverride.max_files !== null
        ? activeOverride.max_files
        : plan.maxFiles;

    const effectiveRetentionDays =
      activeOverride && activeOverride.retention_days !== null
        ? activeOverride.retention_days
        : plan.retentionDays;

    return {
      eventId: command.eventId,
      planCode: plan.code,
      planName: plan.name,
      storageBytes: effectiveStorageBytes,
      maxFiles: effectiveMaxFiles,
      maxPhotoBytes: plan.maxPhotoBytes,
      maxVideoBytes: plan.maxVideoBytes,
      maxVideoDurationSeconds: plan.maxVideoDurationSeconds,
      retentionDays: effectiveRetentionDays,
      isOverrideActive: Boolean(activeOverride),
      activeOverrideId: activeOverride ? activeOverride.id : null,
      resolvedAt: new Date()
    };
  }

  /**
   * Applies an authorized administrative plan override (DEC-020, DEC-027, DEC-095)
   */
  async applyOverride(
    command: ApplyPlanOverrideCommand
  ): Promise<{ override: PlanOverrideRecord; effectiveLimits: EffectiveLimits }> {
    // 1. Authorization check
    if (!command.actorContext || command.actorContext.actorType !== 'ADMIN_HUMAN' || !command.actorContext.principalId) {
      throw new CapacityError('UNAUTHORIZED', 'Only authorized administrators may apply plan overrides');
    }

    if (!command.eventId || typeof command.eventId !== 'string') {
      throw new CapacityError('INVALID_ARGUMENT', 'Valid eventId is required');
    }

    const trimmedReason = (command.reason || '').trim();
    if (!trimmedReason) {
      throw new CapacityError('INVALID_ARGUMENT', 'Mandatory reason is required for administrative override');
    }

    if (
      command.storageBytes === undefined &&
      command.maxFiles === undefined &&
      command.retentionDays === undefined
    ) {
      throw new CapacityError('INVALID_ARGUMENT', 'At least one limit must be specified for override');
    }

    if (command.storageBytes !== undefined && command.storageBytes <= 0n) {
      throw new CapacityError('INVALID_ARGUMENT', 'storageBytes must be positive');
    }

    if (command.maxFiles !== undefined && command.maxFiles <= 0) {
      throw new CapacityError('INVALID_ARGUMENT', 'maxFiles must be positive');
    }

    if (command.retentionDays !== undefined && command.retentionDays <= 0) {
      throw new CapacityError('INVALID_ARGUMENT', 'retentionDays must be positive');
    }

    return this.transactions.run(async (tx) => {
      const now = command.now || new Date();

      // DEC-102: Después de ACTIVE se bloquean reducciones de vigencia que dejen el vencimiento en el pasado
      if (
        command.retentionDays !== undefined &&
        command.eventStatus === 'ACTIVE' &&
        command.eventAnchorDate instanceof Date &&
        !isNaN(command.eventAnchorDate.getTime())
      ) {
        const resultingExpiration = new Date(
          command.eventAnchorDate.getTime() + command.retentionDays * ONE_DAY_MS
        );
        if (resultingExpiration.getTime() < now.getTime()) {
          throw new CapacityError(
            'CANNOT_REDUCE_BELOW_PAST_EXPIRATION',
            `Cannot apply retention override: resulting expiration (${resultingExpiration.toISOString()}) would be in the past (now: ${now.toISOString()})`
          );
        }
      }

      // Ensure base plan assignment exists
      let assignmentRows = await tx.query<RawAssignmentRow>(
        `SELECT id FROM plan_assignment WHERE event_id = $1`,
        command.eventId
      );

      if (assignmentRows.length === 0) {
        const defaultPlan = await this.findPlanByCode(tx, DEFAULT_PLAN_CODE);
        if (!defaultPlan) {
          throw new CapacityError('PLAN_NOT_FOUND', `Default plan '${DEFAULT_PLAN_CODE}' not found`);
        }
        await tx.execute(
          `INSERT INTO plan_assignment (id, event_id, plan_id, status, assigned_at, created_at, updated_at)
           VALUES ($1, $2, $3, 'ACTIVE', $4, $4, $4)`,
          randomUUID(),
          command.eventId,
          defaultPlan.id,
          now
        );
      }

      // Retire previous active overrides for this event
      await tx.execute(
        `UPDATE plan_override
         SET status = 'REMOVED', removed_at = $1, updated_at = $1
         WHERE event_id = $2 AND status = 'ACTIVE'`,
        now,
        command.eventId
      );

      // Insert new override
      const overrideId = randomUUID();
      await tx.execute(
        `INSERT INTO plan_override (id, event_id, storage_bytes, max_files, retention_days, reason, authorized_by, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, $8)`,
        overrideId,
        command.eventId,
        command.storageBytes !== undefined ? command.storageBytes.toString() : null,
        command.maxFiles !== undefined ? command.maxFiles : null,
        command.retentionDays !== undefined ? command.retentionDays : null,
        trimmedReason,
        command.actorContext.principalId,
        now
      );

      // Audit
      await this.emitAudit(tx, {
        id: randomUUID(),
        procedure: 'PLAN_OVERRIDE_APPLIED',
        actorId: command.actorContext.principalId,
        eventId: command.eventId,
        details: `Override applied: storage=${command.storageBytes?.toString() ?? 'base'}, files=${command.maxFiles ?? 'base'}, days=${command.retentionDays ?? 'base'}. Reason: ${trimmedReason}`,
        timestamp: now
      });

      const overrideRecord: PlanOverrideRecord = {
        id: overrideId,
        eventId: command.eventId,
        storageBytes: command.storageBytes ?? null,
        maxFiles: command.maxFiles ?? null,
        retentionDays: command.retentionDays ?? null,
        reason: trimmedReason,
        authorizedBy: command.actorContext.principalId,
        status: 'ACTIVE',
        createdAt: now,
        removedAt: null,
        updatedAt: now
      };

      // Resolve new effective limits
      const effectiveLimits = await this.resolveEffectiveLimitsWithTx(tx, {
        eventId: command.eventId,
        actorContext: command.actorContext
      });

      return {
        override: overrideRecord,
        effectiveLimits
      };
    });
  }

  /**
   * Removes an active override returning the event to the base plan (DEC-095, DEC-102)
   */
  async removeOverride(
    command: RemovePlanOverrideCommand
  ): Promise<{ effectiveLimits: EffectiveLimits }> {
    // 1. Authorization check
    if (!command.actorContext || command.actorContext.actorType !== 'ADMIN_HUMAN' || !command.actorContext.principalId) {
      throw new CapacityError('UNAUTHORIZED', 'Only authorized administrators may remove plan overrides');
    }

    if (!command.eventId || typeof command.eventId !== 'string') {
      throw new CapacityError('INVALID_ARGUMENT', 'Valid eventId is required');
    }

    const trimmedReason = (command.reason || '').trim();
    if (!trimmedReason) {
      throw new CapacityError('INVALID_ARGUMENT', 'Mandatory reason is required for removing override');
    }

    return this.transactions.run(async (tx) => {
      const now = command.now || new Date();

      // Check active override
      const activeOverrides = await tx.query<RawOverrideRow>(
        `SELECT id, storage_bytes, max_files, retention_days, status
         FROM plan_override
         WHERE event_id = $1 AND status = 'ACTIVE'
         FOR UPDATE`,
        command.eventId
      );

      if (activeOverrides.length === 0) {
        throw new CapacityError('OVERRIDE_NOT_FOUND', 'No active override found for this event');
      }

      // Check base plan
      const assignment = await tx.query<RawAssignmentRow>(
        `SELECT plan_id FROM plan_assignment WHERE event_id = $1`,
        command.eventId
      );
      const plan = assignment.length > 0
        ? await this.findPlanById(tx, assignment[0].plan_id)
        : await this.findPlanByCode(tx, DEFAULT_PLAN_CODE);

      if (!plan) {
        throw new CapacityError('PLAN_NOT_FOUND', 'Base plan not found');
      }

      // DEC-102: Después de ACTIVE se bloquean reducciones de vigencia o retornos al plan base que dejen el vencimiento en el pasado
      if (
        command.eventStatus === 'ACTIVE' &&
        command.eventAnchorDate instanceof Date &&
        !isNaN(command.eventAnchorDate.getTime())
      ) {
        const baseExpiration = new Date(
          command.eventAnchorDate.getTime() + plan.retentionDays * ONE_DAY_MS
        );
        if (baseExpiration.getTime() < now.getTime()) {
          throw new CapacityError(
            'CANNOT_REDUCE_BELOW_PAST_EXPIRATION',
            `Cannot return to base plan: resulting expiration (${baseExpiration.toISOString()}) would be in the past (now: ${now.toISOString()})`
          );
        }
      }

      // Mark override as REMOVED
      await tx.execute(
        `UPDATE plan_override
         SET status = 'REMOVED', removed_at = $1, updated_at = $1
         WHERE event_id = $2 AND status = 'ACTIVE'`,
        now,
        command.eventId
      );

      // Audit
      await this.emitAudit(tx, {
        id: randomUUID(),
        procedure: 'PLAN_OVERRIDE_REMOVED',
        actorId: command.actorContext.principalId,
        eventId: command.eventId,
        details: `Override removed. Reverted to base plan ${plan.code}. Reason: ${trimmedReason}`,
        timestamp: now
      });

      const effectiveLimits = await this.resolveEffectiveLimitsWithTx(tx, {
        eventId: command.eventId,
        actorContext: command.actorContext
      });

      return { effectiveLimits };
    });
  }

  private async findPlanByCode(tx: SqlTransaction, code: string): Promise<PlanRecord | null> {
    const rows = await tx.query<RawPlanRow>(
      `SELECT id, code, name, storage_bytes, max_files, max_photo_bytes, max_video_bytes, max_video_duration_seconds, retention_days, created_at
       FROM plan
       WHERE code = $1`,
      code
    );
    if (rows.length === 0) return null;
    return this.mapPlan(rows[0]);
  }

  private async findPlanById(tx: SqlTransaction, id: string): Promise<PlanRecord | null> {
    const rows = await tx.query<RawPlanRow>(
      `SELECT id, code, name, storage_bytes, max_files, max_photo_bytes, max_video_bytes, max_video_duration_seconds, retention_days, created_at
       FROM plan
       WHERE id = $1`,
      id
    );
    if (rows.length === 0) return null;
    return this.mapPlan(rows[0]);
  }

  private mapPlan(row: RawPlanRow): PlanRecord {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      storageBytes: BigInt(row.storage_bytes),
      maxFiles: row.max_files,
      maxPhotoBytes: BigInt(row.max_photo_bytes),
      maxVideoBytes: BigInt(row.max_video_bytes),
      maxVideoDurationSeconds: row.max_video_duration_seconds,
      retentionDays: row.retention_days,
      createdAt: new Date(row.created_at)
    };
  }

  private async emitAudit(tx: SqlTransaction, record: CapacityAuditRecord): Promise<void> {
    await tx.execute(
      `INSERT INTO admin_audit_event (id, procedure, actor_id, target_identifier, result, details, timestamp)
       VALUES ($1, $2, $3, $4, 'SUCCESS', $5, $6)`,
      record.id,
      record.procedure,
      record.actorId,
      record.eventId,
      record.details ?? null,
      record.timestamp
    );
  }
}
