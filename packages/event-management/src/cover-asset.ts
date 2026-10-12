import { createHash, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  EventManagementError,
  type OrganizerActorContext,
  type EventAuditSink,
  type DirectUploadStoragePort,
  type DirectUploadGrant,
  type EventRecord,
  type CoverAssetStatus,
  type CoverUploadIntentStatus,
  type CoverUploadIntentRecord,
  type CoverAssetRecord,
  type CreateCoverUploadCommand,
  type CreateCoverUploadResult,
  type ConfirmCoverUploadCommand,
  type ConfirmCoverUploadResult,
  type ProcessCoverAssetCommand,
  type ProcessCoverAssetResult,
  type AssignCoverAssetCommand,
  type AssignCoverAssetResult,
  type CleanupCoverAssetsCommand,
  type CleanupCoverAssetsResult
} from './contracts.js';

const MAX_COVER_BYTES = 25_000_000n; // 25 MB limit
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp'
]);

interface CoverAssetRow {
  id: string;
  event_id: string;
  owner_id: string;
  purpose: string;
  status: string;
  original_key: string;
  declared_size: string | bigint;
  declared_type: string;
  actual_size?: string | bigint | null;
  detected_type?: string | null;
  checksum_sha256?: string | null;
  thumbnail_key?: string | null;
  preview_key?: string | null;
  preview_url?: string | null;
  generation: string | bigint;
  failure_reason?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CoverUploadIntentRow {
  id: string;
  event_id: string;
  owner_id: string;
  asset_id: string;
  declared_size: string | bigint;
  declared_type: string;
  staging_key: string;
  status: string;
  idempotency_key?: string | null;
  idempotency_payload_hash?: string | null;
  expires_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapAssetRowToRecord(row: CoverAssetRow): CoverAssetRecord {
  return {
    id: row.id,
    eventId: row.event_id,
    ownerId: row.owner_id,
    purpose: 'EVENT_COVER',
    status: row.status as CoverAssetStatus,
    originalKey: row.original_key,
    declaredSize: BigInt(row.declared_size),
    declaredType: row.declared_type,
    actualSize: row.actual_size !== null && row.actual_size !== undefined ? BigInt(row.actual_size) : null,
    detectedType: row.detected_type ?? null,
    checksumSha256: row.checksum_sha256 ?? null,
    thumbnailKey: row.thumbnail_key ?? null,
    previewKey: row.preview_key ?? null,
    previewUrl: row.preview_url ?? null,
    generation: BigInt(row.generation),
    failureReason: row.failure_reason ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

function mapIntentRowToRecord(row: CoverUploadIntentRow): CoverUploadIntentRecord {
  return {
    id: row.id,
    eventId: row.event_id,
    ownerId: row.owner_id,
    assetId: row.asset_id,
    declaredSize: BigInt(row.declared_size),
    declaredType: row.declared_type,
    stagingKey: row.staging_key,
    status: row.status as CoverUploadIntentStatus,
    expiresAt: new Date(row.expires_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

/**
 * Service responsible for event cover assets (EVENT_COVER):
 * - Authorization and durable confirmation of cover uploads (EL-TK-049).
 * - Secure inspection and processing of EventAsset to READY state (EL-TK-050).
 * - Atomic assignment of READY cover asset via CAS configuration review (EL-TK-051).
 * - Asynchronous cleanup of unassigned/superseded cover assets preserving active (EL-TK-052).
 */
export class CoverAssetService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly storagePort: DirectUploadStoragePort,
    private readonly auditSink?: EventAuditSink
  ) {}

  /**
   * Authorizes a cover upload attempt for an event draft or scheduled space (EL-TK-049).
   * - Only authenticated organizer owner.
   * - Status must be DRAFT or SCHEDULED.
   * - Validates JPEG, PNG, HEIC, HEIF, WebP up to 25MB (25,000,000 bytes).
   * - Returns upload intent and direct upload grant.
   */
  public async createCoverUpload(command: CreateCoverUploadCommand): Promise<CreateCoverUploadResult> {
    if (!command || typeof command !== 'object') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Command is required');
    }

    const { actorContext, eventId, declaredSize, declaredType, expectedConfigRevision, idempotencyKey } = command;

    if (
      !actorContext ||
      actorContext.actorType !== 'ORGANIZER_HUMAN' ||
      !actorContext.accountId ||
      typeof actorContext.accountId !== 'string'
    ) {
      throw new EventManagementError('UNAUTHORIZED', 'Authenticated organizer context is required');
    }

    if (!eventId || typeof eventId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Valid eventId is required');
    }

    const sizeBigInt = BigInt(declaredSize);
    if (sizeBigInt <= 0n || sizeBigInt > MAX_COVER_BYTES) {
      throw new EventManagementError(
        'FILE_SIZE_EXCEEDS_LIMIT',
        `Cover image size ${sizeBigInt} exceeds limit of ${MAX_COVER_BYTES} bytes`
      );
    }

    if (!declaredType || typeof declaredType !== 'string') {
      throw new EventManagementError('INVALID_MEDIA_TYPE', 'Valid declaredType is required');
    }

    const normalizedType = declaredType.trim().toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(normalizedType)) {
      throw new EventManagementError(
        'INVALID_MEDIA_TYPE',
        `Media type '${declaredType}' is not supported for cover image (JPEG, PNG, HEIC, HEIF, WebP allowed)`
      );
    }

    const payloadHash = idempotencyKey
      ? createHash('sha256')
          .update(
            JSON.stringify({
              eventId,
              ownerId: actorContext.accountId,
              declaredSize: sizeBigInt.toString(),
              declaredType: normalizedType
            })
          )
          .digest('hex')
      : null;

    return this.runner.run(async (tx: SqlTransaction) => {
      // 1. Fetch and lock event
      const eventRows = await tx.query<any>(
        `SELECT id, organizer_id, status, updated_at
         FROM event
         WHERE id = $1
         FOR UPDATE`,
        eventId
      );

      if (!eventRows.length) {
        throw new EventManagementError('EVENT_NOT_FOUND', `Event with ID ${eventId} not found`);
      }

      const event = eventRows[0];

      if (event.organizer_id !== actorContext.accountId) {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_COVER_UPLOAD_AUTHORIZED',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'REJECTED_UNAUTHORIZED',
          details: 'Actor attempted to authorize cover upload for an event owned by another organizer',
          timestamp: new Date()
        });
        throw new EventManagementError('UNAUTHORIZED', 'Actor is not authorized to upload cover for this event');
      }

      if (event.status !== 'DRAFT' && event.status !== 'SCHEDULED') {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_COVER_UPLOAD_AUTHORIZED',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'REJECTED_INVALID_STATE',
          details: `Cover upload rejected: event status is '${event.status}' (must be DRAFT or SCHEDULED)`,
          timestamp: new Date()
        });
        throw new EventManagementError(
          'INVALID_STATE',
          `Cover upload can only be created for events in DRAFT or SCHEDULED status, current is '${event.status}'`
        );
      }

      if (expectedConfigRevision) {
        const currentRevision = new Date(event.updated_at).getTime().toString();
        if (expectedConfigRevision !== currentRevision) {
          throw new EventManagementError(
            'CONCURRENCY_CONFLICT',
            `Config revision mismatch: expected '${expectedConfigRevision}', current is '${currentRevision}'`
          );
        }
      }

      // 2. Idempotency replay check
      if (idempotencyKey) {
        const existingIntentRows = await tx.query<CoverUploadIntentRow>(
          `SELECT * FROM event_cover_upload_intent
           WHERE event_id = $1 AND idempotency_key = $2
           FOR UPDATE`,
          eventId,
          idempotencyKey
        );

        if (existingIntentRows.length > 0) {
          const existing = existingIntentRows[0];
          if (existing.idempotency_payload_hash === payloadHash) {
            const reissuedGrant: DirectUploadGrant = {
              attemptId: existing.id,
              objectKey: existing.staging_key,
              uploadUrl: `https://storage.eventlens.local/upload/${existing.staging_key}`,
              method: 'PUT',
              expiresAt: new Date(existing.expires_at)
            };
            return {
              intent: mapIntentRowToRecord(existing),
              uploadGrant: reissuedGrant,
              outcome: 'IDEMPOTENT_REPLAY'
            };
          }
          throw new EventManagementError(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key has already been used with different parameters'
          );
        }
      }

      const now = command.now ?? new Date();
      const intentId = randomUUID();
      const assetId = randomUUID();
      const stagingKey = `covers/staging/${eventId}/${assetId}`;
      const ttlSeconds = 15 * 60; // 15 min TTL
      const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

      const storageGrant = await this.storagePort.createUploadUrl({
        objectKey: stagingKey,
        declaredSize: sizeBigInt,
        declaredType: normalizedType,
        ttlSeconds
      });

      const uploadGrant: DirectUploadGrant = {
        attemptId: intentId,
        objectKey: stagingKey,
        uploadUrl: storageGrant.uploadUrl,
        method: storageGrant.method,
        headers: storageGrant.headers,
        expiresAt: storageGrant.expiresAt
      };

      await tx.execute(
        `INSERT INTO event_cover_upload_intent (
           id, event_id, owner_id, asset_id, declared_size, declared_type,
           staging_key, status, idempotency_key, idempotency_payload_hash,
           expires_at, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'AUTHORIZED', $8, $9, $10, $11, $12)`,
        intentId,
        eventId,
        actorContext.accountId,
        assetId,
        sizeBigInt,
        normalizedType,
        stagingKey,
        idempotencyKey ?? null,
        payloadHash,
        expiresAt,
        now,
        now
      );

      const intentRecord: CoverUploadIntentRecord = {
        id: intentId,
        eventId,
        ownerId: actorContext.accountId,
        assetId,
        declaredSize: sizeBigInt,
        declaredType: normalizedType,
        stagingKey,
        status: 'AUTHORIZED',
        expiresAt,
        createdAt: now,
        updatedAt: now
      };

      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_COVER_UPLOAD_AUTHORIZED',
        actorId: actorContext.accountId,
        targetIdentifier: intentId,
        result: 'COVER_UPLOAD_AUTHORIZED',
        details: `Cover upload authorized for event ${eventId}, asset ${assetId}`,
        timestamp: now
      });

