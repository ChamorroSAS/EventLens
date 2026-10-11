import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  EventManagementError,
  type IssueInitialPublicCredentialCommand,
  type IssueInitialPublicCredentialResult,
  type PublicAccessCredentialRecord,
  type EventAuditSink
} from './contracts.js';

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
}
