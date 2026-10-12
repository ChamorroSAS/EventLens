import { createHash, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import type { OrganizerActorContext } from '@eventlens/identity';
import {
  EventManagementError,
  type IssueInitialPublicCredentialCommand,
  type IssueInitialPublicCredentialResult,
  type ResolvePublicAccessCommand,
  type ResolvePublicAccessResult,
  type UpdateEventPinCommand,
  type UpdateEventPinResult,
  type RegeneratePublicCredentialCommand,
  type RegeneratePublicCredentialResult,
  type GetShareAccessSnapshotCommand,
  type ShareAccessSnapshotResult,
  type GetRemovalIntakeRouteCommand,
  type RemovalIntakeRouteResult,
  type PublicAccessCapabilities,
  type PublicAccessState,
  type PublicAccessCredentialRecord,
  type EventRecord,
  type EventStatus,
  type GuestActorContext,
  type EventAuditSink
} from './contracts.js';
import { EventAccessPolicy } from './access-policy.js';
import { generateQrSvg } from './qr-generator.js';

interface CredentialRow {
  id: string;
  event_id: string;
  lookup_key: string;
  token_hash: string;
  generation: number;
  pin_required: boolean;
  created_at: Date | string;
  revoked_at: Date | string | null;
  idempotency_key?: string | null;
  idempotency_payload_hash?: string | null;
}

interface EventCheckRow {
  id: string;
  organizer_id: string;
  status: string;
  pin_enabled: boolean;
}

function mapRowToCredential(row: CredentialRow): PublicAccessCredentialRecord {
  return {
    id: row.id,
    eventId: row.event_id,
    lookupKey: row.lookup_key,
    tokenHash: row.token_hash,
    generation: Number(row.generation),
    pinRequired: Boolean(row.pin_required),
    createdAt: new Date(row.created_at),
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null
  };
}

/**
 * Service managing public access credentials for guest entry (MOD-003, EL-TK-084, EL-EP-004).
 * Issues unguessable public access credentials, links PIN requirements from EL-TK-027,
 * guarantees single-winner concurrency under row-level lock, and provides idempotent replay.
 */
export class EventPublicAccessService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly auditSink?: EventAuditSink
  ) {}

  /**
   * Issues the initial PublicAccessCredential for an event (EL-TK-084).
   * - Only authenticated creating organizer can issue the initial credential.
   * - Generates a high-entropy, unguessable lookupKey without internal IDs or PII.
   * - Generation is set to 1.
   * - Automatically links pinRequired based on event.pin_enabled (EL-TK-027, Escenario 2).
   * - Idempotent: if an active credential already exists, returns it without overwriting (Escenario 3).
   */
  public async issueInitialCredential(
    command: IssueInitialPublicCredentialCommand
  ): Promise<IssueInitialPublicCredentialResult> {
    if (!command || typeof command !== 'object') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Issue credential command is required');
    }

    const { actorContext, eventId, idempotencyKey, now: providedNow } = command;

    // 1. Validate authenticated organizer
    if (
      !actorContext ||
      actorContext.actorType !== 'ORGANIZER_HUMAN' ||
      !actorContext.accountId ||
      typeof actorContext.accountId !== 'string'
    ) {
      throw new EventManagementError('UNAUTHORIZED', 'Authenticated organizer context is required');
    }

    if (!eventId || typeof eventId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Event ID is required');
    }

    const payloadHash = idempotencyKey
      ? createHash('sha256')
          .update(JSON.stringify({ eventId, organizerId: actorContext.accountId, action: 'ISSUE_INITIAL_CREDENTIAL' }))
          .digest('hex')
      : null;

    return this.runner.run(async (tx: SqlTransaction) => {
      const now = providedNow ?? new Date();

      // 2. Pessimistic lock on event to serialize concurrent issuance
      const eventRows = await tx.query<EventCheckRow>(
        `SELECT id, organizer_id, status, pin_enabled
         FROM event
         WHERE id = $1
         FOR UPDATE`,
        eventId
      );

      if (eventRows.length === 0) {
        throw new EventManagementError('EVENT_NOT_FOUND', `Event '${eventId}' not found`);
      }

      const event = eventRows[0];

      // 3. Owner isolation
      if (event.organizer_id !== actorContext.accountId) {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_PUBLIC_CREDENTIAL_ISSUED',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'REJECTED_UNAUTHORIZED',
          details: 'Actor is not the owner of this event',
          timestamp: now
        });
        throw new EventManagementError('UNAUTHORIZED', 'Actor is not the owner of this event');
      }

      // 4. State restriction: terminal events cannot issue credentials
      if (event.status === 'PENDING_DELETION' || event.status === 'ARCHIVED') {
        throw new EventManagementError('EVENT_TERMINAL', `Cannot issue credential for event in terminal state '${event.status}'`);
      }

      // 5. Check if an active credential already exists (Escenario 3: Idempotencia)
      const existingRows = await tx.query<CredentialRow>(
        `SELECT id, event_id, lookup_key, token_hash, generation, pin_required, created_at, revoked_at, idempotency_key, idempotency_payload_hash
         FROM public_access_credential
         WHERE event_id = $1 AND revoked_at IS NULL
         ORDER BY generation DESC
         LIMIT 1
         FOR UPDATE`,
        eventId
      );

      if (existingRows.length > 0) {
        const existing = existingRows[0];

        // Idempotent replay: return existing active credential without recreating or overwriting
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_PUBLIC_CREDENTIAL_ISSUED',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'IDEMPOTENT_REPLAY',
          details: `Active public access credential already exists for event '${eventId}' (generation: ${existing.generation})`,
          timestamp: now
        });

        return {
          credential: mapRowToCredential(existing),
          outcome: 'IDEMPOTENT_REPLAY'
        };
      }

      // 6. Generate unguessable, high-entropy lookup key without PII (DEC-004, DEC-013)
      // 18 random bytes -> 24 characters base64url (e.g. "aB3_9xK1L0mZ4qP8rT2vW5yX")
      const lookupKey = randomBytes(18).toString('base64url');
      const tokenHash = createHash('sha256').update(lookupKey).digest('hex');
      const pinRequired = Boolean(event.pin_enabled);
      const credentialId = randomUUID();

      // 7. Persist PublicAccessCredential with generation = 1
      const insertedRows = await tx.query<CredentialRow>(
        `INSERT INTO public_access_credential (
           id, event_id, lookup_key, token_hash, generation, pin_required, created_at, revoked_at, idempotency_key, idempotency_payload_hash
         ) VALUES ($1, $2, $3, $4, 1, $5, $6, NULL, $7, $8)
         RETURNING id, event_id, lookup_key, token_hash, generation, pin_required, created_at, revoked_at`,
        credentialId,
        eventId,
        lookupKey,
        tokenHash,
        pinRequired,
        now,
        idempotencyKey ?? null,
        payloadHash ?? null
      );

      const credential = mapRowToCredential(insertedRows[0]);

      // 8. Audit issuance without exposing the full secret lookupKey in log details (DEC-004)
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_PUBLIC_CREDENTIAL_ISSUED',
        actorId: actorContext.accountId,
        targetIdentifier: eventId,
        result: 'SUCCESS',
        details: `Initial public access credential issued with generation 1 (pinRequired: ${pinRequired})`,
        timestamp: now
      });

      return {
        credential,
        outcome: 'ISSUED'
      };
    });
  }

  /**
   * Resolves a public access credential and determines authorized guest capabilities
   * according to canonical lifecycle policy (EL-TK-074, DEC-004, DEC-013, DEC-083, DEC-084).
   * - Validates unguessable lookupKey without internal IDs or PII.
   * - Rejects invalid, nonexistent or revoked credentials fail-closed without leaking event info (Escenario 2).
   * - Respects lifecycle policy for guest entry (Escenario 1 & 3):
   *     - DRAFT / SUSPENDED / TERMINAL: accessState 'UNAVAILABLE'
   *     - SCHEDULED / CLOSED / GRACE_PERIOD: accessState 'RESTRICTED'
   *     - ACTIVE: accessState 'ALLOWED'
   * - Audits access safely without logging complete unguessable secrets in plain text.
   */
  public async resolvePublicAccess(
    command: ResolvePublicAccessCommand
  ): Promise<ResolvePublicAccessResult> {
    if (!command || typeof command !== 'object') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Resolve public access command is required');
    }

    const { lookupKey, now: providedNow } = command;

    if (!lookupKey || typeof lookupKey !== 'string' || lookupKey.trim().length === 0) {
      throw new EventManagementError('INVALID_CREDENTIAL', 'Valid public access lookupKey is required');
    }

    const trimmedKey = lookupKey.trim();
    const now = providedNow ?? new Date();

    return this.runner.run(async (tx: SqlTransaction) => {
      // 1. Query active credential joined with event details
      const rows = await tx.query<ResolvedCredentialRow>(
        `SELECT
           c.id, c.event_id, c.lookup_key, c.token_hash, c.generation, c.pin_required, c.revoked_at,
           e.name AS event_name, e.status AS event_status, e.timezone AS event_timezone,
           e.starts_at_local, e.scheduled_at, e.expires_at, e.grace_ends_at, e.activated_at,
           e.closed_at, e.purge_started_at, e.suspended_at, e.suspension_reason, e.previous_status,
           e.validity_duration_days, e.grace_days, e.uploads_enabled, e.guest_gallery_enabled,
           e.moderation_mode, e.pin_enabled, e.organizer_id, e.created_at, e.updated_at
         FROM public_access_credential c
         JOIN event e ON e.id = c.event_id
         WHERE c.lookup_key = $1
         LIMIT 1`,
        trimmedKey
      );

      // 2. Reject nonexistent or revoked credential fail-closed (Escenario 2)
      if (rows.length === 0 || rows[0].revoked_at !== null) {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_PUBLIC_ACCESS_RESOLVED',
          actorId: 'GUEST_ANONYMOUS',
          targetIdentifier: 'UNKNOWN',
          result: 'REJECTED_UNAUTHORIZED',
          details: 'Public access resolution rejected for invalid or revoked credential',
          timestamp: now
        });
        throw new EventManagementError('INVALID_CREDENTIAL', 'Public access credential is invalid or has been revoked');
      }

      const row = rows[0];

      // 3. Construct EventRecord for lifecycle policy evaluation
      const eventRecord: EventRecord = {
        id: row.event_id,
        organizerId: row.organizer_id,
        name: row.event_name,
        status: row.event_status as EventStatus,
        timezone: row.event_timezone,
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

      // 4. Evaluate access policy for anonymous guest (DEC-083, DEC-084)
      const guestContext: GuestActorContext = { actorType: 'GUEST_ANONYMOUS' };
      const landingDecision = EventAccessPolicy.evaluate({
        event: eventRecord,
        action: 'GUEST_VIEW_LANDING',
        actorContext: guestContext
      });
      const uploadDecision = EventAccessPolicy.evaluate({
        event: eventRecord,
        action: 'GUEST_UPLOAD',
        actorContext: guestContext
      });
      const galleryDecision = EventAccessPolicy.evaluate({
        event: eventRecord,
        action: 'GUEST_VIEW_GALLERY',
        actorContext: guestContext
      });

      const capabilities: PublicAccessCapabilities = {
        canViewLanding: landingDecision.allowed,
        canUpload: uploadDecision.allowed,
        canViewGallery: galleryDecision.allowed
      };

      // 5. Determine public access state
      let accessState: PublicAccessState;
      let restrictionReason: string | undefined;

      if (!landingDecision.allowed) {
        // DRAFT, SUSPENDED, TERMINAL (Escenario 3)
        accessState = 'UNAVAILABLE';
        restrictionReason = landingDecision.reason;
      } else if (eventRecord.status === 'ACTIVE') {
        // ACTIVE (Escenario 1)
        accessState = 'ALLOWED';
      } else {
        // SCHEDULED, CLOSED, GRACE_PERIOD (Escenario 3)
        accessState = 'RESTRICTED';
        restrictionReason = !uploadDecision.allowed ? uploadDecision.reason : undefined;
      }

      // 6. Audit resolution securely without logging full credential
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_PUBLIC_ACCESS_RESOLVED',
        actorId: 'GUEST_ANONYMOUS',
        targetIdentifier: row.event_id,
        result: accessState === 'ALLOWED' ? 'SUCCESS' : 'NO_OP',
        details: `Public access resolved for event '${row.event_id}' with state '${accessState}' (pinRequired: ${row.pin_required})`,
        timestamp: now
      });

      return {
        accessState,
        eventId: row.event_id,
        name: row.event_name,
        status: eventRecord.status,
        timezone: eventRecord.timezone,
        generation: Number(row.generation),
        pinRequired: Boolean(row.pin_required),
        capabilities,
        ...(restrictionReason ? { restrictionReason } : {})
      };
    });
  }

  /**
   * Updates or disables the protected entry PIN for an event and revokes all active guest sessions (EL-TK-079, DEC-072, DEC-083).
   * - Only authenticated owner organizer can change or disable PIN.
   * - Changing PIN validates 6 digits, computes scrypt hash, sets pin_enabled = true.
   * - Disabling PIN clears pin_hash and pin_salt, sets pin_enabled = false.
   * - Invariant (DEC-083): All active guest sessions are revoked immediately so they cannot obtain new authorizations.
   */
  public async updateEventPin(
    command: UpdateEventPinCommand
  ): Promise<UpdateEventPinResult> {
    if (!command || typeof command !== 'object') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Update event PIN command is required');
    }

    const { actorContext, eventId, action, newPin, now: providedNow } = command;

    if (
      !actorContext ||
      actorContext.actorType !== 'ORGANIZER_HUMAN' ||
      !actorContext.accountId
    ) {
      throw new EventManagementError('UNAUTHORIZED', 'Authenticated organizer context is required');
    }

    if (!eventId || typeof eventId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Event ID is required');
    }

    const now = providedNow ?? new Date();

    return this.runner.run(async (tx: SqlTransaction) => {
      // 1. Lock event row
      const eventRows = await tx.query<EventCheckRow>(
        `SELECT id, organizer_id, status, pin_enabled
         FROM event
         WHERE id = $1
         FOR UPDATE`,
        eventId
      );

      if (eventRows.length === 0) {
        throw new EventManagementError('EVENT_NOT_FOUND', `Event '${eventId}' not found`);
      }

      const event = eventRows[0];

      // 2. Owner isolation
      if (event.organizer_id !== actorContext.accountId) {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_PIN_UPDATED',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'REJECTED_UNAUTHORIZED',
          details: 'Actor is not the owner of this event',
          timestamp: now
        });
        throw new EventManagementError('UNAUTHORIZED', 'Actor is not the owner of this event');
      }

      // 3. State restriction
      if (event.status === 'PENDING_DELETION' || event.status === 'ARCHIVED') {
        throw new EventManagementError('EVENT_TERMINAL', `Cannot update PIN for event in terminal state '${event.status}'`);
      }

      let pinEnabled = false;

      if (action === 'CHANGE_PIN') {
        if (!newPin || typeof newPin !== 'string') {
          throw new EventManagementError('INVALID_PIN_FORMAT', 'PIN is required to enable PIN protection');
        }
        const trimmedPin = newPin.trim();
        if (!/^\d{6}$/.test(trimmedPin)) {
          throw new EventManagementError('INVALID_PIN_FORMAT', 'PIN must be exactly 6 numeric digits');
        }

        const salt = randomBytes(16).toString('hex');
        const hash = scryptSync(trimmedPin, salt, 32).toString('hex');

        await tx.execute(
          `UPDATE event
           SET pin_enabled = true, pin_hash = $2, pin_salt = $3, updated_at = $4
           WHERE id = $1`,
          eventId,
          hash,
          salt,
          now
        );

        await tx.execute(
          `UPDATE public_access_credential
           SET pin_required = true
           WHERE event_id = $1 AND revoked_at IS NULL`,
          eventId
        );

        pinEnabled = true;
      } else if (action === 'DISABLE_PIN') {
        await tx.execute(
          `UPDATE event
           SET pin_enabled = false, pin_hash = NULL, pin_salt = NULL, updated_at = $2
           WHERE id = $1`,
          eventId,
          now
        );

        await tx.execute(
          `UPDATE public_access_credential
           SET pin_required = false
           WHERE event_id = $1 AND revoked_at IS NULL`,
          eventId
        );

        pinEnabled = false;
      } else {
        throw new EventManagementError('INVALID_ARGUMENT', `Unsupported PIN action '${action}'`);
      }

      // 4. Invariant DEC-083: Revoke all active guest sessions
      const revokedRows = await tx.query<{ id: string }>(
        `UPDATE guest_session
         SET revoked_at = $2
         WHERE event_id = $1 AND revoked_at IS NULL
         RETURNING id`,
        eventId,
        now
      );

      // 5. Clear failed pin attempts
      await tx.execute(
        `DELETE FROM guest_pin_attempt
         WHERE lookup_key IN (SELECT lookup_key FROM public_access_credential WHERE event_id = $1)`,
        eventId
      );

      // 6. Audit without logging raw PIN or hash
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_PIN_UPDATED',
        actorId: actorContext.accountId,
        targetIdentifier: eventId,
        result: action === 'CHANGE_PIN' ? 'PIN_UPDATED' : 'PIN_DISABLED',
        details: `PIN action '${action}' applied; revoked ${revokedRows.length} active guest sessions`,
        timestamp: now
      });

      return {
        eventId,
        pinEnabled,
        revokedSessionsCount: revokedRows.length,
        updatedAt: now
      };
    });
  }

  /**
   * Regenerates the public access credential and invalidates previous link/sessions (EL-TK-080, DEC-004, DEC-013, DEC-083).
   * - Only authenticated owner organizer can regenerate credential.
   * - Issues new unguessable PublicAccessCredential with incremented generation.
   * - Immediately revokes prior active credentials.
   * - Invariant (DEC-083): All active guest sessions created under previous credential are fully revoked.
   */
  public async regeneratePublicCredential(
    command: RegeneratePublicCredentialCommand
  ): Promise<RegeneratePublicCredentialResult> {
    if (!command || typeof command !== 'object') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Regenerate public credential command is required');
    }

    const { actorContext, eventId, now: providedNow } = command;

    if (
      !actorContext ||
      actorContext.actorType !== 'ORGANIZER_HUMAN' ||
      !actorContext.accountId
    ) {
      throw new EventManagementError('UNAUTHORIZED', 'Authenticated organizer context is required');
    }

    if (!eventId || typeof eventId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Event ID is required');
    }

    const now = providedNow ?? new Date();

    return this.runner.run(async (tx: SqlTransaction) => {
      // 1. Lock event row
      const eventRows = await tx.query<EventCheckRow>(
        `SELECT id, organizer_id, status, pin_enabled
         FROM event
         WHERE id = $1
         FOR UPDATE`,
        eventId
      );

      if (eventRows.length === 0) {
        throw new EventManagementError('EVENT_NOT_FOUND', `Event '${eventId}' not found`);
      }

      const event = eventRows[0];

      // 2. Owner check
      if (event.organizer_id !== actorContext.accountId) {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_PUBLIC_CREDENTIAL_REGENERATED',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'REJECTED_UNAUTHORIZED',
          details: 'Actor is not the owner of this event',
          timestamp: now
        });
        throw new EventManagementError('UNAUTHORIZED', 'Actor is not the owner of this event');
      }

      // 3. State restriction
      if (event.status === 'PENDING_DELETION' || event.status === 'ARCHIVED') {
        throw new EventManagementError('EVENT_TERMINAL', `Cannot regenerate credential for event in terminal state '${event.status}'`);
      }

      // 4. Find current generation
      const activeRows = await tx.query<CredentialRow>(
        `SELECT id, lookup_key, generation
         FROM public_access_credential
         WHERE event_id = $1 AND revoked_at IS NULL
         ORDER BY generation DESC
         LIMIT 1
         FOR UPDATE`,
        eventId
      );

      const previousGeneration = activeRows.length > 0 ? Number(activeRows[0].generation) : 0;
      const nextGeneration = previousGeneration + 1;

      // 5. Revoke previous credentials
      await tx.execute(
        `UPDATE public_access_credential
         SET revoked_at = $2
         WHERE event_id = $1 AND revoked_at IS NULL`,
        eventId,
        now
      );

      // 6. Generate new high-entropy unguessable credential without PII (DEC-004)
      const lookupKey = randomBytes(18).toString('base64url');
      const tokenHash = createHash('sha256').update(lookupKey).digest('hex');
      const pinRequired = Boolean(event.pin_enabled);
      const credentialId = randomUUID();

      const insertedRows = await tx.query<CredentialRow>(
        `INSERT INTO public_access_credential (
           id, event_id, lookup_key, token_hash, generation, pin_required, created_at, revoked_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
         RETURNING id, event_id, lookup_key, token_hash, generation, pin_required, created_at, revoked_at`,
        credentialId,
        eventId,
        lookupKey,
        tokenHash,
        nextGeneration,
        pinRequired,
        now
      );

      // 7. Invariant DEC-083: Revoke all existing guest sessions
      const revokedSessionRows = await tx.query<{ id: string }>(
        `UPDATE guest_session
         SET revoked_at = $2
         WHERE event_id = $1 AND revoked_at IS NULL
         RETURNING id`,
        eventId,
        now
      );

      // 8. Clear previous pin attempts for old lookup keys
      if (activeRows.length > 0) {
        await tx.execute(
          `DELETE FROM guest_pin_attempt WHERE lookup_key = $1`,
          activeRows[0].lookup_key
        );
      }

      // 9. Audit without leaking complete secret lookup key in plain text
      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_PUBLIC_CREDENTIAL_REGENERATED',
        actorId: actorContext.accountId,
        targetIdentifier: eventId,
        result: 'REGENERATED',
        details: `Regenerated to generation ${nextGeneration}; revoked ${revokedSessionRows.length} guest sessions`,
        timestamp: now
      });

      return {
        credential: mapRowToCredential(insertedRows[0]),
        previousGeneration,
        revokedSessionsCount: revokedSessionRows.length,
        outcome: 'REGENERATED'
      };
    });
  }

  /**
   * Queries share payload and generates offline QR SVG for the active public access credential (EL-TK-081, DEC-004, DEC-013).
   * - Only authenticated owner organizer can query share data.
   * - Strictly returns the active credential, never a revoked one (Escenario 2).
   * - Generates clean, accessible QR SVG representation without external network dependencies.
   */
  public async getShareAccessSnapshot(
    command: GetShareAccessSnapshotCommand
  ): Promise<ShareAccessSnapshotResult> {
    if (!command || typeof command !== 'object') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Get share access snapshot command is required');
    }

    const { actorContext, eventId, baseUrl, now: providedNow } = command;

    if (
      !actorContext ||
      actorContext.actorType !== 'ORGANIZER_HUMAN' ||
      !actorContext.accountId
    ) {
      throw new EventManagementError('UNAUTHORIZED', 'Authenticated organizer context is required');
    }

    if (!eventId || typeof eventId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Event ID is required');
    }

    const now = providedNow ?? new Date();

    return this.runner.run(async (tx: SqlTransaction) => {
      // 1. Verify owner
      const eventRows = await tx.query<{ id: string; organizer_id: string }>(
        `SELECT id, organizer_id FROM event WHERE id = $1`,
        eventId
      );

      if (eventRows.length === 0) {
        throw new EventManagementError('EVENT_NOT_FOUND', `Event '${eventId}' not found`);
      }

      if (eventRows[0].organizer_id !== actorContext.accountId) {
        throw new EventManagementError('UNAUTHORIZED', 'Actor is not the owner of this event');
      }

      // 2. Fetch active credential
      const credRows = await tx.query<CredentialRow>(
        `SELECT id, event_id, lookup_key, token_hash, generation, pin_required, created_at, revoked_at
         FROM public_access_credential
         WHERE event_id = $1 AND revoked_at IS NULL
         ORDER BY generation DESC
         LIMIT 1`,
        eventId
      );

      if (credRows.length === 0) {
        throw new EventManagementError('CREDENTIAL_NOT_FOUND', `No active public access credential found for event '${eventId}'`);
      }

      const cred = credRows[0];
      const cleanBase = baseUrl ? baseUrl.replace(/\/+$/, '') : '';
      const sharePath = `/g/${cred.lookup_key}`;
      const shareUrl = cleanBase ? `${cleanBase}${sharePath}` : sharePath;
      const qrPayload = shareUrl;
      const qrSvg = generateQrSvg(qrPayload);

      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_SHARE_ACCESS_QUERIED',
        actorId: actorContext.accountId,
        targetIdentifier: eventId,
        result: 'SUCCESS',
        details: `Share access queried for generation ${cred.generation}`,
        timestamp: now
      });

      return {
        eventId,
        lookupKey: cred.lookup_key,
        sharePath,
        shareUrl,
        generation: Number(cred.generation),
        pinRequired: Boolean(cred.pin_required),
        qrPayload,
        qrSvg
      };
    });
  }

  /**
   * Routes an anonymous person without session to the removal intake flow (EL-TK-082, DEC-084, DEC-103..105).
   * - Accessible with lookupKey without requiring or assuming a guest session.
   * - Rejects invalid or revoked credentials fail-closed without leaking event info.
   * - Returns intake route and contractual disclaimer: reception != execution.
   */
  public async getRemovalIntakeRoute(
    command: GetRemovalIntakeRouteCommand
  ): Promise<RemovalIntakeRouteResult> {
    if (!command || typeof command !== 'object' || !command.lookupKey) {
      throw new EventManagementError('INVALID_ARGUMENT', 'Public lookupKey is required');
    }

    const trimmedKey = command.lookupKey.trim();
    const now = command.now ?? new Date();

    return this.runner.run(async (tx: SqlTransaction) => {
      const rows = await tx.query<{
        event_id: string;
        revoked_at: Date | string | null;
        event_name: string;
        event_status: string;
      }>(
        `SELECT c.event_id, c.revoked_at, e.name AS event_name, e.status AS event_status
         FROM public_access_credential c
         JOIN event e ON e.id = c.event_id
         WHERE c.lookup_key = $1
         LIMIT 1`,
        trimmedKey
      );

      if (rows.length === 0 || rows[0].revoked_at !== null) {
        throw new EventManagementError('INVALID_CREDENTIAL', 'Public access credential is invalid or has been revoked');
      }

      const row = rows[0];

      if (row.event_status === 'PENDING_DELETION' || row.event_status === 'ARCHIVED') {
        throw new EventManagementError('EVENT_TERMINAL', 'Event has been deleted');
      }

      const cleanBase = command.baseUrl ? command.baseUrl.replace(/\/+$/, '') : '';
      const intakePath = `${cleanBase}/removal-request?eventId=${row.event_id}`;
      const disclaimer =
        'La recepción de esta solicitud no constituye una eliminación automática ni inmediata del contenido. ' +
        'El organizador o administrador del evento revisará la solicitud conforme a las políticas vigentes.';

      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'REMOVAL_INTAKE_ROUTED',
        actorId: 'GUEST_ANONYMOUS',
        targetIdentifier: row.event_id,
        result: 'SUCCESS',
        details: `Removal intake route resolved for event '${row.event_id}' without active session`,
        timestamp: now
      });

      return {
        eventId: row.event_id,
        eventName: row.event_name,
        intakePath,
        disclaimer,
        requiresSession: false
      };
    });
  }
}

interface ResolvedCredentialRow {
  id: string;
  event_id: string;
  lookup_key: string;
  token_hash: string;
  generation: number;
  pin_required: boolean;
  revoked_at: Date | string | null;
  event_name: string;
  event_status: string;
  event_timezone: string;
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
  pin_enabled: boolean;
  organizer_id: string;
  created_at: Date | string;
  updated_at: Date | string;
}