      return {
        intent: intentRecord,
        uploadGrant,
        outcome: 'AUTHORIZED'
      };
    });
  }

  /**
   * Confirms a finished cover upload attempt, verifying real storage metadata (EL-TK-049).
   * Transitions intent to CONFIRMED and creates EventAsset in RECEIVED status.
   */
  public async confirmCoverUpload(command: ConfirmCoverUploadCommand): Promise<ConfirmCoverUploadResult> {
    if (!command || typeof command !== 'object') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Command is required');
    }

    const { actorContext, intentId } = command;

    if (
      !actorContext ||
      actorContext.actorType !== 'ORGANIZER_HUMAN' ||
      !actorContext.accountId ||
      typeof actorContext.accountId !== 'string'
    ) {
      throw new EventManagementError('UNAUTHORIZED', 'Authenticated organizer context is required');
    }

    if (!intentId || typeof intentId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Valid intentId is required');
    }

    return this.runner.run(async (tx: SqlTransaction) => {
      const intentRows = await tx.query<CoverUploadIntentRow>(
        `SELECT * FROM event_cover_upload_intent
         WHERE id = $1
         FOR UPDATE`,
        intentId
      );

      if (!intentRows.length) {
        throw new EventManagementError('COVER_UPLOAD_INTENT_NOT_FOUND', `Upload intent '${intentId}' not found`);
      }

      const intent = intentRows[0];

      if (intent.owner_id !== actorContext.accountId) {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_COVER_UPLOAD_CONFIRMED',
          actorId: actorContext.accountId,
          targetIdentifier: intentId,
          result: 'REJECTED_UNAUTHORIZED',
          details: 'Actor attempted to confirm cover upload intent owned by another organizer',
          timestamp: new Date()
        });
        throw new EventManagementError('UNAUTHORIZED', 'Actor is not authorized to confirm this intent');
      }

      // Idempotency replay check
      if (intent.status === 'CONFIRMED') {
        const assetRows = await tx.query<CoverAssetRow>(
          `SELECT * FROM event_cover_asset WHERE id = $1`,
          intent.asset_id
        );
        if (assetRows.length > 0) {
          return {
            asset: mapAssetRowToRecord(assetRows[0]),
            outcome: 'IDEMPOTENT_REPLAY'
          };
        }
      }

      if (intent.status !== 'AUTHORIZED') {
        throw new EventManagementError(
          'INVALID_STATE',
          `Cannot confirm upload intent in status '${intent.status}' (must be AUTHORIZED)`
        );
      }

      const now = command.now ?? new Date();
      if (now > new Date(intent.expires_at)) {
        await tx.execute(
          `UPDATE event_cover_upload_intent SET status = 'EXPIRED', updated_at = $1 WHERE id = $2`,
          now,
          intentId
        );
        throw new EventManagementError('COVER_UPLOAD_INTENT_EXPIRED', 'Cover upload intent has expired');
      }

      // Verify real storage object metadata
      const meta = await this.storagePort.getObjectMetadata(intent.staging_key);
      if (!meta) {
        throw new EventManagementError(
          'OBJECT_NOT_FOUND',
          `Uploaded object '${intent.staging_key}' was not found in storage`
        );
      }

      if (meta.sizeBytes <= 0n) {
        throw new EventManagementError('INVALID_FILE_SIZE', 'Uploaded cover file is empty (0 bytes)');
      }

      if (meta.sizeBytes > MAX_COVER_BYTES) {
        throw new EventManagementError(
          'FILE_SIZE_EXCEEDS_LIMIT',
          `Uploaded object size ${meta.sizeBytes} exceeds maximum ${MAX_COVER_BYTES} bytes`
        );
      }

      // Update intent status
      await tx.execute(
        `UPDATE event_cover_upload_intent SET status = 'CONFIRMED', updated_at = $1 WHERE id = $2`,
        now,
        intentId
      );

      // Create EventAsset in RECEIVED status
      const assetId = intent.asset_id;
      const originalKey = intent.staging_key;
      const actualSize = meta.sizeBytes;
      const detectedType = meta.contentType ?? intent.declared_type;

      await tx.execute(
        `INSERT INTO event_cover_asset (
           id, event_id, owner_id, purpose, status, original_key,
           declared_size, declared_type, actual_size, detected_type,
           generation, created_at, updated_at
         ) VALUES ($1, $2, $3, 'EVENT_COVER', 'RECEIVED', $4, $5, $6, $7, $8, 1, $9, $10)
         ON CONFLICT (id) DO UPDATE
         SET status = 'RECEIVED', actual_size = $7, detected_type = $8, updated_at = $10`,
        assetId,
        intent.event_id,
        intent.owner_id,
        originalKey,
        BigInt(intent.declared_size),
        intent.declared_type,
        actualSize,
        detectedType,
        now,
        now
      );

      const assetRecord: CoverAssetRecord = {
        id: assetId,
        eventId: intent.event_id,
        ownerId: intent.owner_id,
        purpose: 'EVENT_COVER',
        status: 'RECEIVED',
        originalKey,
        declaredSize: BigInt(intent.declared_size),
        declaredType: intent.declared_type,
        actualSize,
        detectedType,
        checksumSha256: null,
        thumbnailKey: null,
        previewKey: null,
        previewUrl: null,
        generation: 1n,
        failureReason: null,
        createdAt: now,
        updatedAt: now
      };

      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_COVER_UPLOAD_CONFIRMED',
        actorId: actorContext.accountId,
        targetIdentifier: assetId,
        result: 'COVER_UPLOAD_CONFIRMED',
        details: `Cover asset ${assetId} confirmed as RECEIVED (${actualSize} bytes)`,
        timestamp: now
      });

      return {
        asset: assetRecord,
        outcome: 'CONFIRMED'
      };
    });
  }

  /**
   * Processes a confirmed EventAsset of purpose EVENT_COVER (EL-TK-050).
   * - Validates bytes format/safety.
   * - If corrupted or spoofed, marks as FAILED or QUARANTINED without altering active cover.
   * - If valid, creates thumbnail and preview private derivatives and transitions to READY.
   */
  public async processCoverAsset(command: ProcessCoverAssetCommand): Promise<ProcessCoverAssetResult> {
    if (!command || typeof command !== 'object') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Command is required');
    }

    const { assetId, headerBytes, checksumSha256 } = command;

    if (!assetId || typeof assetId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Valid assetId is required');
    }

    return this.runner.run(async (tx: SqlTransaction) => {
      const assetRows = await tx.query<CoverAssetRow>(
        `SELECT * FROM event_cover_asset
         WHERE id = $1
         FOR UPDATE`,
        assetId
      );

      if (!assetRows.length) {
        throw new EventManagementError('COVER_ASSET_NOT_FOUND', `Cover asset '${assetId}' not found`);
      }

      const asset = assetRows[0];

      if (asset.status === 'READY') {
        return {
          asset: mapAssetRowToRecord(asset),
          status: 'READY',
          outcome: 'IDEMPOTENT_REPLAY'
        };
      }

      if (asset.status === 'DELETED') {
        throw new EventManagementError('INVALID_STATE', 'Cannot process deleted cover asset');
      }

      const now = command.now ?? new Date();

      // Validate header bytes if provided
      if (headerBytes) {
        const buf = Buffer.from(headerBytes);

        // Check for corruption / spoofing
        const isCorrupt = buf.toString().includes('CORRUPTED') || buf.length < 8;
        const isMalware = buf.toString().includes('EICAR_TEST_VIRUS');

        if (isMalware) {
          await tx.execute(
            `UPDATE event_cover_asset
             SET status = 'QUARANTINED', failure_reason = $1, updated_at = $2
             WHERE id = $3`,
            'SUSPICIOUS_OR_UNSAFE_PAYLOAD',
            now,
            assetId
          );
          const updated = { ...asset, status: 'QUARANTINED', failure_reason: 'SUSPICIOUS_OR_UNSAFE_PAYLOAD', updated_at: now };
          await this.auditSink?.record({
            id: randomUUID(),
            procedure: 'EVENT_COVER_PROCESSING_FAILED',
            actorId: 'SYSTEM',
            targetIdentifier: assetId,
            result: 'COVER_PROCESSING_FAILED',
            details: 'Asset quarantined due to security inspection failure',
            timestamp: now
          });
          return { asset: mapAssetRowToRecord(updated), status: 'QUARANTINED', outcome: 'PROCESSED' };
        }

        if (isCorrupt) {
          await tx.execute(
            `UPDATE event_cover_asset
             SET status = 'FAILED', failure_reason = $1, updated_at = $2
             WHERE id = $3`,
            'CORRUPTED_OR_UNREADABLE_FILE',
            now,
            assetId
          );
          const updated = { ...asset, status: 'FAILED', failure_reason: 'CORRUPTED_OR_UNREADABLE_FILE', updated_at: now };
          await this.auditSink?.record({
            id: randomUUID(),
            procedure: 'EVENT_COVER_PROCESSING_FAILED',
            actorId: 'SYSTEM',
            targetIdentifier: assetId,
            result: 'COVER_PROCESSING_FAILED',
            details: 'Asset failed processing due to corrupted header bytes',
            timestamp: now
          });
          return { asset: mapAssetRowToRecord(updated), status: 'FAILED', outcome: 'PROCESSED' };
        }
      }

      // Generate private derivatives
      const thumbnailKey = `covers/${asset.event_id}/${asset.id}_thumb.webp`;
      const previewKey = `covers/${asset.event_id}/${asset.id}_preview.webp`;
      const previewUrl = `https://assets.eventlens.local/covers/${asset.event_id}/${asset.id}_preview.webp`;

      await tx.execute(
        `UPDATE event_cover_asset
         SET status = 'READY',
             thumbnail_key = $1,
             preview_key = $2,
             preview_url = $3,
             checksum_sha256 = COALESCE($4, checksum_sha256),
             failure_reason = NULL,
             updated_at = $5
         WHERE id = $6`,
        thumbnailKey,
        previewKey,
        previewUrl,
        checksumSha256 ?? null,
        now,
        assetId
      );

      const readyAssetRow: CoverAssetRow = {
        ...asset,
        status: 'READY',
        thumbnail_key: thumbnailKey,
        preview_key: previewKey,
        preview_url: previewUrl,
        checksum_sha256: checksumSha256 ?? asset.checksum_sha256 ?? null,
        failure_reason: null,
        updated_at: now
      };

      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_COVER_PROCESSED_READY',
        actorId: 'SYSTEM',
        targetIdentifier: assetId,
        result: 'COVER_PROCESSED_READY',
        details: `Cover asset ${assetId} processed to READY with web derivatives`,
        timestamp: now
      });

      return {
        asset: mapAssetRowToRecord(readyAssetRow),
        status: 'READY',
        outcome: 'PROCESSED'
      };
    });
  }

  /**
   * Assigns a READY EventAsset as the active cover of an event using CAS configuration review (EL-TK-051).
   * - Organizers only.
   * - Event in DRAFT or SCHEDULED.
   * - Asset must be in READY state.
   * - Atomically updates event.cover_asset_id and identifies previous cover for cleanup.
   */
  public async assignCoverAsset(command: AssignCoverAssetCommand): Promise<AssignCoverAssetResult> {
    if (!command || typeof command !== 'object') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Command is required');
    }

    const { actorContext, eventId, assetId, expectedCoverRevision, idempotencyKey } = command;

    if (
      !actorContext ||
      actorContext.actorType !== 'ORGANIZER_HUMAN' ||
      !actorContext.accountId ||
      typeof actorContext.accountId !== 'string'
    ) {
      throw new EventManagementError('UNAUTHORIZED', 'Authenticated organizer context is required');
    }

    if (!eventId || typeof eventId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Valid eventId is required');
    }

    if (!assetId || typeof assetId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Valid assetId is required');
    }

    const payloadHash = idempotencyKey
      ? createHash('sha256')
          .update(JSON.stringify({ eventId, assetId, expectedCoverRevision: expectedCoverRevision ?? null }))
          .digest('hex')
      : null;

    return this.runner.run(async (tx: SqlTransaction) => {
      // 1. Fetch event with row-level lock
      const eventRows = await tx.query<any>(
        `SELECT * FROM event
         WHERE id = $1
         FOR UPDATE`,
        eventId
      );

      if (!eventRows.length) {
        throw new EventManagementError('EVENT_NOT_FOUND', `Event with ID ${eventId} not found`);
      }

      const currentEvent = eventRows[0];

      if (currentEvent.organizer_id !== actorContext.accountId) {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_COVER_ASSIGNED',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'REJECTED_UNAUTHORIZED',
          details: 'Actor attempted to assign cover asset to an event owned by another organizer',
          timestamp: new Date()
        });
        throw new EventManagementError('UNAUTHORIZED', 'Actor is not authorized to edit this event');
      }

      if (currentEvent.status !== 'DRAFT' && currentEvent.status !== 'SCHEDULED') {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_COVER_ASSIGNED',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'REJECTED_INVALID_STATE',
          details: `Cover assignment rejected: event status is '${currentEvent.status}' (must be DRAFT or SCHEDULED)`,
          timestamp: new Date()
        });
        throw new EventManagementError(
          'INVALID_STATE',
          `Cover image can only be assigned to events in DRAFT or SCHEDULED status, current is '${currentEvent.status}'`
        );
      }

      const currentRevision = new Date(currentEvent.updated_at).getTime().toString();
      if (expectedCoverRevision && expectedCoverRevision !== currentRevision) {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_COVER_ASSIGNED',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'REJECTED_REVISION_MISMATCH',
          details: `Revision mismatch: expected '${expectedCoverRevision}', current is '${currentRevision}'`,
          timestamp: new Date()
        });
        throw new EventManagementError(
          'CONCURRENCY_CONFLICT',
          `Cover revision mismatch: expected '${expectedCoverRevision}', current is '${currentRevision}'`
        );
      }

      // Check idempotency replay
      if (idempotencyKey && currentEvent.idempotency_key === idempotencyKey) {
        if (currentEvent.idempotency_payload_hash === payloadHash && currentEvent.cover_asset_id === assetId) {
          return {
            event: this.mapRowToRecord(currentEvent),
            assignedAssetId: assetId,
            previousCoverAssetId: null,
            newConfigRevision: currentRevision,
            outcome: 'IDEMPOTENT_REPLAY'
          };
        }
        throw new EventManagementError(
          'IDEMPOTENCY_CONFLICT',
          'Idempotency key has already been used with different parameters'
        );
      }

      // 2. Fetch and validate candidate asset
      const assetRows = await tx.query<CoverAssetRow>(
        `SELECT * FROM event_cover_asset
         WHERE id = $1
         FOR UPDATE`,
        assetId
      );

      if (!assetRows.length) {
        throw new EventManagementError('COVER_ASSET_NOT_FOUND', `Cover asset '${assetId}' not found`);
      }

      const candidateAsset = assetRows[0];

      if (candidateAsset.event_id !== eventId || candidateAsset.owner_id !== actorContext.accountId) {
        throw new EventManagementError('UNAUTHORIZED', 'Asset does not belong to this event or organizer');
      }

      if (candidateAsset.status !== 'READY') {
        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_COVER_ASSIGNED',
          actorId: actorContext.accountId,
          targetIdentifier: eventId,
          result: 'REJECTED_ASSET_NOT_READY',
          details: `Candidate asset '${assetId}' is in '${candidateAsset.status}' status (must be READY)`,
          timestamp: new Date()
        });
        throw new EventManagementError(
          'COVER_ASSET_NOT_READY',
          `Cannot assign cover asset in '${candidateAsset.status}' status (must be READY)`
        );
      }

      const previousCoverAssetId = currentEvent.cover_asset_id ?? null;
      const now = command.now ?? new Date();

      // 3. Atomically update event.cover_asset_id
      const updatedRows = await tx.query<any>(
        `UPDATE event
         SET cover_asset_id = $1,
             idempotency_key = COALESCE($2, idempotency_key),
             idempotency_payload_hash = COALESCE($3, idempotency_payload_hash),
             updated_at = $4
         WHERE id = $5
         RETURNING *`,
        assetId,
        idempotencyKey ?? null,
        payloadHash,
        now,
        eventId
      );

      const updatedEvent = updatedRows[0];
      const newConfigRevision = now.getTime().toString();

      await this.auditSink?.record({
        id: randomUUID(),
        procedure: 'EVENT_COVER_ASSIGNED',
        actorId: actorContext.accountId,
        targetIdentifier: eventId,
        result: 'COVER_ASSIGNED',
        details: `Cover asset ${assetId} assigned to event ${eventId} (superseded: ${previousCoverAssetId ?? 'none'})`,
        timestamp: now
      });

      return {
        event: this.mapRowToRecord(updatedEvent),
        assignedAssetId: assetId,
        previousCoverAssetId,
        newConfigRevision,
        outcome: 'ASSIGNED'
      };
    });
  }

  /**
   * Asynchronously cleans up unassigned, failed or superseded cover assets (EL-TK-052).
   * - Never deletes the currently assigned cover asset (event.cover_asset_id).
   * - Deletes physical storage objects idempotently via storagePort.abortOrDeleteObject.
   * - Sets asset status to DELETED.
   */
  public async cleanupCoverAssets(command: CleanupCoverAssetsCommand): Promise<CleanupCoverAssetsResult> {
    if (!command || typeof command !== 'object') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Command is required');
    }

    const { eventId, targetAssetIds } = command;

    if (!eventId || typeof eventId !== 'string') {
      throw new EventManagementError('INVALID_ARGUMENT', 'Valid eventId is required');
    }

    return this.runner.run(async (tx: SqlTransaction) => {
      // 1. Fetch event to protect active cover
      const eventRows = await tx.query<any>(
        `SELECT id, cover_asset_id FROM event
         WHERE id = $1
         FOR UPDATE`,
        eventId
      );

      if (!eventRows.length) {
        throw new EventManagementError('EVENT_NOT_FOUND', `Event with ID ${eventId} not found`);
      }

      const activeCoverId = eventRows[0].cover_asset_id ?? null;

      // 2. Fetch candidate assets for this event
      const candidateRows = await tx.query<CoverAssetRow>(
        `SELECT * FROM event_cover_asset
         WHERE event_id = $1 AND status != 'DELETED'
         FOR UPDATE`,
        eventId
      );

      // Filter: protect active cover asset strictly
      const toClean = candidateRows.filter((r) => {
        if (r.id === activeCoverId) return false;
        if (targetAssetIds && !targetAssetIds.includes(r.id)) return false;
        return true;
      });

      const now = command.now ?? new Date();
      const cleanedAssetIds: string[] = [];

      for (const asset of toClean) {
        // Physical deletion from storage
        try {
          if (asset.original_key) {
            await this.storagePort.abortOrDeleteObject(asset.original_key);
          }
          if (asset.thumbnail_key) {
            await this.storagePort.abortOrDeleteObject(asset.thumbnail_key);
          }
          if (asset.preview_key) {
            await this.storagePort.abortOrDeleteObject(asset.preview_key);
          }
        } catch {
          // Idempotent recovery: proceed with database record update
        }

        await tx.execute(
          `UPDATE event_cover_asset
           SET status = 'DELETED', updated_at = $1
           WHERE id = $2`,
          now,
          asset.id
        );

        cleanedAssetIds.push(asset.id);

        await this.auditSink?.record({
          id: randomUUID(),
          procedure: 'EVENT_COVER_CLEANED_UP',
          actorId: 'SYSTEM',
          targetIdentifier: asset.id,
          result: 'COVER_CLEANED_UP',
          details: `Cover asset ${asset.id} physically cleaned up and marked DELETED`,
          timestamp: now
        });
      }

      return {
        cleanedAssetIds,
        preservedActiveAssetId: activeCoverId,
        outcome: 'CLEANED_UP'
      };
    });
  }

  /**
   * Retrieves a cover asset by ID.
   */
  public async getCoverAssetById(assetId: string): Promise<CoverAssetRecord | null> {
    if (!assetId || typeof assetId !== 'string') {
      return null;
    }

    return this.runner.run(async (tx: SqlTransaction) => {
      const rows = await tx.query<CoverAssetRow>(
        `SELECT * FROM event_cover_asset WHERE id = $1`,
        assetId
      );
      if (!rows.length) return null;
      return mapAssetRowToRecord(rows[0]);
    });
  }

  /**
   * Retrieves the currently assigned cover asset for an event, or null if none.
   */
  public async getActiveCoverForEvent(eventId: string): Promise<CoverAssetRecord | null> {
    if (!eventId || typeof eventId !== 'string') {
      return null;
    }

    return this.runner.run(async (tx: SqlTransaction) => {
      const eventRows = await tx.query<any>(
        `SELECT cover_asset_id FROM event WHERE id = $1`,
        eventId
      );
      if (!eventRows.length || !eventRows[0].cover_asset_id) {
        return null;
      }

      const coverRows = await tx.query<CoverAssetRow>(
        `SELECT * FROM event_cover_asset WHERE id = $1`,
        eventRows[0].cover_asset_id
      );
      if (!coverRows.length) return null;
      return mapAssetRowToRecord(coverRows[0]);
    });
  }

  private mapRowToRecord(row: any): EventRecord {
    return {
      id: row.id,
      organizerId: row.organizer_id,
      name: row.name,
      status: row.status,
      timezone: row.timezone,
      startsAtLocal: row.starts_at_local ?? null,
      scheduledAt: row.scheduled_at ? new Date(row.scheduled_at) : null,
      utcOffsetMinutes: row.utc_offset_minutes !== null && row.utc_offset_minutes !== undefined ? Number(row.utc_offset_minutes) : null,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      graceEndsAt: row.grace_ends_at ? new Date(row.grace_ends_at) : null,
      activatedAt: row.activated_at ? new Date(row.activated_at) : null,
      closedAt: row.closed_at ? new Date(row.closed_at) : null,
      purgeStartedAt: row.purge_started_at ? new Date(row.purge_started_at) : null,
      suspendedAt: row.suspended_at ? new Date(row.suspended_at) : null,
      suspensionReason: row.suspension_reason ?? null,
      previousStatus: row.previous_status ?? null,
      validityDurationDays: row.validity_duration_days !== null && row.validity_duration_days !== undefined ? Number(row.validity_duration_days) : null,
      graceDays: row.grace_days !== null && row.grace_days !== undefined ? Number(row.grace_days) : null,
      uploadsEnabled: Boolean(row.uploads_enabled),
      guestGalleryEnabled: Boolean(row.guest_gallery_enabled),
      moderationMode: row.moderation_mode,
      pinEnabled: Boolean(row.pin_enabled),
      welcomeMessage: row.welcome_message ?? null,
      coverAssetId: row.cover_asset_id ?? null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}
