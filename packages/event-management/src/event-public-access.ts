import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  EventManagementError,
  type IssueInitialPublicCredentialCommand,
  type IssueInitialPublicCredentialResult,
  type ResolvePublicAccessCommand,
  type ResolvePublicAccessResult,
  type PublicAccessCapabilities,
  type PublicAccessState,
  type PublicAccessCredentialRecord,
  type EventRecord,
  type EventStatus,
  type GuestActorContext,
  type EventAuditSink
} from './contracts.js';
import { EventAccessPolicy } from './access-policy.js';

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
