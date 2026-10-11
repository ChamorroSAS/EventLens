import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  EventManagementError,
  type CreateGuestSessionCommand,
  type CreateGuestSessionResult,
  type GuestSessionRecord,
  type EventStatus,
  type EventRecord,
  type EventAuditSink
} from './contracts.js';
import { EventAccessPolicy } from './access-policy.js';

const MAX_FAILED_PIN_ATTEMPTS = 5;
const PIN_LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutos
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const PIN_FORMAT_REGEX = /^\d{6}$/;

interface JoinedCredentialAndEventRow {
  cred_id: string;
  event_id: string;
  lookup_key: string;
  cred_token_hash: string;
  generation: number;
  pin_required: boolean;
  cred_revoked_at: Date | string | null;
  name: string;
  status: string;
  timezone: string;
  pin_enabled: boolean;
  pin_hash: string | null;
  pin_salt: string | null;
  starts_at_local: string | null;
  scheduled_at: Date | string | null;
  expires_at: Date | string | null;
  grace_ends_at: Date | string | null;
  activated_at: Date | string | null;
  closed_at: Date | string | null;
  purge_started_at: Date | string | null;
  suspended_at: Date | string | null;
  suspension_reason: string | null;
  previous_status: string | null;
  validity_duration_days: number | null;
  grace_days: number | null;
  uploads_enabled: boolean;
  guest_gallery_enabled: boolean;
  moderation_mode: string;
  organizer_id: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface PinAttemptRow {
  id: string;
  lookup_key: string;
  attempt_count: number;
  locked_until: Date | string | null;
  last_attempt_at: Date | string;
}

interface GuestSessionRow {
  id: string;
  event_id: string;
  token_hash: string;
  credential_generation: number;
  created_at: Date | string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
  consent_recorded_at: Date | string | null;
  consent_version: string | null;
  contributor_nickname: string | null;
}

function mapRowToGuestSession(row: GuestSessionRow): GuestSessionRecord {
  return {
    id: row.id,
    eventId: row.event_id,
    tokenHash: row.token_hash,
    credentialGeneration: Number(row.credential_generation),
    createdAt: new Date(row.created_at),
    expiresAt: new Date(row.expires_at),
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
    consentRecordedAt: row.consent_recorded_at ? new Date(row.consent_recorded_at) : null,
    consentVersion: row.consent_version,
    contributorNickname: row.contributor_nickname
  };
}

/**
 * Service managing anonymous guest sessions, protected PIN verification, and session lifecycle
 * (EL-TK-075, DEC-004, DEC-013, DEC-083, DEC-084).
 */
export class GuestSessionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly auditSink?: EventAuditSink
  ) {}

  private async recordFailedAttempt(
    lookupKey: string,
    eventId: string,
    now: Date
  ): Promise<{ isLocked: boolean; attemptCount: number }> {
    return this.runner.run(async (tx) => {
      const rows = await tx.query<PinAttemptRow>(
        `SELECT id, lookup_key, attempt_count, locked_until, last_attempt_at
         FROM guest_pin_attempt
         WHERE lookup_key = $1
         FOR UPDATE`,
        lookupKey
      );

      const attempt = rows[0] ?? null;
      const count = (attempt ? Number(attempt.attempt_count) : 0) + 1;
      const isLocked = count >= MAX_FAILED_PIN_ATTEMPTS;
      const lockedUntil = isLocked ? new Date(now.getTime() + PIN_LOCK_DURATION_MS) : null;

      if (attempt) {
        await tx.execute(
          `UPDATE guest_pin_attempt
           SET attempt_count = $2,
               locked_until = $3,
               last_attempt_at = $4
           WHERE id = $1`,
          attempt.id,
          count,
          lockedUntil,
          now
        );
      } else {
        await tx.execute(
          `INSERT INTO guest_pin_attempt (id, lookup_key, attempt_count, locked_until, last_attempt_at)
           VALUES ($1, $2, $3, $4, $5)`,
          randomUUID(),
          lookupKey,
          count,
          lockedUntil,
          now
        );
      }

      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'GUEST_PIN_VALIDATION_FAILED',
        actorId: 'GUEST_ANONYMOUS',
        targetIdentifier: eventId,
        result: 'REJECTED_UNAUTHORIZED',
        details: `Failed PIN attempt (attempt ${count})`,
        timestamp: now
      });

      return { isLocked, attemptCount: count };
    });
  }

  /**
   * Validates optional PIN and establishes an anonymous guest session (EL-TK-075).
   * - Escenario 1: Evento con PIN habilitado -> valida 6 dígitos exactos con scryptSync y timingSafeEqual, emitiendo sesión.
   * - Escenario 2: PIN erróneo -> incrementa contador, aplica rate limit/bloqueo temporal fail-closed persistido.
   * - Escenario 3: Evento sin PIN -> emite sesión inmediatamente si la credencial es válida y el lifecycle lo permite.
   */
  public async createGuestSession(
    command: CreateGuestSessionCommand
  ): Promise<CreateGuestSessionResult> {
    if (!command || typeof command !== 'object') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Create guest session command is required');
    }

    const { lookupKey, pin, now: providedNow } = command;

    if (!lookupKey || typeof lookupKey !== 'string' || lookupKey.trim().length === 0) {
      throw new EventManagementError('INVALID_CREDENTIAL', 'Valid public access lookupKey is required');
    }

    const trimmedKey = lookupKey.trim();
    const now = providedNow ?? new Date();

    // 1. Fetch joined credential and event
    const row = await this.runner.run(async (tx) => {
      const rows = await tx.query<JoinedCredentialAndEventRow>(
        `SELECT
           c.id AS cred_id, c.event_id, c.lookup_key, c.token_hash AS cred_token_hash,
           c.generation, c.pin_required, c.revoked_at AS cred_revoked_at,
           e.id AS event_id, e.name, e.status, e.timezone, e.pin_enabled, e.pin_hash, e.pin_salt,
           e.starts_at_local, e.scheduled_at, e.expires_at, e.grace_ends_at, e.activated_at,
           e.closed_at, e.purge_started_at, e.suspended_at, e.suspension_reason, e.previous_status,
           e.validity_duration_days, e.grace_days, e.uploads_enabled, e.guest_gallery_enabled,
           e.moderation_mode, e.organizer_id, e.created_at, e.updated_at
         FROM public_access_credential c
         JOIN event e ON e.id = c.event_id
         WHERE c.lookup_key = $1
         LIMIT 1`,
        trimmedKey
      );
      return rows[0] ?? null;
    });

    if (!row || row.cred_revoked_at !== null) {
      throw new EventManagementError('INVALID_CREDENTIAL', 'Public access credential is invalid or has been revoked');
    }

    // 2. Lifecycle policy check
    const eventRecord: EventRecord = {
      id: row.event_id,
      organizerId: row.organizer_id,
      name: row.name,
      status: row.status as EventStatus,
      timezone: row.timezone,
      startsAtLocal: row.starts_at_local,
      scheduledAt: row.scheduled_at ? new Date(row.scheduled_at) : null,
      utcOffsetMinutes: null,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      graceEndsAt: row.grace_ends_at ? new Date(row.grace_ends_at) : null,
      activatedAt: row.activated_at ? new Date(row.activated_at) : null,
      closedAt: row.closed_at ? new Date(row.closed_at) : null,
      purgeStartedAt: row.purge_started_at ? new Date(row.purge_started_at) : null,
      suspendedAt: row.suspended_at ? new Date(row.suspended_at) : null,
      suspensionReason: row.suspension_reason,
      previousStatus: row.previous_status as EventStatus | null,
      validityDurationDays: row.validity_duration_days,
      graceDays: row.grace_days,
      uploadsEnabled: Boolean(row.uploads_enabled),
      guestGalleryEnabled: Boolean(row.guest_gallery_enabled),
      moderationMode: row.moderation_mode as any,
      pinEnabled: Boolean(row.pin_enabled),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };

    const accessDecision = EventAccessPolicy.evaluate({
      event: eventRecord,
      action: 'GUEST_VIEW_LANDING',
      actorContext: { actorType: 'GUEST_ANONYMOUS' }
    });

    if (!accessDecision.allowed) {
      throw new EventManagementError('EVENT_NOT_ACCESSIBLE', accessDecision.reason);
    }

    // 3. PIN Verification (if required)
    const requiresPin = Boolean(row.pin_required || row.pin_enabled);

    if (requiresPin) {
      if (!pin || typeof pin !== 'string') {
        throw new EventManagementError('PIN_REQUIRED', 'PIN verification required to access this event');
      }

      const trimmedPin = pin.trim();
      if (!PIN_FORMAT_REGEX.test(trimmedPin)) {
        throw new EventManagementError('INVALID_PIN_FORMAT', 'PIN must be exactly 6 numeric digits');
      }

      // Check current rate limit lock
      const currentAttempt = await this.runner.run(async (tx) => {
        const rows = await tx.query<PinAttemptRow>(
          `SELECT id, lookup_key, attempt_count, locked_until, last_attempt_at
           FROM guest_pin_attempt
           WHERE lookup_key = $1
           LIMIT 1`,
          trimmedKey
        );
        return rows[0] ?? null;
      });

      if (currentAttempt?.locked_until) {
        const lockedUntilDate = new Date(currentAttempt.locked_until);
        if (lockedUntilDate.getTime() > now.getTime()) {
          await this.auditSink?.record({
            id: randomUUID(),
            procedure: 'GUEST_PIN_VALIDATION_FAILED',
            actorId: 'GUEST_ANONYMOUS',
            targetIdentifier: row.event_id,
            result: 'REJECTED_UNAUTHORIZED',
            details: 'Rate limit exceeded: PIN verification temporarily locked',
            timestamp: now
          });
          throw new EventManagementError(
            'RATE_LIMIT_EXCEEDED',
            'Too many failed PIN attempts. Access is temporarily locked. Please wait before trying again.'
          );
        }
      }

      // Verify cryptographic PIN hash
      if (!row.pin_hash || !row.pin_salt) {
        throw new EventManagementError('INVALID_PIN', 'Event PIN is not properly configured');
      }

      const computedHash = scryptSync(trimmedPin, row.pin_salt, 32);
      const storedHash = Buffer.from(row.pin_hash, 'hex');
      const pinMatches =
        computedHash.length === storedHash.length &&
        timingSafeEqual(computedHash, storedHash);

      if (!pinMatches) {
        // Record failed attempt in committed transaction
        const { isLocked } = await this.recordFailedAttempt(trimmedKey, row.event_id, now);
        if (isLocked) {
          throw new EventManagementError(
            'RATE_LIMIT_EXCEEDED',
            'Too many failed PIN attempts. Access is temporarily locked. Please wait before trying again.'
          );
        }
        throw new EventManagementError('INVALID_PIN', 'Invalid event PIN provided');
      }
    }

    // 4. Create and persist guest session (and clear any failed attempts)
    return this.runner.run(async (tx) => {
      if (requiresPin) {
        await tx.execute(`DELETE FROM guest_pin_attempt WHERE lookup_key = $1`, trimmedKey);
      }

      const rawToken = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      const sessionId = randomUUID();
      const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

      await tx.execute(
        `INSERT INTO guest_session (
           id, event_id, token_hash, credential_generation, created_at, expires_at, revoked_at
         ) VALUES ($1, $2, $3, $4, $5, $6, NULL)`,
        sessionId,
        row.event_id,
        tokenHash,
        Number(row.generation),
        now,
        expiresAt
      );

      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'GUEST_SESSION_CREATED',
        actorId: 'GUEST_ANONYMOUS',
        targetIdentifier: row.event_id,
        result: 'SUCCESS',
        details: `Anonymous guest session created for event '${row.event_id}' (generation ${row.generation})`,
        timestamp: now
      });

      return {
        session: {
          id: sessionId,
          eventId: row.event_id,
          token: rawToken,
          credentialGeneration: Number(row.generation),
          createdAt: now,
          expiresAt
        },
        event: {
          id: row.event_id,
          name: row.name,
          status: row.status as EventStatus,
          timezone: row.timezone
        }
      };
    });
  }

  /**
   * Resolves a guest session by its plain bearer token.
   * Validates token hash, non-revocation and non-expiry.
   */
  public async resolveGuestSession(
    token: string,
    now: Date = new Date()
  ): Promise<GuestSessionRecord> {
    if (!token || typeof token !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Guest session token is required');
    }

    const tokenHash = createHash('sha256').update(token.trim()).digest('hex');

    return this.runner.run(async (tx: SqlTransaction) => {
      const rows = await tx.query<GuestSessionRow>(
        `SELECT
           id, event_id, token_hash, credential_generation, created_at, expires_at,
           revoked_at, consent_recorded_at, consent_version, contributor_nickname
         FROM guest_session
         WHERE token_hash = $1
         LIMIT 1`,
        tokenHash
      );

      if (rows.length === 0) {
        throw new EventManagementError('UNAUTHORIZED', 'Guest session not found');
      }

      const row = rows[0];

      if (row.revoked_at !== null) {
        throw new EventManagementError('SESSION_REVOKED', 'Guest session has been revoked');
      }

      const expiresAt = new Date(row.expires_at);
      if (expiresAt.getTime() <= now.getTime()) {
        throw new EventManagementError('SESSION_EXPIRED', 'Guest session has expired');
      }

      return mapRowToGuestSession(row);
    });
  }

  /**
   * Revokes an existing guest session by ID.
   */
  public async revokeGuestSession(sessionId: string): Promise<void> {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Session ID is required');
    }

    await this.runner.run(async (tx: SqlTransaction) => {
      await tx.execute(
        `UPDATE guest_session
         SET revoked_at = NOW()
         WHERE id = $1`,
        sessionId
      );
    });
  }
}
