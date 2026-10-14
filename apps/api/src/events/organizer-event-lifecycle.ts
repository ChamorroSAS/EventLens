import { createHash, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import { AuthenticationError, OrganizerAuthenticationService } from '@eventlens/identity';
import { EventLifecycleService, EventPublicAccessService, EventManagementError, DEFAULT_VALIDITY_DAYS, DEFAULT_GRACE_PERIOD_DAYS, type EventAuditSink } from '@eventlens/event-management';
import { BadRequestException, ForbiddenException, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import type { OrganizerSessionService } from '../identity/organizer-session.service.js';
import { extractOrganizerSessionCookie } from '../identity/organizer-session.service.js';

export interface OrganizerLifecycleSnapshot {
  eventId: string;
  status: string;
  timezone: string;
  startsAtLocal: string | null;
  scheduledAt: string | null;
  expiresAt: string | null;
  graceEndsAt: string | null;
  revision: string;
  validityDurationDays: number;
  graceDays: number;
  capabilities: { canSchedule: boolean; canActivateEarly: boolean };
}

export interface OrganizerLifecycleResult {
  eventId: string;
  outcome: 'SCHEDULED' | 'ACTIVATED' | 'IDEMPOTENT_REPLAY';
}

export interface OrganizerShareAccessResult {
  eventId: string;
  outcome: 'ISSUED' | 'IDEMPOTENT_REPLAY';
}

export interface LifecycleRequest {
  eventId: string;
  cookieHeader?: string;
  originHeader?: string;
  csrfToken?: string;
  idempotencyKey?: string;
  body?: unknown;
}

/** Binds identity, CAS, durable receipts and domain audit to one transaction. */
export class OrganizerEventLifecycleAdapter {
  constructor(private readonly database: TransactionRunner, private readonly sessions: OrganizerSessionService) {}

  private async authenticate(tx: SqlTransaction, request: LifecycleRequest, mutating: boolean) {
    const runner: TransactionRunner = { run: work => work(tx) };
    const sessionToken = extractOrganizerSessionCookie(request.cookieHeader);
    if (!sessionToken) throw new UnauthorizedException();
    try {
      const auth = new OrganizerAuthenticationService(runner, this.sessions.getAuditSink(), this.sessions.getRecoveryAuthority());
      const validated = await auth.validateSession({
        sessionToken,
        csrfToken: mutating ? request.csrfToken : undefined,
        requireCsrf: mutating
      });
      if (validated.actorContext.restrictedContext) throw new ForbiddenException();
      return validated.actorContext;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      if (error instanceof AuthenticationError) {
        if (error.code === 'AUTHORITY_UNAVAILABLE') throw new ServiceUnavailableException();
        if (error.code === 'FORBIDDEN' || error.code === 'CSRF_VALIDATION_FAILED') throw new ForbiddenException();
        throw new UnauthorizedException();
      }
      throw error;
    }
  }

  private audit(tx: SqlTransaction): EventAuditSink {
    return { record: async event => {
      await tx.execute(`INSERT INTO admin_audit_event
        (id, procedure, actor_id, target_identifier, result, details, timestamp)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      event.id, event.procedure, event.actorId, event.targetIdentifier, event.result, event.details ?? null, event.timestamp);
    } };
  }

  async snapshot(request: LifecycleRequest): Promise<OrganizerLifecycleSnapshot> {
    return this.database.run(async tx => {
      const actorContext = await this.authenticate(tx, request, false);
      const rows = await tx.query<{ revision: bigint; organizer_id: string }>(
        'SELECT revision, organizer_id FROM event WHERE id=$1 FOR SHARE', request.eventId);
      if (!rows.length || rows[0].organizer_id !== actorContext.accountId) throw new EventManagementError('EVENT_NOT_FOUND', 'Event not found');
      const snapshot = await new EventLifecycleService({ run: work => work(tx) }).getLifecycleSnapshot({ eventId: request.eventId, actorContext });
      return {
        eventId: snapshot.eventId, status: snapshot.status, timezone: snapshot.timezone,
        startsAtLocal: snapshot.startsAtLocal ?? null,
        scheduledAt: snapshot.scheduledAt?.toISOString() ?? null,
        expiresAt: snapshot.expiresAt?.toISOString() ?? null,
        graceEndsAt: snapshot.graceEndsAt?.toISOString() ?? null,
        revision: String(rows[0].revision),
        validityDurationDays: snapshot.validityDurationDays ?? DEFAULT_VALIDITY_DAYS,
        graceDays: snapshot.graceDays ?? DEFAULT_GRACE_PERIOD_DAYS,
        capabilities: {
          canSchedule: snapshot.capabilities.canSchedule,
          canActivateEarly: snapshot.capabilities.canActivateEarly && !!snapshot.expiresAt && snapshot.expiresAt.getTime() > Date.now()
        }
      };
    });
  }

  async command(action: 'schedule' | 'activate', request: LifecycleRequest): Promise<OrganizerLifecycleResult> {
    this.sessions.assertTrustedOrigin(request.originHeader);
    const key = request.idempotencyKey?.trim();
    if (!key || !/^[A-Za-z0-9_-]{1,128}$/.test(key)) throw new BadRequestException('Valid Idempotency-Key header required');
    if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) throw new BadRequestException('Request body must be an object');
    const body = request.body as Record<string, unknown>;
    if (Object.keys(body).some(k => k !== 'expectedRevision') || typeof body.expectedRevision !== 'string' || !/^[1-9]\d*$/.test(body.expectedRevision)) throw new BadRequestException('Request body must contain only a positive expectedRevision string');
    const expectedRevision = body.expectedRevision;
    return this.database.run(async tx => {
      const actorContext = await this.authenticate(tx, request, true);
      // Serialize key reuse across events as well as operations before checking receipts.
      // PostgreSQL lock functions return void; cast for Prisma's raw-query decoder.
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text AS locked', `${actorContext.accountId}:ORGANIZER_LIFECYCLE:${key}`);
      const rows = await tx.query<{ organizer_id: string; revision: bigint; expires_at: Date | null }>(
        'SELECT organizer_id, revision, expires_at FROM event WHERE id=$1 FOR UPDATE', request.eventId);
      if (!rows.length || rows[0].organizer_id !== actorContext.accountId) throw new EventManagementError('EVENT_NOT_FOUND', 'Event not found');
      const fingerprint = createHash('sha256').update(JSON.stringify({ eventId: request.eventId, action, expectedRevision })).digest('hex');
      const receipts = await tx.query<{ fingerprint: string }>(
        "SELECT fingerprint FROM event_command_receipt WHERE actor_id=$1 AND operation='ORGANIZER_LIFECYCLE' AND idempotency_key=$2 FOR UPDATE", actorContext.accountId, key);
      if (receipts.length) {
        if (receipts[0].fingerprint !== fingerprint) throw new EventManagementError('IDEMPOTENCY_CONFLICT', 'Idempotency key already used');
        await this.audit(tx).record({ id: randomUUID(), procedure: action === 'schedule' ? 'EVENT_SCHEDULED' : 'EVENT_ACTIVATED', actorId: actorContext.accountId, targetIdentifier: request.eventId, result: 'IDEMPOTENT_REPLAY', timestamp: new Date() });
        return { eventId: request.eventId, outcome: 'IDEMPOTENT_REPLAY' };
      }
      if (String(rows[0].revision) !== expectedRevision) throw new EventManagementError('CONCURRENCY_CONFLICT', 'Event revision changed');
      if (action === 'activate' && (!rows[0].expires_at || new Date(rows[0].expires_at).getTime() <= Date.now())) throw new EventManagementError('INVALID_STATE', 'Event validity expired');
      const service = new EventLifecycleService({ run: work => work(tx) }, this.audit(tx));
      const result = action === 'schedule'
        ? await service.scheduleDraft({ actorContext, eventId: request.eventId })
        : await service.activateEvent({ actorContext, eventId: request.eventId, trigger: 'MANUAL_EARLY' });
      const revision = await tx.query<{ revision: bigint }>('SELECT revision FROM event WHERE id=$1', request.eventId);
      await tx.execute(`INSERT INTO event_command_receipt
        (operation_id,event_id,actor_id,operation,idempotency_key,fingerprint,payload_hash,applied_revision,outcome,created_at)
        VALUES ($1,$2,$3,'ORGANIZER_LIFECYCLE',$4,$5,$5,$6,$7,$8)`,
      randomUUID(), request.eventId, actorContext.accountId, key, fingerprint, revision[0].revision, result.outcome, new Date());
      return { eventId: request.eventId, outcome: result.outcome };
    });
  }

  async shareSnapshot(request: LifecycleRequest, baseUrl: string) {
    return this.database.run(async tx => {
      const actorContext = await this.authenticate(tx, request, false);
      return new EventPublicAccessService({ run: work => work(tx) }).getShareAccessSnapshot({ eventId: request.eventId, actorContext, baseUrl });
    });
  }

  async prepareShare(request: LifecycleRequest): Promise<OrganizerShareAccessResult> {
    this.sessions.assertTrustedOrigin(request.originHeader);
    const key = request.idempotencyKey?.trim();
    if (!key || !/^[A-Za-z0-9_-]{1,128}$/.test(key)) throw new BadRequestException('Valid Idempotency-Key header required');
    if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) throw new BadRequestException('Request body must be an object');
    const body = request.body as Record<string, unknown>;
    if (Object.keys(body).some(k => k !== 'expectedRevision') || typeof body.expectedRevision !== 'string' || !/^[1-9]\d*$/.test(body.expectedRevision)) throw new BadRequestException('Request body must contain only a positive expectedRevision string');
    const expectedRevision = body.expectedRevision;
    return this.database.run(async tx => {
      const actorContext = await this.authenticate(tx, request, true);
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text AS locked', `${actorContext.accountId}:INITIAL_SHARE_ACCESS:${key}`);
      const rows = await tx.query<{ organizer_id: string; status: string; revision: bigint; expires_at: Date | null }>(
        'SELECT organizer_id, status, revision, expires_at FROM event WHERE id=$1 FOR UPDATE', request.eventId);
      if (!rows.length || rows[0].organizer_id !== actorContext.accountId) throw new EventManagementError('EVENT_NOT_FOUND', 'Event not found');
      const fingerprint = createHash('sha256').update(JSON.stringify({ eventId: request.eventId, action: 'INITIAL_SHARE_ACCESS', expectedRevision })).digest('hex');
      const receipts = await tx.query<{ fingerprint: string }>(
        "SELECT fingerprint FROM event_command_receipt WHERE actor_id=$1 AND operation='INITIAL_SHARE_ACCESS' AND idempotency_key=$2 FOR UPDATE", actorContext.accountId, key);
      if (receipts.length) {
        if (receipts[0].fingerprint !== fingerprint) throw new EventManagementError('IDEMPOTENCY_CONFLICT', 'Idempotency key already used');
        await this.audit(tx).record({ id: randomUUID(), procedure: 'EVENT_PUBLIC_CREDENTIAL_ISSUED', actorId: actorContext.accountId, targetIdentifier: request.eventId, result: 'IDEMPOTENT_REPLAY', timestamp: new Date() });
        return { eventId: request.eventId, outcome: 'IDEMPOTENT_REPLAY' };
      }
      if (String(rows[0].revision) !== expectedRevision) throw new EventManagementError('CONCURRENCY_CONFLICT', 'Event revision changed');
      if (!['SCHEDULED', 'ACTIVE'].includes(rows[0].status) || !rows[0].expires_at || new Date(rows[0].expires_at).getTime() <= Date.now()) throw new EventManagementError('INVALID_STATE', 'Event must be scheduled or active and valid');
      const result = await new EventPublicAccessService({ run: work => work(tx) }, this.audit(tx)).issueInitialCredential({ actorContext, eventId: request.eventId });
      await tx.execute(`INSERT INTO event_command_receipt
        (operation_id,event_id,actor_id,operation,idempotency_key,fingerprint,payload_hash,applied_revision,outcome,created_at)
        VALUES ($1,$2,$3,'INITIAL_SHARE_ACCESS',$4,$5,$5,$6,$7,$8)`,
      randomUUID(), request.eventId, actorContext.accountId, key, fingerprint, rows[0].revision, result.outcome, new Date());
      return { eventId: request.eventId, outcome: result.outcome };
    });
  }
}
